import asyncio
import json
import time
import uuid
from typing import Any

from config import config
from db import db_lock, get_db
from utils.logger import logger
from utils.websocket import broadcast

# Exponential backoff delays in seconds (indexed by retry_count)
RETRY_DELAYS = [5, 15, 30, 60, 120, 300, 300, 300, 300, 300]


class EventQueueService:
    def __init__(self) -> None:
        self._apriso_service: Any = None
        self._processing_task: asyncio.Task | None = None
        self._cleanup_task: asyncio.Task | None = None

    def set_apriso_service(self, svc: Any) -> None:
        self._apriso_service = svc

    def enqueue(self, event_type: str, equipment_id: str, equipment_name: str, payload: dict) -> None:
        event_id = str(uuid.uuid4())
        now = int(time.time())
        db = get_db()
        with db_lock():
            db.execute(
                """
                INSERT INTO event_queue
                    (id, type, equipment_id, equipment_name, payload, status, retry_count, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)
                """,
                (event_id, event_type, equipment_id, equipment_name, json.dumps(payload), now),
            )
            db.commit()
        logger.info(f"Event enqueued: {event_id} type={event_type} equipment={equipment_name}")
        asyncio.get_event_loop().create_task(
            broadcast("event_queued", {
                "id": event_id,
                "type": event_type,
                "equipmentId": equipment_id,
                "equipmentName": equipment_name,
                "status": "PENDING",
            })
        )

    async def process_queue(self) -> None:
        if self._apriso_service is None:
            logger.warning("EventQueueService: AprisoService not set, skipping")
            return

        now = int(time.time())
        db = get_db()
        rows = db.execute(
            """
            SELECT * FROM event_queue
            WHERE status = 'PENDING'
              AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY created_at ASC
            LIMIT 50
            """,
            (now,),
        ).fetchall()

        if not rows:
            return

        logger.debug(f"Processing {len(rows)} queued events")
        for row in rows:
            await self._process_event(dict(row))

    async def _process_event(self, event: dict) -> None:
        db = get_db()
        with db_lock():
            db.execute("UPDATE event_queue SET status = 'SENDING' WHERE id = ?", (event["id"],))
            db.commit()
        await broadcast("event_status_changed", {"id": event["id"], "status": "SENDING"})

        try:
            payload = json.loads(event["payload"])
            event_with_payload = {**event, "payload": payload}

            if event["type"] == "MACHINE_STATUS":
                await self._apriso_service.publish_machine_status(event_with_payload)
            elif event["type"] == "COUNTER":
                await self._apriso_service.publish_counter(event_with_payload)

            sent_at = int(time.time())
            with db_lock():
                db.execute(
                    "UPDATE event_queue SET status = 'SENT', sent_at = ?, error_message = NULL WHERE id = ?",
                    (sent_at, event["id"]),
                )
                db.commit()
            logger.info(f"Event sent: {event['id']} type={event['type']} equipment={event['equipment_name']}")
            await broadcast("event_status_changed", {"id": event["id"], "status": "SENT", "sentAt": sent_at})

        except Exception as exc:
            error_message = str(exc)
            new_retry_count = event["retry_count"] + 1

            if new_retry_count >= config.queue.max_retries:
                with db_lock():
                    db.execute(
                        """UPDATE event_queue
                           SET status = 'FAILED', retry_count = ?, error_message = ?, next_retry_at = NULL
                           WHERE id = ?""",
                        (new_retry_count, error_message, event["id"]),
                    )
                    db.commit()
                logger.error(
                    f"Event permanently failed after {new_retry_count} retries: {event['id']} - {error_message}"
                )
                await broadcast("event_status_changed", {
                    "id": event["id"], "status": "FAILED",
                    "retryCount": new_retry_count, "error": error_message,
                })
            else:
                delay = RETRY_DELAYS[min(event["retry_count"], len(RETRY_DELAYS) - 1)]
                next_retry_at = int(time.time()) + delay
                with db_lock():
                    db.execute(
                        """UPDATE event_queue
                           SET status = 'PENDING', retry_count = ?, next_retry_at = ?, error_message = ?
                           WHERE id = ?""",
                        (new_retry_count, next_retry_at, error_message, event["id"]),
                    )
                    db.commit()
                logger.warning(
                    f"Event retry scheduled: {event['id']} attempt={new_retry_count} "
                    f"next_retry_in={delay}s - {error_message}"
                )
                await broadcast("event_status_changed", {
                    "id": event["id"], "status": "PENDING",
                    "retryCount": new_retry_count,
                    "nextRetryAt": next_retry_at,
                    "error": error_message,
                })

    def start_processing_loop(self) -> None:
        interval_s = config.queue.processing_interval_ms / 1000
        logger.info(f"Starting event queue processing loop (interval: {interval_s}s)")

        async def _loop() -> None:
            while True:
                await asyncio.sleep(interval_s)
                try:
                    await self.process_queue()
                except Exception as exc:
                    logger.error(f"Queue processing loop error: {exc}")

        async def _cleanup_loop() -> None:
            self.cleanup()
            while True:
                await asyncio.sleep(3600)
                self.cleanup()

        self._processing_task = asyncio.get_event_loop().create_task(_loop())
        self._cleanup_task = asyncio.get_event_loop().create_task(_cleanup_loop())

    def stop_processing_loop(self) -> None:
        if self._processing_task:
            self._processing_task.cancel()
            self._processing_task = None
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None

    def cleanup(self) -> None:
        cutoff = int(time.time()) - config.queue.retention_hours * 3600
        db = get_db()
        with db_lock():
            cursor = db.execute(
                "DELETE FROM event_queue WHERE status = 'SENT' AND sent_at < ?", (cutoff,)
            )
            db.commit()
        if cursor.rowcount > 0:
            logger.info(f"Queue cleanup: removed {cursor.rowcount} old SENT events")

    def get_stats(self) -> dict:
        db = get_db()
        rows = db.execute("SELECT status, COUNT(*) as count FROM event_queue GROUP BY status").fetchall()
        stats = {"pending": 0, "sending": 0, "sent": 0, "failed": 0, "total": 0}
        for row in rows:
            key = row["status"].lower()
            if key in stats:
                stats[key] = row["count"]
            stats["total"] += row["count"]
        return stats


event_queue_service = EventQueueService()
