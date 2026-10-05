// Extension points of Telegram You. Built-in features and mods use the same registry,
// so a mod can add what the app itself adds, and nothing else.
//
//   menus  — providers return menu items for a point ('message', 'chat', 'profile'):
//            ext.addMenu('message', ({ msg, chat }) => [{ label, icon, run }], owner)
//   hooks  — async pipelines that may change or cancel a value:
//            'beforeSend' (text → text | null)
//   events — fire-and-forget notifications: 'message' (incoming/outgoing), 'chatOpen'
//
// `owner` is 'core' or a mod id; ext.removeOwner(id) unplugs everything a mod added.

const menus = new Map();   // point -> [{ owner, provider }]
const hooks = new Map();   // name  -> [{ owner, fn }]
const events = new Map();  // name  -> [{ owner, fn }]

const list = (map, key) => { if (!map.has(key)) map.set(key, []); return map.get(key); };

export const ext = {
  addMenu(point, provider, owner = 'core') { list(menus, point).push({ owner, provider }); },

  /** Items of every provider for a point; a failing provider is skipped, never breaks the menu. */
  menu(point, ctx) {
    const out = [];
    for (const { owner, provider } of list(menus, point)) {
      try { for (const it of provider(ctx) || []) out.push({ ...it, owner }); } catch (e) { console.warn(`[ext] menu ${point} (${owner})`, e); }
    }
    return out;
  },

  addHook(name, fn, owner = 'core') { list(hooks, name).push({ owner, fn }); },

  /** Runs a value through the hook pipeline; a hook returning null/undefined cancels (returns null). */
  async run(name, value, ctx) {
    let v = value;
    for (const { owner, fn } of list(hooks, name)) {
      try { v = await fn(v, ctx); } catch (e) { console.warn(`[ext] hook ${name} (${owner})`, e); continue; }
      if (v == null) return null;
    }
    return v;
  },

  on(name, fn, owner = 'core') { list(events, name).push({ owner, fn }); },
  emit(name, payload) {
    for (const { owner, fn } of list(events, name)) {
      try { fn(payload); } catch (e) { console.warn(`[ext] event ${name} (${owner})`, e); }
    }
  },

  removeOwner(owner) {
    for (const map of [menus, hooks, events]) for (const [k, v] of map) map.set(k, v.filter((x) => x.owner !== owner));
  },
};
