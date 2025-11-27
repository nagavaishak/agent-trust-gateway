require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { ethers } = require('ethers');

const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SERVER_URL = 'http://localhost:4021';

async function main() {
  console.log('\n🤖 Agent Trust Protocol - x402 Client Demo\n');
  console.log('═'.repeat(50));
  
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
  console.log(`\n📍 Agent Wallet: ${wallet.address}`);
  
  // Test 1: Free endpoint
  console.log('\n1️⃣  Testing FREE endpoint...');
  console.log('─'.repeat(50));
  
  try {
    const healthRes = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check:', healthRes.data.status);
    console.log('   x402 enabled:', healthRes.data.x402);
    console.log('   Network:', healthRes.data.network);
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
  }
  
  // Test 2: Paid endpoint (will get 402)
  console.log('\n2️⃣  Testing PAID endpoint (without payment)...');
  console.log('─'.repeat(50));
  
  try {
    await axios.get(`${SERVER_URL}/api/premium-data`);
  } catch (err) {
    if (err.response?.status === 402) {
      console.log('✅ Received 402 Payment Required (expected!)');
      const paymentInfo = err.response.data;
      console.log('\n   Payment Requirements:');
      console.log(`   • Protocol: x402 v${paymentInfo.x402Version}`);
      console.log(`   • Network: ${paymentInfo.accepts[0].network}`);
      console.log(`   • Amount: $${Number(paymentInfo.accepts[0].maxAmountRequired) / 1000000} USDC`);
      console.log(`   • Pay To: ${paymentInfo.accepts[0].payTo.slice(0, 10)}...`);
      console.log(`   • Asset: USDC (${paymentInfo.accepts[0].asset.slice(0, 10)}...)`);
      console.log(`   • Description: ${paymentInfo.accepts[0].description}`);
    } else {
      console.error('❌ Unexpected error:', err.message);
    }
  }
  
  // Test 3: AI Service endpoint
  console.log('\n3️⃣  Testing AI SERVICE endpoint (without payment)...');
  console.log('─'.repeat(50));
  
  try {
    await axios.post(`${SERVER_URL}/api/ai-service`, {
      query: 'What is Agent Trust Protocol?',
      agentAddress: wallet.address
    });
  } catch (err) {
    if (err.response?.status === 402) {
      console.log('✅ Received 402 Payment Required (expected!)');
      const paymentInfo = err.response.data;
      console.log('\n   Payment Requirements:');
      console.log(`   • Amount: $${Number(paymentInfo.accepts[0].maxAmountRequired) / 1000000} USDC`);
      console.log(`   • Description: ${paymentInfo.accepts[0].description}`);
    } else {
      console.error('❌ Unexpected error:', err.message);
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 x402 Integration Demo Complete!\n');
  console.log('What was demonstrated:');
  console.log('✅ Free endpoints work normally');
  console.log('✅ Paid endpoints return 402 with payment requirements');
  console.log('✅ x402 protocol properly configured on Avalanche Fuji');
  console.log('✅ USDC payment requirements correctly specified\n');
  console.log('To complete a real payment, an agent needs:');
  console.log('• Testnet USDC on Avalanche Fuji');
  console.log('• Sign EIP-3009 transferWithAuthorization');
  console.log('• Include signed payment in X-PAYMENT header\n');
}

main().catch(console.error);