import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Sparkles, Copy, FileText, Download, Calendar, 
  User, CheckCircle, RefreshCw, AlertCircle, Share2, Layers
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function AIStandups() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('team');
  const [standupType, setStandupType] = useState('daily');
  const [loading, setLoading] = useState(false);
  const [standup, setStandup] = useState('');
  const [stats, setStats] = useState({ commits: 0, prs: 0, repos: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await api.get('/admin/users');
      setUsers(data || []);
    } catch (err) {
      console.warn('Failed to load users for standup list:', err.message);
      // Fallback fallback to avoid breaking employee views
      setUsers([]);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStandup('');
    try {
      const res = await api.get(`/ai/standup/${selectedUser}?type=${standupType}`);
      if (res.success) {
        setStandup(res.standup);
        setStats(res.stats || { commits: 0, prs: 0, repos: 0 });
        toast.success('Standup report synthesized successfully!');
      } else {
        throw new Error(res.error || 'Failed to compile standup');
      }
    } catch (err) {
      toast.error('Synthesis failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(standup);
    setCopied(true);
    toast.success('Copied standup report to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    const blob = new Blob([standup], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedUser}_${standupType}_standup.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Downloaded standup report as Markdown!');
  };

  const handleExportPDF = () => {
    // Basic text file download formatted nicely for printing
    const formatted = `=== GITINTEL ENGINEERING STANDUP ===\nUser: ${selectedUser}\nType: ${standupType}\nGenerated: ${new Date().toLocaleString()}\n\n${standup}`;
    const blob = new Blob([formatted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedUser}_${standupType}_standup.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Downloaded standup report as print-ready log!');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">AI Daily Standups</h1>
        <p className="text-slate-500 dark:text-zinc-400 mt-1">Generate automated scrum updates and retro recaps powered by Groq.</p>
      </div>

      {/* Generator Configuration Grid */}
      <div className="glass-card p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Target Contributor
          </label>
          <select 
            value={selectedUser} 
            onChange={e => setSelectedUser(e.target.value)}
            className="input-premium w-full bg-transparent cursor-pointer"
          >
            <option value="team">👥 Team (Cross-Organization Summary)</option>
            {users.map(u => (
              <option key={u.id} value={u.github_username || u.id}>
                👤 @{u.github_username || u.email}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Timeframe Interval
          </label>
          <select 
            value={standupType} 
            onChange={e => setStandupType(e.target.value)}
            className="input-premium w-full bg-transparent cursor-pointer"
          >
            <option value="daily">📅 Daily Standup</option>
            <option value="weekly">📅 Weekly Retro Summary</option>
            <option value="monthly">📅 Monthly Milestone Audit</option>
          </select>
        </div>

        <button 
          onClick={handleGenerate}
          disabled={loading}
          className="btn-primary w-full h-[45px] flex items-center justify-center gap-2"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
          {loading ? 'Synthesizing Scrum...' : 'Generate Standup'}
        </button>
      </div>

      {/* Output Panel */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card p-12 flex flex-col items-center justify-center space-y-4 text-center"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-500/10 text-violet-500 flex items-center justify-center rounded-2xl animate-pulse">
              <Bot className="w-8 h-8 animate-bounce text-violet-600 dark:text-violet-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Analyzing Repository Matrix...</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-sm">
                Fetching recent commits, tracking branch changes, auditing pull request logs, and compiling scrums.
              </p>
            </div>
          </motion.div>
        ) : standup ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Analyzed Commits</p>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.commits}</h4>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Indexed PRs</p>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.prs}</h4>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Affected Repos</p>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.repos}</h4>
              </div>
            </div>

            {/* Standup display card */}
            <div className="glass-card overflow-hidden">
              <div className="px-6 py-4 bg-slate-50/50 dark:bg-zinc-900/50 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-violet-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider">Generated Standup Report</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleCopy}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button 
                    onClick={handleExportMarkdown}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500" /> Markdown
                  </button>
                  <button 
                    onClick={handleExportPDF}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-500" /> Print TXT
                  </button>
                </div>
              </div>

              <div className="p-6 prose dark:prose-invert max-w-none text-slate-850 dark:text-zinc-200 space-y-4">
                {/* Simple rich-text standup renderer */}
                {standup.split('\n').map((line, idx) => {
                  if (line.startsWith('###')) {
                    return <h3 key={idx} className="text-base font-bold text-violet-600 dark:text-violet-400 mt-4 border-b border-slate-100 dark:border-zinc-800 pb-1">{line.replace('###', '').trim()}</h3>;
                  }
                  if (line.startsWith('##')) {
                    return <h2 key={idx} className="text-lg font-extrabold text-slate-900 dark:text-white mt-6">{line.replace('##', '').trim()}</h2>;
                  }
                  if (line.startsWith('*') || line.startsWith('-')) {
                    return <div key={idx} className="flex items-start gap-2 text-sm font-semibold pl-2 text-slate-700 dark:text-zinc-300"><span className="text-violet-500 mt-1">•</span><span>{line.substring(1).trim()}</span></div>;
                  }
                  return line.trim() ? <p key={idx} className="text-sm font-semibold text-slate-600 dark:text-zinc-400 leading-relaxed">{line}</p> : null;
                })}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="glass-card p-12 text-center text-slate-500 dark:text-zinc-500">
            <Bot className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="font-bold">Standup Playground Ready</p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Configure filters above and click generate to synthesize your standup.</p>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
