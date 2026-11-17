"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import TokenLogo, { TokenPair } from "./TokenLogo";
import type { TokenSymbol } from "@/lib/tokens";

type Receipt = {
  id: string;
  sell: TokenSymbol;
  buy: TokenSymbol;
  input: string;
  output: string;
  route: string;
  hook: boolean;
  gross: string;
  rebate: string;
  net: string;
  gas: string;
};

const RECEIPTS: Receipt[] = [
  { id: "DEMO-91AE", sell: "ETH", buy: "USDC", input: "0.600000 ETH", output: "1,851.88 USDC", route: "V4 Aggregator Hook fixture", hook: true, gross: "0.001200 ETH", rebate: "0.000300 ETH", net: "0.000900 ETH", gas: "$6.12" },
  { id: "DEMO-73C4", sell: "WBTC", buy: "USDC", input: "0.10000000 WBTC", output: "9,009.14 USDC", route: "Uniswap V3 fixture", hook: false, gross: "0.00020000 WBTC", rebate: "0.00005000 WBTC", net: "0.00015000 WBTC", gas: "$5.26" },
  { id: "DEMO-52BF", sell: "USDT", buy: "USDC", input: "2,500.00 USDT", output: "2,493.51 USDC", route: "Uniswap V3 fixture", hook: false, gross: "5.00 USDT", rebate: "1.25 USDT", net: "3.75 USDT", gas: "$4.35" },
  { id: "DEMO-18D2", sell: "LINK", buy: "WETH", input: "100.00000 LINK", output: "0.47716 WETH", route: "Uniswap V2 fixture", hook: false, gross: "0.20000 LINK", rebate: "0.05000 LINK", net: "0.15000 LINK", gas: "$4.13" },
];

export default function ProofExplorer() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(RECEIPTS[0].id);
  const filtered = useMemo(() => RECEIPTS.filter((receipt) => `${receipt.id} ${receipt.sell} ${receipt.buy} ${receipt.route}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const selected = RECEIPTS.find((receipt) => receipt.id === selectedId) || RECEIPTS[0];

  return (
    <main className="app-page light-app proofs-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero">
          <span className="section-kicker">SETTLEMENT PROOF · INTERFACE PREVIEW</span>
          <h1>Every result leaves a readable receipt.</h1>
          <p>Route identity, actual amounts, fee accounting, recipient, policy version, transaction evidence, and gas belong in one verifiable record.</p>
          <div className="data-disclaimer"><i /> Demonstration records only · no transaction or wallet activity is implied</div>
        </header>

        <section className="proof-workbench data-panel">
          <div className="proof-list-panel">
            <header><div><span className="section-kicker">DEMO RECEIPTS</span><h2>Settlement records</h2></div><span className="proof-count">{filtered.length.toString().padStart(2, "0")}</span></header>
            <label className="proof-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search demo ID, token, or route" /></label>
            <div className="proof-list">
              {filtered.map((receipt, index) => (
                <button type="button" key={receipt.id} className={selected.id === receipt.id ? "active" : ""} onClick={() => setSelectedId(receipt.id)} style={{ "--row-delay": `${index * 70}ms` } as CSSProperties}>
                  <TokenPair first={receipt.sell} second={receipt.buy} size={30} />
                  <span><b>{receipt.sell} → {receipt.buy}</b><small>{receipt.route}</small></span>
                  <em>{receipt.id}</em><i>✓</i>
                </button>
              ))}
              {!filtered.length && <div className="proof-empty">No demonstration record matches this search.</div>}
            </div>
          </div>

          <article className="proof-document" key={selected.id}>
            <header><div className="proof-mark"><img src="/perm-mark.png" alt="" /></div><div><span>PERM SETTLEMENT RECEIPT</span><b>{selected.id}</b></div><em><i /> SETTLED FIXTURE</em></header>
            <div className="proof-pair"><TokenLogo symbol={selected.sell} size={46} /><span><i /><i /><i /></span><TokenLogo symbol={selected.buy} size={46} /><div><b>{selected.sell} → {selected.buy}</b><small>{selected.route}</small></div></div>
            <dl>
              <div><dt>Actual input</dt><dd>{selected.input}</dd></div>
              <div><dt>Actual output</dt><dd>{selected.output}</dd></div>
              <div><dt>Gross Perm fee</dt><dd>{selected.gross}</dd></div>
              <div className="proof-saved"><dt>Fee rebate</dt><dd>−{selected.rebate}</dd></div>
              <div><dt>Net Perm fee</dt><dd>{selected.net}</dd></div>
              <div><dt>Network fee</dt><dd>{selected.gas}</dd></div>
              <div><dt>Hook execution</dt><dd>{selected.hook ? "Required only if selected pool is used" : "No hook claim"}</dd></div>
              <div><dt>Policy version</dt><dd><code>demo-v1</code></dd></div>
            </dl>
            <div className="proof-hash"><span>TRANSACTION EVIDENCE</span><code>Not available in interface fixture</code></div>
            <footer><span><i /> Policy-bound fields</span><span><i /> Recipient-bound output</span><span><i /> Event-backed in production</span></footer>
            <div className="proof-scan" />
          </article>
        </section>

        <section className="logic-band app-reveal">
          <div><span className="section-kicker">PROOF, NOT PROMISE</span><h2>The record follows settlement.</h2></div>
          <ol><li><b>01</b><span>The quote is not presented as the final result.</span></li><li><b>02</b><span>Actual recipient output is measured after execution.</span></li><li><b>03</b><span>Failed or reverted trades create no rebate receipt.</span></li></ol>
        </section>
      </section>

      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
