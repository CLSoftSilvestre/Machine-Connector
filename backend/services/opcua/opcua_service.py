import asyncio
from datetime import datetime, timezone

from asyncua import Client, Node
from asyncua.common.subscription import Subscription

from config import config
from db import get_db
from services.queue.event_queue_service import event_queue_service
from utils.logger import logger
from utils.websocket import broadcast


class _DataChangeHandler:
    """Handles OPC-UA data change notifications for all subscribed nodes."""

    def __init__(self, service: "OpcUaService") -> None:
        self._service = service

    async def datachange_notification(self, node: Node, val: object, data: object) -> None:
        await self._service.on_data_change(node, val, data)


class OpcUaService:
    def __init__(self) -> None:
        self._client: Client | None = None
        self._subscription: Subscription | None = None
        self._handler: _DataChangeHandler | None = None
        # Maps equipment_id -> (node_id_str, handle)
        self._subscribed: dict[str, tuple[str, int]] = {}
        self._status: str = "disconnected"
        self._is_shutting_down: bool = False
        self._reconnect_delay: float = config.opcua.reconnect_delay / 1000

    def _get_endpoint_url(self) -> str:
        db = get_db()
        row = db.execute("SELECT value FROM settings WHERE key = 'opcuaEndpointUrl'").fetchone()
        return row["value"] if row else config.opcua.endpoint_url

    def _get_application_name(self) -> str:
        db = get_db()
        row = db.execute("SELECT value FROM settings WHERE key = 'opcuaAppName'").fetchone()
        return row["value"] if row else config.opcua.application_name

    async def _set_status(self, status: str) -> None:
        if self._status != status:
            self._status = status
            logger.info(f"OPC-UA status changed to: {status}")
            await broadcast("opcua_status", {"status": status})

    async def start(self) -> None:
        self._is_shutting_down = False
        await self._connect()

    async def _connect(self) -> None:
        endpoint_url = self._get_endpoint_url()
        app_name = self._get_application_name()
        await self._set_status("connecting")
        logger.info(f"OPC-UA connecting to: {endpoint_url}")

        try:
            self._client = Client(url=endpoint_url)
            self._client.application_uri = f"urn:{app_name}"
            self._client.name = app_name

            await self._client.connect()
            logger.info("OPC-UA client connected")

            self._handler = _DataChangeHandler(self)
            self._subscription = await self._client.create_subscription(
                period=1000, handler=self._handler
            )

            await self._set_status("connected")
            self._reconnect_delay = config.opcua.reconnect_delay / 1000

            await self._subscribe_to_all_equipments()

        except Exception as exc:
            logger.error(f"OPC-UA connection error: {exc}")
            await self._set_status("error")
            await self._cleanup_connection()
            await self._schedule_reconnect()

    async def _schedule_reconnect(self) -> None:
        if self._is_shutting_down:
            return
        logger.info(f"OPC-UA scheduling reconnect in {self._reconnect_delay:.1f}s")
        await asyncio.sleep(self._reconnect_delay)
        self._reconnect_delay = min(self._reconnect_delay * 2, 60.0)
        if not self._is_shutting_down:
            await self._cleanup_connection()
            await self._connect()

    async def _cleanup_connection(self) -> None:
        self._subscribed.clear()
        if self._subscription:
            try:
                await self._subscription.delete()
            except Exception:
                pass
            self._subscription = None
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass
            self._client = None

    async def _subscribe_to_all_equipments(self) -> None:
        db = get_db()
        rows = db.execute("SELECT * FROM equipments WHERE enabled = 1").fetchall()
        equipments = [dict(r) for r in rows]
        logger.info(f"OPC-UA subscribing to {len(equipments)} enabled equipment(s)")
        for equipment in equipments:
            await self.subscribe_to_equipment(equipment)

    async def subscribe_to_equipment(self, equipment: dict) -> None:
        if not self._subscription or not self._client:
            logger.warning(f"OPC-UA: cannot subscribe to {equipment['name']}, no active session")
            return
        if equipment["id"] in self._subscribed:
            logger.debug(f"OPC-UA: already subscribed to {equipment['name']}")
            return

        try:
            node = self._client.get_node(equipment["opcua_node_id"])
            handle = await self._subscription.subscribe_data_change(node)
            self._subscribed[equipment["id"]] = (equipment["opcua_node_id"], handle)
            logger.info(
                f"OPC-UA subscribed to node {equipment['opcua_node_id']} for equipment {equipment['name']}"
            )
        except Exception as exc:
            logger.error(f"OPC-UA failed to subscribe to {equipment['name']}: {exc}")

    async def on_data_change(self, node: Node, val: object, data: object) -> None:
        # Find which equipment this node belongs to
        node_id_str = str(node.nodeid)
        equipment = None
        db = get_db()
        rows = db.execute("SELECT * FROM equipments WHERE enabled = 1").fetchall()
        for row in rows:
            if row["opcua_node_id"] == node_id_str:
                equipment = dict(row)
                break

        if equipment is None:
            return

        numeric_value = float(val) if isinstance(val, (int, float)) else 0.0
        now = datetime.now(timezone.utc).isoformat()

        logger.debug(f"OPC-UA data change: equipment={equipment['name']} value={numeric_value}")

        event_queue_service.enqueue(
            event_type="MACHINE_STATUS",
            equipment_id=equipment["id"],
            equipment_name=equipment["name"],
            payload={
                "equipmentId": equipment["id"],
                "equipmentName": equipment["name"],
                "value": numeric_value,
                "quality": "Good",
                "sourceTimestamp": now,
                "serverTimestamp": now,
            },
        )
        await broadcast("machine_status_update", {
            "equipmentId": equipment["id"],
            "equipmentName": equipment["name"],
            "value": numeric_value,
            "sourceTimestamp": now,
        })

    async def refresh_subscriptions(self) -> None:
        if self._status != "connected" or not self._subscription:
            logger.info("OPC-UA refreshSubscriptions: not connected, skipping")
            return

        logger.info("OPC-UA refreshing subscriptions after equipment change")
        db = get_db()
        rows = db.execute("SELECT * FROM equipments WHERE enabled = 1").fetchall()
        enabled_equipments = [dict(r) for r in rows]
        enabled_ids = {e["id"] for e in enabled_equipments}

        # Unsubscribe removed equipment
        for equipment_id in list(self._subscribed.keys()):
            if equipment_id not in enabled_ids:
                _, handle = self._subscribed.pop(equipment_id)
                try:
                    await self._subscription.unsubscribe(handle)
                except Exception:
                    pass
                logger.info(f"OPC-UA removed subscription for equipment {equipment_id}")

        # Subscribe new equipment
        for equipment in enabled_equipments:
            if equipment["id"] not in self._subscribed:
                await self.subscribe_to_equipment(equipment)

    async def stop(self) -> None:
        self._is_shutting_down = True
        await self._cleanup_connection()
        await self._set_status("disconnected")
        logger.info("OPC-UA service stopped")

    def get_status(self) -> str:
        return self._status


opcua_service = OpcUaService()
