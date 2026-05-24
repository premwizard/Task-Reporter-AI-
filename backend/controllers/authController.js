import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../database/db.js';
import { Octokit } from '@octokit/rest';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_token_key_12345';

/**
 * Register a new user with email and password
 */
export const register = async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default first user to admin, others to developer
    const countRes = await pool.query('SELECT count(*) FROM users');
    const isFirstUser = parseInt(countRes.rows[0].count) === 0;
    const userRole = role || (isFirstUser ? 'admin' : 'developer');

    // Insert user
    const insertRes = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, passwordHash, first_name, last_name, userRole]
    );

    const user = insertRes.rows[0];

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`[Register Success] User "${user.email}" registered locally. Role: ${user.role}`);
    return res.status(201).json({ ...user, token });
  } catch (err) {
    console.error('[Register Error] Error during local registration:', err);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
};

/**
 * Login user with email and password
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const selectRes = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, github_avatar, github_username FROM users WHERE email = $1',
      [email]
    );

    if (selectRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = selectRes.rows[0];

    // If local user has no password (e.g. GitHub OAuth only), but tries email login
    if (!user.password_hash) {
      return res.status(400).json({ error: 'This email is registered via GitHub. Please sign in with GitHub.' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        github_username: user.github_username,
        github_avatar: user.github_avatar,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`[Login Success] User "${user.email}" logged in locally. Role: ${user.role}`);
    
    // Remove password_hash from response
    delete user.password_hash;
    return res.status(200).json({ ...user, token });
  } catch (err) {
    console.error('[Login Error] Error during local login:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
};

/**
 * AUTO-CONNECT: Automatically fetches all user repos and creates webhooks.
 * Runs in background after OAuth login — never blocks the redirect.
 */
async function autoConnectAllReposAfterLogin(user) {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 [Auto-Connect] Starting post-login webhook setup');
  console.log(`👤 User: ${user.github_username} (ID: ${user.id})`);
  console.log('='.repeat(60));

  try {
    // Fetch latest access token from DB
    const userRes = await pool.query(
      'SELECT github_access_token FROM users WHERE id = $1',
      [user.id]
    );
    const token = userRes.rows[0]?.github_access_token;

    console.log(`🔑 [Auto-Connect] GitHub Access Token: ${token ? 'EXISTS (' + token.length + ' chars)' : 'MISSING ❌'}`);
    if (!token) {
      console.error('[Auto-Connect] ❌ No access token found — cannot create webhooks.');
      return;
    }

    const octokit = new Octokit({ auth: token });

    // STEP 5 — VERIFY ACCESS TOKEN
    try {
      const gitUser = await octokit.request("GET /user");
      console.log("Authenticated GitHub User:", gitUser.data.login);
      
      const scopes = gitUser.headers['x-oauth-scopes'] || '';
      console.log(`🔐 [Auto-Connect] OAuth Scopes: "${scopes}"`);
      if (!scopes.includes('admin:repo_hook')) {
        console.warn(`🚨 [Auto-Connect] WARNING: "admin:repo_hook" scope missing — webhook creation will fail!`);
        console.warn(`   → User must log out and log in again to grant admin:repo_hook scope.`);
        return;
      }
    } catch (scopeErr) {
      console.error('[Auto-Connect] ❌ Failed to verify authenticated user/scopes:', scopeErr.message);
    }

    // STEP 8 — VERIFY BACKEND_URL
    console.log("BACKEND_URL:", process.env.BACKEND_URL);
    const backendUrl = (process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').trim().replace(/\/$/, '');
    const webhookUrl = `${backendUrl}/api/webhooks/github`;
    console.log(`🌐 [Auto-Connect] Webhook URL: "${webhookUrl}"`);

    if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
      console.error('[Auto-Connect] ❌ BACKEND_URL is localhost — GitHub cannot reach local servers. Skipping auto-connect.');
      return;
    }

    // Fetch all repos for the user
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
    });
    console.log(`📦 [Auto-Connect] Found ${repos.length} repositories to process.`);

    let connected = 0;
    let skipped = 0;
    let failed = 0;

    for (const repo of repos) {
      const owner = repo.owner.login;
      const repoName = repo.name;
      const repoFullName = repo.full_name;

      // STEP 6 — VERIFY REPOSITORY PERMISSIONS
      console.log(`Permissions for ${repoFullName}:`, repo.permissions);
      
      // Only process repos where the user has admin access (required for webhook creation)
      if (!repo.permissions?.admin) {
        console.log(`   ⏭️  [Auto-Connect] Skipping ${repoFullName} — no admin permission.`);
        await saveConnectedRepoAuth(user.id, repoFullName, repoName, null, false, 'Permission Missing (Admin required)');
        skipped++;
        continue;
      }

      // STEP 2 — ADD EXTREME DEBUG LOGGING
      console.log("====================================");
      console.log("🚀 STARTING WEBHOOK CREATION");
      console.log("Repository:", repoFullName);
      console.log("Repository Owner:", owner);
      console.log("Webhook URL:", webhookUrl);
      console.log("Access Token Exists:", !!token);
      console.log("====================================");

      try {
        // Fetch existing hooks to clean up old ones and prevent duplicates
        const { data: existingHooks } = await octokit.request("GET /repos/{owner}/{repo}/hooks", {
          owner,
          repo: repoName,
          per_page: 100
        });

        // Clean up outdated/stale hooks (localhost, old tunnel URLs)
        const staleHooks = existingHooks.filter(
          h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github'))
            && h.config?.url !== webhookUrl
        );
        for (const staleHook of staleHooks) {
          console.log(`   🧹 [Auto-Connect] Removing stale hook ID ${staleHook.id}: "${staleHook.config?.url}"`);
          await octokit.request("DELETE /repos/{owner}/{repo}/hooks/{hook_id}", {
            owner,
            repo: repoName,
            hook_id: staleHook.id
          }).catch(() => {});
        }

        // Check if a valid hook already exists
        const existingValidHook = existingHooks.find(h => h.config?.url === webhookUrl);
        if (existingValidHook) {
          console.log(`   ✅ [Auto-Connect] Webhook already active for ${repoFullName} (ID: ${existingValidHook.id})`);
          await saveConnectedRepoAuth(user.id, repoFullName, repoName, String(existingValidHook.id), true, null);
          skipped++;
          continue;
        }

        // STEP 7 — VERIFY WEBHOOK API CALL
        const response = await octokit.request(
          "POST /repos/{owner}/{repo}/hooks",
          {
            owner,
            repo: repoName,
            name: "web",
            active: true,
            events: ["push"],
            config: {
              url: webhookUrl,
              content_type: "json",
              insecure_ssl: "0"
            }
          }
        );

        // STEP 3 — LOG GITHUB API RESPONSE
        console.log("✅ WEBHOOK CREATED SUCCESSFULLY");
        console.log(response.data);

        const hook = response.data;
        await saveConnectedRepoAuth(user.id, repoFullName, repoName, String(hook.id), true, null);
        connected++;

        // STEP 9 — CHECK IF WEBHOOK EXISTS
        try {
          const { data: afterHooks } = await octokit.request("GET /repos/{owner}/{repo}/hooks", {
            owner,
            repo: repoName,
            per_page: 100
          });
          console.log(`🔍 [Verify Hooks] Hooks currently configured for ${repoFullName}:`, afterHooks.map(h => ({ id: h.id, url: h.config?.url, active: h.active })));
        } catch (verifyErr) {
          console.error("⚠️ Failed to fetch hooks for validation:", verifyErr.message);
        }

      } catch (hookErr) {
        // STEP 3 — LOG GITHUB API RESPONSE (FAILURE)
        console.error("❌ WEBHOOK CREATION FAILED");
        console.error(hookErr.response?.status);
        console.error(hookErr.response?.data);
        console.error(hookErr.message);

        const errMsg = hookErr.response?.data?.message || hookErr.message;
        await saveConnectedRepoAuth(user.id, repoFullName, repoName, null, false, errMsg);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ [Auto-Connect] Complete: ${connected} created, ${skipped} skipped, ${failed} failed.`);
    console.log('='.repeat(60) + '\n');
  } catch (err) {
    console.error('[Auto-Connect] ❌ Critical failure in auto-connect pipeline:', err.message);
  }
}

/**
 * DB helper for auth controller (isolated to avoid circular imports)
 */
async function saveConnectedRepoAuth(userId, repoFullName, repoName, webhookId, isCreated, errorMessage) {
  try {
    const statusVal = isCreated ? 'active' : (errorMessage && errorMessage.includes('Permission') ? 'warning' : 'failed');
    
    // Save to connected_repositories
    await pool.query(
      `INSERT INTO connected_repositories (user_id, repository_name, repo_name, webhook_id, webhook_created, status, error_message, last_sync, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, repository_name)
       DO UPDATE SET repo_name = $3, webhook_id = $4, webhook_created = $5, status = $6, error_message = $7, last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [userId, repoFullName, repoName, webhookId ? parseInt(webhookId) : null, isCreated, statusVal, errorMessage]
    );

    // Save to repositories table for dual tracking compatibility
    await pool.query(
      `INSERT INTO repositories (user_id, repo_name, repo_full_name, webhook_id, webhook_created, error_message, last_sync, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, repoName, repoFullName, webhookId, isCreated, errorMessage]
    ).catch(() => {}); // catch ignore if repositories table fails

  } catch (dbErr) {
    console.error(`[Auto-Connect] ❌ DB save failed for ${repoFullName}:`, dbErr.message);
  }
}


/**
 * Handle successful GitHub authentication callback
 * Signs JWT token, sets HTTP-only cookie, and redirects user to frontend dashboard
 */
export const handleGithubCallback = (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      console.error('[OAuth Callback] No user found on request object');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app'}/login?error=no_user`);
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        github_id: user.github_id,
        github_username: user.github_username,
        github_avatar: user.github_avatar,
        github_email: user.github_email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`[OAuth success] User "${user.github_username}" logged in. Role: ${user.role}`);

    // 🚀 AUTO-CONNECT: Fire webhook creation for ALL repos in background (non-blocking)
    // This is what makes the system fully automatic — no manual setup required.
    setImmediate(() => autoConnectAllReposAfterLogin(user));

    // Redirect to frontend with token parameter
    const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
    res.redirect(`${frontendUrl}/oauth-success?token=${token}`);
  } catch (err) {
    console.error('[OAuth Callback] Error handling login redirect:', err);
    const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
    res.redirect(`${frontendUrl}/login?error=server_error`);
  }
};

/**
 * Get current logged in user details
 */
export const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, github_id, github_username, github_avatar, github_email, role, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User session not found in database' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('[Auth me] Error fetching user profile:', err);
    res.status(500).json({ error: 'Internal server error fetching user profile' });
  }
};

/**
 * Logout user by clearing session cookie
 */
export const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};
