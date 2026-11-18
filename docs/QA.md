# Verification record

Date: 17 November 2026 (Asia/Jakarta; sandbox command logs use an independent UTC clock and may show 18 November)

## Release status and scope

This record validates the checked-in **Router v2 code and release path**. It does not claim that Router v2 is live.

The official manifest, `deployments/robinhood-testnet.json`, still identifies Router v1 and does not set `executionReady: true`. The production UI and quote API therefore remain fail-closed: live quotes can be inspected, but signed v2 execution is unavailable until a candidate is deployed, verified, transferred to governance, and explicitly promoted.

## Automated gates

| Gate | Result |
|---|---|
| Frozen dependency install | Passed: `corepack pnpm install --frozen-lockfile` |
| Production dependency audit | Passed at high severity; only the documented ignored picomatch advisory remains |
| Full dependency audit | Passed at high severity; one low-severity `elliptic` development-tool advisory remains, with no patched release |
| Moderate coverage-tool advisory | Resolved by overriding `bn.js <4.12.3` to `4.12.3` |
| ESLint | Passed with zero warnings |
| TypeScript | Passed |
| Production Next.js build | Passed; 10 static/dynamic routes generated |
| Router/adapters/timelock suite | **30 passing, 2 fork suites pending** in the regular run |
| Latest-state fork integrations | **2 passing**: real Robinhood v4 in both directions and real Synthra v3/Permit2 in both directions |
| Solidity coverage | **87.30% statements, 55.65% branches, 90.91% functions, 86.50% lines** |
| Coverage cleanup | Passed; the wrapper cleaned instrumented output, rebuilt production artifacts, and re-exported browser ABIs |
| Browser artifact integrity | Passed after coverage cleanup |
| Fuzz/invariants | Passed 1,024 deterministic uint127 fee inputs plus randomized conservation/reserve scenarios |
| Slither 0.11.3 | **70 contracts, 100 detectors, 0 findings** |
| Server-runtime integration | Passed bounded settings, streamed body cap, proxy identity, token bucket, and in-flight cache coalescing |
| PGlite schema integration | Passed idempotency, 78-digit numerics, deferred evidence FK, state upsert, and cascade |
| PostgreSQL 17 schema integration | Passed the same behaviors through the whole-file migration path used in production |
| Release-gate regression | Passed: short-delay timelock promotion, unbounded monitor settings, and zero-sized discovery chunks fail closed without changing the official manifest |
| Operations script syntax | Passed for deployment, ownership, discovery, indexer, monitoring, verification, and promotion scripts |

CI now supplies a PostgreSQL 17 service in addition to PGlite, runs the full-tree high-severity dependency gate, uploads Solidity coverage, and runs Slither independently.

## Contract behaviors exercised

The regression suite confirms:

- EIP-712 quote authorization binds account, pair, exact input, minimum output, recipient, timing, policy, chain, referrer, and route hash;
- forged, mutated, replayed, stale, future, expired, and wrong-chain quotes fail;
- self-referral fails even if included in a signed quote;
- up to four continuous steps can settle with per-step provider, adapter, pool/route, amount, hook, and hook-codehash evidence;
- hook routes fail closed unless the exact runtime codehash is reviewed;
- Permit2 signature transfer and exact-approval paths work;
- fee-on-transfer input fails before routing and rolls state back;
- treasury/referral liabilities use pull accounting and remain protected reserves;
- native output succeeds for a valid recipient and atomically rolls back for a rejecting recipient;
- minimum-output and adapter-reentrancy failures roll back quote consumption, fees, balances, and allowances;
- Router and both adapters can rescue only owner-authorized stranded balances outside active execution;
- forced native and ERC-20 balances were recovered from both adapters, while an unauthorized caller and a rejecting native recipient failed;
- zero fee, full rebate, dust rounding, referral conservation, and reserve accounting hold;
- emergency pause, signer rotation, and two-step ownership work; and
- a real OpenZeppelin timelock batch can schedule and atomically accept Router, v4-adapter, and v3-adapter ownership only after the delay.

The standard and timelock-enabled deployment rehearsals both passed. The timelock ownership plan remained deterministic with operation ID:

`0x6a4335d182623f28a1daf6f16fdf1afeeaa1ca1c8c1509dbe278f4c7f8afaef6`

Rehearsal manifests are local evidence only and are not official deployments.

## Live-chain and fork evidence

Latest-state fork tests used the current public Robinhood testnet state because the public RPC cannot serve the old pinned archival block.

- v4: native→token and token→native settlement through the real PoolManager, including signed quotes and rebate accounting;
- Synthra v3: native→TSLA and Permit2-backed TSLA→native settlement through the reviewed SwapRouter and WETH targets;
- result: **2 passing**.

The finalized, overlap-rescanned v4 registry was refreshed through block `155000635` and remains at **1,388 eligible direct pools**.

The official deployment monitor also ran against live chain state with **zero failures**. It confirmed chain freshness, runtime bytecode at all configured targets, owner/treasury, unpaused state, policy `20 / 2500`, and the enabled direct-v4 adapter. Its remaining warnings are expected and release-relevant: official Router v1, pending source verification, and no manifest-declared timelock.

## Real PostgreSQL and indexer integration

PostgreSQL 17 was started locally and the actual `scripts/indexer.cjs` worker was run against the official Robinhood testnet RPC and Router v1 manifest.

The worker:

1. executed the complete `indexer/schema.sql` migration through PostgreSQL's simple-query path;
2. safely reran the migration;
3. indexed from deployment block `154833178` through finalized block `155000255` in bounded chunks;
4. persisted a canonical cursor hash;
5. recovered both historical official settlements; and
6. returned current data through `/api/history` with source `postgres-indexer`.

Indexed settlements:

- `0xf76cdc7e4c1d20b43b5d7bfb62314599b78355b55f5965b41d6553126e5ab60b` at block `154836799`;
- `0x17b294d4b5c212f83c8ea4536e9d2fd4f5b650a34297d46db2e5c27e59ab9904` at block `154842634`.

After a final one-shot sync, a database-aware monitor run reported zero failures, a canonical cursor hash, 12-block lag (the configured confirmation depth), and a fresh cursor timestamp. This proves the PostgreSQL/indexer/API/monitor path; production still needs a durable hosted database and continuously running worker.

## Production server, API, and browser smoke tests

A production build was served with the real PostgreSQL connection.

HTTP checks:

- `/`, `/trade`, `/routes`, `/rebate`, `/proofs`, `/docs`, and `/setup` returned HTTP 200;
- CSP, COOP, Permissions Policy, HSTS, and `X-Content-Type-Options` headers were present;
- malformed quote content type returned 415;
- malformed receipt hash returned 400;
- `/api/history` returned both indexed settlements from PostgreSQL;
- a live ETH→NVDA quote returned one real v4 candidate, current block identity, and `executable: false` with the explicit Router-v1 reason; and
- both historical settlement hashes were re-decoded by `/api/receipts` with canonical transaction index, block hash, log identity, and more than 12 confirmations.

A headless Chromium test exercised the hydrated `/trade` page at desktop and mobile sizes:

- a live quote and candidate rendered;
- no horizontal overflow or Next.js error page appeared;
- no actionable browser console errors occurred;
- the token picker exposed a labelled modal dialog, autofocus, Escape close, and keyboard focus containment;
- the wallet chooser exposed a labelled dialog and correctly disabled WalletConnect when no project ID was configured; and
- the 390-pixel mobile layout rendered the menu, quote, and candidate without overflow.

## Historical Router v1 wallet evidence

These transactions remain valid evidence for the currently official Router v1 only; they are not presented as Router v2 evidence.

### ETH → NVDA:T

- settlement: `0xf76cdc7e4c1d20b43b5d7bfb62314599b78355b55f5965b41d6553126e5ab60b`
- block: `154836799`
- block hash: `0xa9d7f002677b043995525068a38d5967e30e60ed4f377169bf45398f2616a806`
- input: `0.0001 ETH`
- routed input: `0.00009985 ETH`
- output: `0.000013528386301086 NVDA:T`
- gross fee / rebate / net fee: `0.0000002 / 0.00000005 / 0.00000015 ETH`

### NVDA:T → ETH

- exact approval: `0xb7397a5bcaef65fccb911809469e70468f7469fe8ea74b610aaf36eca5123dbe`
- settlement: `0x17b294d4b5c212f83c8ea4536e9d2fd4f5b650a34297d46db2e5c27e59ab9904`
- block: `154842634`
- block hash: `0x60eea6bf48cd9b80e4992303d5a6e39c5ed652b45bdf9e07e2b69c33f9c1d0d8`
- input: `0.00001 NVDA:T`
- routed input: `0.000009985 NVDA:T`
- output: `0.000074313192980675 ETH`
- gross fee / rebate / net fee: `0.00000002 / 0.000000005 / 0.000000015 NVDA:T`
- allowance after settlement: zero

## Unfinished external release gates

Router v2 must remain non-executable until all of the following are complete:

1. deploy a v2 candidate with a dedicated release key and RPC;
2. verify Router, both adapters, and timelock source on Blockscout;
3. use the enforced minimum 48-hour timelock, then schedule, wait for, and execute all three `acceptOwnership()` calls;
4. run candidate verification until ownership and source gates both pass;
5. configure a durable hosted PostgreSQL worker, fallback RPC, monitoring, and alert webhook;
6. configure the production quote-signer key matching the onchain signer;
7. supply a real WalletConnect project ID and complete external-wallet QR pairing; the no-project-ID fail-closed UI was tested, but real pairing was not;
8. perform v2 E2E swaps from a non-treasury wallet and verify indexed per-step receipts;
9. keep Aggregator Hook mode disabled until a specific deployment, permissions, quote semantics, calldata, and runtime codehash are independently reviewed; and
10. complete independent audit, governance review, incident drill, and bug-bounty readiness before any use with assets of value.

No local rehearsal, fork test, or generated candidate should be described as the official Router v2 while the shared manifest remains Router v1.
