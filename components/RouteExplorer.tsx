"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatEther, formatUnits, parseUnits } from "viem";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import LiveTokenMark from "./LiveTokenMark";
import { LIVE_TOKENS, LIVE_TOKEN_MAP, type LiveTokenSymbol } from "@/lib/web3/tokens";
import type { LiveQuote } from "@/lib/web3/quote";
import { RH_TESTNET_EXPLORER } from "@/lib/web3/config";

type Filter = "all" | "direct" | "hook";
const ASSETS = LIVE_TOKENS.filter((token) => token.symbol !== "ETH");

export default function RouteExplorer() {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<LiveTokenSymbol>("NVDA");
  const [amount, setAmount] = useState("0.001");
  const [quotes, setQuotes] = useState<Partial<Record<LiveTokenSymbol, LiveQuote>>>({});
  const [errors, setErrors] = useState<Partial<Record<LiveTokenSymbol, string>>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>();

  const refresh = useCallback(async () => {
    let raw: bigint;
    try {
      raw = parseUnits(amount || "0", 18);
      if (raw <= 0n) throw new Error("Amount must be positive");
    } catch {
      setErrors({ NVDA: "Enter a valid ETH amount" });
      return;
    }
    setLoading(true);
    const results = await Promise.all(ASSETS.map(async (token) => {
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tokenIn: "ETH", tokenOut: token.symbol, amountIn: raw.toString(), slippageBps: 50 }),
          cache: "no-store",
        });
        const data = await response.json() as LiveQuote & { error?: string };
        if (!response.ok) throw new Error(data.error || "Quote unavailable");
        return [token.symbol, data, undefined] as const;
      } catch (cause) {
        return [token.symbol, undefined, cause instanceof Error ? cause.message : "Quote unavailable"] as const;
      }
    }));
    const nextQuotes: Partial<Record<LiveTokenSymbol, LiveQuote>> = {};
    const nextErrors: Partial<Record<LiveTokenSymbol, string>> = {};
    results.forEach(([symbol, quote, quoteError]) => {
      if (quote) nextQuotes[symbol] = quote;
      if (quoteError) nextErrors[symbol] = quoteError;
    });
    setQuotes(nextQuotes);
    setErrors(nextErrors);
    setUpdatedAt(Date.now());
    setLoading(false);
  }, [amount]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const rows = useMemo(() => ASSETS.map((token) => ({ token, quote: quotes[token.symbol], error: errors[token.symbol] }))
    .filter(({ quote }) => filter !== "hook" || quote?.selected.verifiedHook)
    .filter(({ quote }) => filter !== "direct" || !quote?.selected.verifiedHook), [quotes, errors, filter]);
  const active = quotes[selected];
  const eth = LIVE_TOKEN_MAP.ETH;
  const output = LIVE_TOKEN_MAP[selected];
  const fmt = (raw?: string) => raw ? Number(formatUnits(BigInt(raw), 18)).toLocaleString("en-US", { maximumFractionDigits: 7 }) : "—";

  return (
    <main className="app-page light-app routes-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero">
          <span className="section-kicker">ROUTE EXPLORER · LIVE CHAIN 46630 READS</span>
          <h1>Only candidates the quoter can prove.</h1>
          <p>Every row below is requested from the deployed Robinhood testnet V4Quoter using the same amount, fee policy, block window, and slippage basis.</p>
          <div className="data-disclaimer"><i /> Testnet assets have no monetary value · gas is not converted into output-token units</div>
        </header>

        <div className="metric-row">
          <article><span>QUOTED PAIRS</span><b>{Object.keys(quotes).length}</b><small>currently valid</small></article>
          <article><span>VERIFIED TYPES</span><b>V4</b><small>direct pools on testnet</small></article>
          <article><span>FRESHNESS</span><b>{loading ? "…" : updatedAt ? "Live" : "—"}</b><small>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : "awaiting RPC"}</small></article>
        </div>

        <section className="data-panel route-catalog">
          <header className="catalog-head">
            <div><span className="section-kicker">ONCHAIN CANDIDATE CATALOG</span><h2>Route quotes</h2></div>
            <div className="route-live-controls">
              <label><span>ETH input</span><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></label>
              <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Reading…" : "Refresh"}</button>
            </div>
            <div className="catalog-tabs" role="tablist" aria-label="Route type filter">
              {(["all", "direct", "hook"] as Filter[]).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All valid" : item === "direct" ? "Direct pools" : "Verified hooks"}</button>)}
            </div>
          </header>

          <div className="catalog-layout">
            <div className="route-table" role="table" aria-label="Live route candidates">
              <div className="route-table-head" role="row"><span>PAIR</span><span>ROUTE</span><span>LIVE OUTPUT</span><span>GAS EST.</span><span>TYPE</span></div>
              {rows.map(({ token, quote, error }, index) => (
                <button className={`route-table-row${token.symbol === selected ? " selected" : ""}`} type="button" key={token.symbol} onClick={() => setSelected(token.symbol)} style={{ "--row-delay": `${index * 45}ms` } as CSSProperties}>
                  <span className="pair-cell"><span className="live-pair"><LiveTokenMark token={eth} size={27} /><LiveTokenMark token={token} size={27} /></span><b>ETH/{token.displaySymbol}</b></span>
                  <span><b>{quote?.selected.providerLabel || "Unavailable"}</b><small>{quote ? `block ${quote.blockNumber}` : error || "No valid quote"}</small></span>
                  <span className="mono-cell">{quote ? `${fmt(quote.selected.amountOut)} ${token.displaySymbol}` : "—"}</span>
                  <span className="mono-cell">{quote ? `${Number(formatEther(BigInt(quote.selected.estimatedNetworkFeeWei))).toPrecision(3)} ETH` : "—"}</span>
                  <span><em className={`route-type ${quote?.selected.verifiedHook ? "hook" : "direct"}`}>{quote?.selected.verifiedHook ? "VERIFIED HOOK" : "V4 DIRECT"}</em></span>
                </button>
              ))}
              {!rows.length && <div className="route-filter-empty">No verified hook candidate is available on Robinhood Chain testnet. Perm correctly reports it as unavailable.</div>}
            </div>

            {active ? (
              <aside className="route-inspector" key={active.quoteId}>
                <span className="section-kicker">SELECTED ONCHAIN QUOTE</span>
                <div className="inspector-pair"><LiveTokenMark token={eth} size={42} /><i>→</i><LiveTokenMark token={output} size={42} /></div>
                <h3>ETH to {output.displaySymbol}</h3>
                <p>{active.selected.providerLabel}</p>
                <div className="inspector-path"><span>INPUT</span><i /><em>{active.selected.hook === "0x0000000000000000000000000000000000000000" ? "DIRECT V4 POOL" : "VERIFIED HOOK"}</em><i /><span>OUTPUT</span></div>
                <dl>
                  <div><dt>Live result</dt><dd>{fmt(active.selected.amountOut)} {output.displaySymbol}</dd></div>
                  <div><dt>Minimum received</dt><dd>{fmt(active.selected.minAmountOut)} {output.displaySymbol}</dd></div>
                  <div><dt>Net Perm fee</dt><dd>{fmt(active.netFee)} ETH</dd></div>
                  <div><dt>Pool fee</dt><dd>{active.selected.pool.fee / 10_000}%</dd></div>
                  <div><dt>Hook claim</dt><dd>{active.selected.verifiedHook ? active.selected.hook : "None"}</dd></div>
                </dl>
                <a href={`${RH_TESTNET_EXPLORER}/address/${active.selected.pool.hooks === "0x0000000000000000000000000000000000000000" ? "0x8366a39cc670b4001a1121b8f6a443a643e40951" : active.selected.pool.hooks}`} target="_blank" rel="noopener noreferrer">Inspect deployment ↗</a>
                <small>The selected transaction still simulates immediately before the user signs. A stale or reverting quote is rejected.</small>
              </aside>
            ) : <aside className="route-inspector"><span className="section-kicker">NO VALID QUOTE</span><h3>{errors[selected] || "Reading the V4Quoter…"}</h3></aside>}
          </div>
        </section>

        <section className="logic-band app-reveal"><div><span className="section-kicker">SELECTION LOGIC</span><h2>A label never outranks the result.</h2></div><ol><li><b>01</b><span>Apply the same exact input and versioned Perm fee policy.</span></li><li><b>02</b><span>Reject reverting, stale, unverified, or mismatched candidates.</span></li><li><b>03</b><span>Compare token output and expose unconverted gas independently.</span></li></ol></section>
      </section>
      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
