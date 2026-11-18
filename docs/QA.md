# Verification record

Date: 17 November 2026

## Automated checks

- TypeScript: passed (`corepack pnpm typecheck`)
- Production build: passed (`corepack pnpm build`)
- Router and adapter unit/security suite: 18 passed
- Pinned Robinhood testnet fork integration: 1 passed at block `154719917`
- Public pages: `/`, `/trade`, `/routes`, `/rebate`, `/proofs`, `/docs`, and `/setup` returned HTTP 200
- Live quote endpoint: returned V4Quoter-backed quotes with chain, block, pool key, policy, slippage, gas, and `executable: true`
- Quote binding: API `quoteId` matched independent ABI encoding of account, adapter, pair, amount, minimum, recipient, timing, policy, chain, referrer, and route hash

## Shared Robinhood testnet deployment

- PermRouter: `0x3e350b79D4983a0e86Ad4eE25dB1DBBbfB55114d`
- PermV4Adapter: `0xC4Df49493a828F681160056cb6D46143B56593D0`
- Owner and treasury: `0x141DB8c1C42B0fa5b13eE17136e4E037597886a8`
- Deployment block: `154833178`
- Router deployment: `0x1654e9dc382f6e1e743302d0e2ca19dcddc129ddfb65a2a39a9d051794e94daf`
- Adapter deployment: `0xd8a418addfb4f9aef8d8271a02d75deb8590d49f810fa81f92a033f649867c80`
- Adapter enablement: `0x0ded432bd75ce8637b99b6349c7c641db65e3e3c0f1e05a458fe4782305cceeb`

All three deployment transactions succeeded. Router runtime bytecode exactly matched the compiled runtime hash. Adapter runtime bytecode exactly matched the compiled template after substituting its immutable PoolManager and Router values. Onchain reads confirmed:

- policy v1: `20`, `2500`, `true`, `true`;
- direct adapter enabled with the expected `UNISWAP_V4_DIRECT` provider ID;
- immutable PoolManager and Router values;
- owner and treasury;
- router unpaused; and
- initial settlement nonce zero before E2E execution.

The verified manifest is committed at `deployments/robinhood-testnet.json`. Quote and receipt APIs were retested without browser-local deployment parameters. The Setup page was also retested after deleting local deployment state and correctly reported `ACTIVE FROM PROJECT MANIFEST` without offering redeployment.

## Real wallet E2E evidence

### Native input: ETH → NVDA:T

- Settlement: `0xf76cdc7e4c1d20b43b5d7bfb62314599b78355b55f5965b41d6553126e5ab60b`
- Block: `154836799`
- Input: `0.0001 ETH`
- Routed input: `0.00009985 ETH`
- Actual output: `0.000013528386301086 NVDA:T`
- Gross fee: `0.0000002 ETH`
- Rebate: `0.00000005 ETH`
- Net fee: `0.00000015 ETH`
- Actual network fee: `0.00000206 ETH`
- Hook claim: none

### ERC-20 input: NVDA:T → ETH

- Exact approval: `0xb7397a5bcaef65fccb911809469e70468f7469fe8ea74b610aaf36eca5123dbe`
- Settlement: `0x17b294d4b5c212f83c8ea4536e9d2fd4f5b650a34297d46db2e5c27e59ab9904`
- Block: `154842634`
- Approved/input amount: `0.00001 NVDA:T`
- Routed input: `0.000009985 NVDA:T`
- Actual output: `0.000074313192980675 ETH`
- Gross fee: `0.00000002 NVDA:T`
- Rebate: `0.000000005 NVDA:T`
- Net fee: `0.000000015 NVDA:T`
- Actual network fee: `0.00000204472 ETH`
- Hook claim: none
- Allowance after settlement: zero

Both settlements emitted valid `SwapSettled` logs. `/api/receipts` decoded both transactions, and `/proofs` displayed two valid receipts. A syntactically valid unrelated hash remained marked `INVALID` and did not increase the receipt count.

## Guided functional UI checks

The following behaviors were exercised in a real browser:

- live V4 quote and candidate filtering;
- fee, rebate, minimum received, recipient, and gas display;
- slippage at `0.1%` and `1%`;
- reverse route and multiple token pools;
- custom recipient and automatic quote refresh;
- route catalog refresh and honest empty verified-hook filter;
- rebate-eligible and no-rebate calculations;
- empty/invalid proof handling;
- deployment treasury validation;
- three-step wallet deployment plus onchain configuration verification;
- native settlement;
- exact ERC-20 approval and settlement;
- receipt persistence through the shared manifest; and
- manifest-only Setup state after browser-local deployment data was removed.

Testing exposed and fixed two functional UI issues:

1. tiny nonzero fee and receipt amounts were rounded too aggressively; fee/event formatting now preserves exact base-unit values; and
2. `/setup` offered redeployment after local config was removed even when the shared manifest was ready; it now recognizes manifest deployment state.

## Remaining external release gates

- Publish and verify both contract sources on Blockscout.
- Configure dedicated RPC/indexing before public traffic.
- Perform an independent security review before any mainnet use.
- Keep hooked candidates disabled until their exact deployment, permissions, quote behavior, and execution data are reviewed.
