const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const RUN = process.env.RUN_FORK_TESTS === "1";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NVDA = "0x3ab049897b0697BdA766D8730fe1F955c9c103F0";
const ZERO = ethers.ZeroAddress;
const POOL = { currency0: ZERO, currency1: NVDA, fee: 3000, tickSpacing: 60, hooks: ZERO };

describe(RUN ? "PermV4Adapter · Robinhood testnet fork" : "PermV4Adapter fork (skipped)", function () {
  if (!RUN) {
    it.skip("set RUN_FORK_TESTS=1 to run against the official Robinhood testnet PoolManager", function () {});
    return;
  }

  it("executes a real no-hook v4 pool in both directions with router-level rebate", async function () {
    const [owner, user, recipient, treasury] = await ethers.getSigners();
    expect((await ethers.provider.getNetwork()).chainId).to.equal(46630n);
    expect((await ethers.provider.getCode(POOL_MANAGER)).length).to.be.greaterThan(1000);

    const Router = await ethers.getContractFactory("PermRouter");
    const router = await Router.deploy(owner.address, treasury.address);
    const Adapter = await ethers.getContractFactory("PermV4Adapter");
    const adapter = await Adapter.deploy(owner.address, await router.getAddress(), POOL_MANAGER);
    await router.configureAdapter(await adapter.getAddress(), ethers.id("UNISWAP_V4_DIRECT"), true);

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const routeData = coder.encode(
      ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)", "bytes"],
      [POOL, "0x"],
    );
    const quotedAt = (await ethers.provider.getBlock("latest")).timestamp;
    const amountIn = ethers.parseEther("0.001");
    const buy = {
      adapter: await adapter.getAddress(), tokenIn: ZERO, tokenOut: NVDA, amountIn,
      minAmountOut: 1n, recipient: user.address, deadline: quotedAt + 90,
      quotedAt, policyVersion: 1, chainId: 46630,
      quoteId: ethers.ZeroHash, referrer: ZERO, routeData,
    };
    buy.quoteId = await router.quoteIdFor(user.address, buy);
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    await expect(router.connect(user).swapExactInput(buy, { value: amountIn })).to.emit(router, "SwapSettled");
    const nvdaBalance = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], NVDA);
    const bought = await nvdaBalance.balanceOf(user.address);
    expect(bought).to.be.greaterThan(0n);
    expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(ethers.parseEther("0.0000015"));

    await nvdaBalance.connect(user).approve(await router.getAddress(), bought);
    const quotedAt2 = (await ethers.provider.getBlock("latest")).timestamp;
    const nativeBefore = await ethers.provider.getBalance(recipient.address);
    const sell = {
      adapter: await adapter.getAddress(), tokenIn: NVDA, tokenOut: ZERO, amountIn: bought,
      minAmountOut: 1n, recipient: recipient.address, deadline: quotedAt2 + 90,
      quotedAt: quotedAt2, policyVersion: 1, chainId: 46630,
      quoteId: ethers.ZeroHash, referrer: ZERO, routeData,
    };
    sell.quoteId = await router.quoteIdFor(user.address, sell);
    await expect(router.connect(user).swapExactInput(sell)).to.emit(router, "SwapSettled");
    expect((await ethers.provider.getBalance(recipient.address)) - nativeBefore).to.be.greaterThan(0n);
    expect(await nvdaBalance.balanceOf(user.address)).to.equal(0n);
  });
});
