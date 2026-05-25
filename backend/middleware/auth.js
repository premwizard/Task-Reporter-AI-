import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from '../database/db.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_token_key_12345';

export const authenticateToken = (req, res, next) => {
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token is missing or malformed' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token is invalid or has expired' });
    }
    
    req.user = user;
    next();
  });
};

export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: No user session found' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrative access required' });
  }

  next();
};

export const requireGithubAppInstallation = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }
  
  try {
    const result = await pool.query(
      `SELECT 1 FROM github_installations WHERE user_id = $1 OR account_login = $2 LIMIT 1`,
      [req.user.id, req.user.github_username]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ 
        error: 'Forbidden: GitHub App installation required.',
        requires_installation: true
      });
    }
    
    next();
  } catch (err) {
    console.error('❌ [Installation Verification Middleware Error]', err.message);
    res.status(500).json({ error: 'Failed to verify installation status.' });
  }
};
