# Моды TeleX

Мод — расширение, которое работает внутри приложения с **полным доступом** к его API (песочницы нет сознательно).
Поэтому установщик показывает предупреждение, а поле `manifest.verified` зарезервировано под будущую проверку модов.
Моды ставятся в **Настройки → Моды** (или из «Настроек чатов» → «Моды тем»): из файла, по ссылке `https://…` или вставкой JSON.

## Формат

Файл `.json` — пакет `{ manifest, theme?, code? }`, либо `.js` — ES-модуль, у которого первой строкой стоит
`// @manifest {…json…}`.

```json
{
  "manifest": { "id": "my-mod", "name": "Мой мод", "version": "1.0.0", "author": "me", "description": "…", "permissions": ["menu"] },
  "theme": { … },
  "code": "export default function (tx) { … }"
}
```

`id` — латиница/цифры/`._-`, 2–41 символ. Код — до 500 КБ. Мод только с `theme` не исполняет код, поэтому ставится без предупреждения о полном доступе.

## Тема без кода (`theme`)

| поле | что делает |
|---|---|
| `vars` | CSS-переменные: `{ "all": {}, "dark": {}, "light": {} }`, например `--tx-bg`, `--tx-accent`, `--tx-bubble-out` |
| `css` | произвольный CSS |
| `wallpapers[]` | обои в выбор: `{ id, name, kind: "fill" \| "pattern", colors: ["#rrggbb"…], rotation, intensity, url? }` (как у обоев Telegram: 1–4 цвета, интенсивность < 0 — тёмный фон, `url` паттерна — svg) |
| `colorThemes[]` | цветовая тема в карусели «Настроек чатов»: `{ id, emoji, accent?, out: { dark: [цвета], light: [цвета] }, wallpapers: { dark, light } }` — у каждой темы свои обои для дня и ночи |
| `apply` | id цветовой темы, которую выбрать сразу после установки |

## Код (`tx`)

`export default function (tx) { … }` получает:

- `tx.theme` — `setVars(vars, mode)`, `addCss(css)`, `addColorTheme(theme)`, `addWallpaper(wp)`, `setWallpaper(id)`, `select(themeId)`.
- `tx.ext` — `addMenu(point, provider)`, `addHook(name, fn)`, `on(event, fn)`. Точки меню: `post` (меню поста, `{ post }`) и `settings` (строки на экране настроек). События: `view`.
- `tx.settings.addRow({ title, sub, icon, color, run })` — строка в настройках.
- `tx.S` (состояние: `S.posts`, `S.channels`, `S.user`), `tx.api` (весь доступ к Telegram), `tx.t`, `tx.toast`, `tx.confirm`, `tx.escapeHtml`, `tx.storage.get/set`.

Всё, что мод добавил (стили, переменные, темы, обои, меню), снимается при отключении или удалении мода.
Примеры — папка [`mods-examples/`](../mods-examples).
