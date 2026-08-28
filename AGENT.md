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

```
C:/Users/Pavel/Documents/1/
├── app/
│   ├── backend/
│   │   ├── config.py                     # Конфигурация: API ID, Hash, Прокси, пути к кэшу
│   │   ├── main.py                       # FastAPI приложение, REST API эндпоинты, раздача медиа
│   │   └── telegram_service.py           # MTProto сервис Telethon, кэш, лента, реакции, комментарии
│   ├── media_cache/                      # Дисковый кэш аватаров (avatar_*.jpg), фото, видео и документов
│   ├── sessions/                         # Хранилище сессий (.session), feed_cache.json, channels_cache.json, comments_cache.json, favorites.json
│   └── static/
│       ├── css/                          # Модульные стили дизайн-системы
│       │   ├── liquid-glass.css          # Эффекты стекла, размытие, dock, градиенты
│       │   ├── telegram-theme.css        # Цветовые токены, цитаты (#FF2E6A), спойлеры, код
│       │   └── animations.css            # Анимации аккордеона, выезда комментариев, реакций
│       ├── js/                           # Модульный JavaScript (ES6 Modules)
│       │   ├── api.js                    # Клиентский слой API запросов
│       │   ├── state.js                  # Централизованное состояние и константы
│       │   ├── utils.js                  # Форматтеры времени, чисел, спойлеров, цитат
│       │   ├── app.js                    # Точка входа, контроллер, роутер, глобальный window.TelegramX
│       │   └── components/               # Изолированные UI-компоненты
│       │       ├── postCard.js           # Рендеринг карточек постов и сеток медиа-альбомов
│       │       ├── commentsDrawer.js     # Инлайн-комментарии и форма отправки
│       │       ├── reactionPicker.js     # Палитра реакций и обработчики
│       │       ├── wallpaperTheme.js     # Движок и селектор официальных обоев Telegram
│       │       ├── settingsModal.js      # Полноценное нативное окно настроек (без iframe)
│       │       ├── storiesBar.js         # Карусель сторис и каналов вверху
│       │       ├── lightbox.js           # Полноэкранный просмотрщик галерей и альбомов
│       │       ├── authModal.js          # Окно авторизации (QR-код и телефон)
│       │       └── channelsModal.js      # Диалог списка каналов и живой поиск
│       ├── wallpapers/                   # 9 оригинальных векторных SVG-обоев Telegram + catalog.json
│       ├── icons/                        # 3D стеклянные иконки Liquid Glass Pack
│       ├── index.html                    # Главный чистый семантический HTML-каркас
│       └── settings.html                 # Автономная реплика настроек (резервная)
├── Liquid Glass Pack.icons               # Исходный архив иконок Liquid Glass
├── run.py                                # Главная точка входа для запуска сервера
├── start_telegram_x.bat                  # Батник быстрого запуска для Windows
├── README.md                             # Краткое руководство пользователя
└── AGENT.md                              # Настоящая полная документация
```

---

## 3. Бэкенд архитектура

### 3.1. `app/backend/config.py`
- Содержит зарегистрированные Telegram App ID (`27451332`) и Hash (`1462d961e4a7bf6b5139309255f09fd6`).
- Настройки HTTP/HTTPS прокси: `http://grzxk:ahCEZwkV37Mj@64.188.66.249:8888`.
- Пути к каталогам `media_cache/` и `sessions/`.

### 3.2. `app/backend/telegram_service.py`
- **Класс `TelegramService`**:
  - `get_client()`: Инициализация и подключение `TelegramClient` через настроенный прокси к DC 2 (`149.154.167.50:443`).
  - `get_wall_feed(...)`: Сбор постов со всех подписанных каналов с группировкой альбомов (`grouped_id`), кэшированием в `posts_cache` и сохранением в `feed_cache.json`.
  - `get_post_comments(...)`: Мгновенное чтение комментариев из кэша и получение свежих веток через `GetRepliesRequest`.
  - `send_comment(...)`: Отправка ответа в обсуждение канала через `client.send_message(entity, text, comment_to=msg_id)` или `reply_to=msg_id`.
  - `send_reaction(...)`: Нативная отправка эмодзи-реакций через `SendReactionRequest`.
  - `download_media(...)`: Загрузка и дисковое кэширование фото, превью, видео и документов в `app/media_cache/` (0ms при повторных запросах).
  - `unparse_telegram_html(...)`: Конвертация сущностей MTProto (`MessageEntitySpoiler`, `MessageEntityBlockquote`, `MessageEntityBold`, `MessageEntityCode` и т.д.) в безопасный HTML.

### 3.3. `app/backend/main.py`
- FastAPI REST API эндпоинты:
  - `GET /api/auth/status`, `POST /api/auth/qr/start`, `GET /api/auth/qr/check`, `POST /api/auth/sign-in`, `POST /api/auth/logout`.
  - `GET /api/channels`, `GET /api/feed` (с поддержкой параметров `channel_id`, `q`, `offset_date`, `refresh`).
  - `GET /api/post/comments`, `POST /api/post/comment`.
  - `POST /api/post/react`, `POST /api/post/forward-saved`, `POST /api/post/favorite`.
  - `GET /api/media/photo/{ch}/{msg}`, `GET /api/media/doc/{ch}/{msg}`, `GET /api/media/cache/{filename}`.
  - Статическая раздача `app/static/` и SPA fallback.

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

1. **Медиафайлы (`app/media_cache/`)**: Аватарки (`avatar_{id}.jpg`), фото и видео сохраняются на диске. При наличии файла запрос к MTProto пропускается.
2. **Сессии и данные (`app/sessions/`)**:
   - `feed_cache.json` — сохранённый поток постов.
   - `channels_cache.json` — список каналов и метаданных.
   - `comments_cache.json` — ветки обсуждений.
   - `favorites.json` — закладки пользователя.
3. **Оперативный кэш**: При запуске приложение мгновенно рендерит посты из RAM за 0 мс.

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
7. **Проверка синтаксиса**:
   - После любых правок в бэкенде обязательно запускать проверку:
     `python -m py_compile run.py app/backend/config.py app/backend/main.py app/backend/telegram_service.py`

---

## 9. Руководство по запуску

Запуск сервера:
```bash
python run.py
```
или двойным кликом по `start_telegram_x.bat`.

Приложение откроется в браузере: **http://127.0.0.1:8000**
