import time

from fastapi import APIRouter

from services.opcua.opcua_service import opcua_service
from services.iih.iih_service import iih_service
from services.queue.event_queue_service import event_queue_service

router = APIRouter()

_start_time = time.time()
_VERSION = "1.0.0"


@router.get("")
def health():
    stats = event_queue_service.get_stats()
    opcua_status = opcua_service.get_status()
    iih_status = iih_service.get_status()
    uptime = int(time.time() - _start_time)

    overall = (
        "ok" if opcua_status == "connected" and iih_status != "error"
        else "degraded" if opcua_status in ("error", "disconnected") or iih_status == "error"
        else "ok"
    )

    return {
        "status": overall,
        "version": _VERSION,
        "uptime": uptime,
        "connections": {
            "opcua": opcua_status,
            "iih": iih_status,
            "apriso": "unknown",
        },
        "queue": {
            "pending": stats["pending"],
            "failed": stats["failed"],
        },
    }
