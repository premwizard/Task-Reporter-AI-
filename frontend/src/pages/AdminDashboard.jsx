import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Users, 
  Clock, 
  CheckCircle, 
  FileSpreadsheet, 
  Search, 
  Calendar, 
  Filter, 
  Download,
  Loader2,
  Bell,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  Bookmark
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // Filter & tasks state
  const [tasks, setTasks] = useState([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Active filters
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.get('/admin/stats');
      setStats(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load analytical metrics.');
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchFiltersData = async () => {
    try {
      const emps = await api.get('/admin/employees');
      const depts = await api.get('/departments');
      setEmployees(emps);
      setDepartments(depts);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFilteredTasks = async () => {
    setLoadingTasks(true);
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      let endpoint = `/admin/tasks?limit=${itemsPerPage}&offset=${offset}`;
      
      if (employeeFilter) endpoint += `&employee_id=${employeeFilter}`;
      if (departmentFilter) endpoint += `&department_id=${departmentFilter}`;
      if (dateFilter) endpoint += `&date=${dateFilter}`;
      if (statusFilter) endpoint += `&status=${statusFilter}`;
      if (searchQuery) endpoint += `&search=${encodeURIComponent(searchQuery)}`;

      const data = await api.get(endpoint);
      setTasks(data.tasks);
      setTotalTasks(data.total);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch task registers.');
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchFiltersData();
  }, []);

  useEffect(() => {
    fetchFilteredTasks();
  }, [currentPage, employeeFilter, departmentFilter, dateFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchFilteredTasks();
  };

  const resetFilters = () => {
    setEmployeeFilter('');
    setDepartmentFilter('');
    setDateFilter('');
    setStatusFilter('');
    setSearchQuery('');
    setCurrentPage(1);
    toast.success('Filters cleared.');
  };

  // EXPORT TO EXCEL: Reads all tasks matching active filters (by requesting a large limit)
  const exportToExcel = async () => {
    const exportToast = toast.loading('Preparing spreadsheet report...');
    try {
      // Get all tasks matching filters (no pagination limits)
      let endpoint = `/admin/tasks?limit=10000&offset=0`;
      if (employeeFilter) endpoint += `&employee_id=${employeeFilter}`;
      if (departmentFilter) endpoint += `&department_id=${departmentFilter}`;
      if (dateFilter) endpoint += `&date=${dateFilter}`;
      if (statusFilter) endpoint += `&status=${statusFilter}`;
      if (searchQuery) endpoint += `&search=${encodeURIComponent(searchQuery)}`;

      const res = await api.get(endpoint);
      const allTasks = res.tasks;

      if (allTasks.length === 0) {
        toast.error('No tasks logged to export.', { id: exportToast });
        return;
      }

      // Format data for sheet structure
      const formattedData = allTasks.map(t => ({
        'Task Date': t.task_date,
        'Employee Name': `${t.first_name} ${t.last_name}`,
        'Email Address': t.email,
        'Department': t.department_name || 'N/A',
        'Task Title': t.title,
        'Task Description': t.description || '',
        'Hours Worked': parseFloat(t.hours_worked),
        'Status': t.status.toUpperCase(),
        'Submission Timestamp': new Date(t.created_at).toLocaleString()
      }));

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Tasks Log');

      // Autofit columns logic
      const colWidths = Object.keys(formattedData[0] || {}).map(key => ({
        wch: Math.max(key.length, ...formattedData.map(d => (d[key] || '').toString().length)) + 3
      }));
      ws['!cols'] = colWidths;

      // Write excel file
      XLSX.writeFile(wb, `TaskUpdater_DailyReport_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel Sheet downloaded successfully!', { id: exportToast });
    } catch (err) {
      console.error(err);
      toast.error('Excel Export failed.', { id: exportToast });
    }
  };

  // Setup Charts Data
  const doughnutChartData = stats ? {
    labels: ['Completed', 'In-Progress', 'Pending'],
    datasets: [{
      data: [
        stats.summary.completedTasks,
        stats.summary.inProgressTasks,
        stats.summary.pendingTasks
      ],
      backgroundColor: [
        'rgba(34, 197, 94, 0.7)',  // Green-500
        'rgba(234, 179, 8, 0.7)',   // Yellow-500
        'rgba(239, 68, 68, 0.7)'    // Red-500
      ],
      borderColor: [
        'rgb(34, 197, 94)',
        'rgb(234, 179, 8)',
        'rgb(239, 68, 68)'
      ],
      borderWidth: 1.5,
    }]
  } : null;

  const barChartData = stats ? {
    labels: stats.departmentStats.map(d => d.name),
    datasets: [{
      label: 'Hours Logged by Department',
      data: stats.departmentStats.map(d => parseFloat(d.hours_worked)),
      backgroundColor: 'rgba(139, 92, 246, 0.6)', // Violet-500
      borderColor: 'rgb(139, 92, 246)',
      borderWidth: 1.5,
      borderRadius: 6
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#e4e4e7', // Zinc-200
          font: { family: 'Inter', size: 11 }
        }
      }
    }
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: '#a1a1aa' },
        grid: { color: '#27272a' }
      },
      y: {
        ticks: { color: '#a1a1aa' },
        grid: { color: '#27272a' }
      }
    }
  };

  const totalPages = Math.ceil(totalTasks / itemsPerPage);

  return (
    <div className="flex-1 p-8 overflow-y-auto h-screen animate-fade-in">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white font-sans">
            Admin <span className="gradient-text font-bold">Analytics Panel</span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Monitor real-time company performance metrics, review logged tasks, and export records to Excel.
          </p>
        </div>

        <button
          onClick={exportToExcel}
          disabled={tasks.length === 0}
          className="btn-primary bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-green-500/10 hover:shadow-green-500/20 text-white font-semibold flex items-center gap-2"
        >
          <FileSpreadsheet className="w-5 h-5" />
          Export log to Excel
        </button>
      </div>

      {/* Loading Block for Stats */}
      {loadingStats ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-zinc-500 gap-3 mb-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span>Crunching analytical metrics...</span>
        </div>
      ) : stats ? (
        <>
          {/* KPI Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="glass-card p-6 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Active Employees</span>
                <span className="text-2xl font-bold text-white">{stats.summary.totalEmployees}</span>
              </div>
              <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="glass-card p-6 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Combined Hours Logged</span>
                <span className="text-2xl font-bold text-white">{stats.summary.totalHours.toFixed(1)} hrs</span>
              </div>
              <div className="w-12 h-12 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="glass-card p-6 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Completion Rate</span>
                <span className="text-2xl font-bold text-green-400">{stats.summary.taskCompletionRate}%</span>
              </div>
              <div className="w-12 h-12 bg-green-600/10 border border-green-500/20 text-green-400 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>

            <div className="glass-card p-6 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block mb-1">Total Logs Filed</span>
                <span className="text-2xl font-bold text-white">{stats.summary.totalTasks}</span>
              </div>
              <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="glass-card p-6 flex flex-col h-96">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                Task Status Breakdown
              </h3>
              <div className="flex-1 relative">
                {doughnutChartData && <Doughnut data={doughnutChartData} options={chartOptions} />}
              </div>
            </div>

            <div className="glass-card p-6 flex flex-col h-96">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-light"></span>
                Hours Filed by Department
              </h3>
              <div className="flex-1 relative">
                {barChartData && <Bar data={barChartData} options={barChartOptions} />}
              </div>
            </div>
          </div>

          {/* System Feeds Grid: Activity Feed & Active Today */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            
            {/* Left 2 Columns: Today's Active Submissions */}
            <div className="lg:col-span-2 glass-card p-6">
              <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Active Task Submissions (Today)
              </h3>
              {stats.todaySubmissions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No employee task reports received yet for today.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2">Employee</th>
                        <th className="pb-3">Department</th>
                        <th className="pb-3 text-center">Tasks Filed</th>
                        <th className="pb-3 text-right pr-2">Hours Worked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-sm">
                      {stats.todaySubmissions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-zinc-800/20 transition-colors">
                          <td className="py-3.5 pl-2 font-medium text-white">
                            {sub.first_name} {sub.last_name}
                          </td>
                          <td className="py-3.5 text-zinc-400">
                            {sub.department_name || 'General'}
                          </td>
                          <td className="py-3.5 text-center font-bold text-zinc-300">
                            {sub.task_count}
                          </td>
                          <td className="py-3.5 text-right pr-2 font-extrabold text-primary-light">
                            {parseFloat(sub.hours_worked).toFixed(1)} hrs
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right 1 Column: System Events Feed */}
            <div className="lg:col-span-1 glass-card p-6 flex flex-col h-[340px]">
              <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2 shrink-0">
                <Bell className="w-5 h-5 text-yellow-400" />
                Notifications Log
              </h3>
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3.5">
                {stats.notifications.length === 0 ? (
                  <div className="text-center text-zinc-600 text-xs py-12">
                    No recent events logged.
                  </div>
                ) : (
                  stats.notifications.map((notif) => (
                    <div key={notif.id} className="text-xs border-l-2 border-primary/40 pl-3 py-1 bg-zinc-900/40 rounded-r-xl pr-2 border-zinc-800">
                      <p className="text-zinc-300 font-medium leading-relaxed">{notif.message}</p>
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </>
      ) : null}

      {/* Dynamic Task Registry Explorer */}
      <div className="glass-card p-6 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            Company Tasks Logs Registry
          </h3>

          <button 
            onClick={resetFilters}
            className="text-xs text-zinc-400 hover:text-white transition-colors underline flex items-center gap-1"
          >
            Clear Filters
          </button>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Employee Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Filter by Employee</label>
            <select
              value={employeeFilter}
              onChange={(e) => { setEmployeeFilter(e.target.value); setCurrentPage(1); }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[38px]"
            >
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Filter by Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[38px]"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Filter by Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[38px]"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[38px]"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In-Progress</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {/* Text Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2.5 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keyword logs (task title, description, or employee names)..."
              className="input-field pl-11 py-2.5 text-sm"
            />
          </div>
          <button type="submit" className="btn-secondary py-2.5 px-5">Search</button>
        </form>

        {/* Tasks Logs Grid */}
        {loadingTasks ? (
          <div className="py-16 flex flex-col items-center justify-center text-zinc-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span>Scanning database records...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            No matching task records found for the active filter set.
          </div>
        ) : (
          <div className="space-y-3.5">
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className="p-5 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:border-zinc-700/60 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-white">
                      {task.first_name} {task.last_name}
                    </span>
                    <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                      {task.department_name || 'N/A'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {task.task_date}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-zinc-200 mb-1">{task.title}</h4>
                  {task.description && (
                    <p className="text-xs text-zinc-500 truncate max-w-xl">{task.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className="text-xs text-zinc-400 font-medium bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    {parseFloat(task.hours_worked).toFixed(1)} hrs
                  </span>
                  
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                    task.status === 'completed' 
                      ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                      : task.status === 'in-progress' 
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' 
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {task.status}
                  </span>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-6 border-t border-zinc-800/80 mt-6 text-sm text-zinc-400">
                <span>Showing page {currentPage} of {totalPages} ({totalTasks} entries)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
