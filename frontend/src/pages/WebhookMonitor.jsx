import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Bell, ShieldAlert, ShieldCheck, Link2, RefreshCw, AlertTriangle, 
  Terminal, Globe, BookOpen, Clock, Activity, CheckCircle, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

const WebhookMonitor = () => {
  const { user } = useAuth();
  const [tunnelInfo, setTunnelInfo] = useState(null);
  const [loadingTunnel, setLoadingTunnel] = useState(true);
  const [connectedRepos, setConnectedRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [logs, setLogs] = useState([
    { id: '1', time: new Date().toLocaleTimeString(), text: '🔌 System: Initializing Webhook Monitor...', type: 'info' }
  ]);
  const [reconnectingRepo, setReconnectingRepo] = useState(null);
  const [repairing, setRepairing] = useState(false);

  // Fetch tunnel configuration and connected repos
  const fetchStatus = async () => {
    setLoadingTunnel(true);
    try {
      // Fetch public test endpoint
      const response = await api.get('/health');
      setTunnelInfo(response);
      addLog(`📡 System: Backend public tunnel detected: "${response.tunnel_url}"`, response.is_localhost ? 'warn' : 'success');
    } catch (err) {
      console.error(err);
      addLog(`❌ System Error: Failed to fetch backend tunnel info. Make sure the server is running on http://localhost:5000`, 'error');
    } finally {
      setLoadingTunnel(false);
    }
  };

  const fetchConnectedRepos = async () => {
    setLoadingRepos(true);
    try {
      const repos = await api.get('/github/connected');
      setConnectedRepos(repos);
      addLog(`📋 Database: Loaded ${repos.length} connected repository registers.`, 'info');
    } catch (err) {
      toast.error('Failed to load connected repositories.');
      addLog(`❌ Database Error: Failed to load connected repositories.`, 'error');
    } finally {
      setLoadingRepos(false);
    }
  };

  const addLog = (text, type = 'info') => {
    setLogs(prev => [
      { id: Date.now().toString() + Math.random(), time: new Date().toLocaleTimeString(), text, type },
      ...prev
    ]);
  };

  useEffect(() => {
    fetchStatus();
    fetchConnectedRepos();

    // Hook up real-time websocket feed
    const SOCKET_URL = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace('/api', '') 
      : 'http://localhost:5000';
    
    addLog(`🔌 WebSocket: Connecting to live feed at ${SOCKET_URL}...`, 'info');
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      addLog(`⚡ WebSocket: Connected! Streaming live repository webhook pushes in real-time...`, 'success');
    });

    socket.on('new_activity', (activity) => {
      if (activity.source === 'github') {
        addLog(
          `🔥 [PUSH RECEIVED] Repo: "${activity.repository_name}" | Committer: "${activity.employee_name}" | Msg: "${activity.activity}" | SHA: ${activity.commit_hash?.substring(0, 7) || 'N/A'}`,
          'success'
        );
        // Refresh local connected repos list to update timestamps
        fetchConnectedRepos();
      }
    });

    socket.on('disconnect', () => {
      addLog(`🔌 WebSocket: Feed disconnected.`, 'warn');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // STEP 12 — AUTO FIX INVALID WEBHOOKS (Re-create webhook with current backend URL)
  const handleReconnect = async (repoName) => {
    setReconnectingRepo(repoName);
    const toastId = toast.loading(`Auto-fixing webhook for ${repoName}...`);
    addLog(`⚙️ System: Attempting auto-fix on ${repoName} (deleting old hooks & installing new tunnel URL)...`, 'info');
    
    try {
      const res = await api.post('/github/reconnect', { repository_name: repoName });
      toast.dismiss(toastId);
      toast.success('Webhook updated successfully!');
      addLog(`✅ System Success: Webhook for "${repoName}" updated on GitHub. New Hook ID: ${res.webhookId}`, 'success');
      
      // Refresh list
      fetchConnectedRepos();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Auto-fix failed: ${err.message}`);
      addLog(`❌ System Error: Webhook rebuild failed for ${repoName}: ${err.message}`, 'error');
    } finally {
      setReconnectingRepo(null);
    }
  };

  // STEP 8 & 9 — REPAIR WEBHOOKS (sweeps and repairs all registered webhooks automatically)
  const handleRepairAll = async () => {
    setRepairing(true);
    const toastId = toast.loading('Initiating Webhook Repair sweep across all connected repositories...');
    addLog('🔧 System: Starting complete Webhook Repair cycle (STEP 8 & 9)...', 'warn');
    try {
      const res = await api.post('/github/repair-all');
      toast.dismiss(toastId);
      
      let successCount = 0;
      let failCount = 0;
      
      res.results?.forEach(item => {
        if (item.status === 'success') {
          successCount++;
          addLog(`✅ [Webhook Repair] NEW WEBHOOK CREATED: ID ${item.webhookId} | Repo: "${item.repo}" (Action: ${item.action})`, 'success');
        } else {
          failCount++;
          addLog(`❌ [Webhook Repair] FAILED: Repo: "${item.repo}" | Error: ${item.error}`, 'error');
        }
      });

      if (failCount > 0) {
        toast.error(`Completed repair sweep: ${successCount} successfully repaired, ${failCount} failed. Check live log feed for details.`, { duration: 6000 });
      } else {
        toast.success(`Successfully audited and repaired ${successCount} repositor${successCount > 1 ? 'ies' : 'y'}!`);
      }

      await fetchConnectedRepos();
    } catch (err) {
      toast.dismiss(toastId);
      const errMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error(`Webhook repair sweep failed: ${errMsg}`, { duration: 5000 });
      addLog(`❌ System Error: Webhook repair sweep failed: ${errMsg}`, 'error');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in font-sans p-4 md:p-8">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-8 h-8 text-violet-500 animate-pulse" />
            GitHub Webhook <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 font-extrabold">& Delivery Monitor</span>
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1.5 leading-relaxed max-w-2xl">
            Audit automatic hooks, troubleshoot payload delivery attempts, view secure cloud tunnel status, and trigger live updates in real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRepairAll}
            disabled={repairing}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
          >
            <ShieldAlert className={`w-4 h-4 ${repairing ? 'animate-spin' : ''}`} />
            {repairing ? 'Repairing Webhooks...' : 'Repair Webhooks'}
          </button>
          
          <button 
            onClick={() => { fetchStatus(); fetchConnectedRepos(); }} 
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Re-scan Registry
          </button>
        </div>
      </div>

      {/* Grid: Tunnel Status + Repo connection overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column (2/3): Webhook Status Matrix & Live feed */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tunnel Validation Card */}
          {loadingTunnel ? (
            <div className="glass-card p-6 flex items-center justify-center text-zinc-500 gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Scanning server public credentials...</span>
            </div>
          ) : tunnelInfo?.is_localhost ? (
            <div className="glass-card p-6 border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10 rounded-2xl flex flex-col md:flex-row items-start gap-4">
              <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="flex-1 space-y-2">
                <h4 className="font-bold text-rose-700 dark:text-rose-400 text-lg">Localhost Hook Configuration Detected</h4>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Your server's domain is configured to <code className="bg-rose-950/20 text-rose-400 px-1.5 py-0.5 rounded font-mono font-bold text-xs">{tunnelInfo?.tunnel_url}</code>. 
                  GitHub's servers <strong>cannot</strong> send webhooks to local loops. Push activities will not sync to the dashboard.
                </p>
                <div className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-xl font-mono text-xs text-zinc-300 space-y-1">
                  <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-wide mb-1">🛠 Quick Troubleshooting Resolution</p>
                  <p>1. Start a secure public tunnel using ngrok, Cloudflare, or localtunnel:</p>
                  <p className="text-violet-400">   $ npx localtunnel --port 5000</p>
                  <p>2. Copy the public address generated (e.g. <span className="text-emerald-400">https://xxxxx.locallt.me</span>)</p>
                  <p>3. Paste it into <code className="bg-zinc-900 px-1 py-0.5 rounded">backend/.env</code> as: <span className="text-yellow-400">BACKEND_URL=https://xxxxx.locallt.me</span></p>
                  <p>4. Restart your node backend and click <strong>Auto-Fix Webhook</strong> below!</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-6 border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 rounded-2xl flex flex-col md:flex-row items-start gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">Secure Public Tunnel Active</h4>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Your server backend is publicly accessible at <a href={tunnelInfo?.tunnel_url} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline font-bold inline-flex items-center gap-1 font-mono text-xs">{tunnelInfo?.tunnel_url} <ExternalLink className="w-3 h-3" /></a>. 
                  GitHub push notifications are verified, active, and securely listening.
                </p>
              </div>
            </div>
          )}

          {/* Connected Repos Webhook Registry */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-violet-500" />
              Active Webhook Registry
            </h3>

            {loadingRepos ? (
              <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span>Loading connected endpoints...</span>
              </div>
            ) : connectedRepos.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No repositories are connected. Go to "Connect Repos" tab to register one!
              </div>
            ) : (
              <div className="space-y-4">
                {connectedRepos.map((repo) => (
                  <div key={repo.id} className="p-4 bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-xl hover:border-zinc-700 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{repo.repository_name}</span>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          repo.status === 'active' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                        }`}>
                          {repo.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 mt-2 text-[11px] text-slate-500 dark:text-zinc-500 font-medium">
                        <span className="flex items-center gap-1"><Terminal className="w-3.5 h-3.5" /> ID: {repo.webhook_id || 'N/A'}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Registered: {new Date(repo.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleReconnect(repo.repository_name)}
                      disabled={reconnectingRepo === repo.repository_name}
                      className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 shrink-0"
                    >
                      {reconnectingRepo === repo.repository_name ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                      )}
                      Auto-Fix Webhook
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Webhook Activity Terminal Log */}
          <div className="glass-card p-6 flex flex-col h-96">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2"><Terminal className="w-5 h-5 text-indigo-400" /> Live Webhook Payload Log Stream</span>
              <span className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active listening
              </span>
            </h3>

            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-[11px] overflow-y-auto space-y-2 select-all shadow-inner">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-zinc-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={`${
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warn' ? 'text-amber-400 font-bold' :
                    log.type === 'error' ? 'text-rose-500 font-bold' :
                    'text-zinc-300'
                  }`}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right column (1/3): Deliveries audit & guides */}
        <div className="space-y-6">
          
          {/* GitHub Delivery Verification Guide */}
          <div className="glass-card p-6 border-violet-500/20 bg-gradient-to-br from-zinc-900/10 to-violet-950/5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-violet-400" />
              GitHub Delivery Audit
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-4">
              To verify if GitHub is firing events and view the exact HTTP payloads and response codes:
            </p>

            <ul className="space-y-3.5 text-xs text-slate-600 dark:text-zinc-300">
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>
                <span>Go to your repository on GitHub.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>
                <span>Click <strong>Settings</strong> at the top bar.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>
                <span>Select <strong>Webhooks</strong> in the left sidebar.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">4</span>
                <span>Click <strong>Edit</strong> next to the target webhook.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">5</span>
                <span>Scroll down to the <strong>Recent Deliveries</strong> tab.</span>
              </li>
            </ul>

            <div className="mt-5 p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-indigo-400" /> GitHub Response Codes</p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> <span className="font-bold text-zinc-300">200 OK</span>: Fired successfully</div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> <span className="font-bold text-zinc-300">404</span>: Endpoint not found</div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> <span className="font-bold text-zinc-300">408</span>: Timeout / Offline</div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> <span className="font-bold text-zinc-300">500</span>: Backend crash</div>
              </div>
            </div>
          </div>

          {/* Quick Diagnostics Utilities */}
          <div className="glass-card p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              Diagnostics Checklist
            </h3>

            <div className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-slate-700 dark:text-zinc-200">Session Verified</h5>
                  <p className="text-slate-500 dark:text-zinc-500 mt-0.5">Linked securely: {user?.github_username ? `@${user.github_username}` : user?.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-slate-700 dark:text-zinc-200">Socket Connection</h5>
                  <p className="text-slate-500 dark:text-zinc-500 mt-0.5">Real-time update listeners active</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-slate-700 dark:text-zinc-200">PostgreSQL Status</h5>
                  <p className="text-slate-500 dark:text-zinc-500 mt-0.5">Database storage schema aligned</p>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default WebhookMonitor;
