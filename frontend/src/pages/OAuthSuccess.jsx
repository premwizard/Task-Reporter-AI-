import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, CheckCircle2, GitBranch, Webhook } from 'lucide-react';

const OAuthSuccess = ({ navigate }) => {
  const { verifySession } = useAuth();
  const [step, setStep] = useState('authenticating');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    console.log('[OAuthSuccess] Extracting token from URL parameters...');
    if (token) {
      localStorage.setItem('token', token);
      console.log('[OAuthSuccess] Token stored in localStorage.');

      // Step 1: Verify session
      setStep('verifying');
      verifySession().then(() => {
        console.log('[OAuthSuccess] Session verified.');
        // Step 2: Show "connecting repos" status (auto-connect is running server-side)
        setStep('connecting');
        setTimeout(() => {
          setStep('done');
          setTimeout(() => {
            console.log('[OAuthSuccess] Navigating to dashboard...');
            navigate('/');
          }, 800);
        }, 2000);
      });
    } else {
      console.error('[OAuthSuccess] No token found in URL query parameters.');
      navigate('/login?error=no_token');
    }
  }, [navigate, verifySession]);

  const steps = [
    { id: 'authenticating', label: 'Authenticating with GitHub', icon: CheckCircle2 },
    { id: 'verifying', label: 'Verifying session', icon: CheckCircle2 },
    { id: 'connecting', label: 'Auto-connecting repositories & creating webhooks', icon: Webhook },
    { id: 'done', label: 'All set! Redirecting to dashboard...', icon: CheckCircle2 },
  ];

  const stepOrder = steps.map(s => s.id);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans p-8">
      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
          <GitBranch className="w-8 h-8 text-white" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Setting Up GitIntel</h1>
          <p className="text-zinc-400 text-sm">
            Automatically connecting your repositories and creating webhooks…
          </p>
        </div>

        {/* Steps */}
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
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-600'
                }`}
              >
                {isCurrent ? (
                  <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
                ) : (
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-zinc-600'}`} />
                )}
                <span className="text-sm font-medium">{s.label}</span>
              </div>
            );
          })}
        </div>

        <p className="text-zinc-600 text-xs text-center">
          Webhook creation happens automatically in the background.<br />
          You don't need to do anything — just push commits!
        </p>
      </div>
    </div>
  );
};

export default OAuthSuccess;

