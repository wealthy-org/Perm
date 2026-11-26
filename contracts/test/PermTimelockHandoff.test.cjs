const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  MAINNET_MIN_DELAY,
  PROPOSER_ROLE,
  EXECUTOR_ROLE,
  CANCELLER_ROLE,
  DEFAULT_ADMIN_ROLE,
  buildHandoff,
  safeTxBuilderJson,
} = require("../scripts/lib/timelock-handoff.cjs");

// Mirrors the mainnet state today (Router + v4 + v3 owned by the 2-of-3 Safe, pause guardian = EOA) and
// runs the exact calls that contracts/scripts/timelock-handoff.cjs puts into the Safe Transaction Builder
// files. A plain signer stands in for the Safe (the Safe executes the same calls atomically via MultiSend).
async function deployPerm() {
  const [deployer, safe, guardian, outsider, newTreasury] = await ethers.getSigners();
  const permit2 = await (await ethers.getContractFactory("MockPermit2")).deploy();
  const router = await (await ethers.getContractFactory("PermRouter"))
    .deploy(deployer.address, deployer.address, deployer.address, await permit2.getAddress());
  const v4 = await (await ethers.getContractFactory("PermV4Adapter"))
    .deploy(deployer.address, await router.getAddress(), await permit2.getAddress());
  const swapRouter = await (await ethers.getContractFactory("MockSwapRouter02")).deploy();
  const weth = await (await ethers.getContractFactory("MockWETH")).deploy();
  const v3 = await (await ethers.getContractFactory("PermV3Adapter"))
    .deploy(deployer.address, await router.getAddress(), await swapRouter.getAddress(), await weth.getAddress());
  await router.setPauseGuardian(guardian.address);
  for (const c of [router, v4, v3]) {
    await c.transferOwnership(safe.address);
    await c.connect(safe).acceptOwnership();
  }
  const timelock = await (await ethers.getContractFactory("PermTimelock"))
    .deploy(MAINNET_MIN_DELAY, [safe.address], [ethers.ZeroAddress], ethers.ZeroAddress);
  const plan = buildHandoff({
    chainId: (await ethers.provider.getNetwork()).chainId,
    timelock: await timelock.getAddress(),
    guardian: guardian.address,
    owned: [await router.getAddress(), await v4.getAddress(), await v3.getAddress()],
    delay: MAINNET_MIN_DELAY,
  });
  return { deployer, safe, guardian, outsider, newTreasury, router, v4, v3, timelock, plan };
}

async function send(signer, call) {
  return signer.sendTransaction({ to: call.to, data: call.data, value: call.value ?? 0n });
}

async function increase(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function scheduleBatch1(ctx) {
  for (const call of ctx.plan.transferCalls) await send(ctx.safe, call);
  await send(ctx.safe, ctx.plan.scheduleCall);
}

describe("PermTimelock handoff (Safe → 48h timelock, guardian can cancel)", function () {
  it("builds the same operation id as the timelock and a valid Safe Transaction Builder file", async function () {
    const { timelock, plan, safe } = await deployPerm();
    const { targets, values, payloads, predecessor, salt } = plan.batch;
    expect(await timelock.hashOperationBatch(targets, values, payloads, predecessor, salt)).to.equal(plan.operationId);
    const file = safeTxBuilderJson({ chainId: 4663, safe: safe.address, name: "t", description: "d", calls: [...plan.transferCalls, plan.scheduleCall] });
    expect(file.transactions).to.have.length(4);
    expect(file.meta.createdFromSafeAddress).to.equal(safe.address);
    expect(file.transactions.every((t) => t.value === "0" && t.data.startsWith("0x"))).to.equal(true);
    expect(() => buildHandoff({ chainId: 1, timelock: safe.address, guardian: safe.address, owned: [safe.address, safe.address], delay: 1 }))
      .to.throw("duplicate");
  });

  it("hands Router + adapters to the timelock only after 48h; final roles are exact", async function () {
    const ctx = await deployPerm();
    const { safe, guardian, outsider, deployer, router, v4, v3, timelock, plan } = ctx;
    const tl = await timelock.getAddress();

    // Only the Safe may propose; neither the guardian nor anyone else can.
    await expect(send(outsider, plan.scheduleCall)).to.be.reverted;
    await expect(send(guardian, plan.scheduleCall)).to.be.reverted;
    await scheduleBatch1(ctx);
    for (const c of [router, v4, v3]) {
      expect(await c.owner()).to.equal(safe.address);
      expect(await c.pendingOwner()).to.equal(tl);
    }
    expect(await timelock.isOperationPending(plan.operationId)).to.equal(true);

    await increase(MAINNET_MIN_DELAY - 60);
    await expect(send(outsider, plan.executeCall)).to.be.reverted; // not ready yet
    await increase(60);
    await send(outsider, plan.executeCall); // open executor: anyone may run a ready operation

    expect(await timelock.isOperationDone(plan.operationId)).to.equal(true);
    for (const c of [router, v4, v3]) {
      expect(await c.owner()).to.equal(tl);
      expect(await c.pendingOwner()).to.equal(ethers.ZeroAddress);
    }
    expect(await timelock.getMinDelay()).to.equal(BigInt(MAINNET_MIN_DELAY));
    expect(await timelock.hasRole(PROPOSER_ROLE, safe.address)).to.equal(true);
    expect(await timelock.hasRole(CANCELLER_ROLE, safe.address)).to.equal(true);
    expect(await timelock.hasRole(CANCELLER_ROLE, guardian.address)).to.equal(true);
    expect(await timelock.hasRole(PROPOSER_ROLE, guardian.address)).to.equal(false);
    expect(await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress)).to.equal(true);
    expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, tl)).to.equal(true);
    for (const who of [safe, guardian, deployer]) expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, who.address)).to.equal(false);
    expect(await router.pauseGuardian()).to.equal(guardian.address);
  });

  it("the Safe can cancel the queued handoff during the delay", async function () {
    const ctx = await deployPerm();
    await scheduleBatch1(ctx);
    await expect(send(ctx.outsider, ctx.plan.cancelCall)).to.be.reverted;
    await send(ctx.safe, ctx.plan.cancelCall);
    await increase(MAINNET_MIN_DELAY);
    await expect(send(ctx.outsider, ctx.plan.executeCall)).to.be.reverted;
    expect(await ctx.router.owner()).to.equal(ctx.safe.address);
  });

  it("after the handoff: owner actions wait 48h, the guardian pauses instantly and can veto a queued action", async function () {
    const ctx = await deployPerm();
    const { safe, guardian, outsider, newTreasury, router, timelock, plan } = ctx;
    await scheduleBatch1(ctx);
    await increase(MAINNET_MIN_DELAY);
    await send(outsider, plan.executeCall);

    // The Safe no longer acts directly.
    await expect(router.connect(safe).setTreasury(newTreasury.address)).to.be.reverted;

    // Emergency: guardian pauses at once; unpausing needs the owner (= timelock) and therefore 48h.
    await router.connect(guardian).pause();
    expect(await router.paused()).to.equal(true);
    await expect(router.connect(safe).unpause()).to.be.reverted;
    await expect(router.connect(guardian).unpause()).to.be.reverted;

    const routerAddress = await router.getAddress();
    const unpause = router.interface.encodeFunctionData("unpause");
    const saltU = ethers.id("unpause-1");
    await timelock.connect(safe).schedule(routerAddress, 0, unpause, ethers.ZeroHash, saltU, MAINNET_MIN_DELAY);
    await increase(MAINNET_MIN_DELAY);
    await timelock.connect(outsider).execute(routerAddress, 0, unpause, ethers.ZeroHash, saltU);
    expect(await router.paused()).to.equal(false);

    // A queued owner action (e.g. moving the treasury) can be vetoed by the guardian before it runs.
    const setTreasury = router.interface.encodeFunctionData("setTreasury", [newTreasury.address]);
    const saltT = ethers.id("treasury-1");
    await timelock.connect(safe).schedule(routerAddress, 0, setTreasury, ethers.ZeroHash, saltT, MAINNET_MIN_DELAY);
    const id = await timelock.hashOperation(routerAddress, 0, setTreasury, ethers.ZeroHash, saltT);
    await expect(timelock.connect(outsider).cancel(id)).to.be.reverted;
    await timelock.connect(guardian).cancel(id);
    await increase(MAINNET_MIN_DELAY);
    await expect(timelock.connect(outsider).execute(routerAddress, 0, setTreasury, ethers.ZeroHash, saltT)).to.be.reverted;

    // A delay shorter than 48h is refused for anything the Safe proposes.
    await expect(timelock.connect(safe).schedule(routerAddress, 0, setTreasury, ethers.ZeroHash, ethers.id("fast"), 3600)).to.be.reverted;
  });
});
