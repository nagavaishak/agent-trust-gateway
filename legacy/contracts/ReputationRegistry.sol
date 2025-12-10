// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentIdentity.sol";

/**
 * @title ReputationRegistry
 * @notice Tracks AI agent reputation based on payment feedback
 * @dev Payment-weighted scoring: larger payments carry more weight
 */
contract ReputationRegistry {
    
    AgentIdentity public identityRegistry;
    
    struct Feedback {
        address from;
        uint256 agentTokenId;
        int8 score;          // -1 (negative), 0 (neutral), +1 (positive)
        uint256 paymentAmount;
        bytes32 txHash;
        uint256 timestamp;
    }
    
    struct ReputationData {
        uint256 totalPositive;
        uint256 totalNegative;
        uint256 totalPaymentVolume;
        uint256 feedbackCount;
        uint256 lastUpdated;
    }
    
    // Agent tokenId => ReputationData
    mapping(uint256 => ReputationData) public reputations;
    
    // All feedback records (for transparency)
    Feedback[] public feedbackHistory;
    
    // Agent tokenId => feedback indices
    mapping(uint256 => uint256[]) public agentFeedbackIndices;
    
    // Events
    event FeedbackSubmitted(
        uint256 indexed agentTokenId,
        address indexed from,
        int8 score,
        uint256 paymentAmount
    );
    
    constructor(address _identityRegistry) {
        identityRegistry = AgentIdentity(_identityRegistry);
    }
    
    /**
     * @notice Submit feedback for an agent after a payment interaction
     * @param agentTokenId The token ID of the agent
     * @param score -1 (bad), 0 (neutral), +1 (good)
     * @param paymentAmount The payment amount in wei (used for weighting)
     * @param txHash The transaction hash as evidence
     */
    function submitFeedback(
        uint256 agentTokenId,
        int8 score,
        uint256 paymentAmount,
        bytes32 txHash
    ) external {
        require(score >= -1 && score <= 1, "Score must be -1, 0, or 1");
        require(identityRegistry.ownerOf(agentTokenId) != address(0), "Agent does not exist");
        
        Feedback memory newFeedback = Feedback({
            from: msg.sender,
            agentTokenId: agentTokenId,
            score: score,
            paymentAmount: paymentAmount,
            txHash: txHash,
            timestamp: block.timestamp
        });
        
        feedbackHistory.push(newFeedback);
        agentFeedbackIndices[agentTokenId].push(feedbackHistory.length - 1);
        
        // Update reputation
        ReputationData storage rep = reputations[agentTokenId];
        
        if (score > 0) {
            rep.totalPositive += paymentAmount;
        } else if (score < 0) {
            rep.totalNegative += paymentAmount;
        }
        
        rep.totalPaymentVolume += paymentAmount;
        rep.feedbackCount++;
        rep.lastUpdated = block.timestamp;
        
        emit FeedbackSubmitted(agentTokenId, msg.sender, score, paymentAmount);
    }
    
    /**
     * @notice Get reputation score (0-100) for an agent
     * @dev Score = (positive volume / total volume) * 100
     */
    function getReputationScore(uint256 agentTokenId) external view returns (uint256) {
        ReputationData memory rep = reputations[agentTokenId];
        
        if (rep.totalPaymentVolume == 0) {
            return 50; // Neutral score for new agents
        }
        
        return (rep.totalPositive * 100) / rep.totalPaymentVolume;
    }
    
    /**
     * @notice Get full reputation data for an agent
     */
    function getReputation(uint256 agentTokenId) external view returns (ReputationData memory) {
        return reputations[agentTokenId];
    }
    
    /**
     * @notice Get feedback count for an agent
     */
    function getFeedbackCount(uint256 agentTokenId) external view returns (uint256) {
        return agentFeedbackIndices[agentTokenId].length;
    }
    
    /**
     * @notice Check if agent meets minimum reputation threshold
     * @param agentTokenId The agent to check
     * @param minScore Minimum required score (0-100)
     */
    function meetsThreshold(uint256 agentTokenId, uint256 minScore) external view returns (bool) {
        ReputationData memory rep = reputations[agentTokenId];
        
        if (rep.totalPaymentVolume == 0) {
            return 50 >= minScore; // New agents have neutral score
        }
        
        uint256 score = (rep.totalPositive * 100) / rep.totalPaymentVolume;
        return score >= minScore;
    }
}