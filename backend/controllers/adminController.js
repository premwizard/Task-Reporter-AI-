import { pool as db } from '../config/db.js';

// GET /api/admin/tasks (Admin Only)
export const getAllTasks = async (req, res) => {
  const { employee_id, department_id, date, status, search, limit = 50, offset = 0 } = req.query;

  try {
    let query = `
      SELECT t.id, t.title, t.description, t.status, t.hours_worked, t.task_date, t.created_at,
             e.id as employee_id, e.first_name, e.last_name, e.email,
             d.id as department_id, d.name as department_name
      FROM tasks t
      JOIN employees e ON t.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    if (employee_id) {
      query += ` AND e.id = $${paramCounter}`;
      params.push(employee_id);
      paramCounter++;
    }

    if (department_id) {
      query += ` AND d.id = $${paramCounter}`;
      params.push(department_id);
      paramCounter++;
    }

    if (date) {
      query += ` AND t.task_date = $${paramCounter}`;
      params.push(date);
      paramCounter++;
    }

    if (status) {
      query += ` AND t.status = $${paramCounter}`;
      params.push(status);
      paramCounter++;
    }

    if (search) {
      query += ` AND (t.title ILIKE $${paramCounter} OR t.description ILIKE $${paramCounter} OR e.first_name ILIKE $${paramCounter} OR e.last_name ILIKE $${paramCounter})`;
      params.push(`%${search}%`);
      paramCounter++;
    }

    query += ` ORDER BY t.task_date DESC, t.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(t.id) as total
      FROM tasks t
      JOIN employees e ON t.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const countParams = [];
    let countCounter = 1;

    if (employee_id) {
      countQuery += ` AND e.id = $${countCounter}`;
      countParams.push(employee_id);
      countCounter++;
    }

    if (department_id) {
      countQuery += ` AND d.id = $${countCounter}`;
      countParams.push(department_id);
      countCounter++;
    }

    if (date) {
      countQuery += ` AND t.task_date = $${countCounter}`;
      countParams.push(date);
      countCounter++;
    }

    if (status) {
      countQuery += ` AND t.status = $${countCounter}`;
      countParams.push(status);
      countCounter++;
    }

    if (search) {
      countQuery += ` AND (t.title ILIKE $${countCounter} OR t.description ILIKE $${countCounter} OR e.first_name ILIKE $${countCounter} OR e.last_name ILIKE $${countCounter})`;
      countParams.push(`%${search}%`);
      countCounter++;
    }

    const countRes = await db.query(countQuery, countParams);
    const totalCount = parseInt(countRes.rows[0].total || 0);

    return res.status(200).json({
      tasks: result.rows,
      total: totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching admin tasks:', err);
    return res.status(500).json({ error: 'Internal server error fetching tasks' });
  }
};

// GET /api/admin/employees (Admin Only) & GET /api/admin/users
export const getEmployees = async (req, res) => {
  try {
    let usersList = [];
    try {
      const usersRes = await db.query(`
        SELECT id, first_name, last_name, email, role, github_username, github_avatar, created_at 
        FROM users 
        ORDER BY first_name ASC, last_name ASC
      `);
      usersList = usersRes.rows;
    } catch (usersErr) {
      console.warn("⚠️ Failed to select from users table:", usersErr.message);
    }

    let employeesList = [];
    try {
      const empRes = await db.query(`
        SELECT id, first_name, last_name, email, role, created_at 
        FROM employees 
        ORDER BY first_name ASC, last_name ASC
      `);
      employeesList = empRes.rows;
    } catch (empErr) {
      console.warn("⚠️ Employees table not available or empty:", empErr.message);
    }

    // Combine lists, avoiding duplicates by email
    const seenEmails = new Set();
    const combined = [];

    for (const u of usersList) {
      const emailVal = u.email || u.github_email || '';
      if (emailVal) {
        seenEmails.add(emailVal.toLowerCase());
      }
      combined.push({
        id: u.id,
        first_name: u.first_name || u.github_username || 'GitHub',
        last_name: u.last_name || 'User',
        email: emailVal,
        role: u.role || 'developer',
        github_username: u.github_username,
        github_avatar: u.github_avatar,
        created_at: u.created_at
      });
    }

    for (const e of employeesList) {
      if (e.email) {
        const emailKey = e.email.toLowerCase();
        if (seenEmails.has(emailKey)) continue;
        seenEmails.add(emailKey);
      }
      combined.push({
        id: e.id,
        first_name: e.first_name || 'Employee',
        last_name: e.last_name || 'User',
        email: e.email || '',
        role: e.role || 'developer',
        github_username: null,
        github_avatar: null,
        created_at: e.created_at
      });
    }

    return res.status(200).json(combined);
  } catch (err) {
    console.error('Error fetching admin employees/users list:', err);
    return res.status(500).json({ error: 'Internal server error fetching employees' });
  }
};

// GET /api/admin/stats (Admin Only)
export const getStats = async (req, res) => {
  try {
    // 1. Total employees count
    const empCountRes = await db.query('SELECT COUNT(id) as count FROM employees WHERE role = \'employee\'');
    const totalEmployees = parseInt(empCountRes.rows[0].count || 0);

    // 2. Task statistics
    const taskStatsRes = await db.query(`
      SELECT 
        COUNT(id) as total_tasks,
        COALESCE(SUM(hours_worked), 0) as total_hours,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks
      FROM tasks
    `);
    const taskStats = taskStatsRes.rows[0];
    const totalTasks = parseInt(taskStats.total_tasks || 0);
    const totalHours = parseFloat(taskStats.total_hours || 0);
    const completedTasks = parseInt(taskStats.completed_tasks || 0);
    const inProgressTasks = parseInt(taskStats.in_progress_tasks || 0);
    const pendingTasks = parseInt(taskStats.pending_tasks || 0);

    const taskCompletionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0.0';

    // 3. Department statistics (hours & count by department)
    const deptStatsRes = await db.query(`
      SELECT d.id, d.name, COALESCE(SUM(t.hours_worked), 0) as hours_worked, COUNT(DISTINCT e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.role = 'employee'
      LEFT JOIN tasks t ON t.employee_id = e.id
      GROUP BY d.id, d.name
      ORDER BY hours_worked DESC
    `);
    const departmentStats = deptStatsRes.rows;

    // 4. Daily hours worked (last 7 days)
    const dailyHoursRes = await db.query(`
      SELECT task_date, SUM(hours_worked) as hours
      FROM tasks
      WHERE task_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY task_date
      ORDER BY task_date ASC
    `);
    const dailyHours = dailyHoursRes.rows;

    // 5. Recent notifications (last 10)
    const notificationsRes = await db.query(`
      SELECT id, recipient_role, employee_id, message, is_read, created_at
      FROM notifications
      WHERE recipient_role IN ('admin', 'all')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // 6. Today's active submissions list (employees who logged hours today)
    const todaySubmissionsRes = await db.query(`
      SELECT DISTINCT e.id, e.first_name, e.last_name, e.email, d.name as department_name,
             COALESCE(SUM(t.hours_worked), 0) as hours_worked,
             COUNT(t.id) as task_count
      FROM employees e
      JOIN tasks t ON t.employee_id = e.id AND t.task_date = CURRENT_DATE
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.role = 'employee'
      GROUP BY e.id, e.first_name, e.last_name, e.email, d.name
      ORDER BY hours_worked DESC
    `);

    return res.status(200).json({
      summary: {
        totalEmployees,
        totalTasks,
        totalHours,
        taskCompletionRate: parseFloat(taskCompletionRate),
        completedTasks,
        inProgressTasks,
        pendingTasks
      },
      departmentStats,
      dailyHours,
      notifications: notificationsRes.rows,
      todaySubmissions: todaySubmissionsRes.rows
    });
  } catch (err) {
    console.error('Error fetching admin dashboard stats:', err);
    return res.status(500).json({ error: 'Internal server error fetching statistics' });
  }
};
