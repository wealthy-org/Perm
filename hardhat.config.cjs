require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");

const forkEnabled = process.env.RUN_FORK_TESTS === "1";
const forkBlock = process.env.FORK_BLOCK_NUMBER ? Number(process.env.FORK_BLOCK_NUMBER) : undefined;

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 800 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts/src",
    tests: "./contracts/test",
    cache: "./.hardhat-cache",
    artifacts: "./contracts/artifacts",
  },
  etherscan: {
    apiKey: { robinhoodTestnet: "empty" },
    customChains: [{
      network: "robinhoodTestnet",
      chainId: 46630,
      urls: {
        apiURL: "https://explorer.testnet.chain.robinhood.com/api",
        browserURL: "https://explorer.testnet.chain.robinhood.com",
      },
    }],
  },
  sourcify: { enabled: false },
  networks: {
    hardhat: forkEnabled ? {
      chainId: 46630,
      hardfork: "cancun",
      forking: {
        url: process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
        ...(forkBlock ? { blockNumber: forkBlock } : {}),
        httpHeaders: { "User-Agent": "Mozilla/5.0 PermIntegration/2.0" },
      },
    } : { hardfork: "cancun" },
    robinhoodTestnet: {
      url: process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      httpHeaders: { "User-Agent": "Mozilla/5.0 PermDeployment/1.0" },
    },
  },
};
