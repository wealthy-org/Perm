# Perm — Robinhood Chain Testnet

Perm adalah antarmuka routing exact-input untuk **Robinhood Chain Testnet** yang menggabungkan quote Uniswap v4 terverifikasi, rebate dari fee platform Perm, eksekusi melalui adapter terbatas, serta receipt berbasis event onchain.

> **Status saat ini:** PermRouter dan PermV4Adapter sudah dipublikasikan di Robinhood Chain Testnet, dimasukkan ke manifest bersama, dan diuji dengan settlement nyata untuk input ETH maupun ERC-20. Dua event-backed receipt sudah diverifikasi dari transaction log. Verifikasi source Blockscout, dedicated RPC/indexing, dan audit independen masih menjadi release gate; aplikasi ini belum boleh disebut production-ready atau digunakan untuk dana mainnet.

## Ringkasan status

Keterangan:

- ✅ **Selesai** — sudah diimplementasikan dan diuji.
- 🟡 **Sebagian selesai / external gate** — implementasi atau evidence utama tersedia, tetapi masih memerlukan verifikasi/infrastruktur eksternal.
- ⛔ **Belum tersedia** — tidak boleh diklaim di UI atau dokumentasi pemasaran.

| Area | Status | Keterangan |
|---|---:|---|
| Landing page dan animasi perjalanan | ✅ | Three.js, gerakan kamera terpusat, responsive, dan horizon tanpa garis hitam. |
| Wallet EVM | ✅ | Connect, baca account, tambah/pindah ke chain `46630`, dan error yang dapat ditindaklanjuti. |
| Quote Uniswap v4 | ✅ | Quote live melalui V4Quoter; kandidat gagal/revert tidak ditampilkan sebagai valid. |
| Katalog pool | ✅ Terbatas | Lima pool no-hook yang tersimpan; hanya hasil quote onchain yang berhasil dianggap valid. |
| Fee policy v1 | ✅ | Gross fee 20 bps, rebate 25% dari gross fee, net fee 15 bps. |
| Quote binding | ✅ | Account, adapter, pair, amount, minimum output, recipient, timing, policy, chain, referrer, dan route data masuk ke `quoteId`. |
| `PermRouter` | ✅ | Exact-input, slippage guard, replay protection, fee accounting, pause, referral, dan receipt event. |
| `PermV4Adapter` | ✅ | Satu PoolManager immutable, single-pool exact-input, tanpa arbitrary target/calldata. |
| Approval ERC-20 | ✅ | Exact amount; allowance ke adapter dibersihkan setelah eksekusi. |
| Simulasi sebelum transaksi | ✅ | `simulateContract` dijalankan sebelum wallet mengirim settlement. |
| Deployment dari browser | ✅ | `/setup` men-deploy dua kontrak dan mengaktifkan adapter tanpa membagikan private key. |
| Deployment publik testnet | ✅ | Router `0x3e35…114d` dan adapter `0xC4Df…93D0` aktif dari manifest bersama; bytecode/configuration diverifikasi onchain. |
| Swap wallet end-to-end | ✅ | ETH → NVDA:T dan NVDA:T → ETH berhasil, termasuk exact approval ERC-20, simulasi, settlement, dan allowance kembali ke nol. |
| Receipt transaksi nyata | ✅ | Dua `SwapSettled` nyata berhasil didecode dari transaction log dan ditampilkan di `/proofs`. |
| Verifikasi source Blockscout | 🟡 | Runtime bytecode cocok dengan hasil kompilasi lokal; publikasi source metadata di explorer masih pending. |
| Aggregator Hook terverifikasi | ⛔ | Belum ada kandidat Robinhood testnet yang identitas dan integrasinya dapat diverifikasi. |
| Uniswap V2/V3 testnet | ⛔ | Alamat V2/V3 yang direview tidak memiliki bytecode di chain `46630`. |
| Split routing | ⛔ | Belum diimplementasikan dan tidak boleh diiklankan. |
| Audit independen/mainnet | ⛔ | Belum dilakukan; kontrak hanya ditujukan untuk testnet. |

## Fitur yang sudah tersedia

### 1. Antarmuka dan halaman

- `/` — perjalanan visual dan penjelasan produk.
- `/trade` — wallet, balance, quote, approval, simulasi, settlement, dan penyimpanan hash receipt.
- `/routes` — perbandingan kandidat yang berhasil di-quote onchain.
- `/rebate` — kalkulator integer/base-unit untuk policy v1.
- `/proofs` — verifikasi transaksi dan decoding event `SwapSettled`.
- `/docs` — batasan arsitektur, hook, fee, receipt, dan acceptance criteria.
- `/setup` — deployment dengan browser wallet.

### 2. Quote dan binding

API `/api/quote`:

1. menerima pair, exact input, dan slippage;
2. menghitung gross fee, rebate, net fee, serta routed input;
3. meminta quote dari V4Quoter yang benar-benar ter-deploy;
4. membuang kandidat yang revert atau menghasilkan output tidak valid;
5. mengembalikan output, minimum received, pool key, route data, block, dan gas secara terpisah; dan
6. membentuk `quoteId` dari seluruh parameter penting eksekusi.

`PermRouter` menghitung ulang binding tersebut. Perubahan account, recipient, amount, minimum output, deadline, policy, adapter, referrer, atau route data akan ditolak.

### 3. Fee policy v1

Semua perhitungan memakai integer base units dan pembulatan ke bawah:

```text
grossFee   = floor(amountIn × 20 / 10,000)
rebate     = floor(grossFee × 2,500 / 10,000)
netFee     = grossFee − rebate
routedInput = amountIn − netFee
```

Artinya:

- gross Perm fee: **20 bps / 0,20%**;
- rebate: **25% dari gross fee**, setara nominal 5 bps;
- net Perm fee: **15 bps / 0,15%**.

### 4. Batas keamanan kontrak

- hanya adapter yang diaktifkan owner yang dapat digunakan;
- adapter tidak menerima arbitrary spender, target, atau provider calldata;
- PoolManager bersifat immutable;
- hook nonzero harus diverifikasi secara eksplisit;
- non-empty hook data ditolak;
- exact native value dan exact ERC-20 balance delta diperiksa;
- fee-on-transfer input ditolak;
- minimum output diperiksa terhadap jumlah aktual yang diterima recipient;
- replay protection terikat account;
- amount dibatasi agar kompatibel dengan signed `int128` v4;
- allowance adapter dibersihkan setelah pemakaian;
- terdapat reentrancy guard dan emergency pause; dan
- kegagalan transaksi me-roll back fee, quote consumption, allowance, serta receipt state.

## Fitur dan release gate yang belum selesai

1. **Verifikasi source Blockscout** — runtime bytecode telah dicocokkan dengan build lokal, tetapi source metadata belum dipublikasikan di explorer.
2. **Aggregator Hook** — tetap dinonaktifkan sampai deployment, permission, quote behavior, dan execution path dapat diverifikasi.
3. **V2/V3 coverage** — tidak tersedia di target testnet yang sedang dipakai.
4. **Split routing** — belum ada pembagian input lintas pool/provider.
5. **Production RPC/indexer** — public RPC hanya cocok untuk pengembangan dan dapat terkena rate limit.
6. **Audit independen dan mainnet release** — belum dilakukan.

## Konfigurasi jaringan

| Item | Nilai |
|---|---|
| Network | Robinhood Chain Testnet |
| Chain ID | `46630` |
| Gas token | Testnet ETH |
| RPC default | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |
| Uniswap v4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| Uniswap v4 V4Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` |
| PermRouter | `0x3e350b79D4983a0e86Ad4eE25dB1DBBbfB55114d` |
| PermV4Adapter | `0xC4Df49493a828F681160056cb6D46143B56593D0` |
| Owner / treasury | `0x141DB8c1C42B0fa5b13eE17136e4E037597886a8` |
| Deployment block | `154833178` |

Runtime bytecode kedua kontrak cocok dengan hasil kompilasi lokal. Policy v1, immutable PoolManager/router, owner, treasury, provider ID, dan adapter enablement juga sudah dibaca ulang dari chain. Source metadata Blockscout masih pending.

Semua token non-ETH pada UI adalah aset testnet tanpa nilai moneter. Nama/simbolnya tidak menyatakan kepemilikan saham, afiliasi issuer, atau harga pasar nyata.

### Evidence deployment dan settlement

Deployment transactions:

- PermRouter: `0x1654e9dc382f6e1e743302d0e2ca19dcddc129ddfb65a2a39a9d051794e94daf`;
- PermV4Adapter: `0xd8a418addfb4f9aef8d8271a02d75deb8590d49f810fa81f92a033f649867c80`;
- enable `UNISWAP_V4_DIRECT`: `0x0ded432bd75ce8637b99b6349c7c641db65e3e3c0f1e05a458fe4782305cceeb`.

Wallet E2E evidence:

- ETH → NVDA:T settlement: `0xf76cdc7e4c1d20b43b5d7bfb62314599b78355b55f5965b41d6553126e5ab60b`;
- exact NVDA:T approval: `0xb7397a5bcaef65fccb911809469e70468f7469fe8ea74b610aaf36eca5123dbe`;
- NVDA:T → ETH settlement: `0x17b294d4b5c212f83c8ea4536e9d2fd4f5b650a34297d46db2e5c27e59ab9904`.

Kedua settlement berstatus sukses, memakai provider `UNISWAP_V4_DIRECT`, tidak mengklaim hook, menghasilkan `SwapSettled`, dan dapat didecode oleh `/api/receipts`. Approval ERC-20 tepat sebesar input dan allowance kembali menjadi nol setelah settlement.

## Menjalankan aplikasi secara lokal

### Prasyarat

- Node.js `20.9` atau lebih baru;
- Corepack;
- browser modern;
- wallet EVM hanya diperlukan untuk pengujian koneksi/deployment/transaksi.

### Instalasi

```bash
corepack pnpm install --frozen-lockfile
cp .env.example .env.local
corepack pnpm dev
```

Buka:

```text
http://localhost:3000
```

Untuk penggunaan lokal biasa, field private key di `.env.local` harus tetap kosong. Jangan pernah memasukkan seed phrase atau private key wallet bernilai nyata ke repository.

## Tata cara testing

### 1. Pemeriksaan otomatis utama

Jalankan:

```bash
corepack pnpm check
```

Perintah tersebut menjalankan:

1. TypeScript typecheck;
2. unit/security tests kontrak; dan
3. production build Next.js.

Hasil yang diharapkan pada versi ini:

- **18 unit/security tests passed**;
- fork test ditandai pending pada suite biasa karena hanya aktif dengan flag khusus;
- seluruh route Next.js berhasil dibangun.

### 2. TypeScript

```bash
corepack pnpm typecheck
```

Expected: exit code `0`, tanpa error TypeScript.

### 3. Compile kontrak

```bash
corepack pnpm contracts:compile
```

Expected: `PermRouter`, `PermV4Adapter`, interfaces, dan mocks berhasil dikompilasi.

Jika source kontrak berubah, perbarui artifact deployment browser:

```bash
corepack pnpm contracts:export
```

File runtime yang diperbarui:

```text
lib/web3/artifacts/PermRouter.json
lib/web3/artifacts/PermV4Adapter.json
```

### 4. Unit dan security tests

```bash
corepack pnpm contracts:test
```

Coverage utama:

- fee 0 dan rebate 0%/100%;
- policy v1 20 bps/25%;
- dust rounding;
- referral distribution;
- native input/output;
- stale, expired, dan wrong-chain quote;
- account-bound replay protection;
- recipient/amount/minimum/deadline/policy/route binding;
- disabled dan unconfigured adapter;
- exact allowance dan allowance rollback;
- fee-on-transfer input/output behavior;
- minimum received;
- reentrancy;
- revert rollback;
- pause; dan
- malicious/unknown hook serta hook calldata.

Expected: **18 passing**.

### 5. Fork integration test

Fork test dipin ke block `154719917` agar hasilnya dapat direproduksi.

```bash
corepack pnpm contracts:test:fork
```

Atau:

```bash
RUN_FORK_TESTS=1 corepack pnpm hardhat test contracts/test/PermV4Fork.test.cjs
```

Test ini menjalankan:

1. deployment lokal PermRouter dan PermV4Adapter pada fork;
2. konfigurasi adapter;
3. swap ETH → NVDA test asset;
4. fee/rebate router; dan
5. swap NVDA test asset → ETH.

Expected: **1 passing**.

Jika public RPC tidak menyediakan state historis atau terkena rate limit, gunakan endpoint Robinhood testnet khusus:

```bash
export RH_TESTNET_RPC_URL='https://endpoint-testnet-anda'
corepack pnpm contracts:test:fork
```

### 6. Production build dan smoke test

```bash
corepack pnpm build
corepack pnpm start --hostname 0.0.0.0 --port 3000
```

Di terminal lain:

```bash
for path in / /trade /routes /rebate /proofs /docs /setup; do
  curl -sS -o /dev/null -w "${path} %{http_code}\n" "http://localhost:3000${path}"
done
```

Expected: seluruh halaman mengembalikan HTTP `200`.

### 7. Smoke test quote API

`amountIn` menggunakan base units. Contoh berikut meminta quote `0.001 ETH → NVDA`:

```bash
curl -sS -X POST http://localhost:3000/api/quote \
  -H 'content-type: application/json' \
  --data '{
    "tokenIn": "ETH",
    "tokenOut": "NVDA",
    "amountIn": "1000000000000000",
    "slippageBps": 50
  }'
```

Periksa bahwa response memiliki:

- `chainId: 46630`;
- `policyVersion: 1`;
- `grossFee`, `rebate`, `netFee`, dan `routedInput`;
- `blockNumber` serta freshness metadata;
- minimal satu `candidate` yang berhasil;
- `selected.pool`, `selected.routeData`, dan `selected.minAmountOut`;
- gas yang terpisah dari token output;
- `executable: true`; dan
- adapter `0xC4Df49493a828F681160056cb6D46143B56593D0` dari manifest bersama.

HTTP `503` berarti quote live gagal, biasanya karena RPC rate limit atau kandidat sedang tidak dapat disimulasikan. Aplikasi tidak membuat fallback quote palsu.

### 8. Manual UI test dengan deployment testnet

#### Landing page

1. Buka `/`.
2. Pastikan tidak ada garis hitam di horizon.
3. Scroll dari atas ke bawah.
4. Pastikan kamera bergerak maju pada sumbu tengah dan setiap stage tetap terlihat.
5. Uji tombol sound, menu, dan navigasi.

#### Trade

1. Buka `/trade` tanpa wallet dan pastikan quote live tetap muncul.
2. Hubungkan wallet khusus testnet pada chain `46630`.
3. Ganti token dan jumlah input.
4. Uji token selector, flip pair, slippage, recipient, dan refresh quote otomatis.
5. Pastikan banner menyatakan live testnet execution, settlement gate `READY`, dan adapter berasal dari manifest.
6. Untuk input ERC-20, pastikan approval tepat sebesar input dan bukan unlimited.

#### Routes

1. Buka `/routes`.
2. Klik `Refresh`.
3. Pastikan hanya kandidat yang berhasil di-quote yang berstatus valid.
4. Pastikan no-hook route tidak diberi label hook-powered.

#### Rebate

1. Buka `/rebate`.
2. Masukkan `1 ETH`.
3. Expected policy v1:
   - gross fee: `0.002 ETH`;
   - rebate: `0.0005 ETH`;
   - net fee: `0.0015 ETH`.
4. Uji amount kecil untuk memastikan dust dibulatkan ke bawah.

#### Proofs

1. Buka `/proofs`.
2. Verifikasi dua settlement hash pada bagian evidence dan pastikan count valid menjadi `02`.
3. Periksa actual input/output, routed input, fee, rebate, gas, recipient, policy, block, tx hash, dan log index.
4. Masukkan hash acak; aplikasi harus menandainya `INVALID` dan tidak menaikkan receipt count.

#### Responsive

Uji minimal pada:

- desktop `1440 × 900`;
- tablet `768 × 1024`;
- mobile `390 × 844`.

Pastikan tidak ada horizontal document overflow, elemen terpotong, atau error console.

### 9. Menguji deployment dengan browser wallet

> Gunakan wallet khusus testnet dan test ETH. Jangan gunakan wallet yang menyimpan aset mainnet.

1. Buka `/setup`.
2. Hubungkan wallet EVM.
3. Izinkan pindah/tambah Robinhood Chain Testnet.
4. Isi treasury address yang Anda kontrol.
5. Konfirmasi tiga transaksi terpisah:
   - deploy PermRouter;
   - deploy PermV4Adapter;
   - enable `UNISWAP_V4_DIRECT` adapter.
6. Tunggu pemeriksaan bytecode, policy v1, dan adapter state.
7. Export manifest.
8. Verifikasi source code di Blockscout sebelum penggunaan bersama.

Deployment browser awalnya disimpan di local storage browser tersebut. Deployment yang tercantum pada bagian evidence sudah diverifikasi, disalin ke `deployments/robinhood-testnet.json`, dan diuji kembali tanpa local config. Halaman `/setup` sekarang mengenali status `ACTIVE FROM PROJECT MANIFEST` dan tidak menawarkan deployment ulang.

### 10. End-to-end test setelah deployment

1. Connect wallet pada `/trade`.
2. Pastikan chain ID `46630`.
3. Pilih pair dan exact input kecil.
4. Periksa output, gross fee, rebate, net fee, minimum received, dan estimated network fee.
5. Untuk ERC-20 input, konfirmasi exact approval.
6. Pastikan simulasi berhasil.
7. Konfirmasi settlement transaction.
8. Tunggu status success.
9. Buka `/proofs`.
10. Verifikasi chain ID, tx hash, block/log index, provider, token, actual amount, fee, recipient, policy version, dan actual gas.

Jika transaksi revert, tidak boleh ada `SwapSettled` receipt atau klaim rebate.

## Deployment CLI

Baca panduan lengkap di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Contoh:

```bash
export RH_TESTNET_RPC_URL='https://rpc.testnet.chain.robinhood.com'
export DEPLOYER_PRIVATE_KEY='0x...testnet-only...'
export OWNER_ADDRESS='0x...owner...'
export TREASURY_ADDRESS='0x...treasury...'
export VERIFY=1

corepack pnpm contracts:deploy:testnet
```

Aturan keamanan:

- jangan kirim private key melalui chat;
- jangan commit `.env` atau `.env.local`;
- gunakan deployer khusus testnet;
- pastikan owner dan treasury adalah alamat yang dikontrol;
- jika owner berbeda dari deployer, owner harus menjalankan `acceptOwnership()` pada kedua kontrak; dan
- jangan memakai manifest testnet untuk mainnet.

## Troubleshooting

### `No EVM browser wallet detected`

Instal Robinhood Wallet, MetaMask, atau Rabby, lalu reload halaman.

### `Wrong network`

Klik network control dan izinkan aplikasi menambahkan/pindah ke Robinhood Chain Testnet (`46630`).

### `/api/quote` mengembalikan `503`

Periksa konektivitas RPC dan rate limit. Gunakan `RH_TESTNET_RPC_URL` khusus untuk hosting publik.

### `/api/receipts` mengembalikan `503`

Pastikan manifest memuat PermRouter `0x3e350b79D4983a0e86Ad4eE25dB1DBBbfB55114d`, lalu restart server. API sengaja tidak membuat receipt palsu ketika alamat Router tidak tersedia.

### Fork test gagal mengambil state

Gunakan RPC yang mendukung historical state pada block `154719917`, atau refresh block fixture secara sengaja setelah memvalidasi ulang pool.

### `corepack enable pnpm` gagal karena permission

Tidak perlu menjalankan `corepack enable`. Gunakan `corepack pnpm ...` langsung seperti contoh di README ini.

## Struktur penting repository

```text
app/api/quote/route.ts                 Live V4Quoter-backed quote API
app/api/receipts/route.ts              Confirmed SwapSettled decoder
components/TradeApp.tsx                Wallet, quote, approval, simulation, settlement
components/DeploymentSetup.tsx         Browser-wallet deployment
components/RouteExplorer.tsx           Live candidate catalog
components/RebateCalculator.tsx        Policy-v1 calculator
components/ProofExplorer.tsx           Event-backed proof UI
contracts/src/PermRouter.sol            Settlement dan fee policy
contracts/src/adapters/PermV4Adapter.sol Restricted v4 execution
contracts/test/PermRouter.test.cjs      Router/security tests
contracts/test/PermV4Adapter.test.cjs   Adapter/hook boundary tests
contracts/test/PermV4Fork.test.cjs      Pinned real-state fork integration
lib/web3/local-deployment.ts            Browser deployment state
lib/perm-scene.ts                       Landing WebGL scene dan camera path
deployments/robinhood-testnet.json      Shared deployment manifest
```

## Release checklist

Sebelum menyebut release testnet selesai:

- [x] TypeScript lulus.
- [x] Production build lulus.
- [x] 18 unit/security tests lulus.
- [x] Pinned V4 fork integration lulus dua arah.
- [x] Live V4 quote endpoint bekerja.
- [x] Responsive browser QA dilakukan.
- [x] PermRouter dipublikasikan di chain `46630`.
- [x] PermV4Adapter dipublikasikan di chain `46630`.
- [ ] Source kedua kontrak terverifikasi di Blockscout.
- [x] Ownership final aktif pada owner yang sama dengan deployer.
- [x] Swap wallet nyata berhasil untuk native dan ERC-20 input.
- [x] Exact ERC-20 approval berhasil dan allowance kembali ke nol.
- [x] Dua receipt `SwapSettled` diverifikasi dari transaction log.
- [ ] Dedicated RPC/indexing disiapkan untuk traffic publik.
- [ ] Audit independen selesai sebelum mainnet.

## Dokumentasi lanjutan

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/QA.md`](docs/QA.md)
- [`SECURITY.md`](SECURITY.md)
- [`PERM_V4_DIFFERENTIATION_ADDENDUM.md`](PERM_V4_DIFFERENTIATION_ADDENDUM.md)

## Referensi utama

- Robinhood Chain connection: <https://docs.robinhood.com/chain/connecting/>
- Robinhood contract deployment: <https://docs.robinhood.com/chain/deploy-smart-contracts/>
- Uniswap v4 deployments: <https://developers.uniswap.org/docs/protocols/v4/deployments>
- Uniswap v4 hooks: <https://developers.uniswap.org/docs/protocols/v4/concepts/hooks>
- Aggregator Hooks: <https://blog.uniswap.org/aggregator-hooks-are-now-live>
