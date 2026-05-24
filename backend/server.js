import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';

import webhookRoutes from './routes/webhookRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import summaryRoutes from './routes/summaryRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import authRoutes from './routes/authRoutes.js';
import githubRoutes from './routes/githubRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import taskRoutes from './routes/taskRoutes.js';

import { initPassport } from './config/passport.js';
import { initSocketIO } from './socket.js';
import { initCronJobs } from './cron/reportScheduler.js';
import { initDatabase } from './database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server (required for Socket.IO)
const httpServer = http.createServer(app);

// Attach Socket.IO
initSocketIO(httpServer);

// Configure Passport
initPassport();

// Core Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://task-reporter-ai.vercel.app',
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Express Session (required for Passport GitHub Strategy)
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_session_key_98765',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Authentication Routes (GET /auth/github, GET /auth/github/callback, GET /auth/me, POST /auth/logout)
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

// Webhook payload endpoint (receives push events from GitHub hooks)
app.use('/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhook', webhookRoutes);

// Protected APIs (Repositories, Activities, Reports, AI Summaries, Exports)
app.use('/api/github', githubRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/ai-summary', summaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', employeeRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/tasks', taskRoutes);

// Health Check
app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Server is running normally.' });
});

app.get('/api/health', (req, res) => {
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').trim();
    res.json({
        success: true,
        backend_url: backendUrl,
        webhook_url: `${backendUrl}/api/webhooks/github`,
        timestamp: new Date().toISOString()
    });
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
            console.log('====================================');
            console.log(`🚀 GitIntel Backend Running on port ${PORT}`);
            console.log(`📡 FRONTEND_URL is set to: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
            console.log('====================================');
            initCronJobs();
        });
    } catch (err) {
        console.error("❌ Failed to initialize database schema. Server startup aborted.", err);
        process.exit(1);
    }
};

startServer();
