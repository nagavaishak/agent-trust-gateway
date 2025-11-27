require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.fuji') });
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// Contract ABIs (minimal for what we need)
const IDENTITY_ABI = [
  "function isRegisteredAgent(address) view returns (bool)",
  "function agentToTokenId(address) view returns (uint256)",
  "function getAgentByAddress(address) view returns (tuple(address agentAddress, string metadataURI, uint256 createdAt, bool active))"
];

const REPUTATION_ABI = [
  "function getReputationScore(uint256 tokenId) view returns (uint256)",
  "function meetsThreshold(uint256 tokenId, uint256 minScore) view returns (bool)",
  "function submitFeedback(uint256 agentTokenId, int8 score, uint256 paymentAmount, bytes32 txHash)"
];

const CROSSCHAIN_ABI = [
  "function syncReputationToChain(uint256 agentTokenId, bytes32 destinationBlockchainID) returns (bytes32)",
  "function getAggregatedReputation(uint256 agentTokenId, bytes32[] chainIds) view returns (uint256)",
  "function getRemoteReputation(uint256 agentTokenId, bytes32 blockchainID) view returns (uint256 reputation, uint256 lastSync)",
  "function setTrustedRemote(bytes32 blockchainID, address remoteAddress)",
  "function trustedRemotes(bytes32) view returns (address)"
];

// Config (will be set after deployment)
const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
  identityContract: process.env.IDENTITY_CONTRACT || '',
  reputationContract: process.env.REPUTATION_CONTRACT || '',
  crosschainContract: process.env.CROSSCHAIN_CONTRACT || '',
  minReputationScore: parseInt(process.env.MIN_REPUTATION_SCORE || '50')
};

let provider, identityContract, reputationContract, crosschainContract;

function initContracts() {
  if (config.identityContract && config.reputationContract) {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    identityContract = new ethers.Contract(config.identityContract, IDENTITY_ABI, provider);
    reputationContract = new ethers.Contract(config.reputationContract, REPUTATION_ABI, provider);
    
    if (config.crosschainContract) {
      crosschainContract = new ethers.Contract(config.crosschainContract, CROSSCHAIN_ABI, provider);
      console.log('CrossChain contract initialized');
    }
    
    console.log('Contracts initialized');
  } else {
    console.log('Running in mock mode - no contracts configured');
  }
}

/**
 * x402 Payment Gating Endpoint
 * 
 * This is the core innovation: before approving a payment,
 * we check the agent's reputation score.
 */
app.post('/x402/verify', async (req, res) => {
  const { agentAddress, paymentAmount } = req.body;
  
  if (!agentAddress) {
    return res.status(400).json({ error: 'agentAddress required' });
  }
  
  try {
    // Mock mode for local testing
    if (!identityContract) {
      return res.json({
        approved: true,
        agentAddress,
        reputation: 75,
        tier: 'standard',
        feeMultiplier: 1.0,
        message: 'Mock mode - contracts not configured'
      });
    }
    
    // Check if agent is registered
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    
    if (!isRegistered) {
      return res.json({
        approved: false,
        agentAddress,
        reason: 'Agent not registered',
        action: 'Register at /agents/register'
      });
    }
    
    // Get agent's token ID and reputation
    const tokenId = await identityContract.agentToTokenId(agentAddress);
    const reputation = await reputationContract.getReputationScore(tokenId);
    const repNumber = Number(reputation);
    
    // Determine tier and fee multiplier based on reputation
    let tier, feeMultiplier, approved;
    
    if (repNumber >= 90) {
      tier = 'premium';
      feeMultiplier = 0.5;  // 50% discount
      approved = true;
    } else if (repNumber >= 70) {
      tier = 'standard';
      feeMultiplier = 1.0;  // Normal fees
      approved = true;
    } else if (repNumber >= 50) {
      tier = 'basic';
      feeMultiplier = 1.5;  // 50% higher fees
      approved = true;
    } else {
      tier = 'restricted';
      feeMultiplier = 2.0;  // Double fees
      approved = repNumber >= config.minReputationScore;
    }
    
    return res.json({
      approved,
      agentAddress,
      tokenId: tokenId.toString(),
      reputation: repNumber,
      tier,
      feeMultiplier,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

/**
 * Register a new agent
 * In production, the agent would sign this themselves
 * For demo, we use a server wallet
 */
app.post('/agents/register', async (req, res) => {
  const { agentAddress, metadataURI } = req.body;
  
  if (!agentAddress || !metadataURI) {
    return res.status(400).json({ error: 'agentAddress and metadataURI required' });
  }
  
  try {
    // Mock mode
    if (!identityContract) {
      return res.json({
        success: true,
        agentAddress,
        tokenId: '1',
        message: 'Mock mode - no actual registration'
      });
    }
    
    // Check if already registered
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (isRegistered) {
      const tokenId = await identityContract.agentToTokenId(agentAddress);
      return res.status(400).json({ 
        error: 'Agent already registered',
        tokenId: tokenId.toString()
      });
    }
    
    // Create signer from server wallet (for demo purposes)
    const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
    if (!serverPrivateKey) {
      return res.status(500).json({ error: 'Server wallet not configured' });
    }
    
    const signer = new ethers.Wallet(serverPrivateKey, provider);
    const identityWithSigner = new ethers.Contract(
      config.identityContract, 
      [...IDENTITY_ABI, "function registerAgent(address,string) returns (uint256)"],
      signer
    );
    
    // Register the agent
    const tx = await identityWithSigner.registerAgent(agentAddress, metadataURI);
    const receipt = await tx.wait();
    
    // Get the token ID from the event
    const tokenId = await identityContract.agentToTokenId(agentAddress);
    
    return res.json({
      success: true,
      agentAddress,
      tokenId: tokenId.toString(),
      metadataURI,
      txHash: receipt.hash
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

/**
 * Submit feedback for an agent
 */
app.post('/agents/:tokenId/feedback', async (req, res) => {
  const { tokenId } = req.params;
  const { score, paymentAmount } = req.body;
  
  if (score === undefined || paymentAmount === undefined) {
    return res.status(400).json({ error: 'score and paymentAmount required' });
  }
  
  if (score < -1 || score > 1) {
    return res.status(400).json({ error: 'score must be -1, 0, or 1' });
  }
  
  try {
    // Mock mode
    if (!reputationContract) {
      return res.json({
        success: true,
        tokenId,
        message: 'Mock mode - no actual feedback submitted'
      });
    }
    
    const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
    if (!serverPrivateKey) {
      return res.status(500).json({ error: 'Server wallet not configured' });
    }
    
    const signer = new ethers.Wallet(serverPrivateKey, provider);
    const reputationWithSigner = new ethers.Contract(
      config.reputationContract,
      [...REPUTATION_ABI],
      signer
    );
    
    // Generate a random tx hash for demo purposes
    const fakeTxHash = ethers.keccak256(ethers.toUtf8Bytes(`feedback-${Date.now()}`));
    
    // Convert payment amount to wei
    const amountWei = ethers.parseEther(paymentAmount.toString());
    
    const tx = await reputationWithSigner.submitFeedback(
      tokenId,
      score,
      amountWei,
      fakeTxHash
    );
    await tx.wait();
    
    // Get updated reputation
    const newScore = await reputationContract.getReputationScore(tokenId);
    
    return res.json({
      success: true,
      tokenId,
      feedbackScore: score,
      paymentAmount,
      newReputation: Number(newScore),
      txHash: tx.hash
    });
    
  } catch (error) {
    console.error('Feedback error:', error);
    return res.status(500).json({ error: 'Feedback submission failed', details: error.message });
  }
});

/**
 * Get agent reputation
 */
app.get('/agents/:address/reputation', async (req, res) => {
  const { address } = req.params;
  
  try {
    // Mock mode
    if (!identityContract) {
      return res.json({
        agentAddress: address,
        reputation: 75,
        tier: 'standard',
        feedbackCount: 12,
        message: 'Mock mode'
      });
    }
    
    const isRegistered = await identityContract.isRegisteredAgent(address);
    
    if (!isRegistered) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const tokenId = await identityContract.agentToTokenId(address);
    const reputation = await reputationContract.getReputationScore(tokenId);
    
    return res.json({
      agentAddress: address,
      tokenId: tokenId.toString(),
      reputation: Number(reputation),
      timestamp: Date.now()
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: identityContract ? 'live' : 'mock',
    contracts: {
      identity: config.identityContract || 'not set',
      reputation: config.reputationContract || 'not set'
    }
  });
});

/**
 * Discovery endpoint - find agents by reputation threshold
 */
app.get('/agents/discover', async (req, res) => {
  const minReputation = parseInt(req.query.minReputation || '50');
  
  // For now, return mock data
  // In production, this would query an indexer or subgraph
  res.json({
    minReputation,
    agents: [
      { address: '0x1234...', reputation: 95, tier: 'premium' },
      { address: '0x5678...', reputation: 78, tier: 'standard' }
    ],
    message: 'Mock data - indexer not implemented yet'
  });
});

/**
 * Get cross-chain reputation data
 */
app.get('/agents/:tokenId/crosschain', async (req, res) => {
  const { tokenId } = req.params;
  
  // Mock chain IDs for demo
  const CHAIN_A = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const CHAIN_B = '0x0000000000000000000000000000000000000000000000000000000000000002';
  
  try {
    if (!crosschainContract) {
      return res.json({
        tokenId,
        localReputation: 75,
        remoteReputations: [
          { chainId: 'Chain A (Gaming L1)', reputation: 82, lastSync: Date.now() - 3600000 },
          { chainId: 'Chain B (DeFi L1)', reputation: 91, lastSync: Date.now() - 7200000 }
        ],
        aggregatedReputation: 82,
        message: 'Mock mode - showing simulated cross-chain data'
      });
    }
    
    // Get local reputation
    const localRep = await reputationContract.getReputationScore(tokenId);
    
    // Get remote reputations
    const [repA, syncA] = await crosschainContract.getRemoteReputation(tokenId, CHAIN_A);
    const [repB, syncB] = await crosschainContract.getRemoteReputation(tokenId, CHAIN_B);
    
    // Calculate aggregated
    const chainIds = [CHAIN_A, CHAIN_B];
    const aggregated = await crosschainContract.getAggregatedReputation(tokenId, chainIds);
    
    return res.json({
      tokenId,
      localReputation: Number(localRep),
      remoteReputations: [
        { 
          chainId: 'Chain A (Gaming L1)', 
          reputation: Number(repA), 
          lastSync: Number(syncA) * 1000 
        },
        { 
          chainId: 'Chain B (DeFi L1)', 
          reputation: Number(repB), 
          lastSync: Number(syncB) * 1000 
        }
      ],
      aggregatedReputation: Number(aggregated)
    });
    
  } catch (error) {
    console.error('CrossChain error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Simulate syncing reputation to another chain
 */
app.post('/agents/:tokenId/sync', async (req, res) => {
  const { tokenId } = req.params;
  const { destinationChain } = req.body;
  
  try {
    if (!crosschainContract) {
      return res.json({
        success: true,
        tokenId,
        destinationChain: destinationChain || 'Chain A',
        messageId: '0x' + Math.random().toString(16).slice(2),
        message: 'Mock mode - simulated cross-chain sync'
      });
    }
    
    const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
    const signer = new ethers.Wallet(serverPrivateKey, provider);
    const crosschainWithSigner = new ethers.Contract(
      config.crosschainContract,
      CROSSCHAIN_ABI,
      signer
    );
    
    // Default to Chain A
    const chainId = destinationChain === 'B' 
      ? '0x0000000000000000000000000000000000000000000000000000000000000002'
      : '0x0000000000000000000000000000000000000000000000000000000000000001';
    
    const tx = await crosschainWithSigner.syncReputationToChain(tokenId, chainId);
    const receipt = await tx.wait();
    
    return res.json({
      success: true,
      tokenId,
      destinationChain: destinationChain || 'A',
      txHash: receipt.hash
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

initContracts();

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║   Agent Trust Protocol - x402 Facilitator  ║
  ╠═══════════════════════════════════════════╣
  ║   Server running on port ${PORT}              ║
  ║   Mode: ${identityContract ? 'LIVE' : 'MOCK'}                            ║
  ╚═══════════════════════════════════════════╝
  
  Endpoints:
  - POST /x402/verify     - Verify agent for payment
  - GET  /agents/:address/reputation - Get reputation
  - GET  /agents/discover - Find trusted agents
  - GET  /health          - Health check
  `);
});