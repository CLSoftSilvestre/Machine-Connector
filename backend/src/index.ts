import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { runMigrations } from './db/migrations';
import { initWebSocketServer } from './utils/websocket';
import { app } from './api/server';
import { opcUaService } from './services/opcua/OpcUaService';
import { aprisoService } from './services/apriso/AprisoService';
import { eventQueueService } from './services/queue/EventQueueService';
import { startScheduler } from './scheduler/CounterScheduler';

async function main(): Promise<void> {
  logger.info('Machine Connector starting up...');
  logger.info(`Environment: ${config.nodeEnv}`);

  // Run DB migrations
  runMigrations();

  // Wire up Apriso service into the queue
  eventQueueService.setAprisoService(aprisoService);

  // Create HTTP server
  const httpServer = http.createServer(app);

  // Initialize WebSocket server
  initWebSocketServer(httpServer);

  // Start HTTP server
  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, () => {
      logger.info(`HTTP server listening on port ${config.port}`);
      resolve();
    });
  });

  // Start event queue processing
  eventQueueService.startProcessingLoop();

  // Start OPC-UA service (non-blocking - reconnects automatically)
  opcUaService.start().catch((err: Error) => {
    logger.error(`OPC-UA initial start error: ${err.message}`);
  });

  // Start IIH counter scheduler
  startScheduler();

  logger.info('Machine Connector started successfully');
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await opcUaService.stop();
    eventQueueService.stopProcessingLoop();
    logger.info('Graceful shutdown complete');
  } catch (err) {
    logger.error(`Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.exit(0);
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT').catch(() => process.exit(1)); });

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

main().catch((err) => {
  logger.error(`Fatal startup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
