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
│                    AGENT TRUST PROTOCOL                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────┐              │
│  │  AgentIdentity   │     │   x402 Server    │              │
│  │    (ERC-721)     │     │  Payment Gating  │              │
│  └────────┬─────────┘     └────────┬─────────┘              │
│           │                        │                         │
│           ▼                        ▼                         │
│  ┌──────────────────┐     ┌──────────────────┐              │
│  │ReputationRegistry│◄────│   Facilitator    │              │
│  │ Payment-Weighted │     │      API         │              │
│  └────────┬─────────┘     └──────────────────┘              │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │CrossChainReputation│  Teleporter Integration             │
│  │  Sync Across L1s │                                       │
│  └──────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📜 Smart Contracts (Fuji Testnet)

| Contract | Address | Verified |
|----------|---------|----------|
| AgentIdentity | [`0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8`](https://testnet.snowscan.xyz/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8#code) | ✅ |
| ReputationRegistry | [`0x02682d54A383489e217FCb3cbd0945bc97Ced4C5`](https://testnet.snowscan.xyz/address/0x02682d54A383489e217FCb3cbd0945bc97Ced4C5#code) | ✅ |
| CrossChainReputation | [`0x87025d55ceC6bd643E925a3784f4457d2796Cd6b`](https://testnet.snowscan.xyz/address/0x87025d55ceC6bd643E925a3784f4457d2796Cd6b#code) | ✅ |

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- Foundry
- Git

### Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/agent-trust-protocol.git
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
# Terminal 1: Start local blockchain
cd contracts && anvil

# Terminal 2: Deploy contracts
PRIVATE_KEY=0xac0974... forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 3: Start facilitator API
cd facilitator && node src/index.js

# Terminal 4: Start frontend
cd frontend && npm run dev
```

### Test
```bash
cd contracts && forge test
```

## 📡 API Endpoints

### Facilitator (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/register` | Register new agent |
| POST | `/agents/:tokenId/feedback` | Submit payment feedback |
| POST | `/x402/verify` | Verify agent for payment |
| GET | `/agents/:tokenId/crosschain` | Get cross-chain reputation |

### x402 Server (Port 4021)

| Method | Endpoint | Price | Description |
|--------|----------|-------|-------------|
| POST | `/api/ai-service` | $0.01 | AI agent service |
| GET | `/api/premium-data` | $0.001 | Premium data feed |

## 🔄 How Reputation Works
```
New Agent → 50 (Neutral)
    │
    ├── Positive Feedback + Large Payment → Score ↑↑
    ├── Positive Feedback + Small Payment → Score ↑
    ├── Negative Feedback + Small Payment → Score ↓
    └── Negative Feedback + Large Payment → Score ↓↓
```

**Tier Thresholds:**
- **Premium** (90+): 0.5x fees — Trusted agent, discounted rates
- **Standard** (70-89): 1.0x fees — Normal pricing
- **Basic** (50-69): 1.5x fees — New/unproven agent
- **Restricted** (<50): Payment denied — Bad actor blocked

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
- **Backend**: Node.js, Express, ethers.js
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Protocols**: x402, Teleporter/ICM
- **Network**: Avalanche Fuji Testnet

## 🎥 Demo

[Watch Demo Video](#) *(coming soon)*

## 👥 Team

Built by Naga for Avalanche x402 Hack2Build 2025

## 📄 License

MIT