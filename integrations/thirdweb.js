/**
 * Thirdweb x402 Facilitator Integration
 * 
 * Handles payment settlement through Thirdweb with independent verification.
 * Implements the "Facilitator Redundancy & Sidecar Verification" pattern.
 */

const { ethers } = require('ethers');

// ============================================
// CONFIGURATION
// ============================================

const THIRDWEB_CONFIG = {
  // Thirdweb x402 facilitator endpoint
  facilitatorUrl: process.env.THIRDWEB_FACILITATOR_URL || 'https://x402.thirdweb.com',
  
  // API key (if required)
  apiKey: process.env.THIRDWEB_API_KEY || '',
  
  // Network configs
  networks: {
    fuji: {
      chainId: 43113,
      rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
      usdc: '0x5425890298aed601595a70AB815c96711a31Bc65'
    },
    avalanche: {
      chainId: 43114,
      rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
      usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
    }
  },
  
  // Verification settings
  maxVerificationRetries: 3,
  verificationDelayMs: 2000
};

// ============================================
// USDC ABI (minimal for transfer verification)
// ============================================

const USDC_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address account) view returns (uint256)'
];

// ============================================
// THIRDWEB FACILITATOR CLASS
// ============================================

class ThirdwebFacilitator {
  constructor(config = {}) {
    this.config = { ...THIRDWEB_CONFIG, ...config };
    this.network = config.network || 'fuji';
    this.networkConfig = this.config.networks[this.network];
    
    // Initialize provider for verification
    this.provider = new ethers.JsonRpcProvider(
      this.networkConfig.rpcUrl,
      { chainId: this.networkConfig.chainId, name: this.network }
    );
    
    // USDC contract for verification
    this.usdc = new ethers.Contract(
      this.networkConfig.usdc,
      USDC_ABI,
      this.provider
    );
  }
  
  /**
   * Create x402 payment requirements with gateway policy
   * Returns WWW-Authenticate compatible JSON
   */
  createPaymentRequirements(options = {}) {
    const {
      amount,           // Amount in USDC (e.g., 0.05)
      payTo,            // Recipient address
      description,      // Payment description
      minStake,         // Gateway policy: minimum stake required
      minScore,         // Gateway policy: minimum reputation
      riskMultiplier,   // Gateway policy: risk multiplier applied
      trustLevel        // Gateway policy: trust level required
    } = options;
    
    return {
      // Standard x402 fields
      scheme: 'exact',
      network: `avalanche-${this.network}`,
      maxAmountRequired: Math.round(amount * 1_000_000).toString(), // USDC has 6 decimals
      asset: this.networkConfig.usdc,
      payTo: payTo,
      description: description || `API access - ${amount} USDC`,
      maxTimeoutSeconds: 300,
      
      // AgentTrust Gateway Policy (extension)
      gatewayPolicy: {
        minStake: minStake?.toString() || '0',
        minScore: minScore || 0,
        riskMultiplier: riskMultiplier || 1.0,
        trustLevelRequired: trustLevel || 'basic',
        unbondingPeriod: 3600, // 1 hour in seconds
        facilitator: 'thirdweb',
        version: '1.0.0'
      }
    };
  }
  
  /**
   * Parse and verify x402 payment header
   * @param {string} paymentHeader - X-Payment header value (base64 encoded)
   * @returns {object} Parsed payment data
   */
  parsePaymentHeader(paymentHeader) {
    try {
      const decoded = Buffer.from(paymentHeader, 'base64').toString();
      const payment = JSON.parse(decoded);
      
      return {
        valid: true,
        payment: {
          txHash: payment.txHash || payment.transactionHash,
          amount: payment.amount,
          from: payment.from,
          to: payment.to,
          signature: payment.signature,
          timestamp: payment.timestamp
        }
      };
    } catch (e) {
      return { valid: false, error: 'Invalid payment header format' };
    }
  }
  
  /**
   * Settle payment through Thirdweb facilitator
   * @param {object} paymentData - Payment data from X-Payment header
   * @param {object} requirements - Payment requirements
   * @returns {object} Settlement result
   */
  async settlePayment(paymentData, requirements) {
    try {
      // Option 1: Use Thirdweb facilitator API
      if (this.config.facilitatorUrl && this.config.apiKey) {
        const response = await fetch(`${this.config.facilitatorUrl}/settle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            payment: paymentData,
            requirements: requirements
          })
        });
        
        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Facilitator error: ${error}` };
        }
        
        const result = await response.json();
        
        // Verify settlement independently (Facilitator Redundancy)
        const verified = await this.verifySettlement(result.txHash, requirements);
        
        if (!verified.success) {
          return { 
            success: false, 
            error: 'Settlement verification failed',
            facilitatorResult: result,
            verificationResult: verified
          };
        }
        
        return {
          success: true,
          txHash: result.txHash,
          amount: result.amount,
          verified: true,
          facilitator: 'thirdweb'
        };
      }
      
      // Option 2: Direct on-chain verification (if facilitator not configured)
      if (paymentData.txHash) {
        const verified = await this.verifySettlement(paymentData.txHash, requirements);
        return verified;
      }
      
      return { success: false, error: 'No facilitator configured and no txHash provided' };
      
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Verify settlement on-chain (Facilitator Redundancy)
   * "After Thirdweb returns settlement, Verifier Service polls chain for
   * the same txHash and cross-checks logs; if mismatch, gateway refuses to honor macaroon"
   */
  async verifySettlement(txHash, requirements) {
    let retries = 0;
    
    while (retries < this.config.maxVerificationRetries) {
      try {
        // Get transaction receipt
        const receipt = await this.provider.getTransactionReceipt(txHash);
        
        if (!receipt) {
          // Transaction not yet mined, wait and retry
          await this._delay(this.config.verificationDelayMs);
          retries++;
          continue;
        }
        
        // Check transaction was successful
        if (receipt.status !== 1) {
          return { success: false, error: 'Transaction failed on-chain' };
        }
        
        // Parse Transfer events from USDC contract
        const transferEvents = receipt.logs
          .filter(log => log.address.toLowerCase() === this.networkConfig.usdc.toLowerCase())
          .map(log => {
            try {
              return this.usdc.interface.parseLog(log);
            } catch { return null; }
          })
          .filter(event => event && event.name === 'Transfer');
        
        if (transferEvents.length === 0) {
          return { success: false, error: 'No USDC transfer found in transaction' };
        }
        
        // Verify transfer matches requirements
        const transfer = transferEvents[0];
        const transferAmount = Number(transfer.args.value);
        const requiredAmount = parseInt(requirements.maxAmountRequired);
        
        // Check recipient
        if (transfer.args.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
          return { 
            success: false, 
            error: 'Transfer recipient mismatch',
            expected: requirements.payTo,
            actual: transfer.args.to
          };
        }
        
        // Check amount (allow small variance for gas)
        if (transferAmount < requiredAmount * 0.99) {
          return { 
            success: false, 
            error: 'Transfer amount insufficient',
            expected: requiredAmount,
            actual: transferAmount
          };
        }
        
        return {
          success: true,
          txHash: txHash,
          blockNumber: receipt.blockNumber,
          from: transfer.args.from,
          to: transfer.args.to,
          amount: transferAmount,
          verified: true,
          verifiedAt: new Date().toISOString()
        };
        
      } catch (e) {
        retries++;
        if (retries >= this.config.maxVerificationRetries) {
          return { success: false, error: `Verification failed: ${e.message}` };
        }
        await this._delay(this.config.verificationDelayMs);
      }
    }
    
    return { success: false, error: 'Verification timed out' };
  }
  
  /**
   * Check balance of an address
   */
  async getBalance(address) {
    try {
      const balance = await this.usdc.balanceOf(address);
      return {
        raw: balance.toString(),
        formatted: (Number(balance) / 1_000_000).toFixed(6),
        decimals: 6
      };
    } catch (e) {
      return { error: e.message };
    }
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// EXPRESS MIDDLEWARE
// ============================================

/**
 * Thirdweb payment verification middleware
 * Use after AgentTrust.protect() to verify actual payment
 */
function verifyPayment(options = {}) {
  const facilitator = new ThirdwebFacilitator(options);
  
  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];
    
    if (!paymentHeader) {
      // No payment header - let AgentTrust.protect() handle 402
      return next();
    }
    
    // Parse payment header
    const parsed = facilitator.parsePaymentHeader(paymentHeader);
    if (!parsed.valid) {
      return res.status(400).json({
        error: 'Invalid payment header',
        code: 'INVALID_PAYMENT'
      });
    }
    
    // Get payment requirements from AgentTrust context
    const requirements = req.agentTrust?.paymentRequirements || options.requirements;
    
    if (!requirements) {
      return res.status(500).json({
        error: 'Payment requirements not configured',
        code: 'CONFIG_ERROR'
      });
    }
    
    // Verify and settle payment
    const result = await facilitator.settlePayment(parsed.payment, requirements);
    
    if (!result.success) {
      return res.status(402).json({
        error: 'Payment verification failed',
        code: 'PAYMENT_FAILED',
        details: result.error
      });
    }
    
    // Attach verified payment to request
    req.paymentVerified = {
      ...result,
      facilitator: 'thirdweb'
    };
    
    next();
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  ThirdwebFacilitator,
  verifyPayment,
  THIRDWEB_CONFIG
};
