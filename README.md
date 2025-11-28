# Agent Trust Protocol

> The Credit Score for AI Agents — On-chain reputation tied to payment history

Built for **Avalanche x402 Hack2Build 2025**

![Avalanche](https://img.shields.io/badge/Avalanche-Fuji-red)
![x402](https://img.shields.io/badge/x402-Protocol-blue)
![Teleporter](https://img.shields.io/badge/Teleporter-Cross--Chain-purple)

## 🎯 Problem

AI agents are entering the economy, but there's no way to know if an agent is trustworthy. How do you know if an AI agent will deliver quality work? How do you price services for an unknown agent?

## 💡 Solution

**Agent Trust Protocol** creates a decentralized credit score for AI agents:

1. **Identity** — Agents register on-chain with ERC-8004 compliant NFT passports
2. **Reputation** — Every payment interaction builds (or hurts) reputation
3. **Gating** — x402 protocol gates access based on reputation score
4. **Portability** — Reputation syncs across Avalanche L1s via Teleporter

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **ERC-8004 Identity** | NFT-based agent passports with metadata |
| **Payment-Weighted Reputation** | Larger payments = stronger signal |
| **Dynamic Pricing Tiers** | Premium (0.5x) → Standard (1x) → Basic (1.5x) → Restricted (2x) |
| **x402 Integration** | Native HTTP 402 payment gating |
| **Cross-Chain Sync** | Teleporter-enabled reputation portability |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT TRUST PROTOCOL                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐     ┌──────────────────┐              │
│  │  AgentIdentity   │     │   x402 Server    │              │
│  │    (ERC-721)     │     │  Payment Gating  │              │
│  └────────┬─────────┘     └────────┬─────────┘              │
│           │                        │                        │
│           ▼                        ▼                        │
│  ┌──────────────────┐     ┌──────────────────┐              │
│  │ReputationRegistry│◄────│   Facilitator    │              │
│  │ Payment-Weighted │     │      API         │              │
│  └────────┬─────────┘     └──────────────────┘              │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                       │
│  │CrossChainReputation│  Teleporter Integration             │
│  │  Sync Across L1s │                                       │
│  └──────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📜 Smart Contracts (Fuji Testnet)

| Contract | Address | Verified |
|----------|---------|----------|
| AgentIdentity | [`0xeCB96A74eEa4A6a7ac09658AB87650738D1d2412`](https://testnet.snowscan.xyz/address/0xeCB96A74eEa4A6a7ac09658AB87650738D1d2412#code) | ✅ |
| ReputationRegistry | [`0x3A21fE046C7E8CD9e350a8DA3b133BFa0dA27dc4`](https://testnet.snowscan.xyz/address/0x3A21fE046C7E8CD9e350a8DA3b133BFa0dA27dc4#code) | ✅ |
| CrossChainReputation | [`0x5c8dfe8484423a9370AcC451Af0083F103eA48d4`](https://testnet.snowscan.xyz/address/0x5c8dfe8484423a9370AcC451Af0083F103eA48d4#code) | ✅ |

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- Foundry
- Git

### Clone & Install

```bash
git clone https://github.com/nagavaishak/agent-trust-protocol.git
cd agent-trust-protocol

# Install contract dependencies
cd contracts && forge install

# Install facilitator dependencies
cd ../facilitator && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Run Locally

```bash
# Terminal 1: Start facilitator API (port 3000)
cd facilitator && node src/index.js

# Terminal 2: Start x402 server (port 4021)
cd facilitator && node src/x402-server.js

# Terminal 3: Start frontend (port 3001)
cd frontend && npm run dev
```

### Test Contracts

```bash
cd contracts && forge test
```

## 📡 API Endpoints

### Facilitator (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/register` | Register new agent |
| GET | `/agents/discover` | Find agents with filters |
| GET | `/agents/leaderboard` | Top agents ranked |
| POST | `/agents/:tokenId/feedback` | Submit payment feedback |
| POST | `/x402/verify` | Verify agent for payment |
| GET | `/agents/:tokenId/crosschain` | Get cross-chain reputation |
| GET | `/stats` | Protocol statistics |

### x402 Server (Port 4021)

| Method | Endpoint | Base Price | Description |
|--------|----------|------------|-------------|
| POST | `/api/ai-service` | $0.01 USDC | AI inference service |
| GET | `/api/premium-data` | $0.001 USDC | Real-time market data |
| GET | `/api/discover-agents` | $0.005 USDC | Find high-reputation agents |
| GET | `/api/payment-info` | Free | Get pricing for an agent |

**Note:** Prices are adjusted by reputation tier (Premium gets 50% discount, Restricted pays 2x).

## 🔄 How Reputation Works

```
New Agent → 0 (Restricted)
    │
    ├── Positive Feedback + Large Payment → Score ↑↑
    ├── Positive Feedback + Small Payment → Score ↑
    ├── Negative Feedback + Small Payment → Score ↓
    └── Negative Feedback + Large Payment → Score ↓↓
```

**Tier Thresholds:**

| Tier | Score | Fee Multiplier | Description |
|------|-------|----------------|-------------|
| **Premium** | 90+ | 0.5x | Trusted agent, discounted rates |
| **Standard** | 70-89 | 1.0x | Normal pricing |
| **Basic** | 50-69 | 1.5x | New/unproven agent |
| **Restricted** | <50 | 2.0x | Untrusted, premium pricing |

## 🌐 Cross-Chain Flow (Teleporter)

```
Chain A (Gaming L1)          Chain B (DeFi L1)
      │                            │
      │ Agent builds reputation    │
      │ through game payments      │
      │                            │
      ├────── Teleporter ─────────►│
      │   syncReputationToChain()  │
      │                            │
      │                      Agent's reputation
      │                      available on Chain B
      │                            │
      │                      DeFi protocol can
      │                      trust gaming agent
```

## ⚡ x402 Payment Flow

```
1. Client requests resource
        │
        ▼
2. Server returns HTTP 402 + payment requirements
        │
        ▼
3. Client signs EIP-3009 payment authorization
        │
        ▼
4. Client sends request with X-PAYMENT header
        │
        ▼
5. Server verifies via PayAI facilitator
        │
        ▼
6. Payment settled, resource delivered
```

## 🧪 Tests

```
✅ 18 tests passing

AgentIdentity (4 tests)
├── test_RegisterAgent
├── test_CannotRegisterTwice
├── test_GetAgentData
└── test_MultipleAgents

ReputationRegistry (7 tests)
├── test_NewAgentHasNeutralScore
├── test_PositiveFeedbackIncreasesScore
├── test_NegativeFeedbackDecreasesScore
├── test_MixedFeedbackCalculatesCorrectly
├── test_PaymentWeighting
├── test_MeetsThreshold
└── test_FeedbackCount

CrossChainReputation (7 tests)
├── test_SetTrustedRemote
├── test_SyncReputationToChain
├── test_ReceiveTeleporterMessage
├── test_RejectUntrustedSender
├── test_OnlyTeleporterCanReceive
├── test_GetAggregatedReputation
└── test_MeetsThresholdAcrossChains
```

## 🛠️ Tech Stack

- **Smart Contracts**: Solidity 0.8.20, Foundry
- **Backend**: Node.js, Express, ethers.js v6
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Protocols**: x402 (PayAI Facilitator), Teleporter/ICM
- **Network**: Avalanche Fuji Testnet (Chain ID: 43113)

## 📁 Project Structure

```
agent-trust-protocol/
├── contracts/
│   ├── src/
│   │   ├── AgentIdentity.sol
│   │   ├── ReputationRegistry.sol
│   │   └── CrossChainReputation.sol
│   ├── test/
│   └── script/
├── facilitator/
│   ├── src/
│   │   ├── index.js          # Main API
│   │   └── x402-server.js    # x402 payment server
│   └── .env.fuji
└── frontend/
    └── app/
        └── page.tsx
```

## 🎥 Demo

[Watch Demo Video](#) *(coming soon)*

## 👥 Team

Built by **Naga** for Avalanche x402 Hack2Build 2025

## 📄 License

MIT