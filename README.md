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

## �� The Problem

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
Agents must solve a PoW challenge before heavy verification begins.

### 2. Unbonding Delay (Flash Loan Defense)
1-hour minimum unbonding period prevents flash loan attacks.

### 3. Tiered Staking (Per-Endpoint Risk)
High-value endpoints require higher stakes.

### 4. Diversity-Weighted Reputation
Agents with more unique counterparties get scoring bonuses.

### 5. Macaroon Sessions (Fast Re-auth)
Session tokens skip on-chain lookups for repeat requests.

---

## �� Smart Contracts (Fuji Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| **AgentRegistry** | [`0x0990FF7FEDf21B06C06a635E516eb4a239b0F91b`](https://testnet.snowscan.xyz/address/0x0990FF7FEDf21B06C06a635E516eb4a239b0F91b) | ERC-721 agent identity |
| **StakingModule** | [`0xb567A01E31313827533E818fd229A185e2cd30c4`](https://testnet.snowscan.xyz/address/0xb567A01E31313827533E818fd229A185e2cd30c4) | Stake, unbond, slash |
| **ReputationEngine** | [`0x8F58332CDef62a0d0C61356F785cc04491237DAD`](https://testnet.snowscan.xyz/address/0x8F58332CDef62a0d0C61356F785cc04491237DAD) | Payment-weighted scoring |
| **JobLogger** | [`0x13c80689b2549F3AB8d73E1fa01ae6097a364086`](https://testnet.snowscan.xyz/address/0x13c80689b2549F3AB8d73E1fa01ae6097a364086) | Event-based job tracking |

All contracts deployed and verified on Avalanche Fuji Testnet.

---

## 🎬 Demo

### Live Gateway Server
```bash
# Start the gateway server
cd facilitator/src && node gateway-server.js

# Server runs on http://127.0.0.1:4022
```

### API Endpoints
```bash
# List all agents
curl http://127.0.0.1:4022/api/agents

# Get agent details
curl http://127.0.0.1:4022/api/agents/0x9263C9114A3c9192fac7890067369a656075a114

# Get dynamic pricing
curl "http://127.0.0.1:4022/api/pricing?agent=0x9263C9114A3c9192fac7890067369a656075a114"

# Submit feedback
curl -X POST http://127.0.0.1:4022/api/agents/0x9263C9114A3c9192fac7890067369a656075a114/feedback \
  -H "Content-Type: application/json" \
  -d '{"positive": true}'

# Stake AVAX
curl -X POST http://127.0.0.1:4022/api/agents/0x9263C9114A3c9192fac7890067369a656075a114/stake \
  -H "Content-Type: application/json" \
  -d '{"amount": "0.1"}'
```

### Frontend Dashboard
```bash
cd frontend && npm run dev
# Open http://127.0.0.1:3000
```

### Registered Agents (Fuji)

| Agent | Address | Reputation | Tier |
|-------|---------|------------|------|
| GatewayBot Premium | `0x9263C9114A3c9192fac7890067369a656075a114` | 100 | Premium |
| DataOracle Standard | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 60 | Basic |
| NewBot Basic | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 20 | Restricted |

---

## 📁 Project Structure
```
agent-trust-gateway/
├── contracts/              # Solidity smart contracts
│   └── src/
│       ├── AgentRegistry.sol
│       ├── StakingModule.sol
│       ├── ReputationEngine.sol
│       └── JobLogger.sol
├── sdk/                    # Gateway middleware
│   └── index.js
├── integrations/           # Sponsor integrations
│   ├── thirdweb.js
│   ├── turf.js
│   └── youmio.js
├── facilitator/            # Gateway server
│   └── src/
│       ├── gateway.js      # Production middleware
│       └── gateway-server.js # Demo server
└── frontend/               # Dashboard UI
    └── app/page.tsx
```

---

## 🏆 Why AgentTrust Gateway

| Feature | Benefit |
|---------|---------|
| **Pre-payment trust** | Block bad actors before they waste resources |
| **Dynamic pricing** | Reward good agents, penalize risky ones |
| **DDoS protection** | PoW challenges prevent spam |
| **Flash loan defense** | Unbonding delays prevent exploits |
| **Session tokens** | Fast re-auth for repeat callers |
| **On-chain reputation** | Portable trust across all x402 APIs |

**We're not building another marketplace. We're building the trust layer every x402 API needs.**

---

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Foundry (for contracts)
- Avalanche Fuji testnet AVAX

### Setup
```bash
# Clone
git clone https://github.com/naga-sai007/agent-trust-gateway
cd agent-trust-gateway

# Install dependencies
cd contracts && forge install
cd ../facilitator && npm install
cd ../frontend && npm install

# Start gateway server
cd facilitator/src && node gateway-server.js

# Start frontend (new terminal)
cd frontend && npm run dev
```

### Contract Testing
```bash
cd contracts && forge test
```

---

## 📄 License

MIT

---

## 🔗 Links

- **Contracts**: [Snowscan (Fuji)](https://testnet.snowscan.xyz/address/0x0990FF7FEDf21B06C06a635E516eb4a239b0F91b)
- **Hackathon**: [Avalanche x402 Hack2Build 2025](https://x402.org)

---

<p align="center">
  <b>x402 gave us machine-native payments.<br>
  AgentTrust Gateway gives us machine-native trust.</b>
</p>
