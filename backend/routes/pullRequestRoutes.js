import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getPullRequests,
  getPullRequestById,
  getPullRequestsByUsername,
  getPRSummary
} from '../controllers/githubAppController.js';

const router = express.Router();

router.get('/', authenticateToken, getPullRequests);
router.get('/:id', authenticateToken, getPullRequestById);
router.get('/user/:username', authenticateToken, getPullRequestsByUsername);
router.post('/:id/ai-summary', authenticateToken, getPRSummary);

export default router;
