"use client";

import { useEffect, useState } from "react";
import {
  formatEther,
  isAddress,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import Header from "./Header";
import AudioToggle from "./AudioToggle";
import Footer from "./Footer";
import { shortAddress, useWeb3 } from "./Web3Provider";
import routerArtifact from "@/lib/web3/artifacts/PermRouter.json";
import adapterArtifact from "@/lib/web3/artifacts/PermV4Adapter.json";
import { permRouterAbi } from "@/lib/web3/abis";
import {
  POOL_MANAGER_ADDRESS,
  RH_TESTNET_CHAIN_ID,
  RH_TESTNET_EXPLORER,
  getRobinhoodPublicClient,
} from "@/lib/web3/config";
import {
  clearLocalDeployment,
  saveLocalDeployment,
  usePermDeployment,
  type LocalPermDeployment,
} from "@/lib/web3/local-deployment";

type Step = "idle" | "router" | "adapter" | "configure" | "verify" | "complete" | "error";
const publicClient = getRobinhoodPublicClient();

export default function DeploymentSetup() {
  const { account, isCorrectChain, connect, switchNetwork, walletClient } = useWeb3();
  const deployment = usePermDeployment();
  const [treasury, setTreasury] = useState("");
  const [balance, setBalance] = useState<bigint>();
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string>();
  const [transactions, setTransactions] = useState<Hex[]>([]);

  useEffect(() => {
    if (account && !treasury) setTreasury(account);
    if (account) publicClient.getBalance({ address: account }).then(setBalance).catch(() => setBalance(undefined));
  }, [account, treasury]);

  useEffect(() => {
    if (deployment.ready && step === "idle") setStep("complete");
  }, [deployment.ready, step]);

  const deploy = async () => {
    if (!account) return void connect().catch((cause) => { setStep("error"); setMessage(cause instanceof Error ? cause.message : "Wallet connection failed"); });
    if (!isCorrectChain) return void switchNetwork().catch((cause) => { setStep("error"); setMessage(cause instanceof Error ? cause.message : "Network switch failed"); });
    if (!isAddress(treasury)) { setStep("error"); setMessage("Enter a valid treasury address."); return; }

    setTransactions([]);
    setMessage(undefined);
    try {
      const managerCode = await publicClient.getCode({ address: POOL_MANAGER_ADDRESS });
      if (!managerCode || managerCode === "0x") throw new Error("Official v4 PoolManager bytecode is unavailable on chain 46630");
      const wallet = walletClient();
      setStep("router");
      setMessage("Confirm PermRouter deployment in your wallet.");
      const routerHash = await wallet.deployContract({
        account,
        chain: wallet.chain,
        abi: routerArtifact.abi as Abi,
        bytecode: routerArtifact.bytecode as Hex,
        args: [account, treasury as Address],
      });
      setTransactions([routerHash]);
      const routerReceipt = await publicClient.waitForTransactionReceipt({ hash: routerHash });
      if (routerReceipt.status !== "success" || !routerReceipt.contractAddress) throw new Error("PermRouter deployment reverted");
      const router = routerReceipt.contractAddress;

      setStep("adapter");
      setMessage("Confirm the restricted V4 adapter deployment.");
      const adapterHash = await wallet.deployContract({
        account,
        chain: wallet.chain,
        abi: adapterArtifact.abi as Abi,
        bytecode: adapterArtifact.bytecode as Hex,
        args: [account, router, POOL_MANAGER_ADDRESS],
      });
      setTransactions((current) => [...current, adapterHash]);
      const adapterReceipt = await publicClient.waitForTransactionReceipt({ hash: adapterHash });
      if (adapterReceipt.status !== "success" || !adapterReceipt.contractAddress) throw new Error("PermV4Adapter deployment reverted");
      const adapter = adapterReceipt.contractAddress;

      setStep("configure");
      setMessage("Enable only the reviewed UNISWAP_V4_DIRECT adapter.");
      const configureHash = await wallet.writeContract({
        account,
        chain: wallet.chain,
        address: router,
        abi: permRouterAbi,
        functionName: "configureAdapter",
        args: [adapter, keccak256(toHex("UNISWAP_V4_DIRECT")), true],
      });
      setTransactions((current) => [...current, configureHash]);
      const configureReceipt = await publicClient.waitForTransactionReceipt({ hash: configureHash });
      if (configureReceipt.status !== "success") throw new Error("Adapter configuration reverted");

      setStep("verify");
      setMessage("Verifying deployed bytecode and policy v1.");
      const [routerCode, adapterCode, policy, adapterConfig] = await Promise.all([
        publicClient.getCode({ address: router }),
        publicClient.getCode({ address: adapter }),
        publicClient.readContract({ address: router, abi: permRouterAbi, functionName: "feePolicies", args: [1] }),
        publicClient.readContract({ address: router, abi: permRouterAbi, functionName: "adapters", args: [adapter] }),
      ]);
      if (!routerCode || !adapterCode) throw new Error("Deployed bytecode could not be verified");
      if (policy[0] !== 20 || policy[1] !== 2_500 || !policy[2] || !adapterConfig[0]) throw new Error("Onchain configuration does not match policy v1");

      const record: LocalPermDeployment = {
        chainId: RH_TESTNET_CHAIN_ID,
        permRouter: router,
        v4Adapter: adapter,
        owner: account,
        treasury: treasury as Address,
        deploymentBlock: routerReceipt.blockNumber.toString(),
        deploymentTransactions: [routerHash, adapterHash, configureHash],
        generatedAt: new Date().toISOString(),
        source: "browser-wallet",
      };
      saveLocalDeployment(record);
      setStep("complete");
      setMessage("Local browser deployment is active. Trade and receipt pages now use these addresses.");
      setBalance(await publicClient.getBalance({ address: account }));
    } catch (cause) {
      const detail = cause as { shortMessage?: string; message?: string };
      setStep("error");
      setMessage(detail.shortMessage || detail.message || "Deployment failed");
    }
  };

  const exportManifest = () => {
    if (!deployment.local) return;
    const file = new Blob([`${JSON.stringify({
      network: "Robinhood Chain Testnet",
      rpcUrl: "https://rpc.testnet.chain.robinhood.com",
      explorerUrl: RH_TESTNET_EXPLORER,
      poolManager: POOL_MANAGER_ADDRESS,
      ...deployment.local,
    }, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "robinhood-testnet.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const actionLabel = step === "complete" ? "Deployment active" : !account ? "Connect deployment wallet" : !isCorrectChain ? "Switch to RH Testnet" : step === "idle" || step === "error" ? "Deploy testnet contracts" : "Deployment in progress…";
  const busy = ["router", "adapter", "configure", "verify"].includes(step);

  return (
    <main className="app-page light-app setup-page">
      <Header extra={<AudioToggle />} />
      <div className="app-aurora" aria-hidden="true"><i /><i /><i /><b /><b /></div>
      <section className="data-shell app-enter">
        <header className="data-hero">
          <span className="section-kicker">OWNER-SIGNED TESTNET SETUP</span>
          <h1>Deploy without sharing a private key.</h1>
          <p>Your browser wallet deploys the compiled PermRouter and restricted V4 adapter directly to chain 46630. The connected account becomes owner; no key leaves the wallet.</p>
          <div className="data-disclaimer"><i /> Testnet only · contracts are not independently audited for mainnet funds</div>
        </header>

        <section className="setup-workbench data-panel">
          <div className="setup-controls">
            <span className="section-kicker">DEPLOYMENT PARAMETERS</span>
            <h2>Robinhood Chain Testnet</h2>
            <dl>
              <div><dt>Chain ID</dt><dd>46630</dd></div>
              <div><dt>Owner</dt><dd>{account ? shortAddress(account) : "Connect wallet"}</dd></div>
              <div><dt>Wallet balance</dt><dd>{balance === undefined ? "—" : `${Number(formatEther(balance)).toFixed(5)} ETH`}</dd></div>
              <div><dt>PoolManager</dt><dd><code>{shortAddress(POOL_MANAGER_ADDRESS)}</code></dd></div>
              <div><dt>Policy v1</dt><dd>20 bps · 25% rebate</dd></div>
            </dl>
            <label><span>Treasury / fee recipient</span><input value={treasury} onChange={(event) => setTreasury(event.target.value.trim())} placeholder="0x…" /></label>
            <p>Use an address you control. The flow requires three separate wallet confirmations and testnet ETH; earlier transactions remain onchain if a later step fails.</p>
            <button className="connect-action" type="button" disabled={busy || step === "complete"} onClick={() => void deploy()}>{actionLabel}</button>
            {message && <div className={`transaction-status ${step === "error" ? "error" : step === "complete" ? "success" : "confirming"}`}><i /><span>{message}</span></div>}
          </div>

          <div className="setup-progress">
            <span className="section-kicker">SEQUENCED RELEASE STEPS</span>
            {[
              ["router", "01", "Deploy PermRouter", "Policy v1, minimum received, adapter allowlist, and settlement receipt."],
              ["adapter", "02", "Deploy V4 adapter", "Immutable official PoolManager, exact input, no arbitrary target."],
              ["configure", "03", "Enable adapter", "Only UNISWAP_V4_DIRECT is approved."],
              ["verify", "04", "Verify configuration", "Read bytecode, fee policy, and adapter status from chain."],
            ].map(([id, number, title, copy]) => {
              const order: Step[] = ["idle", "router", "adapter", "configure", "verify", "complete"];
              const complete = step === "complete" || order.indexOf(step) > order.indexOf(id as Step);
              const active = step === id;
              return <article key={id} className={`${complete ? "complete" : ""}${active ? " active" : ""}`}><b>{complete ? "✓" : number}</b><div><h3>{title}</h3><p>{copy}</p></div></article>;
            })}
            {transactions.length > 0 && <div className="setup-transactions"><span>TRANSACTIONS</span>{transactions.map((hash) => <a key={hash} href={`${RH_TESTNET_EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash.slice(0, 12)}…{hash.slice(-8)} ↗</a>)}</div>}
            {deployment.ready && deployment.router && deployment.adapter && <div className="setup-result"><b>{deployment.local ? "ACTIVE IN THIS BROWSER" : "ACTIVE FROM PROJECT MANIFEST"}</b><code>Router {shortAddress(deployment.router)}</code><code>Adapter {shortAddress(deployment.adapter)}</code>{deployment.local && <div><button type="button" onClick={exportManifest}>Export manifest</button><button type="button" onClick={() => { clearLocalDeployment(); setStep("idle"); setMessage(undefined); }}>Forget local config</button></div>}<small>{deployment.local ? "Export the manifest for repository review and source verification before treating this as a shared public deployment." : "This verified shared deployment is loaded from deployments/robinhood-testnet.json."}</small></div>}
          </div>
        </section>
      </section>
      <div className="footer-shell app-footer"><Footer /></div>
    </main>
  );
}
