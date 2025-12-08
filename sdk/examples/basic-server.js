/**
 * Example: Basic Express server with AgentTrust protection
 * 
 * Run: node examples/basic-server.js
 */

const express = require('express');
const { AgentTrust } = require('../index');

const app = express();
app.use(express.json());

// ============================================
// TIER 1: Premium Endpoint (GPT-4)
// High requirements, high value
// ============================================

app.post('/api/gpt4', AgentTrust.protect({
  minStake: '1',        // 1 AVAX minimum
  minScore: 80,         // Premium agents only
  basePrice: 0.05,      // $0.05 base
  payTo: '0x9263c9114a3c9192fac7890067369a656075a114'
}), (req, res) => {
  res.json({
    success: true,
    result: 'GPT-4 analysis: Market is bullish with 82% confidence.',
    model: 'gpt-4-turbo',
    trust: {
      agent: req.agentTrust.address,
      reputation: req.agentTrust.reputation,
      pricePaid: req.agentTrust.pricing.finalPrice
    }
  });
});

// ============================================
// TIER 2: Standard Endpoint (Claude)
// Medium requirements
// ============================================

app.post('/api/claude', AgentTrust.protect({
  minStake: '0.1',      // 0.1 AVAX minimum
  minScore: 50,         // Standard agents
  basePrice: 0.02       // $0.02 base
}), (req, res) => {
  res.json({
    success: true,
    result: 'Claude response: I found 3 key insights in your data.',
    model: 'claude-3-sonnet',
    trust: req.agentTrust
  });
});

// ============================================
// TIER 3: Open Endpoint (Data Feed)
// No requirements, just dynamic pricing
// ============================================

app.get('/api/data', AgentTrust.protect({
  minStake: 0,
  minScore: 0,
  basePrice: 0.001      // $0.001 base
}), (req, res) => {
  res.json({
    success: true,
    data: {
      btc: 98234.50,
      eth: 3456.78,
      avax: 42.34,
      timestamp: new Date().toISOString()
    },
    trust: req.agentTrust
  });
});

// ============================================
// FREE ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  🛡️  AgentTrust Example Server
  
  Protected Endpoints:
    POST /api/gpt4   - Premium (80+ rep, 1 AVAX stake)
    POST /api/claude - Standard (50+ rep, 0.1 AVAX stake)  
    GET  /api/data   - Open (dynamic pricing only)
  
  Free Endpoints:
    GET  /health     - Health check
  
  Listening on port ${PORT}
  `);
});
