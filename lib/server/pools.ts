import type { Address, Hex } from "viem";
import poolRegistry from "@/deployments/v4-pools.json";

export type V4PoolFixture = {
  id: Hex;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  hookData: Hex;
  sourceType: "direct" | "aggregator-hook";
  initializationBlock: number;
};

/** Persistent, event-discovered PoolManager registry. Hooked pools are excluded by
 * discovery unless their hook address was explicitly approved by operations. */
export const RH_TESTNET_V4_POOLS: readonly V4PoolFixture[] = poolRegistry.pools.map((pool) => ({
  id: pool.id as Hex,
  currency0: pool.currency0 as Address,
  currency1: pool.currency1 as Address,
  fee: pool.fee,
  tickSpacing: pool.tickSpacing,
  hooks: pool.hooks as Address,
  hookData: pool.hookData as Hex,
  sourceType: pool.sourceType === "verified-hook" ? "aggregator-hook" : "direct",
  initializationBlock: pool.initializationBlock,
}));

export function tokenPairPools(tokenIn: Address, tokenOut: Address) {
  const input = tokenIn.toLowerCase();
  const output = tokenOut.toLowerCase();
  return RH_TESTNET_V4_POOLS.filter((pool) => {
    const zero = pool.currency0.toLowerCase();
    const one = pool.currency1.toLowerCase();
    return (zero === input && one === output) || (zero === output && one === input);
  });
}
