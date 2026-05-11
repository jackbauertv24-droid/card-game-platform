import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import authRoutes from './auth/routes';
import usersRoutes from './users/routes';
import roomsRoutes from './rooms/routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { logRequest } from './utils/logger';
import { config } from './config';
import { setupSocket } from './socket';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://10.4.0.9:5173'],
      credentials: true,
    })
  );

  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logRequest(req.method, req.path, res.statusCode, duration);
    });
    next();
  });

  app.use(rateLimitMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/rooms', roomsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export function startServer(app: express.Application) {
  const httpServer = createServer(app);
  setupSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    console.log(`Socket.io ready for connections`);
  });

  return httpServer;
}
