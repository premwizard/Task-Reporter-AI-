import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Github, Zap, ShieldCheck, RefreshCw, BarChart2, Cpu, Mail, Lock } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Login = ({ navigate }) => {
  const { verifySession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check for errors in the redirect URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      if (error === 'auth_failed') {
        toast.error('GitHub authentication failed. Please try again.');
      } else if (error === 'no_user') {
        toast.error('Could not retrieve user details from GitHub.');
      } else {
        toast.error('An unexpected error occurred during authentication.');
      }
    }
  }, []);

  const handleGithubLogin = () => {
    setLoading(true);
    toast.loading('Redirecting to GitHub...', { duration: 1500 });
    
    const backendUrl = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace('/api', '') 
      : 'https://task-reporter-ai.onrender.com';
    
    window.location.href = `${backendUrl}/auth/github`;
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Signing in...');

    try {
      await api.post('/auth/login', { email, password });
      toast.dismiss(toastId);
      toast.success('Signed in successfully!');
      
      // Update the AuthContext user state
      await verifySession();
      
      // Redirect to dashboard
      navigate('/');
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Premium Glassmorphic / Ambient Lighting */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[130px] -top-80 -left-60 animate-pulse-slow"></div>
      <div className="absolute w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[130px] -bottom-80 -right-60 animate-pulse-slow"></div>

      <div className="w-full max-w-lg z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/30 mx-auto mb-3 border border-violet-400/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1.5">
            GitIntel <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 font-extrabold">Platform</span>
          </h1>
          <p className="text-zinc-400 text-xs font-medium">
            AI-Powered GitHub Engineering Intelligence Platform
          </p>
        </div>

        {/* Premium Login Card */}
        <div className="glass-card p-8 border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-xl shadow-2xl rounded-2xl">
          <h2 className="text-xl font-bold text-white mb-2 text-center">Welcome Back</h2>
          <p className="text-zinc-400 text-xs mb-6 text-center leading-relaxed max-w-sm mx-auto">
            Log in to monitor engineering activity, generate executive insights, and check real-time developer metrics.
          </p>

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded-xl pl-10 pr-4 py-3 text-zinc-200 placeholder-zinc-500 text-sm outline-none transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5 pl-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded-xl pl-10 pr-4 py-3 text-zinc-200 placeholder-zinc-500 text-sm outline-none transition-all duration-200"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-violet-800 disabled:to-indigo-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 transform active:scale-95 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                'Sign In with Password'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-zinc-800/80 flex-1"></div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Or continue with</span>
            <div className="h-px bg-zinc-800/80 flex-1"></div>
          </div>

          {/* GitHub OAuth Button */}
          <button
            onClick={handleGithubLogin}
            disabled={loading || submitting}
            className="w-full flex items-center justify-center gap-2.5 bg-white text-zinc-950 hover:bg-zinc-100 disabled:bg-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all duration-300 transform active:scale-95 shadow-md shadow-white/5 cursor-pointer text-sm mb-5"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
            ) : (
              <Github className="w-4 h-4 text-zinc-950" />
            )}
            Sign In with GitHub
          </button>

          <div className="text-center">
            <span className="text-zinc-500 text-xs font-medium">Don't have an account? </span>
            <button 
              onClick={() => navigate('/register')} 
              className="text-violet-400 hover:text-violet-300 text-xs font-bold transition-colors underline pl-1 bg-transparent border-none cursor-pointer"
            >
              Sign Up / Register
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 text-[10px] text-zinc-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure encryption and multi-factor session locking active</span>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="glass-card p-3 border border-zinc-800/40 bg-zinc-950/20 text-center rounded-xl">
            <Cpu className="w-4.5 h-4.5 text-violet-400 mx-auto mb-1.5" />
            <h4 className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">AI Analytics</h4>
            <p className="text-[8px] text-zinc-500 mt-0.5">Commit explanations</p>
          </div>
          <div className="glass-card p-3 border border-zinc-800/40 bg-zinc-950/20 text-center rounded-xl">
            <Zap className="w-4.5 h-4.5 text-amber-400 mx-auto mb-1.5" />
            <h4 className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">Auto Hooks</h4>
            <p className="text-[8px] text-zinc-500 mt-0.5">Automated synchronization</p>
          </div>
          <div className="glass-card p-3 border border-zinc-800/40 bg-zinc-950/20 text-center rounded-xl">
            <BarChart2 className="w-4.5 h-4.5 text-emerald-400 mx-auto mb-1.5" />
            <h4 className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">Developer Metrics</h4>
            <p className="text-[8px] text-zinc-500 mt-0.5">Isolated performance charts</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
