# Моды TeleX

Мод — расширение, которое работает внутри приложения с **полным доступом** к его API (песочницы нет сознательно).
Поэтому установщик показывает предупреждение, а поле `manifest.verified` зарезервировано под будущую проверку модов.
Моды ставятся в **Настройки → Моды** (или из «Настроек чатов» → «Моды тем»): из файла `.module`, по ссылке `https://…` или вставкой текста.

## Файл `.module`

Мод — файл с расширением **`.module`**. Это обычный текст, внутри может быть что угодно: HTML, JS, CSS, тема, JSON-данные.
Поддерживаются две формы.

**1. JSON-пакет** — несколько частей в одном файле:

```json
{
  "manifest": { "id": "my-mod", "name": "Мой мод", "version": "1.0.0", "author": "me",
                "description": "коротко", "about": "подробно\nв несколько строк",
                "icon": "🕒", "preview": ["https://…/1.png", "data:image/png;base64,…"], "tags": ["theme"],
                "settings": [ { "key": "seconds", "type": "switch", "title": "Секунды", "default": false } ] },
  "parts": [
    { "type": "theme", "data": { … } },
    { "type": "css",   "code": "…" },
    { "type": "html",  "code": "<div>…</div><script>…</script>" },
    { "type": "js",    "code": "export default function (tx) { … }" },
    { "type": "json",  "name": "table", "data": { … } }
  ]
}
```

**2. Один исходник с аннотацией** — первая строка-комментарий с `@manifest {json}`, остальное — тело. Тело, начинающееся с `<`, —
HTML (скрипты внутри выполняются), JSON с ключами темы — тема, иначе — JS-модуль. Примеры: `// @manifest {…}`, `<!-- @manifest {…} -->`.

`id` — латиница/цифры/`._-`, 2–41 символ. Размер — до 1,5 МБ. Мод только из `theme`/`css` не исполняет код, поэтому ставится без предупреждения о полном доступе.

### Языки

Любой текст манифеста — `name`, `description`, `about`, `title`/`sub`/подписи `options` в настройках — можно задать либо строкой,
либо по языкам: `{ "ru": "…", "en": "…", "es": "…", "pt": "…", "uk": "…" }`. Берётся язык приложения, иначе английский.
В коде: `tx.L({ ru: '…', en: '…' })`. Официальные моды переведены на все 5 языков.

### Иконка

`icon` — эмодзи **или** картинка: `data:image/svg+xml;base64,…`, `https://…` либо путь внутри приложения (`mods/icons/<id>.svg` у официальных).
Лучше SVG 96×96 со скруглённым квадратом и градиентом — как у официальных модов (`app/static/mods/icons/`).

### Карточка и страница мода

`description` — короткое описание на карточке, `about` — подробное (на странице мода), `preview` — картинка или список картинок
(`https://` или `data:image/…`; без них рисуется превью темы или `icon` на градиенте), `tags`, `author`, `version`.

### Настройки мода

`manifest.settings` — схема: `{ key, type: "switch" | "text" | "number" | "select" | "color", title, sub?, default, min?, max?, options? }`.
Страница мода рисует для них элементы сама. В коде: `tx.config.get(key)`, `tx.config.set(key, v)`, `tx.config.on(key | '*', fn)`;
для собственного блока на странице — `tx.config.render((box) => { … })`. В HTML-частях объект доступен как `TeleXMods['<id>']`.

## Тема (`theme`-часть)

| поле | что делает |
|---|---|
| `vars` | CSS-переменные: `{ "all": {}, "dark": {}, "light": {} }`, например `--tx-bg`, `--tx-accent`, `--tx-bubble-out`, `--tx-surface`, `--tx-text` (список — `app/static/css/tx/tokens.css`) |
| `css` | произвольный CSS |
| `wallpapers[]` | обои в выбор: `{ id, name, kind: "fill" \| "pattern", colors: ["#rrggbb"…], rotation, intensity, url? }` (как у обоев Telegram: 1–4 цвета; `intensity < 0` — тёмный фон; `url` паттерна — svg) |
| `colorThemes[]` | цветовая тема в карусели «Настроек чатов»: `{ id, emoji, accent?, out: { dark: [цвета], light: [цвета] }, wallpapers: { dark, light } }` — у темы свои обои для дня и ночи |
| `apply` | id цветовой темы, которую выбрать сразу после установки |

## API кода (`tx`)

`export default function (tx) { … }` (в HTML-частях — `TeleXMods['<id>']`).

| что | зачем |
|---|---|
| `tx.theme` | `setVars(vars, mode)`, `addCss(css)`, `addColorTheme(theme)`, `addWallpaper(wp)`, `setWallpaper(id)`, `select(themeId)`, `mode()` |
| `tx.ui` | `watch(selector, fn)` — fn(el) для существующих и будущих элементов; `inject(selector, html, where)` — вставить разметку в любой экран; `root()` |
| `tx.ext` | `addMenu(point, provider)`, `addHook(name, fn)`, `on(event, fn)` — см. «Точки расширения» |
| `tx.settings` | `addRow({ title, sub, icon, color, run })`, `addPage({ id, title, sub, icon, render(box) })` — свой экран в настройках |
| `tx.config` | настройки мода: `get`, `set`, `on(key \| '*', fn)`, `render(fn(box))` |
| `tx.storage` | `get(k)`, `set(k, v)` — произвольные данные мода |
| `tx.onStop(fn)` | своя очистка (таймеры, узлы) при выключении мода |
| `tx.data` | части `json`/`text` из пакета, по `name` |
| `tx.S`, `tx.api` | состояние приложения (`S.posts`, `S.channels`, `S.user`) и весь доступ к Telegram |
| `tx.t`, `tx.toast`, `tx.confirm`, `tx.escapeHtml` | перевод, всплывашка, диалог, экранирование |

### Точки расширения (`tx.ext`)

- меню `post` — пункты меню поста: провайдер получает `{ post }` и возвращает `[{ label, icon, run }]`;
- меню `settings` — строки на экране настроек;
- хук `postText` (синхронный) — готовый HTML текста поста → HTML;
- события `view` (сменился экран).

Так как это веб-приложение, мод может и **напрямую менять DOM** любого экрана (`tx.ui.watch`) — это и есть «внедрить что угодно».
Всё, что мод добавил (стили, переменные, темы, обои, меню, наблюдатели, HTML, вставки), снимается при выключении или удалении.

Примеры — [`mods-examples/`](../mods-examples). Для нейросетей — [`docs/mods-for-agents.md`](mods-for-agents.md).
