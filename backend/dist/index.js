"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const migrations_1 = require("./db/migrations");
const websocket_1 = require("./utils/websocket");
const server_1 = require("./api/server");
const OpcUaService_1 = require("./services/opcua/OpcUaService");
const AprisoService_1 = require("./services/apriso/AprisoService");
const EventQueueService_1 = require("./services/queue/EventQueueService");
const CounterScheduler_1 = require("./scheduler/CounterScheduler");
async function main() {
    logger_1.logger.info('Machine Connector starting up...');
    logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
    // Run DB migrations
    (0, migrations_1.runMigrations)();
    // Wire up Apriso service into the queue
    EventQueueService_1.eventQueueService.setAprisoService(AprisoService_1.aprisoService);
    // Create HTTP server
    const httpServer = http_1.default.createServer(server_1.app);
    // Initialize WebSocket server
    (0, websocket_1.initWebSocketServer)(httpServer);
    // Start HTTP server
    await new Promise((resolve) => {
        httpServer.listen(config_1.config.port, () => {
            logger_1.logger.info(`HTTP server listening on port ${config_1.config.port}`);
            resolve();
        });
    });
    // Start event queue processing
    EventQueueService_1.eventQueueService.startProcessingLoop();
    // Start OPC-UA service (non-blocking - reconnects automatically)
    OpcUaService_1.opcUaService.start().catch((err) => {
        logger_1.logger.error(`OPC-UA initial start error: ${err.message}`);
    });
    // Start IIH counter scheduler
    (0, CounterScheduler_1.startScheduler)();
    logger_1.logger.info('Machine Connector started successfully');
}
async function gracefulShutdown(signal) {
    logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
        await OpcUaService_1.opcUaService.stop();
        EventQueueService_1.eventQueueService.stopProcessingLoop();
        logger_1.logger.info('Graceful shutdown complete');
    }
    catch (err) {
        logger_1.logger.error(`Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(0);
}
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT').catch(() => process.exit(1)); });
process.on('uncaughtException', (err) => {
    logger_1.logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
main().catch((err) => {
    logger_1.logger.error(`Fatal startup error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map