import assert from "node:assert/strict";
import fs from "node:fs";
import { getAddress, id, isAddress } from "ethers";

const manifestPath = new URL("../deployments/robinhood-testnet.v2-staging.json", import.meta.url);
const officialPath = new URL("../deployments/robinhood-testnet.json", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const official = JSON.parse(fs.readFileSync(officialPath, "utf8"));

const topLevelKeys = [
  "boundaries",
  "canonicalStagingEvidence",
  "chainId",
  "contracts",
  "dependencies",
  "deploymentBlock",
  "deploymentCommitSha",
  "deploymentTransactions",
  "environment",
  "executionReady",
  "feePolicy",
  "network",
  "nonRelease",
  "officialReleaseManifest",
  "providers",
  "releaseStatus",
  "roles",
  "routerVersion",
  "schemaVersion",
  "stagingUrl",
].sort();
assert.deepEqual(Object.keys(manifest).sort(), topLevelKeys, "public staging manifest schema drifted");

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.environment, "allowlisted-testnet-staging");
assert.equal(manifest.releaseStatus, "non-release");
assert.equal(manifest.nonRelease, true);
assert.equal(manifest.executionReady, false);
assert.equal(manifest.chainId, 46630);
assert.equal(manifest.routerVersion, 2);
assert.match(manifest.deploymentCommitSha, /^[0-9a-f]{40}$/);
assert.ok(Number.isSafeInteger(manifest.deploymentBlock) && manifest.deploymentBlock > 0);
assert.equal(manifest.officialReleaseManifest, "deployments/robinhood-testnet.json");
assert.equal(official.routerVersion, 1, "publishing staging metadata must not promote the official manifest");

const stagingUrl = new URL(manifest.stagingUrl);
assert.equal(stagingUrl.protocol, "https:");
assert.equal(stagingUrl.hostname, "perm-iota.vercel.app");
assert.equal(stagingUrl.username, "");
assert.equal(stagingUrl.password, "");

const contractKeys = ["permRouter", "v4Adapter", "v3Adapter"];
assert.deepEqual(Object.keys(manifest.contracts).sort(), contractKeys.sort());
for (const name of contractKeys) {
  const contract = manifest.contracts[name];
  assert.deepEqual(Object.keys(contract).sort(), ["address", "explorerUrl", "runtimeCodehash", "sourceVerification"].sort());
  assert.ok(isAddress(contract.address), `${name} address is invalid`);
  assert.match(contract.runtimeCodehash, /^0x[0-9a-f]{64}$/);
  assert.equal(contract.sourceVerification, "verified-exact-match");
  const explorer = new URL(contract.explorerUrl);
  assert.equal(explorer.protocol, "https:");
  assert.equal(explorer.hostname, "explorer.testnet.chain.robinhood.com");
  assert.ok(explorer.pathname.toLowerCase().includes(contract.address.toLowerCase()));
}

for (const value of Object.values(manifest.dependencies)) assert.ok(isAddress(value));
for (const role of ["owner", "treasury", "pauseGuardian", "quoteSigner"]) {
  assert.ok(isAddress(manifest.roles[role]), `${role} is invalid`);
}
assert.equal(getAddress(manifest.roles.owner), getAddress(manifest.roles.treasury));
assert.equal(getAddress(manifest.roles.owner), getAddress(manifest.roles.pauseGuardian));
assert.notEqual(getAddress(manifest.roles.owner), getAddress(manifest.roles.quoteSigner));
assert.equal(manifest.roles.governanceClassification, "single-eoa-testnet-staging");
assert.equal(manifest.roles.quoteSignerCustodyClassification, "local-testnet-burner");
assert.equal(manifest.roles.timelock, null);

assert.equal(manifest.providers.uniswapV4Direct.providerId, id("UNISWAP_V4_DIRECT"));
assert.equal(manifest.providers.synthraV3.providerId, id("SYNTHRA_V3"));
assert.equal(manifest.providers.uniswapV4AggregatorHook.reservedProviderId, id("UNISWAP_V4_AGGREGATOR_HOOK"));
assert.equal(manifest.providers.uniswapV4Direct.enabled, true);
assert.equal(manifest.providers.synthraV3.enabled, true);
assert.equal(manifest.providers.uniswapV4AggregatorHook.enabled, false);
assert.deepEqual(manifest.providers.uniswapV4AggregatorHook.reviewedHooks, []);
assert.equal(getAddress(manifest.providers.uniswapV4Direct.adapter), getAddress(manifest.contracts.v4Adapter.address));
assert.equal(getAddress(manifest.providers.synthraV3.adapter), getAddress(manifest.contracts.v3Adapter.address));

assert.deepEqual(manifest.feePolicy, { version: 1, platformFeeBps: 20, rebateShareBps: 2500 });
assert.match(manifest.canonicalStagingEvidence.transactionHash, /^0x[0-9a-f]{64}$/);
assert.equal(manifest.canonicalStagingEvidence.routeClassification, "uniswap-v4-direct-no-hook");
assert.equal(manifest.canonicalStagingEvidence.status, "passed-staging-only");
const evidenceUrl = new URL(manifest.canonicalStagingEvidence.explorerUrl);
assert.equal(evidenceUrl.protocol, "https:");
assert.equal(evidenceUrl.hostname, "explorer.testnet.chain.robinhood.com");
assert.ok(evidenceUrl.pathname.toLowerCase().endsWith(manifest.canonicalStagingEvidence.transactionHash.toLowerCase()));

assert.equal(manifest.deploymentTransactions.length, 5);
assert.equal(new Set(manifest.deploymentTransactions).size, manifest.deploymentTransactions.length);
for (const hash of manifest.deploymentTransactions) assert.match(hash, /^0x[0-9a-f]{64}$/);
assert.deepEqual(manifest.boundaries, {
  walletAllowlistRequired: true,
  aggregatorHooksEnabled: false,
  remoteSignerCustodyReady: false,
  hostedOperationsReady: false,
  releaseEvidenceComplete: false,
});

const forbiddenFields = new Set([
  "privateKey",
  "mnemonic",
  "signature",
  "walletAllowlist",
  "databaseUrl",
  "alertWebhookUrl",
  "walletConnectProjectId",
  "bearerToken",
]);
function rejectSensitiveFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenFields.has(key), false, `sensitive field ${key} must not enter the public manifest`);
    rejectSensitiveFields(nested);
  }
}
rejectSensitiveFields(manifest);

console.log("Public Router-v2 staging manifest: schema, non-release boundary, source verification, providers and evidence passed");
