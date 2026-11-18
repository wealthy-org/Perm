const hre = require("hardhat");
const { ethers } = hre;
const fs = require("node:fs");
const path = require("node:path");

const CHAIN_ID = 46630n;
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is required in the process environment");
  const currentNetwork = await ethers.provider.getNetwork();
  if (currentNetwork.chainId !== CHAIN_ID) throw new Error(`Refusing deployment on chain ${currentNetwork.chainId}; expected ${CHAIN_ID}`);
  if ((await ethers.provider.getCode(POOL_MANAGER)) === "0x") throw new Error("Official v4 PoolManager has no code on the selected network");
  if ((await ethers.provider.getCode(V4_QUOTER)) === "0x") throw new Error("Official v4 Quoter has no code on the selected network");

  const owner = process.env.OWNER_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || owner;
  for (const [label, value] of [["owner", owner], ["treasury", treasury]]) {
    if (!ethers.isAddress(value)) throw new Error(`Invalid ${label} address`);
  }

  console.log(`Deploying from ${deployer.address}`);
  console.log(`Owner: ${owner}`);
  console.log(`Treasury: ${treasury}`);

  const Router = await ethers.getContractFactory("PermRouter");
  const router = await Router.deploy(deployer.address, treasury);
  await router.waitForDeployment();
  const routerReceipt = await router.deploymentTransaction().wait();

  const Adapter = await ethers.getContractFactory("PermV4Adapter");
  const adapter = await Adapter.deploy(deployer.address, await router.getAddress(), POOL_MANAGER);
  await adapter.waitForDeployment();
  const adapterReceipt = await adapter.deploymentTransaction().wait();

  const providerId = ethers.id("UNISWAP_V4_DIRECT");
  const configureTx = await router.configureAdapter(await adapter.getAddress(), providerId, true);
  const configureReceipt = await configureTx.wait();

  const ownershipTransactions = [];
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    const routerOwnership = await router.transferOwnership(owner);
    ownershipTransactions.push((await routerOwnership.wait()).hash);
    const adapterOwnership = await adapter.transferOwnership(owner);
    ownershipTransactions.push((await adapterOwnership.wait()).hash);
    console.log("Ownership transfers are pending. The target owner must call acceptOwnership() on both contracts.");
  }

  const deployment = {
    network: "Robinhood Chain Testnet",
    chainId: Number(CHAIN_ID),
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    poolManager: POOL_MANAGER,
    v4Quoter: V4_QUOTER,
    permRouter: await router.getAddress(),
    v4Adapter: await adapter.getAddress(),
    owner,
    treasury,
    policy: { version: 1, platformFeeBps: 20, rebateShareBps: 2500 },
    deploymentBlock: Number(routerReceipt.blockNumber),
    ownershipStatus: owner.toLowerCase() === deployer.address.toLowerCase() ? "accepted" : "pending-acceptance",
    deploymentTransactions: [routerReceipt.hash, adapterReceipt.hash, configureReceipt.hash, ...ownershipTransactions],
    generatedAt: new Date().toISOString(),
  };
  const output = path.join(__dirname, "../../deployments/robinhood-testnet.json");
  fs.writeFileSync(output, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(`PermRouter: ${deployment.permRouter}`);
  console.log(`PermV4Adapter: ${deployment.v4Adapter}`);
  console.log(`Manifest written to ${output}`);

  if (process.env.VERIFY === "1") {
    for (const verification of [
      { address: deployment.permRouter, constructorArguments: [deployer.address, treasury] },
      { address: deployment.v4Adapter, constructorArguments: [deployer.address, deployment.permRouter, POOL_MANAGER] },
    ]) {
      try {
        await hre.run("verify:verify", verification);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("already verified")) throw error;
      }
    }
  } else {
    console.log("Run again with VERIFY=1 or use hardhat verify before enabling public use.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
