#!/usr/bin/env node
/** Explicitly promotes a verified, ownership-complete v2 candidate to the shared
 * manifest. This is the only script that changes the frontend's official router. */
const fs = require("node:fs");
const path = require("node:path");
const { getAddress, isAddress } = require("viem");

const root = path.resolve(__dirname, "..");
const candidatePath = path.resolve(process.cwd(), process.env.CANDIDATE_MANIFEST || "deployments/robinhood-testnet.v2-candidate.json");
const officialPath = path.join(root, "deployments/robinhood-testnet.json");
const archiveDir = path.join(root, "deployments/archive");

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  required(fs.existsSync(candidatePath), `Candidate manifest not found: ${candidatePath}`);
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  required(candidate.schemaVersion === 2 && candidate.routerVersion === 2 && candidate.chainId === 46630, "Only a chain-46630 Router v2 candidate can be promoted");
  required(candidate.releaseStatus === "candidate", `Unexpected releaseStatus: ${candidate.releaseStatus}`);
  required(candidate.postDeploymentChecks === "passed", "Onchain post-deployment checks have not passed");
  required(candidate.sourceVerification === "verified", "All release contracts must be source-verified on Blockscout");
  required(candidate.ownershipStatus === "accepted", "Router and adapter ownership must be accepted by final governance");
  required(candidate.currentOwner && candidate.currentOwner.toLowerCase() === candidate.owner.toLowerCase(), "Current owner does not match target owner");
  for (const field of ["permRouter", "v4Adapter", "v3Adapter", "quoteSigner", "owner", "treasury", "pauseGuardian", "permit2", "timelock"]) {
    required(candidate[field] && isAddress(candidate[field]), `Missing or invalid ${field}`);
  }
  required(getAddress(candidate.owner) === getAddress(candidate.timelock), "Final owner must be the manifest-declared timelock");
  required(Number.isSafeInteger(candidate.timelockDelaySeconds) && candidate.timelockDelaySeconds >= 172_800,
    "Timelock delay must be at least 172800 seconds");
  required(process.env.CONFIRM_PROMOTION === "ROBINHOOD_TESTNET_V2", "Set CONFIRM_PROMOTION=ROBINHOOD_TESTNET_V2 after release review");
  required(process.env.CONFIRM_ROUTER_ADDRESS && getAddress(process.env.CONFIRM_ROUTER_ADDRESS) === getAddress(candidate.permRouter), "CONFIRM_ROUTER_ADDRESS must exactly match the candidate router");

  const previous = JSON.parse(fs.readFileSync(officialPath, "utf8"));
  required(previous.chainId === candidate.chainId, "Candidate and official manifest chain mismatch");
  fs.mkdirSync(archiveDir, { recursive: true });
  const archiveName = `robinhood-testnet-router-v${previous.routerVersion}-${previous.permRouter.toLowerCase()}.json`;
  fs.writeFileSync(path.join(archiveDir, archiveName), `${JSON.stringify(previous, null, 2)}\n`);

  const promoted = {
    ...candidate,
    releaseStatus: "active",
    executionReady: true,
    promotedAt: new Date().toISOString(),
    previousRouter: previous.permRouter,
  };
  fs.writeFileSync(officialPath, `${JSON.stringify(promoted, null, 2)}\n`);
  console.log(`Promoted Router v2 ${candidate.permRouter}`);
  console.log(`Archived Router v${previous.routerVersion} manifest at deployments/archive/${archiveName}`);
  console.log("Restart the quote service with the matching PERM_QUOTE_SIGNER_PRIVATE_KEY, then run monitor and wallet E2E checks.");
}

try { main(); } catch (error) { console.error(error.message || error); process.exitCode = 1; }
