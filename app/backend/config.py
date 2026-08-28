import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SESSIONS_DIR = BASE_DIR / "sessions"
MEDIA_CACHE_DIR = BASE_DIR / "media_cache"

SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)

API_ID = int(os.getenv("TG_API_ID", "27451332"))
API_HASH = os.getenv("TG_API_HASH", "1462d961e4a7bf6b5139309255f09fd6")

# Proxy configuration
PROXY_HOST = os.getenv("TG_PROXY_HOST", "64.188.66.249")
PROXY_PORT = int(os.getenv("TG_PROXY_PORT", "8888"))
PROXY_USER = os.getenv("TG_PROXY_USER", "grzxk")
PROXY_PASS = os.getenv("TG_PROXY_PASS", "ahCEZwkV37Mj")
PROXY_TYPE = os.getenv("TG_PROXY_TYPE", "http")

PROXY_CONFIG = {
    "proxy_type": PROXY_TYPE,
    "addr": PROXY_HOST,
    "port": PROXY_PORT,
    "username": PROXY_USER,
    "password": PROXY_PASS,
}

SESSION_NAME = str(SESSIONS_DIR / "telegram_x_session")
