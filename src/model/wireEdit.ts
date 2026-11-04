// Modifica dei fili: restano sempre ortogonali quando si spostano i componenti collegati, si
// trascina un tratto o un vertice, e il filo che si disegna termina dritto su un filo esistente.
import type { Pt, Page, Project, Element, Wire } from './types';
import { getSymbol, pinsWorld, samePt, onSegmentInterior, distToSegment, uid } from './geometry';

const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
const isV = (a: Pt, b: Pt) => eq(a.x, b.x);
const isH = (a: Pt, b: Pt) => eq(a.y, b.y);

/** Toglie punti doppi e punti intermedi allineati (anche quando il filo torna indietro su sé stesso) */
export function normalizeWire(pts: Pt[]): Pt[] {
  let out = pts.filter((p, i) => i === 0 || !samePt(p, pts[i - 1]));
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if ((isV(a, b) && isV(b, c)) || (isH(a, b) && isH(b, c))) {
        out = [...out.slice(0, i), ...out.slice(i + 1)].filter((p, k, arr) => k === 0 || !samePt(p, arr[k - 1]));
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Gomito tra due punti non allineati: il tratto che parte da "fixed" mantiene l'orientamento indicato */
function elbow(fixed: Pt, moving: Pt, verticalFromFixed: boolean): Pt[] {
  if (eq(fixed.x, moving.x) || eq(fixed.y, moving.y)) return [];
  return [verticalFromFixed ? { x: fixed.x, y: moving.y } : { x: moving.x, y: fixed.y }];
}

/**
 * Sposta il punto i del filo in "to" mantenendo i tratti ortogonali: i vertici vicini interni
 * scorrono con lui; gli estremi (attaccati a componenti o ad altri fili) restano fermi e si
 * aggiunge un gomito.
 */
export function dragWirePoint(pts: Pt[], i: number, to: Pt): Pt[] {
  const p = pts.map(q => ({ ...q }));
  const last = p.length - 1;
  const old = p[i];
  p[i] = { ...to };
  const before: Pt[] = [], after: Pt[] = [];
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j > last) continue;
    const n = p[j];
    const wasVertical = isV(old, n) && !isH(old, n);
    const interior = j !== 0 && j !== last;
    if (interior) {
      if (wasVertical) n.x = to.x; else n.y = to.y;
    } else {
      // Estremo fermo: gomito dal suo lato, con lo stesso orientamento del tratto originale
      const e = elbow(n, to, wasVertical);
      if (j < i) before.push(...e); else after.push(...e);
    }
  }
  return normalizeWire([...p.slice(0, i), ...before, p[i], ...after.reverse(), ...p.slice(i + 1)]);
}

/** Sposta il tratto k (tra i punti k e k+1) in perpendicolare: gli estremi del filo restano fermi */
export function dragWireSegment(pts: Pt[], k: number, delta: Pt): Pt[] {
  const a = pts[k], b = pts[k + 1];
  const horizontal = isH(a, b);
  const d = horizontal ? { x: 0, y: delta.y } : { x: delta.x, y: 0 };
  if (eq(d.x, 0) && eq(d.y, 0)) return pts;
  const mv = (q: Pt) => ({ x: q.x + d.x, y: q.y + d.y });
  const out: Pt[] = [];
  pts.forEach((q, i) => {
    if (i !== k && i !== k + 1) { out.push({ ...q }); return; }
    const end = i === 0 || i === pts.length - 1;
    // Un estremo del filo resta dov'è: si aggiunge il tratto che lo raggiunge
    if (end && i === k) out.push({ ...q }, mv(q));
    else if (end) out.push(mv(q), { ...q });
    else out.push(mv(q));
  });
  return normalizeWire(out);
}

/**
 * Sposta gli elementi selezionati e adatta i fili collegati (non selezionati) restando ortogonali.
 * Un filo con entrambi gli estremi sugli elementi spostati si sposta tutto.
 */
export function moveWithWires(p: Project, pg: Page, ids: Set<string>, dx: number, dy: number) {
  const moved: Pt[] = [];
  const movedSegs: [Pt, Pt][] = [];
  for (const e of pg.elements) {
    if (!ids.has(e.id)) continue;
    if (e.kind === 'symbol') {
      const sym = getSymbol(e.symbolId, p);
      if (sym) moved.push(...pinsWorld(e, sym).map(w => ({ x: w.x, y: w.y })));
      e.x += dx; e.y += dy;
    } else if (e.kind === 'wire') {
      moved.push(...e.points);
      for (let i = 0; i < e.points.length - 1; i++) movedSegs.push([e.points[i], e.points[i + 1]]);
      e.points = e.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
      // I numeri messi a mano seguono il filo
      if (e.labels) e.labels = e.labels.map(l => ({ ...l, x: l.x + dx, y: l.y + dy }));
    } else if (e.kind === 'cable' || e.kind === 'wiredef') {
      e.points = [{ x: e.points[0].x + dx, y: e.points[0].y + dy }, { x: e.points[1].x + dx, y: e.points[1].y + dy }];
      if (e.kind === 'wiredef' && e.label) e.label = { x: e.label.x + dx, y: e.label.y + dy };
    } else { e.x += dx; e.y += dy; }
  }
  const follows = (q: Pt) => moved.some(m => samePt(m, q)) || movedSegs.some(([a, b]) => onSegmentInterior(q, a, b));
  for (const e of pg.elements) {
    if (e.kind !== 'wire' || ids.has(e.id)) continue;
    const first = follows(e.points[0]), lastF = follows(e.points[e.points.length - 1]);
    if (first && lastF) {
      e.points = e.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
      if (e.labels) e.labels = e.labels.map(l => ({ ...l, x: l.x + dx, y: l.y + dy }));
      continue;
    }
    if (!first && !lastF) continue;
    const i = first ? 0 : e.points.length - 1;
    const to = { x: e.points[i].x + dx, y: e.points[i].y + dy };
    if (e.points.length === 2) {
      // Tratto unico: si piega a Z a metà strada per restare ortogonale
      const a = e.points[1 - i], b = e.points[i];
      const vertical = isV(a, b);
      if ((vertical && eq(dx, 0)) || (!vertical && eq(dy, 0))) { e.points[i] = to; continue; }
      const mid = vertical ? Math.round((a.y + to.y) / 2 / 4) * 4 : Math.round((a.x + to.x) / 2 / 4) * 4;
      const e1 = vertical ? { x: a.x, y: mid } : { x: mid, y: a.y };
      const e2 = vertical ? { x: to.x, y: mid } : { x: mid, y: to.y };
      const path = normalizeWire([a, e1, e2, to]);
      e.points = i === 0 ? path.reverse() : path;
    } else e.points = dragWirePoint(e.points, i, to);
  }
}

/**
 * Fine di un filo in disegno su un filo esistente: se il tratto che arriva dall'ultimo punto,
 * proseguito dritto, incontra il filo vicino al clic, il filo termina lì (giunzione a T dritta)
 * invece che nel punto del mouse.
 */
export function landOnWire(page: Page, last: Pt, click: Pt, tol: number): Pt | undefined {
  let best: { p: Pt; d: number } | undefined;
  for (const e of page.elements) {
    if (e.kind !== 'wire') continue;
    for (let i = 0; i < e.points.length - 1; i++) {
      const a = e.points[i], b = e.points[i + 1];
      if (distToSegment(click, a, b) > tol) continue;
      let cand: Pt | undefined;
      if (isH(a, b) && last.x >= Math.min(a.x, b.x) - 0.01 && last.x <= Math.max(a.x, b.x) + 0.01) cand = { x: last.x, y: a.y };
      if (isV(a, b) && last.y >= Math.min(a.y, b.y) - 0.01 && last.y <= Math.max(a.y, b.y) + 0.01) cand = { x: a.x, y: last.y };
      if (!cand || samePt(cand, last)) continue;
      const d = Math.hypot(cand.x - click.x, cand.y - click.y);
      if (!best || d < best.d) best = { p: cand, d };
    }
  }
  return best?.p;
}

/**
 * Simbolo inserito sopra un filo (es. contatto NA su un filo verticale): se due o più pin cadono
 * sullo stesso tratto, il filo viene interrotto tra il primo e l'ultimo pin e diventa due fili,
 * uno per lato, collegati ai pin. Ritorna il numero di fili interrotti.
 */
export function splitWiresAtSymbols(p: Project, pg: Page, ids: Set<string>): number {
  const pins: Pt[] = [];
  for (const e of pg.elements) {
    if (e.kind !== 'symbol' || !ids.has(e.id)) continue;
    const sym = getSymbol(e.symbolId, p);
    if (sym && sym.role !== 'potential' && sym.role !== 'link') pins.push(...pinsWorld(e, sym).map(w => ({ x: w.x, y: w.y })));
  }
  if (pins.length < 2) return 0;
  const onSeg = (q: Pt, a: Pt, b: Pt) => samePt(q, a) || samePt(q, b) || onSegmentInterior(q, a, b);
  let count = 0;
  const added: typeof pg.elements = [];
  for (const w of pg.elements) {
    if (w.kind !== 'wire' || w.bus || w.bundle !== undefined) continue;
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const hit = pins.filter(q => onSeg(q, a, b));
      if (hit.length < 2) continue;
      const t = (q: Pt) => Math.abs(q.x - a.x) + Math.abs(q.y - a.y);
      hit.sort((m, n) => t(m) - t(n));
      const first = hit[0], last = hit[hit.length - 1];
      // Filo che unisce già due pin del simbolo (ponticello): resta com'è
      if (samePt(first, last) || (samePt(first, w.points[0]) && samePt(last, w.points[w.points.length - 1]))) continue;
      const before = normalizeWire([...w.points.slice(0, i + 1), first]);
      const after = normalizeWire([last, ...w.points.slice(i + 1)]);
      const { id: _id, number: _n, points: _p, ...rest } = w;
      if (before.length >= 2 && after.length >= 2) {
        w.points = before;
        const nw: Wire = { ...rest, kind: 'wire', id: uid('w'), points: after };
        added.push(nw);
        // Il conduttore del cavo (scelto a mano o fissato) vale anche per il pezzo nuovo: lo tiene quello che il cavo attraversa
        for (const c of p.cables ?? []) {
          if (c.assign[w.id]) c.assign[nw.id] = c.assign[w.id];
          if (c.fixed?.[w.id]) c.fixed[nw.id] = c.fixed[w.id];
        }
      } else if (before.length >= 2) w.points = before;
      else if (after.length >= 2) w.points = after;
      else w.points = [];
      count++;
      break;
    }
  }
  // Fili rimasti senza lunghezza (interamente sotto il simbolo) eliminati
  pg.elements = pg.elements.filter(e => e.kind !== 'wire' || e.points.length >= 2);
  pg.elements.push(...added);
  return count;
}

/**
 * Morsetti (e pin di connettore) tolti dallo schema: il filo interrotto sui due pin torna un filo
 * solo, se ai due pin arrivava un solo filo per parte e nient'altro. Il filo unito tiene id,
 * numero, sezione e colore del primo tratto (o quelli dell'altro, se il primo non li ha).
 * Va chiamata con gli elementi già tolti dalla pagina. Restituisce i fili ricuciti.
 */
export function healWiresAtRemoved(p: Project, pg: Page, removed: Element[]): number {
  let count = 0;
  for (const e of removed) {
    if (e.kind !== 'symbol') continue;
    const sym = getSymbol(e.symbolId, p);
    if (!sym || (sym.role !== 'terminal' && sym.role !== 'pin')) continue;
    const pins = pinsWorld(e, sym).map(w => ({ x: w.x, y: w.y }));
    if (pins.length !== 2 || !(eq(pins[0].x, pins[1].x) || eq(pins[0].y, pins[1].y))) continue;
    const [a, b] = pins;
    // Ai due pin deve finire un solo filo, senza altri pin né fili che passano (giunzioni a T)
    const endsAt = (q: Pt) => pg.elements.filter((w): w is Wire => w.kind === 'wire' && !w.bus && w.bundle === undefined && w.points.length >= 2 && (samePt(w.points[0], q) || samePt(w.points[w.points.length - 1], q)));
    const busy = (q: Pt) => pg.elements.some(x => {
      if (x.kind === 'wire') return x.points.some((pt, i) => i < x.points.length - 1 && onSegmentInterior(q, pt, x.points[i + 1]));
      if (x.kind !== 'symbol') return false;
      const s = getSymbol(x.symbolId, p);
      return !!s && pinsWorld(x, s).some(w => samePt(w, q));
    });
    const wa = endsAt(a), wb = endsAt(b);
    if (wa.length !== 1 || wb.length !== 1 || wa[0] === wb[0] || busy(a) || busy(b)) continue;
    const w1 = wa[0], w2 = wb[0];
    const p1 = samePt(w1.points[w1.points.length - 1], a) ? w1.points : [...w1.points].reverse();
    const p2 = samePt(w2.points[0], b) ? w2.points : [...w2.points].reverse();
    w1.points = normalizeWire([...p1, ...p2]);
    for (const k of ['number', 'cross', 'color', 'wireType'] as const) if (w1[k] === undefined && w2[k] !== undefined) w1[k] = w2[k];
    if (w2.labels?.length) w1.labels = [...(w1.labels ?? []), ...w2.labels];
    // Conduttore di cavo scelto a mano sul secondo tratto: passa al filo unito
    for (const c of p.cables ?? []) if (c.assign[w2.id] && !c.assign[w1.id]) { c.assign[w1.id] = c.assign[w2.id]; delete c.assign[w2.id]; }
    for (const c of p.cables ?? []) if (c.fixed?.[w2.id] && !c.fixed[w1.id]) { c.fixed[w1.id] = c.fixed[w2.id]; delete c.fixed[w2.id]; }
    pg.elements = pg.elements.filter(x => x !== w2);
    count++;
  }
  return count;
}
