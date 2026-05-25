import { pool } from '../database/db.js';
import { getIO } from '../socket.js';
import { githubApp } from '../config/githubApp.js';
import crypto from 'crypto';

/**
 * Verifies the GitHub HMAC signature using SHA-256.
 */
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'my_app_webhook_secret_1234';

  if (!signature) {
    console.error('❌ [Security] Missing X-Hub-Signature-256 header.');
    return false;
  }

  try {
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', secret);
    const expectedHash = 'sha256=' + hmac.update(rawBody).digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedHash, 'utf8')
    );
  } catch (err) {
    console.error('❌ [Security] Webhook signature verification error:', err.message);
    return false;
  }
}

/**
 * Helper to insert activity rows with unique commit hash protection.
 */
async function insertActivity({ userId, employeeName, source, activity, repositoryName, commitHash, committedAt, aiSummary, branch }) {
  try {
    const result = await pool.query(
      `INSERT INTO activities
         (user_id, employee_name, source, activity, repository_name, commit_hash, created_at, ai_summary, branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (commit_hash) DO NOTHING
       RETURNING *`,
      [
        userId,
        employeeName,
        source,
        activity,
        repositoryName,
        commitHash,
        committedAt || new Date(),
        aiSummary || null,
        branch || 'main'
      ]
    );

    if (result.rowCount > 0) {
      console.log(`💾 [DB Success] Saved push activity. Row ID: ${result.rows[0].id}. user_id: ${userId}`);
      return result.rows[0];
    }
    console.log(`⚠️ [DB Skip] Duplicate commit bypassed: ${commitHash}`);
    return false;
  } catch (err) {
    console.error(`❌ [DB Error] Failed to save push activity:`, err.message);
    return false;
  }
}

/**
 * Processes incoming webhook push payloads.
 */
async function processPushPayload(payload) {
  const repository = payload.repository;
  const repoFullName = repository?.full_name || 'unknown-repo';
  const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : 'main';
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const installationId = payload.installation?.id;

  console.log(`\n==================================================`);
  console.log(`🚀 [GitHub App Webhook] Push Payload Received`);
  console.log(`==================================================`);
  console.log(`Repo      : ${repoFullName}`);
  console.log(`Branch    : ${branch}`);
  console.log(`Commits   : ${commits.length}`);
  console.log(`Installation ID: ${installationId}`);
  console.log(`==================================================`);

  if (commits.length === 0) return;

  // Resolve base user_id from the App installation
  let baseUserId = null;
  if (installationId) {
    try {
      const instRes = await pool.query(`SELECT user_id FROM github_installations WHERE installation_id = $1`, [installationId]);
      if (instRes.rows.length > 0) {
        baseUserId = instRes.rows[0].user_id;
      }
    } catch (err) {
      console.error('❌ Failed to look up user_id from installation:', err.message);
    }
  }

  let insertedCount = 0;

  for (const commit of commits) {
    const commitHash = commit.id;
    const commitMessage = (commit.message || '').trim() || 'No commit message';
    const committedAt = commit.timestamp ? new Date(commit.timestamp) : new Date();
    const authorUsername = commit.author?.username || commit.committer?.username || 'Unknown Developer';

    let userId = baseUserId;
    let employeeName = authorUsername;

    // Resolve committer directly to a user if they exist in the DB
    try {
      const userRes = await pool.query(`SELECT id, github_username FROM users WHERE github_username = $1 OR email = $2`, [authorUsername, commit.author?.email]);
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        employeeName = userRes.rows[0].github_username || authorUsername;
      }
    } catch (err) {
      console.error('Failed direct user resolution:', err.message);
    }

    // Auto-generate AI summary
    let aiSummary = null;
    try {
      const { generateSingleActivitySummary } = await import('../services/aiService.js');
      aiSummary = await generateSingleActivitySummary(commitMessage, employeeName, repoFullName);
    } catch (aiErr) {
      console.warn('⚠️ Failed to generate AI summary at push time:', aiErr.message);
    }

    const insertedRow = await insertActivity({
      userId,
      employeeName,
      source: 'github',
      activity: commitMessage,
      repositoryName: repoFullName,
      commitHash,
      committedAt,
      aiSummary,
      branch
    });

    if (insertedRow) {
      insertedCount++;
      getIO().emit('new_activity', insertedRow);
    }
  }

  console.log(`📊 [Push Sync Outcome] Processed ${commits.length} commits. Registered ${insertedCount} new activities.`);
}

/**
 * Express handler for POST /api/github-app/webhook
 */
export const handleGithubAppWebhook = async (req, res) => {
  const githubEvent = req.headers['x-github-event'] || 'unknown';
  const deliveryId = req.headers['x-github-delivery'];

  console.log(`📡 [GitHub App Webhook] Event "${githubEvent}" received (Delivery: ${deliveryId})`);

  if (!verifySignature(req)) {
    console.error('❌ [Security] Webhook rejected: Signature verification failed.');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  // Always return 200 OK immediately to satisfy GitHub delivery constraints
  res.status(200).json({ success: true, message: 'Verified and queued.' });

  try {
    const payload = req.body;

    if (githubEvent === 'push') {
      await processPushPayload(payload);
    } 
    else if (githubEvent === 'installation' || githubEvent === 'installation_repositories') {
      const action = payload.action;
      const instId = payload.installation.id;
      const accountLogin = payload.installation.account.login;
      const accountType = payload.installation.account.type;
      
      console.log(`🔧 [Installation Event] Action "${action}" on installation ${instId} (@${accountLogin})`);

      if (action === 'created' || action === 'unsuspend') {
        const repositories = payload.repositories || [];
        await pool.query(
          `INSERT INTO github_installations (installation_id, account_login, account_type, repositories)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (installation_id)
           DO UPDATE SET account_login = $2, account_type = $3, repositories = $4`,
          [instId, accountLogin, accountType, JSON.stringify(repositories)]
        );
      } 
      else if (action === 'deleted') {
        await pool.query(`DELETE FROM github_installations WHERE installation_id = $1`, [instId]);
        // Also cleanup disconnected connected_repositories references
        await pool.query(`DELETE FROM connected_repositories WHERE user_id IN (SELECT user_id FROM github_installations WHERE installation_id = $1)`, [instId]);
      }
      else if (action === 'added') {
        const reposAdded = payload.repositories_added || [];
        const instQuery = await pool.query(`SELECT repositories FROM github_installations WHERE installation_id = $1`, [instId]);
        let existing = [];
        if (instQuery.rows.length > 0) {
          existing = instQuery.rows[0].repositories || [];
        }
        const updated = [...existing, ...reposAdded];
        await pool.query(`UPDATE github_installations SET repositories = $1 WHERE installation_id = $2`, [JSON.stringify(updated), instId]);
      }
      else if (action === 'removed') {
        const reposRemoved = payload.repositories_removed || [];
        const instQuery = await pool.query(`SELECT repositories FROM github_installations WHERE installation_id = $1`, [instId]);
        if (instQuery.rows.length > 0) {
          let existing = instQuery.rows[0].repositories || [];
          existing = existing.filter(r => !reposRemoved.some(rem => rem.id === r.id));
          await pool.query(`UPDATE github_installations SET repositories = $1 WHERE installation_id = $2`, [JSON.stringify(existing), instId]);
        }
      }
    }
  } catch (err) {
    console.error('❌ [GitHub App Webhook Exception]', err.message);
  }
};

/**
 * Express handler for POST /api/github-app/bind
 */
export const bindInstallation = async (req, res) => {
  const { installation_id } = req.body;
  const userId = req.user?.id;

  if (!installation_id) {
    return res.status(400).json({ error: 'installation_id is required.' });
  }

  try {
    console.log(`🔗 [GitHub App Bind] Attributing installation_id ${installation_id} to user_id ${userId}...`);

    let accountLogin = 'unknown';
    let accountType = 'User';
    let repositories = [];

    try {
      const octokit = await githubApp.getInstallationOctokit(parseInt(installation_id));
      const { data: inst } = await octokit.apps.getInstallation({ installation_id: parseInt(installation_id) });
      accountLogin = inst.account.login;
      accountType = inst.account.type;

      const { data: reposData } = await octokit.apps.listReposAccessibleToInstallation();
      repositories = reposData.repositories || [];
    } catch (apiErr) {
      console.warn(`⚠️ [GitHub App Bind API Warn] Could not fetch real-time data from GitHub: ${apiErr.message}`);
    }

    const query = `
      INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repositories)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (installation_id)
      DO UPDATE SET user_id = $1, account_login = $3, account_type = $4, repositories = $5
      RETURNING *
    `;
    const result = await pool.query(query, [userId, parseInt(installation_id), accountLogin, accountType, JSON.stringify(repositories)]);

    res.status(200).json({ success: true, installation: result.rows[0] });
  } catch (err) {
    console.error('❌ [Bind Installation Error]', err.message);
    res.status(500).json({ error: 'Failed to bind integration: ' + err.message });
  }
};

/**
 * Express handler for GET /api/github-app/repositories
 */
export const getConnectedRepositories = async (req, res) => {
  const userId = req.user?.id;

  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE user_id = $1`, [userId]);
    let allRepos = [];

    for (const inst of instRes.rows) {
      try {
        const octokit = await githubApp.getInstallationOctokit(inst.installation_id);
        const { data: reposData } = await octokit.apps.listReposAccessibleToInstallation();
        const repos = reposData.repositories || [];

        const mapped = repos.map(r => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          owner: r.owner.login,
          installation_id: inst.installation_id,
          account_login: inst.account_login
        }));

        allRepos = [...allRepos, ...mapped];

        // Cache back to DB
        await pool.query(`UPDATE github_installations SET repositories = $1 WHERE id = $2`, [JSON.stringify(repos), inst.id]);
      } catch (instErr) {
        console.error(`⚠️ Failed to sync live repos for installation ${inst.installation_id}:`, instErr.message);
        
        // Return cached list
        const cached = inst.repositories || [];
        const mapped = cached.map(r => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          owner: r.owner?.login || inst.account_login,
          installation_id: inst.installation_id,
          account_login: inst.account_login
        }));
        allRepos = [...allRepos, ...mapped];
      }
    }

    res.status(200).json(allRepos);
  } catch (err) {
    console.error('❌ [Get App Repos Error]', err.message);
    res.status(500).json({ error: 'Failed to fetch repositories: ' + err.message });
  }
};

/**
 * Express handler for GET /api/github-app/installations
 */
export const getUserInstallations = async (req, res) => {
  const userId = req.user?.id;
  try {
    const result = await pool.query(
      `SELECT id, installation_id, account_login, account_type, repositories, created_at
       FROM github_installations WHERE user_id = $1`,
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list integrations: ' + err.message });
  }
};

/**
 * Express handler for POST /api/github-app/installations/:id/refresh
 */
export const refreshInstallation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (instRes.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found.' });
    }

    const inst = instRes.rows[0];
    const octokit = await githubApp.getInstallationOctokit(inst.installation_id);
    const { data: reposData } = await octokit.apps.listReposAccessibleToInstallation();
    const repos = reposData.repositories || [];

    await pool.query(`UPDATE github_installations SET repositories = $1 WHERE id = $2`, [JSON.stringify(repos), id]);

    res.status(200).json({ success: true, repositories: repos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to refresh integration: ' + err.message });
  }
};

/**
 * Express handler for DELETE /api/github-app/installations/:id
 */
export const removeIntegration = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const instRes = await pool.query(`SELECT * FROM github_installations WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (instRes.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found.' });
    }

    await pool.query(`DELETE FROM github_installations WHERE id = $1`, [id]);
    res.status(200).json({ success: true, message: 'Integration removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove integration: ' + err.message });
  }
};
