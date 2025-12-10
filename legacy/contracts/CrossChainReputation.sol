// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ReputationRegistry.sol";

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
 * @title CrossChainReputation
 * @notice Enables reputation syncing across Avalanche L1s via Teleporter
 * @dev This is the WOW factor - reputation follows agents across chains
 */
contract CrossChainReputation is ITeleporterReceiver {
    
    // Teleporter messenger address (same on all Avalanche L1s via Nick's method)
    // Fuji: 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf
    ITeleporterMessenger public immutable teleporterMessenger;
    
    // Local reputation registry
    ReputationRegistry public reputationRegistry;
    
    // Mapping of trusted remote contracts on other L1s
    // blockchainID => contract address
    mapping(bytes32 => address) public trustedRemotes;
    
    // Cache of remote reputation scores
    // agentTokenId => blockchainID => reputation score
    mapping(uint256 => mapping(bytes32 => uint256)) public remoteReputations;
    
    // Last sync timestamp per agent per chain
    mapping(uint256 => mapping(bytes32 => uint256)) public lastSyncTime;
    
    // Events
    event ReputationSynced(
        uint256 indexed agentTokenId,
        bytes32 indexed destinationChain,
        uint256 reputation,
        bytes32 messageId
    );
    
    event ReputationReceived(
        uint256 indexed agentTokenId,
        bytes32 indexed sourceChain,
        uint256 reputation
    );
    
    event TrustedRemoteSet(bytes32 indexed blockchainID, address remoteAddress);
    
    // Message types
    uint8 constant MSG_TYPE_SYNC_REPUTATION = 1;
    uint8 constant MSG_TYPE_REQUEST_REPUTATION = 2;
    
    constructor(address _teleporterMessenger, address _reputationRegistry) {
        teleporterMessenger = ITeleporterMessenger(_teleporterMessenger);
        reputationRegistry = ReputationRegistry(_reputationRegistry);
    }
    
    /**
     * @notice Set trusted remote contract on another L1
     * @param blockchainID The destination blockchain ID
     * @param remoteAddress The CrossChainReputation contract address on that chain
     */
    function setTrustedRemote(bytes32 blockchainID, address remoteAddress) external {
        // In production, add access control
        trustedRemotes[blockchainID] = remoteAddress;
        emit TrustedRemoteSet(blockchainID, remoteAddress);
    }
    
    /**
     * @notice Sync an agent's reputation to another L1
     * @param agentTokenId The agent's token ID
     * @param destinationBlockchainID The target L1's blockchain ID
     */
    function syncReputationToChain(
        uint256 agentTokenId,
        bytes32 destinationBlockchainID
    ) external returns (bytes32 messageId) {
        require(trustedRemotes[destinationBlockchainID] != address(0), "Remote not trusted");
        
        // Get current reputation from local registry
        uint256 reputation = reputationRegistry.getReputationScore(agentTokenId);
        
        // Encode the message
        bytes memory message = abi.encode(
            MSG_TYPE_SYNC_REPUTATION,
            agentTokenId,
            reputation,
            block.timestamp
        );
        
        // Send via Teleporter
        ITeleporterMessenger.TeleporterMessageInput memory input = ITeleporterMessenger.TeleporterMessageInput({
            destinationBlockchainID: destinationBlockchainID,
            destinationAddress: trustedRemotes[destinationBlockchainID],
            feeInfo: ITeleporterMessenger.TeleporterFeeInfo({
                feeTokenAddress: address(0),
                amount: 0
            }),
            requiredGasLimit: 100000,
            allowedRelayerAddresses: new address[](0),
            message: message
        });
        
        messageId = teleporterMessenger.sendCrossChainMessage(input);
        
        emit ReputationSynced(agentTokenId, destinationBlockchainID, reputation, messageId);
        
        return messageId;
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
        
        if (msgType == MSG_TYPE_SYNC_REPUTATION) {
            // Update the cached remote reputation
            remoteReputations[agentTokenId][sourceBlockchainID] = reputation;
            lastSyncTime[agentTokenId][sourceBlockchainID] = timestamp;
            
            emit ReputationReceived(agentTokenId, sourceBlockchainID, reputation);
        }
    }
    
    /**
     * @notice Get aggregated reputation across all known chains
     * @param agentTokenId The agent's token ID
     * @param chainIds Array of blockchain IDs to aggregate
     * @return aggregatedReputation Weighted average of reputation across chains
     */
    function getAggregatedReputation(
        uint256 agentTokenId,
        bytes32[] calldata chainIds
    ) external view returns (uint256 aggregatedReputation) {
        uint256 totalReputation = 0;
        uint256 validChains = 0;
        
        // Include local reputation
        uint256 localRep = reputationRegistry.getReputationScore(agentTokenId);
        if (localRep > 0) {
            totalReputation += localRep;
            validChains++;
        }
        
        // Include remote reputations
        for (uint256 i = 0; i < chainIds.length; i++) {
            uint256 remoteRep = remoteReputations[agentTokenId][chainIds[i]];
            if (remoteRep > 0) {
                totalReputation += remoteRep;
                validChains++;
            }
        }
        
        if (validChains == 0) {
            return 50; // Default neutral score
        }
        
        return totalReputation / validChains;
    }
    
    /**
     * @notice Check if an agent meets reputation threshold across chains
     * @param agentTokenId The agent to check
     * @param minScore Minimum required score
     * @param chainIds Chains to consider
     */
    function meetsThresholdAcrossChains(
        uint256 agentTokenId,
        uint256 minScore,
        bytes32[] calldata chainIds
    ) external view returns (bool) {
        // Check local reputation
        if (!reputationRegistry.meetsThreshold(agentTokenId, minScore)) {
            return false;
        }
        
        // Check remote reputations
        for (uint256 i = 0; i < chainIds.length; i++) {
            uint256 remoteRep = remoteReputations[agentTokenId][chainIds[i]];
            // Only check if we have data from that chain
            if (remoteRep > 0 && remoteRep < minScore) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * @notice Get reputation from a specific remote chain
     */
    function getRemoteReputation(
        uint256 agentTokenId,
        bytes32 blockchainID
    ) external view returns (uint256 reputation, uint256 lastSync) {
        return (
            remoteReputations[agentTokenId][blockchainID],
            lastSyncTime[agentTokenId][blockchainID]
        );
    }
}