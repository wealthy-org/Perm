// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPermAdapter} from "./interfaces/IPermAdapter.sol";

/// @title PermRouter
/// @notice Exact-input settlement entry point with immutable, versioned fee policies.
/// @dev v1 charges 20 bps gross and rebates 25% of that gross fee, producing a
///      15 bps net Perm fee. The rebate is an instant fee reduction, not cashback.
contract PermRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PLATFORM_FEE_BPS = 100; // hard cap: 1%
    uint256 public constant MAX_QUOTE_AGE = 120 seconds;
    uint32 public constant INITIAL_POLICY_VERSION = 1;
    bytes32 public constant QUOTE_DOMAIN = keccak256("PERM_QUOTE_V1");

    struct FeePolicy {
        uint16 platformFeeBps;
        uint16 rebateShareBps;
        bool enabled;
        bool exists;
    }

    struct AdapterConfig {
        bool enabled;
        bytes32 providerId;
    }

    struct SwapRequest {
        address adapter;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        uint256 deadline;
        uint64 quotedAt;
        uint32 policyVersion;
        uint256 chainId;
        bytes32 quoteId;
        address referrer;
        bytes routeData;
    }

    struct SettlementAmounts {
        uint256 grossFee;
        uint256 rebate;
        uint256 netFee;
        uint256 referralFee;
        uint256 treasuryFee;
        uint256 routedInput;
        uint256 amountOut;
    }

    mapping(uint32 version => FeePolicy) public feePolicies;
    mapping(address adapter => AdapterConfig) public adapters;
    mapping(address referrer => uint16 shareBpsOfNetFee) public referralShares;
    mapping(address account => mapping(bytes32 quoteId => bool)) public consumedQuotes;

    address public treasury;
    uint256 public settlementNonce;

    event FeePolicyPublished(uint32 indexed version, uint16 platformFeeBps, uint16 rebateShareBps, bool enabled);
    event FeePolicyStatusChanged(uint32 indexed version, bool enabled);
    event AdapterConfigured(address indexed adapter, bytes32 indexed providerId, bool enabled);
    event ReferralConfigured(address indexed referrer, uint16 shareBpsOfNetFee);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event SwapSettled(
        bytes32 indexed receiptId,
        bytes32 indexed quoteId,
        address indexed account,
        address recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 routedInput,
        uint256 amountOut,
        uint256 grossFee,
        uint256 rebate,
        uint256 netFee,
        uint256 referralFee,
        uint32 policyVersion,
        bytes32 providerId,
        address adapter,
        address hook
    );

    error AdapterDisabled(address adapter);
    error AlreadyConsumed(bytes32 quoteId);
    error AmountTooLarge();
    error ChainMismatch(uint256 expected, uint256 actual);
    error DeadlineExpired();
    error FeeOnTransferInputUnsupported();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFeePolicy();
    error InvalidNativeValue();
    error InvalidPair();
    error OutputBelowMinimum(uint256 actual, uint256 minimum);
    error PolicyUnavailable(uint32 version);
    error QuoteBindingMismatch(bytes32 supplied, bytes32 expected);
    error QuoteFromFuture();
    error QuoteStale();
    error TransferFailed();

    constructor(address initialOwner, address initialTreasury) Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidAddress();
        treasury = initialTreasury;
        _publishFeePolicy(INITIAL_POLICY_VERSION, 20, 2_500, true);
    }

    receive() external payable {}

    function quoteIdFor(address account, SwapRequest calldata request) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_DOMAIN,
                account,
                request.adapter,
                request.tokenIn,
                request.tokenOut,
                request.amountIn,
                request.minAmountOut,
                request.recipient,
                request.deadline,
                request.quotedAt,
                request.policyVersion,
                request.chainId,
                request.referrer,
                keccak256(request.routeData)
            )
        );
    }

    function previewFees(uint256 amountIn, uint32 policyVersion)
        public
        view
        returns (uint256 grossFee, uint256 rebate, uint256 netFee, uint256 routedInput)
    {
        FeePolicy memory policy = feePolicies[policyVersion];
        if (!policy.exists || !policy.enabled) revert PolicyUnavailable(policyVersion);
        grossFee = amountIn * policy.platformFeeBps / BPS;
        rebate = grossFee * policy.rebateShareBps / BPS;
        netFee = grossFee - rebate;
        routedInput = amountIn - netFee;
    }

    function swapExactInput(SwapRequest calldata request)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 receiptId, SettlementAmounts memory settled)
    {
        _validateRequest(request);
        AdapterConfig memory adapterConfig = adapters[request.adapter];
        if (!adapterConfig.enabled) revert AdapterDisabled(request.adapter);

        consumedQuotes[msg.sender][request.quoteId] = true;
        (settled.grossFee, settled.rebate, settled.netFee, settled.routedInput) =
            previewFees(request.amountIn, request.policyVersion);
        _collectInput(request.tokenIn, request.amountIn);

        uint16 referralBps = request.referrer == address(0) ? 0 : referralShares[request.referrer];
        settled.referralFee = settled.netFee * referralBps / BPS;
        settled.treasuryFee = settled.netFee - settled.referralFee;

        uint256 beforeOutput = _balanceOf(request.tokenOut, address(this));
        address hook;
        if (request.tokenIn == address(0)) {
            (, hook) = IPermAdapter(request.adapter).swapExactInput{value: settled.routedInput}(
                request.tokenIn, request.tokenOut, settled.routedInput, address(this), request.routeData
            );
        } else {
            IERC20(request.tokenIn).forceApprove(request.adapter, settled.routedInput);
            (, hook) = IPermAdapter(request.adapter).swapExactInput(
                request.tokenIn, request.tokenOut, settled.routedInput, address(this), request.routeData
            );
            IERC20(request.tokenIn).forceApprove(request.adapter, 0);
        }

        uint256 afterOutput = _balanceOf(request.tokenOut, address(this));
        settled.amountOut = afterOutput - beforeOutput;
        if (settled.amountOut < request.minAmountOut) {
            revert OutputBelowMinimum(settled.amountOut, request.minAmountOut);
        }

        settled.amountOut = _deliverOutput(request.tokenOut, request.recipient, settled.amountOut, request.minAmountOut);
        _distributeFee(request.tokenIn, request.referrer, settled.referralFee, settled.treasuryFee);

        uint256 nonce = ++settlementNonce;
        receiptId = keccak256(abi.encode(block.chainid, address(this), nonce, request.quoteId));
        emit SwapSettled(
            receiptId,
            request.quoteId,
            msg.sender,
            request.recipient,
            request.tokenIn,
            request.tokenOut,
            request.amountIn,
            settled.routedInput,
            settled.amountOut,
            settled.grossFee,
            settled.rebate,
            settled.netFee,
            settled.referralFee,
            request.policyVersion,
            adapterConfig.providerId,
            request.adapter,
            hook
        );
    }

    function publishFeePolicy(uint32 version, uint16 platformFeeBps, uint16 rebateShareBps, bool enabled)
        external
        onlyOwner
    {
        _publishFeePolicy(version, platformFeeBps, rebateShareBps, enabled);
    }

    function setFeePolicyEnabled(uint32 version, bool enabled) external onlyOwner {
        FeePolicy storage policy = feePolicies[version];
        if (!policy.exists) revert PolicyUnavailable(version);
        policy.enabled = enabled;
        emit FeePolicyStatusChanged(version, enabled);
    }

    function configureAdapter(address adapter, bytes32 providerId, bool enabled) external onlyOwner {
        if (adapter == address(0) || adapter.code.length == 0) revert InvalidAddress();
        adapters[adapter] = AdapterConfig({enabled: enabled, providerId: providerId});
        emit AdapterConfigured(adapter, providerId, enabled);
    }

    function configureReferral(address referrer, uint16 shareBpsOfNetFee) external onlyOwner {
        if (referrer == address(0) || shareBpsOfNetFee > BPS) revert InvalidFeePolicy();
        referralShares[referrer] = shareBpsOfNetFee;
        emit ReferralConfigured(referrer, shareBpsOfNetFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _publishFeePolicy(uint32 version, uint16 platformFeeBps, uint16 rebateShareBps, bool enabled) internal {
        if (
            version == 0 || feePolicies[version].exists || platformFeeBps > MAX_PLATFORM_FEE_BPS
                || rebateShareBps > BPS
        ) revert InvalidFeePolicy();
        feePolicies[version] = FeePolicy(platformFeeBps, rebateShareBps, enabled, true);
        emit FeePolicyPublished(version, platformFeeBps, rebateShareBps, enabled);
    }

    function _validateRequest(SwapRequest calldata request) internal view {
        if (request.chainId != block.chainid) revert ChainMismatch(request.chainId, block.chainid);
        if (request.deadline < block.timestamp) revert DeadlineExpired();
        if (request.quotedAt > block.timestamp) revert QuoteFromFuture();
        if (block.timestamp - request.quotedAt > MAX_QUOTE_AGE) revert QuoteStale();
        if (request.amountIn == 0 || request.quoteId == bytes32(0)) revert InvalidAmount();
        if (request.amountIn > uint256(uint128(type(int128).max))) revert AmountTooLarge();
        if (request.tokenIn == request.tokenOut) revert InvalidPair();
        if (request.recipient == address(0) || request.recipient == address(this)) revert InvalidAddress();
        if (consumedQuotes[msg.sender][request.quoteId]) revert AlreadyConsumed(request.quoteId);
        bytes32 expectedQuoteId = quoteIdFor(msg.sender, request);
        if (request.quoteId != expectedQuoteId) revert QuoteBindingMismatch(request.quoteId, expectedQuoteId);
    }

    function _collectInput(address token, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidNativeValue();
            return;
        }
        if (msg.value != 0) revert InvalidNativeValue();
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - beforeBalance != amount) {
            revert FeeOnTransferInputUnsupported();
        }
    }

    function _deliverOutput(address token, address recipient, uint256 amount, uint256 minimum)
        internal
        returns (uint256 actualReceived)
    {
        if (token == address(0)) {
            (bool ok,) = recipient.call{value: amount}("");
            if (!ok) revert TransferFailed();
            return amount;
        }
        uint256 beforeRecipient = IERC20(token).balanceOf(recipient);
        IERC20(token).safeTransfer(recipient, amount);
        actualReceived = IERC20(token).balanceOf(recipient) - beforeRecipient;
        if (actualReceived < minimum) revert OutputBelowMinimum(actualReceived, minimum);
    }

    function _distributeFee(address token, address referrer, uint256 referralFee, uint256 treasuryFee) internal {
        if (referralFee != 0) _transfer(token, referrer, referralFee);
        if (treasuryFee != 0) _transfer(token, treasury, treasuryFee);
    }

    function _transfer(address token, address recipient, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = recipient.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    function _balanceOf(address token, address account) internal view returns (uint256) {
        return token == address(0) ? account.balance : IERC20(token).balanceOf(account);
    }
}
