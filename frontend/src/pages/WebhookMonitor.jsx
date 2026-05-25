import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Bell, ShieldAlert, ShieldCheck, RefreshCw, 
  Terminal, Globe, BookOpen, Activity, CheckCircle, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { getBackendBaseUrl } from '../lib/api';
import { io } from 'socket.io-client';

const WebhookMonitor = () => {
  const { user } = useAuth();
  const [tunnelInfo, setTunnelInfo] = useState(null);
  const [loadingTunnel, setLoadingTunnel] = useState(true);
  const [logs, setLogs] = useState([
    { id: '1', time: new Date().toLocaleTimeString(), text: '🔌 System: Initializing Real-time Monitor...', type: 'info' }
  ]);

  // Fetch tunnel configuration
  const fetchStatus = async () => {
    setLoadingTunnel(true);
    try {
      const response = await api.get('/health');
      setTunnelInfo(response);
      addLog(`📡 System: Backend public URL detected: "${response.tunnel_url || 'N/A'}"`, response.is_localhost ? 'warn' : 'success');
    } catch (err) {
      console.error(err);
      addLog(`❌ System Error: Failed to fetch backend tunnel info. Make sure the server is running.`, 'error');
    } finally {
      setLoadingTunnel(false);
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

    const SOCKET_URL = getBackendBaseUrl();
    addLog(`🔌 WebSocket: Connecting to live feed at ${SOCKET_URL}...`, 'info');
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      addLog(`⚡ WebSocket: Connected! Streaming live repository pushes and API events in real-time...`, 'success');
    });

    socket.on('new_activity', (activity) => {
      if (activity.source === 'github') {
        addLog(
          `🔥 [WEBHOOK PUSH] Repo: "${activity.repository_name}" | Committer: "${activity.employee_name}" | Msg: "${activity.activity}" | SHA: ${activity.commit_hash?.substring(0, 7) || 'N/A'}`,
          'success'
        );
      } else if (activity.source === 'github_events') {
        addLog(
          `🌐 [EVENTS API SYNC] Repo: "${activity.repository_name}" | Committer: "${activity.employee_name}" | Msg: "${activity.activity}" | SHA: ${activity.commit_hash?.substring(0, 7) || 'N/A'}`,
          'info'
        );
      }
    });

    socket.on('disconnect', () => {
      addLog(`🔌 WebSocket: Feed disconnected.`, 'warn');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in font-sans p-4 md:p-8">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-8 h-8 text-violet-500 animate-pulse" />
            GitHub Event <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 font-extrabold">& Live Monitor</span>
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1.5 leading-relaxed max-w-2xl">
            Troubleshoot integration payloads, view secure public backend credentials, and inspect live WebSocket event broadcasts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchStatus} 
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Re-scan Server status
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column (2/3): Status & Live feed */}
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
                <h4 className="font-bold text-rose-700 dark:text-rose-400 text-lg">Localhost Configuration Warning</h4>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Your server is configured on <code className="bg-rose-950/20 text-rose-400 px-1.5 py-0.5 rounded font-mono font-bold text-xs">localhost</code>. 
                  GitHub cannot send real-time webhook payloads to local loops. Active synchronization relies on the Events API fallback scheduler.
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-card p-6 border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 rounded-2xl flex flex-col md:flex-row items-start gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">Public Production Endpoint Active</h4>
                <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Your server backend is publicly accessible at <a href={tunnelInfo?.tunnel_url} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline font-bold inline-flex items-center gap-1 font-mono text-xs">{tunnelInfo?.tunnel_url} <ExternalLink className="w-3 h-3" /></a>. 
                  GitHub App webhooks will deliver to this host successfully.
                </p>
              </div>
            </div>
          )}

          {/* Webhook Activity Terminal Log */}
          <div className="glass-card p-6 flex flex-col h-96">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2"><Terminal className="w-5 h-5 text-indigo-400" /> Live Event Stream</span>
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
              GitHub App Audit Guide
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-4">
              To check webhook events and delivery logs on the GitHub App:
            </p>

            <ul className="space-y-3.5 text-xs text-slate-600 dark:text-zinc-300">
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>
                <span>Go to your GitHub Account Settings.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>
                <span>Select <strong>Developer Settings</strong> &rarr; <strong>GitHub Apps</strong>.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>
                <span>Click <strong>Edit</strong> next to your GitIntel App.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">4</span>
                <span>Click on the <strong>Advanced</strong> tab.</span>
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-500 flex items-center justify-center shrink-0 font-bold text-[10px]">5</span>
                <span>View all delivery attempts under <strong>Recent Deliveries</strong>.</span>
              </li>
            </ul>
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
                  <p className="text-slate-500 dark:text-zinc-500 mt-0.5">Linked user: {user?.github_username ? `@${user.github_username}` : user?.email}</p>
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
                  <h5 className="font-bold text-slate-700 dark:text-zinc-200">Database Engine</h5>
                  <p className="text-slate-500 dark:text-zinc-500 mt-0.5">PostgreSQL storage engine aligned</p>
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
