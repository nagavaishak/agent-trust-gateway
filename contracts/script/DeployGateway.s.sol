// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/StakingModule.sol";
import "../src/ReputationEngine.sol";
import "../src/JobLogger.sol";

/**
 * @title DeployGateway
 * @notice Deploys all AgentTrust Gateway contracts
 */
contract DeployGateway is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying AgentTrust Gateway contracts...");
        console.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed:", address(registry));
        
        // 2. Deploy StakingModule (treasury = deployer for now)
        StakingModule staking = new StakingModule(deployer);
        console.log("StakingModule deployed:", address(staking));
        
        // 3. Deploy ReputationEngine
        ReputationEngine reputation = new ReputationEngine();
        console.log("ReputationEngine deployed:", address(reputation));
        
        // 4. Deploy JobLogger
        JobLogger jobLogger = new JobLogger();
        console.log("JobLogger deployed:", address(jobLogger));
        
        // 5. Link contracts together
        console.log("\nLinking contracts...");
        
        // Link AgentRegistry
        registry.setLinkedContracts(
            address(staking),
            address(reputation),
            address(jobLogger)
        );
        console.log("AgentRegistry linked");
        
        // Link StakingModule
        staking.setAgentRegistry(address(registry));
        staking.setReputationEngine(address(reputation));
        console.log("StakingModule linked");
        
        // Link ReputationEngine
        reputation.setAgentRegistry(address(registry));
        reputation.setJobLogger(address(jobLogger));
        reputation.setStakingModule(address(staking));
        console.log("ReputationEngine linked");
        
        // Link JobLogger
        jobLogger.setAgentRegistry(address(registry));
        jobLogger.setReputationEngine(address(reputation));
        console.log("JobLogger linked");
        
        // 6. Add deployer as authorized submitter/logger
        reputation.addAuthorizedSubmitter(deployer);
        jobLogger.addAuthorizedLogger(deployer);
        console.log("Deployer authorized");
        
        vm.stopBroadcast();
        
        // Print summary
        console.log("\n========================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("AgentRegistry:    ", address(registry));
        console.log("StakingModule:    ", address(staking));
        console.log("ReputationEngine: ", address(reputation));
        console.log("JobLogger:        ", address(jobLogger));
        console.log("========================================");
        console.log("\nAdd to .env.fuji:");
        console.log("AGENT_REGISTRY=", address(registry));
        console.log("STAKING_MODULE=", address(staking));
        console.log("REPUTATION_ENGINE=", address(reputation));
        console.log("JOB_LOGGER=", address(jobLogger));
    }
}
