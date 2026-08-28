import asyncio
import json
import os
import hashlib
import mimetypes
import time
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from html import escape

from telethon import TelegramClient, utils, events
from telethon.helpers import add_surrogate, del_surrogate, within_surrogate
from telethon.tl.types import (
    Channel,
    Chat,
    User,
    MessageMediaPhoto,
    MessageMediaDocument,
    MessageMediaWebPage,
    WebPage,
    DocumentAttributeVideo,
    DocumentAttributeAudio,
    DocumentAttributeAnimated,
    DocumentAttributeImageSize,
    DocumentAttributeFilename,
    ReactionEmoji,
    ReactionCustomEmoji,
    MessageEntityBold,
    MessageEntityItalic,
    MessageEntityCode,
    MessageEntityPre,
    MessageEntityEmail,
    MessageEntityUrl,
    MessageEntityTextUrl,
    MessageEntityMentionName,
    MessageEntityUnderline,
    MessageEntityStrike,
    MessageEntityBlockquote,
    MessageEntityCustomEmoji,
    MessageEntitySpoiler,
    TypeMessageEntity,
)
from telethon.tl.functions.messages import (
    GetHistoryRequest,
    SendReactionRequest,
    ForwardMessagesRequest,
    GetRepliesRequest,
)
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PasswordHashInvalidError,
)

from app.backend.config import API_ID, API_HASH, PROXY_CONFIG, SESSION_NAME, MEDIA_CACHE_DIR, SESSIONS_DIR

FAVORITES_FILE = SESSIONS_DIR / "favorites.json"
FEED_CACHE_FILE = SESSIONS_DIR / "feed_cache.json"
CHANNELS_CACHE_FILE = SESSIONS_DIR / "channels_cache.json"
COMMENTS_CACHE_FILE = SESSIONS_DIR / "comments_cache.json"


# Enhanced Telegram Entity to HTML Formatter with Liquid Glass Styling
ENTITY_TO_FORMATTER = {
    MessageEntityBold: ('<strong>', '</strong>'),
    MessageEntityItalic: ('<em>', '</em>'),
    MessageEntityCode: ('<code class="tg-code">', '</code>'),
    MessageEntityUnderline: ('<u>', '</u>'),
    MessageEntityStrike: ('<del>', '</del>'),
    MessageEntitySpoiler: ('<span class="tg-spoiler" title="Нажмите, чтобы показать" onclick="this.classList.toggle(\'revealed\')">', '</span>'),
    MessageEntityBlockquote: lambda e, _: (
        '<blockquote class="tg-quote expandable">' if getattr(e, 'collapsed', False) else '<blockquote class="tg-quote">',
        '</blockquote>'
    ),
    MessageEntityPre: lambda e, _: (
        f'<pre class="tg-pre"><code class="language-{getattr(e, "language", "")}">',
        '</code></pre>'
    ),
    MessageEntityEmail: lambda _, t: (f'<a href="mailto:{t}" target="_blank">', '</a>'),
    MessageEntityUrl: lambda _, t: (f'<a href="{t}" target="_blank" rel="noopener noreferrer">', '</a>'),
    MessageEntityTextUrl: lambda e, _: (f'<a href="{escape(e.url)}" target="_blank" rel="noopener noreferrer">', '</a>'),
    MessageEntityMentionName: lambda e, _: (f'<a href="tg://user?id={e.user_id}">', '</a>'),
    MessageEntityCustomEmoji: lambda e, _: (f'<tg-emoji emoji-id="{e.document_id}">', '</tg-emoji>'),
}


def unparse_telegram_html(text: str, entities: Optional[List[TypeMessageEntity]]) -> str:
    """Format Telegram message text with entities into rich safe HTML."""
    if not text:
        return ""
    if not entities:
        return escape(text)

    try:
        text = add_surrogate(text)
        insert_at = []
        for i, entity in enumerate(entities):
            s = entity.offset
            e = entity.offset + entity.length
            delimiter = ENTITY_TO_FORMATTER.get(type(entity), None)
            if delimiter:
                if callable(delimiter):
                    delims = delimiter(entity, text[s:e])
                else:
                    delims = delimiter
                insert_at.append((s, i, delims[0]))
                insert_at.append((e, -i, delims[1]))

        insert_at.sort(key=lambda t: (t[0], t[1]))
        next_escape_bound = len(text)
        while insert_at:
            at, _, what = insert_at.pop()
            while within_surrogate(text, at):
                at += 1
            text = text[:at] + what + escape(text[at:next_escape_bound]) + text[next_escape_bound:]
            next_escape_bound = at

        text = escape(text[:next_escape_bound]) + text[next_escape_bound:]
        return del_surrogate(text)
    except Exception as e:
        print(f"[TG Service] HTML unparse error: {e}")
        return escape(text)


class TelegramService:
    def __init__(self):
        self.api_id = API_ID
        self.api_hash = API_HASH
        self.proxy = PROXY_CONFIG
        self.session_name = SESSION_NAME
        self.client: Optional[TelegramClient] = None
        self.phone_code_hash: Optional[str] = None
        self.current_phone: Optional[str] = None
        self.qr_login_obj = None
        self.qr_task: Optional[asyncio.Task] = None
        self.qr_token_url: Optional[str] = None
        self.qr_needs_2fa: bool = False
        self._lock = asyncio.Lock()
        
        # In-memory & Persistent Caches
        self.favorites: set = self._load_favorites()
        raw_channels = self._load_json_cache(CHANNELS_CACHE_FILE, {})
        self.channels_cache: Dict[int, Dict[str, Any]] = {int(k): v for k, v in raw_channels.items()}
        self.posts_cache: Dict[str, Dict[str, Any]] = self._load_json_cache(FEED_CACHE_FILE, {})
        self.comments_cache: Dict[str, List[Dict[str, Any]]] = self._load_json_cache(COMMENTS_CACHE_FILE, {})
        self._is_refreshing_feed: bool = False

    def _load_favorites(self) -> set:
        if FAVORITES_FILE.exists():
            try:
                with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                    return set(json.load(f))
            except Exception as e:
                print(f"[TG Service] Favorites load error: {e}")
        return set()

    def _save_favorites(self):
        try:
            with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
                json.dump(list(self.favorites), f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[TG Service] Favorites save error: {e}")

    def _load_json_cache(self, filepath: Path, default_val: Any) -> Any:
        if filepath.exists():
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[TG Service] Cache load error ({filepath.name}): {e}")
        return default_val

    def _save_json_cache(self, filepath: Path, data: Any):
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[TG Service] Cache save error ({filepath.name}): {e}")

    async def get_client(self) -> TelegramClient:
        if self.client is None:
            self.client = TelegramClient(
                self.session_name,
                self.api_id,
                self.api_hash,
                proxy=self.proxy,
                device_model="Telegram X Web",
                system_version="Windows 11 / Web",
                app_version="2.0.0",
                lang_code="ru",
                system_lang_code="ru-RU"
            )
        if not self.client.is_connected():
            await self.client.connect()
        return self.client

    async def is_authorized(self) -> bool:
        try:
            client = await self.get_client()
            return await client.is_user_authorized()
        except Exception as e:
            print(f"[TG Service] Auth check error: {e}")
            return False

    async def get_me(self) -> Optional[Dict[str, Any]]:
        try:
            client = await self.get_client()
            if not await client.is_user_authorized():
                return None
            me = await client.get_me()
            if not me:
                return None
            
            avatar_url = await self.get_entity_avatar(me)

            return {
                "id": me.id,
                "first_name": me.first_name or "",
                "last_name": me.last_name or "",
                "name": f"{me.first_name or ''} {me.last_name or ''}".strip() or "Пользователь",
                "username": me.username or "",
                "phone": me.phone or "",
                "premium": getattr(me, "premium", False),
                "avatar": avatar_url,
            }
        except Exception as e:
            print(f"[TG Service] get_me error: {e}")
            return None

    async def request_phone_code(self, phone: str) -> Dict[str, Any]:
        client = await self.get_client()
        phone_clean = phone.strip().replace(" ", "").replace("-", "")
        self.current_phone = phone_clean
        res = await client.send_code_request(phone_clean)
        self.phone_code_hash = res.phone_code_hash
        return {
            "status": "code_sent",
            "phone": phone_clean,
            "phone_code_hash": self.phone_code_hash,
            "timeout": getattr(res, "timeout", 60),
        }

    async def sign_in_with_code(self, code: str, password: Optional[str] = None) -> Dict[str, Any]:
        client = await self.get_client()
        if not self.current_phone or not self.phone_code_hash:
            return {"status": "error", "message": "Сначала запросите код по номеру телефона"}

        try:
            if password:
                user = await client.sign_in(password=password)
            else:
                user = await client.sign_in(
                    phone=self.current_phone,
                    code=code.strip(),
                    phone_code_hash=self.phone_code_hash
                )
            me = await self.get_me()
            return {"status": "success", "user": me}
        except SessionPasswordNeededError:
            return {"status": "2fa_needed", "message": "Требуется пароль двухфакторной аутентификации (2FA)"}
        except PhoneCodeInvalidError:
            return {"status": "error", "message": "Неверный код подтверждения"}
        except PhoneCodeExpiredError:
            return {"status": "error", "message": "Срок действия кода истек. Запросите новый."}
        except PasswordHashInvalidError:
            return {"status": "error", "message": "Неверный 2FA пароль"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def sign_in_with_password(self, password: str) -> Dict[str, Any]:
        client = await self.get_client()
        try:
            await client.sign_in(password=password)
            me = await self.get_me()
            return {"status": "success", "user": me}
        except PasswordHashInvalidError:
            return {"status": "error", "message": "Неверный 2FA пароль"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def start_qr_login(self) -> Dict[str, Any]:
        client = await self.get_client()
        if await client.is_user_authorized():
            return {"status": "already_authorized", "user": await self.get_me()}

        self.qr_needs_2fa = False
        try:
            self.qr_login_obj = await client.qr_login()
            self.qr_token_url = self.qr_login_obj.url
        except SessionPasswordNeededError:
            self.qr_needs_2fa = True
            return {"status": "2fa_needed", "message": "Введите пароль двухфакторной аутентификации (2FA)"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

        async def wait_qr():
            try:
                await self.qr_login_obj.wait(timeout=120)
            except SessionPasswordNeededError:
                self.qr_needs_2fa = True
            except Exception as e:
                print(f"[TG Service] QR wait finished/error: {e}")

        if self.qr_task and not self.qr_task.done():
            self.qr_task.cancel()
        self.qr_task = asyncio.create_task(wait_qr())

        return {
            "status": "qr_ready",
            "url": self.qr_token_url,
            "expires": self.qr_login_obj.expires.isoformat() if hasattr(self.qr_login_obj, "expires") and self.qr_login_obj.expires else None
        }

    async def check_qr_login(self) -> Dict[str, Any]:
        if self.qr_needs_2fa:
            return {"status": "2fa_needed", "message": "QR-код подтвержден! Введите облачный пароль (2FA)"}

        if not self.qr_login_obj:
            return {"status": "not_started"}
        
        is_auth = await self.is_authorized()
        if is_auth:
            me = await self.get_me()
            return {"status": "success", "user": me}
        
        if self.qr_task and self.qr_task.done():
            try:
                exc = self.qr_task.exception()
                if isinstance(exc, SessionPasswordNeededError):
                    self.qr_needs_2fa = True
                    return {"status": "2fa_needed", "message": "QR-код подтвержден! Введите облачный пароль (2FA)"}
                elif exc:
                    return {"status": "error", "message": str(exc)}
            except Exception:
                pass
            return {"status": "expired"}

        return {"status": "waiting", "url": self.qr_token_url}

    async def logout(self) -> Dict[str, Any]:
        client = await self.get_client()
        try:
            if await client.is_user_authorized():
                await client.log_out()
            else:
                await client.disconnect()
            
            session_file = Path(f"{self.session_name}.session")
            if session_file.exists():
                session_file.unlink()

            self.client = None
            self.channels_cache.clear()
            self.posts_cache.clear()
            self.comments_cache.clear()
            return {"status": "logged_out"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def get_entity_avatar(self, entity) -> Optional[str]:
        if not entity:
            return None
        entity_id = getattr(entity, "id", None)
        if not entity_id:
            return None
        
        # 1. 0ms Immediate Disk Cache Check
        cache_path = MEDIA_CACHE_DIR / f"avatar_{entity_id}.jpg"
        if cache_path.exists() and cache_path.stat().st_size > 0:
            return f"/api/media/cache/avatar_{entity_id}.jpg"

        # 2. Download from Telegram MTProto
        try:
            client = await self.get_client()
            downloaded = await client.download_profile_photo(entity, file=str(cache_path), download_big=False)
            if downloaded and Path(downloaded).exists() and Path(downloaded).stat().st_size > 0:
                return f"/api/media/cache/avatar_{entity_id}.jpg"
        except Exception:
            pass
        return None

    async def get_subscribed_channels(self, limit: int = 100, force_refresh: bool = False) -> List[Dict[str, Any]]:
        if self.channels_cache and not force_refresh:
            channels_list = list(self.channels_cache.values())
            channels_list.sort(key=lambda x: (not x.get("pinned", False), not x.get("is_broadcast", True), x.get("title", "").lower()))
            return channels_list

        client = await self.get_client()
        if not await client.is_user_authorized():
            return list(self.channels_cache.values())

        channels_list = []
        try:
            async for dialog in client.iter_dialogs(limit=limit):
                entity = dialog.entity
                if isinstance(entity, Channel):
                    is_broadcast = getattr(entity, "broadcast", False)
                    is_megagroup = getattr(entity, "megagroup", False)
                    
                    avatar_url = await self.get_entity_avatar(entity)
                    channel_data = {
                        "id": entity.id,
                        "title": entity.title or "Без названия",
                        "username": entity.username or "",
                        "is_broadcast": is_broadcast,
                        "is_megagroup": is_megagroup,
                        "verified": getattr(entity, "verified", False),
                        "restricted": getattr(entity, "restricted", False),
                        "scam": getattr(entity, "scam", False),
                        "fake": getattr(entity, "fake", False),
                        "participants_count": getattr(entity, "participants_count", None),
                        "unread_count": dialog.unread_count,
                        "unread_mentions": dialog.unread_mentions_count,
                        "avatar": avatar_url,
                        "type": "channel" if is_broadcast else "group",
                        "pinned": dialog.pinned,
                    }
                    self.channels_cache[entity.id] = channel_data
                    channels_list.append(channel_data)

            self._save_json_cache(CHANNELS_CACHE_FILE, self.channels_cache)
        except Exception as e:
            print(f"[TG Service] Channels fetch error: {e}")

        channels_list.sort(key=lambda x: (not x.get("pinned", False), not x.get("is_broadcast", True), x.get("title", "").lower()))
        return channels_list

    def _extract_reactions(self, message) -> List[Dict[str, Any]]:
        reactions = []
        if hasattr(message, "reactions") and message.reactions and message.reactions.results:
            for r in message.reactions.results:
                emoji = ""
                if isinstance(r.reaction, ReactionEmoji):
                    emoji = r.reaction.emoticon
                elif isinstance(r.reaction, ReactionCustomEmoji):
                    emoji = "⭐"
                else:
                    emoji = "👍"
                
                reactions.append({
                    "emoji": emoji,
                    "count": r.count,
                    "chosen": getattr(r, "chosen_order", None) is not None
                })
        return reactions

    async def _format_single_media(self, msg, channel_id: int) -> Tuple[Optional[str], List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        msg_id = msg.id
        media_type = None
        media_items = []
        webpage_info = None

        if msg.media:
            if isinstance(msg.media, MessageMediaPhoto):
                media_type = "photo"
                photo_cache_file = MEDIA_CACHE_DIR / f"photo_{channel_id}_{msg_id}.jpg"
                photo_url = f"/api/media/cache/photo_{channel_id}_{msg_id}.jpg" if (photo_cache_file.exists() and photo_cache_file.stat().st_size > 0) else f"/api/media/photo/{channel_id}/{msg_id}"
                
                media_items.append({
                    "type": "photo",
                    "msg_id": msg_id,
                    "url": photo_url,
                    "width": getattr(msg.media.photo, "width", None) if hasattr(msg.media, "photo") else None,
                    "height": getattr(msg.media.photo, "height", None) if hasattr(msg.media, "photo") else None,
                })
            elif isinstance(msg.media, MessageMediaDocument):
                doc = msg.media.document
                mime = getattr(doc, "mime_type", "")
                is_video = False
                is_audio = False
                is_voice = False
                is_gif = False
                duration = 0
                width = None
                height = None
                filename = ""
                performer = ""
                title = ""

                for attr in getattr(doc, "attributes", []):
                    if isinstance(attr, DocumentAttributeVideo):
                        is_video = True
                        duration = getattr(attr, "duration", 0)
                        width = getattr(attr, "w", None)
                        height = getattr(attr, "h", None)
                    elif isinstance(attr, DocumentAttributeAudio):
                        is_audio = True
                        is_voice = getattr(attr, "voice", False)
                        duration = getattr(attr, "duration", 0)
                        performer = getattr(attr, "performer", "")
                        title = getattr(attr, "title", "")
                    elif isinstance(attr, DocumentAttributeAnimated):
                        is_gif = True
                    elif isinstance(attr, DocumentAttributeFilename):
                        filename = getattr(attr, "file_name", "")

                if is_gif:
                    media_type = "gif"
                elif is_video:
                    media_type = "video"
                elif is_audio:
                    media_type = "audio"
                else:
                    media_type = "document"

                media_items.append({
                    "type": media_type,
                    "msg_id": msg_id,
                    "url": f"/api/media/doc/{channel_id}/{msg_id}",
                    "thumb_url": f"/api/media/doc_thumb/{channel_id}/{msg_id}",
                    "mime": mime,
                    "size": getattr(doc, "size", 0),
                    "is_voice": is_voice,
                    "duration": duration,
                    "width": width,
                    "height": height,
                    "filename": filename,
                    "performer": performer,
                    "title": title,
                })

            elif isinstance(msg.media, MessageMediaWebPage):
                wp = msg.media.webpage
                if isinstance(wp, WebPage):
                    media_type = "webpage"
                    webpage_info = {
                        "url": wp.url,
                        "display_url": wp.display_url or wp.url,
                        "site_name": wp.site_name or "",
                        "title": wp.title or "",
                        "description": wp.description or "",
                        "has_photo": wp.photo is not None,
                        "photo_url": f"/api/media/webpage/{channel_id}/{msg_id}" if wp.photo else None
                    }

        return media_type, media_items, webpage_info

    async def _format_message_group(self, group_msgs: List[Any], channel_info: Dict[str, Any]) -> Dict[str, Any]:
        primary_msg = group_msgs[0]
        for m in group_msgs:
            if m.message:
                primary_msg = m
                break

        msg_id = primary_msg.id
        channel_id = channel_info["id"]
        unique_id = f"{channel_id}_{msg_id}"

        all_media_items = []
        overall_media_type = None
        webpage_info = None

        for m in group_msgs:
            m_type, m_items, m_wp = await self._format_single_media(m, channel_id)
            if m_items:
                all_media_items.extend(m_items)
            if not overall_media_type and m_type:
                overall_media_type = m_type
            if not webpage_info and m_wp:
                webpage_info = m_wp

        if len(all_media_items) > 1:
            overall_media_type = "album"

        reactions = self._extract_reactions(primary_msg)
        raw_text = primary_msg.message or ""
        html_text = unparse_telegram_html(raw_text, getattr(primary_msg, "entities", None))

        if channel_info.get("username"):
            tg_url = f"https://t.me/{channel_info['username']}/{msg_id}"
        else:
            clean_cid = str(channel_id).replace("-100", "").replace("-", "")
            tg_url = f"https://t.me/c/{clean_cid}/{msg_id}"

        replies_count = 0
        if hasattr(primary_msg, "replies") and primary_msg.replies:
            replies_count = getattr(primary_msg.replies, "replies", 0)

        views = getattr(primary_msg, "views", None)
        forwards = getattr(primary_msg, "forwards", 0)

        return {
            "id": unique_id,
            "msg_id": msg_id,
            "channel_id": channel_id,
            "channel": channel_info,
            "date": primary_msg.date.isoformat() if primary_msg.date else datetime.now().isoformat(),
            "timestamp": int(primary_msg.date.timestamp()) if primary_msg.date else int(datetime.now().timestamp()),
            "text": raw_text,
            "text_html": html_text,
            "media_type": overall_media_type,
            "media_items": all_media_items,
            "webpage": webpage_info,
            "views": views,
            "forwards": forwards,
            "replies_count": replies_count,
            "reactions": reactions,
            "tg_url": tg_url,
            "is_pinned": getattr(primary_msg, "pinned", False),
            "is_favorite": unique_id in self.favorites,
        }

    async def get_wall_feed(
        self,
        channel_id: Optional[int] = None,
        feed_type: str = "all", # 'all', 'media', 'popular', 'favorites'
        limit: int = 40,
        offset_date: Optional[int] = None,
        search_query: Optional[str] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        # Fast 0ms memory cache hit
        if not offset_date and not search_query and not channel_id and not force_refresh and self.posts_cache:
            cached_posts = list(self.posts_cache.values())
            if cached_posts:
                if feed_type == "media":
                    filtered = [p for p in cached_posts if p.get("media_type") in ("photo", "video", "gif", "album")]
                elif feed_type == "favorites":
                    filtered = [p for p in cached_posts if p["id"] in self.favorites]
                elif feed_type == "popular":
                    filtered = [p for p in cached_posts if (p.get("views") or 0) > 300 or len(p.get("reactions", [])) > 0]
                    filtered.sort(key=lambda x: (x.get("views") or 0) + len(x.get("reactions", [])) * 50, reverse=True)
                else:
                    filtered = cached_posts
                    filtered.sort(key=lambda x: x["timestamp"], reverse=True)

                if filtered:
                    return {
                        "posts": filtered[:limit],
                        "channels": list(self.channels_cache.values()),
                        "total_count": len(filtered[:limit]),
                        "has_more": len(filtered) > limit,
                        "next_offset": filtered[:limit][-1]["timestamp"] if filtered else None,
                        "from_cache": True
                    }

        client = await self.get_client()
        if not await client.is_user_authorized():
            return {"posts": [], "channels": [], "has_more": False}

        if not self.channels_cache:
            await self.get_subscribed_channels()

        posts = []
        target_channels = []

        if channel_id:
            ch_info = self.channels_cache.get(channel_id)
            if not ch_info:
                try:
                    entity = await client.get_entity(channel_id)
                    avatar = await self.get_entity_avatar(entity)
                    ch_info = {
                        "id": entity.id,
                        "title": getattr(entity, "title", "Канал"),
                        "username": getattr(entity, "username", ""),
                        "avatar": avatar,
                        "verified": getattr(entity, "verified", False),
                        "is_broadcast": getattr(entity, "broadcast", True),
                    }
                    self.channels_cache[entity.id] = ch_info
                except Exception:
                    pass
            if ch_info:
                target_channels = [ch_info]
        else:
            # Top 20 active broadcast channels for fast parallel fetching
            target_channels = [
                c for c in self.channels_cache.values()
                if c.get("is_broadcast", True)
            ][:20]

        if not target_channels:
            all_chs = await self.get_subscribed_channels(limit=25)
            target_channels = [c for c in all_chs if c.get("is_broadcast", True)][:20]

        offset_dt = datetime.fromtimestamp(offset_date) if offset_date else None

        async def fetch_channel_posts(ch):
            try:
                ch_entity = await client.get_entity(ch["id"])
                fetch_limit = 20 if not channel_id else limit
                msgs = await asyncio.wait_for(
                    client.get_messages(
                        ch_entity,
                        limit=fetch_limit,
                        offset_date=offset_dt,
                        search=search_query if search_query else None
                    ),
                    timeout=5.0
                )
                if not msgs:
                    return []

                grouped_map = {}
                single_msgs = []

                for m in msgs:
                    if not m:
                        continue
                    if not m.message and not m.media:
                        continue
                    
                    gid = getattr(m, "grouped_id", None)
                    if gid:
                        if gid not in grouped_map:
                            grouped_map[gid] = []
                        grouped_map[gid].append(m)
                    else:
                        single_msgs.append(m)

                formatted = []
                for m in single_msgs:
                    post_data = await self._format_message_group([m], ch)
                    formatted.append(post_data)
                    self.posts_cache[post_data["id"]] = post_data

                for gid, g_msgs in grouped_map.items():
                    post_data = await self._format_message_group(g_msgs, ch)
                    formatted.append(post_data)
                    self.posts_cache[post_data["id"]] = post_data

                return formatted
            except Exception as e:
                return []

        tasks = [fetch_channel_posts(ch) for ch in target_channels]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if isinstance(res, list):
                posts.extend(res)

        self._save_json_cache(FEED_CACHE_FILE, self.posts_cache)

        if feed_type == "media":
            posts = [p for p in posts if p.get("media_type") in ("photo", "video", "gif", "album")]
        elif feed_type == "favorites":
            posts = [p for p in posts if p["id"] in self.favorites]
        elif feed_type == "popular":
            posts = [p for p in posts if (p.get("views") or 0) > 300 or len(p.get("reactions", [])) > 0]
            posts.sort(key=lambda x: (x.get("views") or 0) + len(x.get("reactions", [])) * 50, reverse=True)

        if feed_type != "popular":
            posts.sort(key=lambda x: x["timestamp"], reverse=True)

        if offset_date:
            posts = [p for p in posts if p["timestamp"] < offset_date]

        has_more = len(posts) > limit
        sliced_posts = posts[:limit]

        return {
            "posts": sliced_posts,
            "channels": list(self.channels_cache.values()),
            "total_count": len(sliced_posts),
            "has_more": has_more,
            "next_offset": sliced_posts[-1]["timestamp"] if sliced_posts else None,
            "from_cache": False
        }

    async def get_post_comments(self, channel_id: int, msg_id: int, limit: int = 35, force_refresh: bool = False) -> List[Dict[str, Any]]:
        cache_key = f"{channel_id}_{msg_id}"
        
        if not force_refresh and cache_key in self.comments_cache:
            return self.comments_cache[cache_key]

        client = await self.get_client()
        try:
            entity = await client.get_entity(channel_id)
            replies = await asyncio.wait_for(client.get_messages(entity, reply_to=msg_id, limit=limit), timeout=5.0)
            comments = []
            for r in replies:
                if not r or not r.message:
                    continue
                sender = r.sender
                sender_name = "Пользователь"
                avatar_url = None
                if sender:
                    sender_name = utils.get_display_name(sender)
                    avatar_url = await self.get_entity_avatar(sender)

                html_text = unparse_telegram_html(r.message, getattr(r, "entities", None))

                comments.append({
                    "id": r.id,
                    "text": r.message,
                    "text_html": html_text,
                    "date": r.date.isoformat() if r.date else None,
                    "timestamp": int(r.date.timestamp()) if r.date else 0,
                    "sender_name": sender_name,
                    "sender_avatar": avatar_url,
                    "reactions": self._extract_reactions(r),
                })

            self.comments_cache[cache_key] = comments
            self._save_json_cache(COMMENTS_CACHE_FILE, self.comments_cache)
            return comments
        except Exception as e:
            return self.comments_cache.get(cache_key, [])

    async def send_comment(self, channel_id: int, msg_id: int, text: str) -> Dict[str, Any]:
        """Send a new comment / reply to a channel post."""
        if not text or not text.strip():
            return {"status": "error", "message": "Текст комментария пуст"}

        client = await self.get_client()
        try:
            entity = await client.get_entity(channel_id)
            clean_text = text.strip()
            
            sent_msg = None
            try:
                sent_msg = await client.send_message(entity, clean_text, comment_to=msg_id)
            except Exception:
                sent_msg = await client.send_message(entity, clean_text, reply_to=msg_id)

            me = await self.get_me()
            sender_name = me.get("name", "Вы") if me else "Вы"
            sender_avatar = me.get("avatar") if me else None

            new_comment = {
                "id": getattr(sent_msg, "id", int(time.time())),
                "text": clean_text,
                "text_html": escape(clean_text),
                "date": datetime.now().isoformat(),
                "timestamp": int(datetime.now().timestamp()),
                "sender_name": sender_name,
                "sender_avatar": sender_avatar,
                "reactions": [],
            }

            cache_key = f"{channel_id}_{msg_id}"
            if cache_key not in self.comments_cache:
                self.comments_cache[cache_key] = []
            self.comments_cache[cache_key].append(new_comment)
            self._save_json_cache(COMMENTS_CACHE_FILE, self.comments_cache)

            post_id = f"{channel_id}_{msg_id}"
            if post_id in self.posts_cache:
                self.posts_cache[post_id]["replies_count"] = (self.posts_cache[post_id].get("replies_count") or 0) + 1
                self._save_json_cache(FEED_CACHE_FILE, self.posts_cache)

            return {"status": "success", "comment": new_comment}
        except Exception as e:
            print(f"[TG Service] Send comment error: {e}")
            return {"status": "error", "message": str(e)}

    async def send_reaction(self, channel_id: int, msg_id: int, emoji: str) -> Dict[str, Any]:
        client = await self.get_client()
        try:
            entity = await client.get_entity(channel_id)
            reaction = [ReactionEmoji(emoticon=emoji)] if emoji else []
            await client(SendReactionRequest(
                peer=entity,
                msg_id=msg_id,
                reaction=reaction
            ))
            return {"status": "success", "emoji": emoji}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def forward_to_saved(self, channel_id: int, msg_id: int) -> Dict[str, Any]:
        client = await self.get_client()
        try:
            entity = await client.get_entity(channel_id)
            await client.forward_messages('me', msg_id, entity)
            return {"status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def toggle_favorite(self, post_id: str) -> bool:
        if post_id in self.favorites:
            self.favorites.remove(post_id)
            is_fav = False
        else:
            self.favorites.add(post_id)
            is_fav = True
        self._save_favorites()
        return is_fav

    async def download_media(self, channel_id: int, msg_id: int, media_type: str = "photo", thumb: bool = False) -> Optional[Path]:
        cache_key = f"{media_type}_{'thumb_' if thumb else ''}{channel_id}_{msg_id}"
        
        # 1. 0ms Disk Cache Check
        matching = list(MEDIA_CACHE_DIR.glob(f"{cache_key}.*"))
        if matching and matching[0].stat().st_size > 0:
            return matching[0]

        # 2. Download from MTProto
        client = await self.get_client()
        try:
            entity = await client.get_entity(channel_id)
            msg = await client.get_messages(entity, ids=msg_id)
            if not msg or not msg.media:
                return None

            if media_type == "photo" or (media_type == "webpage" and hasattr(msg.media, "webpage")):
                target_file = MEDIA_CACHE_DIR / f"{cache_key}.jpg"
                downloaded = await client.download_media(msg, file=str(target_file), thumb=-1 if thumb else None)
                if downloaded and Path(downloaded).exists() and Path(downloaded).stat().st_size > 0:
                    return Path(downloaded)

            elif media_type == "doc":
                if thumb:
                    target_file = MEDIA_CACHE_DIR / f"{cache_key}.jpg"
                    downloaded = await client.download_media(msg, file=str(target_file), thumb=-1)
                else:
                    ext = ".mp4" if getattr(msg.media.document, "mime_type", "").startswith("video") else ".bin"
                    if getattr(msg.media.document, "mime_type", "").startswith("audio"):
                        ext = ".mp3"
                    target_file = MEDIA_CACHE_DIR / f"{cache_key}{ext}"
                    downloaded = await client.download_media(msg, file=str(target_file))
                
                if downloaded and Path(downloaded).exists() and Path(downloaded).stat().st_size > 0:
                    return Path(downloaded)

        except Exception as e:
            print(f"[TG Service] Download error for {channel_id}/{msg_id}: {e}")
            return None
        return None


telegram_service = TelegramService()
