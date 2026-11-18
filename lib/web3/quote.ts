import type { Address, Hex } from "viem";

export type LiveQuoteCandidate = {
  providerId: string;
  providerLabel: string;
  poolId: Hex;
  pool: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  amountOut: string;
  minAmountOut: string;
  gasEstimate: string;
  estimatedNetworkFeeWei: string;
  routeData: Hex;
  hook: Address;
  verifiedHook: boolean;
};

export type LiveQuote = {
  chainId: number;
  quoteId: Hex;
  quotedAt: number;
  deadline: number;
  policyVersion: number;
  account: Address;
  recipient: Address;
  adapter: Address;
  referrer: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  grossFee: string;
  rebate: string;
  netFee: string;
  routedInput: string;
  slippageBps: number;
  blockNumber: string;
  executable: boolean;
  deploymentReason?: string;
  selected: LiveQuoteCandidate;
  candidates: LiveQuoteCandidate[];
};
