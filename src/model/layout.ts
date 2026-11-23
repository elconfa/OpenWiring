// Layout del quadro (vista di montaggio 2D): piastra, guide DIN, canaline, apparecchi
// con le misure degli articoli, occupazione delle guide, lunghezze stimate dei fili, DXF 1:1.
import { nextProjectPageNo } from './pageOrder';
import type { Project, Part, Page, Layout, LayoutItem } from './types';
import { FRAME, TITLE_TOP } from './types';
import { buildDevices, deviceInfo, partsIndex } from './devices';
import { allStrips, stripRows, stripData } from './terminals';
import { computeNetlist, connections, type Connection } from './netlist';
import { uid } from './geometry';
import { devicePanels, panelOfElement } from './network';
import { tx } from '../i18n/ui';
import { ductNet, ductRoute, wireArea, ductCapacity, DUCT_FILL_MAX, type DuctNet } from './ductRoute';

export const DEFAULT_LAYOUT: Layout = { plate: { w: 800, h: 1000 }, items: [], wireReserve: 150 };
export const RAIL_H = 35;
export const DUCT_W = 40;

/** Misure tipiche (larghezza × altezza in mm) per lettera del dispositivo, se l'articolo non le ha */
const TYPICAL: Record<string, [number, number]> = {
  K: [45, 80], Q: [45, 90], F: [18, 85], T: [50, 90], A: [100, 100], P: [30, 45], S: [30, 45], B: [30, 45], M: [40, 60], X: [5.1, 50],
};

/** Area di disegno nella cornice (mm sulla pagina) */
const AREA = {
  get x() { return FRAME.left + 6; }, get y() { return FRAME.top + 14; },
  get w() { return FRAME.right - FRAME.left - 12; }, get h() { return TITLE_TOP - 8 - FRAME.top - 14; },
};
export const SCALES = [1, 2, 2.5, 5, 10, 20, 25, 50];

/** Scala normalizzata (1:n) e origine della piastra sulla pagina */
export function layoutView(l: Layout): { n: number; ox: number; oy: number; k: number } {
  // Con la legenda accanto la piastra usa la parte sinistra del foglio
  const aw = AREA.w - (l.legend ? LEGEND_W + 6 : 0);
  const need = Math.max(l.plate.w / aw, l.plate.h / AREA.h);
  const n = SCALES.find(s => s >= need) ?? Math.ceil(need);
  const k = 1 / n;
  return { n, k, ox: AREA.x + (aw - l.plate.w * k) / 2, oy: AREA.y + (AREA.h - l.plate.h * k) / 2 };
}

/** Larghezza della legenda accanto alla piastra e sua posizione (angolo in alto a sinistra) */
export const LEGEND_W = 110;
export const legendBox = () => ({ x: AREA.x + AREA.w - LEGEND_W, y: AREA.y, w: LEGEND_W, h: AREA.h });

export const layoutOf = (pg: Page): Layout => ({ ...DEFAULT_LAYOUT, ...(pg.layout ?? {}) });

export interface Placeable { ref: string; kind: 'device' | 'strip'; w: number; h: number; text: string }

/** Dispositivi e morsettiere del progetto con le misure (dall'articolo o tipiche) */
export function placeables(project: Project, library: Part[] = [], panelId?: string): Placeable[] {
  const parts = partsIndex(project, library);
  const out: Placeable[] = [];
  // Layout di un luogo: solo i dispositivi e le morsettiere di quel luogo
  const where = panelId ? devicePanels(project) : undefined;
  const here = (tag: string) => !where || where.get(tag)?.id === panelId;
  for (const d of buildDevices(project).values()) {
    if (d.elements.every(e => e.sym.role === 'terminal') || !here(d.tag)) continue;
    const info = deviceInfo(d.elements, d.main, parts);
    const letter = (/[A-Z]/.exec(d.tag.replace(/^\d+/, '')) ?? ['A'])[0];
    const [tw, th] = TYPICAL[letter] ?? [40, 60];
    out.push({ ref: d.tag, kind: 'device', w: info.part?.width || tw, h: info.part?.height || th, text: info.description ?? d.elements[0].sym.name });
  }
  for (const c of project.plc.cards) {
    if (out.some(o => o.ref === c.tag) || !here(c.tag)) continue;
    const part = c.partNr ? parts.get(c.partNr) : undefined;
    out.push({ ref: c.tag, kind: 'device', w: part?.width || 100, h: part?.height || 100, text: c.description ?? 'Scheda PLC' });
  }
  for (const s of allStrips(project)) {
    if (where) {
      const first = stripRows(project, s).find(r => r.els.length)?.els[0];
      const pn = first && panelOfElement(project, first);
      if (pn ? pn.id !== panelId : false) continue;
    }
    const d = stripData(project, s);
    const part = d.partNr ? parts.get(d.partNr) : undefined;
    // Un morsetto a più piani occupa un solo passo
    const n = new Set(stripRows(project, s).map(r => r.base)).size;
    const pitch = part?.width || TYPICAL.X[0];
    out.push({ ref: s, kind: 'strip', w: Math.round((n * pitch + (d.endPlatePartNr ? 1.5 : 0) + (d.endStopPartNr ? 2 * 8 : 0)) * 10) / 10, h: part?.height || TYPICAL.X[1], text: tx('{0} morsetti', n) });
  }
  return out;
}

/** Elementi già posati in tutti i layout del progetto */
export function placedRefs(project: Project): Set<string> {
  const s = new Set<string>();
  for (const pg of project.pages) for (const it of pg.layout?.items ?? []) if (it.ref) s.add(`${it.kind}|${it.ref}`);
  return s;
}

/** Nuova pagina di layout dopo l'ultima pagina */
export function newLayoutPage(project: Project, plate = DEFAULT_LAYOUT.plate): Page {
  return {
    id: uid('p'), name: nextProjectPageNo(project), title: 'Layout quadro', type: 'layout', elements: [],
    layout: { plate: { ...plate }, items: [], wireReserve: DEFAULT_LAYOUT.wireReserve },
  };
}

/** Guida o canalina su cui poggia un apparecchio (il suo centro cade nella guida) */
function railUnder(l: Layout, it: LayoutItem): LayoutItem | undefined {
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  return l.items.find(r => r.kind === 'rail' && cx >= r.x && cx <= r.x + r.w && cy >= r.y - it.h / 2 && cy <= r.y + r.h + it.h / 2);
}

/**
 * Posizione agganciata: un apparecchio vicino a una guida si centra sulla guida; tutto il
 * resto si aggancia al millimetro (guide e canaline a 5 mm).
 */
export function snapItem(l: Layout, it: LayoutItem): LayoutItem {
  const step = it.kind === 'rail' || it.kind === 'duct' ? 5 : 1;
  const out = { ...it, x: Math.round(it.x / step) * step, y: Math.round(it.y / step) * step };
  if (it.kind === 'device' || it.kind === 'strip') {
    const cy = out.y + out.h / 2;
    const rail = l.items.find(r => r.kind === 'rail' && Math.abs(r.y + r.h / 2 - cy) < Math.max(20, out.h / 3) && out.x + out.w > r.x && out.x < r.x + r.w);
    if (rail) out.y = Math.round((rail.y + rail.h / 2 - out.h / 2) * 10) / 10;
  }
  return out;
}

export interface RailUse { rail: LayoutItem; used: number; free: number; items: LayoutItem[] }

/** Occupazione di ogni guida DIN orizzontale */
export function railUsage(l: Layout): RailUse[] {
  return l.items.filter(r => r.kind === 'rail').map(rail => {
    const items = l.items.filter(it => (it.kind === 'device' || it.kind === 'strip') && railUnder(l, it) === rail);
    const used = items.reduce((a, it) => a + it.w, 0);
    return { rail, used: Math.round(used * 10) / 10, free: Math.round((rail.w - used) * 10) / 10, items };
  });
}

export interface LayoutIssue { msg: string; pageId: string; itemId?: string }

export function layoutProblems(project: Project): LayoutIssue[] {
  const out: LayoutIssue[] = [];
  for (const pg of project.pages) {
    if (pg.type !== 'layout') continue;
    const l = layoutOf(pg);
    const name = (it: LayoutItem) => (it.ref ? `-${it.ref}` : it.kind === 'rail' ? 'guida' : 'canalina');
    for (const it of l.items) {
      if (it.x < 0 || it.y < 0 || it.x + it.w > l.plate.w || it.y + it.h > l.plate.h) out.push({ msg: `Pag. ${pg.name}: ${name(it)} esce dalla piastra`, pageId: pg.id, itemId: it.id });
    }
    const solid = l.items.filter(it => it.kind !== 'rail');
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (a.x < b.x + b.w - 0.1 && b.x < a.x + a.w - 0.1 && a.y < b.y + b.h - 0.1 && b.y < a.y + a.h - 0.1) {
        out.push({ msg: `Pag. ${pg.name}: ${name(a)} e ${name(b)} si sovrappongono`, pageId: pg.id, itemId: b.id });
      }
    }
    for (const u of railUsage(l)) if (u.free < 0) out.push({ msg: `Pag. ${pg.name}: guida piena, mancano ${-u.free} mm`, pageId: pg.id, itemId: u.rail.id });
  }
  for (const d of duplicatePositions(project)) {
    const pg = project.pages.find(x => x.layout?.items.some(it => it.pos === d.pos && it.ref === d.tags[1]));
    const it = pg?.layout?.items.find(x => x.pos === d.pos && x.ref === d.tags[1]);
    if (pg) out.push({ msg: tx('Posizione {0}{1} usata da più apparecchi: {2} (Rinumera nel layout)', d.pos, d.panel ? ` +${d.panel}` : '', d.tags.map(t => `-${t}`).join(', ')), pageId: pg.id, itemId: it?.id });
  }
  for (const f of ductFill(project)) {
    if (f.percent > DUCT_FILL_MAX) out.push({ msg: tx('Pag. {0}: canalina {1} piena al {2}% ({3} fili; consigliato al massimo {4}%)', f.pageName, f.duct.label ?? '', f.percent, f.wires, DUCT_FILL_MAX), pageId: f.pageId, itemId: f.duct.id });
  }
  return out;
}

/** Centro di un dispositivo o di un morsetto nel layout (mm sulla piastra) */
function positions(project: Project): Map<string, { x: number; y: number; layout: string }> {
  const pos = new Map<string, { x: number; y: number; layout: string }>();
  for (const pg of project.pages) {
    for (const it of pg.layout?.items ?? []) {
      if (!it.ref) continue;
      if (it.kind === 'device') pos.set(it.ref, { x: it.x + it.w / 2, y: it.y + it.h / 2, layout: pg.id });
      else if (it.kind === 'strip') {
        // Ogni morsetto alla sua posizione lungo la fila
        const bases = [...new Set(stripRows(project, it.ref).map(r => r.base))];
        const pitch = it.w / Math.max(1, bases.length);
        for (const r of stripRows(project, it.ref)) {
          const i = bases.indexOf(r.base);
          pos.set(`${it.ref}:${r.no}`, { x: it.x + pitch * (i + 0.5), y: it.y + it.h / 2, layout: pg.id });
        }
      }
    }
  }
  return pos;
}

/** Sigla di dispositivo o morsetto da un riferimento di connessione: "-2K1:13" → "2K1", "-X1:3" → "X1:3" */
function refKey(ref: string, pos: Map<string, unknown>): string {
  const r = ref.replace(/^-/, '');
  if (pos.has(r)) return r;
  return r.includes(':') ? r.slice(0, r.lastIndexOf(':')) : r;
}

/**
 * Lunghezza stimata di un collegamento: percorso a L tra i due apparecchi sulla piastra
 * (come lungo le canaline) più la riserva per ciascuna estremità. Undefined se uno dei due
 * non è posato o sono su layout diversi.
 */
export function wireLength(project: Project, c: Connection, pos = positions(project)): number | undefined {
  return wireRoute(project, c, pos)?.length;
}

/** Rete delle canaline di ogni layout (calcolata una volta per versione del layout) */
const nets = new WeakMap<Layout, DuctNet | null>();
function netOf(l: Layout): DuctNet | undefined {
  if (!nets.has(l)) nets.set(l, ductNet(l) ?? null);
  return nets.get(l) ?? undefined;
}

/**
 * Percorso di un collegamento sulla piastra: nelle canaline se ci sono (dall'apparecchio alla
 * canalina, lungo le canaline, all'altro apparecchio), altrimenti a L; più la riserva per ciascuna
 * estremità. Undefined se uno dei due non è posato o sono su layout diversi.
 */
export function wireRoute(project: Project, c: Connection, pos = positions(project)): { length: number; ducts: Set<LayoutItem>; layout: string } | undefined {
  const a = pos.get(refKey(c.from, pos)), b = pos.get(refKey(c.to, pos));
  if (!a || !b || a.layout !== b.layout) return undefined;
  const pg = project.pages.find(p => p.id === a.layout);
  const reserve = pg?.layout?.wireReserve ?? DEFAULT_LAYOUT.wireReserve ?? 150;
  const net = pg?.layout ? netOf(pg.layout) : undefined;
  const r = net ? ductRoute(net, a, b) : { length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), ducts: new Set<LayoutItem>() };
  return { length: Math.round(r.length + 2 * reserve), ducts: r.ducts, layout: a.layout };
}

export interface DuctFill { pageId: string; pageName: string; duct: LayoutItem; wires: number; area: number; capacity: number; percent: number }

/** Riempimento delle canaline: fili che le attraversano e sezione occupata rispetto a quella utile */
export function ductFill(project: Project): DuctFill[] {
  const layouts = project.pages.filter(pg => pg.layout?.items.some(i => i.kind === 'duct'));
  if (!layouts.length) return [];
  const pos = positions(project);
  const use = new Map<LayoutItem, { wires: number; area: number }>();
  for (const conn of connections(computeNetlist(project), project)) {
    const r = wireRoute(project, conn, pos);
    if (!r) continue;
    for (const d of r.ducts) { const u = use.get(d) ?? { wires: 0, area: 0 }; u.wires++; u.area += wireArea(conn.cross); use.set(d, u); }
  }
  const out: DuctFill[] = [];
  for (const pg of layouts) for (const d of pg.layout!.items.filter(i => i.kind === 'duct')) {
    const u = use.get(d) ?? { wires: 0, area: 0 };
    const capacity = ductCapacity(d);
    out.push({ pageId: pg.id, pageName: pg.name, duct: d, wires: u.wires, area: Math.round(u.area), capacity: Math.round(capacity), percent: capacity ? Math.round(u.area / capacity * 100) : 0 });
  }
  return out;
}

/** Puntale consigliato per la sezione (DIN 46228), es. "1,5" → "H1,5/8" */
export function ferrule(cross?: string): string {
  if (!cross) return '';
  const v = parseFloat(cross.replace(',', '.').replace(/mm.*$/, ''));
  if (isNaN(v)) return '';
  const len = v <= 1.5 ? 8 : v <= 4 ? 10 : v <= 10 ? 12 : 18;
  return `H${String(v).replace('.', ',')}/${len}`;
}

/** Lista fili per il cablaggio: collegamenti con sezione, colore, puntali e lunghezza stimata */
export function wireList(project: Project): { conn: Connection; length?: number }[] {
  const pos = positions(project);
  return connections(computeNetlist(project), project).filter(c => c.wireNo || c.from).map(conn => ({ conn, length: wireLength(project, conn, pos) }));
}

/** Articoli di guide e canaline: metri totali per articolo */
export function layoutBomItems(project: Project): { partNr: string; meters: number; tag: string }[] {
  // Per articolo e quadro del layout: la sigla «+Q1» dice di quale quadro sono (stampa di un solo quadro)
  const m = new Map<string, { partNr: string; meters: number; tag: string }>();
  for (const pg of project.pages) for (const it of pg.layout?.items ?? []) {
    if ((it.kind !== 'rail' && it.kind !== 'duct') || !it.partNr) continue;
    const code = (project.panels ?? []).find(p => p.id === pg.panelId)?.code;
    const tag = code ? `+${code}` : 'layout';
    const e = m.get(`${it.partNr}|${tag}`) ?? { partNr: it.partNr, meters: 0, tag };
    e.meters += Math.max(it.w, it.h) / 1000;
    m.set(`${it.partNr}|${tag}`, e);
  }
  return [...m.values()].map(e => ({ ...e, meters: Math.round(e.meters * 100) / 100 }));
}

/** DXF 1:1 della piastra: contorno, guide (con fori di fissaggio), canaline, sagome degli apparecchi */
export function layoutToDxf(pg: Page, holePitch = 100): string {
  const l = layoutOf(pg);
  const out: string[] = ['0', 'SECTION', '2', 'ENTITIES'];
  // In DXF l'asse y va verso l'alto: la piastra viene ribaltata
  const Y = (y: number) => l.plate.h - y;
  const line = (x1: number, y1: number, x2: number, y2: number, layer: string) =>
    out.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(Y(y1)), '30', '0', '11', String(x2), '21', String(Y(y2)), '31', '0');
  const rect = (x: number, y: number, w: number, h: number, layer: string) => {
    line(x, y, x + w, y, layer); line(x + w, y, x + w, y + h, layer); line(x + w, y + h, x, y + h, layer); line(x, y + h, x, y, layer);
  };
  const circle = (x: number, y: number, r: number, layer: string) => out.push('0', 'CIRCLE', '8', layer, '10', String(x), '20', String(Y(y)), '30', '0', '40', String(r));
  const text = (x: number, y: number, s: string, h: number, layer: string) => out.push('0', 'TEXT', '8', layer, '10', String(x), '20', String(Y(y)), '30', '0', '40', String(h), '1', s);
  rect(0, 0, l.plate.w, l.plate.h, 'PIASTRA');
  for (const it of l.items) {
    const layer = { rail: 'GUIDE', duct: 'CANALINE', device: 'APPARECCHI', strip: 'MORSETTIERE' }[it.kind];
    rect(it.x, it.y, it.w, it.h, layer);
    if (it.ref) text(it.x + 1, it.y + it.h / 2, `-${it.ref}`, Math.min(5, it.h / 4), layer);
    if (it.kind === 'rail' || it.kind === 'duct') {
      // Fori di fissaggio Ø 5,5 lungo l'asse: a 15 mm dalle estremità e poi al passo indicato
      const horiz = it.w >= it.h, len = horiz ? it.w : it.h;
      const pts: number[] = [15];
      for (let d = 15 + holePitch; d < len - 15; d += holePitch) pts.push(d);
      if (len > 30) pts.push(len - 15);
      for (const d of pts) circle(horiz ? it.x + d : it.x + it.w / 2, horiz ? it.y + it.h / 2 : it.y + d, 2.75, 'FORI');
    }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}

/**
 * Posa automatica: se la piastra è vuota crea file di canalina + guida (passo 160 mm) e
 * canaline verticali ai lati; poi mette gli elementi non ancora posati sulle guide, da
 * sinistra a destra, nell'ordine delle sigle (prima gli apparecchi, poi le morsettiere in basso).
 */
export interface AutoLayoutOptions {
  /** Elementi da posare («device|2K1», «strip|X1»); assente = tutti quelli non ancora posati */
  refs?: Set<string>;
  /** Ordine sulle guide: per sigla (assente) o come compaiono nello schema */
  order?: 'tag' | 'page';
  /** Spazio tra un elemento e l'altro sulla guida (mm, assente = 2) */
  gap?: number;
}

/** Elementi che la posa automatica può mettere sulla piastra (non ancora posati), con la pagina dello schema */
export function layoutCandidates(project: Project, l: Layout, library: Part[] = [], panelId?: string): (Placeable & { key: string; page: number })[] {
  const done = placedRefs(project);
  for (const it of l.items) if (it.ref) done.add(`${it.kind}|${it.ref}`);
  const pageOf = new Map<string, number>();
  for (const d of buildDevices(project).values()) pageOf.set(d.tag, Math.min(...d.elements.map(e => e.pageIndex)));
  return placeables(project, library, panelId).filter(p => !done.has(`${p.kind}|${p.ref}`))
    .map(p => ({ ...p, key: `${p.kind}|${p.ref}`, page: pageOf.get(p.ref) ?? Infinity }));
}

export function autoLayout(project: Project, l: Layout, library: Part[] = [], panelId?: string, opts: AutoLayoutOptions = {}): { placed: number; missing: string[] } {
  if (!l.items.some(i => i.kind === 'rail')) {
    const side = DUCT_W, row = 160;
    l.items.push({ id: uid('L'), kind: 'duct', x: 0, y: 0, w: side, h: l.plate.h, label: '40x60' });
    l.items.push({ id: uid('L'), kind: 'duct', x: l.plate.w - side, y: 0, w: side, h: l.plate.h, label: '40x60' });
    for (let top = 0; top + row <= l.plate.h; top += row) {
      l.items.push({ id: uid('L'), kind: 'duct', x: side, y: top, w: l.plate.w - 2 * side, h: DUCT_W, label: '40x60' });
      l.items.push({ id: uid('L'), kind: 'rail', x: side + 10, y: top + DUCT_W + (row - DUCT_W - RAIL_H) / 2, w: l.plate.w - 2 * side - 20, h: RAIL_H, label: 'TS35' });
    }
  }
  const byTag = (a: { ref: string }, b: { ref: string }) => a.ref.localeCompare(b.ref, undefined, { numeric: true });
  const todo = layoutCandidates(project, l, library, panelId).filter(p => !opts.refs || opts.refs.has(p.key))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'device' ? -1 : 1) : opts.order === 'page' ? a.page - b.page || byTag(a, b) : byTag(a, b)));
  const gap = opts.gap ?? 2;
  const rails = l.items.filter(i => i.kind === 'rail').sort((a, b) => a.y - b.y || a.x - b.x);
  const cursor = new Map(rails.map(r => [r.id, r.x + 5 + railUsage(l).find(u => u.rail.id === r.id)!.used]));
  const missing: string[] = [];
  let placed = 0;
  for (const p of todo) {
    // Morsettiere sulle guide più in basso, apparecchi su quelle in alto
    const order = p.kind === 'strip' ? [...rails].reverse() : rails;
    const rail = order.find(r => cursor.get(r.id)! + p.w <= r.x + r.w);
    if (!rail) { missing.push(`-${p.ref}`); continue; }
    const x = cursor.get(rail.id)!;
    l.items.push({ id: uid('L'), kind: p.kind, ref: p.ref, x, y: Math.round((rail.y + rail.h / 2 - p.h / 2) * 10) / 10, w: p.w, h: p.h });
    cursor.set(rail.id, x + p.w + gap);
    placed++;
  }
  return { placed, missing };
}

// ── Numeri di posizione e legenda (punto 174) ──────────────────────────────────────────────────
// Ogni apparecchio o morsettiera posato riceve un numero (bollino sul layout); la legenda «n° –
// descrizione – sigla» è accanto alla piastra o nella lista «Legenda posizioni quadro», raggruppata
// per zona (il titolo della pagina di layout: piastra, porta, fianchi…). I numeri sono continui tra le
// pagine di layout dello stesso luogo e restano fissi: «Numera» dà il numero solo a quelli nuovi,
// «Rinumera» li rifà tutti nell'ordine di lettura.

const numbered = (it: LayoutItem) => it.kind === 'device' || it.kind === 'strip';

/** Apparecchi e morsettiere in ordine di lettura: per file dall'alto (centri entro 20 mm), poi da sinistra */
export function readingOrder(items: LayoutItem[]): LayoutItem[] {
  const list = items.filter(numbered).sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows: LayoutItem[][] = [];
  for (const it of list) {
    const row = rows[rows.length - 1], cy = it.y + it.h / 2;
    if (row && Math.abs(cy - (row[0].y + row[0].h / 2)) <= 20) row.push(it); else rows.push([it]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.x - b.x));
}

/** Pagine di layout dello stesso luogo della pagina data, nell'ordine del progetto */
const zonePages = (p: Project, pageId: string): Page[] => {
  const pg = p.pages.find(x => x.id === pageId);
  return pg ? p.pages.filter(x => x.type === 'layout' && (x.panelId ?? '') === (pg.panelId ?? '')) : [];
};

/** Numera le posizioni del luogo della pagina: solo quelle senza numero, o tutte da capo; torna quante ne ha numerate */
export function numberPositions(p: Project, pageId: string, all = false): number {
  const pages = zonePages(p, pageId);
  for (const pg of pages) pg.layout = layoutOf(pg);
  if (all) for (const pg of pages) for (const it of pg.layout!.items) delete it.pos;
  let next = Math.max(0, ...pages.flatMap(pg => pg.layout!.items.map(it => it.pos ?? 0))) + 1, n = 0;
  for (const pg of pages) for (const it of readingOrder(pg.layout!.items)) if (it.pos === undefined) { it.pos = next++; n++; }
  return n;
}

export interface PositionRow { pos: number; tag: string; description: string; partNr: string; zone: string; panel: string; pageName: string; itemId: string }

/** Righe della legenda: tutte le posizioni numerate del progetto (o di una pagina), per luogo, zona e numero */
export function positionRows(project: Project, library: Part[] = [], pageId?: string): PositionRow[] {
  const parts = partsIndex(project, library);
  const devs = buildDevices(project);
  const panels = new Map((project.panels ?? []).map(p => [p.id, p.code]));
  const out: PositionRow[] = [];
  for (const pg of project.pages) {
    if (pg.type !== 'layout' || (pageId && pg.id !== pageId)) continue;
    for (const it of pg.layout?.items ?? []) {
      if (it.pos === undefined || !numbered(it) || !it.ref) continue;
      let description = '', partNr = '';
      if (it.kind === 'device') {
        const d = devs.get(it.ref);
        if (d) { const info = deviceInfo(d.elements, d.main, parts); description = info.description ?? d.elements[0].sym.name; partNr = info.part?.partNr ?? ''; }
        else { const c = project.plc.cards.find(x => x.tag === it.ref); description = c?.description ?? (c ? 'Scheda PLC' : ''); partNr = c?.partNr ?? ''; }
      } else {
        const d = stripData(project, it.ref);
        description = `Morsettiera · ${new Set(stripRows(project, it.ref).map(r => r.base)).size} morsetti`;
        partNr = d.partNr ?? '';
      }
      out.push({ pos: it.pos, tag: it.ref, description, partNr, zone: pg.title, panel: pg.panelId ? panels.get(pg.panelId) ?? '' : '', pageName: pg.name, itemId: it.id });
    }
  }
  const order = new Map(project.pages.map((pg, i) => [pg.name, i]));
  return out.sort((a, b) => a.panel.localeCompare(b.panel, undefined, { numeric: true }) || a.pos - b.pos || (order.get(a.pageName) ?? 0) - (order.get(b.pageName) ?? 0));
}

/** Numeri usati due volte nello stesso luogo (per i controlli del layout) */
export function duplicatePositions(project: Project): { panel: string; pos: number; tags: string[] }[] {
  const m = new Map<string, string[]>();
  for (const r of positionRows(project)) { const k = `${r.panel}|${r.pos}`; m.set(k, [...(m.get(k) ?? []), r.tag]); }
  return [...m].filter(([, t]) => t.length > 1).map(([k, tags]) => ({ panel: k.split('|')[0], pos: Number(k.split('|')[1]), tags }));
}

/** Bollini di una pagina: centro e numero, sopra l'apparecchio; i vicini si alternano più in alto con una linea di richiamo */
export const BALLOON_R = 1.7;
export function balloons(l: Layout, v = layoutView(l)): { x: number; y: number; ax: number; ay: number; pos: number; id: string }[] {
  const out: { x: number; y: number; ax: number; ay: number; pos: number; id: string }[] = [];
  if (l.balloons === false) return out;
  const r = BALLOON_R;
  for (const it of readingOrder(l.items)) {
    if (it.pos === undefined) continue;
    const ax = v.ox + (it.x + it.w / 2) * v.k, ay = v.oy + it.y * v.k;
    let y = ay - r - 0.8;
    // Bollino troppo vicino a uno già messo sulla stessa fila: un gradino più in alto
    while (out.some(b => Math.abs(b.x - ax) < 2 * r + 0.3 && Math.abs(b.y - y) < 2 * r + 0.3)) y -= 2 * r + 0.4;
    out.push({ x: ax, y, ax, ay, pos: it.pos, id: it.id });
  }
  return out;
}
