// Morsettiere: numerazione dei morsetti (anche a più piani), ponticelli, riserve,
// accessori e dati per lo schema della morsettiera.
//
// Sigla di un morsetto: "<morsettiera>:<numero><piano>", es. "X1.1.2:3" oppure, per un
// morsetto a due piani, "X1:1A" e "X1:1B" (stesso morsetto fisico, piani A e B).
import { listTextScale } from './drawingStyle';
import type { Project, TerminalStripData, Jumper, Part, Page, Panel } from './types';
import { allPlaced, byPosition, locationOf, deviceInfo, partsIndex, stripOf, type PlacedElement, type DeviceInfo } from './devices';
import { computeNetlist, type Net } from './netlist';
import { uid, pinsWorld } from './geometry';
import { landing, landingCtx } from './landing';
import { tx } from '../i18n/ui';

/** Numero del morsetto in una sigla: "X1.1.2:1A" → "1A" */
export const terminalNo = (tag: string) => (tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : '');

/** "1A" → { n: 1, base: "1", level: "A" }; nomi non numerici (es. "PE") restano interi */
export function parseTerminalNo(no: string): { n: number; base: string; level: string } {
  const m = /^(\d+)([A-Za-z]?)$/.exec(no.trim());
  if (!m) return { n: NaN, base: no.trim(), level: '' };
  return { n: parseInt(m[1], 10), base: m[1], level: m[2].toUpperCase() };
}

/** Confronto naturale dei numeri di morsetto: 1, 1A, 1B, 2, 10, PE */
export function compareTerminalNo(a: string, b: string): number {
  const pa = parseTerminalNo(a), pb = parseTerminalNo(b);
  if (!isNaN(pa.n) && !isNaN(pb.n)) return pa.n - pb.n || pa.level.localeCompare(pb.level);
  if (isNaN(pa.n) !== isNaN(pb.n)) return isNaN(pa.n) ? 1 : -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

export const emptyStrip = (): TerminalStripData => ({ jumpers: [], spares: [], separators: [] });

/** Dati della morsettiera (senza modificarla) */
export function stripData(p: Project, strip: string): TerminalStripData {
  return { ...emptyStrip(), ...(p.terminalStrips?.[strip] ?? {}) };
}

/** Dati della morsettiera da modificare (li crea se mancano) */
export function ensureStrip(p: Project, strip: string): TerminalStripData {
  p.terminalStrips ??= {};
  const d = (p.terminalStrips[strip] ??= emptyStrip());
  d.jumpers ??= []; d.spares ??= []; d.separators ??= [];
  return d;
}

const terminals = (p: Project) => allPlaced(p).filter(e => e.sym.role === 'terminal' && e.inst.tag.includes(':'));

/** Morsettiere del progetto, in ordine naturale (X1, X1.1.2, X2, X10) */
export function allStrips(p: Project): string[] {
  const s = new Set(terminals(p).map(e => stripOf(e.inst.tag)));
  for (const [k, d] of Object.entries(p.terminalStrips ?? {})) if (d.spares?.length) s.add(k);
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface TerminalRow {
  strip: string;
  /** Numero completo, es. "1A" */
  no: string;
  base: string;
  level: string;
  /** Rappresentazioni sullo schema (vuoto per un morsetto di riserva) */
  els: PlacedElement[];
  spare: boolean;
}

/** Morsetti di una morsettiera (disegnati e di riserva) in ordine di numero */
export function stripRows(p: Project, strip: string): TerminalRow[] {
  const map = new Map<string, TerminalRow>();
  const row = (no: string) => {
    let r = map.get(no);
    if (!r) { const t = parseTerminalNo(no); r = { strip, no, base: t.base, level: t.level, els: [], spare: false }; map.set(no, r); }
    return r;
  };
  for (const e of terminals(p).sort(byPosition)) if (stripOf(e.inst.tag) === strip) row(terminalNo(e.inst.tag)).els.push(e);
  for (const no of stripData(p, strip).spares) { const r = row(no); if (!r.els.length) r.spare = true; }
  return [...map.values()].sort((a, b) => compareTerminalNo(a.no, b.no));
}

/**
 * Numeri liberi di una morsettiera per i morsetti copiati (ids) con i loro piani (levels, es. ["A"]),
 * dal più basso: occupato = c'è un altro morsetto disegnato sugli stessi piani (un numero con solo il
 * piano B disegnato resta libero per una copia del piano A). Le riserve (vista Morsetti) non sono
 * disegnate: sono libere, e spare dice quali numeri lo sono.
 */
export function freeTerminalNumbers(p: Project, strip: string, levels: string[], ids: string[], count: number) {
  const rows = stripRows(p, strip);
  const sameLevel = (lv: string) => !levels.length || !lv || levels.includes(lv);
  const num = (r: TerminalRow) => (r.base === String(parseInt(r.base, 10)) ? parseInt(r.base, 10) : NaN);
  const used = new Set(rows.filter(r => r.els.length && sameLevel(r.level) && !r.els.every(x => ids.includes(x.inst.id))).map(num).filter(n => !isNaN(n)));
  // Riserve segnate nella morsettiera (anche quella appena presa dalla copia stessa)
  const spare = new Set(stripData(p, strip).spares.map(no => parseTerminalNo(no))
    .filter(t => sameLevel(t.level) && t.base === String(t.n)).map(t => t.n));
  const free: number[] = [];
  for (let n = 1; free.length < count; n++) if (!used.has(n)) free.push(n);
  return { free, used, spare };
}

/** Morsetti fisici di una morsettiera: i piani di uno stesso morsetto (1A, 1B…) contano uno */
export function physicalCount(rows: TerminalRow[]): number {
  return new Set(rows.map(r => (isNaN(parseInt(r.base, 10)) ? r.no : r.base))).size;
}

/**
 * Primo morsetto libero di una morsettiera: "X1" → "X1:5". Libero = non ancora disegnato sullo
 * schema, quindi un buco della numerazione o una riserva (il morsetto disegnato prende il posto
 * della riserva, anche di un piano: "5A"); i piani contano come il loro morsetto.
 */
export function nextTerminal(p: Project, strip: string): string {
  const rows = stripRows(p, strip);
  const used = new Set(rows.filter(r => r.els.length).map(r => parseInt(r.base, 10)).filter(n => !isNaN(n)));
  let n = 1;
  while (used.has(n)) n++;
  const spare = rows.find(r => r.spare && parseInt(r.base, 10) === n && r.base === String(n));
  return `${strip}:${spare?.no ?? n}`;
}

/** Piani dei morsetti di una morsettiera: la lettera più alta usata, o quelli dell'articolo */
export function stripLevels(p: Project, strip: string): number {
  let n = 1;
  for (const r of stripRows(p, strip)) if (r.level) n = Math.max(n, r.level.charCodeAt(0) - 64);
  const part = p.terminalStrips?.[strip]?.partNr;
  const lv = part ? p.parts.find(x => x.partNr === part)?.terminal?.levels : undefined;
  return Math.max(n, lv ?? 1);
}

/**
 * Morsetto da posare dopo `after` con «Inserisci morsetto»: la riserva successiva (1A → 1B → 2A…),
 * poi il primo numero libero, con il piano A se la morsettiera ha morsetti a più piani.
 */
export function nextToPlace(p: Project, strip: string, after: string): string {
  const rows = stripRows(p, strip);
  const spares = rows.filter(r => r.spare);
  const next = spares.find(r => compareTerminalNo(r.no, after) > 0) ?? spares[0];
  if (next) return next.no;
  const levels = stripLevels(p, strip);
  const t = parseTerminalNo(after);
  const placed = new Set(rows.filter(r => r.els.length).map(r => r.no.toUpperCase()));
  if (t.level && t.level.charCodeAt(0) - 64 < levels) {
    const no = `${t.base}${String.fromCharCode(t.level.charCodeAt(0) + 1)}`;
    if (!placed.has(no)) return no;
  }
  if (levels > 1) {
    const used = new Set(rows.filter(r => r.els.length).map(r => r.base));
    let n = 1;
    while (used.has(String(n))) n++;
    return `${n}A`;
  }
  return terminalNo(nextTerminal(p, strip));
}

/** Prossimo piano libero di un morsetto: con 1A e 1B già usati → "C" */
export function nextLevel(p: Project, strip: string, base: string): string {
  const used = new Set(stripRows(p, strip).filter(r => r.base === base).map(r => r.level || 'A'));
  for (let c = 65; c < 91; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
  return '';
}

/** Applica una rinomina dei numeri a simboli, riserve, ponticelli e separatori */
function applyRename(p: Project, strip: string, map: Map<string, string>, newStrip = strip) {
  for (const pg of p.pages) for (const e of pg.elements) {
    if (e.kind !== 'symbol' || !e.tag.includes(':') || stripOf(e.tag) !== strip) continue;
    const no = terminalNo(e.tag);
    e.tag = `${newStrip}:${map.get(no) ?? no}`;
  }
  const d = p.terminalStrips?.[strip];
  if (!d) return;
  const r = (no: string) => map.get(no) ?? no;
  d.spares = (d.spares ?? []).map(r);
  if (d.spareParts) d.spareParts = Object.fromEntries(Object.entries(d.spareParts).map(([k, v]) => [r(k), v]));
  d.separators = (d.separators ?? []).map(r);
  for (const j of d.jumpers ?? []) j.terminals = j.terminals.map(r);
  if (newStrip !== strip) { delete p.terminalStrips![strip]; p.terminalStrips![newStrip] = d; }
}

/**
 * Rinumera una morsettiera da 1 nell'ordine dello schema (pagina, poi da sinistra a destra
 * e dall'alto in basso). I piani di uno stesso morsetto restano insieme e mantengono la
 * lettera; i morsetti di riserva vanno in coda; quelli con nome non numerico (es. "PE") restano.
 */
export function renumberStrip(p: Project, strip: string): number {
  const rows = stripRows(p, strip);
  const firstPos = new Map<string, PlacedElement>();
  for (const r of rows) {
    if (isNaN(parseInt(r.base, 10))) continue;
    for (const e of r.els) { const f = firstPos.get(r.base); if (!f || byPosition(e, f) < 0) firstPos.set(r.base, e); }
  }
  const placed = [...firstPos.entries()].sort((a, b) => byPosition(a[1], b[1])).map(x => x[0]);
  const spares = [...new Set(rows.filter(r => !firstPos.has(r.base) && !isNaN(parseInt(r.base, 10))).map(r => r.base))];
  const baseMap = new Map<string, string>();
  [...placed, ...spares].forEach((b, i) => baseMap.set(b, String(i + 1)));
  const map = new Map<string, string>();
  let changed = 0;
  for (const r of rows) {
    const nb = baseMap.get(r.base);
    if (!nb) continue;
    const no = nb + r.level;
    if (no !== r.no) changed++;
    map.set(r.no, no);
  }
  applyRename(p, strip, map);
  return changed;
}

/**
 * Cambia nome a una morsettiera: morsetti dello schema, dati della morsettiera, pagine dello schema
 * della morsettiera e layout del quadro. Se la morsettiera di arrivo esiste già le due si uniscono,
 * purché non abbiano numeri in comune. Restituisce i numeri in conflitto (vuoto = fatto).
 */
export function renameStrip(p: Project, from: string, to: string): string[] {
  if (!to || from === to) return [];
  const target = allStrips(p).includes(to) || !!p.terminalStrips?.[to];
  if (target) {
    const have = new Set(stripRows(p, to).map(r => r.no));
    const clash = stripRows(p, from).map(r => r.no).filter(no => have.has(no));
    if (clash.length) return clash;
    const a = p.terminalStrips?.[from], b = p.terminalStrips?.[to];
    if (a && b) {
      b.spares = [...(b.spares ?? []), ...(a.spares ?? [])];
      b.separators = [...(b.separators ?? []), ...(a.separators ?? [])];
      b.jumpers = [...(b.jumpers ?? []), ...(a.jumpers ?? [])];
      if (a.spareParts) b.spareParts = { ...(b.spareParts ?? {}), ...a.spareParts };
      for (const k of ['partNr', 'endPlatePartNr', 'endStopPartNr', 'jumperPartNr', 'separatorPartNr'] as const) b[k] ??= a[k];
      delete p.terminalStrips![from];
    }
  }
  applyRename(p, from, new Map(), to);
  for (const pg of p.pages) {
    if (pg.type === 'strip' && pg.strip === from) {
      // Unendo due morsettiere le pagine di quella rinominata non servono più (le rifà syncStripPages)
      if (target) pg.strip = undefined; else pg.strip = to;
    }
    for (const it of pg.layout?.items ?? []) if (it.kind === 'strip' && it.ref === from) it.ref = to;
  }
  if (target) p.pages = p.pages.filter(pg => pg.type !== 'strip' || pg.strip !== undefined);
  if (p.pages.some(pg => pg.type === 'strip')) syncStripPages(p);
  return [];
}

/**
 * Cambia il numero ai morsetti indicati (vecchio → nuovo), es. riserve 10 e 11 → 10A e 10B, oppure
 * 15A → 18A. Cambiano i morsetti dello schema, le riserve, i ponticelli e i separatori.
 * Restituisce l'errore (numero già usato, doppio o vuoto) oppure "" se fatto.
 */
export function renameTerminals(p: Project, strip: string, changes: Map<string, string>): string {
  const map = new Map<string, string>();
  for (const [a, b] of changes) {
    const to = b.trim().replace(/^.*:/, '');
    if (!to) return tx('Morsetto {0}: numero vuoto', a);
    if (to !== a) map.set(a, /^\d+[a-z]$/.test(to) ? to.toUpperCase() : to);
  }
  if (!map.size) return '';
  const targets = [...map.values()];
  const dup = targets.find((t, i) => targets.indexOf(t) !== i);
  if (dup) return tx('Numero {0} dato a più morsetti', dup);
  const stay = new Set(stripRows(p, strip).map(r => r.no).filter(no => !map.has(no)));
  const used = targets.find(t => stay.has(t));
  if (used) return tx('Il numero {0} è già usato in questa morsettiera', used);
  applyRename(p, strip, map);
  const d = p.terminalStrips?.[strip];
  if (d) for (const j of d.jumpers ?? []) j.terminals.sort(compareTerminalNo);
  return '';
}

/**
 * Trasforma un morsetto a un piano in uno a più piani: "1" diventa "1A" (anche nelle riserve,
 * nei ponticelli e nei separatori). Restituisce la sigla del piano successivo da inserire.
 */
export function addLevel(p: Project, strip: string, no: string): string {
  const t = parseTerminalNo(no);
  if (isNaN(t.n)) return `${strip}:${no}`;
  if (!t.level) applyRename(p, strip, new Map([[t.base, `${t.base}A`]]));
  return `${strip}:${t.base}${nextLevel(p, strip, t.base)}`;
}

/** Ponticello di cui fa parte un morsetto */
export const jumperOf = (d: TerminalStripData, no: string): Jumper | undefined => d.jumpers.find(j => j.terminals.includes(no));

/**
 * Collega con un ponticello i morsetti indicati. Se uno di essi è già in un ponticello
 * dello stesso tipo, i ponticelli vengono uniti.
 */
export function addJumper(p: Project, strip: string, nos: string[], kind: Jumper['kind']) {
  if (nos.length < 2) return;
  const d = ensureStrip(p, strip);
  const merged = d.jumpers.filter(j => j.kind === kind && j.terminals.some(t => nos.includes(t)));
  const all = new Set([...nos, ...merged.flatMap(j => j.terminals)]);
  // Un morsetto sta in un solo ponticello: lo tolgo da quelli dell'altro tipo
  for (const j of d.jumpers) if (j.kind !== kind) j.terminals = j.terminals.filter(t => !all.has(t));
  d.jumpers = d.jumpers.filter(j => !merged.includes(j) && j.terminals.length >= 2);
  d.jumpers.push({ id: uid('j'), kind, terminals: [...all].sort(compareTerminalNo), partNr: merged.find(j => j.partNr)?.partNr });
}

/** Toglie i morsetti indicati dai loro ponticelli */
export function removeFromJumpers(p: Project, strip: string, nos: string[]) {
  const d = ensureStrip(p, strip);
  for (const j of d.jumpers) j.terminals = j.terminals.filter(t => !nos.includes(t));
  d.jumpers = d.jumpers.filter(j => j.terminals.length >= 2);
}

/**
 * Primo numero libero per una riserva: il primo buco nella numerazione (un morsetto non ancora
 * disegnato tra quelli esistenti), altrimenti il successivo all'ultimo. Con `from` si parte da lì.
 */
export function freeTerminalNo(p: Project, strip: string, from = 1): string {
  const used = new Set(stripRows(p, strip).map(r => parseInt(r.base, 10)).filter(n => !isNaN(n)));
  let n = Math.max(1, from);
  while (used.has(n)) n++;
  return String(n);
}

/**
 * Aggiunge morsetti di riserva. Senza numero riempiono i buchi della numerazione e poi vanno in
 * coda; con un numero (es. "7" o "7B") la prima riserva prende quello e le altre i liberi dopo.
 * Un morsetto disegnato in seguito con lo stesso numero prende il posto della riserva.
 * Restituisce i numeri aggiunti (vuoto se il numero chiesto è già usato).
 */
export function addSpares(p: Project, strip: string, count: number, start?: string, partNr?: string, levels = 1): string[] {
  const added: string[] = [];
  const exists = (no: string) => stripRows(p, strip).some(r => r.no.toUpperCase() === no.toUpperCase());
  if (levels > 1 && !start?.trim()) {
    // Morsetti a più piani: count morsetti fisici, numerati 1A…nA, 1B…nB (un piano per lettera)
    const used = new Set(stripRows(p, strip).map(r => r.base.toUpperCase()));
    const bases: number[] = [];
    for (let n = 1; bases.length < count; n++) if (!used.has(String(n))) bases.push(n);
    for (let l = 0; l < Math.min(levels, 26); l++) for (const n of bases) add(`${n}${String.fromCharCode(65 + l)}`);
    return added;
  }
  let from = 1;
  if (start?.trim()) {
    const no = start.trim();
    if (exists(no)) return [];
    const t = parseTerminalNo(no);
    if (t.level && !isNaN(t.n)) {
      // Piano di riserva di un morsetto a un piano: il morsetto diventa "nA"
      if (stripRows(p, strip).some(r => r.no === t.base)) applyRename(p, strip, new Map([[t.base, `${t.base}A`]]));
      if (exists(no)) return [];
    }
    add(no);
    from = isNaN(t.n) ? 1 : t.n + 1;
  }
  while (added.length < count) add(freeTerminalNo(p, strip, from));
  return added;

  function add(no: string) {
    const d = ensureStrip(p, strip);
    d.spares.push(no);
    if (partNr) (d.spareParts ??= {})[no] = partNr;
    added.push(no);
  }
}

/** Articolo dei morsetti di riserva indicati (vuoto = quello predefinito della morsettiera) */
export function setSparePart(p: Project, strip: string, nos: string[], partNr: string | undefined) {
  const d = p.terminalStrips?.[strip];
  if (!d?.spares?.some(s => nos.includes(s))) return;
  const sp = { ...(d.spareParts ?? {}) };
  for (const no of nos) if (d.spares.includes(no)) { if (partNr) sp[no] = partNr; else delete sp[no]; }
  if (Object.keys(sp).length) d.spareParts = sp; else delete d.spareParts;
}

/** Toglie i morsetti indicati dalle riserve (quelli disegnati non cambiano) */
export function removeSpares(p: Project, strip: string, nos: string[]) {
  const d = ensureStrip(p, strip);
  d.spares = d.spares.filter(s => !nos.includes(s));
  if (d.spareParts) {
    for (const no of nos) delete d.spareParts[no];
    if (!Object.keys(d.spareParts).length) delete d.spareParts;
  }
  // Ponticelli e separatori dei morsetti che non esistono più
  const exist = new Set(stripRows(p, strip).map(r => r.no));
  for (const j of d.jumpers) j.terminals = j.terminals.filter(t => exist.has(t));
  d.jumpers = d.jumpers.filter(j => j.terminals.length >= 2);
  d.separators = d.separators.filter(t => exist.has(t));
}

// ---------------------------------------------------------------------------
// Distinta: un articolo per morsetto fisico (tutti i piani insieme) e accessori
// ---------------------------------------------------------------------------

export interface BomItem { info: DeviceInfo; tag: string; qty?: number }

/** Fermi, piastra di chiusura e accessori liberi della morsettiera con le quantità (separatori e ponticelli a parte) */
export function stripAccessories(d: Pick<TerminalStripData, 'endPlatePartNr' | 'endPlateQty' | 'endStopPartNr' | 'endStopQty' | 'accessories'>): { kind: 'endStop' | 'endPlate' | 'other'; partNr: string; qty: number; note?: string }[] {
  const out: ReturnType<typeof stripAccessories> = [];
  if (d.endStopPartNr && (d.endStopQty ?? 2) > 0) out.push({ kind: 'endStop', partNr: d.endStopPartNr, qty: d.endStopQty ?? 2 });
  if (d.endPlatePartNr && (d.endPlateQty ?? 1) > 0) out.push({ kind: 'endPlate', partNr: d.endPlatePartNr, qty: d.endPlateQty ?? 1 });
  for (const a of d.accessories ?? []) if (a.partNr && a.qty > 0) out.push({ kind: 'other', partNr: a.partNr, qty: a.qty, note: a.note });
  return out;
}

/** Dati d'ordine di un articolo, con i valori propri del morsetto che prevalgono */
function infoFor(own: DeviceInfo, partNr: string | undefined, parts: Map<string, Part>): DeviceInfo {
  if (own.partNr || !partNr) return own;
  const part = parts.get(partNr);
  return {
    ...own, partNr, part,
    typeNr: own.typeNr ?? part?.typeNr, manufacturer: own.manufacturer ?? part?.manufacturer,
    orderNr: own.orderNr ?? part?.orderNr, description: own.description ?? part?.descr1,
  };
}

const partInfo = (partNr: string, parts: Map<string, Part>): DeviceInfo => infoFor({}, partNr, parts);

export function terminalBomItems(p: Project, library: Part[] = []): BomItem[] {
  const parts = partsIndex(p, library);
  const out: BomItem[] = [];
  for (const strip of allStrips(p)) {
    const d = stripData(p, strip);
    const rows = stripRows(p, strip);
    const groups = new Map<string, TerminalRow[]>();
    for (const r of rows) groups.set(r.base, [...(groups.get(r.base) ?? []), r]);
    for (const [base, g] of groups) {
      const els = g.flatMap(r => r.els);
      const own = els.length ? deviceInfo(els, els[0], parts) : {};
      // Articolo della riserva: vale anche per il morsetto disegnato al suo posto, se non ne ha uno
      const spare = g.map(r => d.spareParts?.[r.no]).find(Boolean);
      const info = infoFor(own, spare ?? d.partNr, parts);
      out.push({ info, tag: `-${strip}:${g.length > 1 ? `${base}${g.map(r => r.level).join('/')}` : g[0].no}` });
    }
    for (const a of stripAccessories(d)) out.push({ info: partInfo(a.partNr, parts), tag: `-${strip}`, ...(a.qty !== 1 ? { qty: a.qty } : {}) });
    if (d.separatorPartNr) for (const s of d.separators) out.push({ info: partInfo(d.separatorPartNr, parts), tag: `-${strip}:${s}` });
    for (const j of d.jumpers) {
      const nr = j.partNr ?? d.jumperPartNr;
      if (nr) out.push({ info: partInfo(nr, parts), tag: `-${strip}:${j.terminals.join('-')}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collegamenti dei morsetti (lista morsetti e schema della morsettiera)
// ---------------------------------------------------------------------------

export interface TerminalConn {
  row: TerminalRow;
  /** Destinazioni lato esterno (punto superiore) e interno (punto inferiore) */
  ext: string;
  int: string;
  extWire: string;
  intWire: string;
  jumper?: Jumper;
  separator: boolean;
  /** Posizioni sullo schema, es. ["1.3"] */
  locations: { loc: string; id: string }[];
  /** Descrizione del tipo (simbolo), es. "Morsetto PE" */
  type: string;
  /** Articolo del morsetto fisico (lo stesso per tutti i piani) */
  partNr?: string;
  /** Piani dello stesso morsetto, es. ["1A", "1B"] (vuoto per un morsetto a un piano) */
  levels: string[];
  /** Piano successivo al primo: l'articolo è quello del primo piano */
  sameAs?: string;
  /**
   * Morsetto disegnato a cui arrivano solo conduttori di scorta (Wire.spare): nelle liste conta come
   * morsetto di riserva, ma resta disegnato e con le sue destinazioni
   */
  spareWire?: boolean;
}

export function terminalConnections(p: Project, strip?: string, nets?: Net[]): TerminalConn[] {
  const nl = nets ?? computeNetlist(p).nets;
  const pinNet = new Map<string, Net>();
  for (const n of nl) for (const x of n.pins) pinNet.set(`${x.el.inst.id}|${x.pinId}`, n);
  const out: TerminalConn[] = [];
  const ctx = landingCtx(p);
  for (const s of strip ? [strip] : allStrips(p)) {
    const d = stripData(p, s);
    const rows = stripRows(p, s);
    // Piani dello stesso morsetto fisico, con l'articolo scritto su uno qualsiasi di essi
    const phys = (r: TerminalRow) => (isNaN(parseInt(r.base, 10)) ? r.no : r.base);
    const groups = new Map<string, TerminalRow[]>();
    for (const r of rows) groups.set(phys(r), [...(groups.get(phys(r)) ?? []), r]);
    for (const row of rows) {
      let spareNets = 0, otherNets = 0;
      const side = (pinIdx: number) => {
        const targets = new Set<string>(), wires = new Set<string>();
        const own = new Set(row.els.map(e => e.inst.id));
        for (const e of row.els) {
          const pin = e.sym.pins[pinIdx];
          const n = pin && pinNet.get(`${e.inst.id}|${pin.id}`);
          if (!n) continue;
          if (n.spare) spareNets++; else if (n.wires.length) otherNets++;
          // Dove arriva il filo di questo lato (pin o morsetto), non tutto il potenziale
          const from = pinsWorld(e.inst, e.sym)[pinIdx];
          const land = landing(ctx, e.page, n, { from, exclude: own });
          for (const x of land) targets.add(`-${x.ref}`);
          // Filo su una giunzione o un potenziale: il nome del potenziale; senza nome i primi punti
          if (!land.length) {
            if (n.named) targets.add(n.name);
            else for (const x of n.pins.filter(x => !own.has(x.el.inst.id)).slice(0, 2)) targets.add(`-${x.ref}`);
          }
          if (n.wireNo) wires.add(n.wireNo);
        }
        return { t: [...targets].join(', '), w: [...wires].join(', ') };
      };
      const ext = side(0), int = side(1);
      const g = groups.get(phys(row))!;
      const own = g.flatMap(r => r.els).map(e => e.inst.partNr).find(Boolean);
      out.push({
        row, ext: ext.t, int: int.t, extWire: ext.w, intWire: int.w,
        jumper: jumperOf(d, row.no), separator: d.separators.includes(row.no),
        locations: row.els.map(e => ({ loc: locationOf(e), id: e.inst.id })),
        type: row.els[0]?.sym.name ?? 'Riserva',
        partNr: own ?? g.map(r => d.spareParts?.[r.no]).find(Boolean) ?? d.partNr,
        levels: g.length > 1 ? g.map(r => r.no) : [],
        sameAs: g.length > 1 && g[0] !== row ? g[0].no : undefined,
        ...(spareNets && !otherNets ? { spareWire: true } : {}),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pagine "schema della morsettiera"
// ---------------------------------------------------------------------------

/** Righe per foglio dello schema della morsettiera (con le righe di serie) */
export const STRIP_ROWS = 40;
export const STRIP_LAYOUT = { top: 40, rowH: 4.8 };
/** Caratteri di serie (mm): titolo, articolo e foglio, intestazioni, destinazioni e fili, numero del morsetto */
export const STRIP_TEXT = { titleSize: 4, subSize: 2.6, headSize: 2, textSize: 2.1, noSize: 2.1, rowH: STRIP_LAYOUT.rowH };

export const stripStyleOf = (p: Project) => ({ ...STRIP_TEXT, ...p.settings?.stripStyle });

/** Colonne dello schema della morsettiera con le larghezze di serie (mm) */
export const STRIP_COLS = { ext: 146, extWire: 18, intWire: 16, int: 114, loc: 28 };

/** Caratteri dello schema della morsettiera con la scala dei testi delle liste */
export function stripTextOf(p: Project): typeof STRIP_TEXT {
  const s = stripStyleOf(p), k = listTextScale(p);
  return { titleSize: s.titleSize * k, subSize: s.subSize * k, headSize: s.headSize * k, textSize: s.textSize * k, noSize: s.noSize * k, rowH: s.rowH };
}

/** Morsetti per foglio: l'area delle 40 righe di serie divisa per l'altezza delle righe scelta */
export const stripRowsPer = (p: Project) => Math.max(1, Math.floor((STRIP_ROWS * STRIP_LAYOUT.rowH + 0.001) / stripStyleOf(p).rowH));

/** Crea le pagine mancanti (una o più per morsettiera) e toglie quelle che non servono più */
export function syncStripPages(p: Project): { added: number; removed: number } {
  const need = new Map<string, number>(), per = stripRowsPer(p);
  for (const s of allStrips(p)) need.set(s, Math.max(1, Math.ceil(stripRows(p, s).length / per)));
  const before = p.pages.length;
  p.pages = p.pages.filter(pg => pg.type !== 'strip' || (pg.strip !== undefined && (pg.stripSheet ?? 0) < (need.get(pg.strip) ?? 0)));
  if (!p.pages.length) p.pages.push({ id: uid('p'), name: '1', title: 'Schema', type: 'multiline', elements: [] });
  const removed = before - p.pages.length;
  let added = 0;
  for (const [s, sheets] of need) {
    for (let i = 0; i < sheets; i++) {
      const title = `Morsettiera -${s}${sheets > 1 ? ` (${i + 1}/${sheets})` : ''}`;
      const existing = p.pages.find(pg => pg.type === 'strip' && pg.strip === s && (pg.stripSheet ?? 0) === i);
      if (existing) { existing.title = title; continue; }
      const nums = p.pages.map(x => parseInt(x.name, 10)).filter(n => !isNaN(n));
      const page: Page = { id: uid('p'), name: String((nums.length ? Math.max(...nums) : 0) + 1), title, type: 'strip', strip: s, stripSheet: i, elements: [] };
      // I fogli della stessa morsettiera restano uno dopo l'altro
      const prev = p.pages.findLastIndex(pg => pg.type === 'strip' && pg.strip === s);
      if (prev >= 0) p.pages.splice(prev + 1, 0, page); else p.pages.push(page);
      added++;
    }
  }
  return { added, removed };
}

export interface StripSheetData {
  strip: string;
  sheet: number;
  sheets: number;
  rows: TerminalConn[];
  /** Ponticelli che toccano le righe del foglio, con la colonna in cui disegnarli */
  jumpers: { jumper: Jumper; col: number; rows: number[] }[];
  partText: string;
  /** Fermi terminali in cima (primo foglio) e in fondo (ultimo foglio), piastra di chiusura dopo l'ultimo morsetto */
  endStopTop?: boolean;
  endStopBottom?: boolean;
  endPlate?: boolean;
  /** Accessori della morsettiera scritti in fondo all'ultimo foglio (es. «2 × WEW 35/2») */
  accessories?: string[];
}

export function stripSheets(p: Project, library: Part[] = [], nets?: Net[]): Map<string, StripSheetData> {
  const parts = partsIndex(p, library);
  const out = new Map<string, StripSheetData>();
  const conns = terminalConnections(p, undefined, nets), per = stripRowsPer(p);
  for (const pg of p.pages) {
    if (pg.type !== 'strip' || !pg.strip) continue;
    const all = conns.filter(c => c.row.strip === pg.strip);
    const sheet = pg.stripSheet ?? 0;
    const rows = all.slice(sheet * per, (sheet + 1) * per);
    const d = stripData(p, pg.strip);
    const jumpers: StripSheetData['jumpers'] = [];
    for (const j of d.jumpers) {
      const idx = rows.map((r, i) => (j.terminals.includes(r.row.no) ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      // Colonna libera: i ponticelli che si sovrappongono vanno affiancati
      let col = 0;
      while (jumpers.some(o => o.col === col && Math.max(...o.rows) >= Math.min(...idx) && Math.min(...o.rows) <= Math.max(...idx))) col++;
      jumpers.push({ jumper: j, col, rows: idx });
    }
    const part = d.partNr ? parts.get(d.partNr) : undefined;
    const sheets = Math.max(1, Math.ceil(all.length / per)), last = sheet === sheets - 1;
    const acc = stripAccessories(d);
    const name = (nr: string) => { const q = parts.get(nr); return q?.typeNr || nr; };
    out.set(pg.id, {
      strip: pg.strip, sheet, sheets, rows, jumpers,
      partText: part ? [part.manufacturer, part.typeNr || part.partNr, part.descr1].filter(Boolean).join('  ·  ') : '',
      endStopTop: sheet === 0 && acc.some(a => a.kind === 'endStop'),
      endStopBottom: last && acc.some(a => a.kind === 'endStop' && a.qty > 1),
      endPlate: last && acc.some(a => a.kind === 'endPlate'),
      ...(last && acc.length ? { accessories: acc.map(a => `${a.qty} × ${name(a.partNr)}${a.note ? ` (${a.note})` : ''}`) } : {}),
    });
  }
  return out;
}

/** Pagina dello schema della morsettiera per ogni morsettiera (per i rimandi dai morsetti) */
export function stripPageRefs(p: Project): Map<string, string> {
  const out = new Map<string, string>();
  for (const pg of p.pages) if (pg.type === 'strip' && pg.strip && !out.has(pg.strip)) out.set(pg.strip, pg.name);
  return out;
}

/**
 * Quadro di una morsettiera: il luogo scritto sui morsetti, poi il quadro il cui codice compare
 * all'inizio del nome (X1.2.21 → Q1.2: i numeri del quadro, non le lettere), poi il quadro delle
 * pagine dove la morsettiera è disegnata più spesso
 */
export function stripPanel(p: Project, strip: string): Panel | undefined {
  const panels = p.panels ?? [];
  if (!panels.length) return undefined;
  const rows = stripRows(p, strip);
  const loc = rows.flatMap(r => r.els.map(e => e.inst.loc)).find(Boolean);
  const byLoc = loc ? panels.find(x => x.code === loc) : undefined;
  if (byLoc) return byLoc;
  const digits = (s: string) => s.replace(/^[^\d]+/, '');
  const name = digits(strip);
  const byName = panels.filter(x => digits(x.code) && (name === digits(x.code) || name.startsWith(`${digits(x.code)}.`))).sort((a, b) => digits(b.code).length - digits(a.code).length)[0];
  if (byName) return byName;
  const n = new Map<string, number>();
  for (const r of rows) for (const e of r.els) if (e.page.panelId) n.set(e.page.panelId, (n.get(e.page.panelId) ?? 0) + 1);
  const best = [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  return panels.find(x => x.id === best);
}
