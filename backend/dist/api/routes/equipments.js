"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const OpcUaService_1 = require("../../services/opcua/OpcUaService");
const router = (0, express_1.Router)();
function mapEquipment(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        opcuaNodeId: row.opcua_node_id,
        iihAssetId: row.iih_asset_id,
        iihVariableId: row.iih_variable_id,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
// GET /api/equipments
router.get('/', (_req, res) => {
    try {
        const rows = database_1.db.prepare('SELECT * FROM equipments ORDER BY created_at DESC').all();
        res.json(rows.map(mapEquipment));
    }
    catch (err) {
        logger_1.logger.error(`GET /equipments error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to fetch equipments' });
    }
});
// GET /api/equipments/:id
router.get('/:id', (req, res) => {
    try {
        const row = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        if (!row) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        res.json(mapEquipment(row));
    }
    catch (err) {
        logger_1.logger.error(`GET /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to fetch equipment' });
    }
});
// POST /api/equipments
router.post('/', async (req, res) => {
    const { name, description, opcuaNodeId, iihAssetId, iihVariableId, enabled } = req.body;
    if (!name || !opcuaNodeId || !iihAssetId || !iihVariableId) {
        res.status(400).json({ error: 'name, opcuaNodeId, iihAssetId, and iihVariableId are required' });
        return;
    }
    try {
        const id = (0, uuid_1.v4)();
        const now = Math.floor(Date.now() / 1000);
        const enabledVal = enabled !== false ? 1 : 0;
        database_1.db.prepare(`
      INSERT INTO equipments (id, name, description, opcua_node_id, iih_asset_id, iih_variable_id, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, opcuaNodeId, iihAssetId, iihVariableId, enabledVal, now, now);
        logger_1.logger.info(`Equipment created: ${id} name=${name}`);
        await OpcUaService_1.opcUaService.refreshSubscriptions();
        const row = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(id);
        res.status(201).json(mapEquipment(row));
    }
    catch (err) {
        logger_1.logger.error(`POST /equipments error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to create equipment' });
    }
});
// PUT /api/equipments/:id
router.put('/:id', async (req, res) => {
    const { name, description, opcuaNodeId, iihAssetId, iihVariableId, enabled } = req.body;
    try {
        const existing = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const enabledVal = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
        database_1.db.prepare(`
      UPDATE equipments SET
        name = ?,
        description = ?,
        opcua_node_id = ?,
        iih_asset_id = ?,
        iih_variable_id = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `).run(name || existing.name, description !== undefined ? (description || null) : existing.description, opcuaNodeId || existing.opcua_node_id, iihAssetId || existing.iih_asset_id, iihVariableId || existing.iih_variable_id, enabledVal, now, req.params.id);
        logger_1.logger.info(`Equipment updated: ${req.params.id}`);
        await OpcUaService_1.opcUaService.refreshSubscriptions();
        const row = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        res.json(mapEquipment(row));
    }
    catch (err) {
        logger_1.logger.error(`PUT /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to update equipment' });
    }
});
// DELETE /api/equipments/:id
router.delete('/:id', async (req, res) => {
    try {
        const existing = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        database_1.db.prepare('DELETE FROM equipments WHERE id = ?').run(req.params.id);
        logger_1.logger.info(`Equipment deleted: ${req.params.id}`);
        await OpcUaService_1.opcUaService.refreshSubscriptions();
        res.status(204).send();
    }
    catch (err) {
        logger_1.logger.error(`DELETE /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to delete equipment' });
    }
});
// POST /api/equipments/:id/toggle
router.post('/:id/toggle', async (req, res) => {
    try {
        const existing = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        if (!existing) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        const newEnabled = existing.enabled === 1 ? 0 : 1;
        const now = Math.floor(Date.now() / 1000);
        database_1.db.prepare('UPDATE equipments SET enabled = ?, updated_at = ? WHERE id = ?').run(newEnabled, now, req.params.id);
        logger_1.logger.info(`Equipment toggled: ${req.params.id} enabled=${newEnabled}`);
        await OpcUaService_1.opcUaService.refreshSubscriptions();
        const row = database_1.db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id);
        res.json(mapEquipment(row));
    }
    catch (err) {
        logger_1.logger.error(`POST /equipments/:id/toggle error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to toggle equipment' });
    }
});
exports.default = router;
//# sourceMappingURL=equipments.js.map