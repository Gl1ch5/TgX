// One-off codemod: wraps Russian UI strings of app/static/js in t('…').
//   node tools/i18n/wrap.mjs            → rewrites the files, prints what needs a human look
//   node tools/i18n/wrap.mjs --dry      → only the report
// Rules: string literals → t('…'); template literals → t('… {a}', {a: expr});
// HTML templates → each Cyrillic text node / title / placeholder / alt / aria-label becomes ${t('…')}.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acorn = require(process.env.ACORN || '/opt/node-tools/node_modules/acorn');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../app/static/js');
const SKIP = [/^vendor\//, /^lang\//, /^i18n\.js$/, /^emoji(-data)?\.js$/, /^tg-worker\.js$/, /^core\/devtools\.js$/, /^components\/countries\.js$/];
const CYR = /[А-Яа-яЁё]/;
const dry = process.argv.includes('--dry');

function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`;
const tplEscape = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const report = [];

function processFile(file) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  if (!CYR.test(src)) return;
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowHashBang: true });
  } catch (e) {
    report.push(`${rel}: PARSE ERROR ${e.message}`);
    return;
  }
  let changed = false;

  const children = (node) => {
    const out = [];
    for (const [k, v] of Object.entries(node)) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      if (Array.isArray(v)) v.forEach((c) => { if (c && typeof c.type === 'string') out.push(c); });
      else if (v && typeof v.type === 'string') out.push(v);
    }
    return out.sort((a, b) => a.start - b.start);
  };
  const spliceChildren = (node, skip = () => false) => {
    let pos = node.start;
    let out = '';
    for (const c of children(node)) {
      out += src.slice(pos, c.start) + (skip(c) ? src.slice(c.start, c.end) : tr(c, node));
      pos = c.end;
    }
    return out + src.slice(pos, node.end);
  };
  const isConsole = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'console';

  function tr(node, parent) {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportSpecifier':
        return src.slice(node.start, node.end);
      case 'CallExpression':
        if (isConsole(node)) return src.slice(node.start, node.end);
        return spliceChildren(node);
      case 'Property':
        if (node.shorthand) return src.slice(node.start, node.end);
        // keep plain keys as they are, translate the value
        return spliceChildren(node, (c) => c === node.key && !node.computed);
      case 'Literal': {
        if (typeof node.value !== 'string' || !CYR.test(node.value)) return src.slice(node.start, node.end);
        if (parent && ((parent.type === 'BinaryExpression' && /^[!=]=/.test(parent.operator)) || parent.type === 'SwitchCase')) {
          report.push(`${rel}:${lineOf(node.start)} compared string left as is: ${node.value.slice(0, 50)}`);
          return src.slice(node.start, node.end);
        }
        changed = true;
        if (/<\/?[a-zA-Z][^<>]*>/.test(node.value)) return htmlTemplate(node.value, [], []);
        return `t(${src.slice(node.start, node.end)})`;
      }
      case 'TemplateLiteral':
        return template(node);
      default:
        return spliceChildren(node);
    }
  }

  const lineOf = (pos) => src.slice(0, pos).split('\n').length;

  function template(node) {
    const cooked = node.quasis.map((x) => x.value.cooked);
    const exprs = node.expressions.map((e) => tr(e, node));
    if (cooked.some((c) => c == null) || !cooked.some((c) => CYR.test(c))) {
      return spliceChildren(node);
    }
    changed = true;
    let S = '';
    cooked.forEach((c, i) => { S += c; if (i < exprs.length) S += `\u0001${i}\u0002`; });
    const isHtml = /<\/?[a-zA-Z][^<>]*>/.test(S.replace(/\u0001\d+\u0002/g, ''));
    if (!isHtml) {
      const { code } = callOf(S, exprs);
      return code;
    }
    return htmlTemplate(S, exprs);
  }

  const keyOf = (text, exprs) => {
    const names = [];
    const key = text.replace(/\u0001(\d+)\u0002/g, (m, i) => {
      const name = String.fromCharCode(97 + names.length);
      names.push([name, exprs[Number(i)]]);
      return `{${name}}`;
    });
    return { key, params: names };
  };
  const callOf = (text, exprs) => {
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.trim();
    const { key, params } = keyOf(core, exprs);
    const p = params.length ? `, {${params.map(([n, e]) => `${n}: ${e}`).join(', ')}}` : '';
    return { lead, trail, code: `t(${q(key)}${p})` };
  };

  // HTML: translate text nodes and the usual attributes, everything else stays.
  function htmlTemplate(S, exprs) {
    let out = S.replace(/>([^<>]*)</g, (m, inner) => {
      if (!CYR.test(inner)) return m;
      const c = callOf(inner, exprs);
      return `>${c.lead}\u0003${c.code}\u0004${c.trail}<`;
    });
    out = out.replace(/\b(placeholder|title|alt|aria-label)="([^"]*)"/g, (m, attr, val) => {
      if (!CYR.test(val)) return m;
      const c = callOf(val, exprs);
      return `${attr}="\u0003${c.code}\u0004"`;
    });
    const leftover = out.replace(/\u0003[\s\S]*?\u0004/g, '');
    if (CYR.test(leftover)) {
      const sample = leftover.match(/[^<>"'\n]*[А-Яа-яЁё][^<>"'\n]*/g) || [];
      report.push(`${rel}: HTML string has Cyrillic outside text/attributes: ${sample.slice(0, 3).map((x) => x.trim().slice(0, 40)).join(' | ')}`);
    }
    let result = '';
    for (const part of out.split(/(\u0003[\s\S]*?\u0004)/)) {
      if (part.startsWith('\u0003')) result += '${' + part.slice(1, -1) + '}';
      else result += tplEscape(part).replace(/\u0001(\d+)\u0002/g, (m, i) => '${' + exprs[Number(i)] + '}');
    }
    return '`' + result + '`';
  }

  const body = tr(ast, null);
  if (!changed) return;
  // add the import after the last import (or at the top)
  let out = body;
  const imports = ast.body.filter((n) => n.type === 'ImportDeclaration');
  let importPath = path.relative(path.dirname(file), path.join(ROOT, 'i18n.js')).replace(/\\/g, '/');
  if (!importPath.startsWith('.')) importPath = './' + importPath;
  const hasImport = /from ['"][^'"]*i18n\.js['"]/.test(src);
  if (!hasImport) {
    const line = `import { t } from '${importPath}';\n`;
    if (imports.length) {
      const last = imports[imports.length - 1];
      // `body` was spliced, so find the same import end by its text
      const lastText = src.slice(last.start, last.end);
      const at = out.indexOf(lastText) + lastText.length;
      out = out.slice(0, at) + '\n' + line.trimEnd() + out.slice(at);
    } else {
      out = line + out;
    }
  }
  report.push(`${rel}: rewritten`);
  if (!dry) fs.writeFileSync(file, out);
}

for (const f of walkFiles(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (SKIP.some((re) => re.test(rel))) continue;
  processFile(f);
}
console.log(report.join('\n'));
