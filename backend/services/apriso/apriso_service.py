import asyncio
from typing import Any

import httpx

from config import config
from db import get_db
from utils.logger import logger


def _get_effective_config() -> dict:
    db = get_db()

    def _get(key: str) -> str:
        row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else ""

    return {
        "base_url": _get("aprisoBaseUrl") or config.apriso.base_url,
        "api_key": _get("aprisoApiKey") or config.apriso.api_key,
        "username": _get("aprisoUsername") or config.apriso.username,
        "password": _get("aprisoPassword") or config.apriso.password,
    }


def _is_stub(base_url: str) -> bool:
    return not base_url or "mock" in base_url or "localhost" in base_url or not base_url.startswith("http")


def _build_client(cfg: dict) -> httpx.AsyncClient:
    headers = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        headers["X-API-Key"] = cfg["api_key"]
    auth = (cfg["username"], cfg["password"]) if cfg["username"] else None
    return httpx.AsyncClient(base_url=cfg["base_url"], headers=headers, auth=auth, timeout=15.0)


class AprisoService:
    async def publish_machine_status(self, event: dict) -> None:
        cfg = _get_effective_config()
        if _is_stub(cfg["base_url"]):
            logger.info(
                f"STUB: would publish MACHINE_STATUS to Apriso "
                f"equipment={event['equipment_name']} id={event['id']}"
            )
            await asyncio.sleep(0.2)
            return

        async with _build_client(cfg) as client:
            from datetime import datetime, timezone
            response = await client.post(
                "/api/v1/machine-status",
                json={
                    "eventId": event["id"],
                    "equipmentId": event["equipment_id"],
                    "equipmentName": event["equipment_name"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **event["payload"],
                },
            )
            response.raise_for_status()
            logger.info(f"Apriso MACHINE_STATUS published: event={event['id']} status={response.status_code}")

    async def publish_counter(self, event: dict) -> None:
        cfg = _get_effective_config()
        if _is_stub(cfg["base_url"]):
            logger.info(
                f"STUB: would publish COUNTER to Apriso "
                f"equipment={event['equipment_name']} id={event['id']}"
            )
            await asyncio.sleep(0.2)
            return

        async with _build_client(cfg) as client:
            from datetime import datetime, timezone
            response = await client.post(
                "/api/v1/counter",
                json={
                    "eventId": event["id"],
                    "equipmentId": event["equipment_id"],
                    "equipmentName": event["equipment_name"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **event["payload"],
                },
            )
            response.raise_for_status()
            logger.info(f"Apriso COUNTER published: event={event['id']} status={response.status_code}")

    async def test_connection(
        self, base_url: str, username: str = "", password: str = "", api_key: str = ""
    ) -> dict[str, Any]:
        if _is_stub(base_url):
            return {"success": True, "message": "Apriso is in stub/mock mode. Connection test simulated successfully."}
        try:
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["X-API-Key"] = api_key
            auth = (username, password) if username else None
            async with httpx.AsyncClient(
                base_url=base_url, headers=headers, auth=auth, timeout=10.0
            ) as client:
                await client.get("/api/v1/health")
            return {"success": True, "message": "Apriso connection successful"}
        except Exception as exc:
            return {"success": False, "message": f"Apriso connection failed: {exc}"}


apriso_service = AprisoService()
