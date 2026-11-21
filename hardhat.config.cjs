require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");

const testnetForkEnabled = process.env.RUN_FORK_TESTS === "1";
const mainnetHookForkEnabled = process.env.RUN_MAINNET_HOOK_FORK_TESTS === "1";
if (testnetForkEnabled && mainnetHookForkEnabled) {
  throw new Error("RUN_FORK_TESTS and RUN_MAINNET_HOOK_FORK_TESTS are mutually exclusive");
}
const forkEnabled = testnetForkEnabled || mainnetHookForkEnabled;
const forkBlock = process.env.FORK_BLOCK_NUMBER ? Number(process.env.FORK_BLOCK_NUMBER) : undefined;
const forkChainId = mainnetHookForkEnabled ? 4663 : 46630;
const forkUrl = mainnetHookForkEnabled
  ? process.env.RH_MAINNET_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"
  : process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";

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
      chainId: forkChainId,
      hardfork: "cancun",
      forking: {
        url: forkUrl,
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
