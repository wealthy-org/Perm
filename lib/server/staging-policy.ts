import { getAddress, isAddress, isHash, type Address, type Hex } from "viem";
import { ALLOWLISTED_STAGING_MODE, ROBINHOOD_TESTNET_CHAIN_ID } from "@/lib/web3/execution-mode";

export { ALLOWLISTED_STAGING_MODE, ROBINHOOD_TESTNET_CHAIN_ID };
const MAX_ALLOWLIST_ENTRIES = 64;
const MAX_ALLOWLIST_BYTES = 8_192;

type Environment = Record<string, string | undefined>;

export type AllowlistedStagingConfiguration = {
  requested: boolean;
  serverModeConfigured: boolean;
  publicModeConfigured: boolean;
  chainId: number | null;
  chainPinned: boolean;
  allowlist: readonly Address[];
  allowlistConfigured: boolean;
  localBurnerSignerAllowed: boolean;
  e2eTransactionHash: Hex | null;
  e2eDeclared: boolean;
  configured: boolean;
  reason?: string;
};

function parseAllowlist(raw: string | undefined): { addresses: Address[]; error?: string } {
  if (!raw) return { addresses: [] as Address[], error: "PERM_STAGING_WALLET_ALLOWLIST is empty" };
  if (raw.length > MAX_ALLOWLIST_BYTES) return { addresses: [] as Address[], error: "PERM_STAGING_WALLET_ALLOWLIST is too large" };
  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) return { addresses: [] as Address[], error: "PERM_STAGING_WALLET_ALLOWLIST is empty" };
  if (entries.length > MAX_ALLOWLIST_ENTRIES) return { addresses: [] as Address[], error: `PERM_STAGING_WALLET_ALLOWLIST may contain at most ${MAX_ALLOWLIST_ENTRIES} wallets` };
  if (entries.some((entry) => !isAddress(entry) || /^0x0{40}$/i.test(entry))) {
    return { addresses: [] as Address[], error: "PERM_STAGING_WALLET_ALLOWLIST contains an invalid or zero address" };
  }
  const addresses = [...new Map(entries.map((entry) => {
    const address = getAddress(entry);
    return [address.toLowerCase(), address] as const;
  })).values()];
  return { addresses };
}

export function allowlistedStagingConfiguration(
  environment: Environment = process.env,
): AllowlistedStagingConfiguration {
  const serverModeConfigured = environment.PERM_EXECUTION_MODE === ALLOWLISTED_STAGING_MODE;
  const publicModeConfigured = environment.NEXT_PUBLIC_PERM_EXECUTION_MODE === ALLOWLISTED_STAGING_MODE;
  const requested = serverModeConfigured || publicModeConfigured;
  const rawChainId = environment.PERM_STAGING_CHAIN_ID;
  const chainId = rawChainId && /^\d+$/.test(rawChainId) ? Number(rawChainId) : null;
  const chainPinned = chainId === ROBINHOOD_TESTNET_CHAIN_ID;
  const parsed = parseAllowlist(environment.PERM_STAGING_WALLET_ALLOWLIST);
  const allowlistConfigured = parsed.addresses.length > 0 && !parsed.error;
  const localBurnerSignerAllowed = environment.PERM_STAGING_ALLOW_BURNER_SIGNER === "1";
  const rawE2eHash = environment.PERM_STAGING_E2E_TX_HASH;
  const e2eTransactionHash = rawE2eHash && isHash(rawE2eHash) ? rawE2eHash : null;
  const e2eDeclared = environment.NEXT_PUBLIC_PERM_STAGING_E2E_PASSED === "1" && Boolean(e2eTransactionHash);

  let reason: string | undefined;
  if (!serverModeConfigured) reason = `PERM_EXECUTION_MODE must equal ${ALLOWLISTED_STAGING_MODE}`;
  else if (!publicModeConfigured) reason = `NEXT_PUBLIC_PERM_EXECUTION_MODE must equal ${ALLOWLISTED_STAGING_MODE}`;
  else if (!chainPinned) reason = `PERM_STAGING_CHAIN_ID must equal ${ROBINHOOD_TESTNET_CHAIN_ID}`;
  else if (parsed.error) reason = parsed.error;

  return {
    requested,
    serverModeConfigured,
    publicModeConfigured,
    chainId,
    chainPinned,
    allowlist: parsed.addresses,
    allowlistConfigured,
    localBurnerSignerAllowed,
    e2eTransactionHash,
    e2eDeclared,
    configured: !reason,
    reason,
  };
}

export function isAllowlistedStagingWallet(
  account: string,
  configuration: AllowlistedStagingConfiguration = allowlistedStagingConfiguration(),
) {
  if (!configuration.configured || !isAddress(account)) return false;
  const normalized = getAddress(account).toLowerCase();
  return configuration.allowlist.some((entry) => entry.toLowerCase() === normalized);
}
