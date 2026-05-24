import express from 'express';
import { handleGithubWebhook } from '../controllers/githubWebhookController.js';
import { pool } from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// STEP 5 — WEBHOOK ROUTE DEBUGGING MIDDLEWARE
router.use('/github', (req, res, next) => {
  console.log('\n====================================');
  console.log('🔥 WEBHOOK ROUTE HIT');
  console.log('====================================');
  console.log(`⏰ Time        : ${new Date().toISOString()}`);
  console.log(`📡 Method      : ${req.method}`);
  console.log(`📬 Event Header: ${req.headers['x-github-event'] || 'none'}`);
  console.log(`📦 Signature   : ${req.headers['x-hub-signature-256'] || 'none'}`);
  console.log(`🔌 ContentType : ${req.headers['content-type']}`);
  console.log(`💻 Body Keys   : ${JSON.stringify(Object.keys(req.body || {}))}`);
  if (req.body?.repository) {
    console.log(`📦 Repository  : ${req.body.repository.full_name}`);
  }
  if (Array.isArray(req.body?.commits)) {
    console.log(`💬 Commits Count: ${req.body.commits.length}`);
  }
  console.log('====================================\n');
  next();
});

// POST /api/webhooks/github -> GitHub Webhook event receiver
router.post('/github', handleGithubWebhook);

// GET /api/webhooks/test -> Diagnostic endpoint
router.get('/test', (req, res) => {
  const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').trim();
  const isLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');

  res.status(200).json({
    success: true,
    webhook_route_working: true,
    tunnel_url: backendUrl,
    is_localhost: isLocalhost,
    timestamp: new Date().toISOString()
  });
});

// GET /api/webhooks/status -> Webhook health check (Step 13)
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').trim().replace(/\/$/, '');
    const webhookUrl = `${backendUrl}/api/webhooks/github`;
    const isLocalhost = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');

    // Count connected repositories for this user
    const connectedRes = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
       FROM connected_repositories WHERE user_id = $1`,
      [req.user.id]
    );

    const stats = connectedRes.rows[0];

    // Count recent activities in last 24h
    const activityRes = await pool.query(
      `SELECT COUNT(*) as recent FROM activities
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      webhook_url: webhookUrl,
      webhook_reachable: !isLocalhost,
      is_production_url: !isLocalhost,
      connected_repos: parseInt(stats.total),
      active_webhooks: parseInt(stats.active_count),
      recent_activities_24h: parseInt(activityRes.rows[0].recent),
      backend_url: backendUrl,
      timestamp: new Date().toISOString(),
      status: isLocalhost ? 'warning' : 'healthy',
      message: isLocalhost
        ? 'BACKEND_URL is set to localhost. GitHub cannot deliver webhooks to local servers.'
        : 'Webhook endpoint is configured and reachable from GitHub.'
    });
  } catch (err) {
    console.error('[Webhook Status] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
