import { App } from '@octokit/app';
import dotenv from 'dotenv';

dotenv.config();

const appId = process.env.GITHUB_APP_ID;
const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
const appName = process.env.GITHUB_APP_NAME || 'Task Reporter AI';

if (!appId || !privateKey) {
  console.warn("⚠️ [GitHub App] GITHUB_APP_ID or GITHUB_PRIVATE_KEY is not defined in environment variables.");
}

export const githubApp = new App({
  appId: appId ? parseInt(appId) : 1,
  privateKey: privateKey || 'dummy_private_key',
  webhooks: {
    secret: webhookSecret || 'dummy_webhook_secret'
  }
});

console.log(`🔌 [GitHub App Config] Client initialized successfully for app: "${appName}"`);
