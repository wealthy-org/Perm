import { NextResponse, type NextRequest } from "next/server";
import { DEPLOYMENT_READY, PERM_ROUTER_ADDRESS, RH_TESTNET_FALLBACK_RPC, ROUTER_VERSION, createRobinhoodPublicClient } from "@/lib/web3/config";
import { permRouterAbi } from "@/lib/web3/abis";
import { indexerHealth, indexedHistoryAvailable } from "@/lib/server/indexer";
import { consumeRateLimit, requestIdentity, safeServerError } from "@/lib/server/runtime";
import { quoteSignerConfiguration } from "@/lib/server/quote-signer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const limit = await consumeRateLimit(`health:${requestIdentity(request)}`, 30, 0.5);
    if (!limit.allowed) return NextResponse.json({ error: "Too many health requests" }, { status: 429, headers: { "retry-after": String(limit.retryAfter), "cache-control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: safeServerError("health-rate-limit", cause, "Request protection is temporarily unavailable") }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const requireExecution = request.nextUrl.searchParams.get("requireExecution") === "1";
  const signer = quoteSignerConfiguration();
  const checks = {
    routerVersion: ROUTER_VERSION,
    deploymentReady: DEPLOYMENT_READY,
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
  let indexer: Awaited<ReturnType<typeof indexerHealth>> = undefined;
  let blockNumber: string | null = null;

  try {
    const client = createRobinhoodPublicClient();
    const block = await client.getBlock({ blockTag: "latest" });
    checks.primaryRpc = true;
    blockNumber = block.number.toString();
    const configuredSigner = signer.address;
    if (ROUTER_VERSION >= 2 && PERM_ROUTER_ADDRESS && configuredSigner) {
      const onchainSigner = await client.readContract({
        address: PERM_ROUTER_ADDRESS,
        abi: permRouterAbi,
        functionName: "quoteSigner",
      });
      checks.quoteSignerMatchesOnchain = onchainSigner.toLowerCase() === configuredSigner.toLowerCase();
    }
    if (checks.indexerConfigured) {
      indexer = await indexerHealth();
      checks.indexerHealthy = Boolean(indexer?.lastIndexedBlock && indexer.lastIndexedBlockHash && indexer.updatedAt);
    }
  } catch (cause) {
    safeServerError("health", cause, "Health check failed");
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
  const status = requireExecution && !executionReady ? 503 : 200;
  return NextResponse.json({
    status: executionReady ? "ready" : "not-ready",
    executionReady,
    blockNumber,
    indexer: indexer || null,
    checks,
  }, { status, headers: { "cache-control": "no-store" } });
}
