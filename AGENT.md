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

> С версии 3.0 у TeleX **нет сервера**. Весь клиент Telegram (MTProto через WebSocket) работает прямо в браузере на GramJS, поэтому сайт публикуется на GitHub Pages как статика.

```
TgX/
├── .github/workflows/pages.yml           # Деплой app/static на GitHub Pages (push в main)
├── app/static/                           # ВЕСЬ сайт (корень GitHub Pages)
│   ├── index.html                        # Разметка SPA
│   ├── sw.js                             # Service Worker: отдаёт media/… (аватары, фото, стрим видео)
│   ├── css/                              # liquid-glass.css, telegram-theme.css, animations.css, telegram-icons.css
│   ├── wallpapers/                       # Официальные SVG-обои Telegram
│   └── js/
│       ├── telegram.js                   # Сервис Telegram на GramJS (бывший telegram_service.py)
│       ├── api.js                        # Тонкий слой: те же ответы, что давал старый REST API
│       ├── media.js                      # Мост Service Worker ↔ GramJS для загрузки медиа
│       ├── app.js, state.js, utils.js, emoji.js
│       ├── components/                   # UI-компоненты (лента, комментарии, вход, обои, …)
│       └── vendor/                       # gramjs.js (сборка), tailwindcss.js, qrcode.min.js
├── tools/gramjs/                         # Сборка vendor/gramjs.js (npm i && npm run build)
├── run.py, start_telegram_x.bat          # Локальный предпросмотр: статический сервер на localhost:8000
├── README.md
└── AGENT.md
```

---

## 3. Работа с Telegram (без бэкенда)

### 3.1. `app/static/js/telegram.js`
- `TelegramClient` GramJS c `useWSS: true` (обязательно — Pages работает по HTTPS).
- `API_ID`/`API_HASH` приложения зашиты в код намеренно: так устроены все веб-клиенты, доступ даёт только сессия пользователя.
- **Сессия** — `StringSession` в `localStorage['telex.session']`. Кэши: `telex.channels`, `telex.posts` (до 200 постов), `telex.favorites`.
- Вход: QR (`auth.exportLoginToken` + `UpdateLoginToken`, с миграцией DC), код по номеру (`auth.signIn`), облачный пароль (`computeCheck` + `auth.checkPassword`).
- Лента: диалоги-каналы → по 20 последних сообщений из 20 каналов (5 параллельных запросов), альбомы склеиваются по `groupedId`.
- `toHtml(text, entities)` — форматирование сущностей в безопасный HTML (ссылки только `http(s)`, `tg:`, `mailto:`).

### 3.2. Медиа: `sw.js` + `js/media.js`
- В разметке медиа — обычные URL: `media/avatar/{c|u}{id}/{photoId}`, `media/photo/{ch}/{msg}`, `media/thumb/…`, `media/webpage/…`, `media/doc/…`.
- Service Worker перехватывает их и через `postMessage` просит страницу скачать байты GramJS-ом.
- Картинки кэшируются в Cache Storage (`telex-media-v1`). Видео и аудио стримятся по `Range` блоками по 512 КБ (`iterDownload`), видео грузится только по нажатию ▶.

### 3.3. `app/static/js/api.js`
- Сохраняет интерфейс компонентов: `getFeed`, `getChannels`, `getComments`, `sendComment`, `sendReaction`, `forwardToSaved`, `toggleFavorite`, вход (`startQR`, `requestCode`, `signInCode`, `signInPassword`), `logout`.

---

## 4. Фронтенд и компонентная архитектура

### 4.1. `app/static/js/app.js` (Контроллер и шина)
- Инициализирует все подсистемы: обои, бесконечную ленту (`IntersectionObserver`), горячие клавиши, проверку авторизации.
- Экспортирует единый интерфейс `window.TelegramX` для взаимодействия из UI.

### 4.2. `app/static/js/components/postCard.js`
- Формирует HTML карточки публикации.
- **Сетки медиа-альбомов**:
  - 1 фото: полноразмерный контейнер с зумом.
  - 2 фото: 2 колонки (50% / 50%).
  - 3 фото: 1 большое слева + 2 справа.
  - 4+ фото: сетка 2x2 с бейджем `+N` для оставшихся фото.
- Нативные плееры для аудио/голосовых (`1000026051.png`) и видео.

### 4.3. `app/static/js/components/commentsDrawer.js`
- Управляет инлайн-аккордеоном под постом.
- Предзагружает и моментально отображает комментарии из кэша `state.cachedComments`.
- `submitPostComment(...)`: Оптимистично добавляет комментарий в список и отправляет на сервер.

### 4.4. `app/static/js/components/settingsModal.js`
- **Нативное окно настроек**: Открывается как полноценное модальное окно без сторонних iframe'ов.
- Отображает профиль, аватар, имя, телефон, статус Premium, DC 2 и все разделы настроек с 3D-иконками Liquid Glass.

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

## 6. Дизайн-система Liquid Glass

### 6.1. Плавающий стеклянный док (`.tg-perfect-glass`)
```css
.tg-perfect-glass {
  background: rgba(26, 26, 28, 0.78);
  backdrop-filter: blur(45px) saturate(220%);
  -webkit-backdrop-filter: blur(45px) saturate(220%);
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.10),
    0 0 0 0.5px rgba(255, 255, 255, 0.05),
    0 15px 40px -5px rgba(0, 0, 0, 0.55);
  border-radius: 40px;
}
```

### 6.2. Цветовая палитра
- **Фон экрана**: `#000000` / `#08080A`
- **Карточки постов**: `rgba(18, 18, 22, 0.82)` с `blur(28px)`
- **Акцентный синий**: `#4D84F2` / `#62B0F2`
- **Розовые цитаты Telegram**: `border-left: 3px solid #FF2E6A; background: rgba(255, 46, 106, 0.08); color: #FF6D9A`
- **Плашки реакций**: `#202024`

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
3. **Плавающая нижняя панель**:
   - Сохранять стили `.tg-perfect-glass` и структуру 4 вкладок: **Стена**, **Каналы**, **Обои**, **Профиль**.
4. **Настройки без iframe**:
   - Окно настроек `settings-modal` должно рендериться нативным DOM через `settingsModal.js` без сторонних обрезанных фреймов.
5. **Фоновые обои и SVG**:
   - Не затирать белые векторные контуры в `app/static/wallpapers/*.svg`.
   - Прозрачность карточек постов должна оставаться полупрозрачной (`rgba(18, 18, 22, 0.80)` + `blur(24px)`), чтобы обои просвечивали сквозь стекло.
6. **Инлайн-комментарии**:
   - Комментарии должны открываться только аккордеоном вниз прямо под карточкой поста, а не отдельным модальным окном.
   - Форма отправки комментариев под постом должна оставаться рабочей.
7. **Безопасность (сессия в localStorage = полный доступ к аккаунту)**:
   - Любой текст из Telegram (названия, имена, подписи, имена файлов) вставлять в HTML только через `escapeHtml` / `parseEmojis` (они экранируют), а строки внутри `onclick="…('…')"` — через `escapeQuotes`.
   - Не подключать сторонние скрипты с CDN: всё нужное лежит в `js/vendor/`.
8. **Только относительные пути**: сайт живёт в подпапке `/TgX/` на GitHub Pages — никаких `/static/…` и `/api/…`.

---

## 9. Руководство по запуску

- **GitHub Pages**: Settings → Pages → Source: **GitHub Actions**; любой push в `main` публикует `app/static` на `https://gl1ch5.github.io/TgX/`.
- **Локально**: `python run.py` (или `start_telegram_x.bat`) → **http://localhost:8000**. Service Worker работает только на `localhost` или HTTPS.
- **Пересборка GramJS**: `cd tools/gramjs && npm install && npm run build`.
