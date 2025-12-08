/**
 * AgentTrust Gateway Demo Server
 * 
 * Demonstrates the gateway protecting an x402 API endpoint
 * with staking, reputation, risk scoring, and dynamic pricing.
 */

const express = require('express');
const cors = require('cors');
const { AgentTrust } = require('./gateway');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// GATEWAY CONFIGURATION
// ============================================

const GATEWAY_CONFIG = {
  // Contract addresses (Fuji testnet) - Day 3 deployments
  contracts: {
    agentRegistry: process.env.AGENT_REGISTRY_NEW || '0xea5D764e8967b761A2Ad0817eDad81381cc6cF12',
    stakingModule: process.env.STAKING_MODULE || '0x1873A4ba044e8a2c99031A851b043aC13476F0ED',
    reputationEngine: process.env.REPUTATION_ENGINE || '0xbcFC99A4391544Baa65Df5874D7b001FFA3BA9A1',
    jobLogger: process.env.JOB_LOGGER || '0x05C419d5E7070dD57613dF5dBCE1b7d3F5B3dCd2'
  },
  rpcUrl: process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
  payToAddress: process.env.PAY_TO || '0x9263c9114a3c9192fac7890067369a656075a114'
};

// Create gateway instance
const gateway = AgentTrust.createGateway(GATEWAY_CONFIG);

// ============================================
// PROTECTED ENDPOINTS
// ============================================

/**
 * GPT-4 Inference - Premium tier
 * High stake requirement, high reputation requirement
 */
app.post('/api/gpt4',
  AgentTrust.protect({
    ...GATEWAY_CONFIG,
    minStake: 1000000000000000000n, // 1 AVAX
    minScore: 80,
    basePrice: 0.05,
    riskMultiplier: 'dynamic',
    powDifficulty: 0 // No PoW for demo
  }),
  (req, res) => {
    const { prompt } = req.body;
    
    res.json({
      success: true,
      result: `GPT-4 Analysis: "${prompt || 'No prompt provided'}". Based on advanced reasoning, the market shows bullish signals with 82% confidence.`,
      model: 'gpt-4-turbo',
      tokensUsed: 1247,
      trust: req.agentTrust
    });
  }
);

/**
 * Claude Inference - Standard tier
 * Medium requirements
 */
app.post('/api/claude',
  AgentTrust.protect({
    ...GATEWAY_CONFIG,
    minStake: 100000000000000000n, // 0.1 AVAX
    minScore: 50,
    basePrice: 0.02,
    riskMultiplier: 'dynamic'
  }),
  (req, res) => {
    const { prompt } = req.body;
    
    res.json({
      success: true,
      result: `Claude Analysis: Processing "${prompt || 'query'}". I've analyzed the data and found 3 key insights.`,
      model: 'claude-3-sonnet',
      tokensUsed: 856,
      trust: req.agentTrust
    });
  }
);

/**
 * Basic Data Feed - Open tier
 * No minimum requirements, just dynamic pricing
 */
app.get('/api/data-feed',
  AgentTrust.protect({
    ...GATEWAY_CONFIG,
    minStake: 0,
    minScore: 0,
    basePrice: 0.001,
    riskMultiplier: 'dynamic'
  }),
  (req, res) => {
    res.json({
      success: true,
      data: {
        btc: 98234.50 + Math.random() * 1000,
        eth: 3456.78 + Math.random() * 100,
        avax: 42.34 + Math.random() * 5,
        timestamp: new Date().toISOString()
      },
      trust: req.agentTrust
    });
  }
);

/**
 * Premium Agent Discovery - Staked agents only
 */
app.get('/api/discover',
  AgentTrust.protect({
    ...GATEWAY_CONFIG,
    minStake: 500000000000000000n, // 0.5 AVAX
    minScore: 70,
    basePrice: 0.01,
    blockUnstaked: true
  }),
  (req, res) => {
    res.json({
      success: true,
      agents: [
        { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', reputation: 100, specialty: 'DeFi' },
        { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', reputation: 85, specialty: 'NFTs' },
        { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', reputation: 72, specialty: 'Gaming' }
      ],
      trust: req.agentTrust
    });
  }
);

// ============================================
// FREE ENDPOINTS (Info & Health)
// ============================================

/**
 * Get pricing info for an agent
 */
app.get('/api/pricing', async (req, res) => {
  const agentAddress = req.query.agent;
  
  // Get agent data
  let agentData = {
    address: agentAddress,
    reputation: 50,
    stake: 0,
    riskScore: 0,
    isNew: true
  };
  
  if (agentAddress) {
    try {
      const tokenId = await gateway.contracts.getAgentTokenId(agentAddress);
      if (tokenId) {
        agentData.tokenId = tokenId.toString();
        agentData.reputation = await gateway.contracts.getReputationScore(tokenId);
        const stake = await gateway.contracts.getStake(tokenId);
        agentData.stake = stake ? stake.toString() : '0';
        agentData.stakeNum = Number(stake || 0);
        agentData.isNew = false;
      }
      agentData.riskScore = gateway.riskEngine.calculateRisk(agentAddress);
    } catch (e) {
      console.error('Error fetching agent data:', e.message);
    }
  }
  
  // Calculate pricing for each tier (use stakeNum for calculations)
  const pricingData = { ...agentData, stake: agentData.stakeNum || 0 };
  const tiers = {
    gpt4: { basePrice: 0.05, minStake: '1 AVAX', minScore: 80 },
    claude: { basePrice: 0.02, minStake: '0.1 AVAX', minScore: 50 },
    dataFeed: { basePrice: 0.001, minStake: '0', minScore: 0 },
    discover: { basePrice: 0.01, minStake: '0.5 AVAX', minScore: 70 }
  };
  
  const pricing = {};
  for (const [tier, config] of Object.entries(tiers)) {
    const { PricingEngine } = require('./gateway');
    pricing[tier] = {
      ...config,
      ...PricingEngine.calculatePrice(config.basePrice, pricingData)
    };
  }
  
  res.json({
    agent: agentData,
    pricing,
    gateway: {
      version: '1.0.0',
      network: 'avalanche-fuji',
      contracts: GATEWAY_CONFIG.contracts
    }
  });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'agent-trust-gateway',
    version: '1.0.0',
    network: 'avalanche-fuji',
    timestamp: new Date().toISOString()
  });
});

/**
 * Gateway stats
 */
app.get('/api/stats', (req, res) => {
  res.json({
    requestsProcessed: gateway.riskEngine.requestHistory.size,
    blockedAgents: Array.from(gateway.riskEngine.abuseFlags.keys()).length,
    activeMacaroons: 'N/A', // Would need to track
    uptime: process.uptime()
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.GATEWAY_PORT || 4022;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              AgentTrust Gateway - Demo Server                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Network:     Avalanche Fuji Testnet                          ║
║  Port:        ${PORT}                                             ║
║                                                               ║
║  PROTECTED Endpoints (require trust + payment):               ║
║  ├─ POST /api/gpt4      - Premium ($0.05, 80+ rep, 1 AVAX)   ║
║  ├─ POST /api/claude    - Standard ($0.02, 50+ rep, 0.1 AVAX)║
║  ├─ GET  /api/data-feed - Open ($0.001, dynamic pricing)     ║
║  └─ GET  /api/discover  - Staked only ($0.01, 70+ rep)       ║
║                                                               ║
║  FREE Endpoints:                                              ║
║  ├─ GET  /api/pricing   - Get pricing for an agent           ║
║  ├─ GET  /api/stats     - Gateway statistics                 ║
║  └─ GET  /health        - Health check                       ║
║                                                               ║
║  Features:                                                    ║
║  ✓ Dynamic risk-based pricing                                 ║
║  ✓ Reputation requirements                                    ║
║  ✓ Stake verification                                         ║
║  ✓ Macaroon session tokens                                    ║
║  ✓ PoW anti-DDoS (optional)                                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
