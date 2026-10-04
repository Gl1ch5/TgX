/**
 * ====================================================================
 * TELEGRAM SERVICE (GramJS MTProto client running in the browser)
 * ====================================================================
 * Replaces the former Python backend: auth, channels, wall feed,
 * comments, reactions and media all go straight from the browser to
 * Telegram over WebSocket. The session string lives in localStorage.
 */

import { TelegramClient, Api, utils, StringSession, computeCheck, bigInt } from './vendor/gramjs.js';
import { getPrefs } from './core/prefs.js';

// Telegram application credentials (https://my.telegram.org). Public by design:
// every web client ships them; the user's own session is what grants access.
const API_ID = 27451332;
const API_HASH = '1462d961e4a7bf6b5139309255f09fd6';

const LS = {
  session: 'telex.session',
  seen: 'telex.seen',
  me: 'telex.me',
  channels: 'telex.channels',
  posts: 'telex.posts',
  favorites: 'telex.favorites',
};

const FEED_CONCURRENCY = 8;
const POSTS_CACHE_LIMIT = 600;
const STREAM_CHUNK = 512 * 1024;
const STREAM_READ_AHEAD = 6;
const SMALL_FILE = 2 * 1024 * 1024; // whole-file download+cache; bigger files stream
const LIVE_POLL_MS = 30000;
const CHUNK_CACHE_BYTES = 384 * 1024 * 1024; // in-memory video/audio chunks

// ---------------- localStorage helpers ----------------

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[TeleX] localStorage write failed', key, e);
  }
}

function lsDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ---------------- Session persistence ----------------

/**
 * StringSession that writes itself to localStorage every time GramJS saves
 * (new auth key, DC switch, reconnect). Empty saves never overwrite a good one.
 */
class PersistentSession extends StringSession {
  constructor(value) {
    super(value);
    this.disabled = false;
  }

  save() {
    const value = super.save();
    if (value && !this.disabled) lsSet(LS.session, value);
    return value;
  }
}

const SESSION_DEAD = /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- HTML formatting ----------------

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Telegram voice waveform: 5-bit packed samples -> ~40 bars (0..31). */
function decodeWaveform(bytes) {
  const count = Math.floor((bytes.length * 8) / 5);
  const raw = [];
  for (let i = 0; i < count; i++) {
    const byte = Math.floor((i * 5) / 8);
    const shift = (i * 5) % 8;
    raw.push(((bytes[byte] | ((bytes[byte + 1] || 0) << 8)) >> shift) & 31);
  }
  const bars = 40;
  if (raw.length <= bars) return raw;
  return Array.from({ length: bars }, (_, i) => raw[Math.floor((i * raw.length) / bars)]);
}

function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|tg:|mailto:)/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return 'https://' + u;
  return null;
}

function entityTags(e, text) {
  const link = (href) => {
    const safe = safeUrl(href);
    return safe ? [`<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">`, '</a>'] : null;
  };
  if (e instanceof Api.MessageEntityBold) return ['<strong>', '</strong>'];
  if (e instanceof Api.MessageEntityItalic) return ['<em>', '</em>'];
  if (e instanceof Api.MessageEntityUnderline) return ['<u>', '</u>'];
  if (e instanceof Api.MessageEntityStrike) return ['<del>', '</del>'];
  if (e instanceof Api.MessageEntityCode) return ['<code class="tg-code">', '</code>'];
  if (e instanceof Api.MessageEntityPre) {
    const lang = String(e.language || '').replace(/[^\w+#-]/g, '');
    return [`<pre class="tg-pre"><code class="language-${lang}">`, '</code></pre>'];
  }
  if (e instanceof Api.MessageEntitySpoiler) {
    return ['<span class="tg-spoiler" title="Нажмите, чтобы показать" onclick="this.classList.toggle(\'revealed\')">', '</span>'];
  }
  if (e instanceof Api.MessageEntityBlockquote) {
    return [e.collapsed ? '<blockquote class="tg-quote expandable">' : '<blockquote class="tg-quote">', '</blockquote>'];
  }
  if (e instanceof Api.MessageEntityUrl) return link(text);
  if (e instanceof Api.MessageEntityTextUrl) return link(e.url);
  if (e instanceof Api.MessageEntityEmail) return [`<a href="mailto:${escapeHtml(text)}">`, '</a>'];
  if (e instanceof Api.MessageEntityMentionName) return [`<a href="tg://user?id=${Number(e.userId)}">`, '</a>'];
  if (e instanceof Api.MessageEntityCustomEmoji) return [`<span class="tx-cemoji" data-id="${String(e.documentId).replace(/\D/g, '')}">`, '</span>'];
  return null;
}

/** Telegram text + entities -> safe HTML (offsets are UTF-16, same as JS strings). */
export function toHtml(text, entities) {
  if (!text) return '';
  if (!entities || !entities.length) return escapeHtml(text);

  const opens = new Map();
  const closes = new Map();
  const push = (map, at, tag, front) => {
    if (!map.has(at)) map.set(at, []);
    front ? map.get(at).unshift(tag) : map.get(at).push(tag);
  };
  for (const e of entities) {
    const start = e.offset;
    const end = e.offset + e.length;
    const tags = entityTags(e, text.slice(start, end));
    if (!tags) continue;
    push(opens, start, tags[0], false);
    push(closes, end, tags[1], true);
  }

  let out = '';
  for (let i = 0; i <= text.length; i++) {
    if (closes.has(i)) out += closes.get(i).join('');
    if (opens.has(i)) out += opens.get(i).join('');
    if (i < text.length) out += escapeHtml(text[i]);
  }
  return out;
}

// ---------------- Service ----------------

class TelegramService {
  constructor() {
    this.client = null;
    this.connecting = null;
    this.me = null;
    this.entities = new Map();   // "c123" / "u456" -> Api.Channel / Api.User
    this.messages = new Map();   // "123_45" -> Api.Message
    this.channels = new Map(Object.entries(lsGet(LS.channels, {})).map(([k, v]) => [Number(k), v]));
    this.posts = new Map(Object.entries(lsGet(LS.posts, {})));
    this.favorites = new Map(Object.entries(lsGet(LS.favorites, {})));
    // Newest post id the user has seen per channel; "new" = posts above it.
    this.seen = lsGet(LS.seen, {});
    for (const ch of this.channels.values()) {
      ch.unread_count = this.seen[ch.id] == null ? 0 : Math.max(0, (ch.top_id || 0) - this.seen[ch.id]);
    }
    this.comments = new Map();
    this.commentMsgs = new Map(); // "chatId/msgId" -> Api.Message (comment media)
    this.discussions = new Map();
    this.dialogsLoaded = null;
    this.phone = null;
    this.phoneCodeHash = null;
    this.qrRun = 0;
    this.authorized = false;
  }

  // ----- connection -----

  async getClient() {
    if (this.client && this.client.connected) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (!this.client) {
        const session = new PersistentSession(lsGet(LS.session, ''));
        this.client = new TelegramClient(session, API_ID, API_HASH, {
          connectionRetries: 5,
          useWSS: true,
          deviceModel: 'TeleX Web',
          systemVersion: navigator.platform || 'Web',
          appVersion: '3.0.0',
          langCode: 'ru',
          systemLangCode: 'ru-RU',
        });
        this.client.setLogLevel('error');
      }
      await this.client.connect();
      return this.client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /** Open the MTProto connection early (in parallel with UI start-up). */
  warmUp() {
    if (this.hasSession()) this.getClient().catch(() => {});
  }

  hasSession() {
    return !!lsGet(LS.session, '');
  }

  saveSession() {
    this.client.session.save();
  }

  dropSession() {
    if (this.client) this.client.session.disabled = true;
    lsDel(LS.session);
    lsDel(LS.me);
    this.authorized = false;
  }

  /** Last known profile, so the UI can show who is logged in before connecting. */
  cachedMe() {
    return lsGet(LS.me, null);
  }

  /**
   * True while the stored session is valid. Network failures are retried and
   * never log the user out — only Telegram saying the key is revoked does.
   */
  async isAuthorized() {
    if (this.authorized) return true;
    if (!this.hasSession()) return false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const client = await this.getClient();
        await client.invoke(new Api.updates.GetState());
        this.authorized = true;
        this.saveSession();
        return true;
      } catch (e) {
        const code = (e && e.errorMessage) || '';
        if (SESSION_DEAD.test(code)) {
          console.warn('[TeleX] session revoked:', code);
          this.dropSession();
          return false;
        }
        console.warn(`[TeleX] auth check failed (attempt ${attempt})`, e);
        await sleep(1200 * attempt);
      }
    }
    // Offline or Telegram unreachable: keep the session, show cached data.
    this.offline = true;
    return true;
  }


  // ----- entities & avatars -----

  entityKey(entity) {
    if (entity instanceof Api.User) return `u${entity.id}`;
    return `c${entity.id}`;
  }

  rememberEntity(entity) {
    if (!entity || entity.id == null) return null;
    const key = this.entityKey(entity);
    this.entities.set(key, entity);
    return key;
  }

  /**
   * `ctx` = { peer, msgId }: a message the entity appeared in. Needed for
   * "min" users/channels (comment authors) whose access hash Telegram hides —
   * their photo is then fetched via InputPeerUserFromMessage.
   */
  avatarUrl(entity, big = false, ctx = null) {
    if (!entity) return null;
    const photo = entity.photo;
    if (!photo || photo instanceof Api.ChatPhotoEmpty || photo instanceof Api.UserProfilePhotoEmpty) return null;
    const key = this.rememberEntity(entity);
    if (ctx) {
      this.peerContext = this.peerContext || new Map();
      this.peerContext.set(key, ctx);
    }
    return `media/${big ? 'avatarbig' : 'avatar'}/${key}/${photo.photoId}`;
  }

  formatUser(me) {
    const name = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'Пользователь';
    return {
      id: Number(me.id),
      first_name: me.firstName || '',
      last_name: me.lastName || '',
      name,
      username: me.username || '',
      phone: me.phone || '',
      premium: !!me.premium,
      avatar: this.avatarUrl(me),
      avatar_big: this.avatarUrl(me, true),
    };
  }

  /** Bio and birthday of the logged-in user (users.getFullUser). */
  async getFullMe() {
    const client = await this.getClient();
    const res = await client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
    const full = res.fullUser || {};
    const b = full.birthday;
    return {
      about: full.about || '',
      birthday: b ? { day: b.day, month: b.month, year: b.year || null } : null,
    };
  }

  /** Active sessions (account.getAuthorizations). */
  async getAuthorizations() {
    const client = await this.getClient();
    const res = await client.invoke(new Api.account.GetAuthorizations());
    return (res.authorizations || []).map((a) => ({
      hash: a.hash.toString(),
      current: !!a.current,
      app: `${a.appName || 'Telegram'} ${a.appVersion || ''}`.trim(),
      device: [a.deviceModel, a.platform, a.systemVersion].filter(Boolean).join(', '),
      location: [a.ip, a.country].filter(Boolean).join(' — '),
      active: a.dateActive || 0,
      official: !!a.officialApp,
    }));
  }

  async resetAuthorization(hash) {
    const client = await this.getClient();
    await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) }));
    return { status: 'success' };
  }

  async getMe() {
    const client = await this.getClient();
    const me = await client.getMe();
    this.me = me;
    const user = me ? this.formatUser(me) : null;
    if (user) lsSet(LS.me, user);
    return user;
  }

  async channelEntity(channelId) {
    const key = `c${channelId}`;
    if (!this.entities.has(key)) await this.loadDialogs();
    const entity = this.entities.get(key);
    if (!entity) throw new Error('Канал не найден среди ваших подписок');
    return entity;
  }

  // ----- auth -----

  async finishLogin() {
    this.saveSession();
    this.authorized = true;
    return { status: 'success', user: await this.getMe() };
  }

  async requestPhoneCode(phone) {
    const client = await this.getClient();
    this.phone = phone.replace(/[\s()-]/g, '');
    const res = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, this.phone);
    this.phoneCodeHash = res.phoneCodeHash;
    return { status: 'code_sent', phone: this.phone, via_app: res.isCodeViaApp };
  }

  async signInWithCode(code) {
    if (!this.phone || !this.phoneCodeHash) {
      return { status: 'error', message: 'Сначала запросите код по номеру телефона' };
    }
    const client = await this.getClient();
    try {
      const res = await client.invoke(new Api.auth.SignIn({
        phoneNumber: this.phone,
        phoneCodeHash: this.phoneCodeHash,
        phoneCode: code.trim(),
      }));
      if (res instanceof Api.auth.AuthorizationSignUpRequired) {
        return { status: 'error', message: 'Этот номер не зарегистрирован в Telegram' };
      }
      return await this.finishLogin();
    } catch (e) {
      return this.authError(e);
    }
  }

  async signInWithPassword(password) {
    const client = await this.getClient();
    try {
      const pwd = await client.invoke(new Api.account.GetPassword());
      const check = await computeCheck(pwd, password);
      await client.invoke(new Api.auth.CheckPassword({ password: check }));
      return await this.finishLogin();
    } catch (e) {
      return this.authError(e);
    }
  }

  authError(e) {
    const code = e && e.errorMessage;
    const messages = {
      SESSION_PASSWORD_NEEDED: null,
      PHONE_CODE_INVALID: 'Неверный код подтверждения',
      PHONE_CODE_EXPIRED: 'Срок действия кода истёк. Запросите новый.',
      PHONE_NUMBER_INVALID: 'Неверный номер телефона',
      PASSWORD_HASH_INVALID: 'Неверный облачный пароль',
      FLOOD: 'Слишком много попыток. Попробуйте позже.',
    };
    if (code === 'SESSION_PASSWORD_NEEDED') {
      return { status: '2fa_needed', message: 'Требуется облачный пароль (2FA)' };
    }
    if (code && code.startsWith('FLOOD_WAIT')) return { status: 'error', message: messages.FLOOD };
    return { status: 'error', message: messages[code] || (e && e.message) || String(e) };
  }

  /**
   * QR login. Calls onQR(url) whenever a fresh token is issued and resolves with
   * {status: 'success'|'2fa_needed'|'cancelled'|'error'}.
   */
  async startQrLogin(onQR) {
    const run = ++this.qrRun;
    const client = await this.getClient();
    const creds = { apiId: API_ID, apiHash: API_HASH, exceptIds: [] };

    let scanned;
    const scannedPromise = new Promise((resolve) => { scanned = resolve; });
    const handler = (update) => {
      if (update instanceof Api.UpdateLoginToken) scanned();
    };
    client.addEventHandler(handler);

    try {
      while (run === this.qrRun) {
        const token = await client.invoke(new Api.auth.ExportLoginToken(creds));
        if (token instanceof Api.auth.LoginTokenSuccess) break;
        if (!(token instanceof Api.auth.LoginToken)) break;
        const b64 = token.token.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        onQR(`tg://login?token=${b64}`);
        const ttl = Math.max(5, token.expires - Math.floor(Date.now() / 1000)) * 1000;
        const result = await Promise.race([
          scannedPromise.then(() => 'scanned'),
          new Promise((r) => setTimeout(() => r('expired'), Math.min(ttl, 30000))),
        ]);
        if (result === 'scanned') break;
      }
      if (run !== this.qrRun) return { status: 'cancelled' };

      let res = await client.invoke(new Api.auth.ExportLoginToken(creds));
      if (res instanceof Api.auth.LoginTokenMigrateTo) {
        await client._switchDC(res.dcId);
        res = await client.invoke(new Api.auth.ImportLoginToken({ token: res.token }));
      }
      if (res instanceof Api.auth.LoginTokenSuccess) return await this.finishLogin();
      return { status: 'error', message: `Неожиданный ответ Telegram: ${res.className}` };
    } catch (e) {
      return this.authError(e);
    } finally {
      client.removeEventHandler(handler);
    }
  }

  cancelQrLogin() {
    this.qrRun++;
  }

  async logout() {
    if (this.client) this.client.session.disabled = true;
    try {
      const client = await this.getClient();
      await client.invoke(new Api.auth.LogOut());
    } catch (e) {
      console.warn('[TeleX] logout', e);
    }
    try { await this.client.disconnect(); } catch {}
    this.client = null;
    this.authorized = false;
    this.me = null;
    this.entities.clear();
    this.messages.clear();
    this.channels.clear();
    this.posts.clear();
    this.comments.clear();
    this.commentMsgs.clear();
    this.discussions.clear();
    this.favorites.clear();
    this.dialogsLoaded = null;
    Object.values(LS).forEach(lsDel);
    this.seen = {};
    try { await caches.delete('telex-media-v1'); } catch {}
    return { status: 'logged_out' };
  }

  async clearCaches() {
    this.posts.clear();
    this.comments.clear();
    this.commentMsgs.clear();
    this.discussions.clear();
    lsDel(LS.posts);
    try { await caches.delete('telex-media-v1'); } catch {}
  }

  // ----- channels -----

  sortChannels(list) {
    return list.sort((a, b) =>
      (b.pinned - a.pinned) ||
      (b.is_broadcast - a.is_broadcast) ||
      (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase()));
  }

  loadDialogs(limit = 100) {
    if (!this.dialogsLoaded) {
      this.dialogsLoaded = this._loadDialogs(limit).catch((e) => {
        this.dialogsLoaded = null;
        throw e;
      });
    }
    return this.dialogsLoaded;
  }

  async _loadDialogs(limit) {
    const client = await this.getClient();
    const dialogs = await client.getDialogs({ limit });
    const fresh = new Map();
    for (const d of dialogs) {
      const e = d.entity;
      if (!(e instanceof Api.Channel)) continue;
      this.rememberEntity(e);
      const id = Number(e.id);
      fresh.set(id, {
        id,
        title: e.title || 'Без названия',
        username: e.username || (e.usernames && e.usernames[0] && e.usernames[0].username) || '',
        is_broadcast: !!e.broadcast,
        is_megagroup: !!e.megagroup,
        verified: !!e.verified,
        scam: !!e.scam,
        fake: !!e.fake,
        participants_count: e.participantsCount || null,
        unread_count: d.unreadCount || 0,
        unread_mentions: d.unreadMentionsCount || 0,
        avatar: this.avatarUrl(e),
        type: e.broadcast ? 'channel' : 'group',
        pinned: !!d.pinned,
        muted: this.isMuted(d),
        last_text: this.previewOf(d.message),
        last_date: d.message ? d.message.date : 0,
        top_id: d.dialog ? d.dialog.topMessage : 0,
        read_max: d.dialog ? d.dialog.readInboxMaxId : 0,
      });
    }
    // First time we meet a channel: everything already there counts as seen.
    for (const ch of fresh.values()) {
      if (this.seen[ch.id] == null) this.seen[ch.id] = ch.top_id || 0;
      ch.unread_count = Math.max(0, (ch.top_id || 0) - this.seen[ch.id]);
    }
    lsSet(LS.seen, this.seen);
    this.channels = fresh;
    lsSet(LS.channels, Object.fromEntries(fresh));
    return this.sortChannels([...fresh.values()]);
  }

  isMuted(dialog) {
    const settings = dialog.dialog && dialog.dialog.notifySettings;
    return !!(settings && settings.muteUntil && settings.muteUntil > Date.now() / 1000);
  }

  previewOf(msg) {
    if (!msg) return '';
    const text = (msg.message || '').replace(/\s+/g, ' ').trim();
    const media = msg.media;
    let label = '';
    if (media instanceof Api.MessageMediaPhoto) label = 'Фото';
    else if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
      const attrs = media.document.attributes || [];
      if (attrs.some((a) => a instanceof Api.DocumentAttributeSticker)) label = 'Стикер';
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeAnimated)) label = 'GIF';
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeVideo)) label = 'Видео';
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio && a.voice)) label = 'Голосовое сообщение';
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio)) label = 'Аудио';
      else label = 'Файл';
    } else if (media instanceof Api.MessageMediaPoll) label = 'Опрос';
    if (label && text) return `${label}, ${text}`.slice(0, 140);
    return (label || text).slice(0, 140);
  }

  async getChannels(forceRefresh = false) {
    if (this.channels.size && !forceRefresh) {
      if (!this.dialogsLoaded) this.loadDialogs().catch(() => {});
      return this.sortChannels([...this.channels.values()]);
    }
    if (forceRefresh) this.dialogsLoaded = null;
    return this.loadDialogs();
  }

  // ----- posts -----

  reactionsOf(msg) {
    const results = (msg.reactions && msg.reactions.results) || [];
    return results.map((r) => {
      const base = { count: r.count, chosen: r.chosenOrder != null };
      if (r.reaction instanceof Api.ReactionEmoji) return { ...base, emoji: r.reaction.emoticon };
      if (r.reaction instanceof Api.ReactionCustomEmoji) return { ...base, emoji: '', custom_id: r.reaction.documentId.toString() };
      if (r.reaction instanceof Api.ReactionPaid) return { ...base, emoji: '⭐', paid: true };
      return null;
    }).filter(Boolean).sort((a, b) => (b.paid - a.paid) || (b.count - a.count));
  }

  mediaOf(msg, channelId) {
    const media = msg.media;
    const base = `${channelId}/${msg.id}`;
    if (!media) return { type: null, items: [], webpage: null };

    if (media instanceof Api.MessageMediaPhoto && media.photo) {
      const sizes = (media.photo.sizes || []).filter((s) => s.w && s.h);
      const big = sizes[sizes.length - 1] || {};
      return {
        type: 'photo',
        items: [{ type: 'photo', msg_id: msg.id, url: `media/photo/${base}`, width: big.w || null, height: big.h || null }],
        webpage: null,
      };
    }

    if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
      const doc = media.document;
      const info = { video: false, audio: false, voice: false, gif: false, sticker: false, round: false, duration: 0, w: null, h: null, fileName: '', performer: '', title: '' };
      for (const a of doc.attributes || []) {
        if (a instanceof Api.DocumentAttributeVideo) Object.assign(info, { video: true, round: !!a.roundMessage, duration: a.duration || 0, w: a.w, h: a.h });
        else if (a instanceof Api.DocumentAttributeAudio) Object.assign(info, { audio: true, voice: !!a.voice, duration: a.duration || 0, performer: a.performer || '', title: a.title || '', waveform: a.waveform ? decodeWaveform(a.waveform) : null });
        else if (a instanceof Api.DocumentAttributeAnimated) info.gif = true;
        else if (a instanceof Api.DocumentAttributeSticker) info.sticker = true;
        else if (a instanceof Api.DocumentAttributeFilename) info.fileName = a.fileName || '';
      }
      const type = info.sticker ? 'sticker' : info.gif ? 'gif' : info.video ? 'video' : info.audio ? 'audio' : 'document';
      const hasThumb = (doc.thumbs || []).some((t) => t instanceof Api.PhotoSize || t instanceof Api.PhotoSizeProgressive);
      const item = {
        type,
        msg_id: msg.id,
        url: `media/doc/${base}`,
        thumb_url: hasThumb ? `media/thumb/${base}` : null,
        mime: doc.mimeType || '',
        size: Number(doc.size || 0),
        is_voice: info.voice,
        duration: info.duration,
        width: info.w,
        height: info.h,
        filename: info.fileName,
        performer: info.performer,
        title: info.title,
        round: info.round,
        waveform: info.waveform || null,
      };
      return { type: item.type, items: [item], webpage: null };
    }

    if (media instanceof Api.MessageMediaWebPage && media.webpage instanceof Api.WebPage) {
      const wp = media.webpage;
      const url = safeUrl(wp.url) || '';
      return {
        type: 'webpage',
        items: [],
        webpage: {
          url,
          display_url: wp.displayUrl || url,
          site_name: wp.siteName || '',
          title: wp.title || '',
          description: wp.description || '',
          has_photo: !!wp.photo,
          photo_url: wp.photo ? `media/webpage/${base}` : null,
        },
      };
    }

    return { type: null, items: [], webpage: null };
  }

  formatGroup(group, ch, people = null) {
    const primary = group.find((m) => m.message) || group[0];
    const channelId = ch.id;
    const id = `${channelId}_${primary.id}`;
    let mediaType = null;
    let webpage = null;
    const items = [];

    for (const m of group) {
      this.messages.set(`${channelId}_${m.id}`, m);
      const r = this.mediaOf(m, channelId);
      items.push(...r.items);
      if (!mediaType && r.type) mediaType = r.type;
      if (!webpage && r.webpage) webpage = r.webpage;
    }
    if (items.length > 1) mediaType = 'album';

    const text = primary.message || '';
    const tgUrl = ch.username
      ? `https://t.me/${ch.username}/${primary.id}`
      : `https://t.me/c/${channelId}/${primary.id}`;

    return {
      id,
      msg_id: primary.id,
      channel_id: channelId,
      channel: ch,
      date: new Date(primary.date * 1000).toISOString(),
      timestamp: primary.date,
      text,
      text_html: toHtml(text, primary.entities),
      media_type: mediaType,
      media_items: items,
      webpage,
      views: primary.views ?? null,
      forwards: primary.forwards || 0,
      replies_count: (primary.replies && primary.replies.replies) || 0,
      comments_enabled: !!(primary.replies && primary.replies.comments),
      recent_repliers: this.repliersOf(primary, people),
      post_author: primary.postAuthor || '',
      edited: !!(primary.editDate && !primary.editHide),
      reactions: this.reactionsOf(primary),
      tg_url: tgUrl,
      is_pinned: !!primary.pinned,
      is_favorite: this.favorites.has(id),
    };
  }

  async fetchChannelPosts(ch, { limit, offsetDate, search }) {
    const client = await this.getClient();
    const entity = await this.channelEntity(ch.id);
    const common = { peer: entity, offsetId: 0, addOffset: 0, limit, maxId: 0, minId: 0, hash: bigInt.zero };
    const res = await client.invoke(search
      ? new Api.messages.Search({ ...common, q: search, filter: new Api.InputMessagesFilterEmpty(), minDate: 0, maxDate: offsetDate || 0 })
      : new Api.messages.GetHistory({ ...common, offsetDate: offsetDate || 0 }));

    const people = new Map();
    for (const u of res.users || []) people.set(`u${u.id}`, u);
    for (const c of res.chats || []) people.set(`c${c.id}`, c);

    const groups = new Map();
    const out = [];
    for (const m of res.messages || []) {
      if (!(m instanceof Api.Message) || (!m.message && !m.media)) continue;
      if (m.groupedId) {
        const gid = m.groupedId.toString();
        if (!groups.has(gid)) groups.set(gid, []);
        groups.get(gid).push(m);
      } else {
        out.push(this.formatGroup([m], ch, people));
      }
    }
    for (const g of groups.values()) out.push(this.formatGroup(g.sort((x, y) => x.id - y.id), ch, people));
    return out;
  }

  repliersOf(msg, people) {
    const peers = (msg.replies && msg.replies.recentRepliers) || [];
    return peers.slice(0, 3).map((p) => {
      const key = p.userId != null ? `u${p.userId}` : `c${p.channelId || p.chatId}`;
      const e = people && people.get(key);
      return e ? { id: Number(e.id), name: e.title || utils.getDisplayName(e), avatar: this.avatarUrl(e) } : null;
    }).filter(Boolean);
  }

  filterFeed(posts, feedType) {
    if (feedType === 'media') return posts.filter((p) => ['photo', 'video', 'gif', 'album'].includes(p.media_type));
    if (feedType === 'popular') {
      return posts
        .filter((p) => (p.views || 0) > 300 || p.reactions.length > 0)
        .sort((a, b) => ((b.views || 0) + b.reactions.length * 50) - ((a.views || 0) + a.reactions.length * 50));
    }
    return posts.sort((a, b) => b.timestamp - a.timestamp);
  }

  persistPosts() {
    const recent = [...this.posts.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, POSTS_CACHE_LIMIT);
    this.posts = new Map(recent.map((p) => [p.id, p]));
    lsSet(LS.posts, Object.fromEntries(this.posts));
  }

  page(posts, limit, extra = {}) {
    const sliced = posts.slice(0, limit);
    return {
      posts: sliced,
      channels: this.sortChannels([...this.channels.values()]),
      total_count: sliced.length,
      has_more: posts.length > limit,
      next_offset: sliced.length ? sliced[sliced.length - 1].timestamp : null,
      ...extra,
    };
  }

  async getFeed({ feedType = 'all', channelId = null, searchQuery = '', offsetDate = null, limit = 40, refresh = false } = {}) {
    const favs = () => [...this.favorites.values()]
      .map((p) => ({ ...p, is_favorite: true }))
      .filter((p) => !offsetDate || p.timestamp < offsetDate)
      .sort((a, b) => b.timestamp - a.timestamp);
    if (feedType === 'favorites') return this.page(favs(), limit);

    // Instant first paint from the localStorage cache; the UI refreshes afterwards.
    if (!offsetDate && !searchQuery && !channelId && !refresh && this.posts.size) {
      const prefs = getPrefs();
      const excluded = new Set(prefs.excludedChannels.map(Number));
      const allowed = (id) => {
        const ch = this.channels.get(id);
        return !excluded.has(id) && (prefs.showGroups || !ch || ch.is_broadcast);
      };
      const cached = this.filterFeed([...this.posts.values()]
        .filter((p) => allowed(p.channel_id))
        .map((p) => ({ ...p, is_favorite: this.favorites.has(p.id) })), feedType);
      if (cached.length) return this.page(cached, limit, { from_cache: true });
    }

    if (!(await this.isAuthorized())) return { posts: [], channels: [], has_more: false };
    await this.loadDialogs();

    let targets;
    if (channelId) {
      const ch = this.channels.get(Number(channelId));
      targets = ch ? [ch] : [];
    } else {
      const prefs = getPrefs();
      const excluded = new Set(prefs.excludedChannels.map(Number));
      targets = [...this.channels.values()]
        .filter((c) => (c.is_broadcast || prefs.showGroups) && !excluded.has(c.id))
        .slice(0, prefs.feedSize);
    }

    const perChannel = channelId ? limit : 20;
    const posts = [];
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const ch = queue.shift();
        try {
          posts.push(...await this.fetchChannelPosts(ch, { limit: perChannel, offsetDate, search: searchQuery }));
        } catch (e) {
          console.warn('[TeleX] channel fetch failed', ch.title, e);
        }
      }
    };
    await Promise.all(Array.from({ length: FEED_CONCURRENCY }, worker));

    if (!searchQuery) {
      posts.forEach((p) => this.posts.set(p.id, p));
      this.persistPosts();
    }

    let result = this.filterFeed(posts, feedType);
    if (offsetDate) result = result.filter((p) => p.timestamp < offsetDate);
    return this.page(result, limit, { from_cache: false });
  }

  // ----- comments -----

  /** Linked discussion chat + root message for a channel post (cached). */
  async discussionOf(channelId, msgId) {
    const key = `${channelId}_${msgId}`;
    if (this.discussions.has(key)) return this.discussions.get(key);
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    const res = await client.invoke(new Api.messages.GetDiscussionMessage({ peer: entity, msgId }));
    const root = res.messages && res.messages[0];
    if (!root) throw new Error('Комментарии к этому посту отключены');
    const chat = (res.chats || []).find((c) => String(c.id) === String(root.peerId.channelId));
    if (chat) this.rememberEntity(chat);
    const info = { chat: chat || root.peerId, rootId: root.id, chatId: chat ? Number(chat.id) : Number(root.peerId.channelId) };
    this.discussions.set(key, info);
    return info;
  }

  commentMedia(r, path) {
    const media = r.media;
    if (media instanceof Api.MessageMediaPhoto && media.photo) {
      const big = (media.photo.sizes || []).filter((s) => s.w && s.h).pop() || {};
      return { type: 'photo', url: `media/cmedia/${path}`, width: big.w, height: big.h };
    }
    if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
      const doc = media.document;
      const attrs = doc.attributes || [];
      const sticker = attrs.some((x) => x instanceof Api.DocumentAttributeSticker);
      const thumb = this.bestThumb(doc);
      if (sticker) return { type: 'sticker', url: `media/cmedia/${path}`, mime: doc.mimeType };
      if (thumb) return { type: sticker ? 'sticker' : 'photo', url: `media/cthumb/${path}` };
    }
    return null;
  }

  /**
   * Comments under a channel post, oldest first. Pass `offsetId` (smallest id
   * already shown) to page further back. Returns { comments, total, has_more }.
   */
  async getComments(channelId, msgId, { refresh = false, offsetId = 0, limit = 50 } = {}) {
    const key = `${channelId}_${msgId}`;
    if (!refresh && !offsetId && this.comments.has(key)) return this.comments.get(key);
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    const replies = await client.getMessages(entity, { replyTo: msgId, limit, offsetId: offsetId || undefined });
    const myId = this.me ? Number(this.me.id) : null;
    const byId = new Map();
    const list = [];
    for (const r of replies) {
      if (!r || (!r.message && !r.media)) continue;
      const sender = r.sender || (r.getSender ? await r.getSender().catch(() => null) : null);
      const path = `${Number(r.peerId.channelId || 0)}/${r.id}`;
      this.commentMsgs.set(path, r);
      const reply = r.replyTo;
      const replyToId = reply && reply.replyToTopId && reply.replyToMsgId !== reply.replyToTopId ? reply.replyToMsgId : null;
      const item = {
        id: r.id,
        text: r.message || '',
        text_html: toHtml(r.message || '', r.entities),
        date: new Date(r.date * 1000).toISOString(),
        timestamp: r.date,
        sender_id: sender ? Number(sender.id) : null,
        sender_name: sender ? utils.getDisplayName(sender) || 'Пользователь' : 'Пользователь',
        sender_avatar: this.avatarUrl(sender, false, { peer: r.peerId, msgId: r.id }),
        is_out: !!r.out || (myId != null && sender && Number(sender.id) === myId),
        reply_to_id: replyToId,
        media: this.commentMedia(r, path),
        reactions: this.reactionsOf(r),
      };
      byId.set(item.id, item);
      list.push(item);
    }
    list.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    const result = { comments: list, total: replies.total ?? list.length, has_more: replies.length >= limit };
    if (!offsetId) this.comments.set(key, result);
    return result;
  }

  async sendComment(channelId, msgId, text, replyToCommentId = null) {
    const clean = (text || '').trim();
    if (!clean) return { status: 'error', message: 'Текст комментария пуст' };
    const client = await this.getClient();
    const disc = await this.discussionOf(channelId, msgId);
    const sent = await client.invoke(new Api.messages.SendMessage({
      peer: disc.chat,
      message: clean,
      randomId: bigInt(Math.floor(Math.random() * 2 ** 52)),
      replyTo: new Api.InputReplyToMessage({ replyToMsgId: replyToCommentId || disc.rootId, topMsgId: disc.rootId }),
    }));
    const upd = (sent.updates || []).find((u) => u.message && u.message.id);
    const me = this.me ? this.formatUser(this.me) : null;
    const comment = {
      id: upd ? upd.message.id : Date.now(),
      text: clean,
      text_html: escapeHtml(clean),
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      sender_id: me ? me.id : null,
      sender_name: me ? me.name : 'Вы',
      sender_avatar: me ? me.avatar : null,
      is_out: true,
      reply_to_id: replyToCommentId,
      media: null,
      reactions: [],
    };
    const key = `${channelId}_${msgId}`;
    const cached = this.comments.get(key);
    if (cached) {
      cached.comments.push(comment);
      cached.total += 1;
    }
    return { status: 'success', comment };
  }

  // ----- custom emoji (premium reactions & emoji in text) -----

  /** Fetches custom emoji documents; returns { id: { mime, url } }. */
  async getCustomEmoji(ids) {
    this.customEmoji = this.customEmoji || new Map();
    const missing = [...new Set(ids)].filter((id) => !this.customEmoji.has(id));
    const client = await this.getClient();
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const docs = await client.invoke(new Api.messages.GetCustomEmojiDocuments({ documentId: chunk.map((id) => bigInt(id)) }));
      for (const d of docs) if (d instanceof Api.Document) this.customEmoji.set(d.id.toString(), d);
    }
    const out = {};
    for (const id of ids) {
      const d = this.customEmoji.get(id);
      if (d) out[id] = { mime: d.mimeType, url: `media/cemoji/${id}/0` };
    }
    return out;
  }

  // ----- live updates -----

  /**
   * Live wall: Telegram pushes new/edited posts and reaction changes over the
   * open connection; a light poll (dialogs' top message ids) covers channels
   * Telegram doesn't push for. Handlers: onPosts(posts), onEdit(post),
   * onReactions(postId, reactions), onViews(postId, views).
   */
  async startLive(handlers) {
    this.live = handlers;
    if (this.liveBound) return;
    this.liveBound = true;
    const client = await this.getClient();
    this.albumBuffer = new Map();
    client.addEventHandler((u) => {
      try { this.onUpdate(u); } catch (e) { console.warn('[TeleX] update', e); }
    });
    const tick = async () => {
      if (document.visibilityState === 'visible' && this.authorized) await this.pollNew().catch(() => {});
      this.pollTimer = setTimeout(tick, LIVE_POLL_MS);
    };
    this.pollTimer = setTimeout(tick, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.authorized) this.pollNew().catch(() => {});
    });
  }

  emitPosts(posts) {
    const fresh = posts.filter((p) => !this.posts.has(p.id));
    fresh.forEach((p) => this.posts.set(p.id, p));
    if (!fresh.length) return;
    this.persistPosts();
    if (this.live && this.live.onPosts) this.live.onPosts(fresh);
  }

  onUpdate(u) {
    if (u instanceof Api.UpdateNewChannelMessage || u instanceof Api.UpdateEditChannelMessage) {
      const m = u.message;
      if (!(m instanceof Api.Message) || (!m.message && !m.media)) return;
      const chId = Number(m.peerId.channelId);
      const ch = this.channels.get(chId);
      if (!ch || (!ch.is_broadcast && !getPrefs().showGroups)) return;
      this.messages.set(`${chId}_${m.id}`, m);
      if (u instanceof Api.UpdateEditChannelMessage) {
        const id = `${chId}_${m.id}`;
        if (!this.posts.has(id)) return;
        const post = { ...this.formatGroup([m], ch), recent_repliers: this.posts.get(id).recent_repliers || [] };
        this.posts.set(id, post);
        if (this.live && this.live.onEdit) this.live.onEdit(post);
        return;
      }
      ch.top_id = Math.max(ch.top_id || 0, m.id);
      ch.unread_count = Math.max(0, ch.top_id - (this.seen[ch.id] || 0));
      ch.last_text = this.previewOf(m);
      ch.last_date = m.date;
      if (m.groupedId) {
        const gid = m.groupedId.toString();
        const entry = this.albumBuffer.get(gid) || { msgs: [], timer: null };
        entry.msgs.push(m);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          this.albumBuffer.delete(gid);
          this.emitPosts([this.formatGroup(entry.msgs.sort((a, b) => a.id - b.id), ch)]);
        }, 800);
        this.albumBuffer.set(gid, entry);
      } else {
        this.emitPosts([this.formatGroup([m], ch)]);
      }
      return;
    }
    if (u instanceof Api.UpdateMessageReactions && u.peer instanceof Api.PeerChannel) {
      const id = `${Number(u.peer.channelId)}_${u.msgId}`;
      const post = this.posts.get(id);
      const reactions = this.reactionsOf({ reactions: u.reactions });
      if (post) post.reactions = reactions;
      if (this.live && this.live.onReactions) this.live.onReactions(id, reactions);
      return;
    }
    if (u instanceof Api.UpdateChannelMessageViews) {
      const id = `${Number(u.channelId)}_${u.id}`;
      const post = this.posts.get(id);
      if (post) post.views = u.views;
      if (this.live && this.live.onViews) this.live.onViews(id, u.views);
    }
  }

  /** One getDialogs call tells which wall channels have newer posts; fetch just those. */
  async pollNew() {
    if (this.polling) return;
    this.polling = true;
    try {
      const before = new Map([...this.channels.values()].map((c) => [c.id, c.top_id || 0]));
      this.dialogsLoaded = null;
      await this.loadDialogs();
      const prefs = getPrefs();
      const excluded = new Set(prefs.excludedChannels.map(Number));
      const changed = [...this.channels.values()].filter((c) =>
        (c.is_broadcast || prefs.showGroups) && !excluded.has(c.id) && before.has(c.id) && (c.top_id || 0) > before.get(c.id));
      const posts = [];
      for (const ch of changed.slice(0, 15)) {
        try {
          const latest = await this.fetchChannelPosts(ch, { limit: 10 });
          posts.push(...latest.filter((p) => p.msg_id > before.get(ch.id)));
        } catch (e) {
          console.warn('[TeleX] poll', ch.title, e);
        }
      }
      this.emitPosts(posts);
      if (this.onReadChange) this.onReadChange();
    } finally {
      this.polling = false;
    }
  }

  // ----- read state -----

  /**
   * Marks channel posts as read in Telegram (like scrolling a channel in the app)
   * and lowers the local unread counters. Batched per channel.
   */
  markSeen(channelId, msgId) {
    const ch = this.channels.get(Number(channelId));
    if (!ch) return;
    this.readQueue = this.readQueue || new Map();
    const prev = this.readQueue.get(ch.id) || 0;
    if (msgId <= prev || msgId <= (this.seen[ch.id] || 0)) return;
    this.readQueue.set(ch.id, msgId);
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => this.flushReads(), 1500);
  }

  async flushReads() {
    const queue = this.readQueue;
    this.readQueue = new Map();
    if (!queue || !queue.size) return;
    const client = await this.getClient().catch(() => null);
    for (const [id, maxId] of queue) {
      const ch = this.channels.get(id);
      if (!ch) continue;
      ch.read_max = Math.max(ch.read_max || 0, maxId);
      this.seen[id] = Math.max(this.seen[id] || 0, maxId);
      ch.unread_count = Math.max(0, (ch.top_id || 0) - this.seen[id]);
      if (!client || !getPrefs().syncRead) continue;
      try {
        await client.invoke(new Api.channels.ReadHistory({ channel: await this.channelEntity(id), maxId }));
      } catch (e) {
        console.warn('[TeleX] readHistory', e);
      }
    }
    lsSet(LS.channels, Object.fromEntries(this.channels));
    lsSet(LS.seen, this.seen);
    if (this.onReadChange) this.onReadChange();
  }

  // ----- actions -----

  async sendReaction(channelId, msgId, emoji, customId = null) {
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    let reaction = [];
    if (customId) reaction = [new Api.ReactionCustomEmoji({ documentId: bigInt(customId) })];
    else if (emoji) reaction = [new Api.ReactionEmoji({ emoticon: emoji })];
    await client.invoke(new Api.messages.SendReaction({ peer: entity, msgId, reaction }));
    return { status: 'success', emoji };
  }

  async forwardToSaved(channelId, msgId) {
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    await client.forwardMessages('me', { messages: [msgId], fromPeer: entity });
    return { status: 'success' };
  }

  toggleFavorite(postId, post = null) {
    if (post) this.rememberPost(post);
    let isFav;
    if (this.favorites.has(postId)) {
      this.favorites.delete(postId);
      isFav = false;
    } else {
      const post = this.posts.get(postId);
      this.favorites.set(postId, post ? { ...post, is_favorite: true } : { id: postId, timestamp: 0 });
      isFav = true;
    }
    lsSet(LS.favorites, Object.fromEntries(this.favorites));
    const cached = this.posts.get(postId);
    if (cached) cached.is_favorite = isFav;
    return isFav;
  }

  rememberPost(post) {
    if (post && post.id && !this.posts.has(post.id)) this.posts.set(post.id, post);
  }

  // ----- media (served to <img>/<video> through the service worker) -----

  async getMessage(channelId, msgId) {
    const key = `${channelId}_${msgId}`;
    if (this.messages.has(key)) return this.messages.get(key);
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    const [msg] = await client.getMessages(entity, { ids: [msgId] });
    if (msg) this.messages.set(key, msg);
    return msg;
  }

  bestThumb(doc) {
    const thumbs = (doc.thumbs || []).filter((t) => t instanceof Api.PhotoSize || t instanceof Api.PhotoSizeProgressive);
    return thumbs[thumbs.length - 1];
  }

  /** One aligned chunk of a document, memoized in an LRU (shared by replays/seeks). */
  streamChunk(doc, offset, size) {
    this.chunks = this.chunks || new Map();
    const key = `${doc.id}:${offset}`;
    if (this.chunks.has(key)) {
      const hit = this.chunks.get(key);
      this.chunks.delete(key);
      this.chunks.set(key, hit); // refresh LRU position
      return hit.promise;
    }
    const entry = { promise: null, bytes: 0 };
    entry.promise = (async () => {
      const client = await this.getClient();
      let chunk = null;
      for await (const part of client.iterDownload({
        file: new Api.MessageMediaDocument({ document: doc }),
        fileSize: bigInt(size),
        offset: bigInt(offset),
        requestSize: STREAM_CHUNK,
        limit: 1,
      })) {
        chunk = part;
        break;
      }
      const bytes = chunk || new Uint8Array(0);
      entry.bytes = bytes.length;
      this.chunkBytes = (this.chunkBytes || 0) + bytes.length;
      while (this.chunkBytes > CHUNK_CACHE_BYTES && this.chunks.size > 1) {
        const [oldKey, old] = this.chunks.entries().next().value;
        this.chunks.delete(oldKey);
        this.chunkBytes -= old.bytes;
      }
      return bytes;
    })();
    entry.promise.catch(() => this.chunks.delete(key));
    this.chunks.set(key, entry);
    return entry.promise;
  }

  /**
   * Resolve a media path ("photo/123/45", "avatar/c123/…", "doc/123/45") into bytes.
   * With `range` set, only one aligned chunk of a document is fetched (video/audio streaming).
   */
  async fetchMedia(path, range) {
    const [kind, a, b] = path.split('/');
    const client = await this.getClient();

    if (kind === 'avatar' || kind === 'avatarbig') {
      if (!this.entities.has(a)) await this.loadDialogs();
      const entity = this.entities.get(a);
      if (!entity || !entity.photo) return null;
      const big = kind === 'avatarbig';
      const ctx = this.peerContext && this.peerContext.get(a);
      let bytes = null;
      if (!entity.min) {
        bytes = await client.downloadProfilePhoto(entity, { isBig: big }).catch(() => null);
      }
      if ((!bytes || !bytes.length) && ctx) {
        const via = await client.getInputEntity(ctx.peer);
        const peer = entity instanceof Api.User
          ? new Api.InputPeerUserFromMessage({ peer: via, msgId: ctx.msgId, userId: entity.id })
          : new Api.InputPeerChannelFromMessage({ peer: via, msgId: ctx.msgId, channelId: entity.id });
        bytes = await client.downloadFile(new Api.InputPeerPhotoFileLocation({ peer, photoId: entity.photo.photoId, big }), { dcId: entity.photo.dcId });
      }
      return bytes && bytes.length ? { bytes, mime: 'image/jpeg' } : null;
    }

    if (kind === 'cemoji') {
      const doc = this.customEmoji && this.customEmoji.get(a);
      if (!doc) return null;
      const bytes = await client.downloadMedia(new Api.MessageMediaDocument({ document: doc }), {});
      return bytes && bytes.length ? { bytes, mime: doc.mimeType } : null;
    }

    if (kind === 'cmedia' || kind === 'cthumb') {
      const msg = this.commentMsgs.get(`${a}/${b}`);
      if (!msg || !msg.media) return null;
      const doc = msg.media.document;
      const opts = kind === 'cthumb' && doc ? { thumb: this.bestThumb(doc) } : {};
      const bytes = await client.downloadMedia(msg, opts);
      const mime = kind === 'cmedia' && doc ? doc.mimeType : 'image/jpeg';
      return bytes && bytes.length ? { bytes, mime } : null;
    }

    const msg = await this.getMessage(Number(a), Number(b));
    if (!msg || !msg.media) return null;

    if (kind === 'photo' || kind === 'webpage') {
      const bytes = await client.downloadMedia(msg, {});
      return bytes && bytes.length ? { bytes, mime: 'image/jpeg' } : null;
    }

    const doc = msg.media.document;
    if (!doc) return null;

    if (kind === 'thumb') {
      const thumb = this.bestThumb(doc);
      if (!thumb) return null;
      const bytes = await client.downloadMedia(msg, { thumb });
      return bytes && bytes.length ? { bytes, mime: 'image/jpeg' } : null;
    }

    if (kind === 'doc') {
      const size = Number(doc.size);
      const mime = doc.mimeType || 'application/octet-stream';
      if (range && size <= SMALL_FILE) {
        // Small files (GIFs, short clips, stickers): one full download, cached by the SW.
        const bytes = await client.downloadMedia(msg, {});
        return bytes ? { bytes, mime, size: bytes.length, offset: 0, full: true } : null;
      }
      if (range) {
        const offset = Math.floor(range.start / STREAM_CHUNK) * STREAM_CHUNK;
        if (offset >= size) return { bytes: new Uint8Array(0), mime, size, offset };
        const bytes = await this.streamChunk(doc, offset, size);
        // Read ahead so playback doesn't stall between chunks.
        for (let i = 1; i <= STREAM_READ_AHEAD; i++) {
          const next = offset + i * STREAM_CHUNK;
          if (next < size) this.streamChunk(doc, next, size).catch(() => {});
        }
        return { bytes, mime, size, offset };
      }
      const bytes = await client.downloadMedia(msg, {});
      return bytes ? { bytes, mime, size } : null;
    }
    return null;
  }
}

export const telegram = new TelegramService();
