import cron from 'node-cron';
import { generateAndSendDailyReport } from '../services/reportService.js';

export const initCronJobs = () => {
    // 1. WhatsApp Daily Report at 6:00 PM
    cron.schedule('0 18 * * *', () => {
        console.log('Executing scheduled daily WhatsApp report...');
        generateAndSendDailyReport();
    });

    // Helper to call the internal AI report endpoint
    const autoGenerateAIReport = async (type) => {
        try {
            console.log(`[Cron] Auto-generating ${type} AI report...`);
            // we send to our own API
            const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/reports/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (response.ok) {
                console.log(`[Cron] Successfully auto-generated and saved ${type} report.`);
            } else {
                console.error(`[Cron] Failed to generate ${type} report:`, response.status);
            }
        } catch (error) {
            console.error(`[Cron] Error auto-generating ${type} report:`, error);
        }
    };

    // 2. AI Daily Report at 6:00 PM
    cron.schedule('0 18 * * *', () => autoGenerateAIReport('daily'));

    // 3. AI Weekly Report on Sunday evening at 11:00 PM
    cron.schedule('0 23 * * 0', () => autoGenerateAIReport('weekly'));

    // 4. AI Monthly Report on the last day of the month at 11:30 PM
    cron.schedule('30 23 28-31 * *', () => {
        // Run only if it's actually the last day of the month
        const date = new Date();
        const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        if (tomorrow.getMonth() !== date.getMonth()) {
            autoGenerateAIReport('monthly');
        }
    });

    console.log('Cron scheduler initialized. AI & WhatsApp reports scheduled.');
};
