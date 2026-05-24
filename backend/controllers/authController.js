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

    // Verify scopes
    try {
      const authRes = await octokit.users.getAuthenticated();
      const scopes = authRes.headers['x-oauth-scopes'] || '';
      console.log(`🔐 [Auto-Connect] OAuth Scopes: "${scopes}"`);
      if (!scopes.includes('admin:repo_hook')) {
        console.warn(`🚨 [Auto-Connect] WARNING: "admin:repo_hook" scope missing — webhook creation will fail!`);
        console.warn(`   → User must log out and log in again to grant admin:repo_hook scope.`);
        return;
      }
    } catch (scopeErr) {
      console.error('[Auto-Connect] ❌ Failed to verify scopes:', scopeErr.message);
    }

    // Build webhook URL from env
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

      // Only process repos where the user has admin access (required for webhook creation)
      if (!repo.permissions?.admin) {
        console.log(`   ⏭️  [Auto-Connect] Skipping ${repoFullName} — no admin permission.`);
        skipped++;
        continue;
      }

      try {
        console.log(`\n====================================`);
        console.log(`🚀 Creating Webhook`);
        console.log(`Repository: ${repoFullName}`);
        console.log(`Webhook URL: ${webhookUrl}`);
        console.log(`====================================`);

        // Check existing hooks to prevent duplicates
        const { data: existingHooks } = await octokit.repos.listWebhooks({ owner, repo: repoName, per_page: 100 });

        // Clean up outdated/stale hooks (localhost, old tunnel URLs)
        const staleHooks = existingHooks.filter(
          h => (h.config?.url?.includes('/webhook/github') || h.config?.url?.includes('/webhooks/github'))
            && h.config?.url !== webhookUrl
        );
        for (const staleHook of staleHooks) {
          console.log(`   🧹 [Auto-Connect] Removing stale hook ID ${staleHook.id}: "${staleHook.config?.url}"`);
          await octokit.repos.deleteHook({ owner, repo: repoName, hook_id: staleHook.id }).catch(() => {});
        }

        // Check if a valid hook already exists
        const existingValidHook = existingHooks.find(h => h.config?.url === webhookUrl);
        if (existingValidHook) {
          console.log(`   ✅ [Auto-Connect] Webhook already active for ${repoFullName} (ID: ${existingValidHook.id})`);
          await saveConnectedRepoAuth(user.id, repoFullName, existingValidHook.id, 'active');
          skipped++;
          continue;
        }

        // Create new webhook
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
        console.log(`   Webhook ID     : ${hook.id}`);
        console.log(`   Webhook URL    : ${hook.config?.url}`);
        console.log(`   Active         : ${hook.active}`);
        console.log(`   Events         : ${JSON.stringify(hook.events)}`);

        await saveConnectedRepoAuth(user.id, repoFullName, hook.id, 'active');
        connected++;
      } catch (hookErr) {
        console.error(`   ❌ Webhook Creation Failed for ${repoFullName}:`, hookErr.response?.data || hookErr.message);
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
async function saveConnectedRepoAuth(userId, repoFullName, webhookId, status) {
  try {
    await pool.query(
      `INSERT INTO connected_repositories (user_id, repository_name, webhook_id, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, repository_name)
       DO UPDATE SET webhook_id = $3, status = $4, updated_at = CURRENT_TIMESTAMP`,
      [userId, repoFullName, webhookId, status]
    );
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
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=no_user`);
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
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`[OAuth success] User "${user.github_username}" logged in. Role: ${user.role}`);

    // 🚀 AUTO-CONNECT: Fire webhook creation for ALL repos in background (non-blocking)
    // This is what makes the system fully automatic — no manual setup required.
    setImmediate(() => autoConnectAllReposAfterLogin(user));

    // Redirect to frontend with token parameter
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, "");
    res.redirect(`${frontendUrl}/oauth-success?token=${token}`);
  } catch (err) {
    console.error('[OAuth Callback] Error handling login redirect:', err);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, "");
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
  console.log(`[Logout] Clearing cookie for user ID: ${req.user?.id || 'unknown'}`);
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};
