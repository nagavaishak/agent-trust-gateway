const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.fuji' });

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// MODE CONFIGURATION
// ============================================
// Set REAL_PAYMENTS=true to execute actual on-chain USDC transfers
const REAL_PAYMENTS = process.env.REAL_PAYMENTS === 'true' || false;
const DEMO_MODE = !REAL_PAYMENTS;

console.log(`Payment Mode: ${REAL_PAYMENTS ? '💰 REAL PAYMENTS' : '🧪 DEMO MODE'}`);

// ============================================
// x402 CONFIGURATION FOR AVALANCHE FUJI
// ============================================

const X402_CONFIG = {
  network: 'avalanche-fuji',
  chainId: 43113,
  usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65',
  payToAddress: process.env.SERVER_WALLET || '0x9263c9114a3c9192fac7890067369a656075a114',
};

// USDC ABI for transferWithAuthorization (EIP-3009)
const USDC_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function name() external view returns (string)",
  "function version() external view returns (string)",
  "function nonces(address owner) external view returns (uint256)"
];

// Contract setup
const REPUTATION_ABI = [
  "function getReputationScore(uint256 agentTokenId) external view returns (uint256)"
];

const IDENTITY_ABI = [
  "function agentToTokenId(address agent) external view returns (uint256)",
  "function isRegisteredAgent(address agent) external view returns (bool)"
];

// Provider and wallet for executing transactions
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL, {
  chainId: 43113,
  name: 'avalanche-fuji'
});
const serverWallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);

// Contract instances
const usdcContract = new ethers.Contract(X402_CONFIG.usdcAddress, USDC_ABI, serverWallet);

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

async function getFeeMultiplier(agentAddress) {
  try {
    if (!agentAddress) return 2.0;
    
    const validAddress = validateAddress(agentAddress);
    if (!validAddress) return 2.0;
    
    const isRegistered = await identityContract.isRegisteredAgent(validAddress);
    if (!isRegistered) return 2.0;

    const tokenId = await identityContract.agentToTokenId(validAddress);
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
    
    const validAddress = validateAddress(agentAddress);
    if (!validAddress) return 0;
    
    const isRegistered = await identityContract.isRegisteredAgent(validAddress);
    if (!isRegistered) return 0;

    const tokenId = await identityContract.agentToTokenId(validAddress);
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
      version: '2',
      chainId: 43113
    }
  };
}

// ============================================
// REAL PAYMENT VERIFICATION (EIP-3009)
// ============================================

async function executeRealPayment(paymentHeader, paymentRequirements) {
  try {
    // Decode the payment payload
    const payloadStr = Buffer.from(paymentHeader, 'base64').toString();
    const payload = JSON.parse(payloadStr);
    
    console.log('[REAL] Processing payment...');
    
    if (!payload.payload || !payload.payload.authorization || !payload.payload.signature) {
      return { isValid: false, error: 'Invalid payload structure' };
    }

    const auth = payload.payload.authorization;
    const sig = payload.payload.signature;

    // Validate payment amount
    const requiredAmount = BigInt(paymentRequirements.maxAmountRequired);
    const providedAmount = BigInt(auth.value);
    
    if (providedAmount < requiredAmount) {
      return { isValid: false, error: `Insufficient payment: ${providedAmount} < ${requiredAmount}` };
    }

    // Validate recipient
    if (auth.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()) {
      return { isValid: false, error: 'Payment recipient mismatch' };
    }

    // Validate not expired
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(auth.validBefore) < now) {
      return { isValid: false, error: 'Authorization expired' };
    }

    // Parse signature
    const signature = sig.startsWith('0x') ? sig : `0x${sig}`;
    const { v, r, s } = ethers.Signature.from(signature);

    console.log('[REAL] Executing transferWithAuthorization on-chain...');
    console.log(`  From: ${auth.from}`);
    console.log(`  To: ${auth.to}`);
    console.log(`  Value: ${auth.value} (${Number(auth.value) / 1_000_000} USDC)`);

    // Execute the transfer on-chain
    const tx = await usdcContract.transferWithAuthorization(
      auth.from,           // from
      auth.to,             // to
      auth.value,          // value
      auth.validAfter,     // validAfter
      auth.validBefore,    // validBefore
      auth.nonce,          // nonce
      v,                   // v
      r,                   // r
      s                    // s
    );

    console.log(`[REAL] TX submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    console.log(`[REAL] ✅ TX confirmed in block ${receipt.blockNumber}`);
    console.log(`[REAL] 🔗 https://testnet.snowscan.xyz/tx/${tx.hash}`);

    return {
      isValid: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      settledAt: new Date().toISOString(),
      explorerUrl: `https://testnet.snowscan.xyz/tx/${tx.hash}`
    };

  } catch (e) {
    console.error('[REAL] Payment execution error:', e.message);
    
    // Parse common errors
    if (e.message.includes('authorization is used')) {
      return { isValid: false, error: 'Authorization already used (nonce reused)' };
    }
    if (e.message.includes('insufficient')) {
      return { isValid: false, error: 'Insufficient USDC balance' };
    }
    if (e.message.includes('invalid signature')) {
      return { isValid: false, error: 'Invalid signature' };
    }
    
    return { isValid: false, error: e.message };
  }
}

// Demo mode verification (local only, no on-chain transfer)
async function verifyPaymentDemo(paymentHeader, paymentRequirements) {
  try {
    const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    console.log('[DEMO] Verifying payment locally...');

    if (!payload.payload || !payload.payload.signature || !payload.payload.authorization) {
      return { isValid: false, error: 'Invalid payload structure' };
    }

    const auth = payload.payload.authorization;
    
    // Verify amount
    if (BigInt(auth.value) < BigInt(paymentRequirements.maxAmountRequired)) {
      return { isValid: false, error: 'Insufficient payment amount' };
    }

    // Verify recipient
    if (auth.to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()) {
      return { isValid: false, error: 'Payment recipient mismatch' };
    }

    // Verify signature format
    if (!payload.payload.signature || payload.payload.signature.length !== 132) {
      return { isValid: false, error: 'Invalid signature format' };
    }

    // Verify not expired
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(auth.validBefore) < now) {
      return { isValid: false, error: 'Authorization expired' };
    }

    console.log('[DEMO] ✅ Payment verified (demo mode - no on-chain transfer)');
    
    return { 
      isValid: true,
      txHash: `0x${Date.now().toString(16)}${'0'.repeat(48)}`.slice(0, 66),
      settledAt: new Date().toISOString(),
      demoMode: true
    };
  } catch (e) {
    console.error('[DEMO] Verification error:', e.message);
    return { isValid: false, error: e.message };
  }
}

// Main verification function
async function verifyPayment(paymentHeader, paymentRequirements) {
  if (REAL_PAYMENTS) {
    return executeRealPayment(paymentHeader, paymentRequirements);
  } else {
    return verifyPaymentDemo(paymentHeader, paymentRequirements);
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
        },
        paymentMode: REAL_PAYMENTS ? 'real' : 'demo'
      });
    }

    // Verify/Execute payment
    console.log(`[x402] ${REAL_PAYMENTS ? 'Executing' : 'Verifying'} payment for ${resourceName}...`);
    const verification = await verifyPayment(paymentHeader, paymentRequirements);

    if (!verification.isValid) {
      console.log(`[x402] Payment failed: ${verification.error || 'Unknown'}`);
      return res.status(402).json({
        error: 'Payment Failed',
        message: verification.error || 'Payment verification failed',
        accepts: [paymentRequirements]
      });
    }

    console.log(`[x402] ✅ Payment successful! TX: ${verification.txHash}`);

    // Attach payment info to request
    req.x402 = {
      paid: true,
      amount: basePrice * feeMultiplier,
      agentAddress,
      reputation,
      tier,
      feeMultiplier,
      txHash: verification.txHash,
      blockNumber: verification.blockNumber,
      explorerUrl: verification.explorerUrl,
      settledAt: verification.settledAt,
      realPayment: REAL_PAYMENTS
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
      result: `Analysis complete for prompt: "${prompt || 'market analysis'}". Based on on-chain data and market sentiment, AVAX shows bullish momentum with 78% confidence.`,
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
        timestamp: new Date().toISOString()
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
        { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', reputation: 100, tier: 'premium' },
        { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', reputation: 75, tier: 'standard' }
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

  // Get server USDC balance
  let serverBalance = '0';
  try {
    const balance = await usdcContract.balanceOf(X402_CONFIG.payToAddress);
    serverBalance = (Number(balance) / 1_000_000).toFixed(6);
  } catch (e) {
    console.error('Error getting balance:', e.message);
  }

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
    server: {
      wallet: X402_CONFIG.payToAddress,
      usdcBalance: serverBalance,
      network: X402_CONFIG.network,
      chainId: X402_CONFIG.chainId
    },
    paymentMode: REAL_PAYMENTS ? 'real' : 'demo',
    realPaymentsEnabled: REAL_PAYMENTS
  });
});

app.get('/api/balance', async (req, res) => {
  try {
    const balance = await usdcContract.balanceOf(X402_CONFIG.payToAddress);
    res.json({
      address: X402_CONFIG.payToAddress,
      balance: balance.toString(),
      balanceFormatted: (Number(balance) / 1_000_000).toFixed(6),
      currency: 'USDC',
      network: 'avalanche-fuji'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-server',
    network: 'avalanche-fuji',
    paymentMode: REAL_PAYMENTS ? 'real' : 'demo',
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
║  Payment:     ${REAL_PAYMENTS ? '💰 REAL (on-chain USDC)' : '🧪 DEMO (local verification)'}           ║
║                                                           ║
║  Server Wallet: ${X402_CONFIG.payToAddress}  ║
║                                                           ║
║  PAID Endpoints (require x402 payment):                   ║
║  ├─ POST /api/ai-service      - $0.01 USDC               ║
║  ├─ GET  /api/premium-data    - $0.001 USDC              ║
║  └─ GET  /api/discover-agents - $0.005 USDC              ║
║                                                           ║
║  FREE Endpoints:                                          ║
║  ├─ GET  /api/payment-info    - Get pricing info         ║
║  ├─ GET  /api/balance         - Check server USDC        ║
║  └─ GET  /health              - Health check             ║
║                                                           ║
║  To enable real payments: REAL_PAYMENTS=true              ║
╚═══════════════════════════════════════════════════════════╝
  `);
});