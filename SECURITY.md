# Security policy

## Status

Perm runs Router v2 on Robinhood Chain mainnet (4663) as an **allowlisted, non-release deployment** (`deployments/robinhood-mainnet.json`: `releaseStatus: allowlisted-mainnet`, `nonRelease: true`). The testnet (46630) manifest still points to Router v1. Router v2, the adapters, the API and the release tooling have automated security coverage, but **they have not received an independent audit**. Use small amounts only.

## Governance (mainnet)

| Role | Holder | Power |
|---|---|---|
| Owner of PermRouter, PermV4Adapter, PermV3Adapter | `PermTimelock` (48 h minimum delay) once the handoff below is verified; until then the Safe | every owner action: treasury, quote signer, fee policy, adapters/hooks, guardian, `unpause()` |
| Timelock proposer + canceller | Safe "ZGuard Ops" `0xad5501954A52792280D868F7e613Efcc4F80fa6c`, 2-of-3, owners from three separate seeds | queue or cancel owner actions |
| Timelock canceller | pause guardian | veto a queued owner action; cannot queue one |
| Timelock executor | anyone (`address(0)`) | run an operation only after its delay has passed (liveness) |
| Timelock admin | the timelock itself (constructor admin `address(0)`) | role changes also wait 48 h |
| Pause guardian | EOA `0x1FBaDaFb2056Af662aa11732e86B28aF550af0d9` | `pause()` instantly; cannot unpause, move funds or change settings |
| Treasury | the Safe | receives protocol fees |

The handoff is done with `contracts/scripts/timelock-handoff.cjs` (`deploy` → `plan` → Safe batch 1: `transferOwnership(timelock)` + `scheduleBatch(acceptOwnership…, grantRole(CANCELLER, guardian))` → wait 48 h → `execute` → `verify`). `contracts/test/PermTimelockHandoff.test.cjs` covers the flow, including cancellation, instant guardian pause, 48 h unpause and guardian veto. The handoff is complete only when `ACTION=verify` passes on mainnet and the transaction hashes are recorded in the manifest (`timelockHandoff`).

## Pre-signature checks in the app

- **ZGuard gate (mandatory, fail-closed):** the exact swap transaction is sent server-side to ZGuard (`/api/zguard`; the API key never reaches the browser). Deny, abstain, an unreachable ZGuard or a missing key blocks the swap. The only way to switch it off is `PERM_ZGUARD_MODE=off`, which shows a red "UNGUARDED" banner.
- **Approval gate (always on):** `approve` and Permit2 signatures are limited to the exact quoted amount and to the official PermRouter / Permit2 from the manifest.

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
- scheduled deployment/config/indexer monitoring and deployment rehearsal;
- release-evidence downloads restricted to public port-443 targets with DNS pinning, redirect revalidation, streaming size caps, and immutable SHA-256 checks.

### Dependency-audit posture

`pnpm audit:prod` accepts no production advisory and the workspace suppresses no GHSA. The previously documented `GHSA-fc5q-39xc-vjpf` picomatch exception became stale when the registry stopped reporting the withdrawn advisory, so it was removed rather than weakening the gate. After `pnpm build`, `pnpm audit:bundle` still provides defense in depth by failing if WalletConnect's standalone `picomatch`/`anymatch` packages appear in a Next output trace or bundle. Next's own vendored `next/dist/compiled/picomatch` may remain in the framework server trace; it is not a standalone audited dependency path, and Perm passes it no user-supplied glob patterns.

Zod is explicitly resolved to patched version 4.6.7. `bn.js` is overridden to patched 4.12.3 for the coverage-tool dependency path. WalletConnect uses `@walletconnect/universal-provider` with a local QR renderer rather than the larger AppKit modal dependency tree.

The full-tree audit accepts exactly one low-severity `GHSA-848j-6mx2-7j84` finding for `elliptic@6.6.1`, verifies that every finding is development-only and confined to the Hardhat/coverage toolchain, and rejects path or disposition drift. No patched upstream release is reported. This bounded exception expires automatically on **2027-01-15** and does not enter the production dependency tree.

These controls reduce risk; they do not replace independent review.

## Operational requirements

- use dedicated RPC endpoints and PostgreSQL for public hosting;
- keep deployer keys server-side/testnet-only and use authenticated remote non-exportable KMS/HSM signing for a shared quote service; raw quote keys are development-only, and release custody evidence must bind the SHA-256 of a real signer probe;
- use multisig/timelock governance (promotion enforces at least 48 hours) and a separate emergency pause guardian;
- verify all source on Blockscout before promotion;
- keep Aggregator Hooks disabled until exact source, permissions, pool key, hook data and codehash are reviewed;
- run E2E from a non-treasury wallet before release;
- monitor owner, treasury, signer, guardian, policy, adapter state, code presence, pause state, block freshness and indexer lag;
- maintain an incident pause/rollback procedure.

## Reporting

Report privately through GitHub (**Security → Report a vulnerability** on the repository) or by direct message to the maintainers. Do not disclose an exploitable issue through a public issue while it remains actionable. If funds are at risk, the pause guardian can stop settlement immediately. Please provide:

- affected commit and deployment address;
- chain and transaction/reproduction steps;
- expected versus actual behavior;
- impact and any funds at risk;
- suggested mitigation if known.

Never include seed phrases, private keys, production database credentials or webhook secrets.
