# Agent Trust Protocol — Precompile Architecture

> Future Vision: Native VM-Level Reputation Enforcement on Avalanche

## Executive Summary

This document outlines the architecture for implementing Agent Trust Protocol as a **native Avalanche precompile**, enabling VM-level reputation checks, gas discounts for trusted agents, and block-level enforcement of reputation thresholds.

While the current implementation uses standard Solidity smart contracts on C-Chain, this precompile design represents the **production-grade evolution** of the protocol for custom Avalanche L1s (Subnets).

---

## Why a Precompile?

### Current Architecture (Smart Contracts)

```
┌─────────────┐     ┌──────────────────┐        ┌─────────────────┐
│   Agent     │────►│  ReputationRegistry │────►│  x402 Server    │
│  (Caller)   │     │  (Contract Call)    │     │  (Verify)       │
└─────────────┘     └──────────────────┘        └─────────────────┘
                           │
                    Gas: ~50,000
                    Latency: ~2s
```

**Limitations:**
- Every reputation check costs gas
- Reputation can only be checked AFTER transaction starts
- No native fee discounts at protocol level
- Bad actors can still submit transactions (rejected later)

### Precompile Architecture (Proposed)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Agent     │────►│  VM Transaction   │────►│  Block Included │
│  (Caller)   │     │  Validation       │     │  (or Rejected)  │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │ REPUTATION  │
                    │ PRECOMPILE  │
                    │ (Native)    │
                    └─────────────┘
                           │
                    Gas: ~200 (100x cheaper)
                    Latency: <100ms
```

**Benefits:**
- Reputation checked at transaction validation (before execution)
- Native gas discounts baked into fee calculation
- Bad actors blocked at mempool level
- 100x cheaper reputation lookups

---

## Precompile Specification

### Contract Address

Following Avalanche's precompile address convention:

```
0x0300000000000000000000000000000000000010
```

Address range `0x03...0001` to `0x03...00FF` is reserved for custom precompiles.

### Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationPrecompile {
    /// @notice Get reputation score for an agent
    /// @param agent The agent's address
    /// @return score The reputation score (0-100)
    function getReputation(address agent) external view returns (uint256 score);
    
    /// @notice Check if agent meets minimum threshold
    /// @param agent The agent's address
    /// @param threshold Minimum required score
    /// @return meets True if agent meets threshold
    function meetsThreshold(address agent, uint256 threshold) external view returns (bool meets);
    
    /// @notice Get fee multiplier for agent's tier
    /// @param agent The agent's address
    /// @return multiplier Fee multiplier (50 = 0.5x, 100 = 1x, 200 = 2x)
    function getFeeMultiplier(address agent) external view returns (uint256 multiplier);
    
    /// @notice Submit feedback for an agent (restricted to authorized callers)
    /// @param agent The agent's address
    /// @param score Feedback score (-1, 0, or 1)
    /// @param paymentAmount Payment amount for weighting
    function submitFeedback(address agent, int8 score, uint256 paymentAmount) external;
    
    /// @notice Get agent's tier
    /// @param agent The agent's address
    /// @return tier 0=Restricted, 1=Basic, 2=Standard, 3=Premium
    function getTier(address agent) external view returns (uint8 tier);
}
```

### Gas Costs

| Function | Precompile Gas | Contract Gas | Savings |
|----------|----------------|--------------|---------|
| `getReputation` | 200 | 26,000 | 130x |
| `meetsThreshold` | 250 | 28,000 | 112x |
| `getFeeMultiplier` | 200 | 25,000 | 125x |
| `submitFeedback` | 5,000 | 65,000 | 13x |
| `getTier` | 200 | 24,000 | 120x |

---

## Implementation Architecture

### Golang Precompile Structure

```go
// reputation_precompile.go

package precompile

import (
    "github.com/ava-labs/subnet-evm/precompile/contract"
    "github.com/ethereum/go-ethereum/common"
)

const (
    ReputationPrecompileAddress = "0x0300000000000000000000000000000000000010"
    
    // Tier thresholds
    PremiumThreshold   = 90
    StandardThreshold  = 70
    BasicThreshold     = 50
)

// ReputationPrecompile implements native reputation lookups
type ReputationPrecompile struct {
    // State stored in precompile's dedicated storage
    reputations    map[common.Address]uint64
    feedbackCounts map[common.Address]FeedbackData
}

type FeedbackData struct {
    Positive      uint64
    Negative      uint64
    PaymentVolume *big.Int
}

// GetReputation returns the reputation score for an agent
func (r *ReputationPrecompile) GetReputation(
    agent common.Address,
) (uint64, error) {
    if score, exists := r.reputations[agent]; exists {
        return score, nil
    }
    return 0, nil // New agents start at 0
}

// GetFeeMultiplier returns the fee multiplier based on tier
func (r *ReputationPrecompile) GetFeeMultiplier(
    agent common.Address,
) (uint64, error) {
    score, _ := r.GetReputation(agent)
    
    switch {
    case score >= PremiumThreshold:
        return 50, nil  // 0.5x
    case score >= StandardThreshold:
        return 100, nil // 1.0x
    case score >= BasicThreshold:
        return 150, nil // 1.5x
    default:
        return 200, nil // 2.0x
    }
}

// SubmitFeedback records feedback and updates reputation
func (r *ReputationPrecompile) SubmitFeedback(
    agent common.Address,
    score int8,
    paymentAmount *big.Int,
) error {
    // Weight calculation
    weight := calculateWeight(paymentAmount)
    
    // Update feedback counts
    data := r.feedbackCounts[agent]
    if score > 0 {
        data.Positive += weight
    } else if score < 0 {
        data.Negative += weight
    }
    data.PaymentVolume.Add(data.PaymentVolume, paymentAmount)
    r.feedbackCounts[agent] = data
    
    // Recalculate reputation
    r.reputations[agent] = calculateReputation(data)
    
    return nil
}
```

### Fee Modification Hook

The key innovation is modifying transaction fees at the VM level:

```go
// fee_modifier.go

func (vm *VM) CalculateFee(tx *types.Transaction) *big.Int {
    baseFee := vm.GetBaseFee()
    
    // Get sender's reputation
    sender := tx.From()
    multiplier, _ := vm.reputationPrecompile.GetFeeMultiplier(sender)
    
    // Apply reputation-based discount/premium
    // multiplier is in basis points (50 = 0.5x, 200 = 2x)
    adjustedFee := new(big.Int).Mul(baseFee, big.NewInt(int64(multiplier)))
    adjustedFee.Div(adjustedFee, big.NewInt(100))
    
    return adjustedFee
}
```

### Transaction Validation Hook

Block bad actors at the mempool level:

```go
// tx_validator.go

func (vm *VM) ValidateTransaction(tx *types.Transaction) error {
    sender := tx.From()
    
    // Check if transaction targets a gated contract
    if isGatedContract(tx.To()) {
        threshold := getContractThreshold(tx.To())
        
        meets, _ := vm.reputationPrecompile.MeetsThreshold(sender, threshold)
        if !meets {
            return ErrInsufficientReputation
        }
    }
    
    return nil
}
```

---

## State Management

### Precompile State Storage

```go
// State keys for precompile storage
var (
    reputationPrefix    = []byte("rep:")
    feedbackPrefix      = []byte("fb:")
    paymentVolumePrefix = []byte("pv:")
)

func (r *ReputationPrecompile) GetStateDB() StateDB {
    // Precompile has its own state trie
    // Separate from contract storage
}

func reputationKey(agent common.Address) []byte {
    return append(reputationPrefix, agent.Bytes()...)
}
```

### Cross-Chain Sync via Teleporter

```go
// teleporter_integration.go

func (r *ReputationPrecompile) HandleTeleporterMessage(
    sourceChain ids.ID,
    message []byte,
) error {
    // Decode reputation sync message
    var syncMsg ReputationSyncMessage
    if err := rlp.DecodeBytes(message, &syncMsg); err != nil {
        return err
    }
    
    // Verify source is trusted
    if !r.isTrustedChain(sourceChain) {
        return ErrUntrustedSource
    }
    
    // Update remote reputation cache
    r.remoteReputations[sourceChain][syncMsg.Agent] = syncMsg.Score
    
    // Recalculate aggregated score
    r.updateAggregatedReputation(syncMsg.Agent)
    
    return nil
}
```

---

## Deployment Architecture

### Custom Subnet Configuration

```json
{
  "config": {
    "chainId": 99999,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "muirGlacierBlock": 0,
    "subnetEVMTimestamp": 0,
    "feeConfig": {
      "gasLimit": 8000000,
      "minBaseFee": 25000000000,
      "targetGas": 15000000,
      "baseFeeChangeDenominator": 36,
      "minBlockGasCost": 0,
      "maxBlockGasCost": 1000000,
      "targetBlockRate": 2,
      "blockGasCostStep": 200000
    },
    "precompiles": {
      "reputationPrecompile": {
        "address": "0x0300000000000000000000000000000000000010",
        "enabled": true,
        "adminAddresses": ["0x..."],
        "initialReputations": {}
      }
    }
  }
}
```

### Genesis Allocation

```json
{
  "alloc": {
    "0x0300000000000000000000000000000000000010": {
      "balance": "0x0",
      "code": "0x...",
      "storage": {}
    }
  }
}
```

---

## Security Considerations

### 1. Reputation Manipulation

**Risk:** Sybil attacks to inflate reputation
**Mitigation:** 
- Payment-weighted feedback (costs money to manipulate)
- Rate limiting on feedback submissions
- Minimum payment threshold for feedback

### 2. Precompile Upgrade Path

**Risk:** Bug in precompile requires network upgrade
**Mitigation:**
- Extensive testing before deployment
- Governance mechanism for precompile upgrades
- Emergency pause functionality

### 3. Cross-Chain Attacks

**Risk:** Forged reputation from malicious chain
**Mitigation:**
- Whitelist of trusted chain IDs
- Teleporter message verification
- Reputation caps from remote chains

---

## Migration Path

### Phase 1: Current (Smart Contracts)
- Deploy on C-Chain ✅
- Prove concept works ✅
- Gather user feedback

### Phase 2: Hybrid
- Deploy precompile on custom Subnet
- Bridge existing reputations
- Run both in parallel

### Phase 3: Full Precompile
- Migrate all reputation to precompile
- Enable native fee discounts
- Block-level reputation enforcement

---

## Comparison: Contract vs Precompile

| Feature | Smart Contract | Precompile |
|---------|----------------|------------|
| Gas Cost | High (~50k) | Low (~200) |
| Fee Discounts | Application-level | Protocol-level |
| Bad Actor Blocking | After tx starts | Before mempool |
| Upgrade Path | Simple | Requires network upgrade |
| Cross-Chain | Via Teleporter | Native Teleporter |
| Development Time | Days | Weeks |
| Golang Required | No | Yes |

---

## Conclusion

The precompile architecture represents the **natural evolution** of Agent Trust Protocol from a proof-of-concept to production infrastructure. By moving reputation checks to the VM level, we enable:

1. **100x cheaper** reputation lookups
2. **Native fee discounts** for trusted agents
3. **Block-level enforcement** of reputation thresholds
4. **Seamless cross-chain** reputation via Teleporter

This positions Agent Trust Protocol as **core infrastructure** for AI agent economies on Avalanche, not just another smart contract application.

---

## References

- [Avalanche Precompile Documentation](https://docs.avax.network/build/subnet/upgrade/customize-a-subnet#precompiles)
- [Subnet-EVM Precompile Examples](https://github.com/ava-labs/subnet-evm/tree/master/precompile)
- [Teleporter Protocol](https://github.com/ava-labs/teleporter)
- [ERC-8004 Agent Identity Standard](https://ethereum-magicians.org/t/erc-8004-ai-agent-identity/19360)

---

*Document Version: 1.0*
*Author: Naga*
*Project: Agent Trust Protocol*
*Hackathon: Avalanche x402 Hack2Build 2025*