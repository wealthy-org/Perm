# Perm

Perm adalah antarmuka dan Router exact-input untuk membandingkan rute Uniswap v4, Synthra v3, multi-hop, dan—hanya jika benar-benar tersedia—Aggregator Hooks yang sudah diverifikasi di Robinhood Chain Testnet.

> **Status rilis:** manifest resmi masih menunjuk Router v1 dan release execution tetap fail-closed. Router v2 sudah live hanya sebagai staging testnet non-release yang dibatasi allowlist di `https://perm-iota.vercel.app`; Router dan kedua adapternya sudah source-verified, tetapi memakai governance satu EOA dan local testnet burner signer. Alamat, codehash, source links, serta transaksi E2E direct-v4 dipublikasikan di [`deployments/robinhood-testnet.v2-staging.json`](deployments/robinhood-testnet.v2-staging.json). Aggregator Hook tetap dinonaktifkan.

Semua token adalah fixture testnet tanpa nilai. Simbol seperti NVDA, AAPL, TSLA, dan lain-lain bukan saham, bukan klaim kepemilikan, dan tidak menyatakan afiliasi dengan issuer.

## Yang sudah diimplementasikan

### Kontrak Router v2

- quote EIP-712 domain `Perm`, versi `2`;
- binding account, pair, input, minimum output, recipient, expiry, waktu quote, policy, chain, referrer, dan route hash;
- larangan replay, quote basi/masa depan, self-referral, dan chain mismatch;
- hingga empat step rute yang kontinu;
- adapter v4 dan Synthra v3 yang dibatasi;
- Permit2 signature transfer atau approval exact;
- pull-payment treasury/referral;
- reserve-safe rescue native/ERC-20;
- pause guardian terpisah dari owner/timelock;
- bukti `RouteStepSettled` dan `SwapSettled`;
- provider ID terpisah untuk v4 direct dan Aggregator Hook;
- codehash hook diperiksa ulang setiap swap.

### Routing/API

- registry pool v4 otomatis dari event `PoolManager.Initialize`;
- discovery incremental, finalized, dan reorg-aware;
- pool Synthra v3 dicari lewat factory pada fee tier yang direview;
- ETH↔token dan token↔token melalui ETH/WETH;
- ranking berdasarkan output setelah estimasi gas dalam unit output token;
- estimasi price impact dari requote ukuran kecil;
- policy fee dibaca dari router resmi;
- token decimals dicek ke chain;
- rate limit, TTL cache, dan in-flight RPC coalescing;
- hook mode fail-closed jika deployment hook belum terbukti;
- receipt API terkunci ke router manifest resmi;
- history via PostgreSQL indexer dengan fallback scan bounded.

### UX produk

- injected wallet dan WalletConnect QR opsional;
- routing mode Best, V4 only, Synthra v3, dan Verified hooks;
- custom slippage dan warning price impact;
- balance serta cadangan gas untuk MAX native;
- stale-input guard: tombol tidak dapat memakai quote lama;
- requote setelah approval;
- simulasi transaksi sebelum wallet submission;
- ZGuard pre-sign gate default-on dan fail-closed sebelum setiap swap (lihat bagian ZGuard);
- exact approval atau Permit2;
- route comparison, step evidence, dan official proof explorer;
- setup browser hanya untuk development—tidak dapat mengubah alamat production.

### Operasional dan keamanan

- candidate manifest tidak pernah otomatis mengganti manifest resmi;
- Blockscout verification, timelock ownership plan, verifier, dan promotion gate;
- deployment/config/indexer monitor dengan webhook opsional;
- CI audit dependency, lint/typecheck, unit/security, fuzz/invariant, Solidity coverage, PGlite dan PostgreSQL 17, build, serta Slither;
- scheduled pool discovery PR;
- scheduled indexer, latest-state fork integration, dan deployment rehearsal.

## ZGuard pre-sign gate (default-on)

Setiap swap di `/trade` diperiksa [ZGuard](https://zguard-delta.vercel.app) **sebelum** wallet menandatangani. Ini menutup gap C8 / brief §9.5 di repo ZGuard.

Alur:
1. Browser meng-encode `swapExactInput` lalu mengirim **hanya byte transaksi** (`from`, `to`, `data`, `value`) ke `POST /api/zguard`.
2. Route server membangun ulang request ZGuard dengan builder yang sama (`lib/zguard/request.ts`). Route hanya menerima transaksi ke Router resmi di chain aktif, dan hanya fungsi `swapExactInput`. Request lalu diteruskan ke `POST /v1/guard` memakai API key milik server; key ini tidak pernah sampai ke browser.
3. ZGuard menjalankan quote parity (calldata di-encode ulang byte-per-byte), simulasi RHC (`eth_simulateV1`, output ≥ `minAmountOut`), dan token risk pada token output.
4. Browser menghitung `payload_hash` dari byte yang sama, lalu memanggil wallet **hanya jika** keputusannya `allow`, hash-nya cocok, dan verdict belum kedaluwarsa. Byte yang dikirim ke wallet adalah byte yang diperiksa.

Fail-closed: `deny`, `abstain`, hash mismatch, verdict kedaluwarsa, ZGuard tidak terjangkau, kredit habis, atau key kosong semuanya berarti swap tidak dikirim. Tombol Swap juga dinonaktifkan dan muncul banner merah.

| Env (server) | Default | Arti |
|---|---|---|
| `PERM_ZGUARD_MODE` | `enforce` | Hanya string persis `off` yang mematikan gate; halaman lalu menampilkan banner merah **UNGUARDED** |
| `PERM_ZGUARD_API_URL` | `https://zguard-delta.vercel.app` | Base URL API ZGuard (wajib https, kecuali localhost) |
| `PERM_ZGUARD_API_KEY` | (kosong) | `zg_live_…` yang punya kredit; tiap swap memakai 1 panggilan `/v1/guard` |
| `PERM_ZGUARD_TIMEOUT_MS` | `15000` | Timeout upstream (2000–30000) |

Catatan testnet: token fixture Perm yang owner-mintable (NVDA·T, AAPL·T, SPCX·T, OPENAI·T, ANTHROPIC·T) ditolak ZGuard dengan `T-MINT`. Itu temuan risiko yang benar, bukan bug, jadi tidak ada bypass. Token saham Robinhood testnet (TSLA, AMZN, PLTR, NFLX, AMD) lolos token risk.

Test: `pnpm test:zguard` (juga ikut di `server:test` dan `check`).

## Halaman

- `/trade` — quote dan settlement multi-venue.
- `/routes` — perbandingan kandidat rute dan step.
- `/rebate` — kalkulator policy fee integer onchain.
- `/proofs` — receipt resmi dan indexed wallet history.
- `/setup` — deployment development atau status release manifest.
- `/docs` — penjelasan batas keamanan.

## Quick start

Node `22.12+` direkomendasikan.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env.local
corepack pnpm dev
```

Production build:

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm start
```

Konfigurasi minimum memakai RPC publik dari manifest. Untuk WalletConnect:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID='your-project-id'
```

Injected wallets tetap tersedia tanpa WalletConnect.

## Quote signing

Mode lokal untuk pengembangan dapat memakai `PERM_QUOTE_SIGNER_PRIVATE_KEY`, tetapi release bersama wajib memakai remote signer KMS/HSM yang non-exportable:

```bash
PERM_QUOTE_SIGNER_MODE=remote
QUOTE_SIGNER_ADDRESS='0x...'
PERM_QUOTE_SIGNER_URL='https://signer.example/...'
PERM_QUOTE_SIGNER_TOKEN='server-only credential'
```

Alamat signer harus sama dengan `PermRouter.quoteSigner()`. Service membatasi stream respons, menolak redirect/content-type yang salah, memulihkan setiap signature EIP-712, dan menolak identitas/signature yang tidak cocok. Key maupun credential tidak boleh memakai prefix `NEXT_PUBLIC_` atau masuk repository. Health execution menolak mode raw-key. Sebelum release, jalankan `pnpm --silent release:probe-signer` terhadap KMS/HSM nyata dan ikat SHA-256 log tanpa signature itu ke attestation custody.

Untuk mainnet 4663 mode `allowlisted-mainnet` (rekaman/showcase), signer remote siap-deploy ada di `services/quote-signer/` dan langkah lengkapnya di [`docs/MAINNET_RUNBOOK.md`](docs/MAINNET_RUNBOOK.md): deploy kontrak, signer, env Vercel, allowlist, dan smoke test.

Mode release resmi tetap tidak akan menandatangani quote executable selama manifest resmi masih Router v1. Pengecualian hanya berlaku pada mode eksplisit `allowlisted-testnet-staging`: server menandatangani quote untuk akun allowlist dengan burner signer testnet, selalu melaporkan `executionReady: false`, dan tidak dapat memenuhi gate rilis.

## Durable indexer

Siapkan PostgreSQL:

```bash
DATABASE_URL='postgres://...'
corepack pnpm indexer:run
```

Untuk worker kontinu:

```bash
DATABASE_URL='postgres://...' corepack pnpm indexer:watch
```

Schema dibuat dari `indexer/schema.sql`. `/api/history` otomatis memilih indexer jika database dikonfigurasi. Set `PERM_REQUIRE_INDEXER=1` hanya setelah cursor sudah current.

## Pool discovery

Registry tersimpan di `deployments/v4-pools.json`.

```bash
corepack pnpm pools:discover
```

Script membaca hanya block finalized, mengulang overlap untuk menangani reorg, dan mempertahankan pool direct. Pool ber-hook hanya masuk jika hook ada dalam daftar review manifest atau `PERM_VERIFIED_HOOKS`; eksekusi tetap membutuhkan codehash onchain yang cocok.

## Test dan security gates

```bash
corepack pnpm contracts:compile
corepack pnpm contracts:export
corepack pnpm contracts:test
```

Suite mencakup:

- quote palsu, mutation, replay, stale/future/expired, wrong chain;
- self-referral;
- multi-hop dan provider evidence;
- hook provider fail-closed;
- real/palsu Permit2 path;
- treasury yang menolak ETH;
- reserve dan rescue native/ERC-20;
- fee-on-transfer token;
- fee 0, rebate 100%, dust rounding;
- min-output rollback dan reentrancy;
- adapter/hook codehash boundaries;
- runtime artifact integrity;
- 1.024 input fuzz dan randomized accounting invariants.

Latest-state integration:

```bash
unset FORK_BLOCK_NUMBER
corepack pnpm contracts:test:fork
```

Test ini menjalankan swap dua arah melalui PoolManager v4 dan Synthra v3 asli, termasuk Permit2 asli. RPC publik tidak menjamin historical state; gunakan `FORK_BLOCK_NUMBER` hanya bersama archive RPC atau saat sengaja menyegarkan fixture.

Read-only compatibility terhadap candidate Aggregator Hook chain `4663` dan same-state output/gas comparison dijalankan terpisah:

```bash
corepack pnpm contracts:test:mainnet-hook
corepack pnpm contracts:compare:mainnet-hook
```

Kedua command hanya berjalan pada local Hardhat fork, memakai provider identity `UNAPPROVED_MAINNET_HOOK_COMPATIBILITY`, dan tidak mengirim transaksi mainnet atau mengizinkan hook admission. Hasil perbandingan ada di [`docs/TRADE_COMPARISON.md`](docs/TRADE_COMPARISON.md).

Static analysis:

```bash
python -m pip install slither-analyzer==0.11.3
slither . --exclude-dependencies --filter-paths 'contracts/src/mocks|contracts/test'
```

Aggregate application gate (lint, typecheck, contracts, server runtime, PGlite schema, dan build):

```bash
corepack pnpm check
```

Solidity coverage dan PostgreSQL asli dijalankan terpisah:

```bash
corepack pnpm contracts:coverage
corepack pnpm contracts:coverage:test-hook
PGSSLMODE=disable TEST_DATABASE_URL='postgres://.../perm_test' corepack pnpm indexer:test-postgres
```

Kedua gate coverage Solidity dijalankan di CI secara terpisah; test-hook chain `46630` tidak dikeluarkan dengan menurunkan threshold production.

## D4 test-hook evidence — non-official

Paket D4 untuk fixture berlabel `Perm test hook - not an official Aggregator Hook` dapat direhearsal tanpa transaksi publik:

```bash
corepack pnpm contracts:plan:test-hook
corepack pnpm contracts:rehearse:test-hook
```

Rehearsal bukan bukti live. Operasi live tetap pending tindakan manual dari clean committed checkout dengan key testnet-only yang dikonfigurasi lokal. Operasi itu menggunakan stack Router/adapter baru yang terisolasi, swap WETH→TSLA sebesar `0.000001–0.001 WETH`, membersihkan fee/balance, lalu mem-pause dan melepaskan ownership kedua kontrak agar stack membeku permanen. Ia tidak menyentuh manifest resmi/staging atau Production routing.

Baca seluruh irreversible effects, preflight, acknowledgement, failure handling, dan verifier read-only sebelum menjalankan apa pun: [`docs/TEST_HOOK_EVIDENCE.md`](docs/TEST_HOOK_EVIDENCE.md). Tidak ada private key, RPC credential, atau rehearsal hash yang boleh dianggap evidence D4.

## Deployment v2

Jangan mengganti `deployments/robinhood-testnet.json` secara manual. Alurnya:

1. preflight dan fork tests;
2. `corepack pnpm contracts:deploy:testnet` → candidate manifest;
3. selesaikan timelock minimum 48 jam dan `acceptOwnership()` untuk tiga kontrak;
4. tunggu semua source verified;
5. konfigurasi remote signer, primary/fallback RPC, PostgreSQL indexer, shared limiter, monitor, webhook, dan WalletConnect;
6. rekam dan verifikasi seluruh E2E, Aggregator Hook, hosted-operations, serta assurance evidence;
7. `corepack pnpm deployments:verify-candidate`;
8. promotion eksplisit dengan phrase dan alamat router yang cocok.

Lihat [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) untuk command dan rollback runbook lengkap.

Untuk swap Router-v2 nyata sebelum infrastruktur release tersedia, gunakan hanya mode staging non-release yang dibatasi allowlist di [`docs/ALLOWLISTED_STAGING.md`](docs/ALLOWLISTED_STAGING.md). Mode itu tidak mengubah manifest resmi, tidak mengaktifkan Aggregator Hook, dan tidak memenuhi health gate produksi. Status feature-by-feature terhadap gap analysis 20 Nov tercatat di [`docs/GAP_20NOV_CLOSURE.md`](docs/GAP_20NOV_CLOSURE.md). Pemetaan commit dan langkah pengujian lengkap tersedia di [`docs/FEATURE_COMMITS_AND_TESTING.md`](docs/FEATURE_COMMITS_AND_TESTING.md).

Browser `/setup` dapat deploy stack development hanya ketika `NODE_ENV !== production`. Runtime code dibandingkan dengan template kompilasi setelah hanya compiler-declared immutable slots dinormalisasi; nilai immutable kemudian diperiksa lewat getter onchain.

## Monitoring

```bash
corepack pnpm monitor:testnet
```

Monitor memeriksa:

- chain dan block freshness;
- bytecode di semua target;
- owner/pending owner, treasury, signer, guardian, pause;
- policy dan adapter/provider registry;
- immutable venue targets;
- source/timelock release warnings;
- cursor dan lag indexer jika database tersedia.

Set `PERM_ALERT_WEBHOOK_URL` untuk critical alert. Warning rutin hanya dikirim jika `MONITOR_ALERT_WARNINGS=1`.

## Struktur penting

```text
app/api/quote/route.ts                  Route discovery, ranking, EIP-712 signing
app/api/receipts/route.ts               Official receipt decoder
app/api/history/route.ts                Indexed history + bounded chain fallback
components/TradeApp.tsx                 Transaction UX and safeguards
components/ProofExplorer.tsx            Receipt/history UI
components/DeploymentSetup.tsx          Development deployment verification
contracts/src/PermRouter.sol            Router v2
contracts/src/adapters/PermV4Adapter.sol
contracts/src/adapters/PermV3Adapter.sol
contracts/src/PermTimelock.sol
contracts/test/                         Unit, fuzz, invariant, artifact, fork suites
contracts/scripts/deploy.cjs            Candidate deployment and post-checks
contracts/scripts/prepare-ownership.cjs Timelock acceptance calldata
scripts/discover-pools.cjs              Persistent pool discovery
scripts/indexer.cjs                     PostgreSQL settlement indexer
scripts/monitor.cjs                     Release deployment/indexer monitor
scripts/monitor-staging.cjs             Allowlisted-staging operations monitor
scripts/verify-candidate.cjs            Onchain + Blockscout release verifier
scripts/promote-deployment.cjs           Explicit official-manifest promotion
deployments/robinhood-testnet.json      Official Router v1 manifest (until promotion)
deployments/robinhood-testnet.v2-staging.json Public non-release v2 deployment record
deployments/v4-pools.json               Event-discovered v4 registry
indexer/schema.sql                      Durable history schema
```

## Batas rilis

- Tidak ada Aggregator Hook testnet yang sudah ditetapkan sebagai official saat ini.
- Hook biasa/nonzero tidak otomatis disebut verified.
- Source Router v2 staging dan kedua adapternya sudah verified exact-match; itu tidak mengubah statusnya menjadi release.
- Manifest resmi masih Router v1. Staging v2 masih memakai satu EOA, burner signer, allowlist, dan hosted operations yang belum lengkap.
- Audit independen, bug bounty, governance review, dan release mainnet terpisah masih wajib sebelum aset bernilai.

## Referensi

- Robinhood Chain deployment: <https://docs.robinhood.com/chain/deploy-smart-contracts/>
- Uniswap v4 deployments: <https://developers.uniswap.org/docs/protocols/v4/deployments>
- Synthra deployment reference: <https://docs.sherwood.sh/reference/deployments>
