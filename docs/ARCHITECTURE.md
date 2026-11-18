# Perm execution architecture

## Scope

The first executable release is exact-input routing on Robinhood Chain Testnet (`46630`). It uses the official testnet v4 `PoolManager` and `V4Quoter` deployments. It does not claim V2/V3 or Aggregator Hook coverage where no reviewed testnet deployment exists.

## Quote path

1. The API accepts a supported token pair, exact input, and slippage.
2. It computes policy v1 in token base units:
   - gross Perm fee: `floor(input × 20 / 10,000)`
   - rebate: `floor(gross × 2,500 / 10,000)`
   - net fee: `gross − rebate`
   - routed input: `input − net fee`
3. It calls the deployed v4 `V4Quoter` with the routed input.
4. Reverting and zero-output candidates are excluded.
5. It returns token output and estimated gas separately. It never converts gas into output units without a trusted price.
6. The API derives `quoteId` from the `PERM_QUOTE_V1` domain plus account, adapter, tokens, amount, minimum output, recipient, deadline, quote timestamp, policy version, chain, referrer, and route-data hash. Any field change produces a different ID.

## Settlement path

`PermRouter.swapExactInput`:

1. checks chain ID, deadline, freshness (maximum 120 seconds), account-bound quote hash, pair, amount, recipient, policy, and adapter allowlist;
2. pulls the exact ERC-20 input or checks the exact native value;
3. rejects fee-on-transfer input tokens;
4. recomputes fee and rebate using the immutable policy version;
5. approves only the selected adapter for the routed amount;
6. invokes the adapter and clears the approval immediately afterward;
7. measures output received by the router, transfers it to the recipient, and enforces minimum received against the recipient's ERC-20 balance delta;
8. distributes only the net Perm fee; and
9. emits `SwapSettled` with all receipt fields.

Any revert rolls back quote consumption, output, fee distribution, and receipt state atomically.

## V4 adapter boundary

`PermV4Adapter`:

- has one immutable Perm router and one immutable v4 PoolManager;
- decodes a `PoolKey`, not an arbitrary target/call tuple;
- supports one exact-input pool per candidate in the first release;
- rejects non-empty hook data;
- permits no-hook pools by default;
- rejects hooked pools unless the owner explicitly verifies the hook address;
- requires the PoolManager to spend the complete exact input; and
- settles/takes currencies through the PoolManager callback.

This architecture does not imply that a hook ran merely because a route used v4.

## Receipts

The proof API decodes `SwapSettled` from the actual transaction receipt. It includes:

- chain ID;
- transaction hash, block, and log index;
- account and recipient;
- token in/out and actual amounts;
- gross fee, rebate, net fee, and referral share;
- provider/adapter and hook identity;
- fee policy version; and
- actual gas used and effective gas price.

The browser stores only recent transaction hashes. Authoritative data remains the transaction and event log.

## Trust and release boundaries

- Owner can pause, add immutable policy versions, enable/disable reviewed adapters, configure referral shares, and verify hooks.
- Published policy versions cannot be edited; a new version is required.
- Platform fee has a hard onchain cap of 100 bps.
- A public deployment must use a reviewed owner/treasury, verified source code, and a dedicated production RPC before mainnet.
- These contracts have automated tests but have not received an independent security audit.
