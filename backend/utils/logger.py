import logging
import os
from logging.handlers import RotatingFileHandler

os.makedirs("logs", exist_ok=True)

_formatter = logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)

_file_handler = RotatingFileHandler(
    "logs/app.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
_file_handler.setFormatter(_formatter)

_error_handler = RotatingFileHandler(
    "logs/error.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
_error_handler.setLevel(logging.ERROR)
_error_handler.setFormatter(_formatter)

logging.basicConfig(level=logging.INFO, handlers=[_console_handler, _file_handler, _error_handler])

logger = logging.getLogger("machine-connector")
