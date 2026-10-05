// Screens of the real TeleX UI on demo data, for the trailers.
// Needs the app served on http://localhost:8765 (python3 -m http.server 8765 in app/static).
// Usage: node promo/capture.cjs  ->  promo/build/shots/*.png
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const OUT = path.join(__dirname, 'build', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const svg = (body, w = 800, h = 520) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const ART = {
  saturn: svg(`<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1033"/><stop offset="1" stop-color="#3a2a6b"/></linearGradient><radialGradient id="p" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#e2b679"/></radialGradient></defs><rect width="800" height="520" fill="url(#s)"/><g fill="#fff" opacity=".8"><circle cx="90" cy="70" r="2"/><circle cx="300" cy="40" r="1.5"/><circle cx="700" cy="90" r="2.5"/><circle cx="560" cy="30" r="1.5"/><circle cx="420" cy="120" r="1.2"/><circle cx="160" cy="180" r="1.6"/><circle cx="240" cy="300" r="1.2"/><circle cx="60" cy="380" r="1.8"/></g><circle cx="560" cy="300" r="150" fill="url(#p)"/><ellipse cx="560" cy="300" rx="250" ry="40" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="6" transform="rotate(-18 560 300)"/><path d="M0 430 Q200 360 400 420 T800 400 V520 H0Z" fill="#000" opacity=".35"/>`),
  mountains: svg(`<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b4f"/><stop offset=".55" stop-color="#e2587b"/><stop offset="1" stop-color="#ffb36b"/></linearGradient></defs><rect width="800" height="520" fill="url(#a)"/><circle cx="400" cy="330" r="90" fill="#ffe2a3" opacity=".95"/><path d="M0 340 L140 210 L240 300 L380 160 L520 310 L620 220 L800 350 V520 H0Z" fill="#5b2a5e"/><path d="M0 410 L170 300 L300 380 L460 270 L600 380 L720 320 L800 360 V520 H0Z" fill="#3a1d47"/><path d="M0 470 L200 390 L360 450 L560 380 L800 460 V520 H0Z" fill="#1f1030"/>`),
  aurora: svg(`<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040b1a"/><stop offset="1" stop-color="#0d2538"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3cffb0" stop-opacity="0"/><stop offset=".5" stop-color="#3cffb0" stop-opacity=".85"/><stop offset="1" stop-color="#7a6bff" stop-opacity="0"/></linearGradient><filter id="f"><feGaussianBlur stdDeviation="14"/></filter></defs><rect width="800" height="520" fill="url(#b)"/><g filter="url(#f)"><path d="M-50 260 C150 120 300 300 450 170 S750 120 850 220" stroke="url(#g)" stroke-width="60" fill="none"/><path d="M-50 200 C200 80 350 220 520 110 S760 90 850 150" stroke="url(#g)" stroke-width="30" fill="none" opacity=".7"/></g><g fill="#fff" opacity=".7"><circle cx="100" cy="60" r="1.5"/><circle cx="380" cy="40" r="1.2"/><circle cx="650" cy="70" r="1.8"/><circle cx="720" cy="300" r="1.2"/></g><path d="M0 420 L120 380 L180 400 L260 360 L340 410 L420 370 L520 420 L640 380 L800 420 V520 H0Z" fill="#02060d"/>`),
  ocean: svg(`<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd3ff"/><stop offset=".5" stop-color="#2a8ccc"/><stop offset="1" stop-color="#0b3a63"/></linearGradient></defs><rect width="800" height="520" fill="url(#c)"/><circle cx="640" cy="110" r="55" fill="#fff6c9"/><g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"><path d="M0 300 Q100 270 200 300 T400 300 T600 300 T800 300"/><path d="M0 360 Q100 330 200 360 T400 360 T600 360 T800 360" stroke-opacity=".35"/><path d="M0 420 Q100 390 200 420 T400 420 T600 420 T800 420" stroke-opacity=".25"/></g><path d="M80 250 L140 250 L120 270 L95 270Z" fill="#fff"/><path d="M118 250 L118 200 L150 245Z" fill="#fff"/>`),
  neon: svg(`<defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12052a"/><stop offset="1" stop-color="#3d0a4f"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="800" height="520" fill="url(#d)"/><circle cx="400" cy="250" r="140" fill="#ff3d9a" opacity=".35" filter="url(#glow)"/><g fill="#170a2e">${[[20,180,90],[120,120,70],[200,220,110],[320,90,80],[410,160,100],[520,60,90],[620,190,80],[710,130,90]].map(([x,y,w])=>`<rect x="${x}" y="${y}" width="${w}" height="${520-y}"/>`).join('')}</g><g fill="#ffd36b" opacity=".85">${Array.from({length:60},(_,i)=>`<rect x="${30+(i*53)%760}" y="${200+(i*37)%280}" width="8" height="10"/>`).join('')}</g><path d="M0 470 H800" stroke="#29f3ff" stroke-width="6" filter="url(#glow)"/><path d="M0 470 H800" stroke="#bff9ff" stroke-width="2"/>`),
  food: svg(`<rect width="800" height="520" fill="#d7b48a"/><g opacity=".25" stroke="#8a6440" stroke-width="3">${Array.from({length:14},(_,i)=>`<path d="M0 ${i*40} H800"/>`).join('')}</g><circle cx="400" cy="260" r="210" fill="#f4f1ea"/><circle cx="400" cy="260" r="170" fill="#fffdf7"/><g fill="none" stroke="#f2c44f" stroke-width="9" stroke-linecap="round">${Array.from({length:16},(_,i)=>`<path d="M${300+(i*13)%200} ${180+(i*29)%160} q30 -40 60 0 t60 0"/>`).join('')}</g><g fill="#4caf50">${[[350,200],[450,230],[400,320],[330,300],[470,300]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="22" ry="12" transform="rotate(${x%60} ${x} ${y})"/>`).join('')}</g><circle cx="610" cy="120" r="50" fill="#ffe14d"/><circle cx="610" cy="120" r="38" fill="#fff59a"/>`),
};
const avatar = (emoji, a, b) => svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="66" font-size="48" text-anchor="middle">${emoji}</text>`, 100, 100);
const AV = {
  space: avatar('🪐', '#3b2a7a', '#0b1033'), design: avatar('🎨', '#ff6fb1', '#7a4dff'), travel: avatar('🏔️', '#ff9a5a', '#e2587b'),
  food: avatar('🍋', '#ffd84d', '#ff9f1c'), tech: avatar('⚡', '#2fa9ff', '#1d4bd6'), music: avatar('🎧', '#3be0a0', '#138a6a'), city: avatar('🌃', '#8c3bff', '#ff3d9a'),
  p1: avatar('🙂', '#7ec8ff', '#4a7dff'), p2: avatar('😎', '#ffb36b', '#ff6f61'), p3: avatar('🐱', '#9be15d', '#00b09b'), me: avatar('🚀', '#5a83f3', '#8774e1'),
};

async function setup(p, opts = {}) {
  await p.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await p.addInitScript(() => localStorage.setItem('telex.prefs', JSON.stringify({ workerMode: false, migration: 1 })));
  await p.goto('http://localhost:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(async ({ ART, AV }) => {
    const { state } = await import('./js/state.js');
    const { api } = await import('./js/api.js');
    const wall = await import('./js/views/wall.js');
    const now = Math.floor(Date.now() / 1000);
    state.isAuth = true;
    state.user = { id: 7, name: 'Алекс', first_name: 'Алекс', phone: '79990001122', username: 'telex_user', avatar: AV.me, premium: true };
    const mk = (id, title, avatar, extra = {}) => ({ id, title, username: 'demo' + id, is_broadcast: true, verified: false, unread_count: 0, avatar, muted: false, participants_count: 128400, ...extra });
    state.channels = [
      mk(1, 'Космос сегодня', AV.space, { verified: true, unread_count: 7 }), mk(2, 'Дизайн и UI', AV.design, { unread_count: 3 }),
      mk(3, 'Путешествия', AV.travel, { unread_count: 5 }), mk(4, 'Кухня за 15 минут', AV.food), mk(5, 'Tech Daily', AV.tech, { verified: true, unread_count: 2 }),
      mk(6, 'Город ночью', AV.city, { unread_count: 4 }),
    ];
    const ch = state.channels;
    const t = (m) => new Date((now - m * 60) * 1000).toISOString();
    const P = (id, c, m, extra) => ({ id, msg_id: Number(id.split('_')[1]), channel_id: ch[c].id, channel: ch[c], date: t(m), timestamp: now - m * 60, text: 'x', views: 9000, replies_count: 0, comments_enabled: true, reactions: [], tg_url: 'https://t.me/x', media_items: [], media_type: null, ...extra });
    const rep = (a, b, c) => [{ id: 21, name: 'Мира', avatar: AV.p1 }, { id: 22, name: 'Олег', avatar: AV.p2 }, { id: 23, name: 'Ян', avatar: AV.p3 }].slice(0, a + b + c);
    state.posts = [
      P('1_10', 0, 3, { text_html: '<strong>Кольца Сатурна</strong> в новом снимке телескопа — детализация, которой раньше не было.\n\nЛистайте альбом в комментариях 🪐',
        media_type: 'photo', media_items: [{ type: 'photo', url: ART.saturn, width: 800, height: 520 }], views: 48200, replies_count: 214, recent_repliers: rep(1, 1, 1),
        reactions: [{ emoji: '⭐', paid: true, count: 12 }, { emoji: '🔥', count: 1240 }, { emoji: '❤', count: 860, chosen: true }, { emoji: '🤯', count: 132 }] }),
      P('3_21', 2, 9, { text_html: '<strong>Норвегия за 7 дней</strong> — маршрут, бюджет и места, где почти нет туристов 🏔️',
        media_type: 'album', media_items: [{ type: 'photo', url: ART.mountains, width: 800, height: 520 }, { type: 'photo', url: ART.aurora, width: 800, height: 520 }, { type: 'photo', url: ART.ocean, width: 800, height: 520 }],
        views: 23100, replies_count: 89, recent_repliers: rep(1, 1, 0), reactions: [{ emoji: '😍', count: 640 }, { emoji: '🔥', count: 210 }, { emoji: '👍', count: 75 }] }),
      P('2_5', 1, 14, { text_html: 'Пять правил хорошего интерфейса:\n1. Меньше — лучше\n2. Отступы важнее цвета\n3. Анимация объясняет, а не украшает ✨',
        views: 9100, replies_count: 37, recent_repliers: rep(1, 1, 0), reactions: [{ emoji: '👍', count: 312 }, { emoji: '🔥', count: 120 }, { emoji: '🥰', count: 44 }],
        buttons: [[{ text: 'Читать статью', url: 'https://example.com' }]] }),
      P('6_40', 5, 26, { text_html: 'Неоновый Токио после дождя 🌧️', media_type: 'video',
        media_items: [{ type: 'video', url: 'media/doc/6/40', thumb_url: ART.neon, preview: ART.neon, width: 800, height: 520, duration: 47 }],
        views: 31800, replies_count: 120, recent_repliers: rep(1, 1, 1), reactions: [{ emoji: '🔥', count: 2100 }, { emoji: '❤', count: 990 }] }),
      P('4_8', 3, 41, { text_html: 'Паста с лимоном и базиликом за 15 минут 🍋', media_type: 'photo',
        media_items: [{ type: 'photo', url: ART.food, width: 800, height: 520 }], views: 15400, replies_count: 52, recent_repliers: rep(1, 0, 0),
        reactions: [{ emoji: '😍', count: 530 }, { emoji: '❤', count: 210 }] }),
      P('5_77', 4, 58, { text_html: '<strong>Вышел Android 17</strong>: новый дизайн уведомлений, жесты и ускорение на 30%. Что ещё изменилось — в треде 👇',
        views: 64000, replies_count: 431, recent_repliers: rep(1, 1, 1), reactions: [{ emoji: '🔥', count: 3100 }, { emoji: '👍', count: 1200 }, { emoji: '🤔', count: 210 }] }),
    ];
    const st = (id, c, cap = '') => ({ id, date: now - 3600, type: 'photo', url: c, caption: cap, caption_html: cap });
    const peers = [
      { key: 'u1', id: 31, name: 'Аня', title: 'Аня', avatar: AV.p1, max_read_id: 0, unread: true, stories: [st(1, ART.mountains, 'Рассвет в горах ☀️'), st(2, ART.aurora)] },
      { key: 'c1', id: 1, name: 'Космос сегодня', title: 'Космос сегодня', avatar: AV.space, max_read_id: 0, unread: true, stories: [st(1, ART.saturn)] },
      { key: 'u2', id: 32, name: 'Макс', title: 'Макс', avatar: AV.p2, max_read_id: 0, unread: true, stories: [st(1, ART.neon)] },
      { key: 'c6', id: 6, name: 'Город ночью', title: 'Город ночью', avatar: AV.city, max_read_id: 0, unread: true, stories: [st(1, ART.neon)] },
      { key: 'c2', id: 2, name: 'Дизайн и UI', title: 'Дизайн и UI', avatar: AV.design, max_read_id: 9, unread: false, stories: [st(9, ART.ocean)] },
    ];
    state.stories = peers;
    api.getStories = async () => peers;
    api.readStories = async () => {};
    api.likeStory = async () => ({});
    api.getFeed = async () => ({ posts: state.posts, has_more: false });
    api.cachedComments = () => null;
    api.getComments = async () => ({ total: 6, has_more: false, comments: [
      { id: 1, sender_id: 21, sender_name: 'Мира', sender_avatar: AV.p1, text_html: 'Невероятно красиво 😍', date: t(3), timestamp: now - 170, reactions: [{ emoji: '❤', count: 14 }] },
      { id: 2, sender_id: 22, sender_name: 'Олег', sender_avatar: AV.p2, text_html: 'Это James Webb?', date: t(2), timestamp: now - 150, reactions: [] },
      { id: 3, sender_id: 1, sender_name: 'Космос сегодня', sender_avatar: AV.space, text_html: 'Да, снимок в инфракрасном диапазоне 🔭', reply_to_id: 2, date: t(2), timestamp: now - 120, reactions: [{ emoji: '👍', count: 6 }] },
      { id: 4, sender_id: 23, sender_name: 'Ян', sender_avatar: AV.p3, text_html: 'Сохранил на обои', date: t(1), timestamp: now - 90, reactions: [{ emoji: '🔥', count: 3 }] },
      { id: 5, sender_id: 7, sender_name: 'Алекс', sender_avatar: AV.me, is_out: true, text_html: 'Космос — это всегда вау 🚀', date: t(1), timestamp: now - 30, reactions: [{ emoji: '❤', count: 2 }] },
    ].map((c) => ({ ...c, text: c.text_html })) });
    api.getChannelFull = async (id) => ({ id, title: 'Космос сегодня', username: 'space_today', about: 'Главные новости астрономии и космонавтики каждый день 🚀\nНаписать редакции: @space_editor', participants_count: 128400, avatar: AV.space, verified: true, linked: { id: 9, title: 'Чат', username: 'space_chat' }, pinned: { msg_id: 10, text: 'Кольца Сатурна в новом снимке', kind: 'Фотография', thumb: ART.saturn }, muted: false });
    api.getChannelStories = async () => ({ key: 'c1', id: 1, title: 'Космос сегодня', max_read_id: 1e15, stories: [ART.saturn, ART.aurora, ART.ocean, ART.mountains, ART.neon, ART.saturn].map((u, i) => ({ ...st(i + 1, u), views: 12000 + i * 3100 })) });
    api.getChannelMedia = async () => ({ posts: state.posts.filter((x) => x.media_items.length), has_more: false, next_offset: 0 });
    api.getFullMe = async () => ({ about: 'Читаю каналы в TeleX 🚀', birthday: null });
    api.getMyStories = async () => ({ key: 'u7', stories: [] });
    api.getSessions = async () => [];
    window.TelegramX.updateAuthUI();
    wall.renderPosts();
  }, { ART, AV });
  await p.waitForTimeout(900);
}

(async () => {
  const b = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 };
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
  await shoot('viewer', async (p) => { await p.evaluate(() => window.TelegramX.openViewer('3_21', 1)); await p.waitForTimeout(700); });
  await shoot('menu', async (p) => { await p.click('#post-card-1_10 .tx-bubble', { position: { x: 160, y: 300 } }); await p.waitForTimeout(600); });
  await shoot('settings', async (p) => { await p.evaluate(() => window.TelegramX.setView('settings')); });
  await shoot('desktop', null, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await b.close();
})();
