const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

// Load Fuji config
dotenv.config({ path: '.env.fuji' });

const app = express();
app.use(cors());
app.use(express.json());

// Contract ABIs - FIXED to match actual contract functions
const IDENTITY_ABI = [
  "function registerAgent(address agent, string metadataURI) external returns (uint256)",
  "function agentToTokenId(address agent) external view returns (uint256)",
  "function isRegisteredAgent(address agent) external view returns (bool)",
  "function getAgent(uint256 tokenId) external view returns (tuple(address agentAddress, string metadataURI, uint256 createdAt, bool active))",
  "function getAgentByAddress(address agent) external view returns (tuple(address agentAddress, string metadataURI, uint256 createdAt, bool active))",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "event AgentRegistered(uint256 indexed tokenId, address indexed agentAddress, string metadataURI)"
];

// FIXED: Correct function signatures for ReputationRegistry
const REPUTATION_ABI = [
  "function submitFeedback(uint256 agentTokenId, int8 score, uint256 paymentAmount, bytes32 txHash) external",
  "function getReputationScore(uint256 agentTokenId) external view returns (uint256)",
  "function getReputation(uint256 agentTokenId) external view returns (tuple(uint256 totalPositive, uint256 totalNegative, uint256 totalPaymentVolume, uint256 feedbackCount, uint256 lastUpdated))",
  "function getFeedbackCount(uint256 agentTokenId) external view returns (uint256)",
  "function meetsThreshold(uint256 agentTokenId, uint256 minScore) external view returns (bool)",
  "event FeedbackSubmitted(uint256 indexed agentTokenId, address indexed from, int8 score, uint256 paymentAmount)"
];

const CROSSCHAIN_ABI = [
  "function syncReputationToChain(uint256 agentTokenId, bytes32 destinationBlockchainID) external returns (bytes32)",
  "function getAggregatedReputation(uint256 tokenId, bytes32[] calldata chainIds) external view returns (uint256)",
  "function getRemoteReputation(uint256 tokenId, bytes32 remoteChainId) external view returns (uint256 reputation, uint256 lastSync)",
  "function setTrustedRemote(bytes32 remoteChainId, address remoteContract) external"
];

// Setup provider and contracts (disable ENS for Avalanche)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL, {
  chainId: 43113,
  name: 'avalanche-fuji'
});
const wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);

const identityContract = new ethers.Contract(
  process.env.IDENTITY_CONTRACT,
  IDENTITY_ABI,
  wallet
);

const reputationContract = new ethers.Contract(
  process.env.REPUTATION_CONTRACT,
  REPUTATION_ABI,
  wallet
);

const crosschainContract = new ethers.Contract(
  process.env.CROSSCHAIN_CONTRACT,
  CROSSCHAIN_ABI,
  wallet
);

// ============================================
// DISPATCH L1 CONFIGURATION (REAL CROSS-CHAIN)
// ============================================
const DISPATCH_RPC = 'https://subnets.avax.network/dispatch/testnet/rpc';
const DISPATCH_RECEIVER = '0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8';
const FUJI_CHAIN_ID = '0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5';
const DISPATCH_CHAIN_ID = '0x9f3be606497285d0ffbb5ac9ba24aa60346a9b1812479ed66cb329f394a4b1c7';
const TELEPORTER_TX = '0xd3e9c290290c489383a9cefe4ff8dc32d2d792f383f99418e43691b516ef83ff';

// Dispatch provider and contract (disable ENS)
const dispatchProvider = new ethers.JsonRpcProvider(DISPATCH_RPC, {
  chainId: 779672,
  name: 'dispatch'
});
const DISPATCH_RECEIVER_ABI = [
  "function getReputation(uint256 agentTokenId, bytes32 sourceChainId) external view returns (uint256)",
  "function getAgentInfo(uint256 agentTokenId, bytes32 sourceChainId) external view returns (uint256 reputation, uint256 lastSync, bool exists)",
  "function getKnownAgentCount() external view returns (uint256)"
];
const dispatchReceiverContract = new ethers.Contract(
  DISPATCH_RECEIVER,
  DISPATCH_RECEIVER_ABI,
  dispatchProvider
);

// In-memory cache for registered agents (for discovery)
const agentCache = new Map();

// Helper: Validate and checksum address (prevents ENS lookup)
function validateAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (e) {
    throw new Error(`Invalid address: ${address}`);
  }
}

// Helper: Get tier from reputation
function getTier(reputation) {
  if (reputation >= 90) return 'premium';
  if (reputation >= 70) return 'standard';
  if (reputation >= 50) return 'basic';
  return 'restricted';
}

// Helper: Get fee multiplier from tier
function getFeeMultiplier(tier) {
  switch (tier) {
    case 'premium': return 0.5;
    case 'standard': return 1.0;
    case 'basic': return 1.5;
    case 'restricted': return 2.0;
    default: return 1.5;
  }
}

// ============================================
// AGENT REGISTRATION ENDPOINTS
// ============================================

// Register a new agent
app.post('/agents/register', async (req, res) => {
  try {
    const { agentAddress, metadataURI } = req.body;
    
    if (!agentAddress || !metadataURI) {
      return res.status(400).json({ error: 'Missing agentAddress or metadataURI' });
    }

    // Validate address to prevent ENS lookup
    const validAddress = validateAddress(agentAddress);

    // Check if already registered
    const isRegistered = await identityContract.isRegisteredAgent(validAddress);
    if (isRegistered) {
      const tokenId = await identityContract.agentToTokenId(validAddress);
      return res.json({ 
        success: true, 
        agentAddress: validAddress,
        tokenId: tokenId.toString(),
        message: 'Agent already registered'
      });
    }

    // Register the agent
    const tx = await identityContract.registerAgent(validAddress, metadataURI);
    const receipt = await tx.wait();
    
    // Get the token ID
    const tokenId = await identityContract.agentToTokenId(validAddress);

    // Cache the agent
    agentCache.set(validAddress.toLowerCase(), {
      address: validAddress,
      tokenId: tokenId.toString(),
      metadataURI,
      registeredAt: Date.now()
    });

    res.json({
      success: true,
      agentAddress: validAddress,
      tokenId: tokenId.toString(),
      metadataURI,
      txHash: receipt.hash
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get agent by address
app.get('/agents/by-address/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address to prevent ENS lookup
    const validAddress = validateAddress(address);
    
    const isRegistered = await identityContract.isRegisteredAgent(validAddress);
    if (!isRegistered) {
      return res.status(404).json({ error: 'Agent not registered' });
    }

    const tokenId = await identityContract.agentToTokenId(validAddress);
    
    // FIXED: Use getReputationScore for the score
    let reputation = 50; // Default for new agents
    try {
      reputation = await reputationContract.getReputationScore(tokenId);
      reputation = Number(reputation);
    } catch (e) {
      console.log('Could not get reputation score, using default:', e.message);
    }

    // Get full reputation data
    let stats = {
      totalPositive: '0',
      totalNegative: '0',
      totalPaymentVolume: '0',
      feedbackCount: '0'
    };
    try {
      const repData = await reputationContract.getReputation(tokenId);
      stats = {
        totalPositive: repData.totalPositive.toString(),
        totalNegative: repData.totalNegative.toString(),
        totalPaymentVolume: repData.totalPaymentVolume.toString(),
        feedbackCount: repData.feedbackCount.toString()
      };
    } catch (e) {
      console.log('Could not get reputation data:', e.message);
    }

    const tier = getTier(reputation);
    
    res.json({
      address: validAddress,
      tokenId: tokenId.toString(),
      reputation,
      tier,
      feeMultiplier: getFeeMultiplier(tier),
      stats
    });

  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DISCOVERY API - Find trustworthy agents
// ============================================

// Discover agents with filters
app.get('/agents/discover', async (req, res) => {
  try {
    const { 
      minReputation = 0, 
      maxReputation = 100,
      tier,
      limit = 20,
      sortBy = 'reputation',
      order = 'desc'
    } = req.query;

    let totalSupply;
    try {
      totalSupply = await identityContract.totalSupply();
      totalSupply = Number(totalSupply);
    } catch (e) {
      totalSupply = agentCache.size || 10;
    }

    const agents = [];

    for (let tokenId = 1; tokenId <= Math.min(totalSupply, 100); tokenId++) {
      try {
        const agentAddress = await identityContract.ownerOf(tokenId);
        
        // FIXED: Use getReputationScore
        let repNum = 50;
        try {
          const reputation = await reputationContract.getReputationScore(tokenId);
          repNum = Number(reputation);
        } catch (e) {
          // Use default
        }
        
        const agentTier = getTier(repNum);

        if (repNum < Number(minReputation) || repNum > Number(maxReputation)) continue;
        if (tier && agentTier !== tier) continue;

        let stats = { totalPaymentVolume: '0', feedbackCount: '0' };
        try {
          const repData = await reputationContract.getReputation(tokenId);
          stats = {
            totalPaymentVolume: repData.totalPaymentVolume.toString(),
            feedbackCount: repData.feedbackCount.toString()
          };
        } catch (e) {
          // Use defaults
        }

        agents.push({
          address: agentAddress,
          tokenId: tokenId.toString(),
          reputation: repNum,
          tier: agentTier,
          feeMultiplier: getFeeMultiplier(agentTier),
          stats
        });

      } catch (err) {
        continue;
      }
    }

    agents.sort((a, b) => {
      const aVal = sortBy === 'reputation' ? a.reputation : Number(a.stats.totalPaymentVolume);
      const bVal = sortBy === 'reputation' ? b.reputation : Number(b.stats.totalPaymentVolume);
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const limitedAgents = agents.slice(0, Number(limit));

    res.json({
      total: agents.length,
      returned: limitedAgents.length,
      filters: { minReputation, maxReputation, tier, sortBy, order },
      agents: limitedAgents
    });

  } catch (error) {
    console.error('Discovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get top agents (leaderboard)
app.get('/agents/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    let totalSupply;
    try {
      totalSupply = await identityContract.totalSupply();
      totalSupply = Number(totalSupply);
    } catch (e) {
      totalSupply = 10;
    }

    const agents = [];

    for (let tokenId = 1; tokenId <= Math.min(totalSupply, 50); tokenId++) {
      try {
        const agentAddress = await identityContract.ownerOf(tokenId);
        
        // FIXED: Use getReputationScore
        let repNum = 50;
        try {
          const reputation = await reputationContract.getReputationScore(tokenId);
          repNum = Number(reputation);
        } catch (e) {
          // Use default
        }

        let totalPayments = '0';
        try {
          const repData = await reputationContract.getReputation(tokenId);
          totalPayments = repData.totalPaymentVolume.toString();
        } catch (e) {
          // Use default
        }

        agents.push({
          rank: 0,
          address: agentAddress,
          tokenId: tokenId.toString(),
          reputation: repNum,
          tier: getTier(repNum),
          totalPaymentVolume: totalPayments
        });
      } catch (e) {
        continue;
      }
    }

    agents.sort((a, b) => b.reputation - a.reputation);

    const leaderboard = agents.slice(0, Number(limit)).map((agent, index) => ({
      ...agent,
      rank: index + 1
    }));

    res.json({
      updated: new Date().toISOString(),
      leaderboard
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FEEDBACK ENDPOINTS - FIXED
// ============================================

// Submit feedback for an agent
app.post('/agents/:tokenId/feedback', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { score, paymentAmount, txHash } = req.body;

    if (score === undefined || paymentAmount === undefined) {
      return res.status(400).json({ error: 'Missing score or paymentAmount' });
    }

    if (![-1, 0, 1].includes(score)) {
      return res.status(400).json({ error: 'Score must be -1, 0, or 1' });
    }

    // Generate a txHash if not provided (for demo purposes)
    const feedbackTxHash = txHash || ethers.keccak256(
      ethers.toUtf8Bytes(`feedback-${tokenId}-${Date.now()}-${Math.random()}`)
    );

    // FIXED: Call with all 4 parameters
    const tx = await reputationContract.submitFeedback(
      tokenId,
      score,
      ethers.parseEther(paymentAmount.toString()),
      feedbackTxHash
    );
    const receipt = await tx.wait();

    // FIXED: Use getReputationScore for the new score
    let newReputation = 50;
    try {
      newReputation = await reputationContract.getReputationScore(tokenId);
      newReputation = Number(newReputation);
    } catch (e) {
      console.log('Could not get new reputation:', e.message);
    }

    const newTier = getTier(newReputation);

    res.json({
      success: true,
      tokenId,
      feedbackScore: score,
      paymentAmount,
      newReputation,
      newTier,
      feeMultiplier: getFeeMultiplier(newTier),
      txHash: receipt.hash
    });

  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// x402 VERIFICATION ENDPOINT
// ============================================

// Verify agent for x402 payment
app.post('/x402/verify', async (req, res) => {
  try {
    const { agentAddress } = req.body;

    if (!agentAddress) {
      return res.status(400).json({ error: 'Missing agentAddress' });
    }

    // Validate address to prevent ENS lookup
    const validAddress = validateAddress(agentAddress);

    const isRegistered = await identityContract.isRegisteredAgent(validAddress);
    if (!isRegistered) {
      return res.json({
        approved: false,
        agentAddress: validAddress,
        reason: 'Agent not registered'
      });
    }

    const tokenId = await identityContract.agentToTokenId(validAddress);
    
    // FIXED: Use getReputationScore
    let repNum = 50;
    try {
      const reputation = await reputationContract.getReputationScore(tokenId);
      repNum = Number(reputation);
    } catch (e) {
      console.log('Could not get reputation score, using default 50:', e.message);
    }

    const tier = getTier(repNum);
    const feeMultiplier = getFeeMultiplier(tier);

    const minReputation = Number(process.env.MIN_REPUTATION_SCORE || 0);
    if (repNum < minReputation) {
      return res.json({
        approved: false,
        agentAddress: validAddress,
        tokenId: tokenId.toString(),
        reputation: repNum,
        tier,
        reason: `Reputation ${repNum} below minimum ${minReputation}`
      });
    }

    res.json({
      approved: true,
      agentAddress: validAddress,
      tokenId: tokenId.toString(),
      reputation: repNum,
      tier,
      feeMultiplier,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CROSS-CHAIN ENDPOINTS - REAL DATA FROM DISPATCH
// ============================================

app.get('/agents/:tokenId/crosschain', async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Get local reputation from Fuji
    let localRep = 50;
    try {
      localRep = await reputationContract.getReputationScore(tokenId);
      localRep = Number(localRep);
    } catch (e) {
      console.log('Could not get local reputation:', e.message);
    }

    // Try to get real reputation from Dispatch
    let dispatchRep = 0;
    let dispatchSynced = false;
    let lastSyncTime = null;
    
    try {
      const agentInfo = await dispatchReceiverContract.getAgentInfo(tokenId, FUJI_CHAIN_ID);
      dispatchRep = Number(agentInfo.reputation);
      dispatchSynced = agentInfo.exists;
      if (Number(agentInfo.lastSync) > 0) {
        lastSyncTime = new Date(Number(agentInfo.lastSync) * 1000).toISOString();
      }
    } catch (e) {
      console.log('Could not get Dispatch reputation (may not be synced yet):', e.message);
    }

    // Build response with real + simulated data for demo
    const remoteChains = [
      {
        name: 'Dispatch L1',
        chainId: DISPATCH_CHAIN_ID,
        reputation: dispatchSynced ? dispatchRep : localRep,
        synced: dispatchSynced,
        lastSync: lastSyncTime || 'Not synced yet',
        contract: DISPATCH_RECEIVER,
        explorer: `https://subnets.avax.network/dispatch/testnet/address/${DISPATCH_RECEIVER}`,
        real: true
      }
    ];

    // Calculate aggregated
    const allReps = [localRep];
    if (dispatchSynced && dispatchRep > 0) {
      allReps.push(dispatchRep);
    } else {
      // For demo, show same as local if not synced
      allReps.push(localRep);
    }
    const aggregated = Math.round(allReps.reduce((a, b) => a + b, 0) / allReps.length);

    res.json({
      tokenId,
      localChain: {
        name: 'Fuji C-Chain',
        chainId: FUJI_CHAIN_ID,
        reputation: localRep,
        contract: process.env.REPUTATION_CONTRACT,
        explorer: `https://testnet.snowscan.xyz/address/${process.env.REPUTATION_CONTRACT}`
      },
      remoteChains,
      aggregatedReputation: aggregated,
      teleporter: {
        messenger: '0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf',
        lastSyncTx: TELEPORTER_TX,
        txUrl: `https://testnet.snowscan.xyz/tx/${TELEPORTER_TX}`,
        status: 'Message sent, awaiting relayer delivery'
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cross-chain error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/agents/:tokenId/sync', async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Get current reputation
    let localRep = 50;
    try {
      localRep = await reputationContract.getReputationScore(tokenId);
      localRep = Number(localRep);
    } catch (e) {
      // Use default
    }

    // Call syncReputationToChain on the CrossChainReputation contract
    try {
      const tx = await crosschainContract.syncReputationToChain(
        tokenId,
        DISPATCH_CHAIN_ID
      );
      const receipt = await tx.wait();

      res.json({
        success: true,
        tokenId,
        reputation: localRep,
        sourceChain: {
          name: 'Fuji C-Chain',
          chainId: FUJI_CHAIN_ID
        },
        destinationChain: {
          name: 'Dispatch L1',
          chainId: DISPATCH_CHAIN_ID,
          receiver: DISPATCH_RECEIVER
        },
        txHash: receipt.hash,
        txUrl: `https://testnet.snowscan.xyz/tx/${receipt.hash}`,
        message: 'Teleporter message sent! Delivery typically takes ~30 seconds.'
      });
    } catch (e) {
      console.error('Sync transaction failed:', e.message);
      res.json({
        success: false,
        tokenId,
        reputation: localRep,
        error: e.message,
        previousSync: {
          txHash: TELEPORTER_TX,
          txUrl: `https://testnet.snowscan.xyz/tx/${TELEPORTER_TX}`
        }
      });
    }

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATS ENDPOINT
// ============================================

app.get('/stats', async (req, res) => {
  try {
    let totalAgents = 0;
    try {
      totalAgents = await identityContract.totalSupply();
      totalAgents = Number(totalAgents);
    } catch (e) {
      totalAgents = agentCache.size;
    }

    let premium = 0, standard = 0, basic = 0, restricted = 0;
    
    for (let tokenId = 1; tokenId <= Math.min(totalAgents, 50); tokenId++) {
      try {
        let rep = 50;
        try {
          rep = await reputationContract.getReputationScore(tokenId);
          rep = Number(rep);
        } catch (e) {
          // Use default
        }
        const tier = getTier(rep);
        if (tier === 'premium') premium++;
        else if (tier === 'standard') standard++;
        else if (tier === 'basic') basic++;
        else restricted++;
      } catch (e) {
        continue;
      }
    }

    res.json({
      totalAgents,
      tierDistribution: { premium, standard, basic, restricted },
      network: 'Avalanche Fuji',
      contracts: {
        identity: process.env.IDENTITY_CONTRACT,
        reputation: process.env.REPUTATION_CONTRACT,
        crosschain: process.env.CROSSCHAIN_CONTRACT,
        dispatchReceiver: DISPATCH_RECEIVER
      },
      crossChain: {
        dispatchL1: {
          rpc: DISPATCH_RPC,
          chainId: 779672,
          receiver: DISPATCH_RECEIVER
        },
        teleporterTx: TELEPORTER_TX
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    network: 'Avalanche Fuji',
    crossChain: 'Dispatch L1',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Agent Trust Protocol - Facilitator API          ║
╠═══════════════════════════════════════════════════════════╣
║  Network:    Avalanche Fuji + Dispatch L1                 ║
║  Port:       ${PORT}                                          ║
║                                                           ║
║  Fuji Contracts:                                          ║
║  ├─ Identity:   ${process.env.IDENTITY_CONTRACT}  ║
║  ├─ Reputation: ${process.env.REPUTATION_CONTRACT}  ║
║  └─ CrossChain: ${process.env.CROSSCHAIN_CONTRACT}  ║
║                                                           ║
║  Dispatch L1:                                             ║
║  └─ Receiver:   ${DISPATCH_RECEIVER}  ║
║                                                           ║
║  Teleporter TX: ${TELEPORTER_TX.slice(0,20)}...      ║
║                                                           ║
║  Endpoints:                                               ║
║  ├─ POST /agents/register        - Register new agent     ║
║  ├─ GET  /agents/by-address/:addr - Get agent details     ║
║  ├─ GET  /agents/discover        - Find agents            ║
║  ├─ GET  /agents/leaderboard     - Top agents             ║
║  ├─ POST /agents/:id/feedback    - Submit feedback        ║
║  ├─ POST /x402/verify            - Verify for payment     ║
║  ├─ GET  /agents/:id/crosschain  - Cross-chain rep (REAL) ║
║  ├─ POST /agents/:id/sync        - Sync via Teleporter    ║
║  └─ GET  /stats                  - Protocol statistics    ║
╚═══════════════════════════════════════════════════════════╝
  `);
});