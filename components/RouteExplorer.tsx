"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import TokenLogo, { TokenPair } from "./TokenLogo";
import type { TokenSymbol } from "@/lib/tokens";

type Filter = "all" | "direct" | "hook";
type RouteFixture = {
  sell: TokenSymbol;
  buy: TokenSymbol;
  venue: string;
  type: Exclude<Filter, "all">;
  result: string;
  gas: string;
  note: string;
};

const FIXTURES: RouteFixture[] = [
  { sell: "ETH", buy: "USDC", venue: "V4 Aggregator Hook", type: "hook", result: "3,088.08 USDC", gas: "$6.12", note: "verified-candidate fixture" },
  { sell: "ETH", buy: "USDC", venue: "Uniswap V3", type: "direct", result: "3,082.52 USDC", gas: "$4.84", note: "direct venue" },
  { sell: "WBTC", buy: "USDC", venue: "Uniswap V3", type: "direct", result: "90,091.38 USDC", gas: "$5.26", note: "direct venue" },
  { sell: "WETH", buy: "DAI", venue: "V4 Aggregator Hook", type: "hook", result: "3,089.84 DAI", gas: "$6.07", note: "verified-candidate fixture" },
  { sell: "LINK", buy: "USDC", venue: "Uniswap V3", type: "direct", result: "14.77 USDC", gas: "$4.42", note: "direct venue" },
  { sell: "UNI", buy: "WETH", venue: "Uniswap V2", type: "direct", result: "0.00270 WETH", gas: "$4.13", note: "direct venue" },
  { sell: "USDT", buy: "USDC", venue: "Uniswap V3", type: "direct", result: "0.9989 USDC", gas: "$4.35", note: "stable pair fixture" },
  { sell: "DAI", buy: "USDC", venue: "V4 Aggregator Hook", type: "hook", result: "0.9988 USDC", gas: "$5.91", note: "verified-candidate fixture" },
];

export default function RouteExplorer() {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const rows = useMemo(() => FIXTURES.filter((route) => filter === "all" || route.type === filter), [filter]);
  const active = rows[Math.min(selected, rows.length - 1)] || rows[0];

  return (
    <main className="app-page light-app routes-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero">
          <span className="section-kicker">ROUTE EXPLORER · INTERFACE FIXTURES</span>
          <h1>Every valid candidate, on one basis.</h1>
          <p>Inspect how Perm can compare direct venues and verified hook-provider candidates without relabeling one as the other.</p>
          <div className="data-disclaimer"><i /> Demo values only · not live liquidity, pricing, or chain-support data</div>
        </header>

        <div className="metric-row">
          <article><span>PAIR FIXTURES</span><b>8</b><small>visual coverage</small></article>
          <article><span>ROUTE TYPES</span><b>2</b><small>direct + hook candidate</small></article>
          <article><span>COMPARISON</span><b>Net</b><small>gas shown separately</small></article>
        </div>

        <section className="data-panel route-catalog">
          <header className="catalog-head">
            <div><span className="section-kicker">CANDIDATE CATALOG</span><h2>Route fixtures</h2></div>
            <div className="catalog-tabs" role="tablist" aria-label="Route type filter">
              {(["all", "direct", "hook"] as Filter[]).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => { setFilter(item); setSelected(0); }}>{item === "all" ? "All routes" : item === "direct" ? "Direct venues" : "Hook candidates"}</button>)}
            </div>
          </header>

          <div className="catalog-layout">
            <div className="route-table" role="table" aria-label="Illustrative route candidates">
              <div className="route-table-head" role="row"><span>PAIR</span><span>ROUTE</span><span>RESULT / 1 UNIT</span><span>GAS</span><span>TYPE</span></div>
              {rows.map((route, index) => (
                <button className={`route-table-row${index === selected ? " selected" : ""}`} type="button" key={`${route.sell}-${route.buy}-${route.venue}`} onClick={() => setSelected(index)} style={{ "--row-delay": `${index * 45}ms` } as CSSProperties}>
                  <span className="pair-cell"><TokenPair first={route.sell} second={route.buy} size={27} /><b>{route.sell}/{route.buy}</b></span>
                  <span><b>{route.venue}</b><small>{route.note}</small></span>
                  <span className="mono-cell">{route.result}</span>
                  <span className="mono-cell">{route.gas}</span>
                  <span><em className={`route-type ${route.type}`}>{route.type === "hook" ? "HOOK FIXTURE" : "DIRECT"}</em></span>
                </button>
              ))}
            </div>

            {active && (
              <aside className="route-inspector" key={`${active.sell}-${active.buy}-${active.venue}`}>
                <span className="section-kicker">SELECTED FIXTURE</span>
                <div className="inspector-pair"><TokenLogo symbol={active.sell} size={42} /><i>→</i><TokenLogo symbol={active.buy} size={42} /></div>
                <h3>{active.sell} to {active.buy}</h3>
                <p>{active.venue}</p>
                <div className="inspector-path"><span>INPUT</span><i /><em>{active.type === "hook" ? "VERIFIED HOOK CANDIDATE" : "DIRECT VENUE"}</em><i /><span>OUTPUT</span></div>
                <dl><div><dt>Illustrative result</dt><dd>{active.result}</dd></div><div><dt>Network fee</dt><dd>{active.gas}</dd></div><div><dt>Hook claim</dt><dd>{active.type === "hook" ? "Only if verified and used" : "None"}</dd></div></dl>
                <small>Selection in the executable product must come from fresh, validated quotes and approved targets.</small>
              </aside>
            )}
          </div>
        </section>

        <section className="logic-band app-reveal">
          <div><span className="section-kicker">SELECTION LOGIC</span><h2>A label never outranks the result.</h2></div>
          <ol><li><b>01</b><span>Normalize amount, fee policy, token identity, and quote window.</span></li><li><b>02</b><span>Reject stale, mismatched, or unapproved candidates.</span></li><li><b>03</b><span>Compare known net output and expose gas independently.</span></li></ol>
        </section>
      </section>

      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
