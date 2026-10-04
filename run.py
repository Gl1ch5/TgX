import sys
import asyncio
import webbrowser
import uvicorn

# Fix Windows encoding for emojis in console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.backend.config import API_ID, API_HASH, PROXY_CONFIG, HOST, PORT

if __name__ == "__main__":
    if not API_ID or not API_HASH:
        print("❌ Не заданы TG_API_ID и TG_API_HASH.")
        print("   Получите их на https://my.telegram.org и укажите в файле .env (см. .env.example).")
        sys.exit(1)

    url = f"http://{HOST}:{PORT}"
    proxy = (
        f"{PROXY_CONFIG['proxy_type']}://{PROXY_CONFIG['addr']}:{PROXY_CONFIG['port']}"
        if PROXY_CONFIG else "не используется"
    )
    print(f"=====================================================")
    print(f"  🚀 Запуск Telegram X — Стена каналов (Twitter Style)")
    print(f"  🌐 URL: {url}")
    print(f"  🛡️ MTProto Proxy: {proxy}")
    print(f"  🔑 API ID: {API_ID}")
    print(f"=====================================================")
    
    # Try auto-opening browser
    try:
        webbrowser.open(url)
    except Exception:
        pass

    uvicorn.run("app.backend.main:app", host=HOST, port=PORT, reload=False)
