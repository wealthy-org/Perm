import { NextResponse, type NextRequest } from "next/server";
import { decodeEventLog, keccak256, toHex } from "viem";
import {
  PERM_ROUTER_ADDRESS,
  PERM_V2_ADAPTER_ADDRESS,
  PERM_V3_ADAPTER_ADDRESS,
  PERM_V4_ADAPTER_ADDRESS,
  RELEASE_DEPLOYMENT_READY,
  REVIEWED_V2_STAGING_ENABLED,
  RH_TESTNET_FALLBACK_RPC,
  ROUTER_VERSION,
  STAGING_DEPLOYMENT_CONFIGURED,
  STAGING_E2E_DECLARED,
  ZERO_ADDRESS,
  createRobinhoodPublicClient,
} from "@/lib/web3/config";
import { permRouterAbi } from "@/lib/web3/abis";
import { indexerHealth, indexedHistoryAvailable } from "@/lib/server/indexer";
import { consumeRateLimit, requestIdentity, safeServerError } from "@/lib/server/runtime";
import { quoteSignerConfiguration, quoteSignerExecutionReady } from "@/lib/server/quote-signer";
import { allowlistedStagingConfiguration, isAllowlistedStagingWallet } from "@/lib/server/staging-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DIRECT_V4_PROVIDER = keccak256(toHex("UNISWAP_V4_DIRECT"));
const SYNTHRA_V3_PROVIDER = keccak256(toHex("SYNTHRA_V3"));
const REVIEWED_V2_PROVIDER = keccak256(toHex("REVIEWED_V2_THIRD_PARTY"));

function aggregatorHooksDisabled() {
  const raw = process.env.PERM_AGGREGATOR_HOOKS_JSON;
  if (!raw) return true;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.length === 0;
  } catch {
    return false;
  }
}

function stagingConfirmationRequirement() {
  const raw = process.env.PERM_STAGING_E2E_CONFIRMATIONS || "1";
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? BigInt(value) : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const limit = await consumeRateLimit(`health:${requestIdentity(request)}`, 30, 0.5);
    if (!limit.allowed) return NextResponse.json({ error: "Too many health requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfter), "cache-control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: safeServerError("health-rate-limit", cause, "Request protection is temporarily unavailable") }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const requireExecution = request.nextUrl.searchParams.get("requireExecution") === "1";
  const requireStaging = request.nextUrl.searchParams.get("requireStaging") === "1";
  if (requireExecution && requireStaging) {
    return NextResponse.json({ error: "Choose either requireExecution or requireStaging" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const signer = quoteSignerConfiguration();
  const staging = allowlistedStagingConfiguration();
  const checks = {
    routerVersion: ROUTER_VERSION,
    deploymentReady: RELEASE_DEPLOYMENT_READY,
    routerConfigured: Boolean(PERM_ROUTER_ADDRESS),
    primaryRpc: false,
    fallbackRpcConfigured: Boolean(RH_TESTNET_FALLBACK_RPC),
    indexerConfigured: indexedHistoryAvailable(),
    indexerRequired: process.env.PERM_REQUIRE_INDEXER === "1",
    sharedRateLimitConfigured: Boolean(process.env.PERM_RATE_LIMIT_DATABASE_URL || process.env.DATABASE_URL || process.env.PERM_INDEXER_DATABASE_URL),
    sharedRateLimitRequired: process.env.PERM_REQUIRE_SHARED_RATE_LIMIT === "1",
    alertWebhookConfigured: Boolean(process.env.PERM_ALERT_WEBHOOK_URL),
    walletConnectConfigured: Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
    quoteSignerConfigured: signer.configured,
    quoteSignerMode: signer.mode,
    quoteSignerCustodyReady: signer.custodyReady,
    quoteSignerMatchesOnchain: false,
    indexerHealthy: false,
  };
  const stagingChecks = {
    nonRelease: true,
    serverModeConfigured: staging.serverModeConfigured,
    publicModeConfigured: staging.publicModeConfigured,
    chainPinned: staging.chainPinned,
    allowlistConfigured: staging.allowlistConfigured,
    allowlistCount: staging.allowlist.length,
    deploymentConfigured: STAGING_DEPLOYMENT_CONFIGURED,
    routerV2Configured: ROUTER_VERSION >= 2 && Boolean(PERM_ROUTER_ADDRESS),
    v4AdapterConfigured: Boolean(PERM_V4_ADAPTER_ADDRESS),
    v3AdapterConfigured: Boolean(PERM_V3_ADAPTER_ADDRESS),
    reviewedV2Requested: REVIEWED_V2_STAGING_ENABLED,
    v2AdapterConfigured: Boolean(PERM_V2_ADAPTER_ADDRESS),
    routerCodePresent: false,
    v4AdapterCodePresent: false,
    v3AdapterCodePresent: false,
    v2AdapterCodePresent: false,
    directV4AdapterEnabled: false,
    directV3AdapterEnabled: false,
    directV2AdapterEnabled: false,
    aggregatorHookProviderDisabled: false,
    aggregatorHookConfigurationDisabled: aggregatorHooksDisabled(),
    localBurnerSignerExplicitlyAllowed: staging.localBurnerSignerAllowed,
    quoteSignerConfigured: signer.configured,
    quoteSignerMode: signer.mode,
    quoteSignerCustodyReady: signer.custodyReady,
    quoteSignerStagingReady: signer.stagingReady && quoteSignerExecutionReady(signer),
    quoteSignerMatchesOnchain: false,
    e2eDeclared: STAGING_E2E_DECLARED && staging.e2eDeclared,
    e2eTransactionConfigured: Boolean(staging.e2eTransactionHash),
    e2eCanonical: false,
    e2eAllowlistedAccount: false,
    e2eDirectRoutesOnly: false,
    e2eConfirmations: null as string | null,
    e2eRequiredConfirmations: stagingConfirmationRequirement()?.toString() || null,
  };
  let indexer: Awaited<ReturnType<typeof indexerHealth>> = undefined;
  let blockNumber: string | null = null;
  let latestBlockNumber: bigint | undefined;
  const client = createRobinhoodPublicClient();

  try {
    const block = await client.getBlock({ blockTag: "latest" });
    checks.primaryRpc = true;
    blockNumber = block.number.toString();
    latestBlockNumber = block.number;
    const configuredSigner = signer.address;
    if (ROUTER_VERSION >= 2 && PERM_ROUTER_ADDRESS) {
      const routerCode = await client.getCode({ address: PERM_ROUTER_ADDRESS });
      const onchainSigner = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "quoteSigner" });
      stagingChecks.routerCodePresent = Boolean(routerCode && routerCode !== "0x");
      if (PERM_V4_ADAPTER_ADDRESS) {
        const v4Code = await client.getCode({ address: PERM_V4_ADAPTER_ADDRESS });
        const v4Config = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "adapters", args: [PERM_V4_ADAPTER_ADDRESS] });
        const hookProvider = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "hookProviderIds", args: [PERM_V4_ADAPTER_ADDRESS] });
        stagingChecks.v4AdapterCodePresent = Boolean(v4Code && v4Code !== "0x");
        stagingChecks.directV4AdapterEnabled = v4Config[0] && v4Config[1].toLowerCase() === DIRECT_V4_PROVIDER.toLowerCase();
        stagingChecks.aggregatorHookProviderDisabled = hookProvider === `0x${"0".repeat(64)}`;
      }
      if (PERM_V3_ADAPTER_ADDRESS) {
        const v3Code = await client.getCode({ address: PERM_V3_ADAPTER_ADDRESS });
        const v3Config = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "adapters", args: [PERM_V3_ADAPTER_ADDRESS] });
        stagingChecks.v3AdapterCodePresent = Boolean(v3Code && v3Code !== "0x");
        stagingChecks.directV3AdapterEnabled = v3Config[0] && v3Config[1].toLowerCase() === SYNTHRA_V3_PROVIDER.toLowerCase();
      }
      if (REVIEWED_V2_STAGING_ENABLED && PERM_V2_ADAPTER_ADDRESS) {
        const v2Code = await client.getCode({ address: PERM_V2_ADAPTER_ADDRESS });
        const v2Config = await client.readContract({ address: PERM_ROUTER_ADDRESS, abi: permRouterAbi, functionName: "adapters", args: [PERM_V2_ADAPTER_ADDRESS] });
        stagingChecks.v2AdapterCodePresent = Boolean(v2Code && v2Code !== "0x");
        stagingChecks.directV2AdapterEnabled = v2Config[0] && v2Config[1].toLowerCase() === REVIEWED_V2_PROVIDER.toLowerCase();
      }
      if (configuredSigner) {
        checks.quoteSignerMatchesOnchain = onchainSigner.toLowerCase() === configuredSigner.toLowerCase();
        stagingChecks.quoteSignerMatchesOnchain = checks.quoteSignerMatchesOnchain;
      }
    }
    if (checks.indexerConfigured) {
      indexer = await indexerHealth();
      checks.indexerHealthy = Boolean(indexer?.lastIndexedBlock && indexer.lastIndexedBlockHash && indexer.updatedAt);
    }
  } catch (cause) {
    safeServerError("health", cause, "Health check failed");
  }

  const requiredE2eConfirmations = stagingConfirmationRequirement();
  const stagingRouter = PERM_ROUTER_ADDRESS;
  if (
    checks.primaryRpc
      && latestBlockNumber !== undefined
      && staging.e2eTransactionHash
      && requiredE2eConfirmations
      && stagingRouter
  ) {
    try {
      const [receipt, transaction] = await Promise.all([
        client.getTransactionReceipt({ hash: staging.e2eTransactionHash }),
        client.getTransaction({ hash: staging.e2eTransactionHash }),
      ]);
      const canonicalBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
      const confirmations = latestBlockNumber >= receipt.blockNumber ? latestBlockNumber - receipt.blockNumber + 1n : 0n;
      stagingChecks.e2eConfirmations = confirmations.toString();
      const routerLogs = receipt.logs.filter((log) => log.address.toLowerCase() === stagingRouter.toLowerCase());
      let allowlistedSettlement = false;
      let directSteps = 0;
      let forbiddenStep = false;
      for (const log of routerLogs) {
        try {
          const decoded = decodeEventLog({ abi: permRouterAbi, data: log.data, topics: log.topics, strict: true });
          if (decoded.eventName === "SwapSettled") {
            allowlistedSettlement ||= isAllowlistedStagingWallet(decoded.args.account, staging);
          }
          if (decoded.eventName === "RouteStepSettled") {
            directSteps += 1;
            const directProvider = decoded.args.providerId.toLowerCase() === DIRECT_V4_PROVIDER.toLowerCase()
              || decoded.args.providerId.toLowerCase() === SYNTHRA_V3_PROVIDER.toLowerCase()
              || (REVIEWED_V2_STAGING_ENABLED && decoded.args.providerId.toLowerCase() === REVIEWED_V2_PROVIDER.toLowerCase());
            if (!directProvider || decoded.args.hook.toLowerCase() !== ZERO_ADDRESS) forbiddenStep = true;
          }
        } catch {
          // Ignore unrelated logs emitted by the exact router address.
        }
      }
      stagingChecks.e2eAllowlistedAccount = allowlistedSettlement && isAllowlistedStagingWallet(transaction.from, staging);
      stagingChecks.e2eDirectRoutesOnly = directSteps > 0 && !forbiddenStep;
      stagingChecks.e2eCanonical = Boolean(
        receipt.status === "success"
          && transaction.to?.toLowerCase() === stagingRouter.toLowerCase()
          && canonicalBlock.hash?.toLowerCase() === receipt.blockHash.toLowerCase()
          && confirmations >= requiredE2eConfirmations
          && stagingChecks.e2eAllowlistedAccount
          && stagingChecks.e2eDirectRoutesOnly,
      );
    } catch (cause) {
      safeServerError("staging-e2e-health", cause, "Staging E2E evidence check failed");
    }
  }

  const executionReady = Boolean(
    checks.routerVersion >= 2
      && checks.deploymentReady
      && checks.primaryRpc
      && checks.fallbackRpcConfigured
      && checks.indexerConfigured
      && checks.indexerRequired
      && checks.indexerHealthy
      && checks.sharedRateLimitConfigured
      && checks.sharedRateLimitRequired
      && checks.alertWebhookConfigured
      && checks.walletConnectConfigured
      && checks.quoteSignerConfigured
      && checks.quoteSignerCustodyReady
      && checks.quoteSignerMatchesOnchain,
  );
  const stagingReady = Boolean(
    staging.configured
      && stagingChecks.deploymentConfigured
      && stagingChecks.routerV2Configured
      && stagingChecks.v4AdapterConfigured
      && stagingChecks.v3AdapterConfigured
      && checks.primaryRpc
      && stagingChecks.routerCodePresent
      && stagingChecks.v4AdapterCodePresent
      && stagingChecks.v3AdapterCodePresent
      && stagingChecks.directV4AdapterEnabled
      && stagingChecks.directV3AdapterEnabled
      && (!stagingChecks.reviewedV2Requested || (
        stagingChecks.v2AdapterConfigured
          && stagingChecks.v2AdapterCodePresent
          && stagingChecks.directV2AdapterEnabled
      ))
      && stagingChecks.aggregatorHookProviderDisabled
      && stagingChecks.aggregatorHookConfigurationDisabled
      && stagingChecks.quoteSignerConfigured
      && stagingChecks.quoteSignerStagingReady
      && stagingChecks.quoteSignerMatchesOnchain
      && stagingChecks.e2eDeclared
      && stagingChecks.e2eCanonical,
  );

  const status = requireExecution && !executionReady
    ? 503
    : requireStaging && !stagingReady
      ? 503
      : 200;
  return NextResponse.json({
    status: executionReady ? "ready" : stagingReady ? "staging-ready-non-release" : "not-ready",
    executionReady,
    stagingReady,
    nonReleaseStaging: staging.requested,
    blockNumber,
    indexer: indexer || null,
    checks,
    stagingChecks,
    stagingReason: staging.configured ? null : staging.reason || null,
    signerReason: signer.configured ? null : signer.reason || null,
  }, { status, headers: { "cache-control": "no-store" } });
}
