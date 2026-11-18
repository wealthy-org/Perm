// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPermAdapter} from "../interfaces/IPermAdapter.sol";

/// @title PermV4Adapter
/// @notice Restricted, single-pool Uniswap v4 exact-input adapter.
/// @dev It calls only one immutable PoolManager, rejects non-empty hook calldata,
///      and accepts hooked pools only after the owner explicitly verifies the hook.
contract PermV4Adapter is IPermAdapter, IUnlockCallback, Ownable2Step {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    struct CallbackData {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        address recipient;
        bytes hookData;
    }

    IPoolManager public immutable poolManager;
    address public immutable permRouter;
    mapping(address hook => bool) public verifiedHooks;

    event HookVerificationChanged(address indexed hook, bool verified);

    error HookDataUnsupported();
    error HookNotVerified(address hook);
    error InvalidCaller();
    error InvalidNativeValue();
    error InvalidPair();
    error PartialFillUnsupported(uint256 spent, uint256 expected);
    error UnexpectedDelta();

    constructor(address initialOwner, address router, IPoolManager manager) Ownable(initialOwner) {
        if (router == address(0) || address(manager) == address(0)) revert InvalidPair();
        permRouter = router;
        poolManager = manager;
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert InvalidCaller();
    }

    function setVerifiedHook(address hook, bool verified) external onlyOwner {
        if (hook == address(0)) revert InvalidPair();
        verifiedHooks[hook] = verified;
        emit HookVerificationChanged(hook, verified);
    }

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient,
        bytes calldata routeData
    ) external payable returns (uint256 amountOut, address hook) {
        if (msg.sender != permRouter) revert InvalidCaller();
        (PoolKey memory key, bytes memory hookData) = abi.decode(routeData, (PoolKey, bytes));
        if (hookData.length != 0) revert HookDataUnsupported();

        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        bool zeroForOne;
        if (tokenIn == currency0 && tokenOut == currency1) zeroForOne = true;
        else if (tokenIn == currency1 && tokenOut == currency0) zeroForOne = false;
        else revert InvalidPair();

        hook = address(key.hooks);
        if (hook != address(0) && !verifiedHooks[hook]) revert HookNotVerified(hook);

        if (tokenIn == address(0)) {
            if (msg.value != amountIn) revert InvalidNativeValue();
        } else {
            if (msg.value != 0) revert InvalidNativeValue();
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData(key, zeroForOne, amountIn, recipient, hookData))
        );
        amountOut = abi.decode(result, (uint256));
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert InvalidCaller();
        CallbackData memory data = abi.decode(rawData, (CallbackData));
        SwapParams memory params = SwapParams({
            zeroForOne: data.zeroForOne,
            amountSpecified: -int256(data.amountIn),
            sqrtPriceLimitX96: data.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });

        BalanceDelta delta = poolManager.swap(data.key, params, data.hookData);
        int128 inputDelta = data.zeroForOne ? delta.amount0() : delta.amount1();
        int128 outputDelta = data.zeroForOne ? delta.amount1() : delta.amount0();
        if (inputDelta >= 0 || outputDelta <= 0) revert UnexpectedDelta();

        uint256 spent = uint256(uint128(-inputDelta));
        if (spent != data.amountIn) revert PartialFillUnsupported(spent, data.amountIn);
        uint256 amountOut = uint256(uint128(outputDelta));

        Currency inputCurrency = data.zeroForOne ? data.key.currency0 : data.key.currency1;
        Currency outputCurrency = data.zeroForOne ? data.key.currency1 : data.key.currency0;
        if (inputCurrency.isAddressZero()) {
            poolManager.settle{value: spent}();
        } else {
            poolManager.sync(inputCurrency);
            inputCurrency.transfer(address(poolManager), spent);
            poolManager.settle();
        }
        poolManager.take(outputCurrency, data.recipient, amountOut);
        return abi.encode(amountOut);
    }
}
