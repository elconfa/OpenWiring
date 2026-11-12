// Riferimenti incrociati a coppie: un contatto (es. l'ausiliario 13-14 di un salvamotore) disegnato
// accanto ai poli come rappresentazione e cablato davvero in un'altra pagina. La rappresentazione
// (SymbolInstance.pairOf) è solo disegno: sigla e morsetti seguono il contatto vero e i due si rimandano.
import type { Project, SymbolInstance, Page } from './types';
import { getSymbol, instanceBounds, pairCenter, pairScale, toWorld, uid } from './geometry';
import { primLineType } from './types';
import { buildDevices } from './devices';
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
export function syncPairs(project: Project): number {
  let changed = 0;
  for (const { rep, real } of pairRepresentations(project)) {
    if (!real) continue;
    const r = rep.inst, s = real.inst;
    if (r.tag !== s.tag) { r.tag = s.tag; changed++; }
    if (r.autoPins !== s.autoPins) { r.autoPins = s.autoPins; changed++; }
    if (JSON.stringify(r.pinLabels) !== JSON.stringify(s.pinLabels)) { r.pinLabels = { ...s.pinLabels }; changed++; }
  }
  return changed;
}

/** Rappresentazione nuova di un contatto, nel punto indicato */
export function newRepresentation(real: SymbolInstance, id: string, x: number, y: number, rot: SymbolInstance['rot']): SymbolInstance {
  return { kind: 'symbol', id, symbolId: real.symbolId, x, y, rot, tag: real.tag, pinLabels: { ...real.pinLabels }, autoPins: real.autoPins, pairOf: real.id, pairCompact: true, ...(real.mirror ? { mirror: true } : {}) };
}


/** Dove si rappresenta un contatto: nell'immagine in fondo alla pagina, a fianco dell'apparecchio, libero */
export type ContactPlace = 'bottom' | 'side' | 'free-v' | 'free-h';

/** Rappresentazione (se c'è) del contatto realId */
export function representationOf(project: Project, realId: string): { inst: SymbolInstance; page: Page } | undefined {
  for (const page of project.pages) for (const e of page.elements) if (e.kind === 'symbol' && e.pairOf === realId) return { inst: e, page };
  return undefined;
}

/** Posto attuale della rappresentazione del contatto */
export function contactPlaceOf(project: Project, realId: string): ContactPlace {
  const r = representationOf(project, realId)?.inst;
  if (!r) return 'bottom';
  if (r.pairSide) return 'side';
  return r.rot === 0 || r.rot === 180 ? 'free-v' : 'free-h';
}

/** Elemento principale del dispositivo di ogni contatto */
function mainsOf(project: Project) {
  const m = new Map<string, PlacedElement>();
  for (const d of buildDevices(project).values()) if (d.main) for (const e of d.elements) if (e !== d.main) m.set(e.inst.id, d.main);
  return m;
}

/** Altezza della linea del comando dell'apparecchio: la sua linea tratteggiata, altrimenti il centro */
function actuatorY(main: PlacedElement): number {
  const dash = main.sym.prims.find(p => p.t === 'line' && primLineType(p) !== 'solid' && Math.abs(p.y1 - p.y2) < 0.01);
  if (dash && dash.t === 'line') return toWorld(main.inst, { x: dash.x1, y: dash.y1 }).y;
  const b = instanceBounds(main.inst, main.sym);
  return (b.y0 + b.y1) / 2;
}

/**
 * Rappresentazioni «a fianco»: accanto all'apparecchio, a destra, sulla linea del comando, una dopo
 * l'altra nell'ordine dei contatti (dentro un commit). Restituisce quante si sono spostate
 */
export function placeSideReps(project: Project): number {
  const reps = pairRepresentations(project).filter(r => r.rep.inst.pairSide && r.real);
  if (!reps.length) return 0;
  const mains = mainsOf(project);
  const groups = new Map<string, { main: PlacedElement; list: PairRef[] }>();
  for (const r of reps) {
    const m = mains.get(r.real!.inst.id);
    if (!m || m.page.id !== r.rep.page.id) continue;
    const g = groups.get(m.inst.id) ?? { main: m, list: [] };
    g.list.push(r);
    groups.set(m.inst.id, g);
  }
  let n = 0;
  for (const { main, list } of groups.values()) {
    const b = instanceBounds(main.inst, main.sym), y = actuatorY(main);
    list.sort((a, b2) => a.real!.page.id === b2.real!.page.id ? a.real!.inst.x - b2.real!.inst.x || a.real!.inst.y - b2.real!.inst.y : a.real!.pageIndex - b2.real!.pageIndex);
    let x = b.x1 + 2;
    for (const r of list) {
      const { b: rb, c } = pairCenter(r.rep.sym), k = pairScale(r.rep.inst);
      // Il centro della rappresentazione è il punto di aggancio: la lama sulla linea del comando
      const left = (c.x - rb.x0) * k, right = (rb.x1 - c.x) * k;
      const nx = Math.round((x + left) * 10) / 10, ny = Math.round(y * 10) / 10;
      const inst = r.rep.inst;
      if (inst.x !== nx || inst.y !== ny || inst.rot !== 0) { inst.x = nx; inst.y = ny; inst.rot = 0; n++; }
      x = nx + right + 4;
    }
  }
  return n;
}

/**
 * Sceglie dove rappresentare il contatto realId (dentro un commit): in fondo (nessuna rappresentazione,
 * il contatto torna nell'immagine dei contatti), a fianco dell'apparecchio, libero in verticale o in
 * orizzontale (accanto all'apparecchio, poi si sposta dove si vuole)
 */
export function setContactPlace(project: Project, realId: string, place: ContactPlace): void {
  const cur = representationOf(project, realId);
  if (place === 'bottom') {
    if (cur) cur.page.elements = cur.page.elements.filter(e => e !== cur.inst);
    return;
  }
  let rep = cur?.inst;
  if (!rep) {
    let real: SymbolInstance | undefined, realPage: Page | undefined;
    for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.id === realId) { real = e; realPage = pg; }
    if (!real || !realPage) return;
    const main = mainsOf(project).get(realId);
    // Sulla pagina dell'apparecchio, accanto; senza apparecchio accanto al contatto
    const page = main?.page ?? realPage;
    const b = main ? instanceBounds(main.inst, main.sym) : undefined;
    rep = newRepresentation(real, uid('s'), b ? b.x1 + 8 : real.x + 12, b ? (b.y0 + b.y1) / 2 : real.y, 0);
    page.elements.push(rep);
  }
  rep.pairCompact = true;
  if (place === 'side') { rep.pairSide = true; rep.rot = 0; }
  else { delete rep.pairSide; rep.rot = place === 'free-v' ? 0 : 90; }
}
