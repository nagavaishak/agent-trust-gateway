# AgentTrust Gateway

> **The Cloudflare for x402 APIs** — Drop-in trust middleware that enforces identity, reputation, staking, and economic security **before** payment settles.

[![Avalanche](https://img.shields.io/badge/Avalanche-Fuji-red)](https://testnet.snowscan.xyz)
[![x402](https://img.shields.io/badge/x402-Compatible-blue)](https://www.x402.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```javascript
import { AgentTrust } from '@agent-trust/gateway';

app.use('/api/gpt4', AgentTrust.protect({
  minStake: '0.5',    // 0.5 AVAX required
  minScore: 80,       // 80+ reputation
  basePrice: 0.05     // Dynamic pricing from $0.025-$0.075
}));
```

**Two lines. Full protection.**

---

## 🎯 The Problem

When APIs adopt x402 pay-per-call pricing, they face immediate threats:

| Attack | Description | Impact |
|--------|-------------|--------|
| **Spam Floods** | Bots making millions of micro-payments | Infrastructure overload |
| **Economic DoS** | Adversaries paying to waste compute | $$$$ in GPU costs |
| **Sybil Attacks** | Fake agents gaming reputation | Trust collapse |
| **Flash Loan Exploits** | Stake → abuse → unstake in one block | Zero accountability |

**x402 answers "can you pay?" but not "should we serve you?"**

---

## 💡 The Solution

AgentTrust Gateway is the **missing trust layer** for x402:

```
Request → PoW Check → Stake Verify → Rep Check → Risk Score → Dynamic Price → Payment → Execute
         ─────────────────── BEFORE PAYMENT ───────────────────
```

### What It Does

✅ **Gates access** — Block agents below stake/reputation thresholds  
✅ **Dynamic pricing** — Good agents pay less, risky agents pay more  
✅ **Session tokens** — Macaroons for fast re-authentication  
✅ **DDoS protection** — PoW challenges before heavy verification  
✅ **Flash loan defense** — 1-hour unbonding delay on stakes  
✅ **Anti-sybil** — Diversity-weighted reputation scoring  

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentTrust Gateway                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   PoW    │→ │  Stake   │→ │   Rep    │→ │  Price   │→ x402 │
│  │  Check   │  │  Verify  │  │  Check   │  │  Calc    │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       ↓              ↓            ↓             ↓              │
│  ┌─────────────────────────────────────────────────────────────┐
│  │              On-Chain Contracts (Fuji)                      │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  │ AgentReg    │ │  Staking    │ │ Reputation  │           │
│  │  │ (ERC-721)   │ │  Module     │ │  Engine     │           │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  Sponsors: Thirdweb (payments) │ Turf (behavior) │ Youmio (DIDs)│
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Installation

```bash
npm install @agent-trust/gateway
```

### Basic Usage

```javascript
const express = require('express');
const { AgentTrust } = require('@agent-trust/gateway');

const app = express();

// Protect your expensive AI endpoint
app.post('/api/gpt4', AgentTrust.protect({
  minStake: '1',        // 1 AVAX minimum stake
  minScore: 80,         // 80+ reputation required
  basePrice: 0.05,      // $0.05 USDC base price
  network: 'fuji'
}), (req, res) => {
  // Only verified, staked, reputable agents reach here
  console.log('Agent:', req.agentTrust.address);
  console.log('Reputation:', req.agentTrust.reputation);
  console.log('Price paid:', req.agentTrust.pricing.finalPrice);
  
  res.json({ result: 'Premium AI response' });
});

app.listen(3000);
```

### With Sponsor Integrations

```javascript
const { AgentTrust } = require('@agent-trust/gateway');
const { verifyPayment, enrichWithTurf, enrichWithYoumio } = require('@agent-trust/gateway/integrations');

app.post('/api/premium',
  AgentTrust.protect({ minStake: '1', minScore: 80 }),
  verifyPayment({ network: 'fuji' }),      // Thirdweb settlement
  enrichWithTurf(),                         // Behavioral scoring
  enrichWithYoumio(),                       // DID verification
  (req, res) => {
    // Full trust stack applied
    res.json({ result: 'Ultra-premium response' });
  }
);
```

---

## 📊 Dynamic Pricing

Agents receive personalized pricing based on their on-chain profile:

| Factor | Good Agent | Risky Agent |
|--------|------------|-------------|
| Reputation 90+ | **-50%** | — |
| Reputation 70-89 | **-25%** | — |
| Reputation < 50 | — | **+50%** |
| Staked (0.1+ AVAX) | **-20%** | — |
| High risk score | — | **+25-50%** |
| New/unknown agent | — | **+25%** |

**Example:**
- Base price: $0.05
- Agent with 95 reputation + 1 AVAX staked → **$0.024** (52% discount)
- Agent with 30 reputation + no stake → **$0.094** (88% surcharge)

---

## 🔐 Security Features

### 1. Proof of Work (Anti-DDoS)

```javascript
AgentTrust.protect({
  powDifficulty: 4  // Require 4 leading zeros in hash
});
```

Agents must solve a PoW challenge before heavy verification begins.

### 2. Unbonding Delay (Flash Loan Defense)

```solidity
// StakingModule.sol
uint256 public unbondingPeriod = 1 hours; // Minimum 1 hour

function requestUnstake(uint256 amount) external {
    // Stake locked for unbondingPeriod
    unlockTime = block.timestamp + unbondingPeriod;
}
```

No instant unstaking = no flash loan attacks.

### 3. Tiered Staking (Per-Endpoint Risk)

```javascript
// High-value endpoint = higher stake requirement
app.use('/api/gpt4', AgentTrust.protect({ minStake: '1' }));    // 1 AVAX
app.use('/api/basic', AgentTrust.protect({ minStake: '0.1' })); // 0.1 AVAX
```

### 4. Diversity-Weighted Reputation

```solidity
// ReputationEngine.sol
score = (totalWeightedRating / totalWeight) + diversityBonus;

// Agents with more unique counterparties get bonus
diversityBonus = min(uniqueRaters / 10, 10); // Up to +10 points
```

### 5. Macaroon Sessions (Fast Re-auth)

```javascript
// First request: full verification + payment
// Response includes: X-Session: <macaroon>

// Subsequent requests: just send the macaroon
headers: { 'X-Session': macaroon }
// Skips on-chain lookups, validates locally
```

---

## 📜 Smart Contracts (Fuji Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| **AgentRegistry** | [`0xea5D764e8967b761A2Ad0817eDad81381cc6cF12`](https://testnet.snowscan.xyz/address/0xea5d764e8967b761a2ad0817edad81381cc6cf12) | ERC-721 agent identity |
| **StakingModule** | [`0x1873A4ba044e8a2c99031A851b043aC13476F0ED`](https://testnet.snowscan.xyz/address/0x1873a4ba044e8a2c99031a851b043ac13476f0ed) | Stake, unbond, slash |
| **ReputationEngine** | [`0xbcFC99A4391544Baa65Df5874D7b001FFA3BA9A1`](https://testnet.snowscan.xyz/address/0xbcfc99a4391544baa65df5874d7b001ffa3ba9a1) | Payment-weighted scoring |
| **JobLogger** | [`0x05C419d5E7070dD57613dF5dBCE1b7d3F5B3dCd2`](https://testnet.snowscan.xyz/address/0x05c419d5e7070dd57613df5dbce1b7d3f5b3dcd2) | Event-based job tracking |

All contracts verified on Snowscan.

---

## 🔌 Sponsor Integrations

### Thirdweb (Payment Settlement)

```javascript
const { verifyPayment } = require('@agent-trust/gateway/integrations');

// Settles via Thirdweb + independent on-chain verification
app.use('/api', verifyPayment({ network: 'fuji' }));
```

### Turf Network (Behavioral Data)

```javascript
const { enrichWithTurf } = require('@agent-trust/gateway/integrations');

// Enriches trust decisions with behavioral scoring
app.use('/api', enrichWithTurf());
// req.agentTrust.turf.behaviorScore, .riskMultiplier
```

### Youmio (Agent Provenance)

```javascript
const { enrichWithYoumio } = require('@agent-trust/gateway/integrations');

// Verifies DIDs and applies trust boost
app.use('/api', enrichWithYoumio());
// req.agentTrust.youmio.verified, .trustBoost
```

---

## 🎬 Demo

### Live Gateway

```bash
# Start the gateway server
cd facilitator && node src/gateway-server.js

# Test with different agents
curl "http://localhost:4022/api/pricing?agent=0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
```

### What You'll See

| Agent | Reputation | Stake | Price | Access |
|-------|------------|-------|-------|--------|
| Premium Agent | 100 | 0.1 AVAX | $0.024 | ✅ Allowed |
| Standard Agent | 80 | 0 | $0.038 | ✅ Allowed |
| Basic Agent | 60 | 0 | $0.050 | ✅ Allowed |
| Restricted Agent | 40 | 0 | $0.075 | ⚠️ Higher price |
| Blocked Agent | 20 | 0 | — | ❌ Blocked |

---

## 📁 Project Structure

```
agent-trust-protocol/
├── contracts/              # Solidity smart contracts
│   └── src/
│       ├── AgentRegistry.sol
│       ├── StakingModule.sol
│       ├── ReputationEngine.sol
│       └── JobLogger.sol
├── sdk/                    # npm package (@agent-trust/gateway)
│   ├── index.js
│   ├── index.d.ts
│   └── README.md
├── integrations/           # Sponsor integrations
│   ├── thirdweb.js
│   ├── turf.js
│   └── youmio.js
├── facilitator/            # Gateway server
│   └── src/
│       ├── gateway.js
│       └── gateway-server.js
└── frontend/               # Dashboard UI
```

---

## 🏆 Why AgentTrust Gateway Wins

| vs. Raw x402 | vs. Amiko (Solana winner) |
|--------------|---------------------------|
| ✅ Pre-payment trust checks | ✅ Different layer (infra, not marketplace) |
| ✅ Dynamic pricing | ✅ Works with ANY x402 API |
| ✅ DDoS protection | ✅ SDK-first approach |
| ✅ Flash loan defense | ✅ On Avalanche (not duplicate) |
| ✅ Session resumption | ✅ Sponsor integrations |

**We're not building another marketplace. We're building the backbone every marketplace will need.**

---

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Foundry (for contracts)
- Avalanche Fuji testnet AVAX

### Setup

```bash
# Clone
git clone https://github.com/agent-trust/gateway
cd gateway

# Install SDK
cd sdk && npm install

# Install contracts
cd ../contracts && forge install

# Deploy (optional - already deployed)
forge script script/DeployGateway.s.sol --rpc-url fuji --broadcast
```

### Testing

```bash
# Contract tests
cd contracts && forge test

# SDK tests
cd sdk && npm test

# Integration tests
cd integrations && npm test
```

---

## 📄 License

MIT © AgentTrust Protocol

---

## 🔗 Links

- **Contracts**: [Snowscan (Fuji)](https://testnet.snowscan.xyz/address/0xea5d764e8967b761a2ad0817edad81381cc6cf12)
- **Demo Video**: [Coming Soon]
- **Hackathon**: [Avalanche x402 Hack2Build 2025](https://x402.org)

---

<p align="center">
  <b>x402 gave us machine-native payments.<br>
  AgentTrust Gateway gives us machine-native trust.</b>
</p>