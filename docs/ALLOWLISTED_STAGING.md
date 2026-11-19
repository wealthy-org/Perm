# Allowlisted Router-v2 staging

This path exists only to make real Router-v2 swaps usable on Robinhood Chain testnet before production infrastructure is available. It is **not a release**, is not a public demo, and does not satisfy remote-custody, fallback-RPC, indexer, shared-rate-limit, alerting, WalletConnect, governance, assurance, or green-CI release gates.

The official `deployments/robinhood-testnet.json` manifest remains the release boundary. A staging deployment must keep `executionReady: false` and must never be promoted with `scripts/promote-deployment.cjs`.

## Enforced boundary

- Chain is pinned to Robinhood testnet `46630`.
- The server and browser must both use the exact mode `allowlisted-testnet-staging`.
- Signed quotes are issued only when `PermQuote.account` is in `PERM_STAGING_WALLET_ALLOWLIST`; the router binds that account to `msg.sender`.
- A local burner quote key is accepted in a production-built staging runtime only when `PERM_QUOTE_SIGNER_MODE=staging-local` and `PERM_STAGING_ALLOW_BURNER_SIGNER=1` are both explicit.
- Burner custody is always reported as `custodyReady: false` and can never satisfy `/api/health?requireExecution=1`.
- Aggregator Hook mode is disabled. Staging accepts only the configured direct Uniswap-v4 and Synthra-v3 adapter identities, with the v4 hook-provider sentinel left at zero.
- The UI execution button remains disabled until a canonical allowlisted E2E settlement is recorded and rechecked by `/api/health?requireStaging=1`.

## 1. Create fresh testnet-only identities

Run once:

```sh
corepack pnpm staging:create-keys
```

This writes private values to ignored, mode-`0600` `.staging/keys.env` and writes funding addresses to `.staging/addresses.json`. Private keys are never printed. Never fund these addresses with mainnet assets, reuse them on another chain, or treat them as production custody.

The generated identities are:

- deployer / temporary staging owner, treasury, and pause guardian;
- separate burner quote signer; and
- separate canonical E2E transaction wallet.

Add the human tester wallet to `PERM_STAGING_WALLET_ALLOWLIST` as a comma-separated address. Keep the generated canonical E2E wallet in the list.

## 2. Fund only the required testnet addresses

Use the official faucet at `https://faucet.testnet.chain.robinhood.com/` (chain `46630`). At the time of this run it offers `0.01` testnet ETH plus five of each listed Stock Token per eligible address every 24 hours. Fund:

1. the generated deployer address for Router and adapter deployment gas; and
2. the generated canonical E2E wallet for one small native-ETH swap and gas.

The burner quote signer does not submit transactions and should not need funds.

## 3. Deploy the non-release contracts

Load the generated variables and deploy:

```sh
set -a
. .staging/keys.env
set +a
corepack pnpm contracts:deploy:staging
```

The script requires both `DEPLOYMENT_STAGING=1` and `CONFIRM_NON_RELEASE_STAGING=1`, permits a dirty worktree only for this non-release path, rejects reuse of the deployer as quote signer, deploys Router v2 plus direct v4/v3 adapters, leaves Aggregator Hook identity disabled, and writes ignored `deployments/robinhood-testnet.staging.json` with `executionReady: false`.

The production candidate path is unchanged: it still requires a clean commit, separate reviewed roles, multisig/timelock controls, and all release evidence.

## 4. Configure a separate hosted staging environment

A separate Vercel project or isolated Preview environment is strongly preferred. Do not overwrite the public production environment unless that choice is deliberate and the URL remains access-controlled operationally.

Set values from the staging manifest:

```dotenv
NEXT_PUBLIC_PERM_ROUTER_ADDRESS=<staging permRouter>
NEXT_PUBLIC_PERM_V4_ADAPTER_ADDRESS=<staging v4Adapter>
NEXT_PUBLIC_PERM_V3_ADAPTER_ADDRESS=<staging v3Adapter>
NEXT_PUBLIC_PERM_ROUTER_VERSION=2
NEXT_PUBLIC_PERM_DEPLOYMENT_BLOCK=<staging deploymentBlock>
NEXT_PUBLIC_PERM_EXECUTION_READY=0
PERM_EXECUTION_MODE=allowlisted-testnet-staging
NEXT_PUBLIC_PERM_EXECUTION_MODE=allowlisted-testnet-staging
PERM_STAGING_CHAIN_ID=46630
PERM_STAGING_WALLET_ALLOWLIST=<canonical E2E wallet>,<human tester wallet>
PERM_STAGING_ALLOW_BURNER_SIGNER=1
PERM_QUOTE_SIGNER_MODE=staging-local
PERM_QUOTE_SIGNER_PRIVATE_KEY=<fresh staging quote key>
QUOTE_SIGNER_ADDRESS=<staging quoteSigner>
PERM_AGGREGATOR_HOOKS_JSON=[]
NEXT_PUBLIC_PERM_STAGING_E2E_PASSED=0
PERM_STAGING_E2E_TX_HASH=
```

Keep the first hosted build at `NEXT_PUBLIC_PERM_STAGING_E2E_PASSED=0`. The quote API can serve the allowlisted bootstrap runner, but the browser button stays disabled.

## 5. Run the canonical staging E2E

Set `PERM_STAGING_URL` to the isolated HTTPS staging origin, load `.staging/keys.env`, and run:

```sh
set -a
. .staging/keys.env
set +a
PERM_STAGING_URL=https://your-staging-host.example corepack pnpm staging:run-e2e
```

The runner requests an allowlisted signed quote, rejects hook-backed or unknown provider steps, simulates the exact signed call, submits a small native-ETH Router-v2 swap, checks canonical `SwapSettled` and `RouteStepSettled` logs, writes ignored `.staging/e2e.json`, and keeps the staging manifest’s `executionReady` value false.

Copy only the returned transaction hash into the hosted environment:

```dotenv
PERM_STAGING_E2E_TX_HASH=<canonical transaction hash>
NEXT_PUBLIC_PERM_STAGING_E2E_PASSED=1
```

Redeploy staging. The public flag enables the UI only after the E2E run; the server independently rechecks the transaction, allowlisted sender, canonical block, direct provider IDs, zero hook address, and minimum confirmations.

## 6. Verify the two independent health boundaries

Expected staging check:

```text
GET /api/health?requireStaging=1 -> 200
status: staging-ready-non-release
stagingReady: true
executionReady: false
```

Expected production check, even on the staging host:

```text
GET /api/health?requireExecution=1 -> 503
executionReady: false
```

A `200` from the staging check must never be presented as production release readiness.

## Disable or rotate staging

To stop execution immediately, set `PERM_STAGING_ALLOW_BURNER_SIGNER=0`, remove the allowlist, or remove the staging-local key and redeploy. If a key may have leaked, pause the staging router, rotate the signer onchain, generate new testnet-only identities, and discard the old keys. Never promote staging evidence or burner identities into the official manifest.
