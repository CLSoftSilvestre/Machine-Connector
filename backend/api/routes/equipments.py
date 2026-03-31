import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import db_lock, get_db
from services.opcua.opcua_service import opcua_service
from utils.logger import logger

router = APIRouter()


class EquipmentCreate(BaseModel):
    name: str
    description: str | None = None
    opcuaNodeId: str
    iihAssetId: str
    iihVariableId: str
    enabled: bool = True


class EquipmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    opcuaNodeId: str | None = None
    iihAssetId: str | None = None
    iihVariableId: str | None = None
    enabled: bool | None = None


def _map_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "opcuaNodeId": row["opcua_node_id"],
        "iihAssetId": row["iih_asset_id"],
        "iihVariableId": row["iih_variable_id"],
        "enabled": bool(row["enabled"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@router.get("")
def list_equipments():
    db = get_db()
    rows = db.execute("SELECT * FROM equipments ORDER BY created_at DESC").fetchall()
    return [_map_row(dict(r)) for r in rows]


@router.get("/{equipment_id}")
def get_equipment(equipment_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return _map_row(dict(row))


@router.post("", status_code=201)
async def create_equipment(body: EquipmentCreate):
    equipment_id = str(uuid.uuid4())
    now = int(time.time())
    db = get_db()
    try:
        with db_lock():
            db.execute(
                """INSERT INTO equipments
                   (id, name, description, opcua_node_id, iih_asset_id, iih_variable_id, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (equipment_id, body.name, body.description, body.opcuaNodeId,
                 body.iihAssetId, body.iihVariableId, 1 if body.enabled else 0, now, now),
            )
            db.commit()
        logger.info(f"Equipment created: {equipment_id} name={body.name}")
        await opcua_service.refresh_subscriptions()
        row = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
        return _map_row(dict(row))
    except Exception as exc:
        logger.error(f"POST /equipments error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create equipment")


@router.put("/{equipment_id}")
async def update_equipment(equipment_id: str, body: EquipmentUpdate):
    db = get_db()
    existing = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Equipment not found")
    existing = dict(existing)
    now = int(time.time())
    try:
        with db_lock():
            db.execute(
                """UPDATE equipments SET
                   name = ?, description = ?, opcua_node_id = ?, iih_asset_id = ?,
                   iih_variable_id = ?, enabled = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    body.name or existing["name"],
                    body.description if body.description is not None else existing["description"],
                    body.opcuaNodeId or existing["opcua_node_id"],
                    body.iihAssetId or existing["iih_asset_id"],
                    body.iihVariableId or existing["iih_variable_id"],
                    (1 if body.enabled else 0) if body.enabled is not None else existing["enabled"],
                    now,
                    equipment_id,
                ),
            )
            db.commit()
        logger.info(f"Equipment updated: {equipment_id}")
        await opcua_service.refresh_subscriptions()
        row = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
        return _map_row(dict(row))
    except Exception as exc:
        logger.error(f"PUT /equipments/{equipment_id} error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update equipment")


@router.delete("/{equipment_id}", status_code=204)
async def delete_equipment(equipment_id: str):
    db = get_db()
    existing = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Equipment not found")
    try:
        with db_lock():
            db.execute("DELETE FROM equipments WHERE id = ?", (equipment_id,))
            db.commit()
        logger.info(f"Equipment deleted: {equipment_id}")
        await opcua_service.refresh_subscriptions()
    except Exception as exc:
        logger.error(f"DELETE /equipments/{equipment_id} error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete equipment")


@router.post("/{equipment_id}/toggle")
async def toggle_equipment(equipment_id: str):
    db = get_db()
    existing = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Equipment not found")
    existing = dict(existing)
    new_enabled = 0 if existing["enabled"] == 1 else 1
    now = int(time.time())
    try:
        with db_lock():
            db.execute(
                "UPDATE equipments SET enabled = ?, updated_at = ? WHERE id = ?",
                (new_enabled, now, equipment_id),
            )
            db.commit()
        logger.info(f"Equipment toggled: {equipment_id} enabled={new_enabled}")
        await opcua_service.refresh_subscriptions()
        row = db.execute("SELECT * FROM equipments WHERE id = ?", (equipment_id,)).fetchone()
        return _map_row(dict(row))
    except Exception as exc:
        logger.error(f"POST /equipments/{equipment_id}/toggle error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to toggle equipment")
