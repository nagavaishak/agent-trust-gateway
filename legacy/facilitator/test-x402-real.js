/**
 * Test Real x402 Payment
 * 
 * This script creates a real EIP-3009 signed payment and sends it to the x402 server.
 * When REAL_PAYMENTS=true on the server, this will execute an actual USDC transfer.
 */

const { ethers } = require('ethers');

// Configuration
const X402_SERVER = 'http://localhost:4021';
const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';
const USDC_ADDRESS = '0x5425890298aed601595a70AB815c96711a31Bc65';
const SERVER_WALLET = '0x9263c9114a3c9192fac7890067369a656075a114';

// Test agent - Agent #1 (Premium, 100 rep, 0.5x fee)
const AGENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const AGENT_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// EIP-712 Domain for USDC on Fuji
const DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 43113,
  verifyingContract: USDC_ADDRESS
};

// EIP-3009 TransferWithAuthorization types
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
  console.log('='.repeat(60));
  console.log('Testing Real x402 Payment Flow');
  console.log('='.repeat(60));

  // Setup wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 43113, name: 'avalanche-fuji' });
  const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);

  console.log(`\nAgent: ${wallet.address}`);
  console.log(`Server: ${SERVER_WALLET}`);

  // Step 1: Get payment requirements
  console.log('\n[1] Getting payment requirements...');
  
  const infoRes = await fetch(`${X402_SERVER}/api/payment-info?agent=${AGENT_ADDRESS}`);
  const info = await infoRes.json();
  
  console.log(`  Payment Mode: ${info.paymentMode}`);
  console.log(`  Agent Reputation: ${info.agentInfo.reputation}`);
  console.log(`  Fee Multiplier: ${info.agentInfo.feeMultiplier}x`);
  console.log(`  AI Service Price: $${info.services[0].finalPrice} USDC`);

  // Step 2: Make request without payment (should get 402)
  console.log('\n[2] Requesting AI service without payment...');
  
  const res402 = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Agent-Address': AGENT_ADDRESS
    },
    body: JSON.stringify({ prompt: 'Analyze AVAX price' })
  });

  if (res402.status !== 402) {
    console.log(`  Unexpected status: ${res402.status}`);
    return;
  }

  const paymentRequired = await res402.json();
  console.log(`  Status: ${res402.status} Payment Required`);
  console.log(`  Amount: ${paymentRequired.accepts[0].maxAmountRequired} units`);
  console.log(`  Pay To: ${paymentRequired.accepts[0].payTo}`);

  // Step 3: Create EIP-3009 signed authorization
  console.log('\n[3] Creating EIP-3009 authorization...');
  
  const amount = paymentRequired.accepts[0].maxAmountRequired;
  const now = Math.floor(Date.now() / 1000);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  
  const authorization = {
    from: wallet.address,
    to: SERVER_WALLET,
    value: amount,
    validAfter: 0,
    validBefore: now + 3600, // Valid for 1 hour
    nonce: nonce
  };

  console.log(`  From: ${authorization.from}`);
  console.log(`  To: ${authorization.to}`);
  console.log(`  Value: ${authorization.value} (${Number(authorization.value) / 1_000_000} USDC)`);
  console.log(`  Nonce: ${nonce.slice(0, 20)}...`);

  // Sign the authorization
  const signature = await wallet.signTypedData(DOMAIN, TRANSFER_WITH_AUTHORIZATION_TYPES, authorization);
  console.log(`  Signature: ${signature.slice(0, 20)}...`);

  // Step 4: Create payment payload
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'avalanche-fuji',
    payload: {
      signature: signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce
      }
    }
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  console.log(`  Payment header created (${paymentHeader.length} chars)`);

  // Step 5: Send payment
  console.log('\n[4] Sending payment...');
  
  const resPaid = await fetch(`${X402_SERVER}/api/ai-service`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Agent-Address': AGENT_ADDRESS,
      'X-Payment': paymentHeader
    },
    body: JSON.stringify({ prompt: 'Analyze AVAX price prediction for Q1 2025' })
  });

  const result = await resPaid.json();

  if (resPaid.status === 200) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ PAYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`\nStatus: ${resPaid.status}`);
    console.log(`Result: ${result.result?.slice(0, 80)}...`);
    console.log(`\nPayment Details:`);
    console.log(`  Amount: $${result.payment?.amount} USDC`);
    console.log(`  TX Hash: ${result.payment?.txHash}`);
    console.log(`  Real Payment: ${result.payment?.realPayment}`);
    if (result.payment?.explorerUrl) {
      console.log(`  Explorer: ${result.payment.explorerUrl}`);
    }
  } else {
    console.log(`\n❌ Payment failed: ${resPaid.status}`);
    console.log(JSON.stringify(result, null, 2));
  }

  // Step 6: Check balance
  console.log('\n[5] Checking server balance...');
  const balanceRes = await fetch(`${X402_SERVER}/api/balance`);
  const balance = await balanceRes.json();
  console.log(`  Server USDC: ${balance.balanceFormatted} USDC`);
}

main().catch(console.error);