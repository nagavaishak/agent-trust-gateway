/**
 * AgentTrust Gateway
 * 
 * The Cloudflare for x402 APIs — drop-in trust middleware that enforces
 * identity, reputation, staking, and economic security BEFORE payment settles.
 * 
 * npm install @agent-trust/gateway
 * 
 * Usage:
 *   import { AgentTrust } from '@agent-trust/gateway';
 *   app.use('/api/gpt4', AgentTrust.protect({ minStake: 500, minScore: 80 }));
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG = {
  // Staking requirements
  minStake: 0,              // Minimum stake in wei (0 = no requirement)
  
  // Reputation requirements  
  minScore: 0,              // Minimum reputation score 0-100 (0 = no requirement)
  
  // Risk pricing
  riskMultiplier: 'dynamic', // 'fixed' | 'dynamic' | number
  basePrice: 0.01,           // Base price in USDC
  
  // Rate limiting
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  
  // PoW difficulty (0 = disabled)
  powDifficulty: 0,          // Number of leading zeros required
  
  // Macaroon settings
  macaroonTTL: 300,          // Session token TTL in seconds
  maxMacaroonRequests: 100,  // Max requests per macaroon
  
  // Blocking
  blockUnregistered: false,  // Block agents not in registry
  blockUnstaked: false,      // Block agents with no stake
  
  // Contract addresses (Fuji testnet)
  contracts: {
    agentRegistry: null,
    stakingModule: null,
    reputationEngine: null,
    jobLogger: null
  },
  
  // RPC
  rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc'
};

// ============================================
// RISK SCORING ENGINE
// ============================================

class RiskEngine {
  constructor() {
    this.requestHistory = new Map(); // agentId -> request history
    this.failureHistory = new Map(); // agentId -> failure count
    this.abuseFlags = new Map();     // agentId -> abuse flags
  }
  
  /**
   * Calculate risk score for an agent (0-100, higher = riskier)
   */
  calculateRisk(agentId, context = {}) {
    let riskScore = 0;
    
    // 1. Check request frequency (burst detection)
    const history = this.requestHistory.get(agentId) || [];
    const recentRequests = history.filter(t => Date.now() - t < 60000).length;
    if (recentRequests > 30) riskScore += 20;
    else if (recentRequests > 10) riskScore += 10;
    
    // 2. Check failure rate
    const failures = this.failureHistory.get(agentId) || 0;
    if (failures > 10) riskScore += 30;
    else if (failures > 5) riskScore += 15;
    
    // 3. Check abuse flags
    const flags = this.abuseFlags.get(agentId) || [];
    riskScore += flags.length * 10;
    
    // 4. New agent penalty (no history = higher risk)
    if (history.length < 5) riskScore += 15;
    
    // 5. Time-of-day risk (optional, for detecting bots)
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 5) riskScore += 5; // Suspicious hours
    
    // 6. Payload size risk
    if (context.payloadSize && context.payloadSize > 100000) {
      riskScore += 20; // Large payload = potential abuse
    }
    
    return Math.min(riskScore, 100);
  }
  
  /**
   * Record a request for rate limiting
   */
  recordRequest(agentId) {
    const history = this.requestHistory.get(agentId) || [];
    history.push(Date.now());
    
    // Keep only last hour of history
    const oneHourAgo = Date.now() - 3600000;
    const filtered = history.filter(t => t > oneHourAgo);
    this.requestHistory.set(agentId, filtered);
  }
  
  /**
   * Record a failure
   */
  recordFailure(agentId) {
    const count = this.failureHistory.get(agentId) || 0;
    this.failureHistory.set(agentId, count + 1);
  }
  
  /**
   * Flag an agent for abuse
   */
  flagAbuse(agentId, reason) {
    const flags = this.abuseFlags.get(agentId) || [];
    flags.push({ reason, timestamp: Date.now() });
    this.abuseFlags.set(agentId, flags);
  }
  
  /**
   * Check if agent should be blocked
   */
  shouldBlock(agentId) {
    const risk = this.calculateRisk(agentId);
    const flags = this.abuseFlags.get(agentId) || [];
    
    // Block if risk > 80 or has multiple abuse flags
    return risk > 80 || flags.length >= 3;
  }
}

// ============================================
// PROOF OF WORK VALIDATOR
// ============================================

class PoWValidator {
  /**
   * Generate a PoW challenge
   */
  static generateChallenge() {
    const challenge = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    return {
      challenge,
      timestamp,
      expiresAt: timestamp + 30000 // 30 second expiry
    };
  }
  
  /**
   * Verify PoW solution
   */
  static verifySolution(challenge, nonce, difficulty) {
    if (difficulty === 0) return true;
    
    const hash = crypto
      .createHash('sha256')
      .update(challenge + nonce)
      .digest('hex');
    
    const prefix = '0'.repeat(difficulty);
    return hash.startsWith(prefix);
  }
}

// ============================================
// MACAROON SESSION TOKENS
// ============================================

class MacaroonManager {
  constructor(secretKey) {
    this.secretKey = secretKey || crypto.randomBytes(32).toString('hex');
    this.revoked = new Set();
  }
  
  /**
   * Issue a new macaroon
   */
  issue(agentId, caveats = {}) {
    const macaroon = {
      id: crypto.randomBytes(16).toString('hex'),
      agentId,
      issuedAt: Date.now(),
      caveats: {
        ttl: caveats.ttl || 300,
        maxRequests: caveats.maxRequests || 100,
        endpoints: caveats.endpoints || ['*'],
        maxCost: caveats.maxCost || 1.0, // Max USDC per session
        ...caveats
      },
      requestCount: 0
    };
    
    // Sign the macaroon
    const signature = this._sign(macaroon);
    macaroon.signature = signature;
    
    return Buffer.from(JSON.stringify(macaroon)).toString('base64');
  }
  
  /**
   * Verify and decode a macaroon
   */
  verify(token) {
    try {
      const macaroon = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Check revocation
      if (this.revoked.has(macaroon.id)) {
        return { valid: false, error: 'Macaroon revoked' };
      }
      
      // Verify signature
      const { signature, ...data } = macaroon;
      const expectedSig = this._sign(data);
      if (signature !== expectedSig) {
        return { valid: false, error: 'Invalid signature' };
      }
      
      // Check TTL
      const age = (Date.now() - macaroon.issuedAt) / 1000;
      if (age > macaroon.caveats.ttl) {
        return { valid: false, error: 'Macaroon expired' };
      }
      
      // Check request count
      if (macaroon.requestCount >= macaroon.caveats.maxRequests) {
        return { valid: false, error: 'Request limit exceeded' };
      }
      
      return { valid: true, macaroon };
    } catch (e) {
      return { valid: false, error: 'Invalid macaroon format' };
    }
  }
  
  /**
   * Revoke a macaroon
   */
  revoke(macaroonId) {
    this.revoked.add(macaroonId);
  }
  
  /**
   * Sign macaroon data
   */
  _sign(data) {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(data))
      .digest('hex');
  }
}

// ============================================
// CONTRACT INTERFACE
// ============================================

class ContractInterface {
  constructor(config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: 43113,
      name: 'avalanche-fuji'
    });
    
    // ABIs
    this.STAKING_ABI = [
      'function getEffectiveStake(uint256 agentTokenId) view returns (uint256)',
      'function hasMinimumStake(uint256 agentTokenId) view returns (bool)',
      'function checkStakeRequirement(uint256 agentTokenId, bytes32 serviceId) view returns (bool, uint256, uint256)'
    ];
    
    this.REPUTATION_ABI = [
      'function getScore(uint256 agentTokenId) view returns (uint256)',
      'function meetsThreshold(uint256 agentTokenId, uint256 minScore) view returns (bool)',
      'function getReputation(uint256 agentTokenId) view returns (uint256, uint256, uint256, uint256, uint256, uint256)'
    ];
    
    this.REGISTRY_ABI = [
      'function agentToTokenId(address agent) view returns (uint256)',
      'function isRegisteredAgent(address agent) view returns (bool)',
      'function isActiveAgent(uint256 tokenId) view returns (bool)'
    ];
    
    // Initialize contracts if addresses provided
    if (config.contracts.stakingModule) {
      this.staking = new ethers.Contract(
        config.contracts.stakingModule,
        this.STAKING_ABI,
        this.provider
      );
    }
    
    if (config.contracts.reputationEngine) {
      this.reputation = new ethers.Contract(
        config.contracts.reputationEngine,
        this.REPUTATION_ABI,
        this.provider
      );
    }
    
    if (config.contracts.agentRegistry) {
      this.registry = new ethers.Contract(
        config.contracts.agentRegistry,
        this.REGISTRY_ABI,
        this.provider
      );
    }
  }
  
  /**
   * Get agent token ID from address
   */
  async getAgentTokenId(address) {
    if (!this.registry) return null;
    try {
      const tokenId = await this.registry.agentToTokenId(address);
      return tokenId > 0 ? tokenId : null;
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Check if agent is registered
   */
  async isRegistered(address) {
    if (!this.registry) return true; // Assume registered if no registry
    try {
      return await this.registry.isRegisteredAgent(address);
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Get agent's stake
   */
  async getStake(tokenId) {
    if (!this.staking) return 0;
    try {
      const stake = await this.staking.getEffectiveStake(tokenId);
      return stake;
    } catch (e) {
      return 0;
    }
  }
  
  /**
   * Get agent's reputation score
   */
  async getReputationScore(tokenId) {
    if (!this.reputation) return 50; // Default neutral
    try {
      const score = await this.reputation.getScore(tokenId);
      return Number(score);
    } catch (e) {
      return 50;
    }
  }
  
  /**
   * Check stake requirement for a service
   */
  async checkStakeRequirement(tokenId, serviceId) {
    if (!this.staking) return { meets: true, current: 0, required: 0 };
    try {
      const [meets, current, required] = await this.staking.checkStakeRequirement(
        tokenId,
        ethers.id(serviceId)
      );
      return { meets, current, required };
    } catch (e) {
      return { meets: true, current: 0, required: 0 };
    }
  }
}

// ============================================
// DYNAMIC PRICING ENGINE
// ============================================

class PricingEngine {
  /**
   * Calculate dynamic price based on risk and reputation
   */
  static calculatePrice(basePrice, agentData) {
    let multiplier = 1.0;
    
    // Reputation discount (higher rep = lower price)
    if (agentData.reputation >= 90) {
      multiplier *= 0.5;  // 50% discount for premium
    } else if (agentData.reputation >= 70) {
      multiplier *= 0.75; // 25% discount for standard
    } else if (agentData.reputation >= 50) {
      multiplier *= 1.0;  // Normal price
    } else {
      multiplier *= 1.5;  // 50% premium for low rep
    }
    
    // Risk surcharge
    if (agentData.riskScore > 50) {
      multiplier *= 1.5;  // 50% surcharge for risky agents
    } else if (agentData.riskScore > 25) {
      multiplier *= 1.25; // 25% surcharge
    }
    
    // Stake bonus (staked agents get discount)
    const stakeNum = Number(agentData.stake || 0);
    if (stakeNum > 0) {
      const stakeBonus = Math.min(stakeNum / 10e18, 0.2); // Up to 20% discount
      multiplier *= (1 - stakeBonus);
    }
    
    // New agent premium
    if (agentData.isNew) {
      multiplier *= 1.25;
    }
    
    const finalPrice = basePrice * multiplier;
    
    return {
      basePrice,
      finalPrice: Math.max(finalPrice, basePrice * 0.25), // Min 25% of base
      multiplier,
      breakdown: {
        reputationFactor: agentData.reputation >= 90 ? 0.5 : agentData.reputation >= 70 ? 0.75 : 1.0,
        riskFactor: agentData.riskScore > 50 ? 1.5 : agentData.riskScore > 25 ? 1.25 : 1.0,
        stakeFactor: stakeNum > 0 ? (1 - Math.min(stakeNum / 10e18, 0.2)) : 1.0,
        newAgentFactor: agentData.isNew ? 1.25 : 1.0
      }
    };
  }
}

// ============================================
// MAIN GATEWAY CLASS
// ============================================

class AgentTrustGateway {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.riskEngine = new RiskEngine();
    this.macaroonManager = new MacaroonManager(config.macaroonSecret);
    this.contracts = new ContractInterface(this.config);
    this.powChallenges = new Map(); // Store active PoW challenges
  }
  
  /**
   * Express/Connect middleware
   */
  protect(options = {}) {
    const config = { ...this.config, ...options };
    
    return async (req, res, next) => {
      const startTime = Date.now();
      
      try {
        // 1. Extract agent identity
        const agentAddress = req.headers['x-agent-address'] || req.query.agent;
        if (!agentAddress && config.blockUnregistered) {
          return this._sendError(res, 401, 'Agent address required', 'AGENT_REQUIRED');
        }
        
        // 2. Check macaroon (session resumption)
        const macaroonHeader = req.headers['x-macaroon'];
        if (macaroonHeader) {
          const result = this.macaroonManager.verify(macaroonHeader);
          if (result.valid) {
            // Valid session, skip full verification
            req.agentTrust = {
              agentAddress: result.macaroon.agentId,
              sessionResume: true,
              macaroon: result.macaroon
            };
            return next();
          }
        }
        
        // 3. PoW verification (if enabled)
        if (config.powDifficulty > 0) {
          const powResult = this._verifyPoW(req, config.powDifficulty);
          if (!powResult.valid) {
            return this._sendPoWChallenge(res, powResult.challenge);
          }
        }
        
        // 4. Get agent data from contracts
        let agentData = {
          address: agentAddress,
          tokenId: null,
          isRegistered: false,
          stake: 0,
          reputation: 50,
          riskScore: 0,
          isNew: true
        };
        
        if (agentAddress) {
          const tokenId = await this.contracts.getAgentTokenId(agentAddress);
          if (tokenId) {
            agentData.tokenId = tokenId;
            agentData.isRegistered = true;
            agentData.stake = await this.contracts.getStake(tokenId);
            agentData.reputation = await this.contracts.getReputationScore(tokenId);
            agentData.isNew = false;
          }
          
          // Calculate risk
          agentData.riskScore = this.riskEngine.calculateRisk(agentAddress, {
            payloadSize: req.headers['content-length']
          });
        }
        
        // 5. Check blocking conditions
        if (config.blockUnregistered && !agentData.isRegistered) {
          return this._sendError(res, 403, 'Agent not registered', 'NOT_REGISTERED');
        }
        
        if (config.blockUnstaked && agentData.stake === 0) {
          return this._sendError(res, 403, 'Stake required', 'NO_STAKE');
        }
        
        if (this.riskEngine.shouldBlock(agentAddress)) {
          return this._sendError(res, 403, 'Agent blocked due to abuse', 'BLOCKED');
        }
        
        // 6. Check minimum requirements
        if (config.minStake > 0 && agentData.stake < config.minStake) {
          return this._sendError(res, 402, `Minimum stake of ${config.minStake} required`, 'INSUFFICIENT_STAKE', {
            required: config.minStake.toString(),
            current: agentData.stake.toString()
          });
        }
        
        if (config.minScore > 0 && agentData.reputation < config.minScore) {
          return this._sendError(res, 402, `Minimum reputation of ${config.minScore} required`, 'INSUFFICIENT_REPUTATION', {
            required: config.minScore,
            current: agentData.reputation
          });
        }
        
        // 7. Calculate dynamic price
        const pricing = PricingEngine.calculatePrice(config.basePrice, agentData);
        
        // 8. Check for x402 payment
        const paymentHeader = req.headers['x-payment'];
        if (!paymentHeader) {
          // Return 402 with payment requirements
          return this._sendPaymentRequired(res, pricing, agentData, config);
        }
        
        // 9. Verify payment (delegate to x402 handler)
        // Payment verification would happen here
        // For now, attach data and continue
        
        // 10. Record request
        this.riskEngine.recordRequest(agentAddress);
        
        // 11. Issue macaroon for session resumption
        const macaroon = this.macaroonManager.issue(agentAddress, {
          ttl: config.macaroonTTL,
          maxRequests: config.maxMacaroonRequests,
          endpoints: [req.path]
        });
        
        // 12. Attach trust data to request
        req.agentTrust = {
          ...agentData,
          pricing,
          verified: true,
          macaroon,
          processingTime: Date.now() - startTime
        };
        
        // Set response header with macaroon for client to cache
        res.setHeader('X-Macaroon', macaroon);
        res.setHeader('X-Trust-Score', agentData.reputation);
        res.setHeader('X-Risk-Score', agentData.riskScore);
        
        next();
        
      } catch (error) {
        console.error('[AgentTrust] Gateway error:', error);
        return this._sendError(res, 500, 'Gateway error', 'INTERNAL_ERROR');
      }
    };
  }
  
  /**
   * Verify Proof of Work
   */
  _verifyPoW(req, difficulty) {
    const challenge = req.headers['x-pow-challenge'];
    const nonce = req.headers['x-pow-nonce'];
    
    if (!challenge || !nonce) {
      // Generate new challenge
      const newChallenge = PoWValidator.generateChallenge();
      this.powChallenges.set(newChallenge.challenge, newChallenge);
      return { valid: false, challenge: newChallenge };
    }
    
    // Verify challenge exists and is not expired
    const storedChallenge = this.powChallenges.get(challenge);
    if (!storedChallenge || Date.now() > storedChallenge.expiresAt) {
      const newChallenge = PoWValidator.generateChallenge();
      this.powChallenges.set(newChallenge.challenge, newChallenge);
      return { valid: false, challenge: newChallenge };
    }
    
    // Verify solution
    if (!PoWValidator.verifySolution(challenge, nonce, difficulty)) {
      return { valid: false, challenge: storedChallenge };
    }
    
    // Valid, remove challenge
    this.powChallenges.delete(challenge);
    return { valid: true };
  }
  
  /**
   * Send PoW challenge response
   */
  _sendPoWChallenge(res, challenge) {
    res.status(429).json({
      error: 'Proof of Work Required',
      code: 'POW_REQUIRED',
      challenge: challenge.challenge,
      difficulty: this.config.powDifficulty,
      expiresAt: challenge.expiresAt,
      instructions: 'Find nonce such that SHA256(challenge + nonce) starts with N zeros'
    });
  }
  
  /**
   * Send 402 Payment Required
   */
  _sendPaymentRequired(res, pricing, agentData, config) {
    const paymentRequirements = {
      scheme: 'exact',
      network: 'avalanche-fuji',
      maxAmountRequired: Math.round(pricing.finalPrice * 1_000_000).toString(),
      asset: '0x5425890298aed601595a70AB815c96711a31Bc65', // USDC on Fuji
      payTo: config.payToAddress || '0x9263c9114a3c9192fac7890067369a656075a114',
      description: `API access - ${pricing.finalPrice.toFixed(4)} USDC`,
      maxTimeoutSeconds: 300
    };
    
    res.status(402).json({
      error: 'Payment Required',
      code: 'PAYMENT_REQUIRED',
      x402Version: '1',
      accepts: [paymentRequirements],
      pricing: {
        basePrice: pricing.basePrice,
        finalPrice: pricing.finalPrice,
        multiplier: pricing.multiplier,
        breakdown: pricing.breakdown,
        currency: 'USDC'
      },
      agentInfo: {
        address: agentData.address,
        tokenId: agentData.tokenId?.toString(),
        isRegistered: agentData.isRegistered,
        reputation: agentData.reputation,
        riskScore: agentData.riskScore,
        stake: agentData.stake?.toString()
      },
      policy: {
        minStake: config.minStake?.toString(),
        minScore: config.minScore,
        riskMultiplier: config.riskMultiplier
      }
    });
  }
  
  /**
   * Send error response
   */
  _sendError(res, status, message, code, extra = {}) {
    res.status(status).json({
      error: message,
      code,
      ...extra
    });
  }
}

// ============================================
// FACTORY FUNCTION (Simple API)
// ============================================

const AgentTrust = {
  /**
   * Create protection middleware
   * 
   * @example
   * app.use('/api/gpt4', AgentTrust.protect({
   *   minStake: 500,
   *   minScore: 80,
   *   riskMultiplier: 'dynamic'
   * }));
   */
  protect: (options = {}) => {
    const gateway = new AgentTrustGateway(options);
    return gateway.protect(options);
  },
  
  /**
   * Create gateway instance for advanced usage
   */
  createGateway: (config = {}) => {
    return new AgentTrustGateway(config);
  },
  
  /**
   * Risk engine for standalone use
   */
  RiskEngine,
  
  /**
   * Pricing engine for standalone use
   */
  PricingEngine,
  
  /**
   * PoW validator for standalone use
   */
  PoWValidator,
  
  /**
   * Macaroon manager for standalone use
   */
  MacaroonManager
};

module.exports = {
  AgentTrust,
  AgentTrustGateway,
  RiskEngine,
  PricingEngine,
  PoWValidator,
  MacaroonManager,
  DEFAULT_CONFIG
};
