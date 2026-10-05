# TeleX mods — layout, colours, safety and recipes (read this before writing any code)

This part explains *how to do it well and why*. A mod that ignores it can overlap the phone's status bar, cover the bottom bar, become unreadable in day mode or
(worst case) make the app unusable. The app has an emergency switch (⋮ menu → "Disable all mods", and automatic safe mode after 2 failed starts), but a good mod never needs it.

## 1. The golden rules (why mods break the app)

1. **Never use `position: fixed` / `absolute` with `top: 0`, `top: 8px`, `left: 0; right: 0; height: 100%` for something small.** On a phone the app is edge-to-edge:
   the status bar (clock, battery) is drawn *over* the top of the page. Everything near `top: 0` hides behind it or collides with it. The real height is `var(--tx-safe-top)` (≈ 24–48 px, 0 on desktop).
   The same at the bottom: the gesture bar is `var(--tx-safe-bottom)`, and the app's own dock lives in the bottom ~72 px.
   → Prefer a **slot** (`tx.ui.add('topbar'|'dock'|'fab'|'post.footer'…)`): the app places it correctly on every device.
   → If you really need a floating element: `top: calc(var(--tx-safe-top) + 64px)` (below the title bar) or `bottom: calc(var(--tx-dock-h) + 24px + var(--tx-safe-bottom))` (above the dock).
2. **Never cover the whole screen** with a transparent/translucent layer, never set `pointer-events: auto` on something full-screen, never put `overflow: hidden` on `html`/`body`/`#app`.
   A floating widget must be small and may carry `pointer-events: none` unless it is a button.
3. **Never hide or restyle the elements the user needs to leave the screen** (`.tx-dock`, `.tx-mainbar`, the ⋮ button, settings rows) with `display: none` or `visibility: hidden`.
4. **Do not use hard-coded colours** (`#000`, `#fff`, `white`) for text or surfaces. The app has day and night modes; use the variables from section 3. A white clock on a white day background is invisible.
5. **Do not touch `html`, `body`, `#app`, `.tx-screen` layout properties** (`display`, `position`, `height`, `transform`, `filter`, `overflow`, `zoom`). `transform`/`filter` on an ancestor breaks every `position: fixed` child (the dock jumps, the viewer shifts).
   `backdrop-filter` on a large element is expensive: ≤ 3 per screen, never on a scrolling list item.
6. **Never write a global rule without a prefix.** `div { … }`, `button { … }`, `* { … }`, `.icon { … }` restyle the whole app. Always scope: `.tx-mod-<id> …` for your own elements, or an exact app selector.
7. **Clean up.** Timers (`setInterval`), global listeners (`window.addEventListener`), observers: register them with `tx.onStop(() => clearInterval(t))`. Everything made through `tx.ui.*` / `tx.theme.*` is removed automatically.
8. **Handle errors.** Wrap network/JSON code in `try/catch`; a mod that throws at start is rejected and removed. Never block: no `alert`, no endless loops, no synchronous XHR.
9. **Touch targets ≥ 40×40 px**, text ≥ 13 px. Test at a width of 360 px.
10. **One concern per mod.** A weather widget must not also restyle the dock.

## 2. The layout of the app (so that you know where things are)

```
┌──────────────── phone ────────────────┐
│ status bar (OS)      ← var(--tx-safe-top) tall, drawn over the page; NOTHING of yours here
├───────────────────────────────────────┤
│ .tx-mainbar        56 px: stories stack · "TeleX" · search 🔍 · ⋮     ← slot 'topbar' (end side)
│ #header-search-bar search field                                         ← slot 'search'
│ #feed-tabs         All · Media · Popular · Favorites                    ← slot 'tabs'
│ ┌ post card (.tx-bubble) ───────────┐
│ │ header: avatar · channel · time   │ ← slot 'post.header'
│ │ text, photo/video, buttons        │
│ │ footer: reactions · views · share │ ← slot 'post.footer' (below text) / 'post.actions' (by share)
│ └───────────────────────────────────┘
│ …scrolls…                                          [fab]  ← slot 'fab', ~(dock + 28 px) above the bottom
│   (  Feed   Settings   Profile  )  .tx-dock, 60 px + var(--tx-safe-bottom)   ← slot 'dock'
└───────────────────────────────────────┘
```
Column width on desktop: `--tx-column-w` = 680 px, centred. Screens: `#screen-wall` (feed), `#screen-settings`, `#screen-profile`, `#screen-thread` (comments), `#screen-channel`.
Only one screen is visible at a time; the app sets `data-view="wall|settings|…"` on `#app`.

**Stacking order (z-index)** — stay *below* what must stay on top:

| layer | z-index |
|---|---|
| wallpaper | 0–1 |
| app content `.tx-app` | 10 |
| sticky header / tabs | 29–31 |
| dock | 39–40 |
| fab, floating buttons | 38–45 |
| media viewer | 80 |
| mod full-screen page (`openScreen`) | 150 |
| dialogs / confirm | 200 |
| stories viewer | 300 |
| toast | 400 |

A widget that must float over the feed: `z-index: 35` (above content and headers, below the dock). Never above 100 unless it is a dialog the user can close.

## 3. Colours and tokens (the real values)

Use `var(--token)` — the value changes with day/night mode, accent and wallpaper theme.

| token | night (default) | day | use for |
|---|---|---|---|
| `--tx-bg` | `#000000` | `#f0f0f5` | page background |
| `--tx-surface` | `#1c1c1d` | `#ffffff` | cards, settings groups |
| `--tx-surface-2` | `#262628` | `#f2f2f6` | menus, inputs, secondary cards |
| `--tx-bubble` | `#212123` | `#ffffff` | incoming post/message bubble |
| `--tx-bubble-out` | gradient/`#2b3e63` | gradient | outgoing bubble |
| `--tx-glass` | `rgba(34,34,36,.72)` | `rgba(255,255,255,.8)` | translucent bars (use with `backdrop-filter: var(--tx-glass-blur)`) |
| `--tx-glass-border` | `rgba(255,255,255,.075)` | `rgba(0,0,0,.08)` | 1 px borders of glass |
| `--tx-separator` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.09)` | divider lines |
| `--tx-text` | `#ffffff` | `#000000` | main text |
| `--tx-text-2` | `#9d9da3` | `#707579` | secondary text, subtitles |
| `--tx-hint` | `#6e6e74` | `#9a9ea4` | hints, placeholders |
| `--tx-accent` | `#7595ff` | `#3a6fe6` | links, active icons, accent text |
| `--tx-accent-fill` | `#5a83f3` | same | filled buttons, active tab |
| `--tx-accent-soft` | accent @16 % | accent @12 % | soft highlight behind accent items |
| `--tx-red` / `--tx-green` | `#ff5b5b` / `#4fbf6a` | `#e5484d` / `#2f9e44` | danger / success |
| `--tx-bubble-radius` | `17px` | | corner radius of cards |
| `--tx-safe-top`, `--tx-safe-bottom` | status bar / gesture bar height | | **insets — always add them to fixed positions** |
| `--tx-dock-h` | `64px` | | dock height |
| `--tx-font` | Roboto stack | | font: `font-family: var(--tx-font)` |

Accent presets (`tx.theme.setAccent(fill, day)`): blue `#5a83f3`/`#3a6fe6` (default), classic `#3e88f7`, violet `#8774e1`, cyan `#2fa9c7`, green `#4fae4e`, orange `#e88a35`, pink `#d9608f`.

**Rules for choosing colours**
- Text on `--tx-surface`: `--tx-text`; secondary: `--tx-text-2`. Never put `--tx-text-2` on an accent fill.
- A custom colour needs a day and a night variant. In a theme part: `vars: { dark: {…}, light: {…} }`; in CSS: `:root[data-theme='light'] .x { … }`; in code: `tx.theme.mode()` returns `'dark'|'light'`.
- Contrast ≥ 4.5:1 for text. Text on a photo/wallpaper needs a translucent surface behind it (`background: var(--tx-glass)`), not just a colour.
- Keep the accent as the *one* bright colour. Do not use more than 2–3 hues in one mod.
- A translucent surface = `var(--tx-glass)` + `backdrop-filter: var(--tx-glass-blur)` + `border: 1px solid var(--tx-glass-border)`.

## 4. Skin tokens — restyle the whole app without selectors

When a mod wants a new *look* (glass, neon, paper, flat…), set **skin tokens** instead of writing CSS for dozens of classes. `tx.theme.setSkin(tokens, 'all'|'dark'|'light')`
turns on the layer; every card, bar, menu, dialog and button then reads these tokens. Unset tokens keep the default.

| group | tokens | affects |
|---|---|---|
| card | `--sk-card-bg`, `-border`, `-shadow`, `-filter`, `-radius` | settings groups, post bubbles, profile cards |
| bubble | `--sk-bubble-in`, `--sk-bubble-out`, `--sk-bubble-radius` | message/post bubbles |
| bar | `--sk-bar-bg`, `-border`, `-shadow`, `-filter`, `-radius` | dock, header pills, tabs, search |
| menu | `--sk-menu-bg`, `-border`, `-shadow`, `-filter`, `-radius` | context menu, reactions strip |
| dialog | `--sk-dialog-bg`, `--sk-dialog-radius` | confirm dialogs, sheets |
| button | `--sk-button-bg`, `--sk-button-text`, `--sk-button-radius` | filled buttons |
| chip | `--sk-chip-bg`, `--sk-chip-radius` | reactions, small pills |
| misc | `--sk-highlight` (inner top light), `--sk-overlay` (dim behind dialogs), `--sk-separator`, `--sk-field-bg` | |

Always give **both** modes — a skin that only looks right at night is a bug:
```js
tx.theme.setSkin({ '--sk-card-bg': 'rgba(28,28,32,.55)', '--sk-card-filter': 'blur(18px) saturate(160%)', '--sk-card-border': 'rgba(255,255,255,.08)', '--sk-card-radius': '22px' }, 'dark');
tx.theme.setSkin({ '--sk-card-bg': 'rgba(255,255,255,.62)', '--sk-card-filter': 'blur(18px) saturate(160%)', '--sk-card-border': 'rgba(0,0,0,.06)', '--sk-card-radius': '22px' }, 'light');
```
If a mod has *setting*s that change a token (blur strength, radius, accent), re-apply in `tx.config.on('*', apply)`.

## 5. Choosing the right kind of mod (and why)

| Idea | Kind | Why this and not another |
|---|---|---|
| New colours / wallpaper / look | **theme part** (`vars`, `colorThemes`, `wallpapers`, `skin`) | no code → can't crash; shown in Settings → Chat settings |
| Small live info (clock, weather, counters) | **slot** `topbar` or `post.header` with `html`/`render` | the app positions it; no overlap with the status bar |
| A button that does one thing | **slot** `dock` / `topbar` / `fab` with `icon`, `title`, `run` | consistent look, 40 px target, removed on disable |
| Extra info on every post | `post.footer` / `post.header` / `post.actions` or `ui.onPost` | re-applied for posts loaded later (scrolling) |
| Hide / mark posts | `ui.onPost` + a setting with the words | runs for every post, including new ones |
| Change post text | `ext.addHook('postText', html => …)` | sync, before render; returns the new HTML |
| Own page (notes, stats, list) | `ui.openScreen` (+ a dock or topbar button) or `settings.addPage` | a screen over the app with a back arrow; never inject into other screens |
| Per-mod options | `manifest.settings` | the app renders the controls and persists the values |
| Floating widget | an `html` part — **only** with the safe-area rules of section 1 | last resort |

## 6. Recipes (complete, copy-paste-safe)

All recipes are sectioned `.module` files. Keep your own file in the same shape.

### 6.1 Clock in the top bar (the correct way — no overlap with the status bar)
```
// @manifest {"id":"topbar-clock","name":{"ru":"Часы","en":"Clock","es":"Reloj","pt":"Relógio","uk":"Годинник"},"version":"1.0.0","author":"you","description":{"ru":"Часы в шапке ленты","en":"A clock in the feed header","es":"Un reloj en la cabecera","pt":"Um relógio no cabeçalho","uk":"Годинник у шапці стрічки"},"icon":"🕒","tags":["widget"],"settings":[{"key":"h24","type":"switch","title":{"ru":"24-часовой формат","en":"24-hour format","es":"Formato 24 h","pt":"Formato 24 h","uk":"24-годинний формат"},"default":true}]}
// @part js
export default function (tx) {
  function fmt() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !tx.config.get('h24') });
  }
  tx.ui.add('topbar', {
    id: 'clock',
    html: '<span class="tx-mod-clock" style="font:500 15px var(--tx-font);color:var(--tx-text-2);padding:0 6px"></span>',
    render: function (host) {
      var span = host.querySelector('.tx-mod-clock') || host;
      var tick = function () { span.textContent = fmt(); };
      tick();
      var timer = setInterval(tick, 15000);
      tx.onStop(function () { clearInterval(timer); });
    },
  });
}
```
Why this is right: the slot puts the clock *inside* the 56 px bar that already sits below the status bar, uses theme colours, and stops its timer.

### 6.2 A tool button + a result dialog
```
// @manifest {"id":"post-counter","name":{"ru":"Счётчик постов","en":"Post counter","es":"Contador","pt":"Contador","uk":"Лічильник"},"version":"1.0.0","author":"you","description":{"ru":"Показывает, сколько постов загружено","en":"Shows how many posts are loaded","es":"Muestra cuántas publicaciones hay","pt":"Mostra quantas publicações há","uk":"Показує, скільки дописів завантажено"},"icon":"🔢"}
// @part js
export default function (tx) {
  tx.ui.add('fab', {
    id: 'count', icon: '🔢', title: 'Posts',
    run: function () { tx.toast(String((tx.S.posts || []).length)); },
  });
}
```

### 6.3 Filter: hide posts containing words
```
// @manifest {"id":"word-filter","name":{"ru":"Фильтр слов","en":"Word filter","es":"Filtro","pt":"Filtro","uk":"Фільтр слів"},"version":"1.0.0","author":"you","description":{"ru":"Скрывает посты с заданными словами","en":"Hides posts with chosen words","es":"Oculta publicaciones","pt":"Oculta publicações","uk":"Ховає дописи"},"icon":"🚫","settings":[{"key":"words","type":"text","title":{"ru":"Слова через запятую","en":"Words, comma separated","es":"Palabras","pt":"Palavras","uk":"Слова через кому"},"default":""}]}
// @part js
export default function (tx) {
  function words() {
    return String(tx.config.get('words') || '').toLowerCase().split(',').map(function (w) { return w.trim(); }).filter(Boolean);
  }
  function check(el, post) {
    var text = String((post && (post.text || post.message)) || el.textContent || '').toLowerCase();
    el.style.display = words().some(function (w) { return text.indexOf(w) >= 0; }) ? 'none' : '';
  }
  tx.ui.onPost(check);
  tx.onStop(function () { document.querySelectorAll('.tx-bubble[style*="display: none"]').forEach(function (e) { e.style.display = ''; }); });
}
```

### 6.4 Post footer: reading time
```
// @manifest {"id":"read-time","name":{"ru":"Время чтения","en":"Reading time","es":"Tiempo de lectura","pt":"Tempo de leitura","uk":"Час читання"},"version":"1.0.0","author":"you","description":{"ru":"Время чтения под постом","en":"Reading time under a post","es":"Tiempo de lectura","pt":"Tempo de leitura","uk":"Час читання під дописом"},"icon":"⏱️"}
// @part js
export default function (tx) {
  tx.ui.add('post.footer', {
    id: 'rt',
    render: function (el, ctx) {
      var words = String((ctx.post && ctx.post.text) || '').split(/\s+/).filter(Boolean).length;
      if (words < 40) { el.style.display = 'none'; return; }
      el.style.cssText = 'font-size:12px;color:var(--tx-hint);padding:2px 0';
      el.textContent = '⏱ ' + Math.max(1, Math.round(words / 200)) + ' min';
    },
  });
}
```

### 6.5 Own page with saved data (notebook)
```
// @manifest {"id":"notebook","name":{"ru":"Блокнот","en":"Notebook","es":"Cuaderno","pt":"Caderno","uk":"Блокнот"},"version":"1.0.0","author":"you","description":{"ru":"Заметки в приложении","en":"Notes inside the app","es":"Notas","pt":"Notas","uk":"Нотатки"},"icon":"📝"}
// @part js
export default function (tx) {
  tx.ui.addDockItem({
    id: 'notes', title: 'Notes', icon: '📝',
    run: function () {
      tx.ui.openScreen({
        title: 'Notes',
        render: function (box) {
          box.innerHTML = '<textarea class="tx-mod-notes" style="width:100%;min-height:50vh;box-sizing:border-box;padding:14px;border-radius:16px;border:1px solid var(--tx-separator);background:var(--tx-surface);color:var(--tx-text);font:16px var(--tx-font);resize:vertical"></textarea>';
          var ta = box.querySelector('textarea');
          ta.value = tx.storage.get('text') || '';
          ta.addEventListener('input', function () { tx.storage.set('text', ta.value); });
        },
      });
    },
  });
}
```

### 6.6 Theme with skin (glass look, day + night)
```
// @manifest {"id":"my-glass","name":{"ru":"Стекло","en":"Glass","es":"Cristal","pt":"Vidro","uk":"Скло"},"version":"1.0.0","author":"you","description":{"ru":"Полупрозрачные карточки","en":"Translucent cards","es":"Tarjetas translúcidas","pt":"Cartões translúcidos","uk":"Напівпрозорі картки"},"icon":"🪟","tags":["theme"]}
// @part theme
{ "skin": {
    "dark":  { "--sk-card-bg": "rgba(28,28,32,.55)", "--sk-card-filter": "blur(18px) saturate(160%)", "--sk-card-border": "rgba(255,255,255,.08)", "--sk-bar-bg": "rgba(30,30,34,.6)" },
    "light": { "--sk-card-bg": "rgba(255,255,255,.62)", "--sk-card-filter": "blur(18px) saturate(160%)", "--sk-card-border": "rgba(0,0,0,.06)", "--sk-bar-bg": "rgba(255,255,255,.7)" }
  } }
```

### 6.7 A floating widget, only if a slot does not fit (safe-area aware)
```
// @manifest {"id":"float-note","name":"Floating note","version":"1.0.0","author":"you","description":"A small note card above the dock","icon":"📌"}
// @part html
<div class="tx-mod-float" style="position:fixed;z-index:35;left:12px;bottom:calc(var(--tx-dock-h) + 24px + var(--tx-safe-bottom));max-width:60vw;padding:8px 12px;border-radius:14px;background:var(--tx-glass);border:1px solid var(--tx-glass-border);backdrop-filter:var(--tx-glass-blur);color:var(--tx-text);font:14px var(--tx-font);pointer-events:none">Hello</div>
```
Note `bottom` includes the dock and the gesture inset, `pointer-events:none` lets taps through, theme colours, small size.

## 7. Pitfalls we have seen (do NOT repeat)

- **Clock stuck over the status bar**: `position:fixed; top:8px; right:8px` → under/over the OS status bar. Use slot `topbar`, or `top: calc(var(--tx-safe-top) + 64px)`.
- **Header "dimmed"**: a full-width `position:fixed; top:0` gradient/overlay laid over the header. Never overlay the top bar; use the `--sk-bar-*` tokens to change its look.
- **Everything unreadable in day mode**: hard-coded `color:#fff`. Use `var(--tx-text)`.
- **Dock disappears / jumps**: `transform`, `filter`, `perspective` or `will-change: transform` set on `#app`, `.tx-screen` or `body`. Do not.
- **Mod works once, then vanishes**: the app re-renders; a one-off `document.querySelector(...).append(...)` is lost. Use `tx.ui.add`, `tx.ui.watch`, `tx.ui.onPost`.
- **Code breaks after copying from chat**: backtick template literals and `${}` get mangled. Use `'a' + b`. Put the whole file in ONE code block.
- **Mod slows the feed**: work per post must be O(1); no `querySelectorAll('*')`, no layout reads in loops, no network call per post.
- **`display:flex` on `.tx-hidden`** etc.: do not override `.tx-hidden`, `.hidden`, `[hidden]`.

## 8. Self-review checklist (do it before answering)

1. Every element I add is inside a slot, or is `position:fixed` with safe-area maths and `z-index ≤ 45`, small, and does not cover the title bar, status bar or dock.
2. No selector without a `.tx-mod-…` prefix or an exact app class; no `*`, no bare tags.
3. All colours are `var(--tx-…)`/`var(--sk-…)`, or have a day and a night variant.
4. Timers/listeners are cleaned in `tx.onStop`.
5. Errors are caught; no use of undocumented `tx` methods.
6. Manifest is complete (5 languages, icon, version, description); the file is valid (JSON parses / JS module has `export default function (tx)`).
7. The whole answer is ONE code block; no template literals.
8. Imagine the user installs it on a phone at 360 px width in day mode: is anything covered, cut off or invisible? If unsure, use a slot.
