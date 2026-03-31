from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from config import config
from db import get_db
from services.queue.event_queue_service import event_queue_service
from utils.logger import logger
from utils.websocket import broadcast


def _get_effective_config() -> dict:
    db = get_db()

    def _get(key: str) -> str:
        row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else ""

    return {
        "base_url": _get("iihBaseUrl") or config.iih.base_url,
        "username": _get("iihUsername") or config.iih.username,
        "password": _get("iihPassword") or config.iih.password,
        "counter_endpoint": _get("iihCounterEndpoint") or config.iih.counter_endpoint,
    }


class IIHService:
    def __init__(self) -> None:
        self._last_status: str = "unknown"

    async def fetch_counter_data(self, equipment: dict) -> dict | None:
        cfg = _get_effective_config()
        now = datetime.now(timezone.utc)
        period_end = now.isoformat()
        period_start = (now - timedelta(seconds=60)).isoformat()

        auth = (cfg["username"], cfg["password"]) if cfg["username"] else None
        try:
            async with httpx.AsyncClient(
                base_url=cfg["base_url"],
                auth=auth,
                timeout=30.0,
                headers={"Content-Type": "application/json"},
            ) as client:
                response = await client.get(
                    cfg["counter_endpoint"],
                    params={
                        "assetId": equipment["iih_asset_id"],
                        "variableId": equipment["iih_variable_id"],
                        "from": period_start,
                        "to": period_end,
                        "aggregate": "last",
                    },
                )
                response.raise_for_status()
                data = response.json()

            values = data.get("values") or data.get("data") or []
            if not values:
                logger.debug(f"IIH: no counter data for equipment={equipment['name']}")
                return None

            latest = values[-1]
            raw_val = latest.get("value", 0)
            return {
                "value": float(raw_val) if not isinstance(raw_val, float) else raw_val,
                "unit": latest.get("unit", "units"),
                "period_start": latest.get("from", period_start),
                "period_end": latest.get("to", period_end),
            }
        except Exception as exc:
            logger.error(f"IIH fetchCounterData failed for {equipment['name']}: {exc}")
            return None

    async def poll_all_equipments(self) -> None:
        db = get_db()
        rows = db.execute("SELECT * FROM equipments WHERE enabled = 1").fetchall()
        equipments = [dict(r) for r in rows]

        if not equipments:
            logger.debug("IIH poll: no enabled equipments")
            return

        logger.info(f"IIH poll: fetching counter data for {len(equipments)} equipment(s)")
        success_count = 0
        error_count = 0

        for equipment in equipments:
            try:
                reading = await self.fetch_counter_data(equipment)
                if reading is not None:
                    now = datetime.now(timezone.utc).isoformat()
                    event_queue_service.enqueue(
                        event_type="COUNTER",
                        equipment_id=equipment["id"],
                        equipment_name=equipment["name"],
                        payload={
                            "equipmentId": equipment["id"],
                            "equipmentName": equipment["name"],
                            "iihAssetId": equipment["iih_asset_id"],
                            "iihVariableId": equipment["iih_variable_id"],
                            "counterValue": reading["value"],
                            "unit": reading["unit"],
                            "periodStart": reading["period_start"],
                            "periodEnd": reading["period_end"],
                            "collectedAt": now,
                        },
                    )
                    success_count += 1
            except Exception as exc:
                error_count += 1
                logger.error(f"IIH poll error for {equipment['name']}: {exc}")

        new_status = "connected" if error_count == 0 else ("error" if success_count == 0 else "connected")
        if new_status != self._last_status:
            self._last_status = new_status
            await broadcast("iih_status", {"status": new_status, "successCount": success_count, "errorCount": error_count})

        logger.info(f"IIH poll complete: success={success_count} errors={error_count}")

    async def test_connection(
        self, base_url: str, username: str = "", password: str = "",
        counter_endpoint: str = ""
    ) -> dict[str, Any]:
        endpoint = counter_endpoint or config.iih.counter_endpoint
        auth = (username, password) if username else None
        try:
            async with httpx.AsyncClient(base_url=base_url, auth=auth, timeout=10.0) as client:
                response = await client.get(
                    endpoint,
                    params={"assetId": "test", "variableId": "test",
                            "from": datetime.now(timezone.utc).isoformat(),
                            "to": datetime.now(timezone.utc).isoformat()},
                )
            if response.status_code == 401:
                return {"success": False, "message": "IIH authentication failed: invalid credentials"}
            if response.status_code == 404:
                return {"success": True, "message": f"IIH server reachable but endpoint not found (404)"}
            return {"success": True, "message": f"IIH server reachable (HTTP {response.status_code})"}
        except Exception as exc:
            return {"success": False, "message": f"IIH connection failed: {exc}"}

    def get_status(self) -> str:
        return self._last_status


iih_service = IIHService()
