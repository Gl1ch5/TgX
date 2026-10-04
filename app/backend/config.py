import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
SESSIONS_DIR = BASE_DIR / "sessions"
MEDIA_CACHE_DIR = BASE_DIR / "media_cache"

SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines; real environment variables take precedence."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(PROJECT_DIR / ".env")

# Telegram API credentials from https://my.telegram.org (required)
API_ID = int(os.getenv("TG_API_ID") or 0)
API_HASH = os.getenv("TG_API_HASH", "")

# Proxy configuration (optional; disabled when TG_PROXY_HOST is empty)
PROXY_HOST = os.getenv("TG_PROXY_HOST", "")
PROXY_PORT = int(os.getenv("TG_PROXY_PORT") or 1080)
PROXY_USER = os.getenv("TG_PROXY_USER") or None
PROXY_PASS = os.getenv("TG_PROXY_PASS") or None
PROXY_TYPE = os.getenv("TG_PROXY_TYPE", "http")

PROXY_CONFIG = {
    "proxy_type": PROXY_TYPE,
    "addr": PROXY_HOST,
    "port": PROXY_PORT,
    "username": PROXY_USER,
    "password": PROXY_PASS,
} if PROXY_HOST else None

# Web server
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT") or 8000)

# Only the app's own origin may call the API from a browser
CORS_ORIGINS = [
    o.strip() for o in os.getenv("TG_CORS_ORIGINS", "").split(",") if o.strip()
] or [f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"]

SESSION_NAME = str(SESSIONS_DIR / "telegram_x_session")
