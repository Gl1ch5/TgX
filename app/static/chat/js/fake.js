// Offline demo service for ?fake=1: the same chat* interface as telegram.js, with generated data.
// Used for screenshots and automated tests (no Telegram account needed).
const NAMES = ['Лизавета', 'Evelina', 'ДСА с куратором', 'Поддержка | Stars & VPN', 'Алексей Осипов', 'EasyAPK CHAT', 'G', 'Telegram', 'ZaдaR', 'Мама', 'Работа', 'Новости дня', 'Рейлд', 'Андрей', 'Катя', 'Дизайн-чат'];
const TEXTS = ['Привет! Как дела?', 'Да', 'Спасибо', 'Скинь файл, пожалуйста', 'Увидимся завтра в 10', 'Окей 👍', 'Вход с нового устройства. Pavel, мы заметили вход в аккаунт', 'Пока выглядит фигово', 'Думаю, что ближайшие несколько лет лучше не будет', 'Это причём ультра с утра рейтрейсингом'];
const now = Math.floor(Date.now() / 1000);
const kindOf = (i) => (i % 5 === 3 ? 'group' : i % 7 === 5 ? 'channel' : 'user');
const dialogs = Array.from({ length: 60 }, (_, i) => {
  const kind = kindOf(i);
  const date = now - i * 3300 - (i > 6 ? i * 40000 : 0);
  const out = i % 3 === 1;
  return {
    id: `${kind === 'user' ? 'u' : kind === 'group' ? 'g' : 'c'}${1000 + i}`,
    kind, title: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ''), username: '', avatar: null,
    verified: i === 7, bot: false, self: i === 1, muted: i % 4 === 2, pinned: i < 3, archived: false,
    unread: i % 4 === 0 ? (i * 7) % 40 + 1 : 0, unreadMentions: 0, markedUnread: false,
    readInboxMaxId: 0, readOutboxMaxId: out ? 5 : 100, topId: 100, date,
    status: kind === 'user' ? (i % 2 ? { kind: 'recently' } : { kind: 'online' }) : { kind: 'members', count: 120 * i + 5 },
    last: { id: 100, text: TEXTS[i % TEXTS.length], out, senderName: kind === 'group' ? (out ? 'Вы' : 'Дмитрий') : '' },
  };
});
const history = (key) => {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const mine = i % 3 === 0;
    out.push({ id: i + 1, chatId: key, date: now - (80 - i) * 900, out: mine, senderKey: mine ? 'u1' : 'u2', senderName: mine ? 'Я' : 'Pavel', senderAvatar: null, text: TEXTS[i % TEXTS.length], html: TEXTS[i % TEXTS.length], media: [], reactions: [], replyTo: i % 9 === 4 ? { id: i - 1, name: 'Pavel', text: TEXTS[(i + 3) % TEXTS.length] } : null, status: 'sent', service: null });
  }
  return out;
};
export const fake = {
  async isAuthorized() { return true; },
  hasSession: () => true,
  cachedMe: () => ({ id: 1, name: 'Pavel', first_name: 'Pavel', phone: '79001234567', username: 'pavel', avatar: null }),
  async getMe() { return this.cachedMe(); },
  async getFullMe() { return { about: 'TeleX Chat — демо' }; },
  warmUp() {}, authError: (e) => ({ status: 'error', message: String(e) }),
  async chatDialogs({ limit = 40, cursor = null, archived = false } = {}) {
    if (archived) return { dialogs: [], hasMore: false, cursor: null };
    const from = cursor ? cursor.i : 0;
    const page = dialogs.slice(from, from + limit);
    return { dialogs: page, hasMore: from + limit < dialogs.length, cursor: { i: from + limit } };
  },
  async chatFolders() { return []; },
  async chatHistory(key, { offsetId = 0, limit = 40 } = {}) {
    const all = history(key).filter((m) => !offsetId || m.id < offsetId);
    const page = all.slice(-limit);
    return { messages: page, hasMore: all.length > limit };
  },
  async chatSend(key, text) { await new Promise((r) => setTimeout(r, 400)); return { id: 1000 + Math.floor(Math.random() * 1e6), chatId: key, date: Math.floor(Date.now() / 1000), out: true, senderKey: 'u1', senderName: 'Я', text, html: text, media: [], reactions: [], status: 'sent', service: null }; },
  async chatSendFile() { throw new Error('demo'); }, async chatEdit(k, id, text) { return { id, chatId: k, date: now, out: true, text, html: text, media: [], reactions: [], edited: true, status: 'sent', service: null }; },
  async chatDelete() { return true; }, async chatMarkRead() { return true; }, async chatTyping() { return true; },
  async chatSearch() { return []; },
  async chatContacts() { return dialogs.filter((d) => d.kind === 'user').map((d) => ({ id: d.id, kind: 'user', title: d.title, username: '', avatar: null, status: d.status })); },
  async startChatLive() {}, async logout() {},
};
