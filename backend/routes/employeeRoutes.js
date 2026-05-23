import express from 'express';
import { getMe, getDepartments } from '../controllers/employeeController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protected profile & config routes
router.get('/me', authenticateToken, getMe);
router.get('/departments', authenticateToken, getDepartments);

export default router;
