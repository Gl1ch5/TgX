import os
import mimetypes
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.backend.config import (
    API_ID,
    PROXY_CONFIG,
    MEDIA_CACHE_DIR,
    BASE_DIR
)
from app.backend.telegram_service import telegram_service

app = FastAPI(title="Telegram X Wall", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class RequestCodeModel(BaseModel):
    phone: str

class SignInCodeModel(BaseModel):
    code: str
    password: Optional[str] = None

class SignInPasswordModel(BaseModel):
    password: str

class ReactionModel(BaseModel):
    channel_id: int
    msg_id: int
    emoji: str

class ForwardSavedModel(BaseModel):
    channel_id: int
    msg_id: int

class FavoriteModel(BaseModel):
    post_id: str

class CommentModel(BaseModel):
    channel_id: int
    msg_id: int
    text: str


@app.get("/api/config/info")
async def get_config_info():
    is_auth = await telegram_service.is_authorized()
    return {
        "api_id": API_ID,
        "proxy_host": PROXY_CONFIG["addr"],
        "proxy_port": PROXY_CONFIG["port"],
        "proxy_type": PROXY_CONFIG["proxy_type"],
        "is_authorized": is_auth,
        "dc": "DC 2 (Production 149.154.167.50:443)",
        "version": "2.0.0 Pro"
    }

# Auth Routes
@app.get("/api/auth/status")
async def get_auth_status():
    is_auth = await telegram_service.is_authorized()
    user = await telegram_service.get_me() if is_auth else None
    return {
        "is_authorized": is_auth,
        "user": user,
    }

@app.post("/api/auth/request-code")
async def request_code(data: RequestCodeModel):
    try:
        res = await telegram_service.request_phone_code(data.phone)
        return res
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/auth/sign-in")
async def sign_in_code(data: SignInCodeModel):
    res = await telegram_service.sign_in_with_code(data.code, data.password)
    return res

@app.post("/api/auth/sign-in-password")
async def sign_in_password(data: SignInPasswordModel):
    res = await telegram_service.sign_in_with_password(data.password)
    return res

@app.post("/api/auth/qr/start")
async def qr_start():
    res = await telegram_service.start_qr_login()
    return res

@app.get("/api/auth/qr/check")
async def qr_check():
    res = await telegram_service.check_qr_login()
    return res

@app.post("/api/auth/logout")
async def logout():
    return await telegram_service.logout()

# Channels & Feed
@app.get("/api/channels")
async def get_channels(limit: int = 100, refresh: bool = False):
    channels = await telegram_service.get_subscribed_channels(limit=limit, force_refresh=refresh)
    return {"channels": channels}

@app.get("/api/feed")
async def get_feed(
    channel_id: Optional[int] = Query(None),
    feed_type: str = Query("all"),
    limit: int = Query(35),
    offset_date: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    refresh: bool = Query(False)
):
    res = await telegram_service.get_wall_feed(
        channel_id=channel_id,
        feed_type=feed_type,
        limit=limit,
        offset_date=offset_date,
        search_query=q,
        force_refresh=refresh
    )
    return res

@app.get("/api/post/comments")
async def get_comments(channel_id: int, msg_id: int, refresh: bool = False):
    comments = await telegram_service.get_post_comments(channel_id, msg_id, force_refresh=refresh)
    return {"comments": comments}

@app.post("/api/post/comment")
async def add_comment(data: CommentModel):
    res = await telegram_service.send_comment(data.channel_id, data.msg_id, data.text)
    return res

@app.post("/api/post/react")
async def react_post(data: ReactionModel):
    res = await telegram_service.send_reaction(data.channel_id, data.msg_id, data.emoji)
    return res

@app.post("/api/post/forward-saved")
async def forward_saved(data: ForwardSavedModel):
    res = await telegram_service.forward_to_saved(data.channel_id, data.msg_id)
    return res

@app.post("/api/post/favorite")
async def toggle_favorite(data: FavoriteModel):
    is_fav = telegram_service.toggle_favorite(data.post_id)
    return {"post_id": data.post_id, "is_favorite": is_fav}

# Media Routes
@app.get("/api/media/cache/{filename}")
async def serve_cached_media(filename: str):
    file_path = MEDIA_CACHE_DIR / filename
    if file_path.exists() and file_path.is_file():
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(str(file_path), media_type=mime_type)
    raise HTTPException(status_code=404, detail="Media not found")

@app.get("/api/media/photo/{channel_id}/{msg_id}")
async def get_photo(channel_id: int, msg_id: int):
    file_path = await telegram_service.download_media(channel_id, msg_id, media_type="photo")
    if file_path and file_path.exists():
        return FileResponse(str(file_path), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Photo not found")

@app.get("/api/media/doc/{channel_id}/{msg_id}")
async def get_doc(channel_id: int, msg_id: int):
    file_path = await telegram_service.download_media(channel_id, msg_id, media_type="doc", thumb=False)
    if file_path and file_path.exists():
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(str(file_path), media_type=mime_type or "application/octet-stream")
    raise HTTPException(status_code=404, detail="Document not found")

@app.get("/api/media/doc_thumb/{channel_id}/{msg_id}")
async def get_doc_thumb(channel_id: int, msg_id: int):
    file_path = await telegram_service.download_media(channel_id, msg_id, media_type="doc", thumb=True)
    if file_path and file_path.exists():
        return FileResponse(str(file_path), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Thumbnail not found")

@app.get("/api/media/webpage/{channel_id}/{msg_id}")
async def get_webpage_photo(channel_id: int, msg_id: int):
    file_path = await telegram_service.download_media(channel_id, msg_id, media_type="webpage")
    if file_path and file_path.exists():
        return FileResponse(str(file_path), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Preview photo not found")


# Static Frontend
static_dir = BASE_DIR / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return HTMLResponse("<h1>Telegram X is initializing...</h1>")
