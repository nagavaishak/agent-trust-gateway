// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "lib/forge-std/src/console.sol";

/**
 * @title AgentIdentity
 * @notice ERC-721 based identity registry for AI agents (ERC-8004 inspired)
 * @dev Minimal implementation - agents get a unique on-chain identity NFT
 */
contract AgentIdentity {
    
    string public name = "Agent Trust Protocol";
    string public symbol = "ATP";
    
    uint256 private _tokenIdCounter;
    
    // Core storage
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(address => uint256) public agentToTokenId;
    
    // Agent metadata
    struct AgentData {
        address agentAddress;
        string metadataURI;
        uint256 createdAt;
        bool active;
    }
    
    mapping(uint256 => AgentData) public agents;
    
    // Events
    event AgentRegistered(uint256 indexed tokenId, address indexed agentAddress, string metadataURI);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    
    /**
     * @notice Register a new agent identity
     * @param agentAddress The address of the AI agent
     * @param metadataURI IPFS or HTTP link to agent metadata
     */
    function registerAgent(address agentAddress, string calldata metadataURI) external returns (uint256) {
        require(agentAddress != address(0), "Invalid agent address");
        require(agentToTokenId[agentAddress] == 0, "Agent already registered");
        
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        
        _owners[newTokenId] = agentAddress;
        _balances[agentAddress] = 1;
        agentToTokenId[agentAddress] = newTokenId;
        
        agents[newTokenId] = AgentData({
            agentAddress: agentAddress,
            metadataURI: metadataURI,
            createdAt: block.timestamp,
            active: true
        });
        
        emit AgentRegistered(newTokenId, agentAddress, metadataURI);
        emit Transfer(address(0), agentAddress, newTokenId);
        
        return newTokenId;
    }
    
    /**
     * @notice Check if an address is a registered agent
     */
    function isRegisteredAgent(address agentAddress) external view returns (bool) {
        return agentToTokenId[agentAddress] != 0;
    }
    
    /**
     * @notice Get agent data by token ID
     */
    function getAgent(uint256 tokenId) external view returns (AgentData memory) {
        require(_owners[tokenId] != address(0), "Agent does not exist");
        return agents[tokenId];
    }
    
    /**
     * @notice Get agent data by address
     */
    function getAgentByAddress(address agentAddress) external view returns (AgentData memory) {
        uint256 tokenId = agentToTokenId[agentAddress];
        require(tokenId != 0, "Agent not registered");
        return agents[tokenId];
    }
    
    // ERC-721 required functions
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "Invalid address");
        return _balances[owner];
    }
    
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}