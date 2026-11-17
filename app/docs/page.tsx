import type { Metadata } from "next";
import Header from "@/components/Header";
import AudioToggle from "@/components/AudioToggle";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Protocol notes",
  description: "Perm hook-aware routing, fee rebate, accounting, and acceptance notes.",
};

const CHECKS = [
  "Quote and execution use the same fee basis, rounding, and rebate policy.",
  "Zero fee, zero or 100% rebate, dust, referral sharing, wrapping, and allowance cases are tested.",
  "Minimum output is based on the recipient's actual balance after all applicable deductions.",
  "Fee and rebate state rolls back on revert; failed trades create no reward.",
  "Dynamic spenders and call targets are rejected unless reviewed and explicitly allowed.",
  "Missing or malicious hooks, reentrancy, stale quotes, and additional gas are handled.",
  "Proof covers one actual hook route and one non-hook route receiving the router-level rebate.",
];

export default function DocsPage() {
  return (
    <main className="app-page docs-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora docs-aurora" aria-hidden="true"><i /><i /><i /></div>

      <div className="docs-shell">
        <aside className="docs-nav">
          <span>PROTOCOL NOTES</span>
          <a href="#overview">Overview</a>
          <a href="#routing">Routing flow</a>
          <a href="#hooks">Hook boundary</a>
          <a href="#rebate">Fee rebate</a>
          <a href="#receipt">Proof receipt</a>
          <a href="#acceptance">Acceptance</a>
          <a href="#sources">Sources</a>
        </aside>

        <article className="docs-content">
          <div className="docs-status"><i /> Recommendation dated 17 November 2026 · implementation module, not a full deployed-protocol specification</div>

          <header id="overview" className="docs-hero">
            <span className="section-kicker">PERM · DIFFERENTIATION V4</span>
            <h1>Routing that can use verified hooks. A platform fee that visibly comes down.</h1>
            <p>Perm keeps the multi-venue router baseline, then adds hook-aware route candidates and a settlement-time rebate funded from Perm&apos;s own platform fee.</p>
          </header>

          <section className="docs-section">
            <h2>Product decision</h2>
            <div className="decision-grid">
              <article><span>01</span><h3>Hook-aware routing</h3><p>Include Uniswap v4 Aggregator Hook candidates only where deployment, quote, and integration details are verified for the target chain.</p></article>
              <article><span>02</span><h3>Perm Fee Rebate</h3><p>Reduce the Perm platform fee on eligible swaps through the Perm entry point, including valid V2, V3, or other venue routes.</p></article>
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
            <div className="boundary-table" role="table" aria-label="Router and hook responsibilities">
              <div className="table-head"><span>RESPONSIBILITY</span><span>PERM ROUTER / SETTLEMENT</span><span>SPECIFIC V4 HOOK POOL</span></div>
              <div><b>User bounds</b><span>Recipient, minimum output, deadline</span><span>Not the only global enforcement</span></div>
              <div><b>Fee rebate</b><span>Gross fee, rebate, net fee</span><span>Only if that pool explicitly implements it</span></div>
              <div><b>Proof</b><span>Router event and indexer</span><span>Callback detail when available</span></div>
              <div><b>AMM behavior</b><span>Does not alter external venues</span><span>May implement dynamic LP fee or curve logic</span></div>
            </div>
            <div className="docs-callout warning">Never infer that a custom Perm callback ran only because a transaction touched v4.</div>
          </section>

          <section id="rebate" className="docs-section">
            <span className="section-kicker">B · PERM FEE REBATE</span>
            <h2>One versioned discount, settled instantly</h2>
            <p>The first release uses a simple reduction of Perm&apos;s own fee. It does not require claim contracts, campaign points, staking, or a second transaction.</p>
            <pre className="formula"><code>{`grossPermFee = floor(feeBasisAmount × platformFeeBps / 10,000)
rebate      = floor(grossPermFee × rebateShareBps / 10,000)
netPermFee  = grossPermFee − rebate

0 ≤ rebateShareBps ≤ 10,000`}</code></pre>
            <div className="example-fee">
              <div><small>INPUT FIXTURE</small><b>100 USDG</b></div><i>→</i>
              <div><small>GROSS PERM FEE</small><b>0.20 USDG</b></div><i>−</i>
              <div className="green"><small>REBATE</small><b>0.05 USDG</b></div><i>=</i>
              <div><small>NET PERM FEE</small><b>0.15 USDG</b></div>
            </div>
            <p className="docs-caption">The 0.20% fee and 25% rebate share are fixtures only. They are not final commercial policy.</p>
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
              {CHECKS.map((check) => <label key={check}><input type="checkbox" disabled /><span>{check}</span></label>)}
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
