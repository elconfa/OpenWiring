// Area di disegno: zoom/pan, selezione, spostamento, disegno fili, inserimento simboli.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { isListPage } from '../model/lists';
import { useStore } from '../model/store';
import type { Pt, Wire, Element, Page, Project, SymbolDef, TextItem, TextMoveKey, ImageItem, Zone, CableLine } from '../model/types';
import { PAGE_W, PAGE_H } from '../model/types';
import { getSymbol, instanceBounds, pinsWorld, snapPt, distToSegment, samePt, onSegmentInterior, uid, getGridSize, polylineTouchesBox } from '../model/geometry';
import { PageContent, SymbolGraphic, SEL } from './PageSvg';
import { Minimap } from './Minimap';
import { RadialMenu, radialItems } from './RadialMenu';
import type { Derived } from '../model/derive';
import { useDarkTheme } from './theme';
import { moveWithWires, dragWirePoint, dragWireSegment, landOnWire } from '../model/wireEdit';
import { labelNear } from '../model/wireLabels';
import { editRichText } from './RichTextEditor';
import { openTextEditor } from './PropertyPanel';
import { openPropsDialog } from './PropsDialog';
import { TB_AREA } from '../model/titleBlocks';
import { saveMacroFromSelection, duplicatePageAsk } from './actions';
import { potentialOf } from '../model/netlist';
import { chooseLinkPartner } from './linkChooser';
import { chooseAuxDevice } from './auxChooser';
import { addCableLineAsk } from './cableChooser';
import { confirmTerminalRow, startTerminalRow } from './terminalRowChooser';
import { crossedWires } from '../model/cables';
import { chooseBundleName, chooseNewTaps } from './bundleChooser';
import { quickWirePath } from '../model/autoWire';
import { textBounds } from '../model/textFlow';
import { pasteOffset } from '../model/clipboard';
import { ALIGN_MODES } from '../model/align';
import { tx } from '../i18n/ui';
import { nextRot, fitRot } from '../model/rotations';
import { plcSlot } from '../model/fixedPos';
import { settingsOf } from '../model/numbering';
import { wireDefLabelAt } from '../model/wireDefs';
import { canReplace } from '../model/replaceSymbol';
import { chooseReplacement } from './ReplaceSymbolDialog';
import { tNodeAt } from '../model/wiringOrder';
import { editWireOrder } from './wireOrderDialog';
import { DRAG_PLACE } from './SymbolTreeView';
import { showInLibrary } from './LibrarySync';
import { libraryIndex, isDeletedSymbol } from '../model/symbolSync';
import { resizeZone, zoneHandles, zoneLabelBox, zoneLookOf, zoneText, type ZoneHandle } from '../model/leaders';

interface ViewBox { x: number; y: number; w: number; h: number }

/** Menu del tasto destro: posizione a schermo e punto della pagina */
interface Menu { cx: number; cy: number; at: Pt; /** Numero filo sotto il cursore (-1 = in posizione automatica) */ label?: { wireId: string; index: number } }

/** Testo di un simbolo sotto il cursore (data-devtext in PageSvg) */
function devTextAt(target: EventTarget | null): { instId: string; key: TextMoveKey } | undefined {
  const el = (target as globalThis.Element | null)?.closest?.('[data-devtext]');
  return el ? { instId: el.getAttribute('data-devtext')!, key: el.getAttribute('data-key') as TextMoveKey } : undefined;
}

/** Numero filo sotto il cursore (testo con data-wire-label in PageSvg) */
function wireLabelAt(target: EventTarget | null): { wireId: string; index: number } | undefined {
  const el = (target as globalThis.Element | null)?.closest?.('[data-wire-label]');
  return el ? { wireId: el.getAttribute('data-wire-label')!, index: Number(el.getAttribute('data-label')) } : undefined;
}

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const key = (k: string) => (MAC ? `⌘${k}` : `Ctrl+${k}`);

function ContextMenu({ menu, derived, onClose }: { menu: Menu; derived: Derived; onClose: () => void }) {
  const st = useStore.getState();
  const sel = st.selection;
  const page = st.project.pages.find(p => p.id === st.pageId);
  const one = sel.length === 1 ? page?.elements.find(e => e.id === sel[0]) : undefined;
  const sym = one?.kind === 'symbol' ? getSymbol(one.symbolId, st.project) : undefined;
  const pd = derived.pages.get(st.pageId);
  const xr = one ? pd?.xrefs.get(one.id) : undefined;
  const symIds = page?.elements.filter(e => e.kind === 'symbol' && sel.includes(e.id)).map(e => e.id) ?? [];
  const run = (f: () => void) => () => { onClose(); f(); };
  const item = (label: string, f: () => void, opts: { k?: string; disabled?: boolean } = {}) => (
    <button disabled={opts.disabled} onMouseDown={e => e.stopPropagation()} onClick={run(f)}>
      <span>{label}</span>{opts.k && <span className="ctx-key">{opts.k}</span>}
    </button>
  );
  const goTo = (id: string) => {
    const pg = st.project.pages.find(p => p.elements.some(e => e.id === id));
    if (pg) { st.setPage(pg.id); st.setSelection([id]); }
  };
  const left = Math.min(menu.cx, window.innerWidth - 220), top = Math.min(menu.cy, window.innerHeight - 380);
  return (
    <div className="ctx-menu" style={{ left, top }} onMouseDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      {page && isListPage(page) && <>{item(tx('Personalizza la lista…'), () => st.openListStyleOf(page))}<hr /></>}
      {item(tx('Taglia'), () => st.cutSelection(), { k: key('X'), disabled: !sel.length })}
      {item(tx('Copia'), () => st.copySelection(), { k: key('C'), disabled: !sel.length })}
      {item(tx('Incolla qui'), () => st.paste(menu.at), { k: key('V'), disabled: !st.clipboard })}
      {item(tx('Duplica'), () => st.duplicateSelection(), { k: key('D'), disabled: !sel.length })}
      <hr />
      {item(tx('Ruota'), () => st.rotateSelection(), { k: 'R', disabled: !sel.length })}
      {item(tx('Specchia'), () => st.mirrorSelection(), { disabled: !sel.length })}
      {sel.length > 1 && <><hr />{ALIGN_MODES.map(m => <span key={m.id}>{item(`${m.icon}  ${tx(m.name)}`, () => st.alignSelection(m.id))}</span>)}<hr /></>}
      {item(tx('Allinea numeri filo con una linea'), () => st.setTool({ kind: 'wireLabels' }), { k: 'N' })}
      {item(tx('Morsetti in fila sui fili…'), () => startTerminalRow(), { k: 'M' })}
      {item(tx('Elimina'), () => st.deleteSelection(), { k: 'Canc', disabled: !sel.length })}
      {item(tx('Crea macro dalla selezione…'), () => void saveMacroFromSelection(), { disabled: !sel.length })}
      {sym && one?.kind === 'symbol' && sym.role !== 'potential' && sym.role !== 'link' && item(tx('Copia proprietà'), () => st.copyDeviceProps(one.id))}
      {st.propClipboard && symIds.length > 0 && item(tx('Incolla proprietà di -{0}', st.propClipboard.tag), () => st.pasteDeviceProps(symIds))}
      {sym && one?.kind === 'symbol' && canReplace(one) && item(tx('Sostituisci simbolo…'), () => void chooseReplacement(sym).then(id => { if (id) useStore.getState().replaceSymbol(one.id, id); }))}
      {sym && item(tx('Modifica il componente…'), () => {
        // Si modifica il simbolo della libreria personale (l'unica da modificare), se c'è
        const lib = libraryIndex(st.symbolLibrary)(sym);
        st.openSymbolEditor(lib && !isDeletedSymbol(lib) ? lib : sym);
      })}
      {sym && one?.kind === 'symbol' && item(tx('Mostra il simbolo nella libreria'), () => showInLibrary(one.symbolId))}
      {page?.elements.some(e => sel.includes(e.id) && e.kind === 'symbol' && e.textOffsets) && item(tx('Testi nella posizione del simbolo'), () => st.resetTextOffsets(sel))}
      {sym && item(st.favorites.includes(sym.id) ? tx('Togli dai preferiti') : tx('Aggiungi ai preferiti'), () => st.toggleFavorite(sym.id))}
      {sym?.role === 'aux' && one?.kind === 'symbol' && !one.pairOf && (
        <><hr />{item(tx('Disegna una rappresentazione (riferimento a coppie)…'), () => st.startRepresentation(one.id))}</>
      )}
      {sym?.role === 'terminal' && one?.kind === 'symbol' && one.tag.includes(':') && (
        <>
          <hr />
          {item(tx('Aggiungi piano'), () => st.addTerminalLevel(one.id))}
          {item(tx('Apri morsettiera (articoli e accessori)'), () => { st.setStripSel(one.tag.slice(0, one.tag.indexOf(':'))); st.setView('terminals'); })}
        </>
      )}
      {sym?.role === 'pin' && one?.kind === 'symbol' && one.tag.includes(':') && (
        <><hr />{item(tx('Apri connettore'), () => { st.setConnSel(one.tag.slice(0, one.tag.indexOf(':'))); st.setView('connectors'); })}</>
      )}
      {one?.kind === 'wire' && <><hr />{item(tx('Evidenzia potenziale'), () => st.setHighlight(one.id))}{item(tx('Ordine dei collegamenti…'), () => void editWireOrder(one.id))}</>}
      {page && (() => {
        // Nodo a T sotto il cursore: verso della sequenza di cablaggio (braccio a cui si collega il gambo)
        const j = pd?.junctions.find(p => Math.hypot(p.x - menu.at.x, p.y - menu.at.y) < 2);
        const t = j ? tNodeAt(page.elements.filter((e): e is Wire => e.kind === 'wire' && e.bundle === undefined), j) : undefined;
        if (!j || !t?.holders.length) return null;
        const NAMES = { left: tx('Nodo a T: il gambo va a sinistra ←'), right: tx('Nodo a T: il gambo va a destra →'), up: tx('Nodo a T: il gambo va in alto ↑'), down: tx('Nodo a T: il gambo va in basso ↓') };
        return (
          <>
            <hr />
            {t.through.map(d => <span key={d}>{item(`${t.join === d ? '✓ ' : ''}${NAMES[d]}`, () => st.setTNode(page.id, j, d))}</span>)}
            {t.join && item(tx('Nodo senza verso (pallino)'), () => st.setTNode(page.id, j, undefined))}
          </>
        );
      })()}
      {page?.elements.some(e => sel.includes(e.id) && (e.kind === 'wire' || (e.kind === 'symbol' && getSymbol(e.symbolId, st.project)?.role === 'plc'))) && item(tx('Fili dall\'indirizzo PLC'), () => st.wiresFromPlc())}
      {one?.kind === 'wire' && pd?.wireNumbers.has(one.id) && (() => {
        // Numeri filo: le posizioni attuali (automatica o scelte a mano), più uno qui, uno in meno, o di nuovo automatico
        const cur = pd.wireLabelPos?.get(one.id) ?? [];
        const lbl = menu.label?.wireId === one.id ? menu.label : undefined;
        const add = labelNear(one.points, menu.at, one.labelSize ?? pd.textStyles?.wireNo.size);
        return (
          <>
            {add && item(tx('Aggiungi il numero filo qui'), () => st.setWireLabels(one.id, [...cur, add]))}
            {lbl && cur.length > 1 && item(tx('Togli questo numero filo'), () => st.setWireLabels(one.id, cur.filter((_, i) => i !== Math.max(0, lbl.index))))}
            {one.labels?.length ? item(tx('Numero filo in posizione automatica'), () => st.setWireLabels(one.id, undefined)) : null}
          </>
        );
      })()}
      {st.highlight && item(tx('Togli evidenziazione potenziale'), () => st.setHighlight(null))}
      {xr?.mainId && <><hr />{item(tx('Vai all\'elemento principale'), () => goTo(xr.mainId!))}</>}
      {xr?.contacts?.length ? <><hr />{xr.contacts.map(c => <span key={c.id}>{item(tx('Vai al contatto {0} (/{1})', c.labels, c.location), () => goTo(c.id))}</span>)}</> : null}
      <hr />
      {item(tx('Seleziona tutto'), () => st.setSelection(page?.elements.map(e => e.id) ?? []), { k: key('A') })}
      {item(tx('Cerca e sostituisci…'), () => st.setDialog('search'), { k: key('F') })}
      {item(tx('Duplica pagina'), () => void duplicatePageAsk(st.pageId), { disabled: page?.type !== 'multiline' })}
      {item(tx('Adatta alla finestra'), () => window.dispatchEvent(new Event('elettrocad:fit')), { k: 'F' })}
    </div>
  );
}

type Drag =
  | { kind: 'move'; start: Pt; offset: Pt }
  /** Modifica di un filo: trascinamento di un vertice (anche un estremo) o di un tratto */
  | { kind: 'wirePoint'; wireId: string; index: number; to: Pt }
  | { kind: 'wireSeg'; wireId: string; index: number; start: Pt; delta: Pt }
  | { kind: 'box'; start: Pt; end: Pt }
  /** Numero filo trascinato (index -1 = quello in posizione automatica) */
  | { kind: 'wireLabel'; wireId: string; index: number; start: Pt; to: Pt }
  | { kind: 'pan'; startClient: Pt; startVb: ViewBox }
  /** Testo di un simbolo (sigla, righe sotto la sigla, testo del componente) spostato a mano */
  | { kind: 'devText'; instId: string; key: TextMoveKey; start: Pt; to: Pt }
  /** Scritta di una linea di definizione dei fili trascinata */
  | { kind: 'wdLabel'; defId: string; start: Pt; to: Pt }
  | { kind: 'cabLabel'; lineId: string; start: Pt; to: Pt }
  /** Scritta «+codice» del riquadro di luogo trascinata (il righino la segue) */
  | { kind: 'zoneLabel'; zoneId: string; start: Pt; to: Pt }
  /** Riquadro di luogo ridimensionato con una maniglia (angolo o metà lato) */
  | { kind: 'zoneSize'; zoneId: string; handle: ZoneHandle; to: Pt }
  /** Estremo della linea del cavo trascinato per allungarla o accorciarla */
  | { kind: 'cableEnd'; lineId: string; index: 0 | 1; to: Pt }
  | { kind: 'repCol'; key: string; x0: number; to: Pt }
  /** Larghezza del riquadro di un testo, trascinando la maniglia sul lato destro */
  | { kind: 'textW'; textId: string; w: number }
  /** Misure di un'immagine, trascinando l'angolo in basso a destra (proporzioni fisse, Maiusc libere) */
  | { kind: 'imgSize'; imgId: string; w: number; h: number };

function hitTest(page: Page, project: Project, p: Pt, tol: number): Element | undefined {
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const e = page.elements[i];
    if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') {
      for (let k = 0; k < e.points.length - 1; k++) if (distToSegment(p, e.points[k], e.points[k + 1]) < tol) return e;
    }
  }
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const e = page.elements[i];
    if (e.kind === 'symbol') {
      const sym = getSymbol(e.symbolId, project);
      if (!sym) continue;
      const b = instanceBounds(e, sym);
      if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return e;
    } else if (e.kind === 'text') {
      const b = textBounds(e);
      if (p.x >= b.x0 - 1 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 + 1) return e;
    }
  }
  // Riquadri dei quadri: si prendono sul bordo o sull'intestazione, così dentro si selezionano i nodi
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const e = page.elements[i];
    if (e.kind !== 'zone') continue;
    const onEdge = [[e.x, e.y, e.x + e.w, e.y], [e.x + e.w, e.y, e.x + e.w, e.y + e.h], [e.x, e.y + e.h, e.x + e.w, e.y + e.h], [e.x, e.y, e.x, e.y + e.h]]
      .some(([x1, y1, x2, y2]) => distToSegment(p, { x: x1, y: y1 }, { x: x2, y: y2 }) < tol);
    const pn = project.panels?.find(x => x.id === e.panelId);
    const zs = project.settings?.zoneStyle;
    const b = zoneLabelBox(e, zoneText(e, pn, zs), zoneLookOf(e, zs).textSize ?? 3, page.type !== 'network').box;
    const onHeader = p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
    if (onEdge || onHeader) return e;
  }
  // Immagini: in tutto il riquadro, ma dopo gli altri elementi (spesso stanno sotto i simboli)
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const e = page.elements[i];
    if (e.kind === 'image' && p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) return e;
  }
  return undefined;
}

/** Parte di un filo sotto il cursore: un vertice (estremi compresi) o un tratto */
function wireHandle(w: Wire, p: Pt, tol: number): { kind: 'point' | 'seg'; index: number } | undefined {
  const v = w.points.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < tol * 1.3);
  if (v >= 0) return { kind: 'point', index: v };
  for (let k = 0; k < w.points.length - 1; k++) if (distToSegment(p, w.points[k], w.points[k + 1]) < tol) return { kind: 'seg', index: k };
  return undefined;
}

/** Nuovo percorso del filo durante il trascinamento */
function editedPoints(w: Wire, d: Drag): Pt[] {
  if (d.kind === 'wirePoint') return dragWirePoint(w.points, d.index, d.to);
  if (d.kind === 'wireSeg') return dragWireSegment(w.points, d.index, d.delta);
  return w.points;
}

function elementBounds(e: Element, project: Project) {
  if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') {
    const xs = e.points.map(p => p.x), ys = e.points.map(p => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  if (e.kind === 'text') return textBounds(e);
  if (e.kind === 'zone' || e.kind === 'image') return { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h };
  const sym = getSymbol(e.symbolId, project);
  return sym ? instanceBounds(e, sym) : { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
}

/** Maniglia della larghezza di un testo: a metà del lato destro del riquadro */
function textHandle(t: TextItem): Pt {
  const b = textBounds(t);
  return { x: b.x1 + 0.5, y: (b.y0 + b.y1) / 2 };
}

/** Tutti i punti "agganciabili" della pagina: punti di connessione e vertici dei fili */
function snapTargets(page: Page, project: Project): Pt[] {
  const out: Pt[] = [];
  for (const e of page.elements) {
    if (e.kind === 'symbol') {
      const sym = getSymbol(e.symbolId, project);
      if (sym) out.push(...pinsWorld(e, sym));
    } else if (e.kind === 'wire') out.push(...e.points);
  }
  return out;
}

/** Punto del filo più vicino al clic (sul millimetro), dove andrà il morsetto */
function nearestOnWire(w: Wire, p: Pt): Pt {
  let best = w.points[0], d = Infinity;
  for (let i = 0; i < w.points.length - 1; i++) {
    const a = w.points[i], b = w.points[i + 1];
    const q = Math.abs(a.x - b.x) < 0.01
      ? { x: a.x, y: Math.min(Math.max(Math.round(p.y), Math.min(a.y, b.y)), Math.max(a.y, b.y)) }
      : { x: Math.min(Math.max(Math.round(p.x), Math.min(a.x, b.x)), Math.max(a.x, b.x)), y: a.y };
    const dq = Math.hypot(q.x - p.x, q.y - p.y);
    if (dq < d) { d = dq; best = q; }
  }
  return best;
}

/** Punto b portato sulla stessa riga o colonna di a (la direzione più lunga) */
function straight(a: Pt, b: Pt): Pt {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}

/** Percorso ortogonale a L dall'ultimo punto al cursore */
function lPath(a: Pt, b: Pt, horizontalFirst: boolean): Pt[] {
  if (a.x === b.x || a.y === b.y) return [b];
  return horizontalFirst ? [{ x: b.x, y: a.y }, b] : [{ x: a.x, y: b.y }, b];
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && samePt(out[out.length - 1], p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (collinear) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/** Anteprima di una macro: simboli e fili nel colore di selezione */
export function MacroGhost({ clip, width = 0.35 }: { clip: { elements: Element[]; symbols: { id: string }[] }; width?: number }) {
  const project = useStore(s => s.project);
  return (
    <g stroke={SEL} color={SEL} strokeWidth={width} fill="none">
      {clip.elements.map(e => {
        if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') return <polyline key={e.id} points={e.points.map(p => `${p.x},${p.y}`).join(' ')} />;
        if (e.kind === 'text') return <text key={e.id} x={e.x} y={e.y} fontSize={e.size} fill={SEL} stroke="none">{e.text}</text>;
        if (e.kind === 'zone' || e.kind === 'image') return <rect key={e.id} x={e.x} y={e.y} width={e.w} height={e.h} strokeDasharray="2 1" />;
        const sym = getSymbol(e.symbolId, project) ?? (clip.symbols as SymbolDef[]).find(s => s.id === e.symbolId);
        return sym ? <g key={e.id} transform={`translate(${e.x} ${e.y}) rotate(${e.rot})${e.mirror ? ' scale(-1 1)' : ''}`}><SymbolGraphic sym={sym} /></g> : null;
      })}
    </g>
  );
}

export function Canvas({ derived }: { derived: Derived }) {
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const selection = useStore(s => s.selection);
  const tool = useStore(s => s.tool);
  const highlight = useStore(s => s.highlight);
  const sheet = useStore(s => s.sheet);
  const gridMode = useStore(s => s.gridMode);
  const objectSnap = useStore(s => s.objectSnap);
  const minimap = useStore(s => s.minimap);
  const dark = useDarkTheme();
  const sheetDark = sheet === 'dark' || (sheet === 'auto' && dark);
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  const pageIndex = project.pages.indexOf(page);
  /** Punti I/O PLC sulla riga fissa delle impostazioni (se c'è), solo nelle pagine di schema */
  const placeAt = (p: Pt): Pt => {
    if (tool.kind !== 'place' || page?.type !== 'multiline') return p;
    const sym = getSymbol(tool.symbolId, project);
    return sym && sym.role === 'plc' && (sym.io || sym.plcGroup) ? plcSlot(settingsOf(project), p, sym.io) ?? p : p;
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>({ x: -10, y: -10, w: PAGE_W + 20, h: PAGE_H + 20 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mouse, setMouse] = useState<Pt>({ x: 0, y: 0 });
  const [wirePts, setWirePts] = useState<Pt[]>([]);
  const [hFirst, setHFirst] = useState(true);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [radial, setRadial] = useState<Menu | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | undefined>();
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Dopo il clic che ha aperto il menu: React aggiorna subito durante quel clic, che arriverebbe
    // ancora alla finestra e chiuderebbe il menu appena aperto
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('keydown', onKey);
      window.addEventListener('blur', close);
    }, 0);
    return () => { clearTimeout(t); window.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', close); };
  }, [menu]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const oneImage = selection.length === 1 ? page.elements.find((e): e is ImageItem => e.id === selection[0] && e.kind === 'image') : undefined;
  const oneZone = selection.length === 1 ? page.elements.find((e): e is Zone => e.id === selection[0] && e.kind === 'zone') : undefined;
  const oneCable = selection.length === 1 ? page.elements.find((e): e is CableLine => e.id === selection[0] && e.kind === 'cable') : undefined;
  /** Maniglia del riquadro o estremo della linea del cavo selezionati sotto il cursore */
  const handleAt = (p: Pt, tol: number): { zone: ZoneHandle } | { end: 0 | 1 } | undefined => {
    const h = oneZone && zoneHandles(oneZone).find(([, q]) => Math.hypot(q.x - p.x, q.y - p.y) < tol * 1.5);
    if (h) return { zone: h[0] };
    const i = oneCable ? oneCable.points.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < tol * 1.5) : -1;
    return i === 0 || i === 1 ? { end: i } : undefined;
  };
  const oneText = selection.length === 1 ? page.elements.find(e => e.id === selection[0] && e.kind === 'text' && !e.rot) as TextItem | undefined : undefined;
  const targets = useMemo(() => {
    // Anche i punti di connessione degli schermi dei cavi: un filo da lì al morsetto PE collega lo schermo
    const marks = derived.pages.get(page.id)?.cableMarks;
    const shields = page.elements.flatMap(e => {
      const m = e.kind === 'cable' ? marks?.get(e.id) : undefined;
      const to = e.kind === 'cable' ? m?.shieldLead : undefined;
      return to ? [to] : [];
    });
    return [...snapTargets(page, project), ...shields];
  }, [page, project, derived]);

  const toPage = useCallback((cx: number, cy: number): Pt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const scale = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = vb.x - (r.width * scale - vb.w) / 2;
    const oy = vb.y - (r.height * scale - vb.h) / 2;
    return { x: ox + (cx - r.left) * scale, y: oy + (cy - r.top) * scale };
  }, [vb]);

  const pxPerMm = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? Math.min(r.width / vb.w, r.height / vb.h) : 2;
  };

  /** Aggancio: punto di connessione/vertice entro 2 mm, altrimenti griglia */
  const snapSmart = (p: Pt): Pt => {
    let best: Pt | undefined; let bd = objectSnap ? 2 : 0;
    for (const t of targets) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } }
    return best ?? snapPt(p);
  };

  /** Come snapSmart ma senza agganciarsi ai vertici del filo che si sta modificando */
  const snapSmartExcept = (p: Pt, wireId: string): Pt => {
    const own = page.elements.find(e => e.id === wireId) as Wire | undefined;
    let best: Pt | undefined; let bd = objectSnap ? 2 : 0;
    for (const t of targets) {
      if (own?.points.some(q => q === t)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; }
    }
    return best ?? snapPt(p);
  };

  // Pagina intera; con la barra «Strumenti sul disegno» visibile si lascia sopra la pagina lo spazio
  // della barra, così il bordo alto (per esempio la barra +24V) resta raggiungibile con il mouse
  const fit = useCallback(() => {
    const W = PAGE_W + 20, H = PAGE_H + 20;
    const r = svgRef.current?.getBoundingClientRect();
    const bar = document.querySelector('.active-bar')?.getBoundingClientRect();
    const need = r && bar && bar.height > 0 ? bar.bottom - r.top + 6 : 0;
    let m = 0;
    if (r && r.width > 0 && r.height > 0 && need > 0) {
      for (let i = 0; i < 4; i++) {
        const s = Math.min(r.width / W, r.height / (H + m));
        const top = (r.height - (H + m) * s) / 2 + (10 + m) * s; // px tra il bordo dello schema e la pagina
        if (top >= need - 0.5) break;
        m += (need - top) / s;
      }
    }
    setVb({ x: -10, y: -10 - m, w: W, h: H + m });
  }, []);
  // Zoom per la barra di stato (100% = pagina intera) e zoom scelto da lì, attorno al centro
  useEffect(() => { useStore.setState({ zoom: Math.round(((PAGE_W + 20) / vb.w) * 100) }); }, [vb]);
  useEffect(() => () => useStore.setState({ zoom: null }), []);
  useEffect(() => {
    const z = (ev: Event) => {
      const pct = (ev as CustomEvent<number>).detail;
      if (!(pct > 0)) return;
      setVb(v => {
        const w = Math.min(2000, Math.max(20, (PAGE_W + 20) / (pct / 100)));
        const h = v.h * (w / v.w);
        return { x: v.x + v.w / 2 - w / 2, y: v.y + v.h / 2 - h / 2, w, h };
      });
    };
    window.addEventListener('elettrocad:setZoom', z);
    return () => window.removeEventListener('elettrocad:setZoom', z);
  }, []);
  useEffect(() => { fit(); }, [pageId, fit]);
  useEffect(() => { setWirePts([]); }, [tool, pageId]);
  useEffect(() => {
    const h = () => fit();
    // Zoom su una zona della pagina in mm (usato dai collegamenti dell'help e dalle foto del manuale)
    const z = (ev: Event) => { const r = (ev as CustomEvent<ViewBox>).detail; if (r) setVb(r); };
    window.addEventListener('elettrocad:fit', h);
    window.addEventListener('elettrocad:zoom', z);
    return () => { window.removeEventListener('elettrocad:fit', h); window.removeEventListener('elettrocad:zoom', z); };
  }, [fit]);

  // Zoom con la rotella attorno al cursore (listener non passivo per poter bloccare lo scroll)
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = toPage(ev.clientX, ev.clientY);
      const k = Math.exp(ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
      setVb(v => {
        const w = Math.min(2000, Math.max(20, v.w * k));
        const h = v.h * (w / v.w);
        return { x: p.x - (p.x - v.x) * (w / v.w), y: p.y - (p.y - v.y) * (h / v.h), w, h };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toPage]);

  const finishWire = (pts: Pt[]) => {
    const clean = simplify(pts);
    if (clean.length >= 2) {
      const st = useStore.getState();
      const before = new Set(st.project.pages.flatMap(pg => pg.elements).filter(e => e.kind === 'wire').map(e => e.id));
      const bundle = tool.kind === 'wire' && tool.bundle;
      const w = st.addWire(clean, tool.kind === 'wire' ? tool.bus : undefined, bundle ? '' : undefined);
      // Modalità BUS: nome del bus, o conduttore dei fili che vi entrano
      if (bundle) void chooseBundleName(w.id);
      else void chooseNewTaps(before);
    }
    setWirePts([]);
  };

  const isConnectionPoint = (p: Pt): boolean => {
    if (targets.some(t => samePt(t, p))) return true;
    return page.elements.some(e => e.kind === 'wire' && e.points.some((q, i) => i < e.points.length - 1 && onSegmentInterior(p, q, e.points[i + 1])));
  };

  const onMouseDown = (ev: React.MouseEvent) => {
    const st = useStore.getState();
    const raw = toPage(ev.clientX, ev.clientY);
    if (ev.button === 1 || (ev.button === 0 && ev.altKey)) {
      setDrag({ kind: 'pan', startClient: { x: ev.clientX, y: ev.clientY }, startVb: vb });
      return;
    }
    if (tool.kind === 'terminalRow' && ev.button === 0) {
      // Ctrl/Cmd+clic su un filo: lo aggiunge (in coda, per l'ordine dei numeri) o lo toglie
      if (ev.ctrlKey || ev.metaKey) {
        const w = hitTest(page, project, raw, Math.max(0.8, 6 / pxPerMm()));
        if (w?.kind === 'wire') {
          const picks = tool.picks.some(x => x.wireId === w.id) ? tool.picks.filter(x => x.wireId !== w.id) : [...tool.picks, { wireId: w.id, at: nearestOnWire(w, raw) }];
          st.setTool({ ...tool, picks });
        }
        return;
      }
      // Linea attraverso i fili (due clic): si aggiungono tutti quelli attraversati, nell'ordine della linea
      const p = snapPt(raw, 1);
      if (!wirePts.length) { setWirePts([p]); return; }
      const q = straight(wirePts[0], p);
      const add = crossedWires(page, { points: [wirePts[0], q] }).filter(c => !c.wire.bus && c.wire.bundle === undefined && !tool.picks.some(x => x.wireId === c.wire.id));
      st.setTool({ ...tool, picks: [...tool.picks, ...add.map(c => ({ wireId: c.wire.id, at: c.at }))] });
      setWirePts([]);
      return;
    }
    if (tool.kind === 'terminalRow' && ev.button === 2 && tool.picks.length) {
      // Tasto destro: inserisce i morsetti sui fili scelti
      void confirmTerminalRow(tool.picks, tool.strip);
      return;
    }
    // Su Mac ctrl+clic vale come tasto destro (trackpad senza clic secondario)
    if (ev.button === 2 || (MAC && ev.button === 0 && ev.ctrlKey)) {
      // Tasto destro: chiude il filo in corso (o lo annulla se ha un solo punto), altrimenti torna alla selezione
      if (tool.kind === 'wire' && wirePts.length) finishWire(wirePts);
      else if (tool.kind !== 'select') st.setTool({ kind: 'select' });
      else {
        // Menu contestuale: l'elemento sotto il cursore viene selezionato se non lo è già
        const label = wireLabelAt(ev.target);
        const hit = label ? page.elements.find(e => e.id === label.wireId) : hitTest(page, project, raw, Math.max(0.8, 6 / pxPerMm()));
        if (hit && !selSet.has(hit.id)) st.setSelection([hit.id]);
        // Pagina di una lista: il tasto destro fuori dagli elementi aggiunti apre «Personalizza la lista»
        if (!hit && isListPage(page) && st.openListStyleOf(page)) return;
        if (st.radialMenu) setRadial({ cx: ev.clientX, cy: ev.clientY, at: raw, label });
        else setMenu({ cx: ev.clientX, cy: ev.clientY, at: raw, label });
      }
      return;
    }
    if (tool.kind === 'quickWire') {
      if (!st.quickWire(raw, tool.axis)) st.logMsg(tool.axis === 'v' ? tx('Nessun punto di connessione sopra o sotto il clic') : tx('Nessun punto di connessione a sinistra o a destra del clic'), 'warn');
      return;
    }
    if (tool.kind === 'paste') {
      st.paste(raw);
      return;
    }
    if (tool.kind === 'place' && tool.pairOf) { st.placeRepresentation(tool.pairOf, placeAt(snapPt(raw)), tool.rot); return; }
    if (tool.kind === 'place') {
      const p = placeAt(snapPt(raw));
      const inst = st.placeSymbol(tool.symbolId, p, tool.rot, tool.partNr, tool.tag);
      // Rimando: si sceglie subito il corrispondente libero
      const role = inst && getSymbol(inst.symbolId, st.project)?.role;
      if (role === 'link') void chooseLinkPartner(inst!.id);
      // Contatto: si sceglie la bobina o l'apparecchio a cui appartiene
      if (role === 'aux' && !tool.tag) void chooseAuxDevice(inst!.id);
      return;
    }
    if (tool.kind === 'text') {
      const at = snapPt(raw);
      st.setTool({ kind: 'select' });
      // Testo nuovo: si scrive nell'editor completo (righe a capo, grassetto, elenchi…)
      void editRichText({ text: '', size: 3 }).then(r => {
        if (!r?.text.trim()) return;
        const id = uid('t');
        st.addElements([{ kind: 'text', id, x: at.x, y: at.y, text: r.text, size: r.size, ...(r.w ? { w: r.w } : {}), ...(r.align ? { align: r.align } : {}) }]);
        st.setSelection([id]);
      });
      return;
    }
    if (tool.kind === 'macro') {
      st.placeMacro(tool.macroId, snapPt(raw));
      return;
    }
    if (tool.kind === 'zone') {
      const p = snapPt(raw);
      if (!wirePts.length) { setWirePts([p]); return; }
      const a = wirePts[0];
      if (Math.abs(p.x - a.x) >= 8 && Math.abs(p.y - a.y) >= 8) st.addZone(Math.min(a.x, p.x), Math.min(a.y, p.y), Math.abs(p.x - a.x), Math.abs(p.y - a.y));
      setWirePts([]);
      return;
    }
    if (tool.kind === 'wireLabels') {
      // Due clic: la linea resta orizzontale o verticale, i numeri dei fili attraversati vanno lì
      const p = snapPt(raw, 1);
      if (!wirePts.length) { setWirePts([p]); return; }
      const a = wirePts[0], q = straight(a, p);
      const n = st.wireLabelsOnLine(a, q);
      if (!n) st.logMsg(tx('La linea non attraversa fili con il numero'), 'warn');
      setWirePts([]);
      return;
    }
    if (tool.kind === 'cable') {
      const p = snapPt(raw);
      if (!wirePts.length) { setWirePts([p]); return; }
      if (!samePt(p, wirePts[0])) void addCableLineAsk(wirePts[0], p);
      setWirePts([]);
      return;
    }
    if (tool.kind === 'wiredef') {
      const p = snapPt(raw, 1);
      if (!wirePts.length) { setWirePts([p]); return; }
      if (!samePt(p, wirePts[0])) st.addWireDef(wirePts[0], p);
      setWirePts([]);
      return;
    }
    if (tool.kind === 'wire') {
      let p = snapSmart(raw);
      if (!wirePts.length) { setWirePts([p]); return; }
      const last = wirePts[wirePts.length - 1];
      // Arrivando su un filo esistente il tratto prosegue dritto fino al filo (giunzione a T)
      const landing = !targets.some(t => samePt(t, p)) ? landOnWire(page, last, raw, Math.max(1.5, 8 / pxPerMm())) : undefined;
      if (landing) p = landing;
      const pts = [...wirePts, ...lPath(last, p, hFirst)];
      if (isConnectionPoint(p) && !samePt(p, wirePts[0])) finishWire(pts);
      else setWirePts(simplify(pts));
      return;
    }
    // Clic su un rimando ("/2.4"): si va alla pagina e si seleziona l'elemento collegato
    const ref = (ev.target as SVGElement).closest?.('[data-goto]');
    if (ref && !ev.shiftKey) {
      const target = project.pages.find(pg => pg.name === ref.getAttribute('data-goto'));
      if (target) {
        const id = ref.getAttribute('data-goto-id');
        st.setPage(target.id);
        st.setSelection(id ? [id] : []);
        return;
      }
    }
    // Bordo di una colonna nell'intestazione di una pagina di lista: si trascina per la larghezza
    const rc = (ev.target as globalThis.Element | null)?.closest?.('[data-repcol]');
    if (rc && page.type === 'report' && page.report) {
      setDrag({ kind: 'repCol', key: rc.getAttribute('data-repcol-key')!, x0: parseFloat(rc.getAttribute('data-repcol-x')!), to: raw });
      return;
    }
    // Scritta del riquadro di luogo: si trascina, il righino la lega al bordo
    const zl = (ev.target as globalThis.Element | null)?.closest?.('[data-zonelabel]')?.getAttribute('data-zonelabel');
    if (zl && !ev.shiftKey) {
      st.setSelection([zl]);
      setDrag({ kind: 'zoneLabel', zoneId: zl, start: raw, to: raw });
      return;
    }
    // Maniglie del riquadro selezionato ed estremi della linea del cavo selezionata
    const hd = !ev.shiftKey ? handleAt(raw, Math.max(0.8, 6 / pxPerMm())) : undefined;
    if (hd && 'zone' in hd) { setDrag({ kind: 'zoneSize', zoneId: oneZone!.id, handle: hd.zone, to: raw }); return; }
    if (hd && 'end' in hd) { setDrag({ kind: 'cableEnd', lineId: oneCable!.id, index: hd.end, to: oneCable!.points[hd.end] }); return; }
    // Testi della linea del cavo: si trascinano (spostamento salvato sulla linea)
    const cbl = (ev.target as globalThis.Element | null)?.closest?.('[data-cablabel]')?.getAttribute('data-cablabel');
    if (cbl && !ev.shiftKey) {
      st.setSelection([cbl]);
      setDrag({ kind: 'cabLabel', lineId: cbl, start: raw, to: raw });
      return;
    }
    // Scritta della linea di definizione dei fili: si trascina, il righino la segue
    const wdl = (ev.target as globalThis.Element | null)?.closest?.('[data-wdlabel]')?.getAttribute('data-wdlabel');
    if (wdl && !ev.shiftKey) {
      st.setSelection([wdl]);
      setDrag({ kind: 'wdLabel', defId: wdl, start: raw, to: raw });
      return;
    }
    // Testi dei simboli (sigla, descrizione, dati tecnici…): si trascinano dove si vuole
    const dt = devTextAt(ev.target);
    if (dt && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
      if (!selSet.has(dt.instId)) st.setSelection([dt.instId]);
      setDrag({ kind: 'devText', ...dt, start: raw, to: raw });
      return;
    }
    // Numero filo: si trascina dove si vuole
    const label = wireLabelAt(ev.target);
    if (label && !ev.shiftKey) {
      st.setSelection([label.wireId]);
      setDrag({ kind: 'wireLabel', ...label, start: raw, to: raw });
      return;
    }
    // Testo selezionato: la maniglia a destra cambia la larghezza del riquadro (il testo va a capo)
    const tol = Math.max(0.8, 6 / pxPerMm());
    if (oneText && !ev.shiftKey) {
      const h = textHandle(oneText);
      if (Math.hypot(raw.x - h.x, raw.y - h.y) < tol * 1.5) { setDrag({ kind: 'textW', textId: oneText.id, w: h.x - oneText.x }); return; }
    }
    if (oneImage && !ev.shiftKey && Math.hypot(raw.x - oneImage.x - oneImage.w, raw.y - oneImage.y - oneImage.h) < tol * 1.5) {
      setDrag({ kind: 'imgSize', imgId: oneImage.id, w: oneImage.w, h: oneImage.h });
      return;
    }
    // Selezione
    const hit = hitTest(page, project, raw, tol);
    // Filo singolo: si trascina un vertice (o un estremo) per allungare/accorciare, o un tratto per spostarlo
    if (hit?.kind === 'wire' && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey && (!selSet.has(hit.id) || selection.length === 1)) {
      const h = wireHandle(hit, raw, tol);
      if (h) {
        st.setSelection([hit.id]);
        setDrag(h.kind === 'point'
          ? { kind: 'wirePoint', wireId: hit.id, index: h.index, to: hit.points[h.index] }
          : { kind: 'wireSeg', wireId: hit.id, index: h.index, start: snapPt(raw), delta: { x: 0, y: 0 } });
        return;
      }
    }
    if (hit) {
      let sel = selection;
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
        sel = selSet.has(hit.id) ? selection.filter(i => i !== hit.id) : [...selection, hit.id];
      } else if (!selSet.has(hit.id)) sel = [hit.id];
      st.setSelection(sel);
      setDrag({ kind: 'move', start: snapPt(raw), offset: { x: 0, y: 0 } });
    } else {
      if (!ev.shiftKey) st.setSelection([]);
      setDrag({ kind: 'box', start: raw, end: raw });
    }
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    const raw = toPage(ev.clientX, ev.clientY);
    setMouse(raw);
    useStore.getState().setCursor(snapPt(raw));
    if (!drag) {
      // Sopra un filo: il cursore indica se si trascina un vertice o un tratto
      if (tool.kind === 'select') {
        const tol = Math.max(0.8, 6 / pxPerMm());
        const hit = hitTest(page, project, raw, tol);
        const h = hit?.kind === 'wire' ? wireHandle(hit, raw, tol) : undefined;
        const c = !h || hit?.kind !== 'wire' ? undefined : h.kind === 'point' ? 'move'
          : Math.abs(hit.points[h.index].y - hit.points[h.index + 1].y) < 0.01 ? 'ns-resize' : 'ew-resize';
        const hd = handleAt(raw, tol);
        const ZC: Record<ZoneHandle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
        const c2 = hd ? ('zone' in hd ? ZC[hd.zone] : 'move') : c;
        if (c2 !== hoverCursor) setHoverCursor(c2);
      }
      if (tool.kind === 'wire' && wirePts.length) {
        const last = wirePts[wirePts.length - 1];
        const dx = Math.abs(raw.x - last.x), dy = Math.abs(raw.y - last.y);
        // La direzione del primo tratto segue il movimento iniziale del mouse
        if (dx > 2 * getGridSize() || dy > 2 * getGridSize()) setHFirst(dx >= dy);
      }
      return;
    }
    if (drag.kind === 'pan') {
      const r = svgRef.current!.getBoundingClientRect();
      const scale = Math.max(drag.startVb.w / r.width, drag.startVb.h / r.height);
      setVb({ ...drag.startVb, x: drag.startVb.x - (ev.clientX - drag.startClient.x) * scale, y: drag.startVb.y - (ev.clientY - drag.startClient.y) * scale });
    } else if (drag.kind === 'move') {
      const p = snapPt(raw);
      setDrag({ ...drag, offset: { x: p.x - drag.start.x, y: p.y - drag.start.y } });
    } else if (drag.kind === 'box') setDrag({ ...drag, end: raw });
    else if (drag.kind === 'textW') {
      const t = page.elements.find(e => e.id === drag.textId);
      if (t?.kind === 'text') setDrag({ ...drag, w: Math.max(t.size * 2, Math.round((raw.x - t.x) * 2) / 2) });
    }
    else if (drag.kind === 'imgSize') {
      const im = page.elements.find(e => e.id === drag.imgId);
      if (im?.kind === 'image') {
        const r1 = (v: number) => Math.max(2, Math.round(v * 2) / 2);
        let w = r1(raw.x - im.x), h = r1(raw.y - im.y);
        // Proporzioni dell'immagine, salvo con Maiusc
        if (!ev.shiftKey) { const k = im.h / im.w; if (h / w > k) w = r1(h / k); else h = r1(w * k); }
        setDrag({ ...drag, w, h });
      }
    }
    else if (drag.kind === 'wireLabel' || drag.kind === 'devText' || drag.kind === 'wdLabel' || drag.kind === 'cabLabel' || drag.kind === 'zoneLabel' || drag.kind === 'repCol') setDrag({ ...drag, to: raw });
    else if (drag.kind === 'zoneSize') setDrag({ ...drag, to: snapPt(raw) });
    else if (drag.kind === 'cableEnd') {
      // La linea resta orizzontale o verticale come era (Maiusc: libera)
      const e = page.elements.find(x => x.id === drag.lineId);
      if (e?.kind === 'cable') {
        const other = e.points[1 - drag.index], p = snapPt(raw);
        const horiz = Math.abs(e.points[1].x - e.points[0].x) >= Math.abs(e.points[1].y - e.points[0].y);
        setDrag({ ...drag, to: ev.shiftKey ? p : horiz ? { x: p.x, y: other.y } : { x: other.x, y: p.y } });
      }
    }
    else if (drag.kind === 'wirePoint') {
      // Gli estremi si agganciano ai punti di connessione e ai vertici degli altri fili
      const w = page.elements.find(e => e.id === drag.wireId) as Wire | undefined;
      const isEnd = w && (drag.index === 0 || drag.index === w.points.length - 1);
      setDrag({ ...drag, to: isEnd ? snapSmartExcept(raw, drag.wireId) : snapPt(raw) });
    } else if (drag.kind === 'wireSeg') {
      const p = snapPt(raw);
      setDrag({ ...drag, delta: { x: p.x - drag.start.x, y: p.y - drag.start.y } });
    }
  };

  const onMouseUp = () => {
    const st = useStore.getState();
    if (drag?.kind === 'wirePoint' || drag?.kind === 'wireSeg') {
      const w = page.elements.find(e => e.id === drag.wireId) as Wire | undefined;
      const pts = w && editedPoints(w, drag);
      if (w && pts && (pts.length !== w.points.length || pts.some((q, i) => !samePt(q, w.points[i])))) st.setWirePoints(w.id, pts);
    }
    if (drag?.kind === 'move' && (drag.offset.x || drag.offset.y)) st.moveSelection(drag.offset.x, drag.offset.y);
    if (drag?.kind === 'textW') st.updateElement(drag.textId, { w: drag.w });
    if (drag?.kind === 'imgSize') st.updateElement(drag.imgId, { w: drag.w, h: drag.h });
    if (drag?.kind === 'devText') {
      const o = movedOffset(drag);
      if (o) st.setTextOffset(drag.instId, drag.key, o);
    }
    if (drag?.kind === 'wdLabel') { const l = wdLabelMoved(drag); if (l) st.updateElement(drag.defId, { label: l }); }
    if (drag?.kind === 'cabLabel') { const o = cabLabelMoved(drag); if (o) st.updateElement(drag.lineId, { labelOffset: o.x || o.y ? o : undefined }); }
    if (drag?.kind === 'zoneLabel') { const l = zoneLabelMoved(drag); if (l) st.updateElement(drag.zoneId, { label: l }); }
    if (drag?.kind === 'zoneSize') { const z = zoneResized(drag); if (z) st.updateElement(drag.zoneId, z); }
    if (drag?.kind === 'cableEnd') { const pts = cableEndMoved(drag); if (pts) st.updateElement(drag.lineId, { points: pts }); }
    if (drag?.kind === 'repCol' && page.report) st.setReportColumn(page.report, drag.key, { width: repColWidth(drag) });
    // Linea di definizione dei fili tirata trascinando: si rilascia sull'altro capo
    if (tool.kind === 'wiredef' && wirePts.length === 1) {
      const p = snapPt(mouse, 1);
      if (Math.hypot(p.x - wirePts[0].x, p.y - wirePts[0].y) >= 3) { st.addWireDef(wirePts[0], p); setWirePts([]); }
    }
    if (drag?.kind === 'wireLabel') {
      const moved = draggedLabel(drag);
      if (moved) st.setWireLabels(drag.wireId, moved.list);
    }
    if (drag?.kind === 'box') {
      const x0 = Math.min(drag.start.x, drag.end.x), x1 = Math.max(drag.start.x, drag.end.x);
      const y0 = Math.min(drag.start.y, drag.end.y), y1 = Math.max(drag.start.y, drag.end.y);
      if (x1 - x0 > 1 || y1 - y0 > 1) {
        // Da sinistra a destra: elementi interamente contenuti; da destra a sinistra: anche intersecati (come AutoCAD)
        const crossing = drag.end.x < drag.start.x;
        const ids = page.elements.filter(e => {
          // Fili e linee: contano i tratti, non il rettangolo che li contiene (un filo a L o a U lontano
          // dal riquadro ha un rettangolo grande che lo toccherebbe)
          if (crossing && (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef')) return polylineTouchesBox(e.points, { x0, y0, x1, y1 });
          const b = elementBounds(e, project);
          return crossing ? b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1
            : b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
        }).map(e => e.id);
        st.setSelection([...new Set([...st.selection, ...ids])]);
      }
    }
    setDrag(null);
  };

  /** Larghezza della colonna trascinata, a passi di 0,5 mm (almeno 3 mm) */
  const repColWidth = (d: Extract<Drag, { kind: 'repCol' }>) => Math.max(3, Math.round((d.to.x - d.x0) * 2) / 2);

  /** Nuova posizione della scritta della linea di definizione trascinata (undefined se non si è mossa) */
  function wdLabelMoved(d: Extract<Drag, { kind: 'wdLabel' }>): Pt | undefined {
    const e = page.elements.find(x => x.id === d.defId);
    if (e?.kind !== 'wiredef' || (d.to.x === d.start.x && d.to.y === d.start.y)) return undefined;
    const at = wireDefLabelAt(e).at, r = (v: number) => Math.round(v * 2) / 2;
    return { x: r(at.x + d.to.x - d.start.x), y: r(at.y + d.to.y - d.start.y) };
  }

  /** Nuova posizione della scritta del riquadro, rispetto al suo angolo (undefined se non si è mossa) */
  function zoneLabelMoved(d: Extract<Drag, { kind: 'zoneLabel' }>): Pt | undefined {
    const z = page.elements.find(x => x.id === d.zoneId);
    if (z?.kind !== 'zone' || (d.to.x === d.start.x && d.to.y === d.start.y)) return undefined;
    const cur = zoneLabelBox(z, '', 0, page.type !== 'network').at, r = (v: number) => Math.round(v * 2) / 2;
    return { x: r(cur.x - z.x + d.to.x - d.start.x), y: r(cur.y - z.y + d.to.y - d.start.y) };
  }

  /** Riquadro con la maniglia trascinata; la scritta spostata a mano resta dov'era sulla pagina */
  function zoneResized(d: Extract<Drag, { kind: 'zoneSize' }>): Partial<Zone> | undefined {
    const z = page.elements.find(x => x.id === d.zoneId);
    if (z?.kind !== 'zone') return undefined;
    const n = resizeZone(z, d.handle, d.to);
    if (n.x === z.x && n.y === z.y && n.w === z.w && n.h === z.h) return undefined;
    return { ...n, ...(z.label ? { label: { x: z.label.x + z.x - n.x, y: z.label.y + z.y - n.y } } : {}) };
  }

  /** Punti della linea del cavo con l'estremo trascinato (undefined se non cambia o la linea sparisce) */
  function cableEndMoved(d: Extract<Drag, { kind: 'cableEnd' }>): [Pt, Pt] | undefined {
    const e = page.elements.find(x => x.id === d.lineId);
    if (e?.kind !== 'cable' || samePt(d.to, e.points[d.index]) || samePt(d.to, e.points[1 - d.index])) return undefined;
    return d.index === 0 ? [d.to, e.points[1]] : [e.points[0], d.to];
  }

  /** Nuovo spostamento dei testi della linea del cavo trascinati, a passi di 0,5 mm (undefined se non si sono mossi) */
  function cabLabelMoved(d: Extract<Drag, { kind: 'cabLabel' }>): Pt | undefined {
    const e = page.elements.find(x => x.id === d.lineId);
    if (e?.kind !== 'cable' || (d.to.x === d.start.x && d.to.y === d.start.y)) return undefined;
    const cur = e.labelOffset ?? { x: 0, y: 0 }, r = (v: number) => Math.round(v * 2) / 2;
    return { x: r(cur.x + d.to.x - d.start.x), y: r(cur.y + d.to.y - d.start.y) };
  }

  /** Nuovo spostamento del testo trascinato, a passi di 0,5 mm (undefined se non si è mosso) */
  function movedOffset(d: Extract<Drag, { kind: 'devText' }>): Pt | undefined {
    const inst = page.elements.find(e => e.id === d.instId);
    if (inst?.kind !== 'symbol' || (d.to.x === d.start.x && d.to.y === d.start.y)) return undefined;
    const cur = inst.textOffsets?.[d.key] ?? { x: 0, y: 0 };
    const r = (v: number) => Math.round(v * 2) / 2;
    return { x: r(cur.x + d.to.x - d.start.x), y: r(cur.y + d.to.y - d.start.y) };
  }

  /** Posizioni dei numeri del filo con quello trascinato nel nuovo punto (verso dal tratto più vicino) */
  function draggedLabel(d: Extract<Drag, { kind: 'wireLabel' }>) {
    const w = page.elements.find(e => e.id === d.wireId);
    const cur = derived.pages.get(page.id)?.wireLabelPos?.get(d.wireId) ?? [];
    const i = Math.max(0, d.index);
    if (w?.kind !== 'wire' || !cur[i] || (d.to.x === d.start.x && d.to.y === d.start.y)) return undefined;
    const p = labelNear(w.points, { x: cur[i].x + d.to.x - d.start.x, y: cur[i].y + d.to.y - d.start.y }, w.labelSize ?? derived.pages.get(page.id)?.textStyles?.wireNo.size);
    return p ? { list: cur.map((q, k) => (k === i ? p : q)), i } : undefined;
  }

  const onDoubleClick = (ev: React.MouseEvent) => {
    if (tool.kind === 'wire' && wirePts.length >= 2) finishWire(wirePts);
    // Doppio clic su un testo: si apre l'editor del testo; su un simbolo, un filo, un rimando…
    // la finestra delle sue proprietà; sul cartiglio quella della pagina
    if (tool.kind === 'select') {
      const pt = toPage(ev.clientX, ev.clientY);
      const hit = hitTest(page, project, pt, Math.max(0.8, 6 / pxPerMm()));
      const st = useStore.getState();
      if (hit?.kind === 'text') void openTextEditor(hit);
      else if (hit) {
        // Un simbolo di un gruppo I/O: resta selezionato il gruppo intero
        if (!st.selection.includes(hit.id)) st.setSelection([hit.id]);
        openPropsDialog();
      } else if (pt.x >= TB_AREA.x && pt.x <= TB_AREA.x + TB_AREA.w && pt.y >= TB_AREA.y && pt.y <= TB_AREA.y + TB_AREA.h) {
        st.setSelection([]);
        st.setTreeSel({ type: 'page', id: page.id });
        openPropsDialog();
      }
    }
  };

  // Tasti specifici dell'area di disegno
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (ev.key === 'Escape') {
        if (tool.kind === 'wire' && wirePts.length >= 2) finishWire(wirePts);
        else if (wirePts.length) setWirePts([]);
        else if (tool.kind === 'terminalRow' && tool.picks.length) useStore.getState().setTool({ ...tool, picks: [] });
        else useStore.getState().setTool({ kind: 'select' });
      }
      if ((ev.key === 'r' || ev.key === 'R') && !ev.metaKey && !ev.ctrlKey && tool.kind === 'place') {
        useStore.getState().setTool({ ...tool, rot: nextRot(getSymbol(tool.symbolId, useStore.getState().project), fitRot(getSymbol(tool.symbolId, useStore.getState().project), tool.rot)) });
        ev.stopImmediatePropagation();
      }
      if (ev.key === 'Enter' && tool.kind === 'wire' && wirePts.length >= 2) finishWire(wirePts);
      if (ev.key === 'Enter' && tool.kind === 'terminalRow') { ev.preventDefault(); void confirmTerminalRow(tool.picks, tool.strip); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const cursor = snapPt(mouse);
  let smart = tool.kind === 'wire' ? snapSmart(mouse) : cursor;
  if (tool.kind === 'wire' && wirePts.length && !targets.some(t => samePt(t, smart))) smart = landOnWire(page, wirePts[wirePts.length - 1], mouse, Math.max(1.5, 8 / pxPerMm())) ?? smart;
  // Anteprima: durante lo spostamento i fili collegati seguono; durante la modifica il filo cambia percorso
  const shown = useMemo(() => {
    if (drag?.kind === 'move' && (drag.offset.x || drag.offset.y)) {
      const pg = structuredClone(page);
      moveWithWires(project, pg, selSet, drag.offset.x, drag.offset.y);
      return pg;
    }
    if (drag?.kind === 'wirePoint' || drag?.kind === 'wireSeg') {
      return { ...page, elements: page.elements.map(e => (e.kind === 'wire' && e.id === drag.wireId ? { ...e, points: editedPoints(e, drag) } : e)) };
    }
    if (drag?.kind === 'devText') {
      const o = movedOffset(drag);
      if (o) return { ...page, elements: page.elements.map(e => (e.id === drag.instId && e.kind === 'symbol' ? { ...e, textOffsets: { ...e.textOffsets, [drag.key]: o } } : e)) };
    }
    if (drag?.kind === 'textW') return { ...page, elements: page.elements.map(e => (e.id === drag.textId && e.kind === 'text' ? { ...e, w: drag.w } : e)) };
    if (drag?.kind === 'wdLabel') {
      const l = wdLabelMoved(drag);
      if (l) return { ...page, elements: page.elements.map(e => (e.id === drag.defId && e.kind === 'wiredef' ? { ...e, label: l } : e)) };
    }
    if (drag?.kind === 'cabLabel') {
      const o = cabLabelMoved(drag);
      if (o) return { ...page, elements: page.elements.map(e => (e.id === drag.lineId && e.kind === 'cable' ? { ...e, labelOffset: o } : e)) };
    }
    if (drag?.kind === 'zoneLabel' || drag?.kind === 'zoneSize') {
      const patch = drag.kind === 'zoneLabel' ? (l => l && { label: l })(zoneLabelMoved(drag)) : zoneResized(drag);
      if (patch) return { ...page, elements: page.elements.map(e => (e.id === drag.zoneId && e.kind === 'zone' ? { ...e, ...patch } : e)) };
    }
    if (drag?.kind === 'cableEnd') {
      const pts = cableEndMoved(drag);
      if (pts) return { ...page, elements: page.elements.map(e => (e.id === drag.lineId && e.kind === 'cable' ? { ...e, points: pts } : e)) };
    }
    if (drag?.kind === 'imgSize') return { ...page, elements: page.elements.map(e => (e.id === drag.imgId && e.kind === 'image' ? { ...e, w: drag.w, h: drag.h } : e)) };
    return page;
  }, [drag, page, project, selSet]);
  const shownText = selection.length === 1 ? shown.elements.find(e => e.id === selection[0] && e.kind === 'text' && !e.rot) as TextItem | undefined : undefined;
  const shownImage = selection.length === 1 ? shown.elements.find((e): e is ImageItem => e.id === selection[0] && e.kind === 'image') : undefined;
  const oneWire = selection.length === 1 ? shown.elements.find(e => e.id === selection[0] && e.kind === 'wire') as Wire | undefined : undefined;
  const ghostSym = tool.kind === 'place' ? getSymbol(tool.symbolId, project) : undefined;
  const ghostAt = ghostSym ? placeAt(cursor) : cursor;
  const pd = derived.pages.get(page.id)!;
  const potential = useMemo(() => (highlight ? potentialOf(project, derived.netlist, highlight) : undefined), [highlight, project, derived]);
  const r = svgRef.current?.getBoundingClientRect();
  const showGrid = r && gridMode !== 'off' ? vb.w / r.width < 0.6 : false;

  return (
    <>
    {menu && <ContextMenu menu={menu} derived={derived} onClose={() => setMenu(null)} />}
    {radial && <RadialMenu cx={radial.cx} cy={radial.cy} items={radialItems(derived, radial.at)} onClose={() => setRadial(null)}
      onFull={() => { setRadial(null); setMenu(radial); }} />}
    <svg
      ref={svgRef}
      className={`canvas tool-${tool.kind}${sheetDark ? ' sheet-dark' : ''}`}
      style={hoverCursor && tool.kind === 'select' ? { cursor: hoverCursor } : undefined}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => setDrag(d => (d?.kind === 'pan' ? null : d))}
      onDoubleClick={onDoubleClick}
      onContextMenu={e => e.preventDefault()}
      onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_PLACE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={e => {
        // Simbolo trascinato dalla libreria: si posa dove lo si lascia, come con il clic
        const id = e.dataTransfer.getData(DRAG_PLACE);
        if (!id) return;
        e.preventDefault();
        const st = useStore.getState();
        const sym = getSymbol(id, st.project);
        if (!sym) return;
        let p = snapPt(toPage(e.clientX, e.clientY));
        if (page?.type === 'multiline' && sym.role === 'plc' && (sym.io || sym.plcGroup)) p = plcSlot(settingsOf(st.project), p, sym.io) ?? p;
        const inst = st.placeSymbol(id, p, 0);
        if (inst) st.setSelection([inst.id]);
        if (inst && sym.role === 'link') void chooseLinkPartner(inst.id);
        if (inst && sym.role === 'aux') void chooseAuxDevice(inst.id);
      }}
    >
      <defs>
        <pattern id="grid" width={getGridSize()} height={getGridSize()} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={0.18} fill="#b9c0c8" />
        </pattern>
      </defs>
      <rect x={-2000} y={-2000} width={5000} height={5000} fill="var(--canvas-bg)" />
      <rect x={1.5} y={1.5} width={PAGE_W} height={PAGE_H} fill="rgba(0,0,0,.18)" />
      <PageContent project={project} page={shown} pageIndex={pageIndex} derived={pd} selection={selSet} />
      {potential && (
        <g pointerEvents="none" opacity={0.55}>
          {shown.elements.map(e => e.kind === 'wire' && potential.wireIds.has(e.id) && (
            <polyline key={e.id} points={e.points.map(q => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#ff8c00" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {potential.pins.filter(q => q.pageId === page.id).map((q, i) => <circle key={i} cx={q.pos.x} cy={q.pos.y} r={1.1} fill="#ff8c00" />)}
        </g>
      )}
      {oneWire && tool.kind === 'select' && (
        <g pointerEvents="none">
          {oneWire.points.map((q, i) => <rect key={i} x={q.x - 0.9} y={q.y - 0.9} width={1.8} height={1.8} fill="#fff" stroke={SEL} strokeWidth={0.25} />)}
        </g>
      )}
      {shownText && tool.kind === 'select' && (() => {
        // Riquadro del testo e maniglia per allargarlo o stringerlo
        const b = textBounds(shownText), h = textHandle(shownText);
        return (
          <g pointerEvents="none">
            {shownText.w && <rect x={b.x0 - 0.5} y={b.y0 - 0.5} width={b.x1 - b.x0 + 1} height={b.y1 - b.y0 + 1} fill="none" stroke={SEL} strokeWidth={0.15} strokeDasharray="1 0.6" />}
            <rect x={h.x - 0.9} y={h.y - 0.9} width={1.8} height={1.8} fill="#fff" stroke={SEL} strokeWidth={0.25} />
          </g>
        );
      })()}
      {tool.kind === 'select' && (() => {
        // Maniglie del riquadro di luogo (angoli e lati) e degli estremi della linea del cavo
        const z = oneZone && shown.elements.find((e): e is Zone => e.id === oneZone.id && e.kind === 'zone');
        const c = oneCable && shown.elements.find((e): e is CableLine => e.id === oneCable.id && e.kind === 'cable');
        const pts = z ? zoneHandles(z).map(([, q]) => q) : c ? c.points : [];
        return pts.length > 0 && (
          <g pointerEvents="none">
            {pts.map((q, i) => <rect key={i} x={q.x - 0.9} y={q.y - 0.9} width={1.8} height={1.8} fill="#fff" stroke={SEL} strokeWidth={0.25} />)}
          </g>
        );
      })()}
      {shownImage && tool.kind === 'select' && (
        <rect pointerEvents="none" x={shownImage.x + shownImage.w - 0.9} y={shownImage.y + shownImage.h - 0.9} width={1.8} height={1.8} fill="#fff" stroke={SEL} strokeWidth={0.25} />
      )}
      {showGrid && <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="url(#grid)" pointerEvents="none" />}

      {ghostSym && tool.kind === 'place' && (
        <g transform={`translate(${ghostAt.x} ${ghostAt.y}) rotate(${fitRot(ghostSym, tool.rot)})`} stroke={SEL} color={SEL} strokeWidth={0.35} fill="none" opacity={0.7}>
          <SymbolGraphic sym={ghostSym} />
          {ghostSym.pins.map(p => <circle key={p.id} cx={p.x} cy={p.y} r={0.6} fill={SEL} />)}
        </g>
      )}

      {tool.kind === 'wire' && (
        <g pointerEvents="none">
          {wirePts.length > 0 && (
            <polyline points={[...wirePts, ...lPath(wirePts[wirePts.length - 1], smart, hFirst)].map(p => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={SEL} strokeWidth={0.4} strokeDasharray="1.5 1" />
          )}
          {targets.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={0.5} fill="none" stroke="#2da44e" strokeWidth={0.2} />)}
          <circle cx={smart.x} cy={smart.y} r={1.2} fill="none" stroke={SEL} strokeWidth={0.3} />
        </g>
      )}

      {tool.kind === 'quickWire' && (() => {
        // Anteprima del filo che si crea con il clic
        const q = quickWirePath(project, page, mouse, tool.axis);
        return q && (
          <g pointerEvents="none">
            <polyline points={q.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={SEL} strokeWidth={0.4} strokeDasharray="1.5 1" />
            {q.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.2} fill="none" stroke={SEL} strokeWidth={0.3} />)}
          </g>
        );
      })()}
      {tool.kind === 'paste' && (() => {
        const clip = useStore.getState().clipboard;
        if (!clip) return null;
        const off = pasteOffset(clip, mouse);
        return (
          <g pointerEvents="none" transform={`translate(${off.x} ${off.y})`} opacity={0.6}>
            <MacroGhost clip={clip} />
          </g>
        );
      })()}
      {tool.kind === 'macro' && (() => {
        const m = useStore.getState().macros.find(x => x.id === tool.macroId);
        return m && (
          <g pointerEvents="none" transform={`translate(${cursor.x - m.clip.origin.x} ${cursor.y - m.clip.origin.y})`} opacity={0.6}>
            <MacroGhost clip={m.clip} />
          </g>
        );
      })()}
      {tool.kind === 'zone' && wirePts.length > 0 && (
        <rect x={Math.min(wirePts[0].x, cursor.x)} y={Math.min(wirePts[0].y, cursor.y)} width={Math.abs(cursor.x - wirePts[0].x)} height={Math.abs(cursor.y - wirePts[0].y)}
          fill="none" stroke={SEL} strokeWidth={0.4} strokeDasharray="4 1 1 1" pointerEvents="none" />
      )}
      {tool.kind === 'wireLabels' && wirePts.length > 0 && (() => {
        const q = straight(wirePts[0], snapPt(mouse, 1));
        return <line x1={wirePts[0].x} y1={wirePts[0].y} x2={q.x} y2={q.y} stroke="#0b5cad" strokeWidth={0.3} strokeDasharray="1.2 0.8" pointerEvents="none" />;
      })()}
      {tool.kind === 'wiredef' && wirePts.length > 0 && (
        <line x1={wirePts[0].x} y1={wirePts[0].y} x2={snapPt(mouse, 1).x} y2={snapPt(mouse, 1).y} stroke={SEL} strokeWidth={0.3} pointerEvents="none" />
      )}
      {tool.kind === 'terminalRow' && wirePts.length > 0 && (() => {
        const q = straight(wirePts[0], snapPt(mouse, 1));
        return <line x1={wirePts[0].x} y1={wirePts[0].y} x2={q.x} y2={q.y} stroke={SEL} strokeWidth={0.35} strokeDasharray="1.2 0.8" pointerEvents="none" />;
      })()}
      {tool.kind === 'terminalRow' && tool.picks.map((pk, i) => (
        <g key={pk.wireId} pointerEvents="none">
          <circle cx={pk.at.x} cy={pk.at.y} r={1.9} fill={SEL} opacity={0.85} />
          <text x={pk.at.x} y={pk.at.y + 0.8} fontSize={2.2} textAnchor="middle" fill="#fff" fontWeight={700}>{i + 1}</text>
        </g>
      ))}
      {tool.kind === 'cable' && wirePts.length > 0 && (
        <line x1={wirePts[0].x} y1={wirePts[0].y} x2={cursor.x} y2={cursor.y} stroke={SEL} strokeWidth={0.35} strokeDasharray="3 0.8 0.6 0.8" pointerEvents="none" />
      )}
      {drag?.kind === 'wireLabel' && (() => {
        const m = draggedLabel(drag);
        const text = derived.pages.get(page.id)?.wireNumbers.get(drag.wireId);
        if (!m || !text) return null;
        const p = m.list[m.i];
        const w = page.elements.find(e => e.id === drag.wireId);
        const size = (w?.kind === 'wire' ? w.labelSize : undefined) ?? derived.pages.get(page.id)?.textStyles?.wireNo.size ?? 1.8;
        return <text x={p.x} y={p.y} fontSize={size} fill={SEL} textAnchor="middle" pointerEvents="none" transform={p.vertical ? `rotate(-90 ${p.x} ${p.y})` : undefined}>{text}</text>;
      })()}
      {drag?.kind === 'repCol' && (() => {
        const x = drag.x0 + repColWidth(drag);
        return (
          <g pointerEvents="none">
            <line x1={x} y1={18} x2={x} y2={250} stroke={SEL} strokeWidth={0.3} strokeDasharray="1 0.6" />
            <text x={x + 1} y={22} fontSize={2.6} fill={SEL}>{repColWidth(drag).toLocaleString()} mm</text>
          </g>
        );
      })()}
      {drag?.kind === 'box' && (
        <rect
          x={Math.min(drag.start.x, drag.end.x)} y={Math.min(drag.start.y, drag.end.y)}
          width={Math.abs(drag.end.x - drag.start.x)} height={Math.abs(drag.end.y - drag.start.y)}
          fill={drag.end.x < drag.start.x ? 'rgba(46,160,67,.08)' : 'rgba(31,111,235,.08)'}
          stroke={drag.end.x < drag.start.x ? '#2da44e' : SEL} strokeWidth={0.25}
          strokeDasharray={drag.end.x < drag.start.x ? '1 0.6' : undefined}
        />
      )}
    </svg>
    {minimap && r && vb.w < (PAGE_W + 20) / 1.4 && (() => {
      // Parte della pagina a video (il disegno riempie la finestra mantenendo le proporzioni)
      const scale = Math.max(vb.w / r.width, vb.h / r.height);
      const view = { x: vb.x - (r.width * scale - vb.w) / 2, y: vb.y - (r.height * scale - vb.h) / 2, w: r.width * scale, h: r.height * scale };
      return <Minimap project={project} page={shown} index={pageIndex} pd={pd} view={view} onMove={c => setVb(v => ({ ...v, x: c.x - v.w / 2, y: c.y - v.h / 2 }))} />;
    })()}
    </>
  );
}
