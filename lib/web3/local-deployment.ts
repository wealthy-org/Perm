"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { PERM_ROUTER_ADDRESS, PERM_V4_ADAPTER_ADDRESS, RH_TESTNET_CHAIN_ID } from "./config";

export type LocalPermDeployment = {
  chainId: number;
  permRouter: Address;
  v4Adapter: Address;
  owner: Address;
  treasury: Address;
  deploymentBlock: string;
  deploymentTransactions: Hex[];
  generatedAt: string;
  source: "browser-wallet";
};

const STORAGE_KEY = "perm:testnet-deployment:v1";
const CHANGE_EVENT = "perm-deployment-change";

export function readLocalDeployment(): LocalPermDeployment | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as LocalPermDeployment | null;
    if (!value || value.chainId !== RH_TESTNET_CHAIN_ID || !isAddress(value.permRouter) || !isAddress(value.v4Adapter)) return undefined;
    return { ...value, permRouter: getAddress(value.permRouter), v4Adapter: getAddress(value.v4Adapter) };
  } catch {
    return undefined;
  }
}

export function saveLocalDeployment(value: LocalPermDeployment) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearLocalDeployment() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePermDeployment() {
  const [local, setLocal] = useState<LocalPermDeployment>();
  useEffect(() => {
    const read = () => setLocal(readLocalDeployment());
    read();
    window.addEventListener(CHANGE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CHANGE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const router = local?.permRouter || PERM_ROUTER_ADDRESS;
  const adapter = local?.v4Adapter || PERM_V4_ADAPTER_ADDRESS;
  return { router, adapter, local, ready: Boolean(router && adapter), source: local ? "browser" as const : router ? "manifest" as const : "none" as const };
}
