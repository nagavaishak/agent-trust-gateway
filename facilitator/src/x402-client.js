/**
 * x402 Client for Agent Trust Protocol
 * 
 * This client demonstrates how to:
 * 1. Get a 402 response with payment requirements
 * 2. Sign a payment authorization
 * 3. Send payment and access the resource
 * 
 * Usage:
 *   node x402-client.js
 * 
 * Requirements:
 *   - Testnet USDC on Avalanche Fuji
 *   - Private key with USDC balance
 */

const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.fuji' });

// Configuration
const X402_SERVER = 'http://localhost:4021';
const AGENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Premium agent

// USDC on Fuji (EIP-3009 compatible)
const USDC_ADDRESS = '0x5425890298aed601595a70AB815c96711a31Bc65';
const USDC_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function nonces(address owner) view returns (uint256)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// EIP-712 Domain for USDC
const EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 43113, // Avalanche Fuji
  verifyingContract: USDC_ADDRESS
};

// EIP-3009 TransferWithAuthorization type
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

async function main() {
  console.log('\n🚀 x402 Client - Agent Trust Protocol Demo\n');
  console.log('═'.repeat(50));

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
  
  console.log(`\n📍 Agent Address: ${AGENT_ADDRESS}`);
  console.log(`💳 Payer Address: ${wallet.address}`);

  // Check USDC balance
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
  const balance = await usdc.balanceOf(wallet.address);
  const decimals = await usdc.decimals();
  console.log(`💰 USDC Balance: ${ethers.formatUnits(balance, decimals)} USDC`);

  console.log('\n' + '═'.repeat(50));
  console.log('STEP 1: Request paid resource (expect 402)');
  console.log('═'.repeat(50));

  // Step 1: Make request without payment
  const response = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Address': AGENT_ADDRESS
    },
    body: JSON.stringify({ prompt: 'Analyze BTC market' })
  });

  console.log(`\n📡 Response Status: ${response.status}`);

  if (response.status === 402) {
    const paymentRequired = await response.json();
    
    console.log('\n💳 Payment Required!');
    console.log(`   Message: ${paymentRequired.message}`);
    
    const requirements = paymentRequired.accepts[0];
    console.log(`\n📋 Payment Requirements:`);
    console.log(`   Network: ${requirements.network}`);
    console.log(`   Amount: ${requirements.maxAmountRequired} (${parseInt(requirements.maxAmountRequired) / 1_000_000} USDC)`);
    console.log(`   Pay To: ${requirements.payTo}`);
    console.log(`   Asset: ${requirements.asset}`);
    
    if (paymentRequired.agentInfo) {
      console.log(`\n🤖 Agent Info:`);
      console.log(`   Fee Multiplier: ${paymentRequired.agentInfo.feeMultiplier}x`);
      if (paymentRequired.agentInfo.discount) {
        console.log(`   ✅ ${paymentRequired.agentInfo.discount}`);
      }
      if (paymentRequired.agentInfo.premium) {
        console.log(`   ⚠️ ${paymentRequired.agentInfo.premium}`);
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('STEP 2: Sign Payment Authorization');
    console.log('═'.repeat(50));

    // Create payment authorization (EIP-3009)
    const value = BigInt(requirements.maxAmountRequired);
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const message = {
      from: wallet.address,
      to: requirements.payTo,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce
    };

    console.log(`\n📝 Signing authorization...`);
    console.log(`   From: ${wallet.address}`);
    console.log(`   To: ${requirements.payTo}`);
    console.log(`   Value: ${ethers.formatUnits(value, 6)} USDC`);

    // Sign EIP-712 message
    const signature = await wallet.signTypedData(
      EIP712_DOMAIN,
      TRANSFER_WITH_AUTHORIZATION_TYPES,
      message
    );

    const { v, r, s } = ethers.Signature.from(signature);

    console.log(`   ✅ Signature created!`);

    // Create x402 payment payload
    const paymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: requirements.network,
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

    console.log('\n' + '═'.repeat(50));
    console.log('STEP 3: Send Payment & Access Resource');
    console.log('═'.repeat(50));

    // Step 3: Make request with payment
    console.log(`\n📤 Sending request with X-PAYMENT header...`);

    const paidResponse = await fetch(`${X402_SERVER}/api/ai-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Address': AGENT_ADDRESS,
        'X-PAYMENT': paymentHeader
      },
      body: JSON.stringify({ prompt: 'Analyze BTC market' })
    });

    console.log(`📡 Response Status: ${paidResponse.status}`);

    if (paidResponse.status === 200) {
      const result = await paidResponse.json();
      console.log(`\n✅ SUCCESS! Resource accessed!`);
      console.log(`\n📊 AI Analysis Result:`);
      console.log(`   ${result.result}`);
      console.log(`   Model: ${result.model}`);
      console.log(`   Tokens: ${result.tokens_used}`);
      
      if (result.payment) {
        console.log(`\n💸 Payment Info:`);
        console.log(`   Amount: $${result.payment.amount} USDC`);
        console.log(`   TX Hash: ${result.payment.txHash || 'Pending settlement'}`);
      }
    } else {
      const error = await paidResponse.json();
      console.log(`\n❌ Payment failed: ${error.message || error.error}`);
    }

  } else if (response.status === 200) {
    // Shouldn't happen without payment
    const result = await response.json();
    console.log('\n✅ Access granted (unexpected - no payment required?)');
    console.log(result);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('Demo Complete!');
  console.log('═'.repeat(50) + '\n');
}

// Demo: Just show the 402 flow without actual payment
async function demoFlow() {
  console.log('\n🎬 x402 Demo Flow - Agent Trust Protocol\n');
  console.log('═'.repeat(50));

  // Step 1: Get payment info
  console.log('\n📋 STEP 1: Check pricing for different agents\n');

  const premiumAgent = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const basicAgent = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

  for (const agent of [premiumAgent, basicAgent]) {
    const infoRes = await fetch(`${X402_SERVER}/api/payment-info?agent=${agent}`);
    const info = await infoRes.json();
    
    console.log(`Agent: ${agent.slice(0, 10)}...`);
    console.log(`Fee Multiplier: ${info.agentInfo.feeMultiplier}x`);
    console.log(`AI Service Price: $${info.services[0].finalPrice.toFixed(4)} USDC`);
    console.log('');
  }

  // Step 2: Request without payment
  console.log('═'.repeat(50));
  console.log('\n📋 STEP 2: Request AI Service (expect 402)\n');

  const response = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Address': premiumAgent
    },
    body: JSON.stringify({ prompt: 'What is the meaning of life?' })
  });

  if (response.status === 402) {
    const data = await response.json();
    console.log('✅ Received HTTP 402 Payment Required');
    console.log(`\nMessage: ${data.message}`);
    console.log(`\nPayment Requirements:`);
    console.log(JSON.stringify(data.accepts[0], null, 2));
    
    console.log(`\nAgent Discount Info:`);
    console.log(JSON.stringify(data.agentInfo, null, 2));
  }

  console.log('\n' + '═'.repeat(50));
  console.log('\n🎉 This is the x402 flow!');
  console.log('   1. Client requests resource');
  console.log('   2. Server returns 402 with payment requirements');
  console.log('   3. Client signs EIP-3009 authorization');
  console.log('   4. Client sends X-PAYMENT header');
  console.log('   5. Server verifies & settles via facilitator');
  console.log('   6. Client receives resource\n');
}

// Run demo or full flow
const args = process.argv.slice(2);
if (args.includes('--full')) {
  main().catch(console.error);
} else {
  demoFlow().catch(console.error);
}