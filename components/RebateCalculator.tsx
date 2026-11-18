"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatUnits, parseUnits } from "viem";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import LiveTokenMark from "./LiveTokenMark";
import { permRouterAbi } from "@/lib/web3/abis";
import { getRobinhoodPublicClient } from "@/lib/web3/config";
import { usePermDeployment } from "@/lib/web3/local-deployment";
import { LIVE_TOKEN_MAP, type LiveTokenSymbol } from "@/lib/web3/tokens";

const REBATE_TOKENS: LiveTokenSymbol[] = ["ETH", "NVDA", "AAPL"];
const BPS = 10_000n;

export default function RebateCalculator() {
  const deployment = usePermDeployment();
  const [tokenSymbol, setTokenSymbol] = useState<LiveTokenSymbol>("ETH");
  const [amount, setAmount] = useState("1");
  const [throughPerm, setThroughPerm] = useState(true);
  const [onchainPolicy, setOnchainPolicy] = useState<{ feeBps: number; rebateBps: number; enabled: boolean }>();
  const [policyError, setPolicyError] = useState<string>();
  const token = LIVE_TOKEN_MAP[tokenSymbol];
  const feeBps = onchainPolicy?.feeBps ?? 20;
  const rebateBps = onchainPolicy?.rebateBps ?? 2_500;

  useEffect(() => {
    if (!deployment.router) return;
    getRobinhoodPublicClient().readContract({ address: deployment.router, abi: permRouterAbi, functionName: "feePolicies", args: [1] })
      .then(([platformFeeBps, rebateShareBps, enabled]) => setOnchainPolicy({ feeBps: platformFeeBps, rebateBps: rebateShareBps, enabled }))
      .catch((cause) => setPolicyError(cause instanceof Error ? cause.message : "Policy read failed"));
  }, [deployment.router]);

  const values = useMemo(() => {
    let raw = 0n;
    try { raw = parseUnits(amount || "0", token.decimals); } catch { raw = 0n; }
    const gross = raw * BigInt(feeBps) / BPS;
    const rebate = throughPerm ? gross * BigInt(rebateBps) / BPS : 0n;
    return { raw, gross, rebate, net: gross - rebate, routed: raw - (gross - rebate) };
  }, [amount, token.decimals, feeBps, rebateBps, throughPerm]);

  const fmt = (value: bigint) => {
    const [whole, fraction] = formatUnits(value, token.decimals).split(".");
    const groupedWhole = BigInt(whole).toLocaleString("en-US");
    return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
  };
  const savedPercent = throughPerm ? rebateBps / 100 : 0;

  return (
    <main className="app-page light-app rebate-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="data-shell app-enter">
        <header className="data-hero rebate-hero">
          <span className="section-kicker">PERM FEE REBATE · POLICY V1</span>
          <h1>The exact discount, before signing.</h1>
          <p>Policy v1 takes a 20 bps gross Perm fee from exact input, rebates 25% of that fee immediately, and routes the remainder after a 15 bps net fee.</p>
          <div className={`data-disclaimer${onchainPolicy ? " verified-policy" : ""}`}><i /> {onchainPolicy ? "Policy values read from the deployed PermRouter" : deployment.ready ? "Deployment configured · reading policy v1 from chain" : "Compiled policy v1 · awaiting testnet deployment signature"}</div>
        </header>

        <section className="rebate-workbench data-panel">
          <div className="rebate-controls">
            <div className="control-head"><span className="section-kicker">EXACT INPUT BASIS</span><b>perm-v1</b></div>
            <label className="amount-control"><span>Swap input</span><div><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /><div>{REBATE_TOKENS.map((symbol) => <button type="button" key={symbol} className={tokenSymbol === symbol ? "active" : ""} onClick={() => setTokenSymbol(symbol)}><LiveTokenMark token={LIVE_TOKEN_MAP[symbol]} size={24} />{LIVE_TOKEN_MAP[symbol].displaySymbol}</button>)}</div></div></label>

            <fieldset className="route-control"><legend>Versioned policy fields</legend><div>
              <div className="policy-field"><b>{feeBps} bps</b><span>gross Perm fee</span></div>
              <div className="policy-field"><b>{rebateBps / 100}%</b><span>rebate share</span></div>
              <div className="policy-field"><b>{feeBps * (10_000 - rebateBps) / 10_000} bps</b><span>effective net fee</span></div>
            </div></fieldset>

            <div className="policy-formula"><code>gross = floor(input × 20 / 10,000)</code><code>rebate = floor(gross × 2,500 / 10,000)</code><code>routed = input − (gross − rebate)</code></div>

            <div className="eligibility-toggle"><div><b>Entered through eligible Perm routing</b><span>Turn off to compare the same gross fee without the Perm entry-point rebate</span></div><button type="button" className={throughPerm ? "on" : ""} onClick={() => setThroughPerm((value) => !value)} aria-pressed={throughPerm}><i /></button></div>
            {policyError && <small className="policy-error">Onchain policy verification failed: {policyError}</small>}
          </div>

          <div className="rebate-result" key={`${tokenSymbol}-${amount}-${throughPerm}-${feeBps}-${rebateBps}`}>
            <div className="rebate-orbit" style={{ "--rebate-angle": `${savedPercent * 3.6}deg` } as CSSProperties}><div><strong>{savedPercent}%</strong><span>of Perm fee</span></div><i /><i /><i /></div>
            <span className="section-kicker">DETERMINISTIC BREAKDOWN</span>
            <h2>{throughPerm ? "Policy v1 eligible" : "No entry-point rebate"}</h2>
            <dl>
              <div><dt>Exact input</dt><dd>{fmt(values.raw)} {token.displaySymbol}</dd></div>
              <div><dt>Gross Perm fee <small>{feeBps} bps</small></dt><dd>{fmt(values.gross)} {token.displaySymbol}</dd></div>
              <div className="saved"><dt>Fee rebate <small>{throughPerm ? `${rebateBps / 100}% share` : "not eligible"}</small></dt><dd>−{fmt(values.rebate)} {token.displaySymbol}</dd></div>
              <div className="net"><dt>Net Perm fee</dt><dd>{fmt(values.net)} {token.displaySymbol}</dd></div>
              <div><dt>Input sent to venue</dt><dd>{fmt(values.routed)} {token.displaySymbol}</dd></div>
            </dl>
            <p>Integer rounding is performed in token base units exactly as the settlement contract does. The rebate can never exceed the gross Perm fee.</p>
          </div>
        </section>

        <section className="eligibility-grid app-reveal"><article><b>01</b><h3>What is reduced</h3><p>Only Perm&apos;s disclosed platform fee under immutable policy version 1.</p></article><article><b>02</b><h3>What stays separate</h3><p>Pool fees, hook-provider fees, protocol fees, and network gas.</p></article><article><b>03</b><h3>What proves it</h3><p>Gross fee, rebate, net fee, actual output, recipient, route, and transaction log.</p></article></section>
      </section>
      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
