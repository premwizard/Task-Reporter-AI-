import { Server } from 'socket.io';

let io = null;

/**
 * Initialise Socket.IO on the given HTTP server.
 * Call once from server.js after creating the http.Server.
 */
export function initSocketIO(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',          // allow all origins in dev; restrict in production
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.IO] ✅ Client connected    — id: ${socket.id}`);

        socket.on('disconnect', (reason) => {
            console.log(`[Socket.IO] ❌ Client disconnected — id: ${socket.id} | reason: ${reason}`);
        });
    });

    console.log('[Socket.IO] Server initialised and ready.');
    return io;
}

/**
 * Returns the initialised Socket.IO instance.
 * Safe to call from any module after initSocketIO() has run.
 */
export function getIO() {
    if (!io) {
        // Non-fatal: if called before init (e.g. during tests), return a no-op stub
        console.warn('[Socket.IO] getIO() called before initSocketIO() — emits will be skipped.');
        return { emit: () => {} };
    }
    return io;
}
