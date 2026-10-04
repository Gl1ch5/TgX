# AGENT.md — Полная архитектурная документация проекта TeleX (Liquid Glass Edition)

> **Назначение документа**: Данный файл содержит исчерпывающее техническое руководство, описание всех подсистем, карту файлов, принципы работы и **строгие правила для ИИ-агентов**, продолжающих разработку в новых сессиях.

---

## 📌 Оглавление
1. [Обзор и концепция TeleX](#1-обзор-и-концепция-telex)
2. [Карта файлов и каталогов (Где что находится)](#2-карта-файлов-и-каталогов)
3. [Бэкенд архитектура (FastAPI + Telethon MTProto)](#3-бэкенд-архитектура)
4. [Фронтенд и компонентная архитектура (ES6 Modules)](#4-фронтенд-и-компонентная-архитектура)
5. [Система обоев Telegram (Wallpaper Engine)](#5-система-обоев-telegram)
6. [Дизайн-система Liquid Glass & iOS Glass Dock](#6-дизайн-система-liquid-glass)
7. [Система дискового и оперативного кэширования](#7-система-кэширования)
8. [Инструкции и строгие правила для следующего Агента](#8-правила-для-следующего-агента)
9. [Руководство по запуску и тестированию](#9-руководство-по-запуску)

---

## 1. Обзор и концепция TeleX

**TeleX** — это высокопроизводительное веб-приложение для чтения всех подписок пользователя Telegram в виде единого нативного потока («Стена каналов»).

### Ключевые принципы системы:
- **Telegram-First UI**: Фокус на чистой ленте постов без перегруженных твиттер-колонок и лишних виджетов.
- **Плавающий док (iOS Dark Glass Dock)**: Стеклянная нижняя панель навигации по формуле стекла iOS Telegram (`blur(45px) saturate(220%)`).
- **Liquid Glass Design System**: Матовое стекло, глубина, подсветка граней, нативные 3D стеклянные иконки из *Liquid Glass Pack*.
- **Официальные векторные обои Telegram**: 9 оригинальных тем `t.me/bg/...` с чёткими белыми контурами + глубокий OLED Pure Black.
- **Инлайн-комментарии (Slide-down Accordion)**: Обсуждения открываются плавно прямо под публикацией с формой отправки сообщений в Telegram.
- **0ms Instant Cache**: Все посты, каналы, комментарии, аватары и медиафайлы сохраняются на диске и в памяти, обеспечивая мгновенную загрузку без задержек прокси.

---

## 2. Карта файлов и каталогов

> У TeleX **нет сервера**. Клиент Telegram (MTProto через WebSocket, GramJS) работает прямо на странице; сайт — статика на GitHub Pages.

```
TgX/
├── index.html, site/                     # Лендинг (корень Pages): landing.css, shots/*.jpg, phone.svg
├── .github/workflows/                    # pages.yml (лендинг + app), android.yml (APK + version.json), windows.yml
├── app/static/                           # Само приложение
│   ├── index.html                        # Экраны: стена, канал, обсуждение, настройки, профиль + док
│   ├── sw.js                             # Service Worker: media/… (кэш + Range-стриминг doc/story)
│   ├── icons/android/                    # Оригинальные иконки Telegram Android (генерирует tools/icons)
│   ├── icons/tabs/                       # Lottie-иконки дока, icons/telex.svg — логотип
│   ├── css/telex.css → tx/*.css          # tokens, layout, avatar, dock, post, thread, settings, viewer,
│   │                                     #   stories (шапка, истории, режим канала), profile, icons-android
│   └── js/
│       ├── app.js                        # window.TelegramX, init, навигация, устойчивость соединения
│       ├── telegram.js, api.js, media.js # GramJS-клиент; тонкий API; мост SW ↔ GramJS с очередью приоритетов
│       ├── tg.js                         # Выбор реализации: на странице или в потоке (prefs.workerMode)
│       ├── telegram-remote.js, tg-worker.js # Режим потока: прокси на странице ⇄ GramJS в Web Worker
│       ├── version.js                    # APP_VERSION, автор
│       ├── core/prefs.js, nav.js         # Настройки; экраны + история (Back)
│       ├── core/devtools.js              # Логи, оверлей соединения, диагностика
│       ├── views/wall.js                 # Стена + режим канала (закреп, нижняя панель, меню)
│       ├── views/channel.js              # Страница канала
│       ├── views/thread.js               # Комментарии (поиск, кнопка вниз)
│       ├── views/settings.js             # Настройки, «Энергосбережение», «О TeleX», «Для разработчиков»
│       ├── views/profile.js              # Свой профиль (+ редактирование, фото)
│       └── components/                   # postCard, reactions, sticker, postMenu, mediaViewer, autoplay,
│                                         #   stories (шапка), storyViewer, audioPlayer, dock, avatar, ui, …
├── native/android/                       # WebView-оболочка: MainActivity, Updater (автообновление), Downloads
├── native/desktop/                       # Electron-оболочка для Windows
├── tools/gramjs/                         # Сборка vendor/gramjs.js
├── tools/icons/extract.py                # Иконки из DrKLO/Telegram → icons/android + css/tx/icons-android.css
└── run.py                                # Локальный предпросмотр (лендинг + /app/static/)
```

---

## 3. Работа с Telegram (без бэкенда)

### 3.1. `app/static/js/telegram.js`
- `TelegramClient` GramJS c `useWSS: true` (обязательно — Pages работает по HTTPS).
- `API_ID`/`API_HASH` приложения зашиты в код намеренно: так устроены все веб-клиенты, доступ даёт только сессия пользователя.
- **Сессия** — `PersistentSession` (наследник `StringSession`) сама пишет себя в `localStorage['telex.session']` при каждом сохранении GramJS; разлогин только по ответу Telegram `AUTH_KEY_UNREGISTERED`/`SESSION_REVOKED`. Кэши: `telex.channels`, `telex.posts` (до 200 постов), `telex.favorites`.
- Вход: QR (`auth.exportLoginToken` + `UpdateLoginToken`, с миграцией DC), код по номеру (`auth.signIn`), облачный пароль (`computeCheck` + `auth.checkPassword`).
- Лента: диалоги-каналы → по 20 последних сообщений из 20 каналов (5 параллельных запросов), альбомы склеиваются по `groupedId`.
- `toHtml(text, entities)` — форматирование сущностей в безопасный HTML (ссылки только `http(s)`, `tg:`, `mailto:`).

### 3.2. Медиа: `sw.js` + `js/media.js`
- URL медиа: `media/avatar/{c|u}{id}/{photoId}`, `media/photo/{ch}/{msg}` (размер ≤1280 для ленты), `media/photofull/…` (оригинал для просмотрщика), `media/thumb/…`, `media/webpage/…`, `media/doc/…`, `media/story/{key}/{id}`, `media/storythumb/…`, `media/cemoji/…`, `media/cmedia|cthumb/…` (комментарии).
- SW перехватывает их и просит страницу скачать байты. `media.js` ставит запросы в очередь: мелочь (аватары, превью, эмодзи) и Range-блоки видео — в приоритете, фото — LIFO, ограниченная параллельность, одинаковые запросы объединяются.
- Мгновенные превью: `strippedPreview()` превращает встроенный в сообщение PhotoStrippedSize в data-URL (`item.preview`), он виден сразу, пока грузится картинка.
- Картинки кэшируются в Cache Storage (`telex-media-v1`); маленькие документы целиком, большие стримятся по `Range` блоками по 512 КБ.

### 3.3. `app/static/js/api.js`
- Сохраняет интерфейс компонентов: `getFeed`, `getChannels`, `getComments`, `sendComment`, `sendReaction`, `forwardToSaved`, `toggleFavorite`, вход (`startQR`, `requestCode`, `signInCode`, `signInPassword`), `logout`.

---

## 4. Фронтенд и компонентная архитектура

- `app.js` собирает `window.TelegramX` (все обработчики для inline `onclick`), регистрирует экраны в `core/nav.js`: `wall` (параметр `channel` = режим канала), `channel`, `thread`, `settings` (`page`), `profile` (`page`). Вложенные экраны пушат запись в историю — Back закрывает их.
- `components/stories.js` — главная шапка: «TeleX» + стопка историй; ряд историй раскрывается потягиванием вниз и сворачивается при прокрутке; `storyViewer.js` — полноэкранные истории.
- `components/postCard.js` — пост как сообщение в группе Telegram (альбомы, видео с автоплеем, стикеры, голосовые, кнопки-ссылки `buttons`).
- `components/postMenu.js` — `openPopup(anchor, {header, items, reactionsHtml})` — общее контекстное меню.
- Анимации: View Transitions между экранами, морфинг медиа и историй, появление новых постов (`animateArrival`), shimmer-загрузка.

---

## 5. Система обоев Telegram (Wallpaper Engine)

Модуль `app/static/js/components/wallpaperTheme.js` управляет фоновыми слоями:
- `#tgx-bg-canvas`: Радиальный/эллиптический градиент.
- `#tgx-bg-pattern`: Векторный SVG-паттерн с белыми контурами (`opacity: 0.28`).
- Доступные официальные темы:
  1. `FOks2P6KCFIMAAAAyFz5S74pfKo` — **Cosmic Liquid**
  2. `MIo6r0qGSFAFAAAAtL8TsDzNX60` — **Neon Cyber**
  3. `CJNyxPMgSVAEAAAAvW9sMwc51cw` — **Midnight Glass**
  4. `aiuT0cIzaVIHAAAAjS-ebiVKLtU` — **Emerald Dream**
  5. `T7LjEHVuYVIFAAAAS7NH4xQl6jY` — **Obsidian Purple**
  6. `bJcwphEAYVINAAAA5jpWNRMqilA` — **Deep Ocean**
  7. `8u8Y1ggMYVITAAAAluQYztxHp6s` — **Aurora Glow**
  8. `DRaa0SbvYVIjAAAAWv3uHfEiYyI` — **Sunset Dunes**
  9. `rF5kQBMSYFICAAAAUCWVFDNCLnU` — **Dark Velvet**
  10. `oled` — **OLED Pure Black**
- Выбор сохраняется в `localStorage.getItem('tgx_wallpaper')`.

---

## 6. Дизайн-система (`css/telex.css`, Telegram Android dark)

| Токен | Значение | Где |
|---|---|---|
| `--tx-bg` | `#000000` | фон списков и настроек |
| `--tx-surface` | `#1c1c1d` | группы настроек, поиск-пилюля |
| `--tx-bubble` | `rgba(33,33,35,.94)` | пузыри постов на обоях |
| `--tx-accent` / `--tx-accent-fill` | `#7595ff` / `#5a83f3` | активная вкладка, имена каналов / кнопки, бейджи |
| `--tx-link` | `#8ea7ff` | ссылки, «Прокомментировать» |
| `--tx-text-2` | `#a2a2a8` | подписи, время |

- **Раскладка**: `.tx-app[data-view]` — на телефоне один экран за раз, на ПК (≥ 1024px) `.tx-sidebar` (400px) + `.tx-main`.
- **Док** `.tx-dock`: стеклянная пилюля 62px, активная вкладка — подложка `rgba(255,255,255,.075)` и акцентный цвет, иконка меняется на залитую.
- **Аватары**: `components/avatar.js` — фото или инициалы на градиентах цветов собеседников Telegram (`.tx-peer-0…6`).
- **Пост**: шапка (аватар + имя канала акцентом), медиа во всю ширину, текст 16px, реакции, «просмотры · время», строка «Прокомментировать ›», круглая кнопка «поделиться» справа.

---

## 7. Система кэширования

1. **localStorage**: сессия, каналы, последние 200 постов (мгновенный показ стены при открытии, затем фоновое обновление), избранное.
2. **Cache Storage** (`telex-media-v1`): аватары, фото, превью — через Service Worker.
3. **Память**: объекты сообщений/сущностей GramJS (нужны для скачивания медиа), комментарии.
4. Выход из аккаунта (`logout`) очищает всё перечисленное.

---

## 8. Правила для следующего Агента

> ⚠️ **КРИТИЧЕСКИЕ ПРАВИЛА ДЛЯ ИИ-АГЕНТА В НОВОЙ СЕССИИ**:

1. **Сохранять модульную структуру**:
   - НЕ сливать код обратно в монолитные файлы.
   - Логику компонентов держать в `app/static/js/components/`, стили в `app/static/css/`.
2. **Telegram-First интерфейс**:
   - НЕ возвращать боковые твиттер-панели («Вся стена», «Медиа», «Тренды», «Мои каналы» слева, «Тренды/Прокси» справа).
   - Основная лента должна оставаться чистым центрированным потоком постов TeleX.
3. **Интерфейс как в Telegram для Android (тёмная тема)**:
   - Дизайн-система — `css/telex.css` (токены `--tx-*`). Новые экраны строить из её классов: `.tx-group`/`.tx-row` (настройки), `.tx-chat` (список каналов), `.tx-bubble` (пост), `.tx-tabs`, `.tx-search`.
   - Плавающий док `.tx-dock`: **Стена**, **Настройки**, **Профиль** (вкладки «Каналы» нет — только стена). Одна колонка на телефоне и ПК.
   - Пост = сообщение в группе Telegram: аватар канала слева, цветное имя в пузыре, время/просмотры в углу, «N комментариев ›» открывает экран обсуждения.
   - Новый код — маленькими модулями: экраны в `js/views/`, элементы в `js/components/`, стили в `css/tx/`.
   - Иконки — классы `icon icon-*`; для них `css/tx/icons-android.css` подставляет оригинальные иконки Telegram Android (маски). Новую иконку добавлять в `MAP` в `tools/icons/extract.py` и перегенерировать.
   - Никаких «декоративных» пунктов меню, которые ничего не делают.
4. **Настройки и профиль**:
   - `views/settings.js` и `views/profile.js` рендерят `#settings-root` / `#profile-root`; строки — `ui.row/switchRow` с цветами `TG.*` (градиенты Telegram 12) и глифами `st-*`.
5. **Фоновые обои и SVG**:
   - Не затирать белые векторные контуры в `app/static/wallpapers/*.svg`.
   - Обои видны только за стеной; левая колонка и экраны настроек — чистый чёрный фон, как в Telegram.
6. **Комментарии**:
   - Открываются отдельным экраном обсуждения (`views/thread.js`) по строке «N комментариев ›»; отправка, ответы и поиск должны оставаться рабочими.
7. **Безопасность (сессия в localStorage = полный доступ к аккаунту)**:
   - Любой текст из Telegram (названия, имена, подписи, имена файлов) вставлять в HTML только через `escapeHtml` / `parseEmojis` (они экранируют), а строки внутри `onclick="…('…')"` — через `escapeQuotes`.
   - Не подключать сторонние скрипты с CDN: всё нужное лежит в `js/vendor/`.
8. **Только относительные пути**: сайт живёт в подпапке `/TgX/` на GitHub Pages — никаких `/static/…` и `/api/…`.

---

## 9. Руководство по запуску

- **GitHub Pages**: из ветки — корень репозитория (лендинг `index.html`, приложение `app/static/`); через Actions — `pages.yml` собирает то же самое в `_site`.
- **Android**: автообновление читает `releases/download/nightly/version.json` (versionCode = номер запуска workflow). Ключ подписи — `native/android/app/debug.keystore` (не менять, иначе обновления не встанут поверх).
- **Локально**: `python run.py` (или `start_telegram_x.bat`) → **http://localhost:8000**. Service Worker работает только на `localhost` или HTTPS.
- **Пересборка GramJS**: `cd tools/gramjs && npm install && npm run build`.
