"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventQueueService = exports.EventQueueService = void 0;
const uuid_1 = require("uuid");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const websocket_1 = require("../../utils/websocket");
const config_1 = require("../../config");
// Exponential backoff delays in milliseconds (indexed by retry_count)
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000, 300000, 300000, 300000, 300000, 300000];
class EventQueueService {
    constructor() {
        this.processingLoopTimer = null;
        this.cleanupTimer = null;
        this.aprisoService = null;
    }
    setAprisoService(svc) {
        this.aprisoService = svc;
    }
    enqueue(event) {
        const id = (0, uuid_1.v4)();
        const now = Math.floor(Date.now() / 1000);
        const stmt = database_1.db.prepare(`
      INSERT INTO event_queue (id, type, equipment_id, equipment_name, payload, status, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)
    `);
        stmt.run(id, event.type, event.equipment_id, event.equipment_name, JSON.stringify(event.payload), now);
        logger_1.logger.info(`Event enqueued: ${id} type=${event.type} equipment=${event.equipment_name}`);
        (0, websocket_1.broadcast)('event_queued', {
            id,
            type: event.type,
            equipmentId: event.equipment_id,
            equipmentName: event.equipment_name,
            status: 'PENDING',
        });
    }
    async processQueue() {
        if (!this.aprisoService) {
            logger_1.logger.warn('EventQueueService: AprisoService not set, skipping queue processing');
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        // Fetch PENDING events that are ready to process
        const events = database_1.db.prepare(`
      SELECT * FROM event_queue
      WHERE status = 'PENDING'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT 50
    `).all(now);
        if (events.length === 0)
            return;
        logger_1.logger.debug(`Processing ${events.length} queued events`);
        for (const event of events) {
            await this.processEvent(event);
        }
    }
    async processEvent(event) {
        if (!this.aprisoService)
            return;
        // Mark as SENDING
        database_1.db.prepare(`UPDATE event_queue SET status = 'SENDING' WHERE id = ?`).run(event.id);
        (0, websocket_1.broadcast)('event_status_changed', { id: event.id, status: 'SENDING' });
        try {
            if (event.type === 'MACHINE_STATUS') {
                await this.aprisoService.publishMachineStatus(event);
            }
            else if (event.type === 'COUNTER') {
                await this.aprisoService.publishCounter(event);
            }
            const sentAt = Math.floor(Date.now() / 1000);
            database_1.db.prepare(`
        UPDATE event_queue SET status = 'SENT', sent_at = ?, error_message = NULL WHERE id = ?
      `).run(sentAt, event.id);
            logger_1.logger.info(`Event sent successfully: ${event.id} type=${event.type} equipment=${event.equipment_name}`);
            (0, websocket_1.broadcast)('event_status_changed', { id: event.id, status: 'SENT', sentAt });
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const newRetryCount = event.retry_count + 1;
            if (newRetryCount >= config_1.config.queue.maxRetries) {
                database_1.db.prepare(`
          UPDATE event_queue
          SET status = 'FAILED', retry_count = ?, error_message = ?, next_retry_at = NULL
          WHERE id = ?
        `).run(newRetryCount, errorMessage, event.id);
                logger_1.logger.error(`Event permanently failed after ${newRetryCount} retries: ${event.id} - ${errorMessage}`);
                (0, websocket_1.broadcast)('event_status_changed', { id: event.id, status: 'FAILED', retryCount: newRetryCount, error: errorMessage });
            }
            else {
                const delayMs = RETRY_DELAYS_MS[Math.min(event.retry_count, RETRY_DELAYS_MS.length - 1)];
                const nextRetryAt = Math.floor((Date.now() + delayMs) / 1000);
                database_1.db.prepare(`
          UPDATE event_queue
          SET status = 'PENDING', retry_count = ?, next_retry_at = ?, error_message = ?
          WHERE id = ?
        `).run(newRetryCount, nextRetryAt, errorMessage, event.id);
                logger_1.logger.warn(`Event retry scheduled: ${event.id} attempt=${newRetryCount} next_retry_in=${delayMs}ms - ${errorMessage}`);
                (0, websocket_1.broadcast)('event_status_changed', {
                    id: event.id,
                    status: 'PENDING',
                    retryCount: newRetryCount,
                    nextRetryAt,
                    error: errorMessage,
                });
            }
        }
    }
    startProcessingLoop() {
        const intervalMs = config_1.config.queue.processingIntervalMs;
        logger_1.logger.info(`Starting event queue processing loop (interval: ${intervalMs}ms)`);
        this.processingLoopTimer = setInterval(() => {
            this.processQueue().catch((err) => {
                logger_1.logger.error(`Queue processing loop error: ${err instanceof Error ? err.message : String(err)}`);
            });
        }, intervalMs);
        // Run cleanup on startup
        this.cleanup();
        // Schedule cleanup every hour
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);
    }
    stopProcessingLoop() {
        if (this.processingLoopTimer) {
            clearInterval(this.processingLoopTimer);
            this.processingLoopTimer = null;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    cleanup() {
        const retentionSeconds = config_1.config.queue.retentionHours * 3600;
        const cutoffTime = Math.floor(Date.now() / 1000) - retentionSeconds;
        const result = database_1.db.prepare(`
      DELETE FROM event_queue WHERE status = 'SENT' AND sent_at < ?
    `).run(cutoffTime);
        if (result.changes > 0) {
            logger_1.logger.info(`Queue cleanup: removed ${result.changes} old SENT events`);
        }
    }
    getStats() {
        const rows = database_1.db.prepare(`
      SELECT status, COUNT(*) as count FROM event_queue GROUP BY status
    `).all();
        const stats = { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 };
        for (const row of rows) {
            const status = row.status.toLowerCase();
            if (status in stats) {
                stats[status] = row.count;
            }
            stats.total += row.count;
        }
        return stats;
    }
}
exports.EventQueueService = EventQueueService;
exports.eventQueueService = new EventQueueService();
//# sourceMappingURL=EventQueueService.js.map