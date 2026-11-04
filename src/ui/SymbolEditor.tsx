// Editor dei componenti: a sinistra gli oggetti da aggiungere (grafica, punti di connessione con il
// loro tipo, testi del componente), al centro il disegno, a destra le proprietà. «Salva» aggiorna il
// simbolo e tutti i componenti dello schema che lo usano; «Salva come…» crea un simbolo nuovo, solo
// nella libreria. Lo stesso editor modifica i cartigli: grafica, testi con segnaposto e area del logo.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { FieldKey, IoKind, Prim, PinDef, PinDir, PinKind, Pt, SymbolDef, SymField, SymbolRole, TitleBlockTemplate, WireLineType, PinLabelPos, TextMoveKey, TextPlace } from '../model/types';
import { WIRE_LINE_TYPES, WIRE_WIDTHS, WIRE_WIDTH_DEFAULT, primLineType, textsUnderTag } from '../model/types';
import { DEVICE_LINE_KEYS } from '../model/visibility';
import { PrimSvg } from './PageSvg';
import { SymbolPreview } from './SymbolLibrary';
import { getGridSize, distToSegment, primBounds, pinLabelPlace, readableText, toWorld } from '../model/geometry';
import { placeableTexts, textPlace } from '../model/symbolTexts';
import { BUILTIN_SYMBOLS } from '../model/symbols';
import { TB_AREA, TB_PLACEHOLDERS, fillTitleText, placeholderValues } from '../model/titleBlocks';
import { dxfToPrims, dxfSymbolInfo, dxfSymbolPrims } from '../io/dxfImport';
import { openFiles } from '../io/fileio';
import { ask, askText } from './Ask';
import { ALIGN_MODES } from '../model/align';
import { snapPoints, nearestSnap, type SnapPt } from '../symcad/geom';
import { trimAt, extendAt, offsetPrim, measure } from '../symcad/edit';
import { parsePoint, parseNumber, constrain, arcThrough, transformItems, cadAngle, cadCoord, CMD_ALIASES, type CmdId } from '../symcad/cad';
import { symbolToDxf } from '../symcad/dxf';
import { saveFile } from '../io/fileio';
import type { SymLayer } from '../model/types';
import { type Item, type Clip, withGroups, groupItems, explodeItems, lockItems, lockedItems, isLocked, alignItems, mirrorItems, sameItem, itemsBounds, itemsInBox, moveItems, rotateItems, scaleItems, deleteItems, copyItems, clipOrigin, rotateClip, pasteClip, symbolAsGraphic, gripsOf, moveGrip, rotateDir, midGripsOf, insertVertex, removeVertex, nearestSide } from '../model/symbolEdit';
import { tx, tn } from '../i18n/ui';
import { ROTS, allowedRots, type Rot } from '../model/rotations';

type PinTool = 'pin' | 'pin-in' | 'pin-out' | 'pin-term';
type ETool = 'select' | PinTool | 'tag' | 'logo' | `field:${FieldKey}` | CadTool;
/** Comandi di modifica del CAD dei simboli (src/symcad) */
type CadTool = 'trim' | 'extend' | 'offset' | 'measure';
/** Maniglia k dell'elemento grafico i */
type GripRef = { i: number; k: number };
/** Trascinamento in corso: spostamento della selezione, riquadro di selezione, maniglie, area del logo */
type Drag = { kind: 'move' | 'box' | 'shape'; start: Pt; cur: Pt } | { kind: 'grip'; refs: GripRef[]; start: Pt; cur: Pt };
/** Modi della maniglia calda, come in AutoCAD (Spazio passa al successivo) */
type GripMode = 'stretch' | 'move' | 'rotate' | 'scale' | 'mirror';
const GRIP_MODES: GripMode[] = ['stretch', 'move', 'rotate', 'scale', 'mirror'];
/**
 * Comando in corso dalla riga di comando o dai pulsanti: stage «select» = si scelgono gli oggetti
 * (Invio per proseguire), «points» = aspetta punti, «value» = aspetta un numero, «confirm» = Sì/No.
 * grip: maniglia calda (clic su una maniglia), che segue il mouse fino al clic successivo
 */
interface Cmd {
  id: CmdId | 'grip'; stage: 'select' | 'points' | 'value' | 'confirm'; pts: Pt[];
  grip?: { refs: GripRef[]; base: Pt; mode: GripMode; ref: number };
}
/** Pulsante premuto nel disegno, finché non si capisce se è un clic o un trascinamento */
type Press = { raw: Pt; sx: number; sy: number; hit?: Item; grip?: GripRef & Pt; mid?: GripRef & Pt; cmdDrag?: boolean };
/** Comandi di disegno: finito un elemento ne chiedono subito un altro (Invio o Esc per uscire) */
const DRAW_CMDS = new Set<string>(['line', 'pline', 'circle', 'rect', 'arc', 'ellipse']);
/** Comandi che si possono anche trascinare dal primo al secondo punto */
const DRAG_CMDS = new Set<string>(['line', 'rect', 'circle', 'ellipse', 'arc']);

/** Elementi copiati, condivisi tra un simbolo e l'altro finché l'app resta aperta */
let clipboard: Clip | null = null;

/** Testi del componente: il valore viene dal dispositivo (proprietà, articolo, struttura) */
const FIELDS: [FieldKey, string][] = [
  ['description', tn('Descrizione')], ['techData', tn('Dati tecnici')], ['manufacturer', tn('Costruttore')],
  ['typeNr', tn('Tipo')], ['orderNr', tn('Codice ordinazione')], ['partNr', tn('Articolo')],
  ['func', tn('Funzione (=)')], ['loc', tn('Luogo (+)')], ['note', tn('Note')],
  ['plcAddress', tn('Indirizzo PLC')], ['plcSymbol', tn('Variabile PLC')], ['plcComment', tn('Commento PLC')],
];
/** I testi PLC hanno senso solo nei punti I/O */
const fieldsFor = (role: SymbolRole) => FIELDS.filter(([f]) => role === 'plc' || !f.startsWith('plc'));
const fieldName = (f: FieldKey) => tx(FIELDS.find(x => x[0] === f)?.[1] ?? f);

const PIN_KINDS: [PinTool, PinKind | undefined, string, string][] = [
  ['pin', undefined, '⊙', tn('Connessione')], ['pin-in', 'in', '⇥', tn('Ingresso')],
  ['pin-out', 'out', '↦', tn('Uscita')], ['pin-term', 'terminal', '⊘', tn('Morsetto')],
];
const pinKindName = (k: PinKind | undefined) => tx(PIN_KINDS.find(x => x[1] === k)?.[3] ?? 'Connessione');
const PIN_COLOR: Record<string, string> = { generic: '#2da44e', in: '#0969da', out: '#bc4c00', terminal: '#8250df' };

/** Disegno: pulsante → comando, con l'abbreviazione da scrivere nella riga di comando */
const GRAPHIC_TOOLS: [CmdId, string, string, string][] = [
  ['line', '╱', tn('Linea'), 'L'],
  ['pline', '⌇', tn('Polilinea'), 'PL'],
  ['rect', '▭', tn('Rettangolo'), 'REC'],
  ['circle', '○', tn('Cerchio'), 'C'],
  ['ellipse', '⬭', tn('Ellisse'), 'EL'],
  ['arc', '◠', tn('Arco'), 'A'],
  ['text', 'T', tn('Testo fisso'), 'T'],
];
/** Modifica: pulsante → comando sugli elementi selezionati */
const MODIFY_CMDS: [CmdId, string, string, string][] = [
  ['move', '✥', tn('Sposta'), 'M'], ['copy', '⧉', tn('Copia'), 'CO'], ['rotate', '⟳', tn('Ruota…'), 'RO'],
  ['mirror', '⇋', tn('Specchia…'), 'MI'], ['scale', '⤢', tn('Scala…'), 'SC'],
];
const CAD_TOOLS: [CadTool, string, string, string][] = [
  ['trim', '✂', tn('Taglia'), tn('Clic sul pezzo da togliere: si taglia fino alle intersezioni più vicine')],
  ['extend', '⟼', tn('Estendi'), tn('Clic vicino all\'estremo della linea: si allunga fino al primo elemento che incontra')],
  ['offset', '∥', tn('Offset…'), tn('Copia parallela a distanza: clic sull\'elemento, poi clic dal lato in cui va la copia')],
  ['measure', '↔', tn('Misura'), tn('Clic su due punti: distanza, scarti e angolo')],
];
/** Simbolo del punto di aggancio: estremo, punto medio, centro, quadrante, intersezione, punto di connessione */
const SNAP_MARK: Record<string, string> = { end: '□', mid: '△', center: '○', quad: '◇', int: '×', pin: '⊙' };
const PRIM_NAMES: Record<Prim['t'], string> = { line: tn('Linea'), rect: tn('Rettangolo'), circle: tn('Cerchio'), text: tn('Testo'), arc: tn('Arco'), ellipse: tn('Ellisse'), poly: tn('Polilinea') };
const TB_TOOLS = new Set<string>(['line', 'rect', 'circle', 'text']);

/** Cartiglio come "simbolo" senza punti di connessione, per riusare l'editor */
const tbAsSymbol = (t: TitleBlockTemplate): SymbolDef => ({ id: t.id, name: t.name, category: '', letter: '', role: 'single', prims: t.prims, pins: [] });
const BUILTIN_IDS = new Set(BUILTIN_SYMBOLS.map(x => x.id));
/** Tipo dei dati trascinati dall'elenco dei simboli esistenti */
const DRAG_SYMBOL = 'application/x-elettrocad-symbol';
/** Orientamenti dei testi sullo schema scelti nell'editor (vista dei testi per rotazione) */
const TEXT_ROTS: [string, string][] = [['0', 'orizzontale'], ['-90', 'verticale, dal basso verso l\'alto'], ['90', 'verticale, dall\'alto verso il basso']];

const ROLES: [SymbolRole, string][] = [
  ['single', tn('Dispositivo autonomo')], ['main', tn('Principale (bobina, con contatti)')], ['aux', tn('Contatto secondario')],
  ['terminal', tn('Morsetto')], ['plc', tn('Punto I/O PLC')],
];

const round = (v: number, step: number) => Math.round(v / step) * step;
const r2 = (v: number) => Math.round(v * 100) / 100;


/** Ingombro approssimato di un testo secondo altezza e allineamento */
function textBox(x: number, y: number, s: string, h: number, anchor: 'start' | 'middle' | 'end' = 'middle', rot = 0) {
  const w = Math.max(1, s.length) * h * 0.6;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const b = { x0, x1: x0 + w, y0: y - h, y1: y };
  if (!rot) return b;
  // Testo ruotato attorno al punto di inserimento (x, y)
  const r = (rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([px, py]) => ({ x: x + (px - x) * c - (py - y) * sn, y: y + (px - x) * sn + (py - y) * c }));
  return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
}
const inBox = (q: Pt, b: { x0: number; x1: number; y0: number; y1: number }, tol: number) =>
  q.x >= b.x0 - tol && q.x <= b.x1 + tol && q.y >= b.y0 - tol && q.y <= b.y1 + tol;

function hitPrim(p: Prim, q: Pt, tol: number): boolean {
  switch (p.t) {
    case 'line': return distToSegment(q, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }) < tol;
    case 'circle': return Math.abs(Math.hypot(q.x - p.cx, q.y - p.cy) - p.r) < tol || (!!p.fill && Math.hypot(q.x - p.cx, q.y - p.cy) < p.r);
    case 'poly': {
      const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
      return pts.some((a, i) => i < pts.length - 1 && distToSegment(q, a, pts[i + 1]) < tol);
    }
    case 'text': return inBox(q, textBox(p.x, p.y, p.s, p.size ?? 2.5, p.anchor, p.rot), tol);
    case 'rect': {
      // Rettangolo vuoto: si prende sul bordo, così si possono selezionare i testi al suo interno
      if (p.fill) return q.x >= p.x - tol && q.x <= p.x + p.w + tol && q.y >= p.y - tol && q.y <= p.y + p.h + tol;
      const c = [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }];
      return c.some((a, i) => distToSegment(q, a, c[(i + 1) % 4]) < tol) || (!!p.logo && q.x >= p.x && q.x <= p.x + p.w && q.y >= p.y && q.y <= p.y + p.h);
    }
    default: return inBox(q, primBounds([p]), tol);
  }
}

/** Direzione proposta per un punto di connessione: verso il bordo più vicino della grafica */
function guessDir(p: Pt, prims: Prim[]): PinDir {
  const b = prims.length ? primBounds(prims) : { x0: 0, y0: 0, x1: 0, y1: 0 };
  const d = [['up', p.y - b.y0], ['down', b.y1 - p.y], ['left', p.x - b.x0], ['right', b.x1 - p.x]] as [PinDir, number][];
  return d.sort((a, c) => a[1] - c[1])[0][0];
}

const DIR_V: Record<PinDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Punto di connessione nell'editor: colore e segno secondo il tipo, trattino verso il filo */
function PinMark({ q, x, y, selected }: { q: PinDef; x: number; y: number; selected: boolean }) {
  const c = selected ? '#1f6feb' : PIN_COLOR[q.kind ?? 'generic'];
  const [dx, dy] = DIR_V[q.dir];
  const tip = { x: x + dx * 1.6, y: y + dy * 1.6 };
  // Freccia: verso il simbolo per gli ingressi, verso il filo per le uscite
  const arrow = (from: Pt, to: Pt) => {
    const ux = to.x - from.x, uy = to.y - from.y, l = Math.hypot(ux, uy) || 1, nx = -uy / l * 0.45, ny = ux / l * 0.45;
    const bx = to.x - ux / l * 0.8, by = to.y - uy / l * 0.8;
    return <polygon points={`${to.x},${to.y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={c} />;
  };
  return (
    <g>
      <line x1={x} y1={y} x2={tip.x} y2={tip.y} stroke={c} strokeWidth={0.25} />
      {q.kind === 'terminal'
        ? <circle cx={x} cy={y} r={0.75} fill="#fff" stroke={c} strokeWidth={0.25} />
        : <circle cx={x} cy={y} r={0.6} fill={c} />}
      {q.kind === 'in' && arrow(tip, { x, y })}
      {q.kind === 'out' && arrow({ x, y }, tip)}
      {(() => {
        // Designazione dove andrà sullo schema (automatica o nell'angolo scelto)
        const pl = pinLabelPlace({ x: 0, y: 0, rot: 0 }, { ...q, x, y }, 1.6);
        return <text x={pl.x} y={pl.y} fontSize={1.6} fill={c} textAnchor={pl.anchor === 'end' ? 'end' : undefined}>{q.label || q.id}</text>;
      })()}
    </g>
  );
}

export function SymbolEditor() {
  const symDraft = useStore(s => s.editSymbol);
  const tbDraft = useStore(s => s.editTitleBlock);
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const isTb = !!tbDraft && !symDraft;
  const draft = isTb ? tbAsSymbol(tbDraft!) : symDraft;
  const st = useStore.getState;
  const [sym, setSym] = useState<SymbolDef | null>(draft);
  const [tool, setTool] = useState<ETool>('select');
  const [sel, setSel] = useState<Item[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  /** Riga di comando: comando in corso, testo scritto, ultimi messaggi, ultimo comando (Invio lo ripete) */
  const [cmd, setCmd] = useState<Cmd | null>(null);
  const [buf, setBuf] = useState('');
  const [msgs, setMsgs] = useState<string[]>([]);
  const lastCmd = useRef<CmdId | null>(null);
  /** Precisione: orto (F8), puntamento polare (F10, passo in gradi), griglia fine (F9) */
  const [ortho, setOrtho] = useState(false);
  const [polarOn, setPolarOn] = useState(true);
  const [polarStep, setPolarStep] = useState(45);
  const [gridSnap, setGridSnap] = useState(true);
  const shift = useRef(false);
  const [press, setPress] = useState<Press | null>(null);
  /** Primo angolo del riquadro di selezione fatto con due clic (come in AutoCAD) */
  const [windowFrom, setWindowFrom] = useState<Pt | null>(null);
  /** Elementi da incollare: seguono il mouse finché non si fa clic */
  const [ghost, setGhost] = useState<Clip | null>(null);
  /** Ricerca nell'elenco dei simboli esistenti da inserire come grafica */
  const [symQ, setSymQ] = useState('');
  const symbolLibrary = useStore(s => s.symbolLibrary);
  /** Direzione scelta con R per i nuovi punti di connessione (altrimenti verso il bordo più vicino) */
  const [pinDir, setPinDir] = useState<PinDir | null>(null);
  const [vb, setVb] = useState(isTb ? { x: -5, y: -10, w: TB_AREA.w + 10, h: TB_AREA.h + 20 } : { x: -30, y: -20, w: 60, h: 50 });
  const [dirty, setDirty] = useState(false);
  /** CAD: aggancio ai punti del disegno (F3), livello attivo, misura, offset */
  const [osnap, setOsnap] = useState(true);
  const [curLayer, setCurLayer] = useState('0');
  const [meas, setMeas] = useState<{ a: Pt; b?: Pt } | null>(null);
  const [offsetDist, setOffsetDist] = useState(1);
  const [offsetSrc, setOffsetSrc] = useState<number | null>(null);
  /** Punti di aggancio calcolati una volta per versione del simbolo */
  const snapCache = useRef<{ sym: SymbolDef | null; pts: SnapPt[] }>({ sym: null, pts: [] });
  const [withData, setWithData] = useState(false);
  /** Testi sullo schema: rotazione mostrata (null = disegno del simbolo), testo trascinato e scelto */
  const [orient, setOrient] = useState<Rot | null>(null);
  const [textDrag, setTextDrag] = useState<{ key: TextMoveKey; place: TextPlace; grab: Pt; from: Pt } | null>(null);
  const [orientSel, setOrientSel] = useState<TextMoveKey | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  /** Annulla e ripeti dentro l'editor */
  const past = useRef<SymbolDef[]>([]), future = useRef<SymbolDef[]>([]), lastPush = useRef(0);
  useEffect(() => {
    setSym(draft); setDirty(false); setSel([]); setCmd(null); setOrient(null); setTextDrag(null); setBuf(''); setWindowFrom(null); setGhost(null); setTool('select');
    past.current = []; future.current = [];
    if (isTb) setVb({ x: -5, y: -10, w: TB_AREA.w + 10, h: TB_AREA.h + 20 });
    else if (draft && (draft.prims.length || draft.pins.length)) {
      // Il componente aperto riempie la vista, con un margine
      const b = primBounds([...draft.prims, ...draft.pins.map(p => ({ t: 'circle', cx: p.x, cy: p.y, r: 2 }) as Prim)]);
      const w = Math.max(24, (b.x1 - b.x0) * 1.3 + 10), h = Math.max(18, (b.y1 - b.y0) * 1.3 + 10);
      setVb({ x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w, h });
    } else setVb({ x: -30, y: -20, w: 60, h: 50 });
  }, [draft?.id, isTb]);
  const pinGrid = getGridSize();
  const fine = 0.5;

  const toLocal = (ev: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = vb.x - (r.width * scale - vb.w) / 2, oy = vb.y - (r.height * scale - vb.h) / 2;
    return { x: ox + (ev.clientX - r.left) * scale, y: oy + (ev.clientY - r.top) * scale };
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = toLocal(ev);
      const k = Math.exp(ev.deltaY * 0.0015);
      setVb(v => { const w = Math.min(isTb ? 800 : 400, Math.max(8, v.w * k)), h = v.h * (w / v.w); return { x: p.x - (p.x - v.x) * (w / v.w), y: p.y - (p.y - v.y) * (h / v.h), w, h }; });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (!sym) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      // I tasti dell'editor non arrivano allo schema
      const done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'Shift') shift.current = true;
      if (e.key === 'F3') { done(); setOsnap(o => !o); return; }
      if (e.key === 'F8') { done(); setOrtho(o => !o); return; }
      if (e.key === 'F9') { done(); setGridSnap(g => !g); return; }
      if (e.key === 'F10') { done(); setPolarOn(o => !o); return; }
      if (e.key === 'Escape') {
        done();
        if (buf) setBuf('');
        else if (orient !== null) { setOrient(null); setTextDrag(null); }
        else if (windowFrom) setWindowFrom(null);
        else if (cmd) { setCmd(null); say(tx('*Annullato*')); }
        else if (ghost) setGhost(null);
        else if (meas || offsetSrc !== null) { setMeas(null); setOffsetSrc(null); }
        else if (tool !== 'select') pick('select');
        else setSel([]);
        return;
      }
      if (mod && k === 'z') { done(); if (e.shiftKey) redo(); else undo(); return; }
      // Vista dei testi sullo schema: le frecce spostano il testo scelto, Canc lo rimette in automatico
      if (orient !== null && !mod && !buf) {
        if (orientSel && e.key.startsWith('Arrow')) {
          done();
          const p = placeOf(orientSel), d = e.shiftKey ? 2 : fine;
          if (p) setOwnPlace(orientSel, { ...p, rot: ownRot(orientSel), x: r2(p.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0)), y: r2(p.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)) });
          return;
        }
        if (orientSel && (e.key === 'Delete' || e.key === 'Backspace')) { done(); setOwnPlace(orientSel, undefined); return; }
        // R gira il testo scelto: orizzontale, verticale dal basso, verticale dall'alto
        if (orientSel && k === 'r') {
          done();
          const p = placeOf(orientSel);
          if (p) { const order = TEXT_ROTS.map(x => Number(x[0])), i = order.indexOf(p.rot ?? 0); setOwnPlace(orientSel, { ...p, rot: order[(i + 1) % order.length] }); }
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow')) { done(); return; }
      }
      if (mod && k === 'y') { done(); redo(); return; }
      if (mod && k === 'a') { done(); setTool('select'); setSel(itemsInBox(sym, { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, true)); return; }
      if (mod && k === 'c') { done(); copy(); return; }
      if (mod && k === 'x') { done(); copy(); remove(); return; }
      if (mod && k === 'v') { done(); startPaste(); return; }
      if (mod && k === 'd') { done(); copy(); startPaste(); return; }
      if (mod && k === 'g') { done(); if (e.shiftKey) explode(); else group(); return; }
      if (mod && k === 'l') { done(); if (e.shiftKey) unlock(); else lock(); return; }
      if (mod || e.altKey) return;
      // Invio e Spazio: eseguono il testo scritto; senza testo confermano o ripetono l'ultimo comando
      if (e.key === 'Enter' || e.key === ' ') {
        done();
        if (buf.trim()) execBuffer();
        else if (e.key === ' ' && cmd?.id === 'grip') cycleGrip();
        else if (cmd) cmdEnter();
        else if (lastCmd.current) startCmd(lastCmd.current);
        return;
      }
      if (e.key === 'Backspace') { done(); if (buf) setBuf(b => b.slice(0, -1)); else remove(); return; }
      if (e.key === 'Delete') { done(); if (cmd?.id === 'grip') removeHotVertex(); else remove(); return; }
      // R ruota i punti di connessione da inserire e gli elementi da incollare
      if (k === 'r' && !buf && (ghost || PIN_KINDS.some(x => x[0] === tool))) { done(); rotate(); return; }
      if (!buf && !cmd && sel.length && e.key.startsWith('Arrow')) {
        done();
        const d = e.shiftKey || sel.some(it => it.kind === 'pin') ? pinGrid : fine;
        apply(moveItems(sym, sel, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0));
        return;
      }
      // Tutto il resto va nella riga di comando
      if (e.key.length === 1) { done(); setBuf(b => b + e.key); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') shift.current = false; };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); };
  });

  if (!sym) return <div className="pad muted">{tx('Nessun simbolo in modifica.')}</div>;
  const fields = sym.fields ?? [];
  // Livelli: «0» c'è sempre; quelli nascosti non si vedono, quelli bloccati non si selezionano
  const layerOf = (q: Prim) => q.layer ?? '0';
  const layerList: SymLayer[] = [
    (sym.layers ?? []).find(l => l.name === '0') ?? { name: '0' },
    ...(sym.layers ?? []).filter(l => l.name !== '0'),
    ...[...new Set(sym.prims.map(layerOf))].filter(n => n !== '0' && !(sym.layers ?? []).some(l => l.name === n)).map(name => ({ name })),
  ];
  const layerInfo = (n: string) => layerList.find(l => l.name === n) ?? { name: n };
  const visiblePrim = (i: number) => !layerInfo(layerOf(sym.prims[i])).hidden;
  const pickable = (i: number) => visiblePrim(i) && !layerInfo(layerOf(sym.prims[i])).locked;
  /** Nuova primitiva sul livello attivo */
  const onLayer = <T extends Prim>(q: T): T => (curLayer === '0' ? q : { ...q, layer: curLayer });
  if (snapCache.current.sym !== sym) snapCache.current = { sym, pts: snapPoints(sym.prims.filter((_, i) => visiblePrim(i)), sym.pins) };
  /** Millimetri del disegno per pixel: tolleranze e maniglie della stessa misura sullo schermo a ogni zoom */
  const upp = () => { const r = svgRef.current?.getBoundingClientRect(); return r?.width ? Math.max(vb.w / r.width, vb.h / r.height) : vb.w / 800; };
  /** Ci si aggancia ai punti del disegno mentre si danno punti a un comando o si trascina una maniglia */
  const snapping = osnap && (!!cmd && (cmd.stage === 'points' || cmd.id === 'grip') || tool === 'measure' || tool === 'logo' || drag?.kind === 'grip' || drag?.kind === 'shape');
  /** Punto base di orto e polare: l'ultimo punto dato al comando, o la maniglia che si sta spostando */
  const basePt = (): Pt | undefined => {
    if (cmd?.id === 'grip') return cmd.grip!.base;
    if (drag?.kind === 'grip') return drag.start;
    if (cmd?.stage === 'points' && cmd.pts.length && cmd.id !== 'rect' && cmd.id !== 'ellipse') return cmd.pts[cmd.pts.length - 1];
    return undefined;
  };
  /** Punto di aggancio vicino; mai la maniglia stessa che si sposta (altrimenti resterebbe incollata lì) */
  const snapHit = (raw: Pt | null): SnapPt | undefined => {
    if (!raw || !snapping) return undefined;
    const ex = cmd?.id === 'grip' ? cmd.grip!.base : drag?.kind === 'grip' ? drag.start : undefined;
    const pts = ex ? snapCache.current.pts.filter(q => Math.abs(q.x - ex.x) > 1e-6 || Math.abs(q.y - ex.y) > 1e-6) : snapCache.current.pts;
    return nearestSnap(pts, raw, upp() * 12);
  };
  /** Punto del mouse: agganciato a un punto del disegno, altrimenti sulla griglia fine, poi orto o polare (Maiusc inverte orto) */
  const pointAt = (raw: Pt, sh = shift.current): Pt => {
    const h = snapHit(raw);
    if (h) return { x: h.x, y: h.y };
    const g = gridSnap ? { x: round(raw.x, fine), y: round(raw.y, fine) } : { x: r2(raw.x), y: r2(raw.y) };
    return constrain(basePt(), g, ortho !== sh, polarOn ? polarStep : 0).p;
  };
  const snapPt = (raw: Pt): Pt => pointAt(raw);
  /** Nuova versione del simbolo; le modifiche ravvicinate (es. digitando) sono un passo solo di annullamento */
  const apply = (next: SymbolDef) => {
    const now = Date.now();
    if (now - lastPush.current > 600 || !past.current.length) past.current = [...past.current.slice(-99), sym];
    lastPush.current = now;
    future.current = [];
    setSym(next); setDirty(true);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(sym); lastPush.current = 0;
    setSym(prev); setSel([]); setDirty(true);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(sym); lastPush.current = 0;
    setSym(next); setSel([]); setDirty(true);
  };
  const update = (patch: Partial<SymbolDef>) => apply({ ...sym, ...patch });
  // Elementi bloccati: nessuna modifica; nei gruppi la forma resta com'è (si esplode per cambiarla)
  const setPrim = (i: number, p: Prim) => { const o = sym.prims[i]; if (o?.lock || o?.g) return; update({ prims: sym.prims.map((x, k) => (k === i ? p : x)) }); };
  const setPin = (i: number, p: PinDef) => { if (sym.pins[i]?.lock) return; update({ pins: sym.pins.map((x, k) => (k === i ? p : x)) }); };
  const setField = (i: number, f: SymField) => update({ fields: fields.map((x, k) => (k === i ? f : x)) });
  const remove = () => { if (sel.length) { apply(deleteItems(sym, sel)); setSel([]); } };
  const copy = () => {
    const c = copyItems(sym, sel);
    if (c.prims.length || c.pins.length) clipboard = c;
  };
  const startPaste = () => { if (clipboard) { setTool('select'); setGhost(clipboard); setSel([]); } };
  const rotate = () => {
    if (ghost) setGhost(rotateClip(ghost, pinGrid));
    else if (PIN_KINDS.some(x => x[0] === tool)) setPinDir(d => rotateDir(d ?? (hover ? guessDir(hover, sym.prims) : 'up')));
    else if (sel.length) apply(rotateItems(sym, sel, pinGrid));
  };
  /** Ingrandisce o rimpicciolisce la selezione rispetto al suo angolo in alto a sinistra */
  const scaleSel = async () => {
    if (!sel.length) return;
    const r = await ask(tx('Scala della selezione'), [{ label: tx('Fattore (2 = doppio, 0,5 = metà)'), value: '1' }]);
    const k = r ? parseFloat(r[0].replace(',', '.')) : NaN;
    if (!(k > 0) || k === 1) return;
    const b = itemsBounds(sym, sel);
    apply(scaleItems(sym, sel, k, { x: round(b.x0, fine), y: round(b.y0, fine) }, pinGrid));
  };
  /** Mostra tutto il disegno del simbolo, con un margine */
  const fitView = (s: SymbolDef) => {
    if (!s.prims.length && !s.pins.length) return;
    const b = primBounds([...s.prims, ...s.pins.map(p => ({ t: 'circle', cx: p.x, cy: p.y, r: 2 }) as Prim)]);
    const w = Math.min(400, Math.max(24, (b.x1 - b.x0) * 1.2 + 10)), h = Math.max(18, (b.y1 - b.y0) * 1.2 + 10);
    setVb({ x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w, h });
  };
  /**
   * Grafica di un simbolo da un DXF (es. salvato dall'EPLAN Data Portal): si sceglie la scala, poi
   * si tolgono le parti che non servono e si aggiungono i punti di connessione
   */
  const importSymbolDxf = async () => {
    const [f] = await openFiles([{ name: 'Disegno DXF', extensions: ['dxf'] }]);
    if (!f) return;
    const text = new TextDecoder().decode(f.data);
    const info = dxfSymbolInfo(text);
    if (!info.count) { st().logMsg(tx('{0}: nessun elemento grafico leggibile (serve un DXF in formato testo)', f.name)); return; }
    // Disegno grande (es. vista quotata): scala proposta per stare in circa 40 mm
    const big = Math.max(info.width, info.height);
    const proposal = big > 100 ? String(Number((40 / big).toPrecision(2))).replace('.', ',') : '1';
    const r = await ask(tx('Importa {0}', f.name), [
      { label: tx('Scala: 1 = dimensioni reali (disegno {0} × {1} mm, {2} elementi{3})', String(info.width).replace('.', ','), String(info.height).replace('.', ','), info.count, info.units ? `, ${tx('unità')} ${info.units}` : `, ${tx('unità non indicata: mm')}`), value: proposal },
      ...(sym.prims.length ? [{ label: tx('Grafica attuale del simbolo'), value: 'add', options: [{ value: 'add', label: tx('mantieni e aggiungi il disegno') }, { value: 'replace', label: tx('sostituisci con il disegno') }] }] : []),
    ]);
    if (!r) return;
    const k = parseFloat(r[0].replace(',', '.'));
    if (!(k > 0)) { st().logMsg(tx('Scala non valida: {0}', r[0]), 'warn'); return; }
    const prims = dxfSymbolPrims(text, k);
    const keep = r[1] === 'replace' ? [] : sym.prims;
    const next = { ...sym, prims: [...keep, ...prims] };
    apply(next);
    setTool('select');
    // Il disegno importato resta selezionato: si sposta, si scala o si elimina subito
    setSel(prims.map((_, i) => ({ kind: 'prim' as const, i: keep.length + i })));
    fitView(next);
    st().logMsg(tx('{0}: {1} elementi importati in scala {2}. Togli le parti che non servono e aggiungi i punti di connessione.', f.name, prims.length, String(k).replace('.', ',')));
    if (prims.length > 400) st().logMsg(tx('Il disegno ha molti elementi: per un simbolo di schema conviene tenere solo il contorno.'), 'warn');
  };
  /** Vista dei testi sullo schema per la rotazione r, o il disegno (null) */
  const showOrient = (r: Rot | null) => { setOrient(r); setOrientSel(null); setTextDrag(null); setSel([]); setCmd(null); setBuf(''); setWindowFrom(null); setGhost(null); };
  const pick = (t: ETool) => {
    // Uno strumento di disegno riporta al disegno
    setOrient(null); setOrientSel(null); setTextDrag(null);
    setTool(t); setCmd(null); setBuf(''); setWindowFrom(null); setGhost(null); setMeas(null); setOffsetSrc(null);
    if (t !== 'select') setSel([]);
    if (!t.startsWith('pin')) setPinDir(null);
  };
  /** Specchia la selezione: 'h' da sinistra a destra, 'v' dall'alto in basso */
  const mirror = (axis: 'h' | 'v') => { if (sel.length) apply(mirrorItems(sym, sel, axis, pinGrid)); };
  // ——— Gruppi e blocco ———
  const selPrimIdx = sel.flatMap(it => (it.kind === 'prim' && sym.prims[it.i] ? [it.i] : []));
  const canGroup = withGroups(sym, sel).filter(it => it.kind === 'prim').length >= 2 && new Set(selPrimIdx.map(i => sym.prims[i].g ?? `#${i}`)).size > 1;
  const canExplode = selPrimIdx.some(i => sym.prims[i].g);
  const canLock = sel.some(it => (it.kind === 'prim' || it.kind === 'pin') && !isLocked(sym, it));
  const anyLocked = sym.prims.some(p => p.lock) || sym.pins.some(q => q.lock);
  const group = () => { if (canGroup) { const r = groupItems(sym, sel); apply(r); setSel(withGroups(r, sel)); say(tx('Raggruppati: si selezionano e si spostano insieme finché non si esplodono')); } };
  const explode = () => { if (canExplode) { apply(explodeItems(sym, sel)); say(tx('Gruppo esploso: gli elementi si modificano uno per uno')); } };
  const lock = () => { if (canLock) { apply(lockItems(sym, sel, true)); say(tx('Bloccati: non si spostano e non si modificano finché non si sbloccano')); } };
  /** Sblocca la selezione; senza elementi bloccati selezionati, tutto il simbolo */
  const unlock = () => {
    const mine = sel.filter(it => isLocked(sym, it));
    const what = mine.length ? mine : lockedItems(sym);
    if (!what.length) return;
    apply(lockItems(sym, what, false));
    setSel(what);
    say(tx('Sbloccati {0} elementi', what.length));
  };
  /** Grafica e punti di connessione del simbolo in un file DXF */
  const exportDxf = async () => {
    const name = `${(sym.name || 'simbolo').replace(/[\\/:*?"<>|]+/g, '_')}.dxf`;
    const path = await saveFile(name, symbolToDxf(sym), [{ name: 'Disegno DXF', extensions: ['dxf'] }]);
    if (path) st().logMsg(tx('Simbolo esportato in DXF: {0}', path));
  };
  // Livelli: crea, rinomina, togli (gli elementi tornano sul livello «0»), mostra/nascondi, blocca, non stampare
  const setLayer = (name: string, patch: Partial<SymLayer>) => {
    const list = layerList.map(l => (l.name === name ? { ...l, ...patch } : l));
    update({ layers: list.filter(l => l.name !== '0' || l.hidden || l.locked || l.noPlot) });
  };
  const addLayer = async () => {
    const n = (await askText(tx('Nome del livello'), tx('Livello {0}', layerList.length)))?.trim();
    if (!n || layerList.some(l => l.name === n)) return;
    update({ layers: [...(sym.layers ?? []), { name: n }] });
    setCurLayer(n);
  };
  const renameLayer = async (old: string) => {
    if (old === '0') return;
    const n = (await askText(tx('Nome del livello'), old))?.trim();
    if (!n || n === old || layerList.some(l => l.name === n)) return;
    update({ layers: layerList.filter(l => l.name !== '0' || l.hidden || l.locked || l.noPlot).map(l => (l.name === old ? { ...l, name: n } : l)), prims: sym.prims.map(q => (q.layer === old ? { ...q, layer: n } : q)) });
    if (curLayer === old) setCurLayer(n);
  };
  const removeLayer = (n: string) => {
    if (n === '0') return;
    update({ layers: (sym.layers ?? []).filter(l => l.name !== n), prims: sym.prims.map(q => { if (q.layer !== n) return q; const { layer: _l, ...rest } = q; return rest as Prim; }) });
    if (curLayer === n) setCurLayer('0');
  };
  /** Sposta gli elementi grafici selezionati su un livello */
  const moveToLayer = (n: string) => update({
    prims: sym.prims.map((q, i) => {
      if (q.lock || !sel.some(it => it.kind === 'prim' && it.i === i)) return q;
      if (n === '0') { const { layer: _l, ...rest } = q; return rest as Prim; }
      return { ...q, layer: n };
    }),
  });
  /** Posizione degli elementi da incollare: il loro primo punto di connessione segue il mouse sulla griglia */
  // Simboli esistenti da inserire come grafica: quelli di base (o la loro copia modificata), della
  // libreria personale e del progetto, tranne quello in modifica
  const insertable = (() => {
    const m = new Map<string, SymbolDef>();
    const overrides = new Map(symbolLibrary.filter(x => x.replaces).map(x => [x.replaces!, x]));
    for (const b of BUILTIN_SYMBOLS) m.set(b.id, overrides.get(b.id) ?? b);
    for (const x of [...symbolLibrary, ...project.customSymbols]) if (!x.replaces && !m.has(x.id)) m.set(x.id, x);
    const q = symQ.trim().toLowerCase();
    return [...m.values()].filter(x => x.id !== sym.id && !x.hidden && x.prims.length && (!q || `${x.name} ${tx(x.name)} ${x.letter} ${x.category} ${tx(x.category)}`.toLowerCase().includes(q)));
  })();
  /** Clic su un simbolo dell'elenco: la sua grafica segue il mouse, clic per posarla */
  const startInsert = (s: SymbolDef) => { setTool('select'); setCmd(null); setSel([]); setGhost(symbolAsGraphic(s)); };
  const ghostShift = (at: Pt) => {
    const o = clipOrigin(ghost!), step = ghost!.pins.length || ghost!.origin ? pinGrid : fine;
    return { x: round(at.x, step) - o.x, y: round(at.y, step) - o.y };
  };

  const tagLabel = `-${sym.letter || '?'}1`;
  const fieldLabel = (f: SymField) => `‹${fieldName(f.f)}›`;
  const hitItem = (raw: Pt, tol: number): Item | undefined => {
    const pin = sym.pins.findIndex(q => Math.hypot(q.x - raw.x, q.y - raw.y) < tol * 1.5);
    if (pin >= 0) return { kind: 'pin', i: pin };
    const fi = fields.findIndex(f => inBox(raw, textBox(f.x, f.y, fieldLabel(f), f.size ?? 1.9, f.anchor ?? 'start', f.rot), tol));
    if (fi >= 0) return { kind: 'field', i: fi };
    if (sym.tagPos && inBox(raw, textBox(sym.tagPos.x, sym.tagPos.y, tagLabel, 2.6, 'end'), tol)) return { kind: 'tag' };
    for (let i = sym.prims.length - 1; i >= 0; i--) if (pickable(i) && hitPrim(sym.prims[i], raw, tol)) return { kind: 'prim', i };
    return undefined;
  };
  /** Primitiva sotto il mouse per i comandi del CAD (taglia, estendi, offset) */
  const hitPrimAt = (raw: Pt, tol: number) => {
    for (let i = sym.prims.length - 1; i >= 0; i--) if (pickable(i) && sym.prims[i].t !== 'text' && !sym.prims[i].lock && !sym.prims[i].g && hitPrim(sym.prims[i], raw, tol)) return i;
    return -1;
  };
  // ——— Maniglie ———
  /** Elementi grafici selezionati: le loro maniglie (fino a 400) e quelle sui lati delle polilinee */
  // Gli elementi bloccati e quelli dei gruppi non hanno maniglie: restano come sono
  const selPrims = sel.flatMap(it => (it.kind === 'prim' && sym.prims[it.i] && pickable(it.i) && !sym.prims[it.i].lock && !sym.prims[it.i].g ? [it.i] : []));
  const grips = selPrims.length <= 80 ? selPrims.flatMap(i => gripsOf(sym.prims[i]).map((q, k) => ({ i, k, x: q.x, y: q.y }))).slice(0, 400) : [];
  const mids = selPrims.length <= 80 ? selPrims.flatMap(i => midGripsOf(sym.prims[i]).map((q, k) => ({ i, k, x: q.x, y: q.y }))).slice(0, 400) : [];
  /** Maniglie nello stesso punto (estremi in comune di più elementi selezionati): si spostano insieme */
  const refsAt = (q: Pt): GripRef[] => grips.filter(g => Math.abs(g.x - q.x) < 1e-6 && Math.abs(g.y - q.y) < 1e-6).map(g => ({ i: g.i, k: g.k }));
  const stretch = (s0: SymbolDef, refs: GripRef[], q: Pt): SymbolDef => {
    const prims = [...s0.prims];
    for (const r of refs) if (prims[r.i]) prims[r.i] = moveGrip(prims[r.i], r.k, q);
    return { ...s0, prims };
  };
  /** Con dei punti di connessione nella selezione lo spostamento resta sulla loro griglia */
  const snapDelta = (d: Pt): Pt => (sel.some(it => it.kind === 'pin') ? { x: round(d.x, pinGrid), y: round(d.y, pinGrid) } : d);
  /** Risultato della maniglia calda portata nel punto q, secondo il modo (stira, sposta, ruota, scala, specchia) */
  const gripResult = (g: NonNullable<Cmd['grip']>, q: Pt): SymbolDef => {
    const d = Math.hypot(q.x - g.base.x, q.y - g.base.y);
    switch (g.mode) {
      case 'stretch': return stretch(sym, g.refs, q);
      case 'move': { const m = snapDelta({ x: q.x - g.base.x, y: q.y - g.base.y }); return moveItems(sym, sel, m.x, m.y); }
      case 'rotate': return d > 1e-6 ? transformItems(sym, sel, g.base, cadAngle(g.base, q), false, pinGrid) : sym;
      case 'scale': return d > 1e-6 ? scaleItems(sym, sel, r2(d / g.ref), g.base, pinGrid) : sym;
      case 'mirror': return d > 1e-6 ? transformItems(sym, sel, g.base, cadAngle(g.base, q), true, pinGrid) : sym;
    }
  };
  const startGrip = (g: Pt & GripRef, refs = refsAt(g)) => {
    setCmd({ id: 'grip', stage: 'points', pts: [], grip: { refs: refs.length ? refs : [{ i: g.i, k: g.k }], base: { x: g.x, y: g.y }, mode: 'stretch', ref: 1 } });
  };
  /** Spazio con la maniglia calda: modo successivo */
  const cycleGrip = () => {
    if (cmd?.id !== 'grip') return;
    const g = cmd.grip!;
    const mode = GRIP_MODES[(GRIP_MODES.indexOf(g.mode) + 1) % GRIP_MODES.length];
    const q = hover ? pointAt(hover) : g.base;
    setCmd({ ...cmd, grip: { ...g, mode, ref: Math.hypot(q.x - g.base.x, q.y - g.base.y) || 1 } });
  };
  /** Canc con la maniglia calda su un vertice di polilinea: il vertice si toglie */
  const removeHotVertex = () => {
    const r = cmd?.grip?.refs[0];
    const p = r ? sym.prims[r.i] : undefined;
    if (r && p?.t === 'poly') { const q = removeVertex(p, r.k); if (q) setPrim(r.i, q); }
    setCmd(null);
  };

  // ——— Comandi ———
  const say = (m: string) => setMsgs(ms => [...ms.slice(-3), m]);
  /** Nuovo elemento grafico sul livello attivo */
  const add = (q: Prim) => update({ prims: [...sym.prims, onLayer(q)] });
  /** Il comando di disegno ricomincia (chiede un altro elemento) */
  const again = () => setCmd(c => (c ? { ...c, pts: [] } : c));
  const rectOf = (a: Pt, b: Pt): Prim => ({ t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: r2(Math.abs(b.x - a.x)), h: r2(Math.abs(b.y - a.y)) });
  const ellipseOf = (c: Pt, b: Pt): Prim => ({ t: 'ellipse', cx: c.x, cy: c.y, rx: r2(Math.abs(b.x - c.x)) || 0.5, ry: r2(Math.abs(b.y - c.y)) || 0.5 });
  const dist = (a: Pt, b: Pt) => r2(Math.hypot(b.x - a.x, b.y - a.y));
  const startCmd = (id: CmdId) => {
    // Un comando riporta al disegno
    setOrient(null); setOrientSel(null); setTextDrag(null);
    setBuf(''); setWindowFrom(null); setGhost(null); setMeas(null); setOffsetSrc(null); setPress(null); setPinDir(null);
    if (id !== 'undo' && id !== 'redo' && id !== 'zoom') lastCmd.current = id;
    switch (id) {
      case 'undo': undo(); return;
      case 'redo': redo(); return;
      case 'zoom': fitView(sym); return;
      case 'trim': case 'extend': case 'measure': pick(id); return;
      case 'offset': setTool('select'); setCmd({ id, stage: 'value', pts: [] }); return;
      case 'erase':
        if (sel.length) { remove(); setCmd(null); } else { setTool('select'); setCmd({ id, stage: 'select', pts: [] }); }
        return;
      case 'move': case 'copy': case 'rotate': case 'scale': case 'mirror':
        setTool('select'); setCmd({ id, stage: sel.length ? 'points' : 'select', pts: [] });
        return;
      default: setTool('select'); setSel([]); setCmd({ id, stage: 'points', pts: [] });
    }
  };
  /** Polilinea con i punti dati (i punti uguali consecutivi del doppio clic si tolgono) */
  const finishPline = (closed: boolean) => {
    const pts = (cmd?.pts ?? []).filter((q, i, a) => i === 0 || q.x !== a[i - 1].x || q.y !== a[i - 1].y);
    if (pts.length >= 2) add({ t: 'poly', pts, ...(closed && pts.length >= 3 ? { closed: true } : {}) });
    again();
  };
  /** Specchio sull'asse dei due punti dati: copia (come AutoCAD, predefinito) o al posto dell'originale */
  const finishMirror = (erase: boolean) => {
    if (!cmd || cmd.pts.length < 2) return;
    const [a, b] = cmd.pts, deg = cadAngle(a, b);
    if (erase) apply(transformItems(sym, sel, a, deg, true, pinGrid));
    else { const r = pasteClip(sym, copyItems(sym, sel), 0, 0); apply(transformItems(r.sym, r.items, a, deg, true, pinGrid)); setSel(r.items); }
    setCmd(null);
  };
  /** Testo nuovo: si scrive subito nel pannello a destra */
  const addText = (p: Pt) => {
    update({ prims: [...sym.prims, onLayer<Prim>(isTb ? { t: 'text', x: p.x, y: p.y, s: 'Testo', size: 2.5, anchor: 'start' } : { t: 'text', x: p.x, y: p.y, s: 'Testo', size: 2.5, anchor: 'middle' })] });
    setSel([{ kind: 'prim', i: sym.prims.length }]);
    setTimeout(() => { textInput.current?.focus(); textInput.current?.select(); }, 0);
  };
  /** Un punto dato al comando (clic o scritto) */
  const feedPoint = (p: Pt) => {
    if (!cmd || cmd.stage !== 'points') return;
    const pts = [...cmd.pts, p], n = pts.length;
    const next = () => setCmd({ ...cmd, pts });
    switch (cmd.id) {
      case 'line':
        if (n >= 2 && (pts[n - 2].x !== p.x || pts[n - 2].y !== p.y)) add({ t: 'line', x1: pts[n - 2].x, y1: pts[n - 2].y, x2: p.x, y2: p.y });
        next(); return;
      case 'pline': next(); return;
      case 'circle': if (n === 2) { if (dist(pts[0], p) > 0) add({ t: 'circle', cx: pts[0].x, cy: pts[0].y, r: dist(pts[0], p) }); again(); } else next(); return;
      case 'rect': if (n === 2) { if (p.x !== pts[0].x && p.y !== pts[0].y) add(rectOf(pts[0], p)); again(); } else next(); return;
      case 'ellipse': if (n === 2) { add(ellipseOf(pts[0], p)); again(); } else next(); return;
      case 'arc':
        if (n === 3) { const q = arcThrough(pts[0], pts[1], p); if (q) add(q); else say(tx('I tre punti sono allineati: nessun arco')); again(); } else next();
        return;
      case 'text': addText(p); setCmd(null); return;
      case 'move': case 'copy':
        if (n < 2) { next(); return; }
        {
          const d = snapDelta({ x: p.x - pts[0].x, y: p.y - pts[0].y });
          if (cmd.id === 'move') { apply(moveItems(sym, sel, d.x, d.y)); setCmd(null); return; }
          // Copia: si possono posare altre copie dallo stesso punto base, Invio per finire
          apply(pasteClip(sym, copyItems(sym, sel), d.x, d.y).sym);
        }
        return;
      case 'rotate': if (n === 2) { apply(transformItems(sym, sel, pts[0], cadAngle(pts[0], p), false, pinGrid)); setCmd(null); } else next(); return;
      case 'scale': if (n === 2) { const k = dist(pts[0], p); if (k > 0) apply(scaleItems(sym, sel, k, pts[0], pinGrid)); setCmd(null); } else next(); return;
      case 'mirror': setCmd({ ...cmd, pts, stage: n === 2 ? 'confirm' : 'points' }); return;
      default: return;
    }
  };
  /** Invio senza testo durante un comando */
  const cmdEnter = () => {
    if (!cmd) return;
    if (cmd.id === 'grip') { setCmd(null); return; }
    if (cmd.stage === 'select') {
      if (!sel.length) { setCmd(null); return; }
      if (cmd.id === 'erase') { remove(); setCmd(null); return; }
      setCmd({ ...cmd, stage: 'points' });
      return;
    }
    if (cmd.stage === 'confirm') { finishMirror(false); return; }
    if (cmd.id === 'offset') { setCmd(null); setTool('offset'); return; }
    if (cmd.id === 'pline' && cmd.pts.length >= 2) { finishPline(false); return; }
    if ((cmd.id === 'line' || cmd.id === 'pline') && cmd.pts.length) { again(); return; }
    setCmd(null);
  };
  /** Testo della riga di comando: nome di comando, punto, numero o opzione */
  const execBuffer = () => {
    const text = buf.trim(), low = text.toLowerCase();
    setBuf('');
    const cur = hover ? pointAt(hover) : undefined;
    const bad = () => say(tx('Punto o valore non valido: {0}', text));
    if (cmd?.id === 'grip') {
      const g = cmd.grip!;
      if (g.mode === 'rotate' || g.mode === 'scale') {
        const v = parseNumber(text);
        if (v === undefined || (g.mode === 'scale' && v <= 0)) { bad(); return; }
        apply(g.mode === 'rotate' ? transformItems(sym, sel, g.base, v, false, pinGrid) : scaleItems(sym, sel, v, g.base, pinGrid));
        setCmd(null);
        return;
      }
      const p = parsePoint(text, g.base, cur);
      if (!p) { bad(); return; }
      apply(gripResult(g, p)); setCmd(null);
      return;
    }
    if (!cmd || cmd.stage === 'select') {
      // Gruppi e blocco sugli elementi selezionati
      const word: Record<string, () => void> = { g: group, group: group, raggruppa: group, x: explode, explode: explode, esplodi: explode, lock: lock, blocca: lock, unlock: unlock, sblocca: unlock };
      if (word[low]) { word[low](); return; }
      const id = CMD_ALIASES[low];
      if (id) startCmd(id); else say(tx('Comando sconosciuto: {0}', text));
      return;
    }
    if (cmd.stage === 'confirm') { finishMirror(/^(s|si|sì|y|yes)$/.test(low)); return; }
    if (cmd.id === 'offset') {
      const v = parseNumber(text);
      if (v && v > 0) { setOffsetDist(v); setCmd(null); setTool('offset'); } else bad();
      return;
    }
    const n = cmd.pts.length, last = cmd.pts[n - 1];
    const isClose = ['c', 'ch', 'chiudi', 'close'].includes(low), isUndo = ['u', 'an', 'annulla', 'undo'].includes(low);
    if (cmd.id === 'line' && n && isClose) {
      if (n >= 2) add({ t: 'line', x1: last.x, y1: last.y, x2: cmd.pts[0].x, y2: cmd.pts[0].y });
      again();
      return;
    }
    if (cmd.id === 'line' && n && isUndo) { if (n >= 2) undo(); setCmd({ ...cmd, pts: cmd.pts.slice(0, -1) }); return; }
    if (cmd.id === 'pline' && n && isClose) { finishPline(true); return; }
    if (cmd.id === 'pline' && n && isUndo) { setCmd({ ...cmd, pts: cmd.pts.slice(0, -1) }); return; }
    // Un numero solo: raggio, angolo o fattore (altrimenti distanza diretta verso il mouse)
    const v = /^[-+]?[\d.]+$/.test(text) ? parseNumber(text) : undefined;
    if (n === 1 && v !== undefined) {
      if (cmd.id === 'circle') { if (v > 0) add({ t: 'circle', cx: last.x, cy: last.y, r: v }); again(); return; }
      if (cmd.id === 'rotate') { apply(transformItems(sym, sel, last, v, false, pinGrid)); setCmd(null); return; }
      if (cmd.id === 'scale') { if (v > 0) apply(scaleItems(sym, sel, v, last, pinGrid)); setCmd(null); return; }
    }
    const p = parsePoint(text, last, cur);
    if (!p) { bad(); return; }
    feedPoint(p);
  };
  const promptText = (): string => {
    if (!cmd) return tx('Comando:');
    if (cmd.id === 'grip') {
      return ({
        stretch: tx('** STIRA ** Punto (Spazio: altro modo, Canc: togli il vertice):'), move: tx('** SPOSTA ** Punto:'),
        rotate: tx('** RUOTA ** Angolo (gradi, antiorario) o punto:'), scale: tx('** SCALA ** Fattore o punto:'),
        mirror: tx('** SPECCHIA ** Secondo punto dell\'asse:'),
      } as Record<GripMode, string>)[cmd.grip!.mode];
    }
    if (cmd.stage === 'select') return tx('Seleziona gli oggetti, poi Invio:');
    if (cmd.stage === 'confirm') return tx('Cancellare gli oggetti di origine? [Sì/No] <No>:');
    if (cmd.id === 'offset') return tx('Distanza di offset <{0}>:', String(offsetDist));
    const n = cmd.pts.length;
    switch (cmd.id) {
      case 'line': return n ? tx('Punto successivo o [Chiudi/Annulla]:') : tx('LINEA Primo punto:');
      case 'pline': return n ? tx('Punto successivo o [Chiudi/Annulla], Invio per finire:') : tx('POLILINEA Primo punto:');
      case 'circle': return n ? tx('Raggio o punto:') : tx('CERCHIO Centro:');
      case 'rect': return n ? tx('Altro angolo (anche @larghezza,altezza):') : tx('RETTANGOLO Primo angolo:');
      case 'ellipse': return n ? tx('Angolo del riquadro dei semiassi:') : tx('ELLISSE Centro:');
      case 'arc': return n === 0 ? tx('ARCO Punto iniziale:') : n === 1 ? tx('Secondo punto:') : tx('Punto finale:');
      case 'text': return tx('TESTO Punto di inserimento:');
      case 'move': case 'copy': return n ? tx('Secondo punto (o distanza):') : tx('Punto base:');
      case 'rotate': return n ? tx('Angolo di rotazione (gradi, antiorario) o punto:') : tx('Punto base:');
      case 'scale': return n ? tx('Fattore di scala o punto:') : tx('Punto base:');
      case 'mirror': return n ? tx('Secondo punto dell\'asse:') : tx('Primo punto dell\'asse di specchio:');
      default: return '';
    }
  };

  // ——— Mouse ———
  /** Riquadro di selezione da a a b: da sinistra a destra solo gli elementi tutti dentro, da destra a sinistra anche quelli toccati */
  const selectBox = (a: Pt, b: Pt) => {
    const box = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    if (box.x1 - box.x0 < upp() * 3 && box.y1 - box.y0 < upp() * 3) return;
    const found = itemsInBox(sym, box, b.x < a.x).filter(it => it.kind !== 'prim' || pickable(it.i));
    setSel(cur => [...cur, ...found.filter(f => !cur.some(x => sameItem(x, f)))]);
  };
  // ——— Testi sullo schema per ogni rotazione ———
  const inst0 = { x: 0, y: 0, rot: orient ?? 0, mirror: false } as const;
  const keyName = (k: TextMoveKey): string => k === 'tag' ? tx('Sigla') : k === 'lines' ? tx('Righe sotto la sigla') : k === 'termNum' ? tx('Numero del morsetto')
    : k === 'termStrip' ? tx('Sigla della morsettiera') : k.startsWith('pin:') ? tx('Designazione {0}', sym.pins.find(p => `pin:${p.id}` === k)?.label || k.slice(4)) : fieldName(k as FieldKey);
  const sampleText = (k: TextMoveKey): string => k === 'tag' ? tagLabel : k === 'lines' ? `‹${tx('Descrizione')}›` : k === 'termNum' ? '1' : k === 'termStrip' ? `-${sym.letter || 'X'}1`
    : k.startsWith('pin:') ? (sym.pins.find(p => `pin:${p.id}` === k)?.label || k.slice(4)) : `‹${fieldName(k as FieldKey)}›`;
  const sampleSize = (k: TextMoveKey) => (k === 'tag' ? 2.6 : k === 'termStrip' ? 2.2 : k.startsWith('pin:') ? 1.8 : fields.find(f => f.f === k)?.size ?? 1.9);
  const orientKeys = orient !== null ? placeableTexts(sym) : [];
  const ownPlaces: Partial<Record<TextMoveKey, TextPlace>> = orient !== null ? sym.orientTexts?.[orient] ?? {} : {};
  // Anteprima con l'orientamento dei testi dei morsetti scelto nelle impostazioni del progetto
  const placeOf = (k: TextMoveKey): TextPlace | undefined => (textDrag?.key === k ? textDrag.place : textPlace(inst0, sym, k, { termDir: project.settings.terminalText }));
  /** Orientamento scelto nell'editor (undefined: segue quello automatico o delle impostazioni) */
  const ownRot = (k: TextMoveKey) => ownPlaces[k]?.rot;
  /** Le righe sotto la sigla cominciano una riga più in basso del loro punto */
  const shownY = (k: TextMoveKey, p: TextPlace) => (k === 'lines' ? p.y + 2.6 : p.y);
  const setOwnPlace = (k: TextMoveKey, p: TextPlace | undefined) => {
    if (orient === null) return;
    const cur = { ...(sym.orientTexts?.[orient] ?? {}) };
    if (p) cur[k] = { x: r2(p.x), y: r2(p.y), ...(p.anchor ? { anchor: p.anchor } : {}), ...(p.rot !== undefined ? { rot: p.rot } : {}) }; else delete cur[k];
    const all = { ...(sym.orientTexts ?? {}) };
    if (Object.keys(cur).length) all[orient] = cur; else delete all[orient];
    update({ orientTexts: Object.keys(all).length ? all : undefined });
  };
  const orientHit = (raw: Pt): TextMoveKey | undefined => [...orientKeys].reverse().find(k => {
    const p = placeOf(k);
    return p && inBox(raw, textBox(p.x, shownY(k, p), sampleText(k), sampleSize(k), p.anchor ?? 'start', p.rot), upp() * 6);
  });
  const dropText = (raw: Pt) => {
    if (!textDrag) return;
    const step = gridSnap ? fine : 0.01;
    setOwnPlace(textDrag.key, { ...textDrag.place, rot: ownRot(textDrag.key), x: round(raw.x - textDrag.grab.x, step), y: round(raw.y - textDrag.grab.y, step) });
  };

  const onDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    svgRef.current?.setPointerCapture(ev.pointerId);
    const raw = toLocal(ev);
    if (orient !== null) {
      const k = orientHit(raw);
      setOrientSel(k ?? null);
      if (k) { const p = placeOf(k)!; setTextDrag({ key: k, place: p, grab: { x: raw.x - p.x, y: raw.y - p.y }, from: raw }); }
      return;
    }
    const p = pointAt(raw, ev.shiftKey);
    const tol = upp() * 8;
    const at = { raw, sx: ev.clientX, sy: ev.clientY };
    if (tool === 'measure') { setMeas(m => (!m || m.b ? { a: p } : { a: m.a, b: p })); return; }
    if (tool === 'trim' || tool === 'extend') {
      const i = hitPrimAt(raw, tol);
      if (i < 0) return;
      const r = tool === 'trim' ? trimAt(sym.prims, i, raw) : extendAt(sym.prims, i, raw);
      if (r) { apply({ ...sym, prims: r }); setSel([]); }
      else st().logMsg(tool === 'trim' ? tx('Niente da tagliare qui') : tx('La linea non incontra niente proseguendo dritta'), 'warn');
      return;
    }
    if (tool === 'offset') {
      if (offsetSrc === null) { const i = hitPrimAt(raw, tol); if (i >= 0) setOffsetSrc(i); return; }
      const q = offsetPrim(sym.prims[offsetSrc], offsetDist, raw);
      if (q) { update({ prims: [...sym.prims, q] }); setSel([{ kind: 'prim', i: sym.prims.length }]); }
      setOffsetSrc(null);
      return;
    }
    if (ghost) {
      const d = ghostShift(raw);
      const r = pasteClip(sym, ghost, d.x, d.y);
      apply(r.sym); setSel(r.items); setGhost(null);
      return;
    }
    // Maniglia calda: il clic la posa
    if (cmd?.id === 'grip') { apply(gripResult(cmd.grip!, p)); setCmd(null); return; }
    // Comando che aspetta un punto (si può anche trascinare dal primo al secondo)
    if (cmd?.stage === 'points') { feedPoint(p); setPress({ ...at, cmdDrag: true }); return; }
    if (cmd && cmd.stage !== 'select') return;
    if (tool === 'select') {
      // Secondo clic del riquadro fatto con due clic
      if (windowFrom) { selectBox(windowFrom, raw); setWindowFrom(null); return; }
      const g = grips.find(q => Math.hypot(q.x - raw.x, q.y - raw.y) < tol * 1.4);
      if (g) {
        const pr = sym.prims[g.i];
        // ⌘/Ctrl + clic sul vertice di una polilinea: il vertice si toglie
        if ((ev.ctrlKey || ev.metaKey) && pr.t === 'poly') { const r = removeVertex(pr, g.k); if (r) setPrim(g.i, r); return; }
        setPress({ ...at, grip: g });
        return;
      }
      const m = mids.find(q => Math.hypot(q.x - raw.x, q.y - raw.y) < tol * 1.2);
      if (m) { setPress({ ...at, mid: m }); return; }
      setPress({ ...at, hit: hitItem(raw, tol) });
      return;
    }
    if (tool === 'logo') { setDrag({ kind: 'shape', start: p, cur: p }); return; }
    const pk = PIN_KINDS.find(x => x[0] === tool);
    if (pk) {
      const g = { x: round(raw.x, pinGrid), y: round(raw.y, pinGrid) };
      const id = String(Math.max(0, ...sym.pins.map(x => parseInt(x.id, 10) || 0)) + 1);
      update({ pins: [...sym.pins, { id, x: g.x, y: g.y, dir: pinDir ?? guessDir(g, sym.prims), label: '', ...(pk[1] ? { kind: pk[1] } : {}) }] });
      setSel([{ kind: 'pin', i: sym.pins.length }]);
      return;
    }
    if (tool === 'tag') { update({ tagPos: p }); setSel([{ kind: 'tag' }]); setTool('select'); return; }
    if (tool.startsWith('field:')) {
      const f = tool.slice(6) as FieldKey;
      // Un solo testo per tipo: se c'è già, si sposta
      const i = fields.findIndex(x => x.f === f);
      if (i >= 0) { setField(i, { ...fields[i], x: p.x, y: p.y }); setSel([{ kind: 'field', i }]); }
      else { update({ fields: [...fields, { f, x: p.x, y: p.y, size: 1.9, anchor: 'start' }] }); setSel([{ kind: 'field', i: fields.length }]); }
      setTool('select');
    }
  };
  /** Passo dello spostamento: la griglia dei punti di connessione se ne sono coinvolti */
  const moveStep = () => (sel.some(it => it.kind === 'pin') ? pinGrid : gridSnap ? fine : 0.01);
  const dragPoint = (raw: Pt, sh?: boolean): Pt => {
    if (drag?.kind === 'box') return raw;
    if (drag?.kind === 'move') { const step = moveStep(); return { x: r2(drag.start.x + round(raw.x - drag.start.x, step)), y: r2(drag.start.y + round(raw.y - drag.start.y, step)) }; }
    return pointAt(raw, sh);
  };
  const onMove = (ev: React.PointerEvent) => {
    const raw = toLocal(ev);
    setHover(raw);
    shift.current = ev.shiftKey;
    if (textDrag) { const step = gridSnap ? fine : 0.01; setTextDrag({ ...textDrag, place: { ...textDrag.place, x: round(raw.x - textDrag.grab.x, step), y: round(raw.y - textDrag.grab.y, step) } }); return; }
    // Pulsante premuto e mouse mosso di qualche pixel: diventa un trascinamento
    if (press && !press.cmdDrag && Math.hypot(ev.clientX - press.sx, ev.clientY - press.sy) > 4) {
      setPress(null);
      if (press.grip) { const g = { x: press.grip.x, y: press.grip.y }; setDrag({ kind: 'grip', refs: refsAt(press.grip), start: g, cur: g }); return; }
      if (press.mid) {
        // Maniglia sul lato: nuovo vertice, che si trascina subito
        const pr = sym.prims[press.mid.i];
        if (pr?.t === 'poly') { const g = { x: press.mid.x, y: press.mid.y }; setPrim(press.mid.i, insertVertex(pr, press.mid.k, g)); setDrag({ kind: 'grip', refs: [{ i: press.mid.i, k: press.mid.k + 1 }], start: g, cur: g }); }
        return;
      }
      // Trascinando un elemento già selezionato lo si sposta; altrimenti è un riquadro di selezione (come AutoCAD)
      if (press.hit && isSel(press.hit)) { const s0 = { x: round(press.raw.x, moveStep()), y: round(press.raw.y, moveStep()) }; setDrag({ kind: 'move', start: s0, cur: s0 }); return; }
      if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey && !press.hit) setSel([]);
      setDrag({ kind: 'box', start: press.raw, cur: raw });
      return;
    }
    if (drag) setDrag({ ...drag, cur: dragPoint(raw, ev.shiftKey) });
  };
  const onUp = (ev: React.PointerEvent) => {
    const raw = toLocal(ev);
    if (textDrag) { if (Math.hypot(raw.x - textDrag.from.x, raw.y - textDrag.from.y) > upp() * 3) dropText(raw); setTextDrag(null); return; }
    if (press) {
      // (anche un trascinamento appena cominciato e non ancora visto da questo disegno si chiude qui)
      setPress(null); setDrag(null);
      const moved = Math.hypot(ev.clientX - press.sx, ev.clientY - press.sy) > 4;
      if (press.cmdDrag) {
        // Trascinato con uno strumento di disegno: il secondo punto è dove si rilascia
        if (moved && cmd && cmd.pts.length === 1 && DRAG_CMDS.has(cmd.id)) {
          const p = pointAt(raw, ev.shiftKey), a = cmd.pts[0];
          if (cmd.id === 'arc') { if (dist(a, p) > 0) add({ t: 'arc', cx: a.x, cy: a.y, r: dist(a, p), a0: 180, a1: 360 }); again(); }
          else { feedPoint(p); if (cmd.id === 'line') again(); }
        }
        return;
      }
      // Rilasciato dopo un movimento che lo stato non ha ancora visto (trascinamento veloce): si completa qui
      if (moved && !drag) {
        const q = pointAt(raw, ev.shiftKey);
        if (press.grip) { apply(stretch(sym, refsAt(press.grip), q)); return; }
        if (press.mid) { const pr = sym.prims[press.mid.i]; if (pr?.t === 'poly') setPrim(press.mid.i, insertVertex(pr, press.mid.k, q)); return; }
        if (press.hit && isSel(press.hit)) {
          const st0 = moveStep(), dx = r2(round(raw.x - press.raw.x, st0)), dy = r2(round(raw.y - press.raw.y, st0));
          if (dx || dy) apply(moveItems(sym, sel, dx, dy));
          return;
        }
        if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey) setSel([]);
        selectBox(press.raw, raw);
        return;
      }
      if (press.grip) { startGrip(press.grip); return; }
      if (press.mid) {
        const pr = sym.prims[press.mid.i];
        if (pr?.t === 'poly') { setPrim(press.mid.i, insertVertex(pr, press.mid.k, { x: press.mid.x, y: press.mid.y })); startGrip({ ...press.mid, k: press.mid.k + 1 }, [{ i: press.mid.i, k: press.mid.k + 1 }]); }
        return;
      }
      const add2 = ev.shiftKey || ev.metaKey || ev.ctrlKey;
      if (press.hit) {
        // Un elemento di un gruppo prende tutto il gruppo
        const hit = press.hit, already = isSel(hit), hits = withGroups(sym, [hit]);
        setSel(add2 ? (already ? sel.filter(x => !hits.some(h => sameItem(x, h))) : [...sel, ...hits.filter(h => !isSel(h))]) : hits);
        return;
      }
      // Clic nel vuoto: toglie la selezione e comincia un riquadro con due clic
      if (!add2) setSel([]);
      setWindowFrom(raw);
      return;
    }
    if (!drag) return;
    const b = dragPoint(raw, ev.shiftKey), a = drag.start;
    setDrag(null);
    if (drag.kind === 'box') { selectBox(a, raw); return; }
    if (drag.kind === 'grip') { if (b.x !== a.x || b.y !== a.y) apply(stretch(sym, drag.refs, b)); return; }
    if (drag.kind === 'move') {
      const dx = r2(b.x - a.x), dy = r2(b.y - a.y);
      if (dx || dy) apply(moveItems(sym, sel, dx, dy));
      return;
    }
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.4) return;
    const prim = shapeOf(tool, a, b);
    if (prim) { update({ prims: [...sym.prims, onLayer(prim)] }); setSel([{ kind: 'prim', i: sym.prims.length }]); }
  };
  /** Doppio clic: finisce la polilinea; su una polilinea selezionata aggiunge un vertice sul lato */
  const onDouble = (ev: React.MouseEvent) => {
    if (cmd?.id === 'pline') { finishPline(false); return; }
    if (cmd || tool !== 'select') return;
    const raw = toLocal(ev), it = hitItem(raw, upp() * 8);
    const pr = it?.kind === 'prim' ? sym.prims[it.i] : undefined;
    if (it?.kind === 'prim' && pr?.t === 'poly') {
      const side = nearestSide(pr, raw);
      setPrim(it.i, insertVertex(pr, side.k, pointAt(raw)));
      setSel([it]); setWindowFrom(null);
    }
  };

  // Anteprima del cartiglio con i dati del progetto e della pagina aperta
  const page = project.pages.find(x => x.id === pageId) ?? project.pages[0];
  const values = isTb && withData && page ? placeholderValues(project, page, project.pages.indexOf(page)) : undefined;
  const shown = (q: Prim): Prim | null => {
    if (!values || q.t !== 'text') return q;
    const s2 = fillTitleText(project, q.s, values);
    return s2 ? { ...q, s: s2 } : null;
  };
  /** Segnaposto: aggiunto al testo selezionato o come testo nuovo */
  const insertPlaceholder = (ph: string) => {
    const one = sel.length === 1 && sel[0].kind === 'prim' ? sel[0].i : -1;
    const cur = one >= 0 ? sym.prims[one] : undefined;
    if (cur?.t === 'text') { setPrim(one, { ...cur, s: cur.s === 'Testo' ? ph : `${cur.s} ${ph}`.trim() }); return; }
    update({ prims: [...sym.prims, { t: 'text', x: 5, y: TB_AREA.h / 2, s: ph, size: 2.5, anchor: 'start' }] });
    setSel([{ kind: 'prim', i: sym.prims.length }]);
    setTool('select');
  };
  const importDxf = async () => {
    const [f] = await openFiles([{ name: 'Disegno DXF', extensions: ['dxf'] }]);
    if (!f) return;
    const g = dxfToPrims(new TextDecoder().decode(f.data), TB_AREA.w, TB_AREA.h);
    if (!g.prims.length) { st().logMsg(tx('{0}: nessun elemento grafico leggibile (serve un DXF in formato testo)', f.name)); return; }
    if (sym.prims.length && !window.confirm(tx('Sostituire la grafica attuale con quella di {0}? (Annulla = aggiungi)', f.name))) update({ prims: [...sym.prims, ...g.prims] });
    else update({ prims: g.prims });
    setSel([]);
    st().logMsg(tx('{0}: {1} elementi importati, {2} × {3} mm{4}', f.name, g.prims.length, g.width, g.height, g.scale !== 1 ? ` (ridotti in scala ${g.scale.toFixed(3)} per stare nei ${TB_AREA.w} × ${TB_AREA.h} mm del cartiglio)` : ''));
  };
  // Anteprima dello spostamento, della maniglia e degli elementi da incollare
  // e del comando in corso (elemento che si sta disegnando, selezione spostata, ruotata, specchiata…)
  const cur = hover ? pointAt(hover) : null;
  const hoverSnap = snapHit(hover);
  let view: SymbolDef = sym;
  /** Elementi in costruzione, tratteggiati; rubber: linea dal punto base al mouse */
  let preview: Prim[] = [];
  let rubber: [Pt, Pt] | undefined;
  if (drag?.kind === 'move') { const m = { x: drag.cur.x - drag.start.x, y: drag.cur.y - drag.start.y }; if (m.x || m.y) view = moveItems(sym, sel, m.x, m.y); }
  else if (drag?.kind === 'grip') view = stretch(sym, drag.refs, drag.cur);
  else if (drag?.kind === 'shape') { const q = shapeOf(tool, drag.start, drag.cur); if (q) preview = [q]; }
  else if (cmd?.id === 'grip' && cur) { view = gripResult(cmd.grip!, cur); rubber = [cmd.grip!.base, cur]; }
  else if (cmd && cur && (cmd.stage === 'points' || cmd.stage === 'confirm') && cmd.pts.length) {
    const P = cmd.pts, n = P.length, q = cmd.stage === 'confirm' ? P[1] : cur, last = P[n - 1];
    switch (cmd.id) {
      case 'line': preview = [{ t: 'line', x1: last.x, y1: last.y, x2: q.x, y2: q.y }]; break;
      case 'pline': preview = [{ t: 'poly', pts: [...P, q] }]; break;
      case 'circle': preview = [{ t: 'circle', cx: P[0].x, cy: P[0].y, r: dist(P[0], q) }]; rubber = [P[0], q]; break;
      case 'rect': preview = [rectOf(P[0], q)]; break;
      case 'ellipse': preview = [ellipseOf(P[0], q)]; break;
      case 'arc': { const a = n === 2 ? arcThrough(P[0], P[1], q) : undefined; preview = a ? [a] : [{ t: 'poly', pts: [...P, q] }]; break; }
      case 'move': { const d = snapDelta({ x: q.x - P[0].x, y: q.y - P[0].y }); view = moveItems(sym, sel, d.x, d.y); rubber = [P[0], q]; break; }
      case 'copy': { const d = snapDelta({ x: q.x - P[0].x, y: q.y - P[0].y }); view = pasteClip(sym, copyItems(sym, sel), d.x, d.y).sym; rubber = [P[0], q]; break; }
      case 'rotate': if (dist(P[0], q) > 0) view = transformItems(sym, sel, P[0], cadAngle(P[0], q), false, pinGrid); rubber = [P[0], q]; break;
      case 'scale': if (dist(P[0], q) > 0.01) view = scaleItems(sym, sel, dist(P[0], q), P[0], pinGrid); rubber = [P[0], q]; break;
      case 'mirror': if (dist(P[0], q) > 0) { const r = pasteClip(sym, copyItems(sym, sel), 0, 0); view = transformItems(r.sym, r.items, P[0], cadAngle(P[0], q), true, pinGrid); } rubber = [P[0], q]; break;
    }
  }
  /** Elemento sotto il mouse, evidenziato prima del clic */
  const hoverItem = hover && orient === null && tool === 'select' && !drag && !press && !windowFrom && (!cmd || cmd.stage === 'select') ? hitItem(hover, upp() * 8) : undefined;
  const hoverGrip = hover && !drag && !cmd ? grips.find(q => Math.hypot(q.x - hover.x, q.y - hover.y) < upp() * 8.4) : undefined;
  const ghostView = ghost && hover ? (() => { const d = ghostShift(hover); return pasteClip({ ...sym, prims: [], pins: [] }, ghost, d.x, d.y).sym; })() : null;
  const isSel = (it: Item) => sel.some(x => sameItem(x, it));

  /** Unico elemento selezionato: le sue proprietà compaiono a destra */
  const one = sel.length === 1 ? sel[0] : undefined;
  /** Componenti dello schema che usano il simbolo aperto */
  const usedBy = (id: string) => project.pages.reduce((n, pg) => n + pg.elements.filter(e => e.kind === 'symbol' && e.symbolId === id).length, 0);
  const isBuiltin = BUILTIN_IDS.has(sym.id);
  const saveTb = (use: boolean) => {
    const t = st().saveTitleBlock({ id: sym.id, name: sym.name.trim() || 'Cartiglio', prims: sym.prims });
    if (use) st().useTitleBlock(t.id);
    setDirty(false);
    st().logMsg(tx('Cartiglio "{0}" salvato{1}', t.name, use ? ' e usato nel progetto' : ''));
  };
  const save = () => {
    if (!sym.pins.length && !window.confirm(tx('Il simbolo non ha punti di connessione: salvarlo comunque?'))) return;
    const n = sym.id ? usedBy(sym.id) : 0;
    const s = st().saveSymbol({ ...sym, name: sym.name.trim() || tx('Nuovo simbolo') });
    setDirty(false);
    st().logMsg(n
      ? tx('Simbolo "{0}" salvato: {1} componenti dello schema aggiornati', s.name, n)
      : tx('Simbolo "{0}" salvato nella libreria personale', s.name));
  };
  const saveAs = async () => {
    const name = (await askText(tx('Nome del nuovo simbolo'), tx('{0} (copia)', sym.name)))?.trim();
    if (!name) return;
    const s = st().saveSymbolAs(sym, name);
    setDirty(false);
    st().logMsg(tx('Simbolo "{0}" salvato nella libreria personale; lo schema non cambia', s.name));
  };
  const restore = () => {
    if (!window.confirm(tx('Togliere dalla libreria la versione modificata e tornare al simbolo di base? I componenti già nello schema non cambiano.'))) return;
    st().restoreBuiltin(sym.id);
    st().logMsg(tx('Libreria: di nuovo il simbolo di base "{0}"', sym.name));
    st().setView('schema');
  };
  const close = () => { if (!dirty || window.confirm(tx('Ci sono modifiche non salvate. Chiudere l\'editor?'))) st().setView('schema'); };

  // Griglia: 1 mm chiara, passo dei punti di connessione più scuro
  const gx0 = Math.floor(vb.x) - 2, gy0 = Math.floor(vb.y) - 2;
  const lines: React.ReactNode[] = [];
  if (vb.w < 160) {
    // La vista mantiene le proporzioni: la griglia copre anche le fasce oltre il riquadro
    const m = Math.max(vb.w, vb.h) * 1.5;
    for (let x = gx0 - Math.ceil(m); x < vb.x + vb.w + m; x++) lines.push(<line key={`x${x}`} x1={x} y1={vb.y - m} x2={x} y2={vb.y + vb.h + m} stroke={x % pinGrid === 0 ? '#c9d1d9' : '#eef1f4'} strokeWidth={0.05} />);
    for (let y = gy0 - Math.ceil(m); y < vb.y + vb.h + m; y++) lines.push(<line key={`y${y}`} x1={vb.x - m} y1={y} x2={vb.x + vb.w + m} y2={y} stroke={y % pinGrid === 0 ? '#c9d1d9' : '#eef1f4'} strokeWidth={0.05} />);
  }
  const selPrim = one?.kind === 'prim' ? sym.prims[one.i] : undefined;
  // Tipo di linea e spessore delle linee selezionate (anche più di una, es. dopo un import DXF)
  const strokeIdx = sel.flatMap(it => (it.kind === 'prim' && sym.prims[it.i] && sym.prims[it.i].t !== 'text' ? [it.i] : []));
  const strokes = strokeIdx.map(i => sym.prims[i]).filter((p): p is Exclude<Prim, { t: 'text' }> => p.t !== 'text');
  const curLt = strokes.length && strokes.every(p => primLineType(p) === primLineType(strokes[0])) ? primLineType(strokes[0]) : undefined;
  const curLw = strokes.length && strokes.every(p => p.lw === strokes[0].lw) ? (strokes[0].lw === undefined ? '' : String(strokes[0].lw)) : undefined;
  const setStroke = (patch: { lt?: WireLineType; lw?: number | null }) => update({
    prims: sym.prims.map((p, i) => {
      if (!strokeIdx.includes(i) || p.t === 'text' || p.lock) return p;
      const q = { ...p } as Exclude<Prim, { t: 'text' }> & { dash?: boolean };
      if (patch.lt) { delete q.dash; if (patch.lt === 'solid') delete q.lt; else q.lt = patch.lt; }
      if (patch.lw !== undefined) { if (patch.lw) q.lw = patch.lw; else delete q.lw; }
      return q;
    }),
  });
  const selPin = one?.kind === 'pin' ? sym.pins[one.i] : undefined;
  const selField = one?.kind === 'field' ? fields[one.i] : undefined;
  const num = (v: number | undefined, f: (n: number) => void, step = 0.5) => (
    <input type="number" step={step} value={v ?? 0} onChange={e => f(parseFloat(e.target.value) || 0)} />
  );
  const anchorSelect = (v: 'start' | 'middle' | 'end', f: (a: 'start' | 'middle' | 'end') => void) => (
    <select value={v} onChange={e => f(e.target.value as 'start' | 'middle' | 'end')}>
      <option value="start">{tx('a sinistra')}</option><option value="middle">{tx('al centro')}</option><option value="end">{tx('a destra')}</option>
    </select>
  );
  /** Orizzontale, verticale dal basso verso l'alto (-90°) o dall'alto verso il basso (90°); tasto R per girare */
  const rotSelect = (v: number | undefined, f: (r: number | undefined) => void) => (
    <select value={String(v ?? 0)} onChange={e => f(Number(e.target.value) || undefined)} title={tx('Anche con il tasto R sul testo selezionato')}>
      <option value="0">{tx('orizzontale')}</option>
      <option value="-90">{tx('verticale, dal basso verso l\'alto')}</option>
      <option value="90">{tx('verticale, dall\'alto verso il basso')}</option>
      {v === 180 && <option value="180">{tx('capovolto')}</option>}
    </select>
  );
  const toolBtn = (t: ETool, icon: string, label: string, hint?: string, done?: boolean) => (
    <button key={t} className={tool === t ? 'palette-item active' : 'palette-item'} title={hint ? tx(hint) : tx(label)} onClick={() => pick(t)}>
      <span className="palette-icon">{icon}</span><span>{tx(label)}</span>{done && <span className="palette-done">✓</span>}
    </button>
  );
  const hint = orient !== null ? tx('TESTI SULLO SCHEMA A {0}°: trascina i testi o spostali con le frecce (in blu quelli messi a mano; Canc o ↺ nel pannello: posizione automatica). Qui grafica e punti di connessione non si modificano: «Disegno», Esc, uno strumento o un comando tornano al disegno', orient)
    : ghost ? tx('Clic per incollare, R per ruotare, Esc per annullare')
    : cmd ? tx('Coordinate: x,y assolute · @dx,dy relative · @distanza<angolo · un numero = distanza verso il mouse (y verso l\'alto, decimali col punto) · Maiusc: orto')
    : tool === 'select' ? (grips.length
      ? tx('Maniglie: trascina, oppure clic e poi clic dove va (Spazio cambia modo: stira, sposta, ruota, scala, specchia); + sul lato aggiunge un vertice, ⌘/Ctrl+clic lo toglie; doppio clic sul lato aggiunge un vertice')
      : tx('Clic per selezionare (Maiusc per aggiungere o togliere); riquadro trascinando o con due clic: verso destra gli elementi interi, verso sinistra anche quelli toccati. Scrivi un comando (L, PL, C, REC, M, CO, RO, MI, SC…) e Invio'))
    : tool.startsWith('pin') ? tx('Clic sulla griglia di {0} mm; R ruota la direzione del filo', pinGrid)
    : tool === 'tag' || tool.startsWith('field:') ? tx('Clic dove va il testo nello schema')
    : tool === 'offset' ? (offsetSrc === null ? tx('Offset di {0} mm: clic sull\'elemento da copiare', String(offsetDist).replace('.', ',')) : tx('Clic dal lato in cui va la copia (Esc annulla)'))
    : tool === 'measure' && meas?.b ? (() => { const m = measure(meas.a, meas.b); return tx('Distanza {0} mm · Δx {1} · Δy {2} · angolo {3}° — clic per una nuova misura', ...[m.d, m.dx, m.dy, m.angle].map(v => String(v).replace('.', ','))); })()
    : CAD_TOOLS.some(x => x[0] === tool) ? tx(CAD_TOOLS.find(x => x[0] === tool)![3]) : '';
  const cmdBtn = ([id, icon, label, alias]: [CmdId, string, string, string]) => (
    <button key={id} className={cmd?.id === id ? 'palette-item active' : 'palette-item'} title={`${tx(label)} (${alias})`} onClick={() => startCmd(id)}>
      <span className="palette-icon">{icon}</span><span>{tx(label)}</span><span className="palette-done muted">{alias}</span>
    </button>
  );
  const z = upp();

  return (
    <div className="symbol-editor">
      <div className="parts-toolbar">
        <b className="small">{isTb ? tx('Cartiglio') : tx('Modifica del componente')}: {sym.name}</b>
        <button disabled={!past.current.length} onClick={undo} title={tx('Annulla (⌘Z)')}>↶</button>
        <button disabled={!future.current.length} onClick={redo} title={tx('Ripeti (⇧⌘Z)')}>↷</button>
        <button disabled={!sel.length} onClick={copy} title={tx('Copia gli elementi selezionati (⌘C)')}>{tx('Copia')}</button>
        <button disabled={!clipboard} onClick={startPaste} title={tx('Incolla: gli elementi seguono il mouse, clic per posarli (⌘V)')}>{tx('Incolla')}</button>
        <button disabled={!sel.length} onClick={() => { copy(); startPaste(); }} title={tx('Copia e incolla in un passo (⌘D)')}>{tx('Duplica')}</button>
        <button disabled={!sel.length && !ghost} onClick={rotate} title={tx('Ruota di 90° in senso orario (comando RO per un angolo qualsiasi)')}>{tx('Ruota')}</button>
        <button disabled={!sel.length} onClick={() => void scaleSel()} title={tx('Ingrandisce o rimpicciolisce gli elementi selezionati (comando SC)')}>{tx('Scala…')}</button>
        <button disabled={!sel.length} onClick={() => mirror('h')} title={tx('Specchia da sinistra a destra')}>⇋</button>
        <button disabled={!sel.length} onClick={() => mirror('v')} title={tx('Specchia dall\'alto in basso')}>⇵</button>
        {ALIGN_MODES.map(m => <button key={m.id} disabled={sel.length < 2} onClick={() => apply(alignItems(sym, sel, m.id))} title={`${tx(m.name)} · ${tx('un gruppo si allinea come un elemento solo')}`}>{m.icon}</button>)}
        <button disabled={!canGroup} onClick={group} title={tx('Raggruppa: gli elementi si selezionano e si spostano insieme e restano come sono finché non si esplodono (⌘G, comando G)')}>{tx('Raggruppa')}</button>
        <button disabled={!canExplode} onClick={explode} title={tx('Esplodi il gruppo: gli elementi tornano singoli (⇧⌘G, comando X)')}>{tx('Esplodi')}</button>
        <button disabled={!canLock} onClick={lock} title={tx('Blocca: non si spostano, non si modificano e non si cancellano; il riquadro di selezione li salta (⌘L)')}>{tx('Blocca')}</button>
        <button disabled={!anyLocked} onClick={unlock} title={tx('Sblocca gli elementi bloccati selezionati; senza selezione sblocca tutto il simbolo (⇧⌘L)')}>{sel.some(it => isLocked(sym, it)) ? tx('Sblocca') : tx('Sblocca tutto')}</button>
        <button disabled={!sel.length} onClick={remove} title={tx('Elimina gli elementi selezionati (Canc)')}>{tx('Elimina')}</button>
        {!isTb && <>
          <span className="seg" title={tx('Dove vanno sigla, designazioni dei punti di connessione e testi dei morsetti sullo schema per ogni rotazione del simbolo')}>
            <button className={orient === null ? 'active' : ''} onClick={() => showOrient(null)} title={tx('Disegno del simbolo: selezione, comandi e strumenti')}>{tx('Disegno')}</button>
            {allowedRots(sym).map(r => (
              <button key={r} className={orient === r ? 'active' : ''} onClick={() => showOrient(orient === r ? null : r)}
                title={tx('Testi sullo schema con il simbolo ruotato di {0}°: trascina i testi dove vanno', r)}>{tx('Testi {0}°', r)}</button>
            ))}
          </span>
        </>}
        <div className="tb-spacer" />
        {isTb ? (
          <>
            <button onClick={() => void importDxf()} title={tx('Grafica e testi da un file DXF (es. il cartiglio disegnato in AutoCAD)')}>{tx('Importa DXF…')}</button>
            <label className="small"><input type="checkbox" checked={withData} onChange={e => setWithData(e.target.checked)} /> {tx('Anteprima con i dati')}</label>
            <span className="muted small">{tx('Area')} {TB_AREA.w} × {TB_AREA.h} {tx('mm · rotella: zoom')}</span>
            <button onClick={() => saveTb(false)}>{tx('Salva')}</button>
            <button onClick={() => { saveTb(true); st().setView('schema'); }}>{tx('Salva e usa nel progetto')}</button>
          </>
        ) : (
          <>
            <button onClick={() => void importSymbolDxf()} title={tx('Grafica e testi da un file DXF (es. salvato dall\'EPLAN Data Portal), con la scala scelta')}>{tx('Importa DXF…')}</button>
            <button onClick={() => void exportDxf()} title={tx('Grafica, livelli e punti di connessione del simbolo in un file DXF')}>{tx('Esporta DXF…')}</button>
            <button onClick={save} title={tx('Stesso nome: il simbolo cambia anche in tutti i componenti dello schema che lo usano')}>{tx('Salva')}</button>
            <button onClick={() => void saveAs()} title={tx('Nome nuovo: un simbolo in più nella libreria personale; lo schema non cambia')}>{tx('Salva come…')}</button>
            {sym.replaces && st().symbolLibrary.some(x => x.id === sym.id) && (
              <button onClick={restore} title={tx('La libreria torna a mostrare il simbolo di base; i componenti già nello schema non cambiano')}>{tx('Torna al simbolo di base')}</button>
            )}
          </>
        )}
        <button onClick={close}>{tx('Chiudi')}</button>
      </div>
      <div className="symbol-editor-body">
        <div className="symbol-palette">
          <div className="palette-group">{tx('Strumenti')}</div>
          {toolBtn('select', '⬉', tn('Seleziona e sposta'))}
          <div className="palette-group">{tx('Grafica')}</div>
          {GRAPHIC_TOOLS.filter(([t]) => !isTb || TB_TOOLS.has(t)).map(cmdBtn)}
          {isTb && toolBtn('logo', '▣', tn('Area del logo'), tn('Area del logo della ditta (trascina)'))}
          <div className="palette-group">{tx('Modifica (CAD)')}</div>
          {MODIFY_CMDS.map(cmdBtn)}
          {CAD_TOOLS.map(([t, icon, label, h]) => (t === 'offset'
            ? <button key={t} className={tool === t || cmd?.id === 'offset' ? 'palette-item active' : 'palette-item'} title={tx(h)} onClick={() => startCmd('offset')}><span className="palette-icon">{icon}</span><span>{tx(label)}</span></button>
            : toolBtn(t, icon, label, h)))}
          {!isTb && <div className="palette-group">{tx('Livelli')}</div>}
          {!isTb && <div className="layer-list">
            {layerList.map(l => (
              <div key={l.name} className={`layer-row${curLayer === l.name ? ' current' : ''}`}>
                <input type="radio" checked={curLayer === l.name} onChange={() => setCurLayer(l.name)} title={tx('Livello attivo: i nuovi elementi vanno qui')} />
                <span className="layer-name" onDoubleClick={() => void renameLayer(l.name)} title={l.name === '0' ? l.name : `${l.name} — ${tx('Doppio clic per rinominare')}`}>{l.name}</span>
                <span className="muted small">{sym.prims.filter(q => layerOf(q) === l.name).length}</span>
                <button className={l.hidden ? 'off' : ''} title={l.hidden ? tx('Mostra') : tx('Nascondi nell\'editor')} onClick={() => setLayer(l.name, { hidden: !l.hidden || undefined })}>👁</button>
                <button className={l.locked ? '' : 'off'} title={l.locked ? tx('Sblocca') : tx('Blocca: gli elementi non si selezionano')} onClick={() => setLayer(l.name, { locked: !l.locked || undefined })}>🔒</button>
                <button className={l.noPlot ? 'off' : ''} title={l.noPlot ? tx('Disegnato sullo schema') : tx('Non disegnare sullo schema (es. linee di costruzione)')} onClick={() => setLayer(l.name, { noPlot: !l.noPlot || undefined })}>🖨</button>
                {l.name !== '0' && <button title={tx('Togli il livello: gli elementi vanno sul livello 0')} onClick={() => removeLayer(l.name)}>✕</button>}
              </div>
            ))}
            <button className="small" onClick={() => void addLayer()}>{tx('+ Livello')}</button>
          </div>}
          {!isTb && <>
            <div className="palette-group">{tx('Punti di connessione')}</div>
            {PIN_KINDS.map(([t, k, icon, label]) => toolBtn(t, icon, label, undefined, sym.pins.some(p => p.kind === k)))}
            <div className="palette-group">{tx('Testi del componente')}</div>
            {toolBtn('tag', '-K', tn('Sigla'), tn('Posizione della sigla'), !!sym.tagPos)}
            {fieldsFor(sym.role).map(([f, label]) => toolBtn(`field:${f}`, '‹›', label, undefined, fields.some(x => x.f === f)))}
            <p className="muted small pad">{tx('Nello schema i testi del componente mostrano i dati del dispositivo: proprietà, articolo, funzione e luogo.')}</p>
            <div className="palette-group">{tx('Simboli esistenti')}</div>
            <div className="pad-x"><input className="palette-search" value={symQ} placeholder={tx('Cerca…')} onChange={e => setSymQ(e.target.value)} /></div>
            <p className="muted small pad">{tx('Trascina un simbolo nel disegno (o clic e poi clic nel disegno): diventa grafica del nuovo simbolo, senza i suoi punti di connessione.')}</p>
            <div className="palette-symbols">
              {insertable.slice(0, 300).map(s => (
                <div key={s.id} className="palette-symbol" role="button" tabIndex={0} draggable title={`${tx(s.name)} · ${tx(s.category)}`}
                  onDragStart={e => { e.dataTransfer.setData(DRAG_SYMBOL, s.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  onClick={() => startInsert(s)} onKeyDown={e => { if (e.key === 'Enter') startInsert(s); }}>
                  <SymbolPreview sym={s} size={36} />
                  <span>{tx(s.name)}</span>
                </div>
              ))}
              {!insertable.length && <p className="muted small pad">{tx('Nessun simbolo trovato')}</p>}
            </div>
          </>}
        </div>
        <div className="symbol-center">
        <div className="symbol-canvas-wrap">
        <svg ref={svgRef} className="symbol-canvas" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble}
          onPointerLeave={() => { if (!drag && !press) setHover(null); }}
          onDragOver={e => { if (!isTb && e.dataTransfer.types.includes(DRAG_SYMBOL)) e.preventDefault(); }}
          onDrop={e => {
            // Simbolo trascinato dall'elenco: la sua origine va sulla griglia nel punto di rilascio
            const s = insertable.find(x => x.id === e.dataTransfer.getData(DRAG_SYMBOL));
            if (!s) return;
            e.preventDefault();
            const at = toLocal(e);
            const r = pasteClip(sym, symbolAsGraphic(s), round(at.x, pinGrid), round(at.y, pinGrid));
            apply(r.sym); setSel(r.items); setGhost(null); setTool('select');
          }}>
          <rect x={vb.x - 2000} y={vb.y - 2000} width={vb.w + 4000} height={vb.h + 4000} fill="#fff" />
          {lines}
          {isTb
            ? <rect x={0} y={0} width={TB_AREA.w} height={TB_AREA.h} fill="none" stroke="#8c959f" strokeWidth={0.2} strokeDasharray="1.5 1" />
            : <>
                <line x1={-3} y1={0} x2={3} y2={0} stroke="#cf222e" strokeWidth={0.1} />
                <line x1={0} y1={-3} x2={0} y2={3} stroke="#cf222e" strokeWidth={0.1} />
              </>}
          {orient !== null ? (
            <g>
              <g transform={`rotate(${orient})`} stroke="#1b1f24" color="#1b1f24" strokeWidth={0.35} fill="none" strokeLinecap="round">
                {sym.prims.map((q, i) => (q.t !== 'text' && visiblePrim(i) ? <PrimSvg key={i} p={q} /> : null))}
              </g>
              {sym.prims.map((q, i) => {
                if (q.t !== 'text' || !visiblePrim(i)) return null;
                const r = readableText(inst0, q);
                return <text key={`t${i}`} x={r.x} y={r.y} fontSize={q.size ?? 2.5} textAnchor={r.anchor} fill="#1b1f24" transform={r.rot ? `rotate(${r.rot} ${r.x} ${r.y})` : undefined}>{q.s}</text>;
              })}
              {sym.pins.map(p => { const w = toWorld(inst0, p); return <circle key={p.id} cx={w.x} cy={w.y} r={0.5} fill="#2da44e" />; })}
              {orientKeys.map(k => {
                const p = placeOf(k);
                if (!p) return null;
                const y = shownY(k, p), on = orientSel === k || textDrag?.key === k;
                // Le righe sotto la sigla girano attorno al loro punto, come sullo schema
                return <text key={k} x={p.x} y={y} fontSize={sampleSize(k)} textAnchor={p.anchor ?? 'start'} fill={on ? '#cf222e' : ownPlaces[k] ? '#1f6feb' : '#8250df'}
                  transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined} fontStyle={k === 'lines' || (!k.startsWith('pin:') && !['tag', 'termNum', 'termStrip'].includes(k)) ? 'italic' : undefined}>{sampleText(k)}</text>;
              })}
            </g>
          ) : <>
          <g stroke="#1b1f24" color="#1b1f24" strokeWidth={0.35} fill="none" strokeLinecap="round">
            {view.prims.map((p, i) => {
              const on = isSel({ kind: 'prim', i }) || offsetSrc === i;
              const pp = shown(p);
              if (!pp || layerInfo(layerOf(p)).hidden) return null;
              if (pp.t === 'rect' && pp.logo) {
                return (
                  <g key={i} stroke={on ? '#1f6feb' : '#8250df'} strokeDasharray="1 0.6">
                    <rect x={pp.x} y={pp.y} width={pp.w} height={pp.h} fill="none" strokeWidth={0.25} />
                    <text x={pp.x + pp.w / 2} y={pp.y + pp.h / 2 + 1} fontSize={3} textAnchor="middle" fill="#8250df" stroke="none">{tx('LOGO')}</text>
                  </g>
                );
              }
              // Bloccati: arancione quando sono selezionati
              const c = on ? (p.lock ? '#bc4c00' : '#1f6feb') : undefined;
              return <g key={i} stroke={c} color={c}><PrimSvg p={pp} /></g>;
            })}
            {hoverItem?.kind === 'prim' && view.prims[hoverItem.i] && !isSel(hoverItem) && (() => {
              const q = view.prims[hoverItem.i];
              return <g stroke="#58a6ff" color="#58a6ff" opacity={0.7} pointerEvents="none">{q.t === 'text' ? <PrimSvg p={q} /> : <PrimSvg p={{ ...q, lw: Math.max(q.lw ?? 0.35, z * 3.5) }} />}</g>;
            })()}
            {/* Gruppi selezionati: riquadro tratteggiato attorno a ciascuno (arancione se bloccato) */}
            {orient === null && [...new Set(sel.flatMap(it => (it.kind === 'prim' && sym.prims[it.i]?.g ? [sym.prims[it.i].g!] : [])))].map(g => {
              const its = sym.prims.flatMap((p, i) => (p.g === g ? [{ kind: 'prim' as const, i }] : []));
              const b = itemsBounds(sym, its), m = z * 6, locked = its.every(it => sym.prims[it.i].lock);
              return <rect key={`grp${g}`} x={b.x0 - m} y={b.y0 - m} width={b.x1 - b.x0 + 2 * m} height={b.y1 - b.y0 + 2 * m} fill="none"
                stroke={locked ? '#bc4c00' : '#1f6feb'} strokeWidth={z * 1.2} strokeDasharray={`${z * 6} ${z * 4}`} pointerEvents="none" />;
            })}
            {preview.map((q, i) => <g key={`pv${i}`} stroke="#1f6feb" color="#1f6feb" strokeDasharray={`${z * 5} ${z * 3}`}><PrimSvg p={q} /></g>)}
            {rubber && <line x1={rubber[0].x} y1={rubber[0].y} x2={rubber[1].x} y2={rubber[1].y} stroke="#8c959f" strokeWidth={z} strokeDasharray={`${z * 4} ${z * 3}`} />}
            {ghostView && <g stroke="#1f6feb" color="#1f6feb" opacity={0.6}>{ghostView.prims.map((p, i) => <PrimSvg key={i} p={p} />)}</g>}
          </g>
          {view.pins.map((q, i) => <PinMark key={i} q={q} x={q.x} y={q.y} selected={isSel({ kind: 'pin', i })} />)}
          {/* Punto di aggancio sotto il mouse e misura */}
          {hoverSnap && (() => {
            const h = hoverSnap, m = z * 12;
            return (
              <g pointerEvents="none">
                <rect x={h.x - m / 2} y={h.y - m / 2} width={m} height={m} fill="none" stroke="#bc4c00" strokeWidth={z * 1.5} />
                <text x={h.x + m * 0.7} y={h.y - m * 0.6} fontSize={m * 1.1} fill="#bc4c00">{SNAP_MARK[h.kind]}</text>
              </g>
            );
          })()}
          {meas && (() => {
            const b = meas.b ?? (hover ? snapPt(hover) : meas.a);
            const m = measure(meas.a, b);
            const z = vb.w / 70;
            return (
              <g pointerEvents="none" stroke="#0969da" fill="#0969da">
                <line x1={meas.a.x} y1={meas.a.y} x2={b.x} y2={b.y} strokeWidth={z / 8} strokeDasharray={`${z / 2} ${z / 3}`} />
                <circle cx={meas.a.x} cy={meas.a.y} r={z / 4} /><circle cx={b.x} cy={b.y} r={z / 4} />
                <text x={(meas.a.x + b.x) / 2} y={(meas.a.y + b.y) / 2 - z / 2} fontSize={z * 1.2} stroke="none" textAnchor="middle">{String(m.d).replace('.', ',')} mm</text>
              </g>
            );
          })()}
          {ghostView?.pins.map((q, i) => <g key={`g${i}`} opacity={0.6}><PinMark q={q} x={q.x} y={q.y} selected /></g>)}
          {/* Anteprima del punto di connessione da inserire, con la sua direzione (R per ruotarla) */}
          {tool.startsWith('pin') && hover && (() => {
            const g = { x: round(hover.x, pinGrid), y: round(hover.y, pinGrid) };
            return <g opacity={0.5}><PinMark q={{ id: '', x: g.x, y: g.y, dir: pinDir ?? guessDir(g, sym.prims), label: '' }} x={g.x} y={g.y} selected /></g>;
          })()}
          {(view.fields ?? []).map((f, i) => {
            const on = isSel({ kind: 'field', i });
            return <text key={`f${i}`} x={f.x} y={f.y} fontSize={f.size ?? 1.9} transform={f.rot ? `rotate(${f.rot} ${f.x} ${f.y})` : undefined}
              textAnchor={f.anchor ?? 'start'} fill={on ? '#1f6feb' : '#8250df'} fontStyle="italic">{fieldLabel(f)}</text>;
          })}
          {view.tagPos && (() => {
            const on = isSel({ kind: 'tag' });
            const a = view.tagAnchor ?? 'end';
            // Dati del dispositivo non posizionati: dove finiscono sullo schema (sotto la sigla), in grigio
            const under = textsUnderTag(view) ? DEVICE_LINE_KEYS.filter(k => !(view.fields ?? []).some(f => f.f === k)).slice(0, 3) : [];
            return (
              <>
                <text x={view.tagPos.x} y={view.tagPos.y} fontSize={2.6} fill={on ? '#1f6feb' : '#8250df'} textAnchor={a}>{tagLabel}</text>
                {under.map((k, i) => <text key={k} x={view.tagPos!.x} y={view.tagPos!.y + 2.6 * (i + 1)} fontSize={1.9} textAnchor={a} fill="#8c959f" fontStyle="italic">{`‹${fieldName(k)}›`}</text>)}
              </>
            );
          })()}
          </>}
          {/* Maniglie: blu, verde sotto il mouse, rossa quella calda; sui lati delle polilinee il + per un vertice nuovo */}
          {!drag && (() => {
            const g = z * 8, hot = cmd?.grip?.base;
            return (
              <g pointerEvents="none">
                {mids.map((q, k) => (
                  <g key={`m${k}`} stroke="#1f6feb" strokeWidth={z}>
                    <rect x={q.x - g * 0.35} y={q.y - g * 0.35} width={g * 0.7} height={g * 0.7} fill="#fff" transform={`rotate(45 ${q.x} ${q.y})`} />
                  </g>
                ))}
                {grips.map((q, k) => {
                  const isHot = hot && Math.abs(hot.x - q.x) < 1e-6 && Math.abs(hot.y - q.y) < 1e-6;
                  const over = hoverGrip && hoverGrip.x === q.x && hoverGrip.y === q.y;
                  return <rect key={`h${k}`} x={q.x - g / 2} y={q.y - g / 2} width={g} height={g} fill={isHot ? '#cf222e' : over ? '#2ea043' : '#1f6feb'} stroke="#fff" strokeWidth={z} />;
                })}
              </g>
            );
          })()}
          {(drag?.kind === 'box' || (windowFrom && hover)) && (() => {
            const a = drag?.kind === 'box' ? drag.start : windowFrom!, b = drag?.kind === 'box' ? drag.cur : hover!;
            const crossing = b.x < a.x;
            return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} pointerEvents="none"
              fill={crossing ? 'rgba(46,160,67,0.08)' : 'rgba(31,111,235,0.08)'} stroke={crossing ? '#2ea043' : '#1f6feb'} strokeWidth={z} strokeDasharray={crossing ? `${z * 5} ${z * 3}` : undefined} />;
          })()}
        </svg>
        {hint && <div className={orient !== null ? 'symbol-hint orient' : 'symbol-hint'}>{hint}</div>}
        </div>
        <div className="symbol-cmdline">
          {msgs.map((m, i) => <div key={i} className="muted">{m}</div>)}
          <div><b>{promptText()}</b> <span className="cmd-buf">{buf}</span><span className="cmd-caret">▏</span></div>
        </div>
        <div className="symbol-status">
          <span className="mono">{cur ? `${cadCoord(cur).x}, ${cadCoord(cur).y}` : ''}</span>
          <span className="tb-spacer" />
          <button className={osnap ? 'on' : ''} title={tx('Aggancio ai punti del disegno (F3)')} onClick={() => setOsnap(o => !o)}>OSNAP</button>
          <button className={ortho ? 'on' : ''} title={tx('Orto: solo orizzontale o verticale (F8; Maiusc la inverte)')} onClick={() => setOrtho(o => !o)}>{tx('ORTO')}</button>
          <button className={polarOn ? 'on' : ''} title={tx('Puntamento polare (F10)')} onClick={() => setPolarOn(o => !o)}>{tx('POLARE')}</button>
          <select value={polarStep} onChange={e => { setPolarStep(Number(e.target.value)); setPolarOn(true); }} title={tx('Passo del puntamento polare')}>
            {[15, 30, 45, 90].map(a => <option key={a} value={a}>{a}°</option>)}
          </select>
          <button className={gridSnap ? 'on' : ''} title={tx('Punti sulla griglia di 0,5 mm (F9)')} onClick={() => setGridSnap(g => !g)}>{tx('GRIGLIA')}</button>
        </div>
        </div>
        <div className="symbol-props">
          <table className="prop-table">
            <tbody>
              {orient !== null && <>
                <tr className="prop-group"><td colSpan={2}>{tx('Testi sullo schema a {0}°', orient)}</td></tr>
                {orientKeys.map(k => {
                  const p = placeOf(k)!;
                  return (
                    <tr key={k} className={orientSel === k ? 'row-sel' : undefined}>
                      <td className="prop-name" onClick={() => setOrientSel(k)}>{keyName(k)}{ownPlaces[k] ? ' •' : ''}</td>
                      <td className="prop-value nowrap">
                        <select value={p.anchor ?? 'start'} title={tx('Allineamento')} onChange={e => setOwnPlace(k, { ...p, rot: ownRot(k), anchor: e.target.value as TextPlace['anchor'] })}>
                          <option value="start">{tx('a sinistra')}</option><option value="middle">{tx('al centro')}</option><option value="end">{tx('a destra')}</option>
                        </select>
                        <select value={ownRot(k) === undefined ? '' : String(ownRot(k))} title={tx('Orientamento (R sul testo scelto)')} onChange={e => setOwnPlace(k, { ...p, rot: e.target.value === '' ? undefined : Number(e.target.value) })}>
                          <option value="">{k === 'termNum' || k === 'termStrip' ? tx('come impostazioni progetto') : tx('automatico')}</option>
                          {TEXT_ROTS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
                        </select>
                        {ownPlaces[k] && <button className="mini" title={tx('Torna alla posizione automatica')} onClick={() => setOwnPlace(k, undefined)}>↺</button>}
                      </td>
                    </tr>
                  );
                })}
                <tr><td colSpan={2} className="pad-x">
                  <button className="small" disabled={!Object.keys(ownPlaces).length} onClick={() => { const all = { ...(sym.orientTexts ?? {}) }; delete all[orient]; update({ orientTexts: Object.keys(all).length ? all : undefined }); }}>{tx('Tutti nella posizione automatica')}</button>
                </td></tr>
              </>}
              <tr className="prop-group"><td colSpan={2}>{isTb ? tx('Cartiglio') : tx('Simbolo')}</td></tr>
              <tr><td className="prop-name">{tx('Nome')}</td><td className="prop-value"><input value={sym.name} onChange={e => update({ name: e.target.value })} /></td></tr>
              {!isTb && <>
              <tr><td className="prop-name">{tx('Categoria')}</td><td className="prop-value">
                <input value={sym.category} list="sym-categories" title={tx('Simboli con la stessa categoria stanno insieme nella libreria')} onChange={e => update({ category: e.target.value })} />
                <datalist id="sym-categories">{[...new Set([...BUILTIN_SYMBOLS, ...st().symbolLibrary].map(x => x.category))].map(c => <option key={c} value={c} />)}</datalist>
              </td></tr>
              <tr><td className="prop-name">{tx('Lettera (IEC 81346)')}</td><td className="prop-value"><input value={sym.letter} onChange={e => update({ letter: e.target.value.toUpperCase() })} /></td></tr>
              <tr><td className="prop-name">{tx('Ruolo')}</td><td className="prop-value">
                <select value={sym.role} onChange={e => update({ role: e.target.value as SymbolRole, contact: e.target.value === 'aux' ? sym.contact ?? 'NO' : undefined, io: e.target.value === 'plc' ? sym.io ?? 'DI' : undefined })}>
                  {!ROLES.some(r => r[0] === sym.role) && <option value={sym.role}>{sym.role}</option>}
                  {ROLES.map(([r, l]) => <option key={r} value={r}>{tx(l)}</option>)}
                </select>
              </td></tr>
              {sym.role === 'plc' && (
                <tr><td className="prop-name">{tx('Tipo di canale')}</td><td className="prop-value">
                  <select value={sym.io ?? 'DI'} onChange={e => update({ io: e.target.value as IoKind })}>
                    <option value="DI">{tx('Ingresso digitale')}</option><option value="DO">{tx('Uscita digitale')}</option>
                    <option value="AI">{tx('Ingresso analogico')}</option><option value="AO">{tx('Uscita analogica')}</option>
                  </select>
                </td></tr>
              )}
              {sym.role === 'aux' && (
                <tr><td className="prop-name">{tx('Tipo di contatto')}</td><td className="prop-value">
                  <select value={sym.contact ?? 'NO'} onChange={e => update({ contact: e.target.value as SymbolDef['contact'] })}>
                    <option value="NO">{tx('NA (x3-x4)')}</option><option value="NC">{tx('NC (x1-x2)')}</option><option value="CO">{tx('In scambio')}</option><option value="power">{tx('Di potenza')}</option>
                  </select>
                </td></tr>
              )}
              <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><input value={sym.description ?? ''} onChange={e => update({ description: e.target.value || undefined })} /></td></tr>
              <tr><td className="prop-name" title={tx('Posizioni in cui il simbolo si può girare sullo schema (R passa alla successiva)')}>{tx('Rotazioni ammesse')}</td><td className="prop-value rot-checks">
                {ROTS.map(r => {
                  const on = allowedRots(sym).includes(r);
                  return (
                    <label key={r} className="nowrap small"><input type="checkbox" checked={on} onChange={e => {
                      const list = e.target.checked ? [...allowedRots(sym), r] : allowedRots(sym).filter(x => x !== r);
                      if (!list.length) return;
                      update({ rotations: list.length === 4 ? undefined : ROTS.filter(x => list.includes(x)) });
                    }} /> {r}°</label>
                  );
                })}
              </td></tr>
              <tr><td className="prop-name">{tx('Specchiabile')}</td><td className="prop-value"><input type="checkbox" checked={!sym.noMirror} onChange={e => update({ noMirror: e.target.checked ? undefined : true })} /></td></tr>
              </>}
              <tr><td className="prop-name">{tx('Elementi')}</td><td className="prop-value">{isTb ? tx('{0} elementi', sym.prims.length) : tx('{0} grafici · {1} punti di connessione', sym.prims.length, sym.pins.length)}</td></tr>
              {sel.length > 1 && <tr className="prop-group"><td colSpan={2}>{tx('{0} elementi selezionati', sel.length)}</td></tr>}
              {sel.some(it => isLocked(sym, it)) && <tr><td colSpan={2} className="small warn-text">{tx('Bloccato: non si sposta e non si modifica. «Sblocca» per cambiarlo.')}</td></tr>}
              {canExplode && <tr><td colSpan={2} className="small muted">{tx('Gruppo: si sposta e si allinea intero. «Esplodi» per modificare gli elementi uno per uno.')}</td></tr>}
              {!isTb && sym.id && <tr><td className="prop-name">{tx('Usato nello schema')}</td><td className="prop-value">{usedBy(sym.id)}</td></tr>}
              {selPrim && one?.kind === 'prim' && (
                <>
                  <tr className="prop-group"><td colSpan={2}>{selPrim.t === 'rect' && selPrim.logo ? tx('Area del logo') : tx(PRIM_NAMES[selPrim.t])}</td></tr>
                  {selPrim.t === 'line' && (['x1', 'y1', 'x2', 'y2'] as const).map(k => <tr key={k}><td className="prop-name">{k}</td><td className="prop-value">{num(selPrim[k], v => setPrim(one.i, { ...selPrim, [k]: v }))}</td></tr>)}
                  {selPrim.t === 'rect' && (['x', 'y', 'w', 'h'] as const).map(k => <tr key={k}><td className="prop-name">{k}</td><td className="prop-value">{num(selPrim[k], v => setPrim(one.i, { ...selPrim, [k]: v }))}</td></tr>)}
                  {selPrim.t === 'circle' && (['cx', 'cy', 'r'] as const).map(k => <tr key={k}><td className="prop-name">{k}</td><td className="prop-value">{num(selPrim[k], v => setPrim(one.i, { ...selPrim, [k]: v }))}</td></tr>)}
                  {selPrim.t === 'ellipse' && (['cx', 'cy', 'rx', 'ry'] as const).map(k => <tr key={k}><td className="prop-name">{k}</td><td className="prop-value">{num(selPrim[k], v => setPrim(one.i, { ...selPrim, [k]: v }))}</td></tr>)}
                  {selPrim.t === 'arc' && <>
                    {(['cx', 'cy', 'r'] as const).map(k => <tr key={k}><td className="prop-name">{k}</td><td className="prop-value">{num(selPrim[k], v => setPrim(one.i, { ...selPrim, [k]: v }))}</td></tr>)}
                    <tr><td className="prop-name">{tx('Angolo iniziale (°)')}</td><td className="prop-value">{num(selPrim.a0, v => setPrim(one.i, { ...selPrim, a0: v }), 15)}</td></tr>
                    <tr><td className="prop-name">{tx('Angolo finale (°)')}</td><td className="prop-value">{num(selPrim.a1, v => setPrim(one.i, { ...selPrim, a1: v }), 15)}</td></tr>
                  </>}
                  {selPrim.t === 'poly' && <>
                    <tr><td className="prop-name">{tx('Vertici')}</td><td className="prop-value">{selPrim.pts.length}</td></tr>
                    <tr><td className="prop-name">{tx('Chiusa')}</td><td className="prop-value"><input type="checkbox" checked={!!selPrim.closed} onChange={e => setPrim(one.i, { ...selPrim, closed: e.target.checked || undefined })} /></td></tr>
                  </>}
                  {selPrim.t === 'text' && (
                    <>
                      <tr><td className="prop-name">{tx('Testo')}</td><td className="prop-value"><input ref={textInput} value={selPrim.s} onChange={e => setPrim(one.i, { ...selPrim, s: e.target.value })} /></td></tr>
                      <tr><td className="prop-name">{tx('Altezza')}</td><td className="prop-value">{num(selPrim.size ?? 2.5, v => setPrim(one.i, { ...selPrim, size: v }))}</td></tr>
                      <tr><td className="prop-name">{tx('Allineamento')}</td><td className="prop-value">{anchorSelect(selPrim.anchor ?? 'middle', a => setPrim(one.i, { ...selPrim, anchor: a }))}</td></tr>
                      <tr><td className="prop-name">{tx('Orientamento')}</td><td className="prop-value">{rotSelect(selPrim.rot, r => { const { rot: _r, ...rest } = selPrim; setPrim(one.i, r ? { ...rest, rot: r } : rest); })}</td></tr>
                      <tr><td className="prop-name">{tx('Grigio (etichetta)')}</td><td className="prop-value"><input type="checkbox" checked={!!selPrim.muted} onChange={e => setPrim(one.i, { ...selPrim, muted: e.target.checked || undefined })} /></td></tr>
                      <tr><td className="prop-name">x / y</td><td className="prop-value">{num(selPrim.x, v => setPrim(one.i, { ...selPrim, x: v }))}{num(selPrim.y, v => setPrim(one.i, { ...selPrim, y: v }))}</td></tr>
                    </>
                  )}
                  {isTb && selPrim.t === 'rect' && (
                    <tr><td className="prop-name">{tx('Area del logo')}</td><td className="prop-value"><input type="checkbox" checked={!!selPrim.logo} onChange={e => setPrim(one.i, { ...selPrim, logo: e.target.checked || undefined })} /></td></tr>
                  )}
                  {(selPrim.t === 'rect' || selPrim.t === 'circle' || selPrim.t === 'ellipse' || (selPrim.t === 'poly' && selPrim.closed)) && !(selPrim.t === 'rect' && selPrim.logo) && (
                    <tr><td className="prop-name">{tx('Pieno')}</td><td className="prop-value"><input type="checkbox" checked={!!selPrim.fill} onChange={e => setPrim(one.i, { ...selPrim, fill: e.target.checked })} /></td></tr>
                  )}
                </>
              )}
              {sel.some(it => it.kind === 'prim') && (() => {
                const ls = [...new Set(sel.flatMap(it => (it.kind === 'prim' && sym.prims[it.i] ? [layerOf(sym.prims[it.i])] : [])))];
                return (
                  <tr><td className="prop-name">{tx('Livello')}</td><td className="prop-value">
                    <select value={ls.length === 1 ? ls[0] : '*'} onChange={e => moveToLayer(e.target.value)}>
                      {ls.length > 1 && <option value="*" disabled>{tx('valori diversi')}</option>}
                      {layerList.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                  </td></tr>
                );
              })()}
              {strokes.length > 0 && (
                <>
                  {sel.length > 1 && <tr className="prop-group"><td colSpan={2}>{tx('Linee selezionate ({0})', strokes.length)}</td></tr>}
                  <tr><td className="prop-name">{tx('Tipo di linea')}</td><td className="prop-value">
                    <select value={curLt ?? '*'} onChange={e => setStroke({ lt: e.target.value as WireLineType })}>
                      {curLt === undefined && <option value="*" disabled>{tx('valori diversi')}</option>}
                      {WIRE_LINE_TYPES.map(t => <option key={t.id} value={t.id}>{tx(t.name)}</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Spessore (mm)')}</td><td className="prop-value">
                    <select value={curLw ?? '*'} onChange={e => setStroke({ lw: e.target.value ? parseFloat(e.target.value) : null })}>
                      {curLw === undefined && <option value="*" disabled>{tx('valori diversi')}</option>}
                      <option value="">{tx('predefinito ({0})', String(WIRE_WIDTH_DEFAULT).replace('.', ','))}</option>
                      {WIRE_WIDTHS.map(w => <option key={w} value={String(w)}>{String(w).replace('.', ',')}</option>)}
                      {curLw && !WIRE_WIDTHS.includes(parseFloat(curLw)) && <option value={curLw}>{curLw.replace('.', ',')}</option>}
                    </select>
                  </td></tr>
                </>
              )}
              {sel.filter(it => it.kind === 'pin').length > 1 && (() => {
                // Più punti di connessione selezionati: la posizione della designazione per tutti
                const ids = sel.flatMap(it => (it.kind === 'pin' ? [it.i] : []));
                const vals = new Set(ids.map(i => sym.pins[i].labelPos ?? ''));
                return (
                  <>
                    <tr className="prop-group"><td colSpan={2}>{tx('Punti di connessione selezionati ({0})', ids.length)}</td></tr>
                    <tr><td className="prop-name">{tx('Posizione della designazione')}</td><td className="prop-value">
                      <select value={vals.size === 1 ? [...vals][0] : '*'} onChange={e => update({ pins: sym.pins.map((q, i) => (ids.includes(i) ? { ...q, labelPos: (e.target.value || undefined) as PinLabelPos | undefined } : q)) })}>
                        {vals.size > 1 && <option value="*" disabled>{tx('valori diversi')}</option>}
                        <option value="">{tx('automatica (secondo il filo)')}</option>
                        <option value="tl">{tx('in alto a sinistra')}</option><option value="tr">{tx('in alto a destra')}</option>
                        <option value="bl">{tx('in basso a sinistra')}</option><option value="br">{tx('in basso a destra')}</option>
                      </select>
                    </td></tr>
                  </>
                );
              })()}
              {selPin && one?.kind === 'pin' && (
                <>
                  <tr className="prop-group"><td colSpan={2}>{tx('Punto di connessione')} {selPin.id}</td></tr>
                  <tr><td className="prop-name">{tx('Tipo')}</td><td className="prop-value">
                    <select value={selPin.kind ?? ''} onChange={e => setPin(one.i, { ...selPin, kind: (e.target.value || undefined) as PinKind | undefined })}>
                      {PIN_KINDS.map(([, k]) => <option key={k ?? ''} value={k ?? ''}>{pinKindName(k)}</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Designazione')}</td><td className="prop-value"><input value={selPin.label} placeholder={tx('es. A1, 13, U1')} onChange={e => setPin(one.i, { ...selPin, label: e.target.value })} /></td></tr>
                  <tr><td className="prop-name">{tx('Posizione della designazione')}</td><td className="prop-value">
                    <select value={selPin.labelPos ?? ''} onChange={e => setPin(one.i, { ...selPin, labelPos: (e.target.value || undefined) as PinLabelPos | undefined })}>
                      <option value="">{tx('automatica (secondo il filo)')}</option>
                      <option value="tl">{tx('in alto a sinistra')}</option><option value="tr">{tx('in alto a destra')}</option>
                      <option value="bl">{tx('in basso a sinistra')}</option><option value="br">{tx('in basso a destra')}</option>
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Direzione del filo')}</td><td className="prop-value">
                    <select value={selPin.dir} onChange={e => setPin(one.i, { ...selPin, dir: e.target.value as PinDir })}>
                      <option value="up">{tx('in alto')}</option><option value="down">{tx('in basso')}</option><option value="left">{tx('a sinistra')}</option><option value="right">{tx('a destra')}</option>
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">x</td><td className="prop-value">{num(selPin.x, v => setPin(one.i, { ...selPin, x: round(v, pinGrid) }), pinGrid)}</td></tr>
                  <tr><td className="prop-name">y</td><td className="prop-value">{num(selPin.y, v => setPin(one.i, { ...selPin, y: round(v, pinGrid) }), pinGrid)}</td></tr>
                </>
              )}
              {selField && one?.kind === 'field' && (
                <>
                  <tr className="prop-group"><td colSpan={2}>{tx('Testo del componente')}</td></tr>
                  <tr><td className="prop-name">{tx('Mostra')}</td><td className="prop-value">
                    <select value={selField.f} onChange={e => setField(one.i, { ...selField, f: e.target.value as FieldKey })}>
                      {fieldsFor(sym.role).filter(([f]) => f === selField.f || !fields.some(x => x.f === f)).map(([f, l]) => <option key={f} value={f}>{tx(l)}</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Altezza')}</td><td className="prop-value">{num(selField.size ?? 1.9, v => setField(one.i, { ...selField, size: v || undefined }), 0.1)}</td></tr>
                  <tr><td className="prop-name">{tx('Allineamento')}</td><td className="prop-value">{anchorSelect(selField.anchor ?? 'start', a => setField(one.i, { ...selField, anchor: a }))}</td></tr>
                  <tr><td className="prop-name">{tx('Orientamento')}</td><td className="prop-value">{rotSelect(selField.rot, r => { const { rot: _r, ...rest } = selField; setField(one.i, r ? { ...rest, rot: r } : rest); })}</td></tr>
                  <tr><td className="prop-name">x / y</td><td className="prop-value">{num(selField.x, v => setField(one.i, { ...selField, x: v }))}{num(selField.y, v => setField(one.i, { ...selField, y: v }))}</td></tr>
                </>
              )}
              {one?.kind === 'tag' && sym.tagPos && (
                <>
                  <tr className="prop-group"><td colSpan={2}>{tx('Sigla')}</td></tr>
                  <tr><td className="prop-name">{tx('Allineamento')}</td><td className="prop-value">
                    <select value={sym.tagAnchor ?? ''} onChange={e => update({ tagAnchor: (e.target.value || undefined) as SymbolDef['tagAnchor'] })}>
                      <option value="">{tx('automatico (verso l\'esterno)')}</option>
                      <option value="start">{tx('a sinistra')}</option><option value="middle">{tx('al centro')}</option><option value="end">{tx('a destra')}</option>
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Dati non posizionati')}</td><td className="prop-value">
                    <select value={textsUnderTag(sym) ? '1' : '0'} title={tx('Descrizione, dati tecnici e gli altri dati del dispositivo che non sono messi come testi del componente')}
                      onChange={e => update({ textsUnderTag: e.target.value === '1' })}>
                      <option value="1">{tx('sotto la sigla')}</option>
                      <option value="0">{tx('non scritti sullo schema')}</option>
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">x / y</td><td className="prop-value">{num(sym.tagPos.x, v => update({ tagPos: { ...sym.tagPos!, x: v } }))}{num(sym.tagPos.y, v => update({ tagPos: { ...sym.tagPos!, y: v } }))}</td></tr>
                </>
              )}
            </tbody>
          </table>
          {isTb && (
            <div className="pad">
              <div className="small"><b>{tx('Segnaposto')}</b> {tx('— clic per aggiungerlo al testo selezionato (o come testo nuovo):')}</div>
              <div className="tb-placeholders">
                {TB_PLACEHOLDERS.map(([ph, d]) => <button key={ph} className="small" title={tx(d)} onClick={() => insertPlaceholder(ph)}>{ph}</button>)}
              </div>
              <p className="muted small">{tx('Un valore di riserva si scrive dopo una barra:')} <code>{'{cliente|—}'}</code>{tx('. Un testo i cui segnaposto sono tutti vuoti non viene stampato. I testi fissi si traducono con il dizionario del progetto. Il logo si sceglie nelle proprietà del progetto.')}</p>
            </div>
          )}
          {!isTb && <p className="muted small pad">{isBuiltin
            ? tx('Simbolo di base: «Salva» crea una copia personale che lo sostituisce in tutti i componenti del progetto. «Salva come…» crea un simbolo nuovo solo nella libreria.')
            : tx('«Salva» aggiorna il simbolo nella libreria personale e in tutti i componenti dello schema che lo usano. «Salva come…» crea un simbolo nuovo con un altro nome, solo nella libreria.')}</p>}
        </div>
      </div>
    </div>
  );
}

/** Area del logo del cartiglio, trascinata da a a b */
function shapeOf(tool: ETool, a: Pt, b: Pt): Prim | undefined {
  if (tool !== 'logo') return undefined;
  return { t: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), logo: true };
}
