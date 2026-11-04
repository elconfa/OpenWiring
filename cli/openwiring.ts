// Riga di comando di OpenWiring per agenti e script: esporta le pagine in testo, controlla e
// applica il testo a un progetto .ecad, verifica il progetto, stampa catalogo e guida.
// Uso: npm run cli -- <comando> [argomenti]   (vedi "npm run cli -- aiuto")
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadSymbolFiles, SYMBOL_EXT, type SymbolFile } from '../src/io/symbolFolder';
import { setLibrarySymbols } from '../src/model/geometry';
import { pagesToText, importPagesText, symbolCatalog } from '../src/model/textFormat';
import { checkProject, type Issue } from '../src/model/checks';
import { agentGuide } from '../src/model/agentGuide';
import { emptyProject } from '../src/model/project';
import { parseProject, serializeProject } from '../src/io/fileio';
import type { Project, SymbolDef } from '../src/model/types';

const HELP = `OpenWiring — riga di comando

  esporta <progetto.ecad> [--pagine 2,3] [--catalogo]   pagine in formato testo (su stdout)
  controlla <progetto.ecad|nuovo> <pagine.txt>           errori del testo e verifica delle pagine toccate
  applica <progetto.ecad> <pagine.txt> [-o uscita.ecad]  applica il testo (crea il progetto se non esiste)
  verifica <progetto.ecad>                               verifica di tutto il progetto
  importa-pdf <schema.pdf> [uscita.ecad]                 progetto da uno schema PDF vettoriale (es. SEE Electrical)
  banco <file.edz|.zip|cartella>… [-o cartella]           banco di prova dell'import EDZ: rapporto.html e rapporto.json
  catalogo [--tutti]                                     simboli (anche la libreria dell'utente) e tipi di scheda PLC
  guida                                                  guida per agenti di intelligenza artificiale (Markdown)

  --json              uscita in JSON · codice di uscita 1 se ci sono errori
  --simboli <cartella> libreria dei simboli dell'utente (un file .ecsym per simbolo, sottocartelle = gruppi);
                      se manca: variabile OPENWIRING_SIMBOLI, la cartella scelta nell'app, ~/Documents/OpenWiring/Simboli
  --tutti             nel catalogo anche i simboli importati in blocco (QElectroTech, macro EPLAN)`;

const args = process.argv.slice(2);
const json = args.includes('--json');
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const pos = args.filter((a, i) => !a.startsWith('-') && !['--pagine', '-o', '--simboli'].includes(args[i - 1] ?? ''));
const [cmd, a1, a2] = pos;

function load(path: string | undefined, allowNew = false): Project {
  if (!path || path === 'nuovo' || (allowNew && !existsSync(path))) return emptyProject();
  return parseProject(readFileSync(path, 'utf8'));
}

/** Cartella della libreria dei simboli: opzione, variabile d'ambiente, scelta fatta nell'app, cartella predefinita */
function symbolDir(): string {
  const opt = flag('--simboli') ?? process.env.OPENWIRING_SIMBOLI ?? process.env.ELETTROCAD_SIMBOLI;
  if (opt) return opt;
  const home = homedir();
  const appData = process.platform === 'darwin' ? join(home, 'Library', 'Application Support')
    : process.platform === 'win32' ? process.env.APPDATA ?? join(home, 'AppData', 'Roaming') : process.env.XDG_CONFIG_HOME ?? join(home, '.config');
  for (const name of ['OpenWiring', 'openwiring', 'ElettroCAD', 'elettrocad']) {
    try {
      const dir = (JSON.parse(readFileSync(join(appData, name, 'config.json'), 'utf8')) as { symbolDir?: string }).symbolDir;
      if (dir) return dir;
    } catch { /* nessuna configurazione */ }
  }
  const docs = join(home, 'Documents');
  return existsSync(join(docs, 'OpenWiring')) || !existsSync(join(docs, 'ElettroCAD')) ? join(docs, 'OpenWiring', 'Simboli') : join(docs, 'ElettroCAD', 'Simboli');
}

/** Simboli della cartella dell'utente, resi disponibili ai comandi come nella libreria dell'app */
function loadLibrary(): SymbolDef[] {
  const root = symbolDir();
  if (!existsSync(root)) return [];
  const files: SymbolFile[] = [];
  const walk = (sub: string) => {
    for (const e of readdirSync(join(root, sub), { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.toLowerCase().endsWith(SYMBOL_EXT)) files.push({ rel, text: readFileSync(join(root, rel), 'utf8') });
    }
  };
  walk('');
  const r = loadSymbolFiles(files);
  for (const e of r.errors) console.error(`simboli: ${e}`);
  setLibrarySymbols(r.symbols);
  return r.symbols;
}

const fmt = (i: Issue) => `${i.level === 'error' ? 'ERRORE' : i.level === 'warn' ? 'avviso' : 'info  '} [${i.kind}] ${i.msg}${i.loc ? ` (/${i.loc})` : ''}`;

function pageIssues(p: Project, names: string[]): Issue[] {
  const ids = new Set(p.pages.filter(x => names.includes(x.name)).map(x => x.id));
  return checkProject(p).filter(i => (i.pageId && ids.has(i.pageId)) || (!i.pageId && i.level === 'error'));
}

/** Banco di prova EDZ: ogni .edz/.zip è un pacchetto; i file sciolti di una cartella (un EDZ già estratto) un altro */
async function bench(): Promise<number> {
  const inputs = pos.slice(1);
  if (!inputs.length) { console.error('uso: banco <file.edz|.zip|cartella>… [-o cartella]'); return 2; }
  const { statSync, readdirSync, mkdirSync, mkdtempSync, rmSync } = await import('node:fs');
  const { join, basename, relative } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { extractArchive } = await import('../src/io/edz');
  const { benchPackage, emptyReport, finishReport } = await import('../src/io/edzBench');
  const { benchHtml } = await import('../src/io/benchHtml');
  // Il parser degli XML articolo usa DOMParser, che Node non ha: xmldom regge anche gli XML di
  // decine di MB dei costruttori (happy-dom, usato nei test, ne richiede molta più memoria)
  if (!('DOMParser' in globalThis)) (globalThis as { DOMParser?: unknown }).DOMParser = (await import('@xmldom/xmldom')).DOMParser;
  type F = { path: string; data: Uint8Array };
  // I file si leggono dal disco ogni volta che servono, senza tenerli in memoria: i pacchetti dei
  // costruttori arrivano a decine di GB estratti
  const lazy = (path: string, abs: string): F => ({ path, get data() { return new Uint8Array(readFileSync(abs)); } }) as F;
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const report = emptyReport();
  const run = (files: F[], name: string) => {
    const t = Date.now();
    benchPackage(files, name, report);
    const p = report.packages[report.packages.length - 1];
    console.error(`${name}: ${p.parts} articoli, ${p.macros} macro (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  };
  const archive = async (path: string) => {
    const name = basename(path);
    // Macro e XML si estraggono su disco con tar (libarchive legge 7z e zip); il 7-Zip interno,
    // che lavora in memoria, solo se tar non c'è o non ha estratto nulla
    const tmp = mkdtempSync(join(tmpdir(), 'edz-banco-'));
    try {
      try { execFileSync('tar', ['-xf', path, '-C', tmp, '--include', '*.ema', '--include', '*.EMA', '--include', '*.ems', '--include', '*.EMS', '--include', '*.xml', '--include', '*.XML'], { stdio: 'ignore' }); } catch { /* tar esce con errore anche quando un filtro non trova file */ }
      const got = walk(tmp);
      if (got.length) run(got.map(f => lazy(relative(tmp, f), f)), name);
      else run(await extractArchive(new Uint8Array(readFileSync(path)), name), name);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };
  for (const input of inputs) {
    if (!existsSync(input)) { console.error(`${input}: non trovato`); return 2; }
    if (!statSync(input).isDirectory()) { await archive(input); continue; }
    const all = walk(input);
    for (const f of all.filter(f => /\.(edz|zip)$/i.test(f))) await archive(f);
    const loose = all.filter(f => /\.(ema|ems|xml)$/i.test(f));
    if (loose.length) run(loose.map(f => lazy(relative(input, f), f)), basename(input));
  }
  finishReport(report);
  const out = flag('-o') ?? '.';
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'rapporto.json'), JSON.stringify(report));
  writeFileSync(join(out, 'rapporto.html'), benchHtml(report));
  const c = report.counts;
  if (json) console.log(JSON.stringify({ counts: c, packages: report.packages, libraryRefs: report.libraryRefs.slice(0, 30) }, null, 1));
  else console.log(`${report.items.length} articoli: ${Object.entries(c).map(([k, n]) => `${k} ${n}`).join(' · ')}\n→ ${join(out, 'rapporto.html')}`);
  return 0;
}

async function importPdf(): Promise<number> {
  if (!a1) { console.error('uso: importa-pdf <schema.pdf> [uscita.ecad]'); return 2; }
  const { readPdf } = await import('../src/io/pdfRead');
  const { pdfToProject } = await import('../src/io/pdfSchematic');
  const raw = await readPdf(new Uint8Array(readFileSync(a1)));
  const { project, report } = pdfToProject(raw, { fileName: a1.split(/[\\/]/).pop() });
  const out = a2 ?? a1.replace(/\.pdf$/i, '') + '.ecad';
  writeFileSync(out, serializeProject(project));
  if (json) console.log(JSON.stringify({ ...report, file: out }, null, 1));
  else console.log(`${report.imported} fogli → ${out}: ${report.wires} fili, ${report.devices} componenti con sigla, ${report.terminals} morsetti, ${report.links} rimandi; ${report.skipped.length} pagine saltate`);
  return 0;
}

function main(): number | Promise<number> {
  switch (cmd) {
    case 'importa-pdf': return importPdf();
    case 'banco': return bench();
  }
  const lib = loadLibrary();
  switch (cmd) {
    case 'esporta': {
      const p = load(a1);
      const list = flag('--pagine')?.split(',').map(s => s.trim());
      const ids = list ? p.pages.filter(x => list.includes(x.name)).map(x => x.id) : undefined;
      process.stdout.write(pagesToText(p, { pageIds: ids, catalog: args.includes('--catalogo'), librarySymbols: lib }));
      return 0;
    }
    case 'controlla':
    case 'applica': {
      if (!a2) { console.error(`uso: ${cmd} <progetto.ecad> <pagine.txt>`); return 2; }
      const isNew = !a1 || a1 === 'nuovo' || !existsSync(a1);
      const p = load(a1, cmd === 'applica');
      const r = importPagesText(p, readFileSync(a2, 'utf8'));
      // Progetto nuovo: la pagina vuota di partenza non serve se il testo porta le sue pagine
      if (isNew && !r.errors.length && r.added.length && !r.added.includes('1')) p.pages = p.pages.filter(x => x.name !== '1' || x.elements.length);
      const issues = r.errors.length ? [] : pageIssues(p, [...r.replaced, ...r.added]);
      if (cmd === 'applica' && !r.errors.length) writeFileSync(flag('-o') ?? a1, serializeProject(p));
      if (json) { console.log(JSON.stringify({ ...r, issues }, null, 1)); return r.errors.length || issues.some(i => i.level === 'error') ? 1 : 0; }
      for (const e of r.errors) console.log(`ERRORE riga ${e.line}: ${e.msg}`);
      for (const w of r.warnings) console.log(`avviso riga ${w.line}: ${w.msg}`);
      if (r.errors.length) { console.log(`\n${r.errors.length} errori: testo non applicato.`); return 1; }
      console.log(`${cmd === 'applica' ? 'Applicato' : 'Testo valido'}: ${[r.replaced.length && `pagine sostituite ${r.replaced.join(', ')}`, r.added.length && `pagine nuove ${r.added.join(', ')}`].filter(Boolean).join('; ') || 'solo dati di progetto'} · ${r.elements} elementi${cmd === 'applica' ? ` → ${flag('-o') ?? a1}` : ''}`);
      console.log(issues.length ? `\nVerifica (${issues.length}):\n${issues.map(fmt).join('\n')}` : '\nVerifica: nessun problema sulle pagine toccate.');
      return issues.some(i => i.level === 'error') ? 1 : 0;
    }
    case 'verifica': {
      const issues = checkProject(load(a1));
      if (json) console.log(JSON.stringify(issues, null, 1));
      else console.log(issues.length ? issues.map(fmt).join('\n') : 'Nessun problema.');
      return issues.some(i => i.level === 'error') ? 1 : 0;
    }
    case 'catalogo': process.stdout.write(symbolCatalog(load(a1), lib, args.includes('--tutti'))); return 0;
    case 'guida': process.stdout.write(agentGuide(a1 ? load(a1) : undefined, lib)); return 0;
    default: console.log(HELP); return cmd && cmd !== 'aiuto' ? 2 : 0;
  }
}

void Promise.resolve(main()).then(code => { process.exitCode = code; });
