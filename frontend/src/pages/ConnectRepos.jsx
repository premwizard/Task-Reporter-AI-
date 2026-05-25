import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderGit2, Search, Check, AlertTriangle, Link2, 
  Trash2, RefreshCw, CheckCircle2, ChevronRight,
  Zap, Shield, Building2, User, ExternalLink, HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const ConnectRepos = () => {
  const [installations, setInstallations] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true); // Step 10
  const [installedStatus, setInstalledStatus] = useState(null); // Step 7
  const [binding, setBinding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [installUrl, setInstallUrl] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);
  const [disconnectingId, setDisconnectingId] = useState(null);

  // 1. Detect if returning from a fresh GitHub App installation
  const handleUrlBinding = async () => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');
    const setupAction = params.get('setup_action');

    if (installationId && (setupAction === 'install' || setupAction === 'request' || setupAction === 'update')) {
      setBinding(true);
      const toastId = toast.loading('🔗 Finalizing GitHub App integration...');
      try {
        console.log(`[ConnectRepos] Dynamic installation redirect caught. ID: ${installationId}`);
        await api.post('/github-app/bind', { installation_id: parseInt(installationId) });
        
        // Clean URL parameters gracefully
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
        toast.success('GitHub App integrated successfully!', { id: toastId, duration: 4000 });
      } catch (err) {
        toast.error('Failed to link GitHub App: ' + err.message, { id: toastId, duration: 5000 });
      } finally {
        setBinding(false);
      }
    }
  };

  // 2. Fetch installations and connected repos
  const fetchData = async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setStatusLoading(true);
    }
    try {
      // Fetch installations list
      const instData = await api.get('/github-app/installations');
      setInstallations(instData);

      // Fetch combined repositories across all installations
      const reposData = await api.get('/github-app/repositories');
      setRepos(reposData);

      // Fetch pre-configured install URL
      const urlData = await api.get('/github-app/install-url');
      setInstallUrl(urlData.install_url);

      // Fetch GitHub App status (Step 7)
      const statusData = await api.get('/github-app/status');
      setInstalledStatus(statusData);
    } catch (err) {
      console.error('Failed to load GitHub integration data:', err);
      toast.error('Error synchronizing integrations: ' + err.message);
    } finally {
      setLoading(false);
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      await handleUrlBinding();
      await fetchData();
    };
    initialize();
  }, []);

  // Filter repos based on query
  const filteredRepos = repos.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.account_login.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Trigger cache refresh
  const handleRefresh = async (instId, dbId) => {
    setRefreshingId(dbId);
    const toastId = toast.loading('🔄 Syncing repositories from GitHub...');
    try {
      const data = await api.post(`/github-app/installations/${dbId}/refresh`);
      toast.success(`Sync complete! Loaded ${data.repositories?.length || 0} repositories.`, { id: toastId });
      await fetchData(true);
    } catch (err) {
      toast.error('Failed to sync installation: ' + err.message, { id: toastId });
    } finally {
      setRefreshingId(null);
    }
  };

  // Remove/Disconnect integration
  const handleDisconnect = async (dbId, accountLogin) => {
    if (!window.confirm(`Are you sure you want to disconnect @${accountLogin}? This will disable push webhook tracking for all its repositories.`)) {
      return;
    }

    setDisconnectingId(dbId);
    const toastId = toast.loading(`Disconnecting @${accountLogin}...`);
    try {
      await api.delete(`/github-app/installations/${dbId}`);
      toast.success(`Successfully disconnected @${accountLogin}.`, { id: toastId });
      await fetchData(true);
    } catch (err) {
      toast.error('Failed to remove integration: ' + err.message, { id: toastId });
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">GitHub App Integration</h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">
            Connect personal and organization accounts using our centralized GitHub App.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchData()} 
            disabled={loading || binding}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${(loading || binding) ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
          
          {installations.length > 0 && (
            <a
              href={installUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20"
            >
              <Building2 className="w-4 h-4" />
              Add More Accounts
            </a>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {binding ? (
          // Binding loading state
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="glass-card p-16 text-center flex flex-col items-center justify-center border-violet-500/30"
          >
            <div className="relative flex items-center justify-center w-20 h-20 mb-6">
              <span className="absolute w-full h-full rounded-full bg-violet-500/10 animate-ping"></span>
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-violet-500/30">
                <Link2 className="w-8 h-8 animate-pulse" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Finalizing Connection...</h3>
            <p className="text-slate-500 dark:text-zinc-400 max-w-sm">
              We are connecting your GitHub App installation and caching repository indexes. This will only take a second.
            </p>
          </motion.div>
        ) : (statusLoading || loading) ? (
          // General skeleton loading state (Step 10)
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="glass-card p-16 text-center flex flex-col items-center justify-center border-zinc-800"
          >
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <RefreshCw className="w-10 h-10 text-violet-500 animate-spin" />
              <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-widest">Checking GitHub installation...</h3>
            </div>
          </motion.div>
        ) : (!installedStatus?.installed || installations.length === 0) ? (
          // Step 8 & 9: Onboarding screen - Install App Button
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 md:p-16 text-center max-w-3xl mx-auto flex flex-col items-center justify-center border-slate-200/60 dark:border-zinc-800/60 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl -ml-16 -mb-16"></div>

            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-violet-500/30 mb-8">
              <Shield className="w-8 h-8" />
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
              Integrate with GitIntel App
            </h2>
            
            <p className="text-slate-500 dark:text-zinc-400 text-base max-w-xl leading-relaxed mb-8">
              GitIntel now utilizes the professional **GitHub App Integration** framework. This secures your credentials, allows organization repository access, includes collaborator repositories, and automates commit webhook flows without requiring administrator access!
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl mb-10 text-left">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/50 dark:border-zinc-800/50">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Easy Setup</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal">One-click installation for personal or organization portfolios.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/50 dark:border-zinc-800/50">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                  <Building2 className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Org & Private Repos</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal">Seamlessly synchronize private repositories and team org workspaces.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/50 dark:border-zinc-800/50">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Central Webhooks</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-normal">Push events register instantly across all repos. Zero per-repo configs.</p>
              </div>
            </div>

            <a
              href={installUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-750 hover:to-indigo-750 text-white rounded-xl text-base font-bold transition-all flex items-center gap-3 shadow-lg shadow-violet-600/30 group"
            >
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
              Install GitIntel App
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </a>

            <p className="text-zinc-500 dark:text-zinc-500 text-xs mt-6 flex items-center gap-1.5 justify-center">
              <HelpCircle className="w-4 h-4 text-zinc-400" /> Need help? You can configure specific repository limits inside the installation menu.
            </p>
          </motion.div>
        ) : (
          // Active Integration UI
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Step 17: Installation Status UI Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card p-5 flex items-center gap-4 border-emerald-500/20 bg-emerald-500/[0.01]">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">GitHub App Connected</h4>
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Central integration is active</p>
                </div>
              </div>

              <div className="glass-card p-5 flex items-center gap-4 border-blue-500/20 bg-blue-500/[0.01]">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <FolderGit2 className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{repos.length} Repositories Synced</h4>
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Caching active index entries</p>
                </div>
              </div>

              <div className="glass-card p-5 flex items-center gap-4 border-violet-500/20 bg-violet-500/[0.01]">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                  <Building2 className="w-5.5 h-5.5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{installations.length} Active Accounts</h4>
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Organizations & Teams linked</p>
                </div>
              </div>

              <div className="glass-card p-5 flex items-center gap-4 border-amber-500/20 bg-amber-500/[0.01]">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Zap className="w-5.5 h-5.5 text-amber-500 fill-amber-500/20" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">Webhook Pipeline Live</h4>
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">Push events processed automatically</p>
                </div>
              </div>
            </div>

            {/* Installations Management Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Active App Integrations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {installations.map(inst => (
                  <div 
                    key={inst.id} 
                    className="glass-card p-6 flex flex-col justify-between border-slate-200/60 dark:border-zinc-800/60 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-300 font-bold border border-slate-200/50 dark:border-zinc-700/50">
                          {inst.account_type === 'Organization' ? (
                            <Building2 className="w-6 h-6 text-violet-500" />
                          ) : (
                            <User className="w-6 h-6 text-indigo-500" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                            @{inst.account_login}
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-650 dark:bg-zinc-850 dark:text-zinc-450 border border-slate-200/30">
                              {inst.account_type}
                            </span>
                          </h3>
                          <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 mt-0.5">
                            Connected on {new Date(inst.created_at).toLocaleDateString()} · Installation ID: {inst.installation_id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRefresh(inst.installation_id, inst.id)}
                          disabled={refreshingId === inst.id || disconnectingId === inst.id}
                          title="Sync connected repos"
                          className="btn-icon cursor-pointer border-transparent"
                        >
                          <RefreshCw className={`w-4 h-4 ${(refreshingId === inst.id) ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDisconnect(inst.id, inst.account_login)}
                          disabled={refreshingId === inst.id || disconnectingId === inst.id}
                          title="Disconnect Integration"
                          className="btn-icon hover:text-red-500 dark:hover:text-red-400 cursor-pointer border-transparent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-zinc-800/60 pt-4 mt-6 flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-500 dark:text-zinc-400">
                        {Array.isArray(inst.repositories) ? inst.repositories.length : 0} repositories loaded
                      </span>
                      
                      <a
                        href={installUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        Manage in GitHub <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Repositories Management Grid */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mr-auto">Connected Repositories</h2>
                
                <div className="relative w-full sm:max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                  <input 
                    type="text" 
                    placeholder="Search connected repositories..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="input-premium pl-9 w-full bg-slate-100/50 dark:bg-zinc-900/50"
                  />
                </div>
              </div>

              {filteredRepos.length === 0 ? (
                <div className="glass-card p-12 text-center flex flex-col items-center justify-center">
                  <FolderGit2 className="w-8 h-8 text-slate-450 mb-3" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">No repositories match your filter query.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredRepos.map(repo => (
                    <div 
                      key={`${repo.installation_id}-${repo.id}`}
                      className="glass-card p-5 flex flex-col justify-between border-slate-200 dark:border-zinc-800/60"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <FolderGit2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate" title={repo.full_name}>
                            {repo.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                          <span className="bg-slate-100 dark:bg-zinc-800/70 px-2 py-0.5 rounded border border-slate-200/50 dark:border-zinc-800">
                            owner: @{repo.owner}
                          </span>
                          <span className="text-slate-300 dark:text-zinc-700">|</span>
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-violet-400" /> {repo.account_login}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-105/30 dark:border-zinc-805/30 pt-3 mt-4 flex items-center justify-between">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          repo.private 
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/20' 
                            : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200/20'
                        }`}>
                          {repo.private ? 'Private' : 'Public'}
                        </span>

                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-500/10 stroke-[2.5]" /> Sync Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConnectRepos;
