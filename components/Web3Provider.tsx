"use client";

import {
  createWalletClient,
  custom,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { RH_TESTNET_CHAIN_ID, RH_TESTNET_EXPLORER, robinhoodTestnet } from "@/lib/web3/config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void };
  }
}

type Web3ContextValue = {
  account?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
  isCorrectChain: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  walletClient: () => WalletClient;
};

const Web3Context = createContext<Web3ContextValue | null>(null);

function injectedProvider() {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("No EVM browser wallet detected. Install Robinhood Wallet, MetaMask, or Rabby.");
  return window.ethereum;
}

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    const [accounts, chain] = await Promise.all([
      window.ethereum.request({ method: "eth_accounts" }) as Promise<Address[]>,
      window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAccount(accounts[0]);
    setChainId(Number.parseInt(chain, 16));
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
    const provider = window.ethereum;
    if (!provider?.on) return;
    const accountsChanged = (value: unknown) => setAccount((value as Address[])[0]);
    const chainChanged = (value: unknown) => setChainId(Number.parseInt(String(value), 16));
    provider.on("accountsChanged", accountsChanged);
    provider.on("chainChanged", chainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [refresh]);

  const switchNetwork = useCallback(async () => {
    const provider = injectedProvider();
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(RH_TESTNET_CHAIN_ID) }] });
    } catch (cause) {
      const code = (cause as { code?: number }).code;
      if (code !== 4902) throw cause;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: numberToHex(RH_TESTNET_CHAIN_ID),
          chainName: robinhoodTestnet.name,
          nativeCurrency: robinhoodTestnet.nativeCurrency,
          rpcUrls: robinhoodTestnet.rpcUrls.default.http,
          blockExplorerUrls: [RH_TESTNET_EXPLORER],
        }],
      });
    }
    await refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(undefined);
    try {
      const provider = injectedProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as Address[];
      setAccount(accounts[0]);
      const chain = await provider.request({ method: "eth_chainId" }) as string;
      const nextChain = Number.parseInt(chain, 16);
      setChainId(nextChain);
      if (nextChain !== RH_TESTNET_CHAIN_ID) await switchNetwork();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed");
      throw cause;
    } finally {
      setConnecting(false);
    }
  }, [switchNetwork]);

  const disconnect = useCallback(() => {
    setAccount(undefined);
    setError(undefined);
  }, []);

  const getWalletClient = useCallback(() => createWalletClient({
    account,
    chain: robinhoodTestnet,
    transport: custom(injectedProvider()),
  }), [account]);

  const value = useMemo<Web3ContextValue>(() => ({
    account,
    chainId,
    connecting,
    error,
    isCorrectChain: chainId === RH_TESTNET_CHAIN_ID,
    connect,
    disconnect,
    switchNetwork,
    walletClient: getWalletClient,
  }), [account, chainId, connecting, error, connect, disconnect, switchNetwork, getWalletClient]);

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const value = useContext(Web3Context);
  if (!value) throw new Error("useWeb3 must be used inside Web3Provider");
  return value;
}

export function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect";
}
