import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Zap, ShieldCheck, RefreshCw, Mail, Lock, User, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Register = ({ navigate }) => {
  const { verifySession } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('developer');
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !password) {
      toast.error('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Creating account...');

    try {
      const res = await api.post('/auth/register', {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role
      });
      if (res && res.token) {
        localStorage.setItem('token', res.token);
      }
      toast.dismiss(toastId);
      toast.success('Account registered successfully!');
      
      // Update session auth state
      await verifySession();
      
      // Navigate to dashboard
      navigate('/');
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.message || 'Registration failed. Please try again.');
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

        {/* Premium Registration Card */}
        <div className="glass-card p-8 border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-xl shadow-2xl rounded-2xl">
          <h2 className="text-xl font-bold text-white mb-2 text-center">Create New Account</h2>
          <p className="text-zinc-400 text-xs mb-6 text-center leading-relaxed max-w-sm mx-auto">
            Join the platform to automatically log push activities, generate developer activity timelines, and collaborate seamlessly.
          </p>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* First Name & Last Name row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded-xl pl-10 pr-4 py-3 text-zinc-200 placeholder-zinc-500 text-sm outline-none transition-all duration-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded-xl pl-10 pr-4 py-3 text-zinc-200 placeholder-zinc-500 text-sm outline-none transition-all duration-200"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                Work Email Address
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

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                Account Password
              </label>
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

            {/* Role assignment */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 pl-1">
                Authorization Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none transition-all duration-200 h-[46px] cursor-pointer"
              >
                <option value="developer">Developer</option>
                <option value="manager">Manager</option>
                <option value="admin">System Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-violet-800 disabled:to-indigo-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 transform active:scale-95 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 cursor-pointer flex items-center justify-center gap-2 text-sm mt-2"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Create Free Account
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="h-px bg-zinc-800/80 my-5"></div>

          <div className="text-center">
            <span className="text-zinc-500 text-xs font-medium">Already have an account? </span>
            <button 
              onClick={() => navigate('/login')} 
              className="text-violet-400 hover:text-violet-300 text-xs font-bold transition-colors underline pl-1 bg-transparent border-none cursor-pointer"
            >
              Sign In
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 text-[10px] text-zinc-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure account encryption is standard on all profiles</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Register;
