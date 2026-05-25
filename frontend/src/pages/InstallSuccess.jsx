import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, GitBranch, Github, Server } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function InstallSuccess({ navigate }) {
  const [step, setStep] = useState('authenticating');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');

    console.log('[InstallSuccess] Capture setup redirect. Installation ID:', installationId);

    if (!installationId) {
      toast.error('Missing installation context from GitHub. Redirecting back...');
      setTimeout(() => navigate('/dashboard'), 2000);
      return;
    }

    const performBinding = async () => {
      try {
        // Step 1: Connecting integration
        setStep('binding');
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Call backend binding/sync route
        console.log('[InstallSuccess] Binding installation to active session...');
        await api.post('/github-app/bind', { installation_id: parseInt(installationId) });
        
        // Step 2: Auto-syncing repos
        setStep('syncing');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Complete
        setStep('done');
        toast.success('GitHub App onboarding complete!');
        
        setTimeout(() => {
          console.log('[InstallSuccess] Routing to home dashboard...');
          navigate('/');
        }, 1000);
      } catch (err) {
        console.error('[InstallSuccess] Onboarding process failed:', err);
        toast.error('Failed to bind GitHub App: ' + err.message);
        setTimeout(() => navigate('/dashboard'), 3000);
      }
    };

    performBinding();
  }, [navigate]);

  const steps = [
    { id: 'authenticating', label: 'Verifying GitHub App permissions...', icon: Github },
    { id: 'binding', label: 'Connecting integration to logged-in user...', icon: Server },
    { id: 'syncing', label: 'Syncing accessible repositories automatically...', icon: GitBranch },
    { id: 'done', label: 'Launch completed! Loading dashboard...', icon: CheckCircle2 }
  ];

  const stepOrder = steps.map(s => s.id);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans p-8">
      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        {/* Animated Brand Emblem */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
          <GitBranch className="w-8 h-8 text-white animate-pulse" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Connecting GitIntel Integration</h1>
          <p className="text-zinc-400 text-sm">
            We are configuring your workspace profile to use real-time Webhook telemetry.
          </p>
        </div>

        {/* Sync Progress Tracker */}
        <div className="w-full space-y-3">
          {steps.map((s, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                    : isCurrent
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-650'
                }`}
              >
                {isCurrent ? (
                  <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0 text-violet-400" />
                ) : (
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-zinc-500'}`} />
                )}
                <span className="text-sm font-semibold">{s.label}</span>
              </div>
            );
          })}
        </div>

        <p className="text-zinc-600 text-xs text-center leading-relaxed">
          Repositories are synchronized automatically during onboarding.<br />
          No manual connected repos configuration needed.
        </p>
      </div>
    </div>
  );
}
