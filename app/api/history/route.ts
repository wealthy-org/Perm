import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { permRouterAbi, permRouterV1Abi } from "@/lib/web3/abis";
import { DEPLOYMENT_BLOCK, PERM_ROUTER_ADDRESS, ROUTER_VERSION, createRobinhoodPublicClient } from "@/lib/web3/config";
import { boundedEnvironmentInteger, consumeRateLimit, requestIdentity, safeServerError } from "@/lib/server/runtime";
import { indexedHistoryAvailable, readIndexedHistory } from "@/lib/server/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORY_CONFIRMATIONS = BigInt(boundedEnvironmentInteger("HISTORY_CONFIRMATIONS", 12, 1, 10_000));

export async function GET(request: NextRequest) {
  const limit = consumeRateLimit(`history:${requestIdentity(request)}`, 15, 0.25);
  if (!limit.allowed) return NextResponse.json({ error: "Too many history requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  if (!PERM_ROUTER_ADDRESS || !DEPLOYMENT_BLOCK) return NextResponse.json({ error: "Official deployment is not configured" }, { status: 503 });

  const accountParam = request.nextUrl.searchParams.get("account");
  if (accountParam && !isAddress(accountParam)) return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  const account = accountParam ? getAddress(accountParam) as Address : undefined;
  const cursorParam = request.nextUrl.searchParams.get("before");
  if (cursorParam && !/^\d+$/.test(cursorParam)) return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  const requestedBefore = cursorParam ? BigInt(cursorParam) : undefined;

  if (indexedHistoryAvailable()) {
    try {
      const indexed = await readIndexedHistory(account, requestedBefore, 50);
      if (indexed) return NextResponse.json({
        items: indexed.items,
        indexedThrough: indexed.indexedThrough,
        nextBefore: indexed.nextBefore,
        source: "postgres-indexer",
      }, { headers: { "cache-control": "private, max-age=10" } });
    } catch (cause) {
      const message = safeServerError("history-indexer", cause, "Indexed history is temporarily unavailable");
      if (process.env.PERM_REQUIRE_INDEXER === "1") return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  const client = createRobinhoodPublicClient();
  try {
    const latest = await client.getBlockNumber();
    const confirmedTip = latest > HISTORY_CONFIRMATIONS ? latest - HISTORY_CONFIRMATIONS : 0n;
    const deploymentBlock = BigInt(DEPLOYMENT_BLOCK);
    const before = requestedBefore ?? confirmedTip + 1n;
    if (before === 0n || confirmedTip < deploymentBlock) {
      return NextResponse.json({ items: [], nextBefore: null, source: "official-router-logs", confirmedThrough: confirmedTip.toString() }, { headers: { "cache-control": "private, max-age=10" } });
    }
    let toBlock = before - 1n < confirmedTip ? before - 1n : confirmedTip;
    const initialTo = toBlock;
    const abi = ROUTER_VERSION >= 2 ? permRouterAbi : permRouterV1Abi;
    type SettlementLog = { args: Record<string, unknown>; transactionHash: Hex; logIndex: number; blockNumber: bigint };
    const found: SettlementLog[] = [];
    let batches = 0;

    while (toBlock >= deploymentBlock && found.length < 50 && batches < 20) {
      const tentative = toBlock > 9_999n ? toBlock - 9_999n : 0n;
      const fromBlock = tentative < deploymentBlock ? deploymentBlock : tentative;
      const logs = await client.getContractEvents({
        address: PERM_ROUTER_ADDRESS,
        abi,
        eventName: "SwapSettled",
        args: account ? { account } : undefined,
        fromBlock,
        toBlock,
        strict: true,
      });
      found.unshift(...(logs as unknown as SettlementLog[]));
      batches += 1;
      if (fromBlock === deploymentBlock) {
        toBlock = deploymentBlock - 1n;
        break;
      }
      toBlock = fromBlock - 1n;
    }

    const items = found.slice(-50).reverse().map((log) => {
      const args = log.args as Record<string, unknown>;
      return {
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber.toString(),
        receiptId: args.receiptId,
        quoteId: args.quoteId,
        account: args.account,
        recipient: args.recipient,
        tokenIn: args.tokenIn,
        tokenOut: args.tokenOut,
        amountIn: String(args.amountIn),
        routedInput: String(args.routedInput),
        amountOut: String(args.amountOut),
        grossFee: String(args.grossFee),
        rebate: String(args.rebate),
        netFee: String(args.netFee),
        referralFee: String(args.referralFee),
        treasuryFee: ROUTER_VERSION >= 2 ? String(args.treasuryFee) : "0",
        policyVersion: Number(args.policyVersion),
        routeId: ROUTER_VERSION >= 2 ? args.routeId : args.providerId,
        routeHash: ROUTER_VERSION >= 2 ? args.routeHash : null,
        legacy: ROUTER_VERSION < 2,
      };
    });
    const reachedDeployment = toBlock < deploymentBlock;
    return NextResponse.json({
      items,
      scanned: {
        fromBlock: (reachedDeployment ? deploymentBlock : toBlock + 1n).toString(),
        toBlock: initialTo.toString(),
        batches,
      },
      nextBefore: reachedDeployment ? null : (toBlock + 1n).toString(),
      confirmedThrough: confirmedTip.toString(),
      source: "official-router-logs",
    }, { headers: { "cache-control": "private, max-age=10" } });
  } catch (cause) {
    return NextResponse.json({ error: safeServerError("history", cause, "Onchain history lookup failed") }, { status: 502 });
  }
}
