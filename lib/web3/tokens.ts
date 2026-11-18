import type { Address } from "viem";
import { ZERO_ADDRESS } from "./config";

export type LiveTokenSymbol = "ETH" | "NVDA" | "AAPL" | "SPCX" | "OPENAI" | "ANTHROPIC" | "TSLA" | "AMZN" | "PLTR" | "NFLX" | "AMD";

export type LiveToken = {
  symbol: LiveTokenSymbol;
  displaySymbol: string;
  name: string;
  address: Address;
  decimals: number;
  color: string;
  warning?: string;
  venue: "uniswap-v4" | "synthra-v3" | "both";
};

export const LIVE_TOKENS: readonly LiveToken[] = [
  { symbol: "ETH", displaySymbol: "ETH", name: "Testnet Ether", address: ZERO_ADDRESS, decimals: 18, color: "#6574c4", venue: "both" },
  { symbol: "NVDA", displaySymbol: "NVDA·T", name: "NVDA test asset", address: "0x3ab049897b0697BdA766D8730fe1F955c9c103F0", decimals: 18, color: "#76b900", venue: "uniswap-v4", warning: "Unvalued Robinhood testnet asset; not NVIDIA equity." },
  { symbol: "AAPL", displaySymbol: "AAPL·T", name: "AAPL test asset", address: "0x438820DcfE62A21e306614A4B54383Cd8a36AcF2", decimals: 18, color: "#6f7680", venue: "uniswap-v4", warning: "Unvalued Robinhood testnet asset; not Apple equity." },
  { symbol: "SPCX", displaySymbol: "SPCX·T", name: "SPCX test asset", address: "0xba163e9887d54A854323B41fcA9cf64a1c275Ac9", decimals: 18, color: "#253450", venue: "uniswap-v4", warning: "Unvalued Robinhood testnet asset; no SpaceX ownership." },
  { symbol: "OPENAI", displaySymbol: "OPENAI·T", name: "OpenAI test asset", address: "0x1b14321750b38f7eD66A363D07a921A668521A5F", decimals: 18, color: "#10a37f", venue: "uniswap-v4", warning: "Unvalued third-party test token; no OpenAI affiliation." },
  { symbol: "ANTHROPIC", displaySymbol: "ANTH·T", name: "Anthropic test asset", address: "0x92dCe70B18df47ac643Af6377621D74aBE3C868C", decimals: 18, color: "#d97757", venue: "uniswap-v4", warning: "Unvalued third-party test token; no Anthropic affiliation." },
  { symbol: "TSLA", displaySymbol: "TSLA·T", name: "TSLA Synthra test asset", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E", decimals: 18, color: "#cc2222", venue: "synthra-v3", warning: "Unvalued third-party test token; not Tesla equity." },
  { symbol: "AMZN", displaySymbol: "AMZN·T", name: "AMZN Synthra test asset", address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02", decimals: 18, color: "#ff9900", venue: "synthra-v3", warning: "Unvalued third-party test token; not Amazon equity." },
  { symbol: "PLTR", displaySymbol: "PLTR·T", name: "PLTR Synthra test asset", address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0", decimals: 18, color: "#252525", venue: "synthra-v3", warning: "Unvalued third-party test token; not Palantir equity." },
  { symbol: "NFLX", displaySymbol: "NFLX·T", name: "NFLX Synthra test asset", address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93", decimals: 18, color: "#e50914", venue: "synthra-v3", warning: "Unvalued third-party test token; not Netflix equity." },
  { symbol: "AMD", displaySymbol: "AMD·T", name: "AMD Synthra test asset", address: "0x71178BAc73cBeb415514eB542a8995b82669778d", decimals: 18, color: "#ed1c24", venue: "synthra-v3", warning: "Unvalued third-party test token; not AMD equity." },
] as const;

export const LIVE_TOKEN_MAP = Object.fromEntries(LIVE_TOKENS.map((token) => [token.symbol, token])) as Record<LiveTokenSymbol, LiveToken>;
export const LIVE_TOKEN_BY_ADDRESS = Object.fromEntries(LIVE_TOKENS.map((token) => [token.address.toLowerCase(), token])) as Record<string, LiveToken>;

