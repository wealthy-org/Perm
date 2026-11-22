import type { Metadata } from "next";
import Header from "@/components/Header";
import AudioToggle from "@/components/AudioToggle";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Protocol notes",
  description: "Perm hook-aware routing, fee rebate, accounting, and acceptance notes.",
};

const CHECKS = [
  { done: true, text: "Quote and execution use the same input-fee basis, integer rounding, and immutable policy version." },
  { done: true, text: "Zero fee, zero or 100% rebate, dust, referral sharing, native wrapping, and exact allowance cases are covered by contract tests." },
  { done: true, text: "Minimum output is enforced against the amount actually delivered to the recipient." },
  { done: true, text: "Fee, rebate, quote consumption, and receipt state roll back on revert; failed trades create no reward." },
  { done: true, text: "Only owner-approved adapters can execute; the v4 adapter targets one immutable PoolManager and clears exact approvals." },
  { done: true, text: "Unknown hooks and non-empty hook calldata are rejected; reentrancy, deadlines, and 120-second quote freshness are enforced." },
  { done: false, text: "Release evidence still needs one verified Aggregator Hook settlement on chain 46630; no official testnet candidate is currently verified." },
];

export default function DocsPage() {
  return (
    <main className="app-page docs-page light-app">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora docs-aurora" aria-hidden="true"><i /><i /><i /></div>

      <div className="docs-shell app-enter">
        <aside className="docs-nav">
          <span>PROTOCOL NOTES</span>
          <a href="#overview">Overview</a>
          <a href="#implementation">Implementation</a>
          <a href="#routing">Routing flow</a>
          <a href="#hooks">Hook boundary</a>
          <a href="#rebate">Fee rebate</a>
          <a href="#receipt">Proof receipt</a>
          <a href="#acceptance">Acceptance</a>
          <a href="#sources">Sources</a>
        </aside>

        <article className="docs-content">
          <div className="docs-status"><i /> Implementation dated 17 November 2026 · contracts compiled, unit-tested, and exercised against a Robinhood testnet fork</div>

          <header id="overview" className="docs-hero">
            <span className="section-kicker">PERM · DIFFERENTIATION V4</span>
            <h1>Routing that can use verified hooks. A platform fee that visibly comes down.</h1>
            <p>Perm keeps the multi-venue router baseline, then adds hook-aware route candidates and a settlement-time rebate funded from Perm&apos;s own platform fee.</p>
          </header>

          <section id="implementation" className="docs-section">
            <span className="section-kicker">IMPLEMENTED TESTNET PATH</span>
            <h2>Real contracts, real V4 state, no invented deployment.</h2>
            <div className="decision-grid">
              <article><span>01</span><h3>PermRouter v2</h3><p>EIP-712 authorization, up to four continuous steps, pull-fee reserves, Permit2, recipient minimum, replay protection, pause guardian, and event-backed evidence.</p></article>
              <article><span>02</span><h3>Restricted V4 adapter</h3><p>Immutable PoolManager, exact-input pool steps, full-spend verification, and runtime-codehash-pinned hooks with a distinct hook evidence identity.</p></article>
              <article><span>03</span><h3>Synthra V3 adapter</h3><p>Immutable reviewed Router02 and WETH targets, native wrapping, approved fee tiers, exact allowances, codehash checks, and no arbitrary calldata.</p></article>
            </div>
            <div className="docs-callout"><b>Verified against live fork state:</b> tests execute both directions through the real v4 PoolManager and Synthra v3 router, including an actual Permit2 signature transfer.</div>
            <div className="docs-callout warning"><b>Release boundary:</b> the shared manifest still points to Router v1, so v2 quotes remain read-only until candidate verification, governance acceptance, and explicit promotion. No Aggregator Hook deployment has been established on chain 46630.</div>
          </section>

          <section className="docs-section">
            <h2>Product decision</h2>
            <div className="decision-grid">
              <article><span>01</span><h3>Hook-aware routing</h3><p>Include Uniswap v4 Aggregator Hook candidates only where deployment, quote, and integration details are verified for the target chain.</p></article>
              <article><span>02</span><h3>Perm Fee Rebate</h3><p>Reduce the Perm platform fee on eligible swaps through the Perm entry point. A venue type such as V2 is included only after its deployment is separately reviewed and enabled; the current third-party V2 candidate remains withheld.</p></article>
            </div>
            <div className="docs-callout warning"><b>Not the default:</b> forcing every trade through a custom Perm hook. The router still compares valid net results and exposes gas separately.</div>
          </section>

          <section id="routing" className="docs-section">
            <span className="section-kicker">A · HOOK-AWARE ROUTING</span>
            <h2>Quote and execution flow</h2>
            <ol className="flow-list">
              <li><b>Intent</b><span>User chooses pair, exact input, recipient, and slippage.</span></li>
              <li><b>Candidates</b><span>Routing requests baseline Perm adapters and verified Aggregator Hook providers.</span></li>
              <li><b>Validate</b><span>Check chain, amount, token identity and decimals, freshness, spender, target, and minimum output.</span></li>
              <li><b>Compare</b><span>Use the same quote window and fee policy. Compare known net output; convert gas only with a valid price.</span></li>
              <li><b>Confirm</b><span>Show the known venue or hook, output, fee, rebate, minimum received, and network fee before signing.</span></li>
              <li><b>Settle</b><span>Verify actual recipient output and publish a receipt from transaction evidence.</span></li>
            </ol>
            <div className="docs-callout"><b>Phase one can compare complete candidates.</b> Cross-provider split routing requires separate implementation and testing; it should not be advertised early.</div>
          </section>

          <section id="hooks" className="docs-section">
            <span className="section-kicker">TECHNICAL BOUNDARY</span>
            <h2>A router is not a hook</h2>
            <p>A v4 hook is attached to a pool through its <code>PoolKey</code>. Its callbacks run only when that pool is used and the callback permission exists. Changing the router does not attach a new Perm hook to an existing pool.</p>
            <div className="boundary-table" role="table" aria-label="Router and hook responsibilities" tabIndex={0}>
              <div className="table-head" role="row"><span role="columnheader">RESPONSIBILITY</span><span role="columnheader">PERM ROUTER / SETTLEMENT</span><span role="columnheader">SPECIFIC V4 HOOK POOL</span></div>
              <div role="row"><b role="cell">User bounds</b><span role="cell">Recipient, minimum output, deadline</span><span role="cell">Not the only global enforcement</span></div>
              <div role="row"><b role="cell">Fee rebate</b><span role="cell">Gross fee, rebate, net fee</span><span role="cell">Only if that pool explicitly implements it</span></div>
              <div role="row"><b role="cell">Proof</b><span role="cell">Router event and indexer</span><span role="cell">Callback detail when available</span></div>
              <div role="row"><b role="cell">AMM behavior</b><span role="cell">Does not alter external venues</span><span role="cell">May implement dynamic LP fee or curve logic</span></div>
            </div>
            <div className="docs-callout warning">Never infer that a custom Perm callback ran only because a transaction touched v4.</div>
          </section>

          <section id="rebate" className="docs-section">
            <span className="section-kicker">B · PERM FEE REBATE</span>
            <h2>One versioned discount, settled instantly</h2>
            <p>The user rebate is an immediate reduction of Perm&apos;s own fee, so it needs no user claim, campaign points, staking, or second transaction. Treasury and referral fees use separate pull-payment reserves so a failing beneficiary cannot block the swap.</p>
            <pre className="formula" tabIndex={0} aria-label="Fee formula"><code>{`grossPermFee = floor(feeBasisAmount × platformFeeBps / 10,000)
rebate      = floor(grossPermFee × rebateShareBps / 10,000)
netPermFee  = grossPermFee − rebate

0 ≤ rebateShareBps ≤ 10,000`}</code></pre>
            <div className="example-fee" tabIndex={0} role="region" aria-label="Net fee calculation example">
              <div><small>INPUT FIXTURE</small><b>100 USDG</b></div><i>→</i>
              <div><small>GROSS PERM FEE</small><b>0.20 USDG</b></div><i>−</i>
              <div className="green"><small>REBATE</small><b>0.05 USDG</b></div><i>=</i>
              <div><small>NET PERM FEE</small><b>0.15 USDG</b></div>
            </div>
            <p className="docs-caption">Initial policy v1 uses a 0.20% gross Perm fee and a 25% rebate share of that fee, producing a 0.15% net Perm fee. The quote signs the exact immutable policy version read from chain.</p>
            <ul className="docs-list">
              <li>Rebate cannot exceed the gross Perm fee. A zero gross fee creates a zero rebate in this design.</li>
              <li>Referral, integrator, treasury, and rebate shares cannot spend the same portion twice.</li>
              <li>A reverted transaction creates no rebate or volume reward; gas spent on the revert is not refunded automatically.</li>
              <li>The quote binds fee policy version, recipient, chain, amount, deadline, and minimum output.</li>
            </ul>
          </section>

          <section id="receipt" className="docs-section">
            <span className="section-kicker">EVIDENCE</span>
            <h2>Minimum receipt schema</h2>
            <div className="schema-grid">
              {["chainId", "txHash + log identity", "route / provider IDs", "tokenIn / tokenOut", "actual amounts", "gross fee", "rebate", "net fee", "recipient", "fee policy version"].map((field) => <code key={field}>{field}</code>)}
            </div>
            <p>The UI can summarize the receipt, but the indexer must retain enough transaction and log identity to support each route claim.</p>
          </section>

          <section id="acceptance" className="docs-section">
            <span className="section-kicker">RELEASE GATE</span>
            <h2>Acceptance checklist</h2>
            <div className="acceptance-list">
              {CHECKS.map((check) => <label key={check.text} className={check.done ? "complete" : "pending"}><input type="checkbox" checked={check.done} readOnly disabled /><span>{check.text}</span><em>{check.done ? "PASS" : "RELEASE GATE"}</em></label>)}
            </div>
            <div className="docs-callout"><b>Positioning after implementation:</b> “Compare routes. See every fee. Keep more of your swap.” Avoid guarantees of cheapest execution, profit, MEV immunity, or universal hook coverage.</div>
          </section>

          <section id="sources" className="docs-section sources-section">
            <span className="section-kicker">PRIMARY REFERENCES</span>
            <h2>Sources used by the brief</h2>
            <a href="https://developers.uniswap.org/docs/protocols/v4/concepts/hooks" target="_blank" rel="noopener noreferrer">Uniswap v4 hooks ↗</a>
            <a href="https://developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees" target="_blank" rel="noopener noreferrer">Uniswap v4 dynamic fees ↗</a>
            <a href="https://blog.uniswap.org/aggregator-hooks-are-now-live" target="_blank" rel="noopener noreferrer">Aggregator Hooks announcement ↗</a>
            <a href="https://github.com/wealthy-org/Perm/blob/main/PERM_V4_DIFFERENTIATION_ADDENDUM.md" target="_blank" rel="noopener noreferrer">Full Perm addendum on GitHub ↗</a>
          </section>
        </article>
      </div>

      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
