/**
 * AgentTrust Gateway - Sponsor Integrations
 * 
 * Integrations with hackathon sponsors:
 * - Thirdweb: x402 payment settlement
 * - Turf: Behavioral data enrichment
 * - Youmio: Agent provenance/DIDs
 */

const { ThirdwebFacilitator, verifyPayment, THIRDWEB_CONFIG } = require('./thirdweb');
const { TurfIntegration, enrichWithTurf, TURF_CONFIG } = require('./turf');
const { YoumioIntegration, enrichWithYoumio, YOUMIO_CONFIG } = require('./youmio');

// ============================================
// COMBINED MIDDLEWARE
// ============================================

/**
 * Apply all sponsor enrichments in sequence
 * 
 * @example
 * app.use('/api/gpt4', 
 *   AgentTrust.protect({ minScore: 80 }),
 *   enrichAll({ turf: { apiKey: '...' }, youmio: { apiKey: '...' } }),
 *   (req, res) => { ... }
 * );
 */
function enrichAll(options = {}) {
  const middlewares = [];
  
  // Add Turf enrichment if configured
  if (options.turf !== false) {
    middlewares.push(enrichWithTurf(options.turf || {}));
  }
  
  // Add Youmio enrichment if configured
  if (options.youmio !== false) {
    middlewares.push(enrichWithYoumio(options.youmio || {}));
  }
  
  // Return combined middleware
  return async (req, res, next) => {
    let index = 0;
    
    const runNext = async (err) => {
      if (err) return next(err);
      if (index >= middlewares.length) return next();
      
      const middleware = middlewares[index++];
      try {
        await middleware(req, res, runNext);
      } catch (e) {
        next(e);
      }
    };
    
    await runNext();
  };
}

/**
 * Full payment flow with Thirdweb verification
 * 
 * @example
 * app.use('/api/gpt4',
 *   AgentTrust.protect({ minScore: 80 }),
 *   verifyAndEnrich({ thirdweb: { apiKey: '...' } }),
 *   (req, res) => { ... }
 * );
 */
function verifyAndEnrich(options = {}) {
  const middlewares = [];
  
  // Payment verification first
  if (options.thirdweb !== false) {
    middlewares.push(verifyPayment(options.thirdweb || {}));
  }
  
  // Then enrichments
  middlewares.push(enrichAll(options));
  
  return async (req, res, next) => {
    let index = 0;
    
    const runNext = async (err) => {
      if (err) return next(err);
      if (index >= middlewares.length) return next();
      
      const middleware = middlewares[index++];
      try {
        await middleware(req, res, runNext);
      } catch (e) {
        next(e);
      }
    };
    
    await runNext();
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Thirdweb
  ThirdwebFacilitator,
  verifyPayment,
  THIRDWEB_CONFIG,
  
  // Turf
  TurfIntegration,
  enrichWithTurf,
  TURF_CONFIG,
  
  // Youmio
  YoumioIntegration,
  enrichWithYoumio,
  YOUMIO_CONFIG,
  
  // Combined
  enrichAll,
  verifyAndEnrich
};
