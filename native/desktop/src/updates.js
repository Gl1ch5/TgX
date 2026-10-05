'use strict';
// Update notice for the Windows app: compares the build number baked in at build time (build-info.json)
// with version-win.json of the nightly release and offers to download the new installer.
const fs = require('fs');
const path = require('path');
const { dialog, shell, net } = require('electron');

const URL_INFO = 'https://github.com/Gl1ch5/TgX/releases/download/nightly/version-win.json';

function localCode() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8')).versionCode || 0; } catch { return 0; }
}

async function checkForUpdate(win, { manual = false } = {}) {
  try {
    const local = localCode();
    if (!local && !manual) return; // a dev checkout has no build number
    const res = await net.fetch(`${URL_INFO}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    if (!(info.versionCode > local)) {
      if (manual) await dialog.showMessageBox(win, { type: 'info', message: 'У вас последняя версия TeleX', detail: `Сборка ${local} · на сервере ${info.versionCode}`, buttons: ['ОК'] });
      return;
    }
    const r = await dialog.showMessageBox(win, {
      type: 'info', title: 'TeleX', message: 'Доступно обновление',
      detail: 'Вышла новая версия TeleX. Скачайте установщик и запустите его — вход в Telegram сохранится.',
      buttons: ['Скачать', 'Не сейчас'], defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) shell.openExternal(info.setup);
  } catch (e) {
    if (manual) dialog.showErrorBox('Не удалось проверить обновления', String(e && e.message || e));
  }
}

module.exports = { checkForUpdate };
