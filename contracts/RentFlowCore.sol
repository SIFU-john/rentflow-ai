// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title RentFlowCore
 * @notice Core contract for AI-powered property management with USDC payments
 * @dev Implements property registration, lease management, and AI-driven maintenance approval
 * 
 * SECURITY: ReentrancyGuard, Pausable, access controls
 * GAS OPTIMIZATION: Packed structs, events instead of storage where possible
 */
contract RentFlowCore is ReentrancyGuard, Ownable, Pausable {
    
    // ============ State Variables ============
    
    IERC20 public immutable USDC;
    
    struct Property {
        address owner;
        uint256 monthlyRent;        // In USDC (6 decimals)
        uint256 securityDeposit;
        bool isActive;
        uint256 createdAt;
    }
    
    struct Lease {
        uint256 propertyId;
        address tenant;
        uint256 startDate;
        uint256 endDate;
        uint256 rentDueDay;         // Day of month (1-28)
        uint256 lastPaymentDate;
        uint256 totalPaid;
        LeaseStatus status;
        uint256 securityDepositHeld;
    }
    
    struct MaintenanceRequest {
        uint256 propertyId;
        address requestedBy;
        string description;
        uint256 estimatedCost;
        uint256 approvedAmount;
        address contractor;
        MaintenanceStatus status;
        uint256 createdAt;
    }
    
    enum LeaseStatus { Active, Paused, Terminated, Completed }
    enum MaintenanceStatus { Pending, Approved, InProgress, Completed, Rejected }
    
    mapping(uint256 => Property) public properties;
    mapping(uint256 => Lease) public leases;
    mapping(uint256 => MaintenanceRequest) public maintenanceRequests;
    mapping(address => uint256[]) public ownerProperties;
    mapping(address => uint256[]) public tenantLeases;
    mapping(uint256 => uint256) public maintenanceFunds;
    mapping(address => bool) public authorizedAIAgents;
    
    uint256 public propertyCounter;
    uint256 public leaseCounter;
    uint256 public maintenanceCounter;
    
    // ============ Events ============
    
    event PropertyRegistered(uint256 indexed propertyId, address indexed owner, uint256 monthlyRent);
    event LeaseCreated(uint256 indexed leaseId, uint256 indexed propertyId, address indexed tenant);
    event RentPaid(uint256 indexed leaseId, uint256 amount, uint256 timestamp);
    event RentOverdue(uint256 indexed leaseId, uint256 daysPastDue);
    event MaintenanceRequested(uint256 indexed requestId, uint256 indexed propertyId, uint256 estimatedCost);
    event MaintenanceApproved(uint256 indexed requestId, uint256 approvedAmount, address contractor);
    event MaintenancePaid(uint256 indexed requestId, uint256 amount, address contractor);
    event SecurityDepositReturned(uint256 indexed leaseId, address tenant, uint256 amount);
    event AIAgentAuthorized(address indexed agent, bool authorized);
    event MaintenanceFundAdded(uint256 indexed propertyId, uint256 amount);
    
    // ============ Modifiers ============
    
    modifier onlyPropertyOwner(uint256 propertyId) {
        require(properties[propertyId].owner == msg.sender, "Not property owner");
        _;
    }
    
    modifier onlyAIAgent() {
        require(authorizedAIAgents[msg.sender], "Not authorized AI agent");
        _;
    }
    
    modifier validProperty(uint256 propertyId) {
        require(properties[propertyId].isActive, "Property not active");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _usdcAddress) Ownable(msg.sender) {
        require(_usdcAddress != address(0), "Invalid USDC address");
        USDC = IERC20(_usdcAddress);
    }
    
    // ============ Property Management ============
    
    function registerProperty(
        uint256 monthlyRent,
        uint256 securityDeposit
    ) external whenNotPaused returns (uint256) {
        require(monthlyRent > 0, "Rent must be positive");
        require(securityDeposit >= monthlyRent, "Deposit must be >= monthly rent");
        
        uint256 propertyId = propertyCounter++;
        
        properties[propertyId] = Property({
            owner: msg.sender,
            monthlyRent: monthlyRent,
            securityDeposit: securityDeposit,
            isActive: true,
            createdAt: block.timestamp
        });
        
        ownerProperties[msg.sender].push(propertyId);
        
        emit PropertyRegistered(propertyId, msg.sender, monthlyRent);
        
        return propertyId;
    }
    
    function deactivateProperty(uint256 propertyId) external onlyPropertyOwner(propertyId) {
        properties[propertyId].isActive = false;
    }
    
    // ============ Lease Management ============
    
    function createLease(
        uint256 propertyId,
        address tenant,
        uint256 startDate,
        uint256 durationMonths,
        uint256 rentDueDay
    ) external onlyPropertyOwner(propertyId) validProperty(propertyId) returns (uint256) {
        require(tenant != address(0), "Invalid tenant address");
        require(startDate >= block.timestamp, "Start date must be in future");
        require(durationMonths > 0 && durationMonths <= 36, "Duration must be 1-36 months");
        require(rentDueDay >= 1 && rentDueDay <= 28, "Rent due day must be 1-28");
        
        uint256 leaseId = leaseCounter++;
        Property memory prop = properties[propertyId];
        
        // Transfer security deposit from tenant to contract
        require(
            USDC.transferFrom(tenant, address(this), prop.securityDeposit),
            "Security deposit transfer failed"
        );
        
        uint256 endDate = startDate + (durationMonths * 30 days);
        
        leases[leaseId] = Lease({
            propertyId: propertyId,
            tenant: tenant,
            startDate: startDate,
            endDate: endDate,
            rentDueDay: rentDueDay,
            lastPaymentDate: 0,
            totalPaid: 0,
            status: LeaseStatus.Active,
            securityDepositHeld: prop.securityDeposit
        });
        
        tenantLeases[tenant].push(leaseId);
        
        emit LeaseCreated(leaseId, propertyId, tenant);
        
        return leaseId;
    }
    
    function payRent(uint256 leaseId) external nonReentrant whenNotPaused {
        Lease storage lease = leases[leaseId];
        require(lease.status == LeaseStatus.Active, "Lease not active");
        require(msg.sender == lease.tenant, "Only tenant can pay");
        require(block.timestamp >= lease.startDate, "Lease hasn't started");
        require(block.timestamp <= lease.endDate, "Lease has ended");
        
        Property memory prop = properties[lease.propertyId];
        uint256 rentAmount = prop.monthlyRent;
        
        // Transfer rent directly to property owner
        require(
            USDC.transferFrom(msg.sender, prop.owner, rentAmount),
            "Rent payment failed"
        );
        
        lease.lastPaymentDate = block.timestamp;
        lease.totalPaid += rentAmount;
        
        emit RentPaid(leaseId, rentAmount, block.timestamp);
    }
    
    function checkRentOverdue(uint256 leaseId) external onlyAIAgent {
        Lease memory lease = leases[leaseId];
        require(lease.status == LeaseStatus.Active, "Lease not active");
        
        if (lease.lastPaymentDate == 0 && block.timestamp > lease.startDate + 5 days) {
            emit RentOverdue(leaseId, (block.timestamp - lease.startDate) / 1 days);
        } else if (lease.lastPaymentDate > 0) {
            uint256 daysSincePayment = (block.timestamp - lease.lastPaymentDate) / 1 days;
            if (daysSincePayment > 35) {
                emit RentOverdue(leaseId, daysSincePayment - 30);
            }
        }
    }
    
    // ============ Maintenance Management ============
    
    function requestMaintenance(
        uint256 propertyId,
        string calldata description,
        uint256 estimatedCost
    ) external validProperty(propertyId) returns (uint256) {
        require(
            properties[propertyId].owner == msg.sender || _isTenantOfProperty(msg.sender, propertyId),
            "Not authorized for this property"
        );
        require(bytes(description).length > 0, "Description required");
        require(estimatedCost > 0, "Estimated cost must be positive");
        
        uint256 requestId = maintenanceCounter++;
        
        maintenanceRequests[requestId] = MaintenanceRequest({
            propertyId: propertyId,
            requestedBy: msg.sender,
            description: description,
            estimatedCost: estimatedCost,
            approvedAmount: 0,
            contractor: address(0),
            status: MaintenanceStatus.Pending,
            createdAt: block.timestamp
        });
        
        emit MaintenanceRequested(requestId, propertyId, estimatedCost);
        
        return requestId;
    }
    
    function approveMaintenance(
        uint256 requestId,
        uint256 approvedAmount,
        address contractor
    ) external onlyAIAgent {
        MaintenanceRequest storage request = maintenanceRequests[requestId];
        require(request.status == MaintenanceStatus.Pending, "Request not pending");
        require(approvedAmount > 0, "Approved amount must be positive");
        require(contractor != address(0), "Invalid contractor address");
        
        uint256 autoApprovalLimit = 500 * 10**6; // $500 in USDC
        require(approvedAmount <= autoApprovalLimit, "Exceeds AI approval limit");
        
        request.approvedAmount = approvedAmount;
        request.contractor = contractor;
        request.status = MaintenanceStatus.Approved;
        
        emit MaintenanceApproved(requestId, approvedAmount, contractor);
    }
    
    function fundMaintenance(uint256 propertyId, uint256 amount) 
        external 
        onlyPropertyOwner(propertyId) 
        nonReentrant 
    {
        require(amount > 0, "Amount must be positive");
        
        require(
            USDC.transferFrom(msg.sender, address(this), amount),
            "Funding transfer failed"
        );
        
        maintenanceFunds[propertyId] += amount;
        
        emit MaintenanceFundAdded(propertyId, amount);
    }
    
    function payMaintenanceContractor(uint256 requestId) external nonReentrant {
        MaintenanceRequest storage request = maintenanceRequests[requestId];
        require(request.status == MaintenanceStatus.Approved, "Not approved");
        
        uint256 propertyId = request.propertyId;
        require(
            msg.sender == properties[propertyId].owner || authorizedAIAgents[msg.sender],
            "Not authorized"
        );
        
        uint256 amount = request.approvedAmount;
        require(maintenanceFunds[propertyId] >= amount, "Insufficient maintenance funds");
        
        maintenanceFunds[propertyId] -= amount;
        request.status = MaintenanceStatus.Completed;
        
        require(
            USDC.transfer(request.contractor, amount),
            "Contractor payment failed"
        );
        
        emit MaintenancePaid(requestId, amount, request.contractor);
    }
    
    // ============ Security Deposit Management ============
    
    function returnSecurityDeposit(uint256 leaseId, uint256 deductionAmount) 
        external 
        nonReentrant 
    {
        Lease storage lease = leases[leaseId];
        require(
            msg.sender == properties[lease.propertyId].owner || authorizedAIAgents[msg.sender],
            "Not authorized"
        );
        require(
            lease.status == LeaseStatus.Completed || block.timestamp > lease.endDate,
            "Lease not completed"
        );
        require(deductionAmount <= lease.securityDepositHeld, "Deduction exceeds deposit");
        
        uint256 returnAmount = lease.securityDepositHeld - deductionAmount;
        lease.securityDepositHeld = 0;
        lease.status = LeaseStatus.Completed;
        
        if (returnAmount > 0) {
            require(
                USDC.transfer(lease.tenant, returnAmount),
                "Deposit return failed"
            );
        }
        
        if (deductionAmount > 0) {
            require(
                USDC.transfer(properties[lease.propertyId].owner, deductionAmount),
                "Deduction transfer failed"
            );
        }
        
        emit SecurityDepositReturned(leaseId, lease.tenant, returnAmount);
    }
    
    // ============ AI Agent Management ============
    
    function setAIAgent(address agent, bool authorized) external onlyOwner {
        require(agent != address(0), "Invalid agent address");
        authorizedAIAgents[agent] = authorized;
        emit AIAgentAuthorized(agent, authorized);
    }
    
    // ============ Emergency Functions ============
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    function _isTenantOfProperty(address user, uint256 propertyId) internal view returns (bool) {
        uint256[] memory userLeases = tenantLeases[user];
        for (uint256 i = 0; i < userLeases.length; i++) {
            if (leases[userLeases[i]].propertyId == propertyId && 
                leases[userLeases[i]].status == LeaseStatus.Active) {
                return true;
            }
        }
        return false;
    }
    
    function getOwnerProperties(address owner) external view returns (uint256[] memory) {
        return ownerProperties[owner];
    }
    
    function getTenantLeases(address tenant) external view returns (uint256[] memory) {
        return tenantLeases[tenant];
    }
    
    function getMaintenanceFundBalance(uint256 propertyId) external view returns (uint256) {
        return maintenanceFunds[propertyId];
    }
}
