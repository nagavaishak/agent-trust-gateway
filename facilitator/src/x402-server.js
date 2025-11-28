const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.fuji' });

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// x402 CONFIGURATION FOR AVALANCHE FUJI
// ============================================

const X402_CONFIG = {
  network: 'avalanche-fuji',
  chainId: 43113,
  // USDC on Avalanche Fuji (official address)
  usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65',
  // PayAI Facilitator (supports Avalanche, no API key needed)
  facilitatorUrl: 'https://facilitator.payai.network',
  // Your payment receiving address
  payToAddress: process.env.SERVER_WALLET || '0x9263c9114a3c9192fac7890067369a656075a114',
};

// Contract setup for reputation check
const REPUTATION_ABI = [
  "function getReputation(uint256 tokenId) external view returns (uint256)"
];

const IDENTITY_ABI = [
  "function getTokenId(address agent) external view returns (uint256)",
  "function isRegistered(address agent) external view returns (bool)"
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const identityContract = new ethers.Contract(
  process.env.IDENTITY_CONTRACT,
  IDENTITY_ABI,
  provider
);

const reputationContract = new ethers.Contract(
  process.env.REPUTATION_CONTRACT,
  REPUTATION_ABI,
  provider
);

// Helper: Get fee multiplier based on reputation
async function getFeeMultiplier(agentAddress) {
  try {
    const isRegistered = await identityContract.isRegistered(agentAddress);
    if (!isRegistered) return 1.5; // Unregistered = basic rate

    const tokenId = await identityContract.getTokenId(agentAddress);
    const reputation = await reputationContract.getReputation(tokenId);
    const rep = Number(reputation);

    if (rep >= 90) return 0.5;  // Premium: 50% discount
    if (rep >= 70) return 1.0;  // Standard: normal price
    if (rep >= 50) return 1.5;  // Basic: 50% premium
    return 2.0;                  // Restricted: 100% premium
  } catch (e) {
    console.error('Error getting fee multiplier:', e.message);
    return 1.5; // Default to basic
  }
}

// Helper: Create x402 Payment Requirements
function createPaymentRequirements(basePrice, feeMultiplier, resource, description) {
  const finalPrice = basePrice * feeMultiplier;
  // Convert to USDC units (6 decimals)
  const amountInUnits = Math.round(finalPrice * 1_000_000).toString();

  return {
    scheme: 'exact',
    network: X402_CONFIG.network,
    maxAmountRequired: amountInUnits,
    resource: resource,
    description: description,
    mimeType: 'application/json',
    payTo: X402_CONFIG.payToAddress,
    maxTimeoutSeconds: 300,
    asset: X402_CONFIG.usdcAddress,
    extra: {
      name: 'USD Coin',
      version: '2'
    }
  };
}

// Helper: Verify payment with facilitator
async function verifyPayment(paymentHeader, paymentRequirements) {
  try {
    const response = await fetch(`${X402_CONFIG.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: paymentHeader,
        paymentRequirements: paymentRequirements
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Verification error:', e.message);
    return { isValid: false, error: e.message };
  }
}

// Helper: Settle payment with facilitator
async function settlePayment(paymentHeader, paymentRequirements) {
  try {
    const response = await fetch(`${X402_CONFIG.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: paymentHeader,
        paymentRequirements: paymentRequirements
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Settlement error:', e.message);
    return { success: false, error: e.message };
  }
}

// ============================================
// x402 MIDDLEWARE
// ============================================

function x402Paywall(basePrice, resourceName, description) {
  return async (req, res, next) => {
    // Get agent address from header or query
    const agentAddress = req.headers['x-agent-address'] || req.query.agent;
    
    // Calculate fee multiplier based on agent reputation
    const feeMultiplier = await getFeeMultiplier(agentAddress);
    
    // Create payment requirements
    const paymentRequirements = createPaymentRequirements(
      basePrice,
      feeMultiplier,
      `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      description
    );

    // Check for X-PAYMENT header
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // No payment - return 402 with requirements
      console.log(`[x402] 402 Payment Required for ${resourceName}`);
      return res.status(402).json({
        error: 'Payment Required',
        message: `This endpoint requires payment of $${(basePrice * feeMultiplier).toFixed(4)} USDC`,
        x402Version: '1',
        accepts: [paymentRequirements],
        // Extra info for demo
        agentInfo: {
          address: agentAddress || 'Not provided',
          feeMultiplier: feeMultiplier,
          basePrice: basePrice,
          finalPrice: basePrice * feeMultiplier,
          discount: feeMultiplier < 1 ? `${((1 - feeMultiplier) * 100).toFixed(0)}% reputation discount` : null,
          premium: feeMultiplier > 1 ? `${((feeMultiplier - 1) * 100).toFixed(0)}% new agent premium` : null
        }
      });
    }

    // Verify payment
    console.log(`[x402] Verifying payment for ${resourceName}...`);
    const verification = await verifyPayment(paymentHeader, paymentRequirements);

    if (!verification.isValid) {
      console.log(`[x402] Payment verification failed: ${verification.error || 'Unknown'}`);
      return res.status(402).json({
        error: 'Payment Invalid',
        message: verification.error || 'Payment verification failed',
        accepts: [paymentRequirements]
      });
    }

    // Settle payment
    console.log(`[x402] Payment verified, settling...`);
    const settlement = await settlePayment(paymentHeader, paymentRequirements);

    if (!settlement.success && !settlement.txHash) {
      console.log(`[x402] Settlement failed: ${settlement.error || 'Unknown'}`);
      // Continue anyway for demo purposes
    } else {
      console.log(`[x402] Payment settled: ${settlement.txHash || 'pending'}`);
    }

    // Attach payment info to request
    req.x402 = {
      paid: true,
      amount: basePrice * feeMultiplier,
      agentAddress,
      feeMultiplier,
      txHash: settlement.txHash
    };

    next();
  };
}

// ============================================
// PAID ENDPOINTS
// ============================================

// AI Service - $0.01 base price
app.post('/api/ai-service', 
  x402Paywall(0.01, 'AI Inference Service', 'GPT-4 powered analysis'),
  async (req, res) => {
    const { prompt } = req.body;
    
    // Simulate AI response
    const response = {
      success: true,
      result: `Analysis complete for prompt: "${prompt || 'market analysis'}". The market sentiment is bullish with 78% confidence based on recent trading patterns.`,
      model: 'gpt-4-turbo',
      tokens_used: 847,
      payment: req.x402
    };

    res.json(response);
  }
);

// Premium Data Feed - $0.001 base price
app.get('/api/premium-data',
  x402Paywall(0.001, 'Premium Data Feed', 'Real-time market data'),
  async (req, res) => {
    // Simulate premium data
    const response = {
      success: true,
      data: {
        btc_price: 97432.50 + Math.random() * 1000,
        eth_price: 3421.80 + Math.random() * 100,
        avax_price: 42.15 + Math.random() * 5,
        timestamp: new Date().toISOString(),
        source: 'premium-feed-v2'
      },
      payment: req.x402
    };

    res.json(response);
  }
);

// Agent Discovery (premium) - $0.005 base price
app.get('/api/discover-agents',
  x402Paywall(0.005, 'Agent Discovery', 'Find high-reputation agents'),
  async (req, res) => {
    // Return curated agent list
    const response = {
      success: true,
      agents: [
        { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', reputation: 100, tier: 'premium', specialty: 'DeFi Analysis' },
        { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', reputation: 85, tier: 'standard', specialty: 'NFT Valuation' }
      ],
      payment: req.x402
    };

    res.json(response);
  }
);

// ============================================
// FREE ENDPOINTS
// ============================================

// Get payment requirements without paying (for UI to display)
app.get('/api/payment-info', async (req, res) => {
  const agentAddress = req.query.agent;
  const feeMultiplier = await getFeeMultiplier(agentAddress);

  res.json({
    services: [
      {
        name: 'AI Inference Service',
        endpoint: '/api/ai-service',
        method: 'POST',
        basePrice: 0.01,
        finalPrice: 0.01 * feeMultiplier,
        currency: 'USDC'
      },
      {
        name: 'Premium Data Feed',
        endpoint: '/api/premium-data',
        method: 'GET',
        basePrice: 0.001,
        finalPrice: 0.001 * feeMultiplier,
        currency: 'USDC'
      },
      {
        name: 'Agent Discovery',
        endpoint: '/api/discover-agents',
        method: 'GET',
        basePrice: 0.005,
        finalPrice: 0.005 * feeMultiplier,
        currency: 'USDC'
      }
    ],
    agentInfo: {
      address: agentAddress || 'Not provided',
      feeMultiplier
    },
    x402Config: {
      network: X402_CONFIG.network,
      chainId: X402_CONFIG.chainId,
      usdcAddress: X402_CONFIG.usdcAddress,
      facilitator: X402_CONFIG.facilitatorUrl,
      payTo: X402_CONFIG.payToAddress
    }
  });
});

// Check facilitator status
app.get('/api/facilitator-status', async (req, res) => {
  try {
    const response = await fetch(`${X402_CONFIG.facilitatorUrl}/supported`);
    const supported = await response.json();
    
    res.json({
      status: 'online',
      facilitator: X402_CONFIG.facilitatorUrl,
      supportedNetworks: supported
    });
  } catch (e) {
    res.json({
      status: 'offline',
      facilitator: X402_CONFIG.facilitatorUrl,
      error: e.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-server',
    network: 'avalanche-fuji',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.X402_PORT || 4021;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              x402 Payment Server - Avalanche              ║
╠═══════════════════════════════════════════════════════════╣
║  Network:     Avalanche Fuji Testnet                      ║
║  Chain ID:    43113                                       ║
║  Port:        ${PORT}                                     ║
║  USDC:        ${X402_CONFIG.usdcAddress.slice(0, 20)}...  ║
║  Facilitator: facilitator.payai.network                   ║
║                                                           ║
║  PAID Endpoints (require x402 payment):                   ║
║  ├─ POST /api/ai-service      - $0.01 USDC                ║
║  ├─ GET  /api/premium-data    - $0.001 USDC               ║
║  └─ GET  /api/discover-agents - $0.005 USDC               ║
║                                                           ║
║  FREE Endpoints:                                          ║
║  ├─ GET  /api/payment-info    - Get pricing info          ║
║  ├─ GET  /api/facilitator-status - Check facilitator      ║
║  └─ GET  /health              - Health check              ║
╚═══════════════════════════════════════════════════════════╝

Test with:
  curl http://localhost:${PORT}/api/ai-service -X POST
  → Returns 402 Payment Required with payment details

  curl http://localhost:${PORT}/api/payment-info?agent=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  → Returns pricing for premium agent (50% discount)
  `);
});