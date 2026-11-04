// Banco di prova dell'import EDZ: passa i pacchetti dei costruttori nello stesso import dell'app
// e per ogni articolo dice com'è andata (simbolo dalla macro, morsetti mancanti, macro con simboli
// della libreria EPLAN, macro assente…), con i controlli di qualità del simbolo ottenuto.
// Raccoglie anche i simboli della libreria EPLAN richiamati, per sapere quali ridisegnare per primi.
import type { Part, Prim, SymbolDef, Pt } from '../model/types';
import { importFromFiles, decodeXml, type ArchiveFile } from './edz';
import { emaInfo, type EmaInfo, type EmaLibraryRef } from './ema';
import { libKind, LIB_KIND_LABEL } from './emaLibrary';
import { BUILTIN_SYMBOLS } from '../model/symbols';

export type BenchStatus = 'ok' | 'parziale' | 'morsetto' | 'libreria' | 'non-letta' | 'macro-assente' | 'senza-macro' | 'accessorio';

export const STATUS_LABEL: Record<BenchStatus, string> = {
  ok: 'simbolo dalla macro, tutti i morsetti',
  parziale: 'simbolo dalla macro, mancano morsetti',
  morsetto: 'morsetto senza macro: simbolo morsetto di OpenWiring',
  libreria: 'macro con simboli della libreria EPLAN',
  'non-letta': 'macro presente ma non convertita',
  'macro-assente': 'macro richiamata ma non nel pacchetto',
  'senza-macro': 'nessuna macro: scatola nera dal modello funzione',
  accessorio: 'nessuna funzione elettrica (accessorio): non va nello schema',
};

export interface BenchItem {
  pkg: string;
  partNr: string;
  manufacturer: string;
  description: string;
  macro?: string;
  status: BenchStatus;
  /** Motivo, quando la macro non dà un simbolo */
  reason?: string;
  connections: number;
  missing: string[];
  symbolId?: string;
  /** Simboli della libreria EPLAN ridisegnati con un nostro equivalente (da verificare in EPLAN) */
  redrawn: string[];
  /** Altre varianti schematiche convertite dalla stessa macro */
  variants: number;
  /** Controlli sul simbolo: punti fuori dalla griglia di 4 mm, punti sovrapposti, punti non toccati dal disegno */
  offGrid: string[];
  overlapping: string[];
  isolated: string[];
  size?: { w: number; h: number };
}

export interface BenchLibraryRef {
  lib: string; num: string; refs: number; macros: number; variants: string[]; example: string; pins: string[];
  /** Tipo di funzione EPLAN (A1381.A1382.A1383) e nostro equivalente, se lo sappiamo disegnare */
  category: string; kind?: string;
}

export interface BenchReport {
  created: string;
  packages: { name: string; files: number; parts: number; macros: number; warnings: number }[];
  items: BenchItem[];
  counts: Record<BenchStatus, number>;
  libraryRefs: BenchLibraryRef[];
  /** Varianti di tutte le macro lette, per tipo di rappresentazione */
  variantTypes: Record<string, number>;
  /** Simboli convertiti, per le anteprime (solo quelli associati agli articoli) */
  symbols: Record<string, Pick<SymbolDef, 'prims' | 'pins' | 'name'>>;
}

const base = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Distanza di un punto da un segmento */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Distanza minima di un punto dal disegno del simbolo (testi esclusi) */
function primDist(p: Pt, prims: Prim[]): number {
  let d = Infinity;
  for (const q of prims) {
    if (q.t === 'line') d = Math.min(d, segDist(p, { x: q.x1, y: q.y1 }, { x: q.x2, y: q.y2 }));
    else if (q.t === 'rect') {
      const c = [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y }, { x: q.x + q.w, y: q.y + q.h }, { x: q.x, y: q.y + q.h }];
      for (let i = 0; i < 4; i++) d = Math.min(d, segDist(p, c[i], c[(i + 1) % 4]));
    } else if (q.t === 'poly') {
      const n = q.pts.length;
      for (let i = 0; i < n - 1 + (q.closed ? 1 : 0); i++) d = Math.min(d, segDist(p, q.pts[i], q.pts[(i + 1) % n]));
    } else if (q.t === 'circle' || q.t === 'arc') d = Math.min(d, Math.abs(Math.hypot(p.x - q.cx, p.y - q.cy) - q.r));
    else if (q.t === 'ellipse') d = Math.min(d, Math.abs(Math.hypot((p.x - q.cx) / q.rx, (p.y - q.cy) / q.ry) - 1) * Math.min(q.rx, q.ry));
  }
  return d;
}

export function symbolChecks(sym: SymbolDef): Pick<BenchItem, 'offGrid' | 'overlapping' | 'isolated' | 'size'> {
  const on = (v: number) => Math.abs(v / 4 - Math.round(v / 4)) < 0.01;
  const offGrid = sym.pins.filter(p => !on(p.x) || !on(p.y)).map(p => p.label ?? p.id);
  const seen = new Map<string, string>();
  const overlapping: string[] = [];
  for (const p of sym.pins) {
    const k = `${r2(p.x)}/${r2(p.y)}`;
    if (seen.has(k)) overlapping.push(`${seen.get(k)}=${p.label ?? p.id}`);
    else seen.set(k, p.label ?? p.id);
  }
  const isolated = sym.pins.filter(p => primDist(p, sym.prims) > 0.5).map(p => p.label ?? p.id);
  const xs = [...sym.pins.map(p => p.x), ...sym.prims.flatMap(primXs)], ys = [...sym.pins.map(p => p.y), ...sym.prims.flatMap(primYs)];
  const size = xs.length ? { w: r2(Math.max(...xs) - Math.min(...xs)), h: r2(Math.max(...ys) - Math.min(...ys)) } : undefined;
  return { offGrid, overlapping, isolated, size };
}

function primXs(q: Prim): number[] {
  switch (q.t) {
    case 'line': return [q.x1, q.x2];
    case 'rect': return [q.x, q.x + q.w];
    case 'circle': case 'arc': return [q.cx - q.r, q.cx + q.r];
    case 'ellipse': return [q.cx - q.rx, q.cx + q.rx];
    case 'poly': return q.pts.map(p => p.x);
    case 'text': return [q.x];
  }
}
function primYs(q: Prim): number[] {
  switch (q.t) {
    case 'line': return [q.y1, q.y2];
    case 'rect': return [q.y, q.y + q.h];
    case 'circle': case 'arc': return [q.cy - q.r, q.cy + q.r];
    case 'ellipse': return [q.cy - q.ry, q.cy + q.ry];
    case 'poly': return q.pts.map(p => p.y);
    case 'text': return [q.y];
  }
}

/** Simbolo di libreria con più punti che non sappiamo ancora ridisegnare */
const unknownRef = (x: EmaLibraryRef) => x.multi && x.pins.length > 0 && !libKind(x.category, x.pins);

const BUILTIN = new Map(BUILTIN_SYMBOLS.map(s => [s.id, s]));

const macroRefs = (p: Part) => [p.attrs.P_ARTICLE_GROUPSYMBOLMACRO, p.macro].filter((r): r is string => !!r && !/_3d\.ema$/i.test(r));

/** Esamina un pacchetto (i file di un EDZ, o di una cartella estratta) e aggiunge i risultati al rapporto */
export function benchPackage(files: ArchiveFile[], name: string, report: BenchReport): void {
  const r = importFromFiles(files, name);
  const byName = new Map(files.map(f => [base(f.path), f]));
  const symById = new Map(r.symbols.map(s => [s.id, s]));
  const infos = new Map<string, EmaInfo>();
  const info = (key: string): EmaInfo | undefined => {
    if (!infos.has(key)) {
      const f = byName.get(key);
      if (!f) return undefined;
      const i = emaInfo(decodeXml(f.data));
      infos.set(key, i);
      for (const [t, n] of Object.entries(i.variantTypes)) report.variantTypes[t] = (report.variantTypes[t] ?? 0) + n;
      const seen = new Set<string>();
      for (const ref of i.libraryRefs) {
        const k = `${ref.lib}#${ref.num}`;
        let e = report.libraryRefs.find(x => `${x.lib}#${x.num}` === k);
        if (!e) {
          const k = ref.multi ? libKind(ref.category, ref.pins) : undefined;
          report.libraryRefs.push(e = { lib: ref.lib, num: ref.num, refs: 0, macros: 0, variants: [], example: key, pins: ref.pins, category: ref.category, ...(k ? { kind: LIB_KIND_LABEL[k] } : {}) });
        }
        e.refs++;
        if (!e.variants.includes(ref.variant)) e.variants.push(ref.variant);
        if (!seen.has(k)) { seen.add(k); e.macros++; }
      }
    }
    return infos.get(key);
  };
  for (const p of r.parts) {
    const wanted = [...new Set(p.functionTemplates.flatMap(t => t.connections).filter(Boolean))];
    const refs = macroRefs(p);
    const sym = p.symbolId ? symById.get(p.symbolId) : undefined;
    const item: BenchItem = {
      pkg: name, partNr: p.partNr, manufacturer: p.manufacturer ?? '', description: p.descr1 ?? '',
      macro: refs[0], status: 'senza-macro', connections: wanted.length, missing: [], variants: 0, redrawn: [],
      offGrid: [], overlapping: [], isolated: [],
    };
    if (sym) {
      item.macro = refs.find(x => byName.has(base(x))) ?? refs[0];
      item.symbolId = sym.id;
      item.missing = wanted.filter(w => !sym.pins.some(q => q.label === w));
      item.status = item.missing.length ? 'parziale' : 'ok';
      item.variants = r.symbols.filter(s => s.id.startsWith(sym.id + '~')).length;
      item.redrawn = r.redrawn[sym.id] ?? [];
      Object.assign(item, symbolChecks(sym));
      report.symbols[sym.id] = { name: sym.name, prims: sym.prims, pins: sym.pins };
    } else if (p.symbolId && BUILTIN.has(p.symbolId)) {
      const b = BUILTIN.get(p.symbolId)!;
      item.status = 'morsetto';
      item.symbolId = b.id;
      item.reason = b.name;
      report.symbols[b.id] = { name: b.name, prims: b.prims, pins: b.pins };
    } else if (refs.length) {
      const present = refs.find(x => byName.has(base(x)));
      if (!present) { item.status = 'macro-assente'; item.reason = `non c'è nel pacchetto: ${refs.map(base).join(', ')}`; }
      else {
        item.macro = present;
        const f = byName.get(base(present))!;
        const i = info(base(present));
        if (f.data.length >= 8_000_000) { item.status = 'non-letta'; item.reason = 'macro oltre 8 MB, saltata'; }
        else if (!i?.xml) { item.status = 'non-letta'; item.reason = 'macro non in XML (binaria)'; }
        else if (!i.variantTypes['1']) {
          // Solo layout del quadro o modello 3D (MacroFuncType 4, 6, 10…): per lo schema è come senza macro
          item.status = 'senza-macro';
          item.reason = `la macro non ha varianti di schema, solo altre rappresentazioni (tipi: ${Object.keys(i.variantTypes).join(', ') || 'nessuno'})`;
        }
        else if (i.libraryRefs.some(unknownRef)) {
          item.status = 'libreria';
          item.reason = [...new Set(i.libraryRefs.filter(unknownRef).map(x => `${x.lib} ${x.num} (funzione ${x.category || '?'})`))].join(', ');
        } else { item.status = 'non-letta'; item.reason = 'variante di schema senza morsetti o con meno di metà dei morsetti dell\'articolo'; }
      }
    }
    if (item.status === 'senza-macro' && !p.functionTemplates.length) item.status = 'accessorio';
    for (const ref of refs) if (byName.has(base(ref))) info(base(ref));
    report.counts[item.status]++;
    report.items.push(item);
  }
  report.packages.push({ name, files: files.length, parts: r.parts.length, macros: r.macros.length, warnings: r.warnings.length });
}

export function emptyReport(): BenchReport {
  return {
    created: new Date().toISOString(), packages: [], items: [], libraryRefs: [], variantTypes: {}, symbols: {},
    counts: { ok: 0, parziale: 0, morsetto: 0, libreria: 0, 'non-letta': 0, 'macro-assente': 0, 'senza-macro': 0, accessorio: 0 },
  };
}

export function finishReport(r: BenchReport): BenchReport {
  r.libraryRefs.sort((a, b) => b.refs - a.refs);
  return r;
}
