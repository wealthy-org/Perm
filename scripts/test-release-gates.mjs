import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const officialPath = path.join(root, "deployments/robinhood-testnet.json");
const hash = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const temp = await mkdtemp(path.join(os.tmpdir(), "perm-release-gates-"));

try {
  const timelock = `0x${"10".repeat(20)}`;
  const router = `0x${"11".repeat(20)}`;
  const candidatePath = path.join(temp, "candidate.json");
  await writeFile(candidatePath, JSON.stringify({
    schemaVersion: 2,
    routerVersion: 2,
    chainId: 46630,
    releaseStatus: "candidate",
    postDeploymentChecks: "passed",
    sourceVerification: "verified",
    ownershipStatus: "accepted",
    currentOwner: timelock,
    owner: timelock,
    timelock,
    timelockDelaySeconds: 60,
    permRouter: router,
    v4Adapter: `0x${"12".repeat(20)}`,
    v3Adapter: `0x${"13".repeat(20)}`,
    quoteSigner: `0x${"14".repeat(20)}`,
    treasury: `0x${"15".repeat(20)}`,
    pauseGuardian: `0x${"16".repeat(20)}`,
    permit2: `0x${"17".repeat(20)}`,
  }));

  const before = await hash(officialPath);
  const promotion = spawnSync(process.execPath, [path.join(root, "scripts/promote-deployment.cjs")], {
    cwd: root,
    env: {
      ...process.env,
      CANDIDATE_MANIFEST: candidatePath,
      CONFIRM_PROMOTION: "ROBINHOOD_TESTNET_V2",
      CONFIRM_ROUTER_ADDRESS: router,
    },
    encoding: "utf8",
  });
  assert.notEqual(promotion.status, 0, "unsafe short-delay candidate must not promote");
  assert.match(`${promotion.stdout}${promotion.stderr}`, /at least 172800 seconds/i);
  assert.equal(await hash(officialPath), before, "failed promotion must not modify the official manifest");

  const monitor = spawnSync(process.execPath, [path.join(root, "scripts/monitor.cjs")], {
    cwd: root,
    env: { ...process.env, MONITOR_MAX_BLOCK_LAG_SECONDS: "Infinity" },
    encoding: "utf8",
  });
  assert.notEqual(monitor.status, 0, "unbounded monitor configuration must fail closed");
  assert.match(`${monitor.stdout}${monitor.stderr}`, /must be an integer/i);

  const discovery = spawnSync(process.execPath, [path.join(root, "scripts/discover-pools.cjs")], {
    cwd: root,
    env: { ...process.env, POOL_DISCOVERY_CHUNK: "0" },
    encoding: "utf8",
  });
  assert.notEqual(discovery.status, 0, "zero-sized discovery chunks must fail closed");
  assert.match(`${discovery.stdout}${discovery.stderr}`, /must be between 1 and 10000/i);

  console.log("Release gates: short timelock promotion, unbounded monitor settings, and zero discovery chunks fail closed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
