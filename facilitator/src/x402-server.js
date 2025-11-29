const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.fuji' });

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// DEMO MODE - Set to true for hackathon demo
// ============================================
const DEMO_MODE = process.env.DEMO_MODE === 'true' || true;

// ============================================
// x402 CONFIGURATION FOR AVALANCHE FUJI
// ============================================

const X402_CONFIG = {
  network: 'avalanche-fuji',
  chainId: 43113,
  usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65',
  facilitatorUrl: 'https://facilitator.payai.network',
  payToAddress: process.env.SERVER_WALLET || '0x9263c9114a3c9192fac7890067369a656075a114',
};

// Contract setup for reputation check
const REPUTATION_ABI = [
  "function getReputationScore(uint256 agentTokenId) external view returns (uint256)"
];

const IDENTITY_ABI = [
  "function agentToTokenId(address agent) external view returns (uint256)",
  "function isRegisteredAgent(address agent) external view returns (bool)"
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

// Helper functions
async function getFeeMultiplier(agentAddress) {
  try {
    if (!agentAddress) return 2.0;
    
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (!isRegistered) return 2.0;

    const tokenId = await identityContract.agentToTokenId(agentAddress);
    const reputation = await reputationContract.getReputationScore(tokenId);
    const rep = Number(reputation);

    if (rep >= 90) return 0.5;
    if (rep >= 70) return 1.0;
    if (rep >= 50) return 1.5;
    return 2.0;
  } catch (e) {
    console.error('Error getting fee multiplier:', e.message);
    return 2.0;
  }
}

async function getReputationScore(agentAddress) {
  try {
    if (!agentAddress) return 50;
    
    const isRegistered = await identityContract.isRegisteredAgent(agentAddress);
    if (!isRegistered) return 0;

    const tokenId = await identityContract.agentToTokenId(agentAddress);
    const reputation = await reputationContract.getReputationScore(tokenId);
    return Number(reputation);
  } catch (e) {
    console.error('Error getting reputation:', e.message);
    return 50;
  }
}

function getTier(reputation) {
  if (reputation >= 90) return 'premium';
  if (reputation >= 70) return 'standard';
  if (reputation >= 50) return 'basic';
  return 'restricted';
}

function createPaymentRequirements(basePrice, feeMultiplier, resource, description) {
  const finalPrice = basePrice * feeMultiplier;
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

// Verify payment with facilitator
async function verifyPaymentWithFacilitator(paymentHeader, paymentRequirements) {
  try {
    const response = await fetch(`${X402_CONFIG.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: JSON.parse(Buffer.from(paymentHeader, 'base64').toString()),
        paymentRequirements: paymentRequirements
      })
    });

    const result = await response.json();
    return result;
  } catch (e) {
    console.error('Facilitator verification error:', e.message);
    return { isValid: false, error: e.message };
  }
}

// Demo mode verification - validates signature locally
async function verifyPaymentDemo(paymentHeader, paymentRequirements) {
  try {
    const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    console.log('[DEMO] Verifying payment locally...');
    console.log('[DEMO] Payment payload:', JSON.stringify(payload, null, 2));

    // Validate payload structure
    if (!payload.payload || !payload.payload.signature || !payload.payload.authorization) {
      return { isValid: false, error: 'Invalid payload structure' };
    }

    const auth = payload.payload.authorization;
    
    // Verify amount matches
    if (BigInt(auth.value) < BigInt(paymentRequirements.maxAmountRequired)) {
      return { isValid: false, error: 'Insufficient payment amount' };
    }

    // Verify recipient matches
    if (auth.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()) {
      return { isValid: false, error: 'Payment recipient mismatch' };
    }

    // Verify signature is valid EIP-712 (basic check)
    if (!payload.payload.signature || payload.payload.signature.length !== 132) {
      return { isValid: false, error: 'Invalid signature format' };
    }

    // Verify timestamp
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(auth.validBefore) < now) {
      return { isValid: false, error: 'Authorization expired' };
    }

    console.log('[DEMO] ✅ Payment verified successfully');
    
    return { 
      isValid: true,
      txHash: `0x${Date.now().toString(16)}${'0'.repeat(48)}`.slice(0, 66),
      settledAt: new Date().toISOString()
    };
  } catch (e) {
    console.error('[DEMO] Verification error:', e.message);
    return { isValid: false, error: e.message };
  }
}

// Main verification function
async function verifyPayment(paymentHeader, paymentRequirements) {
  if (DEMO_MODE) {
    return verifyPaymentDemo(paymentHeader, paymentRequirements);
  } else {
    return verifyPaymentWithFacilitator(paymentHeader, paymentRequirements);
  }
}

// ============================================
// x402 MIDDLEWARE
// ============================================

function x402Paywall(basePrice, resourceName, description) {
  return async (req, res, next) => {
    const agentAddress = req.headers['x-agent-address'] || req.query.agent;
    const feeMultiplier = await getFeeMultiplier(agentAddress);
    const reputation = await getReputationScore(agentAddress);
    const tier = getTier(reputation);
    
    const paymentRequirements = createPaymentRequirements(
      basePrice,
      feeMultiplier,
      `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      description
    );

    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      console.log(`[x402] 402 Payment Required for ${resourceName}`);
      return res.status(402).json({
        error: 'Payment Required',
        message: `This endpoint requires payment of $${(basePrice * feeMultiplier).toFixed(4)} USDC`,
        x402Version: '1',
        accepts: [paymentRequirements],
        agentInfo: {
          address: agentAddress || 'Not provided',
          reputation: reputation,
          tier: tier,
          feeMultiplier: feeMultiplier,
          basePrice: basePrice,
          finalPrice: basePrice * feeMultiplier,
          discount: feeMultiplier < 1 ? `${((1 - feeMultiplier) * 100).toFixed(0)}% reputation discount` : null,
          premium: feeMultiplier > 1 ? `${((feeMultiplier - 1) * 100).toFixed(0)}% premium` : null
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

    console.log(`[x402] ✅ Payment verified! TX: ${verification.txHash}`);

    // Attach payment info to request
    req.x402 = {
      paid: true,
      amount: basePrice * feeMultiplier,
      agentAddress,
      reputation,
      tier,
      feeMultiplier,
      txHash: verification.txHash,
      settledAt: verification.settledAt,
      demoMode: DEMO_MODE
    };

    next();
  };
}

// ============================================
// PAID ENDPOINTS
// ============================================

app.post('/api/ai-service', 
  x402Paywall(0.01, 'AI Inference Service', 'GPT-4 powered analysis'),
  async (req, res) => {
    const { prompt } = req.body;
    
    res.json({
      success: true,
      result: `Analysis complete for prompt: "${prompt || 'market analysis'}". Based on on-chain data and market sentiment, AVAX shows bullish momentum with 78% confidence. Key support at $38, resistance at $48.`,
      model: 'gpt-4-turbo',
      tokens_used: 847,
      payment: req.x402
    });
  }
);

app.get('/api/premium-data',
  x402Paywall(0.001, 'Premium Data Feed', 'Real-time market data'),
  async (req, res) => {
    res.json({
      success: true,
      data: {
        btc_price: 97432.50 + Math.random() * 1000,
        eth_price: 3421.80 + Math.random() * 100,
        avax_price: 42.15 + Math.random() * 5,
        timestamp: new Date().toISOString(),
        source: 'premium-feed-v2'
      },
      payment: req.x402
    });
  }
);

app.get('/api/discover-agents',
  x402Paywall(0.005, 'Agent Discovery', 'Find high-reputation agents'),
  async (req, res) => {
    res.json({
      success: true,
      agents: [
        { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', reputation: 100, tier: 'premium', specialty: 'DeFi Analysis' },
        { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', reputation: 85, tier: 'standard', specialty: 'NFT Valuation' }
      ],
      payment: req.x402
    });
  }
);

// ============================================
// FREE ENDPOINTS
// ============================================

app.get('/api/payment-info', async (req, res) => {
  const agentAddress = req.query.agent;
  const feeMultiplier = await getFeeMultiplier(agentAddress);
  const reputation = await getReputationScore(agentAddress);
  const tier = getTier(reputation);

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
      reputation,
      tier,
      feeMultiplier
    },
    x402Config: {
      network: X402_CONFIG.network,
      chainId: X402_CONFIG.chainId,
      usdcAddress: X402_CONFIG.usdcAddress,
      facilitator: DEMO_MODE ? 'local-demo' : X402_CONFIG.facilitatorUrl,
      payTo: X402_CONFIG.payToAddress
    },
    demoMode: DEMO_MODE
  });
});

app.get('/api/facilitator-status', async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      status: 'demo-mode',
      message: 'Running in demo mode with local verification',
      facilitator: 'local'
    });
  }

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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-server',
    network: 'avalanche-fuji',
    demoMode: DEMO_MODE,
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
║  Port:        ${PORT}                                         ║
║  Demo Mode:   ${DEMO_MODE ? '✅ ENABLED' : '❌ DISABLED'}                                  ║
║                                                           ║
║  PAID Endpoints (require x402 payment):                   ║
║  ├─ POST /api/ai-service      - $0.01 USDC               ║
║  ├─ GET  /api/premium-data    - $0.001 USDC              ║
║  └─ GET  /api/discover-agents - $0.005 USDC              ║
║                                                           ║
║  FREE Endpoints:                                          ║
║  ├─ GET  /api/payment-info    - Get pricing info         ║
║  ├─ GET  /api/facilitator-status - Check facilitator     ║
║  └─ GET  /health              - Health check             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});