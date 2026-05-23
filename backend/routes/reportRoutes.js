import express from 'express';
import { pool } from '../database/db.js';
import { generateAISummary } from '../services/aiService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all report endpoints
router.use(authenticateToken);

/**
 * Generate and save a periodic report (daily, weekly, monthly)
 * POST /api/reports/:type
 */
router.post('/:type', async (req, res) => {
    const { type } = req.params;
    const { employee_name, repository_name, startDate, endDate } = req.body;

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
        return res.status(400).json({ error: 'Invalid report type. Must be daily, weekly, or monthly.' });
    }

    try {
        let query = `
            SELECT a.*, u.github_username 
            FROM activities a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        // Apply strict isolation: normal users only compile reports from their own activity log
        if (req.user.role !== 'admin') {
            query += ` AND a.user_id = $${paramIndex}`;
            params.push(req.user.id);
            paramIndex++;
        } else if (employee_name) {
            query += ` AND (a.employee_name = $${paramIndex} OR u.github_username = $${paramIndex})`;
            params.push(employee_name);
            paramIndex++;
        }

        if (repository_name) {
            query += ` AND a.repository_name = $${paramIndex}`;
            params.push(repository_name);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND a.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND a.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ' ORDER BY a.created_at DESC';

        const { rows: activities } = await pool.query(query, params);

        if (activities.length === 0) {
            return res.status(404).json({ error: 'No activities found for the given criteria.' });
        }

        const targetEmployee = req.user.role === 'admin' ? (employee_name || 'Team') : req.user.github_username;

        // Use AI to generate summary
        console.log(`[Reports] Generating ${type} report for ${targetEmployee}`);
        const summary = await generateAISummary(activities, targetEmployee, type);

        // Save report to database with user_id mapping
        const insertQuery = `
            INSERT INTO ai_reports (user_id, report_type, employee_name, repository_name, summary, start_date, end_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const insertParams = [
            req.user.id,
            type,
            targetEmployee,
            repository_name || null,
            summary,
            startDate || null,
            endDate || null
        ];

        const { rows: newReport } = await pool.query(insertQuery, insertParams);

        console.log(`[Reports] Successfully saved periodic report with ID: ${newReport[0].id}`);
        res.status(201).json(newReport[0]);
    } catch (error) {
        console.error('[Reports] Error generating report:', error);
        res.status(500).json({ error: error.message || 'Failed to generate report' });
    }
});

/**
 * Fetch existing reports
 * GET /api/reports
 */
router.get('/', async (req, res) => {
    const { type, employee_name } = req.query;
    try {
        let query = 'SELECT * FROM ai_reports WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // Apply strict user isolation
        if (req.user.role !== 'admin') {
            query += ` AND user_id = $${paramIndex}`;
            params.push(req.user.id);
            paramIndex++;
        } else if (employee_name) {
            query += ` AND employee_name = $${paramIndex}`;
            params.push(employee_name);
            paramIndex++;
        }

        if (type) {
            query += ` AND report_type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        query += ' ORDER BY created_at DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[Reports] Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

export default router;
