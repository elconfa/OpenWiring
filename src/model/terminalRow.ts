// Morsetti in fila: si scelgono i fili (con una linea che li attraversa o uno per uno) e su
// ognuno va un morsetto, numerato a coppie (1A, 1B, 2A…), per piano (1A…nA, poi 1B…) o
// secondo il pin del dispositivo collegato al filo (morsetto n = pin (n−1)·piani+1 … n·piani).
import type { Project, Page, Pt, Wire, SymbolInstance, SymbolDef } from './types';
import { getSymbol, pinsWorld, uid } from './geometry';
import { allowedRots } from './rotations';
import { ensureStrip, parseTerminalNo, stripRows } from './terminals';
export { stripLevels } from './terminals';
import { splitWiresAtSymbols } from './wireEdit';
import { tx } from '../i18n/ui';

export type TerminalRowMode = 'row' | 'level' | 'pin';
export interface TerminalPick { wireId: string; at: Pt }
export interface TerminalRowItem extends TerminalPick { no: string }
export interface TerminalRowPlan { items: TerminalRowItem[]; problems: string[] }

const letter = (i: number) => String.fromCharCode(65 + i);
const key = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/**
 * Pin del dispositivo collegato al filo, seguendo il filo anche se è in più tratti (non oltre
 * una giunzione a T); morsetti, rimandi e potenziali non contano.
 */
export function wirePinLabel(project: Project, pg: Page, wire: Wire): string | undefined {
  const pins = new Map<string, string>();
  for (const e of pg.elements) {
    if (e.kind !== 'symbol') continue;
    const sym = getSymbol(e.symbolId, project);
    if (!sym || sym.role === 'terminal' || sym.role === 'link' || sym.role === 'potential') continue;
    for (const q of pinsWorld(e, sym)) pins.set(key(q), e.pinLabels?.[q.pin.id] || q.pin.label || q.pin.id);
  }
  const ends = new Map<string, Wire[]>();
  for (const w of pg.elements) {
    if (w.kind !== 'wire' || w.points.length < 2) continue;
    for (const q of [w.points[0], w.points[w.points.length - 1]]) ends.set(key(q), [...(ends.get(key(q)) ?? []), w]);
  }
  const seen = new Set([wire.id]);
  const queue = [wire];
  while (queue.length) {
    const w = queue.shift()!;
    for (const q of [w.points[0], w.points[w.points.length - 1]]) {
      const k = key(q);
      if (pins.has(k)) return pins.get(k);
      const next = (ends.get(k) ?? []).filter(o => !seen.has(o.id));
      if (next.length === 1 && (ends.get(k)?.length ?? 0) === 2) { seen.add(next[0].id); queue.push(next[0]); }
    }
  }
  return undefined;
}

/** Numeri dei morsetti per i fili scelti, nell'ordine della scelta */
export function planTerminalRow(project: Project, pg: Page, picks: TerminalPick[], opts: { strip: string; levels: number; mode: TerminalRowMode; start?: number }): TerminalRowPlan {
  const { strip, mode } = opts;
  const levels = Math.max(1, Math.min(26, opts.levels));
  const rows = stripRows(project, strip);
  const placed = new Set(rows.filter(r => r.els.length).map(r => r.no.toUpperCase()));
  const placedBase = new Set(rows.filter(r => r.els.length).map(r => r.base.toUpperCase()));
  const items: TerminalRowItem[] = [], problems: string[] = [];
  const noOf = (base: number, lv: number) => (levels > 1 ? `${base}${letter(lv)}` : String(base));
  if (mode === 'pin') {
    for (const pk of picks) {
      const w = pg.elements.find((e): e is Wire => e.kind === 'wire' && e.id === pk.wireId);
      const label = w ? wirePinLabel(project, pg, w) : undefined;
      const n = parseInt(label ?? '', 10);
      if (!label || isNaN(n) || n < 1 || String(n) !== label.trim()) { problems.push(tx('Filo senza pin numerato di un dispositivo: saltato')); continue; }
      const no = noOf(Math.ceil(n / levels), (n - 1) % levels);
      if (placed.has(no.toUpperCase()) || items.some(x => x.no === no)) { problems.push(tx('Morsetto {0} già sullo schema: saltato', no)); continue; }
      items.push({ ...pk, no });
    }
    return { items, problems };
  }
  // Numeri liberi (le riserve contano libere): per più piani servono tutti i piani del numero
  const need = levels > 1 ? Math.ceil(picks.length / levels) : picks.length;
  const bases: number[] = [];
  for (let n = Math.max(1, opts.start ?? 1); bases.length < need; n++) {
    const free = levels > 1 ? !placedBase.has(String(n)) : !placed.has(String(n)) && ![...placed].some(x => parseTerminalNo(x).base === String(n));
    if (free) bases.push(n);
  }
  picks.forEach((pk, i) => {
    const no = levels === 1 ? String(bases[i])
      : mode === 'row' ? noOf(bases[Math.floor(i / levels)], i % levels)
      : noOf(bases[i % need], Math.floor(i / need));
    items.push({ ...pk, no });
  });
  return { items, problems };
}

/** Posizione e rotazione del morsetto sul tratto del filo: i due pin sul tratto, il primo vicino al punto scelto */
function placeOn(sym: SymbolDef, wire: Wire, at: Pt): Pick<SymbolInstance, 'x' | 'y' | 'rot'> | undefined {
  for (let i = 0; i < wire.points.length - 1; i++) {
    const a = wire.points[i], b = wire.points[i + 1];
    const vertical = Math.abs(a.x - b.x) < 0.01;
    if (!(vertical ? Math.abs(at.x - a.x) < 0.01 && at.y >= Math.min(a.y, b.y) - 0.01 && at.y <= Math.max(a.y, b.y) + 0.01
      : Math.abs(at.y - a.y) < 0.01 && at.x >= Math.min(a.x, b.x) - 0.01 && at.x <= Math.max(a.x, b.x) + 0.01)) continue;
    for (const rot of allowedRots(sym)) {
      const ps = pinsWorld({ kind: 'symbol', id: '', symbolId: sym.id, x: 0, y: 0, rot, tag: '', pinLabels: {} } as SymbolInstance, sym);
      if (ps.length < 2) return undefined;
      const d = { x: ps[1].x - ps[0].x, y: ps[1].y - ps[0].y };
      if (vertical ? Math.abs(d.x) > 0.01 : Math.abs(d.y) > 0.01) continue;
      const len = Math.abs(vertical ? d.y : d.x);
      const lo = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x), hi = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
      if (hi - lo < len) return undefined;
      // Il morsetto si centra sul punto scelto, sulla griglia di 4 mm, senza uscire dal tratto
      const c = vertical ? at.y : at.x;
      const s = Math.min(Math.max(Math.round((c - len / 2) / 4) * 4, lo), hi - len);
      const first = Math.min(vertical ? ps[0].y : ps[0].x, vertical ? ps[1].y : ps[1].x);
      return vertical ? { x: a.x - ps[0].x, y: s - first, rot } : { x: s - first, y: a.y - ps[0].y, rot };
    }
  }
  return undefined;
}

/** Inserisce i morsetti sui fili (il filo si interrompe sui due pin); restituisce gli id e i problemi */
export function applyTerminalRow(p: Project, pg: Page, items: TerminalRowItem[], symbolId: string, strip: string, partNr?: string): { ids: string[]; nos: string[]; problems: string[] } {
  const sym = getSymbol(symbolId, p);
  const ids: string[] = [], nos: string[] = [], problems: string[] = [];
  if (!sym) return { ids, nos, problems: [tx('Simbolo del morsetto non trovato')] };
  const d = ensureStrip(p, strip);
  for (const it of items) {
    const w = pg.elements.find((e): e is Wire => e.kind === 'wire' && e.id === it.wireId);
    const pos = w && placeOn(sym, w, it.at);
    if (!pos) { problems.push(tx('Morsetto {0}: tratto di filo troppo corto, non inserito', it.no)); continue; }
    const inst: SymbolInstance = { kind: 'symbol', id: uid('s'), symbolId, ...pos, tag: `${strip}:${it.no}`, pinLabels: {}, autoPins: true, ...(partNr ? { partNr } : {}) };
    pg.elements.push(inst);
    ids.push(inst.id);
    nos.push(it.no);
    // Riserva dello stesso numero senza piano (es. "5" quando si posa "5A"): non serve più
    const t = parseTerminalNo(it.no);
    if (t.level) d.spares = d.spares.filter(s => s !== t.base);
    splitWiresAtSymbols(p, pg, new Set([inst.id]));
  }
  return { ids, nos, problems };
}
