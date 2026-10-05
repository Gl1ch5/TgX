export default function (tx) {
  function lines() { return Math.max(3, Number(tx.config.get('lines')) || 8); }
  function apply(el) {
    if (el.dataset.collapsed) return;
    var lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    var max = lines() * lh;
    if (el.scrollHeight <= max * 1.25) return;
    el.dataset.collapsed = '1';
    el.classList.add('cp-clamp');
    el.style.setProperty('--cp-max', max + 'px');
    var b = document.createElement('button');
    b.className = 'cp-more';
    b.textContent = tx.L({ ru: 'Показать полностью', en: 'Show more', es: 'Mostrar más', pt: 'Mostrar mais', uk: 'Показати повністю' });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = el.classList.toggle('cp-open');
      b.textContent = open ? tx.L({ ru: 'Свернуть', en: 'Show less', es: 'Mostrar menos', pt: 'Mostrar menos', uk: 'Згорнути' }) : tx.L({ ru: 'Показать полностью', en: 'Show more', es: 'Mostrar más', pt: 'Mostrar mais', uk: 'Показати повністю' });
    });
    el.after(b);
  }
  tx.ui.onPostText(function (el) { requestAnimationFrame(function () { requestAnimationFrame(function () { apply(el); }); }); });
}
