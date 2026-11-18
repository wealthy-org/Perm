import { NextResponse, type NextRequest } from "next/server";
import {
  decodeEventLog,
  formatEther,
  getAddress,
  isAddress,
  isHash,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { permRouterAbi } from "@/lib/web3/abis";
import {
  PERM_ROUTER_ADDRESS,
  RH_TESTNET_CHAIN_ID,
  createRobinhoodPublicClient,
} from "@/lib/web3/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DIRECT_PROVIDER = keccak256(toHex("UNISWAP_V4_DIRECT"));

export async function GET(request: NextRequest) {
  const tx = request.nextUrl.searchParams.get("tx") as Hex | null;
  const routerParam = request.nextUrl.searchParams.get("router");
  if (!tx || !isHash(tx)) return NextResponse.json({ error: "A valid transaction hash is required" }, { status: 400 });
  if (routerParam && !isAddress(routerParam)) return NextResponse.json({ error: "Invalid router address" }, { status: 400 });
  const router = (routerParam ? getAddress(routerParam) : PERM_ROUTER_ADDRESS) as Address | undefined;
  if (!router) return NextResponse.json({ error: "PermRouter deployment is not configured" }, { status: 503 });

  const client = createRobinhoodPublicClient();
  try {
    const receipt = await client.getTransactionReceipt({ hash: tx });
    const settlementLog = receipt.logs.find((log) => log.address.toLowerCase() === router.toLowerCase());
    if (!settlementLog) return NextResponse.json({ error: "No Perm settlement event exists in this transaction" }, { status: 404 });
    let decoded;
    try {
      decoded = decodeEventLog({ abi: permRouterAbi, eventName: "SwapSettled", data: settlementLog.data, topics: settlementLog.topics });
    } catch {
      return NextResponse.json({ error: "The router log is not a valid SwapSettled receipt" }, { status: 422 });
    }
    const [block, latest] = await Promise.all([
      client.getBlock({ blockNumber: receipt.blockNumber }),
      client.getBlockNumber(),
    ]);
    const args = decoded.args;
    const providerLabel = args.providerId.toLowerCase() === DIRECT_PROVIDER.toLowerCase()
      ? "Uniswap v4 direct pool"
      : "Approved Perm adapter";
    return NextResponse.json({
      chainId: RH_TESTNET_CHAIN_ID,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      blockTimestamp: Number(block.timestamp),
      logIndex: settlementLog.logIndex,
      status: receipt.status,
      confirmations: (latest - receipt.blockNumber + 1n).toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualNetworkFeeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      actualNetworkFeeEth: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
      receiptId: args.receiptId,
      quoteId: args.quoteId,
      account: args.account,
      recipient: args.recipient,
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      amountIn: args.amountIn.toString(),
      routedInput: args.routedInput.toString(),
      amountOut: args.amountOut.toString(),
      grossFee: args.grossFee.toString(),
      rebate: args.rebate.toString(),
      netFee: args.netFee.toString(),
      referralFee: args.referralFee.toString(),
      policyVersion: Number(args.policyVersion),
      providerId: args.providerId,
      providerLabel,
      adapter: args.adapter,
      hook: args.hook,
      explorerUrl: `https://explorer.testnet.chain.robinhood.com/tx/${receipt.transactionHash}`,
    }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Receipt lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
