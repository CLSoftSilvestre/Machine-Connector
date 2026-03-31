import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import config
from db import db_lock, get_db
from services.iih.iih_service import iih_service
from services.apriso.apriso_service import apriso_service
from utils.logger import logger

router = APIRouter()

_SENSITIVE_KEYS = {"iihPassword", "aprisoPassword", "aprisoApiKey"}


def _mask(key: str, value: str) -> str:
    return "***" if key in _SENSITIVE_KEYS and value else value


@router.get("")
def get_settings():
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings ORDER BY key").fetchall()
    return {row["key"]: _mask(row["key"], row["value"]) for row in rows}


class SettingsUpdate(BaseModel):
    model_config = {"extra": "allow"}


@router.put("")
def save_settings(body: dict):
    if not body or not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Request body must be a key-value object")

    db = get_db()
    now = int(time.time())
    try:
        with db_lock():
            for key, value in body.items():
                if value == "***":
                    continue
                db.execute(
                    """INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""",
                    (key, str(value), now),
                )
            db.commit()
        logger.info(f"Settings updated: {', '.join(body.keys())}")
        return {"success": True, "message": "Settings saved successfully"}
    except Exception as exc:
        logger.error(f"PUT /settings error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to save settings")


class TestOpcuaBody(BaseModel):
    endpointUrl: str


@router.post("/test-opcua")
async def test_opcua(body: TestOpcuaBody):
    logger.info(f"Testing OPC-UA connection to: {body.endpointUrl}")
    try:
        from asyncua import Client
        client = Client(url=body.endpointUrl)
        client.session_timeout = 5000
        await client.connect()
        await client.disconnect()
        return {"success": True, "message": f"Successfully connected to OPC-UA server at {body.endpointUrl}"}
    except Exception as exc:
        logger.warning(f"OPC-UA test connection failed: {body.endpointUrl} - {exc}")
        return {"success": False, "message": f"OPC-UA connection failed: {exc}"}


class TestIIHBody(BaseModel):
    baseUrl: str
    username: str | None = None
    password: str | None = None
    counterEndpoint: str | None = None


@router.post("/test-iih")
async def test_iih(body: TestIIHBody):
    if not body.baseUrl:
        raise HTTPException(status_code=400, detail="baseUrl is required")
    logger.info(f"Testing IIH connection to: {body.baseUrl}")
    result = await iih_service.test_connection(
        body.baseUrl, body.username or "", body.password or "", body.counterEndpoint or ""
    )
    return result


class TestAprisoBody(BaseModel):
    baseUrl: str
    username: str | None = None
    password: str | None = None
    apiKey: str | None = None


@router.post("/test-apriso")
async def test_apriso(body: TestAprisoBody):
    if not body.baseUrl:
        raise HTTPException(status_code=400, detail="baseUrl is required")
    logger.info(f"Testing Apriso connection to: {body.baseUrl}")
    result = await apriso_service.test_connection(
        body.baseUrl, body.username or "", body.password or "", body.apiKey or ""
    )
    return result
