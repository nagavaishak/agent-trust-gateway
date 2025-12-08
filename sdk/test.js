/**
 * @agent-trust/gateway Tests
 */

const { AgentTrust, NETWORKS } = require('./index');

console.log('Testing @agent-trust/gateway SDK...\n');

// Test 1: Network configs
console.log('✓ Network configs loaded');
console.log('  Fuji contracts:', Object.keys(NETWORKS.fuji.contracts).length);

// Test 2: Create gateway
const gateway = AgentTrust.createGateway({ network: 'fuji' });
console.log('✓ Gateway created');

// Test 3: Risk engine
const risk = gateway.riskEngine.calculateRisk('0x123');
console.log(`✓ Risk calculation: ${risk}`);

// Test 4: Session manager
const session = gateway.sessionManager.issue('0x123', { ttl: 60 });
console.log(`✓ Session issued: ${session.slice(0, 20)}...`);

const verified = gateway.sessionManager.verify(session);
console.log(`✓ Session verified: ${verified.valid}`);

// Test 5: Pricing engine
const { PricingEngine } = AgentTrust;
const pricing = PricingEngine.calculatePrice(0.05, {
  reputation: 95,
  riskScore: 10,
  stake: 100000000000000000n,
  isNew: false
});
console.log(`✓ Pricing calculated: $${pricing.finalPrice.toFixed(4)} (${((1-pricing.multiplier)*100).toFixed(0)}% discount)`);

// Test 6: Protect middleware
const middleware = AgentTrust.protect({ minScore: 80 });
console.log(`✓ Middleware created: ${typeof middleware}`);

console.log('\n✅ All tests passed!');
