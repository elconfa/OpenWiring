// Riquadro «Non montato»: parti disegnate nello schema ma non montate nel quadro. Restano sullo schema
// (in grigio, dentro un riquadro grigio tratteggiato), ma non vanno in distinta, lista d'acquisto,
// tabelle materiali, targhette dei fili, liste fili e connessioni, liste di cavi, connettori e I/O PLC,
// e i controlli non le segnalano. I morsetti non montati restano nella lista morsetti con la nota.
//
// Cosa è non montato:
// - un dispositivo con l'elemento principale (bobina) nel riquadro: tutto il dispositivo, contatti compresi;
//   senza elemento principale, quando tutti i suoi elementi stanno nel riquadro;
// - morsetti e pin di connettore uno per uno (il centro del simbolo nel riquadro);
// - i fili con un estremo nel riquadro o su un pin di un elemento non montato;
// - le linee dei cavi nel riquadro (il cavo, se tutte le sue linee sono non montate).
import type { Project, Page, NoFitArea, SymbolInstance } from './types';
import { getSymbol, instanceBounds, pinsWorld } from './geometry';
import { computeNetlist } from './netlist';

export interface NotFitted {
  /** Elementi (simboli, fili, linee dei cavi) non montati */
  ids: Set<string>;
  /** Sigle dei dispositivi non montati per intero (senza trattino) */
  devices: Set<string>;
  /** Sigle dei morsetti e dei pin non montati (es. X1:3) */
  terminals: Set<string>;
  /** Cavi (id) con tutte le linee non montate */
  cables: Set<string>;
}

export const nofitAreas = (page: Page) => page.elements.filter((e): e is NoFitArea => e.kind === 'nofit');
const inArea = (a: NoFitArea, x: number, y: number) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;

const cache = new WeakMap<Project, NotFitted>();

/** Elementi non montati del progetto (calcolati una volta per versione del progetto) */
export function notFitted(project: Project): NotFitted {
  const hit = cache.get(project);
  if (hit) return hit;
  const out: NotFitted = { ids: new Set(), devices: new Set(), terminals: new Set(), cables: new Set() };
  cache.set(project, out);
  if (!project.pages.some(pg => pg.elements.some(e => e.kind === 'nofit'))) return out;
  // Simboli nel riquadro (centro del disegno) e simboli per sigla
  const inside = new Set<string>();
  const byTag = new Map<string, { inst: SymbolInstance; role: string }[]>();
  for (const pg of project.pages) {
    const areas = nofitAreas(pg);
    for (const e of pg.elements) {
      if (e.kind !== 'symbol' || e.pairOf) continue;
      const sym = getSymbol(e.symbolId, project);
      if (!sym) continue;
      if (areas.length) {
        const b = instanceBounds(e, sym);
        if (areas.some(a => inArea(a, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2))) inside.add(e.id);
      }
      const tag = e.tag.trim();
      if (!tag || sym.role === 'potential' || sym.role === 'link') continue;
      if (sym.role === 'terminal' || sym.role === 'pin') {
        if (inside.has(e.id)) { out.ids.add(e.id); out.terminals.add(tag); }
        continue;
      }
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push({ inst: e, role: sym.role });
    }
  }
  for (const [tag, els] of byTag) {
    const main = els.find(x => x.role === 'main');
    if (main ? !inside.has(main.inst.id) : !els.every(x => inside.has(x.inst.id))) continue;
    out.devices.add(tag);
    for (const x of els) out.ids.add(x.inst.id);
  }
  // Rappresentazioni dei contatti non montati
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.pairOf && out.ids.has(e.pairOf)) out.ids.add(e.id);
  // Fili e linee dei cavi
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const lineCount = new Map<string, number>(), lineOff = new Map<string, number>();
  for (const pg of project.pages) {
    const areas = nofitAreas(pg);
    const deadPins = new Set<string>();
    for (const e of pg.elements) {
      if (e.kind !== 'symbol' || !out.ids.has(e.id)) continue;
      const sym = getSymbol(e.symbolId, project);
      if (sym) for (const w of pinsWorld(e, sym)) deadPins.add(key(w.x, w.y));
    }
    const off = (p: { x: number; y: number }) => areas.some(a => inArea(a, p.x, p.y)) || deadPins.has(key(p.x, p.y));
    for (const e of pg.elements) {
      if (e.kind === 'wire' && e.points.length && (off(e.points[0]) || off(e.points[e.points.length - 1]))) out.ids.add(e.id);
      if (e.kind === 'cable') {
        const c = e.cableId;
        if (c) lineCount.set(c, (lineCount.get(c) ?? 0) + 1);
        const mid = { x: (e.points[0].x + e.points[1].x) / 2, y: (e.points[0].y + e.points[1].y) / 2 };
        if (areas.some(a => inArea(a, mid.x, mid.y))) { out.ids.add(e.id); if (c) lineOff.set(c, (lineOff.get(c) ?? 0) + 1); }
      }
    }
  }
  for (const [c, n] of lineOff) if (n === lineCount.get(c)) out.cables.add(c);
  return out;
}

const fittedCache = new WeakMap<Project, Project>();

/**
 * Il progetto con solo le parti montate, per distinte, liste e targhette: senza gli elementi non montati
 * e i loro dati (cavi, connettori, schede PLC). I numeri dei fili sono fissati prima di togliere i fili
 * non montati, così nelle liste restano quelli dello schema. Senza riquadri è il progetto stesso.
 */
export function fittedProject(project: Project): Project {
  const nf = notFitted(project);
  if (!nf.ids.size) return project;
  const hit = fittedCache.get(project);
  if (hit) return hit;
  const p = structuredClone(project);
  // Numeri dei fili: su ogni filo il numero del suo conduttore
  const nl = computeNetlist(p);
  for (const n of nl.nets) {
    if (!n.wireNo || n.spare) continue;
    for (const { wire } of n.wires) if (!wire.bus) wire.number = n.wireNo;
  }
  for (const pg of p.pages) pg.elements = pg.elements.filter(e => !nf.ids.has(e.id) && e.kind !== 'nofit');
  if (p.cables) p.cables = p.cables.filter(c => !nf.cables.has(c.id));
  // Connettori con tutti i pin non montati e schede PLC dei dispositivi non montati
  const left = new Set<string>();
  for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag.includes(':')) left.add(e.tag.slice(0, e.tag.indexOf(':')));
  const gone = new Set([...nf.terminals].map(t => t.slice(0, t.indexOf(':'))).filter(c => c && !left.has(c)));
  if (p.connectors) for (const c of gone) delete p.connectors[c];
  p.plc = { ...p.plc, cards: p.plc.cards.filter(c => !nf.devices.has(c.tag)) };
  fittedCache.set(project, p);
  return p;
}

/** Il morsetto (o pin) è non montato */
export const terminalNotFitted = (project: Project, tag: string) => notFitted(project).terminals.has(tag);
