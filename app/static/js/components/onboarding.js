// First-run sheet after login: theme → language → (optional) free Groq key.
// Shown once per login (logout resets it). Choosing a language reloads the page and the sheet resumes on the next step.
import { t, lang, LANGUAGES } from '../i18n.js';
import { state } from '../state.js';
import { getPrefs, setPref, applyAppearance } from '../core/prefs.js';
import { tgDialog } from '../core/dialog.js';
import { getKey, setKey, testKey, looksLikeKey, GROQ_KEYS_URL } from '../core/groq.js';
import { escapeHtml, showToast } from '../utils.js';

const DONE = 'telex.onboarded';
const ASKED = 'telex.groq.asked';
const RESUME = 'telex.onb.step';
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

export const resetOnboarding = () => { ls.del(DONE); ls.del(ASKED); ls.del(RESUME); };

let open = false;

export function maybeOnboard() {
  if (open || !state.isAuth || ls.get(DONE) === '1') return;
  if (document.getElementById('screen-wall') === null) return;
  show(Number(ls.get(RESUME)) || 0);
}

const THEMES = [
  ['auto', 'Как на устройстве'],
  ['light', 'Дневная'],
  ['dark', 'Ночная'],
];

function show(startStep) {
  open = true;
  ls.del(RESUME);
  let step = startStep;
  const el = document.createElement('div');
  el.className = 'tx-onb-back';
  el.innerHTML = '<div class="tx-onb" role="dialog" aria-modal="true"></div>';
  document.body.append(el);
  const box = el.firstElementChild;

  const finish = () => {
    ls.set(DONE, '1');
    el.classList.add('is-out');
    setTimeout(() => { el.remove(); open = false; }, 220);
  };

  const preview = (id) => {
    const dark = id === 'dark' || (id === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
    const c = dark ? ['#000', '#212123', '#2b3e63'] : ['#f0f0f5', '#fff', '#d7e5ff'];
    return `<span class="tx-onb-pv" style="background:${c[0]}"><i style="background:${c[1]}"></i><i style="background:${c[2]};margin-left:auto"></i><i style="background:${c[1]};width:46%"></i></span>`;
  };

  const steps = [
    () => {
      const cur = getPrefs().theme || 'auto';
      return {
        title: t('Оформление'),
        sub: t('Выберите тему. Её можно изменить позже в настройках.'),
        body: `<div class="tx-onb-themes">${THEMES.map(([id, label]) => `<button class="tx-onb-theme${cur === id ? ' is-on' : ''}" data-theme="${id}">${preview(id)}<span>${t(label)}</span></button>`).join('')}</div>`,
        next: t('Далее'),
      };
    },
    () => ({
      title: t('Язык'),
      sub: t('Приложение перезагрузится, чтобы применить язык.'),
      body: `<div class="tx-onb-list">${LANGUAGES.map((l) => `<button class="tx-onb-opt${l.code === lang() ? ' is-on' : ''}" data-lang="${l.code}"><b>${escapeHtml(l.name)}</b><small>${escapeHtml(l.english)}</small><i></i></button>`).join('')}</div>`,
      next: t('Далее'),
    }),
    () => ({
      title: t('Ключ Groq (по желанию)'),
      sub: t('Бесплатный ключ нужен для умных функций. Сначала — проверка модов на ошибки и опасный код перед установкой.'),
      body: `<label class="tx-onb-field"><input id="onb-key" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_…" value="${escapeHtml(getKey())}"></label>
        <div class="tx-onb-err" id="onb-err"></div>
        <button class="tx-onb-link" data-a="get">${t('Получить бесплатный ключ')} ↗</button>
        <p class="tx-onb-note">${t('Ключ хранится только на этом устройстве и отправляется только в Groq.')}</p>`,
      next: t('Готово'),
      skip: t('Пропустить'),
    }),
  ];

  const draw = () => {
    const s = steps[step]();
    box.innerHTML = `
      <div class="tx-onb-grab"></div>
      <div class="tx-onb-dots">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <h2>${escapeHtml(s.title)}</h2>
      <p class="tx-onb-sub">${escapeHtml(s.sub)}</p>
      <div class="tx-onb-body">${s.body}</div>
      <div class="tx-onb-btns">
        ${s.skip ? `<button data-a="skip">${escapeHtml(s.skip)}</button>` : step > 0 ? `<button data-a="back">${t('Назад')}</button>` : '<span></span>'}
        <button class="is-main" data-a="next">${escapeHtml(s.next)}</button>
      </div>`;
  };

  const persuade = async () => {
    // first refusal: explain; second refusal: never ask again
    if (ls.get(ASKED) === '1') return true;
    ls.set(ASKED, '1');
    const again = await tgDialog({
      title: t('Это бесплатно'),
      text: t('Ключ Groq абсолютно бесплатный: регистрация занимает минуту, банковская карта не нужна. С ним TeleX проверяет моды перед установкой, а умные функции работают быстрее и удобнее.'),
      ok: t('Получить ключ'),
      cancel: t('Пропустить'),
    });
    if (again) { window.open(GROQ_KEYS_URL, '_blank', 'noopener'); return false; }
    return true;
  };

  const saveKey = async () => {
    const input = box.querySelector('#onb-key');
    const err = box.querySelector('#onb-err');
    const val = (input.value || '').trim();
    if (!val) return persuade();
    if (!looksLikeKey(val)) { err.textContent = t('Ключ начинается с gsk_ — скопируйте его целиком.'); return false; }
    const btn = box.querySelector('[data-a=next]');
    btn.disabled = true;
    const res = await testKey(val);
    btn.disabled = false;
    if (res === 'invalid') { err.textContent = t('Groq не принял этот ключ. Проверьте, что скопировали его полностью.'); return false; }
    setKey(val);
    showToast(res === 'ok' ? t('Ключ сохранён') : t('Ключ сохранён, но проверить его сейчас не удалось'));
    return true;
  };

  box.addEventListener('click', async (e) => {
    const th = e.target.closest('.tx-onb-theme');
    if (th) {
      setPref('theme', th.dataset.theme);
      applyAppearance();
      box.querySelectorAll('.tx-onb-theme').forEach((b) => b.classList.toggle('is-on', b === th));
      return;
    }
    const lg = e.target.closest('.tx-onb-opt');
    if (lg) {
      if (lg.dataset.lang === lang() && getPrefs().lang === lg.dataset.lang) return;
      ls.set(RESUME, '2');
      setPref('lang', lg.dataset.lang);
      location.reload();
      return;
    }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'get') { window.open(GROQ_KEYS_URL, '_blank', 'noopener'); return; }
    if (a.dataset.a === 'back') { step = Math.max(0, step - 1); draw(); return; }
    if (a.dataset.a === 'skip' || (a.dataset.a === 'next' && step === steps.length - 1)) {
      if (a.dataset.a === 'skip') { if (await persuade()) finish(); return; }
      if (await saveKey()) finish();
      return;
    }
    if (a.dataset.a === 'next') {
      if (step === 0) setPref('theme', getPrefs().theme || 'auto');
      step += 1; draw();
    }
  });
  draw();
}
