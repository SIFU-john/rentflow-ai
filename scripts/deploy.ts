import { ethers } from "hardhat";

/**
 * Deployment script for RentFlow AI contracts
 * 
 * DECISION: Deploy MockUSDC first, then RentFlowCore
 * REASON: RentFlowCore constructor requires USDC address
 */

async function main() {
  console.log("🚀 Deploying RentFlow AI contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deploying with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy MockUSDC
  console.log("📄 Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✅ MockUSDC deployed to:", usdcAddress);
  
  // Check initial USDC supply
  const initialSupply = await usdc.balanceOf(deployer.address);
  console.log("💵 Initial USDC supply:", ethers.formatUnits(initialSupply, 6), "USDC\n");

  // Deploy RentFlowCore
  console.log("📄 Deploying RentFlowCore...");
  const RentFlowCore = await ethers.getContractFactory("RentFlowCore");
  const rentflow = await RentFlowCore.deploy(usdcAddress);
  await rentflow.waitForDeployment();
  const rentflowAddress = await rentflow.getAddress();
  console.log("✅ RentFlowCore deployed to:", rentflowAddress);
  
  // Verify USDC address in contract
  const contractUSDC = await rentflow.USDC();
  console.log("🔗 Contract USDC address:", contractUSDC);
  console.log("✓ USDC address matches:", contractUSDC === usdcAddress, "\n");

  // Output deployment summary
  console.log("=" .repeat(60));
  console.log("📝 DEPLOYMENT SUMMARY");
  console.log("=" .repeat(60));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);
  console.log("\nContracts:");
  console.log("  MockUSDC:", usdcAddress);
  console.log("  RentFlowCore:", rentflowAddress);
  console.log("\nNext Steps:");
  console.log("  1. Save these addresses to your .env file");
  console.log("  2. Authorize AI agent: rentflow.setAIAgent(address, true)");
  console.log("  3. Distribute USDC to test accounts");
  console.log("=" .repeat(60));

  // Save deployment info to file
  const fs = require('fs');
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MockUSDC: usdcAddress,
      RentFlowCore: rentflowAddress,
    },
  };

  fs.writeFileSync(
    'deployment.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 Deployment info saved to deployment.json\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });nContracts:");
  console.log("  MockUSDC:", usdcAddress);
  console.log("  RentFlowCore:", rentflowAddress);
  console.log("\
