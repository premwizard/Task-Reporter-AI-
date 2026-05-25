import cron from 'node-cron';
import { pool } from '../database/db.js';
import { generateAISummary } from '../services/aiService.js';
import { generateAndSendDailyReport } from '../services/reportService.js';

export const initCronJobs = () => {
    // 1. WhatsApp Daily Report at 6:00 PM
    cron.schedule('0 18 * * *', () => {
        console.log('Executing scheduled daily WhatsApp report...');
        generateAndSendDailyReport();
    });

    // Helper to auto-generate AI report directly without localhost HTTP loopbacks
    const autoGenerateAIReport = async (type) => {
        try {
            console.log(`[Cron] Direct auto-generation started for ${type} AI report...`);
            
            const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
            const query = `
                SELECT a.*, u.github_username 
                FROM activities a 
                LEFT JOIN users u ON a.user_id = u.id 
                WHERE a.created_at >= NOW() - INTERVAL '${days} days'
                ORDER BY a.created_at DESC
            `;
            const { rows: activities } = await pool.query(query);

            if (activities.length === 0) {
                console.log(`[Cron] No activities found in last ${days} days for ${type} report. Skipping.`);
                return;
            }

            const targetEmployee = 'Team';
            console.log(`[Cron] Generating ${type} AI report for Team with ${activities.length} activities`);
            const summary = await generateAISummary(activities, targetEmployee, type);

            const adminRes = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
            const systemUserId = adminRes.rows[0]?.id || null;

            const insertQuery = `
                INSERT INTO ai_reports (user_id, report_type, employee_name, repository_name, summary, start_date, end_date)
                VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${days} days', NOW())
                RETURNING id;
            `;
            const insertParams = [
                systemUserId,
                type,
                targetEmployee,
                null,
                summary
            ];

            const { rows: newReport } = await pool.query(insertQuery, insertParams);
            console.log(`[Cron] Successfully direct-generated and saved ${type} report with ID: ${newReport[0].id}`);
        } catch (error) {
            console.error(`[Cron] Error auto-generating ${type} report directly:`, error);
        }
    };

    // 2. AI Daily Report at 6:00 PM
    cron.schedule('0 18 * * *', () => autoGenerateAIReport('daily'));

    // 3. AI Weekly Report on Sunday evening at 11:00 PM
    cron.schedule('0 23 * * 0', () => autoGenerateAIReport('weekly'));

    // 4. AI Monthly Report on the last day of the month at 11:30 PM
    cron.schedule('30 23 28-31 * *', () => {
        const date = new Date();
        const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        if (tomorrow.getMonth() !== date.getMonth()) {
            autoGenerateAIReport('monthly');
        }
    });

    console.log('Cron scheduler initialized. AI & WhatsApp reports scheduled.');
};
