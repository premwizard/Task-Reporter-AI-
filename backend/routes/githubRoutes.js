import express from 'express';
import { 
  getGithubRepos, 
  connectRepositories, 
  reconnectWebhook, 
  disconnectRepository, 
  getConnectedRepos,
  repairAllWebhooks
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

export default router;
