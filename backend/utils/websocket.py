import asyncio
import json
from datetime import datetime, timezone
from typing import Set

from fastapi import WebSocket

from utils.logger import logger


class WebSocketManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected (total={len(self.active_connections)})")

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected (total={len(self.active_connections)})")

    async def broadcast(self, message_type: str, data: dict) -> None:
        if not self.active_connections:
            return
        message = json.dumps(
            {
                "type": message_type,
                "data": data,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        dead: Set[WebSocket] = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                dead.add(connection)
        for conn in dead:
            self.active_connections.discard(conn)


ws_manager = WebSocketManager()


async def broadcast(message_type: str, data: dict) -> None:
    """Module-level helper used by services."""
    await ws_manager.broadcast(message_type, data)


def broadcast_sync(message_type: str, data: dict) -> None:
    """Fire-and-forget broadcast from sync contexts (schedules as a task)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ws_manager.broadcast(message_type, data))
    except RuntimeError:
        pass
