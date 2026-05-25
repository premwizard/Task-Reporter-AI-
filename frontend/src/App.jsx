import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { 
  Activity, Users, FolderGit2, Calendar, Download, 
  Moon, Sun, LayoutDashboard, LogOut, FileText,
  Github, Edit3, Trash2, X, RefreshCw, Search,
  Sparkles, Copy, CheckCircle, ChevronDown, Bot,
  LayoutGrid, List, MessageSquare, Bell, UserCircle, Menu,
  FileSpreadsheet, Link2, Key, GitPullRequest
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import api from './services/api';
import { getBackendBaseUrl } from './lib/api';
import toast, { Toaster } from 'react-hot-toast';
import DiagnosticPanel from './components/DiagnosticPanel';

// STEP 6 & 21: Lazy load pages with graceful suspense fallbacks
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const ConnectRepos = React.lazy(() => import('./pages/ConnectRepos'));
const WhatsAppSetup = React.lazy(() => import('./pages/WhatsAppSetup'));
const AIReports = React.lazy(() => import('./pages/AIReports'));
const WebhookMonitor = React.lazy(() => import('./pages/WebhookMonitor'));
const OAuthSuccess = React.lazy(() => import('./pages/OAuthSuccess'));
const PullRequests = React.lazy(() => import('./pages/PullRequests'));
const AIStandups = React.lazy(() => import('./pages/AIStandups'));
const InstallSuccess = React.lazy(() => import('./pages/InstallSuccess'));

const SOCKET_URL = getBackendBaseUrl();


// ── STEP 21: ERROR BOUNDARY IMPLEMENTATION ────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught crash]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-2xl mb-6">
            <Bot className="w-8 h-8 animate-bounce" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-zinc-400 max-w-md mb-6 text-sm">
            {this.state.error?.message || 'An unexpected rendering error occurred. Please refresh or try again.'}
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Refresh Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── STEP 7: MEMOIZED COMPONENTS ───────────────────────────────────────

const SourceBadge = React.memo(({ source }) => {
  const styles = {
    github: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    manual: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  };
  const Icons = {
    github: <Github className="w-3.5 h-3.5" />,
    manual: <FileText className="w-3.5 h-3.5" />
  };
  return (
    <span className={`badge-premium flex items-center gap-1.5 w-fit ${styles[source] || styles.manual}`}>
      {Icons[source] || Icons.manual} {source}
    </span>
  );
});

SourceBadge.displayName = 'SourceBadge';

const ActivitySkeleton = () => (
  <div className="glass-card p-5 animate-shimmer flex flex-col space-y-4">
    <div className="flex justify-between">
      <div className="h-6 w-24 bg-slate-200 dark:bg-zinc-800 rounded"></div>
      <div className="h-5 w-32 bg-slate-200 dark:bg-zinc-800 rounded"></div>
    </div>
    <div className="space-y-2">
      <div className="h-4 w-full bg-slate-200 dark:bg-zinc-800 rounded"></div>
      <div className="h-4 w-5/6 bg-slate-200 dark:bg-zinc-800 rounded"></div>
    </div>
    <div className="flex gap-3 pt-2">
      <div className="h-8 w-20 bg-slate-200 dark:bg-zinc-800 rounded"></div>
      <div className="h-8 w-24 bg-slate-200 dark:bg-zinc-800 rounded"></div>
    </div>
  </div>
);

const StatCard = React.memo(({ title, value, icon: Icon, trend, colorClass }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="glass-card p-5 flex items-center gap-4 relative overflow-hidden group"
  >
    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colorClass} opacity-10 rounded-full blur-3xl -mr-10 -mt-10 transition-opacity group-hover:opacity-20`}></div>
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-lg shadow-violet-500/10`}>
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">{title}</p>
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{value}</h4>
        {trend && <span className="text-xs font-medium text-emerald-500">{trend}</span>}
      </div>
    </div>
  </motion.div>
));

StatCard.displayName = 'StatCard';

// ── Modals ────────────────────────────────────────────────────────────

const EditModal = ({ activity, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    activity: activity.activity,
    repository_name: activity.repository_name || '',
    employee_name: activity.employee_name,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    toast.loading('Saving changes...');
    try {
      await api.put(`/activities/${activity.id}`, formData);
      toast.dismiss();
      toast.success('Activity updated successfully!');
      onSaved();
    } catch (err) {
      toast.dismiss();
      toast.error('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-card w-full max-w-lg p-6 relative overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Modify Logged Activity</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Developer Name</label>
            <input 
              type="text" 
              value={formData.employee_name} 
              onChange={e => setFormData({ ...formData, employee_name: e.target.value })} 
              className="input-premium mt-1.5 w-full" 
              required 
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Repository (Optional)</label>
            <input 
              type="text" 
              value={formData.repository_name} 
              onChange={e => setFormData({ ...formData, repository_name: e.target.value })} 
              className="input-premium mt-1.5 w-full" 
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Activity Description</label>
            <textarea 
              rows={4}
              value={formData.activity} 
              onChange={e => setFormData({ ...formData, activity: e.target.value })} 
              className="input-premium mt-1.5 w-full resize-none" 
              required 
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Apply Changes'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// ── STEP 7: MEMOIZED ROW + CARD FEED COMPONENTS ──────────────────────

const ActivityCard = React.memo(({ act, onEdit, onDelete }) => {
  const { user } = useAuth();
  const [aiSummary, setAiSummary] = useState(act.ai_summary || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!act.ai_summary);

  const handleExplain = async () => {
    if (aiSummary) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true); 
    setExpanded(true);
    try {
      const data = await api.post('/ai-summary/activity', { 
        activity_id: act.id, 
        activity: act.activity, 
        repository_name: act.repository_name, 
        employee_name: act.employee_name 
      });
      setAiSummary(data.summary);
    } catch (err) {
      toast.error('AI synthesis failed: ' + err.message);
      setExpanded(false);
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      className={`glass-card p-6 flex flex-col justify-between border-slate-200/60 dark:border-zinc-800/60 ${expanded ? 'shadow-lg shadow-violet-500/[0.02]' : ''}`}
    >
      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800/80 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-zinc-300 overflow-hidden border border-slate-200/50 dark:border-zinc-700/50">
              {user?.github_avatar && act.employee_name === user.github_username ? (
                <img src={user.github_avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                act.employee_name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h4 className="font-bold text-slate-850 dark:text-zinc-100 text-[15px]">{act.employee_name}</h4>
              <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 mt-0.5">
                {new Date(act.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(act.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <SourceBadge source={act.source} />
        </div>

        <p className="text-[15px] font-medium text-slate-800 dark:text-zinc-200 leading-relaxed mb-4">
          {act.activity}
        </p>

        <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="bg-violet-50/50 dark:bg-violet-500/5 rounded-xl border border-violet-100 dark:border-violet-500/20">
                <div className="px-4 py-2 bg-violet-100/50 dark:bg-violet-500/10 border-b border-violet-100 dark:border-violet-500/20 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">AI Insight</span>
                </div>
                <div className="p-4">
                  {loading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 w-3/4 bg-violet-200 dark:bg-violet-900/50 rounded"></div>
                      <div className="h-3 w-1/2 bg-violet-200 dark:bg-violet-900/50 rounded"></div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 leading-relaxed">{aiSummary}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-zinc-800/50 mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {act.repository_name && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800">
              <FolderGit2 className="w-3.5 h-3.5" /> {act.repository_name}
            </div>
          )}
          {act.commit_hash && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800">
              <Github className="w-3.5 h-3.5" /> {act.commit_hash.substring(0, 7)}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExplain}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              aiSummary && expanded 
                ? 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30' 
                : 'bg-white text-slate-600 hover:text-violet-600 hover:bg-violet-50 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:text-violet-400 dark:hover:bg-zinc-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiSummary ? (expanded ? 'Hide Insight' : 'Show Insight') : 'Explain'}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1"></div>
          <button onClick={() => onEdit(act)} className="btn-icon" title="Edit"><Edit3 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(act.id)} className="btn-icon hover:text-red-500 dark:hover:text-red-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </motion.div>
  );
});

ActivityCard.displayName = 'ActivityCard';

const ActivityTableRow = React.memo(({ act, onEdit, onDelete }) => {
  const { user } = useAuth();
  const [aiSummary, setAiSummary] = useState(act.ai_summary || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!act.ai_summary);

  const handleExplain = async () => {
    if (aiSummary) return setExpanded(!expanded);
    setLoading(true); setExpanded(true);
    try {
      const data = await api.post('/ai-summary/activity', { 
        activity_id: act.id, 
        activity: act.activity, 
        repository_name: act.repository_name, 
        employee_name: act.employee_name 
      });
      setAiSummary(data.summary);
    } catch (err) {
      toast.error('AI translation failed: ' + err.message);
      setExpanded(false);
    } finally { setLoading(false); }
  };

  return (
    <>
      <tr className={`border-b border-slate-100 dark:border-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors ${expanded ? 'bg-slate-50 dark:bg-zinc-800/30' : ''}`}>
        <td className="p-4 align-top">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-zinc-300 overflow-hidden">
              {user?.github_avatar && act.employee_name === user.github_username ? (
                <img src={user.github_avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                act.employee_name.charAt(0).toUpperCase()
              )}
            </div>
            <span className="font-semibold text-slate-800 dark:text-zinc-200">{act.employee_name}</span>
          </div>
        </td>
        <td className="p-4 align-top">
          {act.repository_name ? (
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-400">
              <FolderGit2 className="w-4 h-4 opacity-50" /> {act.repository_name}
            </div>
          ) : <span className="text-slate-400 dark:text-zinc-600">—</span>}
        </td>
        <td className="p-4 align-top max-w-sm">
          <p className="text-sm text-slate-700 dark:text-zinc-300 font-medium line-clamp-2" title={act.activity}>{act.activity}</p>
          {act.commit_hash && <div className="mt-1 text-xs font-mono text-slate-400">{act.commit_hash.substring(0, 7)}</div>}
        </td>
        <td className="p-4 align-top whitespace-nowrap"><SourceBadge source={act.source} /></td>
        <td className="p-4 align-top whitespace-nowrap text-sm text-slate-500 dark:text-zinc-400">
          {new Date(act.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="p-4 align-top whitespace-nowrap text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={handleExplain} className="btn-icon text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10" title="AI Insight">
              <Sparkles className="w-4 h-4" />
            </button>
            <button onClick={() => onEdit(act)} className="btn-icon hover:text-blue-500 dark:hover:text-blue-400"><Edit3 className="w-4 h-4" /></button>
            <button onClick={() => onDelete(act.id)} className="btn-icon hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr className="bg-violet-50/30 dark:bg-violet-500/5 border-b border-slate-100 dark:border-zinc-800/50">
            <td colSpan={6} className="p-0">
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-6 py-4 flex items-start gap-3">
                  <Bot className="w-5 h-5 text-violet-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-1">AI Insight</h4>
                    {loading ? (
                       <div className="h-4 w-3/4 bg-violet-200 dark:bg-violet-900/50 rounded animate-pulse"></div>
                    ) : (
                      <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">{aiSummary}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
});

ActivityTableRow.displayName = 'ActivityTableRow';

// ── Protected Dashboard Shell ─────────────────────────────────────────

function MainAppContent() {
  const { user, logout } = useAuth();
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [exportOpen, setExportOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'card');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [activities, setActivities] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedUser, setSelectedUser] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [isLive, setIsLive] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  
  // AI Global Summary
  const [aiSummary, setAiSummary] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [copied, setCopied] = useState(false);

  // STEP 11: PAGINATION STATE
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // Theme effect
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // View mode persist
  useEffect(() => localStorage.setItem('viewMode', viewMode), [viewMode]);

  // Socket setup (Secure User-Isolated updates - polling optimized out in Step 8)
  useEffect(() => {
    if (!user) return;
    
    console.log('[Socket] Initializing connection to', SOCKET_URL);
    const socket = io(SOCKET_URL);
    
    socket.on('connect', () => console.log('[Socket] Connection success'));
    
    socket.on('new_activity', (activity) => {
      if (user.role === 'admin' || activity.user_id === user.id) {
        setActivities(prev => [activity, ...prev]);
        setIsLive(true);
        toast.success(`New activity from ${activity.employee_name}!`, { icon: '💻', duration: 3000 });
        setTimeout(() => setIsLive(false), 2000);
      }
    });

    return () => socket.disconnect();
  }, [user]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedUser, dateFilter]);

  // Fetch data (Step 11 - Paginated and Optimized database requests)
  const fetchData = async () => {
    setLoading(true); 
    setError(null);
    try {
      const params = {
        page,
        limit: 20
      };
      if (selectedUser) params.employee = selectedUser;
      if (dateFilter && dateFilter !== 'all') params.filter = dateFilter;
      
      const response = await api.get('/activities', { params });
      
      // Support backward compatibility with non-paginated arrays
      if (response && response.activities) {
        setActivities(response.activities);
        setPagination(response.pagination);
      } else {
        setActivities(response || []);
        setPagination({
          page: 1,
          limit: response?.length || 20,
          total: response?.length || 0
        });
      }
      
      if (user?.role === 'admin') {
        const uData = await api.get('/activities/users');
        setUsersList(uData);
      }
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    if (user) fetchData(); 
  }, [selectedUser, dateFilter, user, page]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this activity permanently?')) return;
    try {
      await api.delete(`/activities/${id}`);
      setActivities(prev => prev.filter(a => a.id !== id));
      toast.success('Activity deleted.');
    } catch (err) { 
      toast.error('Delete failed: ' + err.message); 
    }
  }, []);

  const handleExport = async (type) => {
    setExportOpen(false);
    const toastId = toast.loading('Generating engineering report...');
    try {
      const params = {};
      if (selectedUser) params.employee = selectedUser;
      if (dateFilter && dateFilter !== 'all') params.filter = dateFilter;
      
      const token = localStorage.getItem('token');
      const backendUrl = `${getBackendBaseUrl()}/api/export/${type}`;
      
      const res = await axios.get(backendUrl, {
        params,
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined
        },
        responseType: 'blob'
      });
      
      const mimes = {
        csv: 'text/csv',
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf'
      };
      
      const extension = type === 'excel' ? 'xlsx' : type;
      const blob = new Blob([res.data], { type: mimes[type] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `gitintel_report_${selectedUser || 'all'}_${dateFilter}.${extension}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss(toastId);
      toast.success('Report downloaded successfully!');
    } catch (err) {
      toast.dismiss(toastId);
      console.error('Export failed:', err);
      toast.error('Failed to export report: ' + err.message);
    }
  };

  const handleGenerateGlobalSummary = async () => {
    setGeneratingSummary(true); 
    setAiSummary(null); 
    setCopied(false);
    try {
      const data = await api.post('/ai-summary', { 
        employee_name: selectedUser || null, 
        type: dateFilter !== 'all' ? dateFilter : 'daily' 
      });
      setAiSummary(data);
      toast.success('AI executive summary ready!');
    } catch (err) { 
      toast.error('Synthesis failed: ' + err.message); 
    } finally { 
      setGeneratingSummary(false); 
    }
  };

  // Metrics (Step 7: useMemo optimizes metrics calculation)
  const metrics = useMemo(() => {
    const today = new Date().setHours(0,0,0,0);
    return {
      total: pagination?.total || activities.length,
      today: activities.filter(a => new Date(a.created_at).setHours(0,0,0,0) === today).length,
      users: new Set(activities.map(a => a.employee_name)).size || 1,
      aiCount: activities.filter(a => a.ai_summary).length
    };
  }, [activities, pagination]);

  const SidebarItem = useCallback(({ icon: Icon, label, id }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold ${
        activeTab === id 
          ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' 
          : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/50 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!isSidebarCollapsed && <span>{label}</span>}
    </button>
  ), [activeTab, isSidebarCollapsed]);

  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden font-sans">
      
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} hidden md:flex flex-col border-r border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl transition-all duration-300 z-20`}>
        <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-zinc-800 justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            {!isSidebarCollapsed && <span className="font-bold text-lg text-slate-900 dark:text-white whitespace-nowrap tracking-tight">GitIntel</span>}
          </div>
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="btn-icon">
            <Menu className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1.5">
          <SidebarItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem id="pull-requests" icon={GitPullRequest} label="Pull Requests" />
          <SidebarItem id="ai-standups" icon={Bot} label="AI Standups" />
          <SidebarItem id="connect-repos" icon={Link2} label="Connect Repos" />
          <SidebarItem id="analytics" icon={Sparkles} label="AI Insights" />
          <SidebarItem id="webhook-debug" icon={Bell} label="Webhook Monitor" />
        </div>

        {/* User profile details */}
        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex flex-col gap-3">
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            {user?.github_avatar ? (
              <img 
                src={user.github_avatar} 
                alt="Avatar" 
                className="w-9 h-9 rounded-full object-cover border border-violet-500/30 shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center border border-slate-300 dark:border-zinc-700">
                <UserCircle className="w-6 h-6 text-slate-500 dark:text-zinc-400" />
              </div>
            )}
            {!isSidebarCollapsed && (
              <div className="overflow-hidden flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {user?.github_username ? `@${user.github_username}` : `${user?.first_name} ${user?.last_name}`}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 rounded`}>
                    {user?.role}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {!isSidebarCollapsed && (
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-rose-500/20 text-rose-500 bg-rose-500/[0.02] hover:bg-rose-500/10 font-semibold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="hidden md:flex items-center relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 text-slate-400 dark:text-zinc-500" />
              <input type="text" placeholder="Search activities, repositories..." className="input-premium pl-9 bg-slate-100/50 dark:bg-zinc-900/50 border-transparent focus:bg-white" />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 mr-2">
              <div className="relative flex h-2 w-2">
                {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-[11px] font-bold tracking-wide uppercase text-slate-600 dark:text-zinc-400">Live</span>
            </div>
            
            <button className="btn-icon relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-zinc-950"></span>
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="btn-icon">
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Scrollable Content (Step 6: Suspense boundary ensures page loading split) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <React.Suspense fallback={
            <div className="min-h-[400px] flex flex-col items-center justify-center animate-pulse gap-3">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-xs font-semibold text-zinc-400">Loading module resources...</p>
            </div>
          }>
            {activeTab === 'whatsapp' && <WhatsAppSetup />}
            {activeTab === 'analytics' && <AIReports />}
            {activeTab === 'connect-repos' && <ConnectRepos />}
            {activeTab === 'webhook-debug' && <WebhookMonitor />}
            {activeTab === 'pull-requests' && <PullRequests />}
            {activeTab === 'ai-standups' && <AIStandups />}
            {activeTab === 'dashboard' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-6">
                
                {/* Header section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                  <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Intelligence Dashboard</h1>
                    <p className="text-slate-500 dark:text-zinc-400 mt-1">Real-time overview of engineering activity and AI insights.</p>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    {/* Export Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setExportOpen(!exportOpen)} 
                        className="btn-secondary pr-3"
                      >
                        <Download className="w-4 h-4" /> Export
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {exportOpen && (
                          <>
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setExportOpen(false)}
                            ></div>
                            
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute right-0 top-full mt-2 w-48 glass-card border-slate-200 dark:border-zinc-800 shadow-xl z-50 overflow-hidden"
                            >
                              <div className="py-1">
                                <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Download Format</p>
                                </div>
                                <button 
                                  onClick={() => handleExport('csv')}
                                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/80 hover:text-primary transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export CSV
                                </button>
                                <button 
                                  onClick={() => handleExport('excel')}
                                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/80 hover:text-primary transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Excel
                                </button>
                                <button 
                                  onClick={() => handleExport('pdf')}
                                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/80 hover:text-primary transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText className="w-4 h-4 text-rose-500" /> Export PDF
                                </button>
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <button onClick={handleGenerateGlobalSummary} disabled={generatingSummary} className="btn-primary">
                      <Sparkles className="w-4 h-4" /> {generatingSummary ? 'Synthesizing...' : 'Generate Insight'}
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard title="Total Activities" value={metrics.total} icon={Activity} colorClass="from-blue-500 to-cyan-500" />
                  <StatCard title="Today's Commits" value={metrics.today} icon={Calendar} trend="+12% from yesterday" colorClass="from-emerald-500 to-teal-500" />
                  <StatCard title="Active Developers" value={metrics.users} icon={Users} colorClass="from-orange-500 to-amber-500" />
                  <StatCard title="AI Explanations" value={metrics.aiCount} icon={Bot} colorClass="from-violet-500 to-fuchsia-500" />
                </div>

                {/* Global AI Summary Display */}
                <AnimatePresence>
                  {aiSummary && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="glass-card p-6 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border border-violet-200 dark:border-violet-500/20 relative mt-2">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-fuchsia-500"></div>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">Executive AI Summary</h3>
                              <p className="text-xs text-slate-500 dark:text-zinc-400">Synthesized using Groq Llama 3</p>
                            </div>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(aiSummary.summary); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="btn-icon text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20">
                            {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="pl-14 text-slate-700 dark:text-zinc-200 text-sm leading-relaxed font-semibold">
                          {aiSummary.summary}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Filters & Toggles */}
                <div className="glass-panel p-2 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-10">
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {user?.role === 'admin' ? (
                      <>
                        <div className="relative">
                          <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="input-premium pl-9 py-2 bg-transparent border-none w-[180px] cursor-pointer appearance-none">
                            <option value="">All Developers</option>
                            {usersList.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800"></div>
                      </>
                    ) : null}
                    
                    <div className="relative">
                      <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input-premium pl-9 py-2 bg-transparent border-none w-[140px] cursor-pointer appearance-none">
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7days">Last 7 Days</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center bg-slate-100 dark:bg-zinc-900/80 p-1 rounded-xl border border-slate-200 dark:border-zinc-800/80">
                    <button onClick={() => setViewMode('card')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'card' ? 'bg-white dark:bg-zinc-800 shadow-sm text-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'}`}>
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white dark:bg-zinc-800 shadow-sm text-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'}`}>
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* STEP 9 & 20: Feed Container with graceful empty states, retries, and loaders */}
                <div className="min-h-[400px]">
                  {loading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => <ActivitySkeleton key={i} />)}
                    </div>
                  ) : error ? (
                    <div className="glass-card p-12 text-center border-rose-500/20 bg-rose-500/[0.01]">
                      <Bot className="w-12 h-12 text-rose-500 mx-auto mb-4 animate-bounce" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Failed to Sync Feed</h3>
                      <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-md mx-auto mb-6">{error}</p>
                      <button onClick={fetchData} className="btn-primary">
                        Retry Fetch
                      </button>
                    </div>
                  ) : activities.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-16 text-center flex flex-col items-center justify-center">
                      <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-zinc-800/50 flex items-center justify-center text-slate-400 dark:text-zinc-500 mb-6 rotate-3">
                        <Search className="w-10 h-10" />
                      </div>
                      {/* STEP 20: SPECIFIC EMPTY STATE TEXT */}
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No activity yet</h3>
                      <p className="text-slate-500 dark:text-zinc-400 max-w-md mb-6">
                        No activity yet. Push commits to connected repositories.
                      </p>
                      <button onClick={() => { setSelectedUser(''); setDateFilter('all'); }} className="btn-secondary">
                        Reset Filters
                      </button>
                    </motion.div>
                  ) : viewMode === 'table' ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden border-slate-200/60 dark:border-zinc-800/60">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50/50 dark:bg-zinc-900/50 backdrop-blur-sm border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Employee</th>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Repository</th>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Activity</th>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Source</th>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Timestamp</th>
                              <th className="px-4 py-3.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                            {activities.map(act => (
                              <ActivityTableRow 
                                key={act.id} 
                                act={act} 
                                onEdit={setEditTarget} 
                                onDelete={handleDelete} 
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <AnimatePresence>
                        {activities.map(act => (
                          <ActivityCard 
                            key={act.id} 
                            act={act} 
                            onEdit={setEditTarget} 
                            onDelete={handleDelete} 
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* STEP 11: PAGINATION BOTTOM CONTROLS */}
                  {pagination && pagination.total > pagination.limit && (
                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-zinc-800 pt-6 mt-6">
                      <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                        Showing <span className="text-slate-900 dark:text-white">{((page - 1) * pagination.limit) + 1}</span> to <span className="text-slate-900 dark:text-white">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="text-slate-900 dark:text-white">{pagination.total}</span> activities
                      </p>
                      <div className="flex gap-2">
                        <button 
                          disabled={page <= 1} 
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          className="btn-secondary py-1.5 px-3 disabled:opacity-50 text-xs font-bold"
                        >
                          Previous
                        </button>
                        <button 
                          disabled={page >= Math.ceil(pagination.total / pagination.limit)} 
                          onClick={() => setPage(p => p + 1)}
                          className="btn-secondary py-1.5 px-3 disabled:opacity-50 text-xs font-bold"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </motion.div>
            )}
          </React.Suspense>
        </div>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {editTarget && <EditModal activity={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); fetchData(); }} />}
      </AnimatePresence>

      {/* Diagnostics Monitor Panel */}
      <DiagnosticPanel />
    </div>
  );
}

// ── Routing Manager ───────────────────────────────────────────────────

function AppRouting({ currentPath, navigate }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (currentPath.startsWith('/oauth-success') || currentPath.startsWith('/install-success')) return;

    if (!loading && !user && currentPath !== '/login' && currentPath !== '/register') {
      navigate('/login');
    }
    if (!loading && user && (currentPath === '/login' || currentPath === '/register')) {
      navigate('/');
    }
  }, [user, loading, currentPath]);

  if (currentPath.startsWith('/oauth-success')) {
    return (
      <React.Suspense fallback={
        <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      }>
        <OAuthSuccess navigate={navigate} />
      </React.Suspense>
    );
  }

  if (currentPath.startsWith('/install-success')) {
    return (
      <React.Suspense fallback={
        <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      }>
        <InstallSuccess navigate={navigate} />
      </React.Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <RefreshCw className="w-10 h-10 text-violet-500 animate-spin" />
          <p className="text-zinc-400 font-bold text-xs tracking-wider uppercase">Verifying session context...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (currentPath === '/register') {
      return (
        <React.Suspense fallback={
          <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        }>
          <Register navigate={navigate} />
        </React.Suspense>
      );
    }
    return (
      <React.Suspense fallback={
        <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      }>
        <Login navigate={navigate} />
      </React.Suspense>
    );
  }

  return <MainAppContent />;
}

// ── Root Wrapper with Error Boundary and Context (Step 21) ────────────

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Toaster position="top-right" reverseOrder={false} />
        <AppRouting currentPath={currentPath} navigate={navigate} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
