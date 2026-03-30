"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const EventQueueService_1 = require("../../services/queue/EventQueueService");
const router = (0, express_1.Router)();
function mapEvent(row) {
    return {
        id: row.id,
        type: row.type,
        equipmentId: row.equipment_id,
        equipmentName: row.equipment_name,
        payload: JSON.parse(row.payload),
        status: row.status,
        retryCount: row.retry_count,
        nextRetryAt: row.next_retry_at || undefined,
        createdAt: row.created_at,
        sentAt: row.sent_at || undefined,
        errorMessage: row.error_message || undefined,
    };
}
// GET /api/events
router.get('/', (req, res) => {
    try {
        const { status, type, equipmentId } = req.query;
        const limit = Math.min(parseInt(String(req.query.limit || '100')), 500);
        const offset = parseInt(String(req.query.offset || '0'));
        const conditions = [];
        const params = [];
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
        const rows = database_1.db.prepare(`
      SELECT * FROM event_queue ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
        const countRow = database_1.db.prepare(`
      SELECT COUNT(*) as total FROM event_queue ${where}
    `).get(...params);
        res.json({
            events: rows.map(mapEvent),
            total: countRow.total,
        });
    }
    catch (err) {
        logger_1.logger.error(`GET /events error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});
// GET /api/events/stats
router.get('/stats', (_req, res) => {
    try {
        const stats = EventQueueService_1.eventQueueService.getStats();
        const typeRows = database_1.db.prepare(`
      SELECT type, COUNT(*) as count FROM event_queue GROUP BY type
    `).all();
        const byType = { MACHINE_STATUS: 0, COUNTER: 0 };
        for (const row of typeRows) {
            byType[row.type] = row.count;
        }
        res.json({ ...stats, byType });
    }
    catch (err) {
        logger_1.logger.error(`GET /events/stats error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to fetch event stats' });
    }
});
// DELETE /api/events/failed
router.delete('/failed', (_req, res) => {
    try {
        const result = database_1.db.prepare("DELETE FROM event_queue WHERE status = 'FAILED'").run();
        logger_1.logger.info(`Cleared ${result.changes} failed events`);
        res.json({ deleted: result.changes });
    }
    catch (err) {
        logger_1.logger.error(`DELETE /events/failed error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to clear failed events' });
    }
});
exports.default = router;
//# sourceMappingURL=events.js.map