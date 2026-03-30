import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import { logger } from '../utils/logger';
import equipmentsRouter from './routes/equipments';
import eventsRouter from './routes/events';
import settingsRouter from './routes/settings';
import healthRouter from './routes/health';

export const app: Application = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use('/api/equipments', equipmentsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/health', healthRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

export function startServer(httpServer: http.Server): void {
  logger.info('Express server configured and mounted');
}
