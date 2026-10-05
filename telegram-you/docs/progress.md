# Telegram You — progress

Reference: Telegram for Android 12.10.6 sources + 16 screenshots from the owner. Nothing here is verified on a real phone; checks are the Playwright smoke test (5 languages, dark/light) and manual screenshots of the `?fake=1` demo.

## Done
- Black dark theme, original Android icons (CSS masks), chat list header/search pill/FAB.
- Contacts (sorting, action card), settings (original row order, privacy/notifications/folders/premium/ghost pages, settings search).
- Profile: round avatar for people, collapsing top bar, files/links/music rows with colored tiles.
- Chat: bot inline keyboards (url + callback), bot "Menu" button with command list, round video bubble.
- Ghost mode (no read receipts, no typing, offline), kept deleted messages, local premium badge.

## Not done yet
- Channel gifts tab, giveaway button, media viewer header/menu, stories stack in list, channel/group menus 1:1.
- Mods system port from TeleX (core/mods.js exists in basic form).
- Gesture/animation parity with Android (swipe, long-press details).
- Promo videos, release workflow for Telegram You.
