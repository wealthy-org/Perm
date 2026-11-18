# Security policy

## Current status

Perm is implemented for Robinhood Chain testnet. The contracts compile, pass 18 unit/security tests, and pass a pinned fork integration test against the deployed v4 PoolManager. The suite includes taxed-token, malicious-hook-data, unapproved-target, reentrancy, allowance rollback, stale quote, and minimum-received cases. The contracts have **not** received an independent audit and are not approved for mainnet funds.

## Enforced invariants

- exact-input only;
- immutable versioned fee policy;
- 100 bps hard platform-fee cap;
- rebate never exceeds gross Perm fee;
- exact native value or exact ERC-20 balance delta;
- no fee-on-transfer input assets;
- recipient, minimum output, chain, deadline, and freshness enforcement;
- deterministic quote hashing across account, adapter, pair, amount, minimum, recipient, timing, policy, referrer, and route data;
- quote consumption scoped to the submitting account;
- owner-approved adapters only;
- exact adapter allowance cleared after use;
- immutable v4 PoolManager in the adapter;
- no arbitrary execution target;
- non-empty v4 hook data rejected;
- hooks disabled unless explicitly reviewed and allowlisted;
- full exact-input spend required;
- reentrancy guard and emergency pause;
- atomic rollback on failure; and
- event-backed receipts only.

## Known release gates

- public testnet contracts must be deployed and source-verified;
- final owner must accept two-step ownership when a separate deployer is used;
- at least one reviewed Aggregator Hook must be available on the target network before hook-aware execution is enabled;
- a dedicated RPC/indexing provider is required for public traffic;
- independent audit and mainnet-specific deployment review are required before using valuable assets.

## Reporting

Do not disclose private keys or seed phrases in a report. Include the affected contract or page, chain ID, transaction hash when applicable, reproduction steps, expected behavior, and observed behavior.
