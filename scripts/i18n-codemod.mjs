// Una tantum: avvolge in tx('…') i testi visibili dell'interfaccia (testi JSX, attributi title,
// placeholder…, voci dei menu, messaggi) senza riformattare il codice. Con --check elenca soltanto.
//   node scripts/i18n-codemod.mjs [--check] file…
// Usa il parser di rolldown (oxc), installato con Vite.
import { parseSync } from 'rolldown/experimental';
import fs from 'node:fs';
import path from 'node:path';

const check = process.argv.includes('--check');
// --calls: solo i messaggi (logMsg, ask…), per i moduli del modello che creano anche dati del progetto
const callsOnly = process.argv.includes('--calls');
const files = process.argv.slice(2).filter(a => !a.startsWith('--'));

const ATTRS = new Set(['title', 'placeholder', 'aria-label', 'label', 'alt']);
const PROPS = new Set(['label', 'title', 'header', 'placeholder', 'hint', 'msg', 'kind']);
const CALLS = new Set(['item', 'logMsg', 'setNote', 'ask', 'askText', 'confirm', 'alert', 'Error', 'err', 'warn']);
const hasWords = s => /\p{L}{2}/u.test(s);
// Codici e identificatori (es. 'schema', 'pdf', 'X1') non si traducono
const looksLikeCode = s => /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(s) || /^[a-z0-9_.:/-]*$/.test(s) || /^[A-Z0-9_.:+/-]{1,6}$/.test(s);
const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const isStr = n => n && ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral');

function visibleContext(node, parents) {
  let n = node, i = parents.length - 1, p = parents[i];
  while (p && (p.type === 'ConditionalExpression' || p.type === 'ParenthesizedExpression' || (p.type === 'LogicalExpression'))) {
    if (p.type === 'ConditionalExpression' && p.test === n) return null;
    if (p.type === 'LogicalExpression' && p.left === n && p.operator === '&&') return null;
    n = p; p = parents[--i];
  }
  if (!p) return null;
  if (p.type === 'JSXExpressionContainer') {
    const g = parents[i - 1];
    if (g && (g.type === 'JSXElement' || g.type === 'JSXFragment')) return 'child';
    if (g && g.type === 'JSXAttribute' && ATTRS.has(attrName(g))) return 'attr';
    return null;
  }
  if (p.type === 'Property' && p.value === n && !p.computed) {
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.value;
    if (PROPS.has(k)) return 'prop';
  }
  if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.arguments.includes(n)) {
    const c = p.callee;
    const name = c.type === 'MemberExpression' ? c.property.name : c.name;
    if (CALLS.has(name)) return 'call';
  }
  return null;
}

const attrName = a => (a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name);

function strOf(node, src) {
  if (node.type === 'Literal') return { text: node.value, args: [] };
  let text = '';
  const args = [];
  node.quasis.forEach((qq, i) => {
    text += qq.value.cooked;
    if (i < node.expressions.length) { text += `{${i}}`; args.push(src.slice(node.expressions[i].start, node.expressions[i].end)); }
  });
  return { text, args };
}

let total = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const { program, errors } = parseSync(path.basename(file), src);
  if (errors.length) { console.error(file, errors[0].message); continue; }
  const edits = [], found = [];
  const walk = (node, parents) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'tx') return;
    if (node.type === 'JSXText') {
      const raw = src.slice(node.start, node.end);
      const core = raw.trim();
      if (core && hasWords(core) && !core.includes('&')) {
        const text = core.replace(/\s*\n\s*/g, ' ');
        const start = node.start + raw.indexOf(core);
        edits.push([start, start + core.length, `{tx(${q(text)})}`]);
        found.push(text);
      }
      return;
    }
    if (node.type === 'JSXAttribute' && ATTRS.has(attrName(node)) && node.value?.type === 'Literal') {
      const s = node.value.value;
      if (typeof s === 'string' && hasWords(s) && !looksLikeCode(s)) {
        edits.push([node.value.start, node.value.end, `{tx(${q(s)})}`]);
        found.push(s);
      }
      return;
    }
    if (isStr(node)) {
      const ctx = visibleContext(node, parents);
      if (ctx && (!callsOnly || ctx === 'call')) {
        const { text, args } = strOf(node, src);
        if (hasWords(text.replace(/\{\d+\}/g, '')) && !looksLikeCode(text)) {
          edits.push([node.start, node.end, `tx(${[q(text), ...args].join(', ')})`]);
          found.push(text);
          return;
        }
      }
    }
    const next = [...parents, node];
    for (const k of Object.keys(node)) {
      if (k === 'parent') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c === 'object' && walk(c, next));
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, next);
    }
  };
  walk(program, []);
  total += found.length;
  if (check) { console.log(`${file}: ${found.length}`); found.forEach(f => console.log('   ', f)); continue; }
  if (!edits.length) continue;
  let out = src;
  for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + r + out.slice(b);
  if (!/import \{ tx \} from/.test(out)) {
    const rel = path.relative(path.dirname(file), 'src/i18n/ui').replace(/\\/g, '/');
    const imp = `import { tx } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
    const imports = [...out.matchAll(/^import [^;]*;[ \t]*\n/gm)];
    const at = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    out = out.slice(0, at) + imp + out.slice(at);
  }
  fs.writeFileSync(file, out);
  console.log(`${file}: ${found.length}`);
}
console.log('totale', total);
