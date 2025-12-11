'use client';

import { useState, useEffect, useCallback } from 'react';

interface Agent {
  address: string;
  tokenId: string;
  reputation: number;
  stake: string;
  stakeFormatted: string;
  riskScore: number;
  tier: string;
  feeMultiplier: number;
  blocked: boolean;
}

interface GatewayStats {
  totalRequests: number;
  blockedRequests: number;
  totalRevenue: number;
  avgReputation: number;
}

interface PricingTier {
  name: string;
  basePrice: number;
  minStake: string;
  minScore: number;
  endpoint: string;
}

interface VerifyResponse {
  approved: boolean;
  agentAddress: string;
  tokenId?: string;
  reputation?: number;
  stake?: string;
  riskScore?: number;
  tier?: string;
  feeMultiplier?: number;
  reason?: string;
  blocked?: boolean;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[], onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(toast => (
        <div key={toast.id} className={`p-4 rounded-xl backdrop-blur-sm border shadow-lg transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' :
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
          toast.type === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' :
          'bg-blue-500/20 border-blue-500/30 text-blue-400'
        }`}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <p className="font-semibold">{toast.title}</p>
              <p className="text-sm opacity-80 mt-1">{toast.message}</p>
            </div>
            <button onClick={() => onDismiss(toast.id)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const CONTRACTS = {
  agentRegistry: '0x0990FF7FEDf21B06C06a635E516eb4a239b0F91b',
  stakingModule: '0xb567A01E31313827533E818fd229A185e2cd30c4',
  reputationEngine: '0x8F58332CDef62a0d0C61356F785cc04491237DAD',
  jobLogger: '0x13c80689b2549F3AB8d73E1fa01ae6097a364086'
};

const PRICING_TIERS: PricingTier[] = [
  { name: 'GPT-4 Premium', basePrice: 0.05, minStake: '1 AVAX', minScore: 80, endpoint: '/api/gpt4' },
  { name: 'Claude Standard', basePrice: 0.02, minStake: '0.1 AVAX', minScore: 50, endpoint: '/api/claude' },
  { name: 'Data Feed', basePrice: 0.001, minStake: '0', minScore: 0, endpoint: '/api/data' },
  { name: 'Discovery', basePrice: 0.01, minStake: '0.5 AVAX', minScore: 70, endpoint: '/api/discover' }
];

function AnimatedNumber({ value, duration = 1000, decimals = 0 }: { value: number; duration?: number; decimals?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    let startTime: number;
    const startValue = displayValue;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + (value - startValue) * easeOut);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration]);
  return <span>{decimals > 0 ? displayValue.toFixed(decimals) : Math.floor(displayValue)}</span>;
}

function StatusIndicator({ status }: { status: 'online' | 'syncing' | 'offline' | 'blocked' }) {
  const colors = { online: 'bg-emerald-500', syncing: 'bg-amber-500', offline: 'bg-gray-500', blocked: 'bg-red-500' };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} animate-pulse`} />;
}

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
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.stroke} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ filter: `drop-shadow(0 0 6px ${colors.glow})`, transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white font-mono"><AnimatedNumber value={value} /></span>
        <span className="text-xs text-gray-500 uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

function GlassCard({ children, className = '', hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-sm border border-white/[0.08] rounded-2xl ${hover ? 'hover:border-white/[0.15] hover:from-white/[0.08] hover:to-white/[0.03] transition-all duration-500' : ''} ${className}`}>
      {children}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, { bg: string; text: string; icon: string }> = {
    premium: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: '◆' },
    standard: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '●' },
    basic: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '○' },
    restricted: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '✕' },
    blocked: { bg: 'bg-red-600/30', text: 'text-red-500', icon: '⊘' }
  };
  const c = config[tier] || config.basic;
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${c.bg} ${c.text} border border-current/20`}><span>{c.icon}</span>{tier}</span>;
}

function AccessBadge({ allowed, reason }: { allowed: boolean; reason?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${allowed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
      <span>{allowed ? '✓' : '✕'}</span>
      <span>{allowed ? 'Access Allowed' : reason || 'Blocked'}</span>
    </div>
  );
}

function Input({ label, placeholder, value, onChange, icon, suffix }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; icon?: string; suffix?: string }) {
  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">{icon}</span>}
        <input type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`w-full px-4 py-3 ${icon ? 'pl-10' : ''} ${suffix ? 'pr-16' : ''} bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all duration-300 font-mono text-sm`} />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function Button({ children, onClick, disabled, variant = 'primary', loading = false, className = '' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'gateway'; loading?: boolean; className?: string }) {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20',
    danger: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white',
    gateway: 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`relative px-6 py-3 rounded-xl font-semibold text-sm ${variants[variant]} disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ${className}`}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
          Processing...
        </span>
      ) : children}
    </button>
  );
}

function GatewayDemoPanel({ selectedAgent, onStake, addToast }: { selectedAgent: Agent | null; onStake: (amount: string) => void; addToast: (type: Toast['type'], title: string, message: string) => void }) {
  const [step, setStep] = useState<'idle' | 'checking' | 'blocked' | 'payment_required' | 'paying' | 'success'>('idle');
  const [selectedTier, setSelectedTier] = useState<PricingTier>(PRICING_TIERS[0]);
  const [response, setResponse] = useState<any>(null);
  const [stakeAmount, setStakeAmount] = useState('0.1');

  const calculatePrice = () => {
    if (!selectedAgent) return selectedTier.basePrice;
    return selectedTier.basePrice * selectedAgent.feeMultiplier;
  };

  const checkAccess = () => {
    if (!selectedAgent) return { allowed: false, reason: 'No agent selected' };
    const minScore = selectedTier.minScore;
    const minStakeNum = parseFloat(selectedTier.minStake) || 0;
    const agentStake = parseFloat(selectedAgent.stakeFormatted) || 0;
    if (selectedAgent.blocked) return { allowed: false, reason: 'Agent blocked due to abuse' };
    if (selectedAgent.reputation < minScore) return { allowed: false, reason: `Reputation ${selectedAgent.reputation} < ${minScore} required` };
    if (agentStake < minStakeNum) return { allowed: false, reason: `Stake ${agentStake} < ${minStakeNum} AVAX required` };
    return { allowed: true };
  };

  const requestService = async () => {
    setStep('checking');
    await new Promise(r => setTimeout(r, 800));
    const access = checkAccess();
    if (!access.allowed) {
      setResponse({ error: access.reason, code: access.reason?.includes('Reputation') ? 'INSUFFICIENT_REPUTATION' : access.reason?.includes('Stake') ? 'INSUFFICIENT_STAKE' : 'BLOCKED' });
      setStep('blocked');
      addToast('warning', 'Access Denied', access.reason || 'Requirements not met');
      return;
    }
    setResponse({ pricing: { basePrice: selectedTier.basePrice, finalPrice: calculatePrice(), multiplier: selectedAgent?.feeMultiplier || 1 } });
    setStep('payment_required');
    addToast('info', 'Payment Required', `$${calculatePrice().toFixed(4)} USDC to proceed`);
  };

  const simulatePayment = async () => {
    setStep('paying');
    await new Promise(r => setTimeout(r, 1500));
    setResponse({
      success: true,
      result: selectedTier.name.includes('GPT') ? 'Analysis complete: Market sentiment is bullish with 82% confidence.' : selectedTier.name.includes('Claude') ? 'I found 3 key insights in your portfolio data.' : { btc: 98234.50, eth: 3456.78, avax: 42.34 },
      pricePaid: calculatePrice()
    });
    setStep('success');
    addToast('success', 'Request Successful', `Paid $${calculatePrice().toFixed(4)} USDC`);
  };

  const reset = () => { setStep('idle'); setResponse(null); };
  const access = checkAccess();

  return (
    <GlassCard className="p-6" hover={false}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><span className="text-purple-400">🛡️</span> AgentTrust Gateway</h2>
          <p className="text-sm text-gray-500">Pre-payment trust verification</p>
        </div>
        <div className="px-3 py-1 bg-purple-500/20 rounded-full"><span className="text-xs font-mono text-purple-400">x402 Protected</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {PRICING_TIERS.map((tier) => (
          <button key={tier.endpoint} onClick={() => { setSelectedTier(tier); reset(); }} className={`p-4 rounded-xl text-left transition-all ${selectedTier.endpoint === tier.endpoint ? 'bg-purple-500/20 border-2 border-purple-500/50' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}>
            <p className="font-semibold">{tier.name}</p>
            <p className="text-xs text-gray-500 mt-1">{tier.minScore > 0 ? `${tier.minScore}+ rep` : 'Open'} · {tier.minStake || 'No stake'}</p>
            <p className="text-sm font-mono text-purple-400 mt-2">${tier.basePrice} base</p>
          </button>
        ))}
      </div>
      {selectedAgent && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">Access Check</span>
            <AccessBadge allowed={access.allowed} reason={access.reason} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-xs text-gray-500">Reputation</p><p className={`font-mono font-bold ${selectedAgent.reputation >= selectedTier.minScore ? 'text-emerald-400' : 'text-red-400'}`}>{selectedAgent.reputation} {selectedAgent.reputation >= selectedTier.minScore ? '✓' : `< ${selectedTier.minScore}`}</p></div>
            <div><p className="text-xs text-gray-500">Stake</p><p className={`font-mono font-bold ${parseFloat(selectedAgent.stakeFormatted) >= (parseFloat(selectedTier.minStake) || 0) ? 'text-emerald-400' : 'text-red-400'}`}>{selectedAgent.stakeFormatted} AVAX</p></div>
            <div><p className="text-xs text-gray-500">Your Price</p><p className={`font-mono font-bold ${selectedAgent.feeMultiplier <= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>${calculatePrice().toFixed(4)}</p></div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {step === 'idle' && <Button onClick={requestService} variant="gateway" className="w-full" disabled={!selectedAgent}>{selectedAgent ? `Request ${selectedTier.name}` : 'Select an agent first'}</Button>}
        {step === 'checking' && <div className="p-4 rounded-xl bg-white/5 border border-white/10"><div className="flex items-center gap-3"><svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Checking identity, reputation, stake...</span></div></div>}
        {step === 'blocked' && response && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"><div className="flex items-center gap-2 mb-3"><span className="text-2xl">🚫</span><div><p className="font-bold text-red-400">HTTP 402/403 - Access Denied</p><p className="text-xs text-gray-400">{response.error}</p></div></div><p className="text-sm font-mono text-red-300 bg-black/30 p-2 rounded mt-2">Code: {response.code}</p></div>
            {response.code === 'INSUFFICIENT_STAKE' && (<div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"><p className="text-sm text-amber-400 mb-3">💡 Stake AVAX to gain access:</p><div className="flex gap-2"><Input label="" placeholder="0.1" value={stakeAmount} onChange={setStakeAmount} suffix="AVAX" /><Button onClick={() => { onStake(stakeAmount); reset(); }} variant="primary" className="whitespace-nowrap">Stake Now</Button></div></div>)}
            <Button onClick={reset} variant="secondary" className="w-full">Try Again</Button>
          </div>
        )}
        {step === 'payment_required' && response && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"><div className="flex items-center gap-2 mb-3"><span className="text-2xl">💰</span><div><p className="font-bold text-amber-400">HTTP 402 - Payment Required</p><p className="text-xs text-gray-400">Agent verified! Pay to proceed.</p></div></div><div className="space-y-2 font-mono text-sm mt-3"><div className="flex justify-between"><span className="text-gray-500">Base Price:</span><span className="text-white">${response.pricing.basePrice}</span></div><div className="flex justify-between"><span className="text-gray-500">Your Multiplier:</span><span className={response.pricing.multiplier <= 1 ? 'text-emerald-400' : 'text-amber-400'}>{response.pricing.multiplier}x</span></div><div className="flex justify-between border-t border-white/10 pt-2"><span className="text-gray-500">Final Price:</span><span className="text-white font-bold">${response.pricing.finalPrice.toFixed(4)} USDC</span></div></div></div>
            <div className="flex gap-3"><Button onClick={simulatePayment} variant="gateway" className="flex-1">Pay ${response.pricing.finalPrice.toFixed(4)} USDC</Button><Button onClick={reset} variant="secondary">Cancel</Button></div>
          </div>
        )}
        {step === 'paying' && <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30"><div className="flex items-center gap-3"><svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Processing payment via Thirdweb...</span></div></div>}
        {step === 'success' && response && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"><div className="flex items-center gap-2 mb-3"><span className="text-2xl">✅</span><div><p className="font-bold text-emerald-400">HTTP 200 - Success!</p><p className="text-xs text-gray-400">Payment verified, service delivered</p></div></div></div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10"><p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response</p><pre className="text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(response.result, null, 2)}</pre></div>
            <Button onClick={reset} variant="secondary" className="w-full">Try Another Request</Button>
          </div>
        )}
      </div>
      <div className="mt-6 pt-4 border-t border-white/5"><p className="text-xs text-gray-500"><span className="text-purple-400 font-semibold">AgentTrust Gateway:</span> Verifies identity, reputation, and stake <span className="text-white">before</span> payment. Higher trust = lower fees.</p></div>
    </GlassCard>
  );
}

function PricingPanel({ agents }: { agents: Agent[] }) {
  return (
    <GlassCard className="p-6" hover={false}>
      <div className="flex items-center justify-between mb-6"><div><h2 className="text-xl font-bold">Dynamic Pricing</h2><p className="text-sm text-gray-500">Trust-based fee multipliers</p></div></div>
      <div className="space-y-3">
        {agents.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">Verify agents to see pricing</p> : agents.map((agent) => (
          <div key={agent.address} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${agent.reputation >= 90 ? 'bg-emerald-500/20 text-emerald-400' : agent.reputation >= 70 ? 'bg-blue-500/20 text-blue-400' : agent.reputation >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{agent.reputation}</div>
              <div><p className="font-mono text-sm">{agent.address.slice(0, 8)}...{agent.address.slice(-6)}</p><p className="text-xs text-gray-500">{agent.stakeFormatted} AVAX staked</p></div>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold font-mono ${agent.feeMultiplier <= 0.75 ? 'text-emerald-400' : agent.feeMultiplier <= 1 ? 'text-blue-400' : agent.feeMultiplier <= 1.25 ? 'text-amber-400' : 'text-red-400'}`}>{agent.feeMultiplier}x</p>
              <p className="text-xs text-gray-500">{agent.feeMultiplier < 1 ? `${((1 - agent.feeMultiplier) * 100).toFixed(0)}% discount` : agent.feeMultiplier > 1 ? `${((agent.feeMultiplier - 1) * 100).toFixed(0)}% surcharge` : 'base price'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5"><p className="text-xs text-gray-500 mb-2">Pricing Formula:</p><p className="text-xs font-mono text-gray-400">finalPrice = basePrice × repFactor × stakeFactor</p></div>
    </GlassCard>
  );
}

function SecurityPanel() {
  const features = [
    { icon: '⚡', name: 'PoW Protection', desc: 'Anti-DDoS challenges' },
    { icon: '🔒', name: 'Unbonding Delay', desc: '1 hour minimum' },
    { icon: '🎯', name: 'Tiered Staking', desc: 'Per-endpoint requirements' },
    { icon: '🔄', name: 'Macaroon Sessions', desc: 'Fast re-auth tokens' },
    { icon: '👥', name: 'Diversity Scoring', desc: 'Anti-sybil bonus' },
    { icon: '⚠️', name: 'Risk Engine', desc: 'Abuse detection' }
  ];
  return (
    <GlassCard className="p-6" hover={false}>
      <h2 className="text-xl font-bold mb-4">Security Features</h2>
      <div className="grid grid-cols-2 gap-3">
        {features.map((f) => (
          <div key={f.name} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-2 mb-1"><span>{f.icon}</span><span className="font-medium text-sm">{f.name}</span><span className="ml-auto w-2 h-2 rounded-full bg-emerald-500"></span></div>
            <p className="text-xs text-gray-500">{f.desc}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [checkAddress, setCheckAddress] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [gatewayStats, setGatewayStats] = useState<GatewayStats>({ totalRequests: 0, blockedRequests: 0, totalRevenue: 0, avgReputation: 50 });
  const [activeTab, setActiveTab] = useState<'verify' | 'stake' | 'feedback'>('verify');
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [feedbackPositive, setFeedbackPositive] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const apiBase = 'http://127.0.0.1:4022';

  const addToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const calculateFeeMultiplier = (reputation: number, stake: number, riskScore: number) => {
    let multiplier = 1.0;
    if (reputation >= 90) multiplier *= 0.5;
    else if (reputation >= 70) multiplier *= 0.75;
    else if (reputation < 50) multiplier *= 1.5;
    if (riskScore > 50) multiplier *= 1.5;
    else if (riskScore > 25) multiplier *= 1.25;
    if (stake > 0) multiplier *= (1 - Math.min(stake / 10, 0.2));
    return Math.round(multiplier * 100) / 100;
  };

  const getTier = (reputation: number) => {
    if (reputation >= 90) return 'premium';
    if (reputation >= 70) return 'standard';
    if (reputation >= 50) return 'basic';
    return 'restricted';
  };

  // FETCH ALL AGENTS FROM GATEWAY
  const fetchAgents = async () => {
    try {
      const res = await fetch(`${apiBase}/api/agents`);
      const data = await res.json();
      if (data.agents) {
        const formattedAgents: Agent[] = data.agents.map((a: any) => ({
          address: a.address,
          tokenId: a.tokenId?.toString() || '0',
          reputation: a.reputation || 50,
          stake: a.stake || '0',
          stakeFormatted: (parseFloat(a.stake || '0') / 1e18).toFixed(2),
          riskScore: 15,
          tier: getTier(a.reputation || 50),
          feeMultiplier: a.feeMultiplier || calculateFeeMultiplier(a.reputation || 50, parseFloat(a.stake || '0') / 1e18, 15),
          blocked: false
        }));
        setAgents(formattedAgents);
        if (formattedAgents.length > 0) {
          const avgRep = Math.round(formattedAgents.reduce((sum, a) => sum + a.reputation, 0) / formattedAgents.length);
          setGatewayStats(prev => ({ ...prev, avgReputation: avgRep }));
        }
      }
    } catch (err) {
      console.error('Error fetching agents:', err);
      addToast('error', 'Connection Error', 'Could not connect to gateway');
    }
  };

  // CHECK SINGLE AGENT
  const checkAgent = async (address?: string) => {
    const addr = address || checkAddress;
    if (!addr) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/agents/${addr}`);
      const data = await res.json();
      if (data.error && !data.tokenId) {
        addToast('error', 'Agent Not Found', data.error);
        setLoading(false);
        return;
      }
      const reputation = data.reputation || 50;
      const stakeWei = data.stake || '0';
      const stakeNum = parseFloat(stakeWei) / 1e18;
      const riskScore = 15;
      const newAgent: Agent = {
        address: addr,
        tokenId: data.tokenId?.toString() || '0',
        reputation,
        stake: stakeWei,
        stakeFormatted: stakeNum.toFixed(2),
        riskScore,
        tier: getTier(reputation),
        feeMultiplier: calculateFeeMultiplier(reputation, stakeNum, riskScore),
        blocked: riskScore > 80
      };
      setVerifyResult({ approved: !newAgent.blocked && reputation >= 30, agentAddress: addr, tokenId: newAgent.tokenId, reputation, stake: stakeWei, riskScore, tier: newAgent.tier, feeMultiplier: newAgent.feeMultiplier, blocked: newAgent.blocked });
      setAgents(prev => {
        const exists = prev.find(a => a.address.toLowerCase() === addr.toLowerCase());
        if (exists) return prev.map(a => a.address.toLowerCase() === addr.toLowerCase() ? newAgent : a);
        return [...prev, newAgent];
      });
      setSelectedAgent(newAgent);
      addToast('success', 'Agent Verified', `Reputation: ${reputation}, Tier: ${newAgent.tier}`);
    } catch (err) {
      console.error('Error checking agent:', err);
      addToast('error', 'Verification Failed', 'Could not connect to gateway');
    }
    setLoading(false);
  };

  // ⭐ REAL STAKE - CALLS GATEWAY API
  const handleStake = async (amount: string) => {
    if (!selectedAgent) {
      addToast('error', 'No Agent Selected', 'Select an agent first');
      return;
    }
    setLoading(true);
    addToast('info', 'Staking...', `Staking ${amount} AVAX...`);
    try {
      const res = await fetch(`${apiBase}/api/agents/${selectedAgent.address}/stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', 'Stake Successful!', `Staked ${amount} AVAX. Total: ${data.totalStakeFormatted} AVAX`);
        const stakeNum = parseFloat(data.totalStakeFormatted || amount);
        setAgents(prev => prev.map(a => a.address.toLowerCase() === selectedAgent.address.toLowerCase() ? { ...a, stake: data.totalStake || (stakeNum * 1e18).toString(), stakeFormatted: stakeNum.toFixed(2), feeMultiplier: calculateFeeMultiplier(a.reputation, stakeNum, a.riskScore) } : a));
        setSelectedAgent(prev => prev ? { ...prev, stake: data.totalStake || (stakeNum * 1e18).toString(), stakeFormatted: stakeNum.toFixed(2), feeMultiplier: calculateFeeMultiplier(prev.reputation, stakeNum, prev.riskScore) } : null);
        setGatewayStats(prev => ({ ...prev, totalRequests: prev.totalRequests + 1 }));
      } else {
        addToast('warning', 'Stake Info', data.note || 'Demo mode');
      }
    } catch (err) {
      console.error('Stake error:', err);
      addToast('error', 'Stake Failed', 'Could not connect to gateway');
    }
    setLoading(false);
  };

  // ⭐ REAL FEEDBACK - CALLS GATEWAY API
  const submitFeedback = async () => {
    if (!selectedAgent) {
      addToast('error', 'No Agent Selected', 'Select an agent first');
      return;
    }
    setLoading(true);
    addToast('info', 'Submitting...', `${feedbackPositive ? 'Positive' : 'Negative'} feedback...`);
    try {
      const res = await fetch(`${apiBase}/api/agents/${selectedAgent.address}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positive: feedbackPositive, comment: feedbackPositive ? 'Good service' : 'Poor service' })
      });
      const data = await res.json();
      if (data.success) {
        const changeText = data.change > 0 ? `+${data.change}` : data.change.toString();
        addToast('success', 'Feedback Submitted!', `Reputation: ${data.oldReputation} → ${data.newReputation} (${changeText})`);
        await fetchAgents();
        setSelectedAgent(prev => prev ? { ...prev, reputation: data.newReputation, tier: data.tier, feeMultiplier: calculateFeeMultiplier(data.newReputation, parseFloat(prev.stakeFormatted), prev.riskScore) } : null);
        setVerifyResult(prev => prev ? { ...prev, reputation: data.newReputation, tier: data.tier } : null);
        setGatewayStats(prev => ({ ...prev, totalRequests: prev.totalRequests + 1 }));
      } else {
        addToast('error', 'Feedback Failed', data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Feedback error:', err);
      addToast('error', 'Feedback Failed', 'Could not connect to gateway');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="fixed inset-0 pointer-events-none"><div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" /></div>
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center"><span className="text-xl">🛡️</span></div>
              <div><h1 className="text-lg font-bold tracking-tight">AgentTrust Gateway</h1><p className="text-xs text-gray-500">The Cloudflare for x402 APIs</p></div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full"><StatusIndicator status="online" /><span className="text-xs text-gray-400">Avalanche Fuji</span></div>
              <div className="flex items-center gap-3 text-xs text-gray-500"><span>Agents: <span className="text-white font-mono">{agents.length}</span></span><span className="w-px h-4 bg-white/10" /><span>Requests: <span className="text-emerald-400 font-mono">{gatewayStats.totalRequests}</span></span></div>
            </div>
          </div>
        </div>
      </header>
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Requests', value: gatewayStats.totalRequests, color: 'text-purple-400', icon: '📊' },
            { label: 'Agents', value: agents.length, color: 'text-blue-400', icon: '🤖' },
            { label: 'Revenue', value: gatewayStats.totalRevenue, suffix: 'USDC', color: 'text-emerald-400', icon: '💰', decimals: 2 },
            { label: 'Avg Reputation', value: gatewayStats.avgReputation, suffix: '/100', color: 'text-amber-400', icon: '⭐' }
          ].map((stat, i) => (
            <GlassCard key={i} className="p-5">
              <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p><span>{stat.icon}</span></div>
              <div className="flex items-baseline gap-2"><span className={`text-3xl font-bold font-mono ${stat.color}`}><AnimatedNumber value={stat.value} decimals={stat.decimals} /></span>{stat.suffix && <span className="text-gray-500 text-sm">{stat.suffix}</span>}</div>
            </GlassCard>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-6">
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              {[{ id: 'verify', label: 'Verify', icon: '◎' }, { id: 'stake', label: 'Stake', icon: '◇' }, { id: 'feedback', label: 'Feedback', icon: '↕' }].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}><span className="mr-2">{tab.icon}</span>{tab.label}</button>
              ))}
            </div>
            <GlassCard className="p-6" hover={false}>
              {activeTab === 'verify' && (
                <div className="space-y-5">
                  <div><h2 className="text-xl font-bold mb-1">Verify Agent</h2><p className="text-sm text-gray-500">Check gateway access eligibility</p></div>
                  <Input label="Agent Address" placeholder="0x..." value={checkAddress} onChange={setCheckAddress} icon="◎" />
                  <Button onClick={() => checkAgent()} disabled={loading} loading={loading} className="w-full">Check Access</Button>
                  {verifyResult && (
                    <div className={`p-5 rounded-xl border transition-all duration-500 ${verifyResult.approved ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                      <div className="flex items-start justify-between mb-4"><div><p className={`text-lg font-bold ${verifyResult.approved ? 'text-emerald-400' : 'text-red-400'}`}>{verifyResult.approved ? '✓ Access Allowed' : '✕ Access Denied'}</p><p className="text-xs text-gray-500 font-mono mt-1">{verifyResult.agentAddress?.slice(0, 10)}...{verifyResult.agentAddress?.slice(-8)}</p></div><TierBadge tier={verifyResult.blocked ? 'blocked' : verifyResult.tier!} /></div>
                      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10"><div><p className="text-xs text-gray-500 mb-1">Rep</p><p className="font-mono font-bold">{verifyResult.reputation}</p></div><div><p className="text-xs text-gray-500 mb-1">Risk</p><p className="font-mono font-bold">{verifyResult.riskScore}</p></div><div><p className="text-xs text-gray-500 mb-1">Fee</p><p className="font-mono font-bold">{verifyResult.feeMultiplier}x</p></div></div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'stake' && (
                <div className="space-y-5">
                  <div><h2 className="text-xl font-bold mb-1">Stake AVAX</h2><p className="text-sm text-gray-500">Increase trust and reduce fees</p></div>
                  {selectedAgent ? (<><div className="p-3 rounded-xl bg-white/5 border border-white/10"><p className="text-xs text-gray-500 mb-1">Selected Agent</p><p className="font-mono text-sm">{selectedAgent.address.slice(0, 12)}...{selectedAgent.address.slice(-8)}</p><p className="text-xs text-gray-500 mt-2">Current stake: <span className="text-white">{selectedAgent.stakeFormatted} AVAX</span></p></div><Input label="Stake Amount" placeholder="0.1" value={stakeAmount} onChange={setStakeAmount} icon="◇" suffix="AVAX" /><Button onClick={() => handleStake(stakeAmount)} disabled={loading} loading={loading} className="w-full">Stake AVAX</Button><p className="text-xs text-gray-500 text-center">⚠️ 1 hour unbonding period</p></>) : (<p className="text-sm text-gray-500 text-center py-8">Select an agent first</p>)}
                </div>
              )}
              {activeTab === 'feedback' && (
                <div className="space-y-5">
                  <div><h2 className="text-xl font-bold mb-1">Submit Feedback</h2><p className="text-sm text-gray-500">Rate agent performance</p></div>
                  {selectedAgent ? (<><div className="p-3 rounded-xl bg-white/5 border border-white/10"><p className="text-xs text-gray-500 mb-1">Selected Agent</p><p className="font-mono text-sm">{selectedAgent.address.slice(0, 12)}...{selectedAgent.address.slice(-8)}</p><p className="text-xs text-gray-500 mt-2">Current reputation: <span className="text-white">{selectedAgent.reputation}</span></p></div><div className="space-y-2"><label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Feedback Type</label><div className="flex gap-3"><button onClick={() => setFeedbackPositive(true)} className={`flex-1 py-3 rounded-xl text-center transition-all ${feedbackPositive ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50' : 'bg-white/5 text-gray-500 border border-white/10'}`}>👍 Positive (+5)</button><button onClick={() => setFeedbackPositive(false)} className={`flex-1 py-3 rounded-xl text-center transition-all ${!feedbackPositive ? 'bg-red-500/20 text-red-400 border-2 border-red-500/50' : 'bg-white/5 text-gray-500 border border-white/10'}`}>👎 Negative (-10)</button></div></div><Button onClick={submitFeedback} disabled={loading} loading={loading} variant={feedbackPositive ? 'primary' : 'danger'} className="w-full">Submit {feedbackPositive ? 'Positive' : 'Negative'} Feedback</Button></>) : (<p className="text-sm text-gray-500 text-center py-8">Select an agent first</p>)}
                </div>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">Tracked Agents</h3><button onClick={fetchAgents} className="text-xs text-gray-500 hover:text-white">↻ Refresh</button></div>
              {agents.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">No agents yet</p> : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button key={agent.address} onClick={() => { setSelectedAgent(agent); setCheckAddress(agent.address); }} className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${selectedAgent?.address === agent.address ? 'bg-white/10 border border-white/20' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'}`}>
                      <div className="flex items-center gap-3"><span className="text-sm font-mono">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</span><TierBadge tier={agent.blocked ? 'blocked' : agent.tier} /></div>
                      <div className="text-right"><span className="text-lg font-bold font-mono">{agent.reputation}</span><span className={`ml-2 text-xs ${agent.feeMultiplier <= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>{agent.feeMultiplier}x</span></div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
          <div className="col-span-8 space-y-6">
            <GatewayDemoPanel selectedAgent={selectedAgent} onStake={handleStake} addToast={addToast} />
            <div className="grid grid-cols-2 gap-6"><PricingPanel agents={agents} /><SecurityPanel /></div>
            {selectedAgent && (
              <GlassCard className="p-6" hover={false}>
                <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold mb-1">Agent #{selectedAgent.tokenId || 'Unknown'}</h2><p className="text-sm text-gray-500 font-mono">{selectedAgent.address}</p></div><ReputationGauge value={selectedAgent.reputation} size={100} /></div>
                <div className="grid grid-cols-5 gap-4 mt-6 pt-6 border-t border-white/5">
                  <div><p className="text-xs text-gray-500 mb-1">Tier</p><TierBadge tier={selectedAgent.blocked ? 'blocked' : selectedAgent.tier} /></div>
                  <div><p className="text-xs text-gray-500 mb-1">Fee</p><p className="text-xl font-bold font-mono">{selectedAgent.feeMultiplier}x</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Stake</p><p className="text-xl font-bold font-mono">{selectedAgent.stakeFormatted}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Risk</p><p className={`text-xl font-bold font-mono ${selectedAgent.riskScore > 50 ? 'text-red-400' : selectedAgent.riskScore > 25 ? 'text-amber-400' : 'text-emerald-400'}`}>{selectedAgent.riskScore}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Status</p><p className={selectedAgent.blocked ? 'text-red-400' : 'text-emerald-400'}>{selectedAgent.blocked ? 'Blocked' : 'Active'}</p></div>
                </div>
              </GlassCard>
            )}
          </div>
        </div>
        <footer className="mt-12 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6"><div className="flex items-center gap-2"><StatusIndicator status="online" /><span className="text-xs text-gray-500">Gateway Active</span></div><div className="flex items-center gap-4 text-xs"><a href={`https://testnet.snowscan.xyz/address/${CONTRACTS.agentRegistry}#code`} target="_blank" className="text-gray-500 hover:text-white transition-colors">Registry ↗</a><a href={`https://testnet.snowscan.xyz/address/${CONTRACTS.stakingModule}#code`} target="_blank" className="text-gray-500 hover:text-white transition-colors">Staking ↗</a><a href={`https://testnet.snowscan.xyz/address/${CONTRACTS.reputationEngine}#code`} target="_blank" className="text-gray-500 hover:text-white transition-colors">Reputation ↗</a><a href={`https://testnet.snowscan.xyz/address/${CONTRACTS.jobLogger}#code`} target="_blank" className="text-gray-500 hover:text-white transition-colors">JobLogger ↗</a></div></div>
            <div className="text-right"><p className="text-xs text-gray-600">Built for <span className="text-red-400">Avalanche x402 Hack2Build 2025</span></p><p className="text-xs text-gray-700 mt-1">Thirdweb · Turf · Youmio</p></div>
          </div>
        </footer>
      </div>
    </main>
  );
}