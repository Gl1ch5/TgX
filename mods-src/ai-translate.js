// Post translator: a sheet with the original and a streamed translation, copy button and language chips. Uses tx.ai (the user's Groq key).
export default function (tx) {
  var NAMES = { ru: 'Russian', en: 'English', es: 'Spanish', pt: 'Portuguese', uk: 'Ukrainian' };
  var LABEL = { ru: 'Русский', en: 'English', es: 'Español', pt: 'Português', uk: 'Українська' };
  var T = function (o) { return tx.L(o); };
  function plain(post) { return String((post && (post.text || post.message)) || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
  function open(post) {
    var text = plain(post);
    if (!text) { tx.toast(T({ ru: 'В посте нет текста', en: 'This post has no text', es: 'La publicación no tiene texto', pt: 'A publicação não tem texto', uk: 'У дописі немає тексту' })); return; }
    if (!tx.ai.available()) { tx.toast(T({ ru: 'Нужен ключ Groq: Настройки → Ключ Groq', en: 'A Groq key is needed: Settings → Groq key', es: 'Se necesita una clave de Groq: Ajustes → Clave de Groq', pt: 'É preciso uma chave do Groq: Configurações → Chave do Groq', uk: 'Потрібен ключ Groq: Налаштування → Ключ Groq' })); return; }
    tx.ui.openScreen({
      title: T({ ru: 'Перевод', en: 'Translation', es: 'Traducción', pt: 'Tradução', uk: 'Переклад' }),
      render: function (box) {
        var target = tx.lang(), abort = null, result = '';
        box.innerHTML = '<div class="trl-chips"></div><div class="trl-card trl-out"><div class="trl-label"></div><div class="trl-text"></div><div class="trl-actions"><button class="trl-copy"><i class="icon icon-copy"></i><span></span></button></div></div><div class="trl-card trl-src"><div class="trl-label"></div><div class="trl-text is-clamp"></div><button class="trl-more"></button></div>';
        var chips = box.querySelector('.trl-chips'), outLabel = box.querySelector('.trl-out .trl-label'), outText = box.querySelector('.trl-out .trl-text'), copy = box.querySelector('.trl-copy');
        var srcLabel = box.querySelector('.trl-src .trl-label'), srcText = box.querySelector('.trl-src .trl-text'), more = box.querySelector('.trl-more');
        srcLabel.textContent = T({ ru: 'Оригинал', en: 'Original', es: 'Original', pt: 'Original', uk: 'Оригінал' });
        srcText.textContent = text;
        more.textContent = T({ ru: 'Показать полностью', en: 'Show more', es: 'Mostrar más', pt: 'Mostrar mais', uk: 'Показати повністю' });
        more.addEventListener('click', function () { var o = srcText.classList.toggle('is-clamp'); more.textContent = o ? T({ ru: 'Показать полностью', en: 'Show more', es: 'Mostrar más', pt: 'Mostrar mais', uk: 'Показати повністю' }) : T({ ru: 'Свернуть', en: 'Show less', es: 'Mostrar menos', pt: 'Mostrar menos', uk: 'Згорнути' }); });
        copy.querySelector('span').textContent = T({ ru: 'Копировать', en: 'Copy', es: 'Copiar', pt: 'Copiar', uk: 'Копіювати' });
        copy.addEventListener('click', function () { if (result) { try { navigator.clipboard.writeText(result); tx.toast(T({ ru: 'Скопировано', en: 'Copied', es: 'Copiado', pt: 'Copiado', uk: 'Скопійовано' })); } catch (e) {} } });
        chips.innerHTML = Object.keys(NAMES).map(function (c) { return '<button data-c="' + c + '">' + tx.escapeHtml(LABEL[c]) + '</button>'; }).join('');
        chips.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) { target = b.dataset.c; run(); } });
        function run() {
          if (abort) abort.abort();
          abort = new AbortController();
          result = '';
          chips.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.c === target); });
          outLabel.textContent = T({ ru: 'Перевод · ', en: 'Translation · ', es: 'Traducción · ', pt: 'Tradução · ', uk: 'Переклад · ' }) + LABEL[target];
          outText.innerHTML = '<span class="trl-dots"><i></i><i></i><i></i></span>';
          tx.ai.stream([{ role: 'user', content: text.slice(0, 6000) }], { system: 'Translate the user text into ' + NAMES[target] + '. Keep meaning, names, links, emoji and line breaks. Reply with the translation only.', maxTokens: 1500, temperature: 0.2, signal: abort.signal }, function (t) { result = t; outText.textContent = t; }).catch(function (e) {
            if (e && e.name === 'AbortError') return;
            outText.innerHTML = '<span class="trl-err"><i class="icon icon-warning"></i> ' + tx.escapeHtml(e && e.message || 'error') + '</span>';
          });
        }
        run();
      }
    });
  }
  tx.ui.add('post.actions', { id: 'translate', icon: 'language', title: T({ ru: 'Перевести', en: 'Translate', es: 'Traducir', pt: 'Traduzir', uk: 'Перекласти' }), run: function (ctx) { open(ctx && ctx.post); } });
  tx.ext.addMenu('post', function (c) { return [{ label: T({ ru: 'Перевести', en: 'Translate', es: 'Traducir', pt: 'Traduzir', uk: 'Перекласти' }), icon: 'language', run: function () { open(c.post); } }]; });
}
