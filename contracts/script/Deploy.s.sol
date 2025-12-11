// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/ReputationEngine.sol";
import "../src/StakingModule.sol";
import "../src/JobLogger.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry:", address(registry));
        
        // Deploy ReputationEngine (no constructor args)
        ReputationEngine reputation = new ReputationEngine();
        console.log("ReputationEngine:", address(reputation));
        
        // Deploy StakingModule
        StakingModule staking = new StakingModule(address(registry));
        console.log("StakingModule:", address(staking));
        
        // Deploy JobLogger (no constructor args)
        JobLogger jobLogger = new JobLogger();
        console.log("JobLogger:", address(jobLogger));
        
        vm.stopBroadcast();
    }
}
