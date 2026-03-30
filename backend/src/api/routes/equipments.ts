import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/database';
import { logger } from '../../utils/logger';
import { opcUaService } from '../../services/opcua/OpcUaService';

const router = Router();

interface EquipmentRow {
  id: string;
  name: string;
  description: string | null;
  opcua_node_id: string;
  iih_asset_id: string;
  iih_variable_id: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function mapEquipment(row: EquipmentRow) {
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
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM equipments ORDER BY created_at DESC').all() as EquipmentRow[];
    res.json(rows.map(mapEquipment));
  } catch (err) {
    logger.error(`GET /equipments error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to fetch equipments' });
  }
});

// GET /api/equipments/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }
    res.json(mapEquipment(row));
  } catch (err) {
    logger.error(`GET /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// POST /api/equipments
router.post('/', async (req: Request, res: Response) => {
  const { name, description, opcuaNodeId, iihAssetId, iihVariableId, enabled } = req.body as {
    name?: string;
    description?: string;
    opcuaNodeId?: string;
    iihAssetId?: string;
    iihVariableId?: string;
    enabled?: boolean;
  };

  if (!name || !opcuaNodeId || !iihAssetId || !iihVariableId) {
    res.status(400).json({ error: 'name, opcuaNodeId, iihAssetId, and iihVariableId are required' });
    return;
  }

  try {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const enabledVal = enabled !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO equipments (id, name, description, opcua_node_id, iih_asset_id, iih_variable_id, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, opcuaNodeId, iihAssetId, iihVariableId, enabledVal, now, now);

    logger.info(`Equipment created: ${id} name=${name}`);

    await opcUaService.refreshSubscriptions();

    const row = db.prepare('SELECT * FROM equipments WHERE id = ?').get(id) as EquipmentRow;
    res.status(201).json(mapEquipment(row));
  } catch (err) {
    logger.error(`POST /equipments error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
});

// PUT /api/equipments/:id
router.put('/:id', async (req: Request, res: Response) => {
  const { name, description, opcuaNodeId, iihAssetId, iihVariableId, enabled } = req.body as {
    name?: string;
    description?: string;
    opcuaNodeId?: string;
    iihAssetId?: string;
    iihVariableId?: string;
    enabled?: boolean;
  };

  try {
    const existing = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const enabledVal = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;

    db.prepare(`
      UPDATE equipments SET
        name = ?,
        description = ?,
        opcua_node_id = ?,
        iih_asset_id = ?,
        iih_variable_id = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? (description || null) : existing.description,
      opcuaNodeId || existing.opcua_node_id,
      iihAssetId || existing.iih_asset_id,
      iihVariableId || existing.iih_variable_id,
      enabledVal,
      now,
      req.params.id
    );

    logger.info(`Equipment updated: ${req.params.id}`);
    await opcUaService.refreshSubscriptions();

    const row = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow;
    res.json(mapEquipment(row));
  } catch (err) {
    logger.error(`PUT /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to update equipment' });
  }
});

// DELETE /api/equipments/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    db.prepare('DELETE FROM equipments WHERE id = ?').run(req.params.id);
    logger.info(`Equipment deleted: ${req.params.id}`);

    await opcUaService.refreshSubscriptions();

    res.status(204).send();
  } catch (err) {
    logger.error(`DELETE /equipments/:id error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
});

// POST /api/equipments/:id/toggle
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }

    const newEnabled = existing.enabled === 1 ? 0 : 1;
    const now = Math.floor(Date.now() / 1000);

    db.prepare('UPDATE equipments SET enabled = ?, updated_at = ? WHERE id = ?').run(newEnabled, now, req.params.id);
    logger.info(`Equipment toggled: ${req.params.id} enabled=${newEnabled}`);

    await opcUaService.refreshSubscriptions();

    const row = db.prepare('SELECT * FROM equipments WHERE id = ?').get(req.params.id) as EquipmentRow;
    res.json(mapEquipment(row));
  } catch (err) {
    logger.error(`POST /equipments/:id/toggle error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to toggle equipment' });
  }
});

export default router;
