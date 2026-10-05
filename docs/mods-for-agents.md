# TeleX mods — brief for AI agents

Goal: you are asked to "make a mod/theme/widget for TeleX". Produce **one file with the extension `.module`** that the user installs in
*Settings → Mods* (file, link or pasted text). No build step, no dependencies, no sandbox: the file runs inside the web app with full access.

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

Limits: total ≤ 1.5 MB. A mod made only of `theme`/`css` parts executes no code (the user gets a lighter confirmation).

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
