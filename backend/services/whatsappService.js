import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

dotenv.config();

const { Client, LocalAuth } = pkg;

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    // console.log('Scan the QR code below to authenticate WhatsApp:');
    // qrcode.generate(qr, { small: true });
});

/**
 * Reusable function to send a WhatsApp message to any valid number/group.
 * Uses async/await and proper try/catch error handling.
 */
export const sendWhatsAppMessage = async (recipientId, message) => {
    try {
        if (!isClientReady) {
            console.warn('WhatsApp client is not ready yet. Message not sent.');
            return false;
        }

        // console.log(`Sending Message to ${recipientId}...`);
        await client.sendMessage(recipientId, message);
        // console.log('Message Sent Successfully!');
        return true;
    } catch (error) {
        console.error('Error Handling Logs: Failed to send WhatsApp message', error);
        return false;
    }
};

client.on('ready', async () => {
    // console.log('WhatsApp Client Ready!');
    isClientReady = true;

    // After scanning the QR code and becoming ready, send a test message
    const testNumber = process.env.WHATSAPP_TEST_NUMBER;
    
    if (testNumber) {
        const testMessage = `🚀 *Test Message from Daily Task Updater Project*

📌 *Daily Task Update*

👤 *Employee*: Prem
🛠 *Task*: Testing WhatsApp Integration
✅ *Status*: Completed
⏱ *Hours Worked*: 2`;

        // Automatically trigger the reusable function
        await sendWhatsAppMessage(testNumber, testMessage);
    } else {
        console.warn('Please define WHATSAPP_TEST_NUMBER in your .env file to send a test message.');
    }
});

client.on('auth_failure', msg => {
    console.error('WhatsApp Authentication failure', msg);
});

client.initialize().catch(err => {
    console.error('⚠️ [WhatsApp Web] Initialization failed or folder locked:', err.message);
});

/**
 * Standard function to broadcast a daily task update (from earlier requirements)
 */
export const sendTaskUpdate = async (taskData) => {
    const groupId = process.env.WHATSAPP_GROUP_JID; 
    if (!groupId) {
        console.warn('No WHATSAPP_GROUP_JID configured. Cannot broadcast group update.');
        return;
    }

    const message = `📌 *Daily Task Update*

👤 *Employee*: ${taskData.employee_name}
🛠 *Task*: ${taskData.task_title}
📝 *Description*: ${taskData.task_description || 'N/A'}
✅ *Status*: ${taskData.status}
⏱ *Hours Worked*: ${taskData.hours_worked}`;

    await sendWhatsAppMessage(groupId, message);
};

export default client;
