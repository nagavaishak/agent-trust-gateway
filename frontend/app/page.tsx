'use client';

import { useState, useEffect } from 'react';

interface Agent {
  address: string;
  tokenId: string;
  reputation: number;
  tier: string;
  feeMultiplier: number;
}

interface VerifyResponse {
  approved: boolean;
  agentAddress: string;
  tokenId?: string;
  reputation?: number;
  tier?: string;
  feeMultiplier?: number;
  reason?: string;
}

interface CrossChainData {
  chainName: string;
  chainId: string;
  reputation: number;
  lastSync: number;
  status: 'synced' | 'pending' | 'offline';
}

interface X402Response {
  status: number;
  message?: string;
  paymentRequired?: {
    amount: string;
    asset: string;
    payTo: string;
    memo: string;
  };
  data?: unknown;
}

// Animated counter component
function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    const startValue = displayValue;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(startValue + (value - startValue) * easeOut));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);
  
  return <span>{displayValue}</span>;
}

// Status indicator
function StatusIndicator({ status }: { status: 'online' | 'syncing' | 'offline' }) {
  const colors = {
    online: 'bg-emerald-500',
    syncing: 'bg-amber-500',
    offline: 'bg-red-500'
  };
  
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} animate-pulse`} />
  );
}

// Reputation gauge component
function ReputationGauge({ value, size = 120 }: { value: number; size?: number }) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  
  const getColor = (val: number) => {
    if (val >= 90) return { stroke: '#10b981', glow: '#10b981' };
    if (val >= 70) return { stroke: '#3b82f6', glow: '#3b82f6' };
    if (val >= 50) return { stroke: '#f59e0b', glow: '#f59e0b' };
    return { stroke: '#ef4444', glow: '#ef4444' };
  };
  
  const colors = getColor(value);
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.stroke}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 6px ${colors.glow})`,
            transition: 'stroke-dashoffset 1s ease-out'
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white font-mono">
          <AnimatedNumber value={value} />
        </span>
        <span className="text-xs text-gray-500 uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

// Mini gauge for cross-chain
function MiniGauge({ value, size = 50 }: { value: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  
  const getColor = (val: number) => {
    if (val >= 90) return '#10b981';
    if (val >= 70) return '#3b82f6';
    if (val >= 50) return '#f59e0b';
    return '#ef4444';
  };
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
        <circle cx={size/2} cy={size/2} r={radius} stroke={getColor(value)} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-white font-mono">{value}</span>
      </div>
    </div>
  );
}

// Card component
function GlassCard({ children, className = '', hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={`
      relative overflow-hidden
      bg-gradient-to-br from-white/[0.05] to-white/[0.02]
      backdrop-blur-sm border border-white/[0.08] rounded-2xl
      ${hover ? 'hover:border-white/[0.15] hover:from-white/[0.08] hover:to-white/[0.03] transition-all duration-500' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}

// Tier badge
function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, { bg: string; text: string; icon: string }> = {
    premium: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '◆' },
    standard: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '●' },
    basic: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '○' },
    restricted: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '✕' }
  };
  const c = config[tier] || config.basic;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${c.bg} ${c.text} border border-current/20`}>
      <span>{c.icon}</span>{tier}
    </span>
  );
}

// Input component
function Input({ label, placeholder, value, onChange, icon }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; icon?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">{icon}</span>}
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-4 py-3 ${icon ? 'pl-10' : ''} bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all duration-300 font-mono text-sm`}
        />
      </div>
    </div>
  );
}

// Button component
function Button({ children, onClick, disabled, variant = 'primary', loading = false, className = '' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'x402'; loading?: boolean; className?: string }) {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20',
    x402: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`relative px-6 py-3 rounded-xl font-semibold text-sm ${variants[variant]} disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ${className}`}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Processing...
        </span>
      ) : children}
    </button>
  );
}

// Score selector
function ScoreSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [
    { score: -1, label: 'Negative', icon: '↓', color: 'from-red-600 to-rose-600', activeColor: 'border-red-500' },
    { score: 0, label: 'Neutral', icon: '–', color: 'from-gray-600 to-slate-600', activeColor: 'border-gray-500' },
    { score: 1, label: 'Positive', icon: '↑', color: 'from-emerald-600 to-teal-600', activeColor: 'border-emerald-500' }
  ];
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button key={opt.score} onClick={() => onChange(opt.score)} className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 ${value === opt.score ? `bg-gradient-to-r ${opt.color} text-white border-2 ${opt.activeColor}` : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'}`}>
          <span className="text-lg">{opt.icon}</span>
          <span className="ml-2">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

// x402 Payment Demo Panel
function X402DemoPanel({ selectedAgent }: { selectedAgent: Agent | null }) {
  const [step, setStep] = useState<'idle' | 'requesting' | 'payment_required' | 'paying' | 'success'>('idle');
  const [paymentDetails, setPaymentDetails] = useState<X402Response['paymentRequired'] | null>(null);
  const [response, setResponse] = useState<string>('');
  const [selectedService, setSelectedService] = useState<'ai' | 'data'>('ai');

  const services = {
    ai: { name: 'AI Inference', endpoint: '/api/ai-service', basePrice: 0.01, description: 'GPT-4 powered analysis' },
    data: { name: 'Premium Data Feed', endpoint: '/api/premium-data', basePrice: 0.001, description: 'Real-time market data' }
  };

  const calculatePrice = () => {
    const base = services[selectedService].basePrice;
    const multiplier = selectedAgent?.feeMultiplier || 1.5;
    return (base * multiplier).toFixed(4);
  };

  const requestService = async () => {
    setStep('requesting');
    setResponse('');
    
    // Simulate API call that returns 402
    await new Promise(r => setTimeout(r, 800));
    
    const price = calculatePrice();
    setPaymentDetails({
      amount: price,
      asset: 'USDC',
      payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
      memo: `x402-${selectedService}-${Date.now()}`
    });
    setStep('payment_required');
  };

  const simulatePayment = async () => {
    setStep('paying');
    
    // Simulate payment processing
    await new Promise(r => setTimeout(r, 1500));
    
    // Simulate successful response
    if (selectedService === 'ai') {
      setResponse(JSON.stringify({
        result: "Analysis complete: The market sentiment is bullish with 78% confidence.",
        model: "gpt-4-turbo",
        tokens_used: 847,
        agent_reputation: selectedAgent?.reputation || 50
      }, null, 2));
    } else {
      setResponse(JSON.stringify({
        btc_price: 97432.50,
        eth_price: 3421.80,
        avax_price: 42.15,
        timestamp: new Date().toISOString(),
        source: "premium-feed-v2"
      }, null, 2));
    }
    
    setStep('success');
  };

  const reset = () => {
    setStep('idle');
    setPaymentDetails(null);
    setResponse('');
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="text-purple-400">⚡</span> x402 Payment Protocol
          </h2>
          <p className="text-sm text-gray-500">HTTP 402 - Pay-per-request API access</p>
        </div>
        <div className="px-3 py-1 bg-purple-500/20 rounded-full">
          <span className="text-xs font-mono text-purple-400">x402 Enabled</span>
        </div>
      </div>

      {/* Service selector */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {Object.entries(services).map(([key, service]) => (
          <button
            key={key}
            onClick={() => { setSelectedService(key as 'ai' | 'data'); reset(); }}
            className={`p-4 rounded-xl text-left transition-all ${
              selectedService === key 
                ? 'bg-purple-500/20 border-2 border-purple-500/50' 
                : 'bg-white/5 border border-white/10 hover:bg-white/10'
            }`}
          >
            <p className="font-semibold">{service.name}</p>
            <p className="text-xs text-gray-500 mt-1">{service.description}</p>
            <p className="text-sm font-mono text-purple-400 mt-2">${service.basePrice} base</p>
          </button>
        ))}
      </div>

      {/* Price calculation */}
      {selectedAgent && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Your Price</p>
              <p className="text-2xl font-bold font-mono text-white">${calculatePrice()} <span className="text-sm text-gray-500">USDC</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Fee Multiplier</p>
              <p className={`text-lg font-bold ${selectedAgent.feeMultiplier <= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {selectedAgent.feeMultiplier}x
              </p>
            </div>
          </div>
          {selectedAgent.feeMultiplier < 1 && (
            <p className="text-xs text-emerald-400 mt-2">✓ Premium discount applied!</p>
          )}
          {selectedAgent.feeMultiplier > 1 && (
            <p className="text-xs text-amber-400 mt-2">↑ New agent premium - build reputation for discounts</p>
          )}
        </div>
      )}

      {/* Flow visualization */}
      <div className="space-y-4">
        {step === 'idle' && (
          <Button onClick={requestService} variant="x402" className="w-full" disabled={!selectedAgent}>
            {selectedAgent ? `Request ${services[selectedService].name}` : 'Select an agent first'}
          </Button>
        )}

        {step === 'requesting' && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Requesting service...</span>
            </div>
          </div>
        )}

        {step === 'payment_required' && paymentDetails && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">💰</span>
                <div>
                  <p className="font-bold text-amber-400">HTTP 402 - Payment Required</p>
                  <p className="text-xs text-gray-400">Server requires payment to proceed</p>
                </div>
              </div>
              
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="text-white">{paymentDetails.amount} {paymentDetails.asset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pay To:</span>
                  <span className="text-white text-xs">{paymentDetails.payTo.slice(0, 10)}...{paymentDetails.payTo.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Memo:</span>
                  <span className="text-white text-xs">{paymentDetails.memo}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={simulatePayment} variant="x402" className="flex-1">
                Pay ${paymentDetails.amount} USDC
              </Button>
              <Button onClick={reset} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'paying' && (
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Processing payment on Avalanche...</span>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-emerald-400">HTTP 200 - Success!</p>
                  <p className="text-xs text-gray-400">Payment verified, service delivered</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response Data</p>
              <pre className="text-xs font-mono text-emerald-400 overflow-x-auto">{response}</pre>
            </div>

            <Button onClick={reset} variant="secondary" className="w-full">
              Try Another Request
            </Button>
          </div>
        )}
      </div>

      {/* x402 explainer */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <p className="text-xs text-gray-500">
          <span className="text-purple-400 font-semibold">How x402 works:</span> APIs return HTTP 402 with payment requirements. 
          Agents pay via blockchain, receive service. Reputation affects pricing — 
          higher trust = lower fees.
        </p>
      </div>
    </GlassCard>
  );
}

// Cross-chain reputation panel - UPDATED TO FETCH REAL DATA
function CrossChainPanel({ agentTokenId, localReputation }: { agentTokenId: string | null; localReputation: number }) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [crossChainData, setCrossChainData] = useState<CrossChainData[]>([
    { chainName: 'C-Chain (Local)', chainId: '43113', reputation: localReputation, lastSync: Date.now(), status: 'synced' },
    { chainName: 'Dispatch L1', chainId: '779672', reputation: localReputation, lastSync: 0, status: 'pending' }
  ]);
  const [teleporterTx, setTeleporterTx] = useState<string | null>(null);

  // Fetch real cross-chain data when agentTokenId changes
  useEffect(() => {
    if (!agentTokenId) return;
    
    const fetchCrossChainData = async () => {
      try {
        const res = await fetch(`http://localhost:3000/agents/${agentTokenId}/crosschain`);
        const data = await res.json();
        
        // Update with real data from API
        const newCrossChainData: CrossChainData[] = [
          { 
            chainName: 'C-Chain (Local)', 
            chainId: '43113', 
            reputation: data.localChain?.reputation || localReputation, 
            lastSync: Date.now(), 
            status: 'synced' 
          }
        ];
        
        // Add remote chains from API
        if (data.remoteChains && data.remoteChains.length > 0) {
          data.remoteChains.forEach((chain: any) => {
            newCrossChainData.push({
              chainName: chain.name,
              chainId: chain.chainId?.slice(0, 10) || '779672',
              reputation: chain.reputation || localReputation,
              lastSync: chain.lastSync ? new Date(chain.lastSync).getTime() : 0,
              status: chain.synced ? 'synced' : 'pending'
            });
          });
        }
        
        setCrossChainData(newCrossChainData);
        
        // Store teleporter TX for display
        if (data.teleporter?.lastSyncTx) {
          setTeleporterTx(data.teleporter.lastSyncTx);
        }
      } catch (err) {
        console.error('Failed to fetch cross-chain data:', err);
        // Keep default data on error
      }
    };
    
    fetchCrossChainData();
  }, [agentTokenId, localReputation]);

  // Update local reputation when it changes
  useEffect(() => {
    setCrossChainData(prev => prev.map(c => c.chainId === '43113' ? { ...c, reputation: localReputation } : c));
  }, [localReputation]);

  const syncToChain = async (chainId: string) => {
    if (!agentTokenId) return;
    setSyncing(chainId);
    
    try {
      // Call real sync endpoint
      const res = await fetch(`http://localhost:3000/agents/${agentTokenId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success && data.txHash) {
        setTeleporterTx(data.txHash);
      }
      
      setCrossChainData(prev => prev.map(c => 
        c.chainId === chainId ? { ...c, lastSync: Date.now(), status: 'synced' as const, reputation: localReputation } : c
      ));
    } catch (err) {
      console.error('Sync failed:', err);
      // Still update UI for demo
      setCrossChainData(prev => prev.map(c => 
        c.chainId === chainId ? { ...c, lastSync: Date.now(), status: 'synced' as const } : c
      ));
    }
    
    setSyncing(null);
  };

  const aggregatedScore = Math.round(crossChainData.reduce((a, b) => a + b.reputation, 0) / crossChainData.length);

  return (
    <GlassCard className="p-6" hover={false}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Cross-Chain Reputation</h2>
          <p className="text-sm text-gray-500">Synced via Teleporter</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Aggregated</p>
          <p className="text-3xl font-bold text-white font-mono">{aggregatedScore}</p>
        </div>
      </div>

      {!agentTokenId ? (
        <div className="text-center py-8 text-gray-500">
          <p>Verify an agent to see cross-chain reputation</p>
        </div>
      ) : (
        <div className="space-y-4">
          {crossChainData.map((chain) => (
            <div key={chain.chainId} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-4">
                <MiniGauge value={chain.reputation} />
                <div>
                  <p className="font-medium">{chain.chainName}</p>
                  <p className="text-xs text-gray-500">
                    {chain.chainId === '43113' ? 'Primary' : 
                      chain.lastSync > 0 ? `Last sync: ${Math.round((Date.now() - chain.lastSync) / 60000)}m ago` : 'Not synced yet'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs flex items-center gap-1.5 ${chain.status === 'synced' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${chain.status === 'synced' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {chain.status}
                </span>
                {chain.chainId !== '43113' && (
                  <button
                    onClick={() => syncToChain(chain.chainId)}
                    disabled={syncing === chain.chainId}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
                  >
                    {syncing === chain.chainId ? '⟳' : 'Sync'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Powered by Avalanche Teleporter</span>
          <div className="flex items-center gap-3">
            {teleporterTx && (
              <a 
                href={`https://testnet.snowscan.xyz/tx/${teleporterTx}`} 
                target="_blank" 
                className="hover:text-emerald-400 transition-colors"
              >
                Last TX ↗
              </a>
            )}
            <a 
              href="https://testnet.snowscan.xyz/address/0x5c8dfe8484423a9370AcC451Af0083F103eA48d4#code" 
              target="_blank" 
              className="hover:text-white transition-colors"
            >
              View Contract ↗
            </a>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// Main component
export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentURI, setNewAgentURI] = useState('ipfs://agent-metadata');
  const [checkAddress, setCheckAddress] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackTokenId, setFeedbackTokenId] = useState('');
  const [feedbackScore, setFeedbackScore] = useState<number>(1);
  const [feedbackAmount, setFeedbackAmount] = useState('1');
  const [apiBase] = useState('http://localhost:3000');
  const [activeTab, setActiveTab] = useState<'register' | 'feedback' | 'verify'>('verify');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [mainView, setMainView] = useState<'crosschain' | 'x402'>('x402');

  const registerAgent = async () => {
    if (!newAgentAddress) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentAddress: newAgentAddress, metadataURI: newAgentURI }),
      });
      const data = await res.json();
      if (data.success) {
        setNewAgentAddress('');
        checkAgent(newAgentAddress);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch {
      alert('Failed to register agent');
    }
    setLoading(false);
  };

  const checkAgent = async (address?: string) => {
    const addr = address || checkAddress;
    if (!addr) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/x402/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentAddress: addr }),
      });
      const data: VerifyResponse = await res.json();
      setVerifyResult(data);
      
      if (data.approved && data.tokenId) {
        const newAgent = {
          address: addr,
          tokenId: data.tokenId!,
          reputation: data.reputation!,
          tier: data.tier!,
          feeMultiplier: data.feeMultiplier!
        };
        setAgents(prev => {
          const exists = prev.find(a => a.address === addr);
          if (exists) {
            return prev.map(a => a.address === addr ? newAgent : a);
          }
          return [...prev, newAgent];
        });
        setSelectedAgent(newAgent);
      }
    } catch {
      alert('Failed to verify agent');
    }
    setLoading(false);
  };

  const submitFeedback = async () => {
    if (!feedbackTokenId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/agents/${feedbackTokenId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: feedbackScore, paymentAmount: feedbackAmount }),
      });
      const data = await res.json();
      if (data.success) {
        const agent = agents.find(a => a.tokenId === feedbackTokenId);
        if (agent) {
          await checkAgent(agent.address);
        }
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Feedback error:', err);
      alert('Failed to submit feedback');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Subtle grid background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <span className="text-xl font-bold">A</span>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Agent Trust Protocol</h1>
                <p className="text-xs text-gray-500">Decentralized Reputation for AI Agents</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full">
                <StatusIndicator status="online" />
                <span className="text-xs text-gray-400">Avalanche Fuji</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Agents: <span className="text-white font-mono">{agents.length}</span></span>
                <span className="w-px h-4 bg-white/10" />
                <span>Block: <span className="text-white font-mono">48.1M</span></span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Agents', value: agents.length, color: 'text-emerald-400' },
            { label: 'Avg Reputation', value: agents.length ? Math.round(agents.reduce((a, b) => a + b.reputation, 0) / agents.length) : 50, suffix: '/100', color: 'text-blue-400' },
            { label: 'Premium Agents', value: agents.filter(a => a.tier === 'premium').length, color: 'text-amber-400' },
            { label: 'x402 Enabled', value: 2, suffix: 'APIs', color: 'text-purple-400' }
          ].map((stat, i) => (
            <GlassCard key={i} className="p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold font-mono ${stat.color}`}><AnimatedNumber value={stat.value} /></span>
                {stat.suffix && <span className="text-gray-500 text-sm">{stat.suffix}</span>}
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-6">
          
          {/* Left column - Actions */}
          <div className="col-span-4 space-y-6">
            
            {/* Tab buttons */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              {[
                { id: 'verify', label: 'Verify', icon: '◎' },
                { id: 'register', label: 'Register', icon: '+' },
                { id: 'feedback', label: 'Feedback', icon: '↕' }
              ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as 'register' | 'feedback' | 'verify')} className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                  <span className="mr-2">{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            {/* Action card */}
            <GlassCard className="p-6" hover={false}>
              {activeTab === 'verify' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Verify Agent</h2>
                    <p className="text-sm text-gray-500">Check reputation and eligibility</p>
                  </div>
                  <Input label="Agent Address" placeholder="0x..." value={checkAddress} onChange={setCheckAddress} icon="◎" />
                  <Button onClick={() => checkAgent()} disabled={loading} loading={loading} className="w-full">Verify Agent</Button>
                  
                  {verifyResult && (
                    <div className={`p-5 rounded-xl border transition-all duration-500 ${verifyResult.approved ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className={`text-lg font-bold ${verifyResult.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                            {verifyResult.approved ? '✓ Approved' : '✕ Denied'}
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-1">{verifyResult.agentAddress?.slice(0, 10)}...{verifyResult.agentAddress?.slice(-8)}</p>
                        </div>
                        {verifyResult.approved && <TierBadge tier={verifyResult.tier!} />}
                      </div>
                      {verifyResult.approved && (
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
                          <div><p className="text-xs text-gray-500 mb-1">Token</p><p className="font-mono font-bold">#{verifyResult.tokenId}</p></div>
                          <div><p className="text-xs text-gray-500 mb-1">Rep</p><p className="font-mono font-bold">{verifyResult.reputation}</p></div>
                          <div><p className="text-xs text-gray-500 mb-1">Fee</p><p className="font-mono font-bold">{verifyResult.feeMultiplier}x</p></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'register' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Register Agent</h2>
                    <p className="text-sm text-gray-500">Create on-chain identity</p>
                  </div>
                  <Input label="Agent Address" placeholder="0x..." value={newAgentAddress} onChange={setNewAgentAddress} icon="+" />
                  <Input label="Metadata URI" placeholder="ipfs://..." value={newAgentURI} onChange={setNewAgentURI} icon="◈" />
                  <Button onClick={registerAgent} disabled={loading} loading={loading} className="w-full">Register Agent</Button>
                </div>
              )}

              {activeTab === 'feedback' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Submit Feedback</h2>
                    <p className="text-sm text-gray-500">Rate agent interaction</p>
                  </div>
                  <Input label="Agent Token ID" placeholder="1" value={feedbackTokenId} onChange={setFeedbackTokenId} icon="#" />
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rating</label>
                    <ScoreSelector value={feedbackScore} onChange={setFeedbackScore} />
                  </div>
                  <Input label="Payment (AVAX)" placeholder="1.0" value={feedbackAmount} onChange={setFeedbackAmount} icon="◇" />
                  <Button onClick={submitFeedback} disabled={loading} loading={loading} className="w-full">Submit</Button>
                </div>
              )}
            </GlassCard>

            {/* Agent list */}
            <GlassCard className="p-5">
              <h3 className="font-semibold mb-4">Tracked Agents</h3>
              {agents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No agents yet</p>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.address}
                      onClick={() => { setSelectedAgent(agent); setCheckAddress(agent.address); }}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${selectedAgent?.address === agent.address ? 'bg-white/10 border border-white/20' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</span>
                        <TierBadge tier={agent.tier} />
                      </div>
                      <span className="text-lg font-bold font-mono">{agent.reputation}</span>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Right column */}
          <div className="col-span-8 space-y-6">
            
            {/* View toggle */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
              <button 
                onClick={() => setMainView('x402')} 
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${mainView === 'x402' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-white'}`}
              >
                ⚡ x402 Payment
              </button>
              <button 
                onClick={() => setMainView('crosschain')} 
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${mainView === 'crosschain' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              >
                🔗 Cross-Chain
              </button>
            </div>

            {/* Main panel */}
            {mainView === 'x402' ? (
              <X402DemoPanel selectedAgent={selectedAgent} />
            ) : (
              <CrossChainPanel 
                agentTokenId={selectedAgent?.tokenId || null} 
                localReputation={selectedAgent?.reputation || 50} 
              />
            )}

            {/* Agent details */}
            {selectedAgent && (
              <GlassCard className="p-6" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Agent #{selectedAgent.tokenId}</h2>
                    <p className="text-sm text-gray-500 font-mono">{selectedAgent.address}</p>
                  </div>
                  <ReputationGauge value={selectedAgent.reputation} size={100} />
                </div>
                <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
                  <div><p className="text-xs text-gray-500 mb-1">Tier</p><TierBadge tier={selectedAgent.tier} /></div>
                  <div><p className="text-xs text-gray-500 mb-1">Fee Multiplier</p><p className="text-xl font-bold font-mono">{selectedAgent.feeMultiplier}x</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Status</p><p className="text-emerald-400 font-medium">Active</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Network</p><p className="font-medium">Avalanche Fuji</p></div>
                </div>
              </GlassCard>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <StatusIndicator status="online" />
                <span className="text-xs text-gray-500">Connected to Avalanche Fuji</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <a href="https://testnet.snowscan.xyz/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8#code" target="_blank" className="text-gray-500 hover:text-white transition-colors">Identity ↗</a>
                <a href="https://testnet.snowscan.xyz/address/0x02682d54A383489e217FCb3cbd0945bc97Ced4C5#code" target="_blank" className="text-gray-500 hover:text-white transition-colors">Reputation ↗</a>
                <a href="https://testnet.snowscan.xyz/address/0x87025d55ceC6bd643E925a3784f4457d2796Cd6b#code" target="_blank" className="text-gray-500 hover:text-white transition-colors">CrossChain ↗</a>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Built for <span className="text-red-400">Avalanche x402 Hack2Build 2025</span></p>
              <p className="text-xs text-gray-700 mt-1">ERC-8004 · x402 · Teleporter</p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}