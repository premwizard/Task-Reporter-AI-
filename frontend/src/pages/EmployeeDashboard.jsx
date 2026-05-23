import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Plus, 
  Trash2, 
  Check, 
  Clock, 
  Calendar, 
  Search, 
  Send,
  Loader2,
  FileText,
  AlertTriangle,
  X,
  PlusCircle,
  HelpCircle,
  FolderOpen
} from 'lucide-react';

const EmployeeDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // New task form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newHours, setNewHours] = useState('1');
  const [newStatus, setNewStatus] = useState('completed');
  const [adding, setAdding] = useState(false);

  // Submit report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportPreview, setReportPreview] = useState('');
  const [waSentStatus, setWaSentStatus] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      let endpoint = `/tasks?date=${selectedDate}`;
      if (searchQuery) endpoint += `&search=${encodeURIComponent(searchQuery)}`;
      if (statusFilter) endpoint += `&status=${statusFilter}`;
      
      const data = await api.get(endpoint);
      setTasks(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [selectedDate, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTasks();
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error('Task title is required.');
      return;
    }

    const hrs = parseFloat(newHours);
    if (isNaN(hrs) || hrs < 0) {
      toast.error('Please enter a valid hours worked amount.');
      return;
    }

    setAdding(true);
    try {
      const added = await api.post('/tasks', {
        title: newTitle,
        description: newDesc,
        status: newStatus,
        hours_worked: hrs,
        task_date: selectedDate
      });
      toast.success('Task logged successfully!');
      setNewTitle('');
      setNewDesc('');
      setNewHours('1');
      setShowAddForm(false);
      fetchTasks();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to add task.');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusToggle = async (task) => {
    const nextStatus = task.status === 'completed' 
      ? 'in-progress' 
      : task.status === 'in-progress' 
        ? 'pending' 
        : 'completed';
    
    try {
      await api.put(`/tasks/${task.id}`, { status: nextStatus });
      toast.success(`Task marked as ${nextStatus}`);
      fetchTasks();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update task status.');
    }
  };

  const handleDeleteTask = async (id) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      toast.success('Task deleted successfully.');
      fetchTasks();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete task.');
    }
  };

  const prepareReport = async () => {
    if (tasks.length === 0) {
      toast.error('Please add tasks for this date before submitting a daily report.');
      return;
    }
    
    setSubmittingReport(true);
    try {
      // Dry-run / get preview data
      const res = await api.post('/tasks/submit-report', { task_date: selectedDate });
      setReportPreview(res.report_preview);
      setWaSentStatus({
        sent: res.whatsapp_sent,
        error: res.whatsapp_error
      });
      setShowReportModal(true);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to generate report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const confirmSubmitReport = () => {
    if (waSentStatus?.sent) {
      toast.success('Daily report dispatched via WhatsApp Group successfully!');
    } else {
      toast.error(`Daily report logged in DB, but WhatsApp failed: ${waSentStatus?.error || 'Unknown error'}`);
    }
    setShowReportModal(false);
    fetchTasks();
  };

  // Metrics calculators
  const totalHours = tasks.reduce((sum, t) => sum + parseFloat(t.hours_worked || 0), 0).toFixed(1);
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in-progress').length;

  return (
    <div className="flex-1 p-8 overflow-y-auto h-screen animate-fade-in relative">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white font-sans">
            My Daily <span className="gradient-text font-bold">Task Logs</span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Log your tasks, track hours, and submit beautiful auto-WhatsApp updates for managers.
          </p>
        </div>

        {/* Date Selector and Submit CTA */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-800/80 rounded-xl pl-10 pr-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-40"
            />
          </div>

          <button
            onClick={prepareReport}
            disabled={tasks.length === 0}
            className={`btn-primary shadow-glow hover:shadow-primary/20 flex items-center gap-2 ${tasks.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Send className="w-4 h-4" />
            Submit Daily Report
          </button>
        </div>
      </div>

      {/* KPI Cards row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Total Hours Logged</span>
            <span className="text-2xl font-bold text-white">{totalHours} hrs</span>
          </div>
          <div className="w-12 h-12 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Total Tasks</span>
            <span className="text-2xl font-bold text-white">{tasks.length}</span>
          </div>
          <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Completed</span>
            <span className="text-2xl font-bold text-green-400">{completedCount}</span>
          </div>
          <div className="w-12 h-12 bg-green-600/10 border border-green-500/20 text-green-400 rounded-xl flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">In-Progress</span>
            <span className="text-2xl font-bold text-yellow-400">{inProgressCount}</span>
          </div>
          <div className="w-12 h-12 bg-yellow-600/10 border border-yellow-500/20 text-yellow-400 rounded-xl flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin-slow" />
          </div>
        </div>
      </div>

      {/* Main Grid: Filters + Tasks List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Tasks List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          
          {/* Filters Row */}
          <div className="glass-card p-4 flex flex-col sm:flex-row justify-between gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search task logs..."
                  className="input-field pl-10 py-2 text-sm placeholder-zinc-500"
                />
              </div>
              <button type="submit" className="btn-secondary py-2 text-xs">Find</button>
            </form>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-zinc-300 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In-Progress</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Log List */}
          {loading ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center text-zinc-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span>Fetching logs...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center text-zinc-500 text-center gap-4">
              <FolderOpen className="w-12 h-12 text-zinc-700" />
              <div>
                <h4 className="text-zinc-300 font-semibold text-lg">No tasks logged for this day</h4>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                  Add some tasks using the form on the right to build your daily report deck.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div 
                  key={task.id}
                  className="glass-card p-5 flex items-center justify-between group hover:border-zinc-700/80 transition-all duration-300 animate-slide-up"
                >
                  <div className="flex items-start gap-4">
                    {/* Interactive status badge click to toggle */}
                    <button 
                      onClick={() => handleStatusToggle(task)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors mt-0.5 ${
                        task.status === 'completed' 
                          ? 'bg-green-500/20 border-green-500 text-green-400 hover:bg-green-500/30' 
                          : task.status === 'in-progress'
                            ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
                      }`}
                      title="Click to toggle task status"
                    >
                      {task.status === 'completed' && <Check className="w-3.5 h-3.5" />}
                      {task.status === 'in-progress' && <span className="text-[10px] font-bold">⏳</span>}
                    </button>
                    <div>
                      <h4 className={`text-base font-semibold text-zinc-100 ${task.status === 'completed' ? 'line-through text-zinc-400' : ''}`}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-xs text-zinc-500 mt-1 max-w-lg line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-semibold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {task.status}
                        </span>
                        <span className="text-xs text-zinc-500 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          {parseFloat(task.hours_worked).toFixed(1)} hrs worked
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded-xl transition-all duration-200 opacity-0 group-hover:opacity-100"
                    title="Delete log entry"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Column: Log Task Form */}
        <div className="lg:col-span-1 flex flex-col">
          <div className="glass-card p-6 border-zinc-800/80 sticky top-24">
            <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-primary" />
              Log Task Entry
            </h3>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Set up JWT route controllers"
                  className="input-field text-sm py-2.5"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Task Description (Optional)
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Summarize objectives, challenges, achievements..."
                  rows="3"
                  className="input-field text-sm py-2.5 resize-none"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Hours Worked
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={newHours}
                    onChange={(e) => setNewHours(e.target.value)}
                    className="input-field text-sm py-2.5"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800/80 rounded-xl px-4 py-2.5 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[46px]"
                  >
                    <option value="completed">Completed</option>
                    <option value="in-progress">In-Progress</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={adding}
                className="btn-primary w-full py-3 mt-2 shadow-primary/10 hover:shadow-primary/20"
              >
                {adding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Logging...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Task Log
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* WhatsApp Report Submission Modal Preview */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg p-6 shadow-premium border-zinc-800 animate-slide-up">
            
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800/80 mb-5">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-green-400" />
                WhatsApp Group Dispatch Preview
              </h4>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 text-sm font-mono text-zinc-300 overflow-y-auto max-h-72 mb-5 whitespace-pre-wrap select-all selection:bg-green-500/20 selection:text-green-300">
              {reportPreview}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex items-start gap-3">
              {waSentStatus?.sent ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-zinc-200 text-sm">WhatsApp Delivery Status: READY</h5>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      The WhatsApp client is authenticated and paired! Confirming will broadcast this message to the general manager channel immediately.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-semibold text-zinc-200 text-sm text-yellow-400">WhatsApp Delivery Status: UNPAIRED</h5>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      WhatsApp client is currently offline: <code className="text-red-400/90 text-[10px] bg-red-950/20 px-1 py-0.5 rounded">{waSentStatus?.error || 'unready'}</code>. 
                      Your report will still be saved to the database for administrative review!
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowReportModal(false)}
                className="btn-secondary py-2 px-4"
              >
                Back to Edit
              </button>
              <button 
                onClick={confirmSubmitReport}
                className="btn-primary py-2 px-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/10 hover:shadow-green-500/20 font-bold"
              >
                Confirm & Log Report
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;
