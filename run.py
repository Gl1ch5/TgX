"""Local preview of TeleX: serves app/static on http://localhost:8000 and opens the browser.

The app itself talks to Telegram directly from the browser (GramJS), so no backend is needed.
"""
import functools
import http.server
import os
import webbrowser
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent / "app" / "static"

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    url = f"http://localhost:{port}"
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(STATIC_DIR))
    handler.extensions_map[".js"] = "text/javascript"
    print(f"  🚀 TeleX: {url}  (Ctrl+C — остановить)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
