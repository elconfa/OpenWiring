// Immagine dei contatti delle bobine disegnata con i simboli: ogni contatto è il suo
// simbolo della libreria ruotato in orizzontale (morsetto 1 a destra), con i morsetti scritti sopra
// le linee, il rimando «/pagina.colonna» a sinistra e la linea tratteggiata del comando che passa
// per tutte le lame. I poli di potenza vanno uno per riga; i contatti di riserva dell'articolo sono
// disegnati senza rimando.
import type { PinDef, Prim } from './types';
import { primBounds } from './geometry';
import { contactPole } from './symbols';
import type { ContactRef } from './devices';

export interface ContactImageRow {
  kind: string;
  /** Morsetti nell'ordine dei punti di connessione del disegno */
  labels: string[];
  location?: string;
  id?: string;
  prims: Prim[];
  pins: PinDef[];
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Righe dell'immagine: poli di potenza divisi uno per riga, poi i contatti in ordine di morsetto */
export function contactImageRows(contacts: ContactRef[]): ContactImageRow[] {
  const rows = contacts.flatMap((c): ContactImageRow[] => {
    const ps = c.labels.split('-');
    const own = c.sym && c.sym.pins.length <= 3 && c.sym.pins.length === ps.length ? c.sym : undefined;
    if (!own && ps.length >= 4 && ps.length % 2 === 0) {
      const pole = contactPole(c.kind === 'NC' ? 'NC' : c.kind === 'NO' ? 'NO' : 'power');
      return Array.from({ length: ps.length / 2 }, (_, k) => ({ kind: c.kind, labels: [ps[2 * k], ps[2 * k + 1]], location: c.location, id: c.id, prims: pole.prims, pins: pole.pins }));
    }
    const shape = own ?? contactPole(c.kind);
    return [{ kind: c.kind, labels: ps, location: c.location, id: c.id, prims: shape.prims.filter(p => p.t !== 'text'), pins: shape.pins }];
  });
  const rank = (r: ContactImageRow) => (r.kind === 'power' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || natural(a.labels[0] ?? '', b.labels[0] ?? ''));
}

/** Punto ruotato di 90° in senso orario: l'alto del simbolo va a destra */
export const turn = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });

/** Ascissa (nel disegno ruotato, in unità del simbolo) dove passa la linea tratteggiata del comando */
export const BLADE_X = -8;

export interface RowGeometry {
  /** Ingombro sopra e sotto la linea dei morsetti (mm) */
  up: number;
  down: number;
  /** Estremo sinistro del disegno rispetto all'origine (mm) */
  left: number;
  /** Morsetti: punto in cui scrivere il numero (mm, rispetto all'origine della riga) */
  labels: { x: number; y: number; text: string }[];
}

/** Ingombri della riga con la scala s (mm per unità del simbolo) e testi alti xs */
export function rowGeometry(r: ContactImageRow, s: number, xs: number): RowGeometry {
  const b = primBounds(r.prims);
  const pins = r.pins.map(p => turn(p));
  const labels = pins.map((p, i) => {
    // Numero sopra la linea del morsetto, verso l'interno del contatto
    const inward = p.x < BLADE_X ? 1 : -1;
    return { x: (p.x + inward * 2.5) * s, y: p.y * s - 0.45, text: r.labels[i] ?? '' };
  });
  const top = Math.min(...pins.map(p => p.y)) * s;
  return {
    up: Math.max(-b.x0 * s, -top + 0.45 + xs * 0.75),
    down: Math.max(b.x1 * s, Math.max(...pins.map(p => p.y)) * s) + 0.5,
    left: -b.y1 * s,
    labels,
  };
}

/** Altezza dei testi dei morsetti rispetto ai rimandi e scala del disegno */
export function contactImageScale(xs: number) {
  return { s: 0.36 * (xs / 1.7), pinSize: xs * 0.85 };
}

/** Linee dei morsetti delle righe, dall'alto (y relativi alla prima riga = 0) e altezza totale */
export function stackRows(geo: RowGeometry[], gap = 0.5) {
  const ys: number[] = [];
  let y = 0;
  geo.forEach((g, i) => {
    if (i) y += geo[i - 1].down + g.up + gap;
    ys.push(y);
  });
  return { ys, top: -(geo[0]?.up ?? 0), bottom: y + (geo[geo.length - 1]?.down ?? 0) };
}
