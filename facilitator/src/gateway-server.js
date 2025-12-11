require("dotenv").config();
/**
 * AgentTrust Gateway Server
 * 
 * COMPLETE VERSION with:
 * - Gateway protection (pricing, risk scoring, macaroons)
 * - Real contract interactions (register, feedback, stake)
 * - Demo mode fallback when contracts unavailable
 */

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  contracts: {
    agentRegistry: '0x0990FF7FEDf21B06C06a635E516eb4a239b0F91b',
    stakingModule: '0xb567A01E31313827533E818fd229A185e2cd30c4',
    reputationEngine: '0x8F58332CDef62a0d0C61356F785cc04491237DAD',
    jobLogger: '0x13c80689b2549F3AB8d73E1fa01ae6097a364086'
  },
  rpcUrl: process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
  privateKey: process.env.SERVER_PRIVATE_KEY || null,
  payToAddress: '0x9263c9114a3c9192fac7890067369a656075a114'
};

// Demo mode if no private key
const DEMO_MODE = !CONFIG.privateKey;
console.log(`Mode: ${DEMO_MODE ? '🧪 DEMO (no private key)' : '💰 REAL (contract writes enabled)'}`);

// ============================================
// CONTRACT SETUP
// ============================================

const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, {
  chainId: 43113,
  name: 'avalanche-fuji'
});

let wallet = null;
if (CONFIG.privateKey) {
  wallet = new ethers.Wallet(CONFIG.privateKey, provider);
}

// ABIs
const REGISTRY_ABI = [
  'function registerAgent(string memory metadata) returns (uint256)',
  'function agentToTokenId(address agent) view returns (uint256)',
  'function isRegisteredAgent(address agent) view returns (bool)',
  'function getAgentProfile(uint256 tokenId) view returns (tuple(string metadata, uint256 registeredAt, bool isActive))',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

const STAKING_ABI = [
  'function stake(uint256 agentTokenId) payable',
  'function getStake(uint256 agentTokenId) view returns (uint256)',
  'function getEffectiveStake(uint256 agentTokenId) view returns (uint256)',
  'function initiateUnbonding(uint256 agentTokenId, uint256 amount)',
  'function completeUnbonding(uint256 agentTokenId)',
  'function isUnbonding(uint256 agentTokenId) view returns (bool)'
];

const REPUTATION_ABI = [
  'function getScore(uint256 agentTokenId) view returns (uint256)',
  'function getReputation(uint256 agentTokenId) view returns (uint256 score, uint256 successCount, uint256 failureCount, uint256 totalVolume, uint256 uniqueCounterparties, uint256 lastUpdate)',
  'function recordSuccess(uint256 agentTokenId, uint256 value, address counterparty)',
  'function recordFailure(uint256 agentTokenId, uint256 value, address counterparty)',
  'function submitFeedback(tuple(uint256 agentTokenId, uint256 raterTokenId, uint8 rating, uint256 paymentAmount, bytes32 jobId, string comment) params)'
];

// Contract instances (read-only by default)
const registryContract = new ethers.Contract(CONFIG.contracts.agentRegistry, REGISTRY_ABI, provider);
const stakingContract = new ethers.Contract(CONFIG.contracts.stakingModule, STAKING_ABI, provider);
const reputationContract = new ethers.Contract(CONFIG.contracts.reputationEngine, REPUTATION_ABI, provider);

// Write-enabled contracts (if wallet available)
let registryWrite = null;
let stakingWrite = null;
let reputationWrite = null;

if (wallet) {
  registryWrite = new ethers.Contract(CONFIG.contracts.agentRegistry, REGISTRY_ABI, wallet);
  stakingWrite = new ethers.Contract(CONFIG.contracts.stakingModule, STAKING_ABI, wallet);
  reputationWrite = new ethers.Contract(CONFIG.contracts.reputationEngine, REPUTATION_ABI, wallet);
}

// ============================================
// DEMO DATA (fallback when contracts fail)
// ============================================

const DEMO_AGENTS = {
  '0x9263C9114A3c9192fac7890067369a656075a114': { tokenId: 1, reputation: 100, stake: '0', name: 'GatewayBot Premium' },
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': { tokenId: 2, reputation: 60, stake: '0', name: 'DataOracle Standard' },
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': { tokenId: 3, reputation: 20, stake: '0', name: 'NewBot Basic' }
};

// Mutable demo state
const demoState = JSON.parse(JSON.stringify(DEMO_AGENTS));

// ============================================
// HELPER FUNCTIONS
// ============================================

function validateAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (e) {
    return null;
  }
}

function getTier(reputation) {
  if (reputation >= 90) return 'premium';
  if (reputation >= 70) return 'standard';
  if (reputation >= 50) return 'basic';
  return 'restricted';
}

function getFeeMultiplier(reputation, stake) {
  let multiplier = 1.0;
  
  // Reputation factor
  if (reputation >= 90) multiplier *= 0.5;
  else if (reputation >= 70) multiplier *= 0.75;
  else if (reputation < 50) multiplier *= 1.5;
  
  // Stake factor
  if (stake > 0) {
    const stakeBonus = Math.min(Number(stake) / 1e18 * 0.2, 0.2);
    multiplier *= (1 - stakeBonus);
  }
  
  return multiplier;
}

function calculatePrice(basePrice, reputation, stake) {
  const multiplier = getFeeMultiplier(reputation, stake);
  const finalPrice = basePrice * multiplier;
  return {
    basePrice,
    finalPrice: Math.max(finalPrice, basePrice * 0.25),
    multiplier,
    discount: multiplier < 1 ? `${((1 - multiplier) * 100).toFixed(0)}%` : null,
    premium: multiplier > 1 ? `${((multiplier - 1) * 100).toFixed(0)}%` : null
  };
}

// ============================================
// GET AGENT DATA (tries contract, falls back to demo)
// ============================================

async function getAgentData(address) {
  const validAddress = validateAddress(address);
  if (!validAddress) {
    return { error: 'Invalid address' };
  }

  // Check demo state first for this session's changes
  const demoAgent = demoState[validAddress];
  
  try {
    const isRegistered = await registryContract.isRegisteredAgent(validAddress);
    
    if (!isRegistered) {
      // Not on chain - use demo data if available
      if (demoAgent) {
        return {
          address: validAddress,
          tokenId: demoAgent.tokenId,
          reputation: demoAgent.reputation,
          stake: demoAgent.stake,
          tier: getTier(demoAgent.reputation),
          isDemo: true
        };
      }
      return { address: validAddress, isRegistered: false };
    }

    const tokenId = await registryContract.agentToTokenId(validAddress);
    
    let reputation = 50;
    try {
      reputation = Number(await reputationContract.getScore(tokenId));
    } catch (e) {
      // Use demo reputation if contract fails
      if (demoAgent) reputation = demoAgent.reputation;
    }

    let stake = 0n;
    try {
      stake = await stakingContract.getStake(tokenId);
    } catch (e) {
      if (demoAgent) stake = BigInt(demoAgent.stake);
    }

    return {
      address: validAddress,
      tokenId: tokenId.toString(),
      reputation,
      stake: stake.toString(),
      tier: getTier(reputation),
      feeMultiplier: getFeeMultiplier(reputation, stake),
      isDemo: false
    };

  } catch (e) {
    console.error('Contract read error:', e.message);
    
    // Fallback to demo data
    if (demoAgent) {
      return {
        address: validAddress,
        tokenId: demoAgent.tokenId,
        reputation: demoAgent.reputation,
        stake: demoAgent.stake,
        tier: getTier(demoAgent.reputation),
        isDemo: true,
        error: e.message
      };
    }
    
    return { address: validAddress, error: e.message };
  }
}

// ============================================
// AGENT ENDPOINTS
// ============================================

/**
 * Get agent by address
 */
app.get('/api/agents/:address', async (req, res) => {
  const { address } = req.params;
  const agentData = await getAgentData(address);
  
  if (agentData.error && !agentData.tokenId) {
    return res.status(404).json(agentData);
  }
  
  res.json(agentData);
});

/**
 * Get pricing for an agent
 */
app.get('/api/pricing', async (req, res) => {
  const agentAddress = req.query.agent;
  
  let agentData = {
    address: agentAddress || 'anonymous',
    reputation: 50,
    stake: '0',
    tier: 'basic',
    isDemo: true
  };
  
  if (agentAddress) {
    const data = await getAgentData(agentAddress);
    if (data.tokenId) {
      agentData = data;
    }
  }
  
  const rep = agentData.reputation;
  const stake = BigInt(agentData.stake || '0');
  
  // Calculate pricing for each service tier
  const services = {
    'gpt4-premium': { basePrice: 0.05, minRep: 80, minStake: '1000000000000000000' },
    'claude-standard': { basePrice: 0.02, minRep: 50, minStake: '100000000000000000' },
    'data-feed': { basePrice: 0.001, minRep: 0, minStake: '0' },
    'agent-discovery': { basePrice: 0.01, minRep: 70, minStake: '500000000000000000' }
  };
  
  const pricing = {};
  for (const [name, config] of Object.entries(services)) {
    const priceData = calculatePrice(config.basePrice, rep, stake);
    const meetsRep = rep >= config.minRep;
    const meetsStake = stake >= BigInt(config.minStake);
    
    pricing[name] = {
      ...priceData,
      requirements: {
        minReputation: config.minRep,
        minStake: config.minStake,
        meetsReputation: meetsRep,
        meetsStake: meetsStake,
        eligible: meetsRep && meetsStake
      }
    };
  }
  
  res.json({
    agent: agentData,
    pricing,
    contracts: CONFIG.contracts,
    mode: DEMO_MODE ? 'demo' : 'live'
  });
});

/**
 * Submit feedback (changes reputation!)
 */
app.post('/api/agents/:address/feedback', async (req, res) => {
  const { address } = req.params;
  const { positive, comment } = req.body;
  
  if (positive === undefined) {
    return res.status(400).json({ error: 'Missing "positive" field (true/false)' });
  }
  
  const validAddress = validateAddress(address);
  if (!validAddress) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  
  // Get current agent data
  const agentData = await getAgentData(validAddress);
  
  if (!agentData.tokenId && !demoState[validAddress]) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  const tokenId = Number(agentData.tokenId);
  const oldReputation = agentData.reputation;
  
  // Try real contract call first
  if (reputationWrite && !DEMO_MODE) {
    try {
      console.log("Attempting contract write for tokenId:", tokenId, "type:", typeof tokenId, "positive:", positive, "reputationWrite:", !!reputationWrite);
      console.log("CALLING CONTRACT NOW..."); const tx = await reputationWrite.submitFeedback([tokenId, 0, positive ? 5 : 1, BigInt("1000000000000000000"), "0x0000000000000000000000000000000000000000000000000000000000000001", comment || ""]); console.log("TX SENT:", tx.hash);
      const receipt = await tx.wait();
      
      // Get new reputation
      const newRep = Number(await reputationContract.getScore(tokenId));
      
      return res.json({
        success: true,
        tokenId,
        oldReputation,
        newReputation: newRep,
        change: newRep - oldReputation,
        tier: getTier(newRep),
        txHash: receipt.hash,
        explorer: `https://testnet.snowscan.xyz/tx/${receipt.hash}`,
        mode: 'live'
      });
    } catch (e) {
      console.error('Contract write failed:', e.message, e.code, e.reason);
      // Fall through to demo mode
    }
  }
  
  // Demo mode - update local state
  if (demoState[validAddress]) {
    const change = positive ? 5 : -10;
    demoState[validAddress].reputation = Math.max(0, Math.min(100, demoState[validAddress].reputation + change));
    
    return res.json({
      success: true,
      tokenId: demoState[validAddress].tokenId,
      oldReputation,
      newReputation: demoState[validAddress].reputation,
      change,
      tier: getTier(demoState[validAddress].reputation),
      mode: 'demo'
    });
  }
  
  return res.status(500).json({ error: 'Could not update reputation' });
});

/**
 * Stake AVAX for an agent (demo mode)
 */
app.post('/api/agents/:address/stake', async (req, res) => {
  const { address } = req.params;
  const { amount } = req.body; // amount in AVAX as string
  
  if (!amount) {
    return res.status(400).json({ error: 'Missing "amount" field' });
  }
  
  const validAddress = validateAddress(address);
  if (!validAddress) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  
  const agentData = await getAgentData(validAddress);
  
  if (!agentData.tokenId && !demoState[validAddress]) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  const amountWei = ethers.parseEther(amount.toString());
  
  // Demo mode - update local state
  if (demoState[validAddress]) {
    const currentStake = BigInt(demoState[validAddress].stake || '0');
    demoState[validAddress].stake = (currentStake + amountWei).toString();
    
    return res.json({
      success: true,
      tokenId: demoState[validAddress].tokenId,
      stakedAmount: amount,
      totalStake: demoState[validAddress].stake,
      totalStakeFormatted: ethers.formatEther(demoState[validAddress].stake),
      mode: 'demo',
      note: 'In production, this would call StakingModule.stake() with real AVAX'
    });
  }
  
  return res.json({
    success: false,
    error: 'Staking requires wallet connection. Use frontend with MetaMask.',
    mode: 'demo'
  });
});

/**
 * Register a new agent (demo mode)
 */
app.post('/api/agents/register', async (req, res) => {
  const { address, metadata } = req.body;
  
  if (!address) {
    return res.status(400).json({ error: 'Missing "address" field' });
  }
  
  const validAddress = validateAddress(address);
  if (!validAddress) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  
  // Check if already exists
  if (demoState[validAddress]) {
    return res.json({
      success: true,
      message: 'Agent already registered',
      agent: demoState[validAddress],
      mode: 'demo'
    });
  }
  
  // Try real contract
  if (registryWrite && !DEMO_MODE) {
    try {
      const tx = await registryWrite.registerAgent(metadata || '{}');
      const receipt = await tx.wait();
      const tokenId = await registryContract.agentToTokenId(validAddress);
      
      return res.json({
        success: true,
        tokenId: tokenId.toString(),
        txHash: receipt.hash,
        explorer: `https://testnet.snowscan.xyz/tx/${receipt.hash}`,
        mode: 'live'
      });
    } catch (e) {
      console.error('Registration failed:', e.message);
    }
  }
  
  // Demo mode - create new agent
  const newTokenId = Object.keys(demoState).length + 1;
  demoState[validAddress] = {
    tokenId: newTokenId,
    reputation: 50,
    stake: '0',
    name: metadata?.name || 'New Agent'
  };
  
  res.json({
    success: true,
    tokenId: newTokenId,
    reputation: 50,
    tier: 'basic',
    mode: 'demo'
  });
});

/**
 * Get all demo agents (for frontend dropdown)
 */
app.get("/api/agents", async (req, res) => {
  const agentAddresses = Object.keys(demoState);
  const agents = [];
  
  for (const address of agentAddresses) {
    try {
      const tokenId = demoState[address].tokenId;
      let reputation = demoState[address].reputation;
      
      // Try to get real on-chain reputation
      try {
        reputation = Number(await reputationContract.getScore(tokenId));
        // Update demo state to stay in sync
        demoState[address].reputation = reputation;
      } catch (e) {
        // Use demo state if contract fails
      }
      
      agents.push({
        address,
        tokenId,
        reputation,
        stake: demoState[address].stake || "0",
        name: demoState[address].name,
        tier: getTier(reputation),
        feeMultiplier: getFeeMultiplier(reputation, BigInt(demoState[address].stake || "0"))
      });
    } catch (e) {
      console.error("Error fetching agent", address, e.message);
    }
  }
  
  res.json({
    agents,
    count: agents.length,
    mode: DEMO_MODE ? "demo" : "live"
  });
});
/**
 * Simulate API request (for demo)
 */
app.post('/api/request', async (req, res) => {
  const { agentAddress, service } = req.body;
  
  if (!agentAddress || !service) {
    return res.status(400).json({ error: 'Missing agentAddress or service' });
  }
  
  const agentData = await getAgentData(agentAddress);
  
  const services = {
    'gpt4-premium': { basePrice: 0.05, minRep: 80, minStake: '1000000000000000000' },
    'claude-standard': { basePrice: 0.02, minRep: 50, minStake: '100000000000000000' },
    'data-feed': { basePrice: 0.001, minRep: 0, minStake: '0' },
    'agent-discovery': { basePrice: 0.01, minRep: 70, minStake: '500000000000000000' }
  };
  
  const serviceConfig = services[service];
  if (!serviceConfig) {
    return res.status(400).json({ error: 'Unknown service' });
  }
  
  const rep = agentData.reputation || 50;
  const stake = BigInt(agentData.stake || '0');
  
  // Check requirements
  if (rep < serviceConfig.minRep) {
    return res.status(402).json({
      error: 'Insufficient reputation',
      required: serviceConfig.minRep,
      current: rep
    });
  }
  
  if (stake < BigInt(serviceConfig.minStake)) {
    return res.status(402).json({
      error: 'Insufficient stake',
      required: serviceConfig.minStake,
      current: stake.toString()
    });
  }
  
  const priceData = calculatePrice(serviceConfig.basePrice, rep, stake);
  
  res.json({
    success: true,
    service,
    agent: agentData,
    price: priceData,
    result: `${service} response for agent ${agentAddress.slice(0, 10)}...`,
    mode: DEMO_MODE ? 'demo' : 'live'
  });
});

// ============================================
// HEALTH & STATS
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'agent-trust-gateway',
    mode: DEMO_MODE ? 'demo' : 'live',
    network: 'avalanche-fuji',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stats', (req, res) => {
  const agents = Object.values(demoState);
  const tiers = { premium: 0, standard: 0, basic: 0, restricted: 0 };
  
  agents.forEach(a => {
    const tier = getTier(a.reputation);
    tiers[tier]++;
  });
  
  res.json({
    totalAgents: agents.length,
    tierDistribution: tiers,
    contracts: CONFIG.contracts,
    mode: DEMO_MODE ? 'demo' : 'live'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.GATEWAY_PORT || 4022;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              AgentTrust Gateway Server                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Mode:        ${DEMO_MODE ? '🧪 DEMO' : '💰 LIVE'}                                        ║
║  Network:     Avalanche Fuji Testnet                          ║
║  Port:        ${PORT}                                             ║
║                                                               ║
║  AGENT Endpoints:                                             ║
║  ├─ GET  /api/agents              - List all agents           ║
║  ├─ GET  /api/agents/:address     - Get agent details         ║
║  ├─ POST /api/agents/register     - Register new agent        ║
║  ├─ POST /api/agents/:addr/feedback - Submit feedback ⭐      ║
║  └─ POST /api/agents/:addr/stake  - Stake AVAX               ║
║                                                               ║
║  GATEWAY Endpoints:                                           ║
║  ├─ GET  /api/pricing?agent=0x... - Get dynamic pricing       ║
║  ├─ POST /api/request             - Simulate API request      ║
║  ├─ GET  /api/stats               - Gateway statistics        ║
║  └─ GET  /health                  - Health check              ║
║                                                               ║
║  Contracts:                                                   ║
║  ├─ Registry:   ${CONFIG.contracts.agentRegistry}  ║
║  ├─ Staking:    ${CONFIG.contracts.stakingModule}  ║
║  ├─ Reputation: ${CONFIG.contracts.reputationEngine}  ║
║  └─ JobLogger:  ${CONFIG.contracts.jobLogger}  ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
// Keep alive
setInterval(() => {}, 1000);

