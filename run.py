import os
import sys
import asyncio
import webbrowser
import uvicorn

# Fix Windows ProactorEventLoop connection reset noise
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure HTTP and HTTPS proxy are set in environment
os.environ["HTTP_PROXY"] = "http://grzxk:ahCEZwkV37Mj@64.188.66.249:8888"
os.environ["HTTPS_PROXY"] = "http://grzxk:ahCEZwkV37Mj@64.188.66.249:8888"

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")
    url = f"http://{host}:{port}"
    print(f"=====================================================")
    print(f"  🚀 Запуск Telegram X — Стена каналов (Twitter Style)")
    print(f"  🌐 URL: {url}")
    print(f"  🛡️ MTProto Proxy: http://grzxk:***@64.188.66.249:8888")
    print(f"  🔑 API ID: 27451332")
    print(f"=====================================================")
    
    # Try auto-opening browser
    try:
        webbrowser.open(url)
    except Exception:
        pass

    uvicorn.run("app.backend.main:app", host=host, port=port, reload=False)
