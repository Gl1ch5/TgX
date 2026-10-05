// @manifest {"id":"copy-post-link","name":"Copy post id","version":"1.0.0","author":"TeleX","description":"Adds an item to the post menu and a row to the settings","permissions":["menu","settings"]}
export default function (tx) {
  // an extra item in the menu of every post
  tx.ext.addMenu('post', ({ post }) => [{
    label: tx.t('Копировать'),
    icon: 'copy',
    run: () => { navigator.clipboard.writeText(String(post.id)); tx.toast(post.id); },
  }]);
  // a row on the settings screen that remembers how many times it was tapped
  tx.settings.addRow({
    title: 'Copy post id', sub: 'Example mod', icon: 'st-features',
    run: () => { const n = (tx.storage.get('taps') || 0) + 1; tx.storage.set('taps', n); tx.toast('Taps: ' + n); },
  });
}
