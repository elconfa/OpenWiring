// Linee di definizione dei fili: la sezione data a più fili insieme con una riga che li attraversa
// che li attraversa (vedi WireDef in types.ts)
import type { Page, Pt, WireDef } from './types';
import { crossedWires } from './cables';

/** Scritta della linea: "2,5 mm²" */
export function wireDefLabel(d: Pick<WireDef, 'cross'>): string[] {
  return d.cross ? [`${d.cross.replace('.', ',')} mm²`] : [];
}

/** Fili attraversati dalla linea, con il punto d'incrocio */
export const wireDefCrossings = (page: Page, d: Pick<WireDef, 'points'>) => crossedWires(page, d);

/**
 * Sezione della linea su tutti i fili che attraversa;
 * ids limita alle linee indicate. Ritorna il numero di fili cambiati
 */
export function applyWireDefs(page: Page, ids?: Iterable<string>): number {
  const only = ids ? new Set(ids) : undefined;
  let n = 0;
  for (const d of page.elements) {
    if (d.kind !== 'wiredef' || (only && !only.has(d.id))) continue;
    for (const { wire } of crossedWires(page, d)) {
      let changed = false;
      if (d.cross && wire.cross !== d.cross) { wire.cross = d.cross; changed = true; }
      if (changed) n++;
    }
  }
  return n;
}

/** Fine della linea (il secondo punto) e posizione della scritta: quella spostata a mano o accanto alla fine */
export function wireDefLabelAt(d: Pick<WireDef, 'points' | 'label'>): { end: Pt; at: Pt } {
  const end = d.points[1];
  return { end, at: d.label ?? { x: end.x + 4, y: end.y - 4 } };
}
