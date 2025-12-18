import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { router } from './routes.js';
import { initSocket } from './socket.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy is required when deploying to PaaS (Railway, Render, Heroku) 
// to correctly identify the client's IP and protocol.
app.set('trust proxy', 1);

// Create HTTP server for WebSocket integration
const httpServer = createServer(app);

// Initialize Socket.IO with the HTTP server
initSocket(httpServer);

// Middleware
// Configure CORS to allow requests from frontend (env var or wildcard)
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', router);

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'WebToEpub Scraper Engine' });
});

// 404 Handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start Server
// Listen on 0.0.0.0 to ensure accessibility within containerized environments (VPS/PaaS)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});