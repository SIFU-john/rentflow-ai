import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Hardhat Configuration for RentFlow AI
 * 
 * DECISION: Use Hardhat for development environment
 * REASON: Industry standard, excellent TypeScript support, comprehensive testing tools
 */

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        // DECISION: 200 runs balances deployment cost vs execution cost
        // REASON: Standard for most contracts, good for moderate usage
      },
      viaIR: false, // DECISION: Disabled for faster compilation during development
    },
  },
  
  networks: {
    // Local development network
    hardhat: {
      chainId: 31337,
      // DECISION: Use Hardhat's built-in network for testing
      // REASON: Fast, deterministic, perfect for development
      accounts: {
        count: 20, // DECISION: 20 accounts for testing multiple roles
        accountsBalance: "10000000000000000000000", // 10,000 ETH per account
      },
    },
    
    // Local node (for manual testing)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    
    // Arc testnet (configured but requires env variables)
    arc: {
      url: process.env.ARC_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY 
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: parseInt(process.env.ARC_CHAIN_ID || "0"),
    },
  },
  
  // Gas reporting configuration
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    outputFile: "gas-report.txt",
    noColors: true,
  },
  
  // TypeScript configuration
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  
  // Test configuration
  mocha: {
    timeout: 40000, // DECISION: 40s timeout for complex tests
  },
  
  // Paths configuration
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
