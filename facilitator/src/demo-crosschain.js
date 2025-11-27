require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { ethers } = require('ethers');

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RPC_URL = 'http://127.0.0.1:8545';

const CROSSCHAIN_ADDRESS = process.env.CROSSCHAIN_CONTRACT;
const IDENTITY_ADDRESS = process.env.IDENTITY_CONTRACT;
const REPUTATION_ADDRESS = process.env.REPUTATION_CONTRACT;

// Simulated chain IDs
const CHAIN_A = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CHAIN_B = '0x0000000000000000000000000000000000000000000000000000000000000002';

// Mock remote contract addresses
const REMOTE_A = '0x1111111111111111111111111111111111111111';
const REMOTE_B = '0x2222222222222222222222222222222222222222';

async function main() {
  console.log('\n🌐 Agent Trust Protocol - Cross-Chain Demo\n');
  console.log('═'.repeat(55));
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Contract instances
  const crosschain = new ethers.Contract(CROSSCHAIN_ADDRESS, [
    "function setTrustedRemote(bytes32 blockchainID, address remoteAddress)",
    "function getRemoteReputation(uint256 agentTokenId, bytes32 blockchainID) view returns (uint256, uint256)",
    "function getAggregatedReputation(uint256 agentTokenId, bytes32[] chainIds) view returns (uint256)",
    "function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes message)",
    "function trustedRemotes(bytes32) view returns (address)"
  ], signer);
  
  const reputation = new ethers.Contract(REPUTATION_ADDRESS, [
    "function getReputationScore(uint256 tokenId) view returns (uint256)"
  ], provider);
  
  const agentTokenId = 1;
  
  console.log('\n1️⃣  Setting up trusted remote chains...');
  console.log('─'.repeat(55));
  
  // Set trusted remotes
  try {
    let tx = await crosschain.setTrustedRemote(CHAIN_A, REMOTE_A);
    await tx.wait();
    console.log('   ✅ Chain A (Gaming L1) trusted');
    
    tx = await crosschain.setTrustedRemote(CHAIN_B, REMOTE_B);
    await tx.wait();
    console.log('   ✅ Chain B (DeFi L1) trusted');
  } catch (e) {
    console.log('   ℹ️  Trusted remotes already set');
  }
  
  console.log('\n2️⃣  Current reputation state...');
  console.log('─'.repeat(55));
  
  const localRep = await reputation.getReputationScore(agentTokenId);
  console.log(`   Local reputation: ${localRep}`);
  
  const [remoteRepA] = await crosschain.getRemoteReputation(agentTokenId, CHAIN_A);
  const [remoteRepB] = await crosschain.getRemoteReputation(agentTokenId, CHAIN_B);
  console.log(`   Chain A reputation: ${remoteRepA}`);
  console.log(`   Chain B reputation: ${remoteRepB}`);
  
  console.log('\n3️⃣  Simulating cross-chain reputation sync...');
  console.log('─'.repeat(55));
  console.log('   📡 Receiving reputation from Chain A (Gaming L1)...');
  
  // Simulate receiving message from Chain A with reputation 85
  const messageA = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint8', 'uint256', 'uint256', 'uint256'],
    [1, agentTokenId, 85, Math.floor(Date.now() / 1000)]
  );
  
  // We need to call as the teleporter - but we don't have that
  // So let's create a mock teleporter scenario
  console.log('   ⚠️  Note: In production, TeleporterMessenger calls receiveTeleporterMessage');
  console.log('   📊 Simulated: Agent has 85 reputation on Gaming L1');
  
  console.log('\n   📡 Receiving reputation from Chain B (DeFi L1)...');
  console.log('   📊 Simulated: Agent has 92 reputation on DeFi L1');
  
  console.log('\n4️⃣  Cross-chain reputation summary...');
  console.log('─'.repeat(55));
  console.log(`
   ┌─────────────────────────────────────────────────┐
   │           CROSS-CHAIN REPUTATION                │
   ├─────────────────────────────────────────────────┤
   │  Agent Token ID: ${agentTokenId}                             │
   │                                                 │
   │  Local (C-Chain):     ${localRep}/100  ████████████░░  │
   │  Chain A (Gaming):    85/100  ████████░░░░░░  │
   │  Chain B (DeFi):      92/100  █████████░░░░░  │
   │                                                 │
   │  Aggregated Score:    ${Math.floor((Number(localRep) + 85 + 92) / 3)}/100               │
   └─────────────────────────────────────────────────┘
  `);
  
  console.log('\n5️⃣  How it works in production...');
  console.log('─'.repeat(55));
  console.log(`
   1. Agent builds reputation on Chain A through payments
   2. Agent calls syncReputationToChain(tokenId, CHAIN_B)
   3. Teleporter sends cross-chain message via AWM
   4. Chain B receives and stores the reputation
   5. Any dApp on Chain B can check agent's cross-chain reputation
   
   This enables:
   • Portable agent identity across Avalanche L1s
   • Reputation follows the agent, not stuck on one chain
   • DeFi protocols can trust agents based on gaming reputation
   • Gaming platforms can trust agents based on DeFi history
  `);
  
  console.log('═'.repeat(55));
  console.log('🎉 Cross-chain demo complete!\n');
}

main().catch(console.error);