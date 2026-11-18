import type { Address } from "viem";
import { ZERO_ADDRESS } from "./config";

export type LiveTokenSymbol = "ETH" | "NVDA" | "AAPL" | "SPCX" | "OPENAI" | "ANTHROPIC";

export type LiveToken = {
  symbol: LiveTokenSymbol;
  displaySymbol: string;
  name: string;
  address: Address;
  decimals: number;
  color: string;
  warning?: string;
};

export const LIVE_TOKENS: readonly LiveToken[] = [
  { symbol: "ETH", displaySymbol: "ETH", name: "Testnet Ether", address: ZERO_ADDRESS, decimals: 18, color: "#6574c4" },
  { symbol: "NVDA", displaySymbol: "NVDA·T", name: "NVDA test asset", address: "0x3ab049897b0697BdA766D8730fe1F955c9c103F0", decimals: 18, color: "#76b900", warning: "Unvalued Robinhood testnet asset; not NVIDIA equity." },
  { symbol: "AAPL", displaySymbol: "AAPL·T", name: "AAPL test asset", address: "0x438820DcfE62A21e306614A4B54383Cd8a36AcF2", decimals: 18, color: "#6f7680", warning: "Unvalued Robinhood testnet asset; not Apple equity." },
  { symbol: "SPCX", displaySymbol: "SPCX·T", name: "SPCX test asset", address: "0xba163e9887d54A854323B41fcA9cf64a1c275Ac9", decimals: 18, color: "#253450", warning: "Unvalued Robinhood testnet asset; no SpaceX ownership." },
  { symbol: "OPENAI", displaySymbol: "OPENAI·T", name: "OpenAI test asset", address: "0x1b14321750b38f7eD66A363D07a921A668521A5F", decimals: 18, color: "#10a37f", warning: "Unvalued third-party test token; no OpenAI affiliation." },
  { symbol: "ANTHROPIC", displaySymbol: "ANTH·T", name: "Anthropic test asset", address: "0x92dCe70B18df47ac643Af6377621D74aBE3C868C", decimals: 18, color: "#d97757", warning: "Unvalued third-party test token; no Anthropic affiliation." },
] as const;

export const LIVE_TOKEN_MAP = Object.fromEntries(LIVE_TOKENS.map((token) => [token.symbol, token])) as Record<LiveTokenSymbol, LiveToken>;
export const LIVE_TOKEN_BY_ADDRESS = Object.fromEntries(LIVE_TOKENS.map((token) => [token.address.toLowerCase(), token])) as Record<string, LiveToken>;

export type V4PoolFixture = {
  id: `0x${string}`;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  initializationBlock: number;
};

/**
 * Pools below are discovered from PoolManager Initialize events on chain 46630.
 * Every candidate has an empty hook and is quoted live through the deployed V4Quoter.
 */
export const RH_TESTNET_V4_POOLS: readonly V4PoolFixture[] = [
  { id: "0xad46061426962ce3cdd72f85d73d5b904c2f76136162be56dc8e63e843848142", currency0: ZERO_ADDRESS, currency1: LIVE_TOKEN_MAP.NVDA.address, fee: 3000, tickSpacing: 60, hooks: ZERO_ADDRESS, initializationBlock: 121_317_956 },
  { id: "0x60e44167df8938068cdb05cbeb03b66223261778112681a0484bcf337aea870a", currency0: ZERO_ADDRESS, currency1: LIVE_TOKEN_MAP.AAPL.address, fee: 3000, tickSpacing: 60, hooks: ZERO_ADDRESS, initializationBlock: 121_318_318 },
  { id: "0x8dc43577fcadfcf3d16399e40055710d0cb6b20cf7e593f63c7b9df5fbc3d048", currency0: ZERO_ADDRESS, currency1: LIVE_TOKEN_MAP.SPCX.address, fee: 3000, tickSpacing: 60, hooks: ZERO_ADDRESS, initializationBlock: 121_318_150 },
  { id: "0x0375f0465d6189403e3ce875b6d6c5a0c8be73efbf4654a5b314367634742e37", currency0: ZERO_ADDRESS, currency1: LIVE_TOKEN_MAP.OPENAI.address, fee: 3000, tickSpacing: 60, hooks: ZERO_ADDRESS, initializationBlock: 121_600_304 },
  { id: "0x03a204cb51a9ac57222569e3223f3d9fca504016b8c1547ba6b47e964ca028da", currency0: ZERO_ADDRESS, currency1: LIVE_TOKEN_MAP.ANTHROPIC.address, fee: 3000, tickSpacing: 60, hooks: ZERO_ADDRESS, initializationBlock: 121_600_558 },
] as const;

export function tokenPairPools(tokenIn: Address, tokenOut: Address) {
  const input = tokenIn.toLowerCase();
  const output = tokenOut.toLowerCase();
  return RH_TESTNET_V4_POOLS.filter((pool) => {
    const zero = pool.currency0.toLowerCase();
    const one = pool.currency1.toLowerCase();
    return (zero === input && one === output) || (zero === output && one === input);
  });
}
