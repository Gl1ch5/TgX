// Screens of the real TeleX UI on demo data, for the trailers.
// Needs the app served on http://localhost:8765 (python3 -m http.server 8765 in app/static).
// Usage: node promo/capture.cjs  ->  promo/build/shots/*.png
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const OUT = path.join(__dirname, 'build', `shots-${process.env.LANG_CODE === 'en' ? 'en' : 'ru'}`);
fs.mkdirSync(OUT, { recursive: true });


// ---- real photos (picsum.photos = Unsplash photos, free licence) and illustrated avatars (DiceBear "lorelei", CC0)
const LANG = process.env.LANG_CODE === 'en' ? 'en' : 'ru';
const A = path.join(__dirname, 'assets');
const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(A, file)).toString('base64')}`;
const photo = (id) => dataUrl(`photos/p${id}.jpg`, 'image/jpeg');
const person = (name) => dataUrl(`avatars/${name}.png`, 'image/png');
const ART = { fjord: photo(1015), canoe: photo(1011), falls: photo(1039), alps: photo(29), road: photo(549), hills: photo(1018), sunset: photo(110),
  salad: photo(488), veg: photo(292), berries: photo(429), desk: photo(529), keys: photo(366), concert: photo(452), van: photo(655), snow: photo(1036) };
const AV = { nature: ART.fjord, food: ART.salad, design: ART.desk, music: ART.concert, tech: ART.keys, road: ART.van,
  me: person('Max'), p1: person('Mira'), p2: person('Oleg'), p3: person('Nika'), p4: person('Anna'), p5: person('Tim') };
const T = LANG === 'en' ? {
  user: 'Alex', ch: ['Wild Planet', 'Design & UI', 'Cooking in 15', 'Live Music', 'Tech Daily', 'Roads'],
  p1: '<strong>Norway in 7 days</strong> — the route, the budget and the places with almost no tourists 🏔️',
  p2: 'Five rules of a good interface:\n1. Less is more\n2. Spacing beats colour\n3. Animation explains, it does not decorate ✨',
  p3: 'Lemon and basil pasta in 15 minutes 🍋',
  p4: 'Last night in Berlin 🎧 the whole crowd sang along', p5: '<strong>Android 17 is out</strong>: new notifications, gestures and a 30% speed-up. What else changed — in the thread 👇',
  p6: 'A week on the road with a blue van 🚐',
  btn: 'Read the article', views: ['Mira', 'Oleg', 'Nika'],
  c: ['So beautiful 😍', 'Is this the Lysefjord?', 'Yes, the view from Preikestolen 🏔️', 'Saved it as my wallpaper', 'Nature never gets old 🚀'],
  names: ['Mira', 'Oleg', 'Wild Planet', 'Nika'], cap: 'Sunrise in the mountains ☀️', about: 'Reading channels in TeleX 🚀', pin: 'Norway in 7 days', pinKind: 'Photo',
  chAbout: 'Travel stories and photos from every continent 🌍\nContact the editors: @wild_planet_ed',
} : {
  user: 'Алекс', ch: ['Дикая планета', 'Дизайн и UI', 'Кухня за 15 минут', 'Live-музыка', 'Tech Daily', 'Дороги'],
  p1: '<strong>Норвегия за 7 дней</strong> — маршрут, бюджет и места, где почти нет туристов 🏔️',
  p2: 'Пять правил хорошего интерфейса:\n1. Меньше — лучше\n2. Отступы важнее цвета\n3. Анимация объясняет, а не украшает ✨',
  p3: 'Паста с лимоном и базиликом за 15 минут 🍋',
  p4: 'Вчера в Берлине 🎧 весь зал пел вместе с нами', p5: '<strong>Вышел Android 17</strong>: новые уведомления, жесты и ускорение на 30%. Что ещё изменилось — в треде 👇',
  p6: 'Неделя в дороге на голубом фургоне 🚐',
  btn: 'Читать статью', views: ['Мира', 'Олег', 'Ника'],
  c: ['Невероятно красиво 😍', 'Это фьорд Люсе?', 'Да, вид со скалы Прекестулен 🏔️', 'Поставил на обои', 'Природа не надоедает 🚀'],
  names: ['Мира', 'Олег', 'Дикая планета', 'Ника'], cap: 'Рассвет в горах ☀️', about: 'Читаю каналы в TeleX 🚀', pin: 'Норвегия за 7 дней', pinKind: 'Фото',
  chAbout: 'Истории путешествий и фото со всех континентов 🌍\nНаписать редакции: @wild_planet_ed',
};

async function setup(p) {
  await p.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await p.addInitScript(() => localStorage.setItem('telex.prefs', JSON.stringify({ workerMode: false, migration: 1, theme: 'dark', colorTheme: 'games', accent: 'violet' })));
  await p.goto('http://localhost:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(async ({ ART, AV, T }) => {
    const { state } = await import('./js/state.js');
    const { api } = await import('./js/api.js');
    const wall = await import('./js/views/wall.js');
    const now = Math.floor(Date.now() / 1000);
    state.isAuth = true;
    state.user = { id: 7, name: T.user, first_name: T.user, phone: '79990001122', username: 'telex_user', avatar: AV.me, premium: true };
    const mk = (id, title, avatar, extra = {}) => ({ id, title, username: 'demo' + id, is_broadcast: true, verified: false, unread_count: 0, avatar, muted: false, participants_count: 128400, ...extra });
    state.channels = [
      mk(1, T.ch[0], AV.nature, { verified: true, unread_count: 7 }), mk(2, T.ch[1], AV.design, { unread_count: 3 }), mk(3, T.ch[2], AV.food, { unread_count: 5 }),
      mk(4, T.ch[3], AV.music, { unread_count: 4 }), mk(5, T.ch[4], AV.tech, { verified: true, unread_count: 2 }), mk(6, T.ch[5], AV.road),
    ];
    const ch = state.channels;
    const t = (m) => new Date((now - m * 60) * 1000).toISOString();
    const P = (id, c, m, extra) => ({ id, msg_id: Number(id.split('_')[1]), channel_id: ch[c].id, channel: ch[c], date: t(m), timestamp: now - m * 60, text: 'x', views: 9000, replies_count: 0, comments_enabled: true, reactions: [], tg_url: 'https://t.me/x', media_items: [], media_type: null, ...extra });
    const rep = [{ id: 21, name: T.views[0], avatar: AV.p1 }, { id: 22, name: T.views[1], avatar: AV.p2 }, { id: 23, name: T.views[2], avatar: AV.p3 }];
    const img = (u) => ({ type: 'photo', url: u, width: 900, height: 600 });
    state.posts = [
      P('1_10', 0, 3, { text_html: T.p1, media_type: 'album', media_items: [img(ART.fjord), img(ART.canoe), img(ART.falls)], views: 48200, replies_count: 214, recent_repliers: rep,
        reactions: [{ emoji: '⭐', paid: true, count: 12 }, { emoji: '🔥', count: 1240 }, { emoji: '❤', count: 860, chosen: true }, { emoji: '😍', count: 132 }] }),
      P('4_21', 3, 9, { text_html: T.p4, media_type: 'video', media_items: [{ type: 'video', url: 'media/doc/4/21', thumb_url: ART.concert, preview: ART.concert, width: 900, height: 600, duration: 47 }],
        views: 31800, replies_count: 120, recent_repliers: rep.slice(0, 2), reactions: [{ emoji: '🔥', count: 2100 }, { emoji: '❤', count: 990 }, { emoji: '🎉', count: 310 }] }),
      P('2_5', 1, 14, { text_html: T.p2, media_type: 'photo', media_items: [img(ART.desk)], views: 9100, replies_count: 37, recent_repliers: rep.slice(0, 2),
        reactions: [{ emoji: '👍', count: 312 }, { emoji: '🔥', count: 120 }, { emoji: '🥰', count: 44 }], buttons: [[{ text: T.btn, url: 'https://example.com' }]] }),
      P('3_8', 2, 26, { text_html: T.p3, media_type: 'photo', media_items: [img(ART.salad)], views: 15400, replies_count: 52, recent_repliers: rep.slice(0, 1), reactions: [{ emoji: '😍', count: 530 }, { emoji: '❤', count: 210 }] }),
      P('6_40', 5, 41, { text_html: T.p6, media_type: 'photo', media_items: [img(ART.van)], views: 23100, replies_count: 89, recent_repliers: rep, reactions: [{ emoji: '😍', count: 640 }, { emoji: '🔥', count: 210 }] }),
      P('5_77', 4, 58, { text_html: T.p5, views: 64000, replies_count: 431, recent_repliers: rep, reactions: [{ emoji: '🔥', count: 3100 }, { emoji: '👍', count: 1200 }, { emoji: '🤔', count: 210 }] }),
    ];
    const st = (id, c, cap = '') => ({ id, date: now - 3600, type: 'photo', url: c, caption: cap, caption_html: cap });
    const peers = [
      { key: 'u1', id: 31, name: T.names[0], title: T.names[0], avatar: AV.p1, max_read_id: 0, unread: true, stories: [st(1, ART.alps, T.cap), st(2, ART.hills)] },
      { key: 'c1', id: 1, name: T.ch[0], title: T.ch[0], avatar: AV.nature, max_read_id: 0, unread: true, stories: [st(1, ART.fjord)] },
      { key: 'u2', id: 32, name: T.names[1], title: T.names[1], avatar: AV.p2, max_read_id: 0, unread: true, stories: [st(1, ART.concert)] },
      { key: 'c6', id: 6, name: T.ch[5], title: T.ch[5], avatar: AV.road, max_read_id: 0, unread: true, stories: [st(1, ART.road)] },
      { key: 'c2', id: 2, name: T.ch[1], title: T.ch[1], avatar: AV.design, max_read_id: 9, unread: false, stories: [st(9, ART.sunset)] },
    ];
    state.stories = peers;
    api.getStories = async () => peers; api.readStories = async () => {}; api.likeStory = async () => ({});
    api.getFeed = async () => ({ posts: state.posts, has_more: false });
    api.cachedComments = () => null;
    const cm = (id, sid, name, av, text, ago, extra = {}) => ({ id, sender_id: sid, sender_name: name, sender_avatar: av, text, text_html: text, date: t(ago), timestamp: now - ago * 60, reactions: [], ...extra });
    api.getComments = async () => ({ total: 6, has_more: false, comments: [
      cm(1, 21, T.names[0], AV.p1, T.c[0], 4, { reactions: [{ emoji: '❤', count: 14 }] }), cm(2, 22, T.names[1], AV.p2, T.c[1], 3),
      cm(3, 1, T.names[2], AV.nature, T.c[2], 2, { reply_to_id: 2, reactions: [{ emoji: '👍', count: 6 }] }), cm(4, 23, T.names[3], AV.p3, T.c[3], 1, { reactions: [{ emoji: '🔥', count: 3 }] }),
      cm(5, 7, T.user, AV.me, T.c[4], 0.5, { is_out: true, reactions: [{ emoji: '❤', count: 2 }] }),
    ] });
    api.getChannelFull = async (id) => ({ id, title: T.ch[0], username: 'wild_planet', about: T.chAbout, participants_count: 128400, avatar: AV.nature, verified: true, linked: { id: 9, title: 'Chat', username: 'wild_chat' }, pinned: { msg_id: 10, text: T.pin, kind: T.pinKind, thumb: ART.fjord }, muted: false });
    api.getChannelStories = async () => ({ key: 'c1', id: 1, title: T.ch[0], max_read_id: 1e15, stories: [ART.alps, ART.hills, ART.fjord, ART.road, ART.sunset, ART.snow].map((u, i) => ({ ...st(i + 1, u), views: 12000 + i * 3100 })) });
    api.getChannelMedia = async () => ({ posts: state.posts.filter((x) => x.media_items.length), has_more: false, next_offset: 0 });
    api.getFullMe = async () => ({ about: T.about, birthday: null });
    api.getMyStories = async () => ({ key: 'u7', stories: [] }); api.getSessions = async () => [];
    window.TelegramX.updateAuthUI();
    wall.renderPosts();
  }, { ART, AV, T });
  await p.waitForTimeout(1500);
}

(async () => {
  const b = await chromium.launch();
  const LOCALE = LANG === 'en' ? 'en-US' : 'ru-RU';
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: LOCALE };
  const shoot = async (name, action, ctx = phone, full = false) => {
    const p = await b.newPage(ctx);
    await setup(p);
    if (action) await action(p);
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
    await p.close();
    console.log('shot', name);
  };
  await shoot('wall', null);
  // Long feed for scrolling: the fixed bars are shot separately and laid on top.
  await shoot('feed', async (p) => {
    await p.addStyleTag({ content: '.tx-dock, #tx-jump { display: none !important; } body { min-height: 0 !important; }' });
  }, phone, true);
  await shoot('dock', null);
  await shoot('stories', async (p) => { await p.mouse.move(200, 400); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -60); await p.waitForTimeout(30); } });
  await shoot('story', async (p) => { await p.evaluate(() => window.TelegramX.openStackStories()); await p.waitForTimeout(700); });
  await shoot('comments', async (p) => { await p.evaluate(() => window.TelegramX.openThread('1_10')); await p.waitForTimeout(800); await p.evaluate(() => window.scrollTo(0, 99999)); });
  await shoot('channel', async (p) => { await p.evaluate(() => window.TelegramX.openChannelPage(1)); await p.waitForTimeout(800); });
  await shoot('viewer', async (p) => { await p.evaluate(() => window.TelegramX.openViewer('1_10', 1)); await p.waitForTimeout(2200); });
  await shoot('menu', async (p) => { await p.click('#post-card-1_10 .tx-bubble', { position: { x: 160, y: 300 } }); await p.waitForTimeout(600); });
  await shoot('settings', async (p) => { await p.evaluate(() => window.TelegramX.setView('settings')); });
  await shoot('desktop', null, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: LOCALE });
  await b.close();
})();
