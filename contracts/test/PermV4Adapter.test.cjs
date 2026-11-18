const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO = ethers.ZeroAddress;

function routeData(currency0, currency1, hook = ZERO, hookData = "0x") {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)", "bytes"],
    [[currency0, currency1, 3000, 60, hook], hookData],
  );
}

describe("PermV4Adapter security boundaries", function () {
  async function fixture() {
    const [owner, routerCaller, attacker, recipient, manager] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token0 = await Token.deploy("Token zero", "T0", 18);
    const token1 = await Token.deploy("Token one", "T1", 18);
    const Adapter = await ethers.getContractFactory("PermV4Adapter");
    const adapter = await Adapter.deploy(owner.address, routerCaller.address, manager.address);
    return { owner, routerCaller, attacker, recipient, manager, token0, token1, adapter };
  }

  it("accepts calls only from its immutable Perm router", async function () {
    const { attacker, recipient, token0, token1, adapter } = await fixture();
    const data = routeData(await token0.getAddress(), await token1.getAddress());
    await expect(adapter.connect(attacker).swapExactInput(await token0.getAddress(), await token1.getAddress(), 1, recipient.address, data))
      .to.be.revertedWithCustomError(adapter, "InvalidCaller");
  });

  it("rejects arbitrary hook calldata before any PoolManager interaction", async function () {
    const { routerCaller, recipient, token0, token1, adapter } = await fixture();
    const data = routeData(await token0.getAddress(), await token1.getAddress(), ZERO, "0x1234");
    await expect(adapter.connect(routerCaller).swapExactInput(await token0.getAddress(), await token1.getAddress(), 1, recipient.address, data))
      .to.be.revertedWithCustomError(adapter, "HookDataUnsupported");
  });

  it("keeps nonzero hooks disabled until the owner explicitly reviews them", async function () {
    const { owner, routerCaller, attacker, recipient, token0, token1, adapter } = await fixture();
    const hook = attacker.address;
    const data = routeData(await token0.getAddress(), await token1.getAddress(), hook);
    await expect(adapter.connect(routerCaller).swapExactInput(await token0.getAddress(), await token1.getAddress(), 1, recipient.address, data))
      .to.be.revertedWithCustomError(adapter, "HookNotVerified").withArgs(hook);
    await expect(adapter.connect(attacker).setVerifiedHook(hook, true))
      .to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount").withArgs(attacker.address);
    await expect(adapter.connect(owner).setVerifiedHook(ZERO, true)).to.be.revertedWithCustomError(adapter, "InvalidPair");
    await expect(adapter.connect(owner).setVerifiedHook(hook, true)).to.emit(adapter, "HookVerificationChanged").withArgs(hook, true);
    expect(await adapter.verifiedHooks(hook)).to.equal(true);
  });

  it("rejects route keys that do not exactly match the requested token pair", async function () {
    const { routerCaller, recipient, token0, token1, adapter } = await fixture();
    const unrelated = recipient.address;
    const data = routeData(await token0.getAddress(), unrelated);
    await expect(adapter.connect(routerCaller).swapExactInput(await token0.getAddress(), await token1.getAddress(), 1, recipient.address, data))
      .to.be.revertedWithCustomError(adapter, "InvalidPair");
  });

  it("rejects native value mismatches before unlocking the PoolManager", async function () {
    const { routerCaller, recipient, token0, adapter } = await fixture();
    const data = routeData(ZERO, await token0.getAddress());
    await expect(adapter.connect(routerCaller).swapExactInput(ZERO, await token0.getAddress(), 2, recipient.address, data, { value: 1 }))
      .to.be.revertedWithCustomError(adapter, "InvalidNativeValue");
  });
});
