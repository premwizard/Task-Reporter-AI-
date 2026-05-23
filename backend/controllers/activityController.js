import { getFilteredActivities, getUniqueUsers, deleteActivity, updateActivity } from '../services/activityService.js';

/**
 * GET /api/activities
 * Query parameters (optional): 
 *   ?employee=<name>
 *   ?filter=today|yesterday|last7days
 *   ?start=<YYYY-MM-DD>&end=<YYYY-MM-DD>
 */
export const getActivities = async (req, res) => {
    try {
        const { employee, filter, start, end } = req.query;
        let startDate = null;
        let endDate = null;

        if (filter === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            startDate = today.toISOString();
        } else if (filter === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            startDate = yesterday.toISOString();

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            endDate = today.toISOString();
        } else if (filter === 'last7days') {
            const last7 = new Date();
            last7.setDate(last7.getDate() - 7);
            last7.setHours(0, 0, 0, 0);
            startDate = last7.toISOString();
        } else if (start || end) {
            if (start) startDate = new Date(start).toISOString();
            if (end) {
                const endD = new Date(end);
                endD.setHours(23, 59, 59, 999);
                endDate = endD.toISOString();
            }
        }

        console.log(`[ActivityController] GET /api/activities | user: ${req.user.github_username}, role: ${req.user.role}, filter: "${filter || 'none'}"`);
        
        // Pass req.user.id and req.user.role for secure isolation
        const activities = await getFilteredActivities(
            req.user.id, 
            req.user.role, 
            employee || null, 
            startDate, 
            endDate
        );
        res.status(200).json(activities);
    } catch (error) {
        console.error('[ActivityController] Error in getActivities:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/users
 * Returns distinct employee names from activities / users table (isolated per-role)
 */
export const getUsers = async (req, res) => {
    try {
        console.log(`[ActivityController] GET /api/users | user: ${req.user?.github_username}`);
        const users = await getUniqueUsers(req.user?.id, req.user?.role);
        res.status(200).json(users);
    } catch (error) {
        console.error('[ActivityController] Error in getUsers:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/activities/:id
 */
export const deleteActivityHandler = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[ActivityController] DELETE /api/activities/${id} by user: ${req.user.github_username}`);
        
        const deleted = await deleteActivity(id, req.user.id, req.user.role);
        if (!deleted) {
            return res.status(404).json({ message: `Activity with id=${id} not found or you lack permission to delete it.` });
        }
        res.status(200).json({ message: `Activity ${id} deleted successfully.` });
    } catch (error) {
        console.error('[ActivityController] Error in deleteActivityHandler:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PUT /api/activities/:id
 * Allows updating: employee_name, activity
 */
export const updateActivityHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_name, activity } = req.body;
        console.log(`[ActivityController] PUT /api/activities/${id} by user: ${req.user.github_username}`, { employee_name, activity });

        if (!employee_name && !activity) {
            return res.status(400).json({ message: 'Provide at least one field to update: employee_name or activity.' });
        }

        const updated = await updateActivity(id, { employee_name, activity }, req.user.id, req.user.role);
        if (!updated) {
            return res.status(404).json({ message: `Activity with id=${id} not found or you lack permission to update it.` });
        }
        res.status(200).json(updated);
    } catch (error) {
        console.error('[ActivityController] Error in updateActivityHandler:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
