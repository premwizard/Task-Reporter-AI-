import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderGit2, Search, RefreshCw, CheckCircle2,
  Zap, Building2, User, ExternalLink, Trash2,
  GitBranch, Lock, Globe, Check, AlertCircle, Users
} from 'lucide-react';
import toast from 'react-hot-toast';

const ownerTypeConfig = {
  organization: { label: 'Organization', icon: Building2, color: 'violet' },
  collaborator:  { label: 'Collaborator', icon: Users,     color: 'amber'  },
  personal:      { label: 'Personal',     icon: User,      color: 'indigo' },
};

const ConnectRepos = () => {
  const [installations, setInstallations] = useState([]);
  const [repos, setRepos] = useState([]);
  const [appSlug, setAppSlug] = useState('');
  const [installUrl, setInstallUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [refreshingId, setRefreshingId] = useState(null);
  const [togglingRepo, setTogglingRepo] = useState(null);
  const [syncingActivity, setSyncingActivity] = useState(false);

  const handleSyncActivity = async () => {
    setSyncingActivity(true);
    const tid = toast.loading('🌐 Querying GitHub Events API for recent contributions...');
    try {
      const { data } = await api.post('/github-app/sync-activity');
      if (data.success) {
        toast.success(`Contribution sync complete! ${data.inserted} new activities added, ${data.skipped} skipped.`, { id: tid });
      } else {
        toast.error('Sync completed with warnings.', { id: tid });
      }
    } catch (err) {
      toast.error('Sync failed: ' + err.message, { id: tid });
    } finally {
      setSyncingActivity(false);
    }
  };

  const handleUrlBinding = async () => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');
    const setupAction = params.get('setup_action');
    if (installationId && ['install', 'request', 'update'].includes(setupAction)) {
      const tid = toast.loading('🔗 Finalizing GitHub App integration...');
      try {
        await api.post('/github-app/bind', { installation_id: parseInt(installationId) });
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.success('GitHub App integrated!', { id: tid });
      } catch (err) {
        toast.error('Failed to link app: ' + err.message, { id: tid });
      }
    }
  };

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
      setAppSlug(urlData?.app_slug || '');
    } catch (err) {
      if (!quiet) toast.error('Error loading repositories: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => { await handleUrlBinding(); await fetchData(); })();
  }, []);

  const filteredRepos = repos.filter(repo => {
    const q = searchQuery.toLowerCase();
    const match =
      (repo.name || '').toLowerCase().includes(q) ||
      (repo.full_name || '').toLowerCase().includes(q) ||
      (repo.owner || '').toLowerCase().includes(q) ||
      (repo.organization || '').toLowerCase().includes(q);
    if (!match) return false;
    if (filterType === 'private') return repo.private;
    if (filterType === 'public') return !repo.private;
    if (filterType === 'personal') return repo.ownerType === 'personal';
    if (filterType === 'organization') return repo.ownerType === 'organization';
    if (filterType === 'collaborator') return repo.ownerType === 'collaborator';
    return true;
  });

  const connected = filteredRepos.filter(r => r.connected);
  const available  = filteredRepos.filter(r => !r.connected);

  const handleToggleConnect = async (repo, shouldConnect) => {
    const key = repo.full_name || repo.name;
    setTogglingRepo(key);
    const tid = toast.loading(shouldConnect ? `Syncing ${repo.name}...` : `Disconnecting ${repo.name}...`);
    try {
      if (shouldConnect) {
        await api.post('/github-app/repositories/connect', { repository_name: repo.full_name, repo_name: repo.name });
        toast.success(`${repo.name} is now tracked!`, { id: tid });
      } else {
        await api.post('/github-app/repositories/disconnect', { repository_name: repo.full_name });
        toast.success(`${repo.name} disconnected.`, { id: tid });
      }
      await fetchData(true);
    } catch (err) {
      toast.error(`Failed: ${err.message}`, { id: tid });
    } finally {
      setTogglingRepo(null);
    }
  };

  const handleRefresh = async (inst) => {
    setRefreshingId(inst.id);
    const tid = toast.loading('🔄 Syncing from GitHub...');
    try {
      const data = await api.post(`/github-app/installations/${inst.id}/refresh`);
      toast.success(`Synced ${data.repositories?.length || 0} repos.`, { id: tid });
      await fetchData(true);
    } catch (err) {
      toast.error('Sync failed: ' + err.message, { id: tid });
    } finally {
      setRefreshingId(null);
    }
  };

  // ── Repo Card ────────────────────────────────────────────────────────────
  const RepoCard = ({ repo, isConnected }) => {
    const key = repo.full_name || repo.name;
    const isToggling = togglingRepo === key;
    const ownerCfg = ownerTypeConfig[repo.ownerType || 'personal'];
    const OwnerIcon = ownerCfg.icon;
    const orgInstallUrl = repo.organization && appSlug
      ? `https://github.com/apps/${appSlug}/installations/new`
      : null;

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
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderGit2 className={`w-4 h-4 flex-shrink-0 ${isConnected ? 'text-emerald-500' : 'text-slate-400 dark:text-zinc-500'}`} />
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate" title={repo.full_name}>
                {repo.name}
              </h4>
            </div>
            {isConnected ? (
              <span className="flex-shrink-0 flex items-center gap-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-extrabold px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
              </span>
            ) : (
              <span className="flex-shrink-0 bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 text-[9px] font-extrabold px-2 py-0.5 rounded border border-slate-200/50 dark:border-zinc-700/30">
                Available
              </span>
            )}
          </div>

          {/* Full name */}
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate">{repo.full_name}</p>

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Owner type badge */}
            <span className={`flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
              ownerCfg.color === 'violet' ? 'bg-violet-500/10 text-violet-500 border-violet-500/20' :
              ownerCfg.color === 'amber'  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'   :
                                            'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
            }`}>
              <OwnerIcon className="w-2.5 h-2.5" />
              {ownerCfg.label}
            </span>

            {/* Org name if org-owned */}
            {repo.organization && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-500 bg-violet-500/5 px-2 py-0.5 rounded border border-violet-500/10">
                @{repo.organization}
              </span>
            )}

            {/* Private / Public */}
            <span className={`flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
              repo.private
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {repo.private ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
              {repo.private ? 'Private' : 'Public'}
            </span>
          </div>

          {/* Org install hint for collaborator repos */}
          {repo.ownerType === 'collaborator' && !isConnected && (
            <div className="flex items-start gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-600 dark:text-amber-400 leading-relaxed">
                Collaborator repo. The owner must also install GitIntel App on their account.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
          {isConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> Webhooks live
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
            {isToggling ? <RefreshCw className="w-3 h-3 animate-spin" /> :
             isConnected ? <Trash2 className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
            {isToggling ? 'Working...' : isConnected ? 'Disconnect' : 'Track Repo'}
          </button>
        </div>
      </motion.div>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────
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

  const personalInstalls = installations.filter(i => i.account_type === 'User');
  const orgInstalls      = installations.filter(i => i.account_type === 'Organization');

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Repository Tracking
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">
            Manage which repositories GitIntel monitors. Install the app on organizations to track team repos.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={() => fetchData()} disabled={loading} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
          <button onClick={handleSyncActivity} disabled={syncingActivity} className="btn-secondary flex items-center gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/5">
            <Globe className={`w-4 h-4 ${syncingActivity ? 'animate-spin' : ''}`} />
            Sync Commits
          </button>
          {installUrl && (
            <a href={installUrl} target="_blank" rel="noopener noreferrer"
               className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20">
              <Building2 className="w-4 h-4" /> Add Account
            </a>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      {(installations.length > 0 || repos.length > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Tracked', value: repos.filter(r => r.connected).length, color: 'emerald', Icon: CheckCircle2 },
            { label: 'Total Repos', value: repos.length, color: 'slate', Icon: FolderGit2 },
            { label: 'Accounts', value: installations.length, color: 'violet', Icon: Building2 },
            { label: 'Webhooks', value: 'Live', color: 'amber', Icon: Zap },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className={`glass-card p-4 flex items-center gap-3 border-${color}-500/20 bg-${color}-500/[0.01]`}>
              <div className={`w-9 h-9 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color}-500`} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">{label}</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Installation Chips ── */}
      {installations.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {installations.map(inst => (
            <div key={inst.id} className="glass-card px-4 py-2.5 flex items-center gap-3 border-slate-200/60 dark:border-zinc-800/60">
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                {inst.account_type === 'Organization'
                  ? <Building2 className="w-4 h-4 text-violet-500" />
                  : <User className="w-4 h-4 text-indigo-400" />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">@{inst.account_login}</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                  {inst.account_type === 'Organization' ? 'Organization' : 'Personal'} ·{' '}
                  {Array.isArray(inst.repositories) ? inst.repositories.length : 0} repos
                </p>
              </div>
              <button onClick={() => handleRefresh(inst)} disabled={refreshingId === inst.id}
                      className="btn-icon border-transparent cursor-pointer" title="Re-sync">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === inst.id ? 'animate-spin' : ''}`} />
              </button>
              <a href={installUrl || '#'} target="_blank" rel="noopener noreferrer"
                 className="btn-icon border-transparent text-slate-400 hover:text-violet-500" title="Manage in GitHub">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ── Org Install Guide Banner ── */}
      {orgInstalls.length === 0 && (installations.length > 0 || repos.length > 0) && (
        <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-amber-500/20 bg-amber-500/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Want to track organization repositories?</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Install GitIntel App on your GitHub organization to receive webhooks for all org repos, including private and team repositories.
            </p>
          </div>
          <a href={installUrl || '#'} target="_blank" rel="noopener noreferrer"
             className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/15 transition-all">
            <Building2 className="w-4 h-4" /> Install on Organization
          </a>
        </div>
      )}

      {/* ── Empty — no installations + no repos ── */}
      {installations.length === 0 && repos.length === 0 && (
        <div className="glass-card p-10 text-center flex flex-col items-center justify-center border-dashed border-slate-200 dark:border-zinc-700 max-w-2xl mx-auto">
          <AlertCircle className="w-10 h-10 text-slate-400 dark:text-zinc-600 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">No GitHub Accounts Connected</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5 max-w-sm">
            Install the GitIntel GitHub App on your personal account or organization.
          </p>
          {installUrl && (
            <a href={installUrl} target="_blank" rel="noopener noreferrer"
               className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20">
              <Zap className="w-4 h-4" /> Install GitHub App
            </a>
          )}
        </div>
      )}

      {/* ── Search + Filter ── */}
      {repos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input type="text" placeholder="Search repositories..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="input-premium pl-9 w-full bg-slate-100/50 dark:bg-zinc-900/50" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All' },
              { id: 'personal', label: 'Personal' },
              { id: 'organization', label: 'Org' },
              { id: 'collaborator', label: 'Collaborator' },
              { id: 'private', label: 'Private' },
              { id: 'public', label: 'Public' },
            ].map(pill => (
              <button key={pill.id} onClick={() => setFilterType(pill.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  filterType === pill.id
                    ? 'bg-violet-500/10 text-violet-500 border-violet-500/30'
                    : 'bg-transparent text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:border-violet-500/30'
                }`}>
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tracked Repositories ── */}
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
                No repos tracked yet. Click <span className="text-violet-500">Track Repo</span> below to start.
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
              <p className="text-sm text-slate-500 dark:text-zinc-400 font-semibold">All repositories are tracked!</p>
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
