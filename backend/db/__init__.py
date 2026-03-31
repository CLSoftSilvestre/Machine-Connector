import os
import sqlite3
import threading

from config import config
from utils.logger import logger

_db_path = os.path.abspath(config.db_path)
_data_dir = os.path.dirname(_db_path)
os.makedirs(_data_dir, exist_ok=True)

_connection: sqlite3.Connection | None = None
_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    global _connection
    if _connection is None:
        _connection = sqlite3.connect(_db_path, check_same_thread=False)
        _connection.row_factory = sqlite3.Row
        _connection.execute("PRAGMA journal_mode=WAL")
        _connection.execute("PRAGMA foreign_keys=ON")
        _connection.commit()
        logger.info(f"Database initialized at {_db_path}")
    return _connection


def db_lock() -> threading.Lock:
    return _lock
