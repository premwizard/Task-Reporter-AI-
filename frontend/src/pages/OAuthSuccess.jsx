import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, CheckCircle2, GitBranch, Webhook, Bot } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

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

      const runOnboardingCheck = async () => {
        try {
          // Step 1: Verify Session
          setStep('verifying');
          await verifySession();
          console.log('[OAuthSuccess] Session verified.');
          await new Promise(resolve => setTimeout(resolve, 800));

          // Step 2: Check GitHub App installation status
          setStep('checking_app');
          console.log('[OAuthSuccess] Checking GitHub App installation status...');
          const status = await api.get('/github-app/installation-status');
          
          if (status.installed) {
            console.log(`[OAuthSuccess] Integration already active (Inst ID: ${status.installationId}). Launching...`);
            setStep('done');
            toast.success('Welcome back to GitIntel!');
            setTimeout(() => {
              navigate('/');
            }, 800);
          } else {
            console.log('[OAuthSuccess] App not installed. Fetching dynamic setup URL...');
            setStep('redirecting_install');
            
            // Retrieve installation URL
            const urlData = await api.get('/github-app/install-url');
            const installUrl = urlData.install_url;
            
            toast('Redirecting to GitHub App installation screen...', { icon: '🔧' });
            setTimeout(() => {
              window.location.href = installUrl;
            }, 1550);
          }
        } catch (err) {
          console.error('[OAuthSuccess] Onboarding validation check failed:', err);
          localStorage.removeItem('token');
          navigate('/login?error=auth_failed');
        }
      };

      runOnboardingCheck();
    } else {
      console.error('[OAuthSuccess] No token found in URL query parameters.');
      localStorage.removeItem('token');
      navigate('/login?error=no_token');
    }
  }, [navigate, verifySession]);

  const steps = [
    { id: 'authenticating', label: 'Authenticating credentials with GitHub...', icon: CheckCircle2 },
    { id: 'verifying', label: 'Verifying session token safety...', icon: CheckCircle2 },
    { id: 'checking_app', label: 'Auditing GitHub App integration status...', icon: Bot },
    { id: 'redirecting_install', label: 'App not found. Opening installation setup...', icon: Webhook },
    { id: 'done', label: 'Verification complete! Launching workspace...', icon: CheckCircle2 },
  ];

  const stepOrder = steps.map(s => s.id);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans p-8">
      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        {/* Brand Emblem */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
          <GitBranch className="w-8 h-8 text-white animate-pulse" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Setting Up GitIntel</h1>
          <p className="text-zinc-400 text-sm">
            Auditing credentials and checking active repository integrations…
          </p>
        </div>

        {/* Steps */}
        <div className="w-full space-y-3">
          {steps.map((s, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const Icon = s.icon;
            
            // Skip showing redirecting_install if we redirect directly to dashboard
            if (s.id === 'redirecting_install' && step === 'done') return null;

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
          Authorized with GitHub Enterprise OAuth.<br />
          Setting up dynamic Webhook sync logs automatically.
        </p>
      </div>
    </div>
  );
};

export default OAuthSuccess;
