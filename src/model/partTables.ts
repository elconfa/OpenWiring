// Tabelle materiali dei componenti sullo schema: si aggiungono componente per componente (tasto destro
// ▸ Tabella materiali, o l'occhio nelle proprietà) e mostrano luogo e sigla e, sotto, una riga per
// articolo (quantità, costruttore, codice), come negli schemi dei costruttori di macchine. La tabella sta
// nella pagina dell'elemento principale del dispositivo. Posizione: trascinata resta legata al simbolo
// (textOffsets.parts, rispetto alla posizione del simbolo); lasciata sotto un'altra tabella le si aggancia
// (partsLink) e la segue; senza scelta le tabelle si impilano in colonna sul margine destro del foglio.
import type { Part, Project, Page, Pt, ExtraPart, PartTableCols, Cable } from './types';
import { FRAME, TITLE_TOP } from './types';
import { buildDevices, deviceInfo, partsIndex, type Device, type DeviceInfo } from './devices';
import { cableByPiece } from './cables';
import { cableEnds } from './cableEnds';
import { cardOrderInfo } from './plc';
import { symShown } from './visibility';
import { translator } from './i18n';

export interface PartTableRow {
  qty: string; manufacturer: string; code: string;
  /** Righe di testo di ogni cella (a capo quando il testo è più largo della colonna) */
  lines: { qty: string[]; manufacturer: string[]; code: string[] };
  /** Altezza della riga (mm) */
  h: number;
}

export interface PartTable {
  /** Elemento a cui è legata la tabellina (principale del dispositivo, o il primo disegnato) */
  instId: string;
  /** Intestazione: «Luogo: +QA   Sigla: 16QF1», a capo se più larga della tabella */
  head: string[];
  rows: PartTableRow[];
  /** Larghezze delle colonne (quantità, costruttore, codice) in mm */
  cols: [number, number, number];
  w: number;
  /** Altezza dell'intestazione (mm) */
  headH: number;
  h: number;
}

/** Misure delle tabelline in mm: righe da rowH, una riga di testo in più ogni lineH */
export const PART_TABLE = { size: 2.2, headSize: 2.4, rowH: 4, headH: 4.6, lineH: 2.7, gap: 3, pad: 1 };

/** Larghezze predefinite delle colonne (mm): quantità, costruttore, codice */
export const PART_TABLE_COLS: PartTableCols = { qty: 6, maker: 26, code: 32 };

/** Larghezze delle colonne nella pagina: quelle della pagina, altrimenti del progetto, altrimenti predefinite */
export function partTableColsOf(project: Project, page?: Page): PartTableCols {
  return { ...PART_TABLE_COLS, ...(project.settings?.partTableCols ?? {}), ...(page?.partTableCols ?? {}) };
}

/** Caratteri che stanno in una riga della colonna larga w (mm) all'altezza size */
const charsIn = (w: number, size: number) => Math.max(1, Math.floor((w - 2 * PART_TABLE.pad) / (size * 0.55)));

/** Testo accorciato con «…» perché stia nella larghezza (mm) all'altezza dei caratteri data */
export function fitText(s: string, w: number, size: number): string {
  const n = charsIn(w, size);
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

/**
 * Testo a capo perché stia nella larghezza (mm): si va a capo agli spazi e, nelle parole troppo lunghe
 * (codici), dopo un trattino, una barra o un punto, altrimenti dove serve
 */
export function wrapText(s: string, w: number, size: number): string[] {
  const n = charsIn(w, size);
  // Ci sta: com'è, con i suoi spazi
  if (s.length <= n) return [s];
  const out: string[] = [];
  let cur = '';
  const push = (x: string) => { if (x) out.push(x); };
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= n) { cur = next; continue; }
    push(cur); cur = '';
    let rest = word;
    while (rest.length > n) {
      // Taglio dopo l'ultimo separatore che sta nella riga, altrimenti alla fine della riga
      const head = rest.slice(0, n);
      const k = Math.max(head.lastIndexOf('-'), head.lastIndexOf('/'), head.lastIndexOf('.'), head.lastIndexOf('_'));
      const cut = k >= Math.floor(n / 2) ? k + 1 : n;
      out.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    cur = rest;
  }
  push(cur);
  return out.length ? out : [''];
}

/** Pagine con le tabelle materiali: solo le pagine di schema */
const schematic = (page: Page) => page.type === 'multiline' || page.type === 'singleline';

type Row0 = { qty: string; manufacturer: string; code: string };

/** Raccoglitore delle righe: articoli uguali (stesso costruttore e codice) si sommano */
function rowCollector(parts: Map<string, Part>) {
  const out = new Map<string, { qty: number; unit: string; manufacturer: string; code: string }>();
  const add = (partNr: string | undefined, part: Part | undefined, manufacturer: string | undefined, orderNr: string | undefined, typeNr: string | undefined, qty: number, unit = '', depth = 0) => {
    const kit = partNr ? (part ?? parts.get(partNr))?.kit : undefined;
    if (kit?.length && depth < 4) {
      // Con il suo codice d'ordine l'articolo del set c'è anch'esso (fotocellula + catarifrangente)
      if (orderNr?.trim()) add(partNr, part, manufacturer, orderNr, typeNr, qty, unit, 4);
      for (const k of kit) {
        if (!k.partNr || k.partNr === partNr) continue;
        const p = parts.get(k.partNr);
        add(k.partNr, p, p?.manufacturer ?? k.manufacturer, p ? p.orderNr : k.partNr, p?.typeNr, qty * (k.qty ?? 1), '', depth + 1);
      }
      return;
    }
    const code = (orderNr || typeNr || partNr)?.trim();
    if (!code) return;
    const key = `${manufacturer ?? ''}|${code}|${unit}`;
    const r = out.get(key) ?? { qty: 0, unit, manufacturer: manufacturer?.trim() ?? '', code };
    r.qty += qty; out.set(key, r);
  };
  const addInfo = (info: DeviceInfo) => {
    add(info.partNr, info.part, info.manufacturer, info.orderNr, info.typeNr, 1);
    addExtras(info.extraParts);
  };
  const addExtras = (list: ExtraPart[] | undefined) => {
    for (const x of list ?? []) {
      if (!x.partNr) continue;
      const p = parts.get(x.partNr);
      add(x.partNr, p, p?.manufacturer ?? x.manufacturer, p ? p.orderNr : x.partNr, p?.typeNr, x.qty ?? 1);
    }
  };
  const rows = (): Row0[] => [...out.values()].map(r => ({ qty: `${String(Math.round(r.qty * 100) / 100).replace('.', ',')}${r.unit ? ` ${r.unit}` : ''}`, manufacturer: r.manufacturer, code: r.code }));
  return { add, addInfo, addExtras, rows };
}

/** Elemento che porta la tabellina: il principale, altrimenti il primo disegnato (non morsetti, pin, rimandi) */
function headOf(d: Device) {
  const ok = (e: Device['elements'][number]) => !['terminal', 'pin', 'potential', 'link'].includes(e.sym.role);
  return d.main && ok(d.main) ? d.main : d.elements.find(ok);
}

/** Cavi e connettori «del cavo» di ogni dispositivo in campo (sigla → cavi, connettori), vedi cableEnds.ts */
function cablesOfDevices(project: Project): Map<string, { cables: Cable[]; conns: string[] }> {
  const out = new Map<string, { cables: Cable[]; conns: string[] }>();
  for (const e of cableEnds(project).values()) {
    const tag = e.fieldTags[0];
    if (!tag) continue;
    const o = out.get(tag) ?? { cables: [], conns: [] };
    o.cables.push(e.cable);
    for (const c of e.conns) if (!o.conns.includes(c.conn)) o.conns.push(c.conn);
    out.set(tag, o);
  }
  return out;
}

/**
 * Tabelle materiali scelte, per pagina (pagina → tabelle), con testi e misure; la posizione la dà
 * layoutPartTables dagli elementi della pagina. Nella tabella di un dispositivo in campo ci sono
 * anche il cavo collegato (con i suoi articoli aggiuntivi) e i connettori che fanno parte del cavo.
 */
export function partTables(project: Project, library: Part[] = []): Map<string, PartTable[]> {
  const out = new Map<string, PartTable[]>();
  const on = new Set(project.pages.filter(schematic).map(pg => pg.id));
  // Nessuna tabella scelta: niente da calcolare
  if (!project.pages.some(pg => pg.elements.some(e => e.kind === 'symbol' && e.show?.parts))) return out;
  const parts = partsIndex(project, library);
  const devices = buildDevices(project);
  const cards = new Map(project.plc.cards.map(c => [c.tag, c]));
  const withCables = cablesOfDevices(project);
  const { t } = translator(project);
  const S = PART_TABLE;
  for (const d of devices.values()) {
    const head = headOf(d);
    if (!head || !on.has(head.page.id)) continue;
    const card = cards.get(d.tag);
    const info = card ? cardOrderInfo(project, card, parts, devices).info : deviceInfo(d.elements, d.main, parts);
    const own = deviceInfo(d.elements, d.main, parts);
    if (!symShown(own.show, 'parts')) continue;
    const rc = rowCollector(parts);
    rc.addInfo(info);
    // Cavo collegato al dispositivo in campo, con i suoi articoli aggiuntivi e i connettori del cavo
    const wc = withCables.get(d.tag);
    for (const c of wc?.cables ?? []) {
      const part = c.partNr ? parts.get(c.partNr) : undefined;
      const piece = cableByPiece(c, part);
      if (c.partNr || c.type) rc.add(c.partNr, part, part?.manufacturer, part?.orderNr ?? (c.partNr ? undefined : c.type), part?.typeNr ?? c.type, piece || !c.length ? 1 : c.length, piece || !c.length ? '' : 'm');
      rc.addExtras(c.extraParts);
    }
    for (const conn of wc?.conns ?? []) { const cd = devices.get(conn); if (cd) rc.addInfo(deviceInfo(cd.elements, cd.main, parts)); }
    const rows0 = rc.rows();
    if (!rows0.length) continue;
    const loc = own.loc ?? info.loc;
    const headText = [loc ? `${t('Luogo')}: +${loc}` : '', `${t('Sigla')}: ${d.tag}`].filter(Boolean).join('   ');
    // Colonne fisse (del progetto o della pagina): tutte le tabelle della pagina sono uguali; il testo
    // più largo della colonna va a capo e la riga diventa più alta
    const c = partTableColsOf(project, head.page);
    const cols: [number, number, number] = [c.qty, c.maker, c.code];
    const w = c.qty + c.maker + c.code;
    const rows = rows0.map(r => {
      const lines = { qty: wrapText(r.qty, c.qty, S.size), manufacturer: wrapText(r.manufacturer, c.maker, S.size), code: wrapText(r.code, c.code, S.size) };
      const n = Math.max(lines.qty.length, lines.manufacturer.length, lines.code.length);
      return { ...r, lines, h: S.rowH + (n - 1) * S.lineH };
    });
    const headLines = wrapText(headText, w, S.headSize);
    const headH = S.headH + (headLines.length - 1) * S.lineH;
    const list = out.get(head.page.id) ?? [];
    list.push({ instId: head.inst.id, head: headLines, rows, cols, w, headH, h: headH + rows.reduce((a, r) => a + r.h, 0) });
    out.set(head.page.id, list);
  }
  return out;
}

/** Spazio tra una tabella e quella agganciata sotto (mm) */
export const PART_LINK_GAP = 1;

type InstPos = { id: string; kind: string; x?: number; y?: number; textOffsets?: { parts?: Pt }; partsLink?: string };

/**
 * Angolo in alto a sinistra di ogni tabella della pagina (instId → punto), dagli elementi della pagina
 * (anche quelli dell'anteprima durante un trascinamento): agganciata sotto la sua tabella madre,
 * trascinata rispetto al simbolo, altrimenti in colonna sul margine destro (dall'alto in basso, poi una
 * nuova colonna a sinistra).
 */
export function layoutPartTables(tables: PartTable[] | undefined, elements: readonly InstPos[]): Map<string, Pt> {
  const out = new Map<string, Pt>();
  if (!tables?.length) return out;
  const byId = new Map(tables.map(t => [t.instId, t]));
  const inst = new Map(elements.filter(e => e.kind === 'symbol' && byId.has(e.id)).map(e => [e.id, e]));
  const rawParent = (id: string) => { const l = inst.get(id)?.partsLink; return l && l !== id && byId.has(l) ? l : undefined; };
  // Giri di agganci (A sotto B, B sotto A): la prima tabella del giro, nell'ordine della pagina, non ha madre
  const cut = new Set<string>();
  for (const tb of tables) {
    const path: string[] = [];
    for (let id: string | undefined = tb.instId; id && !cut.has(id); id = rawParent(id)) {
      const i = path.indexOf(id);
      if (i >= 0) { const ring = new Set(path.slice(i)); cut.add(tables.find(t => ring.has(t.instId))!.instId); break; }
      path.push(id);
    }
  }
  const parentOf = (id: string) => (cut.has(id) ? undefined : rawParent(id));
  const linked = (id: string) => !!parentOf(id);
  const S = PART_TABLE;
  const top = FRAME.top + 8, bottom = TITLE_TOP - 4;
  let right = FRAME.right - 4, y = top, colW = 0;
  // Radici: trascinate (rispetto al simbolo) o in colonna
  for (const tb of tables) {
    if (linked(tb.instId)) continue;
    const e = inst.get(tb.instId);
    const o = e?.textOffsets?.parts;
    if (o && e && e.x !== undefined && e.y !== undefined) { out.set(tb.instId, { x: e.x + o.x, y: e.y + o.y }); continue; }
    // In colonna la catena occupa l'altezza di tutte le sue tabelle
    const chain = chainOf(tb.instId);
    const h = chain.reduce((a, id) => a + byId.get(id)!.h, 0) + PART_LINK_GAP * (chain.length - 1);
    const w = Math.max(...chain.map(id => byId.get(id)!.w));
    if (y > top && y + h > bottom) { right -= colW + 4; y = top; colW = 0; }
    out.set(tb.instId, { x: right - w, y });
    colW = Math.max(colW, w);
    y += h + S.gap;
  }
  // Agganciate: sotto la madre, allineate a sinistra
  function chainOf(id: string): string[] {
    const list = [id];
    for (let i = 0; i < list.length; i++) for (const t of tables!) if (parentOf(t.instId) === list[i] && !list.includes(t.instId)) list.push(t.instId);
    return list;
  }
  const place = (id: string, seen: Set<string>) => {
    const at = out.get(id);
    if (!at) return;
    for (const t of tables) {
      if (parentOf(t.instId) !== id || seen.has(t.instId)) continue;
      seen.add(t.instId);
      out.set(t.instId, { x: at.x, y: at.y + byId.get(id)!.h + PART_LINK_GAP });
      place(t.instId, seen);
    }
  };
  for (const id of [...out.keys()]) place(id, new Set([id]));
  return out;
}

/**
 * Tabella sotto cui si aggancia quella trascinata (angolo in alto a sinistra in «at»): quella con il
 * bordo inferiore vicino al punto (entro 4 mm), che non sia la stessa né una delle sue agganciate
 */
export function partTableDropTarget(tables: PartTable[], pos: Map<string, Pt>, dragged: string, at: Pt, elements: readonly InstPos[]): string | undefined {
  const linkOf = new Map(elements.filter(e => e.kind === 'symbol' && e.partsLink).map(e => [e.id, e.partsLink!]));
  const below = (id: string) => { for (let p = linkOf.get(id), n = 0; p && n < 50; p = linkOf.get(p), n++) if (p === dragged) return true; return false; };
  let best: string | undefined, bestD = 4;
  for (const t of tables) {
    if (t.instId === dragged || below(t.instId)) continue;
    const p = pos.get(t.instId);
    if (!p) continue;
    // Una tabella con già un'altra agganciata sotto non è un bersaglio: ci si aggancia in fondo alla catena
    if (elements.some(e => e.kind === 'symbol' && e.partsLink === t.instId && e.id !== dragged)) continue;
    const d = Math.hypot(at.x - p.x, at.y - (p.y + t.h + PART_LINK_GAP));
    if (d < bestD) { bestD = d; best = t.instId; }
  }
  return best;
}

/**
 * Ultima tabella della colonna sul margine destro della pagina (in fondo alla sua catena): una tabella
 * aggiunta si aggancia lì sotto, così le tabelle create una dopo l'altra restano legate fra loro (si
 * spostano e si dividono a mano). Undefined se nella colonna non c'è nessuna tabella
 */
export function partTableTail(tables: PartTable[] | undefined, elements: readonly InstPos[], exclude?: string): string | undefined {
  const list = (tables ?? []).filter(t => t.instId !== exclude);
  if (!list.length) return undefined;
  const ids = new Set(list.map(t => t.instId));
  const inst = new Map(elements.filter(e => e.kind === 'symbol' && ids.has(e.id)).map(e => [e.id, e]));
  const parent = (id: string) => { const l = inst.get(id)?.partsLink; return l && l !== id && ids.has(l) ? l : undefined; };
  // Radice della catena (con protezione dai giri)
  const rootOf = (id: string) => { let r = id; for (let n = 0, p = parent(r); p && n < 100; p = parent(r), n++) r = p; return r; };
  const inColumn = (id: string) => { const r = rootOf(id); return !inst.get(r)?.textOffsets?.parts; };
  const roots = list.filter(t => !parent(t.instId) && inColumn(t.instId)).map(t => t.instId);
  const root = roots[roots.length - 1];
  if (!root) return undefined;
  // In fondo alla catena: si scende finché c'è una tabella agganciata sotto
  let tail = root;
  for (let n = 0; n < 100; n++) {
    const child = list.find(t => parent(t.instId) === tail && t.instId !== root);
    if (!child) break;
    tail = child.instId;
  }
  return tail;
}
