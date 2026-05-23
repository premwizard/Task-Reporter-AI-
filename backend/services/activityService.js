import { pool } from '../database/db.js';

/**
 * Log a new activity into the database
 */
export const logActivity = async (userId, employeeName, source, activity, repositoryName = null, commitHash = null, committedAt = null) => {
    try {
        const result = await pool.query(
            `INSERT INTO activities (user_id, employee_name, source, activity, repository_name, commit_hash, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             ON CONFLICT (commit_hash) DO NOTHING 
             RETURNING *`,
            [
                userId || null, 
                employeeName, 
                source, 
                activity, 
                repositoryName || null, 
                commitHash || null,
                committedAt || new Date()
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('[ActivityService] Error logging activity:', error);
        throw error;
    }
};

/**
 * Get all activities for today
 */
export const getTodaysActivities = async (userId = null, userRole = 'developer') => {
    try {
        let query = `SELECT * FROM activities WHERE created_at >= CURRENT_DATE`;
        let params = [];
        
        if (userRole !== 'admin' && userId) {
            query += ` AND user_id = $1`;
            params.push(userId);
        }
        
        query += ` ORDER BY created_at ASC`;
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error("Error fetching today's activities:", error);
        throw error;
    }
};

/**
 * Get activities filtered by optional employee name and date range
 */
export const getFilteredActivities = async (userId, userRole, employeeName = null, startDate = null, endDate = null, repository = null, source = null) => {
    try {
        let query = `
            SELECT a.*, u.github_username, u.github_avatar 
            FROM activities a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        // Apply strict User Isolation: normal users only see their own activities
        if (userRole !== 'admin') {
            query += ` AND a.user_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (employeeName) {
            // Admin filtering by employeeName or github_username
            query += ` AND (a.employee_name = $${paramIndex} OR u.github_username = $${paramIndex})`;
            params.push(employeeName);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND a.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND a.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (repository) {
            query += ` AND a.repository_name = $${paramIndex}`;
            params.push(repository);
            paramIndex++;
        }

        if (source) {
            query += ` AND a.source = $${paramIndex}`;
            params.push(source);
            paramIndex++;
        }

        query += ` ORDER BY a.created_at DESC LIMIT 500`;

        console.log(`[ActivityService] Query: userId=${userId}, role=${userRole}, employee=${employeeName}, repo=${repository}`);
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('[ActivityService] Error fetching filtered activities:', error);
        throw error;
    }
};

/**
 * Get unique usernames (admins see all, normal users only see themselves)
 */
export const getUniqueUsers = async (userId = null, userRole = 'developer') => {
    try {
        let query;
        let params = [];
        
        if (userRole === 'admin') {
            query = `SELECT DISTINCT github_username AS employee_name FROM users ORDER BY github_username ASC`;
        } else {
            query = `SELECT github_username AS employee_name FROM users WHERE id = $1`;
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        return result.rows.map(r => r.employee_name);
    } catch (error) {
        console.error('[ActivityService] Error fetching unique users:', error);
        throw error;
    }
};

/**
 * Delete an activity by ID
 */
export const deleteActivity = async (id, userId = null, userRole = 'developer') => {
    try {
        console.log(`[ActivityService] Deleting activity id=${id} (Requested by: userId=${userId}, role=${userRole})`);
        
        let query = `DELETE FROM activities WHERE id = $1`;
        let params = [id];
        
        if (userRole !== 'admin' && userId) {
            query += ` AND user_id = $2`;
            params.push(userId);
        }
        
        query += ` RETURNING id`;
        
        const result = await pool.query(query, params);
        if (result.rowCount === 0) return null;
        return result.rows[0];
    } catch (error) {
        console.error('Error deleting activity:', error);
        throw error;
    }
};

/**
 * Update employee_name and/or activity text for an activity by ID
 */
export const updateActivity = async (id, fields, userId = null, userRole = 'developer') => {
    try {
        const { employee_name, activity } = fields;
        console.log(`[ActivityService] Updating activity id=${id}`, fields);
        
        let query = `
            UPDATE activities
            SET employee_name = COALESCE($1, employee_name),
                activity      = COALESCE($2, activity)
            WHERE id = $3
        `;
        let params = [employee_name || null, activity || null, id];
        
        if (userRole !== 'admin' && userId) {
            query += ` AND user_id = $4`;
            params.push(userId);
        }
        
        query += ` RETURNING *`;
        
        const result = await pool.query(query, params);
        if (result.rowCount === 0) return null;
        return result.rows[0];
    } catch (error) {
        console.error('Error updating activity:', error);
        throw error;
    }
};

/**
 * Find employee name by github username
 */
export const getEmployeeByGithub = async (githubUsername) => {
    try {
        const result = await pool.query(
            `SELECT github_username AS name FROM users WHERE github_username = $1`,
            [githubUsername]
        );
        return result.rows.length > 0 ? result.rows[0].name : null;
    } catch (error) {
        console.error('Error fetching employee by github:', error);
        throw error;
    }
};
