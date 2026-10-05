// Assembles app/static/mods/*.module that are built from sources in mods-src/ (manifest json + code).
//   node tools/build-mods.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'mods-src');
const out = path.join(root, 'app/static/mods');
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.manifest.json'))) {
  const id = f.replace('.manifest.json', '');
  const manifest = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
  const code = fs.readFileSync(path.join(src, `${id}.js`), 'utf8');
  const parts = [];
  const cssFile = path.join(src, `${id}.css`);
  if (fs.existsSync(cssFile)) parts.push({ type: 'css', code: fs.readFileSync(cssFile, 'utf8') });
  parts.push({ type: 'js', code });
  fs.writeFileSync(path.join(out, `${id}.module`), JSON.stringify({ manifest, parts }, null, 1));
  console.log('built', id);
}
