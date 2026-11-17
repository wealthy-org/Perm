"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";

type RouteMode = "best" | "v4";
type Token = "ETH" | "USDC";

type Route = {
  name: string;
  kind: string;
  rate: number;
  gas: string;
  hook?: boolean;
  verified?: boolean;
};

const ROUTES: Route[] = [
  { name: "V4 Aggregator Hook", kind: "Verified candidate", rate: 3092.72, gas: "$6.12 est.", hook: true, verified: true },
  { name: "Uniswap V3", kind: "Direct venue", rate: 3088.54, gas: "$4.84 est." },
  { name: "Uniswap V2", kind: "Direct venue", rate: 3079.81, gas: "$4.31 est." },
];

const symbol = (token: Token) => token === "ETH" ? "Ξ" : "$";
const decimals = (token: Token) => token === "ETH" ? 6 : 2;

export default function TradeApp() {
  const [sellToken, setSellToken] = useState<Token>("ETH");
  const [amount, setAmount] = useState("0.60");
  const [mode, setMode] = useState<RouteMode>("best");
  const [slippage, setSlippage] = useState(0.5);
  const [details, setDetails] = useState(true);
  const [walletModal, setWalletModal] = useState(false);
  const buyToken: Token = sellToken === "ETH" ? "USDC" : "ETH";

  const quote = useMemo(() => {
    const input = Math.max(0, Number.parseFloat(amount) || 0);
    const grossFee = input * 0.002;
    const rebate = grossFee * 0.25;
    const netFee = grossFee - rebate;
    const routedInput = Math.max(0, input - netFee);
    const candidates = (mode === "v4" ? ROUTES.filter((route) => route.hook) : ROUTES).map((route) => {
      const output = sellToken === "ETH" ? routedInput * route.rate : routedInput / route.rate;
      return { ...route, output };
    });
    const selected = [...candidates].sort((a, b) => b.output - a.output)[0];
    const minReceived = (selected?.output || 0) * (1 - slippage / 100);
    return { input, grossFee, rebate, netFee, routedInput, candidates, selected, minReceived };
  }, [amount, mode, sellToken, slippage]);

  const format = (value: number, token: Token) =>
    value.toLocaleString("en-US", { maximumFractionDigits: decimals(token), minimumFractionDigits: value > 0 ? Math.min(2, decimals(token)) : 0 });

  const flip = () => {
    setSellToken(buyToken);
    if (quote.selected?.output) setAmount(format(quote.selected.output, buyToken).replace(/,/g, ""));
  };

  return (
    <main className="app-page trade-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /></div>

      <section className="trade-shell">
        <div className="trade-intro">
          <span className="section-kicker">PERM ROUTER · INTERFACE PREVIEW</span>
          <h1>The route is only good if the numbers are clear.</h1>
          <p>Compare indicative whole-route candidates, inspect the fee rebate, and keep the user&apos;s minimum visible through confirmation.</p>
          <div className="intro-points">
            <span><i>01</i> Same quote basis</span>
            <span><i>02</i> Fee discount shown</span>
            <span><i>03</i> Settlement proof</span>
          </div>
        </div>

        <div className="trade-grid">
          <section className="swap-panel glass-panel" aria-label="Swap preview">
            <header className="panel-header">
              <div>
                <span className="section-kicker">SWAP</span>
                <h2>Route preview</h2>
              </div>
              <button className="network-chip" type="button" title="Initial integration target">
                <i /> Robinhood Chain <span>⌄</span>
              </button>
            </header>

            <div className="preview-banner"><i /> Demo quote · illustrative values · no executable transaction</div>

            <div className="mode-tabs" role="tablist" aria-label="Routing mode">
              <button type="button" className={mode === "best" ? "active" : ""} onClick={() => setMode("best")}>Best net result</button>
              <button type="button" className={mode === "v4" ? "active" : ""} onClick={() => setMode("v4")}>V4-only test</button>
            </div>

            {mode === "v4" && (
              <div className="mode-warning">V4-only is an explicit test mode. It can reduce route coverage and is not the default.</div>
            )}

            <label className="token-box">
              <span className="token-box-label">YOU PAY</span>
              <div className="token-row">
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label={`Amount in ${sellToken}`}
                  placeholder="0.0"
                />
                <button className="token-chip" type="button" aria-label={`Selected token ${sellToken}`}>
                  <i className={sellToken.toLowerCase()}>{symbol(sellToken)}</i>{sellToken}<span>⌄</span>
                </button>
              </div>
              <div className="token-sub"><span>Balance —</span><button type="button" onClick={() => setAmount(sellToken === "ETH" ? "1.00" : "3000")}>MAX</button></div>
            </label>

            <div className="flip-row"><button type="button" onClick={flip} aria-label="Reverse tokens">↓↑</button></div>

            <div className="token-box output-box">
              <span className="token-box-label">YOU RECEIVE · ESTIMATE</span>
              <div className="token-row">
                <output>{format(quote.selected?.output || 0, buyToken)}</output>
                <button className="token-chip" type="button" aria-label={`Selected token ${buyToken}`}>
                  <i className={buyToken.toLowerCase()}>{symbol(buyToken)}</i>{buyToken}<span>⌄</span>
                </button>
              </div>
              <div className="token-sub"><span>{quote.selected?.name || "No route"}</span><span>indicative</span></div>
            </div>

            <button className="quote-summary" type="button" onClick={() => setDetails((value) => !value)} aria-expanded={details}>
              <span><i className="route-dot" />Route &amp; fee breakdown</span><b>{details ? "−" : "+"}</b>
            </button>

            {details && (
              <div className="fee-breakdown">
                <div><span>Platform fee <small>gross</small></span><b>{format(quote.grossFee, sellToken)} {sellToken}</b></div>
                <div className="rebate-line"><span>Fee rebate <small>25% share</small></span><b>−{format(quote.rebate, sellToken)} {sellToken}</b></div>
                <div><span>Net platform fee</span><b>{format(quote.netFee, sellToken)} {sellToken}</b></div>
                <div><span>Minimum received <small>{slippage}% slippage</small></span><b>{format(quote.minReceived, buyToken)} {buyToken}</b></div>
                <div><span>Network fee</span><b>{quote.selected?.gas || "—"}</b></div>
                <div><span>Fee policy</span><b><code>demo-v1</code></b></div>
              </div>
            )}

            <div className="slippage-row">
              <span>Slippage tolerance</span>
              <div>{[0.1, 0.5, 1].map((value) => <button key={value} type="button" className={slippage === value ? "active" : ""} onClick={() => setSlippage(value)}>{value}%</button>)}</div>
            </div>

            <button className="connect-action" type="button" onClick={() => setWalletModal(true)}>Connect wallet</button>
            <p className="swap-note">No wallet request is made in this preview. Execution requires verified Perm contracts, provider integration, simulation, and deployment configuration.</p>
          </section>

          <aside className="route-panel glass-panel" aria-label="Route comparison">
            <header className="panel-header route-panel-header">
              <div><span className="section-kicker">CANDIDATES</span><h2>Same input. Same window.</h2></div>
              <span className="fresh-chip"><i /> FRESH</span>
            </header>

            <div className="route-list">
              {quote.candidates.map((route, index) => {
                const selected = route.name === quote.selected?.name;
                return (
                  <article className={`candidate${selected ? " selected" : ""}`} key={route.name}>
                    <div className="candidate-rank">{selected ? "✓" : String(index + 1).padStart(2, "0")}</div>
                    <div className="candidate-main">
                      <div><h3>{route.name}</h3>{route.verified && <span className="verified-chip">VERIFIED</span>}</div>
                      <p>{route.kind}{route.hook ? " · pool-bound callback" : " · no Perm hook claim"}</p>
                      <div className="route-path"><span>{sellToken}</span><i /><em>{route.hook ? "HOOK" : route.name.replace("Uniswap ", "")}</em><i /><span>{buyToken}</span></div>
                    </div>
                    <div className="candidate-output"><b>{format(route.output, buyToken)}</b><span>{buyToken}</span><small>{route.gas}</small></div>
                  </article>
                );
              })}
            </div>

            <div className="comparison-note">
              <span>WHY THIS ROUTE</span>
              <p>{quote.selected?.name} currently has the highest indicative token output in this demo. Gas remains displayed separately.</p>
            </div>

            <div className="receipt-preview">
              <div className="receipt-preview-head"><span>POST-TRADE RECEIPT</span><i>PREVIEW</i></div>
              <div><span>Route identity</span><b>{quote.selected?.hook ? "verified-hook / pool" : "direct venue"}</b></div>
              <div><span>Actual output</span><b>after settlement</b></div>
              <div><span>Fee / rebate</span><b>event-backed</b></div>
              <div><span>Recipient / tx</span><b>bound &amp; indexed</b></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="trade-explainer">
        <div><span className="section-kicker">WHAT THIS PREVIEW PROVES</span><h2>The fee method and route story can be made legible now.</h2></div>
        <div className="explainer-grid">
          <article><b>01</b><h3>Input-basis accounting</h3><p>The routed input reflects the net Perm fee after rebate. The quote and settlement must use the same method.</p></article>
          <article><b>02</b><h3>Route-neutral rebate</h3><p>An eligible V2 or V3 route can still receive the router-level discount. It does not need a custom Perm hook.</p></article>
          <article><b>03</b><h3>No invented coverage</h3><p>A hook candidate disappears when deployment, quote, spender, execution target, or freshness checks fail.</p></article>
        </div>
        <Link href="/docs" className="button secondary">Review the implementation notes</Link>
      </section>

      <div className="footer-shell app-footer"><Footer /></div>

      {walletModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setWalletModal(false)}>
          <section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
            <button className="modal-close" type="button" onClick={() => setWalletModal(false)} aria-label="Close">×</button>
            <img src="/perm-mark.png" alt="" />
            <span className="section-kicker">EXECUTION LOCKED</span>
            <h2 id="wallet-title">Frontend preview only</h2>
            <p>Wallet execution stays disabled until Perm has its own reviewed deployment configuration, approved targets, quote integration, and transaction simulation.</p>
            <div className="modal-checks">
              <span><i /> Perm contract addresses</span>
              <span><i /> Provider target allowlist</span>
              <span><i /> Approval / Permit2 flow</span>
              <span><i /> Quote-to-settlement tests</span>
            </div>
            <div className="button-row">
              <button className="button primary" type="button" onClick={() => setWalletModal(false)}>Got it</button>
              <Link className="button secondary" href="/docs">Read notes</Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
