"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  formatEther,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import LiveTokenMark from "./LiveTokenMark";
import { useWeb3 } from "./Web3Provider";
import { erc20Abi, permRouterAbi } from "@/lib/web3/abis";
import {
  RH_TESTNET_CHAIN_ID,
  RH_TESTNET_EXPLORER,
  ZERO_ADDRESS,
  getRobinhoodPublicClient,
} from "@/lib/web3/config";
import {
  LIVE_TOKENS,
  LIVE_TOKEN_MAP,
  type LiveToken,
  type LiveTokenSymbol,
} from "@/lib/web3/tokens";
import type { LiveQuote } from "@/lib/web3/quote";
import { usePermDeployment } from "@/lib/web3/local-deployment";

type PickerSide = "sell" | "buy" | null;
type TxStage = "idle" | "approving" | "simulating" | "submitting" | "confirming" | "success" | "error";

type TxStatus = {
  stage: TxStage;
  message?: string;
  hash?: Hex;
};

const publicClient = getRobinhoodPublicClient();

export default function TradeApp() {
  const { account, isCorrectChain, connecting, connect, switchNetwork, walletClient } = useWeb3();
  const deployment = usePermDeployment();
  const [sellSymbol, setSellSymbol] = useState<LiveTokenSymbol>("ETH");
  const [buySymbol, setBuySymbol] = useState<LiveTokenSymbol>("NVDA");
  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(0.5);
  const [details, setDetails] = useState(true);
  const [picker, setPicker] = useState<PickerSide>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<LiveQuote>();
  const [quoteError, setQuoteError] = useState<string>();
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteTick, setQuoteTick] = useState(0);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [tx, setTx] = useState<TxStatus>({ stage: "idle" });

  const sellToken = LIVE_TOKEN_MAP[sellSymbol];
  const buyToken = LIVE_TOKEN_MAP[buySymbol];
  const recipientAddress = recipient.trim() || account || "";
  const recipientValid = Boolean(recipientAddress && isAddress(recipientAddress));

  const parsedAmount = useMemo(() => {
    try {
      const parsed = parseUnits(amount || "0", sellToken.decimals);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [amount, sellToken.decimals]);

  const refreshBalances = useCallback(async () => {
    if (!account) {
      setBalances({});
      return;
    }
    const next: Record<string, bigint> = {};
    await Promise.all([sellToken, buyToken].map(async (token) => {
      try {
        next[token.symbol] = token.address === ZERO_ADDRESS
          ? await publicClient.getBalance({ address: account })
          : await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [account] });
      } catch {
        next[token.symbol] = 0n;
      }
    }));
    setBalances((current) => ({ ...current, ...next }));
  }, [account, sellToken, buyToken]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    const timer = window.setInterval(() => setQuoteTick((value) => value + 1), 25_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!parsedAmount) {
      setQuote(undefined);
      setQuoteError(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(undefined);
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tokenIn: sellSymbol,
            tokenOut: buySymbol,
            amountIn: parsedAmount.toString(),
            slippageBps: Math.round(slippage * 100),
            account: account || ZERO_ADDRESS,
            recipient: recipientValid ? recipientAddress : ZERO_ADDRESS,
            adapter: deployment.adapter || ZERO_ADDRESS,
            referrer: ZERO_ADDRESS,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json() as LiveQuote & { error?: string };
        if (!response.ok) throw new Error(data.error || "Live quote failed");
        setQuote(data);
      } catch (cause) {
        if ((cause as { name?: string }).name !== "AbortError") {
          setQuote(undefined);
          setQuoteError(cause instanceof Error ? cause.message : "Live quote failed");
        }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [sellSymbol, buySymbol, parsedAmount, slippage, quoteTick, account, recipientAddress, recipientValid, deployment.adapter]);

  const formatTokenAmount = (raw: string | bigint | undefined, token: LiveToken, maximum = 6) => {
    if (raw === undefined) return "—";
    const value = Number(formatUnits(BigInt(raw), token.decimals));
    if (!Number.isFinite(value)) return "—";
    return value.toLocaleString("en-US", { maximumFractionDigits: maximum, minimumFractionDigits: value > 0 && value < 0.01 ? Math.min(6, maximum) : 0 });
  };

  const formatExactTokenAmount = (raw: string | bigint | undefined, token: LiveToken) => {
    if (raw === undefined) return "—";
    const [whole, fraction] = formatUnits(BigInt(raw), token.decimals).split(".");
    const groupedWhole = BigInt(whole).toLocaleString("en-US");
    return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
  };

  const openPicker = (side: Exclude<PickerSide, null>) => {
    setTokenSearch("");
    setPicker(side);
  };

  const chooseToken = (symbol: LiveTokenSymbol) => {
    if (picker === "sell") {
      setSellSymbol(symbol);
      if (symbol === buySymbol || (symbol !== "ETH" && buySymbol !== "ETH")) setBuySymbol(symbol === "ETH" ? "NVDA" : "ETH");
    } else if (picker === "buy") {
      setBuySymbol(symbol);
      if (symbol === sellSymbol || (symbol !== "ETH" && sellSymbol !== "ETH")) setSellSymbol(symbol === "ETH" ? "NVDA" : "ETH");
    }
    setPicker(null);
    setTx({ stage: "idle" });
  };

  const flip = () => {
    setSellSymbol(buySymbol);
    setBuySymbol(sellSymbol);
    if (quote?.selected.amountOut) setAmount(formatUnits(BigInt(quote.selected.amountOut), buyToken.decimals));
    setTx({ stage: "idle" });
  };

  const filteredTokens = LIVE_TOKENS.filter((token) => `${token.symbol} ${token.name}`.toLowerCase().includes(tokenSearch.toLowerCase()));

  const execute = async () => {
    if (!account) return void connect().catch((cause) => setTx({ stage: "error", message: cause instanceof Error ? cause.message : "Wallet connection failed" }));
    if (!isCorrectChain) return void switchNetwork().catch((cause) => setTx({ stage: "error", message: cause instanceof Error ? cause.message : "Network switch failed" }));
    if (!quote || !deployment.router || !deployment.adapter || !recipientValid) return;
    if (
      quote.account.toLowerCase() !== account.toLowerCase()
      || quote.recipient.toLowerCase() !== recipientAddress.toLowerCase()
      || quote.adapter.toLowerCase() !== deployment.adapter.toLowerCase()
    ) {
      setTx({ stage: "error", message: "The account, recipient, or adapter changed. A fresh bound quote is being requested." });
      setQuoteTick((value) => value + 1);
      return;
    }

    try {
      setTx({ stage: "simulating", message: "Validating quote and balances…" });
      const wallet = walletClient();
      const request = {
        adapter: quote.adapter,
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        amountIn: BigInt(quote.amountIn),
        minAmountOut: BigInt(quote.selected.minAmountOut),
        recipient: recipientAddress as Address,
        deadline: BigInt(quote.deadline),
        quotedAt: BigInt(quote.quotedAt),
        policyVersion: quote.policyVersion,
        chainId: BigInt(quote.chainId),
        quoteId: quote.quoteId,
        referrer: quote.referrer,
        routeData: quote.selected.routeData,
      } as const;

      if (quote.tokenIn !== ZERO_ADDRESS) {
        const allowance = await publicClient.readContract({
          address: quote.tokenIn,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, deployment.router],
        });
        if (allowance < request.amountIn) {
          setTx({ stage: "approving", message: `Approve exactly ${formatTokenAmount(request.amountIn, sellToken)} ${sellToken.displaySymbol}` });
          const approval = await wallet.writeContract({
            account,
            chain: wallet.chain,
            address: quote.tokenIn,
            abi: erc20Abi,
            functionName: "approve",
            args: [deployment.router, request.amountIn],
          });
          await publicClient.waitForTransactionReceipt({ hash: approval });
        }
      }

      const latest = await publicClient.getBlock({ blockTag: "latest" });
      if (latest.timestamp > BigInt(quote.deadline)) throw new Error("Quote expired during approval. A fresh quote is ready; confirm again.");

      setTx({ stage: "simulating", message: "Simulating the exact bound route…" });
      const simulation = await publicClient.simulateContract({
        account,
        address: deployment.router,
        abi: permRouterAbi,
        functionName: "swapExactInput",
        args: [request],
        value: quote.tokenIn === ZERO_ADDRESS ? request.amountIn : 0n,
      });

      setTx({ stage: "submitting", message: "Confirm the settlement transaction in your wallet…" });
      const hash = await wallet.writeContract(simulation.request);
      setTx({ stage: "confirming", hash, message: "Waiting for Robinhood Chain testnet confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") throw new Error("The transaction reverted; no fee or rebate receipt was created.");

      const saved = JSON.parse(localStorage.getItem("perm:receipts") || "[]") as string[];
      localStorage.setItem("perm:receipts", JSON.stringify([hash, ...saved.filter((item) => item !== hash)].slice(0, 30)));
      setTx({ stage: "success", hash, message: "Settled onchain. The event-backed receipt is ready." });
      await refreshBalances();
      setQuoteTick((value) => value + 1);
    } catch (cause) {
      const detail = cause as { shortMessage?: string; message?: string };
      setTx({ stage: "error", message: detail.shortMessage || detail.message || "Transaction failed" });
    }
  };

  const primaryLabel = (() => {
    if (connecting) return "Connecting wallet…";
    if (!account) return "Connect wallet";
    if (!isCorrectChain) return "Switch to RH Testnet";
    if (!deployment.ready) return "Deploy testnet contracts";
    if (!recipientValid) return "Enter a valid recipient";
    if (quoteLoading) return "Reading V4Quoter…";
    if (!quote) return quoteError ? "Route unavailable" : "Enter an amount";
    if (["approving", "simulating", "submitting", "confirming"].includes(tx.stage)) return tx.message || "Working…";
    return `Swap on RH Testnet`;
  })();

  const buttonDisabled = Boolean(account && isCorrectChain && (!deployment.ready || !quote || !recipientValid || quoteLoading || ["approving", "simulating", "submitting", "confirming"].includes(tx.stage)));
  const quoteKey = quote?.quoteId || `${sellSymbol}-${buySymbol}-${amount}`;

  return (
    <main className="app-page trade-page light-app">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>

      <section className="trade-shell app-enter">
        <div className="trade-intro">
          <span className="section-kicker">PERM ROUTER · ROBINHOOD CHAIN TESTNET</span>
          <h1>Live quotes. Bound execution.</h1>
          <p>The interface reads the deployed Uniswap v4 Quoter, applies policy v1 on the same input basis, simulates the exact route, and records settlement from the router event.</p>
          <div className="intro-points">
            <span><i>01</i> Onchain V4 quote</span>
            <span><i>02</i> 20 bps / 25% rebate</span>
            <span><i>03</i> Event-backed proof</span>
          </div>
        </div>

        <div className="token-marquee" aria-label="Robinhood testnet execution assets">
          <div>
            {[...LIVE_TOKENS, ...LIVE_TOKENS].map((token, index) => (
              <span key={`${token.symbol}-${index}`}><LiveTokenMark token={token} size={21} /><b>{token.displaySymbol}</b><small>testnet only</small></span>
            ))}
          </div>
        </div>

        <div className="trade-grid">
          <section className="swap-panel glass-panel" aria-label="Executable testnet swap">
            <header className="panel-header">
              <div><span className="section-kicker">EXACT INPUT</span><h2>Onchain route</h2></div>
              <button className="network-chip" type="button" onClick={() => void switchNetwork().catch(() => undefined)} title="Robinhood Chain Testnet, chain ID 46630"><i /> RH Testnet <span>46630</span></button>
            </header>

            <div className={`preview-banner${deployment.ready ? " live-banner" : ""}`}><i /> {deployment.ready ? "Live testnet execution · tokens have no monetary value" : "Contracts pass unit + fork tests · deployment signature still required"}</div>

            <div className="mode-tabs" role="tablist" aria-label="Routing mode">
              <button type="button" className="active">Best valid result</button>
              <button type="button" title="Only verified v4 deployment is available on this testnet">V4 on-chain</button>
            </div>
            <div className="mode-warning">V2/V3 candidates are not shown because no verified Uniswap V2/V3 deployment was found on chain 46630. Perm will not fabricate coverage.</div>

            <label className="token-box">
              <span className="token-box-label">YOU PAY</span>
              <div className="token-row">
                <input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} aria-label={`Amount in ${sellSymbol}`} placeholder="0.0" />
                <button className="token-chip" type="button" onClick={() => openPicker("sell")} aria-expanded={picker === "sell"}><LiveTokenMark token={sellToken} size={29} />{sellToken.displaySymbol}<span>⌄</span></button>
              </div>
              <div className="token-sub"><span>Balance: {account ? formatTokenAmount(balances[sellSymbol], sellToken) : "connect wallet"}</span><button type="button" onClick={() => balances[sellSymbol] !== undefined && setAmount(formatUnits(balances[sellSymbol], sellToken.decimals))}>MAX</button></div>
            </label>

            <div className="flip-row"><button type="button" onClick={flip} aria-label="Reverse tokens"><span>↓</span><span>↑</span></button></div>

            <div className="token-box output-box">
              <span className="token-box-label">YOU RECEIVE · LIVE ESTIMATE</span>
              <div className="token-row">
                <output key={quoteKey} className="quote-value">{quote ? formatTokenAmount(quote.selected.amountOut, buyToken) : quoteLoading ? "…" : "—"}</output>
                <button className="token-chip" type="button" onClick={() => openPicker("buy")} aria-expanded={picker === "buy"}><LiveTokenMark token={buyToken} size={29} />{buyToken.displaySymbol}<span>⌄</span></button>
              </div>
              <div className="token-sub"><span>{quote?.selected.providerLabel || quoteError || "Awaiting live quote"}</span><span>{quote ? `block ${quote.blockNumber}` : ""}</span></div>
            </div>

            <button className="quote-summary" type="button" onClick={() => setDetails((value) => !value)} aria-expanded={details}><span><i className="route-dot" />Route, fee &amp; recipient</span><b>{details ? "−" : "+"}</b></button>

            {details && (
              <div className="fee-breakdown">
                <div><span>Platform fee <small>gross · 20 bps</small></span><b>{formatExactTokenAmount(quote?.grossFee, sellToken)} {sellToken.displaySymbol}</b></div>
                <div className="rebate-line"><span>Fee rebate <small>25% of Perm fee</small></span><b>−{formatExactTokenAmount(quote?.rebate, sellToken)} {sellToken.displaySymbol}</b></div>
                <div><span>Net platform fee <small>15 bps</small></span><b>{formatExactTokenAmount(quote?.netFee, sellToken)} {sellToken.displaySymbol}</b></div>
                <div><span>Minimum received <small>{slippage}% slippage</small></span><b>{formatTokenAmount(quote?.selected.minAmountOut, buyToken)} {buyToken.displaySymbol}</b></div>
                <div><span>Estimated network fee</span><b>{quote ? `${Number(formatEther(BigInt(quote.selected.estimatedNetworkFeeWei))).toPrecision(3)} ETH` : "—"}</b></div>
                <div><span>Fee policy</span><b><code>perm-v1</code></b></div>
                <label className="recipient-control"><span>Recipient</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={account || "0x…"} aria-label="Swap output recipient" /></label>
              </div>
            )}

            <div className="slippage-row"><span>Slippage tolerance</span><div>{[0.1, 0.5, 1].map((value) => <button key={value} type="button" className={slippage === value ? "active" : ""} onClick={() => setSlippage(value)}>{value}%</button>)}</div></div>

            {account && isCorrectChain && !deployment.ready ? <Link className="connect-action setup-action" href="/setup">Deploy testnet contracts</Link> : <button className="connect-action" type="button" disabled={buttonDisabled} onClick={() => void execute()}>{primaryLabel}</button>}
            {tx.message && <div className={`transaction-status ${tx.stage}`}><i /> <span>{tx.message}</span>{tx.hash && <a href={`${RH_TESTNET_EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">Explorer ↗</a>}</div>}
            {tx.stage === "success" && <Link className="receipt-link" href="/proofs">Open settlement receipt →</Link>}
            <p className="swap-note">All non-ETH assets in this testnet interface are unvalued third-party test tokens. Names and symbols do not represent equity, ownership, live pricing, or issuer affiliation.</p>

            {picker && (
              <div className="token-picker-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPicker(null)}>
                <section className="token-picker" role="dialog" aria-modal="true" aria-labelledby="token-picker-title">
                  <header><div><span className="section-kicker">CHAIN 46630</span><h3 id="token-picker-title">Choose a testnet asset</h3></div><button type="button" onClick={() => setPicker(null)} aria-label="Close token selector">×</button></header>
                  <label className="token-search"><span>⌕</span><input autoFocus value={tokenSearch} onChange={(event) => setTokenSearch(event.target.value)} placeholder="Search name or symbol" /></label>
                  <div className="token-list">
                    {filteredTokens.map((token) => {
                      const current = picker === "sell" ? sellSymbol === token.symbol : buySymbol === token.symbol;
                      return <button key={token.symbol} type="button" className={current ? "active" : ""} onClick={() => chooseToken(token.symbol)}><LiveTokenMark token={token} size={34} /><span><b>{token.displaySymbol}</b><small>{token.name}</small></span><em>{token.symbol === "ETH" ? "NATIVE" : "TEST ASSET"}</em>{current && <i>✓</i>}</button>;
                    })}
                  </div>
                  <p>Only pools initialized on the official testnet PoolManager and successfully quoted by the official V4Quoter are eligible.</p>
                </section>
              </div>
            )}
          </section>

          <aside className="route-panel glass-panel" aria-label="Live route comparison">
            <header className="panel-header route-panel-header"><div><span className="section-kicker">VALID CANDIDATES</span><h2>Same amount. Same policy.</h2></div><span className="fresh-chip"><i /> {quote ? "ONCHAIN" : "WAITING"}</span></header>
            <div className="pair-context"><span><LiveTokenMark token={sellToken} size={25} /><LiveTokenMark token={buyToken} size={25} /></span><div><b>{sellToken.displaySymbol} → {buyToken.displaySymbol}</b><small>exact input · chain 46630</small></div><em>{quote?.candidates.length || 0} valid</em></div>

            <div className="route-list">
              {quote?.candidates.map((route, index) => (
                <article className="candidate selected" key={route.poolId} style={{ "--row-delay": `${index * 80}ms` } as CSSProperties}>
                  <div className="candidate-rank">✓</div>
                  <div className="candidate-main"><div><h3>{route.providerLabel}</h3><span className="verified-chip">ONCHAIN QUOTE</span></div><p>{route.hook === ZERO_ADDRESS ? "Direct pool · no hook claim" : "Verified hook candidate"}</p><div className="route-path"><LiveTokenMark token={sellToken} size={17} /><i /><em>V4 · {route.pool.fee / 10_000}%</em><i /><LiveTokenMark token={buyToken} size={17} /></div></div>
                  <div className="candidate-output"><b>{formatTokenAmount(route.amountOut, buyToken)}</b><span>{buyToken.displaySymbol}</span><small>{Number(formatEther(BigInt(route.estimatedNetworkFeeWei))).toPrecision(3)} ETH gas est.</small></div>
                </article>
              ))}
              {!quote && <div className="route-empty">{quoteLoading ? "Reading the official V4Quoter…" : quoteError || "Enter an amount to request a comparable onchain quote."}</div>}
            </div>

            <div className="comparison-note"><span>WHY THIS ROUTE</span><p>{quote ? "This candidate returned the highest valid token output. Gas is displayed separately because no trusted output-token conversion is used." : "Unavailable or reverting candidates are excluded rather than relabeled."}</p></div>
            <div className="receipt-preview"><div className="receipt-preview-head"><span>SETTLEMENT GATE</span><i>{deployment.ready ? "READY" : "DEPLOY"}</i></div><div><span>Target</span><b>immutable V4 adapter</b></div><div><span>Approval</span><b>exact amount only</b></div><div><span>Min output</span><b>recipient-bound</b></div><div><span>Receipt</span><b>event + tx log</b></div></div>
          </aside>
        </div>
      </section>

      <section className="trade-explainer app-reveal"><div><span className="section-kicker">EXECUTION MODEL</span><h2>Nothing becomes “live” because a label says so.</h2></div><div className="explainer-grid"><article><b>01</b><h3>Input-basis accounting</h3><p>The V4 quote uses routed input after the net Perm fee—the same arithmetic enforced by settlement.</p></article><article><b>02</b><h3>Restricted adapter</h3><p>The contract calls one immutable PoolManager, rejects arbitrary hook data, and clears its exact token approval.</p></article><article><b>03</b><h3>Proof after execution</h3><p>A successful receipt comes from the SwapSettled event and transaction log. Reverts create no receipt or rebate.</p></article></div><Link href="/docs" className="button secondary">Read security boundaries</Link></section>
      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}

