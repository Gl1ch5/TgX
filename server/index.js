// TeleX mod store API — zero dependencies, Node 18+. Stores mods in one JSON file.
//   PORT=8787 HOST=127.0.0.1 DATA_DIR=./data ADMIN_TOKEN=secret node index.js
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_MODULE = 1.5 * 1024 * 1024;
const FILE = path.join(DATA_DIR, 'mods.json');
const CATEGORIES = ['theme', 'feed', 'widget', 'ai', 'tools'];

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { mods: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  }, 300);
}
process.on('SIGTERM', () => { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} process.exit(0); });

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const day = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- rate limit (per IP, in memory)
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = `${ip}|${key}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(k, arr); return true; }
  arr.push(now); hits.set(k, arr);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// ---------------------------------------------------------------- module parsing + safety scan
function parseModule(text) {
  text = String(text || '').replace(/^﻿/, '').trim();
  let manifest = null; let body = '';
  if (text.startsWith('{')) {
    const j = JSON.parse(text);
    manifest = j.manifest; body = JSON.stringify(j.parts || []);
  } else {
    const m = text.match(/^(?:\/\/|\/\*|<!--)\s*@manifest\s+(\{[^\n]*\})/);
    if (!m) throw new Error('No manifest: the file must be a JSON bundle or start with an "@manifest {…}" comment');
    manifest = JSON.parse(m[1]); body = text;
  }
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid manifest');
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/.test(String(manifest.id || ''))) throw new Error('Invalid id (use a-z, 0-9, ".", "_", "-")');
  const L = (v) => (typeof v === 'string' ? v : v && (v.en || v.ru || Object.values(v)[0])) || '';
  if (!L(manifest.name)) throw new Error('The manifest needs a name');
  return { manifest, body };
}

const SEVERE = [
  [/telex\.session|exportSession|StringSession/i, 'reads the Telegram session'],
  [/localStorage\s*\.\s*(getItem|setItem)\s*\(\s*['"]telex\.(session|groq)/i, 'reads the app secrets'],
  [/\batob\s*\([^)]*\)\s*\)\s*\(/, 'obfuscated code'],
];
const WARN = [
  [/\beval\s*\(|new\s+Function\s*\(/, 'uses eval / new Function'],
  [/document\.write\s*\(/, 'uses document.write'],
  [/<script[^>]+src\s*=\s*['"]https?:\/\//i, 'loads a remote script'],
  [/import\s*\(\s*['"]https?:\/\//, 'imports remote code'],
  [/fetch\s*\(\s*['"]https?:\/\/(?!api\.groq\.com)/, 'sends network requests to an external host'],
  [/XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket/, 'uses low-level network access'],
];
function scan(body) {
  for (const [rx, why] of SEVERE) if (rx.test(body)) return { severe: why, flags: [] };
  return { severe: null, flags: WARN.filter(([rx]) => rx.test(body)).map(([, w]) => w) };
}

// ---------------------------------------------------------------- views
const avg = (m) => { const v = Object.values(m.ratings || {}); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0; };
function summary(m) {
  const mf = m.manifest;
  return {
    id: m.id, name: mf.name, version: mf.version || '1.0.0', description: mf.description || '', icon: mf.icon || '', author: m.authorName || mf.author || '',
    tags: m.tags, category: m.category, preview: mf.preview || null, permissions: mf.permissions || [], flags: m.flags || [],
    downloads: m.downloads || 0, likes: Object.keys(m.likes || {}).length, rating: avg(m), ratings: Object.keys(m.ratings || {}).length,
    createdAt: m.createdAt, updatedAt: m.updatedAt, size: m.size,
  };
}
const detail = (m, device) => ({ ...summary(m), about: m.manifest.about || '', conflicts: m.manifest.conflicts || [], liked: !!(m.likes || {})[device], myRating: (m.ratings || {})[device] || 0 });
const visible = () => Object.values(db.mods).filter((m) => m.status === 'published');
const score = (m) => Math.log10((m.downloads || 0) + 1) * 2 + Object.keys(m.likes || {}).length * 0.6 + avg(m) * (Object.keys(m.ratings || {}).length ? 1 : 0);

function categoryOf(mf) {
  const tags = (mf.tags || []).map(String);
  const hit = CATEGORIES.find((c) => tags.includes(c));
  if (hit) return hit;
  return (mf.permissions || []).includes('ai') ? 'ai' : 'tools';
}

function recommend(installed, limit, device) {
  const have = new Set(installed);
  const mine = visible().filter((m) => have.has(m.id));
  const tagw = new Map();
  mine.forEach((m) => m.tags.forEach((t) => tagw.set(t, (tagw.get(t) || 0) + 1)));
  return visible().filter((m) => !have.has(m.id)).map((m) => ({ m, s: score(m) + m.tags.reduce((a, t) => a + (tagw.get(t) || 0) * 3, 0) + (m.createdAt > Date.now() - 14 * 86400e3 ? 1.5 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map((x) => summary(x.m));
}

// ---------------------------------------------------------------- http helpers
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-device,x-author-token,x-admin-token', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_MODULE + 4096) { reject(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { code: 400 })); } });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------- routes
async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const device = String(req.headers['x-device'] || '').slice(0, 64);
  const q = url.searchParams;
  const validDevice = /^[A-Za-z0-9_-]{16,64}$/.test(device);

  if (!url.pathname.startsWith('/api')) return send(res, 404, { error: 'not found' });
  if (req.method === 'GET' && !parts.length || parts[0] === 'health') return send(res, 200, { ok: true, mods: visible().length });

  if (parts[0] === 'categories') {
    const c = {}; visible().forEach((m) => { c[m.category] = (c[m.category] || 0) + 1; });
    return send(res, 200, { categories: CATEGORIES.map((id) => ({ id, count: c[id] || 0 })) });
  }

  if (parts[0] === 'home' && req.method === 'GET') {
    const installed = String(q.get('installed') || '').split(',').filter(Boolean).slice(0, 100);
    const all = visible();
    const top = [...all].sort((a, b) => score(b) - score(a));
    return send(res, 200, {
      featured: top.slice(0, 5).map(summary),
      recommended: recommend(installed, 12, device),
      trending: [...all].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 12).map(summary),
      newest: [...all].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12).map(summary),
      categories: CATEGORIES.map((id) => ({ id, count: all.filter((m) => m.category === id).length })),
      total: all.length,
    });
  }

  if (parts[0] === 'recommendations') return send(res, 200, { items: recommend(String(q.get('installed') || '').split(',').filter(Boolean), Math.min(Number(q.get('limit')) || 12, 30), device) });

  if (parts[0] === 'mods' && parts.length === 1 && req.method === 'GET') {
    const text = String(q.get('q') || '').toLowerCase().trim();
    const cat = q.get('category');
    const sort = q.get('sort') || 'popular';
    let list = visible().filter((m) => (!cat || cat === 'all' || m.category === cat) && (!text || `${JSON.stringify(m.manifest.name)} ${JSON.stringify(m.manifest.description || '')} ${m.tags.join(' ')} ${m.id}`.toLowerCase().includes(text)));
    list.sort(sort === 'new' ? (a, b) => b.createdAt - a.createdAt : sort === 'top' ? (a, b) => avg(b) - avg(a) || b.downloads - a.downloads : sort === 'downloads' ? (a, b) => b.downloads - a.downloads : (a, b) => score(b) - score(a));
    const limit = Math.min(Number(q.get('limit')) || 30, 100); const offset = Number(q.get('offset')) || 0;
    return send(res, 200, { total: list.length, items: list.slice(offset, offset + limit).map(summary) });
  }

  // publish / update
  if (parts[0] === 'mods' && parts.length === 1 && req.method === 'POST') {
    if (limited(ip, 'publish', 10, 3600e3)) return send(res, 429, { error: 'Too many publications, try again later' });
    const token = String(req.headers['x-author-token'] || '');
    if (token.length < 24) return send(res, 400, { error: 'Missing author token' });
    const body = await readBody(req);
    const text = String(body.module || '');
    if (!text || text.length > MAX_MODULE) return send(res, 400, { error: 'The module is empty or larger than 1.5 MB' });
    let parsed;
    try { parsed = parseModule(text); } catch (e) { return send(res, 400, { error: e.message }); }
    const sc = scan(text);
    if (sc.severe) return send(res, 400, { error: `Rejected: ${sc.severe}` });
    const mf = parsed.manifest;
    delete mf.verified; delete mf.official; // only the project may mark mods
    const prev = db.mods[mf.id];
    if (prev && prev.tokenHash !== sha(token)) return send(res, 403, { error: 'This id belongs to another author' });
    if (!prev && Object.keys(db.mods).length >= 5000) return send(res, 507, { error: 'The store is full' });
    const now = Date.now();
    const tags = [...new Set((mf.tags || []).map((t) => String(t).toLowerCase().slice(0, 20)).slice(0, 8))];
    const m = prev || { id: mf.id, downloads: 0, likes: {}, ratings: {}, reports: {}, createdAt: now, status: 'published' };
    Object.assign(m, { manifest: mf, file: text, tags, category: categoryOf({ ...mf, tags }), flags: sc.flags, authorName: String(body.authorName || mf.author || '').slice(0, 40), tokenHash: sha(token), updatedAt: now, size: text.length });
    db.mods[mf.id] = m; save();
    return send(res, prev ? 200 : 201, { ok: true, mod: detail(m, device), updated: !!prev });
  }

  if (parts[0] === 'mods' && parts[1]) {
    const m = db.mods[parts[1]];
    if (!m || (m.status !== 'published' && String(req.headers['x-admin-token'] || '') !== ADMIN_TOKEN)) return send(res, 404, { error: 'not found' });
    const act = parts[2];
    if (req.method === 'GET' && !act) return send(res, 200, detail(m, device));
    if (req.method === 'GET' && act === 'file') return send(res, 200, m.file, 'text/plain; charset=utf-8');
    if (req.method === 'DELETE' && !act) {
      const ok = (ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN) || sha(req.headers['x-author-token'] || '') === m.tokenHash;
      if (!ok) return send(res, 403, { error: 'Not allowed' });
      delete db.mods[m.id]; save(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST') {
      if (limited(ip, 'mutate', 200, 3600e3)) return send(res, 429, { error: 'Too many requests' });
      if (!validDevice) return send(res, 400, { error: 'Missing device id' });
      const body = await readBody(req).catch(() => ({}));
      if (act === 'download') {
        m.downloaded = m.downloaded || {};
        const k = `${device}|${day()}`;
        if (!m.downloaded[k]) { m.downloaded[k] = 1; m.downloads = (m.downloads || 0) + 1; if (Object.keys(m.downloaded).length > 2000) m.downloaded = {}; save(); }
        return send(res, 200, { downloads: m.downloads });
      }
      if (act === 'like') { if (body.on === false) delete m.likes[device]; else m.likes[device] = 1; save(); return send(res, 200, { likes: Object.keys(m.likes).length, liked: !!m.likes[device] }); }
      if (act === 'rate') {
        const v = Math.round(Number(body.value));
        if (!(v >= 1 && v <= 5)) return send(res, 400, { error: 'value 1-5' });
        m.ratings[device] = v; save(); return send(res, 200, { rating: avg(m), ratings: Object.keys(m.ratings).length, myRating: v });
      }
      if (act === 'report') {
        m.reports[device] = String(body.reason || '').slice(0, 200) || 'reported'; if (Object.keys(m.reports).length >= 3) m.status = 'hidden'; save();
        return send(res, 200, { ok: true });
      }
    }
  }
  return send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => send(res, e.code && Number.isInteger(e.code) ? e.code : 500, { error: e.message || 'error' }));
}).listen(PORT, HOST, () => console.log(`TeleX mod store API on http://${HOST}:${PORT}  (${visible().length} mods, data: ${DATA_DIR})`));
