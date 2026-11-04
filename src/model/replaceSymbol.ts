// Sostituzione del simbolo di un elemento dello schema (clic destro ▸ Sostituisci simbolo…): resta
// tutto il resto (sigla, dati del dispositivo, articolo, testi spostati), i fili restano attaccati
// e quindi anche i numeri filo. I punti di connessione del simbolo nuovo prendono il posto di quelli
// vecchi con la stessa designazione, poi di quelli con lo stesso id, poi nell'ordine; i fili
// attaccati a un punto che si sposta seguono restando ortogonali.
import type { PinDef, Page, SymbolDef, SymbolInstance } from './types';
import { pinsWorld, samePt } from './geometry';
import { dragWirePoint } from './wireEdit';

/** Abbinamento dei punti di connessione: id del vecchio → punto nuovo */
export function matchPins(oldSym: SymbolDef, newSym: SymbolDef, labels: Record<string, string> = {}): Map<string, PinDef> {
  const out = new Map<string, PinDef>();
  const free = new Set(newSym.pins);
  const take = (o: PinDef, f: (n: PinDef) => boolean) => {
    if (out.has(o.id)) return;
    const n = [...free].find(f);
    if (n) { out.set(o.id, n); free.delete(n); }
  };
  for (const o of oldSym.pins) take(o, n => n.label === (labels[o.id] || o.label) && !!n.label);
  for (const o of oldSym.pins) take(o, n => n.label === o.label && !!n.label);
  for (const o of oldSym.pins) take(o, n => n.id === o.id);
  for (const o of oldSym.pins) take(o, () => true);
  return out;
}

/**
 * Mette newSym al posto del simbolo dell'elemento inst, sulla pagina pg.
 * Le designazioni scritte a mano passano ai punti abbinati; i fili seguono i punti spostati.
 */
export function replaceSymbol(pg: Page, inst: SymbolInstance, oldSym: SymbolDef, newSym: SymbolDef): void {
  const match = matchPins(oldSym, newSym, inst.pinLabels);
  const before = new Map(pinsWorld(inst, oldSym).map(w => [w.pin.id, { x: w.x, y: w.y }]));
  const labels: Record<string, string> = {};
  for (const [oldId, n] of match) {
    const o = oldSym.pins.find(q => q.id === oldId)!;
    const l = inst.pinLabels[oldId];
    // Solo le designazioni cambiate a mano: le altre sono quelle del simbolo nuovo
    if (l !== undefined && l !== o.label) labels[n.id] = l;
  }
  inst.symbolId = newSym.id;
  inst.pinLabels = labels;
  const after = new Map(pinsWorld(inst, newSym).map(w => [w.pin.id, { x: w.x, y: w.y }]));
  const moves: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (const [oldId, n] of match) {
    const from = before.get(oldId)!, to = after.get(n.id)!;
    if (!samePt(from, to)) moves.push({ from, to });
  }
  if (!moves.length) return;
  for (const e of pg.elements) {
    if (e.kind !== 'wire') continue;
    // Prima l'ultimo punto, così l'indice del primo non cambia
    const last = e.points.length - 1;
    const m0 = moves.find(q => samePt(q.from, e.points[0])), m1 = moves.find(q => samePt(q.from, e.points[last]));
    if (m1) e.points = dragWirePoint(e.points, last, m1.to);
    if (m0) e.points = dragWirePoint(e.points, 0, m0.to);
  }
}

/** Il simbolo si può sostituire? (no per i canali dei gruppi I/O PLC, legati tra loro) */
export function canReplace(inst: SymbolInstance): boolean {
  return !inst.plcGroup;
}
