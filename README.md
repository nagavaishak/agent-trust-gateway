# Agent Trust Protocol

> Decentralized Credit Scores for AI Agents on Avalanche

**Built for Avalanche x402 Hack2Build 2025**

---

## 🎯 Overview

Agent Trust Protocol creates a **decentralized credit score system for AI agents** by combining:

- **ERC-8004** — Agent identity standard (NFT-based passports)
- **x402 Protocol** — HTTP payment gating with reputation-based pricing
- **Teleporter** — Cross-chain reputation sync across Avalanche L1s

### The Problem

As AI agents proliferate, how do you know which ones to trust? Current solutions rely on centralized reputation systems that can be gamed.

### The Solution

Payment-weighted on-chain reputation. Agents build credit history through their payment interactions — larger payments carry more weight. This reputation travels with them across Avalanche L1s via Teleporter.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    x402 Payment Server                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ HTTP 402    │  │  Reputation  │  │   Dynamic Pricing      │  │
│  │ Response    │──│  Check       │──│   (0.5x - 2.0x)        │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Avalanche Fuji C-Chain                        │
│  ┌─────────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │ AgentIdentity   │  │ Reputation    │  │ CrossChain       │   │
│  │ (ERC-721)       │──│ Registry      │──│ Reputation       │   │
│  └─────────────────┘  └───────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Teleporter
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Avalanche Dispatch L1                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           CrossChainReputationReceiver                   │   │
│  │           (Receives reputation from Fuji)                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📜 Smart Contracts

### Fuji C-Chain (Chain ID: 43113)

| Contract | Address | Verified |
|----------|---------|----------|
| AgentIdentity | [`0xeCB96A74eEa4A6a7ac09658AB87650738D1d2412`](https://testnet.snowscan.xyz/address/0xeCB96A74eEa4A6a7ac09658AB87650738D1d2412) | ✅ |
| ReputationRegistry | [`0x3A21fE046C7E8CD9e350a8DA3b133BFa0dA27dc4`](https://testnet.snowscan.xyz/address/0x3A21fE046C7E8CD9e350a8DA3b133BFa0dA27dc4) | ✅ |
| CrossChainReputation | [`0x5c8dfe8484423a9370AcC451Af0083F103eA48d4`](https://testnet.snowscan.xyz/address/0x5c8dfe8484423a9370AcC451Af0083F103eA48d4) | ✅ |

### Dispatch L1 (Chain ID: 779672)

| Contract | Address | Purpose |
|----------|---------|---------|
| CrossChainReputationReceiver | [`0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8`](https://subnets.avax.network/dispatch/testnet/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8) | Receives reputation from Fuji |

### Cross-Chain Configuration

| Chain | Blockchain ID |
|-------|---------------|
| Fuji C-Chain | `0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5` |
| Dispatch | `0x9f3be606497285d0ffbb5ac9ba24aa60346a9b1812479ed66cb329f394a4b1c7` |

**Teleporter Messenger:** `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf` (same on all chains)

---

## 🔗 Cross-Chain Proof

We sent a **real Teleporter message** syncing Agent #1's reputation from Fuji to Dispatch:

**Transaction:** [`0xd3e9c290290c489383a9cefe4ff8dc32d2d792f383f99418e43691b516ef83ff`](https://testnet.snowscan.xyz/tx/0xd3e9c290290c489383a9cefe4ff8dc32d2d792f383f99418e43691b516ef83ff)

The transaction shows:
- Teleporter Messenger contract called
- Warp precompile (`0x0200000000000000000000000000000000000005`) emitted cross-chain message
- Agent #1's reputation score (100) encoded in payload

---

## 💰 x402 Payment Flow

```
Agent                    x402 Server                 Service
  │                           │                         │
  │  GET /api/ai-service      │                         │
  │ ─────────────────────────>│                         │
  │                           │                         │
  │  HTTP 402 + Payment Req   │                         │
  │ <─────────────────────────│                         │
  │                           │                         │
  │  Sign EIP-3009 Payment    │                         │
  │ ─────────────────────────>│                         │
  │                           │  Verify Reputation      │
  │                           │ ───────────────────────>│
  │                           │                         │
  │  HTTP 200 + Response      │                         │
  │ <─────────────────────────│                         │
```

### Reputation Tiers & Pricing

| Tier | Reputation | Fee Multiplier | Benefit |
|------|------------|----------------|---------|
| Premium | 90-100 | 0.5x | 50% discount |
| Standard | 70-89 | 1.0x | Normal price |
| Basic | 50-69 | 1.5x | 50% premium |
| Restricted | 0-49 | 2.0x | 100% premium |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Foundry (forge, cast)
- Git

### Installation

```bash
# Clone the repo
git clone https://github.com/nagavaishak/agent-trust-protocol.git
cd agent-trust-protocol

# Install contract dependencies
cd contracts
forge install

# Install facilitator dependencies
cd ../facilitator
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Run Locally

```bash
# Terminal 1: Main API (port 3000)
cd facilitator
cp .env.example .env.fuji  # Configure with contract addresses
node src/index.js

# Terminal 2: x402 Server (port 4021)
cd facilitator
node src/x402-server.js

# Terminal 3: Frontend (port 3000)
cd frontend
npm run dev
```

### Test the System

```bash
# Register an agent
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agentAddress": "0x...", "metadataURI": "ipfs://..."}'

# Submit feedback (builds reputation)
curl -X POST http://localhost:3000/agents/1/feedback \
  -H "Content-Type: application/json" \
  -d '{"score": 1, "paymentAmount": "10"}'

# Check x402 pricing
curl "http://localhost:4021/api/payment-info?agent=0x..."

# Request paid service (returns 402)
curl -X POST http://localhost:4021/api/ai-service

# Run real payment test
node src/test-real-payment.js
```

---

## 📁 Project Structure

```
agent-trust-protocol/
├── contracts/
│   ├── src/
│   │   ├── AgentIdentity.sol           # ERC-721 agent passports
│   │   ├── ReputationRegistry.sol      # Payment-weighted scoring
│   │   ├── CrossChainReputation.sol    # Teleporter sender (Fuji)
│   │   └── CrossChainReputationReceiver.sol  # Teleporter receiver (Dispatch)
│   ├── test/                           # Foundry tests (18 passing)
│   └── script/
│       ├── Deploy.s.sol                # Fuji deployment
│       └── DeployDispatch.s.sol        # Dispatch deployment
├── facilitator/
│   └── src/
│       ├── index.js                    # Main API server
│       ├── x402-server.js              # x402 payment server
│       └── test-real-payment.js        # Payment flow test
├── frontend/
│   └── app/
│       └── page.tsx                    # Dashboard UI
├── PRECOMPILE_ARCHITECTURE.md          # Future: Native VM integration
└── README.md
```

---

## 🔧 API Endpoints

### Main API (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/register` | Register new agent |
| GET | `/agents/by-address/:addr` | Get agent details |
| GET | `/agents/discover` | Find agents with filters |
| GET | `/agents/leaderboard` | Top agents by reputation |
| POST | `/agents/:id/feedback` | Submit feedback |
| POST | `/x402/verify` | Verify agent for payment |
| GET | `/agents/:id/crosschain` | Cross-chain reputation |
| GET | `/stats` | Protocol statistics |

### x402 Server (Port 4021)

| Method | Endpoint | Base Price | Description |
|--------|----------|------------|-------------|
| POST | `/api/ai-service` | $0.01 USDC | AI-powered analysis |
| GET | `/api/premium-data` | $0.001 USDC | Real-time market data |
| GET | `/api/discover-agents` | $0.005 USDC | Find high-rep agents |
| GET | `/api/payment-info` | Free | Get pricing for agent |

---

## 🧪 Test Results

```bash
$ forge test

[PASS] testRegisterAgent() 
[PASS] testGetAgent()
[PASS] testIsRegisteredAgent()
[PASS] testSubmitFeedback()
[PASS] testReputationScore()
[PASS] testMeetsThreshold()
[PASS] testCrossChainSync()
...

Test result: ok. 18 passed; 0 failed
```

---

## 🔮 Future: Precompile Architecture

See [PRECOMPILE_ARCHITECTURE.md](./PRECOMPILE_ARCHITECTURE.md) for our vision of native VM-level reputation:

- **100x cheaper** gas costs for reputation lookups
- **Protocol-level** fee discounts for trusted agents
- **Block-level** enforcement — bad actors rejected at mempool

---

## 🛠️ Tech Stack

- **Smart Contracts:** Solidity 0.8.20, Foundry
- **Backend:** Node.js, Express, ethers.js
- **Frontend:** Next.js, React, TailwindCSS
- **Blockchain:** Avalanche Fuji C-Chain, Dispatch L1
- **Cross-Chain:** Teleporter / ICM
- **Payments:** x402 Protocol, EIP-3009

---

## 📄 License

MIT

---

## 🏆 Hackathon

**Avalanche x402 Hack2Build 2025**

Built by [Naga](https://github.com/nagavaishak)