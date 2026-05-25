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
 * Processes incoming webhook pull request payloads.
 */
async function processPullRequestPayload(payload) {
  const pr = payload.pull_request;
  const repository = payload.repository;
  const repoFullName = repository?.full_name || 'unknown-repo';
  
  if (!pr) return;

  const githubPrId = pr.id;
  const title = pr.title || 'Untitled Pull Request';
  const description = pr.body || '';
  const author = pr.user?.login || 'unknown';
  const state = pr.state || 'open';
  const merged = !!pr.merged;
  const branch = pr.head?.ref || 'main';
  const additions = pr.additions || 0;
  const deletions = pr.deletions || 0;
  const changedFiles = pr.changed_files || 0;
  const prUrl = pr.html_url || '';
  const createdAt = pr.created_at ? new Date(pr.created_at) : new Date();
  const mergedAt = pr.merged_at ? new Date(pr.merged_at) : null;

  console.log(`\n==================================================`);
  console.log(`🚀 [GitHub App Webhook] Pull Request Payload`);
  console.log(`==================================================`);
  console.log(`PR ID     : ${githubPrId}`);
  console.log(`Title     : ${title}`);
  console.log(`Author    : ${author}`);
  console.log(`State     : ${state} (Merged: ${merged})`);
  console.log(`Repo      : ${repoFullName}`);
  console.log(`==================================================`);

  try {
    // Resolve user_id from the PR author's GitHub username for ownership tracking
    let authorUserId = null;
    try {
      const userLookup = await pool.query(
        `SELECT id FROM users WHERE github_username = $1 LIMIT 1`,
        [author]
      );
      if (userLookup.rows.length > 0) {
        authorUserId = userLookup.rows[0].id;
        console.log(`👤 [PR Author Resolved] author=${author} → user_id=${authorUserId}`);
      }
    } catch (lookupErr) {
      console.warn(`⚠️ [PR Author Lookup] Could not resolve user_id for author ${author}: ${lookupErr.message}`);
    }

    const query = `
      INSERT INTO pull_requests 
        (github_pr_id, repository_name, title, description, author, user_id, state, merged, branch, additions, deletions, changed_files, pr_url, created_at, merged_at, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
      ON CONFLICT (github_pr_id) DO UPDATE SET
        repository_name = $2,
        title = $3,
        description = $4,
        author = $5,
        user_id = COALESCE(pull_requests.user_id, $6),
        state = $7,
        merged = $8,
        branch = $9,
        additions = $10,
        deletions = $11,
        changed_files = $12,
        pr_url = $13,
        merged_at = $15,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(query, [
      githubPrId,
      repoFullName,
      title,
      description,
      author,
      authorUserId,
      state,
      merged,
      branch,
      additions,
      deletions,
      changedFiles,
      prUrl,
      createdAt,
      mergedAt
    ]);

    if (result.rows.length > 0) {
      const savedPR = result.rows[0];
      console.log(`💾 [DB Success] Saved/Updated Pull Request ID: ${savedPR.id}`);
      getIO().emit('new_pull_request', savedPR);
    }
  } catch (err) {
    console.error('❌ [DB Error] Failed to save pull request:', err.message);
  }
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
    else if (githubEvent === 'pull_request') {
      await processPullRequestPayload(payload);
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

    // Automatically sync and store repositories to connected_repositories (Step 8 & 9)
    if (repositories.length > 0) {
      console.log(`🔄 [Bind Installation Sync] Syncing ${repositories.length} repositories into connected_repositories...`);
      for (const repo of repositories) {
        await pool.query(
          `INSERT INTO connected_repositories (user_id, repository_name, repo_name, status)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (user_id, repository_name)
           DO UPDATE SET status = 'active'`,
          [userId, repo.full_name, repo.name]
        );
      }
    }
    // After storing installation, ensure user record has github_username set
    if (userId) {
      const userCheck = await pool.query('SELECT github_username FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length > 0 && (!userCheck.rows[0].github_username || userCheck.rows[0].github_username === null)) {
        await pool.query('UPDATE users SET github_username = $1 WHERE id = $2', [accountLogin, userId]);
        console.log(`🔧 [Bind Installation] Updated user ${userId} with github_username ${accountLogin}`);
      }
    }

    res.status(200).json({ success: true, installation: result.rows[0] });
  } catch (err) {
    console.error('❌ [Bind Installation Error]', err.message);
    res.status(500).json({ error: 'Failed to bind integration: ' + err.message });
  }
};

export const getConnectedRepositories = async (req, res) => {
  const userId = req.user?.id;
  const username = req.user?.github_username;

  try {
    // ── 1. Active connected repos for this user ──────────────────────────
    const activeConnQuery = await pool.query(
      `SELECT repository_name, repo_name, status FROM connected_repositories WHERE user_id = $1`,
      [userId]
    );
    const activeSet = new Set(activeConnQuery.rows.map(r => r.repository_name));

    // ── 2. Resolve all installations linked to this user ─────────────────
    let instRes = await pool.query(`SELECT * FROM github_installations WHERE user_id = $1`, [userId]);

    // Fallback A: match by github_username as account_login (orphaned installs)
    if (instRes.rows.length === 0 && username) {
      console.log(`⚠️ [Repos] No installs by user_id=${userId}, trying account_login='${username}'...`);
      instRes = await pool.query(`SELECT * FROM github_installations WHERE account_login = $1`, [username]);
      if (instRes.rows.length > 0) {
        await pool.query(`UPDATE github_installations SET user_id = $1 WHERE account_login = $2`, [userId, username]);
        console.log(`🔗 [Repos] Relinked ${instRes.rows.length} installation(s) to user_id=${userId}`);
      }
    }

    // Fallback B: synthesise list from connected_repositories when no installations exist
    if (instRes.rows.length === 0 && activeConnQuery.rows.length > 0) {
      console.log(`⚠️ [Repos] No installations. Returning ${activeConnQuery.rows.length} repos from connected_repositories.`);
      const fallbackRepos = activeConnQuery.rows.map(r => ({
        id: null, name: r.repo_name || r.repository_name.split('/').pop(),
        full_name: r.repository_name, private: false,
        owner: r.repository_name.split('/')[0], installation_id: null,
        account_login: r.repository_name.split('/')[0],
        account_type: 'User', connected: true, webhook_active: true,
        organization: null, ownerType: 'personal',
        app_install_url: null
      }));
      return res.status(200).json(fallbackRepos);
    }

    // ── 3. Build app slug for org install links ───────────────────────────
    const appSlug = (process.env.GITHUB_APP_NAME || 'task-reporter-ai')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    let allRepos = [];

    for (const inst of instRes.rows) {
      const isOrgInstall = inst.account_type === 'Organization';
      const installBaseLabel = isOrgInstall ? inst.account_login : (username || inst.account_login);

      let liveFetchOk = false;
      try {
        const octokit = await githubApp.getInstallationOctokit(inst.installation_id);
        const { data: reposData } = await octokit.apps.listReposAccessibleToInstallation();
        const repos = reposData.repositories || [];
        liveFetchOk = true;

        const mapped = repos.map(r => {
          const isConnected = activeSet.has(r.full_name);
          // Determine ownership type
          let ownerType = 'personal';
          if (isOrgInstall) ownerType = 'organization';
          else if (r.owner.login !== inst.account_login) ownerType = 'collaborator';

          return {
            id: r.id, name: r.name, full_name: r.full_name,
            private: r.private, owner: r.owner.login,
            installation_id: inst.installation_id,
            installation_db_id: inst.id,
            account_login: inst.account_login,
            account_type: inst.account_type,
            connected: isConnected, webhook_active: isConnected,
            organization: isOrgInstall ? inst.account_login : null,
            ownerType,
            app_install_url: null  // already installed via this inst
          };
        });

        allRepos = [...allRepos, ...mapped];

        // Cache back to DB
        await pool.query(
          `UPDATE github_installations SET repositories = $1 WHERE id = $2`,
          [JSON.stringify(repos), inst.id]
        );
      } catch (instErr) {
        console.error(`⚠️ Live fetch failed for installation ${inst.installation_id}:`, instErr.message);

        // Fall back to cached list
        const cached = Array.isArray(inst.repositories) ? inst.repositories : [];
        const mapped = cached.map(r => {
          const isConnected = activeSet.has(r.full_name);
          let ownerType = isOrgInstall ? 'organization' : 'personal';
          return {
            id: r.id, name: r.name, full_name: r.full_name,
            private: r.private, owner: r.owner?.login || inst.account_login,
            installation_id: inst.installation_id,
            installation_db_id: inst.id,
            account_login: inst.account_login,
            account_type: inst.account_type,
            connected: isConnected, webhook_active: isConnected,
            organization: isOrgInstall ? inst.account_login : null,
            ownerType,
            app_install_url: null
          };
        });
        allRepos = [...allRepos, ...mapped];
      }
    }

    // De-duplicate by full_name (in case user has both personal + org installs covering same repo)
    const seen = new Set();
    const dedupedRepos = allRepos.filter(r => {
      if (seen.has(r.full_name)) return false;
      seen.add(r.full_name);
      return true;
    });

    res.status(200).json(dedupedRepos);
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

/**
 * Express handler for GET /api/pull-requests
 * Scoped to the authenticated user (admin sees all)
 */
export const getPullRequests = async (req, res) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const username = req.user?.github_username;
  console.log(`🔍 [PR Fetch] user_id=${userId} role=${userRole} username=${username}`);
  try {
    let query, params;
    if (userRole === 'admin') {
      // Admins see all pull requests
      query = `SELECT * FROM pull_requests ORDER BY created_at DESC`;
      params = [];
    } else {
      // Normal users see only PRs they own (by user_id OR matching author/username)
      query = `SELECT * FROM pull_requests WHERE (user_id = $1 OR author = $2) ORDER BY created_at DESC`;
      params = [userId, username];
    }
    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching PRs:', err);
    res.status(500).json({ error: 'Failed to fetch pull requests: ' + err.message });
  }
};

/**
 * Express handler for GET /api/pull-requests/:id
 * Verifies ownership: normal users can only access their own PRs
 */
export const getPullRequestById = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const username = req.user?.github_username;
  try {
    const result = await pool.query(`SELECT * FROM pull_requests WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pull request not found.' });
    }
    const pr = result.rows[0];
    // Ownership check for non-admins
    if (userRole !== 'admin' && pr.user_id !== userId && pr.author !== username) {
      return res.status(403).json({ error: 'Access denied: You do not own this pull request.' });
    }
    res.status(200).json(pr);
  } catch (err) {
    console.error('Error fetching PR by ID:', err);
    res.status(500).json({ error: 'Failed to fetch pull request: ' + err.message });
  }
};

/**
 * Express handler for GET /api/pull-requests/user/:username
 * Non-admins can only view their OWN username PRs
 */
export const getPullRequestsByUsername = async (req, res) => {
  const { username } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const authUsername = req.user?.github_username;

  // Security: non-admins can only query their own username
  if (userRole !== 'admin' && username !== authUsername) {
    return res.status(403).json({ error: 'Access denied: You can only view your own pull requests.' });
  }

  try {
    let query, params;
    if (userRole === 'admin') {
      query = `SELECT * FROM pull_requests WHERE author = $1 ORDER BY created_at DESC`;
      params = [username];
    } else {
      query = `SELECT * FROM pull_requests WHERE (user_id = $1 OR author = $2) ORDER BY created_at DESC`;
      params = [userId, authUsername];
    }
    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching PR by username:', err);
    res.status(500).json({ error: 'Failed to fetch pull requests for user: ' + err.message });
  }
};

/**
 * Express handler for POST /api/pull-requests/:id/ai-summary
 * Verifies PR ownership before generating AI summary
 */
export const getPRSummary = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const username = req.user?.github_username;
  try {
    const result = await pool.query(`SELECT * FROM pull_requests WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pull request not found.' });
    }
    const pr = result.rows[0];
    // Ownership check for non-admins
    if (userRole !== 'admin' && pr.user_id !== userId && pr.author !== username) {
      return res.status(403).json({ error: 'Access denied: You do not own this pull request.' });
    }

    const { generatePRSummary } = await import('../services/aiService.js');
    const summaryData = await generatePRSummary(pr);

    res.status(200).json(summaryData);
  } catch (err) {
    console.error('Error generating AI PR summary:', err);
    res.status(500).json({ error: 'Failed to generate PR summary: ' + err.message });
  }
};

/**
 * Express handler for GET /api/github-app/installation-status
 */
export const getInstallationStatus = async (req, res) => {
  const userId = req.user?.id;
  const username = req.user?.github_username;

  console.log(`🔍 [Installation Check] user_id=${userId} github_username=${username}`);

  try {
    // ── SIGNAL 1: DB lookup by user_id ──────────────────────────────────
    const byUserId = await pool.query(
      `SELECT * FROM github_installations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (byUserId.rows.length > 0) {
      const inst = byUserId.rows[0];
      console.log(`✅ [Signal 1] Found installation by user_id. inst_id=${inst.installation_id} account=${inst.account_login}`);
      return res.status(200).json({
        installed: true, installationId: parseInt(inst.installation_id), account: inst.account_login,
        source: 'db_user_id'
      });
    }

    // ── SIGNAL 2: DB lookup by github_username as account_login ─────────
    if (username) {
      const byUsername = await pool.query(
        `SELECT * FROM github_installations WHERE account_login = $1 ORDER BY created_at DESC LIMIT 1`,
        [username]
      );
      if (byUsername.rows.length > 0) {
        const inst = byUsername.rows[0];
        console.log(`✅ [Signal 2] Found installation by account_login='${username}'. Relinking to user_id=${userId}.`);
        // Re-link the orphaned installation to this user_id
        await pool.query(`UPDATE github_installations SET user_id = $1 WHERE id = $2`, [userId, inst.id]);
        return res.status(200).json({
          installed: true, installationId: parseInt(inst.installation_id), account: inst.account_login,
          source: 'db_account_login'
        });
      }
    }

    // ── SIGNAL 3: Connected repos exist for this user ────────────────────
    const connRepos = await pool.query(
      `SELECT COUNT(*) as count FROM connected_repositories WHERE user_id = $1`,
      [userId]
    );
    if (parseInt(connRepos.rows[0].count) > 0) {
      console.log(`✅ [Signal 3] User has ${connRepos.rows[0].count} connected repos. App is installed.`);
      return res.status(200).json({
        installed: true, installationId: null, account: username || null,
        source: 'connected_repos', repositoriesCount: parseInt(connRepos.rows[0].count)
      });
    }

    // ── SIGNAL 4: Activities exist for this user ─────────────────────────
    const userActivities = await pool.query(
      `SELECT COUNT(*) as count FROM activities WHERE user_id = $1`,
      [userId]
    );
    if (parseInt(userActivities.rows[0].count) > 0) {
      console.log(`✅ [Signal 4] User has ${userActivities.rows[0].count} activities. App is installed.`);
      return res.status(200).json({
        installed: true, installationId: null, account: username || null,
        source: 'activities', activitiesCount: parseInt(userActivities.rows[0].count)
      });
    }

    // ── SIGNAL 5: GitHub API fallback (if OAuth token available) ─────────
    const userRow = await pool.query(`SELECT github_access_token, github_username FROM users WHERE id = $1`, [userId]);
    const oauthToken = userRow.rows[0]?.github_access_token;
    const resolvedUsername = userRow.rows[0]?.github_username || username;

    if (oauthToken) {
      try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: oauthToken });
        const { data: installationsData } = await octokit.apps.listInstallationsForAuthenticatedUser();
        const installations = installationsData.installations || [];

        const targetSlug = (process.env.GITHUB_APP_NAME || 'task-reporter-ai').toLowerCase().replace(/\s+/g, '-');
        const appInstallation = installations.find(i => i.app_slug === targetSlug || i.app_id === parseInt(process.env.GITHUB_APP_ID));

        if (appInstallation) {
          console.log(`✅ [Signal 5] Found GitHub API installation ${appInstallation.id}. Auto-saving to DB...`);
          const accountLogin = appInstallation.account.login;
          const accountType = appInstallation.account.type;

          let repositories = [];
          try {
            const appOctokit = await githubApp.getInstallationOctokit(appInstallation.id);
            const { data: reposData } = await appOctokit.apps.listReposAccessibleToInstallation();
            repositories = reposData.repositories || [];
          } catch (repoErr) {
            console.warn(`⚠️ Could not fetch repos: ${repoErr.message}`);
          }

          await pool.query(
            `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repositories, github_username, installed_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT (installation_id)
             DO UPDATE SET user_id = $1, account_login = $3, account_type = $4, repositories = $5, github_username = $6`,
            [userId, appInstallation.id, accountLogin, accountType, JSON.stringify(repositories), resolvedUsername]
          );

          for (const repo of repositories) {
            await pool.query(
              `INSERT INTO connected_repositories (user_id, repository_name, repo_name, status)
               VALUES ($1, $2, $3, 'active')
               ON CONFLICT (user_id, repository_name) DO NOTHING`,
              [userId, repo.full_name, repo.name]
            );
          }

          return res.status(200).json({
            installed: true, installationId: appInstallation.id, account: accountLogin,
            source: 'github_api'
          });
        }
      } catch (ghErr) {
        console.warn(`⚠️ [Signal 5 GitHub API Error]: ${ghErr.message}`);
      }
    }

    // ── All signals exhausted — not installed ────────────────────────────
    console.log(`❌ [Installation Check] All 5 signals exhausted. App not installed for user_id=${userId}`);
    return res.status(200).json({ installed: false, installationId: null, account: null, source: 'none' });

  } catch (err) {
    console.error('❌ [Installation Status Error]', err.message);
    res.status(500).json({ error: 'Failed to retrieve installation status: ' + err.message });
  }
};

/**
 * Express handler for POST /api/github-app/repositories/connect
 */
export const connectRepository = async (req, res) => {
  const { repository_name, repo_name } = req.body;
  const userId = req.user?.id;

  if (!repository_name || !repo_name) {
    return res.status(400).json({ error: 'repository_name and repo_name are required.' });
  }

  try {
    console.log(`🔌 [GitHub App Connect Repo] Syncing repository ${repository_name} for user_id ${userId}...`);

    await pool.query(
      `INSERT INTO connected_repositories (user_id, repository_name, repo_name, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (user_id, repository_name)
       DO UPDATE SET status = 'active'`,
      [userId, repository_name, repo_name]
    );

    res.status(200).json({ success: true, message: `Repository ${repository_name} synced successfully.` });
  } catch (err) {
    console.error('❌ [Connect Repo Error]', err.message);
    res.status(500).json({ error: 'Failed to connect repository: ' + err.message });
  }
};

/**
 * Express handler for POST /api/github-app/repositories/disconnect
 */
export const disconnectRepository = async (req, res) => {
  const { repository_name } = req.body;
  const userId = req.user?.id;

  if (!repository_name) {
    return res.status(400).json({ error: 'repository_name is required.' });
  }

  try {
    console.log(`🔌 [GitHub App Disconnect Repo] Removing repository ${repository_name} for user_id ${userId}...`);

    await pool.query(
      `DELETE FROM connected_repositories WHERE user_id = $1 AND repository_name = $2`,
      [userId, repository_name]
    );

    res.status(200).json({ success: true, message: `Repository ${repository_name} disconnected successfully.` });
  } catch (err) {
    console.error('❌ [Disconnect Repo Error]', err.message);
    res.status(500).json({ error: 'Failed to disconnect repository: ' + err.message });
  }
};

/**
 * Express handler for GET /api/github-app/setup
 */
export const handleSetupRedirect = async (req, res) => {
  const { installation_id, setup_action } = req.query;
  console.log(`🔧 [GitHub App Setup] Received redirect. ID: ${installation_id}, Action: ${setup_action}`);

  const isProduction = process.env.NODE_ENV === 'production' || (req.headers.host && !req.headers.host.includes('localhost'));
  const frontendUrl = isProduction ? 'https://task-reporter-ai.vercel.app' : 'http://localhost:3000';

  // Redirect client directly back to frontend onboarding landing
  res.redirect(`${frontendUrl}/install-success?installation_id=${installation_id}`);
};


