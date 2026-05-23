import { getFilteredActivities } from '../services/activityService.js';
import { generateAISummary, generateSingleActivitySummary } from '../services/aiService.js';
import { pool } from '../database/db.js';

/**
 * POST /api/ai-summary
 * Generates and saves an AI summary based on provided filters.
 * Body: { employee_name, startDate, endDate, type }
 */
export const createSummary = async (req, res) => {
    try {
        const { employee_name, startDate, endDate, type } = req.body;
        
        const reportType = type || 'daily';
        const targetEmployee = req.user.role === 'admin' ? (employee_name || null) : req.user.github_username;

        console.log(`[SummaryController] Generating ${reportType} summary for ${targetEmployee} (Requested by: ${req.user.github_username})`);

        // 1. Fetch activities with strict isolation
        const activities = await getFilteredActivities(
            req.user.id,
            req.user.role,
            targetEmployee,
            startDate,
            endDate
        );
        
        if (!activities || activities.length === 0) {
            return res.status(404).json({ message: `No activities found to generate a summary.` });
        }

        // 2. Generate AI Summary using Groq
        const summaryText = await generateAISummary(activities, targetEmployee, reportType);

        // 3. Save to database with user_id mapping
        const result = await pool.query(
            `INSERT INTO summary_reports (user_id, employee_name, summary, report_type)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user.id, targetEmployee || 'Team', summaryText, reportType]
        );

        console.log(`[SummaryController] Saved AI summary with ID: ${result.rows[0].id}`);
        
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[SummaryController] Error creating summary:', error);
        res.status(500).json({ message: error.message || 'Internal server error while generating summary' });
    }
};

/**
 * GET /api/ai-summary
 * Retrieves summaries (isolated by role)
 */
export const getSummaries = async (req, res) => {
    try {
        const { employee } = req.query;
        let query = `SELECT * FROM summary_reports`;
        let params = [];

        // Apply strict isolation: normal users only see their own summaries
        if (req.user.role !== 'admin') {
            query += ` WHERE user_id = $1`;
            params.push(req.user.id);
        } else if (employee) {
            query += ` WHERE employee_name = $1`;
            params.push(employee);
        }

        query += ` ORDER BY created_at DESC LIMIT 50`;

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[SummaryController] Error fetching summaries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /api/ai-summary/activity
 * Generates an AI explanation for a single activity/commit.
 * Body: { activity_id, activity, repository_name, employee_name }
 */
export const createSingleActivitySummary = async (req, res) => {
    try {
        const { activity_id, activity, repository_name, employee_name } = req.body;
        
        if (!activity) {
            return res.status(400).json({ message: 'activity string is required' });
        }

        // 1. Generate explanation
        const explanation = await generateSingleActivitySummary(activity, employee_name || req.user.github_username, repository_name);

        // 2. Save back in DB if activity_id is provided, checking ownership
        if (activity_id) {
            try {
                let query = `UPDATE activities SET ai_summary = $1 WHERE id = $2`;
                let params = [explanation, activity_id];

                if (req.user.role !== 'admin') {
                    query += ` AND user_id = $3`;
                    params.push(req.user.id);
                }

                await pool.query(query, params);
            } catch (dbErr) {
                console.error('[SummaryController] Failed to cache explanation in DB:', dbErr);
            }
        }

        res.status(200).json({ summary: explanation });
    } catch (error) {
        console.error('[SummaryController] Error creating single activity summary:', error);
        res.status(500).json({ message: error.message || 'Internal server error while generating explanation' });
    }
};
