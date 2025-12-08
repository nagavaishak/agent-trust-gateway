/**
 * @agent-trust/gateway TypeScript definitions
 */

import { Request, Response, NextFunction } from 'express';

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  usdc: string;
  contracts: ContractAddresses;
}

export interface ContractAddresses {
  agentRegistry: string | null;
  stakingModule: string | null;
  reputationEngine: string | null;
  jobLogger: string | null;
}

export interface GatewayConfig {
  /** Network to use: 'fuji' | 'avalanche' */
  network?: string;
  
  /** Custom RPC URL */
  rpcUrl?: string;
  
  /** Contract addresses (overrides network defaults) */
  contracts?: Partial<ContractAddresses>;
  
  /** Minimum stake required (in AVAX as string, e.g., '0.1') */
  minStake?: string | number | bigint;
  
  /** Minimum reputation score (0-100) */
  minScore?: number;
  
  /** Base price in USDC */
  basePrice?: number;
  
  /** Risk multiplier: 'fixed' | 'dynamic' */
  riskMultiplier?: 'fixed' | 'dynamic';
  
  /** Max requests per minute */
  maxRequestsPerMinute?: number;
  
  /** Max requests per hour */
  maxRequestsPerHour?: number;
  
  /** PoW difficulty (0 = disabled) */
  powDifficulty?: number;
  
  /** Session token TTL in seconds */
  sessionTTL?: number;
  
  /** Max requests per session */
  maxSessionRequests?: number;
  
  /** Block unregistered agents */
  blockUnregistered?: boolean;
  
  /** Block agents with no stake */
  blockUnstaked?: boolean;
  
  /** Address to receive payments */
  payTo?: string;
  
  /** Secret key for session tokens */
  sessionSecret?: string;
}

export interface AgentData {
  address: string;
  tokenId: string | null;
  isRegistered: boolean;
  stake: string;
  reputation: number;
  riskScore: number;
  isNew: boolean;
}

export interface PricingInfo {
  basePrice: number;
  finalPrice: number;
  multiplier: number;
  breakdown: {
    reputationFactor: number;
    riskFactor: number;
    stakeFactor: number;
    newAgentFactor: number;
  };
}

export interface AgentTrustData extends AgentData {
  pricing: PricingInfo;
  verified: boolean;
  session: string;
  processingTime: number;
  sessionResume?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      agentTrust?: AgentTrustData;
    }
  }
}

export type ProtectMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export class RiskEngine {
  calculateRisk(agentId: string, context?: { payloadSize?: number }): number;
  recordRequest(agentId: string): void;
  recordFailure(agentId: string): void;
  flagAbuse(agentId: string, reason: string): void;
  shouldBlock(agentId: string): boolean;
}

export class PricingEngine {
  static calculatePrice(basePrice: number, agentData: Partial<AgentData>): PricingInfo;
}

export class SessionManager {
  constructor(secretKey?: string);
  issue(agentId: string, caveats?: Record<string, any>): string;
  verify(token: string): { valid: boolean; session?: any; error?: string };
  revoke(sessionId: string): void;
}

export class PoWValidator {
  static generateChallenge(): { challenge: string; timestamp: number; expiresAt: number };
  static verifySolution(challenge: string, nonce: string, difficulty: number): boolean;
}

export class ContractInterface {
  constructor(config: GatewayConfig);
  getAgentTokenId(address: string): Promise<bigint | null>;
  isRegistered(address: string): Promise<boolean>;
  getStake(tokenId: bigint): Promise<bigint>;
  getReputationScore(tokenId: bigint): Promise<number>;
}

export class AgentTrustGateway {
  constructor(config?: GatewayConfig);
  protect(options?: GatewayConfig): ProtectMiddleware;
  riskEngine: RiskEngine;
  sessionManager: SessionManager;
  contracts: ContractInterface;
}

export interface AgentTrustStatic {
  /**
   * Create protection middleware
   * @example
   * app.use('/api/gpt4', AgentTrust.protect({ minStake: '0.1', minScore: 80 }));
   */
  protect(options?: GatewayConfig): ProtectMiddleware;
  
  /**
   * Create gateway instance for advanced usage
   */
  createGateway(config?: GatewayConfig): AgentTrustGateway;
  
  RiskEngine: typeof RiskEngine;
  PricingEngine: typeof PricingEngine;
  SessionManager: typeof SessionManager;
  PoWValidator: typeof PoWValidator;
  ContractInterface: typeof ContractInterface;
  
  NETWORKS: Record<string, NetworkConfig>;
  DEFAULT_CONFIG: GatewayConfig;
}

export const AgentTrust: AgentTrustStatic;
export const NETWORKS: Record<string, NetworkConfig>;
export const DEFAULT_CONFIG: GatewayConfig;

export default AgentTrust;
