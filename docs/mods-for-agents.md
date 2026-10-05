# TeleX mods — brief for AI agents

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
| a **button beside the share button** of a post | `tx.ui.add('post.actions', { id, icon, run({ post }) {…} })` |
| an item in the **post's context menu** | `tx.ext.addMenu('post', ({ post }) => [{ label, icon, run }])` |
| a row or a whole page in **Settings** | `tx.settings.addRow(...)` / `tx.settings.addPage(...)` |
| a **full screen** of its own (opened from any button) | `tx.ui.openScreen({ title, render(box) })` |
| to change **text of posts** | `tx.ext.addHook('postText', (html) => html)` |
| to **react to every post** (hide, mark, count) | `tx.ui.onPost((el, post) => …)` |
| to change the **whole look** | `tx.theme.setSkin(...)`, `tx.theme.setAccent(...)`, `tx.theme.addCss(...)` |
| a **floating widget** on top of the app | an `html` part (position: fixed) |

`ui.add` spec: `{ id, title?, icon?, run?, html?, el?, render?(host, ctx), position?: 'start'|'end' }`. `icon` is an emoji, an SVG string or an icon name.
Buttons are built from `icon`/`title`/`run`; `html`/`render` give you the whole element. Every slot is removed automatically when the mod is turned off.

### Kinds of mods (pick one, mix if needed)

1. **Theme** — `theme` part: colours, wallpapers, `skin` tokens. No code.
2. **Widget** — a small live element (clock, weather, counter): `ui.add('topbar', { html })` or an `html` part, refresh with `setInterval`, clear it in `tx.onStop`.
3. **Tool button** — an icon that does one thing (`dock`/`topbar`/`fab`) and shows the result with `tx.toast` or `tx.ui.openScreen`.
4. **Post enhancer** — `post.header`/`post.footer`/`post.actions`, or `ui.onPost` + `postText` (translate, reading time, link previews, notes).
5. **Filter** — `ui.onPost((el, post) => { if (…) el.style.display = 'none'; })` with settings for the words/channels to hide.
6. **Own page** — `ui.openScreen` or `settings.addPage` (statistics, lists, a notebook stored in `tx.storage`).

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
    "icon": "🧩",                    // emoji (card icon when there is no preview)
    "preview": ["https://…/shot.png"],   // optional; https:// or data:image/…; a theme gets an auto preview
    "tags": ["theme"],
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
`icon`: an emoji, or an image — `data:image/svg+xml;base64,…` / `https://…` / `mods/icons/<id>.svg` (official mods). Prefer a 96×96 SVG:
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
