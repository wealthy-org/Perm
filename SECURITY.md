# Security policy

## Status

Perm is a Robinhood Chain **testnet** project. Router v2, multi-venue adapters, API and release tooling have automated security coverage, but they have not received an independent audit and are not approved for mainnet funds.

The committed shared manifest still points to Router v1. Router v2 execution is intentionally unavailable until the candidate deployment, source verification, governance acceptance and explicit promotion gates are complete.

## Router v2 boundaries

- exact-input only, up to four continuous route steps;
- EIP-712 server authorization binds account, route, fee policy, recipient, chain and timing;
- consumed quote IDs prevent replay;
- self-referral is rejected and referrer is signer-bound;
- integer fee/rebate policy has a hard 1% gross-fee cap;
- pull-payment reserves cannot be owner-rescued;
- exact adapter allowances are cleared after each step;
- fee-on-transfer input is rejected;
- adapter-reported output must equal the router's measured balance delta;
- final minimum output is checked against the actual recipient balance delta;
- state effects precede external calls and entry points are reentrancy guarded;
- only owner/timelock may unpause; owner or pause guardian may pause.

## Adapter boundaries

- adapters and provider identities are owner allowlisted;
- v4 Router and PoolManager targets are immutable;
- v4 hook runtime codehash is pinned and checked on every execution;
- no-hook pools reject hook data;
- hooked steps require a distinct onchain evidence provider ID;
- v3 Router, WETH and their initial runtime codehashes are immutable/pinned;
- v3 fee tiers are restricted and custom price limits are rejected;
- native wrapping/unwrapping and external approvals are bounded to one step;
- owner-only, non-reentrant adapter rescue recovers forced/stranded balances outside active execution.

## API and proof boundaries

- receipt proofs use only the official manifest router and reject URL overrides;
- only exact successful `SwapSettled`/`RouteStepSettled` ABIs are accepted;
- hooks are labeled verified only after onchain codehash validation;
- active fee policy is read from chain;
- quote input, body size, addresses, token metadata and slippage are validated;
- errors returned to clients are sanitized;
- request limits, short caches and in-flight request coalescing reduce RPC abuse;
- production should add shared edge/Redis rate limits because in-process buckets are instance-local;
- durable history uses finalized official-router logs in PostgreSQL.

## Automated security gates

- unit and regression tests for authorization, replay, expiry, mutation, self-referral, route continuity, rollback, reserves, native/ERC-20 claims, fee-on-transfer input, Permit2, reentrancy and hook code changes;
- 1,024 deterministic fuzzed fee inputs plus randomized settlement invariants;
- browser artifact/runtime-template integrity checks;
- latest-state fork execution through real Uniswap v4 and Synthra v3 contracts, including real Permit2 signature transfer;
- Solidity coverage reporting plus Slither with zero unsuppressed findings;
- CI full-tree high-severity dependency audit, lint, typecheck, tests and production build;
- schema behavior on both PGlite and a PostgreSQL 17 service;
- scheduled deployment/config/indexer monitoring and deployment rehearsal.

### Dependency-audit exception

`pnpm audit:prod` ignores only `GHSA-fc5q-39xc-vjpf` (picomatch repeated-extglob ReDoS). As of 2026-11-17 there is no patched picomatch release. The package is inherited through WalletConnect's server-side `unstorage` filesystem driver; Perm uses browser IndexedDB/local storage, accepts no user-supplied glob pattern, and the production client/server bundles contain no picomatch implementation. This exception expires for review on **2027-01-15**, or immediately when a patched upstream release appears. Every other high/critical production advisory still fails the command.

Zod is explicitly resolved to patched version 4.6.7. `bn.js` is overridden to patched 4.12.3 for the coverage-tool dependency path. WalletConnect uses `@walletconnect/universal-provider` with a local QR renderer rather than the larger AppKit modal dependency tree.

The remaining low-severity `elliptic` advisory is confined to Hardhat/Ethers-v5 development tooling and has no published patched version. It is reported rather than ignored, and does not enter the production dependency tree.

These controls reduce risk; they do not replace independent review.

## Operational requirements

- use dedicated RPC endpoints and PostgreSQL for public hosting;
- keep quote-signer and deployer keys server-side and testnet-only;
- use multisig/timelock governance (promotion enforces at least 48 hours) and a separate emergency pause guardian;
- verify all source on Blockscout before promotion;
- keep Aggregator Hooks disabled until exact source, permissions, pool key, hook data and codehash are reviewed;
- run E2E from a non-treasury wallet before release;
- monitor owner, treasury, signer, guardian, policy, adapter state, code presence, pause state, block freshness and indexer lag;
- maintain an incident pause/rollback procedure.

## Reporting

Do not disclose an exploitable issue through a public issue while it remains actionable. Provide:

- affected commit and deployment address;
- chain and transaction/reproduction steps;
- expected versus actual behavior;
- impact and any funds at risk;
- suggested mitigation if known.

Never include seed phrases, private keys, production database credentials or webhook secrets.
