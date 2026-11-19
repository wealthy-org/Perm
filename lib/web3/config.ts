import { createPublicClient, defineChain, fallback, http, isAddress, type Address } from "viem";
import { ALLOWLISTED_STAGING_MODE } from "./execution-mode";
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
const deploymentBlockOverride = process.env.NEXT_PUBLIC_PERM_DEPLOYMENT_BLOCK;
if (deploymentBlockOverride && !/^\d+$/.test(deploymentBlockOverride)) throw new Error("NEXT_PUBLIC_PERM_DEPLOYMENT_BLOCK must be an integer");
export const DEPLOYMENT_BLOCK = deploymentBlockOverride ? Number(deploymentBlockOverride) : deployment.deploymentBlock as number | null;
if (DEPLOYMENT_BLOCK !== null && (!Number.isSafeInteger(DEPLOYMENT_BLOCK) || DEPLOYMENT_BLOCK < 0)) throw new Error("Deployment block is invalid");

export const ALLOWLISTED_STAGING_BUILD = process.env.NEXT_PUBLIC_PERM_EXECUTION_MODE === ALLOWLISTED_STAGING_MODE;
const stagingAddressesValid = Boolean(
  envRouter && isAddress(envRouter)
    && envV4Adapter && isAddress(envV4Adapter)
    && envV3Adapter && isAddress(envV3Adapter),
);

const manifestExecutionReady = (deployment as { executionReady?: boolean }).executionReady === true;
const manifestRouter = (deployment as { permRouter?: string | null }).permRouter || undefined;
const manifestV4Adapter = (deployment as { v4Adapter?: string | null }).v4Adapter || undefined;
const manifestV3Adapter = (deployment as { v3Adapter?: string | null }).v3Adapter || undefined;
const runtimeMatchesOfficialManifest = Boolean(
  manifestRouter && manifestV4Adapter && manifestV3Adapter
    && PERM_ROUTER_ADDRESS?.toLowerCase() === manifestRouter.toLowerCase()
    && PERM_V4_ADAPTER_ADDRESS?.toLowerCase() === manifestV4Adapter.toLowerCase()
    && PERM_V3_ADAPTER_ADDRESS?.toLowerCase() === manifestV3Adapter.toLowerCase()
    && ROUTER_VERSION === Number(deployment.routerVersion),
);
const officialReleaseDeploymentReady = Boolean(
  manifestExecutionReady && Number(deployment.routerVersion) >= 2 && runtimeMatchesOfficialManifest,
);
const fullReleaseCandidateOverride = Boolean(
  process.env.NEXT_PUBLIC_PERM_EXECUTION_READY === "1"
    && !ALLOWLISTED_STAGING_BUILD
    && stagingAddressesValid
    && ROUTER_VERSION >= 2
    && deploymentBlockOverride
    && DEPLOYMENT_BLOCK !== null,
);
// The candidate override only selects a reviewed Router-v2 runtime. Strict health still
// requires fallback RPC, indexer, shared limits, alerts, WalletConnect and remote custody.
export const RELEASE_DEPLOYMENT_READY = officialReleaseDeploymentReady || fullReleaseCandidateOverride;

export const STAGING_DEPLOYMENT_CONFIGURED = Boolean(
  ALLOWLISTED_STAGING_BUILD
    && stagingAddressesValid
    && ROUTER_VERSION >= 2
    && deploymentBlockOverride
    && DEPLOYMENT_BLOCK !== null,
);
export const STAGING_E2E_DECLARED = process.env.NEXT_PUBLIC_PERM_STAGING_E2E_PASSED === "1";
export const STAGING_DEPLOYMENT_READY = STAGING_DEPLOYMENT_CONFIGURED && STAGING_E2E_DECLARED;
export const DEPLOYMENT_READY = RELEASE_DEPLOYMENT_READY || STAGING_DEPLOYMENT_READY;
export const DEPLOYMENT_MODE = RELEASE_DEPLOYMENT_READY
  ? "release"
  : STAGING_DEPLOYMENT_CONFIGURED
    ? "allowlisted-staging"
    : "read-only";

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
