require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { paymentMiddleware } = require('x402-express');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// Your wallet address to receive payments
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Contract ABIs
const IDENTITY_ABI = [
  "function isRegisteredAgent(address) view returns (bool)",
  "function agentToTokenId(address) view returns (uint256)"
];

const REPUTATION_ABI = [
  "function getReputationScore(uint256 tokenId) view returns (uint256)"
];

// Config
const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  identityContract: process.env.IDENTITY_CONTRACT,
  reputationContract: process.env.REPUTATION_CONTRACT
};

let provider, identityContract, reputationContract;

if (config.identityContract && config.reputationContract) {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  identityContract = new ethers.Contract(config.identityContract, IDENTITY_ABI, provider);
  reputationContract = new ethers.Contract(config.reputationContract, REPUTATION_ABI, provider);
  console.log('Reputation contracts initialized');
}

/**
 * Helper: Get dynamic price based on agent reputation
 * Higher reputation = lower price (reward good actors)
 */
async function getDynamicPrice(agentAddress) {
  const basePrice = 0.01; // $0.01 base price
  
  if (!identityContract) {
    return basePrice;
  }
  
  try {
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (!isRegistered) {
      return basePrice * 2; // Unregistered agents pay double
    }
    
    const tokenId = await identityContract.agentToTokenId(agentAddress);
    const reputation = await reputationContract.getReputationScore(tokenId);
    const repScore = Number(reputation);
    
    // Price tiers based on reputation
    if (repScore >= 90) return basePrice * 0.5;  // 50% discount for premium
    if (repScore >= 70) return basePrice;         // Standard price
    if (repScore >= 50) return basePrice * 1.5;   // 50% markup for basic
    return basePrice * 2;                          // Double for low rep
    
  } catch (error) {
    console.error('Error getting dynamic price:', error);
    return basePrice;
  }
}

/**
 * x402-protected AI service endpoint
 * This demonstrates a paid API that AI agents can call
 */
app.use(paymentMiddleware(
  PAYMENT_ADDRESS,
  {
    "POST /api/ai-service": {
      price: "$0.01",
      network: "avalanche-fuji",
      config: {
        description: "AI agent service with reputation-gated pricing",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The query to process" },
            agentAddress: { type: "string", description: "Calling agent's address" }
          },
          required: ["query"]
        },
        outputSchema: {
          type: "object",
          properties: {
            result: { type: "string" },
            reputation: { type: "number" },
            priceCharged: { type: "number" }
          }
        }
      }
    },
    "GET /api/premium-data": {
      price: "$0.001",
      network: "avalanche-fuji",
      config: {
        description: "Premium data feed access"
      }
    }
  },
  {
    url: "https://x402.org/facilitator" // Public testnet facilitator
  }
));

// The actual AI service endpoint
app.post('/api/ai-service', async (req, res) => {
  const { query, agentAddress } = req.body;
  
  let reputation = null;
  let tier = 'unknown';
  
  // Check reputation if agent address provided
  if (agentAddress && identityContract) {
    try {
      const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
      if (isRegistered) {
        const tokenId = await identityContract.agentToTokenId(agentAddress);
        reputation = Number(await reputationContract.getReputationScore(tokenId));
        
        if (reputation >= 90) tier = 'premium';
        else if (reputation >= 70) tier = 'standard';
        else if (reputation >= 50) tier = 'basic';
        else tier = 'restricted';
      }
    } catch (err) {
      console.error('Reputation check error:', err);
    }
  }
  
  // Simulate AI processing
  const result = {
    result: `Processed query: "${query}" - This is a simulated AI response.`,
    agentAddress: agentAddress || 'anonymous',
    reputation,
    tier,
    timestamp: Date.now(),
    message: 'Payment verified via x402 protocol on Avalanche'
  };
  
  res.json(result);
});

// Premium data endpoint
app.get('/api/premium-data', (req, res) => {
  res.json({
    data: {
      price: 42000,
      volume: 1500000,
      change: 2.5
    },
    source: 'Agent Trust Protocol Premium Feed',
    timestamp: Date.now()
  });
});

// Health check (free)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    x402: 'enabled',
    network: 'avalanche-fuji',
    facilitator: 'https://x402.org/facilitator',
    protectedEndpoints: [
      'POST /api/ai-service ($0.01)',
      'GET /api/premium-data ($0.001)'
    ]
  });
});

// Info about the service (free)
app.get('/', (req, res) => {
  res.json({
    name: 'Agent Trust Protocol - x402 Demo',
    description: 'AI agent services with reputation-gated x402 payments on Avalanche',
    endpoints: {
      free: ['GET /', 'GET /health'],
      paid: [
        {
          path: 'POST /api/ai-service',
          price: '$0.01 USDC',
          description: 'AI processing service'
        },
        {
          path: 'GET /api/premium-data',
          price: '$0.001 USDC',
          description: 'Premium data feed'
        }
      ]
    },
    network: 'Avalanche Fuji Testnet',
    paymentProtocol: 'x402'
  });
});

const PORT = process.env.X402_PORT || 4021;

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║   Agent Trust Protocol - x402 Payment Server              ║
  ╠═══════════════════════════════════════════════════════════╣
  ║   Server running on port ${PORT}                          ║
  ║   Network: Avalanche Fuji                                 ║
  ║   Facilitator: https://x402.org/facilitator               ║
  ╚═══════════════════════════════════════════════════════════╝
  
  Protected Endpoints:
  - POST /api/ai-service    $0.01 USDC
  - GET  /api/premium-data  $0.001 USDC
  
  Free Endpoints:
  - GET  /health
  - GET  /
  `);
});