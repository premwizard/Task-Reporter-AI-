import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../database/db.js';

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
