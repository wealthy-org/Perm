// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPermAdapter} from "../interfaces/IPermAdapter.sol";

contract MockAdapter is IPermAdapter {
    using SafeERC20 for IERC20;

    address public immutable router;
    uint256 public immutable numerator;
    uint256 public immutable denominator;

    constructor(address router_, uint256 numerator_, uint256 denominator_) {
        router = router_;
        numerator = numerator_;
        denominator = denominator_;
    }

    receive() external payable {}

    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, address recipient, bytes calldata)
        external
        payable
        returns (uint256 amountOut, address hook)
    {
        require(msg.sender == router, "ONLY_ROUTER");
        if (tokenIn == address(0)) require(msg.value == amountIn, "VALUE");
        else IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        amountOut = amountIn * numerator / denominator;
        if (tokenOut == address(0)) {
            (bool ok,) = recipient.call{value: amountOut}("");
            require(ok, "NATIVE_OUT");
        } else {
            IERC20(tokenOut).safeTransfer(recipient, amountOut);
        }
        return (amountOut, address(0));
    }
}
