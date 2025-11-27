// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentIdentity.sol";
import "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    AgentIdentity public identity;
    ReputationRegistry public reputation;
    
    address public agent1 = address(0x1234);
    address public user1 = address(0xAAAA);
    address public user2 = address(0xBBBB);
    
    uint256 public agent1TokenId;
    
    function setUp() public {
        identity = new AgentIdentity();
        reputation = new ReputationRegistry(address(identity));
        
        // Register an agent
        agent1TokenId = identity.registerAgent(agent1, "ipfs://agent1");
    }
    
    function test_NewAgentHasNeutralScore() public view {
        uint256 score = reputation.getReputationScore(agent1TokenId);
        assertEq(score, 50); // Neutral score for new agents
    }
    
    function test_PositiveFeedbackIncreasesScore() public {
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 1 ether, bytes32("tx1"));
        
        uint256 score = reputation.getReputationScore(agent1TokenId);
        assertEq(score, 100); // All positive = 100
    }
    
    function test_NegativeFeedbackDecreasesScore() public {
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, -1, 1 ether, bytes32("tx1"));
        
        uint256 score = reputation.getReputationScore(agent1TokenId);
        assertEq(score, 0); // All negative = 0
    }
    
    function test_MixedFeedbackCalculatesCorrectly() public {
        // 3 ETH positive, 1 ETH negative = 75% score
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 3 ether, bytes32("tx1"));
        
        vm.prank(user2);
        reputation.submitFeedback(agent1TokenId, -1, 1 ether, bytes32("tx2"));
        
        uint256 score = reputation.getReputationScore(agent1TokenId);
        assertEq(score, 75);
    }
    
    function test_PaymentWeighting() public {
        // Small negative (0.1 ETH) vs large positive (10 ETH)
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, -1, 0.1 ether, bytes32("tx1"));
        
        vm.prank(user2);
        reputation.submitFeedback(agent1TokenId, 1, 10 ether, bytes32("tx2"));
        
        uint256 score = reputation.getReputationScore(agent1TokenId);
        // 10 ETH positive / 10.1 ETH total = ~99%
        assertGt(score, 95);
    }
    
    function test_MeetsThreshold() public {
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 1 ether, bytes32("tx1"));
        
        assertTrue(reputation.meetsThreshold(agent1TokenId, 80));
        assertTrue(reputation.meetsThreshold(agent1TokenId, 100));
        assertFalse(reputation.meetsThreshold(agent1TokenId, 101));
    }
    
    function test_FeedbackCount() public {
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 1 ether, bytes32("tx1"));
        
        vm.prank(user2);
        reputation.submitFeedback(agent1TokenId, 1, 2 ether, bytes32("tx2"));
        
        assertEq(reputation.getFeedbackCount(agent1TokenId), 2);
    }
}