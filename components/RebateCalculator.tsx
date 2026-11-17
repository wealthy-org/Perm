"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import TokenLogo from "./TokenLogo";
import type { TokenSymbol } from "@/lib/tokens";

const REBATE_TOKENS: TokenSymbol[] = ["ETH", "USDC", "WBTC"];

type RouteKind = "v2" | "v3" | "v4";

export default function RebateCalculator() {
  const [token, setToken] = useState<TokenSymbol>("ETH");
  const [amount, setAmount] = useState(1);
  const [share, setShare] = useState(25);
  const [throughPerm, setThroughPerm] = useState(true);
  const [route, setRoute] = useState<RouteKind>("v3");

  const values = useMemo(() => {
    const safeAmount = Math.max(0, amount || 0);
    const gross = safeAmount * 0.002;
    const rebate = throughPerm ? gross * share / 100 : 0;
    return { gross, rebate, net: gross - rebate, savedPercent: throughPerm ? share : 0 };
  }, [amount, share, throughPerm]);

  const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: token === "WBTC" ? 8 : 6 });

  return (
    <main className="app-page light-app rebate-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero rebate-hero">
          <span className="section-kicker">PERM FEE REBATE · ACCOUNTING PREVIEW</span>
          <h1>The discount is visible before you sign.</h1>
          <p>The rebate comes from Perm&apos;s own platform fee. It does not rename LP fees, protocol fees, third-party fees, or network gas.</p>
          <div className="data-disclaimer"><i /> Illustrative policy fixture · not final commercial terms</div>
        </header>

        <section className="rebate-workbench data-panel">
          <div className="rebate-controls">
            <div className="control-head"><span className="section-kicker">INPUT BASIS</span><b>demo-v1</b></div>
            <label className="amount-control"><span>Swap input</span><div><input type="number" min="0" step="0.1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><div>{REBATE_TOKENS.map((symbol) => <button type="button" key={symbol} className={token === symbol ? "active" : ""} onClick={() => setToken(symbol)}><TokenLogo symbol={symbol} size={24} />{symbol}</button>)}</div></div></label>

            <fieldset className="route-control"><legend>Selected route fixture</legend><div>{(["v2", "v3", "v4"] as RouteKind[]).map((item) => <button type="button" key={item} className={route === item ? "active" : ""} onClick={() => setRoute(item)}><b>{item.toUpperCase()}</b><span>{item === "v4" ? "verified hook candidate" : "direct venue"}</span></button>)}</div></fieldset>

            <label className="range-control"><span><b>Illustrative rebate share</b><em>{share}%</em></span><input type="range" min="0" max="50" step="5" value={share} onChange={(event) => setShare(Number(event.target.value))} /><small>The production value must come from an explicit, versioned fee policy.</small></label>

            <div className="eligibility-toggle"><div><b>Entered through eligible Perm routing</b><span>Router-level eligibility—not a hook label</span></div><button type="button" className={throughPerm ? "on" : ""} onClick={() => setThroughPerm((value) => !value)} aria-pressed={throughPerm}><i /></button></div>
          </div>

          <div className="rebate-result" key={`${token}-${amount}-${share}-${throughPerm}-${route}`}>
            <div className="rebate-orbit" style={{ "--rebate-angle": `${values.savedPercent * 3.6}deg` } as CSSProperties}>
              <div><strong>{values.savedPercent}%</strong><span>of Perm fee</span></div><i /><i /><i />
            </div>
            <span className="section-kicker">SETTLEMENT BREAKDOWN</span>
            <h2>{throughPerm ? "Eligible fixture" : "No router rebate"}</h2>
            <dl>
              <div><dt>Gross Perm fee <small>0.20%</small></dt><dd>{fmt(values.gross)} {token}</dd></div>
              <div className="saved"><dt>Fee rebate <small>{throughPerm ? `${share}% share` : "not eligible"}</small></dt><dd>−{fmt(values.rebate)} {token}</dd></div>
              <div className="net"><dt>Net Perm fee</dt><dd>{fmt(values.net)} {token}</dd></div>
              <div><dt>Route type</dt><dd>{route === "v4" ? "Verified V4 fixture" : `${route.toUpperCase()} direct fixture`}</dd></div>
            </dl>
            <p>{throughPerm ? "A direct V2 or V3 route can receive this router-level rebate when the swap is eligible and settles through Perm." : "A trade made outside the eligible Perm entry point does not receive the router-level rebate."}</p>
          </div>
        </section>

        <section className="eligibility-grid app-reveal">
          <article><b>01</b><h3>What can be reduced</h3><p>Only Perm&apos;s own disclosed platform fee under the active policy.</p></article>
          <article><b>02</b><h3>What stays separate</h3><p>LP, protocol, hook-provider, third-party, and network fees.</p></article>
          <article><b>03</b><h3>What proves it</h3><p>Gross fee, rebate, net fee, recipient, route identity, and transaction evidence.</p></article>
        </section>
      </section>

      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
