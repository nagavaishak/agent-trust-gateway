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

## 💰 Real x402 Payments (Not Simulated!)

**This is not a demo.** Our x402 server executes **real USDC transfers on-chain**.

### Proof of Real Payment

| Field | Value |
|-------|-------|
| TX Hash | [`0x858c761094390b6f0c8fd5147d4a7f3e8869c8eddc4bfab725782b19fb640c71`](https://testnet.snowscan.xyz/tx/0x858c761094390b6f0c8fd5147d4a7f3e8869c8eddc4bfab725782b19fb640c71) |
| Amount | 0.005 USDC |
| From | Agent #1 (0x7099...79C8) |
| To | Server (0x9263...a114) |
| Method | `transferWithAuthorization` (EIP-3009) |

### How It Works

```
1. Agent requests service        → Server returns HTTP 402 + payment requirements
2. Agent signs EIP-3009 auth     → Off-chain signature (no gas needed)
3. Agent sends X-Payment header  → Contains signed authorization
4. Server executes transfer      → Calls USDC.transferWithAuthorization() on-chain
5. USDC moves on-chain           → Real transfer, visible on Snowscan
6. Server returns service        → HTTP 200 + response
```

### Reputation-Based Pricing

| Tier | Reputation | Fee Multiplier | Example ($0.01 base) |
|------|------------|----------------|----------------------|
| Premium | 90-100 | 0.5x | $0.005 |
| Standard | 70-89 | 1.0x | $0.01 |
| Basic | 50-69 | 1.5x | $0.015 |
| Restricted | 0-49 | 2.0x | $0.02 |

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
│  │ HTTP 402    │  │  Reputation  │  │   Real USDC Transfer   │  │
│  │ Response    │──│  Check       │──│   (EIP-3009)           │  │
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
│  │           CrossChainReputationReceiver                    │  │
│  │           (Receives reputation from Fuji)                 │  │
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

## 🖥️ Frontend vs Backend

### Frontend (Simulation/Demo UI)

The frontend at `localhost:3001` provides a **visual demonstration** of the protocol:
- Agent verification UI
- Reputation display with tier badges
- x402 payment modal (simulated click-to-pay)
- Cross-chain reputation visualization

**Note:** The frontend "Pay" button simulates the payment flow for demo purposes. This allows showing the complete UX without requiring users to have testnet USDC or connect wallets.

### Backend (Real Payments)

The x402 server at `localhost:4021` executes **real on-chain USDC transfers**:
- EIP-3009 `transferWithAuthorization` signatures
- Actual USDC moves on Avalanche Fuji
- Transactions visible on Snowscan
- No simulation — real blockchain state changes

**To prove real payments work:**
```bash
# Start x402 server with real payments enabled
REAL_PAYMENTS=true node src/x402-server.js

# Run test script (executes real USDC transfer)
node src/test-x402-real.js
```

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
node src/index.js

# Terminal 2: x402 Server (port 4021)
cd facilitator
REAL_PAYMENTS=true node src/x402-server.js  # For real payments
# OR
node src/x402-server.js  # For demo mode

# Terminal 3: Frontend (port 3001)
cd frontend
npm run dev
```

### Test Real Payments

```bash
cd facilitator

# Test the complete x402 payment flow
node src/test-x402-real.js
```

Expected output:
```
✅ PAYMENT SUCCESSFUL!
Status: 200
TX Hash: 0x858c761094390b6f...
Real Payment: true
Explorer: https://testnet.snowscan.xyz/tx/0x858c...
Server USDC: 1.005000 USDC  # Balance increased!
```

---

## 🧪 Test Agents

We have 4 agents registered with different reputation tiers:

| Agent | Address | Reputation | Tier | Fee |
|-------|---------|------------|------|-----|
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 100 | Premium | 0.5x |
| #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 75 | Standard | 1.0x |
| #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | 60 | Basic | 1.5x |
| #4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | 30 | Restricted | 2.0x |

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
│       ├── x402-server.js              # x402 payment server (REAL payments!)
│       └── test-x402-real.js           # Payment test script
├── frontend/
│   └── app/
│       └── page.tsx                    # Dashboard UI (demo)
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
| GET | `/api/balance` | Free | Check server USDC balance |

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
- **Payments:** x402 Protocol, EIP-3009 `transferWithAuthorization`

---

## 📊 On-Chain Proof Summary

| What | Proof |
|------|-------|
| Real USDC Payment | [TX: 0x858c7610...](https://testnet.snowscan.xyz/tx/0x858c761094390b6f0c8fd5147d4a7f3e8869c8eddc4bfab725782b19fb640c71) |
| Teleporter Message | [TX: 0xd3e9c290...](https://testnet.snowscan.xyz/tx/0xd3e9c290290c489383a9cefe4ff8dc32d2d792f383f99418e43691b516ef83ff) |
| AgentIdentity Contract | [Verified on Snowscan](https://testnet.snowscan.xyz/address/0xeCB96A74eEa4A6a7ac09658AB87650738D1d2412#code) |
| ReputationRegistry Contract | [Verified on Snowscan](https://testnet.snowscan.xyz/address/0x3A21fE046C7E8CD9e350a8DA3b133BFa0dA27dc4#code) |
| CrossChainReputation Contract | [Verified on Snowscan](https://testnet.snowscan.xyz/address/0x5c8dfe8484423a9370AcC451Af0083F103eA48d4#code) |
| Dispatch Receiver Contract | [Deployed](https://subnets.avax.network/dispatch/testnet/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8) |

---

## 📄 License

MIT

---

## 🏆 Hackathon

**Avalanche x402 Hack2Build 2025**

Built by [Naga](https://github.com/nagavaishak)

---

### Key Differentiators

1. **Real Payments** — Not simulated. USDC actually moves on-chain.
2. **Real Cross-Chain** — Teleporter message sent with on-chain proof.
3. **Real Reputation** — Payment-weighted scoring stored on-chain.
4. **Production Architecture** — Precompile design doc for mainnet scaling.