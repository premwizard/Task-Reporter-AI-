import { pool as db } from '../config/db.js';

// GET /api/employees/me
export const getMe = async (req, res) => {
  try {
    const query = `
      SELECT e.id, e.first_name, e.last_name, e.email, e.role, e.department_id, e.whatsapp_number, e.created_at,
             d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = $1
    `;
    const result = await db.query(query, [req.user.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error in getMe:', err);
    return res.status(500).json({ error: 'Internal server error fetching profile' });
  }
};

// GET /api/departments
export const getDepartments = async (req, res) => {
  try {
    const result = await db.query('SELECT id, name FROM departments ORDER BY name ASC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error in getDepartments:', err);
    return res.status(500).json({ error: 'Internal server error fetching departments' });
  }
};
