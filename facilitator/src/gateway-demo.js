/**
 * AgentTrust Gateway - Demo Script
 * 
 * Demonstrates the key value proposition:
 * - Same API, same request
 * - Different agents get different treatment
 * - Bad actors get blocked, good actors get discounts
 */

const API_BASE = 'http://localhost:4022';

// Test agents with different profiles
const AGENTS = {
  premium: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    description: 'Premium Agent (Rep: 100, Staked)',
    expected: '50% discount'
  },
  standard: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    description: 'Standard Agent (Rep: 75)',
    expected: '25% discount'
  },
  basic: {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    description: 'Basic Agent (Rep: 60)',
    expected: 'Normal price'
  },
  restricted: {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    description: 'Restricted Agent (Rep: 30)',
    expected: '50% surcharge'
  },
  unknown: {
    address: '0x0000000000000000000000000000000000000001',
    description: 'Unknown Agent (Not registered)',
    expected: 'New agent premium'
  }
};

async function runDemo() {
  console.log('='.repeat(70));
  console.log('AgentTrust Gateway - Live Demo');
  console.log('='.repeat(70));
  console.log('\nDemonstrating: Same API, different treatment based on trust\n');

  // Test 1: Get pricing for each agent
  console.log('─'.repeat(70));
  console.log('TEST 1: Dynamic Pricing Based on Reputation');
  console.log('─'.repeat(70));
  
  for (const [tier, agent] of Object.entries(AGENTS)) {
    try {
      const res = await fetch(`${API_BASE}/api/pricing?agent=${agent.address}`);
      const data = await res.json();
      
      console.log(`\n${agent.description}`);
      console.log(`  Address: ${agent.address.slice(0, 10)}...`);
      console.log(`  Reputation: ${data.agent?.reputation || 'Unknown'}`);
      console.log(`  Risk Score: ${data.agent?.riskScore || 0}`);
      console.log(`  Expected: ${agent.expected}`);
      console.log(`  Prices:`);
      
      if (data.pricing) {
        for (const [endpoint, pricing] of Object.entries(data.pricing)) {
          const discount = ((1 - pricing.multiplier) * 100).toFixed(0);
          const sign = discount >= 0 ? '-' : '+';
          console.log(`    ${endpoint}: $${pricing.finalPrice.toFixed(4)} (${sign}${Math.abs(discount)}%)`);
        }
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Test 2: Request without payment
  console.log('\n' + '─'.repeat(70));
  console.log('TEST 2: HTTP 402 Payment Required Response');
  console.log('─'.repeat(70));
  
  try {
    const res = await fetch(`${API_BASE}/api/gpt4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Address': AGENTS.premium.address
      },
      body: JSON.stringify({ prompt: 'Analyze AVAX market' })
    });
    
    const data = await res.json();
    
    console.log(`\nStatus: ${res.status} (${res.status === 402 ? 'Payment Required' : 'OK'})`);
    console.log(`Code: ${data.code}`);
    console.log(`\nPricing Details:`);
    console.log(`  Base Price: $${data.pricing?.basePrice}`);
    console.log(`  Final Price: $${data.pricing?.finalPrice?.toFixed(4)}`);
    console.log(`  Multiplier: ${data.pricing?.multiplier?.toFixed(2)}x`);
    console.log(`\nAgent Info:`);
    console.log(`  Reputation: ${data.agentInfo?.reputation}`);
    console.log(`  Risk Score: ${data.agentInfo?.riskScore}`);
    console.log(`  Registered: ${data.agentInfo?.isRegistered}`);
    console.log(`\nPolicy:`);
    console.log(`  Min Stake: ${data.policy?.minStake || 'None'}`);
    console.log(`  Min Score: ${data.policy?.minScore || 'None'}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 3: Demonstrate blocking
  console.log('\n' + '─'.repeat(70));
  console.log('TEST 3: Risk-Based Blocking Simulation');
  console.log('─'.repeat(70));
  
  console.log('\nSimulating: Rapid requests from suspicious agent...');
  
  const suspiciousAgent = '0xBAD0000000000000000000000000000000000001';
  
  // Make multiple rapid requests to trigger risk scoring
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/data-feed`, {
        headers: { 'X-Agent-Address': suspiciousAgent }
      });
      const data = await res.json();
      console.log(`  Request ${i + 1}: Status ${res.status}, Risk: ${data.agentInfo?.riskScore || 'N/A'}`);
    } catch (e) {
      // Ignore
    }
  }
  
  console.log('\n(Risk score increases with each request from the same agent)');

  // Test 4: Compare endpoints
  console.log('\n' + '─'.repeat(70));
  console.log('TEST 4: Different Tiers, Different Requirements');
  console.log('─'.repeat(70));
  
  const endpoints = [
    { path: '/api/gpt4', method: 'POST', tier: 'Premium', requirements: '80+ rep, 1 AVAX' },
    { path: '/api/claude', method: 'POST', tier: 'Standard', requirements: '50+ rep, 0.1 AVAX' },
    { path: '/api/data-feed', method: 'GET', tier: 'Open', requirements: 'None' },
    { path: '/api/discover', method: 'GET', tier: 'Staked', requirements: '70+ rep, 0.5 AVAX' }
  ];
  
  console.log('\n  Endpoint          Tier       Requirements          Status');
  console.log('  ' + '─'.repeat(64));
  
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${API_BASE}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Address': AGENTS.basic.address
        },
        body: ep.method === 'POST' ? JSON.stringify({ prompt: 'test' }) : undefined
      });
      
      const status = res.status === 402 ? '402 (Payment)' : 
                     res.status === 403 ? '403 (Blocked)' : 
                     `${res.status}`;
      
      console.log(`  ${ep.path.padEnd(18)} ${ep.tier.padEnd(10)} ${ep.requirements.padEnd(20)} ${status}`);
    } catch (e) {
      console.log(`  ${ep.path.padEnd(18)} ${ep.tier.padEnd(10)} ${ep.requirements.padEnd(20)} Error`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Demo Complete!');
  console.log('='.repeat(70));
  console.log('\nKey Takeaways:');
  console.log('  ✓ Higher reputation = Lower prices');
  console.log('  ✓ Staked agents get additional discounts');
  console.log('  ✓ High-risk agents pay more or get blocked');
  console.log('  ✓ Different endpoints have different requirements');
  console.log('  ✓ All enforced BEFORE payment and execution');
  console.log('\n');
}

// Run the demo
runDemo().catch(console.error);
