# Архитектура

Короткая версия в [AGENT.md](../AGENT.md); здесь подробности.

## Общая картина
```
Страница                                         Web Worker (по умолчанию)
┌────────────────────────────┐   postMessage     ┌──────────────────────────────┐
│ js/ui/* (интерфейс)        │ ─────────────────►│ js/tg-worker.js              │
│ js/tg.js → telegram-remote │  (JSON / clone)   │   js/telegram.js (GramJS)    │
│ js/media.js (загрузки)     │◄───────────────── │   js/telegram-chat.js (чаты) │
└───────────┬────────────────┘                   └──────────────────────────────┘
            │ MessageChannel
┌───────────▼────────────────┐
│ sw.js (Service Worker)     │  отдаёт media/<тип>/<ключ>/<id>, кэширует, Range-стриминг видео
└────────────────────────────┘
```
Сервера нет. Сессия Telegram — в `localStorage` пользователя.

## Интерфейс (`js/ui/`)
- `app.js` — запуск: тема, язык, обои, вход (`components/authModal.js`), вкладки, живые события, моды.
- `store.js` — общее состояние `S`, шина событий `on/emit`, время и статусы, `showMenu`, `confirmBox`, `toast`.
- `list.js` — «Чаты»: папки, архив, поиск, строки диалогов, выбор чата для пересылки.
- `conv.js` — переписка: шапка, закреп, пузыри, композер, выбор сообщений, поиск по чату, меню, обои и тема чата.
- `profile.js` — профиль: фото, действия, данные, вкладки общих медиа, меню «⋮».
- `pages.js` — «Контакты», «Настройки», «Профиль».
- `panel.js` — панель эмодзи/GIF/стикеров.
- `icons.js` — оригинальные иконки Telegram (маски `.ic`) и запасные SVG.
- `ext.js`, `mods.js` — точки расширения и загрузчик модов.
- `fake.js` — демо-сервис для `?fake=1`.

## Движок Telegram
Все вызовы идут через объект `telegram`. Методы чатов (`js/telegram-chat.js`): `chatDialogs`, `chatFolders`, `chatHistory`, `chatSend`, `chatSendFile`, `chatEdit`, `chatDelete`, `chatMarkRead`, `chatTyping`, `chatSearch`, `chatSearchIn`, `chatContacts`, `chatReact`, `chatPin`, `chatPinned`, `chatForward`, `chatMute`, `chatClearHistory`, `chatLeave`, `chatBlock`, `chatDeleteContact`, `chatProfile`, `chatShared`, `chatAppearance`, `startChatLive`.

Ключи собеседников: `u123` (пользователь), `g123` (обычная группа), `c123` (канал/супергруппа). Диалоги и сообщения — простые объекты (`formatDialog`, `formatChatMessage`).

## Медиа
URL `media/<тип>/<ключ>/<id>` перехватывает `sw.js`, просит страницу (`js/media.js`), та — движок (`telegram.fetchMedia`). Типы: `avatar`, `avatarbig`, `photo`, `photofull`, `thumb`, `doc` (Range), `wallpaper` и др. Новый тип: ветка в `_fetchMedia` + `CACHEABLE`/`STREAMED` в `sw.js`.

## Расширения
`ext.js`: меню (`message`, `chat`), хуки (`beforeSend`), события (`message`). Моды — ES-модули `export default function (tx) {…}` с полным доступом к API (`tx.S`, `tx.tg`, `tx.ext`, `tx.menu`, `tx.send`, `tx.storage`, `tx.toast`). Песочницы нет; перед установкой показывается предупреждение, поле `manifest.verified` зарезервировано под проверку модов. Примеры — `mods-examples/`.

## Тема и язык
Токены цвета: `css/tokens.css`, `css/light.css`, переменные `--cx-*` в `css/chat.css`; `prefs.theme` = `auto|light|dark`. Язык: `prefs.lang`; словари `js/lang/*.js` генерируются из `tools/i18n/translations.txt`.
