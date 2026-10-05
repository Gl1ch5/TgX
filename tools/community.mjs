// Community mods registry: validates community/mods/*.module and builds the index the app reads.
//   node tools/community.mjs            validate + write app/static/community/{index.json,mods/*}
//   node tools/community.mjs --check    validate only (used by the pull-request check)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(root, 'community/mods');
const OUT = path.join(root, 'app/static/community');
const LANGS = ['ru', 'en', 'es', 'pt', 'uk'];
const MAX = 1_500_000;
const PART_TYPES = new Set(['js', 'html', 'css', 'theme', 'json', 'text']);

/** Same rules as parseBundle() in app/static/js/core/mods.js. */
export function parse(text) {
  const src = text.replace(/^﻿/, '').trim();
  if (src.startsWith('{')) {
    const o = JSON.parse(src);
    if (o.manifest && Array.isArray(o.parts)) return o;
    if (o.manifest) return { manifest: o.manifest, parts: [o.theme && { type: 'theme', data: o.theme }, o.code && { type: 'js', code: o.code }].filter(Boolean) };
  }
  const m = /^[^\n]*@manifest\s+(\{.*\})[^\n]*$/m.exec(src);
  if (!m) throw new Error('no manifest: use a JSON bundle or a first comment line with @manifest {json}');
  const manifest = JSON.parse(m[1]);
  const body = src.replace(m[0], '').trim();
  const marks = [...body.matchAll(/^[^\n]*@part[ \t]+(js|css|html|theme|json|text)(?:[ \t]+([A-Za-z0-9_][\w.-]*))?[^\n]*$/gm)];
  if (marks.length) {
    return { manifest, parts: marks.map((mk, i) => {
      const chunk = body.slice(mk.index + mk[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
      return mk[1] === 'theme' || mk[1] === 'json' ? { type: mk[1], data: JSON.parse(chunk) } : { type: mk[1], code: chunk };
    }) };
  }
  if (body.startsWith('<')) return { manifest, parts: [{ type: 'html', code: body }] };
  if (body.startsWith('{') || body.startsWith('[')) return { manifest, parts: [{ type: 'theme', data: JSON.parse(body) }] };
  return { manifest, parts: [{ type: 'js', code: body }] };
}

const text = (v) => (typeof v === 'string' ? v : v && (v.en || v.ru || Object.values(v)[0]));

export function validate(file, raw) {
  const errors = [];
  const warnings = [];
  let mod;
  try { mod = parse(raw); } catch (e) { return { errors: [`cannot parse: ${e.message}`], warnings }; }
  const m = mod.manifest || {};
  const id = path.basename(file, '.module');
  if (raw.length > MAX) errors.push(`file is larger than ${MAX} bytes`);
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/.test(m.id || '')) errors.push('manifest.id must match [a-z0-9][a-z0-9._-]{1,40}');
  else if (m.id !== id) errors.push(`manifest.id "${m.id}" must equal the file name "${id}"`);
  if (!text(m.name)) errors.push('manifest.name is required');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) errors.push('manifest.version must look like 1.0.0');
  if (!m.author) errors.push('manifest.author is required');
  if (!text(m.description)) errors.push('manifest.description is required');
  for (const k of ['name', 'description', 'about']) {
    if (m[k] && typeof m[k] === 'object') {
      const miss = LANGS.filter((l) => !m[k][l]);
      if (miss.length) warnings.push(`manifest.${k} has no translation for: ${miss.join(', ')}`);
    } else if (m[k]) warnings.push(`manifest.${k} is a plain string: add { ru, en, es, pt, uk } so every user reads it in their language`);
  }
  if (m.icon && !/^(data:image\/|https:\/\/)/.test(m.icon) && /^[a-z]/i.test(m.icon)) errors.push('manifest.icon must be an emoji, a data:image/ URL or an https:// URL');
  if (m.verified || m.official) errors.push('manifest.verified / manifest.official are reserved for the project');
  if (!mod.parts || !mod.parts.length) errors.push('the mod has no parts');
  for (const p of mod.parts || []) {
    if (!PART_TYPES.has(p.type)) errors.push(`unknown part type "${p.type}"`);
    if (p.type === 'js' && !/export\s+default\s+(async\s+)?function/.test(p.code || '')) errors.push('a js part must `export default function (tx) { … }`');
    if (/\b(localStorage\.getItem\(['"]telex\.session|exportSession|telex\.session)/.test(p.code || '')) errors.push('a mod must not touch the Telegram session');
    if (/document\.cookie|sendBeacon|new\s+WebSocket\(/.test(p.code || '')) warnings.push('the code uses cookies/beacons/websockets: explain why in the pull request');
  }
  return { errors, warnings, mod };
}

const check = process.argv.includes('--check');
const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.endsWith('.module')).sort() : [];
let failed = 0;
const index = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
  const { errors, warnings, mod } = validate(f, raw);
  for (const w of warnings) console.log(`warning ${f}: ${w}`);
  if (errors.length) { failed++; for (const e of errors) console.error(`error ${f}: ${e}`); continue; }
  const m = mod.manifest;
  index.push({ id: m.id, file: f, name: m.name, description: m.description, author: m.author, version: m.version, icon: m.icon || '', tags: m.tags || [], size: raw.length });
}
console.log(`${files.length} community mods, ${failed} with errors`);
if (failed) process.exit(1);
if (!check) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'mods'), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'mods', f));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), mods: index }, null, 1));
  console.log(`wrote ${path.relative(root, OUT)}/index.json`);
}
