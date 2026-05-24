import { Octokit } from '@octokit/rest';
import { pool } from '../database/db.js';

/**
 * Fetch all repositories for the authenticated user from GitHub
 */
export const getGithubRepos = async (req, res) => {
  try {
    // 1. Fetch user's access token from database
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0 || !userRes.rows[0].github_access_token) {
      console.warn(`[GitHub API] Access token not found for user: ${req.user.github_username}`);
      return res.status(401).json({ error: 'GitHub access token not found. Please log in again.' });
    }

    const token = userRes.rows[0].github_access_token;
    
    // 2. Initialize Octokit
    const octokit = new Octokit({ auth: token });
    
    console.log(`[GitHub API] Fetching repos for user: ${req.user.github_username}`);

    // 3. Fetch repositories (owned, collaborative, private, and public)
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
    });

    // 4. Fetch already connected repos for this user to mark status
    const connectedRes = await pool.query(
      'SELECT repository_name, status FROM connected_repositories WHERE user_id = $1',
      [req.user.id]
    );
    const connectedMap = new Map(connectedRes.rows.map(r => [r.repository_name, r.status]));

    // 5. Map to unified repository card shape
    const mappedRepos = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      default_branch: repo.default_branch,
      language: repo.language || 'JavaScript',
      html_url: repo.html_url,
      connected: connectedMap.has(repo.full_name),
      connection_status: connectedMap.get(repo.full_name) || 'disconnected'
    }));

    console.log(`[GitHub API] Loaded ${mappedRepos.length} repositories for user: ${req.user.github_username}`);
    res.status(200).json(mappedRepos);
  } catch (err) {
    console.error('[GitHub API] Error fetching repos:', err);
    res.status(500).json({ error: 'Failed to fetch repositories from GitHub.' });
  }
};

/**
 * Automatically create webhooks for selected repositories
 */
export const connectRepositories = async (req, res) => {
  const { repos } = req.body; // Array of { owner, repo }
  
  if (!repos || !Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: 'Please select at least one repository to connect.' });
  }

  try {
    // STEP 4 — VERIFY ACCESS TOKEN
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0 || !userRes.rows[0].github_access_token) {
      console.error("❌ GITHUB OAUTH TOKEN NOT FOUND IN DATABASE");
      return res.status(401).json({ error: 'GitHub access token not found. Please log in again.' });
    }

    const token = userRes.rows[0].github_access_token;
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 [Webhook Auto] STARTING WEBHOOK CREATION');
    console.log('='.repeat(60));
    console.log(`👤 User ID        : ${req.user.id}`);
    console.log(`👤 GitHub Username: ${req.user.github_username || 'Unknown'}`);
    console.log(`🔑 Token Exists   : ${!!token}`);
    console.log(`🔑 Token Length   : ${token ? token.length : 0}`);

    const octokit = new Octokit({ auth: token });
    
    // STEP 5 — VERIFY REQUIRED OAUTH SCOPES
    let scopes = '';
    try {
      const authUserRes = await octokit.users.getAuthenticated();
      scopes = authUserRes.headers['x-oauth-scopes'] || '';
      console.log(`🔐 Authorized Scopes : "${scopes}"`);
      if (!scopes.includes('admin:repo_hook')) {
        console.warn(`🚨 WARNING: "admin:repo_hook" scope is missing! Webhook creation will fail.`);
      }
    } catch (authErr) {
      console.error(`❌ Failed to verify token scopes:`, authErr.message);
    }
    
    // Webhook destination target url
    const backendUrl = (process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').trim().replace(/\/$/, "");
    // STEP 2 — VERIFY WEBHOOK URL
    const webhookUrl = `${backendUrl}/api/webhooks/github`;
    console.log(`🌐 Configured BACKEND_URL: "${process.env.BACKEND_URL}"`);
    console.log(`🌐 Generated Webhook URL: "${webhookUrl}"`);

    // STEP 7 — VERIFY PUBLIC URL
    if (process.env.NODE_ENV !== 'production' && (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1'))) {
      const errorMsg = `❌ Webhook Creation Blocked: BACKEND_URL in .env is configured to localhost "${backendUrl}". GitHub cannot resolve local loopbacks. Please start a secure public tunnel (e.g. Cloudflare, ngrok, localtunnel) and set BACKEND_URL in your .env file to your tunnel URL.`;
      console.error('\n' + '='.repeat(80));
      console.error(errorMsg);
      console.error('='.repeat(80) + '\n');
      
      return res.status(400).json({ 
        error: 'Public Tunnel URL Required', 
        details: errorMsg,
        isLocalhost: true
      });
    }

    const results = [];

    for (const { owner, repo } of repos) {
      const repoFullName = `${owner}/${repo}`;
      try {
        console.log(`\n⚙️ [Webhook Auto] Connecting repository: ${repoFullName}`);

        // STEP 10 — VERIFY GITHUB REPOSITORY PERMISSIONS
        try {
          const repoDataRes = await octokit.repos.get({ owner, repo });
          const permissions = repoDataRes.data.permissions;
          console.log(`   [STEP 10] Repository permissions:`, permissions);
          if (!permissions || !permissions.admin) {
            console.warn(`   🚨 WARNING: User lacks admin permission for ${repoFullName}. Webhook creation will likely fail!`);
          }
        } catch (permErr) {
          console.warn(`   ⚠️ Could not fetch repository details/permissions for ${repoFullName}:`, permErr.message);
        }

        // STEP 5 — REMOVE OLD INVALID WEBHOOKS
        console.log(`   [STEP 5] Scanning for outdated webhooks in ${repoFullName}...`);
        try {
          const { data: existingHooks } = await octokit.repos.listWebhooks({
            owner,
            repo,
            per_page: 100,
          });

          // Delete any hook containing "/webhook/github" or "/webhooks/github" that doesn't match the current webhookUrl
          const outdatedHooks = existingHooks.filter(
            h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github')) && h.config?.url !== webhookUrl
          );

          for (const oldHook of outdatedHooks) {
            console.log(`   🧹 [Sweep] Deleting outdated webhook: ID ${oldHook.id} pointing to "${oldHook.config?.url}"`);
            await octokit.repos.deleteHook({ owner, repo, hook_id: oldHook.id });
          }
        } catch (sweepErr) {
          console.warn(`   ⚠️ [Sweep Warning] Clean sweep was skipped:`, sweepErr.message);
        }

        // STEP 7 — VERIFY DUPLICATE HOOK LOGIC
        let existingHook = null;
        try {
          const { data: currentHooks } = await octokit.repos.listWebhooks({ owner, repo });
          existingHook = currentHooks.find(h => h.config?.url === webhookUrl);
        } catch (err) {
          console.warn(`   ⚠️ Failed to list webhooks for ${repoFullName}:`, err.message);
        }

        if (existingHook) {
          console.log(`   ✅ Duplicate Check: Webhook already up-to-date for ${repoFullName} (ID: ${existingHook.id})`);
          await saveConnectedRepo(req.user.id, repoFullName, existingHook.id, 'active');
          results.push({
            repo: repoFullName,
            status: 'connected',
            message: 'Webhook already registered.',
            webhookId: existingHook.id
          });
          continue;
        }

        // STEP 9 — VERIFY REQUEST BODY
        const payload = {
          owner,
          repo,
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            insecure_ssl: '0',
          }
        };

        console.log('\n🛠 STEP 9 — VERIFY WEBHOOK REQUEST BODY');
        console.log('='.repeat(60));
        console.log(JSON.stringify(payload, null, 2));
        console.log('='.repeat(60));

        console.log("====================================");
        console.log("🚀 Creating GitHub Webhook");
        console.log("Webhook URL:", webhookUrl);
        console.log("Repository:", repoFullName);
        console.log("====================================");

        // Create new webhook
        console.log(`🚀 Sending webhook creation API call to GitHub...`);
        const response = await octokit.repos.createHook(payload);
        const hook = response.data;

        // STEP 3 — VERIFY GITHUB API CALL
        console.log('\n✨ [GitHub API Response] Webhook created successfully:');
        console.log(JSON.stringify(hook, null, 2));
        console.log('='.repeat(60));

        // STEP 6 — VERIFY WEBHOOK EXISTS
        console.log(`\n🔍 STEP 6 — VERIFYING REPO WEBHOOKS LIST`);
        console.log('='.repeat(60));
        const { data: hooksList } = await octokit.repos.listWebhooks({
          owner,
          repo,
          per_page: 100,
        });

        hooksList.forEach(h => {
          console.log(`   👉 Hook ID: ${h.id} | URL: "${h.config?.url}" | Active: ${h.active} | Events: ${JSON.stringify(h.events)}`);
        });

        const verifiedHook = hooksList.find(h => h.id === hook.id);
        if (verifiedHook) {
          console.log(`   ✨ [Verification Success] Webhook ID ${verifiedHook.id} verified as active and present on GitHub.`);
        } else {
          console.error(`   🚨 [Verification Failure] Webhook successfully created (ID: ${hook.id}) but not found in repo hooks listing!`);
        }
        console.log('='.repeat(60) + '\n');

        await saveConnectedRepo(req.user.id, repoFullName, hook.id, 'active');

        results.push({
          repo: repoFullName,
          status: 'created',
          message: 'Webhook created and repository connected successfully.',
          webhookId: hook.id
        });
      } catch (err) {
        // STEP 8 — ADD ERROR HANDLING
        console.error(`\n❌ WEBHOOK CREATION FAILED for repo ${repoFullName}`);
        console.error('='.repeat(60));
        if (err.response) {
          console.error(`GitHub API Status Code: ${err.response.status}`);
          console.error(`GitHub API Headers:`, err.response.headers);
          console.error(`GitHub API Error Data:`, JSON.stringify(err.response.data, null, 2));
        } else {
          console.error(err);
        }
        console.error('='.repeat(60) + '\n');

        results.push({
          repo: repoFullName,
          status: 'failed',
          error: err.response?.data?.message || err.message
        });
      }
    }

    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('❌ [Webhook Auto] Connection process failed:', err);
    res.status(500).json({ error: 'Failed to process repository connection request.' });
  }
};

/**
 * Reconnect / fix a broken webhook (STEP 5 & 12 — AUTO FIX INVALID WEBHOOKS)
 */
export const reconnectWebhook = async (req, res) => {
  const { repository_name } = req.body;
  if (!repository_name) {
    return res.status(400).json({ error: 'Repository name is required.' });
  }

  const [owner, repo] = repository_name.split('/');
  if (!owner || !repo) {
    return res.status(400).json({ error: 'Invalid repository name format. Must be "owner/repo".' });
  }

  try {
    // STEP 4 — VERIFY ACCESS TOKEN
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    const token = userRes.rows[0]?.github_access_token;
    if (!token) {
      console.error("❌ GITHUB OAUTH TOKEN NOT FOUND IN DATABASE");
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🚀 [Webhook Auto] STARTING WEBHOOK RECONNECTION');
    console.log('='.repeat(60));
    console.log(`👤 User ID        : ${req.user.id}`);
    console.log(`👤 GitHub Username: ${req.user.github_username || 'Unknown'}`);
    console.log(`🔑 Token Exists   : ${!!token}`);
    console.log(`🔑 Token Length   : ${token ? token.length : 0}`);

    const octokit = new Octokit({ auth: token });

    // STEP 5 — VERIFY REQUIRED OAUTH SCOPES
    let scopes = '';
    try {
      const authUserRes = await octokit.users.getAuthenticated();
      scopes = authUserRes.headers['x-oauth-scopes'] || '';
      console.log(`🔐 Authorized Scopes : "${scopes}"`);
      if (!scopes.includes('admin:repo_hook')) {
        console.warn(`🚨 WARNING: "admin:repo_hook" scope is missing! Webhook creation will fail.`);
      }
    } catch (authErr) {
      console.error(`❌ Failed to verify token scopes:`, authErr.message);
    }

    const backendUrl = (process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').trim().replace(/\/$/, "");
    // STEP 2 — VERIFY WEBHOOK URL
    const webhookUrl = `${backendUrl}/api/webhooks/github`;
    console.log(`🌐 Configured BACKEND_URL: "${process.env.BACKEND_URL}"`);
    console.log(`🌐 Generated Webhook URL: "${webhookUrl}"`);

    // STEP 7 — VERIFY PUBLIC URL
    if (process.env.NODE_ENV !== 'production' && (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1'))) {
      const errorMsg = `❌ Webhook Update Blocked: BACKEND_URL is currently localhost "${backendUrl}". Webhook cannot be updated until a public tunnel is active and specified in backend/.env.`;
      console.error('\n' + '='.repeat(80));
      console.error(errorMsg);
      console.error('='.repeat(80) + '\n');
      
      return res.status(400).json({ 
        error: 'Public Tunnel URL Required', 
        details: errorMsg,
        isLocalhost: true
      });
    }

    console.log(`[Webhook Auto] Reconnecting / Rebuilding webhook for ${repository_name}`);

    // STEP 10 — VERIFY GITHUB REPOSITORY PERMISSIONS
    try {
      const repoDataRes = await octokit.repos.get({ owner, repo });
      const permissions = repoDataRes.data.permissions;
      console.log(`   [STEP 10] Repository permissions:`, permissions);
      if (!permissions || !permissions.admin) {
        console.warn(`   🚨 WARNING: User lacks admin permission for ${repository_name}. Webhook creation will likely fail!`);
      }
    } catch (permErr) {
      console.warn(`   ⚠️ Could not fetch repository details/permissions for ${repository_name}:`, permErr.message);
    }

    // STEP 5 — REMOVE OLD INVALID WEBHOOKS
    try {
      console.log(`[Webhook Auto] Scanning ${repository_name} to sweep out obsolete webhooks...`);
      const { data: hooks } = await octokit.repos.listWebhooks({ owner, repo });
      
      // Delete any webhook containing "/webhook/github" or "/webhooks/github" that doesn't match our current webhookUrl
      const outdatedHooks = hooks.filter(
        h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github')) && h.config?.url !== webhookUrl
      );

      for (const oldHook of outdatedHooks) {
        console.log(`🧹 [Webhook Auto] Purging old hook: ID ${oldHook.id} pointing to "${oldHook.config?.url}"`);
        await octokit.repos.deleteHook({ owner, repo, hook_id: oldHook.id });
      }
    } catch (err) {
      console.warn(`[Webhook Auto] Clean sweep bypassed for ${repository_name}:`, err.message);
    }

    // STEP 9 — VERIFY REQUEST BODY
    const payload = {
      owner,
      repo,
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        insecure_ssl: '0',
      }
    };

    console.log('\n🛠 STEP 9 — VERIFY WEBHOOK REQUEST BODY (RECONNECT)');
    console.log('='.repeat(60));
    console.log(JSON.stringify(payload, null, 2));
    console.log('='.repeat(60));

    console.log("====================================");
    console.log("🚀 Creating GitHub Webhook");
    console.log("Webhook URL:", webhookUrl);
    console.log("Repository:", repository_name);
    console.log("====================================");

    // Create fresh webhook
    console.log(`🚀 Sending webhook creation API call to GitHub...`);
    const response = await octokit.repos.createHook(payload);
    const hook = response.data;

    // STEP 3 — VERIFY GITHUB API CALL
    console.log('\n✨ [GitHub API Response] Webhook created successfully (Reconnect):');
    console.log(JSON.stringify(hook, null, 2));
    console.log('='.repeat(60));

    // STEP 6 — VERIFY WEBHOOK EXISTS
    console.log(`\n🔍 STEP 6 — AUDITING CURRENT REPO WEBHOOKS AFTER RECONNECT`);
    const { data: hooksList } = await octokit.repos.listWebhooks({ owner, repo });
    hooksList.forEach(h => {
      console.log(`   👉 Hook ID: ${h.id} | URL: "${h.config?.url}" | Active: ${h.active} | Events: ${JSON.stringify(h.events)}`);
    });
    console.log('='.repeat(60) + '\n');

    await saveConnectedRepo(req.user.id, repository_name, hook.id, 'active');
    
    res.status(200).json({ success: true, message: 'Webhook reconnected and updated successfully.', webhookId: hook.id });
  } catch (err) {
    // STEP 8 — ADD ERROR HANDLING
    console.error(`\n❌ WEBHOOK RECONNECTION FAILED for repo ${repository_name}`);
    console.error('='.repeat(60));
    if (err.response) {
      console.error(`GitHub API Status Code: ${err.response.status}`);
      console.error(`GitHub API Headers:`, err.response.headers);
      console.error(`GitHub API Error Data:`, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
    console.error('='.repeat(60) + '\n');

    res.status(500).json({ error: `Failed to reconnect webhook: ${err.response?.data?.message || err.message}` });
  }
};

/**
 * Disconnect repository and delete GitHub webhook
 */
export const disconnectRepository = async (req, res) => {
  const { repository_name } = req.body;
  if (!repository_name) {
    return res.status(400).json({ error: 'Repository name is required.' });
  }

  const [owner, repo] = repository_name.split('/');
  if (!owner || !repo) {
    return res.status(400).json({ error: 'Invalid repository name format.' });
  }

  try {
    // Get user token and repository webhook ID from local database
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    const token = userRes.rows[0]?.github_access_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const repoRes = await pool.query(
      'SELECT webhook_id FROM connected_repositories WHERE user_id = $1 AND repository_name = $2',
      [req.user.id, repository_name]
    );

    if (repoRes.rows.length > 0) {
      const webhookId = repoRes.rows[0].webhook_id;
      const octokit = new Octokit({ auth: token });

      try {
        if (webhookId) {
          console.log(`[Webhook Auto] Deleting GitHub webhook ID ${webhookId} for ${repository_name}`);
          await octokit.repos.deleteHook({
            owner,
            repo,
            hook_id: Number(webhookId),
          });
        }
      } catch (ghErr) {
        console.warn(`[Webhook Auto] GitHub deletion failed for hook (might be already deleted manually):`, ghErr.message);
      }
    }

    // Delete record from database
    await pool.query(
      'DELETE FROM connected_repositories WHERE user_id = $1 AND repository_name = $2',
      [req.user.id, repository_name]
    );

    console.log(`[Webhook Auto] Disconnected ${repository_name} for user: ${req.user.github_username}`);
    res.status(200).json({ success: true, message: 'Repository disconnected successfully.' });
  } catch (err) {
    console.error(`[Webhook Auto] Disconnect failed for ${repository_name}:`, err);
    res.status(500).json({ error: `Failed to disconnect repository: ${err.message}` });
  }
};

/**
 * Get all connected repositories for the current user
 */
export const getConnectedRepos = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, repository_name, webhook_id, status, created_at, updated_at FROM connected_repositories WHERE user_id = $1 ORDER BY repository_name ASC',
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('[GitHub API] Error fetching connected repos:', err);
    res.status(500).json({ error: 'Failed to fetch connected repositories.' });
  }
};

// Database helper
async function saveConnectedRepo(userId, repoFullName, webhookId, status) {
  await pool.query(
    `INSERT INTO connected_repositories (user_id, repository_name, webhook_id, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, repository_name) 
     DO UPDATE SET webhook_id = $3, status = $4, updated_at = CURRENT_TIMESTAMP`,
    [userId, repoFullName, webhookId, status]
  );
}

/**
 * STEP 8 — WEBHOOK REPAIR FUNCTION (audits, deletes invalid webhooks, and recreates valid webhooks on GitHub)
 */
export async function repairRepositoryWebhook(userId, repoFullName, octokit) {
  console.log(`\n🔧 [Webhook Repair] Started for: "${repoFullName}"`);
  const [owner, repo] = repoFullName.split('/');
  
  const backendUrl = (process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').trim().replace(/\/$/, "");
  const webhookUrl = `${backendUrl}/api/webhooks/github`;
  
  console.log(`🔧 [Webhook Repair] Current backend endpoint: "${webhookUrl}"`);

  // STEP 10 — VERIFY GITHUB REPOSITORY PERMISSIONS
  try {
    const repoDataRes = await octokit.repos.get({ owner, repo });
    const permissions = repoDataRes.data.permissions;
    console.log(`   [STEP 10] Repository permissions for repair:`, permissions);
    if (!permissions || !permissions.admin) {
      console.warn(`   🚨 WARNING: User lacks admin permission for ${repoFullName}. Webhook repair will likely fail!`);
    }
  } catch (permErr) {
    console.warn(`   ⚠️ Could not fetch repository details/permissions for repair of ${repoFullName}:`, permErr.message);
  }

  // 1. Fetch existing webhooks from GitHub (STEP 4 / STEP 6)
  let existingHooks = [];
  try {
    const { data } = await octokit.repos.listWebhooks({ owner, repo, per_page: 100 });
    existingHooks = data;
    console.log(`   Fetched ${existingHooks.length} existing webhooks for ${repoFullName}`);
  } catch (err) {
    console.error(`   ❌ Failed to list webhooks for ${repoFullName}:`, err.message);
    throw new Error(`Failed to list webhooks from GitHub: ${err.message}`);
  }

  // 2. Identify outdated or duplicate hooks (STEP 5 & 6 & 7)
  const outdatedHooks = existingHooks.filter(
    h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github')) && h.config?.url !== webhookUrl
  );

  // 3. Remove old invalid webhooks (STEP 5)
  for (const oldHook of outdatedHooks) {
    try {
      console.log(`   🗑️  [Webhook Repair] OLD WEBHOOK REMOVED: ID ${oldHook.id} pointing to "${oldHook.config?.url}"`);
      await octokit.repos.deleteHook({ owner, repo, hook_id: oldHook.id });
      console.log(`   🗑️  [Webhook Repair] Old webhook deleted successfully.`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to delete old webhook ID ${oldHook.id}:`, err.message);
    }
  }

  // 4. Verify if a perfectly valid hook already exists
  let validHook = existingHooks.find(h => h.config?.url === webhookUrl);
  if (validHook) {
    console.log(`   ✅ [Webhook Repair] Valid webhook already exists (ID: ${validHook.id}). Skipping recreation.`);
    await saveConnectedRepo(userId, repoFullName, validHook.id, 'active');
    return { status: 'verified', webhookId: validHook.id };
  }

  // 5. Recreate webhook automatically using latest URL (STEP 7 & 10)
  try {
    console.log(`   ⚙️  [Webhook Repair] Deploying fresh webhook for "${repoFullName}"...`);
    const payload = {
      owner,
      repo,
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        insecure_ssl: '0',
      }
    };

    console.log('🛠 STEP 9 — VERIFY WEBHOOK REQUEST BODY (REPAIR)');
    console.log('='.repeat(60));
    console.log(JSON.stringify(payload, null, 2));
    console.log('='.repeat(60));

    console.log("====================================");
    console.log("🚀 Creating GitHub Webhook");
    console.log("Webhook URL:", webhookUrl);
    console.log("Repository:", repoFullName);
    console.log("====================================");

    const response = await octokit.repos.createHook(payload);
    const newHook = response.data;

    console.log(`   ✅ [Webhook Repair] NEW WEBHOOK CREATED: ID ${newHook.id} | URL: "${webhookUrl}"`);
    await saveConnectedRepo(userId, repoFullName, newHook.id, 'active');
    return { status: 'created', webhookId: newHook.id };
  } catch (err) {
    console.error(`   ❌ [Webhook Repair Error] Creation failed:`);
    if (err.response) {
      console.error(`GitHub API Status Code: ${err.response.status}`);
      console.error(`GitHub API Error Data:`, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
    throw new Error(`Failed to create new webhook: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Controller endpoint to repair all connected repositories for the user (STEP 8 & 9)
 */
export const repairAllWebhooks = async (req, res) => {
  console.log('\n====================================');
  console.log('🔧 WEBHOOK REPAIR SYSTEM STARTED');
  console.log('====================================');

  try {
    // 1. Fetch user token
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0 || !userRes.rows[0].github_access_token) {
      return res.status(401).json({ error: 'GitHub access token not found. Please log in again.' });
    }

    const token = userRes.rows[0].github_access_token;
    const octokit = new Octokit({ auth: token });

    // 2. Fetch connected repo registers from DB
    const connectedRes = await pool.query(
      'SELECT repository_name FROM connected_repositories WHERE user_id = $1',
      [req.user.id]
    );

    if (connectedRes.rows.length === 0) {
      console.log('   ℹ️  No repositories currently connected to repair.');
      return res.status(200).json({ success: true, message: 'No connected repositories registered.', results: [] });
    }

    const results = [];
    for (const row of connectedRes.rows) {
      const repoFullName = row.repository_name;
      try {
        const repairRes = await repairRepositoryWebhook(req.user.id, repoFullName, octokit);
        results.push({
          repo: repoFullName,
          status: 'success',
          action: repairRes.status,
          webhookId: repairRes.webhookId
        });
      } catch (err) {
        results.push({
          repo: repoFullName,
          status: 'failed',
          error: err.message
        });
      }
    }

    console.log('\n====================================');
    console.log('✅ WEBHOOK REPAIR SYSTEM COMPLETED');
    console.log('====================================\n');

    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('❌ Critical webhook repair pipeline crash:', err.message);
    res.status(500).json({ error: `Critical webhook repair pipeline failure: ${err.message}` });
  }
};

/**
 * Auto-connect ALL user repositories (triggered from UI button / manual sync)
 * POST /api/github/auto-connect-all
 */
export const autoConnectAllRepos = async (req, res) => {
  console.log('\n====================================');
  console.log('🤖 AUTO-CONNECT ALL REPOS TRIGGERED');
  console.log('====================================');

  try {
    const userRes = await pool.query('SELECT github_access_token FROM users WHERE id = $1', [req.user.id]);
    const token = userRes.rows[0]?.github_access_token;

    if (!token) {
      return res.status(401).json({ error: 'GitHub access token not found. Please log in with GitHub again.' });
    }

    console.log(`🔑 [Auto-Connect] GitHub Access Token: EXISTS (${token.length} chars)`);

    const octokit = new Octokit({ auth: token });

    // Verify scopes
    let scopes = '';
    try {
      const authRes = await octokit.users.getAuthenticated();
      scopes = authRes.headers['x-oauth-scopes'] || '';
      console.log(`🔐 [Auto-Connect] OAuth Scopes: "${scopes}"`);
      if (!scopes.includes('admin:repo_hook')) {
        return res.status(403).json({
          error: 'Missing required OAuth scope: admin:repo_hook',
          details: 'Please log out and log back in with GitHub to grant webhook permissions.',
          scopes
        });
      }
    } catch (scopeErr) {
      console.warn('[Auto-Connect] Could not verify scopes:', scopeErr.message);
    }

    const backendUrl = (process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').trim().replace(/\/$/, '');
    const webhookUrl = `${backendUrl}/api/webhooks/github`;
    console.log(`🌐 [Auto-Connect] Webhook URL: "${webhookUrl}"`);

    if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
      return res.status(400).json({
        error: 'BACKEND_URL is configured to localhost. GitHub cannot deliver webhooks to local servers.',
        isLocalhost: true
      });
    }

    // Fetch all repos
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
    });

    console.log(`📦 [Auto-Connect] Found ${repos.length} repositories to process.`);

    const results = [];

    for (const repo of repos) {
      const owner = repo.owner.login;
      const repoName = repo.name;
      const repoFullName = repo.full_name;

      if (!repo.permissions?.admin) {
        results.push({ repo: repoFullName, status: 'skipped', reason: 'no admin permission' });
        continue;
      }

      try {
        console.log(`\n====================================`);
        console.log(`🚀 Creating Webhook`);
        console.log(`Repository: ${repoFullName}`);
        console.log(`Webhook URL: ${webhookUrl}`);
        console.log(`====================================`);

        const { data: existingHooks } = await octokit.repos.listWebhooks({ owner, repo: repoName, per_page: 100 });

        // Remove stale/outdated hooks
        const staleHooks = existingHooks.filter(
          h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github'))
            && h.config?.url !== webhookUrl
        );
        for (const stale of staleHooks) {
          console.log(`   🧹 Removing stale hook ID ${stale.id}: "${stale.config?.url}"`);
          await octokit.repos.deleteHook({ owner, repo: repoName, hook_id: stale.id }).catch(() => {});
        }

        // Check for existing valid hook
        const validHook = existingHooks.find(h => h.config?.url === webhookUrl);
        if (validHook) {
          console.log(`   ✅ Webhook already active for ${repoFullName} (ID: ${validHook.id})`);
          await saveConnectedRepo(req.user.id, repoFullName, validHook.id, 'active');
          results.push({ repo: repoFullName, status: 'connected', webhookId: validHook.id, message: 'Webhook already active.' });
          continue;
        }

        // Create fresh webhook
        const response = await octokit.repos.createHook({
          owner,
          repo: repoName,
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            insecure_ssl: '0',
          },
        });

        const hook = response.data;
        console.log(`   ✅ Webhook Created Successfully`);
        console.log(`   Webhook ID: ${hook.id} | URL: ${hook.config?.url} | Active: ${hook.active}`);

        await saveConnectedRepo(req.user.id, repoFullName, hook.id, 'active');
        results.push({ repo: repoFullName, status: 'created', webhookId: hook.id, message: 'Webhook created successfully.' });
      } catch (err) {
        console.error(`   ❌ Webhook Creation Failed for ${repoFullName}:`, err.response?.data || err.message);
        results.push({ repo: repoFullName, status: 'failed', error: err.response?.data?.message || err.message });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const connected = results.filter(r => r.status === 'connected').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`\n✅ [Auto-Connect] Complete: ${created} created, ${connected} already active, ${skipped} skipped, ${failed} failed.`);

    res.status(200).json({
      success: true,
      summary: { created, connected, skipped, failed, total: repos.length },
      results
    });
  } catch (err) {
    console.error('❌ [Auto-Connect] Critical failure:', err.message);
    res.status(500).json({ error: `Auto-connect failed: ${err.message}` });
  }
};
