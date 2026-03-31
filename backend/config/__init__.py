import os
from dotenv import load_dotenv

load_dotenv()


class _OpcUa:
    endpoint_url: str = os.getenv("OPCUA_ENDPOINT_URL", "opc.tcp://localhost:4840")
    application_name: str = os.getenv("OPCUA_APP_NAME", "MachineConnector")
    reconnect_delay: int = int(os.getenv("OPCUA_RECONNECT_DELAY", "5000"))


class _IIH:
    base_url: str = os.getenv("IIH_BASE_URL", "http://iih-essentials")
    username: str = os.getenv("IIH_USERNAME", "")
    password: str = os.getenv("IIH_PASSWORD", "")
    poll_interval_seconds: int = int(os.getenv("IIH_POLL_INTERVAL_SECONDS", "60"))
    counter_endpoint: str = os.getenv("IIH_COUNTER_ENDPOINT", "/IIHEssentials/v1/aggregatedvalues")


class _Apriso:
    base_url: str = os.getenv("APRISO_BASE_URL", "http://apriso-mock:8080")
    api_key: str = os.getenv("APRISO_API_KEY", "")
    username: str = os.getenv("APRISO_USERNAME", "")
    password: str = os.getenv("APRISO_PASSWORD", "")


class _Queue:
    retention_hours: int = int(os.getenv("QUEUE_RETENTION_HOURS", "24"))
    processing_interval_ms: int = int(os.getenv("QUEUE_PROCESSING_INTERVAL_MS", "10000"))
    max_retries: int = int(os.getenv("QUEUE_MAX_RETRIES", "10"))


class Config:
    port: int = int(os.getenv("PORT", "3000"))
    env: str = os.getenv("ENV", "development")
    db_path: str = os.getenv("DB_PATH", "./data/connector.db")
    opcua = _OpcUa()
    iih = _IIH()
    apriso = _Apriso()
    queue = _Queue()


config = Config()
