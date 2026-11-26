import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { erc20Abi } from "./abis";

/**
 * Approval gate (ZGuard gap C8 "approve/Permit2 belum di-gate").
 *
 * The swap itself is checked by ZGuard (lib/zguard). The token authorization that precedes it is
 * checked here, locally and deterministically, before the wallet is asked for anything:
 *   - ERC-20 `approve`: only to the official PermRouter or the official Permit2, for EXACTLY the
 *     quoted input amount (never unlimited), on the configured chain, value 0. The calldata is
 *     built here, decoded back and re-checked, and those exact bytes are what the wallet signs.
 *   - Permit2 `PermitTransferFrom` signature: domain = Permit2 on this chain at the official
 *     address, spender = the official PermRouter, token/amount = the quoted input exactly,
 *     deadline in the future and at most MAX_PERMIT_LIFETIME_SECONDS away, random non-zero nonce.
 *     The typed data is frozen before signing and the returned signature must recover to the
 *     account (a wallet that signed something else is refused).
 * The gate is always on: it costs no ZGuard credit and PERM_ZGUARD_MODE=off does not disable it.
 */

export const MAX_PERMIT_LIFETIME_SECONDS = 15 * 60;
/** Permit2 stores allowances as uint160; anything above is "unlimited" in practice. */
export const MAX_APPROVAL_AMOUNT = (1n << 160n) - 1n;
const ZERO = "0x0000000000000000000000000000000000000000";

export class ApprovalPolicyError extends Error {
  constructor(message: string) {
    super(`Approval blocked: ${message}. Nothing was sent to your wallet.`);
    this.name = "ApprovalPolicyError";
  }
}

export type OfficialSpenders = { chainId: number; router: Address; permit2: Address };

function addr(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === ZERO) {
    throw new ApprovalPolicyError(`${label} is not a valid address`);
  }
  return getAddress(value);
}

/**
 * Spenders the gate accepts. On mainnet they must equal the reviewed manifest/env addresses, so a
 * stale or tampered deployment object cannot widen the allowlist. Testnet accepts the active
 * deployment (local browser deployments exist only in non-production testnet builds).
 */
export function resolveOfficialSpenders(input: {
  isMainnet: boolean;
  chainId: number;
  manifestRouter: Address | undefined;
  manifestPermit2: Address | undefined;
  deployment: { router?: Address; permit2?: Address };
}): OfficialSpenders {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new ApprovalPolicyError("invalid chain id");
  const router = addr(input.deployment.router, "PermRouter");
  const permit2 = addr(input.deployment.permit2, "Permit2");
  if (input.isMainnet) {
    if (router !== addr(input.manifestRouter, "manifest PermRouter")) throw new ApprovalPolicyError("PermRouter differs from the reviewed mainnet manifest");
    if (permit2 !== addr(input.manifestPermit2, "manifest Permit2")) throw new ApprovalPolicyError("Permit2 differs from the reviewed mainnet manifest");
  }
  if (router === permit2) throw new ApprovalPolicyError("PermRouter and Permit2 must be different contracts");
  return { chainId: input.chainId, router, permit2 };
}

function checkAmount(amount: unknown, expectedAmount: unknown): bigint {
  if (typeof amount !== "bigint" || typeof expectedAmount !== "bigint") throw new ApprovalPolicyError("amount must be an integer");
  if (amount <= 0n) throw new ApprovalPolicyError("amount must be greater than zero");
  if (amount !== expectedAmount) throw new ApprovalPolicyError("amount is not exactly the quoted input");
  if (amount > MAX_APPROVAL_AMOUNT) throw new ApprovalPolicyError("amount is unlimited or above the Permit2 range");
  return amount;
}

export type GuardedApprovalTx = Readonly<{ chainId: number; to: Address; data: Hex; value: 0n; spender: Address; amount: bigint }>;

/** Builds the only approve transaction Perm may send: exact amount, official spender. */
export function buildGuardedApproval(input: {
  official: OfficialSpenders;
  chainId: number;
  token: Address;
  spender: Address;
  amount: bigint;
  expectedAmount: bigint;
}): GuardedApprovalTx {
  if (input.chainId !== input.official.chainId) throw new ApprovalPolicyError("wallet chain differs from the Perm chain");
  const token = addr(input.token, "token");
  const spender = addr(input.spender, "spender");
  if (spender !== input.official.router && spender !== input.official.permit2) {
    throw new ApprovalPolicyError(`spender ${spender} is neither the official PermRouter nor Permit2`);
  }
  if (token === input.official.router || token === input.official.permit2) throw new ApprovalPolicyError("token cannot be a Perm contract");
  const amount = checkAmount(input.amount, input.expectedAmount);
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  const tx = Object.freeze({ chainId: input.chainId, to: token, data, value: 0n as const, spender, amount });
  assertGuardedApproval(tx, input.official, input.expectedAmount);
  return tx;
}

/** Decodes the bytes about to be signed and re-checks them (the bytes checked = the bytes sent). */
export function assertGuardedApproval(
  tx: { chainId: number; to: Address; data: Hex; value: bigint },
  official: OfficialSpenders,
  expectedAmount: bigint,
): void {
  if (tx.chainId !== official.chainId) throw new ApprovalPolicyError("wallet chain differs from the Perm chain");
  if (tx.value !== 0n) throw new ApprovalPolicyError("approve must not carry native value");
  addr(tx.to, "token");
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  } catch {
    throw new ApprovalPolicyError("calldata is not an ERC-20 call");
  }
  if (decoded.functionName !== "approve") throw new ApprovalPolicyError(`only approve is allowed, got ${decoded.functionName}`);
  const [spender, amount] = decoded.args as readonly [Address, bigint];
  if (getAddress(spender) !== official.router && getAddress(spender) !== official.permit2) {
    throw new ApprovalPolicyError(`spender ${spender} is neither the official PermRouter nor Permit2`);
  }
  checkAmount(amount, expectedAmount);
  if (encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [getAddress(spender), amount] }).toLowerCase() !== tx.data.toLowerCase()) {
    throw new ApprovalPolicyError("calldata has trailing or non-canonical bytes");
  }
}

export const PERMIT2_TRANSFER_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type GuardedPermit2TypedData = {
  readonly domain: { readonly name: "Permit2"; readonly chainId: number; readonly verifyingContract: Address };
  readonly types: typeof PERMIT2_TRANSFER_TYPES;
  readonly primaryType: "PermitTransferFrom";
  readonly message: {
    readonly permitted: { readonly token: Address; readonly amount: bigint };
    readonly spender: Address;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
};

/** Builds the only Permit2 signature Perm may request: one trade, exact amount, PermRouter as spender. */
export function buildGuardedPermit2(input: {
  official: OfficialSpenders;
  chainId: number;
  token: Address;
  amount: bigint;
  expectedAmount: bigint;
  nonce: bigint;
  deadline: bigint;
  nowSeconds: bigint;
}): GuardedPermit2TypedData {
  if (input.chainId !== input.official.chainId) throw new ApprovalPolicyError("wallet chain differs from the Perm chain");
  const token = addr(input.token, "token");
  if (token === input.official.router || token === input.official.permit2) throw new ApprovalPolicyError("token cannot be a Perm contract");
  const amount = checkAmount(input.amount, input.expectedAmount);
  if (typeof input.nonce !== "bigint" || input.nonce <= 0n || input.nonce >= 1n << 256n) throw new ApprovalPolicyError("Permit2 nonce must be a random non-zero uint256");
  if (typeof input.deadline !== "bigint" || typeof input.nowSeconds !== "bigint") throw new ApprovalPolicyError("Permit2 deadline must be an integer");
  if (input.deadline <= input.nowSeconds) throw new ApprovalPolicyError("Permit2 deadline is in the past");
  if (input.deadline - input.nowSeconds > BigInt(MAX_PERMIT_LIFETIME_SECONDS)) {
    throw new ApprovalPolicyError(`Permit2 deadline is more than ${MAX_PERMIT_LIFETIME_SECONDS / 60} minutes away`);
  }
  const typed: GuardedPermit2TypedData = {
    domain: Object.freeze({ name: "Permit2" as const, chainId: input.official.chainId, verifyingContract: input.official.permit2 }),
    types: PERMIT2_TRANSFER_TYPES,
    primaryType: "PermitTransferFrom",
    message: Object.freeze({
      permitted: Object.freeze({ token, amount }),
      spender: input.official.router,
      nonce: input.nonce,
      deadline: input.deadline,
    }),
  };
  return Object.freeze(typed);
}

/**
 * The wallet must have signed exactly the gated typed data for the trading account. EOAs are checked
 * by local ECDSA recovery. Contract accounts (EIP-1271 / EIP-7702 smart accounts) may pass only via
 * `verifyContractSignature` (e.g. viem publicClient.verifyTypedData over the SAME frozen data);
 * any error there also blocks.
 */
export async function assertPermit2Signature(
  typed: GuardedPermit2TypedData,
  signature: Hex,
  account: Address,
  verifyContractSignature?: (typed: GuardedPermit2TypedData, signature: Hex, account: Address) => Promise<boolean>,
): Promise<void> {
  const owner = addr(account, "account");
  if (typeof signature !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(signature)) throw new ApprovalPolicyError("wallet returned an invalid signature");
  let signer: Address | undefined;
  try {
    signer = await recoverTypedDataAddress({
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
      signature,
    });
  } catch {
    signer = undefined;
  }
  if (signer && getAddress(signer) === owner) return;
  if (verifyContractSignature) {
    let valid = false;
    try {
      valid = await verifyContractSignature(typed, signature, owner);
    } catch {
      valid = false;
    }
    if (valid) return;
  }
  throw new ApprovalPolicyError("wallet signed different Permit2 data or with another account");
}
