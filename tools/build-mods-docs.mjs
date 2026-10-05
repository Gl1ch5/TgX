// Builds mods.html (the modding documentation page of the site) from docs/mods.md and docs/mods-for-agents.md.
//   node tools/build-mods-docs.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u.replace(/\.md$/, '.html').replace(/^\.\.\/mods-examples\//, 'https://github.com/Gl1ch5/TgX/tree/main/mods-examples/').replace(/^mods-for-agents\.html$/, '#agents').replace(/^docs\/mods-for-agents\.html$/, '#agents')}">${t}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

function md(src, idPrefix) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if (/^#{1,4} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      const text = l.replace(/^#+ /, '');
      const id = idPrefix + text.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '');
      out.push(`<h${n + 1} id="${id}">${inline(text)}</h${n + 1}>`);
      i++;
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^\s*[-•] /.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-•] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•] /, ''));
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    } else if (l.trim() === '') {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#|```|\||\s*[-•] )/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const people = md(fs.readFileSync(path.join(root, 'docs/mods.md'), 'utf8').replace(/^# .*\n/, ''), 'h-');
const agents = md(fs.readFileSync(path.join(root, 'docs/mods-for-agents.md'), 'utf8').replace(/^# .*\n/, ''), 'a-');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Моды TeleX — документация</title>
<meta name="description" content="Как создать мод для TeleX: формат .module, темы, виджеты, API, инструкция для нейросетей.">
<link rel="icon" href="app/static/icons/telex.svg" type="image/svg+xml">
<link rel="stylesheet" href="site/landing.css">
<style>
  .doc { max-width: 860px; margin: 0 auto; padding: 96px 20px 80px; line-height: 1.6; }
  .doc h1 { font-size: 40px; margin: 0 0 8px; }
  .doc h2 { font-size: 28px; margin: 44px 0 10px; }
  .doc h3 { font-size: 21px; margin: 30px 0 8px; }
  .doc h4 { font-size: 17px; margin: 22px 0 6px; }
  .doc p, .doc li { color: var(--text-2); font-size: 16.5px; }
  .doc a { color: #6aa3ff; }
  .doc code { background: rgba(127,127,127,.18); padding: 1px 6px; border-radius: 6px; font-size: .92em; }
  .doc pre { background: rgba(0,0,0,.4); border-radius: 14px; padding: 16px 18px; overflow-x: auto; }
  .doc pre code { background: none; padding: 0; font-size: 13.5px; color: #dfe6f3; }
  .doc .tbl { overflow-x: auto; }
  .doc table { border-collapse: collapse; width: 100%; font-size: 15px; }
  .doc th, .doc td { text-align: left; padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.25); vertical-align: top; }
  .tabs { display: flex; gap: 8px; margin: 26px 0 6px; flex-wrap: wrap; }
  .tabs a { padding: 9px 18px; border-radius: 999px; background: rgba(127,127,127,.18); color: inherit; text-decoration: none; font-weight: 600; }
  .lead { font-size: 19px; color: var(--text-2); }
</style>
</head>
<body>
  <header class="nav"><div class="wrap nav-in">
    <a class="brand" href="./"><img src="app/static/icons/telex.svg" alt="" width="32" height="32">TeleX</a>
    <nav class="links"><a href="./#mods">Каталог модов</a><a href="#people">Для людей</a><a href="#agents">Для нейросетей</a></nav>
    <a class="btn btn-sm" href="app/static/">Открыть</a>
  </div></header>
  <main class="doc">
    <h1>Моды TeleX</h1>
    <p class="lead">Мод — один файл <code>.module</code>. Внутри может быть что угодно: тема, HTML-виджет, JS, CSS. Любой экран приложения можно изменить или дополнить.</p>
    <div class="tabs"><a href="#people">Документация</a><a href="#agents">Инструкция для нейросетей</a><a href="./#mods">Скачать официальные моды</a></div>
    <section id="people">${people}</section>
    <section id="agents"><h2>Для нейросетей (инструкция агенту)</h2>${agents}</section>
  </main>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'mods.html'), html);

// The prompt people copy in the app (Mods → "Copy prompt for an AI"): the agent brief + hard output rules.
const brief = fs.readFileSync(path.join(root, 'docs/mods-for-agents.md'), 'utf8');
const classes = fs.readFileSync(path.join(root, 'docs/mods.md'), 'utf8').split('## Поверхности, которые можно менять напрямую')[1]?.split('## ')[0] || '';
const prompt = `You write mods for TeleX, a web client for Telegram. A mod is ONE text file with the extension .module that the user pastes into the app (Settings → Mods → "Paste mod from clipboard").
Below is the complete specification. Read it, then build exactly the mod the user asks for at the end of this message.

HARD RULES FOR YOUR ANSWER
- Reply with the contents of the .module file ONLY. No explanations before or after. No markdown code fences.
- The first character must be "{" (JSON bundle) or the file must start with a comment line carrying @manifest (annotated / sectioned file).
- Fill the manifest completely: id, name, version, author, description, about (all texts for ru, en, es, pt, uk), icon (an emoji or a 96x96 SVG data URL), tags and settings if the mod has options.
- The mod must work in day and night mode and on a phone. Use the app's CSS variables and skin tokens, not hard-coded colours.
- Use only the documented API. Do not invent tx methods.

SPECIFICATION
${brief}

STYLEABLE CLASSES (selectors you may style)
${classes.trim()}

THE MOD THE USER WANTS:
`;
fs.writeFileSync(path.join(root, 'app/static/mods/ai-prompt.txt'), prompt);
console.log('ai-prompt.txt written');
console.log('mods.html written');
