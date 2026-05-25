import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  handleGithubAppWebhook,
  bindInstallation,
  getConnectedRepositories,
  getUserInstallations,
  refreshInstallation,
  removeIntegration
} from '../controllers/githubAppController.js';

const router = express.Router();

// Webhook endpoint (unauthenticated, signature checked internally)
router.post('/webhook', (req, res, next) => {
  console.log(`\n📡 [GitHub App Routing] Webhook Event Header: ${req.headers['x-github-event'] || 'none'}`);
  next();
}, handleGithubAppWebhook);

// Authenticated management endpoints
router.post('/bind', authenticateToken, bindInstallation);
router.get('/repositories', authenticateToken, getConnectedRepositories);
router.get('/installations', authenticateToken, getUserInstallations);
router.post('/installations/:id/refresh', authenticateToken, refreshInstallation);
router.delete('/installations/:id', authenticateToken, removeIntegration);

router.get('/install-url', authenticateToken, (req, res) => {
  const appSlug = (process.env.GITHUB_APP_NAME || 'task-reporter-ai')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  res.status(200).json({
    install_url: `https://github.com/apps/${appSlug}/installations/new`
  });
});

export default router;
