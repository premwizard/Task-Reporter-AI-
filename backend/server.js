import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import webhookRoutes from './routes/webhookRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import summaryRoutes from './routes/summaryRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import githubAppRoutes from './routes/githubAppRoutes.js';
import pullRequestRoutes from './routes/pullRequestRoutes.js';
import standupRoutes from './routes/standupRoutes.js';

import { initPassport } from './config/passport.js';
import { initSocketIO } from './socket.js';
import { initCronJobs } from './cron/reportScheduler.js';
import { initDatabase, pool } from './database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server (required for Socket.IO)
const httpServer = http.createServer(app);

// Attach Socket.IO
initSocketIO(httpServer);

// Configure Passport
initPassport();

// STEP 13 — ADD SECURITY HEADERS (helmet)
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://task-reporter-ai.onrender.com", "wss://task-reporter-ai.onrender.com"]
        }
    } : false
}));

// STEP 2 — FIX CORS FOR PRODUCTION (Allow dynamic frontend URLs securely)
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = isProduction
    ? [ (process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app').trim().replace(/\/$/, '') ]
    : [
        'https://task-reporter-ai.vercel.app',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
    ];

if (!isProduction && process.env.FRONTEND_URL) {
    const envOrigin = process.env.FRONTEND_URL.trim().replace(/\/$/, '');
    if (!allowedOrigins.includes(envOrigin)) {
        allowedOrigins.push(envOrigin);
    }
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, native curl)
        if (!origin) return callback(null, true);
        
        const cleanOrigin = origin.trim().replace(/\/$/, '');
        if (allowedOrigins.includes(cleanOrigin)) {
            return callback(null, true);
        }
        
        console.warn(`[CORS Blocked] Request from origin: ${origin} blocked.`);
        return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(cookieParser());

// Express JSON body parser with rawBody retention for webhook signature validation (Step 14)
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// STEP 3 — FIX COOKIE + SESSION CONFIG
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_session_key_98765',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// STEP 12 — ADD RATE LIMITING
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
    skip: (req) => {
        // Exclude webhooks from strict rate limits to prevent dropping GitHub deliveries
        return req.originalUrl.includes('/webhook') || req.originalUrl.includes('/api/webhook');
    }
});
app.use('/api/', apiLimiter);

// Clean request logger: only log in development or critical events in production (Step 5)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
        next();
    });
}

// Authentication Routes
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

// Webhook payload endpoint
app.use('/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhook', webhookRoutes);

// Protected APIs
app.use('/api/activities', activityRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/ai-summary', summaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', employeeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/github-app', githubAppRoutes);
app.use('/api/pull-requests', pullRequestRoutes);
app.use('/api/ai', standupRoutes);

// STEP 16 — ADD HEALTH CHECK ENDPOINTS
app.get('/health', async (req, res) => {
    try {
        // Audit DB connection
        await pool.query('SELECT 1');
        res.status(200).json({
            status: 'healthy',
            database: 'connected',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const dbCheck = await pool.query('SELECT COUNT(*) as total_users FROM users');
        res.status(200).json({
            success: true,
            status: 'online',
            environment: process.env.NODE_ENV || 'development',
            database: 'connected',
            user_count: parseInt(dbCheck.rows[0]?.total_users || 0),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 'degraded',
            database: 'disconnected',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/', (req, res) => {
    res.send('AI-Powered GitHub Engineering Intelligence API is running...');
});

// Start Server
const startServer = async () => {
    try {
        console.log("⏳ Initializing database schema...");
        await initDatabase();
        
        httpServer.listen(PORT, () => {
            console.log(`🚀 GitIntel Backend Running on port ${PORT}`);
            console.log("NODE_ENV:", process.env.NODE_ENV || 'development');
            console.log("FRONTEND_URL:", process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app');
            console.log("BACKEND_URL:", process.env.BACKEND_URL || 'https://task-reporter-ai.onrender.com');
            console.log('====================================');
            initCronJobs();
        });
    } catch (err) {
        console.error("❌ Failed to initialize database schema. Server startup aborted.", err);
        process.exit(1);
    }
};

startServer();
