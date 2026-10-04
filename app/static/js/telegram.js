/**
 * ====================================================================
 * TELEGRAM SERVICE (GramJS MTProto client running in the browser)
 * ====================================================================
 * Replaces the former Python backend: auth, channels, wall feed,
 * comments, reactions and media all go straight from the browser to
 * Telegram over WebSocket. The session string lives in localStorage.
 */

import { TelegramClient, Api, utils, StringSession, computeCheck, bigInt } from './vendor/gramjs.js';

// Telegram application credentials (https://my.telegram.org). Public by design:
// every web client ships them; the user's own session is what grants access.
const API_ID = 27451332;
const API_HASH = '1462d961e4a7bf6b5139309255f09fd6';

const LS = {
  session: 'telex.session',
  channels: 'telex.channels',
  posts: 'telex.posts',
  favorites: 'telex.favorites',
};

const FEED_CHANNELS = 20;
const FEED_CONCURRENCY = 5;
const POSTS_CACHE_LIMIT = 200;
const STREAM_CHUNK = 512 * 1024;

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

// ---------------- HTML formatting ----------------

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    this.comments = new Map();
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
        const session = new StringSession(lsGet(LS.session, ''));
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

  hasSession() {
    return !!lsGet(LS.session, '');
  }

  saveSession() {
    lsSet(LS.session, this.client.session.save());
  }

  async isAuthorized() {
    if (this.authorized) return true;
    if (!this.hasSession()) return false;
    try {
      const client = await this.getClient();
      this.authorized = await client.checkAuthorization();
      return this.authorized;
    } catch (e) {
      console.error('[TeleX] auth check failed', e);
      return false;
    }
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

  avatarUrl(entity) {
    if (!entity) return null;
    const photo = entity.photo;
    if (!photo || photo instanceof Api.ChatPhotoEmpty || photo instanceof Api.UserProfilePhotoEmpty) return null;
    const key = this.rememberEntity(entity);
    return `media/avatar/${key}/${photo.photoId}`;
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
    };
  }

  async getMe() {
    const client = await this.getClient();
    const me = await client.getMe();
    this.me = me;
    return me ? this.formatUser(me) : null;
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
    this.favorites.clear();
    this.dialogsLoaded = null;
    Object.values(LS).forEach(lsDel);
    try { await caches.delete('telex-media-v1'); } catch {}
    return { status: 'logged_out' };
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
      });
    }
    this.channels = fresh;
    lsSet(LS.channels, Object.fromEntries(fresh));
    return this.sortChannels([...fresh.values()]);
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
    return results.map((r) => ({
      emoji: r.reaction instanceof Api.ReactionEmoji ? r.reaction.emoticon : '⭐',
      count: r.count,
      chosen: r.chosenOrder != null,
    }));
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
        else if (a instanceof Api.DocumentAttributeAudio) Object.assign(info, { audio: true, voice: !!a.voice, duration: a.duration || 0, performer: a.performer || '', title: a.title || '' });
        else if (a instanceof Api.DocumentAttributeAnimated) info.gif = true;
        else if (a instanceof Api.DocumentAttributeSticker) info.sticker = true;
        else if (a instanceof Api.DocumentAttributeFilename) info.fileName = a.fileName || '';
      }
      const type = info.gif ? 'gif' : info.video ? 'video' : info.audio ? 'audio' : info.sticker ? 'photo' : 'document';
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
      };
      if (info.sticker && doc.mimeType !== 'image/webp') {
        // animated (tgs/webm) stickers: show the static thumbnail
        item.type = 'photo';
        item.url = item.thumb_url || '';
        if (!item.url) return { type: null, items: [], webpage: null };
      }
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

  formatGroup(group, ch) {
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
      reactions: this.reactionsOf(primary),
      tg_url: tgUrl,
      is_pinned: !!primary.pinned,
      is_favorite: this.favorites.has(id),
    };
  }

  async fetchChannelPosts(ch, { limit, offsetDate, search }) {
    const client = await this.getClient();
    const entity = await this.channelEntity(ch.id);
    const msgs = await client.getMessages(entity, {
      limit,
      offsetDate: offsetDate || undefined,
      search: search || undefined,
    });

    const groups = new Map();
    const out = [];
    for (const m of msgs) {
      if (!m || (!m.message && !m.media)) continue;
      if (m.groupedId) {
        const gid = m.groupedId.toString();
        if (!groups.has(gid)) groups.set(gid, []);
        groups.get(gid).push(m);
      } else {
        out.push(this.formatGroup([m], ch));
      }
    }
    for (const g of groups.values()) out.push(this.formatGroup(g.sort((a, b) => a.id - b.id), ch));
    return out;
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
      const cached = this.filterFeed([...this.posts.values()].map((p) => ({ ...p, is_favorite: this.favorites.has(p.id) })), feedType);
      if (cached.length) return this.page(cached, limit, { from_cache: true });
    }

    if (!(await this.isAuthorized())) return { posts: [], channels: [], has_more: false };
    await this.loadDialogs();

    let targets;
    if (channelId) {
      const ch = this.channels.get(Number(channelId));
      targets = ch ? [ch] : [];
    } else {
      targets = [...this.channels.values()].filter((c) => c.is_broadcast).slice(0, FEED_CHANNELS);
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

  async getComments(channelId, msgId, refresh = false) {
    const key = `${channelId}_${msgId}`;
    if (!refresh && this.comments.has(key)) return this.comments.get(key);
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    const replies = await client.getMessages(entity, { replyTo: msgId, limit: 35 });
    const list = [];
    for (const r of replies) {
      if (!r || !r.message) continue;
      const sender = r.sender || (r.getSender ? await r.getSender().catch(() => null) : null);
      list.push({
        id: r.id,
        text: r.message,
        text_html: toHtml(r.message, r.entities),
        date: new Date(r.date * 1000).toISOString(),
        timestamp: r.date,
        sender_name: sender ? utils.getDisplayName(sender) || 'Пользователь' : 'Пользователь',
        sender_avatar: this.avatarUrl(sender),
        reactions: this.reactionsOf(r),
      });
    }
    list.sort((a, b) => a.timestamp - b.timestamp);
    this.comments.set(key, list);
    return list;
  }

  async sendComment(channelId, msgId, text) {
    const clean = (text || '').trim();
    if (!clean) return { status: 'error', message: 'Текст комментария пуст' };
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    let sent;
    try {
      sent = await client.sendMessage(entity, { message: clean, commentTo: msgId });
    } catch {
      sent = await client.sendMessage(entity, { message: clean, replyTo: msgId });
    }
    const me = this.me ? this.formatUser(this.me) : null;
    const comment = {
      id: sent ? sent.id : Date.now(),
      text: clean,
      text_html: escapeHtml(clean),
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      sender_name: me ? me.name : 'Вы',
      sender_avatar: me ? me.avatar : null,
      reactions: [],
    };
    const key = `${channelId}_${msgId}`;
    if (this.comments.has(key)) this.comments.get(key).push(comment);
    return { status: 'success', comment };
  }

  // ----- actions -----

  async sendReaction(channelId, msgId, emoji) {
    const client = await this.getClient();
    const entity = await this.channelEntity(channelId);
    await client.invoke(new Api.messages.SendReaction({
      peer: entity,
      msgId,
      reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [],
    }));
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

  /**
   * Resolve a media path ("photo/123/45", "avatar/c123/…", "doc/123/45") into bytes.
   * With `range` set, only one aligned chunk of a document is fetched (video/audio streaming).
   */
  async fetchMedia(path, range) {
    const [kind, a, b] = path.split('/');
    const client = await this.getClient();

    if (kind === 'avatar') {
      if (!this.entities.has(a)) await this.loadDialogs();
      const entity = this.entities.get(a);
      if (!entity) return null;
      const bytes = await client.downloadProfilePhoto(entity, { isBig: false });
      return bytes && bytes.length ? { bytes, mime: 'image/jpeg' } : null;
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
      if (range) {
        const offset = Math.floor(range.start / STREAM_CHUNK) * STREAM_CHUNK;
        if (offset >= size) return { bytes: new Uint8Array(0), mime, size, offset };
        let chunk = null;
        for await (const part of client.iterDownload({
          file: doc,
          fileSize: bigInt(size),
          offset: bigInt(offset),
          requestSize: STREAM_CHUNK,
          limit: 1,
        })) {
          chunk = part;
          break;
        }
        return { bytes: chunk || new Uint8Array(0), mime, size, offset };
      }
      const bytes = await client.downloadMedia(msg, {});
      return bytes ? { bytes, mime, size } : null;
    }
    return null;
  }
}

export const telegram = new TelegramService();
