#!/usr/bin/env node
/** Re-runs onchain configuration checks for a v2 candidate and confirms explorer
 * source publication. It never promotes or enables the frontend. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const candidatePath = path.resolve(process.cwd(), process.env.CANDIDATE_MANIFEST || "deployments/robinhood-testnet.v2-candidate.json");
if (!fs.existsSync(candidatePath)) throw new Error(`Candidate manifest not found: ${candidatePath}`);
const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
if (candidate.chainId !== 46630 || candidate.routerVersion !== 2 || candidate.schemaVersion !== 2) {
  throw new Error("Candidate must be a Router v2 manifest for chain 46630");
}

async function explorerVerified(address) {
  const endpoint = `${candidate.explorerUrl}/api?module=contract&action=getsourcecode&address=${address}`;
  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": "PermReleaseVerifier/2.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Explorer source query failed for ${address}: HTTP ${response.status}`);
  const body = await response.json();
  const result = Array.isArray(body.result) ? body.result[0] : undefined;
  return Boolean(result && typeof result.SourceCode === "string" && result.SourceCode.trim() && result.ContractName);
}

async function main() {
  const output = path.join(os.tmpdir(), `perm-monitor-${process.pid}.json`);
  const run = spawnSync(process.execPath, [path.join(root, "scripts/monitor.cjs")], {
    cwd: root,
    env: { ...process.env, PERM_MANIFEST_PATH: candidatePath, MONITOR_OUTPUT: output, PERM_ALERT_WEBHOOK_URL: "" },
    encoding: "utf8",
  });
  if (run.status !== 0 || !fs.existsSync(output)) {
    process.stderr.write(run.stdout || "");
    process.stderr.write(run.stderr || "");
    throw new Error("Candidate failed onchain configuration monitoring");
  }
  const report = JSON.parse(fs.readFileSync(output, "utf8"));
  fs.rmSync(output, { force: true });
  if (report.failures.length) throw new Error(`Candidate checks failed: ${report.failures.join("; ")}`);

  const contracts = [candidate.permRouter, candidate.v4Adapter, candidate.v3Adapter, candidate.timelock].filter(Boolean);
  const verification = await Promise.all(contracts.map(async (address) => ({ address, verified: await explorerVerified(address) })));
  const sourcesVerified = verification.every((entry) => entry.verified);
  const owners = [report.checks.owner, report.checks.v4Adapter?.owner, report.checks.v3Adapter?.owner].filter(Boolean);
  const ownershipAccepted = owners.length === 3 && owners.every((owner) => owner.toLowerCase() === candidate.owner.toLowerCase());

  candidate.currentOwner = report.checks.owner;
  candidate.ownershipStatus = ownershipAccepted ? "accepted" : "pending-acceptance";
  candidate.sourceVerification = sourcesVerified ? "verified" : "pending";
  candidate.postDeploymentChecks = "passed";
  candidate.releaseStatus = "candidate";
  candidate.executionReady = false;
  candidate.lastVerifiedAt = new Date().toISOString();
  candidate.sourceVerificationResults = verification;
  fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

  console.log(JSON.stringify({
    candidate: path.relative(root, candidatePath),
    onchainChecks: "passed",
    ownershipStatus: candidate.ownershipStatus,
    sourceVerification: candidate.sourceVerification,
    contracts: verification,
    promotionReady: ownershipAccepted && sourcesVerified,
  }, null, 2));
  if (!ownershipAccepted || !sourcesVerified) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
