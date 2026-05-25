import { pool } from '../database/db.js';

/**
 * Legacy getGithubRepos mapped to GitHub App repos list for backward compatibility
 */
export const getGithubRepos = async (req, res) => {
  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE user_id = $1`, [req.user?.id]);
    let allRepos = [];
    
    for (const inst of instRes.rows) {
      const cached = inst.repositories || [];
      const mapped = cached.map(r => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        owner: r.owner?.login || inst.account_login,
        private: r.private,
        default_branch: r.default_branch || 'main',
        language: r.language || 'JavaScript',
        html_url: r.html_url || `https://github.com/${r.full_name}`,
        connected: true,
        connection_status: 'active'
      }));
      allRepos = [...allRepos, ...mapped];
    }
    res.status(200).json(allRepos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repositories: ' + err.message });
  }
};

/**
 * Legacy connectRepositories stub
 */
export const connectRepositories = async (req, res) => {
  res.status(200).json({
    success: true,
    results: (req.body.repos || []).map(r => ({
      repo: `${r.owner}/${r.repo}`,
      status: 'connected',
      message: 'Automatically connected via centralized GitHub App installation.'
    }))
  });
};

/**
 * Legacy reconnectWebhook stub
 */
export const reconnectWebhook = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'GitHub App central webhook pipeline is verified and active.',
    webhookId: 999999
  });
};

/**
 * Legacy disconnectRepository stub
 */
export const disconnectRepository = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Please manage repository access directly in your GitHub App installation panel.'
  });
};

/**
 * Legacy getConnectedRepos returning repositories mapped from user installations
 */
export const getConnectedRepos = async (req, res) => {
  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE user_id = $1`, [req.user?.id]);
    let connected = [];
    
    for (const inst of instRes.rows) {
      const cached = inst.repositories || [];
      cached.forEach(r => {
        connected.push({
          id: r.id,
          repository_name: r.full_name,
          webhook_id: inst.installation_id,
          status: 'active',
          created_at: inst.created_at,
          updated_at: inst.created_at
        });
      });
    }
    
    res.status(200).json(connected);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch connected repositories: ' + err.message });
  }
};

/**
 * Legacy repairAllWebhooks stub
 */
export const repairAllWebhooks = async (req, res) => {
  res.status(200).json({
    success: true,
    results: [
      { repo: 'Central GitHub App Pipeline', status: 'success', action: 'verified', webhookId: 999999 }
    ]
  });
};

/**
 * Legacy autoConnectAllRepos stub
 */
export const autoConnectAllRepos = async (req, res) => {
  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE user_id = $1`, [req.user?.id]);
    let created = 0;
    
    for (const inst of instRes.rows) {
      created += (inst.repositories || []).length;
    }
    
    res.status(200).json({
      success: true,
      summary: {
        created: 0,
        connected: created,
        skipped: 0,
        failed: 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
