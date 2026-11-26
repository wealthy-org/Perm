// Pure builders for the Safe → PermTimelock ownership handoff (no network access; shared by
// contracts/scripts/timelock-handoff.cjs and contracts/test/PermTimelockHandoff.test.cjs).
//
// Final governance after the handoff:
//   PermRouter / adapters  owner        = PermTimelock (Ownable2Step, accepted by the timelock itself)
//   PermTimelock           PROPOSER     = Safe (2-of-3)          → every owner action waits minDelay
//                          CANCELLER    = Safe + pause guardian  → a queued action can be vetoed
//                          EXECUTOR     = anyone (address(0))    → liveness: a ready op cannot be held hostage
//                          ADMIN        = the timelock only (constructor admin = address(0))
//   PermRouter             pauseGuardian = EOA, pause() is instant; unpause() needs the owner = timelock
const { ethers } = require("ethers");

const MAINNET_MIN_DELAY = 172_800; // 48 hours
const PROPOSER_ROLE = ethers.id("PROPOSER_ROLE");
const EXECUTOR_ROLE = ethers.id("EXECUTOR_ROLE");
const CANCELLER_ROLE = ethers.id("CANCELLER_ROLE");
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

const OWNABLE = new ethers.Interface([
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
]);
const TIMELOCK = new ethers.Interface([
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) payable",
  "function cancel(bytes32 id)",
  "function grantRole(bytes32 role, address account)",
  "function hashOperationBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) pure returns (bytes32)",
]);

function handoffSalt(chainId) {
  return ethers.id(`PERM_TIMELOCK_HANDOFF_V1:${chainId}`);
}

/** Same id as TimelockController.hashOperationBatch. */
function operationIdBatch(targets, values, payloads, predecessor, salt) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
      [targets, values, payloads, predecessor, salt],
    ),
  );
}

/**
 * @param {{ chainId: number|bigint, timelock: string, guardian: string, owned: string[], delay: number|bigint }} p
 * @returns transfer calls (sent by the current owner), the scheduleBatch call (sent by the Safe),
 *          the executeBatch call (anyone, after the delay) and the operation id.
 */
function buildHandoff(p) {
  const timelock = ethers.getAddress(p.timelock);
  const guardian = ethers.getAddress(p.guardian);
  const owned = p.owned.map((a) => ethers.getAddress(a));
  if (owned.length === 0) throw new Error("no owned contracts");
  if (new Set(owned).size !== owned.length) throw new Error("duplicate owned contract");
  const delay = BigInt(p.delay);
  if (delay <= 0n) throw new Error("delay must be positive");

  const targets = [...owned, timelock];
  const values = targets.map(() => 0n);
  const payloads = [
    ...owned.map(() => OWNABLE.encodeFunctionData("acceptOwnership")),
    TIMELOCK.encodeFunctionData("grantRole", [CANCELLER_ROLE, guardian]),
  ];
  const predecessor = ethers.ZeroHash;
  const salt = handoffSalt(p.chainId);
  const operationId = operationIdBatch(targets, values, payloads, predecessor, salt);

  return {
    timelock,
    guardian,
    owned,
    delay,
    batch: { targets, values, payloads, predecessor, salt },
    operationId,
    transferCalls: owned.map((to) => ({ to, value: 0n, data: OWNABLE.encodeFunctionData("transferOwnership", [timelock]) })),
    scheduleCall: {
      to: timelock,
      value: 0n,
      data: TIMELOCK.encodeFunctionData("scheduleBatch", [targets, values, payloads, predecessor, salt, delay]),
    },
    executeCall: {
      to: timelock,
      value: 0n,
      data: TIMELOCK.encodeFunctionData("executeBatch", [targets, values, payloads, predecessor, salt]),
    },
    cancelCall: { to: timelock, value: 0n, data: TIMELOCK.encodeFunctionData("cancel", [operationId]) },
  };
}

/** Safe{Wallet} Transaction Builder import file (raw calls; executed atomically through MultiSend). */
function safeTxBuilderJson({ chainId, safe, name, description, calls, createdAt = Date.now() }) {
  return {
    version: "1.0",
    chainId: String(chainId),
    createdAt,
    meta: {
      name,
      description,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: ethers.getAddress(safe),
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: calls.map((c) => ({
      to: ethers.getAddress(c.to),
      value: String(c.value ?? 0n),
      data: c.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
}

module.exports = {
  MAINNET_MIN_DELAY,
  PROPOSER_ROLE,
  EXECUTOR_ROLE,
  CANCELLER_ROLE,
  DEFAULT_ADMIN_ROLE,
  OWNABLE,
  TIMELOCK,
  handoffSalt,
  operationIdBatch,
  buildHandoff,
  safeTxBuilderJson,
};
