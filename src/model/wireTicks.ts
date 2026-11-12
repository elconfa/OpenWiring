// Lineetta obliqua sul filo con sezione e colore: un trattino a 45° che
// attraversa il filo con il testo accanto. La posizione è una distanza lungo il percorso del filo
// (Wire.tickAt), così segue il filo quando si sposta; senza scelta va sul tratto più lungo, accanto
// al numero filo ma senza toccarlo.
import type { Pt } from './types';

export interface TickPoint { x: number; y: number; vertical: boolean; at: number }

const segLen = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Lunghezza del percorso del filo */
export function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += segLen(pts[i], pts[i + 1]);
  return l;
}

/** Punto a distanza d dall'inizio del filo (limitata al percorso) */
export function pointAlong(pts: Pt[], d: number): TickPoint | undefined {
  if (pts.length < 2) return undefined;
  const total = pathLength(pts);
  let rest = Math.max(0, Math.min(total, d));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = segLen(a, b);
    if (rest <= l || i === pts.length - 2) {
      const t = l ? Math.min(1, rest / l) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, vertical: Math.abs(a.x - b.x) < 0.01 && l > 0, at: Math.max(0, Math.min(total, d)) };
    }
    rest -= l;
  }
  return undefined;
}

/** Distanza dall'inizio del filo del punto del percorso più vicino a p */
export function distanceAlong(pts: Pt[], p: Pt): number {
  let best = Infinity, at = 0, run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = segLen(a, b);
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const dd = segLen(p, q);
    if (dd < best) { best = dd; at = run + t * l; }
    run += l;
  }
  return at;
}

/**
 * Punto della lineetta: quello scelto (tickAt) o, in automatico, sul tratto più lungo appena prima del
 * numero filo nel verso di lettura del testo (sotto il numero sui fili verticali, a sinistra sugli
 * orizzontali): il testo parte dalla lineetta e scorre accanto al numero, dall'altra parte del filo.
 * number: centro del numero, half: metà della sua lunghezza, textLen: lunghezza del testo (mm)
 */
export function tickPoint(pts: Pt[], tickAt: number | undefined, number?: Pt, half = 0, textLen = 0): TickPoint | undefined {
  if (pts.length < 2) return undefined;
  if (tickAt !== undefined) return pointAlong(pts, tickAt);
  let best = 0, len = -1, start = 0, run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = segLen(pts[i], pts[i + 1]);
    if (l > len) { len = l; best = i; start = run; }
    run += l;
  }
  if (len < 3) return undefined;
  const a = pts[best], b = pts[best + 1];
  const vertical = Math.abs(a.x - b.x) < 0.01;
  // Verso (lungo il tratto) dell'inizio del testo: in basso sui verticali, a sinistra sugli orizzontali
  const back = vertical ? (b.y > a.y ? 1 : -1) : (b.x < a.x ? 1 : -1);
  let d = len / 2 + back * (textLen / 2);
  if (number) {
    const n = distanceAlong([a, b], number);
    if (segLen(pointAlong([a, b], n)!, number) < 4) {
      d = n + back * (half + 1.2);
      // Senza posto da quella parte, dall'altra
      if (d < 1 || d > len - 1) d = n - back * (half + 1.2);
    }
  }
  return pointAlong(pts, start + Math.max(1, Math.min(len - 1, d)));
}
