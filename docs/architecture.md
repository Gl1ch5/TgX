# Архитектура

## 1. Общая картина
```
Браузер (страница)                              Web Worker (по умолчанию включён)
┌──────────────────────────────┐   postMessage   ┌──────────────────────────────┐
│ UI: views/*, components/*    │ ───────────────►│ tg-worker.js                 │
│ api.js  → tg.js → telegram-  │   (JSON/clone)  │   telegram.js (GramJS клиент)│
│ remote.js (прокси)           │◄─────────────── │   MTProto по WSS, шифрование │
│ media.js (очередь загрузок)  │                 │   загрузка файлов            │
└──────────┬───────────────────┘                 └──────────────────────────────┘
           │ MessageChannel
┌──────────▼───────────────────┐
│ sw.js (Service Worker)       │  перехватывает URL  media/<тип>/…  и отдаёт байты
└──────────────────────────────┘  (кэш в Cache Storage, Range-стриминг видео)
```
* **Нет бэкенда.** Сайт — статические файлы (GitHub Pages / любой статический хостинг). Сессия Telegram лежит в `localStorage` пользователя.
* `tg.js` один раз при старте выбирает реализацию: `telegram-remote.js` (Worker, по умолчанию) или `telegram.js` напрямую (`prefs.workerMode=false`).
* Всё, что UI знает о Telegram, проходит через `api.js` (тонкая обёртка), которая зовёт методы сервиса `telegram.*`.

## 2. Карта файлов
```
app/static/
  index.html                 разметка всех экранов + док; ранний скрипт выбора темы
  sw.js                      Service Worker (версия SW_VERSION)
  css/telex.css              @import'ы модулей css/tx/*.css
  css/tx/tokens.css          дизайн-токены (--tx-*), тёмная тема по умолчанию
  css/tx/light.css           переопределения светлой темы (html[data-theme='light'])
  css/tx/{layout,post,thread,settings,profile,stories,dock,avatar,viewer,auth}.css
  css/tx/icons-android.css   ГЕНЕРИРУЕТСЯ (иконки Telegram Android)
  js/app.js                  window.TelegramX, init, регистрация экранов, события
  js/state.js                глобальный объект состояния (простой)
  js/api.js                  обёртка над telegram.* (+ safe() для ошибок)
  js/tg.js                   выбор: Worker или страница
  js/telegram.js             КЛИЕНТ: вход, диалоги, лента, комментарии, истории, медиа, обновления
  js/telegram-remote.js      прокси клиента в Worker (+ синхронные хелперы `local`)
  js/tg-worker.js            Worker: шимы localStorage/document, вызовы методов
  js/media.js                мост SW ↔ клиент: очередь с приоритетами
  js/i18n.js, js/lang/*.js   переводы (lang/* генерируются)
  js/core/prefs.js           настройки (localStorage 'telex.prefs'), applyAppearance, resolvedTheme
  js/core/colorThemes.js     цветовые темы чатов (данные)
  js/core/nav.js             экраны + история браузера (Back)
  js/core/devtools.js        логи, оверлей, postNative (мост в Android/Electron)
  js/views/{wall,channel,thread,settings,profile}.js   экраны
  js/components/*.js         postCard, postMenu, reactions, stories, storyViewer, mediaViewer,
                             dock, avatar, ui (строки/слайдеры), authModal, countries, sticker, …
  js/vendor/gramjs.js        ГЕНЕРИРУЕТСЯ (tools/gramjs/build.mjs), не править
tools/gramjs/                сборка GramJS (esbuild) + патчи (alert, таймаут отдельных DC)
tools/icons/extract.py       иконки Telegram Android → icons/android + icons-android.css
tools/i18n/                  wrap.mjs (одноразовый кодмод), extract.mjs, build.mjs, translations.txt
tools/test/smoke.cjs         браузерный смоук-тест (Playwright), `npm test`
native/android, native/desktop   оболочки (WebView / Electron), открывают https://telex-web.ru
```

## 3. Паттерны, которые нужно повторять
### 3.1 Экран (view)
Файл в `js/views/`, экспортирует функции `enterX(params)` и рендерит в контейнер из `index.html`; регистрация: `registerView('x', { enter, leave })` в `app.js`. Пример эталона: `views/channel.js`, `views/profile.js`, `views/settings.js`.
```js
registerView('chat', { enter: (params) => chatView.enter(params) });
// навигация:  go('chat', { id: 123 })    назад: window.TelegramX.back()
```
Вложенные экраны (с параметром `page` или `channel`, а также `thread`/`channel`) считаются «глубже» — Back закрывает их.

### 3.2 Разметка строками + inline-обработчики
UI строится шаблонными строками (`innerHTML`) и обработчиками `onclick="window.TelegramX.fn('${id}')"`. Значит: (а) любой пользовательский текст экранируется (`escapeHtml`, `escapeQuotes`); (б) каждый обработчик объявлен в `window.TelegramX` в `app.js`.

### 3.3 Компоненты настроек (`components/ui.js`)
`titleBar(title,{back,actions})`, `group(content,{title,hint})`, `row({icon,color,title,sub,value,onclick,accent})`, `switchRow(...)`, `slider(...)`, `radioRow(...)`, `segments(...)`. Цвета иконок — `TG.*`. Эталон страницы: `chatPage()` в `views/settings.js`.

### 3.4 Данные
* `state` (js/state.js) — простой объект: `isAuth`, `user`, `channels`, `posts`, `stories`…
* Сообщение/пост — **простой объект** (см. `formatGroup()` в `telegram.js`): `{id, msg_id, channel_id, channel, timestamp, text, text_html, media_type, media_items[], views, replies_count, comments_enabled, reactions[], buttons, is_pinned, …}`. Для чатов используется своя модель (см. раздел «Telegram You»).
* Медиа в UI — всегда URL вида `media/<kind>/…` (см. §4).

### 3.5 Сессия и кэши (`localStorage`)
`telex.session` (StringSession — **секрет**), `telex.dckeys` (ключи других ДЦ, привязаны к аккаунту), `telex.me`, `telex.channels`, `telex.posts`, `telex.favorites`, `telex.seen`, `telex.prefs`, `tgx_wallpaper`. Для больших данных (диалоги, история) **используй IndexedDB**, не localStorage (лимит ~5 МБ).

## 4. Медиа-конвейер
URL `media/<kind>/…` → `sw.js` перехватывает → просит страницу (`media.js`) → та зовёт `telegram.fetchMedia(path, range)` → байты назад в SW → в браузер.
* Виды: `avatar|avatarbig/{c|u}{id}/{photoId}/{dc}[/{ctxKey}/{ctxMsg}]`, `photo/{ch}/{msg}` (≤1280 px), `photofull`, `thumb`, `doc` (Range-стриминг по 512 КБ), `webpage`, `story|storythumb`, `cemoji`, `cmedia|cthumb` (медиа комментариев).
* Очередь `media.js`: высокий приоритет — аватары, превью, эмодзи, Range; обычные — LIFO; лимиты 6/3 (в Worker 8/6); одинаковые запросы объединяются.
* Мгновенные превью: `strippedPreview()` превращает PhotoStrippedSize в data-URL (`item.preview`).
* **Правило**: чтобы показать новый тип медиа — добавь ветку в `_fetchMedia` (telegram.js) и тип URL в `sw.js`, не качай в обход.

## 5. Лента (как пример тяжёлой логики)
`getFeed` → для нескольких каналов `mergedFeed()`: k-way merge с курсором у каждого канала; новая страница дозапрашивает только нужные каналы. Для списка диалогов/истории чатов нужен похожий подход (пагинация по `offsetDate/offsetId`).

## 6. Тема и оформление
* `applyAppearance()` ставит `html[data-theme]`, токены акцента, `--tx-bubble-out`, размер текста, радиус углов. Режим `auto` слушает `prefers-color-scheme`.
* `index.html` в `<head>` содержит ранний скрипт (нет «вспышки» тёмной темы).
* Обои: `components/wallpaperTheme.js` (десять обоев; светлая версия градиента — поле `light`).
* Android: `postNative('theme:light|dark')` меняет цвет иконок статус-бара.

## 7. Переводы
Движок — `js/i18n.js`: `t`, `tn`, `lang()`, `locale()`, `translateTree`. Словари генерирует `tools/i18n/build.mjs` из `translations.txt`. Язык: `prefs.lang` (`auto` = как в браузере), смена языка — перезагрузка страницы.

## 8. Оболочки
* Android (`native/android`): WebView, открывает `AppConfig.START_URL`, мост `window.TeleXNative.postMessage(str)` (строки: `retry`, `checkUpdate`, `theme:light|dark`, загрузки). Автообновление APK через `releases/download/nightly/version.json`.
* Windows (`native/desktop`): Electron, тот же адрес.
* При смене домена приложения нужно перенести `localStorage` со старого origin (сделано в `StorageMigration.kt` / `main.js`).

## 9. Известные особенности и уроки
* GramJS в Worker считает, что он в Node, если нет `window` → шим `self.window = self` (есть в `tg-worker.js`).
* `min`-пользователи (приходят в сообщениях каналов) без `access_hash`: фото аватара берётся через `InputPeerUserFromMessage` + сообщение, где человек встречен; для комментаторов — через `messages.GetReplies` (см. `scanReplies`).
* Подключения к другим ДЦ (файлы) создают новый ключ шифрования (секунды вычислений) → ключи сохраняются (`telex.dckeys`), соединения держатся 10 минут.
* `loadDialogs()` грузит до 100 диалогов и кэширует сущности — для чатов нужна полноценная пагинация и IndexedDB.
* Тестировать на живом Telegram из песочницы обычно нельзя → `07-TESTING.md`.

## 10. Telegram You (`app/static/chat/`)
Второй клиент: обычные чаты. Работает на том же движке и той же сессии, лежит внутри области Service Worker (`app/static/`), поэтому медиа идёт тем же путём.
```
chat/index.html         разметка: список (aside), переписка (main), меню, просмотрщик
chat/chat.css           стили; цвета берутся из токенов css/tx/tokens.css и light.css
chat/js/app.js          запуск: тема, язык, вход (authModal), вкладки, живые события
chat/js/store.js        общее состояние S, шина событий, форматирование времени и статусов
chat/js/list.js         вкладка «Чаты»: папки, архив, поиск, строки диалогов
chat/js/conv.js         переписка: шапка, пузыри, композер, отправка, меню, просмотр медиа
chat/js/pages.js        «Контакты», «Настройки», «Профиль»
chat/js/fake.js         демо-сервис для ?fake=1 (тесты, скриншоты)
js/telegram-chat.js     API чатов поверх TelegramService (работает и в Worker)
```
Ключи собеседников: `u123` (пользователь), `g123` (обычная группа), `c123` (канал/супергруппа). Диалоги и сообщения — простые объекты (`formatDialog`, `formatChatMessage`). Адреса медиа — `media/<тип>/<ключ>/<id сообщения>`; на странице они получают префикс `../`.

Методы: `chatDialogs`, `chatFolders`, `chatHistory`, `chatSend`, `chatSendFile`, `chatEdit`, `chatDelete`, `chatMarkRead`, `chatTyping`, `chatSearch`, `chatContacts`, `startChatLive`.
