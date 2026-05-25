import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, GitBranch } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OAuthSuccess({ navigate }) {
  const { verifySession } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const onboarding = params.get('onboarding');

    console.log('[OAuthSuccess] Processing successful authentication callback...');
    if (token) {
      localStorage.setItem('token', token);
      
      verifySession().then(() => {
        if (onboarding === 'completed') {
          toast.success('Integration connected successfully!', { id: 'onboarding-toast', duration: 4000 });
        } else {
          toast.success('Welcome back to GitIntel!');
        }
        
        console.log('[OAuthSuccess] Session verified. Navigating to dashboard workspace...');
        navigate('/');
      }).catch((err) => {
        console.error('[OAuthSuccess] Verification check failed:', err);
        localStorage.removeItem('token');
        navigate('/login?error=auth_failed');
      });
    } else {
      console.error('[OAuthSuccess] Missing token context in callback parameter.');
      navigate('/login?error=no_token');
    }
  }, [navigate, verifySession]);

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans p-8">
      {/* Premium Glassmorphic / Ambient Lighting */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-violet-600/5 blur-[120px] -top-40 animate-pulse-slow"></div>
      <div className="absolute w-[400px] h-[400px] rounded-full bg-indigo-600/5 blur-[120px] -bottom-40 animate-pulse-slow"></div>

      <div className="flex flex-col items-center gap-6 max-w-sm w-full z-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30 border border-violet-400/20">
          <GitBranch className="w-8 h-8 text-white animate-pulse" />
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-white">Launching Workspace</h1>
          <p className="text-zinc-400 text-xs font-medium">
            Verifying secure session token context…
          </p>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-400">
          <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
          <span className="text-xs font-semibold">Starting intelligence pipeline...</span>
        </div>
      </div>
    </div>
  );
}
