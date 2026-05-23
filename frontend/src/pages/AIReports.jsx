import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Calendar, FileText, RefreshCw, 
  Users, FolderGit2, X, CheckCircle, Copy
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

const ReportCard = ({ report, onRegenerate }) => {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(report.summary);
    setCopied(true);
    toast.success('Report text copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await onRegenerate(report.report_type, report.employee_name, report.repository_name, report.start_date, report.end_date);
    setRegenerating(false);
  };

  const getBadgeColor = (type) => {
    if (type === 'daily') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
    if (type === 'weekly') return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 flex flex-col relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
        <Bot className="w-32 h-32" />
      </div>

      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase border ${getBadgeColor(report.report_type)}`}>
              {report.report_type}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> 
              {new Date(report.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {report.employee_name || 'Team'} Engineering Summary
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="btn-icon bg-slate-50 dark:bg-zinc-800" title="Copy to clipboard">
            {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="bg-slate-50/50 dark:bg-zinc-900/50 p-4 rounded-xl border border-slate-100 dark:border-zinc-800 mb-5 relative z-10 flex-1">
        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {report.summary}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mt-auto border-t border-slate-100 dark:border-zinc-800 pt-4 relative z-10">
        <div className="flex items-center gap-3">
          {report.repository_name && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/50 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-zinc-800">
              <FolderGit2 className="w-3.5 h-3.5" /> {report.repository_name}
            </div>
          )}
          {report.employee_name && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/50 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-zinc-800">
              <Users className="w-3.5 h-3.5" /> {report.employee_name}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRegenerate} 
            disabled={regenerating}
            className="btn-secondary py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default function AIReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedUser, setSelectedUser] = useState('');
  const [users, setUsers] = useState([]);

  // Fetch unique users for dropdown list (Admins only)
  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/activities/users')
        .then(data => setUsers(data))
        .catch(err => console.error('[AIReports] Error fetching users:', err));
    }
  }, [user]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = { type: activeTab };
      if (selectedUser) params.employee_name = selectedUser;
      
      const data = await api.get('/reports', params);
      setReports(data);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchReports();
  }, [activeTab, selectedUser, user]);

  const handleGenerateManual = async (type, employee_name, repository_name, startDate, endDate) => {
    const toastId = toast.loading(`Generating ${type} report...`);
    try {
      await api.post(`/reports/${type}`, { 
        employee_name: employee_name || selectedUser || null, 
        repository_name, 
        startDate, 
        endDate 
      });
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} report ready!`, { id: toastId });
      await fetchReports();
    } catch (err) {
      toast.error(`Generation failed: ${err.message}`, { id: toastId });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in font-sans">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Bot className="w-8 h-8 text-violet-500" />
            AI Intelligence Reports
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-2">
            Automated periodic summaries of engineering activities and work outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleGenerateManual(activeTab)}
            className="btn-primary"
          >
            <Bot className="w-4 h-4" /> Force Generate {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report
          </button>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="glass-panel p-2 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-zinc-900/50 p-1 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
          {['daily', 'weekly', 'monthly'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                activeTab === tab 
                  ? 'bg-white dark:bg-zinc-800 text-violet-600 dark:text-violet-400 shadow-sm' 
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Security Isolation Dropdown: Admins see it, normal users do not */}
        {user?.role === 'admin' ? (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative">
              <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={selectedUser} 
                onChange={e => setSelectedUser(e.target.value)} 
                className="input-premium pl-9 py-2 bg-transparent border-none w-[180px] cursor-pointer appearance-none"
              >
                <option value="">All Developers</option>
                {users.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {/* Reports Grid */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <div key={i} className="glass-card p-6 h-64 animate-shimmer"></div>
            ))}
          </div>
        ) : error ? (
          <div className="glass-card p-12 text-center text-rose-500 border-rose-500/20 bg-rose-500/[0.01]">
            <X className="w-8 h-8 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-16 text-center flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center text-violet-400 dark:text-violet-500 mb-6">
              <FileText className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No {activeTab} reports generated yet</h3>
            <p className="text-slate-500 dark:text-zinc-400 max-w-md mb-6">
              {selectedUser 
                ? `No ${activeTab} intelligence reports found for ${selectedUser}.` 
                : `AI auto-generation jobs haven't fired yet, or no activities existed during the period.`}
            </p>
            <button 
              onClick={() => handleGenerateManual(activeTab)}
              className="btn-primary"
            >
              Force Generate Now
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence>
              {reports.map(report => (
                <ReportCard key={report.id} report={report} onRegenerate={handleGenerateManual} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
