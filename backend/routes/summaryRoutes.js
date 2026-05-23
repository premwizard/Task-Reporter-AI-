import express from 'express';
import { createSummary, getSummaries, createSingleActivitySummary } from '../controllers/summaryController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all AI summary endpoints
router.use(authenticateToken);

// POST /api/ai-summary
router.post('/', createSummary);

// GET /api/ai-summary
router.get('/', getSummaries);

// POST /api/ai-summary/activity
router.post('/activity', createSingleActivitySummary);

export default router;
