/**
 * @agent-trust/gateway
 * 
 * The Cloudflare for x402 APIs — drop-in trust middleware that enforces
 * identity, reputation, staking, and economic security BEFORE payment settles.
 * 
 * @example
 * const { AgentTrust } = require('@agent-trust/gateway');
 * 
 * // Simple usage
 * app.use('/api/gpt4', AgentTrust.protect({
 *   minStake: '0.1',      // 0.1 AVAX minimum
 *   minScore: 80,         // 80+ reputation required
 *   basePrice: 0.05       // $0.05 base price
 * }));
 * 
 * // With contract addresses
 * app.use('/api/claude', AgentTrust.protect({
 *   contracts: {
 *     agentRegistry: '0x...',
 *     stakingModule: '0x...',
 *     reputationEngine: '0x...'
 *   },
 *   network: 'fuji'
 * }));
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// ============================================
// NETWORK CONFIGURATIONS
// ============================================

const NETWORKS = {
  fuji: {
    name: 'Avalanche Fuji Testnet',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorer: 'https://testnet.snowscan.xyz',
    usdc: '0x5425890298aed601595a70AB815c96711a31Bc65',
    // Default contract addresses (AgentTrust deployments)
    contracts: {
      agentRegistry: '0xea5D764e8967b761A2Ad0817eDad81381cc6cF12',
      stakingModule: '0x1873A4ba044e8a2c99031A851b043aC13476F0ED',
      reputationEngine: '0xbcFC99A4391544Baa65Df5874D7b001FFA3BA9A1',
      jobLogger: '0x05C419d5E7070dD57613dF5dBCE1b7d3F5B3dCd2'
    }
  },
  avalanche: {
    name: 'Avalanche C-Chain',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorer: 'https://snowscan.xyz',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    contracts: {
      agentRegistry: null,
      stakingModule: null,
      reputationEngine: null,
      jobLogger: null
    }
  }
};

// ============================================
// DEFAULT CONFIGURATION
// ============================================

const DEFAULT_CONFIG = {
  // Network
  network: 'fuji',
  
  // Staking requirements
  minStake: 0,              // Minimum stake (in AVAX string or wei)
  
  // Reputation requirements  
  minScore: 0,              // Minimum reputation score 0-100
  
  // Pricing
  basePrice: 0.01,          // Base price in USDC
  riskMultiplier: 'dynamic', // 'fixed' | 'dynamic'
  
  // Rate limiting
  maxRequestsPerMinute: 60,
  maxRequestsPerHour: 1000,
  
  // PoW difficulty (0 = disabled)
  powDifficulty: 0,
  
  // Session tokens
  sessionTTL: 300,          // Macaroon TTL in seconds
  maxSessionRequests: 100,
  
  // Blocking behavior
  blockUnregistered: false,
  blockUnstaked: false,
  
  // Payment
  payTo: null               // Address to receive payments
};

// ============================================
// RISK SCORING ENGINE
// ============================================

class RiskEngine {
  constructor() {
    this.requestHistory = new Map();
    this.failureHistory = new Map();
    this.abuseFlags = new Map();
  }
  
  calculateRisk(agentId, context = {}) {
    let riskScore = 0;
    
    // Request frequency (burst detection)
    const history = this.requestHistory.get(agentId) || [];
    const recentRequests = history.filter(t => Date.now() - t < 60000).length;
    if (recentRequests > 30) riskScore += 20;
    else if (recentRequests > 10) riskScore += 10;
    
    // Failure rate
    const failures = this.failureHistory.get(agentId) || 0;
    if (failures > 10) riskScore += 30;
    else if (failures > 5) riskScore += 15;
    
    // Abuse flags
    const flags = this.abuseFlags.get(agentId) || [];
    riskScore += flags.length * 10;
    
    // New agent penalty
    if (history.length < 5) riskScore += 15;
    
    // Large payload
    if (context.payloadSize && context.payloadSize > 100000) {
      riskScore += 20;
    }
    
    return Math.min(riskScore, 100);
  }
  
  recordRequest(agentId) {
    const history = this.requestHistory.get(agentId) || [];
    history.push(Date.now());
    const oneHourAgo = Date.now() - 3600000;
    this.requestHistory.set(agentId, history.filter(t => t > oneHourAgo));
  }
  
  recordFailure(agentId) {
    const count = this.failureHistory.get(agentId) || 0;
    this.failureHistory.set(agentId, count + 1);
  }
  
  flagAbuse(agentId, reason) {
    const flags = this.abuseFlags.get(agentId) || [];
    flags.push({ reason, timestamp: Date.now() });
    this.abuseFlags.set(agentId, flags);
  }
  
  shouldBlock(agentId) {
    const risk = this.calculateRisk(agentId);
    const flags = this.abuseFlags.get(agentId) || [];
    return risk > 80 || flags.length >= 3;
  }
}

// ============================================
// PROOF OF WORK
// ============================================

class PoWValidator {
  static generateChallenge() {
    return {
      challenge: crypto.randomBytes(32).toString('hex'),
      timestamp: Date.now(),
      expiresAt: Date.now() + 30000
    };
  }
  
  static verifySolution(challenge, nonce, difficulty) {
    if (difficulty === 0) return true;
    const hash = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
    return hash.startsWith('0'.repeat(difficulty));
  }
}

// ============================================
// SESSION TOKENS (MACAROONS)
// ============================================

class SessionManager {
  constructor(secretKey) {
    this.secretKey = secretKey || crypto.randomBytes(32).toString('hex');
    this.revoked = new Set();
  }
  
  issue(agentId, caveats = {}) {
    const session = {
      id: crypto.randomBytes(16).toString('hex'),
      agentId,
      issuedAt: Date.now(),
      caveats: {
        ttl: caveats.ttl || 300,
        maxRequests: caveats.maxRequests || 100,
        endpoints: caveats.endpoints || ['*'],
        maxCost: caveats.maxCost || 1.0,
        ...caveats
      },
      requestCount: 0
    };
    
    session.signature = this._sign(session);
    return Buffer.from(JSON.stringify(session)).toString('base64');
  }
  
  verify(token) {
    try {
      const session = JSON.parse(Buffer.from(token, 'base64').toString());
      
      if (this.revoked.has(session.id)) {
        return { valid: false, error: 'Session revoked' };
      }
      
      const { signature, ...data } = session;
      if (signature !== this._sign(data)) {
        return { valid: false, error: 'Invalid signature' };
      }
      
      if ((Date.now() - session.issuedAt) / 1000 > session.caveats.ttl) {
        return { valid: false, error: 'Session expired' };
      }
      
      if (session.requestCount >= session.caveats.maxRequests) {
        return { valid: false, error: 'Request limit exceeded' };
      }
      
      return { valid: true, session };
    } catch (e) {
      return { valid: false, error: 'Invalid session format' };
    }
  }
  
  revoke(sessionId) {
    this.revoked.add(sessionId);
  }
  
  _sign(data) {
    return crypto.createHmac('sha256', this.secretKey).update(JSON.stringify(data)).digest('hex');
  }
}

// ============================================
// CONTRACT INTERFACE
// ============================================

class ContractInterface {
  constructor(config) {
    const network = NETWORKS[config.network] || NETWORKS.fuji;
    
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl || network.rpcUrl, {
      chainId: network.chainId,
      name: network.name
    });
    
    const contracts = config.contracts || network.contracts;
    
    const REGISTRY_ABI = [
      'function agentToTokenId(address agent) view returns (uint256)',
      'function isRegisteredAgent(address agent) view returns (bool)',
      'function isActiveAgent(uint256 tokenId) view returns (bool)'
    ];
    
    const STAKING_ABI = [
      'function getEffectiveStake(uint256 agentTokenId) view returns (uint256)',
      'function hasMinimumStake(uint256 agentTokenId) view returns (bool)'
    ];
    
    const REPUTATION_ABI = [
      'function getScore(uint256 agentTokenId) view returns (uint256)',
      'function meetsThreshold(uint256 agentTokenId, uint256 minScore) view returns (bool)'
    ];
    
    if (contracts.agentRegistry) {
      this.registry = new ethers.Contract(contracts.agentRegistry, REGISTRY_ABI, this.provider);
    }
    if (contracts.stakingModule) {
      this.staking = new ethers.Contract(contracts.stakingModule, STAKING_ABI, this.provider);
    }
    if (contracts.reputationEngine) {
      this.reputation = new ethers.Contract(contracts.reputationEngine, REPUTATION_ABI, this.provider);
    }
  }
  
  async getAgentTokenId(address) {
    if (!this.registry) return null;
    try {
      const tokenId = await this.registry.agentToTokenId(address);
      return tokenId > 0n ? tokenId : null;
    } catch { return null; }
  }
  
  async isRegistered(address) {
    if (!this.registry) return true;
    try { return await this.registry.isRegisteredAgent(address); }
    catch { return false; }
  }
  
  async getStake(tokenId) {
    if (!this.staking) return 0n;
    try { return await this.staking.getEffectiveStake(tokenId); }
    catch { return 0n; }
  }
  
  async getReputationScore(tokenId) {
    if (!this.reputation) return 50;
    try { return Number(await this.reputation.getScore(tokenId)); }
    catch { return 50; }
  }
}

// ============================================
// PRICING ENGINE
// ============================================

class PricingEngine {
  static calculatePrice(basePrice, agentData) {
    let multiplier = 1.0;
    
    // Reputation discount
    if (agentData.reputation >= 90) multiplier *= 0.5;
    else if (agentData.reputation >= 70) multiplier *= 0.75;
    else if (agentData.reputation < 50) multiplier *= 1.5;
    
    // Risk surcharge
    if (agentData.riskScore > 50) multiplier *= 1.5;
    else if (agentData.riskScore > 25) multiplier *= 1.25;
    
    // Stake bonus
    const stakeNum = Number(agentData.stake || 0);
    if (stakeNum > 0) {
      multiplier *= (1 - Math.min(stakeNum / 10e18, 0.2));
    }
    
    // New agent premium
    if (agentData.isNew) multiplier *= 1.25;
    
    return {
      basePrice,
      finalPrice: Math.max(basePrice * multiplier, basePrice * 0.25),
      multiplier,
      breakdown: {
        reputationFactor: agentData.reputation >= 90 ? 0.5 : agentData.reputation >= 70 ? 0.75 : agentData.reputation < 50 ? 1.5 : 1.0,
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
    this.sessionManager = new SessionManager(config.sessionSecret);
    this.contracts = new ContractInterface(this.config);
    this.powChallenges = new Map();
  }
  
  /**
   * Express middleware factory
   */
  protect(options = {}) {
    const config = { ...this.config, ...options };
    const minStakeWei = this._parseStake(config.minStake);
    
    return async (req, res, next) => {
      const startTime = Date.now();
      
      try {
        // 1. Extract agent identity
        const agentAddress = req.headers['x-agent-address'] || req.query.agent;
        if (!agentAddress && config.blockUnregistered) {
          return this._error(res, 401, 'Agent address required', 'AGENT_REQUIRED');
        }
        
        // 2. Check session token
        const sessionToken = req.headers['x-session'] || req.headers['x-macaroon'];
        if (sessionToken) {
          const result = this.sessionManager.verify(sessionToken);
          if (result.valid) {
            req.agentTrust = { agentAddress: result.session.agentId, sessionResume: true };
            return next();
          }
        }
        
        // 3. PoW check
        if (config.powDifficulty > 0) {
          const powResult = this._verifyPoW(req, config.powDifficulty);
          if (!powResult.valid) {
            return res.status(429).json({
              error: 'Proof of Work Required',
              code: 'POW_REQUIRED',
              challenge: powResult.challenge.challenge,
              difficulty: config.powDifficulty,
              expiresAt: powResult.challenge.expiresAt
            });
          }
        }
        
        // 4. Get agent data from contracts
        let agentData = {
          address: agentAddress,
          tokenId: null,
          isRegistered: false,
          stake: 0n,
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
          agentData.riskScore = this.riskEngine.calculateRisk(agentAddress, {
            payloadSize: req.headers['content-length']
          });
        }
        
        // 5. Check blocking conditions
        if (config.blockUnregistered && !agentData.isRegistered) {
          return this._error(res, 403, 'Agent not registered', 'NOT_REGISTERED');
        }
        
        if (config.blockUnstaked && agentData.stake === 0n) {
          return this._error(res, 403, 'Stake required', 'NO_STAKE');
        }
        
        if (this.riskEngine.shouldBlock(agentAddress)) {
          return this._error(res, 403, 'Agent blocked due to abuse', 'BLOCKED');
        }
        
        // 6. Check minimum requirements
        if (minStakeWei > 0n && agentData.stake < minStakeWei) {
          return this._error(res, 402, `Minimum stake required`, 'INSUFFICIENT_STAKE', {
            required: minStakeWei.toString(),
            current: agentData.stake.toString()
          });
        }
        
        if (config.minScore > 0 && agentData.reputation < config.minScore) {
          return this._error(res, 402, `Minimum reputation of ${config.minScore} required`, 'INSUFFICIENT_REPUTATION', {
            required: config.minScore,
            current: agentData.reputation
          });
        }
        
        // 7. Calculate dynamic price
        const pricing = PricingEngine.calculatePrice(config.basePrice, agentData);
        
        // 8. Check for payment
        const paymentHeader = req.headers['x-payment'];
        if (!paymentHeader) {
          return this._paymentRequired(res, pricing, agentData, config);
        }
        
        // 9. Record request & issue session
        this.riskEngine.recordRequest(agentAddress);
        
        const session = this.sessionManager.issue(agentAddress, {
          ttl: config.sessionTTL,
          maxRequests: config.maxSessionRequests,
          endpoints: [req.path]
        });
        
        // 10. Attach trust data
        req.agentTrust = {
          ...agentData,
          stake: agentData.stake.toString(),
          tokenId: agentData.tokenId?.toString(),
          pricing,
          verified: true,
          session,
          processingTime: Date.now() - startTime
        };
        
        res.setHeader('X-Session', session);
        res.setHeader('X-Trust-Score', agentData.reputation);
        res.setHeader('X-Risk-Score', agentData.riskScore);
        
        next();
        
      } catch (error) {
        console.error('[AgentTrust] Error:', error.message);
        return this._error(res, 500, 'Gateway error', 'INTERNAL_ERROR');
      }
    };
  }
  
  _parseStake(stake) {
    if (!stake) return 0n;
    if (typeof stake === 'bigint') return stake;
    if (typeof stake === 'number') return BigInt(Math.floor(stake * 1e18));
    if (typeof stake === 'string') {
      if (stake.includes('.')) return BigInt(Math.floor(parseFloat(stake) * 1e18));
      return BigInt(stake);
    }
    return 0n;
  }
  
  _verifyPoW(req, difficulty) {
    const challenge = req.headers['x-pow-challenge'];
    const nonce = req.headers['x-pow-nonce'];
    
    if (!challenge || !nonce) {
      const newChallenge = PoWValidator.generateChallenge();
      this.powChallenges.set(newChallenge.challenge, newChallenge);
      return { valid: false, challenge: newChallenge };
    }
    
    const stored = this.powChallenges.get(challenge);
    if (!stored || Date.now() > stored.expiresAt) {
      const newChallenge = PoWValidator.generateChallenge();
      this.powChallenges.set(newChallenge.challenge, newChallenge);
      return { valid: false, challenge: newChallenge };
    }
    
    if (!PoWValidator.verifySolution(challenge, nonce, difficulty)) {
      return { valid: false, challenge: stored };
    }
    
    this.powChallenges.delete(challenge);
    return { valid: true };
  }
  
  _paymentRequired(res, pricing, agentData, config) {
    const network = NETWORKS[config.network] || NETWORKS.fuji;
    
    res.status(402).json({
      error: 'Payment Required',
      code: 'PAYMENT_REQUIRED',
      x402Version: '1',
      accepts: [{
        scheme: 'exact',
        network: config.network,
        maxAmountRequired: Math.round(pricing.finalPrice * 1_000_000).toString(),
        asset: network.usdc,
        payTo: config.payTo,
        description: `API access - ${pricing.finalPrice.toFixed(4)} USDC`,
        maxTimeoutSeconds: 300
      }],
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
      }
    });
  }
  
  _error(res, status, message, code, extra = {}) {
    res.status(status).json({ error: message, code, ...extra });
  }
}

// ============================================
// PUBLIC API
// ============================================

const AgentTrust = {
  /**
   * Create protection middleware
   * 
   * @example
   * app.use('/api/gpt4', AgentTrust.protect({
   *   minStake: '0.1',
   *   minScore: 80,
   *   basePrice: 0.05
   * }));
   */
  protect: (options = {}) => {
    const gateway = new AgentTrustGateway(options);
    return gateway.protect(options);
  },
  
  /**
   * Create gateway instance for advanced usage
   */
  createGateway: (config = {}) => new AgentTrustGateway(config),
  
  // Expose internals for advanced usage
  RiskEngine,
  PricingEngine,
  SessionManager,
  PoWValidator,
  ContractInterface,
  
  // Network configs
  NETWORKS,
  DEFAULT_CONFIG
};

module.exports = { AgentTrust, AgentTrustGateway, NETWORKS, DEFAULT_CONFIG };
module.exports.default = AgentTrust;
