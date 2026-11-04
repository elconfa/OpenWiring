// Copia/incolla di elementi tra pagine e tra progetti, duplicazione di pagine.
// Le copie ricevono sigle nuove (le bobine e i contatti copiati insieme restano collegati),
// numeri filo nuovi e, per i punti I/O PLC, il primo canale libero.
import { nextProjectPageNo } from './pageOrder';
import type { Project, Element, SymbolDef, Part, Pt, Page, Cable } from './types';
import { nextCableTag } from './cables';
import { getSymbol, uid, snapPt } from './geometry';
import { BUILTIN_SYMBOLS } from './symbols';
import { nextTagFor } from './numbering';
import { nextTerminal, parseTerminalNo, terminalNo } from './terminals';
import { stripOf } from './devices';
import { allocateChannel, cardType, parseChannel } from './plc';
import { defaultGroupPins, newGroupId } from './plcGroup';
import { nextPin } from './connectors';

export interface ClipData {
  elements: Element[];
  /** Simboli non di base usati dagli elementi (servono incollando in un altro progetto) */
  symbols: SymbolDef[];
  /** Articoli assegnati agli elementi */
  parts: Part[];
  /** Cavi delle linee di definizione copiate */
  cables?: Cable[];
  /** Angolo in alto a sinistra degli elementi copiati */
  origin: Pt;
}

const BUILTIN = new Set(BUILTIN_SYMBOLS.map(s => s.id));

function bounds(els: Element[]): Pt {
  let x = Infinity, y = Infinity;
  for (const e of els) {
    if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') for (const p of e.points) { x = Math.min(x, p.x); y = Math.min(y, p.y); }
    else { x = Math.min(x, e.x); y = Math.min(y, e.y); }
  }
  return isFinite(x) ? { x, y } : { x: 0, y: 0 };
}

export function copyElements(project: Project, page: Page, ids: string[]): ClipData {
  const set = new Set(ids);
  const elements = structuredClone(page.elements.filter(e => set.has(e.id)));
  const symbols: SymbolDef[] = [];
  const parts: Part[] = [];
  for (const e of elements) {
    if (e.kind !== 'symbol') continue;
    if (!BUILTIN.has(e.symbolId) && !symbols.some(s => s.id === e.symbolId)) {
      const s = getSymbol(e.symbolId, project);
      if (s) symbols.push(structuredClone(s));
    }
    if (e.partNr && !parts.some(p => p.partNr === e.partNr)) {
      const p = project.parts.find(x => x.partNr === e.partNr);
      if (p) parts.push(structuredClone(p));
    }
  }
  const cableIds = new Set(elements.flatMap(e => (e.kind === 'cable' ? [e.cableId] : [])));
  const cables = structuredClone((project.cables ?? []).filter(c => cableIds.has(c.id)));
  return { elements, symbols, parts, cables, origin: bounds(elements) };
}

/**
 * Incolla gli elementi nella pagina (modifica il progetto) spostandoli di (dx, dy).
 * Restituisce gli id dei nuovi elementi e le schede PLC create.
 */
export function pasteElements(project: Project, pageId: string, clip: ClipData, dx: number, dy: number): { ids: string[]; newCards: string[] } {
  const page = project.pages.find(p => p.id === pageId)!;
  for (const s of clip.symbols) if (!getSymbol(s.id, project)) project.customSymbols.push(structuredClone(s));
  for (const p of clip.parts) if (!project.parts.some(x => x.partNr === p.partNr)) project.parts.push(structuredClone(p));
  const copies = structuredClone(clip.elements).map(e => {
    e.id = uid(e.kind[0]);
    if (e.kind === 'wire') { e.points = e.points.map(p => ({ x: p.x + dx, y: p.y + dy })); delete e.number; if (e.labels) e.labels = e.labels.map(l => ({ ...l, x: l.x + dx, y: l.y + dy })); if (e.busCable) e.busCable = { ...e.busCable, tag: undefined }; }
    else if (e.kind === 'cable' || e.kind === 'wiredef') {
      e.points = [{ x: e.points[0].x + dx, y: e.points[0].y + dy }, { x: e.points[1].x + dx, y: e.points[1].y + dy }];
      if (e.kind === 'wiredef' && e.label) e.label = { x: e.label.x + dx, y: e.label.y + dy };
    }
    else { e.x += dx; e.y += dy; }
    return e;
  });
  // Rimandi copiati: restano collegati solo se è stato copiato anche il corrispondente
  const idMap = new Map(clip.elements.map((e, i) => [e.id, copies[i].id]));
  for (const c of copies) if (c.kind === 'symbol' && c.linkTo) c.linkTo = idMap.get(c.linkTo) ?? '';
  // Ogni cavo copiato diventa un cavo nuovo con la sua sigla (i conduttori si riassegnano)
  const cableMap = new Map<string, string>();
  for (const c of clip.cables ?? []) {
    const firstLine = copies.find(e => e.kind === 'cable' && e.cableId === c.id);
    const x = firstLine?.kind === 'cable' ? firstLine.points[0].x : 0;
    const nc: Cable = { ...structuredClone(c), id: uid('c'), tag: nextCableTag(project, page, x), assign: {} };
    (project.cables ??= []).push(nc);
    cableMap.set(c.id, nc.id);
  }
  for (const e of copies) if (e.kind === 'cable') e.cableId = cableMap.get(e.cableId) ?? e.cableId;
  const roleOf = (e: Element) => (e.kind === 'symbol' ? getSymbol(e.symbolId, project)?.role : undefined);
  const tagMap = new Map<string, string>();
  const termMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  const newCards: string[] = [];
  const add = (e: Element) => page.elements.push(e);
  // Prima i dispositivi principali e autonomi (sigla nuova), poi i contatti che li seguono
  const order = (e: Element) => { const r = roleOf(e); return r === 'main' || r === 'single' ? 0 : r === 'aux' ? 1 : 2; };
  for (const c of [...copies].sort((a, b) => order(a) - order(b))) {
    if (c.kind !== 'symbol') { add(c); continue; }
    const sym = getSymbol(c.symbolId, project);
    const role = sym?.role;
    if (sym && (role === 'main' || role === 'single') && sym.letter && c.tag) {
      const mapped = tagMap.get(c.tag);
      const next = mapped ?? nextTagFor(project, sym.letter, page, c.x);
      tagMap.set(c.tag, next);
      c.tag = next;
    } else if (role === 'aux' && tagMap.has(c.tag)) {
      c.tag = tagMap.get(c.tag)!;
    } else if (role === 'terminal' && c.tag.includes(':')) {
      // I piani dello stesso morsetto restano insieme: 1A/1B → 5A/5B
      const strip = stripOf(c.tag), t = parseTerminalNo(terminalNo(c.tag));
      if (!isNaN(t.n)) {
        const key = `${strip}|${t.base}`;
        const base = termMap.get(key) ?? parseTerminalNo(terminalNo(nextTerminal(project, strip))).base;
        termMap.set(key, base);
        c.tag = `${strip}:${base}${t.level}`;
      }
    } else if (role === 'pin' && c.tag.includes(':')) {
      c.tag = nextPin(project, stripOf(c.tag));
    } else if (role === 'plc' && sym?.io) {
      const alloc = allocateChannel(project, sym.io, letter => nextTagFor(project, letter, page, c.x));
      if (alloc.created) { project.plc.cards.push(alloc.card); newCards.push(`-${alloc.card.tag} (${cardType(alloc.card).name})`); }
      c.tag = alloc.card.tag; c.plcChannel = alloc.channel; delete c.plcSymbol; delete c.plcComment;
      // Canale di un gruppo I/O: il gruppo copiato è un gruppo nuovo, con i pin del nuovo canale
      if (c.plcGroup) {
        const gid = groupMap.get(c.plcGroup.id) ?? newGroupId();
        groupMap.set(c.plcGroup.id, gid);
        c.plcGroup = { id: gid, index: c.plcGroup.index, count: c.plcGroup.count };
        const ch = parseChannel(alloc.channel)!;
        c.pinLabels = defaultGroupPins(alloc.card, ch.kind, ch.index, sym.pins.length > 1 ? 2 : 1);
      }
    }
    add(c);
  }
  return { ids: copies.map(c => c.id), newCards };
}

/** Macro: circuito riutilizzabile salvato nella libreria personale (es. avviamento motore) */
export interface Macro {
  id: string;
  name: string;
  category: string;
  description?: string;
  clip: ClipData;
  /** Ingombro in mm, per l'anteprima e il posizionamento */
  size: { w: number; h: number };
}

export function makeMacro(clip: ClipData, name: string, category: string, description?: string): Macro {
  let x1 = -Infinity, y1 = -Infinity;
  for (const e of clip.elements) {
    if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') for (const p of e.points) { x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    else { x1 = Math.max(x1, e.x); y1 = Math.max(y1, e.y); }
  }
  return {
    id: uid('m'), name, category: category || 'Macro', description, clip,
    size: { w: Math.max(8, x1 - clip.origin.x + 8), h: Math.max(8, y1 - clip.origin.y + 16) },
  };
}

/** Spostamento per incollare con l'angolo in alto a sinistra nel punto indicato */
export function pasteOffset(clip: ClipData, at: Pt): Pt {
  const p = snapPt(at), o = snapPt(clip.origin);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** Duplica una pagina di schema subito dopo l'originale, con sigle e numeri filo nuovi */
/** Numero e nome proposti per la copia di una pagina: il numero dopo il più alto */
export function duplicatePageDefaults(project: Project, pageId: string): { name: string; title: string; panelId?: string } | undefined {
  const src = project.pages.find(p => p.id === pageId);
  if (!src) return undefined;
  return { name: nextProjectPageNo(project), title: `${src.title} (copia)`, panelId: src.panelId };
}

/** Copia della pagina con sigle e numeri filo nuovi; numero, nome e luogo scelti (o proposti) */
export function duplicatePage(project: Project, pageId: string, opts: { name?: string; title?: string; panelId?: string } = {}): Page | undefined {
  const src = project.pages.find(p => p.id === pageId);
  if (!src || src.type !== 'multiline') return undefined;
  const def = duplicatePageDefaults(project, pageId)!;
  const panelId = 'panelId' in opts ? opts.panelId : def.panelId;
  const page: Page = { id: uid('p'), name: opts.name || def.name, title: opts.title ?? def.title, type: 'multiline', elements: [], ...(panelId ? { panelId } : {}) };
  project.pages.splice(project.pages.indexOf(src) + 1, 0, page);
  pasteElements(project, page.id, copyElements(project, src, src.elements.map(e => e.id)), 0, 0);
  return page;
}
