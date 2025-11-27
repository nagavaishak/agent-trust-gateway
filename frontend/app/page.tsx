'use client';

import { useState } from 'react';

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
        alert(`Agent registered! Token ID: ${data.tokenId}`);
        setNewAgentAddress('');
        checkAgent(newAgentAddress);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
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
    } catch (err) {
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
        alert(`Feedback submitted! New reputation: ${data.newReputation}`);
      } else {
        alert(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Feedback error:', err);
      alert('Failed to submit feedback');
    }
    setLoading(false);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'premium': return 'from-yellow-500 to-amber-600';
      case 'standard': return 'from-blue-500 to-blue-600';
      case 'basic': return 'from-gray-500 to-gray-600';
      case 'restricted': return 'from-red-500 to-red-600';
      default: return 'from-gray-400 to-gray-500';
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'premium': return '⭐ PREMIUM';
      case 'standard': return '✓ STANDARD';
      case 'basic': return '○ BASIC';
      case 'restricted': return '⚠ RESTRICTED';
      default: return tier.toUpperCase();
    }
  };

  const getReputationColor = (rep: number) => {
    if (rep >= 80) return 'text-green-400';
    if (rep >= 60) return 'text-blue-400';
    if (rep >= 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20" />
        <div className="relative max-w-6xl mx-auto px-8 py-12">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-full text-blue-300 text-sm mb-6">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live on Avalanche
            </div>
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Agent Trust Protocol
            </h1>
            <p className="text-xl text-gray-400 mb-2">The Credit Score for AI Agents</p>
            <p className="text-sm text-gray-500">
              On-chain reputation tied to payment history • ERC-8004 Identity • x402 Payment Gating
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 pb-12">
        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 text-center border border-gray-700/50">
            <p className="text-3xl font-bold text-white">{agents.length}</p>
            <p className="text-gray-400 text-sm">Agents Tracked</p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 text-center border border-gray-700/50">
            <p className="text-3xl font-bold text-green-400">
              {agents.filter(a => a.reputation >= 50).length}
            </p>
            <p className="text-gray-400 text-sm">Approved</p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 text-center border border-gray-700/50">
            <p className="text-3xl font-bold text-red-400">
              {agents.filter(a => a.reputation < 50).length}
            </p>
            <p className="text-gray-400 text-sm">Restricted</p>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Register Agent */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">🤖</span>
              </div>
              <h2 className="text-lg font-semibold">Register Agent</h2>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Agent Address (0x...)"
                value={newAgentAddress}
                onChange={(e) => setNewAgentAddress(e.target.value)}
                className="w-full p-3 bg-gray-900/50 rounded-lg border border-gray-600 focus:border-blue-500 outline-none text-sm transition-colors"
              />
              <input
                type="text"
                placeholder="Metadata URI"
                value={newAgentURI}
                onChange={(e) => setNewAgentURI(e.target.value)}
                className="w-full p-3 bg-gray-900/50 rounded-lg border border-gray-600 focus:border-blue-500 outline-none text-sm transition-colors"
              />
              <button
                onClick={registerAgent}
                disabled={loading}
                className="w-full p-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-lg font-semibold disabled:opacity-50 transition-all"
              >
                {loading ? 'Processing...' : 'Register Agent'}
              </button>
            </div>
          </div>

          {/* Submit Feedback */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              <h2 className="text-lg font-semibold">Submit Feedback</h2>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Agent Token ID (e.g., 1, 2)"
                value={feedbackTokenId}
                onChange={(e) => setFeedbackTokenId(e.target.value)}
                className="w-full p-3 bg-gray-900/50 rounded-lg border border-gray-600 focus:border-purple-500 outline-none text-sm transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setFeedbackScore(-1)}
                  className={`flex-1 p-2 rounded-lg font-medium text-sm transition-all ${feedbackScore === -1 ? 'bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  👎 Bad
                </button>
                <button
                  onClick={() => setFeedbackScore(0)}
                  className={`flex-1 p-2 rounded-lg font-medium text-sm transition-all ${feedbackScore === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  😐 Meh
                </button>
                <button
                  onClick={() => setFeedbackScore(1)}
                  className={`flex-1 p-2 rounded-lg font-medium text-sm transition-all ${feedbackScore === 1 ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  👍 Good
                </button>
              </div>
              <input
                type="text"
                placeholder="Payment Amount (AVAX)"
                value={feedbackAmount}
                onChange={(e) => setFeedbackAmount(e.target.value)}
                className="w-full p-3 bg-gray-900/50 rounded-lg border border-gray-600 focus:border-purple-500 outline-none text-sm transition-colors"
              />
              <button
                onClick={submitFeedback}
                disabled={loading}
                className="w-full p-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-lg font-semibold disabled:opacity-50 transition-all"
              >
                {loading ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>

          {/* Verify Agent */}
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">✓</span>
              </div>
              <h2 className="text-lg font-semibold">x402 Payment Check</h2>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Agent Address (0x...)"
                value={checkAddress}
                onChange={(e) => setCheckAddress(e.target.value)}
                className="w-full p-3 bg-gray-900/50 rounded-lg border border-gray-600 focus:border-green-500 outline-none text-sm transition-colors"
              />
              <button
                onClick={() => checkAgent()}
                disabled={loading}
                className="w-full p-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 rounded-lg font-semibold disabled:opacity-50 transition-all"
              >
                Verify Agent
              </button>
              
              {verifyResult && (
                <div className={`p-4 rounded-lg ${verifyResult.approved ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
                  <p className="font-semibold flex items-center gap-2">
                    {verifyResult.approved ? '✅ Payment Approved' : '❌ Payment Denied'}
                  </p>
                  {verifyResult.approved ? (
                    <div className="mt-2 text-sm space-y-1 text-gray-300">
                      <p>Token ID: <span className="text-white">{verifyResult.tokenId}</span></p>
                      <p>Reputation: <span className={getReputationColor(verifyResult.reputation!)}>{verifyResult.reputation}/100</span></p>
                      <p>Tier: <span className="text-white">{verifyResult.tier}</span></p>
                      <p>Fee: <span className="text-white">{verifyResult.feeMultiplier}x</span></p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-300">{verifyResult.reason}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Agent List */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📋</span>
              </div>
              <h2 className="text-lg font-semibold">Agent Leaderboard</h2>
            </div>
            <p className="text-gray-400 text-sm">{agents.length} agents tracked</p>
          </div>
          
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-2">No agents verified yet</p>
              <p className="text-gray-600 text-sm">Use the x402 Payment Check above to verify an agent</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.sort((a, b) => b.reputation - a.reputation).map((agent, index) => (
                <div 
                  key={agent.address} 
                  className={`flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${getTierColor(agent.tier)} bg-opacity-10 border border-gray-700/30 hover:border-gray-600/50 transition-all`}
                  style={{ background: `linear-gradient(135deg, rgba(31, 41, 55, 0.8) 0%, rgba(17, 24, 39, 0.8) 100%)` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="font-mono text-sm text-gray-300">
                        {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                      </p>
                      <p className="text-gray-500 text-xs">Token ID: {agent.tokenId} • Fee: {agent.feeMultiplier}x</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-3xl font-bold ${getReputationColor(agent.reputation)}`}>
                        {agent.reputation}
                      </p>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r ${getTierColor(agent.tier)} text-white`}>
                        {getTierBadge(agent.tier)}
                      </span>
                    </div>
                    <button
                      onClick={() => checkAgent(agent.address)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                      title="Refresh"
                    >
                      🔄
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
<div className="text-center mt-12 space-y-2">
  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full text-green-400 text-xs mb-2">
    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
    Connected to Avalanche Fuji Testnet
  </div>
  <p className="text-gray-500 text-sm">
    Built for <span className="text-red-400">Avalanche x402 Hack2Build 2025</span>
  </p>
  <p className="text-gray-600 text-xs">
    ERC-8004 Agent Identity • Payment-Weighted Reputation • Teleporter Cross-Chain
  </p>
  <div className="flex justify-center gap-4 mt-4 text-xs text-gray-600">
    <a href="https://testnet.snowtrace.io/address/0xBcf07EeDDb1C306660BEb4Ef5F47fDbb999D80a8" 
       target="_blank" 
       className="hover:text-blue-400 transition-colors">
      AgentIdentity ↗
    </a>
    <a href="https://testnet.snowtrace.io/address/0x02682d54A383489e217FCb3cbd0945bc97Ced4C5" 
       target="_blank"
       className="hover:text-blue-400 transition-colors">
      ReputationRegistry ↗
    </a>
    <a href="https://testnet.snowtrace.io/address/0x87025d55ceC6bd643E925a3784f4457d2796Cd6b" 
       target="_blank"
       className="hover:text-blue-400 transition-colors">
      CrossChainReputation ↗
    </a>
  </div>
</div>
      </div>
    </main>
  );
}