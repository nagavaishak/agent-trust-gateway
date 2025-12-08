// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StakingModule
 * @notice Staking contract for AgentTrust Gateway
 * @dev Agents stake AVAX/tokens as collateral to access protected APIs
 *      Features: unbonding delays, slashing, dynamic stake requirements
 */
contract StakingModule is Ownable, ReentrancyGuard {
    
    // ============================================
    // STRUCTS
    // ============================================
    
    struct StakeInfo {
        uint256 amount;           // Current staked amount
        uint256 lockedUntil;      // Timestamp when unstake completes (0 if not unstaking)
        uint256 pendingUnstake;   // Amount pending unstake
        uint256 slashedTotal;     // Total amount slashed historically
        uint256 lastStakeTime;    // Last time stake was added
    }
    
    struct ServiceTier {
        uint256 minStake;         // Minimum stake required
        uint256 riskMultiplier;   // Risk multiplier (100 = 1x, 200 = 2x)
        bool active;              // Whether tier is active
    }
    
    // ============================================
    // STATE
    // ============================================
    
    // Agent token ID => Stake info
    mapping(uint256 => StakeInfo) public stakes;
    
    // Service ID => Service tier requirements
    mapping(bytes32 => ServiceTier) public serviceTiers;
    
    // Linked contracts
    address public agentRegistry;
    address public reputationEngine;
    
    // Configuration
    uint256 public unbondingPeriod = 1 hours;  // Hackathon: 1 hour, Production: 7 days
    uint256 public minStakeAmount = 0.1 ether; // Minimum stake (0.1 AVAX)
    uint256 public slashPercentage = 10;       // 10% slash on violation
    
    // Slashing authorities
    mapping(address => bool) public slashers;
    
    // Treasury for slashed funds
    address public treasury;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event Staked(
        uint256 indexed agentTokenId,
        uint256 amount,
        uint256 totalStake
    );
    
    event UnstakeRequested(
        uint256 indexed agentTokenId,
        uint256 amount,
        uint256 unlockTime
    );
    
    event UnstakeCompleted(
        uint256 indexed agentTokenId,
        uint256 amount
    );
    
    event UnstakeCancelled(
        uint256 indexed agentTokenId,
        uint256 amount
    );
    
    event Slashed(
        uint256 indexed agentTokenId,
        uint256 amount,
        string reason
    );
    
    event ServiceTierSet(
        bytes32 indexed serviceId,
        uint256 minStake,
        uint256 riskMultiplier
    );
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(address _treasury) Ownable(msg.sender) {
        treasury = _treasury;
        slashers[msg.sender] = true;
    }
    
    // ============================================
    // STAKING FUNCTIONS
    // ============================================
    
    /**
     * @notice Stake AVAX for an agent
     * @param agentTokenId The agent's token ID from AgentRegistry
     */
    function stake(uint256 agentTokenId) external payable nonReentrant {
        require(msg.value >= minStakeAmount, "Below minimum stake");
        
        StakeInfo storage info = stakes[agentTokenId];
        
        info.amount += msg.value;
        info.lastStakeTime = block.timestamp;
        
        emit Staked(agentTokenId, msg.value, info.amount);
    }
    
    /**
     * @notice Request to unstake (starts unbonding period)
     * @param agentTokenId The agent's token ID
     * @param amount Amount to unstake
     */
    function requestUnstake(uint256 agentTokenId, uint256 amount) external nonReentrant {
        StakeInfo storage info = stakes[agentTokenId];
        
        require(info.amount >= amount, "Insufficient stake");
        require(info.pendingUnstake == 0, "Unstake already pending");
        
        // Check caller owns this agent (via AgentRegistry)
        require(_isAgentOwner(agentTokenId, msg.sender), "Not agent owner");
        
        info.amount -= amount;
        info.pendingUnstake = amount;
        info.lockedUntil = block.timestamp + unbondingPeriod;
        
        emit UnstakeRequested(agentTokenId, amount, info.lockedUntil);
    }
    
    /**
     * @notice Complete unstake after unbonding period
     * @param agentTokenId The agent's token ID
     */
    function completeUnstake(uint256 agentTokenId) external nonReentrant {
        StakeInfo storage info = stakes[agentTokenId];
        
        require(info.pendingUnstake > 0, "No pending unstake");
        require(block.timestamp >= info.lockedUntil, "Still unbonding");
        require(_isAgentOwner(agentTokenId, msg.sender), "Not agent owner");
        
        uint256 amount = info.pendingUnstake;
        info.pendingUnstake = 0;
        info.lockedUntil = 0;
        
        // Transfer AVAX back to agent owner
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit UnstakeCompleted(agentTokenId, amount);
    }
    
    /**
     * @notice Cancel pending unstake and re-stake
     * @param agentTokenId The agent's token ID
     */
    function cancelUnstake(uint256 agentTokenId) external nonReentrant {
        StakeInfo storage info = stakes[agentTokenId];
        
        require(info.pendingUnstake > 0, "No pending unstake");
        require(_isAgentOwner(agentTokenId, msg.sender), "Not agent owner");
        
        uint256 amount = info.pendingUnstake;
        info.amount += amount;
        info.pendingUnstake = 0;
        info.lockedUntil = 0;
        
        emit UnstakeCancelled(agentTokenId, amount);
    }
    
    // ============================================
    // SLASHING FUNCTIONS
    // ============================================
    
    /**
     * @notice Slash an agent's stake for violations
     * @param agentTokenId The agent's token ID
     * @param reason Reason for slashing
     */
    function slash(uint256 agentTokenId, string calldata reason) external nonReentrant {
        require(slashers[msg.sender], "Not authorized to slash");
        
        StakeInfo storage info = stakes[agentTokenId];
        require(info.amount > 0, "No stake to slash");
        
        uint256 slashAmount = (info.amount * slashPercentage) / 100;
        info.amount -= slashAmount;
        info.slashedTotal += slashAmount;
        
        // Send slashed funds to treasury
        (bool success, ) = treasury.call{value: slashAmount}("");
        require(success, "Treasury transfer failed");
        
        emit Slashed(agentTokenId, slashAmount, reason);
    }
    
    /**
     * @notice Slash a specific amount
     * @param agentTokenId The agent's token ID
     * @param amount Amount to slash
     * @param reason Reason for slashing
     */
    function slashAmount(
        uint256 agentTokenId, 
        uint256 amount,
        string calldata reason
    ) external nonReentrant {
        require(slashers[msg.sender], "Not authorized to slash");
        
        StakeInfo storage info = stakes[agentTokenId];
        require(info.amount >= amount, "Insufficient stake");
        
        info.amount -= amount;
        info.slashedTotal += amount;
        
        (bool success, ) = treasury.call{value: amount}("");
        require(success, "Treasury transfer failed");
        
        emit Slashed(agentTokenId, amount, reason);
    }
    
    // ============================================
    // SERVICE TIERS
    // ============================================
    
    /**
     * @notice Set stake requirements for a service
     * @param serviceId Unique service identifier
     * @param minStake Minimum stake required
     * @param riskMultiplier Risk multiplier (100 = 1x)
     */
    function setServiceTier(
        bytes32 serviceId,
        uint256 minStake,
        uint256 riskMultiplier
    ) external onlyOwner {
        serviceTiers[serviceId] = ServiceTier({
            minStake: minStake,
            riskMultiplier: riskMultiplier,
            active: true
        });
        
        emit ServiceTierSet(serviceId, minStake, riskMultiplier);
    }
    
    /**
     * @notice Check if agent meets stake requirement for a service
     * @param agentTokenId The agent's token ID
     * @param serviceId The service identifier
     * @return meetsRequirement Whether agent has sufficient stake
     * @return currentStake Agent's current stake
     * @return requiredStake Required stake for service
     */
    function checkStakeRequirement(
        uint256 agentTokenId,
        bytes32 serviceId
    ) external view returns (
        bool meetsRequirement,
        uint256 currentStake,
        uint256 requiredStake
    ) {
        ServiceTier memory tier = serviceTiers[serviceId];
        currentStake = stakes[agentTokenId].amount;
        
        if (!tier.active) {
            // No tier set, use minimum
            requiredStake = minStakeAmount;
        } else {
            requiredStake = tier.minStake;
        }
        
        meetsRequirement = currentStake >= requiredStake;
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get stake info for an agent
     */
    function getStake(uint256 agentTokenId) external view returns (StakeInfo memory) {
        return stakes[agentTokenId];
    }
    
    /**
     * @notice Get effective stake (excludes pending unstake)
     */
    function getEffectiveStake(uint256 agentTokenId) external view returns (uint256) {
        return stakes[agentTokenId].amount;
    }
    
    /**
     * @notice Check if agent has minimum stake
     */
    function hasMinimumStake(uint256 agentTokenId) external view returns (bool) {
        return stakes[agentTokenId].amount >= minStakeAmount;
    }
    
    /**
     * @notice Check if unstake is ready to complete
     */
    function canCompleteUnstake(uint256 agentTokenId) external view returns (bool) {
        StakeInfo memory info = stakes[agentTokenId];
        return info.pendingUnstake > 0 && block.timestamp >= info.lockedUntil;
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = _agentRegistry;
    }
    
    function setReputationEngine(address _reputationEngine) external onlyOwner {
        reputationEngine = _reputationEngine;
    }
    
    function setUnbondingPeriod(uint256 _period) external onlyOwner {
        require(_period >= 1 hours, "Minimum 1 hour");
        unbondingPeriod = _period;
    }
    
    function setMinStakeAmount(uint256 _amount) external onlyOwner {
        minStakeAmount = _amount;
    }
    
    function setSlashPercentage(uint256 _percentage) external onlyOwner {
        require(_percentage <= 100, "Max 100%");
        slashPercentage = _percentage;
    }
    
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
    
    function addSlasher(address _slasher) external onlyOwner {
        slashers[_slasher] = true;
    }
    
    function removeSlasher(address _slasher) external onlyOwner {
        slashers[_slasher] = false;
    }
    
    // ============================================
    // INTERNAL HELPERS
    // ============================================
    
    function _isAgentOwner(uint256 tokenId, address caller) internal view returns (bool) {
        if (agentRegistry == address(0)) return true; // Not linked yet
        
        // Call AgentRegistry to check ownership
        (bool success, bytes memory data) = agentRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );
        
        if (!success) return false;
        
        address owner = abi.decode(data, (address));
        return owner == caller;
    }
    
    // ============================================
    // RECEIVE AVAX
    // ============================================
    
    receive() external payable {}
}
