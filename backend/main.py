import uvicorn
from config import config

if __name__ == "__main__":
    uvicorn.run(
        "api.server:app",
        host="0.0.0.0",
        port=config.port,
        reload=False,
        log_level="info",
    )
