// ИИ-чат: Telegram-style chat with streaming answers, markdown-lite, suggestions and history. Uses tx.ai (the user's Groq key).
export default function (tx) {
  var NAMES = { ru: 'Russian', en: 'English', es: 'Spanish', pt: 'Portuguese', uk: 'Ukrainian' };
  var SYSTEM = 'You are a friendly, clear assistant inside TeleX, a Telegram client. Answer in ' + (NAMES[tx.lang()] || 'English') + ' unless the user writes in another language. Keep answers short and useful. You may use **bold**, `code`, fenced code blocks and "- " lists; no headings, no tables, and never use emoji.';
  var T = function (o) { return tx.L(o); };
  var AVATAR = '<svg viewBox="0 0 96 96"><defs><linearGradient id="aicg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#2fc1e6"/></linearGradient></defs><circle cx="48" cy="48" r="48" fill="url(#aicg)"/><path d="M48 22l5.2 14.8L68 42l-14.8 5.2L48 62l-5.2-14.8L28 42l14.8-5.2z" fill="#fff"/><path d="M71 60l2.4 6.6L80 69l-6.6 2.4L71 78l-2.4-6.6L62 69l6.6-2.4z" fill="#fff" opacity=".85"/></svg>';
  var ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M12 7.3l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="currentColor" stroke="none"/></svg>';
  var history = tx.storage.get('history') || [];
  function save() { tx.storage.set('history', history.slice(-60)); }

  // ---- text → safe html (bold, `code`, ``` blocks, lists, links)
  function inline(src) {
    var h = tx.escapeHtml(src);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/(^|\n)#{1,3} ([^\n]+)/g, '$1<b>$2</b>').replace(/(^|\n)[-*] /g, '$1• ');
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return h.replace(/\n/g, '<br>');
  }
  function md(src) {
    var parts = String(src).split('```'), out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) out += '<pre class="aic-code">' + tx.escapeHtml(parts[i].replace(/^[\w+-]*\n/, '').replace(/\n$/, '')) + '</pre>';
      else out += inline(parts[i]);
    }
    return tx.emoji.html(out);
  }
  function clock(ts) { return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  function open() {
    var screen = tx.ui.openScreen({
      chat: true,
      title: T({ ru: 'ИИ-помощник', en: 'AI assistant', es: 'Asistente IA', pt: 'Assistente IA', uk: 'ШІ-помічник' }),
      subtitle: T({ ru: 'в сети', en: 'online', es: 'en línea', pt: 'online', uk: 'в мережі' }),
      avatar: AVATAR,
      actions: [{
        icon: 'more', title: T({ ru: 'Очистить чат', en: 'Clear chat', es: 'Vaciar chat', pt: 'Limpar chat', uk: 'Очистити чат' }),
        run: function () {
          if (!history.length) return;
          tx.confirm(T({ ru: 'Удалить всю переписку с ИИ?', en: 'Delete the whole conversation?', es: '¿Borrar toda la conversación?', pt: 'Apagar toda a conversa?', uk: 'Видалити все листування зі ШІ?' }), T({ ru: 'Удалить', en: 'Delete', es: 'Borrar', pt: 'Apagar', uk: 'Видалити' })).then(function (ok) { if (ok) { history = []; save(); draw(); } });
        }
      }],
      render: function (box, ctx) {
        var foot = ctx.footer;
        foot.innerHTML = '<div class="aic-comp"><div class="aic-field"><textarea rows="1" maxlength="4000" placeholder="' + tx.escapeHtml(T({ ru: 'Сообщение', en: 'Message', es: 'Mensaje', pt: 'Mensagem', uk: 'Повідомлення' })) + '"></textarea></div><button class="aic-send" disabled><i class="icon icon-send"></i></button></div>';
        var input = foot.querySelector('textarea'), btn = foot.querySelector('.aic-send');
        var list = document.createElement('div');
        list.className = 'aic-list';
        box.appendChild(list);
        var busy = false, abort = null;

        function nearBottom() { return box.scrollHeight - box.scrollTop - box.clientHeight < 140; }
        function toBottom(force) { if (force || nearBottom()) box.scrollTop = box.scrollHeight; }
        function status(typing) { ctx.setSubtitle(typing ? T({ ru: 'печатает…', en: 'typing…', es: 'escribiendo…', pt: 'digitando…', uk: 'друкує…' }) : (tx.ai.available() ? T({ ru: 'в сети', en: 'online', es: 'en línea', pt: 'online', uk: 'в мережі' }) : T({ ru: 'нужен ключ Groq', en: 'Groq key needed', es: 'falta la clave de Groq', pt: 'falta a chave do Groq', uk: 'потрібен ключ Groq' }))); }
        function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; }
        function sync() { var has = input.value.trim().length > 0 || busy; btn.disabled = !has; btn.classList.toggle('is-stop', busy); btn.innerHTML = busy ? '<span class="aic-stop"></span>' : '<i class="icon icon-send"></i>'; }

        function bubble(role, text, ts) {
          var row = document.createElement('div');
          row.className = 'aic-row ' + (role === 'user' ? 'is-me' : 'is-ai');
          var b = document.createElement('div');
          b.className = 'aic-msg';
          row.appendChild(b);
          function set(t, final) {
            b.innerHTML = '<div class="aic-body">' + (t ? md(t) : '<span class="aic-dots"><i></i><i></i><i></i></span>') + '</div>' + (final ? '<span class="aic-time">' + clock(ts) + '</span>' : '');
            if (final && role !== 'user') {
              var tools = document.createElement('div');
              tools.className = 'aic-tools';
              tools.innerHTML = '<button class="aic-copy" title="' + tx.escapeHtml(T({ ru: 'Копировать', en: 'Copy', es: 'Copiar', pt: 'Copiar', uk: 'Копіювати' })) + '"><i class="icon icon-copy"></i></button>';
              tools.firstChild.addEventListener('click', function () { try { navigator.clipboard.writeText(t); tx.toast(T({ ru: 'Скопировано', en: 'Copied', es: 'Copiado', pt: 'Copiado', uk: 'Скопійовано' })); } catch (e) {} });
              b.appendChild(tools);
            }
          }
          set(text, !!text);
          list.appendChild(row);
          return { row: row, set: set };
        }
        function groupTails() {
          var rows = list.querySelectorAll('.aic-row');
          rows.forEach(function (r, i) { var nxt = rows[i + 1]; r.classList.toggle('is-last', !nxt || nxt.className.split(' ')[1] !== r.className.split(' ')[1]); });
        }

        function draw() {
          list.innerHTML = '';
          status(false);
          if (!history.length) {
            var ok = tx.ai.available();
            var chips = [
              T({ ru: 'Объясни простыми словами, как работает Wi‑Fi', en: 'Explain in simple words how Wi‑Fi works', es: 'Explica con palabras simples cómo funciona el Wi‑Fi', pt: 'Explique com palavras simples como funciona o Wi‑Fi', uk: 'Поясни простими словами, як працює Wi‑Fi' }),
              T({ ru: 'Придумай 5 идей для поста в канале', en: 'Give me 5 ideas for a channel post', es: 'Dame 5 ideas para una publicación', pt: 'Dê 5 ideias para uma publicação', uk: 'Придумай 5 ідей для допису в каналі' }),
              T({ ru: 'Перепиши вежливее: «Ответь уже наконец»', en: 'Make it politer: “Answer me already”', es: 'Hazlo más cortés: «Contéstame ya»', pt: 'Reescreva mais educado: «Responda logo»', uk: 'Перепиши ввічливіше: «Відповідай уже нарешті»' }),
              T({ ru: 'Составь короткий план тренировки на неделю', en: 'Make a short weekly workout plan', es: 'Haz un plan de entrenamiento semanal corto', pt: 'Faça um plano de treino semanal curto', uk: 'Склади короткий план тренувань на тиждень' })
            ];
            var e = document.createElement('div');
            e.className = 'aic-empty';
            e.innerHTML = '<div class="aic-hero">' + AVATAR + '</div><h2>' + tx.escapeHtml(T({ ru: 'Чем помочь?', en: 'How can I help?', es: '¿En qué te ayudo?', pt: 'Como posso ajudar?', uk: 'Чим допомогти?' })) + '</h2><p>' + tx.escapeHtml(ok ? T({ ru: 'Спросите что угодно или выберите подсказку.', en: 'Ask anything or pick a suggestion.', es: 'Pregunta lo que quieras o elige una sugerencia.', pt: 'Pergunte qualquer coisa ou escolha uma sugestão.', uk: 'Запитайте будь-що або оберіть підказку.' }) : T({ ru: 'Для чата нужен бесплатный ключ Groq. Он хранится только на вашем устройстве.', en: 'The chat needs a free Groq key. It stays on your device only.', es: 'El chat necesita una clave gratuita de Groq. Se queda solo en tu dispositivo.', pt: 'O chat precisa de uma chave gratuita do Groq. Ela fica só no seu dispositivo.', uk: 'Для чату потрібен безкоштовний ключ Groq. Він зберігається лише на вашому пристрої.' })) + '</p>' + (ok ? '<div class="aic-chips">' + chips.map(function (c, i) { return '<button class="aic-chip" data-i="' + i + '">' + tx.escapeHtml(c) + '</button>'; }).join('') + '</div>' : '<button class="aic-cta">' + tx.escapeHtml(T({ ru: 'Добавить ключ', en: 'Add a key', es: 'Añadir clave', pt: 'Adicionar chave', uk: 'Додати ключ' })) + '</button>');
            e.addEventListener('click', function (ev) {
              var c = ev.target.closest('.aic-chip');
              if (c) { input.value = chips[Number(c.dataset.i)]; send(); return; }
              if (ev.target.closest('.aic-cta')) { ctx.el.querySelector('[data-close]').click(); setTimeout(function () { window.TelegramX.openSettingsPage('ai'); }, 380); }
            });
            list.appendChild(e);
            sync();
            return;
          }
          history.forEach(function (m) { bubble(m.role, m.content, m.t); });
          groupTails();
          sync();
          toBottom(true);
        }

        function send() {
          if (busy) { if (abort) abort.abort(); return; }
          var text = input.value.trim();
          if (!text) return;
          if (!tx.ai.available()) { draw(); tx.toast(T({ ru: 'Нужен ключ Groq: Настройки → Ключ Groq', en: 'A Groq key is needed: Settings → Groq key', es: 'Se necesita una clave de Groq', pt: 'É preciso uma chave do Groq', uk: 'Потрібен ключ Groq: Налаштування → Ключ Groq' })); return; }
          if (!history.length) list.innerHTML = '';
          input.value = ''; resize();
          history.push({ role: 'user', content: text, t: Date.now() });
          bubble('user', text, Date.now());
          var pending = bubble('assistant', '', 0);
          groupTails(); toBottom(true);
          busy = true; abort = new AbortController(); status(true); sync();
          var partial = '';
          tx.ai.stream(history.slice(-14).map(function (m) { return { role: m.role, content: m.content }; }), { system: SYSTEM, maxTokens: 900, temperature: 0.6, signal: abort.signal }, function (t) { partial = t; pending.set(t, false); toBottom(false); }).then(function (full) {
            partial = full || partial;
          }).catch(function (e) {
            if (!(e && e.name === 'AbortError')) {
              pending.row.classList.add('is-error');
              pending.set('', false);
              pending.row.querySelector('.aic-body').innerHTML = '<i class="icon icon-warning"></i>' + tx.escapeHtml(e && e.message ? e.message : 'error');
              history.pop();
              return 'err';
            }
          }).then(function (err) {
            if (err !== 'err') {
              if (partial) { history.push({ role: 'assistant', content: partial, t: Date.now() }); pending.set(partial, true); }
              else { pending.row.remove(); }
              save();
            } else save();
            busy = false; abort = null; status(false); sync(); groupTails(); toBottom(false);
          });
        }

        btn.addEventListener('click', send);
        input.addEventListener('input', function () { resize(); sync(); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } });
        draw();
        input.addEventListener('focus', function () { setTimeout(function () { toBottom(true); }, 250); });
      }
    });
    return screen;
  }
  tx.ui.addDockItem({ id: 'ai-chat', title: T({ ru: 'ИИ', en: 'AI', es: 'IA', pt: 'IA', uk: 'ШІ' }), icon: ICON, run: open });
  tx.ext.addMenu('settings', function () { return [{ title: T({ ru: 'ИИ-помощник', en: 'AI assistant', es: 'Asistente IA', pt: 'Assistente IA', uk: 'ШІ-помічник' }), sub: T({ ru: 'Чат через ваш ключ Groq', en: 'Chat through your Groq key', es: 'Chat con tu clave de Groq', pt: 'Chat com sua chave do Groq', uk: 'Чат через ваш ключ Groq' }), icon: 'st-features', color: 'PURPLE', run: open }]; });
}
