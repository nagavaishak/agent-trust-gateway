// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CrossChainReputationReceiver.sol";

contract DeployDispatch is Script {
    // Teleporter Messenger - same on all Avalanche L1s
    address constant TELEPORTER_MESSENGER = 0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf;
    
    // Fuji C-Chain blockchain ID
    bytes32 constant FUJI_C_CHAIN_ID = 0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the receiver contract
        CrossChainReputationReceiver receiver = new CrossChainReputationReceiver(
            TELEPORTER_MESSENGER
        );
        
        console.log("CrossChainReputationReceiver deployed at:", address(receiver));
        console.log("");
        console.log("Next steps:");
        console.log("1. Set trusted remote on Dispatch (this contract)");
        console.log("2. Set trusted remote on Fuji (CrossChainReputation contract)");
        console.log("3. Call syncReputationToChain() from Fuji");
        
        vm.stopBroadcast();
    }
}
