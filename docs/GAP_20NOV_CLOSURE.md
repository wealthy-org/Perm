# Gap-analysis closure record · 20 Nov baseline

This record maps `/home/user/uploads/perm-gap-20nov.md` to the evidence now present in the repository. It is deliberately stricter than a progress checklist: **implemented**, **proven in non-release staging**, **withheld**, and **externally blocked** are different states.

The official manifest remains Router v1. Router v2 remains wallet-allowlisted, testnet-only staging with `executionReady: false`.

## Status legend

- **Complete** — implemented and covered by local automated gates.
- **Staging-proven** — canonical chain-46630 evidence exists, but it is not release evidence.
- **Withheld** — investigated or implemented, but intentionally not activated because an admission gate failed.
- **Manual/external blocker** — cannot be truthfully completed by repository code or this staging operator alone.

## Feature and finding matrix

| Gap item | Current status | Evidence and boundary |
|---|---|---|
| Router-v2 signed multi-venue foundation | **Complete; staging-proven** | Source-verified staging Router plus v4/v3 adapters; `corepack pnpm check` passes 36 contract tests and all application/release/indexer gates. Official manifest is still v1. |
| Direct Uniswap v4 | **Staging-proven** | Canonical transaction `0xa74beb5b8d5c22aa8ea11d77f36a79070e9464439b033b83f99dd3c5c27251b5`. |
| Synthra v3 | **Staging-proven** | Canonical transaction `0xdf2002f1aa676e56035206ed95113af4cfe141a3b2b6b6f3ee2bac2414b223fd`. |
| Token-to-token multi-hop | **Staging-proven** | Canonical two-step transaction `0x60849ff5a8253034866f529f9d42ec3a49f1bb496c1664be083a2f614e033032`. |
| Explicit v4↔v3 cross-venue execution | **Staging-proven** | `0x994b1b8ac83d8e3ae03d036c9d85cadc71e8b93e3144b8c6167d471716f77290` settled `UNISWAP_V4_DIRECT → SYNTHRA_V3`; independent verifier checks both steps and deployed adapters. The quote used the explicit local-loopback staging path, so it is not hosted-service evidence. |
| Permit2 signature transfer | **Staging-proven** | `0xa325c640cac9908081d569e8226f373c29724f2c8c4a97dc5c95a8a132a910e1`; decoded calldata contains a real Permit2 signature transfer. |
| Fee rebate and pull-payment accounting | **Complete; staging-proven** | Fee invariants pass fuzz/invariant tests; referral, treasury, and claim events are independently decoded from canonical receipts. |
| Referral accrual and claim | **Staging-proven** | Accrual `0x7243055dea1a8e69b1b45e36ea6b636381d5f36532e0baafcbed43b3272e4cc8`; claim `0x9a785b45cea501a9a267ea19aecce3c246add410f81131dfa1d95070d7c31994`. |
| Treasury claim | **Staging-proven** | `0x9582690dcf859b52cf957bd95ee3541de5ed72411a16941e5ca3828c10058974`. Treasury remains the staging owner EOA, so this does not prove independent treasury custody. |
| Source verification and public staging manifest | **Complete for current staging** | Router, v4 adapter, and v3 adapter are exact-match verified; addresses, codehashes, roles, providers, and evidence are public in `deployments/robinhood-testnet.v2-staging.json`. This does not promote the official manifest. |
| Aggregator Hook feature | **Withheld** | No approvable chain-46630 hook was found. Hook routing remains disabled, the provider identity remains unset, and normal direct pools are never relabelled as hooks. See `docs/AGGREGATOR_HOOK_RESEARCH.md`. |
| V2 venue/adaptor | **Withheld** | A dormant fail-closed adapter and fork test exist, but no adapter is deployed or registered. Factory source is 11/11 exact upstream; relevant pairs have only eight all-time swaps, zero in 30 days, low WETH reserves, and no accountable protocol attribution. See `docs/V2_VENUE_REVIEW.md`. |
| WalletConnect mobile settlement | **Manual blocker; verifier complete** | Reown configuration is available, but configuration is not proof. `staging:prepare-walletconnect` creates an ignored local template and exact message; `staging:verify-walletconnect` checks canonical settlement, receipt ID, freshness, signer trust/independence, signature, and topic digest. A human must still perform the real mobile QR session and independent signing. No raw session topic may be stored. |
| Governance role separation and timelock | **External/operator blocker** | Current staging owner, treasury, and pause guardian are one testnet EOA and no timelock owns the deployment. Candidate deployment tooling enforces distinct multisig roles and a minimum 48-hour timelock. No role is moved to a guessed address. |
| Remote quote-signer custody | **External/operator blocker** | Staging intentionally uses an explicitly allowed local testnet burner and reports `custodyReady: false`. Remote signer validation/probe code is complete, but a real non-exportable KMS/HSM key, endpoint, authorized address, rotation test, and emergency-disable evidence are required. |
| Hosted indexer/history | **Staging-proven, schedule not claimed** | Neon-backed staging history and a successful manual indexer run were verified. A continuously scheduled worker plus backup/restore and load drills remain release blockers. |
| RPC and pool discovery | **Manual operation complete; schedule disabled** | Managed RPC is available. Manual overlap discovery refreshed `deployments/v4-pools.json` through block `155962684`, increasing the direct/no-hook registry from 1,388 to 1,395. Schedule enablement still requires operator-controlled repository variables/secrets. |
| Monitoring and alert delivery | **Deferred by operator** | `PERM_MONITOR_ENABLED=0` remains required. No alert inbox or replacement repository was created. A real webhook/on-call destination and explicit test notification are release blockers. |
| Public access | **Intentionally restricted** | Wallet allowlist remains mandatory. Opening access before governance, custody, operations, WalletConnect, hook, and assurance gates would weaken the boundary. |
| Independent audit | **External blocker** | Local tests, Slither (77 contracts, 100 detectors, zero findings), and fork tests are not an independent audit. A third-party report with immutable URL/hash and zero unresolved critical/high findings is required. |
| Incident drill | **External/operator blocker** | The signed assurance schema requires emergency-pause, signer-compromise, RPC-failover, and indexer-reorg scenarios. No drill is fabricated from unit tests. |
| Bug bounty | **External/operator blocker** | A public active policy and separate funding evidence are required. Repository code cannot truthfully mark this complete. |
| Four-role release approvals | **External blocker** | Engineering, security, governance, and operations signatures must be distinct and bound to the final candidate digest. No self-signing substitute is accepted. |

## Verification commands

```bash
corepack pnpm check
corepack pnpm contracts:test:fork
corepack pnpm staging:verify-evidence
corepack pnpm staging:test-public-manifest
corepack pnpm staging:test-v2-review
```

Additional completed checks:

- Solidity coverage: 89.12% statements, 56.49% branches, 89.47% functions, 88.79% lines.
- Slither 0.11.3: 77 contracts, 100 detectors, zero findings.
- Latest-state fork suites: v4, Synthra v3/Permit2, and dormant V2 adapter all pass.
- Production build and bundle-containment checks pass.

## Remaining human inputs — public metadata only

No private key, token, RPC credential, database URL, webhook URL, or WalletConnect credential should be put in chat or committed.

Completion now requires public/operator-controlled facts rather than more guessed code:

1. reviewed multisig/proposer, treasury, and pause-guardian addresses for a new candidate;
2. the public address and provider/control evidence for a non-exportable remote quote signer;
3. a real mobile WalletConnect test and independent QA attester;
4. an on-call/alert destination when alerting is no longer deferred;
5. independent audit, incident-drill, bug-bounty, custody, and approval artifacts/signers; and
6. a Git remote restored by the operator before local commits can be pushed.

Until those inputs and every other release gate pass, the correct state is `staging-ready-non-release`, never an official Router-v2 release.
