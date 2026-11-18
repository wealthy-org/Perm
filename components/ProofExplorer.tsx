"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatUnits, isHash, type Address, type Hex } from "viem";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import LiveTokenMark from "./LiveTokenMark";
import { LIVE_TOKEN_BY_ADDRESS, LIVE_TOKEN_MAP, type LiveToken } from "@/lib/web3/tokens";
import { ZERO_ADDRESS } from "@/lib/web3/config";
import { usePermDeployment } from "@/lib/web3/local-deployment";

type OnchainReceipt = {
  chainId: number;
  transactionHash: Hex;
  blockNumber: string;
  blockTimestamp: number;
  logIndex: number;
  status: string;
  confirmations: string;
  gasUsed: string;
  actualNetworkFeeWei: string;
  actualNetworkFeeEth: string;
  receiptId: Hex;
  quoteId: Hex;
  account: Address;
  recipient: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  routedInput: string;
  amountOut: string;
  grossFee: string;
  rebate: string;
  netFee: string;
  referralFee: string;
  policyVersion: number;
  providerId: Hex;
  providerLabel: string;
  adapter: Address;
  hook: Address;
  explorerUrl: string;
};

type ReceiptResult = { receipt?: OnchainReceipt; error?: string; hash: string };

export default function ProofExplorer() {
  const deployment = usePermDeployment();
  const [query, setQuery] = useState("");
  const [manualHash, setManualHash] = useState("");
  const [results, setResults] = useState<ReceiptResult[]>([]);
  const [selectedHash, setSelectedHash] = useState<string>();
  const [loading, setLoading] = useState(true);

  const loadHashes = useCallback(async (hashes: string[]) => {
    const unique = [...new Set(hashes.filter((hash) => isHash(hash)))].slice(0, 30);
    if (!unique.length) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await Promise.all(unique.map(async (hash): Promise<ReceiptResult> => {
      try {
        const params = new URLSearchParams({ tx: hash });
        if (deployment.router) params.set("router", deployment.router);
        const response = await fetch(`/api/receipts?${params}`, { cache: "no-store" });
        const data = await response.json() as OnchainReceipt & { error?: string };
        if (!response.ok) throw new Error(data.error || "Receipt unavailable");
        return { hash, receipt: data };
      } catch (cause) {
        return { hash, error: cause instanceof Error ? cause.message : "Receipt unavailable" };
      }
    }));
    setResults(next);
    const firstValid = next.find((item) => item.receipt)?.hash;
    setSelectedHash((current) => current && next.some((item) => item.hash === current) ? current : firstValid);
    setLoading(false);
  }, [deployment.router]);

  useEffect(() => {
    const hashes = JSON.parse(localStorage.getItem("perm:receipts") || "[]") as string[];
    void loadHashes(hashes);
  }, [loadHashes]);

  const addManual = () => {
    if (!isHash(manualHash)) return;
    const existing = JSON.parse(localStorage.getItem("perm:receipts") || "[]") as string[];
    const next = [manualHash, ...existing.filter((hash) => hash.toLowerCase() !== manualHash.toLowerCase())].slice(0, 30);
    localStorage.setItem("perm:receipts", JSON.stringify(next));
    setManualHash("");
    void loadHashes(next);
  };

  const filtered = useMemo(() => results.filter(({ receipt, hash }) => {
    if (!query) return true;
    const haystack = receipt ? `${hash} ${receipt.receiptId} ${receipt.account} ${receipt.recipient} ${receipt.providerLabel}` : hash;
    return haystack.toLowerCase().includes(query.toLowerCase());
  }), [results, query]);
  const selected = results.find((item) => item.hash === selectedHash)?.receipt;

  const tokenFor = (address: Address): LiveToken => LIVE_TOKEN_BY_ADDRESS[address.toLowerCase()] || {
    symbol: "ETH", displaySymbol: "TOKEN", name: "Unknown token", address, decimals: 18, color: "#64748b",
  };
  const inputToken = selected ? tokenFor(selected.tokenIn) : LIVE_TOKEN_MAP.ETH;
  const outputToken = selected ? tokenFor(selected.tokenOut) : LIVE_TOKEN_MAP.NVDA;
  const fmt = (raw: string, token: LiveToken) => {
    const [whole, fraction] = formatUnits(BigInt(raw), token.decimals).split(".");
    const groupedWhole = BigInt(whole).toLocaleString("en-US");
    return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
  };

  return (
    <main className="app-page light-app proofs-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero">
          <span className="section-kicker">SETTLEMENT PROOF · ROBINHOOD CHAIN TESTNET</span>
          <h1>A receipt only after the chain settles.</h1>
          <p>Every record is decoded from a successful Perm SwapSettled log and bound to its transaction hash, block, log index, recipient, route identity, and actual fee accounting.</p>
          <div className="data-disclaimer"><i /> No successful event means no receipt and no rebate claim</div>
        </header>

        <section className="proof-workbench data-panel">
          <div className="proof-list-panel">
            <header><div><span className="section-kicker">EVENT-BACKED RECEIPTS</span><h2>Settlement records</h2></div><span className="proof-count">{filtered.filter((item) => item.receipt).length.toString().padStart(2, "0")}</span></header>
            <label className="proof-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tx, receipt, or account" /></label>
            <div className="manual-receipt"><input value={manualHash} onChange={(event) => setManualHash(event.target.value.trim())} placeholder="Paste a Perm transaction hash" /><button type="button" onClick={addManual} disabled={!isHash(manualHash)}>Verify</button></div>
            <div className="proof-list">
              {filtered.map((item, index) => {
                const receipt = item.receipt;
                const first = receipt ? tokenFor(receipt.tokenIn) : LIVE_TOKEN_MAP.ETH;
                const second = receipt ? tokenFor(receipt.tokenOut) : LIVE_TOKEN_MAP.NVDA;
                return (
                  <button type="button" key={item.hash} className={selectedHash === item.hash ? "active" : ""} onClick={() => receipt && setSelectedHash(item.hash)} style={{ "--row-delay": `${index * 70}ms` } as CSSProperties} disabled={!receipt}>
                    <span className="live-pair"><LiveTokenMark token={first} size={30} /><LiveTokenMark token={second} size={30} /></span>
                    <span><b>{receipt ? `${first.displaySymbol} → ${second.displaySymbol}` : "Unverified transaction"}</b><small>{receipt ? receipt.providerLabel : item.error}</small></span>
                    <em>{receipt ? `${receipt.transactionHash.slice(0, 8)}…` : "INVALID"}</em>{receipt && <i>✓</i>}
                  </button>
                );
              })}
              {loading && <div className="proof-empty">Reading transaction receipts from chain 46630…</div>}
              {!loading && !filtered.length && <div className="proof-empty">No event-backed receipt is saved in this browser yet. Execute a testnet swap or paste its transaction hash above.</div>}
            </div>
          </div>

          {selected ? (
            <article className="proof-document" key={selected.receiptId}>
              <header><div className="proof-mark"><img src="/perm-mark.png" alt="" /></div><div><span>PERM SETTLEMENT RECEIPT</span><b>{selected.receiptId.slice(0, 12)}…{selected.receiptId.slice(-6)}</b></div><em><i /> ONCHAIN</em></header>
              <div className="proof-pair"><LiveTokenMark token={inputToken} size={46} /><span><i /><i /><i /></span><LiveTokenMark token={outputToken} size={46} /><div><b>{inputToken.displaySymbol} → {outputToken.displaySymbol}</b><small>{selected.providerLabel}</small></div></div>
              <dl>
                <div><dt>Actual input</dt><dd>{fmt(selected.amountIn, inputToken)} {inputToken.displaySymbol}</dd></div>
                <div><dt>Routed input</dt><dd>{fmt(selected.routedInput, inputToken)} {inputToken.displaySymbol}</dd></div>
                <div><dt>Actual recipient output</dt><dd>{fmt(selected.amountOut, outputToken)} {outputToken.displaySymbol}</dd></div>
                <div><dt>Gross Perm fee</dt><dd>{fmt(selected.grossFee, inputToken)} {inputToken.displaySymbol}</dd></div>
                <div className="proof-saved"><dt>Fee rebate</dt><dd>−{fmt(selected.rebate, inputToken)} {inputToken.displaySymbol}</dd></div>
                <div><dt>Net Perm fee</dt><dd>{fmt(selected.netFee, inputToken)} {inputToken.displaySymbol}</dd></div>
                <div><dt>Actual network fee</dt><dd>{selected.actualNetworkFeeEth} ETH</dd></div>
                <div><dt>Hook execution</dt><dd>{selected.hook === ZERO_ADDRESS ? "No hook claim" : selected.hook}</dd></div>
                <div><dt>Policy version</dt><dd><code>perm-v{selected.policyVersion}</code></dd></div>
                <div><dt>Recipient</dt><dd><code>{selected.recipient.slice(0, 8)}…{selected.recipient.slice(-6)}</code></dd></div>
              </dl>
              <div className="proof-hash"><span>TRANSACTION + LOG IDENTITY</span><a href={selected.explorerUrl} target="_blank" rel="noopener noreferrer"><code>{selected.transactionHash.slice(0, 18)}…{selected.transactionHash.slice(-12)} · log {selected.logIndex}</code></a></div>
              <footer><span><i /> Chain {selected.chainId}</span><span><i /> Block {selected.blockNumber}</span><span><i /> {selected.confirmations} confirmations</span></footer>
              <div className="proof-scan" />
            </article>
          ) : (
            <article className="proof-document proof-document-empty"><img src="/perm-mark.png" alt="" /><span className="section-kicker">NO FABRICATED PROOF</span><h2>{deployment.router ? "Execute or verify a transaction" : "Publish the testnet deployment first"}</h2><p>Perm does not substitute demonstration records when no settlement event exists.</p></article>
          )}
        </section>

        <section className="logic-band app-reveal"><div><span className="section-kicker">PROOF, NOT PROMISE</span><h2>The record follows settlement.</h2></div><ol><li><b>01</b><span>The quote is not presented as the final result.</span></li><li><b>02</b><span>Actual recipient output is emitted only after the minimum is enforced.</span></li><li><b>03</b><span>Failed or reverted trades create no fee distribution or receipt.</span></li></ol></section>
      </section>
      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
