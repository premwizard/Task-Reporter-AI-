import express from 'express';
import passport from 'passport';
import { handleGithubCallback, getMe, logout, register, login } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /auth/register -> Registers a new user locally
router.post('/register', register);

// POST /auth/login -> Logs in a user locally
router.post('/login', login);

// GET /auth/github -> Redirects user to GitHub for Authentication
router.get('/github', (req, res, next) => {
  const callbackUrl = `${(process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com').replace(/\/$/, "")}/auth/github/callback`;
  console.log("\n🚀 STARTING GITHUB LOGIN");
  console.log("====================================");
  console.log("Callback URL (redirect_uri):", callbackUrl);
  console.log("Frontend URL:", process.env.FRONTEND_URL || 'http://localhost:3000');
  console.log("Backend URL:", process.env.BACKEND_URL);
  console.log("====================================\n");
  next();
}, passport.authenticate('github', { scope: ['user:email', 'admin:repo_hook', 'repo'] }));

// GET /auth/github/callback -> Handles Callback
router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, "")}/login?error=auth_failed`, session: false }),
  handleGithubCallback
);

// GET /auth/me -> Returns authenticated user info
router.get('/me', authenticateToken, getMe);

// POST /auth/logout -> Clears cookies and logs user out
router.post('/logout', authenticateToken, logout);

export default router;
