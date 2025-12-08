# @agent-trust/gateway

> The Cloudflare for x402 APIs — drop-in trust middleware for AI agent payments

[![npm version](https://img.shields.io/npm/v/@agent-trust/gateway.svg)](https://www.npmjs.com/package/@agent-trust/gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why?

When APIs adopt x402 pay-per-call pricing, they face immediate threats:
- **Spam attacks** — bots flooding endpoints with micro-payments
- **Economic DoS** — adversaries paying to waste compute
- **No memory** — flat pricing ignores agent history

**AgentTrust Gateway** solves this by enforcing identity, reputation, and economic security **before** payment settles.

## Features

✅ **Dynamic pricing** — good agents pay less, risky agents pay more  
✅ **Reputation gating** — minimum score requirements  
✅ **Stake verification** — require skin in the game  
✅ **Risk scoring** — detect abuse patterns  
✅ **Session tokens** — fast re-authentication  
✅ **PoW protection** — anti-DDoS for high-value endpoints  
✅ **x402 compatible** — standard payment headers  

## Installation

```bash
npm install @agent-trust/gateway
```

## Quick Start

```javascript
const express = require('express');
const { AgentTrust } = require('@agent-trust/gateway');

const app = express();

// Protect your endpoint with one line
app.post('/api/gpt4', AgentTrust.protect({
  minStake: '0.1',      // 0.1 AVAX minimum stake
  minScore: 80,         // 80+ reputation required
  basePrice: 0.05       // $0.05 USDC base price
}), (req, res) => {
  // req.agentTrust contains verified agent data
  console.log('Agent:', req.agentTrust.address);
  console.log('Reputation:', req.agentTrust.reputation);
  console.log('Final Price:', req.agentTrust.pricing.finalPrice);
  
  res.json({ result: 'GPT-4 response here' });
});

app.listen(3000);
```

## Configuration Options

```javascript
AgentTrust.protect({
  // Network
  network: 'fuji',              // 'fuji' | 'avalanche'
  
  // Requirements
  minStake: '0.1',              // Min stake in AVAX (string/number/bigint)
  minScore: 80,                 // Min reputation (0-100)
  
  // Pricing
  basePrice: 0.05,              // Base price in USDC
  riskMultiplier: 'dynamic',    // 'fixed' | 'dynamic'
  
  // Blocking
  blockUnregistered: false,     // Block unknown agents
  blockUnstaked: false,         // Block agents with 0 stake
  
  // Rate limiting
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  
  // Session tokens
  sessionTTL: 300,              // Token TTL in seconds
  maxSessionRequests: 100,      // Max requests per session
  
  // Anti-DDoS
  powDifficulty: 0,             // PoW difficulty (0 = disabled)
  
  // Payment
  payTo: '0x...',               // Address to receive payments
  
  // Custom contracts (optional)
  contracts: {
    agentRegistry: '0x...',
    stakingModule: '0x...',
    reputationEngine: '0x...',
    jobLogger: '0x...'
  }
});
```

## How Pricing Works

Agents receive dynamic pricing based on their on-chain profile:

| Factor | Effect |
|--------|--------|
| Reputation 90+ | 50% discount |
| Reputation 70-89 | 25% discount |
| Reputation < 50 | 50% surcharge |
| Staked | Up to 20% discount |
| High risk score | 25-50% surcharge |
| New agent | 25% premium |

**Example:**
- Base price: $0.05
- Agent with 95 reputation + 0.5 AVAX staked
- Final price: $0.0248 (50% discount + stake bonus)

## Request Headers

### Client → Server

| Header | Description |
|--------|-------------|
| `X-Agent-Address` | Agent's wallet address |
| `X-Payment` | x402 payment proof |
| `X-Session` | Session token for fast re-auth |
| `X-PoW-Challenge` | PoW challenge (if required) |
| `X-PoW-Nonce` | PoW solution |

### Server → Client

| Header | Description |
|--------|-------------|
| `X-Session` | New session token |
| `X-Trust-Score` | Agent's reputation score |
| `X-Risk-Score` | Calculated risk score |

## Response Codes

| Status | Code | Meaning |
|--------|------|---------|
| 200 | - | Success |
| 402 | `PAYMENT_REQUIRED` | Payment needed |
| 402 | `INSUFFICIENT_STAKE` | Need more stake |
| 402 | `INSUFFICIENT_REPUTATION` | Score too low |
| 403 | `NOT_REGISTERED` | Unknown agent |
| 403 | `NO_STAKE` | No stake found |
| 403 | `BLOCKED` | Agent blocked |
| 429 | `POW_REQUIRED` | Solve PoW challenge |

## Advanced Usage

### Custom Gateway Instance

```javascript
const gateway = AgentTrust.createGateway({
  network: 'fuji',
  sessionSecret: 'your-secret-key'
});

// Access internals
const risk = gateway.riskEngine.calculateRisk('0x...');
const isBlocked = gateway.riskEngine.shouldBlock('0x...');

// Flag abuse
gateway.riskEngine.flagAbuse('0x...', 'Spam detected');
```

### Manual Pricing Calculation

```javascript
const { PricingEngine } = require('@agent-trust/gateway');

const pricing = PricingEngine.calculatePrice(0.05, {
  reputation: 95,
  riskScore: 10,
  stake: 100000000000000000n, // 0.1 AVAX in wei
  isNew: false
});

console.log(pricing.finalPrice); // 0.02475
console.log(pricing.multiplier); // 0.495
```

### Session Tokens

```javascript
const { SessionManager } = require('@agent-trust/gateway');

const sessions = new SessionManager('secret-key');

// Issue token
const token = sessions.issue('0xAgentAddress', {
  ttl: 300,
  maxRequests: 100,
  maxCost: 1.0
});

// Verify token
const result = sessions.verify(token);
if (result.valid) {
  console.log('Agent:', result.session.agentId);
}

// Revoke token
sessions.revoke(result.session.id);
```

## Contract Addresses

### Avalanche Fuji (Testnet)

| Contract | Address |
|----------|---------|
| AgentRegistry | `0xea5D764e8967b761A2Ad0817eDad81381cc6cF12` |
| StakingModule | `0x1873A4ba044e8a2c99031A851b043aC13476F0ED` |
| ReputationEngine | `0xbcFC99A4391544Baa65Df5874D7b001FFA3BA9A1` |
| JobLogger | `0x05C419d5E7070dD57613dF5dBCE1b7d3F5B3dCd2` |

## TypeScript

Full TypeScript support included:

```typescript
import { AgentTrust, GatewayConfig, AgentTrustData } from '@agent-trust/gateway';

const config: GatewayConfig = {
  minStake: '0.1',
  minScore: 80
};

app.post('/api', AgentTrust.protect(config), (req, res) => {
  const trust: AgentTrustData = req.agentTrust!;
  res.json({ agent: trust.address });
});
```

## License

MIT © AgentTrust Protocol

## Links

- [Documentation](https://docs.agenttrust.io)
- [GitHub](https://github.com/agent-trust/gateway)
- [Snowscan](https://testnet.snowscan.xyz/address/0xea5D764e8967b761A2Ad0817eDad81381cc6cF12)
