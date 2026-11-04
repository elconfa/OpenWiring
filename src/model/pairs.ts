// Riferimenti incrociati a coppie: un contatto (es. l'ausiliario 13-14 di un salvamotore) disegnato
// accanto ai poli come rappresentazione e cablato davvero in un'altra pagina. La rappresentazione
// (SymbolInstance.pairOf) è solo disegno: sigla e morsetti seguono il contatto vero e i due si rimandano.
import type { Project, SymbolInstance, Page } from './types';
import { getSymbol } from './geometry';
import type { PlacedElement } from './devices';

export interface PairRef { rep: PlacedElement; real?: PlacedElement }

/** Rappresentazioni del progetto con il loro contatto vero (assente se è stato cancellato) */
export function pairRepresentations(project: Project): PairRef[] {
  const byId = new Map<string, { inst: SymbolInstance; page: Page; pageIndex: number }>();
  const reps: { inst: SymbolInstance; page: Page; pageIndex: number }[] = [];
  project.pages.forEach((page, pageIndex) => {
    for (const e of page.elements) {
      if (e.kind !== 'symbol') continue;
      if (e.pairOf) reps.push({ inst: e, page, pageIndex }); else byId.set(e.id, { inst: e, page, pageIndex });
    }
  });
  const placed = (x: { inst: SymbolInstance; page: Page; pageIndex: number }): PlacedElement | undefined => {
    const sym = getSymbol(x.inst.symbolId, project);
    return sym ? { ...x, sym } : undefined;
  };
  const out: PairRef[] = [];
  for (const r of reps) {
    const rep = placed(r);
    if (!rep) continue;
    const real = byId.get(r.inst.pairOf!);
    out.push({ rep, real: real ? placed(real) : undefined });
  }
  return out;
}

/** Sigla e morsetti delle rappresentazioni uguali a quelli del contatto vero (dentro un commit) */
export function syncPairs(project: Project): void {
  for (const { rep, real } of pairRepresentations(project)) {
    if (!real) continue;
    const r = rep.inst, s = real.inst;
    if (r.tag !== s.tag) r.tag = s.tag;
    if (r.autoPins !== s.autoPins) r.autoPins = s.autoPins;
    if (JSON.stringify(r.pinLabels) !== JSON.stringify(s.pinLabels)) r.pinLabels = { ...s.pinLabels };
  }
}

/** Rappresentazione nuova di un contatto, nel punto indicato */
export function newRepresentation(real: SymbolInstance, id: string, x: number, y: number, rot: SymbolInstance['rot']): SymbolInstance {
  return { kind: 'symbol', id, symbolId: real.symbolId, x, y, rot, tag: real.tag, pinLabels: { ...real.pinLabels }, autoPins: real.autoPins, pairOf: real.id, ...(real.mirror ? { mirror: true } : {}) };
}
