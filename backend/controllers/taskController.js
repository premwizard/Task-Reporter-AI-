import { pool } from '../config/db.js';
import { sendTaskUpdate } from '../services/whatsappService.js';

export const getTasks = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const createTask = async (req, res) => {
    const { employee_name, task_title, task_description, status, hours_worked } = req.body;

    if (!employee_name || !task_title || !status || hours_worked === undefined) {
        return res.status(400).json({ message: 'Please provide all required fields' });
    }

    try {
        // 1. Save to DB
        const result = await pool.query(
            'INSERT INTO tasks (employee_name, task_title, task_description, status, hours_worked) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [employee_name, task_title, task_description, status, hours_worked]
        );
        
        const newTask = result.rows[0];

        // 2. Send WhatsApp Message (Non-blocking)
        sendTaskUpdate(newTask).catch(err => console.error('WhatsApp message failed', err));

        res.status(201).json(newTask);
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
