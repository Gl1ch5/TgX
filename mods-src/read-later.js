// Read later: a checkable item in the post menu, a mark on the card, a toast with Undo and a tidy list page in settings.
export default function (tx) {
  var T = function (o) { return tx.L(o); };
  var UNDO = T({ ru: 'Отмена', en: 'Undo', es: 'Deshacer', pt: 'Desfazer', uk: 'Скасувати' });
  function ids() { return tx.storage.get('items') || []; }
  function has(id) { return ids().some(function (x) { return x.id === id; }); }
  function put(post) {
    var list = ids().filter(function (x) { return x.id !== post.id; });
    list.unshift({ id: post.id, url: post.tg_url || '', text: String(post.text || '').replace(/\s+/g, ' ').slice(0, 160), channel: post.channel_title || post.channel_name || '', at: Date.now() });
    tx.storage.set('items', list.slice(0, 200));
  }
  function drop(id) { tx.storage.set('items', ids().filter(function (x) { return x.id !== id; })); }
  function mark() {
    document.querySelectorAll('[id^="post-card-"]').forEach(function (card) {
      var id = card.id.replace('post-card-', ''), tag = card.querySelector('.rl-tag');
      if (has(id) && !tag) { var s = document.createElement('span'); s.className = 'rl-tag'; s.innerHTML = '<i class="icon icon-favorite-filled"></i>'; (card.querySelector('.tx-bubble-name') || card).appendChild(s); }
      else if (!has(id) && tag) tag.remove();
    });
  }
  tx.ext.addMenu('post', function (ctx) {
    var post = ctx.post;
    return [{
      label: T({ ru: 'Читать позже', en: 'Read later', es: 'Leer después', pt: 'Ler depois', uk: 'Читати пізніше' }),
      icon: 'favorite',
      checked: has(post.id),
      run: function () {
        if (has(post.id)) { drop(post.id); mark(); tx.toast(T({ ru: 'Убрано из «Читать позже»', en: 'Removed from Read later', es: 'Quitado de Leer después', pt: 'Removido de Ler depois', uk: 'Прибрано з «Читати пізніше»' }), { action: UNDO, run: function () { put(post); mark(); } }); }
        else { put(post); mark(); tx.toast(T({ ru: 'Добавлено в «Читать позже»', en: 'Added to Read later', es: 'Añadido a Leer después', pt: 'Adicionado a Ler depois', uk: 'Додано до «Читати пізніше»' }), { action: UNDO, run: function () { drop(post.id); mark(); } }); }
      }
    }];
  });
  tx.ui.onPostRendered(function () { mark(); });
  tx.settings.addPage({
    id: 'list', title: T({ ru: 'Читать позже', en: 'Read later', es: 'Leer después', pt: 'Ler depois', uk: 'Читати пізніше' }), sub: T({ ru: 'Сохранённые посты', en: 'Saved posts', es: 'Publicaciones guardadas', pt: 'Publicações salvas', uk: 'Збережені дописи' }), icon: 'favorite', color: 'ORANGE',
    render: function (box) {
      function draw() {
        var list = ids();
        if (!list.length) {
          box.innerHTML = '<div class="rl-empty"><span class="rl-empty-ic"><i class="icon icon-favorite"></i></span><b>' + tx.escapeHtml(T({ ru: 'Пока пусто', en: 'Nothing yet', es: 'Aún nada', pt: 'Nada ainda', uk: 'Поки порожньо' })) + '</b><span>' + tx.escapeHtml(T({ ru: 'Нажмите на пост и выберите «Читать позже».', en: 'Tap a post and choose “Read later”.', es: 'Toca una publicación y elige «Leer después».', pt: 'Toque numa publicação e escolha «Ler depois».', uk: 'Натисніть на допис і оберіть «Читати пізніше».' })) + '</span></div>';
          return;
        }
        box.innerHTML = '<div class="tx-group rl-list">' + list.map(function (x) {
          return '<div class="rl-item" data-id="' + tx.escapeHtml(x.id) + '"><a class="rl-main" href="' + tx.escapeHtml(x.url) + '" target="_blank" rel="noopener"><b>' + tx.escapeHtml(x.channel || '—') + '</b><span>' + tx.escapeHtml(x.text || '…') + '</span></a><button class="rl-del" title="' + tx.escapeHtml(T({ ru: 'Убрать', en: 'Remove', es: 'Quitar', pt: 'Remover', uk: 'Прибрати' })) + '"><i class="icon icon-close"></i></button></div>';
        }).join('') + '</div>';
      }
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.rl-del');
        if (!b) return;
        var id = b.closest('.rl-item').dataset.id, item = ids().filter(function (x) { return x.id === id; })[0];
        drop(id); draw(); mark();
        tx.toast(T({ ru: 'Убрано', en: 'Removed', es: 'Quitado', pt: 'Removido', uk: 'Прибрано' }), { action: UNDO, run: function () { if (item) { var l = ids(); l.unshift(item); tx.storage.set('items', l); draw(); mark(); } } });
      });
      draw();
    }
  });
}
