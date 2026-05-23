import express from 'express';
import { getActivities, getUsers, deleteActivityHandler, updateActivityHandler } from '../controllers/activityController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all activity endpoints
router.use(authenticateToken);

// GET /api/activities/users
router.get('/users', getUsers);

// GET /api/activities
router.get('/', getActivities);

// DELETE /api/activities/:id
router.delete('/:id', deleteActivityHandler);

// PUT /api/activities/:id
router.put('/:id', updateActivityHandler);

export default router;
