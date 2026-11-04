// Fili creati o spezzati dal programma sui punti di connessione allineati:
// - un filo tirato sopra dei punti di connessione si spezza su ognuno;
// - collegamento rapido con un clic tra due punti in colonna (V) o in riga (H) (punto 31);
// - collegamento automatico come in EPLAN tra due punti affacciati sulla stessa linea (punto 37).
import type { Page, PinDir, Project, Pt, SymbolInstance, Wire } from './types';
import { getSymbol, instanceBounds, onSegmentInterior, pinDirWorld, pinsWorld, samePt, snap, uid } from './geometry';
import { normalizeWire } from './wireEdit';
import { settingsOf } from './numbering';

const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Punto di connessione di un simbolo sulla pagina, con la direzione del filo che ne esce */
export interface PagePin { inst: SymbolInstance; pinId: string; p: Pt; dir: PinDir }

export function pagePins(p: Project, pg: Page): PagePin[] {
  const out: PagePin[] = [];
  for (const e of pg.elements) {
    if (e.kind !== 'symbol') continue;
    const sym = getSymbol(e.symbolId, p);
    if (!sym) continue;
    for (const w of pinsWorld(e, sym)) out.push({ inst: e, pinId: w.pin.id, p: { x: w.x, y: w.y }, dir: pinDirWorld(w.pin.dir, e) });
  }
  return out;
}

const STEP: Record<PinDir, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<PinDir, PinDir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Direzione da a verso b (punti sulla stessa riga o colonna) */
function dirTo(a: Pt, b: Pt): PinDir | undefined {
  if (eq(a.x, b.x) && !eq(a.y, b.y)) return b.y > a.y ? 'down' : 'up';
  if (eq(a.y, b.y) && !eq(a.x, b.x)) return b.x > a.x ? 'right' : 'left';
  return undefined;
}

/**
 * Spezza i fili indicati sui punti di connessione che attraversano: il filo arriva a ogni punto e
 * riparte dal successivo. Tra due punti dello stesso simbolo uno di fronte all'altro (es. 13 e 14 di
 * un contatto attraversato dal filo) il filo si toglie: lì c'è il simbolo. I punti di uno stesso
 * simbolo affiancati (es. i tre poli in alto di un interruttore) restano uniti dal filo.
 * Ritorna gli id dei fili risultanti.
 */
export function splitWiresAtPins(p: Project, pg: Page, wireIds: Iterable<string>): string[] {
  const pins = pagePins(p, pg);
  const out: string[] = [];
  const added: Wire[] = [];
  const ids = new Set(wireIds);
  for (const w of pg.elements) {
    if (w.kind !== 'wire' || !ids.has(w.id)) continue;
    if (w.bus || w.bundle !== undefined) { out.push(w.id); continue; }
    // Percorso con i punti di connessione attraversati (estremi esclusi), in ordine lungo il filo
    const path: { p: Pt; pin?: PagePin }[] = [{ p: w.points[0] }];
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const d = (q: Pt) => Math.abs(q.x - a.x) + Math.abs(q.y - a.y);
      const hit = pins.filter(q => onSegmentInterior(q.p, a, b)).sort((m, n) => d(m.p) - d(n.p));
      // Più simboli nello stesso punto: basta il primo
      for (const h of hit) if (!samePt(path[path.length - 1].p, h.p)) path.push({ p: h.p, pin: h });
      // Il vertice b, se coincide con un punto di connessione, conta come punto attraversato
      const atB = i < w.points.length - 2 ? pins.find(q => samePt(q.p, b)) : undefined;
      path.push({ p: b, pin: atB });
    }
    const cuts = path.map((q, i) => (q.pin && i > 0 && i < path.length - 1 ? i : -1)).filter(i => i >= 0);
    if (!cuts.length) { out.push(w.id); continue; }
    // Tratti tra un taglio e il successivo
    const bounds = [0, ...cuts, path.length - 1];
    const pieces: Pt[][] = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      const s = path[bounds[k]], e = path[bounds[k + 1]];
      const pts = normalizeWire(path.slice(bounds[k], bounds[k + 1] + 1).map(q => q.p));
      if (pts.length < 2) continue;
      // Dentro il simbolo: due punti dello stesso simbolo, il primo rivolto verso il filo che arriva
      // e il secondo verso quello che riparte
      if (s.pin && e.pin && s.pin.inst.id === e.pin.inst.id && pts.length === 2) {
        const along = dirTo(pts[0], pts[1]);
        if (along && s.pin.dir === OPPOSITE[along] && e.pin.dir === along) continue;
      }
      pieces.push(pts);
    }
    if (!pieces.length) { w.points = []; continue; }
    const { id: _id, number: _n, points: _p, labels: _l, ...rest } = w;
    w.points = pieces[0];
    delete w.labels;
    out.push(w.id);
    for (const pts of pieces.slice(1)) {
      const nw: Wire = { ...rest, kind: 'wire', id: uid('w'), points: pts };
      added.push(nw);
      out.push(nw.id);
    }
  }
  pg.elements = pg.elements.filter(e => e.kind !== 'wire' || e.points.length >= 2);
  pg.elements.push(...added);
  return out.filter(id => pg.elements.some(e => e.id === id));
}

/** Il segmento a-b (aperto) passa sopra fili, punti di connessione o simboli diversi da quelli esclusi */
function blocked(p: Project, pg: Page, a: Pt, b: Pt, pins: PagePin[], except: Set<string>): boolean {
  if (pins.some(q => onSegmentInterior(q.p, a, b))) return true;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (const e of pg.elements) {
    if (e.kind === 'wire') {
      // Un filo sopra il percorso (sovrapposto, o che vi arriva con un estremo) lo occupa; uno che
      // lo incrocia di traverso no
      for (const q of e.points) if (onSegmentInterior(q, a, b)) return true;
      for (let i = 0; i < e.points.length - 1; i++) {
        const c = e.points[i], d = e.points[i + 1];
        if (onSegmentInterior(c, a, b) || onSegmentInterior(d, a, b) || onSegmentInterior(a, c, d) || onSegmentInterior(b, c, d)) return true;
        if ((samePt(c, a) && samePt(d, b)) || (samePt(c, b) && samePt(d, a))) return true;
      }
    } else if (e.kind === 'symbol' && !except.has(e.id)) {
      const sym = getSymbol(e.symbolId, p);
      if (!sym) continue;
      const r = instanceBounds(e, sym);
      // Ingombro ristretto di 1 mm (instanceBounds lo allarga) e un poco ancora, per i simboli vicini
      if (r.x0 + 1.2 < x1 && r.x1 - 1.2 > x0 && r.y0 + 1.2 < y1 && r.y1 - 1.2 > y0) return true;
      if (eq(x0, x1) && r.x0 + 1.2 < x0 && r.x1 - 1.2 > x0 && r.y0 + 1.2 < y1 && r.y1 - 1.2 > y0) return true;
      if (eq(y0, y1) && r.y0 + 1.2 < y0 && r.y1 - 1.2 > y0 && r.x0 + 1.2 < x1 && r.x1 - 1.2 > x0) return true;
    }
  }
  return false;
}

const touched = (pg: Page, q: Pt) => pg.elements.some(e => e.kind === 'wire' && e.points.some((v, i) =>
  samePt(v, q) || (i < e.points.length - 1 && onSegmentInterior(q, v, e.points[i + 1]))));

/**
 * Collegamento automatico (come EPLAN): ogni punto di connessione dei simboli indicati, ancora
 * libero, si collega al primo punto di un altro simbolo che trova nella sua direzione sulla stessa
 * linea, se è rivolto verso di lui e libero. Esempi: due contatti uno sotto l'altro, un rimando di
 * arrivo e uno di partenza sulla stessa linea, un sensore sopra un canale di un gruppo PLC.
 * Solo nelle pagine di schema multifilare e se l'impostazione del progetto è attiva.
 * Ritorna i fili creati.
 */
export function autoConnect(p: Project, pg: Page, instIds: Iterable<string>): Wire[] {
  if (pg.type !== 'multiline' || settingsOf(p).autoConnect === false) return [];
  const ids = new Set(instIds);
  const pins = pagePins(p, pg);
  const made: Wire[] = [];
  for (const a of pins) {
    if (!ids.has(a.inst.id) || touched(pg, a.p)) continue;
    const s = STEP[a.dir];
    // Il primo punto di un altro simbolo nella direzione del filo
    let best: PagePin | undefined, bd = Infinity;
    for (const b of pins) {
      if (b.inst.id === a.inst.id) continue;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
      const along = dx * s.x + dy * s.y;
      if (along < 0.01 || Math.abs(dx * s.y - dy * s.x) > 0.01) continue;
      if (along < bd) { bd = along; best = b; }
    }
    if (!best || best.dir !== OPPOSITE[a.dir] || touched(pg, best.p)) continue;
    // Gruppi dello stesso ripartitore uno sotto l'altro (poli L1, L2…): mai collegati tra loro
    if (best.inst.tag === a.inst.tag && a.inst.symbolId.startsWith('dist:') && best.inst.symbolId.startsWith('dist:')) continue;
    // Più punti nello stesso posto (es. due simboli sovrapposti): non si collega
    if (pins.filter(q => samePt(q.p, best!.p)).length > 1) continue;
    if (blocked(p, pg, a.p, best.p, pins, new Set([a.inst.id, best.inst.id]))) continue;
    const w: Wire = { kind: 'wire', id: uid('w'), points: [{ ...a.p }, { ...best.p }] };
    pg.elements.push(w);
    made.push(w);
  }
  return made;
}

/**
 * Collegamento rapido (tasti V e H): con V il clic cerca il punto di connessione più vicino sopra e
 * quello sotto, nella colonna del punto più vicino al clic (entro tol); con H a sinistra e a
 * destra. Con due punti il filo li unisce; con uno solo va dal clic (sulla griglia) al punto.
 */
export function quickWirePath(p: Project, pg: Page, click: Pt, axis: 'h' | 'v', tol = 3): Pt[] | undefined {
  const pins = pagePins(p, pg);
  const across = (q: Pt) => (axis === 'v' ? q.x : q.y), along = (q: Pt) => (axis === 'v' ? q.y : q.x);
  let line: number | undefined, bd = tol;
  for (const q of pins) { const d = Math.abs(across(q.p) - across(click)); if (d <= bd) { bd = d; line = across(q.p); } }
  if (line === undefined) return undefined;
  const onLine = pins.filter(q => eq(across(q.p), line!));
  const c = along(click);
  const before = onLine.filter(q => along(q.p) < c - 0.01).sort((m, n) => along(n.p) - along(m.p))[0];
  const after = onLine.filter(q => along(q.p) > c + 0.01).sort((m, n) => along(m.p) - along(n.p))[0];
  const at = (v: number): Pt => (axis === 'v' ? { x: line!, y: v } : { x: v, y: line! });
  let pts: Pt[] | undefined;
  if (before && after) pts = [before.p, after.p];
  else if (before || after) {
    const q = (before ?? after)!;
    const from = at(snap(c));
    if (!samePt(from, q.p)) pts = [from, q.p];
  }
  if (!pts) return undefined;
  // Già collegati da un filo dritto: niente filo doppio
  const [a, b] = pts;
  if (pg.elements.some(e => e.kind === 'wire' && e.points.length === 2 && ((samePt(e.points[0], a) && samePt(e.points[1], b)) || (samePt(e.points[0], b) && samePt(e.points[1], a))))) return undefined;
  return pts.map(q => ({ ...q }));
}
