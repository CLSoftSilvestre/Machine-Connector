import { Router, Request, Response } from 'express';
import { db } from '../../db/database';
import { logger } from '../../utils/logger';
import { eventQueueService } from '../../services/queue/EventQueueService';

const router = Router();

interface EventRow {
  id: string;
  type: string;
  equipment_id: string;
  equipment_name: string;
  payload: string;
  status: string;
  retry_count: number;
  next_retry_at: number | null;
  created_at: number;
  sent_at: number | null;
  error_message: string | null;
}

function mapEvent(row: EventRow) {
  return {
    id: row.id,
    type: row.type,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at || undefined,
    createdAt: row.created_at,
    sentAt: row.sent_at || undefined,
    errorMessage: row.error_message || undefined,
  };
}

// GET /api/events
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, type, equipmentId } = req.query as Record<string, string | undefined>;
    const limit = Math.min(parseInt(String(req.query.limit || '100')), 500);
    const offset = parseInt(String(req.query.offset || '0'));

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status.toUpperCase());
    }

    if (type && type !== 'all') {
      conditions.push('type = ?');
      params.push(type.toUpperCase());
    }

    if (equipmentId) {
      conditions.push('equipment_id = ?');
      params.push(equipmentId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT * FROM event_queue ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as EventRow[];

    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM event_queue ${where}
    `).get(...params) as { total: number };

    res.json({
      events: rows.map(mapEvent),
      total: countRow.total,
    });
  } catch (err) {
    logger.error(`GET /events error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/stats
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = eventQueueService.getStats();

    const typeRows = db.prepare(`
      SELECT type, COUNT(*) as count FROM event_queue GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    const byType: Record<string, number> = { MACHINE_STATUS: 0, COUNTER: 0 };
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    res.json({ ...stats, byType });
  } catch (err) {
    logger.error(`GET /events/stats error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to fetch event stats' });
  }
});

// DELETE /api/events/failed
router.delete('/failed', (_req: Request, res: Response) => {
  try {
    const result = db.prepare("DELETE FROM event_queue WHERE status = 'FAILED'").run();
    logger.info(`Cleared ${result.changes} failed events`);
    res.json({ deleted: result.changes });
  } catch (err) {
    logger.error(`DELETE /events/failed error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to clear failed events' });
  }
});

export default router;
