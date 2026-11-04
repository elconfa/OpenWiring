// Catalogo dei testi dell'interfaccia: tutti i tx('…') e tn('…') dei sorgenti, più i nomi dei
// simboli, delle categorie, dei tipi di scheda PLC e dei titoli e colonne delle liste (mostrati con
// tx(valore)). Scrive src/i18n/catalog.json (elenco ordinato dei testi italiani).
//   node scripts/i18n-extract.mjs [--missing en]   elenca i testi senza traduzione in quella lingua
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk(path.join(ROOT, 'src'));

const unq = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));
const keys = new Set();
const STR = String.raw`'((?:[^'\\]|\\.)*)'`;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(new RegExp(String.raw`\bt[xn]\(` + STR, 'g'))) keys.add(unq(m[1]));
  const rel = path.relative(ROOT, f);
  // Testi del modello mostrati nell'interfaccia con tx(valore)
  if (rel === 'src/model/symbols.ts') for (const m of src.matchAll(new RegExp(String.raw`\b(?:name|category): ` + STR, 'g'))) keys.add(unq(m[1]));
  if (rel === 'src/model/plc.ts') for (const m of src.matchAll(new RegExp(String.raw`\bname: ` + STR, 'g'))) keys.add(unq(m[1]));
  if (rel === 'src/model/reports.ts') {
    for (const m of src.matchAll(new RegExp(String.raw`\btitle: ` + STR, 'g'))) keys.add(unq(m[1]));
    for (const m of src.matchAll(/columns: \[([^\]]*)\]/g)) for (const c of m[1].matchAll(new RegExp(STR, 'g'))) keys.add(unq(c[1]));
    for (const m of src.matchAll(new RegExp(String.raw`_TITLE = ` + STR, 'g'))) keys.add(unq(m[1]));
  }
}
const list = [...keys].filter(k => /\p{L}/u.test(k)).sort((a, b) => a.localeCompare(b, 'it'));
fs.writeFileSync(path.join(ROOT, 'src/i18n/catalog.json'), JSON.stringify(list, null, 1) + '\n');
const i = process.argv.indexOf('--missing');
if (i > 0) {
  const lang = process.argv[i + 1];
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/ui.${lang}.json`), 'utf8'));
  const miss = list.filter(k => !cat[k]);
  console.log(JSON.stringify(miss, null, 1));
  console.error(`${miss.length} testi senza traduzione in ${lang} (su ${list.length})`);
} else console.log(`${list.length} testi`);
