// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentIdentity.sol";
import "../src/ReputationRegistry.sol";
import "../src/CrossChainReputation.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Mock Teleporter address for local testing
        // On Fuji, use: 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf
        address teleporterAddress = vm.envOr("TELEPORTER_ADDRESS", address(0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf));
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy AgentIdentity
        AgentIdentity identity = new AgentIdentity();
        console.log("AgentIdentity deployed at:", address(identity));
        
        // Deploy ReputationRegistry
        ReputationRegistry reputation = new ReputationRegistry(address(identity));
        console.log("ReputationRegistry deployed at:", address(reputation));
        
        // Deploy CrossChainReputation
        CrossChainReputation crossChain = new CrossChainReputation(teleporterAddress, address(reputation));
        console.log("CrossChainReputation deployed at:", address(crossChain));
        
        vm.stopBroadcast();
        
        console.log("\n--- Deployment Complete ---");
        console.log("IDENTITY_CONTRACT=", address(identity));
        console.log("REPUTATION_CONTRACT=", address(reputation));
        console.log("CROSSCHAIN_CONTRACT=", address(crossChain));
    }
}