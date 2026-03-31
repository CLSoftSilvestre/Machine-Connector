import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import get_db
from db.migrations import run_migrations
from services.apriso.apriso_service import apriso_service
from services.iih.iih_service import iih_service
from services.opcua.opcua_service import opcua_service
from services.queue.event_queue_service import event_queue_service
from scheduler.counter_scheduler import start_scheduler, stop_scheduler
from utils.logger import logger
from utils.websocket import ws_manager

from api.routes import equipments, events, settings, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    get_db()
    run_migrations()

    event_queue_service.set_apriso_service(apriso_service)
    event_queue_service.start_processing_loop()
    start_scheduler()
    asyncio.create_task(opcua_service.start())

    logger.info("Machine Connector started successfully")
    yield

    # --- Shutdown ---
    logger.info("Machine Connector shutting down...")
    stop_scheduler()
    event_queue_service.stop_processing_loop()
    await opcua_service.stop()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(title="Machine Connector API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(equipments.router, prefix="/api/equipments", tags=["equipments"])
    app.include_router(events.router, prefix="/api/events", tags=["events"])
    app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
    app.include_router(health.router, prefix="/api/health", tags=["health"])

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                # Keep connection alive; client may send pings
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)
        except Exception:
            ws_manager.disconnect(websocket)

    return app


app = create_app()
