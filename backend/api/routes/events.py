import json

from fastapi import APIRouter, Query

from db import db_lock, get_db
from services.queue.event_queue_service import event_queue_service
from utils.logger import logger

router = APIRouter()


def _map_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "equipmentId": row["equipment_id"],
        "equipmentName": row["equipment_name"],
        "payload": json.loads(row["payload"]),
        "status": row["status"],
        "retryCount": row["retry_count"],
        "nextRetryAt": row["next_retry_at"],
        "createdAt": row["created_at"],
        "sentAt": row["sent_at"],
        "errorMessage": row["error_message"],
    }


@router.get("")
def list_events(
    status: str | None = Query(default=None),
    type: str | None = Query(default=None),
    equipmentId: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    db = get_db()
    conditions = []
    params: list = []

    if status and status != "all":
        conditions.append("status = ?")
        params.append(status.upper())
    if type and type != "all":
        conditions.append("type = ?")
        params.append(type.upper())
    if equipmentId:
        conditions.append("equipment_id = ?")
        params.append(equipmentId)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = db.execute(
        f"SELECT * FROM event_queue {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    total = db.execute(f"SELECT COUNT(*) as total FROM event_queue {where}", params).fetchone()["total"]

    return {"events": [_map_row(dict(r)) for r in rows], "total": total}


@router.get("/stats")
def get_stats():
    stats = event_queue_service.get_stats()
    db = get_db()
    type_rows = db.execute(
        "SELECT type, COUNT(*) as count FROM event_queue GROUP BY type"
    ).fetchall()
    by_type = {"MACHINE_STATUS": 0, "COUNTER": 0}
    for row in type_rows:
        by_type[row["type"]] = row["count"]
    return {**stats, "byType": by_type}


@router.delete("/failed")
def clear_failed_events():
    db = get_db()
    with db_lock():
        cursor = db.execute("DELETE FROM event_queue WHERE status = 'FAILED'")
        db.commit()
    logger.info(f"Cleared {cursor.rowcount} failed events")
    return {"deleted": cursor.rowcount}
