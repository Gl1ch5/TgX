// Builds precache.json (every file of the app) and stamps sw.js with a build id (hash of all files),
// so any change to any file makes the browser install a new Service Worker.
//   node tools/build-precache.mjs          → writes precache.json and updates sw.js
//   node tools/build-precache.mjs --check  → exits 1 if they are out of date (used by npm test / CI)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'app', 'static');
const DIRS = ['css', 'js', 'icons'];
const FILES = ['index.html', 'chat/index.html'];

// emoji (27 MB) and wallpapers are cached on first use (sw.js), everything else is installed up front.
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel); else if (!/\.(map|md)$/.test(e.name)) files.push(rel);
  }
};
FILES.forEach((f) => files.push(f));
DIRS.filter((d) => fs.existsSync(path.join(root, d))).forEach(walk);

const hash = crypto.createHash('sha1');
for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(root, f))); }
const build = hash.digest('hex').slice(0, 10);
const json = JSON.stringify({ build, files: ['./', ...files] }, null, 1) + '\n';

let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const next = sw.replace(/const BUILD = '[^']*';/, `const BUILD = '${build}';`);
const current = fs.existsSync(path.join(root, 'precache.json')) ? fs.readFileSync(path.join(root, 'precache.json'), 'utf8') : '';

if (process.argv.includes('--check')) {
  if (current !== json || sw !== next) { console.error('precache.json / sw.js are out of date: run `npm run precache`'); process.exit(1); }
  console.log(`precache ok (${files.length} files, build ${build})`);
} else {
  fs.writeFileSync(path.join(root, 'precache.json'), json);
  fs.writeFileSync(path.join(root, 'sw.js'), next);
  console.log(`precache.json: ${files.length} files, build ${build}`);
}
