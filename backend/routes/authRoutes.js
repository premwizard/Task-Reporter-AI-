import express from 'express';
import passport from 'passport';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { handleGithubCallback, getMe, logout, register, login } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../database/db.js';
import { githubApp } from '../config/githubApp.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_token_key_12345';

// POST /auth/register -> Registers a new user locally
router.post('/register', register);

// POST /auth/login -> Logs in a user locally
router.post('/login', login);

// GET /auth/github/start -> Unified Combined Entrypoint Route (Step 2)
router.get('/github/start', (req, res, next) => {
  console.log("\n🚀 [Combined Auth Start] Initiating Unified Onboarding OAuth Flow");
  console.log("====================================");
  
  // Generate secure temporary session state
  const onboardingSessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const stateObj = {
    onboarding_session: onboardingSessionId,
    redirect_intent: 'dashboard',
    timestamp: Date.now()
  };
  
  const encodedState = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  console.log("Generated secure state:", stateObj);
  console.log("Encoded state payload:", encodedState);
  console.log("====================================\n");

  passport.authenticate('github', { 
    scope: ['repo', 'admin:repo_hook', 'read:user', 'user:email'],
    state: encodedState
  })(req, res, next);
});

// GET /auth/github -> Legacy fallback, redirects directly to start
router.get('/github', (req, res) => {
  res.redirect('/auth/github/start');
});

// GET /auth/github/callback -> Handles Callback
router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: `${(process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "")}/login?error=auth_failed`, session: false }),
  handleGithubCallback
);

// GET /auth/github-app/setup -> Handle GitHub App Onboarding Callback automatically (Step 9)
router.get('/github-app/setup', async (req, res) => {
  const { installation_id, setup_action, state } = req.query;
  console.log(`\n🔧 [GitHub App setup callback] Capture installation redirect.`);
  console.log(`Installation ID: ${installation_id}, Action: ${setup_action}, State parameter: ${state}`);
  
  if (!installation_id) {
    console.error("❌ [GitHub App setup callback] Missing installation_id.");
    const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
    return res.redirect(`${frontendUrl}/login?error=no_installation_context`);
  }
  
  try {
    // 1. Decode secure state
    let decodedState = {};
    if (state) {
      try {
        decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        console.log("🔑 [GitHub App Setup] Decoded state contents:", decodedState);
      } catch (err) {
        console.warn("⚠️ [GitHub App Setup] State payload could not be parsed:", err.message);
      }
    }
    
    const userId = decodedState.user_id;
    if (!userId) {
      console.error("❌ [GitHub App setup callback] State does not contain valid user_id.");
      const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
      return res.redirect(`${frontendUrl}/login?error=session_expired`);
    }
    
    // 2. Fetch user from DB
    const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userQuery.rows.length === 0) {
      console.error(`❌ [GitHub App setup callback] User ID ${userId} not found in database.`);
      const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
      return res.redirect(`${frontendUrl}/login?error=user_not_found`);
    }
    const user = userQuery.rows[0];
    
    // 3. Call GitHub App Octokit to get installation details and repositories
    console.log(`🔌 [GitHub App Setup] Fetching repositories accessible to installation ID: ${installation_id}`);
    const appOctokit = await githubApp.getInstallationOctokit(parseInt(installation_id));
    const { data: reposData } = await appOctokit.apps.listReposAccessibleToInstallation();
    const repositories = reposData.repositories || [];
    
    // 4. Retrieve details about this installation from GitHub API
    const { data: instDetails } = await appOctokit.apps.getInstallation({ installation_id: parseInt(installation_id) });
    const accountLogin = instDetails.account.login;
    const accountType = instDetails.account.type;
    
    console.log(`💡 [GitHub App Setup] Found installation details. Owner: ${accountLogin} (${accountType}), Accessible repos: ${repositories.length}`);
    
    // 5. Store installation Details in PostgreSQL DB
    const insertQuery = `
      INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repositories, github_username, installed_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (installation_id)
      DO UPDATE SET user_id = $1, account_login = $3, account_type = $4, repositories = $5, github_username = $6, installed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    await pool.query(insertQuery, [user.id, parseInt(installation_id), accountLogin, accountType, JSON.stringify(repositories), user.github_username]);
    console.log(`✅ [GitHub App Setup] Saved installation details in DB for user ${user.github_username}`);
    
    // 6. Auto-sync repositories to connected_repositories in an active state
    if (repositories.length > 0) {
      console.log(`🔄 [GitHub App Setup] Synchronizing ${repositories.length} repositories to connected_repositories...`);
      for (const repo of repositories) {
        await pool.query(
          `INSERT INTO connected_repositories (user_id, repository_name, repo_name, status)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (user_id, repository_name)
           DO UPDATE SET status = 'active'`,
          [user.id, repo.full_name, repo.name]
        );
      }
    }
    
    // 7. Generate JWT
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
    
    console.log(`🎉 [GitHub App Setup Success] Onboarding completed! Redirecting user to frontend...`);
    const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
    return res.redirect(`${frontendUrl}/oauth-success?token=${token}&onboarding=completed`);
  } catch (err) {
    console.error("❌ [GitHub App Setup Error] Critical error completing onboarding:", err.message);
    const frontendUrl = (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').replace(/\/$/, "");
    return res.redirect(`${frontendUrl}/login?error=onboarding_error`);
  }
});

// GET /auth/me -> Returns authenticated user info
router.get('/me', authenticateToken, getMe);

// POST /auth/logout -> Clears cookies and logs user out
router.post('/logout', authenticateToken, logout);

export default router;
