/**
 * Youmio Integration
 * 
 * Integrates with Youmio for agent provenance and decentralized identifiers (DIDs).
 * "Store Youmio-issued decentralized verifiable credentials (DIDs) in AgentRegistry
 * metadata to elevate agent trust when present."
 */

const { ethers } = require('ethers');

// ============================================
// CONFIGURATION
// ============================================

const YOUMIO_CONFIG = {
  // Youmio API endpoint
  apiUrl: process.env.YOUMIO_API_URL || 'https://api.youmio.ai',
  
  // API key
  apiKey: process.env.YOUMIO_API_KEY || '',
  
  // DID method
  didMethod: 'did:youmio',
  
  // Trust boost for verified Youmio agents
  verifiedTrustBoost: 15, // Add 15 points to reputation
  
  // Cache TTL (seconds)
  cacheTTL: 600
};

// ============================================
// AGENT REGISTRY ABI (for provenance storage)
// ============================================

const AGENT_REGISTRY_ABI = [
  'function updateAgent(uint256 tokenId, string metadataURI, bytes32 provenanceId) external',
  'function agents(uint256 tokenId) view returns (address agentAddress, string metadataURI, uint256 registeredAt, bool active, bytes32 provenanceId, uint256 totalJobs, uint256 totalVolume)',
  'function agentToTokenId(address agent) view returns (uint256)'
];

// ============================================
// YOUMIO INTEGRATION CLASS
// ============================================

class YoumioIntegration {
  constructor(config = {}) {
    this.config = { ...YOUMIO_CONFIG, ...config };
    this.cache = new Map();
    
    // Initialize provider if needed
    if (config.rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    }
    
    // Initialize AgentRegistry contract if address provided
    if (config.agentRegistryAddress && this.provider) {
      this.agentRegistry = new ethers.Contract(
        config.agentRegistryAddress,
        AGENT_REGISTRY_ABI,
        this.provider
      );
    }
  }
  
  /**
   * Resolve a Youmio DID to agent profile
   * @param {string} did - Youmio DID (e.g., did:youmio:abc123)
   * @returns {Promise<object>}
   */
  async resolveDID(did) {
    // Check cache
    const cached = this._getFromCache(`did:${did}`);
    if (cached) return cached;
    
    try {
      if (this.config.apiKey) {
        const response = await fetch(
          `${this.config.apiUrl}/v1/did/resolve/${encodeURIComponent(did)}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const profile = await response.json();
          this._setCache(`did:${did}`, profile);
          return profile;
        }
      }
      
      return null;
      
    } catch (e) {
      console.error('[Youmio] Error resolving DID:', e.message);
      return null;
    }
  }
  
  /**
   * Get Youmio agent profile by wallet address
   * @param {string} address - Wallet address
   * @returns {Promise<object>}
   */
  async getAgentByAddress(address) {
    const cached = this._getFromCache(`addr:${address}`);
    if (cached) return cached;
    
    try {
      if (this.config.apiKey) {
        const response = await fetch(
          `${this.config.apiUrl}/v1/agents/address/${address}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const agent = await response.json();
          this._setCache(`addr:${address}`, agent);
          return agent;
        }
      }
      
      return null;
      
    } catch (e) {
      console.error('[Youmio] Error fetching agent:', e.message);
      return null;
    }
  }
  
  /**
   * Verify agent credentials from Youmio
   * @param {string} address - Agent wallet address
   * @returns {Promise<object>}
   */
  async verifyCredentials(address) {
    try {
      const agent = await this.getAgentByAddress(address);
      
      if (!agent) {
        return {
          verified: false,
          reason: 'Agent not found in Youmio'
        };
      }
      
      // Check if agent has valid credentials
      const hasValidDID = agent.did && agent.did.startsWith(this.config.didMethod);
      const hasValidSignature = agent.signature && await this._verifySignature(agent);
      const isActive = agent.status === 'active';
      
      return {
        verified: hasValidDID && isActive,
        did: agent.did,
        credentials: agent.credentials || [],
        isActive: isActive,
        hasValidSignature: hasValidSignature,
        metadata: {
          name: agent.name,
          description: agent.description,
          createdAt: agent.createdAt,
          capabilities: agent.capabilities || []
        }
      };
      
    } catch (e) {
      return {
        verified: false,
        error: e.message
      };
    }
  }
  
  /**
   * Generate provenance ID from Youmio DID
   * Used for storing in AgentRegistry
   * @param {string} did - Youmio DID
   * @returns {string} bytes32 provenance ID
   */
  generateProvenanceId(did) {
    if (!did) return ethers.ZeroHash;
    return ethers.id(did); // keccak256 hash of DID
  }
  
  /**
   * Link Youmio DID to on-chain agent
   * @param {string} agentAddress - Agent wallet address
   * @param {string} did - Youmio DID
   * @param {ethers.Signer} signer - Transaction signer
   * @returns {Promise<object>}
   */
  async linkDIDToAgent(agentAddress, did, signer) {
    if (!this.agentRegistry) {
      return { success: false, error: 'AgentRegistry not configured' };
    }
    
    try {
      // Get token ID for agent
      const tokenId = await this.agentRegistry.agentToTokenId(agentAddress);
      if (tokenId === 0n) {
        return { success: false, error: 'Agent not registered' };
      }
      
      // Generate provenance ID
      const provenanceId = this.generateProvenanceId(did);
      
      // Get current metadata
      const agentInfo = await this.agentRegistry.agents(tokenId);
      
      // Update agent with provenance ID
      const contract = this.agentRegistry.connect(signer);
      const tx = await contract.updateAgent(
        tokenId,
        agentInfo.metadataURI,
        provenanceId
      );
      
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.hash,
        tokenId: tokenId.toString(),
        provenanceId: provenanceId,
        did: did
      };
      
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Check if agent has Youmio provenance
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<object>}
   */
  async checkProvenance(agentAddress) {
    if (!this.agentRegistry) {
      return { hasProvenance: false, error: 'AgentRegistry not configured' };
    }
    
    try {
      const tokenId = await this.agentRegistry.agentToTokenId(agentAddress);
      if (tokenId === 0n) {
        return { hasProvenance: false, reason: 'Agent not registered' };
      }
      
      const agentInfo = await this.agentRegistry.agents(tokenId);
      const hasProvenance = agentInfo.provenanceId !== ethers.ZeroHash;
      
      return {
        hasProvenance,
        provenanceId: agentInfo.provenanceId,
        tokenId: tokenId.toString()
      };
      
    } catch (e) {
      return { hasProvenance: false, error: e.message };
    }
  }
  
  /**
   * Calculate trust boost for Youmio-verified agents
   * "Store Youmio-issued DIDs to elevate agent trust when present"
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<number>} Trust boost (0-20)
   */
  async getTrustBoost(agentAddress) {
    const verification = await this.verifyCredentials(agentAddress);
    
    if (!verification.verified) {
      return 0;
    }
    
    let boost = this.config.verifiedTrustBoost;
    
    // Additional boost for credentials
    if (verification.credentials?.length > 0) {
      boost += Math.min(verification.credentials.length * 2, 5);
    }
    
    // Additional boost for long-standing agents
    if (verification.metadata?.createdAt) {
      const ageMonths = (Date.now() - new Date(verification.metadata.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000);
      if (ageMonths > 6) boost += 3;
      else if (ageMonths > 3) boost += 2;
      else if (ageMonths > 1) boost += 1;
    }
    
    return Math.min(boost, 20); // Cap at 20
  }
  
  /**
   * Enrich agent data with Youmio information
   * @param {object} agentData - Existing agent data
   * @returns {Promise<object>} Enriched data
   */
  async enrichAgentData(agentData) {
    const verification = await this.verifyCredentials(agentData.address);
    const trustBoost = await this.getTrustBoost(agentData.address);
    const provenance = await this.checkProvenance(agentData.address);
    
    return {
      ...agentData,
      youmio: {
        verified: verification.verified,
        did: verification.did,
        credentials: verification.credentials,
        trustBoost: trustBoost,
        hasOnChainProvenance: provenance.hasProvenance,
        provenanceId: provenance.provenanceId,
        metadata: verification.metadata,
        enrichedAt: new Date().toISOString()
      },
      // Apply trust boost to reputation
      reputation: Math.min(100, (agentData.reputation || 50) + trustBoost)
    };
  }
  
  // ============================================
  // PRIVATE HELPERS
  // ============================================
  
  async _verifySignature(agent) {
    // Simplified signature verification
    // In production, verify against Youmio's signing key
    return agent.signature && agent.signature.length > 0;
  }
  
  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.config.cacheTTL * 1000) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

// ============================================
// EXPRESS MIDDLEWARE
// ============================================

/**
 * Youmio provenance middleware
 * Enriches agent data with Youmio verification and applies trust boost
 */
function enrichWithYoumio(options = {}) {
  const youmio = new YoumioIntegration(options);
  
  return async (req, res, next) => {
    if (!req.agentTrust?.address) {
      return next();
    }
    
    try {
      req.agentTrust = await youmio.enrichAgentData(req.agentTrust);
      next();
    } catch (e) {
      console.error('[Youmio] Enrichment error:', e.message);
      next(); // Continue without Youmio data
    }
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  YoumioIntegration,
  enrichWithYoumio,
  YOUMIO_CONFIG
};
