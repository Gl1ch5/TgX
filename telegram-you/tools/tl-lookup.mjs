// Prints the exact parameters of a Telegram API method / type from the GramJS typings.
//   node tools/tl-lookup.mjs messages.SaveDraft
//   node tools/tl-lookup.mjs Message            (a constructor/type, searches Api.* classes)
// Needs `cd tools/gramjs && npm ci` once (the typings live in node_modules).
import fs from 'node:fs';
import path from 'node:path';
const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'gramjs/node_modules/telegram/tl/api.d.ts');
if (!fs.existsSync(file)) { console.error('Run: cd tools/gramjs && npm ci'); process.exit(1); }
const q = process.argv[2];
if (!q) { console.error('usage: node tools/tl-lookup.mjs messages.SendMessage'); process.exit(1); }
const lines = fs.readFileSync(file, 'utf8').split('\n');
const hits = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/className: "([^"]+)"/);
  if (m && (m[1] === q || m[1].toLowerCase() === q.toLowerCase() || m[1].endsWith('.' + q) && !q.includes('.'))) hits.push(i);
}
if (!hits.length) { console.log('No such method/type. Try a part of the name with: grep -n "className: \\".*' + q + '" ' + path.relative(process.cwd(), file)); process.exit(0); }
for (const i of hits.slice(0, 3)) {
  let s = i;
  while (s > 0 && !/export class /.test(lines[s])) s--;
  const head = lines[s].trim();
  const params = [];
  for (let k = s; k < i; k++) {
    const m = lines[k].match(/^\s+([a-zA-Z0-9_]+)(\??): ([^;]+);/);
    if (m && !['CONSTRUCTOR_ID', 'SUBCLASS_OF_ID', 'classType', 'className'].includes(m[1])) params.push(`  ${m[1]}${m[2]}: ${m[3]}`);
  }
  console.log(head.replace(/ extends .*/, ''));
  console.log([...new Set(params)].join('\n') || '  (no parameters)');
  const ret = lines.slice(s, i).join(' ').match(/}>, ([A-Za-z.]+)> \{/);
  if (ret) console.log('  → returns', ret[1]);
  console.log('');
}
