import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/database';
import { logger } from '../../utils/logger';
import { broadcast } from '../../utils/websocket';
import { config } from '../../config';

export interface QueuedEvent {
  id: string;
  type: 'MACHINE_STATUS' | 'COUNTER';
  equipment_id: string;
  equipment_name: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  retry_count: number;
  next_retry_at?: number;
  created_at: number;
  sent_at?: number;
  error_message?: string;
}

export interface QueueStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  total: number;
}

// Exponential backoff delays in milliseconds (indexed by retry_count)
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000, 300000, 300000, 300000, 300000, 300000];

export class EventQueueService {
  private processingLoopTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private aprisoService: { publishMachineStatus(event: QueuedEvent): Promise<void>; publishCounter(event: QueuedEvent): Promise<void> } | null = null;

  setAprisoService(svc: { publishMachineStatus(event: QueuedEvent): Promise<void>; publishCounter(event: QueuedEvent): Promise<void> }): void {
    this.aprisoService = svc;
  }

  enqueue(event: Omit<QueuedEvent, 'id' | 'status' | 'retry_count' | 'created_at'>): void {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO event_queue (id, type, equipment_id, equipment_name, payload, status, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)
    `);

    stmt.run(id, event.type, event.equipment_id, event.equipment_name, JSON.stringify(event.payload), now);

    logger.info(`Event enqueued: ${id} type=${event.type} equipment=${event.equipment_name}`);

    broadcast('event_queued', {
      id,
      type: event.type,
      equipmentId: event.equipment_id,
      equipmentName: event.equipment_name,
      status: 'PENDING',
    });
  }

  async processQueue(): Promise<void> {
    if (!this.aprisoService) {
      logger.warn('EventQueueService: AprisoService not set, skipping queue processing');
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // Fetch PENDING events that are ready to process
    const events = db.prepare(`
      SELECT * FROM event_queue
      WHERE status = 'PENDING'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT 50
    `).all(now) as QueuedEvent[];

    if (events.length === 0) return;

    logger.debug(`Processing ${events.length} queued events`);

    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: QueuedEvent): Promise<void> {
    if (!this.aprisoService) return;

    // Mark as SENDING
    db.prepare(`UPDATE event_queue SET status = 'SENDING' WHERE id = ?`).run(event.id);
    broadcast('event_status_changed', { id: event.id, status: 'SENDING' });

    try {
      if (event.type === 'MACHINE_STATUS') {
        await this.aprisoService.publishMachineStatus(event);
      } else if (event.type === 'COUNTER') {
        await this.aprisoService.publishCounter(event);
      }

      const sentAt = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE event_queue SET status = 'SENT', sent_at = ?, error_message = NULL WHERE id = ?
      `).run(sentAt, event.id);

      logger.info(`Event sent successfully: ${event.id} type=${event.type} equipment=${event.equipment_name}`);
      broadcast('event_status_changed', { id: event.id, status: 'SENT', sentAt });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const newRetryCount = event.retry_count + 1;

      if (newRetryCount >= config.queue.maxRetries) {
        db.prepare(`
          UPDATE event_queue
          SET status = 'FAILED', retry_count = ?, error_message = ?, next_retry_at = NULL
          WHERE id = ?
        `).run(newRetryCount, errorMessage, event.id);

        logger.error(`Event permanently failed after ${newRetryCount} retries: ${event.id} - ${errorMessage}`);
        broadcast('event_status_changed', { id: event.id, status: 'FAILED', retryCount: newRetryCount, error: errorMessage });
      } else {
        const delayMs = RETRY_DELAYS_MS[Math.min(event.retry_count, RETRY_DELAYS_MS.length - 1)];
        const nextRetryAt = Math.floor((Date.now() + delayMs) / 1000);

        db.prepare(`
          UPDATE event_queue
          SET status = 'PENDING', retry_count = ?, next_retry_at = ?, error_message = ?
          WHERE id = ?
        `).run(newRetryCount, nextRetryAt, errorMessage, event.id);

        logger.warn(`Event retry scheduled: ${event.id} attempt=${newRetryCount} next_retry_in=${delayMs}ms - ${errorMessage}`);
        broadcast('event_status_changed', {
          id: event.id,
          status: 'PENDING',
          retryCount: newRetryCount,
          nextRetryAt,
          error: errorMessage,
        });
      }
    }
  }

  startProcessingLoop(): void {
    const intervalMs = config.queue.processingIntervalMs;
    logger.info(`Starting event queue processing loop (interval: ${intervalMs}ms)`);

    this.processingLoopTimer = setInterval(() => {
      this.processQueue().catch((err) => {
        logger.error(`Queue processing loop error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, intervalMs);

    // Run cleanup on startup
    this.cleanup();

    // Schedule cleanup every hour
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  stopProcessingLoop(): void {
    if (this.processingLoopTimer) {
      clearInterval(this.processingLoopTimer);
      this.processingLoopTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  cleanup(): void {
    const retentionSeconds = config.queue.retentionHours * 3600;
    const cutoffTime = Math.floor(Date.now() / 1000) - retentionSeconds;

    const result = db.prepare(`
      DELETE FROM event_queue WHERE status = 'SENT' AND sent_at < ?
    `).run(cutoffTime);

    if (result.changes > 0) {
      logger.info(`Queue cleanup: removed ${result.changes} old SENT events`);
    }
  }

  getStats(): QueueStats {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM event_queue GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const stats: QueueStats = { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 };

    for (const row of rows) {
      const status = row.status.toLowerCase() as keyof Omit<QueueStats, 'total'>;
      if (status in stats) {
        stats[status] = row.count;
      }
      stats.total += row.count;
    }

    return stats;
  }
}

export const eventQueueService = new EventQueueService();
