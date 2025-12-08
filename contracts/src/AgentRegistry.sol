// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice ERC-721 based agent identity registry for AgentTrust Gateway
 * @dev Each agent gets a unique NFT representing their on-chain identity
 *      Integrates with StakingModule and ReputationEngine
 */
contract AgentRegistry is ERC721, ERC721Enumerable, Ownable {
    uint256 private _tokenIdCounter;
    
    // ============================================
    // STRUCTS
    // ============================================
    
    struct AgentInfo {
        address agentAddress;      // The agent's wallet address
        string metadataURI;        // IPFS or HTTP metadata URI
        uint256 registeredAt;      // Registration timestamp
        bool active;               // Whether agent is active
        bytes32 provenanceId;      // Optional: Youmio/external DID reference
        uint256 totalJobs;         // Total jobs completed
        uint256 totalVolume;       // Total payment volume (in wei)
    }
    
    // ============================================
    // STATE
    // ============================================
    
    // Token ID => Agent Info
    mapping(uint256 => AgentInfo) public agents;
    
    // Agent address => Token ID (0 if not registered)
    mapping(address => uint256) public agentToTokenId;
    
    // Linked contracts
    address public stakingModule;
    address public reputationEngine;
    address public jobLogger;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event AgentRegistered(
        uint256 indexed tokenId,
        address indexed agentAddress,
        string metadataURI,
        bytes32 provenanceId
    );
    
    event AgentUpdated(
        uint256 indexed tokenId,
        string metadataURI,
        bytes32 provenanceId
    );
    
    event AgentDeactivated(uint256 indexed tokenId);
    event AgentReactivated(uint256 indexed tokenId);
    
    event JobRecorded(
        uint256 indexed tokenId,
        uint256 jobCount,
        uint256 volume
    );
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() ERC721("AgentTrust Identity", "AGENTID") Ownable(msg.sender) {
        // Token IDs start at 1
        _tokenIdCounter = 1;
    }
    
    // ============================================
    // REGISTRATION
    // ============================================
    
    /**
     * @notice Register a new agent
     * @param agentAddress The agent's wallet address
     * @param metadataURI IPFS or HTTP URI for agent metadata
     * @param provenanceId Optional external DID (Youmio, etc.)
     * @return tokenId The newly minted token ID
     */
    function registerAgent(
        address agentAddress,
        string calldata metadataURI,
        bytes32 provenanceId
    ) external returns (uint256) {
        require(agentAddress != address(0), "Invalid agent address");
        require(agentToTokenId[agentAddress] == 0, "Agent already registered");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        // Mint identity NFT to the agent
        _safeMint(agentAddress, tokenId);
        
        // Store agent info
        agents[tokenId] = AgentInfo({
            agentAddress: agentAddress,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            active: true,
            provenanceId: provenanceId,
            totalJobs: 0,
            totalVolume: 0
        });
        
        agentToTokenId[agentAddress] = tokenId;
        
        emit AgentRegistered(tokenId, agentAddress, metadataURI, provenanceId);
        
        return tokenId;
    }
    
    /**
     * @notice Lazy registration - auto-register on first interaction
     * @param agentAddress The agent's wallet address
     * @return tokenId The token ID (existing or newly created)
     */
    function getOrCreateAgent(address agentAddress) external returns (uint256) {
        uint256 existingId = agentToTokenId[agentAddress];
        if (existingId != 0) {
            return existingId;
        }
        
        // Auto-register with minimal metadata
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(agentAddress, tokenId);
        
        agents[tokenId] = AgentInfo({
            agentAddress: agentAddress,
            metadataURI: "",
            registeredAt: block.timestamp,
            active: true,
            provenanceId: bytes32(0),
            totalJobs: 0,
            totalVolume: 0
        });
        
        agentToTokenId[agentAddress] = tokenId;
        
        emit AgentRegistered(tokenId, agentAddress, "", bytes32(0));
        
        return tokenId;
    }
    
    // ============================================
    // UPDATES
    // ============================================
    
    /**
     * @notice Update agent metadata
     * @param tokenId The agent's token ID
     * @param metadataURI New metadata URI
     * @param provenanceId New provenance ID
     */
    function updateAgent(
        uint256 tokenId,
        string calldata metadataURI,
        bytes32 provenanceId
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not agent owner");
        
        agents[tokenId].metadataURI = metadataURI;
        agents[tokenId].provenanceId = provenanceId;
        
        emit AgentUpdated(tokenId, metadataURI, provenanceId);
    }
    
    /**
     * @notice Deactivate an agent (self or admin)
     * @param tokenId The agent's token ID
     */
    function deactivateAgent(uint256 tokenId) external {
        require(
            ownerOf(tokenId) == msg.sender || msg.sender == owner(),
            "Not authorized"
        );
        
        agents[tokenId].active = false;
        emit AgentDeactivated(tokenId);
    }
    
    /**
     * @notice Reactivate an agent
     * @param tokenId The agent's token ID
     */
    function reactivateAgent(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not agent owner");
        
        agents[tokenId].active = true;
        emit AgentReactivated(tokenId);
    }
    
    // ============================================
    // JOB TRACKING (Called by JobLogger)
    // ============================================
    
    /**
     * @notice Record a completed job for an agent
     * @param tokenId The agent's token ID
     * @param volume Payment volume for the job
     */
    function recordJob(uint256 tokenId, uint256 volume) external {
        require(msg.sender == jobLogger, "Only JobLogger");
        require(_exists(tokenId), "Agent does not exist");
        
        agents[tokenId].totalJobs += 1;
        agents[tokenId].totalVolume += volume;
        
        emit JobRecorded(tokenId, agents[tokenId].totalJobs, volume);
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Check if an address is a registered agent
     */
    function isRegisteredAgent(address agentAddress) external view returns (bool) {
        return agentToTokenId[agentAddress] != 0;
    }
    
    /**
     * @notice Check if an agent is active
     */
    function isActiveAgent(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) return false;
        return agents[tokenId].active;
    }
    
    /**
     * @notice Get agent info by address
     */
    function getAgentByAddress(address agentAddress) external view returns (AgentInfo memory) {
        uint256 tokenId = agentToTokenId[agentAddress];
        require(tokenId != 0, "Agent not registered");
        return agents[tokenId];
    }
    
    /**
     * @notice Get agent info by token ID
     */
    function getAgent(uint256 tokenId) external view returns (AgentInfo memory) {
        require(_exists(tokenId), "Agent does not exist");
        return agents[tokenId];
    }
    
    /**
     * @notice Get total number of registered agents
     */
    function totalAgents() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    /**
     * @notice Set linked contract addresses
     */
    function setLinkedContracts(
        address _stakingModule,
        address _reputationEngine,
        address _jobLogger
    ) external onlyOwner {
        stakingModule = _stakingModule;
        reputationEngine = _reputationEngine;
        jobLogger = _jobLogger;
    }
    
    // ============================================
    // INTERNAL HELPERS
    // ============================================
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId < _tokenIdCounter;
    }
    
    // ============================================
    // OVERRIDES (Required for ERC721Enumerable)
    // ============================================
    
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
