import express from 'express';
import { handleGithubWebhook } from '../controllers/githubWebhookController.js';

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

// POST /webhook/github -> GitHub Webhook event receiver
router.post('/github', handleGithubWebhook);

// STEP 10 — GET /webhook/test -> Diagnostic endpoint
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

export default router;
