// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationEngine
 * @notice Event-driven reputation scoring for AgentTrust Gateway
 * @dev Computes payment-weighted reputation scores with diversity bonuses
 *      Uses events for off-chain indexing to minimize gas costs
 */
contract ReputationEngine is Ownable {
    
    // ============================================
    // STRUCTS
    // ============================================
    
    struct ReputationData {
        uint256 totalWeightedRating;   // Sum of (rating * amount * raterWeight)
        uint256 totalWeight;           // Sum of (amount * raterWeight)
        uint256 uniqueRaters;          // Number of unique raters
        uint256 successfulJobs;        // Jobs completed successfully
        uint256 failedJobs;            // Jobs that failed/disputed
        uint256 lastUpdateBlock;       // Last update block number
        uint256 lastUpdateTime;        // Last update timestamp
    }
    
    struct FeedbackParams {
        uint256 agentTokenId;          // Agent being rated
        uint256 raterTokenId;          // Rater's agent ID (0 for non-agents)
        uint8 rating;                  // 1-5 star rating
        uint256 paymentAmount;         // Payment amount for this job
        bytes32 jobId;                 // Reference to job
        string comment;                // Optional comment (stored in event only)
    }
    
    // ============================================
    // CONSTANTS
    // ============================================
    
    uint256 public constant MAX_SCORE = 100;
    uint256 public constant RATING_SCALE = 5;  // 1-5 stars
    uint256 public constant KAPPA = 1e18;      // Smoothing factor to avoid div by zero
    uint256 public constant DIVERSITY_BONUS = 10; // Max bonus for unique raters
    
    // ============================================
    // STATE
    // ============================================
    
    // Agent token ID => Reputation data
    mapping(uint256 => ReputationData) public reputations;
    
    // Agent => Rater => Has rated (for uniqueness)
    mapping(uint256 => mapping(uint256 => bool)) public hasRated;
    
    // Agent => Rater => Last rating (for update logic)
    mapping(uint256 => mapping(uint256 => uint8)) public lastRating;
    
    // Linked contracts
    address public agentRegistry;
    address public jobLogger;
    address public stakingModule;
    
    // Authorized feedback submitters
    mapping(address => bool) public authorizedSubmitters;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event FeedbackSubmitted(
        uint256 indexed agentTokenId,
        uint256 indexed raterTokenId,
        uint8 rating,
        uint256 paymentAmount,
        bytes32 indexed jobId,
        string comment,
        uint256 newScore
    );
    
    event JobOutcomeRecorded(
        uint256 indexed agentTokenId,
        bytes32 indexed jobId,
        bool success,
        uint256 successfulJobs,
        uint256 failedJobs
    );
    
    event ScoreUpdated(
        uint256 indexed agentTokenId,
        uint256 oldScore,
        uint256 newScore,
        uint256 blockNumber
    );
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() Ownable(msg.sender) {
        authorizedSubmitters[msg.sender] = true;
    }
    
    // ============================================
    // FEEDBACK SUBMISSION
    // ============================================
    
    /**
     * @notice Submit feedback for an agent
     * @param params Feedback parameters
     */
    function submitFeedback(FeedbackParams calldata params) external {
        require(authorizedSubmitters[msg.sender], "Not authorized");
        require(params.rating >= 1 && params.rating <= 5, "Invalid rating");
        require(params.paymentAmount > 0, "Payment required");
        
        ReputationData storage rep = reputations[params.agentTokenId];
        
        // Calculate rater weight (could be enhanced with rater's reputation)
        uint256 raterWeight = _getRaterWeight(params.raterTokenId);
        
        // Update weighted rating
        uint256 weightedRating = uint256(params.rating) * params.paymentAmount * raterWeight;
        uint256 weight = params.paymentAmount * raterWeight;
        
        rep.totalWeightedRating += weightedRating;
        rep.totalWeight += weight;
        
        // Track unique raters
        if (!hasRated[params.agentTokenId][params.raterTokenId]) {
            hasRated[params.agentTokenId][params.raterTokenId] = true;
            rep.uniqueRaters += 1;
        }
        
        lastRating[params.agentTokenId][params.raterTokenId] = params.rating;
        
        rep.lastUpdateBlock = block.number;
        rep.lastUpdateTime = block.timestamp;
        
        uint256 newScore = _calculateScore(params.agentTokenId);
        
        emit FeedbackSubmitted(
            params.agentTokenId,
            params.raterTokenId,
            params.rating,
            params.paymentAmount,
            params.jobId,
            params.comment,
            newScore
        );
    }
    
    /**
     * @notice Record job outcome (success/failure)
     * @param agentTokenId The agent's token ID
     * @param jobId The job identifier
     * @param success Whether job was successful
     */
    function recordJobOutcome(
        uint256 agentTokenId,
        bytes32 jobId,
        bool success
    ) external {
        require(authorizedSubmitters[msg.sender] || msg.sender == jobLogger, "Not authorized");
        
        ReputationData storage rep = reputations[agentTokenId];
        
        if (success) {
            rep.successfulJobs += 1;
        } else {
            rep.failedJobs += 1;
        }
        
        rep.lastUpdateBlock = block.number;
        rep.lastUpdateTime = block.timestamp;
        
        emit JobOutcomeRecorded(
            agentTokenId,
            jobId,
            success,
            rep.successfulJobs,
            rep.failedJobs
        );
    }
    
    // ============================================
    // SCORE CALCULATION
    // ============================================
    
    /**
     * @notice Get current reputation score (0-100)
     * @param agentTokenId The agent's token ID
     * @return score The reputation score
     */
    function getScore(uint256 agentTokenId) external view returns (uint256) {
        return _calculateScore(agentTokenId);
    }
    
    /**
     * @notice Get detailed reputation data
     */
    function getReputation(uint256 agentTokenId) external view returns (
        uint256 score,
        uint256 successfulJobs,
        uint256 failedJobs,
        uint256 uniqueRaters,
        uint256 totalWeight,
        uint256 lastUpdateTime
    ) {
        ReputationData memory rep = reputations[agentTokenId];
        
        return (
            _calculateScore(agentTokenId),
            rep.successfulJobs,
            rep.failedJobs,
            rep.uniqueRaters,
            rep.totalWeight,
            rep.lastUpdateTime
        );
    }
    
    /**
     * @notice Check if agent meets minimum score threshold
     */
    function meetsThreshold(uint256 agentTokenId, uint256 minScore) external view returns (bool) {
        return _calculateScore(agentTokenId) >= minScore;
    }
    
    /**
     * @notice Get success rate (0-100)
     */
    function getSuccessRate(uint256 agentTokenId) external view returns (uint256) {
        ReputationData memory rep = reputations[agentTokenId];
        uint256 totalJobs = rep.successfulJobs + rep.failedJobs;
        
        if (totalJobs == 0) return 100; // Default for new agents
        
        return (rep.successfulJobs * 100) / totalJobs;
    }
    
    // ============================================
    // INTERNAL SCORE CALCULATION
    // ============================================
    
    function _calculateScore(uint256 agentTokenId) internal view returns (uint256) {
        ReputationData memory rep = reputations[agentTokenId];
        
        // New agent with no feedback
        if (rep.totalWeight == 0) {
            return 50; // Neutral starting score
        }
        
        // Base score from weighted ratings (1-5 stars → 20-100)
        // Formula: score = (totalWeightedRating / totalWeight) * 20
        // This maps 1 star → 20, 5 stars → 100
        uint256 avgRating = rep.totalWeightedRating / rep.totalWeight;
        uint256 baseScore = avgRating * 20;
        
        // Apply diversity bonus (more unique raters = more trustworthy)
        uint256 diversityBonus = _calculateDiversityBonus(rep.uniqueRaters);
        
        // Apply success rate modifier
        uint256 totalJobs = rep.successfulJobs + rep.failedJobs;
        uint256 successModifier = 100; // Default 100%
        
        if (totalJobs > 0) {
            successModifier = (rep.successfulJobs * 100) / totalJobs;
        }
        
        // Final score = baseScore * successModifier / 100 + diversityBonus
        uint256 finalScore = (baseScore * successModifier) / 100 + diversityBonus;
        
        // Cap at MAX_SCORE
        if (finalScore > MAX_SCORE) {
            finalScore = MAX_SCORE;
        }
        
        return finalScore;
    }
    
    function _calculateDiversityBonus(uint256 uniqueRaters) internal pure returns (uint256) {
        // Logarithmic bonus: more unique raters = higher bonus, with diminishing returns
        // 1 rater = 0, 10 raters = 5, 100 raters = 10
        if (uniqueRaters <= 1) return 0;
        if (uniqueRaters >= 100) return DIVERSITY_BONUS;
        
        // Simple linear approximation for hackathon
        return (uniqueRaters * DIVERSITY_BONUS) / 100;
    }
    
    function _getRaterWeight(uint256 raterTokenId) internal view returns (uint256) {
        // Could enhance with rater's own reputation
        // For now, return 1 (equal weight)
        if (raterTokenId == 0) return 1;
        
        // Optional: Get rater's reputation and use as weight
        // uint256 raterScore = _calculateScore(raterTokenId);
        // return raterScore > 0 ? raterScore : 1;
        
        return 1;
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = _agentRegistry;
    }
    
    function setJobLogger(address _jobLogger) external onlyOwner {
        jobLogger = _jobLogger;
    }
    
    function setStakingModule(address _stakingModule) external onlyOwner {
        stakingModule = _stakingModule;
    }
    
    function addAuthorizedSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = true;
    }
    
    function removeAuthorizedSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = false;
    }
}
