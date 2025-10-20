import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { RentFlowCore, MockUSDC } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * RentFlowCore Test Suite
 * 
 * TESTING STRATEGY:
 * 1. Property registration and management
 * 2. Lease creation and rent payments
 * 3. Maintenance request workflow
 * 4. AI agent authorization
 * 5. Security and access control
 * 6. Edge cases and error handling
 */

describe("RentFlowCore", function () {
  let rentflow: RentFlowCore;
  let usdc: MockUSDC;
  let owner: SignerWithAddress;
  let propertyOwner: SignerWithAddress;
  let tenant: SignerWithAddress;
  let aiAgent: SignerWithAddress;
  let contractor: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const USDC_DECIMALS = 6;
  const RENT_AMOUNT = ethers.parseUnits("2500", USDC_DECIMALS); // $2,500
  const DEPOSIT_AMOUNT = ethers.parseUnits("2500", USDC_DECIMALS);
  const MAINTENANCE_COST = ethers.parseUnits("150", USDC_DECIMALS); // $150

  beforeEach(async function () {
    [owner, propertyOwner, tenant, aiAgent, contractor, unauthorized] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy RentFlowCore
    const RentFlowCore = await ethers.getContractFactory("RentFlowCore");
    rentflow = await RentFlowCore.deploy(await usdc.getAddress());
    await rentflow.waitForDeployment();

    // Distribute USDC to test accounts
    await usdc.mint(propertyOwner.address, ethers.parseUnits("100000", USDC_DECIMALS));
    await usdc.mint(tenant.address, ethers.parseUnits("50000", USDC_DECIMALS));
    await usdc.mint(contractor.address, ethers.parseUnits("10000", USDC_DECIMALS));

    // Authorize AI agent
    await rentflow.connect(owner).setAIAgent(aiAgent.address, true);
  });

  describe("Deployment", function () {
    it("Should set the correct USDC address", async function () {
      expect(await rentflow.USDC()).to.equal(await usdc.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await rentflow.owner()).to.equal(owner.address);
    });

    it("Should initialize counters to zero", async function () {
      expect(await rentflow.propertyCounter()).to.equal(0);
      expect(await rentflow.leaseCounter()).to.equal(0);
      expect(await rentflow.maintenanceCounter()).to.equal(0);
    });

    it("Should authorize AI agent during setup", async function () {
      expect(await rentflow.authorizedAIAgents(aiAgent.address)).to.be.true;
    });
  });

  describe("Property Registration", function () {
    it("Should register a property successfully", async function () {
      const tx = await rentflow.connect(propertyOwner).registerProperty(
        RENT_AMOUNT,
        DEPOSIT_AMOUNT
      );

      await expect(tx)
        .to.emit(rentflow, "PropertyRegistered")
        .withArgs(0, propertyOwner.address, RENT_AMOUNT);

      const property = await rentflow.properties(0);
      expect(property.owner).to.equal(propertyOwner.address);
      expect(property.monthlyRent).to.equal(RENT_AMOUNT);
      expect(property.securityDeposit).to.equal(DEPOSIT_AMOUNT);
      expect(property.isActive).to.be.true;
    });

    it("Should increment property counter", async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      expect(await rentflow.propertyCounter()).to.equal(1);

      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      expect(await rentflow.propertyCounter()).to.equal(2);
    });

    it("Should fail with zero rent", async function () {
      await expect(
        rentflow.connect(propertyOwner).registerProperty(0, DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Rent must be positive");
    });

    it("Should fail with deposit less than monthly rent", async function () {
      await expect(
        rentflow.connect(propertyOwner).registerProperty(
          RENT_AMOUNT,
          RENT_AMOUNT / 2n
        )
      ).to.be.revertedWith("Deposit must be >= monthly rent");
    });

    it("Should allow property owner to deactivate property", async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      await rentflow.connect(propertyOwner).deactivateProperty(0);

      const property = await rentflow.properties(0);
      expect(property.isActive).to.be.false;
    });

    it("Should prevent non-owner from deactivating property", async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);

      await expect(
        rentflow.connect(unauthorized).deactivateProperty(0)
      ).to.be.revertedWith("Not property owner");
    });
  });

  describe("Lease Creation", function () {
    beforeEach(async function () {
      // Register a property first
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      
      // Approve USDC transfer for security deposit
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should create a lease successfully", async function () {
      const startDate = (await time.latest()) + 86400; // Tomorrow
      const durationMonths = 12;
      const rentDueDay = 1;

      const tx = await rentflow.connect(propertyOwner).createLease(
        0, // propertyId
        tenant.address,
        startDate,
        durationMonths,
        rentDueDay
      );

      await expect(tx)
        .to.emit(rentflow, "LeaseCreated")
        .withArgs(0, 0, tenant.address);

      const lease = await rentflow.leases(0);
      expect(lease.propertyId).to.equal(0);
      expect(lease.tenant).to.equal(tenant.address);
      expect(lease.startDate).to.equal(startDate);
      expect(lease.rentDueDay).to.equal(rentDueDay);
      expect(lease.status).to.equal(0); // Active
    });

    it("Should transfer security deposit to contract", async function () {
      const startDate = (await time.latest()) + 86400;
      const initialBalance = await usdc.balanceOf(await rentflow.getAddress());

      await rentflow.connect(propertyOwner).createLease(
        0,
        tenant.address,
        startDate,
        12,
        1
      );

      const finalBalance = await usdc.balanceOf(await rentflow.getAddress());
      expect(finalBalance - initialBalance).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should fail with invalid tenant address", async function () {
      const startDate = (await time.latest()) + 86400;

      await expect(
        rentflow.connect(propertyOwner).createLease(
          0,
          ethers.ZeroAddress,
          startDate,
          12,
          1
        )
      ).to.be.revertedWith("Invalid tenant address");
    });

    it("Should fail with start date in the past", async function () {
      const pastDate = (await time.latest()) - 86400; // Yesterday

      await expect(
        rentflow.connect(propertyOwner).createLease(
          0,
          tenant.address,
          pastDate,
          12,
          1
        )
      ).to.be.revertedWith("Start date must be in future");
    });

    it("Should fail with invalid duration", async function () {
      const startDate = (await time.latest()) + 86400;

      await expect(
        rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 0, 1)
      ).to.be.revertedWith("Duration must be 1-36 months");

      await expect(
        rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 37, 1)
      ).to.be.revertedWith("Duration must be 1-36 months");
    });

    it("Should fail with invalid rent due day", async function () {
      const startDate = (await time.latest()) + 86400;

      await expect(
        rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 12, 0)
      ).to.be.revertedWith("Rent due day must be 1-28");

      await expect(
        rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 12, 29)
      ).to.be.revertedWith("Rent due day must be 1-28");
    });

    it("Should prevent non-owner from creating lease", async function () {
      const startDate = (await time.latest()) + 86400;

      await expect(
        rentflow.connect(unauthorized).createLease(0, tenant.address, startDate, 12, 1)
      ).to.be.revertedWith("Not property owner");
    });
  });

  describe("Rent Payment", function () {
    beforeEach(async function () {
      // Register property and create lease
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT);
      
      const startDate = await time.latest();
      await rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 12, 1);
      
      // Approve rent payment
      await usdc.connect(tenant).approve(await rentflow.getAddress(), RENT_AMOUNT);
    });

    it("Should process rent payment successfully", async function () {
      const initialOwnerBalance = await usdc.balanceOf(propertyOwner.address);

      const tx = await rentflow.connect(tenant).payRent(0);

      await expect(tx)
        .to.emit(rentflow, "RentPaid")
        .withArgs(0, RENT_AMOUNT, await time.latest());

      const finalOwnerBalance = await usdc.balanceOf(propertyOwner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(RENT_AMOUNT);

      const lease = await rentflow.leases(0);
      expect(lease.totalPaid).to.equal(RENT_AMOUNT);
      expect(lease.lastPaymentDate).to.be.gt(0);
    });

    it("Should fail if non-tenant tries to pay", async function () {
      await usdc.connect(unauthorized).approve(await rentflow.getAddress(), RENT_AMOUNT);

      await expect(
        rentflow.connect(unauthorized).payRent(0)
      ).to.be.revertedWith("Only tenant can pay");
    });

    it("Should fail if lease hasn't started", async function () {
      // Create future lease
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT);
      const futureDate = (await time.latest()) + 86400 * 7; // 7 days from now
      await rentflow.connect(propertyOwner).createLease(0, tenant.address, futureDate, 12, 1);

      await expect(
        rentflow.connect(tenant).payRent(1)
      ).to.be.revertedWith("Lease hasn't started");
    });

    it("Should fail if lease has ended", async function () {
      // Fast forward past lease end date
      await time.increase(86400 * 365); // 1 year

      await expect(
        rentflow.connect(tenant).payRent(0)
      ).to.be.revertedWith("Lease has ended");
    });

    it("Should allow multiple rent payments", async function () {
      await rentflow.connect(tenant).payRent(0);
      
      // Approve another payment
      await usdc.connect(tenant).approve(await rentflow.getAddress(), RENT_AMOUNT);
      await time.increase(86400 * 30); // 30 days
      
      await rentflow.connect(tenant).payRent(0);

      const lease = await rentflow.leases(0);
      expect(lease.totalPaid).to.equal(RENT_AMOUNT * 2n);
    });
  });

  describe("Maintenance Management", function () {
    beforeEach(async function () {
      // Register property
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
    });

    it("Should allow property owner to request maintenance", async function () {
      const tx = await rentflow.connect(propertyOwner).requestMaintenance(
        0,
        "Leaking faucet in kitchen",
        MAINTENANCE_COST
      );

      await expect(tx)
        .to.emit(rentflow, "MaintenanceRequested")
        .withArgs(0, 0, MAINTENANCE_COST);

      const request = await rentflow.maintenanceRequests(0);
      expect(request.propertyId).to.equal(0);
      expect(request.requestedBy).to.equal(propertyOwner.address);
      expect(request.estimatedCost).to.equal(MAINTENANCE_COST);
      expect(request.status).to.equal(0); // Pending
    });

    it("Should allow tenant to request maintenance", async function () {
      // Create lease first
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT);
      const startDate = await time.latest();
      await rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 12, 1);

      const tx = await rentflow.connect(tenant).requestMaintenance(
        0,
        "Broken window",
        MAINTENANCE_COST
      );

      await expect(tx).to.emit(rentflow, "MaintenanceRequested");
    });

    it("Should fail with empty description", async function () {
      await expect(
        rentflow.connect(propertyOwner).requestMaintenance(0, "", MAINTENANCE_COST)
      ).to.be.revertedWith("Description required");
    });

    it("Should fail with zero estimated cost", async function () {
      await expect(
        rentflow.connect(propertyOwner).requestMaintenance(0, "Fix something", 0)
      ).to.be.revertedWith("Estimated cost must be positive");
    });

    it("Should prevent unauthorized user from requesting maintenance", async function () {
      await expect(
        rentflow.connect(unauthorized).requestMaintenance(0, "Fix something", MAINTENANCE_COST)
      ).to.be.revertedWith("Not authorized for this property");
    });
  });

  describe("AI Agent Maintenance Approval", function () {
    beforeEach(async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      await rentflow.connect(propertyOwner).requestMaintenance(0, "Fix leak", MAINTENANCE_COST);
    });

    it("Should allow AI agent to approve maintenance", async function () {
      const tx = await rentflow.connect(aiAgent).approveMaintenance(
        0,
        MAINTENANCE_COST,
        contractor.address
      );

      await expect(tx)
        .to.emit(rentflow, "MaintenanceApproved")
        .withArgs(0, MAINTENANCE_COST, contractor.address);

      const request = await rentflow.maintenanceRequests(0);
      expect(request.approvedAmount).to.equal(MAINTENANCE_COST);
      expect(request.contractor).to.equal(contractor.address);
      expect(request.status).to.equal(1); // Approved
    });

    it("Should enforce AI approval limit of $500", async function () {
      const overLimit = ethers.parseUnits("501", USDC_DECIMALS);

      await expect(
        rentflow.connect(aiAgent).approveMaintenance(0, overLimit, contractor.address)
      ).to.be.revertedWith("Exceeds AI approval limit");
    });

    it("Should prevent unauthorized agent from approving", async function () {
      await expect(
        rentflow.connect(unauthorized).approveMaintenance(0, MAINTENANCE_COST, contractor.address)
      ).to.be.revertedWith("Not authorized AI agent");
    });

    it("Should fail with invalid contractor address", async function () {
      await expect(
        rentflow.connect(aiAgent).approveMaintenance(0, MAINTENANCE_COST, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid contractor address");
    });

    it("Should fail if request is not pending", async function () {
      await rentflow.connect(aiAgent).approveMaintenance(0, MAINTENANCE_COST, contractor.address);

      await expect(
        rentflow.connect(aiAgent).approveMaintenance(0, MAINTENANCE_COST, contractor.address)
      ).to.be.revertedWith("Request not pending");
    });
  });

  describe("Maintenance Fund Management", function () {
    beforeEach(async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
    });

    it("Should allow property owner to fund maintenance", async function () {
      const fundAmount = ethers.parseUnits("1000", USDC_DECIMALS);
      await usdc.connect(propertyOwner).approve(await rentflow.getAddress(), fundAmount);

      const tx = await rentflow.connect(propertyOwner).fundMaintenance(0, fundAmount);

      await expect(tx)
        .to.emit(rentflow, "MaintenanceFundAdded")
        .withArgs(0, fundAmount);

      expect(await rentflow.maintenanceFunds(0)).to.equal(fundAmount);
    });

    it("Should process contractor payment from maintenance fund", async function () {
      // Fund maintenance
      const fundAmount = ethers.parseUnits("1000", USDC_DECIMALS);
      await usdc.connect(propertyOwner).approve(await rentflow.getAddress(), fundAmount);
      await rentflow.connect(propertyOwner).fundMaintenance(0, fundAmount);

      // Request and approve maintenance
      await rentflow.connect(propertyOwner).requestMaintenance(0, "Fix leak", MAINTENANCE_COST);
      await rentflow.connect(aiAgent).approveMaintenance(0, MAINTENANCE_COST, contractor.address);

      // Pay contractor
      const initialContractorBalance = await usdc.balanceOf(contractor.address);
      const tx = await rentflow.connect(propertyOwner).payMaintenanceContractor(0);

      await expect(tx)
        .to.emit(rentflow, "MaintenancePaid")
        .withArgs(0, MAINTENANCE_COST, contractor.address);

      const finalContractorBalance = await usdc.balanceOf(contractor.address);
      expect(finalContractorBalance - initialContractorBalance).to.equal(MAINTENANCE_COST);
    });

    it("Should fail if insufficient maintenance funds", async function () {
      await rentflow.connect(propertyOwner).requestMaintenance(0, "Fix leak", MAINTENANCE_COST);
      await rentflow.connect(aiAgent).approveMaintenance(0, MAINTENANCE_COST, contractor.address);

      await expect(
        rentflow.connect(propertyOwner).payMaintenanceContractor(0)
      ).to.be.revertedWith("Insufficient maintenance funds");
    });
  });

  describe("AI Agent Authorization", function () {
    it("Should allow owner to authorize AI agent", async function () {
      const newAgent = unauthorized;

      const tx = await rentflow.connect(owner).setAIAgent(newAgent.address, true);

      await expect(tx)
        .to.emit(rentflow, "AIAgentAuthorized")
        .withArgs(newAgent.address, true);

      expect(await rentflow.authorizedAIAgents(newAgent.address)).to.be.true;
    });

    it("Should allow owner to revoke AI agent", async function () {
      await rentflow.connect(owner).setAIAgent(aiAgent.address, false);

      expect(await rentflow.authorizedAIAgents(aiAgent.address)).to.be.false;
    });

    it("Should prevent non-owner from authorizing agents", async function () {
      await expect(
        rentflow.connect(unauthorized).setAIAgent(unauthorized.address, true)
      ).to.be.revertedWithCustomError(rentflow, "OwnableUnauthorizedAccount");
    });

    it("Should fail with zero address", async function () {
      await expect(
        rentflow.connect(owner).setAIAgent(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid agent address");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to pause contract", async function () {
      await rentflow.connect(owner).pause();
      expect(await rentflow.paused()).to.be.true;
    });

    it("Should prevent operations when paused", async function () {
      await rentflow.connect(owner).pause();

      await expect(
        rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(rentflow, "EnforcedPause");
    });

    it("Should allow owner to unpause", async function () {
      await rentflow.connect(owner).pause();
      await rentflow.connect(owner).unpause();
      expect(await rentflow.paused()).to.be.false;
    });

    it("Should prevent non-owner from pausing", async function () {
      await expect(
        rentflow.connect(unauthorized).pause()
      ).to.be.revertedWithCustomError(rentflow, "OwnableUnauthorizedAccount");
    });
  });

  describe("Security Deposit Return", function () {
    beforeEach(async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT);
      const startDate = await time.latest();
      await rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 1, 1);
      
      // Fast forward past lease end
      await time.increase(86400 * 31);
    });

    it("Should return full deposit if no deductions", async function () {
      const initialTenantBalance = await usdc.balanceOf(tenant.address);

      await rentflow.connect(propertyOwner).returnSecurityDeposit(0, 0);

      const finalTenantBalance = await usdc.balanceOf(tenant.address);
      expect(finalTenantBalance - initialTenantBalance).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should return partial deposit with deductions", async function () {
      const deduction = ethers.parseUnits("500", USDC_DECIMALS);
      const expectedReturn = DEPOSIT_AMOUNT - deduction;

      const initialTenantBalance = await usdc.balanceOf(tenant.address);
      const initialOwnerBalance = await usdc.balanceOf(propertyOwner.address);

      await rentflow.connect(propertyOwner).returnSecurityDeposit(0, deduction);

      const finalTenantBalance = await usdc.balanceOf(tenant.address);
      const finalOwnerBalance = await usdc.balanceOf(propertyOwner.address);

      expect(finalTenantBalance - initialTenantBalance).to.equal(expectedReturn);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(deduction);
    });

    it("Should mark lease as completed", async function () {
      await rentflow.connect(propertyOwner).returnSecurityDeposit(0, 0);

      const lease = await rentflow.leases(0);
      expect(lease.status).to.equal(3); // Completed
      expect(lease.securityDepositHeld).to.equal(0);
    });

    it("Should fail if deduction exceeds deposit", async function () {
      const excessiveDeduction = DEPOSIT_AMOUNT + 1n;

      await expect(
        rentflow.connect(propertyOwner).returnSecurityDeposit(0, excessiveDeduction)
      ).to.be.revertedWith("Deduction exceeds deposit");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
      await rentflow.connect(propertyOwner).registerProperty(RENT_AMOUNT, DEPOSIT_AMOUNT);
    });

    it("Should return owner properties", async function () {
      const properties = await rentflow.getOwnerProperties(propertyOwner.address);
      expect(properties.length).to.equal(2);
      expect(properties[0]).to.equal(0);
      expect(properties[1]).to.equal(1);
    });

    it("Should return tenant leases", async function () {
      await usdc.connect(tenant).approve(await rentflow.getAddress(), DEPOSIT_AMOUNT * 2n);
      const startDate = await time.latest();
      
      await rentflow.connect(propertyOwner).createLease(0, tenant.address, startDate, 12, 1);
      await rentflow.connect(propertyOwner).createLease(1, tenant.address, startDate, 12, 1);

      const leases = await rentflow.getTenantLeases(tenant.address);
      expect(leases.length).to.equal(2);
    });

    it("Should return maintenance fund balance", async function () {
      const fundAmount = ethers.parseUnits("1000", USDC_DECIMALS);
      await usdc.connect(propertyOwner).approve(await rentflow.getAddress(), fundAmount);
      await rentflow.connect(propertyOwner).fundMaintenance(0, fundAmount);

      expect(await rentflow.getMaintenanceFundBalance(0)).to.equal(fundAmount);
    });
  });
});
