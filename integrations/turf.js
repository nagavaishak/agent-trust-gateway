/**
 * Turf Network Integration
 * 
 * Enriches trust decisions with Turf's behavioral data layer.
 * "Call Turf scoring APIs to enrich trust decisions (e.g., geolocation, data provenance).
 * Use Turf output as an additional input to getRiskMultiplier()"
 */

// ============================================
// CONFIGURATION
// ============================================

const TURF_CONFIG = {
  // Turf API endpoint
  apiUrl: process.env.TURF_API_URL || 'https://api.turf.network',
  
  // API key
  apiKey: process.env.TURF_API_KEY || '',
  
  // Cache TTL (seconds)
  cacheTTL: 300,
  
  // Score weights for risk calculation
  weights: {
    behaviorScore: 0.3,
    provenanceScore: 0.25,
    activityScore: 0.25,
    networkScore: 0.2
  }
};

// ============================================
// TURF DATA TYPES
// ============================================

/**
 * @typedef {Object} TurfAgentProfile
 * @property {string} address - Agent wallet address
 * @property {number} behaviorScore - Behavioral trust score (0-100)
 * @property {number} provenanceScore - Data provenance score (0-100)
 * @property {number} activityScore - Activity/engagement score (0-100)
 * @property {number} networkScore - Network relationship score (0-100)
 * @property {string[]} flags - Any flags or warnings
 * @property {object} metadata - Additional metadata
 */

// ============================================
// TURF INTEGRATION CLASS
// ============================================

class TurfIntegration {
  constructor(config = {}) {
    this.config = { ...TURF_CONFIG, ...config };
    this.cache = new Map();
  }
  
  /**
   * Get agent profile from Turf Network
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<TurfAgentProfile>}
   */
  async getAgentProfile(agentAddress) {
    // Check cache first
    const cached = this._getFromCache(agentAddress);
    if (cached) return cached;
    
    try {
      // If Turf API is configured, fetch from API
      if (this.config.apiKey) {
        const response = await fetch(
          `${this.config.apiUrl}/v1/agents/${agentAddress}/profile`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const profile = await response.json();
          this._setCache(agentAddress, profile);
          return profile;
        }
      }
      
      // Fallback: Return neutral profile
      return this._createNeutralProfile(agentAddress);
      
    } catch (e) {
      console.error('[Turf] Error fetching profile:', e.message);
      return this._createNeutralProfile(agentAddress);
    }
  }
  
  /**
   * Get behavioral data for an agent
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<object>}
   */
  async getBehavioralData(agentAddress) {
    try {
      if (this.config.apiKey) {
        const response = await fetch(
          `${this.config.apiUrl}/v1/agents/${agentAddress}/behavior`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          return await response.json();
        }
      }
      
      // Fallback
      return {
        requestPatterns: 'normal',
        timeOfDayDistribution: 'normal',
        geolocationConsistency: 'unknown',
        interactionHistory: []
      };
      
    } catch (e) {
      console.error('[Turf] Error fetching behavioral data:', e.message);
      return null;
    }
  }
  
  /**
   * Get data provenance verification
   * @param {string} agentAddress - Agent wallet address
   * @param {string} dataHash - Hash of data to verify
   * @returns {Promise<object>}
   */
  async verifyProvenance(agentAddress, dataHash) {
    try {
      if (this.config.apiKey) {
        const response = await fetch(
          `${this.config.apiUrl}/v1/provenance/verify`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              agent: agentAddress,
              dataHash: dataHash
            })
          }
        );
        
        if (response.ok) {
          return await response.json();
        }
      }
      
      return { verified: false, reason: 'Provenance API not configured' };
      
    } catch (e) {
      return { verified: false, error: e.message };
    }
  }
  
  /**
   * Calculate risk multiplier based on Turf data
   * "Use Turf output as an additional input to getRiskMultiplier()"
   * 
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<number>} Risk multiplier (0.5 = low risk, 2.0 = high risk)
   */
  async getRiskMultiplier(agentAddress) {
    const profile = await this.getAgentProfile(agentAddress);
    
    // Calculate weighted score
    const weights = this.config.weights;
    const weightedScore = 
      (profile.behaviorScore * weights.behaviorScore) +
      (profile.provenanceScore * weights.provenanceScore) +
      (profile.activityScore * weights.activityScore) +
      (profile.networkScore * weights.networkScore);
    
    // Convert score (0-100) to risk multiplier (0.5-2.0)
    // High score = low risk = low multiplier
    // Low score = high risk = high multiplier
    if (weightedScore >= 80) return 0.5;   // Very trusted
    if (weightedScore >= 60) return 0.75;  // Trusted
    if (weightedScore >= 40) return 1.0;   // Neutral
    if (weightedScore >= 20) return 1.5;   // Risky
    return 2.0;                             // Very risky
  }
  
  /**
   * Check for flags or warnings on an agent
   * @param {string} agentAddress - Agent wallet address
   * @returns {Promise<object>}
   */
  async checkFlags(agentAddress) {
    const profile = await this.getAgentProfile(agentAddress);
    
    return {
      hasFlags: profile.flags && profile.flags.length > 0,
      flags: profile.flags || [],
      shouldBlock: profile.flags?.includes('blocked') || profile.flags?.includes('malicious'),
      riskLevel: this._calculateRiskLevel(profile)
    };
  }
  
  /**
   * Enrich agent trust data with Turf information
   * @param {object} agentData - Existing agent data from AgentTrust
   * @returns {Promise<object>} Enriched agent data
   */
  async enrichAgentData(agentData) {
    const profile = await this.getAgentProfile(agentData.address);
    const riskMultiplier = await this.getRiskMultiplier(agentData.address);
    const flags = await this.checkFlags(agentData.address);
    
    return {
      ...agentData,
      turf: {
        behaviorScore: profile.behaviorScore,
        provenanceScore: profile.provenanceScore,
        activityScore: profile.activityScore,
        networkScore: profile.networkScore,
        riskMultiplier: riskMultiplier,
        flags: flags.flags,
        riskLevel: flags.riskLevel,
        enrichedAt: new Date().toISOString()
      }
    };
  }
  
  // ============================================
  // PRIVATE HELPERS
  // ============================================
  
  _createNeutralProfile(agentAddress) {
    return {
      address: agentAddress,
      behaviorScore: 50,
      provenanceScore: 50,
      activityScore: 50,
      networkScore: 50,
      flags: [],
      metadata: {
        source: 'default',
        note: 'Turf API not configured or agent not found'
      }
    };
  }
  
  _calculateRiskLevel(profile) {
    const avgScore = (
      profile.behaviorScore +
      profile.provenanceScore +
      profile.activityScore +
      profile.networkScore
    ) / 4;
    
    if (avgScore >= 80) return 'low';
    if (avgScore >= 60) return 'medium-low';
    if (avgScore >= 40) return 'medium';
    if (avgScore >= 20) return 'medium-high';
    return 'high';
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
 * Turf enrichment middleware
 * Adds Turf behavioral data to req.agentTrust
 */
function enrichWithTurf(options = {}) {
  const turf = new TurfIntegration(options);
  
  return async (req, res, next) => {
    if (!req.agentTrust?.address) {
      return next();
    }
    
    try {
      req.agentTrust = await turf.enrichAgentData(req.agentTrust);
      
      // Check for blocking flags
      if (req.agentTrust.turf?.flags?.includes('blocked')) {
        return res.status(403).json({
          error: 'Agent blocked by Turf Network',
          code: 'TURF_BLOCKED',
          flags: req.agentTrust.turf.flags
        });
      }
      
      next();
    } catch (e) {
      console.error('[Turf] Enrichment error:', e.message);
      next(); // Continue without Turf data
    }
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  TurfIntegration,
  enrichWithTurf,
  TURF_CONFIG
};
