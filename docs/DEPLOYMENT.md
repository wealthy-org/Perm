# Robinhood Chain testnet deployment

## Network

- Chain ID: `46630`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Gas asset: testnet ETH

The public RPC is rate-limited. Use a dedicated Robinhood testnet endpoint for a hosted public app.

## Current shared deployment

- PermRouter: `0x3e350b79D4983a0e86Ad4eE25dB1DBBbfB55114d`
- PermV4Adapter: `0xC4Df49493a828F681160056cb6D46143B56593D0`
- Owner/treasury: `0x141DB8c1C42B0fa5b13eE17136e4E037597886a8`
- Deployment block: `154833178`

The three deployment/configuration transactions and two real settlement transactions are recorded in [`QA.md`](QA.md) and [`README.md`](../README.md). Runtime bytecode and onchain configuration match the local build and policy v1. Blockscout source publication remains pending, so this testnet deployment must not be described as audited or mainnet-ready.

## Safety rules

- Never paste a seed phrase or private key into chat, source code, or a committed file.
- Use a dedicated testnet-only deployer.
- Set the final owner and treasury to public addresses you control.
- Verify source code on Blockscout before enabling the frontend.
- Do not reuse testnet keys for mainnet.

## Pre-deployment checks

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm contracts:compile
corepack pnpm contracts:test
RUN_FORK_TESTS=1 corepack pnpm hardhat test contracts/test/PermV4Fork.test.cjs
corepack pnpm build
```

The fork test executes both directions of a real no-hook v4 testnet pool through `PermRouter` and `PermV4Adapter`. It is pinned to block `154719917`; set `FORK_BLOCK_NUMBER` only when deliberately refreshing the fixture.

## Browser-wallet setup

Open `/setup` to deploy from an injected EVM wallet without exposing a private key. The flow verifies PoolManager bytecode, deploys both contracts, enables only `UNISWAP_V4_DIRECT`, reads policy and adapter state back from chain, and stores the result locally in that browser. Export the generated manifest for source verification and repository review.

The CLI path below remains the recommended reproducible release path because it can also submit Blockscout verification automatically.

## Deploy with the CLI

Set environment variables in the local shell, not in the repository:

```bash
export RH_TESTNET_RPC_URL='https://rpc.testnet.chain.robinhood.com'
export DEPLOYER_PRIVATE_KEY='0x...testnet-only-key...'
export OWNER_ADDRESS='0x...final-owner...'
export TREASURY_ADDRESS='0x...fee-recipient...'
export VERIFY=1
corepack pnpm contracts:deploy:testnet
```

The script:

1. refuses any chain other than `46630`;
2. verifies bytecode exists at the official PoolManager and V4Quoter addresses;
3. deploys `PermRouter` with policy v1;
4. deploys `PermV4Adapter` bound to the router and PoolManager;
5. enables only the adapter's `UNISWAP_V4_DIRECT` provider ID;
6. writes addresses and transaction hashes to `deployments/robinhood-testnet.json`; and
7. optionally verifies both contracts on Blockscout.

If the final owner differs from the deployer, ownership uses OpenZeppelin's two-step transfer. The final owner must call `acceptOwnership()` on both contracts before the release gate is complete.

## Post-deployment checks

- Confirm both contracts are source-verified.
- Confirm `feePolicies(1)` returns `20`, `2500`, `true`, `true`.
- Confirm the configured adapter provider ID is enabled.
- Confirm treasury and owner/pending owner.
- Execute a small ETH-to-test-asset trade and the reverse.
- Confirm output, fee, rebate, gas, recipient, and log identity in `/proofs`.
- Keep hooked candidates disabled until their exact deployment, permissions, quote behavior, and execution data are reviewed.

## Mainnet prohibition

The testnet manifest must not be reused for Robinhood Chain mainnet. Mainnet requires a separate address book, dedicated infrastructure, independent audit, deployment review, transaction simulation, and release approval.
