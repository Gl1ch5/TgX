# Шпаргалка по Telegram API / GramJS и грабли

> **Золотое правило: не выдумывай метод и параметры.** Любой метод проверяй командой:
> ```
> node tools/tl-lookup.mjs messages.SendMessage      # точные параметры и тип ответа
> ```
> (один раз: `cd tools/gramjs && npm ci`). Если инструмент пишет «No such method» — такого метода нет.

Импорт в коде: `import { TelegramClient, Api, utils, bigInt, Buffer } from './vendor/gramjs.js'`. Вызов: `const res = await client.invoke(new Api.messages.GetHistory({...}))`. Все числа-идентификаторы Telegram могут быть `bigInt` — перед отдачей в UI **превращай в `Number`** (или строку для очень больших).

## 1. Идентификаторы и ключи собеседников
* Три вида собеседников: `Api.User`, `Api.Chat` (обычная группа), `Api.Channel` (канал **и** супергруппа: `broadcast` / `megagroup`).
* Сегодня в коде ключи сущностей: `u<id>` для пользователей и `c<id>` для чатов/каналов (`entityKey()` в `telegram.js`). У `Api.Chat` и `Api.Channel` **разные пространства id**, они могут совпасть. Для полного клиента введи три префикса: `u`, `g` (Chat), `c` (Channel) — это задача 1.2 (модели).
* Сообщения: в **личных чатах и обычных группах** id сообщений общие для аккаунта (монотонные в пределах аккаунта), в **каналах и супергруппах** — отдельная нумерация у каждого чата. Поэтому ключ сообщения — всегда пара `(chatId, msgId)`, а для запросов удаления/чтения нужны разные методы (`channels.*` vs `messages.*`).
* «min»-сущности: в ответах бывают «урезанные» пользователи/каналы (`min: true`) — без `access_hash`. По ним нельзя запрашивать данные напрямую. Не затирай ими полную сущность (см. `rememberEntity`).
* `await client.getInputEntity(entityOrId)` превращает сущность в `InputPeer…`; работает, пока сущность в кэше (`this.entities`). После перезагрузки страницы кэш пуст — загрузи диалоги/сущность заново.

## 2. Диалоги (список чатов)
```js
const res = await client.invoke(new Api.messages.GetDialogs({
  offsetDate: 0, offsetId: 0, offsetPeer: new Api.InputPeerEmpty(),
  limit: 30, hash: bigInt.zero,            // folderId: 1 → архив; excludePinned
}));
// res: Api.messages.Dialogs | DialogsSlice | DialogsNotModified
// res.dialogs[]  — {peer, topMessage, unreadCount, readInboxMaxId, readOutboxMaxId, unreadMentionsCount,
//                  notifySettings.muteUntil, pinned, folderId, draft}
// res.messages[] — последние сообщения (по id = dialog.topMessage), res.users[], res.chats[]
```
* Пагинация: следующий `offsetDate/offsetId/offsetPeer` берётся из **последнего** диалога страницы: `date` и `id` его `topMessage`, `peer` его собеседника (в виде InputPeer).
* Папки: `Api.messages.GetDialogFilters` (список), редактирование `UpdateDialogFilter`. Архив — `folderId: 1`; перенос — `Api.folders.EditPeerFolders`.
* Закрепить: `Api.messages.ToggleDialogPin({peer: new Api.InputDialogPeer({peer}), pinned})`. Пометить непрочитанным: `Api.messages.MarkDialogUnread`. Без звука: `Api.account.UpdateNotifySettings({peer: new Api.InputNotifyPeer({peer}), settings: new Api.InputPeerNotifySettings({muteUntil})})` (`muteUntil` — unix-время, `2147483647` = навсегда).
* Удалить диалог: `Api.messages.DeleteHistory` (для каналов — `channels.LeaveChannel`).

## 3. История
```js
const res = await client.invoke(new Api.messages.GetHistory({
  peer, offsetId: 0, offsetDate: 0, addOffset: 0, limit: 50, maxId: 0, minId: 0, hash: bigInt.zero,
}));
```
* Возвращает от новых к старым. Вверх (старше): `offsetId = id самого старого из показанных`. «Окно вокруг сообщения» (прыжок): `offsetId = X`, `addOffset = -25`, `limit = 50`.
* **Отправителей бери из `res.users`/`res.chats`** (`Map` по id), не вызывай `getSender` на каждое сообщение (это ломало скорость).
* Альбомы: сообщения с общим `groupedId` склеиваются в одно (см. `formatGroup`).
* Отдельные сообщения по id: личные/группы — `messages.GetMessages`, каналы — `channels.GetMessages`.
* Поиск: `messages.Search({peer, q, filter: new Api.InputMessagesFilterPhotos() …, limit, offsetId, minDate, maxDate, addOffset, maxId, minId, hash})`, глобальный — `messages.SearchGlobal`, люди/чаты — `contacts.Search`.
* Прочитано: личные/группы `messages.ReadHistory({peer, maxId})`, каналы/супергруппы `channels.ReadHistory({channel, maxId})`.

## 4. Отправка
```js
const randomId = bigInt(crypto.getRandomValues(new BigUint64Array(1))[0].toString()); // уникальный
await client.invoke(new Api.messages.SendMessage({
  peer, message: text, randomId,
  entities,                                               // MessageEntityBold/Italic/Code/Pre/TextUrl/Spoiler…
  replyTo: replyId ? new Api.InputReplyToMessage({ replyToMsgId: replyId }) : undefined,
}));
```
* **Тот же `randomId` при повторе** — защита от дублей. Результат — `Api.Updates`: из него достань `UpdateMessageID` (связь randomId → id) и `UpdateNewMessage`/`UpdateShortSentMessage`.
* Редактирование: `messages.EditMessage({peer, id, message, entities})`. Удаление: `messages.DeleteMessages({id:[…], revoke:true|false})`, в каналах/супергруппах `channels.DeleteMessages({channel, id:[…]})`.
* Пересылка: `messages.ForwardMessages({fromPeer, id:[…], randomId:[…], toPeer})`.
* Черновик: `messages.SaveDraft({peer, message, replyTo, entities})`. «Печатает»: `messages.SetTyping({peer, action: new Api.SendMessageTypingAction()})` (раз в ~5 с).
* Файлы: удобнее хелпер `client.sendFile(peer, {file, caption, progressCallback, forceDocument, attributes…})` (загружает по частям, сам делает `SendMedia`). Размер части и параллельность настроены в GramJS; для отмены загрузки держи `AbortController`/флаг и бросай в `progressCallback`.
* Реакции: `messages.SendReaction` (в коде уже есть `sendReaction`).

## 5. Обновления (real-time)
* В коде (`startLive`) сейчас: `client.addEventHandler((update) => …)` — получает **сырые** объекты `Api.Update*` и «обёртки» GramJS; плюс опрос раз в 30 с (`pollNew`) как страховка. Обработаны только каналы.
* Для чатов нужны: `UpdateNewMessage` (личные/группы), `UpdateNewChannelMessage`, `UpdateEditMessage`, `UpdateEditChannelMessage`, `UpdateDeleteMessages`, `UpdateDeleteChannelMessages`, `UpdateReadHistoryInbox/Outbox`, `UpdateReadChannelInbox/Outbox`, `UpdateUserTyping`, `UpdateChatUserTyping`, `UpdateUserStatus`, `UpdatePinnedDialogs`, `UpdateNotifySettings`, `UpdateMessageID`, `UpdateShortMessage` / `UpdateShortChatMessage` / `UpdateShortSentMessage` (короткие формы!).
* Пропуски после офлайна: `updates.GetState` (запомнить pts/qts/date/seq) → при возврате `updates.GetDifference`; для каналов `updates.GetChannelDifference` по каждому открытому каналу (нужен его `pts`). Это сложная часть — делай отдельной задачей и тестируй.
* Не вызывай `invoke` внутри обработчика на каждое событие; копи в пачку и обновляй UI раз в кадр.

## 6. Медиа
* Скачивание — только через мост (`media/<kind>/…`, см. архитектуру). Для новых типов — ветка в `_fetchMedia`.
* Миниатюры: `PhotoStrippedSize` → data-URL (`strippedPreview`), мгновенный блюр, пока грузится картинка.
* Сообщения с медиа нужно держать в памяти (`this.messages`), чтобы скачать файл: после перезагрузки страницы объект сообщения исчез — перезапроси по id (`getMessage`).
* Стикеры/эмодзи: анимированные (TGS = gzip Lottie) уже поддержаны в `components/sticker.js` (Lottie), видео-стикеры — WebM.

## 7. Профили
* Пользователь: `users.GetFullUser`, группа: `messages.GetFullChat`, канал/супергруппа: `channels.GetFullChannel`; участники: `channels.GetParticipants`.
* Фото аватара: `client.downloadProfilePhoto(entity)` для полных сущностей; для `min`-пользователей — `InputPeerPhotoFileLocation` с `InputPeerUserFromMessage` (см. `_fetchMedia`, ветка `avatar`).

## 8. Ошибки и лимиты
| Ошибка | Что значит | Что делать |
|---|---|---|
| `FLOOD_WAIT_X` | слишком часто | GramJS сам ждёт, если X < 60 с; иначе покажи «подождите X с», не повторяй в цикле |
| `AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED` | сессию отозвали | разлогин (есть `SESSION_DEAD` в telegram.js) |
| `MSG_ID_INVALID` | id сообщения не относится к этому чату/недоступен | не повторяй; для аватаров комментаторов брать сообщение из обсуждения (`scanReplies`) |
| `PEER_ID_INVALID`, `CHANNEL_INVALID` | нет access_hash / сущность не в кэше | загрузи диалоги, получи сущность заново |
| `USER_PRIVACY_RESTRICTED`, `CHAT_WRITE_FORBIDDEN` | нельзя писать | сообщение пользователю через `t()` |
| `PHONE_MIGRATE_X`, `FILE_MIGRATE_X` | другой дата-центр | GramJS обрабатывает сам; ключи ДЦ сохраняются (`telex.dckeys`) |
| `FILEREF_EXPIRED` | устарела ссылка на файл | перезапросить сообщение и скачать снова |

## 9. Что делает сервис в Worker (повторить для новых методов)
1. Метод класса `TelegramService` принимает **только** простые значения и колбэки, возвращает **простой JSON**.
2. Ошибки бросай как обычные `Error` с понятным `message` (на странице они превратятся в `Error` + `errorMessage`).
3. Бинарные данные (медиа) возвращай как `{bytes: Uint8Array, mime}` — Worker передаст их без копирования (см. `prepare()` в `tg-worker.js`).
4. Для чего-то синхронного на странице (кэш) — добавь в `local` в `telegram-remote.js`.

## 10. Правила Telegram для клиентов
Свой `api_id`; не имитируй официальный клиент; не скрывай рекламу в каналах хитрыми способами; не делай автоматическую массовую рассылку/вступление/реакции; не собирай данные пользователей; уважай лимиты. Ссылка: https://core.telegram.org/api/terms
