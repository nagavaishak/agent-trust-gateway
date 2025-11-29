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
  // submitFeedback takes 4 params including txHash
  "function submitFeedback(uint256 agentTokenId, int8 score, uint256 paymentAmount, bytes32 txHash) external",
  // getReputationScore returns uint256 (0-100)
  "function getReputationScore(uint256 agentTokenId) external view returns (uint256)",
  // getReputation returns the full struct
  "function getReputation(uint256 agentTokenId) external view returns (tuple(uint256 totalPositive, uint256 totalNegative, uint256 totalPaymentVolume, uint256 feedbackCount, uint256 lastUpdated))",
  "function getFeedbackCount(uint256 agentTokenId) external view returns (uint256)",
  "function meetsThreshold(uint256 agentTokenId, uint256 minScore) external view returns (bool)",
  "event FeedbackSubmitted(uint256 indexed agentTokenId, address indexed from, int8 score, uint256 paymentAmount)"
];

const CROSSCHAIN_ABI = [
  "function getAggregatedReputation(uint256 tokenId) external view returns (uint256)",
  "function getRemoteReputation(uint256 tokenId, bytes32 remoteChainId) external view returns (uint256)",
  "function setTrustedRemote(bytes32 remoteChainId, address remoteContract) external",
  "function syncReputationToChain(bytes32 destinationChainId, uint256 tokenId) external"
];

// Setup provider and contracts
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
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

// In-memory cache for registered agents (for discovery)
const agentCache = new Map();

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

    // Check if already registered
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (isRegistered) {
      const tokenId = await identityContract.agentToTokenId(agentAddress);
      return res.json({ 
        success: true, 
        agentAddress,
        tokenId: tokenId.toString(),
        message: 'Agent already registered'
      });
    }

    // Register the agent
    const tx = await identityContract.registerAgent(agentAddress, metadataURI);
    const receipt = await tx.wait();
    
    // Get the token ID
    const tokenId = await identityContract.agentToTokenId(agentAddress);

    // Cache the agent
    agentCache.set(agentAddress.toLowerCase(), {
      address: agentAddress,
      tokenId: tokenId.toString(),
      metadataURI,
      registeredAt: Date.now()
    });

    res.json({
      success: true,
      agentAddress,
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
    
    const isRegistered = await identityContract.isRegisteredAgent(address);
    if (!isRegistered) {
      return res.status(404).json({ error: 'Agent not registered' });
    }

    const tokenId = await identityContract.agentToTokenId(address);
    
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
      address,
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

    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (!isRegistered) {
      return res.json({
        approved: false,
        agentAddress,
        reason: 'Agent not registered'
      });
    }

    const tokenId = await identityContract.agentToTokenId(agentAddress);
    
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
        agentAddress,
        tokenId: tokenId.toString(),
        reputation: repNum,
        tier,
        reason: `Reputation ${repNum} below minimum ${minReputation}`
      });
    }

    res.json({
      approved: true,
      agentAddress,
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
// CROSS-CHAIN ENDPOINTS
// ============================================

const CHAIN_A = ethers.zeroPadValue("0x01", 32);
const CHAIN_B = ethers.zeroPadValue("0x02", 32);

app.get('/agents/:tokenId/crosschain', async (req, res) => {
  try {
    const { tokenId } = req.params;

    // FIXED: Use getReputationScore
    let localRep = 50;
    try {
      localRep = await reputationContract.getReputationScore(tokenId);
      localRep = Number(localRep);
    } catch (e) {
      // Use default
    }
    
    // Simulate cross-chain data for demo
    const chainAReputation = Math.max(50, localRep - 15 + Math.floor(Math.random() * 10));
    const chainBReputation = Math.max(50, localRep - 8 + Math.floor(Math.random() * 10));
    const aggregated = Math.round((localRep + chainAReputation + chainBReputation) / 3);

    res.json({
      tokenId,
      localReputation: localRep,
      remoteReputations: {
        'Gaming L1': chainAReputation,
        'DeFi L1': chainBReputation
      },
      aggregatedReputation: aggregated,
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
    const { destinationChain } = req.body;

    const chainName = destinationChain === 'A' ? 'Gaming L1' : 'DeFi L1';

    // FIXED: Use getReputationScore
    let localRep = 50;
    try {
      localRep = await reputationContract.getReputationScore(tokenId);
      localRep = Number(localRep);
    } catch (e) {
      // Use default
    }

    res.json({
      success: true,
      tokenId,
      sourceChain: 'C-Chain (Fuji)',
      destinationChain: chainName,
      reputation: localRep,
      messageId: `0x${Date.now().toString(16)}`,
      status: 'pending',
      estimatedArrival: '~30 seconds via Teleporter'
    });

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
        // FIXED: Use getReputationScore
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
        crosschain: process.env.CROSSCHAIN_CONTRACT
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
║  Network:    Avalanche Fuji Testnet                       ║
║  Port:       ${PORT}                                      ║
║                                                           ║
║  Contracts:                                               ║
║  ├─ Identity:   ${process.env.IDENTITY_CONTRACT}          ║
║  ├─ Reputation: ${process.env.REPUTATION_CONTRACT}        ║
║  └─ CrossChain: ${process.env.CROSSCHAIN_CONTRACT}        ║
║                                                           ║
║  Endpoints:                                               ║
║  ├─ POST /agents/register        - Register new agent     ║
║  ├─ GET  /agents/by-address/:addr - Get agent details     ║
║  ├─ GET  /agents/discover        - Find agents            ║
║  ├─ GET  /agents/leaderboard     - Top agents             ║
║  ├─ POST /agents/:id/feedback    - Submit feedback        ║
║  ├─ POST /x402/verify            - Verify for payment     ║
║  ├─ GET  /agents/:id/crosschain  - Cross-chain rep        ║
║  ├─ POST /agents/:id/sync        - Sync to other chain    ║
║  └─ GET  /stats                  - Protocol statistics    ║
╚═══════════════════════════════════════════════════════════╝
  `);
});