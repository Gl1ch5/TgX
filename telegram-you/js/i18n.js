/**
 * ====================================================================
 * I18N — the interface language.
 *
 * Russian is the source language: the Russian text is the key,
 *   t('Войти в Telegram')            → "Log in to Telegram" (English)
 *   t('Скрыто каналов: {n}', {n: 3}) → "Hidden channels: 3"
 *   tn('{n} комментарий', 5)         → plural form for the language
 * A missing translation falls back to the Russian text. Works on the page
 * and inside the Telegram worker (it only needs localStorage + navigator).
 * ====================================================================
 */

import { getPrefs } from './core/prefs.js';
import { EN } from './lang/en.js';
import { ES } from './lang/es.js';
import { PT } from './lang/pt.js';
import { UK } from './lang/uk.js';

export const LANGUAGES = [
  { code: 'ru', name: 'Русский', english: 'Russian', locale: 'ru-RU' },
  { code: 'en', name: 'English', english: 'English', locale: 'en-US' },
  { code: 'es', name: 'Español', english: 'Spanish', locale: 'es-ES' },
  { code: 'pt', name: 'Português (Brasil)', english: 'Portuguese (Brazil)', locale: 'pt-BR' },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', locale: 'uk-UA' },
];

const DICTS = { en: EN, es: ES, pt: PT, uk: UK };
let cache = { pref: null, code: 'ru' };

/** The language in use: the saved choice, else the browser's, else English. */
export function lang() {
  let pref = 'auto';
  try { pref = getPrefs().lang || 'auto'; } catch {}
  if (cache.pref === pref) return cache.code;
  let code = pref;
  if (code === 'auto') {
    const wanted = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    code = 'en';
    for (const w of wanted) {
      const base = String(w || '').toLowerCase().split('-')[0];
      if (LANGUAGES.some((l) => l.code === base)) { code = base; break; }
    }
  } else if (!LANGUAGES.some((l) => l.code === code)) {
    code = 'en';
  }
  cache = { pref, code };
  return code;
}

export const locale = () => (LANGUAGES.find((l) => l.code === lang()) || LANGUAGES[0]).locale;

const fill = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : text);

export function t(key, params) {
  const code = lang();
  let out = key;
  if (code !== 'ru') {
    const v = DICTS[code] && DICTS[code][key];
    if (typeof v === 'string') out = v;
  }
  return fill(out, params);
}

/**
 * Plural: the dictionary holds the forms in the language's own order
 * (ru/uk: one, few, many; en/es/pt: one, other). Russian keys carry the
 * three Russian forms: tn(['{n} комментарий', '{n} комментария', '{n} комментариев'], n).
 */
export function tn(forms, n, params = {}) {
  const code = lang();
  const abs = Math.abs(n);
  const ruForm = () => {
    const m10 = abs % 10, m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return 0;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
    return 2;
  };
  let chosen;
  if (code === 'ru') {
    chosen = forms[ruForm()];
  } else {
    const entry = DICTS[code] && DICTS[code][forms[0]];
    const list = Array.isArray(entry) ? entry : null;
    if (!list) {
      chosen = forms[ruForm()];
    } else if (code === 'uk') {
      chosen = list[ruForm()] || list[list.length - 1];
    } else {
      chosen = list[abs === 1 ? 0 : 1] || list[0];
    }
  }
  return fill(chosen, { n, ...params });
}

// ---------------------------------------------------------------- static HTML

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const HAS_CYR = /[А-Яа-яЁё]/;

/** Translate the static text of index.html (and anything else inserted as plain markup). */
export function translateTree(root = document.body) {
  if (!root || lang() === 'ru') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const raw = node.nodeValue;
    if (!HAS_CYR.test(raw)) continue;
    const key = raw.trim();
    const tr = t(key);
    if (tr !== key) node.nodeValue = raw.replace(key, tr);
  }
  root.querySelectorAll('*').forEach((el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && HAS_CYR.test(v)) {
        const tr = t(v.trim());
        if (tr !== v.trim()) el.setAttribute(a, tr);
      }
    }
  });
}

export function applyDocumentLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang();
  if (lang() !== 'ru') {
    const title = t(document.title);
    if (title) document.title = title;
  }
}

/** Dev helper: every key that has no translation in `code`. */
export function missing(code, keys) {
  return keys.filter((k) => !(DICTS[code] && DICTS[code][k] !== undefined));
}
