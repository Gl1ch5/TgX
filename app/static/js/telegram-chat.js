/**
 * ====================================================================
 * CHAT CLIENT API — dialogs, history, sending, live updates for the
 * "Telegram You" client (app/static/chat/). Installed on TelegramService
 * (telegram.js), so it works both on the page and inside the worker.
 *
 * Peer keys: "u123" (user/bot), "g123" (basic group), "c123" (channel/supergroup).
 * Message objects are plain data (see formatChatMessage); media URLs are
 * "media/<kind>/<key>/<msgId>" — the service worker + _fetchMedia serve them.
 * ====================================================================
 */
import { Api } from './vendor/gramjs.js';
import { t } from './i18n.js';

const MSG_CACHE_LIMIT = 4000;

function actionText(a, who) {
  const name = who || t('Пользователь');
  if (a instanceof Api.MessageActionChatCreate) return t('{a} создал(а) группу «{b}»', { a: name, b: a.title });
  if (a instanceof Api.MessageActionChannelCreate) return t('Канал «{a}» создан', { a: a.title });
  if (a instanceof Api.MessageActionChatEditTitle) return t('{a} изменил(а) название на «{b}»', { a: name, b: a.title });
  if (a instanceof Api.MessageActionChatEditPhoto) return t('{a} обновил(а) фото группы', { a: name });
  if (a instanceof Api.MessageActionChatDeletePhoto) return t('{a} удалил(а) фото группы', { a: name });
  if (a instanceof Api.MessageActionChatAddUser) return t('{a} добавил(а) участников', { a: name });
  if (a instanceof Api.MessageActionChatDeleteUser) return t('{a} покинул(а) группу', { a: name });
  if (a instanceof Api.MessageActionChatJoinedByLink || a instanceof Api.MessageActionChatJoinedByRequest) return t('{a} вступил(а) в группу', { a: name });
  if (a instanceof Api.MessageActionPinMessage) return t('{a} закрепил(а) сообщение', { a: name });
  if (a instanceof Api.MessageActionHistoryClear) return t('История очищена');
  if (a instanceof Api.MessageActionPhoneCall) return a.video ? t('Видеозвонок') : t('Звонок');
  if (a instanceof Api.MessageActionContactSignUp) return t('{a} теперь в Telegram', { a: name });
  return t('Служебное сообщение');
}

export function installChat(TelegramService, helpers) {
  const { toHtml } = helpers;
  const P = TelegramService.prototype;

  /** A cached chat message, or one fetched by id (media URLs outlive the worker's memory). */
  P.chatMessage = async function chatMessage(key, id) {
    const hit = this.chatMsgs && this.chatMsgs.get(`${key}_${id}`);
    if (hit) return hit;
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    const [m] = await client.getMessages(entity, { ids: [id] });
    if (m && m.id) this.formatChatMessage(m, key);
    return m || null;
  };

  P.chatKeyOf = function chatKeyOf(entity) {
    return this.rememberEntity(entity);
  };

  /** Entity of a peer key; loads the first dialogs page if it's unknown yet. */
  P.chatEntity = async function chatEntity(key) {
    let e = this.entities.get(key);
    if (!e) {
      try { await this.chatDialogs({ limit: 100 }); } catch {}
      e = this.entities.get(key);
    }
    if (!e) throw new Error(t('Чат не найден'));
    return e;
  };

  P.chatStatusOf = function chatStatusOf(entity) {
    if (entity instanceof Api.User) {
      if (entity.bot) return { kind: 'bot' };
      const s = entity.status;
      if (s instanceof Api.UserStatusOnline) return { kind: 'online' };
      if (s instanceof Api.UserStatusOffline) return { kind: 'offline', at: s.wasOnline };
      if (s instanceof Api.UserStatusRecently) return { kind: 'recently' };
      if (s instanceof Api.UserStatusLastWeek) return { kind: 'week' };
      if (s instanceof Api.UserStatusLastMonth) return { kind: 'month' };
      return { kind: 'long' };
    }
    return { kind: 'members', count: Number(entity.participantsCount || 0) || null };
  };

  P.formatDialog = function formatDialog(d) {
    const e = d.entity;
    const key = this.rememberEntity(e);
    const isUser = e instanceof Api.User;
    const raw = d.dialog || {};
    const m = d.message;
    const name = isUser
      ? [e.firstName, e.lastName].filter(Boolean).join(' ') || e.username || t('Удалённый аккаунт')
      : e.title || t('Без названия');
    const out = !!(m && m.out);
    let senderName = '';
    if (m && !isUser && !(e instanceof Api.Channel && e.broadcast) && m.sender) {
      senderName = out ? t('Вы') : (m.sender.firstName || m.sender.title || '');
    } else if (out) senderName = t('Вы');
    return {
      id: key,
      kind: isUser ? 'user' : (e instanceof Api.Channel && e.broadcast ? 'channel' : 'group'),
      title: name,
      username: e.username || '',
      avatar: this.avatarUrl(e),
      verified: !!e.verified,
      bot: !!(isUser && e.bot),
      self: !!(isUser && e.self),
      muted: this.isMuted(d),
      pinned: !!d.pinned,
      archived: !!d.archived,
      unread: d.unreadCount || 0,
      unreadMentions: d.unreadMentionsCount || 0,
      markedUnread: !!raw.unreadMark,
      readInboxMaxId: raw.readInboxMaxId || 0,
      readOutboxMaxId: raw.readOutboxMaxId || 0,
      topId: raw.topMessage || (m ? m.id : 0),
      date: m ? m.date : 0,
      status: this.chatStatusOf(e),
      last: m ? { id: m.id, text: this.previewOf(m) || (m instanceof Api.MessageService ? actionText(m.action, senderName) : ''), out, senderName } : null,
    };
  };

  /**
   * One page of dialogs (newest first).
   * cursor = { date, id, key } from the previous page, or null for the first one.
   */
  P.chatDialogs = async function chatDialogs({ limit = 40, cursor = null, archived = false } = {}) {
    const client = await this.getClient();
    const opts = { limit };
    if (archived) opts.folder = 1;
    if (cursor) {
      opts.offsetDate = cursor.date;
      opts.offsetId = cursor.id;
      const peer = this.entities.get(cursor.key);
      if (peer) opts.offsetPeer = peer;
    }
    const list = await client.getDialogs(opts);
    const dialogs = [];
    for (const d of list) {
      if (!d.entity) continue;
      dialogs.push(this.formatDialog(d));
    }
    const last = list[list.length - 1];
    const next = last && last.message
      ? { date: last.message.date, id: last.message.id, key: this.entityKey(last.entity) }
      : null;
    return { dialogs, hasMore: list.length >= limit && !!next, cursor: next };
  };

  P.chatMsgText = function chatMsgText(m) {
    return (m.message || '').replace(/\u0000/g, '');
  };

  /** Api.Message → plain message object. `people` collects avatars of senders. */
  P.formatChatMessage = function formatChatMessage(m, key, ctx = {}) {
    if (!this.chatMsgs) this.chatMsgs = new Map();
    this.chatMsgs.set(`${key}_${m.id}`, m);
    if (this.chatMsgs.size > MSG_CACHE_LIMIT) {
      for (const k of this.chatMsgs.keys()) { this.chatMsgs.delete(k); if (this.chatMsgs.size <= MSG_CACHE_LIMIT * 0.8) break; }
    }
    const sender = m.sender || (m.senderId != null ? this.entities.get(`u${m.senderId}`) || this.entities.get(`c${m.senderId}`) : null);
    if (sender) this.rememberEntity(sender);
    const senderName = sender
      ? (sender instanceof Api.User ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || '' : sender.title || '')
      : '';
    const base = {
      id: m.id,
      chatId: key,
      date: m.date,
      out: !!m.out,
      senderKey: sender ? this.entityKey(sender) : null,
      senderName,
      senderAvatar: sender ? this.avatarUrl(sender) : null,
      groupedId: m.groupedId ? m.groupedId.toString() : null,
    };
    if (m instanceof Api.MessageService) {
      return { ...base, service: { text: actionText(m.action, senderName), pin: m.action instanceof Api.MessageActionPinMessage }, replyToId: m.replyTo && m.replyTo.replyToMsgId ? m.replyTo.replyToMsgId : 0, replyTo: null, text: '', html: '', media: [], reactions: [] };
    }
    const media = this.mediaOf(m, key);
    const text = this.chatMsgText(m);
    let fwd = null;
    if (m.fwdFrom) {
      const f = m.fwdFrom;
      let name = f.fromName || '';
      const from = f.fromId;
      if (!name && from) {
        const k = this.peerKeyOf(from);
        const en = k && this.entities.get(k);
        if (en) name = en instanceof Api.User ? [en.firstName, en.lastName].filter(Boolean).join(' ') : en.title;
      }
      fwd = { name: name || t('Скрытый отправитель'), date: f.date };
    }
    return {
      ...base,
      service: null,
      text,
      html: toHtml(text, m.entities),
      media: media.items,
      mediaType: media.type,
      webpage: media.webpage,
      replyToId: m.replyTo && m.replyTo.replyToMsgId ? m.replyTo.replyToMsgId : 0,
      replyTo: null,
      fwd,
      edited: !!m.editDate,
      pinned: !!m.pinned,
      views: m.views || 0,
      reactions: this.reactionsOf(m),
      buttons: this.buttonsOf(m),
      status: 'sent',
    };
  };

  /** Fills `replyTo` ({id,name,text}) for messages that answer something. */
  P.chatFillReplies = async function chatFillReplies(entity, key, list) {
    const need = [...new Set(list.filter((x) => x.replyToId).map((x) => x.replyToId))];
    if (!need.length) return;
    const known = new Map(list.map((x) => [x.id, x]));
    const missing = need.filter((id) => !known.has(id));
    const fetched = new Map();
    if (missing.length) {
      try {
        const client = await this.getClient();
        const msgs = await client.getMessages(entity, { ids: missing });
        for (const m of msgs) if (m && m.id) fetched.set(m.id, m);
      } catch {}
    }
    for (const x of list) {
      if (!x.replyToId) continue;
      const src = known.get(x.replyToId);
      if (src) {
        x.replyTo = { id: src.id, name: src.out ? t('Вы') : src.senderName, text: src.text || this.mediaLabel(src) };
        continue;
      }
      const m = fetched.get(x.replyToId);
      if (m) {
        const sender = m.sender;
        const name = m.out ? t('Вы') : sender ? (sender.firstName || sender.title || '') : '';
        x.replyTo = { id: m.id, name, text: this.previewOf(m) };
      } else {
        x.replyTo = { id: x.replyToId, name: '', text: t('Сообщение недоступно') };
      }
    }
  };

  P.mediaLabel = function mediaLabel(x) {
    if (!x.media || !x.media.length) return '';
    const m = x.media[0];
    return { photo: t('Фото'), video: t('Видео'), gif: 'GIF', sticker: t('Стикер'), audio: m.is_voice ? t('Голосовое сообщение') : t('Аудио'), document: t('Файл') }[m.type] || t('Файл');
  };

  /**
   * History page, OLDEST FIRST. `offsetId` = load messages older than this id (0 = newest).
   * Returns { messages, hasMore }.
   */
  P.chatHistory = async function chatHistory(key, { offsetId = 0, limit = 40 } = {}) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    const raw = await client.getMessages(entity, { limit, offsetId });
    const list = raw.filter((m) => m && m.id).map((m) => this.formatChatMessage(m, key)).reverse();
    await this.chatFillReplies(entity, key, list);
    return { messages: list, hasMore: raw.length >= limit };
  };

  P.chatSend = async function chatSend(key, text, { replyTo = 0 } = {}) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    const sent = await client.sendMessage(entity, { message: text, replyTo: replyTo || undefined });
    const msg = this.formatChatMessage(sent, key);
    await this.chatFillReplies(entity, key, [msg]);
    return msg;
  };

  P.chatSendFile = async function chatSendFile(key, file, { caption = '', replyTo = 0, asDocument = false } = {}) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    const sent = await client.sendFile(entity, { file, caption, replyTo: replyTo || undefined, forceDocument: asDocument });
    const msg = this.formatChatMessage(sent, key);
    await this.chatFillReplies(entity, key, [msg]);
    return msg;
  };

  P.chatEdit = async function chatEdit(key, id, text) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    const m = await client.editMessage(entity, { message: id, text });
    return this.formatChatMessage(m, key);
  };

  P.chatDelete = async function chatDelete(key, ids, revoke = true) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    await client.deleteMessages(entity, ids, { revoke });
    return true;
  };

  P.chatMarkRead = async function chatMarkRead(key, maxId = 0) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    await client.markAsRead(entity, maxId || undefined, { clearMentions: true });
    return true;
  };

  P.chatTyping = async function chatTyping(key) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    await client.invoke(new Api.messages.SetTyping({ peer: await client.getInputEntity(entity), action: new Api.SendMessageTypingAction() }));
    return true;
  };

  /** Global search of people/chats by name or @username. */
  P.chatSearch = async function chatSearch(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const client = await this.getClient();
    const res = await client.invoke(new Api.contacts.Search({ q, limit: 15 }));
    const out = [];
    for (const e of [...res.users, ...res.chats]) {
      if (!e || e.id == null) continue;
      const key = this.rememberEntity(e);
      const isUser = e instanceof Api.User;
      out.push({
        id: key,
        kind: isUser ? 'user' : (e instanceof Api.Channel && e.broadcast ? 'channel' : 'group'),
        title: isUser ? [e.firstName, e.lastName].filter(Boolean).join(' ') || e.username || '' : e.title || '',
        username: e.username || '',
        avatar: this.avatarUrl(e),
        verified: !!e.verified,
      });
    }
    return out;
  };

  /** Saved contacts, alphabetical. */
  P.chatContacts = async function chatContacts() {
    const client = await this.getClient();
    const res = await client.invoke(new Api.contacts.GetContacts({ hash: 0n }));
    const users = (res.users || []).filter((u) => u instanceof Api.User && !u.deleted);
    return users
      .map((e) => ({
        id: this.rememberEntity(e),
        kind: 'user',
        title: this.chatTitle(e),
        username: e.username || '',
        avatar: this.avatarUrl(e),
        status: this.chatStatusOf(e),
        verified: !!e.verified,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  };

  /** Chat folders ("Все", "Личные", user folders) with the rule flags needed to filter locally. */
  P.chatFolders = async function chatFolders() {
    const client = await this.getClient();
    const res = await client.invoke(new Api.messages.GetDialogFilters());
    const list = res.filters || res;
    return list
      .filter((f) => f instanceof Api.DialogFilter)
      .map((f) => ({
        id: f.id,
        title: typeof f.title === 'string' ? f.title : (f.title && f.title.text) || '',
        contacts: !!f.contacts, nonContacts: !!f.nonContacts, groups: !!f.groups, broadcasts: !!f.broadcasts, bots: !!f.bots,
        excludeMuted: !!f.excludeMuted, excludeRead: !!f.excludeRead, excludeArchived: !!f.excludeArchived,
        include: (f.includePeers || []).map((p) => this.inputPeerKey(p)).filter(Boolean),
        exclude: (f.excludePeers || []).map((p) => this.inputPeerKey(p)).filter(Boolean),
      }));
  };

  P.inputPeerKey = function inputPeerKey(p) {
    if (p instanceof Api.InputPeerUser) return `u${p.userId}`;
    if (p instanceof Api.InputPeerChat) return `g${p.chatId}`;
    if (p instanceof Api.InputPeerChannel) return `c${p.channelId}`;
    if (p instanceof Api.InputPeerSelf && this.me) return `u${this.me.id}`;
    return null;
  };

  // ----- actions: reactions, pins, forwarding, notifications, profile, shared media -----

  P.chatInput = async function chatInput(key) {
    const entity = await this.chatEntity(key);
    const client = await this.getClient();
    return { entity, client, peer: await client.getInputEntity(entity) };
  };

  P.chatReact = async function chatReact(key, id, emoji) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(new Api.messages.SendReaction({ peer, msgId: id, reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [] }));
    return true;
  };

  P.chatPin = async function chatPin(key, id, unpin = false) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(new Api.messages.UpdatePinnedMessage({ peer, id, unpin, silent: true }));
    return true;
  };

  /** Pinned messages of a chat, newest first: [{id, text}]. */
  P.chatPinned = async function chatPinned(key) {
    const { client, entity } = await this.chatInput(key);
    const list = await client.getMessages(entity, { filter: new Api.InputMessagesFilterPinned(), limit: 50 });
    return list.filter((m) => m && m.id).map((m) => ({ id: m.id, text: this.previewOf(m) }));
  };

  P.chatForward = async function chatForward(fromKey, ids, toKey) {
    const from = await this.chatEntity(fromKey);
    const to = await this.chatEntity(toKey);
    const client = await this.getClient();
    await client.forwardMessages(to, { messages: ids, fromPeer: from });
    return true;
  };

  P.chatMute = async function chatMute(key, mute) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(new Api.account.UpdateNotifySettings({
      peer: new Api.InputNotifyPeer({ peer }),
      settings: new Api.InputPeerNotifySettings({ muteUntil: mute ? 2147483647 : 0 }),
    }));
    return true;
  };

  P.chatClearHistory = async function chatClearHistory(key) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(new Api.messages.DeleteHistory({ peer, maxId: 0, justClear: true, revoke: false }));
    return true;
  };

  P.chatLeave = async function chatLeave(key) {
    const { client, entity, peer } = await this.chatInput(key);
    if (entity instanceof Api.Channel) await client.invoke(new Api.channels.LeaveChannel({ channel: peer }));
    else await client.invoke(new Api.messages.DeleteHistory({ peer, maxId: 0, revoke: false }));
    return true;
  };

  P.chatBlock = async function chatBlock(key, block = true) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(block ? new Api.contacts.Block({ id: peer }) : new Api.contacts.Unblock({ id: peer }));
    return true;
  };

  P.chatDeleteContact = async function chatDeleteContact(key) {
    const { client, peer } = await this.chatInput(key);
    await client.invoke(new Api.contacts.DeleteContacts({ id: [peer] }));
    return true;
  };

  /** Search inside one chat → messages (newest first). */
  P.chatSearchIn = async function chatSearchIn(key, q) {
    const { client, entity } = await this.chatInput(key);
    const list = await client.getMessages(entity, { search: q, limit: 40 });
    return list.filter((m) => m && m.id).map((m) => this.formatChatMessage(m, key));
  };

  /** Profile data: about, phone, username, mute state, counts of the shared media tabs. */
  P.chatProfile = async function chatProfile(key) {
    const { client, entity, peer } = await this.chatInput(key);
    const out = { id: key, title: this.chatTitle(entity), username: entity.username || '', phone: entity.phone || '', about: '', avatar: this.avatarUrl(entity, true) || this.avatarUrl(entity), status: this.chatStatusOf(entity), kind: entity instanceof Api.User ? 'user' : (entity instanceof Api.Channel && entity.broadcast ? 'channel' : 'group'), muted: false, contact: !!entity.contact, blocked: false };
    try {
      if (entity instanceof Api.User) {
        const f = await client.invoke(new Api.users.GetFullUser({ id: peer }));
        out.about = f.fullUser.about || '';
        out.blocked = !!f.fullUser.blocked;
        out.muted = this.isMutedSettings(f.fullUser.notifySettings);
      } else if (entity instanceof Api.Channel) {
        const f = await client.invoke(new Api.channels.GetFullChannel({ channel: peer }));
        out.about = f.fullChat.about || '';
        out.count = f.fullChat.participantsCount || 0;
        out.muted = this.isMutedSettings(f.fullChat.notifySettings);
      } else {
        const f = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
        out.about = f.fullChat.about || '';
        out.muted = this.isMutedSettings(f.fullChat.notifySettings);
      }
    } catch (e) { console.warn('[chat] profile', e); }
    return out;
  };

  P.isMutedSettings = function isMutedSettings(s) {
    return !!(s && s.muteUntil && s.muteUntil > Date.now() / 1000);
  };

  const FILTERS = {
    media: () => new Api.InputMessagesFilterPhotoVideo(),
    files: () => new Api.InputMessagesFilterDocument(),
    links: () => new Api.InputMessagesFilterUrl(),
    music: () => new Api.InputMessagesFilterMusic(),
    voice: () => new Api.InputMessagesFilterRoundVoice(),
    gif: () => new Api.InputMessagesFilterGif(),
  };

  /** Shared media of a chat: tab = media|files|links|music|voice|gif. */
  P.chatShared = async function chatShared(key, tab, { offsetId = 0, limit = 30 } = {}) {
    const { client, entity } = await this.chatInput(key);
    const make = FILTERS[tab] || FILTERS.media;
    const list = await client.getMessages(entity, { filter: make(), limit, offsetId });
    return { messages: list.filter((m) => m && m.id).map((m) => this.formatChatMessage(m, key)), hasMore: list.length >= limit };
  };

  // ----- chat wallpaper and theme (what the official apps show behind the messages) -----

  /** Plain description of an Api.WallPaper / WallPaperNoFile. */
  P.formatWallpaper = function formatWallpaper(wp) {
    if (!wp) return null;
    const st = wp.settings || {};
    const hex = (n) => (n == null ? null : '#' + (n >>> 0 & 0xffffff).toString(16).padStart(6, '0'));
    const colors = [st.backgroundColor, st.secondBackgroundColor, st.thirdBackgroundColor, st.fourthBackgroundColor].map(hex).filter(Boolean);
    const out = { colors, intensity: st.intensity == null ? null : st.intensity, rotation: st.rotation || 0, blur: !!st.blur, motion: !!st.motion, dark: !!wp.dark, url: null, kind: 'fill' };
    const doc = wp.document;
    if (doc && doc.id != null) {
      this.wallDocs = this.wallDocs || new Map();
      this.wallDocs.set(String(doc.id), doc);
      out.url = `media/wallpaper/${doc.id}`;
      out.kind = wp.pattern ? 'pattern' : 'image';
    }
    if (out.kind === 'fill' && !colors.length) return null;
    return out;
  };

  /** Wallpaper and message colours of a chat: its own wallpaper, else the wallpaper of its chat theme. */
  P.chatAppearance = async function chatAppearance(key) {
    const { client, entity, peer } = await this.chatInput(key);
    let full = null;
    try {
      if (entity instanceof Api.User) full = (await client.invoke(new Api.users.GetFullUser({ id: peer }))).fullUser;
      else if (entity instanceof Api.Channel) full = (await client.invoke(new Api.channels.GetFullChannel({ channel: peer }))).fullChat;
      else full = (await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }))).fullChat;
    } catch (e) { console.warn('[chat] appearance', e); return null; }
    const res = { wallpaper: this.formatWallpaper(full.wallpaper), theme: null };
    const emoticon = full.themeEmoticon;
    if (emoticon) {
      try {
        if (!this.chatThemes) this.chatThemes = await client.invoke(new Api.account.GetChatThemes({ hash: 0 }));
        const theme = (this.chatThemes.themes || []).find((th) => th.emoticon === emoticon);
        if (theme) {
          const hex = (n) => '#' + (n >>> 0 & 0xffffff).toString(16).padStart(6, '0');
          const pick = (dark) => (theme.settings || []).find((x) => (x.baseTheme instanceof Api.BaseThemeNight || x.baseTheme instanceof Api.BaseThemeTinted) === dark);
          const variant = (x) => (x ? { accent: hex(x.accentColor), out: (x.messageColors || []).map(hex), wallpaper: this.formatWallpaper(x.wallpaper) } : null);
          res.theme = { emoticon, dark: variant(pick(true)), light: variant(pick(false)) };
        }
      } catch (e) { console.warn('[chat] themes', e); }
    }
    return res;
  };

  // ----- live updates -----

  /**
   * handlers: onMessage(msg), onEdit(msg), onDelete(key|null, ids), onRead(key, 'inbox'|'outbox', maxId),
   * onTyping(key, name), onStatus(key, status)
   */
  P.startChatLive = async function startChatLive(handlers) {
    this.chatLive = handlers;
    if (this.chatLiveBound) return;
    this.chatLiveBound = true;
    const client = await this.getClient();
    client.addEventHandler((u) => {
      try { this.onChatUpdate(u); } catch (e) { console.warn('[TeleX chat] update', e); }
    });
  };

  P.chatPeerKey = function chatPeerKey(peer) {
    if (peer instanceof Api.PeerUser) return `u${peer.userId}`;
    if (peer instanceof Api.PeerChat) return `g${peer.chatId}`;
    if (peer instanceof Api.PeerChannel) return `c${peer.channelId}`;
    return null;
  };

  P.onChatUpdate = function onChatUpdate(u) {
    const h = this.chatLive;
    if (!h) return;
    if (u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage || u instanceof Api.UpdateEditMessage || u instanceof Api.UpdateEditChannelMessage) {
      const m = u.message;
      if (!(m instanceof Api.Message || m instanceof Api.MessageService)) return;
      const key = this.chatPeerKey(m.peerId);
      if (!key) return;
      const msg = this.formatChatMessage(m, key);
      const dlg = this.entities.get(key);
      const done = (x) => {
        const isEdit = u instanceof Api.UpdateEditMessage || u instanceof Api.UpdateEditChannelMessage;
        if (isEdit) h.onEdit && h.onEdit(x);
        else h.onMessage && h.onMessage(x, { title: dlg ? this.chatTitle(dlg) : '', muted: false });
      };
      if (m.replyTo && m.replyTo.replyToMsgId && dlg) {
        this.chatFillReplies(dlg, key, [msg]).finally(() => done(msg));
      } else done(msg);
      return;
    }
    if (u instanceof Api.UpdateDeleteMessages) {
      h.onDelete && h.onDelete(null, u.messages);
      return;
    }
    if (u instanceof Api.UpdateDeleteChannelMessages) {
      h.onDelete && h.onDelete(`c${u.channelId}`, u.messages);
      return;
    }
    if (u instanceof Api.UpdateReadHistoryInbox || u instanceof Api.UpdateReadHistoryOutbox) {
      const key = this.chatPeerKey(u.peer);
      if (key) h.onRead && h.onRead(key, u instanceof Api.UpdateReadHistoryInbox ? 'inbox' : 'outbox', u.maxId);
      return;
    }
    if (u instanceof Api.UpdateReadChannelInbox) {
      h.onRead && h.onRead(`c${u.channelId}`, 'inbox', u.maxId);
      return;
    }
    if (u instanceof Api.UpdateReadChannelOutbox) {
      h.onRead && h.onRead(`c${u.channelId}`, 'outbox', u.maxId);
      return;
    }
    if (u instanceof Api.UpdateUserTyping || u instanceof Api.UpdateChatUserTyping || u instanceof Api.UpdateChannelUserTyping) {
      const key = u instanceof Api.UpdateUserTyping ? `u${u.userId}` : u instanceof Api.UpdateChatUserTyping ? `g${u.chatId}` : `c${u.channelId}`;
      const from = u instanceof Api.UpdateUserTyping ? `u${u.userId}` : this.chatPeerKey(u.fromId);
      const en = from && this.entities.get(from);
      const typing = u.action instanceof Api.SendMessageTypingAction || u.action instanceof Api.SendMessageRecordAudioAction || u.action instanceof Api.SendMessageUploadPhotoAction;
      if (typing && h.onTyping) h.onTyping(key, en && en.firstName ? en.firstName : '', u.action instanceof Api.SendMessageTypingAction ? 'typing' : 'other');
      return;
    }
    if (u instanceof Api.UpdateMessageReactions) {
      const key = this.chatPeerKey(u.peer);
      if (key && h.onReactions) h.onReactions(key, u.msgId, this.reactionsOf({ reactions: u.reactions }));
      return;
    }
    if (u instanceof Api.UpdateUserStatus) {
      const key = `u${u.userId}`;
      const en = this.entities.get(key);
      if (en) en.status = u.status;
      if (h.onStatus) h.onStatus(key, en ? this.chatStatusOf(en) : { kind: 'long' });
    }
  };

  P.chatTitle = function chatTitle(e) {
    return e instanceof Api.User ? [e.firstName, e.lastName].filter(Boolean).join(' ') || e.username || '' : e.title || '';
  };
}
