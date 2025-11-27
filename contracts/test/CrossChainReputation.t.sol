// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentIdentity.sol";
import "../src/ReputationRegistry.sol";
import "../src/CrossChainReputation.sol";

// Mock Teleporter for testing
contract MockTeleporter {
    event MessageSent(bytes32 destinationBlockchainID, address destinationAddress, bytes message);
    
    function sendCrossChainMessage(
        ITeleporterMessenger.TeleporterMessageInput calldata input
    ) external returns (bytes32) {
        emit MessageSent(input.destinationBlockchainID, input.destinationAddress, input.message);
        return keccak256(abi.encode(block.timestamp, input.message));
    }
}

contract CrossChainReputationTest is Test {
    AgentIdentity public identity;
    ReputationRegistry public reputation;
    CrossChainReputation public crossChain;
    MockTeleporter public mockTeleporter;
    
    address public agent1 = address(0x1234);
    address public user1 = address(0xAAAA);
    
    bytes32 public chainA = bytes32(uint256(1));
    bytes32 public chainB = bytes32(uint256(2));
    
    address public remoteContractA = address(0x9999);
    address public remoteContractB = address(0x8888);
    
    uint256 public agent1TokenId;
    
    function setUp() public {
        // Deploy mock teleporter
        mockTeleporter = new MockTeleporter();
        
        // Deploy core contracts
        identity = new AgentIdentity();
        reputation = new ReputationRegistry(address(identity));
        crossChain = new CrossChainReputation(address(mockTeleporter), address(reputation));
        
        // Register an agent
        agent1TokenId = identity.registerAgent(agent1, "ipfs://agent1");
        
        // Set up trusted remotes
        crossChain.setTrustedRemote(chainA, remoteContractA);
        crossChain.setTrustedRemote(chainB, remoteContractB);
    }
    
    function test_SetTrustedRemote() public view {
        assertEq(crossChain.trustedRemotes(chainA), remoteContractA);
        assertEq(crossChain.trustedRemotes(chainB), remoteContractB);
    }
    
    function test_SyncReputationToChain() public {
        // Give agent some reputation
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 5 ether, bytes32("tx1"));
        
        // Sync to chain A
        bytes32 messageId = crossChain.syncReputationToChain(agent1TokenId, chainA);
        
        assertTrue(messageId != bytes32(0));
    }
    
    function test_ReceiveTeleporterMessage() public {
        // Simulate receiving a message from chain A
        uint256 remoteReputation = 85;
        
        bytes memory message = abi.encode(
            uint8(1), // MSG_TYPE_SYNC_REPUTATION
            agent1TokenId,
            remoteReputation,
            block.timestamp
        );
        
        // Call as teleporter
        vm.prank(address(mockTeleporter));
        crossChain.receiveTeleporterMessage(chainA, remoteContractA, message);
        
        // Check remote reputation was stored
        (uint256 storedRep, uint256 lastSync) = crossChain.getRemoteReputation(agent1TokenId, chainA);
        assertEq(storedRep, remoteReputation);
        assertGt(lastSync, 0);
    }
    
    function test_RejectUntrustedSender() public {
        bytes memory message = abi.encode(uint8(1), agent1TokenId, uint256(85), block.timestamp);
        
        // Try to receive from untrusted sender
        vm.prank(address(mockTeleporter));
        vm.expectRevert("Untrusted sender");
        crossChain.receiveTeleporterMessage(chainA, address(0xBAD), message);
    }
    
    function test_OnlyTeleporterCanReceive() public {
        bytes memory message = abi.encode(uint8(1), agent1TokenId, uint256(85), block.timestamp);
        
        // Try to call as non-teleporter
        vm.expectRevert("Only Teleporter");
        crossChain.receiveTeleporterMessage(chainA, remoteContractA, message);
    }
    
    function test_GetAggregatedReputation() public {
        // Set local reputation to 80
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 1 ether, bytes32("tx1"));
        
        // Simulate receiving 90 from chain A
        bytes memory messageA = abi.encode(uint8(1), agent1TokenId, uint256(90), block.timestamp);
        vm.prank(address(mockTeleporter));
        crossChain.receiveTeleporterMessage(chainA, remoteContractA, messageA);
        
        // Simulate receiving 70 from chain B
        bytes memory messageB = abi.encode(uint8(1), agent1TokenId, uint256(70), block.timestamp);
        vm.prank(address(mockTeleporter));
        crossChain.receiveTeleporterMessage(chainB, remoteContractB, messageB);
        
        // Get aggregated reputation (local=100, chainA=90, chainB=70) = ~86
        bytes32[] memory chains = new bytes32[](2);
        chains[0] = chainA;
        chains[1] = chainB;
        
        uint256 aggregated = crossChain.getAggregatedReputation(agent1TokenId, chains);
        
        // (100 + 90 + 70) / 3 = 86
        assertEq(aggregated, 86);
    }
    
    function test_MeetsThresholdAcrossChains() public {
        // Local reputation = 100
        vm.prank(user1);
        reputation.submitFeedback(agent1TokenId, 1, 1 ether, bytes32("tx1"));
        
        // Chain A = 80
        bytes memory messageA = abi.encode(uint8(1), agent1TokenId, uint256(80), block.timestamp);
        vm.prank(address(mockTeleporter));
        crossChain.receiveTeleporterMessage(chainA, remoteContractA, messageA);
        
        bytes32[] memory chains = new bytes32[](1);
        chains[0] = chainA;
        
        // Should pass threshold of 70
        assertTrue(crossChain.meetsThresholdAcrossChains(agent1TokenId, 70, chains));
        
        // Should fail threshold of 90 (chainA is only 80)
        assertFalse(crossChain.meetsThresholdAcrossChains(agent1TokenId, 90, chains));
    }
}