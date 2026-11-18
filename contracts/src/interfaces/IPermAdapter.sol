// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPermAdapter {
    /// @notice Executes one exact-input candidate selected before the user signs.
    /// @dev The adapter must send all output to `recipient`, spend exactly `amountIn`,
    ///      and reject any target or route data it cannot validate itself.
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient,
        bytes calldata routeData
    ) external payable returns (uint256 amountOut, address hook);
}
