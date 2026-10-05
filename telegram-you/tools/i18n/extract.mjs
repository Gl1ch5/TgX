// Lists every key used with t(...) / tn([...]) in app/static/js (+ static strings of index.html).
//   node tools/i18n/extract.mjs            → tools/i18n/keys.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('acorn'); } catch { acorn = require(process.env.ACORN || '/opt/node-tools/node_modules/acorn'); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const keys = new Map();
const add = (k, where, plural) => { if (!keys.has(k)) keys.set(k, { where, plural: !!plural }); };

function walk(node, file, src) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    if (node.callee.name === 't' && node.arguments[0] && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
      add(node.arguments[0].value, file, false);
    } else if (node.callee.name === 't' && node.arguments[0] && node.arguments[0].type === 'TemplateLiteral') {
      add(node.arguments[0].quasis.map((q) => q.value.cooked).join('{}'), file + ' (template)', false);
    }
    if (node.callee.name === 'tn' && node.arguments[0] && node.arguments[0].type === 'ArrayExpression') {
      const f = node.arguments[0].elements.map((e) => e.value);
      add(f[0], file, true);
      keys.get(f[0]).forms = f;
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type') continue;
    if (Array.isArray(v)) v.forEach((c) => walk(c, file, src));
    else if (v && typeof v.type === 'string') walk(v, file, src);
  }
}
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['vendor', 'lang'].includes(e.name)) scan(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    const src = fs.readFileSync(p, 'utf8');
    try { walk(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true }), path.relative(ROOT, p), src); } catch (err) { console.error('parse', p, err.message); }
  }
}
scan(path.join(ROOT, 'js'));
// static text and attributes of index.html
const html = ['index.html'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
for (const m of html.matchAll(/>([^<>{}]*[А-Яа-яЁё][^<>{}]*)</g)) add(m[1].trim().replace(/\s+/g, ' '), 'index.html');
for (const m of html.matchAll(/\b(?:placeholder|title|alt|aria-label)="([^"]*[А-Яа-яЁё][^"]*)"/g)) add(m[1].trim(), 'index.html');
for (const m of html.matchAll(/<title>([^<]*)<\/title>/g)) if (/[А-Яа-яЁё]/.test(m[1])) add(m[1].trim(), 'index.html');
fs.writeFileSync(path.join(ROOT, 'tools/i18n/keys.json'), JSON.stringify([...keys].map(([k, v]) => ({ key: k, ...v })), null, 1));
console.log(keys.size, 'keys');
