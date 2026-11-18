import { createPublicClient, defineChain, fallback, http, type Address } from "viem";
import deployment from "@/deployments/robinhood-testnet.json";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const RH_TESTNET_CHAIN_ID = 46_630;
export const RH_TESTNET_RPC = process.env.RH_TESTNET_RPC_URL || deployment.rpcUrl;
export const RH_TESTNET_FALLBACK_RPC = process.env.RH_TESTNET_FALLBACK_RPC_URL;
export const RH_TESTNET_EXPLORER = deployment.explorerUrl;

export const robinhoodTestnet = defineChain({
  id: RH_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Testnet Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [deployment.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Robinhood Testnet Explorer", url: RH_TESTNET_EXPLORER },
  },
  testnet: true,
});

export const POOL_MANAGER_ADDRESS = deployment.poolManager as Address;
export const V4_QUOTER_ADDRESS = deployment.v4Quoter as Address;
export const PERMIT2_ADDRESS = deployment.permit2 as Address;

const envRouter = process.env.NEXT_PUBLIC_PERM_ROUTER_ADDRESS;
const envV4Adapter = process.env.NEXT_PUBLIC_PERM_V4_ADAPTER_ADDRESS;
const envV3Adapter = process.env.NEXT_PUBLIC_PERM_V3_ADAPTER_ADDRESS;
export const PERM_ROUTER_ADDRESS = (envRouter || deployment.permRouter || undefined) as Address | undefined;
export const PERM_V4_ADAPTER_ADDRESS = (envV4Adapter || deployment.v4Adapter || undefined) as Address | undefined;
export const PERM_V3_ADAPTER_ADDRESS = (envV3Adapter || deployment.v3Adapter || undefined) as Address | undefined;
export const ROUTER_VERSION = Number(process.env.NEXT_PUBLIC_PERM_ROUTER_VERSION || deployment.routerVersion || 1);
export const DEPLOYMENT_BLOCK = deployment.deploymentBlock as number | null;
const manifestExecutionReady = (deployment as { executionReady?: boolean }).executionReady === true;
const explicitStagingReady = process.env.NEXT_PUBLIC_PERM_EXECUTION_READY === "1";
export const DEPLOYMENT_READY = Boolean(PERM_ROUTER_ADDRESS && PERM_V4_ADAPTER_ADDRESS && ROUTER_VERSION >= 2 && (manifestExecutionReady || explicitStagingReady));

export const SYNTHRA_V3 = {
  factory: deployment.venues.synthraV3.factory as Address,
  swapRouter02: deployment.venues.synthraV3.swapRouter02 as Address,
  quoterV2: deployment.venues.synthraV3.quoterV2 as Address,
  quoterShim: deployment.venues.synthraV3.quoterShim as Address,
  weth: deployment.venues.synthraV3.weth as Address,
} as const;

export function createRobinhoodPublicClient() {
  const primary = http(RH_TESTNET_RPC, {
    fetchOptions: { headers: { "user-agent": "Mozilla/5.0 Perm/2.0" } },
    retryCount: 2,
    timeout: 15_000,
  });
  const transport = RH_TESTNET_FALLBACK_RPC
    ? fallback([primary, http(RH_TESTNET_FALLBACK_RPC, { retryCount: 1, timeout: 15_000 })])
    : primary;
  return createPublicClient({ chain: robinhoodTestnet, transport });
}

let browserClient: ReturnType<typeof createRobinhoodPublicClient> | undefined;
export function getRobinhoodPublicClient() {
  browserClient ??= createRobinhoodPublicClient();
  return browserClient;
}
