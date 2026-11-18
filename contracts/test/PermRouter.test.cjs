const { expect } = require("chai");
const { ethers } = require("hardhat");

const POLICY_V1 = 1;
const CHAIN_ID = 31337;
const ZERO = ethers.ZeroAddress;

async function now() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}

function makeRequest(adapter, tokenIn, tokenOut, amountIn, recipient, quotedAt, overrides = {}) {
  return {
    adapter,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut: 1,
    recipient,
    deadline: quotedAt + 90,
    quotedAt,
    policyVersion: POLICY_V1,
    chainId: CHAIN_ID,
    quoteId: ethers.ZeroHash,
    referrer: ZERO,
    routeData: "0x",
    ...overrides,
  };
}

async function bindQuote(router, account, request) {
  const unbound = { ...request, quoteId: ethers.ZeroHash };
  return { ...unbound, quoteId: await router.quoteIdFor(account, unbound) };
}

describe("PermRouter", function () {
  async function fixture() {
    const [owner, user, recipient, treasury, referrer] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const tokenIn = await Token.deploy("Input", "IN", 18);
    const tokenOut = await Token.deploy("Output", "OUT", 18);
    const Router = await ethers.getContractFactory("PermRouter");
    const router = await Router.deploy(owner.address, treasury.address);
    const Adapter = await ethers.getContractFactory("MockAdapter");
    const adapter = await Adapter.deploy(await router.getAddress(), 2, 1);
    const providerId = ethers.id("UNISWAP_V4_DIRECT");
    await router.configureAdapter(await adapter.getAddress(), providerId, true);
    await tokenIn.mint(user.address, ethers.parseEther("10000"));
    await tokenOut.mint(await adapter.getAddress(), ethers.parseEther("30000"));
    await user.sendTransaction({ to: await adapter.getAddress(), value: ethers.parseEther("100") });
    return { owner, user, recipient, treasury, referrer, tokenIn, tokenOut, router, adapter, providerId };
  }

  it("settles exact input with 20 bps gross, 25% rebate, and 15 bps net fee", async function () {
    const { user, recipient, treasury, tokenIn, tokenOut, router, adapter } = await fixture();
    const amountIn = ethers.parseEther("100");
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(
      await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t,
      { minAmountOut: ethers.parseEther("199") },
    ));
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);

    const expectedGross = ethers.parseEther("0.2");
    const expectedRebate = ethers.parseEther("0.05");
    const expectedNet = ethers.parseEther("0.15");
    const expectedRouted = ethers.parseEther("99.85");
    const expectedOut = ethers.parseEther("199.7");

    await expect(router.connect(user).swapExactInput(request)).to.emit(router, "SwapSettled");

    expect(await tokenOut.balanceOf(recipient.address)).to.equal(expectedOut);
    expect(await tokenIn.balanceOf(treasury.address)).to.equal(expectedNet);
    expect(await tokenIn.allowance(await router.getAddress(), await adapter.getAddress())).to.equal(0);
    expect(await router.consumedQuotes(user.address, request.quoteId)).to.equal(true);
  });

  it("publishes immutable versions for zero fee and 100% rebate edge cases", async function () {
    const { router } = await fixture();
    await router.publishFeePolicy(2, 0, 0, true);
    await router.publishFeePolicy(3, 20, 10000, true);
    expect(await router.previewFees(99, 2)).to.deep.equal([0n, 0n, 0n, 99n]);
    expect(await router.previewFees(100000n, 3)).to.deep.equal([200n, 200n, 0n, 100000n]);
    await expect(router.publishFeePolicy(3, 20, 2500, true)).to.be.revertedWithCustomError(router, "InvalidFeePolicy");
    await expect(router.publishFeePolicy(4, 101, 0, true)).to.be.revertedWithCustomError(router, "InvalidFeePolicy");
  });

  it("rounds dust down without creating an unfunded rebate", async function () {
    const { router } = await fixture();
    expect(await router.previewFees(499n, 1)).to.deep.equal([0n, 0n, 0n, 499n]);
    expect(await router.previewFees(500n, 1)).to.deep.equal([1n, 0n, 1n, 499n]);
  });

  it("splits only the net fee with an allowlisted referrer and conserves the gross fee", async function () {
    const { user, recipient, treasury, referrer, tokenIn, tokenOut, router, adapter } = await fixture();
    await router.configureReferral(referrer.address, 2000);
    const amountIn = ethers.parseEther("100");
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t, { referrer: referrer.address }));
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);
    await router.connect(user).swapExactInput(request);
    expect(await tokenIn.balanceOf(referrer.address)).to.equal(ethers.parseEther("0.03"));
    expect(await tokenIn.balanceOf(treasury.address)).to.equal(ethers.parseEther("0.12"));
  });

  it("supports native input and keeps the same fee basis", async function () {
    const { user, recipient, treasury, tokenOut, router, adapter } = await fixture();
    const amountIn = ethers.parseEther("1");
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), ZERO, await tokenOut.getAddress(), amountIn, recipient.address, t, { minAmountOut: ethers.parseEther("1.99") }));
    const beforeTreasury = await ethers.provider.getBalance(treasury.address);
    await router.connect(user).swapExactInput(request, { value: amountIn });
    expect(await tokenOut.balanceOf(recipient.address)).to.equal(ethers.parseEther("1.997"));
    expect((await ethers.provider.getBalance(treasury.address)) - beforeTreasury).to.equal(ethers.parseEther("0.0015"));
  });

  it("supports native output and transfers an exact recipient amount", async function () {
    const { user, recipient, tokenIn, router, adapter } = await fixture();
    const amountIn = ethers.parseEther("1");
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), ZERO, amountIn, recipient.address, t, { minAmountOut: ethers.parseEther("1.99") }));
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);
    const before = await ethers.provider.getBalance(recipient.address);
    await router.connect(user).swapExactInput(request);
    expect((await ethers.provider.getBalance(recipient.address)) - before).to.equal(ethers.parseEther("1.997"));
  });

  it("rejects stale, expired, wrong-chain, duplicate, disabled, and below-minimum requests", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } = await fixture();
    const amountIn = ethers.parseEther("1");
    await tokenIn.connect(user).approve(await router.getAddress(), ethers.MaxUint256);
    const t = await now();
    const base = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t));

    await expect(router.connect(user).swapExactInput({ ...base, chainId: 46630 })).to.be.revertedWithCustomError(router, "ChainMismatch");
    await expect(router.connect(user).swapExactInput({ ...base, deadline: t - 1 })).to.be.revertedWithCustomError(router, "DeadlineExpired");
    await expect(router.connect(user).swapExactInput({ ...base, quotedAt: t - 121 })).to.be.revertedWithCustomError(router, "QuoteStale");
    const slippage = await bindQuote(router, user.address, { ...base, minAmountOut: ethers.parseEther("100") });
    await expect(router.connect(user).swapExactInput(slippage)).to.be.revertedWithCustomError(router, "OutputBelowMinimum");
    expect(await router.consumedQuotes(user.address, slippage.quoteId)).to.equal(false);

    await router.connect(user).swapExactInput(base);
    await expect(router.connect(user).swapExactInput(base)).to.be.revertedWithCustomError(router, "AlreadyConsumed");
    await router.configureAdapter(await adapter.getAddress(), ethers.id("UNISWAP_V4_DIRECT"), false);
    const disabled = await bindQuote(router, user.address, { ...base, minAmountOut: 2n });
    await expect(router.connect(user).swapExactInput(disabled)).to.be.revertedWithCustomError(router, "AdapterDisabled");
  });

  it("rolls all fee and receipt state back on a failed trade", async function () {
    const { user, recipient, treasury, tokenIn, tokenOut, router, adapter } = await fixture();
    const t = await now();
    const amountIn = ethers.parseEther("100000");
    await tokenIn.mint(user.address, amountIn);
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t));
    await expect(router.connect(user).swapExactInput(request)).to.be.reverted;
    expect(await tokenIn.balanceOf(treasury.address)).to.equal(0);
    expect(await router.consumedQuotes(user.address, request.quoteId)).to.equal(false);
  });

  it("rejects fee-on-transfer inputs before routing and enforces minimum received for taxed outputs", async function () {
    const { user, recipient, treasury, tokenIn, tokenOut, router, adapter } = await fixture();
    const TaxToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const taxedInput = await TaxToken.deploy("Taxed Input", "TIN", 100);
    await taxedInput.mint(user.address, ethers.parseEther("100"));
    const t = await now();
    const inputRequest = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await taxedInput.getAddress(), await tokenOut.getAddress(), ethers.parseEther("100"), recipient.address, t));
    await taxedInput.connect(user).approve(await router.getAddress(), inputRequest.amountIn);
    await expect(router.connect(user).swapExactInput(inputRequest)).to.be.revertedWithCustomError(router, "FeeOnTransferInputUnsupported");
    expect(await router.consumedQuotes(user.address, inputRequest.quoteId)).to.equal(false);
    expect(await taxedInput.balanceOf(treasury.address)).to.equal(0);

    const taxedOutput = await TaxToken.deploy("Taxed Output", "TOUT", 100);
    await taxedOutput.mint(await adapter.getAddress(), ethers.parseEther("300"));
    const amountIn = ethers.parseEther("100");
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn * 2n);
    const strictRequest = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await taxedOutput.getAddress(), amountIn, recipient.address, t, {
      minAmountOut: ethers.parseEther("197"),
    }));
    await expect(router.connect(user).swapExactInput(strictRequest)).to.be.revertedWithCustomError(router, "OutputBelowMinimum");
    expect(await router.consumedQuotes(user.address, strictRequest.quoteId)).to.equal(false);

    const validRequest = await bindQuote(router, user.address, { ...strictRequest, minAmountOut: ethers.parseEther("195") });
    await router.connect(user).swapExactInput(validRequest);
    expect(await taxedOutput.balanceOf(recipient.address)).to.equal(ethers.parseEther("195.72597"));
  });

  it("blocks reentrancy and rolls quote, token, and allowance state back", async function () {
    const { user, recipient, tokenIn, tokenOut, router } = await fixture();
    const Reentrant = await ethers.getContractFactory("ReentrantAdapter");
    const reentrant = await Reentrant.deploy(await router.getAddress());
    await router.configureAdapter(await reentrant.getAddress(), ethers.id("MALICIOUS_REENTRY"), true);
    const amountIn = ethers.parseEther("1");
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(await reentrant.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t));
    await reentrant.setReentryCall(router.interface.encodeFunctionData("swapExactInput", [request]));
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);

    await expect(router.connect(user).swapExactInput(request)).to.be.revertedWithCustomError(router, "ReentrancyGuardReentrantCall");
    expect(await router.consumedQuotes(user.address, request.quoteId)).to.equal(false);
    expect(await tokenIn.allowance(await router.getAddress(), await reentrant.getAddress())).to.equal(0);
    expect(await tokenIn.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("never approves an unconfigured target and binds quote replay protection to the account", async function () {
    const { user, recipient, referrer: secondUser, tokenIn, tokenOut, router, adapter } = await fixture();
    const amountIn = ethers.parseEther("1");
    const t = await now();
    const rogue = await tokenOut.getAddress();
    const rogueRequest = await bindQuote(router, user.address, makeRequest(rogue, await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t));
    await tokenIn.connect(user).approve(await router.getAddress(), amountIn);
    await expect(router.connect(user).swapExactInput(rogueRequest)).to.be.revertedWithCustomError(router, "AdapterDisabled");
    expect(await tokenIn.allowance(await router.getAddress(), rogue)).to.equal(0);
    await expect(router.configureAdapter(user.address, ethers.id("EOA"), true)).to.be.revertedWithCustomError(router, "InvalidAddress");

    const rawQuote = makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, recipient.address, t);
    const userQuote = await bindQuote(router, user.address, rawQuote);
    const secondQuote = await bindQuote(router, secondUser.address, rawQuote);
    expect(userQuote.quoteId).not.to.equal(secondQuote.quoteId);
    await expect(router.connect(user).swapExactInput({ ...userQuote, recipient: secondUser.address })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await expect(router.connect(user).swapExactInput({ ...userQuote, amountIn: amountIn + 1n })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await expect(router.connect(user).swapExactInput({ ...userQuote, minAmountOut: 2n })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await expect(router.connect(user).swapExactInput({ ...userQuote, deadline: userQuote.deadline + 1 })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await expect(router.connect(user).swapExactInput({ ...userQuote, policyVersion: 2 })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await expect(router.connect(user).swapExactInput({ ...userQuote, routeData: "0x01" })).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await tokenIn.mint(secondUser.address, amountIn);
    await tokenIn.connect(secondUser).approve(await router.getAddress(), amountIn);
    await expect(router.connect(secondUser).swapExactInput(userQuote)).to.be.revertedWithCustomError(router, "QuoteBindingMismatch");
    await router.connect(user).swapExactInput(userQuote);
    await router.connect(secondUser).swapExactInput(secondQuote);
    expect(await router.consumedQuotes(user.address, userQuote.quoteId)).to.equal(true);
    expect(await router.consumedQuotes(secondUser.address, secondQuote.quoteId)).to.equal(true);
    expect(await router.consumedQuotes(secondUser.address, userQuote.quoteId)).to.equal(false);
  });

  it("rejects amounts beyond the signed int128 v4 exact-input boundary", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } = await fixture();
    const t = await now();
    const tooLarge = (1n << 127n);
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), tooLarge, recipient.address, t));
    await expect(router.connect(user).swapExactInput(request)).to.be.revertedWithCustomError(router, "AmountTooLarge");
    expect(await router.consumedQuotes(user.address, request.quoteId)).to.equal(false);
  });

  it("can be paused without changing published policy", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } = await fixture();
    await router.pause();
    const t = await now();
    const request = await bindQuote(router, user.address, makeRequest(await adapter.getAddress(), await tokenIn.getAddress(), await tokenOut.getAddress(), 1000n, recipient.address, t));
    await expect(router.connect(user).swapExactInput(request)).to.be.revertedWithCustomError(router, "EnforcedPause");
    expect((await router.feePolicies(1)).platformFeeBps).to.equal(20);
  });
});

