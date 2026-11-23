// Miniatura di riferimento dell'isola I/O (punto 187): piccola immagine della stazione PLC, di solito in
// alto a destra nella pagina, con i moduli in fila nell'ordine di rack e slot e una freccia sul modulo
// (o sui moduli) usato nella pagina. Si genera dalle schede della stazione: non c'è da disegnarla.
// È un blocco della pagina (BlockItem con block 'station'); senza stazione scelta prende quella dei
// canali PLC disegnati nella pagina.
import type { BlockItem, Page, PlcCard, Project } from './types';
import { FRAME } from './types';
import { cardType, IO_KINDS } from './plc';
import { getSymbol } from './geometry';
import { translator } from './i18n';

export const STATION_MINI = { modW: 5, headW: 9, modH: 24, titleH: 5, arrowH: 6, size: 1.7, titleSize: 2.4, maxW: 120 };

export interface StationMiniDrawing {
  rects: { x: number; y: number; w: number; h: number; used?: boolean }[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  /** Punte delle frecce (triangoli pieni) */
  arrows: { x: number; y: number }[];
  texts: { x: number; y: number; s: string; size: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean }[];
  /** Stazione mostrata (vuota se il progetto non ha schede) */
  station: string;
}

/** Pagina che contiene il blocco */
const pageOf = (project: Project, b: BlockItem): Page | undefined => project.pages.find(pg => pg.elements.some(e => e.id === b.id));

/** Sigle delle schede PLC usate nella pagina (punti e gruppi I/O e simboli con la sigla di una scheda) */
export function cardsUsedOn(project: Project, page: Page | undefined): Set<string> {
  const out = new Set<string>();
  if (!page) return out;
  const tags = new Set(project.plc.cards.map(c => c.tag));
  for (const e of page.elements) {
    if (e.kind !== 'symbol' || !tags.has(e.tag)) continue;
    if (getSymbol(e.symbolId, project)?.role === 'plc') out.add(e.tag);
  }
  return out;
}

/** Stazione della miniatura: quella scelta, altrimenti quella con più schede usate nella pagina, altrimenti la prima */
export function miniStation(project: Project, b: BlockItem, page = pageOf(project, b)): string {
  if (b.station && project.plc.cards.some(c => c.station === b.station)) return b.station;
  const used = cardsUsedOn(project, page);
  const count = new Map<string, number>();
  for (const c of project.plc.cards) if (used.has(c.tag)) count.set(c.station, (count.get(c.station) ?? 0) + 1);
  const best = [...count].sort((a, z) => z[1] - a[1])[0]?.[0];
  return best ?? project.plc.cards[0]?.station ?? '';
}

/** Schede della stazione in ordine di rack e slot (le schede senza slot in fondo, nell'ordine dell'elenco) */
export function stationCards(project: Project, station: string): PlcCard[] {
  const list = project.plc.cards.map((c, i) => ({ c, i })).filter(x => x.c.station === station);
  const key = (x: { c: PlcCard; i: number }) => [(x.c.rack ?? 0), x.c.slot ?? 1e6, x.i];
  return list.sort((a, z) => { const p = key(a), q = key(z); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; }).map(x => x.c);
}

/** Tipo breve del modulo: «DI16», «DO8 · AI2», «CPU», «Bus» */
function shortKind(c: PlcCard): string {
  if (c.typeId.startsWith('cpu')) return 'CPU';
  const ch = cardType(c).channels;
  const s = IO_KINDS.filter(k => ch[k]).map(k => `${k}${ch[k]}`).join(' ');
  return s || 'Bus';
}

/** Larghezza di un modulo: più stretti se la stazione ne ha tanti */
function sizes(n: number) {
  const M = STATION_MINI;
  const modW = Math.max(3, Math.min(M.modW, (M.maxW - M.headW) / Math.max(1, n)));
  return { modW, w: M.headW + modW * n };
}

/** Ingombro del blocco della miniatura */
export function stationMiniBox(project: Project, b: BlockItem) {
  const M = STATION_MINI;
  const station = miniStation(project, b);
  const cards = stationCards(project, station).filter(c => !c.typeId.startsWith('cpu'));
  const { w } = sizes(cards.length);
  return { x0: b.x, y0: b.y, x1: b.x + Math.max(w, 30), y1: b.y + M.titleH + M.arrowH + M.modH };
}

/** Disegno della miniatura (mm, coordinate della pagina) */
export function stationMiniDrawing(project: Project, b: BlockItem): StationMiniDrawing {
  const M = STATION_MINI;
  const page = pageOf(project, b);
  const station = miniStation(project, b, page);
  const { t } = translator(project);
  const out: StationMiniDrawing = { rects: [], lines: [], arrows: [], texts: [], station };
  const all = stationCards(project, station);
  if (!station) {
    out.texts.push({ x: b.x, y: b.y + M.titleH, s: t('Nessuna stazione PLC'), size: M.titleSize });
    return out;
  }
  // Testa: la CPU (se è una scheda della stazione) o l'accoppiatore della stazione
  const cpu = all.find(c => c.typeId.startsWith('cpu'));
  const cards = all.filter(c => c !== cpu);
  const used = cardsUsedOn(project, page);
  const { modW } = sizes(cards.length);
  const y0 = b.y + M.titleH + M.arrowH, y1 = y0 + M.modH;
  const st = project.plc.stations?.find(s => s.name === station);
  out.texts.push({ x: b.x, y: b.y + M.titleSize, s: [`${t('Stazione PLC')} ${station}`, st?.kind ? t(st.kind) : ''].filter(Boolean).join(' · '), size: M.titleSize, bold: true });
  const vtext = (x: number, w: number, s: string) => out.texts.push({ x: x + w / 2 + M.size * 0.35, y: y1 - 1, s, size: Math.min(M.size, w * 0.42), rot: -90 });
  const mark = (x: number, w: number) => {
    // Freccia dall'alto verso il modulo usato nella pagina
    const cx = x + w / 2;
    out.lines.push({ x1: cx, y1: y0 - M.arrowH + 0.5, x2: cx, y2: y0 - 1.6 });
    out.arrows.push({ x: cx, y: y0 - 0.3 });
  };
  out.rects.push({ x: b.x, y: y0, w: M.headW, h: M.modH, used: !!cpu && used.has(cpu.tag) });
  vtext(b.x, M.headW, cpu ? `-${cpu.tag} · CPU` : station);
  if (cpu && used.has(cpu.tag)) mark(b.x, M.headW);
  cards.forEach((c, i) => {
    const x = b.x + M.headW + i * modW;
    const on = used.has(c.tag);
    out.rects.push({ x, y: y0, w: modW, h: M.modH, used: on });
    vtext(x, modW, `-${c.tag} ${shortKind(c)}`);
    if (on) mark(x, modW);
  });
  return out;
}

/** Posto di serie della miniatura: in alto a destra, dentro la cornice */
export function stationMiniPlace(project: Project, b: BlockItem): { x: number; y: number } {
  const box = stationMiniBox(project, b);
  return { x: FRAME.right - (box.x1 - box.x0) - 4, y: FRAME.top + 3 };
}
