# TeleX mods — brief for AI agents

> **NO EMOJI. Ever.** Not in names, descriptions, buttons, toasts, dialogs, empty states, `icon` fields or code comments shown to the user. TeleX looks like Telegram: use the app's **icon font** (`<i class="icon icon-send"></i>`, names such as `ai`, `language`, `copy`, `favorite`, `favorite-filled`, `warning`, `tools`, `key-filled`, `more`, `close`, `settings`, `article`, `stars-filled`, `darkmode`, `brush`, `info-filled`, `check-bold`) or inline SVG with `currentColor`. The manifest `icon` is an icon-font name (e.g. `"icon": "ai"`), a 96×96 SVG (`data:image/svg+xml;base64,…`) or an https image — never an emoji.

Goal: you are asked to "make a mod/theme/widget for TeleX". Produce **one file with the extension `.module`** that the user installs in
*Settings → Mods* (file, link or pasted text). No build step, no dependencies, no sandbox: the file runs inside the web app with full access.

## Where to put what (pick the slot, do not guess selectors)

| The user wants… | Use |
|---|---|
| a button in the **bottom bar** (the dock) | `tx.ui.add('dock', { id, icon, title, run })` |
| a button in the **top bar of the feed** (next to the TeleX title / menu) | `tx.ui.add('topbar', { id, icon, title, run })` |
| something **inside the search field** (filter, voice…) | `tx.ui.add('search', { id, icon, run })` |
| an **extra feed tab** (All · Media · Popular · Favorites · **Yours**) | `tx.ui.add('tabs', { id, title, run })` |
| a round **floating button** | `tx.ui.add('fab', { id, icon, run })` |
| a **badge by the channel name** on every post | `tx.ui.add('post.header', { id, html })` |
| a **block under the post text** (stats, translate, notes) | `tx.ui.add('post.footer', { id, render(el, { post }) {…} })` |
| a block **right before/after the post text** (`position: 'start'` = before) | `tx.ui.add('post.text', { id, render(el, { post }) {…} })` |
| a **button beside the share button** of a post | `tx.ui.add('post.actions', { id, icon, run({ post }) {…} })` |
| an item in the **post's context menu** | `tx.ext.addMenu('post', ({ post }) => [{ label, icon, run, checked?: bool \| ({post}) => bool, items?: [submenu…] }])` — `checked` shows a tick, `items` opens a submenu with a Back row |
| a row or a whole page in **Settings** | `tx.settings.addRow(...)` / `tx.settings.addPage(...)` |
| a **full screen** of its own (opened from any button) | `tx.ui.openScreen({ title, render(box) })` |
| to change **text of posts** | `tx.ext.addHook('postText', (html) => html)` |
| to **react to every post** (hide, mark, count) | `tx.ui.onPost((el, post) => …)` |
| to change the **whole look** | `tx.theme.setSkin(...)`, `tx.theme.setAccent(...)`, `tx.theme.addCss(...)` |
| a **floating widget** on top of the app | an `html` part (position: fixed) |

`ui.add` spec: `{ id, title?, icon?, run?, html?, el?, render?(host, ctx), position?: 'start'|'end' }`. `icon` is an icon-font name (preferred) or an SVG string — never an emoji.
Buttons are built from `icon`/`title`/`run`; `html`/`render` give you the whole element. Every slot is removed automatically when the mod is turned off.

### AI inside a mod (`tx.ai`, free, uses the user's own Groq key)

TeleX has a built-in AI. A mod can use it **without its own API key**: declare `"permissions": ["ai"]` in the manifest and call `tx.ai`.
The user adds a free Groq key once (Settings → Groq key); the install dialog tells them that the mod uses AI.

- `tx.ai.available()` → `true` when the manifest has the permission **and** a key is saved. Check it before calling and show a hint (`Settings → Groq key`) otherwise.
- `await tx.ai.stream(messages, { system?, maxTokens?, temperature?, signal? }, (textSoFar) => …)` → full text — the answer appears as it is written (use it in chats/translators, with an `AbortController` for Stop).
- `await tx.ai.ask('prompt', { system?, json?, maxTokens?, temperature? })` → string
- `await tx.ai.chat([{ role: 'user'|'assistant', content }], { system?, json?, maxTokens?, temperature? })` → string (an object when `json: true`)
- `tx.lang()` → `'ru'|'en'|'es'|'pt'|'uk'` — tell the model which language to answer in.
- Limits: ≤ 12 requests per minute per mod, ≤ 12 000 characters per message, ≤ 2 000 output tokens, last 24 messages. The model is small and fast (a Groq free-plan model): give short, concrete instructions, ask for a short answer, never send secrets.
- Errors are thrown (`e.message` is user-readable; `e.code` is `'no-key' | 'limit' | 'key'`) — always `.catch` and show the message.
- A mod may also call any other AI with **its own** key: add a `settings` field `{ "key": "apiKey", "type": "text" }` and `fetch` it yourself — but prefer `tx.ai`.

Kinds that fit: a chat screen (`ui.addDockItem` + `ui.openScreen`), a "translate / summarise / explain" button on a post (`post.actions` → `ask(post.text)`), a post classifier or tone filter (`ui.onPost` + `json: true`, remember results in `tx.storage`, never one request per scrolled post), a writing helper. Full examples: `app/static/mods/ai-chat.module`, `ai-translate.module`.

```
// @manifest {"id":"ai-explain","name":"Explain","version":"1.0.0","icon":"lamp","description":"Explains a post in simple words","permissions":["ai"]}
// @part js
export default function (tx) {
  tx.ui.add('post.actions', { id: 'explain', icon: 'lamp', title: 'Explain', run: function (ctx) {
    if (!tx.ai.available()) { tx.toast('Settings → Groq key'); return; }
    tx.ai.ask(String(ctx.post && ctx.post.text || '').slice(0, 4000), { system: 'Explain the text in two simple sentences.', maxTokens: 300 })
      .then(function (a) { tx.ui.openScreen({ title: 'Explain', render: function (b) { b.textContent = a; } }); })
      .catch(function (e) { tx.toast(e.message); });
  } });
}
```

### Kinds of mods (pick one, mix if needed)

1. **Theme** — `theme` part: colours, wallpapers, `skin` tokens. No code.
2. **Widget** — a small live element (clock, weather, counter): `ui.add('topbar', { html })` or an `html` part, refresh with `setInterval`, clear it in `tx.onStop`.
3. **Tool button** — an icon that does one thing (`dock`/`topbar`/`fab`) and shows the result with `tx.toast` or `tx.ui.openScreen`.
4. **Post enhancer** — `post.header`/`post.footer`/`post.actions`, or `ui.onPost` + `postText` (translate, reading time, link previews, notes).
5. **Filter** — `ui.onPost((el, post) => { if (…) el.style.display = 'none'; })` with settings for the words/channels to hide.
6. **AI tool** — `permissions: ["ai"]` + `tx.ai.ask/chat` (chat, translator, summariser, classifier).
7. **Own page** — `ui.openScreen` or `settings.addPage` (statistics, lists, a notebook stored in `tx.storage`).

## Output contract

1. Write exactly one file, `<id>.module`, UTF-8 text. Do not wrap it in markdown fences when saving it to a file.
2. It must contain a **manifest** and one or more **parts**. Two accepted shapes:

**A. JSON bundle** (use this for anything with more than one part):
```json
{
  "manifest": {
    "id": "my-mod",                 // required: [a-z0-9][a-z0-9._-]{1,40}
    "name": "My mod",               // required
    "version": "1.0.0", "author": "me",
    "description": "one line shown on the card",
    "about": "longer text\nshown on the mod page",
    "icon": "tools",                 // icon-font name (or an SVG data URL / https image); NEVER an emoji
    "preview": ["https://…/shot.png"],   // optional; https:// or data:image/…; a theme gets an auto preview
    "tags": ["theme"],
    "permissions": [],              // [] | ["ai"] — "ai" unlocks tx.ai (the user's Groq key)
    "settings": [ { "key": "size", "type": "number", "title": "Size", "default": 16, "min": 10, "max": 30 } ]
  },
  "parts": [
    { "type": "theme", "data": { } },
    { "type": "css",   "code": "…" },
    { "type": "html",  "code": "<div>…</div><script>const tx = TeleXMods['my-mod']; …</script>" },
    { "type": "js",    "code": "export default function (tx) { … }" },
    { "type": "json",  "name": "table", "data": { } }
  ]
}
```
**B. Single annotated source** — first line is a comment holding `@manifest {one-line json}`, the rest is the body:
`// @manifest {…}` + JS module · `<!-- @manifest {…} -->` + HTML · `/* @manifest {…} */` + JSON theme. Body starting with `<` = HTML,
JSON with `vars|colorThemes|wallpapers|css` = theme, anything else = JS module (must `export default function (tx)`).

**C. One big file with sections** (best for an AI: one paste, many parts). After the `@manifest` line, start every part with a comment line
`@part js|css|html|theme|json|text [name]` — e.g. `// @part css`, `/* @part js */`, `<!-- @part html -->`, `// @part theme` (JSON), `// @part json table`:
```
// @manifest {"id":"my-mod","name":{"ru":"…","en":"…"},"version":"1.0.0","description":{…}}
// @part css
.tx-dock { border-radius: 14px; }
// @part js
export default function (tx) { /* … */ }
```

Limits: total ≤ 1.5 MB. A mod made only of `theme`/`css` parts executes no code (the user gets a lighter confirmation).

## Languages and icon (do this for every mod you publish)

Any manifest text (`name`, `description`, `about`, settings `title`/`sub`, `options` labels) may be a string **or** `{ "ru": "…", "en": "…", "es": "…", "pt": "…", "uk": "…" }`.
Provide all five when the mod is meant for others; the app picks its language, then English. In code use `tx.L({ ru: '…', en: '…', … })`.
`icon`: an icon-font name, or an image — `data:image/svg+xml;base64,…` / `https://…` / `mods/icons/<id>.svg` (official mods). Prefer a 96×96 SVG:
rounded square `rx=22` with a two-colour gradient and a white stroke glyph (see `app/static/mods/icons/*.svg`).

## Restyling the whole app (skin tokens)

`tx.theme.setSkin({ '--sk-card-bg': '…', … }, 'all'|'dark'|'light')` (or a theme part `"skin": { "dark": {…}, "light": {…} }`) turns on the skin layer
(`app/static/css/tx/skin.css`): every main surface is then drawn from tokens — `--sk-card-{bg,border,shadow,filter,radius}`, `--sk-bubble-{in,out,radius}`,
`--sk-bar-{bg,border,shadow,filter,radius}` (dock, pills, tabs, search), `--sk-menu-{bg,border,shadow,filter,radius}`, `--sk-dialog-{bg,radius}`,
`--sk-button-{bg,text,radius}`, `--sk-chip-{bg,radius}`, `--sk-highlight`, `--sk-overlay`, `--sk-separator`, `--sk-field-bg`. Set both day and night.
Accent of the whole app: `tx.theme.setAccent(hex, dayHex?)`. For anything the tokens do not reach, add CSS (`tx.theme.addCss`) using the classes listed in `docs/mods.md`.
New UI: `tx.ui.openScreen({ title, render(box) })`, `tx.ui.addDockItem({ id, title, icon, run })`, `tx.settings.addPage`, `tx.ui.onPost((el, post) => …)`, `tx.app.*` (navigation).
Official catalog: `app/static/mods/catalog.json` + `<id>.module` + `icons/<id>.svg`; bump `version` and installed copies update themselves.

## Settings schema (`manifest.settings[]`)

`{ key, type, title, sub?, default, … }` with `type`: `switch` (bool) · `number` (`min`,`max`,`step`) · `select` (`options`: `["a","b"]` or `[["value","Label"]]`) ·
`color` (`#rrggbb`) · `text`. The mod page renders the controls. Read with `tx.config.get(key)`; react with `tx.config.on(key | '*', fn)`;
for a custom block use `tx.config.render((box) => { box.innerHTML = '…' })`.

## Theme part

```json
{ "vars":  { "all": {}, "dark": { "--tx-bg": "#000" }, "light": { "--tx-bg": "#f0f0f5" } },
  "css": "…",
  "wallpapers":  [ { "id": "dusk", "name": "Dusk", "kind": "fill", "colors": ["#3a1c4a", "#e0643a"], "rotation": 45, "intensity": 0 } ],
  "colorThemes": [ { "id": "sunset", "emoji": "🌇", "accent": "orange",
                     "out": { "dark": ["#cf4339", "#e08a35"], "light": ["#e0483f", "#f09a3a"] },
                     "wallpapers": { "dark": { "kind": "fill", "colors": ["#2a1030", "#8a3a2a"] }, "light": { "kind": "fill", "colors": ["#ffd9b8", "#ffb48a"] } } } ],
  "apply": "sunset" }
```
Wallpaper: `kind` `fill` | `pattern` (`url` to an svg); 1–4 `colors`; `rotation` degrees (2 colours); `intensity` negative = dark background (pattern lit by the colours).
`accent`: `blue|violet|orange|cyan|green|pink|…` (names in `app/static/js/core/prefs.js` `ACCENTS`). CSS variables: see `app/static/css/tx/tokens.css`.

## More API (read this before hacking the DOM)

| Need | Use |
|---|---|
| a post is **laid out** (measure heights, collapse) | `tx.ui.onPostRendered((el, post, { height }) => …)` — fires two frames after the card is in the DOM; `tx.ui.onPost` fires immediately |
| the **text element** of every post | `tx.ui.onPostText((textEl, post, card) => …)` (class `post-text`) or slot `post.text` — for collapse, highlight, translate, table of contents |
| **theme changes** / colours for a canvas | `tx.theme.on('change', (palette) => …)` and `tx.theme.palette()` → `{ mode, bg, surface, surface2, text, textSecondary, accent, accentFill, glass, separator, red, green }` — never poll `data-theme` |
| a **toast with an action** (Undo) | `tx.toast('Hidden', { action: 'Undo', run: () => … })` (stays ~5.5 s) |
| **keyboard shortcuts** | `tx.keys.add('mod+shift+c', (e) => …)` — removed with the mod; plain keys never fire while the user types |
| **weather / particles / any full-screen animation** | `tx.ambient.add({ id, draw(ctx, w, h, dtMs, palette) {…} })` — ONE shared canvas under the app (z-index 2, no clicks) and ONE ≤ 30 fps loop for all mods; cleared for you; off in power-saving mode. **Never create your own full-screen canvas or `requestAnimationFrame` loop.** |
| a **full-screen page with a Telegram-like header** | `tx.ui.openScreen({ title, subtitle?, avatar?: svgOrImgHtml, actions?: [{ icon, title, run }], chat?: true, render(box, { footer, setSubtitle, close, el }) {…} })` — `chat: true` gives a chat layout: wallpaper background, scrolling `box`, a pinned `footer` for the composer; `setSubtitle('typing…')` updates the line under the title |
| emoji that arrive inside **user content** (AI answers, post text) | `tx.emoji.html(escapedHtml)` renders them as Apple images. Do not put emoji in your own UI |
| **media of a post** | `tx.media.of(post)` → `[{ type, url, thumb, duration, size }]`, `tx.media.urls(post)` → `[url]` — never scrape the DOM |
| a **list of channels** in settings | setting `{ "key": "quiet", "type": "channels", "title": "…" }` → array of channel ids (strings); `{ "type": "select", "optionsFrom": "channels" }` → one id. Channels are in `tx.S.channels` (`id`, `title`) |
| mods that **cannot work together** | manifest `"conflicts": ["other-mod-id"]` — the install dialog warns the user (check both mods: declare it in the newer one) |
| a **ready-made set** of mods (official catalog) | `presets` in `app/static/mods/catalog.json`: `{ id, icon, name{}, description{}, mods: [ids] }` — one button installs all |

## Code API — `tx` (argument of `export default function (tx)`; in html parts: `TeleXMods['<id>']`)

- `tx.theme.setVars(vars, 'all'|'dark'|'light')`, `.addCss(css)`, `.addColorTheme(t)`, `.addWallpaper(w)`, `.setWallpaper(id)`, `.select(themeId)`, `.mode()`
- `tx.ui.watch(selector, el => …)` — run for existing and future elements (MutationObserver); `tx.ui.inject(selector, html, where='beforeend')`; `tx.ui.root()`
- `tx.ext.addMenu('post', ({post}) => [{label, icon, run}])` — item in the post menu · `tx.ext.addMenu('settings', …)` — rows in settings
- `tx.ext.addHook('postText', (html, ctx) => html)` — sync rewrite of every post's HTML · `tx.ext.on('view', name => …)`
- `tx.settings.addRow({title, sub, icon, color, run})` · `tx.settings.addPage({id, title, sub, icon, render(box)})`
- `tx.config` (own settings) · `tx.storage.get/set` · `tx.data[name]` (json/text parts)
- `tx.S` — app state: `S.posts`, `S.channels`, `S.user`, … · `tx.api` — all Telegram calls (see `app/static/js/api.js`) · `tx.t`, `tx.toast(msg)`, `tx.confirm(text, okLabel)`, `tx.escapeHtml`

`tx.onStop(fn)` registers your own cleanup (timers, nodes). Everything registered through `tx` is removed when the mod is disabled/deleted. Things you create *outside* `tx` (timers, global listeners,
`document.body` nodes) are your responsibility — for HTML parts the root `<div class="tx-mod-root">` is removed automatically, timers are not.

## How to build any UI change

1. Find the markup you want to change in `app/static/js/**` (templates are template-literals) and the styles in `app/static/css/tx/*.css`.
   Class prefix `tx-`; screens: `#screen-wall`, `#screen-settings`, `#screen-profile`, `#screen-thread`, `#screen-channel`; dock `.tx-dock`.
2. Restyle with `css`/`vars` parts (no code). Add behaviour with `tx.ui.watch(selector, fn)`. Add markup with `tx.ui.inject`.
3. The UI re-renders often — never rely on a node surviving; use `watch`, not a one-off `querySelector`.
4. Use theme variables (`var(--tx-accent)`, `var(--tx-surface)`, `var(--tx-text)`) so the mod works in day and night mode.

## Checklist before you hand the file over

- `id` valid and unique; `name`, `version`, `description` filled; `about` explains how to use it.
- Works in light and dark theme; no hard-coded fonts; touch targets ≥ 40 px (it also runs on phones).
- Settings declared in `manifest.settings` with sane defaults; code reads them via `tx.config`, never assumes a value.
- No network calls to unknown hosts; no secrets; no use of `tx.api` beyond what the mod needs (the user's account is at stake).
- Valid JSON (bundle shape) — validate with `node -e "JSON.parse(require('fs').readFileSync('x.module','utf8'))"`.
- Test: serve `app/static` (`python3 -m http.server 8801 --directory app/static`), open `index.html?fake=1`, Settings → Mods → paste the file.

Working examples: `mods-examples/sunset-theme.module` (JSON bundle, theme) · `clock-widget.module` (HTML + settings) · `copy-post-link.module` (JS + menus).
Full human documentation: `docs/mods.md`.
