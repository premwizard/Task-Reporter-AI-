import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getAIStandup } from '../controllers/standupController.js';

const router = express.Router();

router.get('/standup/:username', authenticateToken, getAIStandup);

export default router;
