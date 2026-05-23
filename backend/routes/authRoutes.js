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
router.get('/github', passport.authenticate('github', { scope: ['user:email', 'admin:repo_hook', 'repo'] }));

// GET /auth/github/callback -> Handles Callback
router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: 'http://localhost:3000/login?error=auth_failed', session: false }),
  handleGithubCallback
);

// GET /auth/me -> Returns authenticated user info
router.get('/me', authenticateToken, getMe);

// POST /auth/logout -> Clears cookies and logs user out
router.post('/logout', authenticateToken, logout);

export default router;
