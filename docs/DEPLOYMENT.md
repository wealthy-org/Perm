# Router v2 · Robinhood Chain testnet release runbook

## Network and current public state

- Chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Gas asset: testnet ETH

The official manifest currently remains on Router v1:

- Router: `0x3e350b79D4983a0e86Ad4eE25dB1DBBbfB55114d`
- v4 adapter: `0xC4Df49493a828F681160056cb6D46143B56593D0`

This is deliberate. The application can quote live routes, but signed multi-venue execution remains disabled until a v2 deployment completes this runbook. Local code, a browser deployment, or a candidate file must never be presented as the shared public release.

## Safety prerequisites

- Use a dedicated testnet-only deployer and quote signer. Never paste keys into chat or source files.
- Use a Safe/multisig as proposer/guardian and a timelock as final owner for a shared rehearsal.
- Use dedicated primary/fallback RPC endpoints for hosted traffic.
- Create a PostgreSQL database for durable history.
- Require peer review of constructor targets, manifest diff and verification results.
- Do not reuse this address book or any key on mainnet.

Recommended runtime is Node `22.12+`. Dependency build policy explicitly allows `keccak` and denies the nonessential Reown version-check postinstall script.

## 1. Preflight

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm audit:security
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm contracts:compile
corepack pnpm contracts:export
corepack pnpm contracts:test
corepack pnpm contracts:coverage
corepack pnpm server:test
corepack pnpm indexer:test-schema
corepack pnpm build
```

Current local contract checkpoint: 30 passing tests plus two fork suites skipped in the default run. Current coverage checkpoint: 87.30% statements, 55.65% branches, 90.91% functions and 86.50% lines. The exact count can increase as regressions are added; any failure or material coverage regression blocks release.

Exercise the migration on a disposable PostgreSQL database (the command is destructive and refuses an unlabelled database):

```bash
PGSSLMODE=disable TEST_DATABASE_URL='postgres://.../perm_test' corepack pnpm indexer:test-postgres
```

Run static analysis:

```bash
python -m pip install slither-analyzer==0.11.3
slither . --exclude-dependencies --filter-paths 'contracts/src/mocks|contracts/test'
```

Expected: `0 result(s) found`. Suppressions in source are narrowly scoped and include the design rationale.

Run latest-state integrations and a complete fork deployment rehearsal:

```bash
unset FORK_BLOCK_NUMBER
corepack pnpm contracts:test:fork
corepack pnpm contracts:rehearse:testnet
```

The fork suite executes:

- real v4 native→token and token→native settlement;
- real Synthra v3 native→TSLA and TSLA→native settlement;
- an actual Permit2 EIP-712 signature transfer; and
- fee/rebate accounting through Router v2.

The rehearsal deploys Router, both adapters, registers provider identities and runs post-deploy reads. Its manifest is ignored by Git.

## 2. Prepare release identities

Set shell variables locally:

```bash
export RH_TESTNET_RPC_URL='https://your-dedicated-rpc.example'
export DEPLOYER_PRIVATE_KEY='0x...testnet-only...'
export QUOTE_SIGNER_ADDRESS='0x...public-address-only...'
export OWNER_ADDRESS='0x...governance-proposer-or-safe...'
export TREASURY_ADDRESS='0x...fee-beneficiary...'
export PAUSE_GUARDIAN_ADDRESS='0x...emergency-safe...'

# Required for promotion: deploy a timelock as final owner (minimum 48 hours).
export TIMELOCK_PROPOSER_ADDRESS="$OWNER_ADDRESS"
export TIMELOCK_DELAY_SECONDS=172800
export VERIFY=1
```

`QUOTE_SIGNER_PRIVATE_KEY` may be used instead of `QUOTE_SIGNER_ADDRESS` only to derive its public address during deployment. The production quote service uses `PERM_QUOTE_SIGNER_PRIVATE_KEY`; do not expose it as a `NEXT_PUBLIC_*` value.

## 3. Deploy a candidate

```bash
corepack pnpm contracts:deploy:testnet
```

The script refuses any chain other than `46630`, checks bytecode at PoolManager, V4Quoter, Permit2 and Synthra targets, then deploys:

1. optional `PermTimelock`;
2. `PermRouter` v2;
3. codehash-pinned `PermV4Adapter`;
4. immutable-target `PermV3Adapter`;
5. direct-v4 and Synthra-v3 adapter registrations;
6. a distinct `UNISWAP_V4_AGGREGATOR_HOOK` evidence identity (this does **not** approve a hook);
7. emergency pause guardian configuration; and
8. two-step ownership transfers.

It verifies policy, signer, guardian, Permit2, adapter registry, provider IDs, immutable venue targets and pending ownership from chain.

The output is `deployments/robinhood-testnet.v2-candidate.json`. It does **not** overwrite the official manifest and has `executionReady: false`.

## 4. Complete timelock ownership

When a timelock is used, prepare deterministic schedule/execute calldata:

```bash
export CANDIDATE_MANIFEST=deployments/robinhood-testnet.v2-candidate.json
export TIMELOCK_PROPOSER_ADDRESS='0x...'
corepack pnpm contracts:prepare-ownership
```

Review `deployments/ownership-acceptance.json`, then:

1. submit `scheduleCalldata` to the timelock from an authorized proposer;
2. wait the full minimum delay;
3. submit `executeCalldata` to the timelock;
4. confirm Router, v4 adapter and v3 adapter owners equal the timelock;
5. confirm pending owners are cleared.

The pause guardian can pause immediately, but only final governance can unpause.

## 5. Verify sources and candidate state

`VERIFY=1` submits verification during deployment. Wait until Blockscout publishes source for Router, both adapters and the timelock, then run:

```bash
corepack pnpm deployments:verify-candidate
```

This reruns official onchain configuration checks, queries Blockscout source metadata, updates candidate ownership/source status and exits nonzero until both gates are complete.

For a candidate monitor check without promotion:

```bash
PERM_MANIFEST_PATH=deployments/robinhood-testnet.v2-candidate.json \
  corepack pnpm monitor:testnet
```

## 6. Configure services before promotion

Quote service:

```bash
export PERM_QUOTE_SIGNER_PRIVATE_KEY='0x...matching-candidate-signer...'
export RH_TESTNET_RPC_URL='https://primary...'
export RH_TESTNET_FALLBACK_RPC_URL='https://fallback...'
```

Indexer:

```bash
export DATABASE_URL='postgres://...'
export INDEXER_CONFIRMATIONS=12
corepack pnpm indexer:run       # cron/one-shot
# or
corepack pnpm indexer:watch     # dedicated worker
```

The first index run creates tables from `indexer/schema.sql`. Configure `PERM_REQUIRE_INDEXER=1` only after the cursor is current. Configure `PERM_ALERT_WEBHOOK_URL` for critical deployment/indexer alerts.

WalletConnect QR sessions require a public WalletConnect project ID:

```bash
export NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID='...'
```

Injected wallets continue to work without it.

## 7. Promote explicitly

Promotion is the only step that changes the frontend's official router:

```bash
export CONFIRM_PROMOTION=ROBINHOOD_TESTNET_V2
export CONFIRM_ROUTER_ADDRESS='0x...exact candidate router...'
corepack pnpm deployments:promote
```

The command requires Router v2, passed post-deploy checks, verified sources, exact address confirmation, and accepted ownership by the manifest-declared timelock with an onchain delay of at least 172800 seconds. It archives the v1 manifest, writes the v2 official manifest with `executionReady: true`, and records the previous router.

Restart all quote/frontend/indexer services. Do not use `NEXT_PUBLIC_PERM_EXECUTION_READY=1` for the public release; that override is for controlled staging only.

## 8. Post-promotion E2E

From a wallet that is **not** the treasury:

1. execute a small native→v4 test-token trade;
2. execute the reverse with a real Permit2 signature;
3. execute native→Synthra token and reverse;
4. execute a token→token multi-hop route;
5. confirm exact fee, rebate, referral/treasury split and recipient balance delta;
6. confirm route-step provider/pool identities in `/proofs`;
7. confirm `/api/history` returns indexed records after finalization;
8. confirm quote mutation, replay, self-referral and stale quote fail;
9. confirm hooks mode returns no candidate until a reviewed hook is actually configured.

A hook E2E is a separate release gate. No Aggregator Hook deployment is currently established on this testnet, so ordinary pools must never satisfy that gate.

## 9. Hook onboarding

For each candidate hook:

1. review source, permissions, upgradeability and hook-data schema;
2. record the exact pool key and initialization event;
3. call `setVerifiedHook` on the official v4 adapter;
4. confirm `verifiedHookCodehashes(hook)` equals current runtime `keccak256(code)`;
5. add the exact pool fixture to `aggregatorHooks` in the official manifest;
6. rerun discovery, quote, fork/security and receipt tests;
7. execute a non-treasury wallet E2E and preserve its transaction proof.

If bytecode changes, execution fails closed until governance verifies the new codehash.

## 10. Incident and rollback

1. Pause Router v2 immediately through the pause guardian.
2. Run `monitor:testnet` and preserve its report.
3. Disable affected adapter/hook through governance if needed.
4. Stop quote signing and set services read-only.
5. Restore the archived v1 manifest only as a read-only frontend fallback; Router v1 is not a substitute for fixed v2 execution.
6. Publish an incident note and deploy a new reviewed candidate rather than mutating evidence.

Mainnet requires a separate audit, address book, governance review, infrastructure review, simulations and release approval.
