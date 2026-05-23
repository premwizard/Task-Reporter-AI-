import { getTodaysActivities } from './activityService.js';
import { sendWhatsAppMessage } from './whatsappService.js';
import dotenv from 'dotenv';

dotenv.config();

export const generateAndSendDailyReport = async () => {
    try {
        console.log('Generating daily report...');
        const activities = await getTodaysActivities();

        if (activities.length === 0) {
            console.log('No activities found for today. Skipping report.');
            return;
        }

        // Group by employee_name
        const groupedActivities = activities.reduce((acc, act) => {
            if (!acc[act.employee_name]) {
                acc[act.employee_name] = [];
            }
            acc[act.employee_name].push(act);
            return acc;
        }, {});

        // Build Report String
        let reportText = `📌 *Daily Individual Work Report*\n`;
        
        for (const [employee, tasks] of Object.entries(groupedActivities)) {
            reportText += `\n👤 *${employee}*\n`;
            for (const task of tasks) {
                let icon = '📝';
                if (task.source === 'github') icon = '💻';
                
                reportText += `${icon} ${task.activity}\n`;
            }
        }

        const groupId = process.env.WHATSAPP_GROUP_JID;
        if (!groupId) {
            console.warn('WHATSAPP_GROUP_JID not configured. Generated report:\n', reportText);
            return;
        }

        await sendWhatsAppMessage(groupId, reportText);
        console.log('Daily report sent successfully!');
    } catch (error) {
        console.error('Error generating daily report:', error);
    }
};
