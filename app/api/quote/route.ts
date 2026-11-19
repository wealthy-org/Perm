import { NextResponse, type NextRequest } from "next/server";
import {
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  isAddress,
  keccak256,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";
import deployment from "@/deployments/robinhood-testnet.json";
import {
  ALLOWLISTED_STAGING_BUILD,
  RELEASE_DEPLOYMENT_READY,
  STAGING_DEPLOYMENT_CONFIGURED,
  PERM_ROUTER_ADDRESS,
  PERM_V3_ADAPTER_ADDRESS,
  PERM_V4_ADAPTER_ADDRESS,
  RH_TESTNET_CHAIN_ID,
  ROUTER_VERSION,
  SYNTHRA_V3,
  V4_QUOTER_ADDRESS,
  ZERO_ADDRESS,
  createRobinhoodPublicClient,
} from "@/lib/web3/config";
import { erc20Abi, permRouterAbi, permV4AdapterAbi, v3FactoryAbi, v3QuoterAbi, v4QuoterAbi } from "@/lib/web3/abis";
import { tokenPairPools, type V4PoolFixture } from "@/lib/server/pools";
import { discoverTwoStepRoutes } from "@/lib/server/route-planner";
import { LIVE_TOKEN_MAP, LIVE_TOKENS, type LiveToken, type LiveTokenSymbol } from "@/lib/web3/tokens";
import type { LiveQuote, LiveQuoteCandidate, QuoteRouteStep } from "@/lib/web3/quote";
import { RequestBodyTooLargeError, consumeRateLimit, readJsonBody, requestIdentity, safeServerError, ttlCached } from "@/lib/server/runtime";
import { PERM_QUOTE_TYPES, quoteSignerConfiguration, quoteSignerExecutionReady, signPermQuote } from "@/lib/server/quote-signer";
import { allowlistedStagingConfiguration, isAllowlistedStagingWallet } from "@/lib/server/staging-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BPS = 10_000n;
const MAX_INT128 = (1n << 127n) - 1n;
const MAX_QUOTED_GAS = 30_000_000n;
const V3_FEES = [100, 500, 3_000, 10_000] as const;
const ROUTE_STEP_PARAMETERS = parseAbiParameters("(address adapter,address tokenIn,address tokenOut,bytes data)[]");
type RoutingMode = "best" | "v4" | "v3" | "hooks";
type QuoteBody = {
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  slippageBps?: number;
  account?: string;
  recipient?: string;
  referrer?: string;
  routingMode?: RoutingMode;
};
type RawQuote = { amountOut: bigint; gasEstimate: bigint };
type InternalStep = QuoteRouteStep & { requote: (amount: bigint) => Promise<RawQuote> };
type InternalCandidate = LiveQuoteCandidate & { requote: (amount: bigint) => Promise<bigint>; conversionStep?: InternalStep };

async function runLimited<T>(jobs: Array<() => Promise<T>>, concurrency = 8): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= jobs.length) return;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function error(message: string, status = 400, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "cache-control": "no-store", ...extraHeaders },
  });
}

function routeDataFor(steps: InternalStep[]): Hex {
  return encodeAbiParameters(ROUTE_STEP_PARAMETERS, [steps.map((step) => ({
    adapter: step.adapter,
    tokenIn: step.tokenIn,
    tokenOut: step.tokenOut,
    data: step.data,
  }))]);
}

function configuredHookPools(): V4PoolFixture[] {
  if (ALLOWLISTED_STAGING_BUILD || allowlistedStagingConfiguration().requested) return [];
  const override = process.env.PERM_AGGREGATOR_HOOKS_JSON;
  if (override && override.length > 65_536) throw new Error("PERM_AGGREGATOR_HOOKS_JSON is too large");
  const parsed = override ? JSON.parse(override) : deployment.aggregatorHooks || [];
  if (!Array.isArray(parsed) || parsed.length > 32) throw new Error("Aggregator Hook configuration is invalid");
  const entries = parsed as Array<Partial<V4PoolFixture>>;
  return entries.filter((entry): entry is V4PoolFixture => Boolean(
    entry.id && entry.currency0 && entry.currency1 && entry.hooks && entry.hookData !== undefined
      && entry.fee !== undefined && entry.tickSpacing !== undefined && entry.initializationBlock !== undefined
      && entry.sourceType === "aggregator-hook",
  ));
}

export async function POST(request: NextRequest) {
  const identity = requestIdentity(request);
  try {
    const limit = await consumeRateLimit(`quote:${identity}`, 12, 0.5);
    if (!limit.allowed) return error("Too many quote requests. Retry shortly.", 429, { "retry-after": String(limit.retryAfter) });
  } catch (cause) {
    return error(safeServerError("quote-rate-limit", cause, "Request protection is temporarily unavailable"), 503);
  }

  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return error("Content-Type must be application/json", 415);
  }
  let body: QuoteBody;
  try {
    const parsed = await readJsonBody(request, 16_384);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("Quote body must be a JSON object");
    body = parsed as QuoteBody;
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) return error("Quote request body is too large", 413);
    return error("Invalid JSON body");
  }

  const allowedFields = new Set(["tokenIn", "tokenOut", "amountIn", "slippageBps", "account", "recipient", "referrer", "routingMode"]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) return error("Quote body contains an unsupported field");
  if (typeof body.tokenIn !== "string" || typeof body.tokenOut !== "string" || typeof body.amountIn !== "string") {
    return error("tokenIn, tokenOut and amountIn must be strings");
  }
  if (body.slippageBps !== undefined && typeof body.slippageBps !== "number") return error("slippageBps must be a number");
  for (const [field, value] of [["account", body.account], ["recipient", body.recipient], ["referrer", body.referrer]] as const) {
    if (value !== undefined && typeof value !== "string") return error(`${field} must be an address string`);
  }
  if (body.routingMode !== undefined && typeof body.routingMode !== "string") return error("routingMode must be a string");

  const tokenIn = LIVE_TOKEN_MAP[body.tokenIn as LiveTokenSymbol];
  const tokenOut = LIVE_TOKEN_MAP[body.tokenOut as LiveTokenSymbol];
  if (!tokenIn || !tokenOut || tokenIn.symbol === tokenOut.symbol) return error("Unsupported token pair");
  if (body.routingMode && !["best", "v4", "v3", "hooks"].includes(body.routingMode)) return error("Unsupported routing mode");
  const routingMode: RoutingMode = body.routingMode === "v4" || body.routingMode === "v3" || body.routingMode === "hooks" ? body.routingMode : "best";

  const requestedAddresses = [body.account, body.recipient, body.referrer].filter((value): value is string => value !== undefined);
  if (requestedAddresses.some((address) => !isAddress(address))) return error("Quote binding contains an invalid address");
  const account = getAddress(body.account || ZERO_ADDRESS) as Address;
  const recipient = getAddress(body.recipient || ZERO_ADDRESS) as Address;
  const referrer = getAddress(body.referrer || ZERO_ADDRESS) as Address;
  if (account !== ZERO_ADDRESS && referrer.toLowerCase() === account.toLowerCase()) return error("Self-referral is not permitted");

  const staging = allowlistedStagingConfiguration();
  const stagingRequested = ALLOWLISTED_STAGING_BUILD || staging.requested;
  if (stagingRequested && routingMode === "hooks") {
    return error("Aggregator Hook routing is disabled in allowlisted staging; use a verified direct v4 or Synthra v3 route", 422);
  }
  if (stagingRequested && account !== ZERO_ADDRESS) {
    if (!staging.configured) return error(staging.reason || "Allowlisted staging is not configured", 503);
    if (!isAllowlistedStagingWallet(account, staging)) return error("This wallet is not authorized for allowlisted staging execution", 403);
  }

  let amountIn: bigint;
  try {
    if (!body.amountIn || !/^[0-9]{1,78}$/.test(body.amountIn)) throw new Error("invalid amount");
    amountIn = BigInt(body.amountIn);
  } catch {
    return error("amountIn must be a decimal integer in token base units");
  }
  if (amountIn <= 0n || amountIn > MAX_INT128) return error("amountIn is outside the exact-input range");

  const slippageBps = Number(body.slippageBps ?? 50);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 2_000) {
    return error("slippageBps must be between 1 and 2000");
  }

  const client = createRobinhoodPublicClient();
  try {
    await Promise.all([tokenIn, tokenOut].map(async (token) => {
      if (token.address === ZERO_ADDRESS) return;
      const decimals = await ttlCached(`decimals:${token.address}`, 60 * 60_000, () => client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "decimals",
      }));
      if (decimals !== token.decimals) throw new Error(`Token metadata mismatch for ${token.symbol}`);
    }));

    const policy = await ttlCached(`policy:${PERM_ROUTER_ADDRESS}:${ROUTER_VERSION}`, 10_000, async () => {
      if (!PERM_ROUTER_ADDRESS) throw new Error("PermRouter deployment is not configured");
      if (ROUTER_VERSION >= 2) {
        const version = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "activePolicyVersion" });
        const values = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "feePolicies", args: [version] });
        return { version: Number(version), platformFeeBps: Number(values[0]), rebateShareBps: Number(values[1]), enabled: values[2] };
      }
      const version = deployment.policy.version;
      const values = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "feePolicies", args: [version] });
      return { version, platformFeeBps: Number(values[0]), rebateShareBps: Number(values[1]), enabled: values[2] };
    });
    if (!policy.enabled) return error("The active Perm fee policy is disabled", 503);

    const grossFee = amountIn * BigInt(policy.platformFeeBps) / BPS;
    const rebate = grossFee * BigInt(policy.rebateShareBps) / BPS;
    const netFee = grossFee - rebate;
    const routedInput = amountIn - netFee;
    if (routedInput <= 0n || routedInput > MAX_INT128) return error("Routed input is outside the quote range");

    const [block, gasPrice] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.getGasPrice(),
    ]);

    const quoteV4Raw = async (pool: V4PoolFixture, input: LiveToken, output: LiveToken, amount: bigint): Promise<RawQuote> => {
      const key = `v4:${pool.id}:${input.address}:${amount}:${keccak256(pool.hookData)}`;
      return ttlCached(key, 2_000, async () => {
        const zeroForOne = input.address.toLowerCase() === pool.currency0.toLowerCase();
        const { result } = await client.simulateContract({
          account: ZERO_ADDRESS,
          address: V4_QUOTER_ADDRESS,
          abi: v4QuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{
            poolKey: {
              currency0: pool.currency0,
              currency1: pool.currency1,
              fee: pool.fee,
              tickSpacing: pool.tickSpacing,
              hooks: pool.hooks,
            },
            zeroForOne,
            exactAmount: amount,
            hookData: pool.hookData,
          }],
        });
        if (result[0] <= 0n) throw new Error("Empty v4 quote");
        return { amountOut: result[0], gasEstimate: result[1] };
      });
    };

    const v4Step = async (input: LiveToken, output: LiveToken, amount: bigint, pool: V4PoolFixture): Promise<InternalStep | null> => {
      if (!PERM_V4_ADAPTER_ADDRESS) return null;
      let verifiedHook = false;
      let hookCodehash: Hex | undefined;
      if (pool.hooks !== ZERO_ADDRESS) {
        if (ROUTER_VERSION < 2) return null;
        const [expected, code] = await Promise.all([
          client.readContract({ address: PERM_V4_ADAPTER_ADDRESS, abi: permV4AdapterAbi, functionName: "verifiedHookCodehashes", args: [pool.hooks] }),
          client.getCode({ address: pool.hooks }),
        ]);
        if (!code || expected === `0x${"0".repeat(64)}` || keccak256(code).toLowerCase() !== expected.toLowerCase()) return null;
        verifiedHook = true;
        hookCodehash = expected;
      }
      const raw = await quoteV4Raw(pool, input, output, amount);
      const data = encodeAbiParameters([
        {
          type: "tuple",
          components: [
            { name: "currency0", type: "address" },
            { name: "currency1", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "tickSpacing", type: "int24" },
            { name: "hooks", type: "address" },
          ],
        },
        { type: "bytes" },
      ], [{
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: pool.hooks,
      }, pool.hookData]);
      const aggregator = pool.sourceType === "aggregator-hook";
      return {
        providerId: aggregator ? "UNISWAP_V4_AGGREGATOR_HOOK" : "UNISWAP_V4_DIRECT",
        providerLabel: aggregator ? "Verified v4 Aggregator Hook" : "Uniswap v4 direct pool",
        adapter: PERM_V4_ADAPTER_ADDRESS,
        tokenIn: input.address,
        tokenOut: output.address,
        amountIn: amount.toString(),
        amountOut: raw.amountOut.toString(),
        gasEstimate: raw.gasEstimate.toString(),
        poolId: pool.id,
        poolFee: pool.fee,
        hook: pool.hooks,
        verifiedHook,
        hookCodehash,
        data: data as Hex,
        requote: (nextAmount) => quoteV4Raw(pool, input, output, nextAmount),
      };
    };

    const v3Pool = async (input: LiveToken, output: LiveToken, fee: number) => {
      const actualIn = input.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : input.address;
      const actualOut = output.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : output.address;
      if (actualIn.toLowerCase() === actualOut.toLowerCase()) return ZERO_ADDRESS;
      return ttlCached(`v3pool:${actualIn}:${actualOut}:${fee}`, 60_000, () => client.readContract({
        address: SYNTHRA_V3.factory,
        abi: v3FactoryAbi,
        functionName: "getPool",
        args: [actualIn, actualOut, fee],
      }));
    };

    const quoteV3Raw = async (input: LiveToken, output: LiveToken, fee: number, amount: bigint): Promise<RawQuote> => {
      const actualIn = input.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : input.address;
      const actualOut = output.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : output.address;
      return ttlCached(`v3quote:${actualIn}:${actualOut}:${fee}:${amount}`, 2_000, async () => {
        const { result } = await client.simulateContract({
          account: ZERO_ADDRESS,
          address: SYNTHRA_V3.quoterV2,
          abi: v3QuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: actualIn, tokenOut: actualOut, amountIn: amount, fee, sqrtPriceLimitX96: 0n }],
        });
        if (result[0] <= 0n) throw new Error("Empty v3 quote");
        return { amountOut: result[0], gasEstimate: result[3] };
      });
    };

    const v3Step = async (input: LiveToken, output: LiveToken, amount: bigint, fee: number): Promise<InternalStep | null> => {
      if (!PERM_V3_ADAPTER_ADDRESS || await v3Pool(input, output, fee) === ZERO_ADDRESS) return null;
      const raw = await quoteV3Raw(input, output, fee, amount);
      const data = encodeAbiParameters(parseAbiParameters("uint24,uint160"), [fee, 0n]);
      const actualIn = input.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : input.address;
      const actualOut = output.address === ZERO_ADDRESS ? SYNTHRA_V3.weth : output.address;
      const pool = await v3Pool(input, output, fee);
      return {
        providerId: "SYNTHRA_V3",
        providerLabel: "Synthra v3 pool",
        adapter: PERM_V3_ADAPTER_ADDRESS,
        tokenIn: input.address,
        tokenOut: output.address,
        amountIn: amount.toString(),
        amountOut: raw.amountOut.toString(),
        gasEstimate: raw.gasEstimate.toString(),
        poolId: keccak256(encodeAbiParameters(parseAbiParameters("address,address,uint24,address"), [actualIn, actualOut, fee, pool])),
        poolFee: fee,
        hook: ZERO_ADDRESS,
        verifiedHook: false,
        data,
        requote: (nextAmount) => quoteV3Raw(input, output, fee, nextAmount),
      };
    };

    const bestGasConversionStep = async (output: LiveToken, amount: bigint): Promise<InternalStep | undefined> => {
      if (output.address === ZERO_ADDRESS) return undefined;
      const tasks: Array<() => Promise<InternalStep | null>> = [];
      for (const pool of tokenPairPools(ZERO_ADDRESS, output.address).filter((item) => item.sourceType === "direct").slice(0, 64)) {
        tasks.push(() => v4Step(LIVE_TOKEN_MAP.ETH, output, amount, pool).catch(() => null));
      }
      for (const fee of V3_FEES) tasks.push(() => v3Step(LIVE_TOKEN_MAP.ETH, output, amount, fee).catch(() => null));
      return (await runLimited(tasks)).filter((step): step is InternalStep => step !== null)
        .sort((a, b) => BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : BigInt(b.amountOut) < BigInt(a.amountOut) ? -1 : 0)[0];
    };

    const edges = async (input: LiveToken, output: LiveToken, amount: bigint): Promise<InternalStep[]> => {
      const pools = [...tokenPairPools(input.address, output.address), ...configuredHookPools().filter((pool) => {
        const a = pool.currency0.toLowerCase();
        const b = pool.currency1.toLowerCase();
        return (a === input.address.toLowerCase() && b === output.address.toLowerCase())
          || (b === input.address.toLowerCase() && a === output.address.toLowerCase());
      })];
      const tasks: Array<() => Promise<InternalStep | null>> = [];
      if (routingMode === "best" || routingMode === "v4") {
        for (const pool of pools.filter((item) => item.sourceType === "direct").slice(0, 64)) tasks.push(() => v4Step(input, output, amount, pool).catch(() => null));
      }
      if (routingMode === "best" || routingMode === "v3") {
        for (const fee of V3_FEES) tasks.push(() => v3Step(input, output, amount, fee).catch(() => null));
      }
      if (!stagingRequested && (routingMode === "best" || routingMode === "v4" || routingMode === "hooks")) {
        for (const pool of pools.filter((item) => item.sourceType === "aggregator-hook").slice(0, 16)) tasks.push(() => v4Step(input, output, amount, pool).catch(() => null));
      }
      return (await runLimited(tasks)).filter((step): step is InternalStep => step !== null);
    };

    const gasConversionReference = 1_000_000_000_000_000n; // 0.001 testnet ETH; used only as a spot-rate probe.
    let fallbackGasConversion: Promise<InternalStep | undefined> | undefined;
    const fallbackConversion = () => {
      fallbackGasConversion ??= bestGasConversionStep(tokenOut, gasConversionReference);
      return fallbackGasConversion;
    };

    const buildCandidate = async (steps: InternalStep[]): Promise<InternalCandidate> => {
      const routeData = routeDataFor(steps);
      const amountOut = BigInt(steps[steps.length - 1].amountOut);
      const executionGas = 150_000n + steps.reduce((sum, step) => sum + BigInt(step.gasEstimate) + 75_000n, 0n);
      const networkFee = executionGas * gasPrice;
      const providers = [...new Set(steps.map((step) => step.providerId))];
      const hasAggregator = steps.some((step) => step.providerId === "UNISWAP_V4_AGGREGATOR_HOOK");
      const routeKind = hasAggregator ? "aggregator-hook" : steps.length === 1 ? "direct" : providers.length > 1 ? "cross-venue" : "multi-hop";
      const providerLabel = steps.map((step) => step.providerLabel).join(" → ");
      const minAmountOut = amountOut * (BPS - BigInt(slippageBps)) / BPS;
      let conversionStep = steps.findLast((step) => step.tokenIn === ZERO_ADDRESS && step.tokenOut === tokenOut.address);
      if (tokenOut.address !== ZERO_ADDRESS && !conversionStep) conversionStep = await fallbackConversion();
      const candidate: InternalCandidate = {
        providerId: providers.join("+"),
        providerLabel,
        routeKind,
        routeId: keccak256(routeData),
        routeData,
        steps: steps.map(({ requote: _requote, ...step }) => step),
        amountOut: amountOut.toString(),
        minAmountOut: minAmountOut.toString(),
        gasEstimate: executionGas.toString(),
        estimatedNetworkFeeWei: networkFee.toString(),
        gasNormalized: tokenOut.address === ZERO_ADDRESS || Boolean(conversionStep),
        hook: steps.find((step) => step.hook !== ZERO_ADDRESS)?.hook || ZERO_ADDRESS,
        verifiedHook: steps.some((step) => step.verifiedHook),
        conversionStep,
        requote: async (nextAmount: bigint) => {
          let current = nextAmount;
          for (const step of steps) current = (await step.requote(current)).amountOut;
          return current;
        },
      };
      try {
        const conversionInput = conversionStep ? BigInt(conversionStep.amountIn) : 0n;
        const gasInOutput = tokenOut.address === ZERO_ADDRESS
          ? networkFee
          : conversionStep && conversionInput > 0n
            ? BigInt(conversionStep.amountOut) * networkFee / conversionInput
            : undefined;
        if (gasInOutput !== undefined) {
          candidate.estimatedGasInOutput = gasInOutput.toString();
          candidate.gasAdjustedOutput = (amountOut > gasInOutput ? amountOut - gasInOutput : 0n).toString();
        }
      } catch {
        candidate.gasNormalized = false;
      }
      return candidate;
    };

    const directSteps = await edges(tokenIn, tokenOut, routedInput);
    const candidatePromises: Array<Promise<InternalCandidate>> = directSteps.map((step) => buildCandidate([step]));

    const twoStepCandidates = await discoverTwoStepRoutes({
      tokens: LIVE_TOKENS,
      input: tokenIn,
      output: tokenOut,
      amountIn: routedInput,
      edges,
      buildCandidate,
      maxIntermediates: 16,
      maxFirstLegs: 2,
      maxSecondLegs: 3,
      concurrency: 3,
    });

    const internalCandidates = [...await Promise.all(candidatePromises), ...twoStepCandidates];
    const deduped = [...new Map(internalCandidates
      .filter((candidate) => BigInt(candidate.gasEstimate) > 0n && BigInt(candidate.gasEstimate) <= MAX_QUOTED_GAS)
      .map((candidate) => [candidate.routeId, candidate])).values()]
      .sort((a, b) => {
        if (a.gasNormalized !== b.gasNormalized) return a.gasNormalized ? -1 : 1;
        const left = BigInt(a.gasAdjustedOutput ?? a.amountOut);
        const right = BigInt(b.gasAdjustedOutput ?? b.amountOut);
        return right > left ? 1 : right < left ? -1 : 0;
      })
      .slice(0, 12);
    if (!deduped.length) {
      return error(routingMode === "hooks"
        ? "No verified Aggregator Hook candidate is configured and executable on this testnet"
        : "No executable route is available for this pair", 422);
    }

    const selectedInternal = deduped[0];
    try {
      const smallInput = routedInput / 1_000n;
      if (smallInput > 0n) {
        const smallOutput = await selectedInternal.requote(smallInput);
        const referenceOutput = smallOutput * routedInput / smallInput;
        selectedInternal.priceImpactBps = referenceOutput > BigInt(selectedInternal.amountOut) && referenceOutput > 0n
          ? Number((referenceOutput - BigInt(selectedInternal.amountOut)) * BPS / referenceOutput)
          : 0;
      }
    } catch {
      // Price impact remains unavailable rather than being fabricated.
    }

    const quotedAt = Number(block.timestamp);
    const deadline = quotedAt + 90;
    const signer = quoteSignerConfiguration();
    const domain = { name: "Perm", version: "2", chainId: RH_TESTNET_CHAIN_ID, verifyingContract: PERM_ROUTER_ADDRESS || ZERO_ADDRESS } as const;
    const message = {
      account,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      minAmountOut: BigInt(selectedInternal.minAmountOut),
      gasEstimate: BigInt(selectedInternal.gasEstimate),
      recipient,
      deadline: BigInt(deadline),
      quotedAt: BigInt(quotedAt),
      policyVersion: policy.version,
      chainId: BigInt(RH_TESTNET_CHAIN_ID),
      referrer,
      routeHash: keccak256(selectedInternal.routeData),
    };
    const quoteId = hashTypedData({ domain, types: PERM_QUOTE_TYPES, primaryType: "PermQuote", message });

    const signerRuntimeAllowed = quoteSignerExecutionReady(signer);
    const releaseSignerAllowed = signer.configured && signer.custodyReady;
    const stagingSignerAllowed = signer.configured && signer.stagingReady && signerRuntimeAllowed;
    const releaseExecutable = RELEASE_DEPLOYMENT_READY && releaseSignerAllowed;
    const stagingExecutable = Boolean(
      stagingRequested
        && STAGING_DEPLOYMENT_CONFIGURED
        && staging.configured
        && isAllowlistedStagingWallet(account, staging)
        && stagingSignerAllowed,
    );
    const executionMode = releaseExecutable
      ? "release" as const
      : stagingExecutable
        ? "allowlisted-staging" as const
        : "read-only" as const;
    let executable = Boolean(
      (releaseExecutable || stagingExecutable)
        && account !== ZERO_ADDRESS
        && recipient !== ZERO_ADDRESS,
    );
    let deploymentReason: string | undefined;
    if (ROUTER_VERSION < 2) deploymentReason = "Router v2 is required for signed multi-venue execution; the shared manifest still points to v1.";
    else if (stagingRequested && !STAGING_DEPLOYMENT_CONFIGURED) deploymentReason = "The explicit Router v2 staging deployment is incomplete or invalid.";
    else if (stagingRequested && !staging.configured) deploymentReason = staging.reason || "Allowlisted staging is not configured.";
    else if (stagingRequested && account !== ZERO_ADDRESS && !isAllowlistedStagingWallet(account, staging)) deploymentReason = "This wallet is not authorized for allowlisted staging execution.";
    else if (!RELEASE_DEPLOYMENT_READY && !stagingRequested) deploymentReason = "The Router v2 candidate has not passed and been promoted through the release gate.";
    else if (!signer.configured) deploymentReason = signer.reason || "The quote signer is not configured.";
    else if (stagingRequested && !stagingSignerAllowed) deploymentReason = signer.reason || "The testnet-only staging signer is not explicitly enabled.";
    else if (!stagingRequested && !releaseSignerAllowed) deploymentReason = "Production execution requires authenticated remote signer custody.";
    else if (account === ZERO_ADDRESS || recipient === ZERO_ADDRESS) deploymentReason = "Connect a wallet and provide a recipient to request an executable signed quote.";

    const configuredRouter = PERM_ROUTER_ADDRESS;
    if (executable && configuredRouter && signer.address) {
      const onchainSigner = await ttlCached(`signer:${configuredRouter}`, 10_000, () => client.readContract({
        address: configuredRouter,
        abi: permRouterAbi,
        functionName: "quoteSigner",
      }));
      if (onchainSigner.toLowerCase() !== signer.address.toLowerCase()) {
        executable = false;
        deploymentReason = "The quote service key does not match the onchain authorized signer.";
      }
    }

    const quoteSignature = executable
      ? (await signPermQuote(domain, message)).signature
      : "0x";
    const requestFingerprint = keccak256(toHex(JSON.stringify({
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: amountIn.toString(),
      slippageBps,
      account,
      recipient,
      referrer,
      routingMode,
    })));

    const candidates = deduped.map(({ requote: _requote, conversionStep: _conversion, ...candidate }) => candidate);
    const selected = candidates.find((candidate) => candidate.routeId === selectedInternal.routeId) || candidates[0];
    const result: LiveQuote = {
      contractVersion: ROUTER_VERSION,
      chainId: RH_TESTNET_CHAIN_ID,
      quoteId,
      quoteSignature,
      quotedAt,
      deadline,
      policyVersion: policy.version,
      platformFeeBps: policy.platformFeeBps,
      rebateShareBps: policy.rebateShareBps,
      account,
      recipient,
      referrer,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn: amountIn.toString(),
      grossFee: grossFee.toString(),
      rebate: rebate.toString(),
      netFee: netFee.toString(),
      routedInput: routedInput.toString(),
      slippageBps,
      routingMode,
      blockNumber: block.number.toString(),
      requestFingerprint,
      executable,
      executionMode,
      nonRelease: executionMode === "allowlisted-staging",
      deploymentReason,
      selected,
      candidates,
    };
    return NextResponse.json(result, { headers: { "cache-control": "private, max-age=0, no-store" } });
  } catch (cause) {
    return error(safeServerError("quote", cause, "Quote service could not validate an executable route"), 503);
  }
}
