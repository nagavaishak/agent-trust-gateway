// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITeleporterMessenger
 * @notice Interface for Avalanche Teleporter cross-chain messaging
 */
interface ITeleporterMessenger {
    struct TeleporterMessageInput {
        bytes32 destinationBlockchainID;
        address destinationAddress;
        TeleporterFeeInfo feeInfo;
        uint256 requiredGasLimit;
        address[] allowedRelayerAddresses;
        bytes message;
    }
    
    struct TeleporterFeeInfo {
        address feeTokenAddress;
        uint256 amount;
    }
    
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput) external returns (bytes32);
}

/**
 * @title ITeleporterReceiver
 * @notice Interface that contracts must implement to receive Teleporter messages
 */
interface ITeleporterReceiver {
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}

/**
 * @title CrossChainReputationReceiver
 * @notice Receives and stores reputation scores from other Avalanche L1s
 * @dev Deployed on Dispatch to receive reputation updates from Fuji C-Chain
 */
contract CrossChainReputationReceiver is ITeleporterReceiver {
    
    // Teleporter messenger (same address on all Avalanche L1s)
    ITeleporterMessenger public immutable teleporterMessenger;
    
    // Owner for admin functions
    address public owner;
    
    // Trusted remote contracts on other L1s
    mapping(bytes32 => address) public trustedRemotes;
    
    // Stored reputation scores from remote chains
    // agentTokenId => sourceChainId => reputation
    mapping(uint256 => mapping(bytes32 => uint256)) public reputations;
    
    // Last sync timestamp
    mapping(uint256 => mapping(bytes32 => uint256)) public lastSyncTime;
    
    // All received agents (for enumeration)
    uint256[] public knownAgents;
    mapping(uint256 => bool) public isKnownAgent;
    
    // Events
    event ReputationReceived(
        uint256 indexed agentTokenId,
        bytes32 indexed sourceChain,
        uint256 reputation,
        uint256 timestamp
    );
    
    event TrustedRemoteSet(bytes32 indexed blockchainID, address remoteAddress);
    
    // Message type constant (must match sender)
    uint8 constant MSG_TYPE_SYNC_REPUTATION = 1;
    
    constructor(address _teleporterMessenger) {
        teleporterMessenger = ITeleporterMessenger(_teleporterMessenger);
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @notice Set trusted remote contract on another L1
     */
    function setTrustedRemote(bytes32 blockchainID, address remoteAddress) external onlyOwner {
        trustedRemotes[blockchainID] = remoteAddress;
        emit TrustedRemoteSet(blockchainID, remoteAddress);
    }
    
    /**
     * @notice Receive reputation update from another L1
     * @dev Called by TeleporterMessenger when a cross-chain message arrives
     */
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external override {
        // Only TeleporterMessenger can call this
        require(msg.sender == address(teleporterMessenger), "Only Teleporter");
        
        // Verify the sender is a trusted remote
        require(trustedRemotes[sourceBlockchainID] == originSenderAddress, "Untrusted sender");
        
        // Decode the message
        (uint8 msgType, uint256 agentTokenId, uint256 reputation, uint256 timestamp) = 
            abi.decode(message, (uint8, uint256, uint256, uint256));
        
        require(msgType == MSG_TYPE_SYNC_REPUTATION, "Unknown message type");
        
        // Store the reputation
        reputations[agentTokenId][sourceBlockchainID] = reputation;
        lastSyncTime[agentTokenId][sourceBlockchainID] = timestamp;
        
        // Track known agents
        if (!isKnownAgent[agentTokenId]) {
            knownAgents.push(agentTokenId);
            isKnownAgent[agentTokenId] = true;
        }
        
        emit ReputationReceived(agentTokenId, sourceBlockchainID, reputation, timestamp);
    }
    
    /**
     * @notice Get reputation for an agent from a specific source chain
     */
    function getReputation(uint256 agentTokenId, bytes32 sourceChainId) external view returns (uint256) {
        return reputations[agentTokenId][sourceChainId];
    }
    
    /**
     * @notice Get all info for an agent
     */
    function getAgentInfo(uint256 agentTokenId, bytes32 sourceChainId) external view returns (
        uint256 reputation,
        uint256 lastSync,
        bool exists
    ) {
        reputation = reputations[agentTokenId][sourceChainId];
        lastSync = lastSyncTime[agentTokenId][sourceChainId];
        exists = isKnownAgent[agentTokenId];
    }
    
    /**
     * @notice Get count of known agents
     */
    function getKnownAgentCount() external view returns (uint256) {
        return knownAgents.length;
    }
    
    /**
     * @notice Get agent at index
     */
    function getKnownAgentAt(uint256 index) external view returns (uint256) {
        require(index < knownAgents.length, "Index out of bounds");
        return knownAgents[index];
    }
}
