import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderGit2, Search, Check, AlertTriangle, Link2, 
  Trash2, RefreshCw, Eye, ShieldAlert, CheckCircle2, ChevronRight,
  Zap, Activity, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';

const ConnectRepos = () => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepos, setSelectedRepos] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null);

  // Load repositories on mount
  const fetchRepos = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api.get('/github/repos');
      setRepos(data);
    } catch (err) {
      toast.error('Failed to load GitHub repositories: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookStatus = async () => {
    try {
      const data = await api.get('/webhooks/status');
      setWebhookStatus(data);
    } catch (err) {
      // Silently ignore — not critical
    }
  };

  useEffect(() => {
    fetchRepos();
    fetchWebhookStatus();
  }, []);

  const filteredRepos = repos.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleSelect = (full_name) => {
    if (selectedRepos.includes(full_name)) {
      setSelectedRepos(prev => prev.filter(name => name !== full_name));
    } else {
      setSelectedRepos(prev => [...prev, full_name]);
    }
  };

  const handleConnectSelected = async () => {
    if (selectedRepos.length === 0) return;
    
    setConnecting(true);
    const toastId = toast.loading(`Connecting ${selectedRepos.length} repositor${selectedRepos.length > 1 ? 'ies' : 'y'}...`);

    const reposPayload = selectedRepos.map(name => {
      const [owner, repo] = name.split('/');
      return { owner, repo };
    });

    try {
      const data = await api.post('/github/connect', { repos: reposPayload });
      
      let successCount = 0;
      let failCount = 0;
      
      data.results.forEach(res => {
        if (res.status === 'created' || res.status === 'connected') {
          successCount++;
        } else {
          failCount++;
        }
      });

      if (successCount > 0) {
        toast.success(`Successfully connected ${successCount} repositor${successCount > 1 ? 'ies' : 'y'}!`, { id: toastId });
      } else {
        toast.error(`Failed to connect selected repositories. Check logs.`, { id: toastId });
      }

      setSelectedRepos([]);
      await fetchRepos(true);
    } catch (err) {
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error('Error connecting repositories: ' + errMsg, { id: toastId, duration: 6000 });
    } finally {
      setConnecting(false);
    }
  };

  const handleTestAutoWebhook = async () => {
    const repoFullName = window.prompt("Enter repository (owner/repo) to test webhook creation:", "octocat/Hello-World");
    if (!repoFullName) return;
    const parts = repoFullName.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      toast.error("Invalid format. Use owner/repo (e.g. octocat/Hello-World)");
      return;
    }
    const [owner, repo] = parts;
    const toastId = toast.loading(`Testing auto webhook for ${repoFullName}...`);
    try {
      console.log(`[Test Auto Webhook] Starting test for ${repoFullName}`);
      const data = await api.post('/github/connect', { repos: [{ owner, repo }] });
      console.log("[Test Auto Webhook] Raw Response:", data);
      
      const result = data.results?.[0];
      if (result && (result.status === 'created' || result.status === 'connected')) {
        toast.success(`Webhook created/connected successfully for ${repoFullName}! Check browser & server logs.`, { id: toastId, duration: 6000 });
      } else {
        const errDetail = result?.error || 'Unknown error';
        toast.error(`Failed: ${errDetail}. Check console & backend logs.`, { id: toastId, duration: 6000 });
      }
    } catch (err) {
      console.error("[Test Auto Webhook] Error:", err);
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error(`Test failed: ${errMsg}`, { id: toastId, duration: 6000 });
    }
  };

  const handleSyncAllRepos = async () => {
    setSyncingAll(true);
    const toastId = toast.loading('🤖 Auto-connecting all repositories...');
    try {
      const data = await api.post('/github/auto-connect-all');
      const { summary } = data;
      toast.success(
        `✅ Sync complete: ${summary.created} new, ${summary.connected} already active, ${summary.skipped} skipped, ${summary.failed} failed.`,
        { id: toastId, duration: 8000 }
      );
      await fetchRepos(true);
      await fetchWebhookStatus();
    } catch (err) {
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error('Sync failed: ' + errMsg, { id: toastId, duration: 6000 });
    } finally {
      setSyncingAll(false);
    }
  };

  const handleReconnect = async (repoFullName) => {
    setActionInProgress(repoFullName);
    const toastId = toast.loading(`Reconnecting webhook for ${repoFullName}...`);
    try {
      await api.post('/github/reconnect', { repository_name: repoFullName });
      toast.success(`Webhook active for ${repoFullName}!`, { id: toastId });
      await fetchRepos(true);
    } catch (err) {
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error(`Reconnection failed: ${errMsg}`, { id: toastId, duration: 6000 });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDisconnect = async (repoFullName) => {
    if (!window.confirm(`Are you sure you want to disconnect ${repoFullName}? This will delete the GitHub webhook.`)) return;
    
    setActionInProgress(repoFullName);
    const toastId = toast.loading(`Disconnecting ${repoFullName}...`);
    try {
      await api.post('/github/disconnect', { repository_name: repoFullName });
      toast.success(`Disconnected ${repoFullName}.`, { id: toastId });
      await fetchRepos(true);
    } catch (err) {
      toast.error(`Disconnection failed: ${err.message}`, { id: toastId });
    } finally {
      setActionInProgress(null);
    }
  };

  const selectAllFiltered = () => {
    const unconnectedFiltered = filteredRepos
      .filter(r => r.connection_status === 'disconnected')
      .map(r => r.full_name);
    
    setSelectedRepos(unconnectedFiltered);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans">
      
      {/* Webhook Status Banner */}
      {webhookStatus && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
            webhookStatus.status === 'healthy'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'
              : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400'
          }`}
        >
          <Shield className="w-4 h-4 flex-shrink-0" />
          <span>
            {webhookStatus.status === 'healthy' ? '✅' : '⚠️'} Webhook endpoint: <strong>{webhookStatus.webhook_url}</strong>
          </span>
          <span className="ml-auto text-xs opacity-70">
            {webhookStatus.active_webhooks} active · {webhookStatus.recent_activities_24h} events (24h)
          </span>
        </motion.div>
      )}

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Connect Repositories</h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">
            Seamlessly activate webhook sync across your public and private GitHub repositories.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync All Repos — triggers auto-connect pipeline */}
          <button
            onClick={handleSyncAllRepos}
            disabled={syncingAll || loading}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-violet-600/20 disabled:opacity-50"
          >
            {syncingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {syncingAll ? 'Syncing...' : 'Sync All Repos'}
          </button>

          <button
            onClick={handleTestAutoWebhook}
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20"
          >
            <ShieldAlert className="w-4.5 h-4.5" />
            Test Webhook
          </button>

          <button 
            onClick={() => fetchRepos()} 
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button
            onClick={handleConnectSelected}
            disabled={selectedRepos.length === 0 || connecting}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
          >
            <Link2 className="w-4 h-4" />
            Connect Selected ({selectedRepos.length})
          </button>
        </div>
      </div>

      {/* Control panel (Search & Select utilities) */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search repositories by name or owner..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-premium pl-9 w-full bg-slate-100/50 dark:bg-zinc-900/50"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button 
            onClick={selectAllFiltered}
            className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline"
          >
            Select All Unconnected
          </button>
          <span className="text-slate-300 dark:text-zinc-700">|</span>
          <button 
            onClick={() => setSelectedRepos([])}
            className="text-xs font-bold text-slate-500 hover:underline"
          >
            Clear Selected
          </button>
        </div>
      </div>

      {/* Repositories Grid Container */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="glass-card p-6 animate-shimmer flex flex-col space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-6 h-6 rounded bg-slate-200 dark:bg-zinc-800"></div>
                  <div className="h-6 w-3/4 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                </div>
                <div className="h-4 w-1/2 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                <div className="flex justify-between items-center pt-2">
                  <div className="h-7 w-20 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                  <div className="h-7 w-24 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredRepos.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-16 text-center flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-zinc-800/50 flex items-center justify-center text-slate-400 dark:text-zinc-500 mb-6">
              <FolderGit2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No repositories found</h3>
            <p className="text-slate-500 dark:text-zinc-400 max-w-md">
              We couldn't retrieve any repositories. Make sure your GitHub account has public or private repos.
            </p>
          </motion.div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            <AnimatePresence>
              {filteredRepos.map(repo => {
                const isSelected = selectedRepos.includes(repo.full_name);
                const isConnected = repo.connection_status === 'active';
                const isActionRunning = actionInProgress === repo.full_name;

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={repo.full_name}
                    className={`glass-card-interactive p-6 flex flex-col justify-between border relative overflow-hidden transition-all duration-300 ${
                      isConnected 
                        ? 'border-emerald-500/20 bg-emerald-500/[0.01] dark:bg-emerald-500/[0.02]' 
                        : isSelected 
                          ? 'border-violet-500 bg-violet-500/[0.02] dark:bg-violet-500/[0.04]' 
                          : 'border-slate-200 dark:border-zinc-800/60'
                    }`}
                  >
                    
                    {/* Header info */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 max-w-[80%]">
                          <FolderGit2 className={`w-5 h-5 flex-shrink-0 ${isConnected ? 'text-emerald-500' : 'text-slate-400'}`} />
                          <h3 
                            className="font-bold text-base text-slate-900 dark:text-white truncate" 
                            title={repo.full_name}
                          >
                            {repo.name}
                          </h3>
                        </div>

                        {/* Connection Checkbox / Active Badge */}
                        {repo.connection_status === 'active' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20 shadow-sm shadow-emerald-500/5">
                            <CheckCircle2 className="w-3 h-3 stroke-[2.5]" /> Webhook Connected
                          </span>
                        )}
                        {repo.connection_status === 'warning' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-500/20 shadow-sm">
                            <AlertTriangle className="w-3 h-3 stroke-[2.5]" /> Permission Missing
                          </span>
                        )}
                        {repo.connection_status === 'failed' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-200 dark:border-rose-500/20 shadow-sm">
                            <AlertTriangle className="w-3 h-3 stroke-[2.5]" /> Webhook Failed
                          </span>
                        )}
                        {repo.connection_status !== 'active' && repo.connection_status !== 'warning' && repo.connection_status !== 'failed' && (
                          <button
                            onClick={() => handleToggleSelect(repo.full_name)}
                            className={`w-5.5 h-5.5 rounded-lg border flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                                : 'border-slate-300 dark:border-zinc-700 hover:border-violet-500'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                        )}
                      </div>

                      {/* Owner & Branch */}
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                        <span className="bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-zinc-700/50">
                          {repo.owner}
                        </span>
                        <span className="bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-zinc-700/50">
                          branch: {repo.default_branch}
                        </span>
                      </div>
                    </div>

                    {/* Visibility & Tech language */}
                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/60 pt-4 mt-6">
                      <div className="flex gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          repo.private 
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20' 
                            : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20'
                        }`}>
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/30">
                          {repo.language}
                        </span>
                      </div>

                      {/* Active Connection Control */}
                      {isConnected && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReconnect(repo.full_name)}
                            disabled={isActionRunning}
                            title="Test & Reconnect Webhook"
                            className="p-2 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-transparent rounded-lg transition-colors cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isActionRunning ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDisconnect(repo.full_name)}
                            disabled={isActionRunning}
                            title="Disconnect repository"
                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

    </div>
  );
};

export default ConnectRepos;
