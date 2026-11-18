import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export const v4QuoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);

export const permRouterAbi = parseAbi([
  "function swapExactInput((address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,address recipient,uint256 deadline,uint64 quotedAt,uint32 policyVersion,uint256 chainId,bytes32 quoteId,address referrer,bytes routeData) request) payable returns (bytes32 receiptId,(uint256 grossFee,uint256 rebate,uint256 netFee,uint256 referralFee,uint256 treasuryFee,uint256 routedInput,uint256 amountOut) settled)",
  "function quoteIdFor(address account,(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,address recipient,uint256 deadline,uint64 quotedAt,uint32 policyVersion,uint256 chainId,bytes32 quoteId,address referrer,bytes routeData) request) pure returns (bytes32)",
  "function previewFees(uint256 amountIn,uint32 policyVersion) view returns (uint256 grossFee,uint256 rebate,uint256 netFee,uint256 routedInput)",
  "function feePolicies(uint32 version) view returns (uint16 platformFeeBps,uint16 rebateShareBps,bool enabled,bool exists)",
  "function adapters(address adapter) view returns (bool enabled,bytes32 providerId)",
  "function treasury() view returns (address)",
  "function configureAdapter(address adapter,bytes32 providerId,bool enabled)",
  "function owner() view returns (address)",
  "event SwapSettled(bytes32 indexed receiptId,bytes32 indexed quoteId,address indexed account,address recipient,address tokenIn,address tokenOut,uint256 amountIn,uint256 routedInput,uint256 amountOut,uint256 grossFee,uint256 rebate,uint256 netFee,uint256 referralFee,uint32 policyVersion,bytes32 providerId,address adapter,address hook)",
]);
