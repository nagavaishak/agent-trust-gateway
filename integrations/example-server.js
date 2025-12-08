/**
 * AgentTrust Gateway - Full Integration Example
 * 
 * Demonstrates all sponsor integrations:
 * - Thirdweb: Payment settlement
 * - Turf: Behavioral enrichment
 * - Youmio: Provenance verification
 */

const express = require('express');
const { AgentTrust } = require('../sdk/index');
const { 
  verifyPayment, 
  enrichWithTurf, 
  enrichWithYoumio,
  verifyAndEnrich 
} = require('./index');

const app = express();
app.use(express.json());

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Thirdweb
  thirdweb: {
    network: 'fuji',
    apiKey: process.env.THIRDWEB_API_KEY
  },
  
  // Turf
  turf: {
    apiKey: process.env.TURF_API_KEY
  },
  
  // Youmio
  youmio: {
    apiKey: process.env.YOUMIO_API_KEY,
    agentRegistryAddress: '0xea5D764e8967b761A2Ad0817eDad81381cc6cF12',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc'
  }
};

// ============================================
// ENDPOINT: Full Integration (All Sponsors)
// ============================================

app.post('/api/premium',
  // Step 1: AgentTrust protection (identity, reputation, staking)
  AgentTrust.protect({
    minStake: '1',
    minScore: 80,
    basePrice: 0.05,
    network: 'fuji'
  }),
  
  // Step 2: Verify payment through Thirdweb
  verifyPayment(CONFIG.thirdweb),
  
  // Step 3: Enrich with Turf behavioral data
  enrichWithTurf(CONFIG.turf),
  
  // Step 4: Add Youmio provenance boost
  enrichWithYoumio(CONFIG.youmio),
  
  // Handler
  (req, res) => {
    const trust = req.agentTrust;
    
    res.json({
      success: true,
      result: 'Premium AI inference result',
      
      // Trust breakdown
      trust: {
        agent: trust.address,
        reputation: trust.reputation,
        
        // Turf enrichment
        turf: trust.turf ? {
          behaviorScore: trust.turf.behaviorScore,
          riskLevel: trust.turf.riskLevel,
          riskMultiplier: trust.turf.riskMultiplier
        } : null,
        
        // Youmio provenance
        youmio: trust.youmio ? {
          verified: trust.youmio.verified,
          did: trust.youmio.did,
          trustBoost: trust.youmio.trustBoost
        } : null,
        
        // Pricing
        pricing: {
          base: trust.pricing.basePrice,
          final: trust.pricing.finalPrice,
          discount: `${((1 - trust.pricing.multiplier) * 100).toFixed(0)}%`
        }
      },
      
      // Payment verification
      payment: req.paymentVerified ? {
        verified: true,
        txHash: req.paymentVerified.txHash,
        facilitator: req.paymentVerified.facilitator
      } : null
    });
  }
);

// ============================================
// ENDPOINT: Simplified (Combined Middleware)
// ============================================

app.post('/api/simple',
  AgentTrust.protect({ minScore: 50, basePrice: 0.02 }),
  verifyAndEnrich(CONFIG),
  (req, res) => {
    res.json({
      success: true,
      result: 'Response with all enrichments',
      trust: req.agentTrust
    });
  }
);

// ============================================
// ENDPOINT: Turf Only
// ============================================

app.post('/api/turf-enriched',
  AgentTrust.protect({ minScore: 50, basePrice: 0.01 }),
  enrichWithTurf(CONFIG.turf),
  (req, res) => {
    res.json({
      success: true,
      result: 'Response with Turf behavioral data',
      trust: {
        agent: req.agentTrust.address,
        reputation: req.agentTrust.reputation,
        turf: req.agentTrust.turf
      }
    });
  }
);

// ============================================
// ENDPOINT: Youmio Only
// ============================================

app.post('/api/youmio-verified',
  AgentTrust.protect({ minScore: 50, basePrice: 0.01 }),
  enrichWithYoumio(CONFIG.youmio),
  (req, res) => {
    res.json({
      success: true,
      result: 'Response with Youmio provenance',
      trust: {
        agent: req.agentTrust.address,
        baseReputation: req.agentTrust.reputation - (req.agentTrust.youmio?.trustBoost || 0),
        boostedReputation: req.agentTrust.reputation,
        youmio: req.agentTrust.youmio
      }
    });
  }
);

// ============================================
// INFO ENDPOINTS
// ============================================

app.get('/integrations', (req, res) => {
  res.json({
    sponsors: {
      thirdweb: {
        status: CONFIG.thirdweb.apiKey ? 'configured' : 'not configured',
        purpose: 'x402 payment settlement and verification'
      },
      turf: {
        status: CONFIG.turf.apiKey ? 'configured' : 'not configured',
        purpose: 'Behavioral data enrichment and risk scoring'
      },
      youmio: {
        status: CONFIG.youmio.apiKey ? 'configured' : 'not configured',
        purpose: 'Agent provenance and DID verification'
      }
    },
    endpoints: {
      '/api/premium': 'Full integration (all sponsors)',
      '/api/simple': 'Combined middleware approach',
      '/api/turf-enriched': 'Turf enrichment only',
      '/api/youmio-verified': 'Youmio verification only'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', integrations: 3 });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 4023;

app.listen(PORT, () => {
  console.log(`
  🔗 AgentTrust Gateway - Sponsor Integrations
  
  Sponsors:
    ├─ Thirdweb: ${CONFIG.thirdweb.apiKey ? '✓' : '○'} Payment settlement
    ├─ Turf:     ${CONFIG.turf.apiKey ? '✓' : '○'} Behavioral enrichment
    └─ Youmio:   ${CONFIG.youmio.apiKey ? '✓' : '○'} Provenance verification
  
  Endpoints:
    POST /api/premium        - Full integration
    POST /api/simple         - Combined middleware
    POST /api/turf-enriched  - Turf only
    POST /api/youmio-verified - Youmio only
    GET  /integrations       - Integration info
    GET  /health             - Health check
  
  Listening on port ${PORT}
  `);
});
