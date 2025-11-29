/**
 * Real x402 Payment Test - Agent Trust Protocol
 * 
 * This script makes an ACTUAL payment using testnet USDC on Avalanche Fuji
 */

const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.fuji' });

// Configuration
const X402_SERVER = 'http://localhost:4021';
const AGENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// USDC on Fuji
const USDC_ADDRESS = '0x5425890298aed601595a70AB815c96711a31Bc65';
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)'
];

async function main() {
  console.log('\n🚀 Real x402 Payment Test - Agent Trust Protocol\n');
  console.log('═'.repeat(60));

  // Setup
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

  // Check balance
  const balance = await usdc.balanceOf(wallet.address);
  console.log(`\n💳 Wallet: ${wallet.address}`);
  console.log(`💰 USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);

  // ============================================
  // STEP 1: Get 402 Response
  // ============================================
  console.log('\n' + '─'.repeat(60));
  console.log('📡 STEP 1: Request Service (Expect 402)');
  console.log('─'.repeat(60));

  const response = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Address': AGENT_ADDRESS
    },
    body: JSON.stringify({ prompt: 'Analyze AVAX price prediction' })
  });

  console.log(`Status: ${response.status}`);

  if (response.status !== 402) {
    console.log('Expected 402, got:', response.status);
    return;
  }

  const paymentRequired = await response.json();
  const requirements = paymentRequired.accepts[0];

  console.log(`\n💳 Payment Required:`);
  console.log(`   Amount: ${requirements.maxAmountRequired} units (${parseInt(requirements.maxAmountRequired) / 1_000_000} USDC)`);
  console.log(`   Pay To: ${requirements.payTo}`);
  console.log(`   Network: ${requirements.network}`);
  
  if (paymentRequired.agentInfo) {
    console.log(`\n🤖 Agent Info:`);
    console.log(`   Reputation: ${paymentRequired.agentInfo.reputation}`);
    console.log(`   Tier: ${paymentRequired.agentInfo.tier}`);
    console.log(`   Fee Multiplier: ${paymentRequired.agentInfo.feeMultiplier}x`);
    if (paymentRequired.agentInfo.discount) {
      console.log(`   ✅ ${paymentRequired.agentInfo.discount}`);
    }
  }

  // ============================================
  // STEP 2: Create EIP-3009 Authorization
  // ============================================
  console.log('\n' + '─'.repeat(60));
  console.log('🔐 STEP 2: Sign EIP-3009 Payment Authorization');
  console.log('─'.repeat(60));

  const value = BigInt(requirements.maxAmountRequired);
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  // EIP-712 Domain
  const domain = {
    name: 'USD Coin',
    version: '2',
    chainId: 43113,
    verifyingContract: USDC_ADDRESS
  };

  // EIP-3009 TransferWithAuthorization type
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  const message = {
    from: wallet.address,
    to: requirements.payTo,
    value: value,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce
  };

  console.log(`\n📝 Authorization Details:`);
  console.log(`   From: ${wallet.address}`);
  console.log(`   To: ${requirements.payTo}`);
  console.log(`   Value: ${ethers.formatUnits(value, 6)} USDC`);
  console.log(`   Valid Until: ${new Date(validBefore * 1000).toISOString()}`);

  // Sign EIP-712 typed data
  console.log(`\n✍️  Signing authorization...`);
  const signature = await wallet.signTypedData(domain, types, message);
  console.log(`   ✅ Signature: ${signature.slice(0, 20)}...`);

  // ============================================
  // STEP 3: Create x402 Payment Payload
  // ============================================
  console.log('\n' + '─'.repeat(60));
  console.log('📦 STEP 3: Create x402 Payment Payload');
  console.log('─'.repeat(60));

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'avalanche-fuji',
    payload: {
      signature: signature,
      authorization: {
        from: wallet.address,
        to: requirements.payTo,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce
      }
    }
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  console.log(`   ✅ Payment header created (${paymentHeader.length} bytes)`);

  // ============================================
  // STEP 4: Send Payment & Access Resource
  // ============================================
  console.log('\n' + '─'.repeat(60));
  console.log('💸 STEP 4: Send Payment Request');
  console.log('─'.repeat(60));

  console.log(`\n📤 Sending request with X-PAYMENT header...`);

  const paidResponse = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Address': AGENT_ADDRESS,
      'X-PAYMENT': paymentHeader
    },
    body: JSON.stringify({ prompt: 'Analyze AVAX price prediction' })
  });

  console.log(`Status: ${paidResponse.status}`);

  const result = await paidResponse.json();

  if (paidResponse.status === 200) {
    console.log(`\n✅ SUCCESS! Payment accepted, resource delivered!\n`);
    console.log('─'.repeat(60));
    console.log('📊 AI Service Response:');
    console.log('─'.repeat(60));
    console.log(`\n${result.result}\n`);
    console.log(`Model: ${result.model}`);
    console.log(`Tokens: ${result.tokens_used}`);
    
    if (result.payment) {
      console.log(`\n💰 Payment Details:`);
      console.log(`   Amount: $${result.payment.amount} USDC`);
      console.log(`   Agent: ${result.payment.agentAddress}`);
      console.log(`   Tier: ${result.payment.tier}`);
      console.log(`   TX Hash: ${result.payment.txHash || 'Settled via facilitator'}`);
    }
  } else if (paidResponse.status === 402) {
    console.log(`\n❌ Payment rejected:`);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n⚠️ Unexpected response:`);
    console.log(JSON.stringify(result, null, 2));
  }

  // Check final balance
  const finalBalance = await usdc.balanceOf(wallet.address);
  console.log(`\n💰 Final USDC Balance: ${ethers.formatUnits(finalBalance, 6)} USDC`);
  
  const spent = balance - finalBalance;
  if (spent > 0n) {
    console.log(`💸 Spent: ${ethers.formatUnits(spent, 6)} USDC`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Real x402 Payment Test Complete!');
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);