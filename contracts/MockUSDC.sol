// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testing purposes
 * @dev Mimics USDC with 6 decimals and includes mint function for testing
 * 
 * DECISION: Create mock token instead of using real USDC on testnet
 * REASON: Full control over supply, no need for faucets, easier testing
 */
contract MockUSDC is ERC20 {
    uint8 private constant USDC_DECIMALS = 6;
    
    constructor() ERC20("Mock USD Coin", "USDC") {
        // Mint initial supply to deployer for distribution in tests
        // 1 million USDC for testing
        _mint(msg.sender, 1_000_000 * 10**USDC_DECIMALS);
    }
    
    /**
     * @notice Override decimals to match real USDC (6 decimals)
     * @dev USDC uses 6 decimals unlike most ERC20 tokens (18)
     */
    function decimals() public pure override returns (uint8) {
        return USDC_DECIMALS;
    }
    
    /**
     * @notice Mint tokens to any address for testing
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint (with 6 decimals)
     * @dev Only for testing - real USDC has restricted minting
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /**
     * @notice Burn tokens from caller for testing
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
