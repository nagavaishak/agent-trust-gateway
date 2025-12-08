// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title JobLogger
 * @notice Event-based job tracking for AgentTrust Gateway
 * @dev Minimal on-chain state, heavy use of events for off-chain indexing
 *      This is the primary data source for reputation calculations
 */
contract JobLogger is Ownable {
    
    // ============================================
    // STRUCTS
    // ============================================
    
    struct JobSummary {
        uint256 totalJobs;
        uint256 totalVolume;
        uint256 lastJobTime;
    }
    
    // ============================================
    // STATE
    // ============================================
    
    // Agent token ID => Job summary (minimal on-chain state)
    mapping(uint256 => JobSummary) public agentJobs;
    
    // Service ID => Total jobs
    mapping(bytes32 => uint256) public serviceJobs;
    
    // Linked contracts
    address public agentRegistry;
    address public reputationEngine;
    address public gateway;
    
    // Job nonce for unique IDs
    uint256 public jobNonce;
    
    // Authorized loggers (gateway servers)
    mapping(address => bool) public authorizedLoggers;
    
    // ============================================
    // EVENTS (Primary data source for indexers)
    // ============================================
    
    /**
     * @notice Emitted when a job is registered
     */
    event JobRegistered(
        bytes32 indexed jobId,
        uint256 indexed agentTokenId,
        uint256 indexed clientTokenId,
        bytes32 serviceId,
        uint256 amount,
        string endpoint,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when a job completes successfully
     */
    event JobCompleted(
        bytes32 indexed jobId,
        uint256 indexed agentTokenId,
        uint256 executionTime,
        bytes32 resultHash
    );
    
    /**
     * @notice Emitted when a job fails
     */
    event JobFailed(
        bytes32 indexed jobId,
        uint256 indexed agentTokenId,
        string reason,
        bool slashed
    );
    
    /**
     * @notice Emitted when a job is disputed
     */
    event JobDisputed(
        bytes32 indexed jobId,
        uint256 indexed agentTokenId,
        uint256 indexed clientTokenId,
        string reason
    );
    
    /**
     * @notice Emitted when a dispute is resolved
     */
    event DisputeResolved(
        bytes32 indexed jobId,
        bool agentWon,
        uint256 slashAmount
    );
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() Ownable(msg.sender) {
        authorizedLoggers[msg.sender] = true;
    }
    
    // ============================================
    // JOB LOGGING
    // ============================================
    
    /**
     * @notice Log a new job (called by gateway)
     * @param agentTokenId Agent performing the job
     * @param clientTokenId Client requesting the job (0 if not an agent)
     * @param serviceId Service identifier
     * @param amount Payment amount
     * @param endpoint API endpoint called
     * @return jobId Unique job identifier
     */
    function logJob(
        uint256 agentTokenId,
        uint256 clientTokenId,
        bytes32 serviceId,
        uint256 amount,
        string calldata endpoint
    ) external returns (bytes32) {
        require(authorizedLoggers[msg.sender], "Not authorized");
        
        // Generate unique job ID
        bytes32 jobId = keccak256(abi.encodePacked(
            block.timestamp,
            agentTokenId,
            clientTokenId,
            jobNonce++
        ));
        
        // Update minimal on-chain state
        JobSummary storage summary = agentJobs[agentTokenId];
        summary.totalJobs += 1;
        summary.totalVolume += amount;
        summary.lastJobTime = block.timestamp;
        
        serviceJobs[serviceId] += 1;
        
        // Emit event for indexers
        emit JobRegistered(
            jobId,
            agentTokenId,
            clientTokenId,
            serviceId,
            amount,
            endpoint,
            block.timestamp
        );
        
        // Notify AgentRegistry
        if (agentRegistry != address(0)) {
            (bool success, ) = agentRegistry.call(
                abi.encodeWithSignature(
                    "recordJob(uint256,uint256)",
                    agentTokenId,
                    amount
                )
            );
            // Don't revert if this fails
        }
        
        return jobId;
    }
    
    /**
     * @notice Mark job as completed
     * @param jobId The job identifier
     * @param agentTokenId Agent who completed the job
     * @param executionTime Time taken in milliseconds
     * @param resultHash Hash of the result (for verification)
     */
    function completeJob(
        bytes32 jobId,
        uint256 agentTokenId,
        uint256 executionTime,
        bytes32 resultHash
    ) external {
        require(authorizedLoggers[msg.sender], "Not authorized");
        
        emit JobCompleted(jobId, agentTokenId, executionTime, resultHash);
        
        // Notify ReputationEngine
        if (reputationEngine != address(0)) {
            (bool success, ) = reputationEngine.call(
                abi.encodeWithSignature(
                    "recordJobOutcome(uint256,bytes32,bool)",
                    agentTokenId,
                    jobId,
                    true
                )
            );
        }
    }
    
    /**
     * @notice Mark job as failed
     * @param jobId The job identifier
     * @param agentTokenId Agent who failed the job
     * @param reason Failure reason
     * @param shouldSlash Whether to slash the agent
     */
    function failJob(
        bytes32 jobId,
        uint256 agentTokenId,
        string calldata reason,
        bool shouldSlash
    ) external {
        require(authorizedLoggers[msg.sender], "Not authorized");
        
        emit JobFailed(jobId, agentTokenId, reason, shouldSlash);
        
        // Notify ReputationEngine
        if (reputationEngine != address(0)) {
            (bool success, ) = reputationEngine.call(
                abi.encodeWithSignature(
                    "recordJobOutcome(uint256,bytes32,bool)",
                    agentTokenId,
                    jobId,
                    false
                )
            );
        }
        
        // TODO: Trigger slashing if shouldSlash is true
    }
    
    /**
     * @notice Open a dispute for a job
     */
    function openDispute(
        bytes32 jobId,
        uint256 agentTokenId,
        uint256 clientTokenId,
        string calldata reason
    ) external {
        require(authorizedLoggers[msg.sender], "Not authorized");
        
        emit JobDisputed(jobId, agentTokenId, clientTokenId, reason);
    }
    
    /**
     * @notice Resolve a dispute
     */
    function resolveDispute(
        bytes32 jobId,
        bool agentWon,
        uint256 slashAmount
    ) external onlyOwner {
        emit DisputeResolved(jobId, agentWon, slashAmount);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get job summary for an agent
     */
    function getAgentJobSummary(uint256 agentTokenId) external view returns (
        uint256 totalJobs,
        uint256 totalVolume,
        uint256 lastJobTime
    ) {
        JobSummary memory summary = agentJobs[agentTokenId];
        return (summary.totalJobs, summary.totalVolume, summary.lastJobTime);
    }
    
    /**
     * @notice Get total jobs for a service
     */
    function getServiceJobCount(bytes32 serviceId) external view returns (uint256) {
        return serviceJobs[serviceId];
    }
    
    /**
     * @notice Generate a job ID for preview
     */
    function previewJobId(
        uint256 agentTokenId,
        uint256 clientTokenId
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(
            block.timestamp,
            agentTokenId,
            clientTokenId,
            jobNonce
        ));
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
    
    function setGateway(address _gateway) external onlyOwner {
        gateway = _gateway;
        authorizedLoggers[_gateway] = true;
    }
    
    function addAuthorizedLogger(address logger) external onlyOwner {
        authorizedLoggers[logger] = true;
    }
    
    function removeAuthorizedLogger(address logger) external onlyOwner {
        authorizedLoggers[logger] = false;
    }
}
