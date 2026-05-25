import express from 'express';
import { getAllTasks, getEmployees, getStats } from '../controllers/adminController.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/tasks', authenticateToken, isAdmin, getAllTasks);
router.get('/employees', authenticateToken, isAdmin, getEmployees);
router.get('/users', authenticateToken, getEmployees);
router.get('/stats', authenticateToken, isAdmin, getStats);

export default router;
