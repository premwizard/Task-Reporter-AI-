import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderGit2, Search, RefreshCw, CheckCircle2,
  Zap, Building2, User, ExternalLink, Trash2,
  GitBranch, Lock, Globe, Check, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const ConnectRepos = () => {
  const [installations, setInstallations] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [installUrl, setInstallUrl] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);
  const [togglingRepo, setTogglingRepo] = useState(null);

  // Handle fresh GitHub App installation redirect (installation_id in URL)
  const handleUrlBinding = async () => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');
    const setupAction = params.get('setup_action');

    if (installationId && (setupAction === 'install' || setupAction === 'request' || setupAction === 'update')) {
      const toastId = toast.loading('🔗 Finalizing GitHub App integration...');
      try {
        await api.post('/github-app/bind', { installation_id: parseInt(installationId) });
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.success('GitHub App integrated successfully!', { id: toastId, duration: 4000 });
      } catch (err) {
        toast.error('Failed to link GitHub App: ' + err.message, { id: toastId });
      }
    }
  };

  // Fetch installations + repos
  const fetchData = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [instData, reposData, urlData] = await Promise.all([
        api.get('/github-app/installations'),
        api.get('/github-app/repositories'),
        api.get('/github-app/install-url'),
      ]);
      setInstallations(instData || []);
      setRepos(Array.isArray(reposData) ? reposData : []);
      setInstallUrl(urlData?.install_url || '');
    } catch (err) {
      console.error('Failed to load GitHub integration data:', err);
      if (!quiet) toast.error('Error loading repositories: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await handleUrlBinding();
      await fetchData();
    };
    init();
  }, []);

  // Filtered + split lists
  const filteredRepos = repos.filter(repo => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (repo.name || '').toLowerCase().includes(q) ||
      (repo.owner || '').toLowerCase().includes(q) ||
      (repo.full_name || '').toLowerCase().includes(q) ||
      (repo.organization && repo.organization.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (filterType === 'private') return repo.private;
    if (filterType === 'public') return !repo.private;
    if (filterType === 'personal') return !repo.organization;
    if (filterType === 'organization') return !!repo.organization;
    return true;
  });

  const connected = filteredRepos.filter(r => r.connected);
  const available = filteredRepos.filter(r => !r.connected);

  // Toggle tracking for individual repo
  const handleToggleConnect = async (repo, shouldConnect) => {
    const key = repo.full_name || repo.name;
    setTogglingRepo(key);
    const toastId = toast.loading(shouldConnect ? `Syncing ${repo.name}...` : `Disconnecting ${repo.name}...`);
    try {
      if (shouldConnect) {
        await api.post('/github-app/repositories/connect', {
          repository_name: repo.full_name,
          repo_name: repo.name,
        });
        toast.success(`${repo.name} is now being tracked!`, { id: toastId });
      } else {
        await api.post('/github-app/repositories/disconnect', {
          repository_name: repo.full_name,
        });
        toast.success(`${repo.name} disconnected.`, { id: toastId });
      }
      await fetchData(true);
    } catch (err) {
      toast.error(`Failed: ${err.message}`, { id: toastId });
    } finally {
      setTogglingRepo(null);
    }
  };

  // Refresh installation (re-sync from GitHub API)
  const handleRefresh = async (inst) => {
    setRefreshingId(inst.id);
    const toastId = toast.loading('🔄 Syncing from GitHub...');
    try {
      const data = await api.post(`/github-app/installations/${inst.id}/refresh`);
      toast.success(`Synced ${data.repositories?.length || 0} repositories.`, { id: toastId });
      await fetchData(true);
    } catch (err) {
      toast.error('Sync failed: ' + err.message, { id: toastId });
    } finally {
      setRefreshingId(null);
    }
  };

  const filterPills = [
    { id: 'all', label: 'All' },
    { id: 'personal', label: 'Personal' },
    { id: 'organization', label: 'Organization' },
    { id: 'private', label: 'Private' },
    { id: 'public', label: 'Public' },
  ];

  // ── Repo Card ─────────────────────────────────────────────────────────
  const RepoCard = ({ repo, isConnected }) => {
    const key = repo.full_name || repo.name;
    const isToggling = togglingRepo === key;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className={`glass-card p-5 flex flex-col justify-between transition-all ${
          isConnected
            ? 'border-emerald-500/20 bg-emerald-500/[0.01]'
            : 'border-slate-200/60 dark:border-zinc-800/60'
        }`}
      >
        <div className="space-y-3">
          {/* Repo name + status badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderGit2 className={`w-4 h-4 flex-shrink-0 ${isConnected ? 'text-emerald-500' : 'text-slate-400 dark:text-zinc-500'}`} />
              <h4
                className="font-extrabold text-sm text-slate-900 dark:text-white truncate"
                title={repo.full_name}
              >
                {repo.name}
              </h4>
            </div>
            {isConnected ? (
              <span className="flex-shrink-0 flex items-center gap-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-extrabold px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            ) : (
              <span className="flex-shrink-0 bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 text-[9px] font-extrabold px-2 py-0.5 rounded border border-slate-200/50 dark:border-zinc-700/30">
                Available
              </span>
            )}
          </div>

          {/* Full name + org */}
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate">{repo.full_name}</p>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {repo.organization && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                <Building2 className="w-3 h-3" /> {repo.organization}
              </span>
            )}
            <span className={`flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
              repo.private
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {repo.private ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
              {repo.private ? 'Private' : 'Public'}
            </span>
            {repo.owner && (
              <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                @{repo.owner}
              </span>
            )}
          </div>
        </div>

        {/* Footer action */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
          {isConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> Commits tracked
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500">
              <GitBranch className="w-3 h-3" /> Not tracked
            </span>
          )}

          <button
            onClick={() => handleToggleConnect(repo, !isConnected)}
            disabled={isToggling}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              isConnected
                ? 'border-rose-500/30 text-rose-500 bg-rose-500/5 hover:bg-rose-500/10'
                : 'border-violet-500/30 text-violet-500 bg-violet-500/5 hover:bg-violet-500/15'
            } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isToggling ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : isConnected ? (
              <Trash2 className="w-3 h-3" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {isToggling ? 'Working...' : isConnected ? 'Disconnect' : 'Track Repo'}
          </button>
        </div>
      </motion.div>
    );
  };

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-slate-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-4 w-96 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-slate-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card p-5 space-y-3 animate-pulse">
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-slate-100 dark:bg-zinc-800/60 rounded" />
              <div className="h-3 w-1/2 bg-slate-100 dark:bg-zinc-800/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Repository Tracking
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">
            Manage which repositories GitIntel monitors for commits and pull requests.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {installUrl && (
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20"
            >
              <Building2 className="w-4 h-4" />
              Add Account
            </a>
          )}
        </div>
      </div>

      {/* ── Stats Banner ── */}
      {installations.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4 flex items-center gap-3 border-emerald-500/20 bg-emerald-500/[0.01]">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Connected</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{repos.filter(r => r.connected).length}</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-3 border-slate-200/60 dark:border-zinc-800/60">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
              <FolderGit2 className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Repos</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{repos.length}</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-3 border-violet-500/20 bg-violet-500/[0.01]">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Accounts</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{installations.length}</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.01]">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Webhooks</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">Live</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounts quick list ── */}
      {installations.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {installations.map(inst => (
            <div
              key={inst.id}
              className="glass-card px-4 py-2.5 flex items-center gap-3 border-slate-200/60 dark:border-zinc-800/60"
            >
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                {inst.account_type === 'Organization'
                  ? <Building2 className="w-4 h-4 text-violet-500" />
                  : <User className="w-4 h-4 text-indigo-400" />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">@{inst.account_login}</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                  {Array.isArray(inst.repositories) ? inst.repositories.length : 0} repos
                </p>
              </div>
              <button
                onClick={() => handleRefresh(inst)}
                disabled={refreshingId === inst.id}
                className="btn-icon border-transparent cursor-pointer"
                title="Re-sync from GitHub"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === inst.id ? 'animate-spin' : ''}`} />
              </button>
              <a
                href={installUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon border-transparent text-slate-400 hover:text-violet-500"
                title="Manage in GitHub"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ── No installations at all ── */}
      {installations.length === 0 && (
        <div className="glass-card p-10 text-center flex flex-col items-center justify-center border-dashed border-slate-200 dark:border-zinc-700 max-w-2xl mx-auto">
          <AlertCircle className="w-10 h-10 text-slate-400 dark:text-zinc-600 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">No GitHub Accounts Connected</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5 max-w-sm">
            Install the GitIntel GitHub App on your account or organization to start tracking repositories.
          </p>
          {installUrl && (
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20"
            >
              <Zap className="w-4 h-4" />
              Install GitHub App
            </a>
          )}
        </div>
      )}

      {/* ── Search + Filter ── */}
      {repos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-premium pl-9 w-full bg-slate-100/50 dark:bg-zinc-900/50"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {filterPills.map(pill => (
              <button
                key={pill.id}
                onClick={() => setFilterType(pill.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  filterType === pill.id
                    ? 'bg-violet-500/10 text-violet-500 border-violet-500/30'
                    : 'bg-transparent text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:border-violet-500/30'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Connected Repositories ── */}
      {repos.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Tracked Repositories
              <span className="ml-2 text-sm font-bold text-slate-400 dark:text-zinc-500">({connected.length})</span>
            </h2>
          </div>

          {connected.length === 0 ? (
            <div className="glass-card p-8 flex flex-col items-center justify-center text-center border-dashed border-slate-200 dark:border-zinc-700">
              <FolderGit2 className="w-7 h-7 text-slate-400 dark:text-zinc-600 mb-2" />
              <p className="text-sm text-slate-500 dark:text-zinc-400 font-semibold">
                No repositories tracked yet. Click <span className="text-violet-500">Track Repo</span> below to start monitoring commits.
              </p>
            </div>
          ) : (
            <AnimatePresence>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {connected.map(repo => (
                  <RepoCard key={`${repo.installation_id}-${repo.id || repo.name}`} repo={repo} isConnected={true} />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* ── Available Repositories ── */}
      {repos.length > 0 && (
        <div className="space-y-5 pt-6 border-t border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-zinc-600 flex-shrink-0" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Available Repositories
              <span className="ml-2 text-sm font-bold text-slate-400 dark:text-zinc-500">({available.length})</span>
            </h2>
          </div>

          {available.length === 0 ? (
            <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
              <Check className="w-7 h-7 text-emerald-500 mb-2" />
              <p className="text-sm text-slate-500 dark:text-zinc-400 font-semibold">
                All repositories are currently being tracked!
              </p>
            </div>
          ) : (
            <AnimatePresence>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {available.map(repo => (
                  <RepoCard key={`${repo.installation_id}-${repo.id || repo.name}`} repo={repo} isConnected={false} />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectRepos;
