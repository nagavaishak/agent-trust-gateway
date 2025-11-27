// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentIdentity.sol";

contract AgentIdentityTest is Test {
    AgentIdentity public registry;
    
    address public agent1 = address(0x1234);
    address public agent2 = address(0x5678);
    
    function setUp() public {
        registry = new AgentIdentity();
    }
    
    function test_RegisterAgent() public {
        uint256 tokenId = registry.registerAgent(agent1, "ipfs://metadata1");
        
        assertEq(tokenId, 1);
        assertEq(registry.isRegisteredAgent(agent1), true);
        assertEq(registry.ownerOf(tokenId), agent1);
        assertEq(registry.totalSupply(), 1);
    }
    
    function test_CannotRegisterTwice() public {
        registry.registerAgent(agent1, "ipfs://metadata1");
        
        vm.expectRevert("Agent already registered");
        registry.registerAgent(agent1, "ipfs://metadata2");
    }
    
    function test_GetAgentData() public {
        registry.registerAgent(agent1, "ipfs://metadata1");
        
        AgentIdentity.AgentData memory data = registry.getAgentByAddress(agent1);
        
        assertEq(data.agentAddress, agent1);
        assertEq(data.metadataURI, "ipfs://metadata1");
        assertEq(data.active, true);
    }
    
    function test_MultipleAgents() public {
        registry.registerAgent(agent1, "ipfs://agent1");
        registry.registerAgent(agent2, "ipfs://agent2");
        
        assertEq(registry.totalSupply(), 2);
        assertEq(registry.isRegisteredAgent(agent1), true);
        assertEq(registry.isRegisteredAgent(agent2), true);
    }
}