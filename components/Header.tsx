"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { shortAddress, useWeb3 } from "./Web3Provider";

const NAV = [
  ["/trade", "Trade"],
  ["/routes", "Routes"],
  ["/rebate", "Rebate"],
  ["/proofs", "Proof"],
  ["/docs", "Docs"],
] as const;

const MENU = [
  ["/", "Walk the flow", "00"],
  ["/trade", "Open router", "01"],
  ["/routes", "Route explorer", "02"],
  ["/rebate", "Fee rebate", "03"],
  ["/proofs", "Settlement proof", "04"],
  ["/docs", "Protocol notes", "05"],
  ["/setup", "Testnet setup", "06"],
] as const;

export default function Header({ extra }: { extra?: ReactNode }) {
  const path = usePathname();
  const { account, connecting, error, isCorrectChain, connect, disconnect, switchNetwork } = useWeb3();
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    const read = () => setSolid(window.scrollY > 10);
    read();
    addEventListener("scroll", read, { passive: true });
    return () => removeEventListener("scroll", read);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButton.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    addEventListener("pointerdown", onPointer);
    addEventListener("keydown", onKey);
    addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => {
      removeEventListener("pointerdown", onPointer);
      removeEventListener("keydown", onKey);
      removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const active = (href: string) => {
    if (href === "/") return path === "/";
    if (href.includes("#")) return false;
    return path === href || path.startsWith(`${href}/`);
  };

  return (
    <>
      <header className={`site-header${solid ? " solid" : ""}`}>
        <Link className="wordmark" href="/" aria-label="Perm home">
          <img src="/perm-mark.png" alt="" />
          <span>PERM</span>
        </Link>

        <nav className="top-nav" aria-label="Primary navigation">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={active(href) ? "active" : undefined}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <a
            className="icon-button x-link"
            href="https://x.com/usepermonx"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Perm on X"
          >
            <svg className="x-mark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M18.25 2.25h3.37l-7.36 8.42 8.66 11.08h-6.79l-5.32-6.84-5.99 6.84H1.44l7.8-8.91L.92 2.25h6.96l4.8 6.16 5.57-6.16Zm-1.18 17.55h1.87L6.86 4.1H4.85L17.07 19.8Z" />
            </svg>
          </a>
          {extra}
          <button
            className={`network-pill${account && !isCorrectChain ? " wrong-network" : ""}`}
            type="button"
            onClick={() => account && !isCorrectChain ? void switchNetwork().catch(() => undefined) : undefined}
            aria-label={isCorrectChain ? "Connected to Robinhood Chain Testnet" : "Switch to Robinhood Chain Testnet"}
          >
            <i aria-hidden="true" /><span>{account && !isCorrectChain ? "Wrong network" : "RH Testnet"}</span><small>⌄</small>
          </button>
          <button
            className="header-cta"
            type="button"
            onClick={() => account ? disconnect() : void connect().catch(() => undefined)}
            title={error || (account ? "Disconnect this interface session" : "Connect an EVM wallet")}
          >
            {connecting ? "Connecting…" : shortAddress(account)}
          </button>
          <button
            ref={menuButton}
            className="icon-button menu-trigger"
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label="Open menu"
          >
            <span aria-hidden="true" className="menu-lines"><i /><i /></span>
          </button>
        </div>
      </header>

      <nav
        ref={menuRef}
        id="site-menu"
        className={`site-menu${open ? " open" : ""}`}
        aria-label="Site menu"
      >
        <div className="menu-label">EXPLORE PERM</div>
        {MENU.map(([href, label, number]) => (
          <Link key={href} href={href} className={active(href) ? "active" : undefined}>
            <span>{label}</span><small>{number}</small>
          </Link>
        ))}
        <div className="menu-rule" />
        <a href="https://x.com/usepermonx" target="_blank" rel="noopener noreferrer" aria-label="Perm on X">
          <span className="menu-social"><svg className="x-mark" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M18.25 2.25h3.37l-7.36 8.42 8.66 11.08h-6.79l-5.32-6.84-5.99 6.84H1.44l7.8-8.91L.92 2.25h6.96l4.8 6.16 5.57-6.16Zm-1.18 17.55h1.87L6.86 4.1H4.85L17.07 19.8Z" /></svg><b>@usepermonx</b></span><small>↗</small>
        </a>
        <a href="https://github.com/wealthy-org/Perm" target="_blank" rel="noopener noreferrer">
          <span>GitHub</span><small>↗</small>
        </a>
      </nav>
    </>
  );
}
