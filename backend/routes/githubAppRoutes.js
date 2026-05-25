import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  handleGithubAppWebhook,
  bindInstallation,
  getConnectedRepositories,
  getUserInstallations,
  refreshInstallation,
  removeIntegration,
  getInstallationStatus,
  handleSetupRedirect,
  connectRepository,
  disconnectRepository
} from '../controllers/githubAppController.js';

const router = express.Router();

// Webhook endpoint (unauthenticated, signature checked internally)
router.post('/webhook', (req, res, next) => {
  console.log(`\n📡 [GitHub App Routing] Webhook Event Header: ${req.headers['x-github-event'] || 'none'}`);
  next();
}, handleGithubAppWebhook);

// Authenticated management endpoints
router.get('/status', authenticateToken, getInstallationStatus);
router.get('/installation-status', authenticateToken, getInstallationStatus);
router.get('/setup', handleSetupRedirect); // GitHub redirects here after install
router.post('/bind', authenticateToken, bindInstallation);
router.get('/repositories', authenticateToken, getConnectedRepositories);
router.post('/repositories/connect', authenticateToken, connectRepository);
router.post('/repositories/disconnect', authenticateToken, disconnectRepository);
router.get('/installations', authenticateToken, getUserInstallations);
router.post('/installations/:id/refresh', authenticateToken, refreshInstallation);
router.delete('/installations/:id', authenticateToken, removeIntegration);

router.get('/install-url', authenticateToken, (req, res) => {
  const appSlug = (process.env.GITHUB_APP_NAME || 'task-reporter-ai')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  res.status(200).json({
    install_url: `https://github.com/apps/${appSlug}/installations/new`,
    org_install_url_template: `https://github.com/organizations/{org}/settings/installations`,
    app_slug: appSlug
  });
});

// Organization-specific install URL
router.get('/install-url/org/:org', authenticateToken, (req, res) => {
  const { org } = req.params;
  const appSlug = (process.env.GITHUB_APP_NAME || 'task-reporter-ai')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  res.status(200).json({
    install_url: `https://github.com/apps/${appSlug}/installations/new`,
    org_settings_url: `https://github.com/organizations/${org}/settings/installations`,
    manage_url: `https://github.com/apps/${appSlug}/installations/new?suggested_target_id=${org}`
  });
});

export default router;
