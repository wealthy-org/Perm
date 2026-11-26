import assert from "node:assert/strict";
import { concat, encodeFunctionData, maxUint256, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi } from "../lib/web3/abis";
import {
  ApprovalPolicyError,
  MAX_PERMIT_LIFETIME_SECONDS,
  assertGuardedApproval,
  assertPermit2Signature,
  buildGuardedApproval,
  buildGuardedPermit2,
  resolveOfficialSpenders,
} from "../lib/web3/approval-gate";

// ZGuard gap C8 "approve/Permit2 belum di-gate": every token authorization Perm asks the wallet for
// is exact-amount and bound to the official PermRouter / Permit2. Runs offline.

const ROUTER = "0x155bc06240dE046112e86C63a35f8b954AF32Ea2" as Address; // mainnet PermRouter
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ATTACKER = "0x000000000000000000000000000000000000bEEF" as Address;
const AMOUNT = 1_234_567n;

const blocked = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof ApprovalPolicyError && pattern.test((error as Error).message));
const blockedAsync = (promise: Promise<unknown>, pattern: RegExp) =>
  assert.rejects(promise, (error: unknown) => error instanceof ApprovalPolicyError && pattern.test((error as Error).message));

async function main() {
  // 1. Allowlist resolution: mainnet must equal the reviewed manifest.
  const official = resolveOfficialSpenders({
    isMainnet: true, chainId: 4663, manifestRouter: ROUTER, manifestPermit2: PERMIT2, deployment: { router: ROUTER, permit2: PERMIT2 },
  });
  assert.deepEqual(official, { chainId: 4663, router: ROUTER, permit2: PERMIT2 });
  blocked(() => resolveOfficialSpenders({ isMainnet: true, chainId: 4663, manifestRouter: ROUTER, manifestPermit2: PERMIT2, deployment: { router: ATTACKER, permit2: PERMIT2 } }), /PermRouter differs/);
  blocked(() => resolveOfficialSpenders({ isMainnet: true, chainId: 4663, manifestRouter: ROUTER, manifestPermit2: PERMIT2, deployment: { router: ROUTER, permit2: ATTACKER } }), /Permit2 differs/);
  blocked(() => resolveOfficialSpenders({ isMainnet: false, chainId: 46630, manifestRouter: undefined, manifestPermit2: PERMIT2, deployment: { router: undefined, permit2: PERMIT2 } }), /PermRouter is not a valid/);
  blocked(() => resolveOfficialSpenders({ isMainnet: false, chainId: 46630, manifestRouter: ROUTER, manifestPermit2: PERMIT2, deployment: { router: PERMIT2, permit2: PERMIT2 } }), /different contracts/);
  // Testnet accepts the active (e.g. local browser) deployment.
  assert.equal(resolveOfficialSpenders({ isMainnet: false, chainId: 46630, manifestRouter: ROUTER, manifestPermit2: PERMIT2, deployment: { router: ATTACKER, permit2: PERMIT2 } }).router, ATTACKER);

  // 2. ERC-20 approve: exact amount, official spender only.
  const base = { official, chainId: 4663, token: USDG, spender: ROUTER, amount: AMOUNT, expectedAmount: AMOUNT };
  const tx = buildGuardedApproval(base);
  assert.equal(tx.to, USDG);
  assert.equal(tx.value, 0n);
  assert.equal(tx.data, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER, AMOUNT] }));
  assert.ok(Object.isFrozen(tx));
  assert.equal(buildGuardedApproval({ ...base, spender: PERMIT2 }).spender, PERMIT2);

  blocked(() => buildGuardedApproval({ ...base, spender: ATTACKER }), /neither the official/);
  blocked(() => buildGuardedApproval({ ...base, amount: maxUint256, expectedAmount: maxUint256 }), /unlimited/);
  blocked(() => buildGuardedApproval({ ...base, amount: AMOUNT + 1n }), /not exactly the quoted input/);
  blocked(() => buildGuardedApproval({ ...base, amount: 0n, expectedAmount: 0n }), /greater than zero/);
  blocked(() => buildGuardedApproval({ ...base, chainId: 46630 }), /chain differs/);
  blocked(() => buildGuardedApproval({ ...base, token: ROUTER }), /Perm contract/);
  blocked(() => buildGuardedApproval({ ...base, token: "0x0000000000000000000000000000000000000000" as Address }), /token is not a valid/);

  // Bytes about to be sent are decoded and re-checked.
  const send = { chainId: 4663, to: USDG, data: tx.data, value: 0n };
  assertGuardedApproval(send, official, AMOUNT);
  blocked(() => assertGuardedApproval({ ...send, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ATTACKER, AMOUNT] }) }, official, AMOUNT), /neither the official/);
  blocked(() => assertGuardedApproval({ ...send, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER, maxUint256] }) }, official, AMOUNT), /not exactly|unlimited/);
  const extraAbi = parseAbi(["function transfer(address,uint256)", "function increaseAllowance(address,uint256)", "function transferFrom(address,address,uint256)"]);
  for (const [functionName, args] of [["transfer", [ATTACKER, AMOUNT]], ["increaseAllowance", [ROUTER, AMOUNT]], ["transferFrom", [ATTACKER, ROUTER, AMOUNT]]] as const) {
    const data = encodeFunctionData({ abi: extraAbi, functionName, args } as never) as Hex;
    blocked(() => assertGuardedApproval({ ...send, data }, official, AMOUNT), /only approve|not an ERC-20/);
  }
  blocked(() => assertGuardedApproval({ ...send, data: concat([tx.data, "0xdeadbeef"]) }, official, AMOUNT), /trailing|non-canonical|not an ERC-20/);
  blocked(() => assertGuardedApproval({ ...send, data: "0x095ea7b3" as Hex }, official, AMOUNT), /not an ERC-20/);
  blocked(() => assertGuardedApproval({ ...send, value: 1n }, official, AMOUNT), /native value/);
  blocked(() => assertGuardedApproval({ ...send, chainId: 1 }, official, AMOUNT), /chain differs/);

  // 3. Permit2 signature transfer: exact, PermRouter spender, short deadline, real nonce.
  const now = 1_800_000_000n;
  const permitBase = { official, chainId: 4663, token: USDG, amount: AMOUNT, expectedAmount: AMOUNT, nonce: 0xabcdefn, deadline: now + 90n, nowSeconds: now };
  const typed = buildGuardedPermit2(permitBase);
  assert.deepEqual(typed.domain, { name: "Permit2", chainId: 4663, verifyingContract: PERMIT2 });
  assert.equal(typed.message.spender, ROUTER);
  assert.deepEqual(typed.message.permitted, { token: USDG, amount: AMOUNT });
  assert.ok(Object.isFrozen(typed) && Object.isFrozen(typed.message) && Object.isFrozen(typed.message.permitted) && Object.isFrozen(typed.domain));
  assert.throws(() => { (typed.message as { spender: Address }).spender = ATTACKER; }, TypeError, "typed data cannot be changed after the gate");

  blocked(() => buildGuardedPermit2({ ...permitBase, amount: AMOUNT * 2n }), /not exactly the quoted input/);
  blocked(() => buildGuardedPermit2({ ...permitBase, amount: maxUint256, expectedAmount: maxUint256 }), /unlimited/);
  blocked(() => buildGuardedPermit2({ ...permitBase, deadline: now }), /in the past/);
  blocked(() => buildGuardedPermit2({ ...permitBase, deadline: now + BigInt(MAX_PERMIT_LIFETIME_SECONDS) + 1n }), /minutes away/);
  assert.equal(buildGuardedPermit2({ ...permitBase, deadline: now + BigInt(MAX_PERMIT_LIFETIME_SECONDS) }).message.deadline, now + 900n);
  blocked(() => buildGuardedPermit2({ ...permitBase, nonce: 0n }), /nonce/);
  blocked(() => buildGuardedPermit2({ ...permitBase, chainId: 1 }), /chain differs/);
  blocked(() => buildGuardedPermit2({ ...permitBase, token: PERMIT2 }), /Perm contract/);

  // Signature must recover to the account over exactly the gated data.
  const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const sign = (account: typeof owner, data = typed) => account.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message });
  const good = await sign(owner);
  await assertPermit2Signature(typed, good, owner.address);
  await blockedAsync(assertPermit2Signature(typed, await sign(other), owner.address), /different Permit2 data/);
  const bigger = buildGuardedPermit2({ ...permitBase, amount: AMOUNT + 1n, expectedAmount: AMOUNT + 1n });
  await blockedAsync(assertPermit2Signature(typed, await sign(owner, bigger), owner.address), /different Permit2 data/);
  await blockedAsync(assertPermit2Signature(typed, "0x" as Hex, owner.address), /invalid signature/);

  // Contract accounts (EIP-1271 / 7702) pass only through the onchain verifier over the same data.
  let seen: unknown;
  await assertPermit2Signature(typed, `0x${"00".repeat(65)}` as Hex, ATTACKER, async (data, _sig, account) => { seen = { data, account }; return true; });
  assert.deepEqual(seen, { data: typed, account: ATTACKER });
  await blockedAsync(assertPermit2Signature(typed, `0x${"00".repeat(65)}` as Hex, ATTACKER, async () => false), /different Permit2 data/);
  await blockedAsync(assertPermit2Signature(typed, `0x${"00".repeat(65)}` as Hex, ATTACKER, async () => { throw new Error("rpc down"); }), /different Permit2 data/);

  console.log("approval gate: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
