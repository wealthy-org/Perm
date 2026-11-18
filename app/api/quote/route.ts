import { NextResponse, type NextRequest } from "next/server";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  DEPLOYMENT_READY,
  PERM_V4_ADAPTER_ADDRESS,
  RH_TESTNET_CHAIN_ID,
  V4_QUOTER_ADDRESS,
  ZERO_ADDRESS,
  createRobinhoodPublicClient,
} from "@/lib/web3/config";
import { v4QuoterAbi } from "@/lib/web3/abis";
import { LIVE_TOKEN_MAP, tokenPairPools, type LiveTokenSymbol } from "@/lib/web3/tokens";
import type { LiveQuote, LiveQuoteCandidate } from "@/lib/web3/quote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BPS = 10_000n;
const PLATFORM_FEE_BPS = 20n;
const REBATE_SHARE_BPS = 2_500n;
const MAX_INT128 = (1n << 127n) - 1n;
const QUOTE_DOMAIN = keccak256(toHex("PERM_QUOTE_V1"));

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let body: { tokenIn?: string; tokenOut?: string; amountIn?: string; slippageBps?: number; account?: string; recipient?: string; adapter?: string; referrer?: string };
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const tokenIn = LIVE_TOKEN_MAP[body.tokenIn as LiveTokenSymbol];
  const tokenOut = LIVE_TOKEN_MAP[body.tokenOut as LiveTokenSymbol];
  if (!tokenIn || !tokenOut || tokenIn.symbol === tokenOut.symbol) return error("Unsupported token pair");

  const requestedAddresses = [body.account, body.recipient, body.adapter, body.referrer].filter(Boolean) as string[];
  if (requestedAddresses.some((address) => !isAddress(address))) return error("Quote binding contains an invalid address");
  const account = getAddress(body.account || ZERO_ADDRESS) as Address;
  const recipient = getAddress(body.recipient || ZERO_ADDRESS) as Address;
  const adapter = getAddress(body.adapter || PERM_V4_ADAPTER_ADDRESS || ZERO_ADDRESS) as Address;
  const referrer = getAddress(body.referrer || ZERO_ADDRESS) as Address;

  let amountIn: bigint;
  try {
    amountIn = BigInt(body.amountIn || "0");
  } catch {
    return error("amountIn must be an integer in token base units");
  }
  if (amountIn <= 0n || amountIn > MAX_INT128) return error("amountIn is outside the exact-input range");

  const slippageBps = Number(body.slippageBps ?? 50);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) {
    return error("slippageBps must be between 1 and 500");
  }

  const pools = tokenPairPools(tokenIn.address, tokenOut.address);
  if (!pools.length) return error("No verified direct pool is configured for this pair", 422);

  const grossFee = amountIn * PLATFORM_FEE_BPS / BPS;
  const rebate = grossFee * REBATE_SHARE_BPS / BPS;
  const netFee = grossFee - rebate;
  const routedInput = amountIn - netFee;
  if (routedInput <= 0n || routedInput > MAX_INT128) return error("Routed input is outside the v4 quote range");

  const client = createRobinhoodPublicClient();
  try {
    const [block, gasPrice] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.getGasPrice(),
    ]);
    const quotedCandidates = await Promise.all(pools.map(async (pool): Promise<LiveQuoteCandidate | null> => {
        try {
          const zeroForOne = tokenIn.address.toLowerCase() === pool.currency0.toLowerCase();
          const { result: [amountOut, quoteGas] } = await client.simulateContract({
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
              exactAmount: routedInput,
              hookData: "0x",
            }],
          });
          if (amountOut <= 0n) return null;
          const minAmountOut = amountOut * (BPS - BigInt(slippageBps)) / BPS;
          const routeData = encodeAbiParameters([
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
          }, "0x"]);
          const executionGas = quoteGas + 220_000n;
          return {
            providerId: "UNISWAP_V4_DIRECT",
            providerLabel: "Uniswap v4 direct pool",
            poolId: pool.id,
            pool: {
              currency0: pool.currency0,
              currency1: pool.currency1,
              fee: pool.fee,
              tickSpacing: pool.tickSpacing,
              hooks: pool.hooks,
            },
            amountOut: amountOut.toString(),
            minAmountOut: minAmountOut.toString(),
            gasEstimate: executionGas.toString(),
            estimatedNetworkFeeWei: (executionGas * gasPrice).toString(),
            routeData: routeData as Hex,
            hook: pool.hooks,
            verifiedHook: pool.hooks !== "0x0000000000000000000000000000000000000000",
          };
        } catch (cause) {
          console.error("Perm quote candidate rejected", pool.id, cause);
          return null;
        }
      }));

    const candidates = quotedCandidates.filter((candidate): candidate is LiveQuoteCandidate => candidate !== null)
      .sort((a, b) => BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1);
    if (!candidates.length) return error("All configured candidates were unavailable or returned an invalid quote", 503);

    const quotedAt = Number(block.timestamp);
    const deadline = quotedAt + 90;
    const selected = candidates[0];
    const quoteId = keccak256(encodeAbiParameters(
      parseAbiParameters("bytes32,address,address,address,address,uint256,uint256,address,uint256,uint64,uint32,uint256,address,bytes32"),
      [
        QUOTE_DOMAIN,
        account,
        adapter,
        getAddress(tokenIn.address),
        getAddress(tokenOut.address),
        amountIn,
        BigInt(selected.minAmountOut),
        recipient,
        BigInt(deadline),
        BigInt(quotedAt),
        1,
        BigInt(RH_TESTNET_CHAIN_ID),
        referrer,
        keccak256(selected.routeData),
      ],
    ));
    const result: LiveQuote = {
      chainId: RH_TESTNET_CHAIN_ID,
      quoteId,
      quotedAt,
      deadline,
      policyVersion: 1,
      account,
      recipient,
      adapter,
      referrer,
      tokenIn: getAddress(tokenIn.address) as Address,
      tokenOut: getAddress(tokenOut.address) as Address,
      amountIn: amountIn.toString(),
      grossFee: grossFee.toString(),
      rebate: rebate.toString(),
      netFee: netFee.toString(),
      routedInput: routedInput.toString(),
      slippageBps,
      blockNumber: block.number.toString(),
      executable: DEPLOYMENT_READY,
      deploymentReason: DEPLOYMENT_READY ? undefined : "PermRouter and PermV4Adapter are compiled and tested but not yet published in the deployment manifest.",
      selected,
      candidates,
    };
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Robinhood testnet quote failed";
    return error(message, 503);
  }
}
