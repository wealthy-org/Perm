# Perm

A branded frontend prototype for Perm: hook-aware route comparison, transparent platform-fee rebate accounting, and settlement-proof UX.

## Included

- Scroll-linked original Three.js journey in the Perm green/cyan colorway
- Responsive landing page with synchronized story cards and sticky capability stack
- Interactive `/trade` quote prototype with:
  - searchable token picker using locally bundled official token marks
  - best-result and explicit v4-only modes
  - route candidates and verified-hook labeling
  - gross Perm fee, fee rebate, net Perm fee, minimum received, and gas breakdown
  - clear demo / non-executable state
- Bright, animated product pages for `/routes`, `/rebate`, and `/proofs`
- `/docs` implementation notes based on `PERM_V4_DIFFERENTIATION_ADDENDUM.md`
- Original 48-second background loop, **Circular Current**, composed for Perm without third-party samples
- Icon-only X links point to [@usepermonx](https://x.com/usepermonx)

## Run locally

Requirements: Node.js 20.9+ with Corepack

```bash
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Production check:

```bash
pnpm typecheck
pnpm build
pnpm start
```

## Important scope note

The trade screen is intentionally an interface preview. It does not fabricate deployment addresses, live liquidity, wallet execution, or verified Aggregator Hook coverage. Enabling execution requires Perm-owned deployment configuration, reviewed adapter targets, quote integration, approval / Permit2 flows, simulation, and the acceptance tests in the addendum.

## Project files

- `components/Landing.tsx` — scroll journey and product narrative
- `lib/perm-scene.ts` — original WebGL environment and camera path
- `components/TradeApp.tsx` — interactive routing / fee prototype and token picker
- `components/RouteExplorer.tsx` — illustrative route-candidate catalog
- `components/RebateCalculator.tsx` — transparent router-fee accounting preview
- `components/ProofExplorer.tsx` — demonstration settlement receipts
- `app/docs/page.tsx` — concise technical notes
- `public/tokens/` — locally bundled token marks with provenance in `THIRD_PARTY_NOTICES.md`
- `public/audio/perm-circular-current.wav` — original ambient loop
- `PERM_V4_DIFFERENTIATION_ADDENDUM.md` — source product brief
