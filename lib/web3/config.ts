import { createPublicClient, defineChain, http, type Address } from "viem";
import deployment from "@/deployments/robinhood-testnet.json";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const RH_TESTNET_CHAIN_ID = 46_630;
export const RH_TESTNET_RPC = process.env.RH_TESTNET_RPC_URL || deployment.rpcUrl;
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

const envRouter = process.env.NEXT_PUBLIC_PERM_ROUTER_ADDRESS;
const envAdapter = process.env.NEXT_PUBLIC_PERM_V4_ADAPTER_ADDRESS;
export const PERM_ROUTER_ADDRESS = (envRouter || deployment.permRouter || undefined) as Address | undefined;
export const PERM_V4_ADAPTER_ADDRESS = (envAdapter || deployment.v4Adapter || undefined) as Address | undefined;
export const DEPLOYMENT_BLOCK = deployment.deploymentBlock as number | null;
export const DEPLOYMENT_READY = Boolean(PERM_ROUTER_ADDRESS && PERM_V4_ADAPTER_ADDRESS);

export function createRobinhoodPublicClient() {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(RH_TESTNET_RPC, {
      fetchOptions: { headers: { "user-agent": "Mozilla/5.0 Perm/1.0" } },
      retryCount: 2,
      timeout: 15_000,
    }),
  });
}

let browserClient: ReturnType<typeof createRobinhoodPublicClient> | undefined;
export function getRobinhoodPublicClient() {
  browserClient ??= createRobinhoodPublicClient();
  return browserClient;
}
