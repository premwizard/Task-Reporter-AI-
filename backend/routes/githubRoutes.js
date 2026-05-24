import express from 'express';
import { 
  getGithubRepos, 
  connectRepositories, 
  reconnectWebhook, 
  disconnectRepository, 
  getConnectedRepos,
  repairAllWebhooks,
  autoConnectAllRepos
} from '../controllers/githubController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes here are protected and require a user session
router.get('/repos', authenticateToken, getGithubRepos);
router.post('/connect', authenticateToken, connectRepositories);
router.post('/reconnect', authenticateToken, reconnectWebhook);
router.post('/disconnect', authenticateToken, disconnectRepository);
router.get('/connected', authenticateToken, getConnectedRepos);
router.post('/repair-all', authenticateToken, repairAllWebhooks);

// POST /api/github/auto-connect-all -> Sync all repos & auto-create webhooks (triggered from UI)
router.post('/auto-connect-all', authenticateToken, autoConnectAllRepos);

export default router;
