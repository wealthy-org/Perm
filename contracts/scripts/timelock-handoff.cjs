// Safe → PermTimelock ownership handoff (Router + adapters), testnet rehearsal first, then mainnet.
//
//   ACTION=status    read-only: owners, pending owners, timelock roles, operation state      (no key)
//   ACTION=deploy    deploy PermTimelock(delay, [Safe], [anyone], admin 0) and record it in the manifest
//   ACTION=plan      write the Safe Transaction Builder files:
//                      deployments/timelock/<chainId>-1-schedule.safe.json
//                        (transferOwnership(timelock) for every contract the Safe owns + scheduleBatch)
//                      deployments/timelock/<chainId>-2-execute.safe.json  (executeBatch, after the delay)
//   ACTION=transfer  only when the current owner is an EOA (testnet): transferOwnership(timelock) from it
//   ACTION=execute   anyone, once the operation is ready: executeBatch from the configured key
//   ACTION=verify    asserts the final state; exit code 1 on any failure (WRITE_MANIFEST=1 records it)
//
// Env: MANIFEST (default by chain), SAFE_ADDRESS (default the ZGuard Ops Safe), PAUSE_GUARDIAN_ADDRESS
// (used when the Router has no pauseGuardian(), e.g. Router v1 on testnet), TIMELOCK_DELAY_SECONDS
// (mainnet: always 172800; testnet rehearsal default 600). Mainnet broadcasts need CONFIRM_MAINNET=1.
//
//   npx hardhat run contracts/scripts/timelock-handoff.cjs --network robinhoodTestnet
//   npx hardhat run contracts/scripts/timelock-handoff.cjs --network robinhoodMainnet
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("node:fs");
const path = require("node:path");
const {
  MAINNET_MIN_DELAY,
  PROPOSER_ROLE,
  EXECUTOR_ROLE,
  CANCELLER_ROLE,
  DEFAULT_ADMIN_ROLE,
  buildHandoff,
  safeTxBuilderJson,
} = require("./lib/timelock-handoff.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_SAFE = "0xad5501954A52792280D868F7e613Efcc4F80fa6c";
const MANIFEST_BY_CHAIN = { 4663: "deployments/robinhood-mainnet.json", 46630: "deployments/robinhood-testnet.json" };
const OWNED_KEYS = ["permRouter", "v4Adapter", "v3Adapter", "v2Adapter"];

function addr(label, value) {
  if (!value || !ethers.isAddress(value)) throw new Error(`${label} must be an address`);
  return ethers.getAddress(value);
}

async function main() {
  const action = process.env.ACTION || "status";
  // Forked rehearsals (`--network hardhat` with RUN_FORK_TESTS / RUN_MAINNET_FORK_TESTS): execute on a local block.
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") await ethers.provider.send("evm_mine", []);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isMainnet = chainId === 4663;
  const manifestRel = process.env.MANIFEST || MANIFEST_BY_CHAIN[chainId];
  if (!manifestRel) throw new Error(`No manifest for chain ${chainId}; set MANIFEST`);
  const manifestPath = path.resolve(ROOT, manifestRel);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (Number(manifest.chainId) !== chainId) throw new Error(`Manifest is chain ${manifest.chainId}, connected to ${chainId}`);

  const safe = addr("SAFE_ADDRESS", process.env.SAFE_ADDRESS || DEFAULT_SAFE);
  if ((await ethers.provider.getCode(safe)) === "0x") throw new Error(`Safe ${safe} has no code on chain ${chainId}`);
  const owned = OWNED_KEYS.filter((k) => manifest[k]).map((k) => ({ key: k, address: ethers.getAddress(manifest[k]) }));
  const ownable = (a) => ethers.getContractAt(["function owner() view returns (address)", "function pendingOwner() view returns (address)"], a);
  const router = await ethers.getContractAt(
    ["function pauseGuardian() view returns (address)", "function paused() view returns (bool)"],
    manifest.permRouter,
  );
  let guardian = await router.pauseGuardian().catch(() => null);
  const routerHasGuardian = Boolean(guardian);
  guardian = addr("pause guardian", guardian || process.env.PAUSE_GUARDIAN_ADDRESS || manifest.timelockHandoff?.guardian || manifest.pauseGuardian || manifest.roles?.pauseGuardian);

  let delay;
  if (isMainnet) {
    if (process.env.TIMELOCK_DELAY_SECONDS && Number(process.env.TIMELOCK_DELAY_SECONDS) !== MAINNET_MIN_DELAY) {
      throw new Error(`Mainnet delay is fixed at ${MAINNET_MIN_DELAY}s (48h)`);
    }
    delay = MAINNET_MIN_DELAY;
  } else {
    delay = Number(process.env.TIMELOCK_DELAY_SECONDS || 600);
    if (!Number.isInteger(delay) || delay < 60) throw new Error("TIMELOCK_DELAY_SECONDS must be an integer ≥ 60");
  }

  const signers = await ethers.getSigners();
  const signer = signers[0];
  const needsKey = ["deploy", "transfer", "execute"].includes(action);
  if (needsKey && !signer) throw new Error(`ACTION=${action} needs ${isMainnet ? "MAINNET_DEPLOYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY"}`);
  if (needsKey && isMainnet && process.env.CONFIRM_MAINNET !== "1") throw new Error("Mainnet broadcast needs CONFIRM_MAINNET=1");

  // Until ACTION=verify passes, the timelock lives only under `timelockHandoff`: scripts/monitor.cjs requires
  // manifest.owner === manifest.timelock as soon as `timelock` is set, which is only true after the handoff.
  const recordTimelock = (timelockAddress, status, extra = {}) => {
    manifest.timelockHandoff = {
      ...(manifest.timelockHandoff || {}),
      timelock: timelockAddress,
      delaySeconds: delay,
      safe,
      guardian,
      status,
      ...extra,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  };

  if (action === "deploy") {
    const existing = manifest.timelock || manifest.timelockHandoff?.timelock;
    if (existing) throw new Error(`Manifest already has timelock ${existing}; remove it to deploy a new one`);
    console.log(`Deploying PermTimelock on ${chainId}: delay ${delay}s, proposer ${safe}, executor anyone, admin none, from ${signer.address}`);
    const Timelock = await ethers.getContractFactory("PermTimelock", signer);
    const timelock = await Timelock.deploy(delay, [safe], [ethers.ZeroAddress], ethers.ZeroAddress);
    const receipt = await timelock.deploymentTransaction().wait();
    const address = await timelock.getAddress();
    recordTimelock(address, "deployed", { deployTx: receipt.hash, deployer: signer.address });
    console.log(`PermTimelock ${address} · tx ${receipt.hash} · manifest ${manifestRel} updated`);
    console.log("Next: ACTION=plan");
    return;
  }

  const timelockAddress = addr("timelock (run ACTION=deploy first)", manifest.timelock || manifest.timelockHandoff?.timelock);
  const timelock = await ethers.getContractAt("PermTimelock", timelockAddress);
  const onchainDelay = Number(await timelock.getMinDelay());
  const plan = buildHandoff({ chainId, timelock: timelockAddress, guardian, owned: owned.map((o) => o.address), delay: onchainDelay });
  const owners = await Promise.all(owned.map(async (o) => {
    const c = await ownable(o.address);
    return { ...o, owner: ethers.getAddress(await c.owner()), pending: ethers.getAddress(await c.pendingOwner()) };
  }));
  const opState = async () => {
    if (await timelock.isOperationDone(plan.operationId)) return "done";
    if (await timelock.isOperationReady(plan.operationId)) return "ready";
    if (await timelock.isOperationPending(plan.operationId)) {
      const ts = Number(await timelock.getTimestamp(plan.operationId));
      return `pending until ${new Date(ts * 1000).toISOString()}`;
    }
    return "not scheduled";
  };

  if (action === "status") {
    console.log(`chain ${chainId} · manifest ${manifestRel}`);
    console.log(`timelock ${timelockAddress} · minDelay ${onchainDelay}s · Safe ${safe} · guardian ${guardian}${routerHasGuardian ? " (router.pauseGuardian)" : " (env/manifest; Router has no pauseGuardian())"}`);
    for (const o of owners) console.log(`  ${o.key.padEnd(10)} ${o.address} owner ${o.owner} pending ${o.pending}`);
    console.log(`handoff operation ${plan.operationId}: ${await opState()}`);
    return;
  }

  if (action === "plan") {
    if (onchainDelay !== delay) throw new Error(`Timelock minDelay ${onchainDelay}s != expected ${delay}s`);
    const safeOwned = owners.filter((o) => o.owner === safe);
    const eoaOwned = owners.filter((o) => o.owner !== safe && o.owner !== timelockAddress && o.pending !== timelockAddress);
    const transferCalls = plan.transferCalls.filter((c) => safeOwned.some((o) => o.address === c.to && o.pending !== timelockAddress));
    const dir = path.join(ROOT, "deployments", "timelock");
    fs.mkdirSync(dir, { recursive: true });
    const scheduleFile = path.join(dir, `${chainId}-1-schedule.safe.json`);
    const executeFile = path.join(dir, `${chainId}-2-execute.safe.json`);
    fs.writeFileSync(scheduleFile, `${JSON.stringify(safeTxBuilderJson({
      chainId, safe,
      name: "Perm → PermTimelock handoff (1/2: transfer + schedule)",
      description: `transferOwnership(${timelockAddress}) for ${transferCalls.length} Safe-owned contract(s), then scheduleBatch(acceptOwnership ×${owned.length} + grantRole(CANCELLER, ${guardian})) with delay ${onchainDelay}s. Operation ${plan.operationId}`,
      calls: [...transferCalls, plan.scheduleCall],
    }), null, 2)}\n`);
    fs.writeFileSync(executeFile, `${JSON.stringify(safeTxBuilderJson({
      chainId, safe,
      name: "Perm → PermTimelock handoff (2/2: execute)",
      description: `executeBatch for operation ${plan.operationId} (only after ${onchainDelay}s). Anyone may execute; this file lets the Safe do it.`,
      calls: [plan.executeCall],
    }), null, 2)}\n`);
    console.log(`operation ${plan.operationId}`);
    console.log(`Safe file 1: ${path.relative(ROOT, scheduleFile)}  (${transferCalls.length} transfer + 1 schedule)`);
    console.log(`Safe file 2: ${path.relative(ROOT, executeFile)}`);
    if (eoaOwned.length) console.log(`Not Safe-owned (send ACTION=transfer from the owner first): ${eoaOwned.map((o) => `${o.key}=${o.owner}`).join(", ")}`);
    recordTimelock(timelockAddress, "planned");
    return;
  }

  if (action === "transfer") {
    for (const o of owners) {
      if (o.pending === timelockAddress || o.owner === timelockAddress) { console.log(`${o.key}: already handed to the timelock`); continue; }
      if (o.owner !== signer.address) throw new Error(`${o.key} owner is ${o.owner}, not the signer ${signer.address}; the Safe transfers it (ACTION=plan)`);
      const c = await ethers.getContractAt(["function transferOwnership(address)"], o.address, signer);
      const tx = await c.transferOwnership(timelockAddress);
      await tx.wait();
      console.log(`${o.key}: transferOwnership(${timelockAddress}) tx ${tx.hash}`);
    }
    return;
  }

  if (action === "execute") {
    const state = await opState();
    if (state !== "ready") throw new Error(`Operation ${plan.operationId} is ${state}`);
    for (const o of owners) if (o.pending !== timelockAddress) throw new Error(`${o.key} pendingOwner is ${o.pending}, not the timelock`);
    const tx = await signer.sendTransaction({ to: plan.executeCall.to, data: plan.executeCall.data, value: 0n });
    const receipt = await tx.wait();
    console.log(`executeBatch tx ${receipt.hash} (block ${receipt.blockNumber})`);
    recordTimelock(timelockAddress, "executed", { executeTx: receipt.hash });
    return;
  }

  if (action === "verify") {
    const results = [];
    const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
    check("timelock minDelay", onchainDelay === delay && (!isMainnet || onchainDelay >= MAINNET_MIN_DELAY), `${onchainDelay}s`);
    check("handoff operation done", (await opState()) === "done", plan.operationId);
    for (const o of owners) {
      check(`${o.key} owner = timelock`, o.owner === timelockAddress, o.owner);
      check(`${o.key} pendingOwner = 0`, o.pending === ethers.ZeroAddress, o.pending);
    }
    check("Safe is PROPOSER", await timelock.hasRole(PROPOSER_ROLE, safe), safe);
    check("Safe is CANCELLER", await timelock.hasRole(CANCELLER_ROLE, safe), safe);
    check("guardian is CANCELLER", await timelock.hasRole(CANCELLER_ROLE, guardian), guardian);
    check("guardian is not PROPOSER", !(await timelock.hasRole(PROPOSER_ROLE, guardian)), guardian);
    check("open EXECUTOR (address 0)", await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress), "liveness");
    check("timelock self-administered", await timelock.hasRole(DEFAULT_ADMIN_ROLE, timelockAddress), timelockAddress);
    const deployer = manifest.timelockHandoff?.deployer || (signer && signer.address);
    for (const who of [safe, guardian, deployer].filter(Boolean)) {
      check(`no admin role for ${who}`, !(await timelock.hasRole(DEFAULT_ADMIN_ROLE, who)), who);
    }
    if (routerHasGuardian) check("router pauseGuardian unchanged", ethers.getAddress(await router.pauseGuardian()) === guardian, guardian);
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail ?? ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`${results.length - failed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
    else if (process.env.WRITE_MANIFEST === "1") {
      manifest.owner = timelockAddress;
      manifest.timelock = timelockAddress;
      manifest.timelockDelaySeconds = onchainDelay;
      if (manifest.roles) {
        manifest.roles.owner = timelockAddress;
        manifest.roles.timelock = timelockAddress;
      }
      manifest.ownershipStatus = "accepted";
      recordTimelock(timelockAddress, "verified");
      console.log(`manifest ${manifestRel}: owner = timelock = ${timelockAddress}, delay ${onchainDelay}s`);
    }
    return;
  }

  throw new Error(`Unknown ACTION=${action}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
