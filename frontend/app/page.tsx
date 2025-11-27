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
    online: 'bg-emerald-500 shadow-emerald-500/50',
    syncing: 'bg-amber-500 shadow-amber-500/50',
    offline: 'bg-red-500 shadow-red-500/50'
  };
  
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} shadow-lg animate-pulse`} />
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

// Card component with glass effect
function GlassCard({ children, className = '', hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={`
      relative overflow-hidden
      bg-gradient-to-br from-white/[0.05] to-white/[0.02]
      backdrop-blur-sm
      border border-white/[0.08]
      rounded-2xl
      ${hover ? 'hover:border-white/[0.15] hover:from-white/[0.08] hover:to-white/[0.03] transition-all duration-500' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}

// Tier badge component
function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, { bg: string; text: string; icon: string }> = {
    premium: { 
      bg: 'bg-amber-500/20', 
      text: 'text-amber-400',
      icon: '◆'
    },
    standard: { 
      bg: 'bg-blue-500/20', 
      text: 'text-blue-400',
      icon: '●'
    },
    basic: { 
      bg: 'bg-gray-500/20', 
      text: 'text-gray-400',
      icon: '○'
    },
    restricted: { 
      bg: 'bg-red-500/20', 
      text: 'text-red-400',
      icon: '✕'
    }
  };
  
  const c = config[tier] || config.basic;
  
  return (
    <span className={`
      inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider
      ${c.bg} ${c.text} border border-current/20
    `}>
      <span>{c.icon}</span>
      {tier}
    </span>
  );
}

// Input component
function Input({ 
  label, 
  placeholder, 
  value, 
  onChange, 
  icon 
}: { 
  label: string; 
  placeholder: string; 
  value: string; 
  onChange: (v: string) => void;
  icon?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">{icon}</span>
        )}
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`
            w-full px-4 py-3 ${icon ? 'pl-10' : ''}
            bg-black/40 border border-white/10 rounded-xl
            text-white placeholder-gray-600
            focus:outline-none focus:border-white/30 focus:bg-black/60
            transition-all duration-300
            font-mono text-sm
          `}
        />
      </div>
    </div>
  );
}

// Button component
function Button({ 
  children, 
  onClick, 
  disabled, 
  variant = 'primary',
  loading = false,
  className = ''
}: { 
  children: React.ReactNode; 
  onClick: () => void; 
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  className?: string;
}) {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20',
    danger: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        relative px-6 py-3 rounded-xl font-semibold text-sm
        ${variants[variant]}
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-300
        ${className}
      `}
    >
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

// Score selector buttons
function ScoreSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [
    { score: -1, label: 'Negative', icon: '↓', color: 'from-red-600 to-rose-600', activeColor: 'border-red-500' },
    { score: 0, label: 'Neutral', icon: '–', color: 'from-gray-600 to-slate-600', activeColor: 'border-gray-500' },
    { score: 1, label: 'Positive', icon: '↑', color: 'from-emerald-600 to-teal-600', activeColor: 'border-emerald-500' }
  ];
  
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.score}
          onClick={() => onChange(opt.score)}
          className={`
            flex-1 py-3 px-4 rounded-xl font-medium text-sm
            transition-all duration-300
            ${value === opt.score 
              ? `bg-gradient-to-r ${opt.color} text-white border-2 ${opt.activeColor}` 
              : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'
            }
          `}
        >
          <span className="text-lg">{opt.icon}</span>
          <span className="ml-2">{opt.label}</span>
        </button>
      ))}
    </div>
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
  const [networkStatus] = useState<'online' | 'syncing' | 'offline'>('online');

  const registerAgent = async () => {
    if (!newAgentAddress) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          agentAddress: newAgentAddress, 
          metadataURI: newAgentURI 
        }),
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
        setAgents(prev => {
          const exists = prev.find(a => a.address === addr);
          if (exists) {
            return prev.map(a => a.address === addr ? {
              address: addr,
              tokenId: data.tokenId!,
              reputation: data.reputation!,
              tier: data.tier!,
              feeMultiplier: data.feeMultiplier!
            } : a);
          }
          return [...prev, {
            address: addr,
            tokenId: data.tokenId!,
            reputation: data.reputation!,
            tier: data.tier!,
            feeMultiplier: data.feeMultiplier!
          }];
        });
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
        body: JSON.stringify({ 
          score: feedbackScore,
          paymentAmount: feedbackAmount
        }),
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
                <StatusIndicator status={networkStatus} />
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
            { label: 'Total Agents', value: agents.length, change: '+2.4%', color: 'text-emerald-400' },
            { label: 'Avg Reputation', value: agents.length ? Math.round(agents.reduce((a, b) => a + b.reputation, 0) / agents.length) : 50, suffix: '/100', color: 'text-blue-400' },
            { label: 'Premium Agents', value: agents.filter(a => a.tier === 'premium').length, color: 'text-amber-400' },
            { label: 'Restricted', value: agents.filter(a => a.tier === 'restricted').length, color: 'text-red-400' }
          ].map((stat, i) => (
            <GlassCard key={i} className="p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold font-mono ${stat.color}`}>
                  <AnimatedNumber value={stat.value} />
                </span>
                {stat.suffix && <span className="text-gray-500 text-sm">{stat.suffix}</span>}
                {stat.change && <span className="text-emerald-400 text-xs">{stat.change}</span>}
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-6">
          
          {/* Left column - Actions */}
          <div className="col-span-5 space-y-6">
            
            {/* Tab buttons */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              {[
                { id: 'verify', label: 'Verify Agent', icon: '◎' },
                { id: 'register', label: 'Register', icon: '+' },
                { id: 'feedback', label: 'Feedback', icon: '↕' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'register' | 'feedback' | 'verify')}
                  className={`
                    flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300
                    ${activeTab === tab.id 
                      ? 'bg-white/10 text-white' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Action card */}
            <GlassCard className="p-6" hover={false}>
              {activeTab === 'verify' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Verify Agent</h2>
                    <p className="text-sm text-gray-500">Check agent reputation and payment eligibility</p>
                  </div>
                  
                  <Input
                    label="Agent Address"
                    placeholder="0x..."
                    value={checkAddress}
                    onChange={setCheckAddress}
                    icon="◎"
                  />
                  
                  <Button onClick={() => checkAgent()} disabled={loading} loading={loading} className="w-full">
                    Verify Agent
                  </Button>
                  
                  {verifyResult && (
                    <div className={`
                      p-5 rounded-xl border transition-all duration-500
                      ${verifyResult.approved 
                        ? 'bg-emerald-500/10 border-emerald-500/30' 
                        : 'bg-red-500/10 border-red-500/30'
                      }
                    `}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className={`text-lg font-bold ${verifyResult.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                            {verifyResult.approved ? '✓ Payment Approved' : '✕ Payment Denied'}
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                            {verifyResult.agentAddress?.slice(0, 10)}...{verifyResult.agentAddress?.slice(-8)}
                          </p>
                        </div>
                        {verifyResult.approved && <TierBadge tier={verifyResult.tier!} />}
                      </div>
                      
                      {verifyResult.approved && (
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Token ID</p>
                            <p className="font-mono font-bold">#{verifyResult.tokenId}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Reputation</p>
                            <p className="font-mono font-bold">{verifyResult.reputation}/100</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Fee Rate</p>
                            <p className="font-mono font-bold">{verifyResult.feeMultiplier}x</p>
                          </div>
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
                    <p className="text-sm text-gray-500">Create an on-chain identity for your AI agent</p>
                  </div>
                  
                  <Input
                    label="Agent Address"
                    placeholder="0x..."
                    value={newAgentAddress}
                    onChange={setNewAgentAddress}
                    icon="+"
                  />
                  
                  <Input
                    label="Metadata URI"
                    placeholder="ipfs://..."
                    value={newAgentURI}
                    onChange={setNewAgentURI}
                    icon="◈"
                  />
                  
                  <Button onClick={registerAgent} disabled={loading} loading={loading} className="w-full">
                    Register Agent
                  </Button>
                </div>
              )}

              {activeTab === 'feedback' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Submit Feedback</h2>
                    <p className="text-sm text-gray-500">Rate an agent based on payment interaction</p>
                  </div>
                  
                  <Input
                    label="Agent Token ID"
                    placeholder="1"
                    value={feedbackTokenId}
                    onChange={setFeedbackTokenId}
                    icon="#"
                  />
                  
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rating</label>
                    <ScoreSelector value={feedbackScore} onChange={setFeedbackScore} />
                  </div>
                  
                  <Input
                    label="Payment Amount (AVAX)"
                    placeholder="1.0"
                    value={feedbackAmount}
                    onChange={setFeedbackAmount}
                    icon="◇"
                  />
                  
                  <Button onClick={submitFeedback} disabled={loading} loading={loading} className="w-full">
                    Submit Feedback
                  </Button>
                </div>
              )}
            </GlassCard>

            {/* Cross-chain status */}
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Cross-Chain Status</h3>
                <span className="text-xs text-gray-500">via Teleporter</span>
              </div>
              <div className="space-y-3">
                {[
                  { chain: 'C-Chain', status: 'Synced', color: 'emerald' },
                  { chain: 'Gaming L1', status: 'Pending', color: 'amber' },
                  { chain: 'DeFi L1', status: 'Synced', color: 'emerald' }
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <span className="text-sm text-gray-400">{c.chain}</span>
                    <span className={`text-xs text-${c.color}-400 flex items-center gap-1.5`}>
                      <span className={`w-1.5 h-1.5 rounded-full bg-${c.color}-400`} />
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Right column - Agent list */}
          <div className="col-span-7">
            <GlassCard className="p-6 h-full" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">Agent Registry</h2>
                  <p className="text-sm text-gray-500">{agents.length} agents tracked</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <span className="text-gray-400">⟳</span>
                  </button>
                </div>
              </div>

              {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <span className="text-4xl opacity-30">◎</span>
                  </div>
                  <p className="text-gray-500 mb-2">No agents verified yet</p>
                  <p className="text-gray-600 text-sm">Verify an agent to see it appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agents.sort((a, b) => b.reputation - a.reputation).map((agent, index) => (
                    <div 
                      key={agent.address}
                      className="group relative p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        {/* Rank */}
                        <div className={`
                          w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                          ${index === 0 ? 'bg-amber-500/20 text-amber-400' : 
                            index === 1 ? 'bg-gray-400/20 text-gray-300' :
                            index === 2 ? 'bg-orange-600/20 text-orange-400' :
                            'bg-white/5 text-gray-500'}
                        `}>
                          {index + 1}
                        </div>

                        {/* Agent info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono text-sm truncate">
                              {agent.address.slice(0, 8)}...{agent.address.slice(-6)}
                            </p>
                            <TierBadge tier={agent.tier} />
                          </div>
                          <p className="text-xs text-gray-500">
                            Token #{agent.tokenId} · Fee: {agent.feeMultiplier}x
                          </p>
                        </div>

                        {/* Reputation gauge */}
                        <ReputationGauge value={agent.reputation} size={70} />

                        {/* Actions */}
                        <button
                          onClick={() => checkAgent(agent.address)}
                          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                        >
                          <span className="text-gray-400">⟳</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
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
                <a href="https://testnet.snowscan.xyz/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8#code" 
                   target="_blank" 
                   className="text-gray-500 hover:text-white transition-colors">
                  AgentIdentity ↗
                </a>
                <a href="https://testnet.snowscan.xyz/address/0x02682d54A383489e217FCb3cbd0945bc97Ced4C5#code" 
                   target="_blank"
                   className="text-gray-500 hover:text-white transition-colors">
                  ReputationRegistry ↗
                </a>
                <a href="https://testnet.snowscan.xyz/address/0x87025d55ceC6bd643E925a3784f4457d2796Cd6b#code" 
                   target="_blank"
                   className="text-gray-500 hover:text-white transition-colors">
                  CrossChain ↗
                </a>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-xs text-gray-600">
                Built for <span className="text-red-400">Avalanche x402 Hack2Build 2025</span>
              </p>
              <p className="text-xs text-gray-700 mt-1">
                ERC-8004 · x402 Protocol · Teleporter
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}