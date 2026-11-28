#!/usr/bin/env node
/**
 * Blockscout source verification for the Perm contracts live on Robinhood Chain testnet 46630 that are still
 * unverified (ZGuard daily audit 28 Nov, G-3 / §8.1): Router v1, v4 Adapter v1 and the rehearsal PermTimelock.
 *
 *   node scripts/verify-blockscout-testnet.mjs            # check, then submit + poll
 *   node scripts/verify-blockscout-testnet.mjs --dry-run  # local byte-for-byte check only
 *
 * Router v1 / v4 Adapter v1 were deployed from the browser wallet on 2026-11-18 from the sources of commit
 * 5e13f77; HEAD has Router v2, so `hardhat verify` from HEAD cannot match them. This script therefore reads each
 * contract's sources from the pinned commit (`git show`, needs the full history), compiles them with the exact
 * hardhat settings (solc 0.8.26, viaIR, optimizer 800, cancun, default ipfs metadata), proves that the result is
 * identical to the deployed runtime (immutables masked, metadata hash included) and to Blockscout's creation code,
 * and only then submits that standard JSON (constructor args taken from the creation code) and polls
 * `is_verified`. No key, no transaction. On success the testnet manifest gets `sourceVerification: "verified"`.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, keccak256 } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromHardhat = createRequire(createRequire(import.meta.url).resolve("hardhat/package.json"));
const solc = requireFromHardhat("solc");
const requireLocal = createRequire(import.meta.url);

const CHAIN_ID = 46630;
const RPC = process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const MANIFEST = path.join(ROOT, "deployments", "robinhood-testnet.json");
const UA = { "user-agent": "perm-verify-blockscout/0.1" };
const SOLC_VERSION = "0.8.26";
const SETTINGS = { optimizer: { enabled: true, runs: 800 }, evmVersion: "cancun", viaIR: true };

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const TARGETS = [
  { label: "PermRouter v1", ref: "5e13f77", source: "contracts/src/PermRouter.sol", name: "PermRouter", address: manifest.permRouter },
  { label: "PermV4Adapter v1", ref: "5e13f77", source: "contracts/src/adapters/PermV4Adapter.sol", name: "PermV4Adapter", address: manifest.v4Adapter },
  // Rehearsal timelock (delay 600 s) deployed 2026-11-26, tx 0xdf036f40…e2e1, source unchanged since a3a5555.
  { label: "PermTimelock (testnet rehearsal)", ref: "a3a5555", source: "contracts/src/PermTimelock.sol", name: "PermTimelock", address: "0x3a9337f46858d246b2865f8ca4b6727666593186" },
];

const log = (m) => console.log(`[perm verify] ${m}`);
class Stop extends Error {}
const die = (m) => {
  throw new Stop(m);
};

function sourcesFor(ref, entry) {
  const sources = {};
  const readSource = (p) => {
    if (p.startsWith("contracts/")) return execFileSync("git", ["-C", ROOT, "show", `${ref}:${p}`], { encoding: "utf8" });
    return fs.readFileSync(requireLocal.resolve(p), "utf8");
  };
  const resolveImport = (from, imp) => {
    if (!imp.startsWith(".")) return imp;
    const parts = from.split("/").slice(0, -1);
    for (const seg of imp.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  };
  const visit = (p) => {
    if (sources[p]) return;
    const content = readSource(p);
    sources[p] = { content };
    for (const m of content.matchAll(/import\s+(?:[^"';]*from\s+)?["']([^"']+)["']/g)) visit(resolveImport(p, m[1]));
  };
  visit(entry);
  return sources;
}

const mask = (hex, refs) => {
  const b = Buffer.from(hex.replace(/^0x/, ""), "hex");
  for (const list of Object.values(refs ?? {})) for (const { start, length } of list) b.fill(0, start, start + length);
  return b.toString("hex");
};

async function explorer(p, init = {}) {
  const res = await fetch(`${EXPLORER}${p}`, { ...init, headers: { ...UA, accept: "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* HTML error page */
  }
  return { status: res.status, body, text: text.slice(0, 300) };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!solc.version().startsWith(`${SOLC_VERSION}+`)) die(`solc ${solc.version()} resolved via hardhat, need ${SOLC_VERSION}`);
  const compilerVersion = `v${solc.version().replace(/\.Emscripten.*$/, "")}`;
  const client = createPublicClient({ transport: http(RPC, { timeout: 30_000, fetchOptions: { headers: UA } }) });
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) die(`RPC ${RPC} reports chainId ${chainId}; refusing (testnet ${CHAIN_ID} only)`);

  for (const t of TARGETS) {
    t.input = {
      language: "Solidity",
      sources: sourcesFor(t.ref, t.source),
      settings: { ...SETTINGS, outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "metadata"] } } },
    };
    const out = JSON.parse(solc.compile(JSON.stringify(t.input)));
    const errs = (out.errors ?? []).filter((e) => e.severity === "error");
    if (errs.length) die(`${t.label}: compile failed: ${errs.map((e) => e.formattedMessage).join("\n")}`);
    const c = out.contracts[t.source][t.name];
    const onchain = await client.getCode({ address: t.address });
    if (!onchain || onchain === "0x") die(`${t.label} ${t.address}: no code`);
    const refs = c.evm.deployedBytecode.immutableReferences;
    if (mask(onchain, refs) !== mask(c.evm.deployedBytecode.object, refs)) die(`${t.label}: deployed runtime differs from ${t.ref}:${t.source}`);
    const info = await explorer(`/api/v2/smart-contracts/${t.address}`);
    const creation = String(info.body?.creation_bytecode ?? "").toLowerCase().replace(/^0x/, "");
    const initCode = c.evm.bytecode.object.toLowerCase();
    if (!creation.startsWith(initCode)) die(`${t.label}: Blockscout creation code does not start with the local init code`);
    t.constructorArgs = creation.slice(initCode.length);
    t.license = /SPDX-License-Identifier:\s*MIT/.test(t.input.sources[t.source].content) ? "mit" : "none";
    t.verified = info.body?.is_verified === true;
    t.runtimeCodehash = keccak256(onchain);
    log(`${t.label} ${t.address}: runtime ${(onchain.length - 2) / 2} B identical to ${t.ref} (metadata hash included), init code matches, ${t.constructorArgs.length / 2} B constructor args · is_verified=${t.verified}`);
  }
  if (dryRun) {
    log("dry run: nothing submitted");
    return;
  }

  for (const t of TARGETS) {
    if (t.verified) continue;
    const form = new FormData();
    form.append("compiler_version", compilerVersion);
    form.append("contract_name", t.name);
    form.append("license_type", t.license);
    form.append("autodetect_constructor_args", "false");
    form.append("constructor_args", t.constructorArgs);
    form.append("files[0]", new Blob([JSON.stringify(t.input)], { type: "application/json" }), `${t.name}-standard-input.json`);
    const r = await explorer(`/api/v2/smart-contracts/${t.address}/verification/via/standard-input`, { method: "POST", body: form });
    const msg = r.body?.message ?? r.text;
    if (r.status >= 400 && !/already verified/i.test(String(msg))) die(`${t.label}: Blockscout HTTP ${r.status}: ${msg}`);
    log(`${t.label}: submitted (${compilerVersion}) → ${msg}`);
  }
  const deadline = Date.now() + 180_000;
  for (const t of TARGETS) {
    while (!t.verified && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      t.verified = (await explorer(`/api/v2/smart-contracts/${t.address}`)).body?.is_verified === true;
    }
    log(`${t.label}: is_verified=${t.verified} · ${EXPLORER}/address/${t.address}?tab=contract`);
  }
  if (TARGETS.some((t) => !t.verified)) die("not verified within 3 minutes; re-run later (verified contracts are skipped)");

  manifest.sourceVerification = "verified";
  manifest.sourceVerificationResults = TARGETS.map((t) => ({
    contract: t.label,
    address: t.address,
    sourceRef: t.ref,
    compiler: compilerVersion,
    runtimeCodehash: t.runtimeCodehash,
    bytecode: { matches: true },
    explorerVerified: true,
  }));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`manifest updated: ${path.relative(ROOT, MANIFEST)} sourceVerification = "verified"`);
}

main().catch((e) => {
  console.error(`[perm verify] ${e instanceof Stop ? e.message : e?.stack ?? e}`);
  process.exitCode = 1;
});
