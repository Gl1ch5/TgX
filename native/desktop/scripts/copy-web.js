'use strict';
// Packs the web app (app/static) into native/desktop/web, which electron-builder puts in the installer.
const fs = require('fs');
const path = require('path');

const from = path.resolve(__dirname, '..', '..', '..', 'app', 'static');
const to = path.resolve(__dirname, '..', 'web');
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true, filter: (src) => !/\.(map|md)$/.test(src) });
console.log(`web app copied to ${to}`);
