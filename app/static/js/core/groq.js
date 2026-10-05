// Groq (https://groq.com) — the user's own free API key. Used for cheap, fast checks (first of all: reviewing mods before install).
// The key lives only in this browser (localStorage) and goes only to api.groq.com.
import { lang, LANGUAGES } from '../i18n.js';

const KEY = 'telex.groq.key';
const API = 'https://api.groq.com/openai/v1';
/** Free-plan models (console.groq.com/docs/rate-limits): tried in order. */
const MODELS = ['openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
export const GROQ_KEYS_URL = 'https://console.groq.com/keys';

export const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const hasKey = () => !!getKey();
export function setKey(k) {
  try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch {}
}
export const looksLikeKey = (k) => /^gsk_[A-Za-z0-9]{20,}$/.test(String(k || '').trim());

/** 'ok' | 'invalid' | 'offline' */
export async function testKey(key) {
  try {
    const r = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401 || r.status === 403) return 'invalid';
    return r.ok ? 'ok' : 'offline';
  } catch { return 'offline'; }
}

export async function groqChat(messages, opts = {}) {
  const { signal, json = true, maxTokens = 900 } = opts;
  let lastErr;
  for (const model of MODELS) {
    const body = { model, messages, temperature: opts.temperature ?? 0.1, max_completion_tokens: maxTokens };
    if (json) body.response_format = { type: 'json_object' };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
    try {
      const r = await fetch(`${API}/chat/completions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` }, body: JSON.stringify(body) });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error('The Groq key was rejected'), { fatal: true, code: 'key' });
      if (r.status === 429) throw Object.assign(new Error('Groq free limit reached, try again in a minute'), { fatal: true, code: 'limit' });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; } // model missing / not allowed → next one
      const data = await r.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      if (e.fatal || e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('failed');
}

const REVIEW_RULES = `You are a security and quality reviewer for mods of "TeleX", a web client for Telegram. A mod is a JSON bundle: manifest + parts (js / html / css / theme / json). JS runs in the app with full access to the user's Telegram account via the object tx.
Judge ONLY what you can see. Report real problems, not style.
DANGEROUS (verdict "bad"): sending data (session, messages, phone, tokens, localStorage) to any external host; reading localStorage keys of the app (telex.session*); eval / new Function / loading remote scripts; tx.api calls that write (send, delete, leave, edit) without being the mod's visible purpose; obfuscated code; keyloggers; hiding what the mod does.
BREAKS THE APP (verdict "warn"): position:fixed/absolute elements at top:0..~50px or bottom:0 without var(--tx-safe-top)/var(--tx-safe-bottom) (they cover the phone's status bar or the dock); full-screen overlays or pointer-events on large areas; display:none/visibility on .tx-dock, .tx-mainbar, #app, body, html; transform/filter/overflow/zoom on html, body, #app or .tx-screen; global selectors without prefix (div, button, *, body *); hard-coded white/black text colours that vanish in day or night mode; timers or global listeners that are never cleaned (no tx.onStop); infinite loops, synchronous heavy work per post; syntax errors or template literals mangled by copying.
Otherwise verdict "ok".
Answer with ONE JSON object and nothing else: {"verdict":"ok"|"warn"|"bad","summary":"one sentence","issues":["short issue 1","short issue 2"]}. At most 5 issues, each under 140 characters, no code.`;

/** → { verdict, summary, issues[] } or null when the check could not run (no key, offline, limit). */
export async function reviewMod(bundle, { signal } = {}) {
  if (!hasKey()) return null;
  const language = (LANGUAGES.find((l) => l.code === lang()) || {}).english || 'English';
  const code = JSON.stringify({ manifest: { id: bundle.manifest?.id, name: bundle.manifest?.name, permissions: bundle.manifest?.permissions }, parts: bundle.parts }, null, 1);
  const clipped = code.length > 14000 ? code.slice(0, 9000) + '\n/* … cut … */\n' + code.slice(-4000) : code; // free plan: 8K tokens per minute
  try {
    const out = await groqChat([{ role: 'system', content: REVIEW_RULES + `\nWrite "summary" and "issues" in ${language}.` }, { role: 'user', content: clipped }], { signal });
    const m = out.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : out);
    const verdict = ['ok', 'warn', 'bad'].includes(j.verdict) ? j.verdict : 'warn';
    return { verdict, summary: String(j.summary || '').slice(0, 300), issues: (Array.isArray(j.issues) ? j.issues : []).slice(0, 5).map((x) => String(x).slice(0, 200)) };
  } catch { return null; }
}
