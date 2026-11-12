// Rendering SVG di una pagina di schema: usato sia dall'editor sia dall'export PDF.
import type { ReportSheet, RevisionCloud } from '../model/derive';
import { REPORT_DEFAULTS, REPORT_X, reportColumns, styledHeadH, type ReportCol } from '../model/reportStyle';
import { memo, type ReactNode } from 'react';
import type { Project, Page, Prim, SymbolInstance, SymbolDef, Pt, FieldKey, TextItem, CableLine, StripStyle } from '../model/types';
import { PAGE_W, PAGE_H, FRAME, COLUMNS, ROWS, WIRE_COLORS, WIRE_WIDTH_DEFAULT, wireDash, primLineType, textStylesOf, wireTextStyle, type TextStyleKey, type TextStyle } from '../model/types';
import { getSymbol, toWorld, readableText, primBounds, samePt, pairVertical, pairScale, pairCenter, pairToWorld } from '../model/geometry';
import { contactPole } from '../model/symbols';
import { contactImageRows, contactImageScale, rowGeometry, stackRows, BLADE_X } from '../model/contactImage';
import { tickPoint } from '../model/wireTicks';
import { DIR_VEC, type TNode } from '../model/wiringOrder';
import { pageOfLocation, type CrossRefInfo } from '../model/devices';
import { OVERVIEW, overviewRowHeight, type OverviewData } from '../model/plc';
import { STRIP_LAYOUT, STRIP_TEXT, STRIP_COLS, stripTextOf, type StripSheetData } from '../model/terminals';
import { COVER_DEFAULTS, coverLines, coverStyleOf } from '../model/cover';
import { layoutOf, layoutView, railUsage } from '../model/layout';
import { protocolOf, nodeIp } from '../model/network';
import { translator } from '../model/i18n';
import { titleBlockPrims } from '../model/titleBlocks';
import { linkTextLayout, type WireLabelPos } from '../model/wireLabels';
import type { ShowMap, SymVisKey } from '../model/visibility';
import { flowLines, LINE_GAP } from '../model/textFlow';
import { layoutRich } from '../model/textRich';
import { terminalTextLayout } from '../model/terminalText';
import { textPlace, orientPlace, textOffset } from '../model/symbolTexts';
import type { Layout, LayoutItem, Zone, ZoneStyle, Panel, TerminalTextDir, TextMoveKey, ImageItem, WireDef } from '../model/types';
import { wireDefLabel, wireDefCrossings, wireDefLabelAt } from '../model/wireDefs';
import { plotPrims } from '../model/types';
import { tx } from '../i18n/ui';
import type { DrawingData } from '../model/drawings';
import type { ConnectorFrame } from '../model/connectors';
import { DrawingPage } from './DrawingPages';
import { drawingStyleOf, type ResolvedDrawingStyle } from '../model/drawingStyle';

import { look, applyLook } from './look';
import { approxTextW, leaderLine, nearestInBox, zoneLabelBox, zoneLeader, zoneLookOf, zoneText } from '../model/leaders';
import { cableStyleOf, lineShow, shieldDims, shieldGeometry, SHIELD, type ResolvedCableStyle } from '../model/cableStyle';

/** Inchiostro predefinito (quello del progetto è look.ink) */
export const INK = '#1b1f24';
/** Colori e altezze predefiniti dei testi (per le viste senza impostazioni del progetto) */
const DEFAULT_TEXT = textStylesOf({});
/** Testi secondari (etichette del cartiglio) */
export const MUTED = '#5b636d';

export interface CableMark {
  label: string; sub: string; conductors: { at: Pt; name: string; problem?: boolean }[];
  /** Cavo schermato: schermo (calza) disegnato attorno agli incroci */
  shield?: boolean;
  /** Coppie intrecciate (nomi dei due conduttori) */
  pairs?: [string, string][];
  type?: string;
  section?: string;
  description?: string;
  /** Rappresentazione principale del cavo (tipo e dati); le altre linee di serie solo la sigla */
  main?: boolean;
  /** Un filo arriva sul punto di connessione dello schermo: niente simbolo di terra */
  shieldWired?: boolean;
  /** Punto di connessione dello schermo (dove si aggancia il filo verso il PE) */
  shieldLead?: Pt;
}

/**
 * Schermo e coppie intrecciate del cavo (IEC 60617): lo schermo è un'asola tratteggiata (due semicerchi
 * uniti da due linee) attorno agli incroci dei conduttori, con il collegamento che esce da un semicerchio
 * e il simbolo di terra se nessun filo vi è collegato; ogni coppia intrecciata è un piccolo incrocio tra
 * i suoi due conduttori, accanto alla linea
 */
function CableShieldPairs({ line, mark, color, shieldColor, style }: { line: CableLine; mark: CableMark; color: string; shieldColor: string; style: ResolvedCableStyle }) {
  const g = shieldGeometry(line, mark.conductors.map(k => k.at), shieldDims(style, line));
  if (!g) return null;
  const { horiz, lo, hi, P } = g;
  const along = (p: Pt) => (horiz ? p.x : p.y);
  const pos = new Map(mark.conductors.map(k => [k.name, along(k.at)]));
  const twists = (mark.pairs ?? []).flatMap(([n1, n2]) => {
    const u1 = pos.get(n1), u2 = pos.get(n2);
    if (u1 === undefined || u2 === undefined) return [];
    const [p, q] = [Math.min(u1, u2), Math.max(u1, u2)], m = (p + q) / 2, h = Math.min(1.6, (q - p) / 2);
    // Due archi incrociati sotto la linea, tra i due conduttori
    const s1 = P(p, 1.2), e1 = P(q, 4), s2 = P(p, 4), e2 = P(q, 1.2), c1 = P(m - h, 4), c2 = P(m + h, 1.2), c3 = P(m - h, 1.2), c4 = P(m + h, 4);
    return [`M${s1.x} ${s1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e1.x} ${e1.y}`, `M${s2.x} ${s2.y} C${c3.x} ${c3.y} ${c4.x} ${c4.y} ${e2.x} ${e2.y}`];
  });
  const r = g.r;
  // Asola: semicerchi alle estremità (il verso dell'arco cambia con la linea verticale, che specchia gli assi)
  const sw = horiz ? 1 : 0;
  const a1 = P(lo + r, -r), a2 = P(hi - r, -r), a3 = P(hi - r, r), a4 = P(lo + r, r);
  const loop = `M${a1.x} ${a1.y} L${a2.x} ${a2.y} A${r} ${r} 0 0 ${sw} ${a3.x} ${a3.y} L${a4.x} ${a4.y} A${r} ${r} 0 0 ${sw} ${a1.x} ${a1.y}`;
  const lead = g.lead;
  // Simbolo di terra in fondo al collegamento: tre trattini perpendicolari, sempre più corti
  const ground = lead && !mark.shieldWired ? [1.3, 0.85, 0.4].map((w, k) => { const c = P(along(lead.to), r + SHIELD.lead + k * 0.6); return horiz ? { x1: c.x - w, y1: c.y, x2: c.x + w, y2: c.y } : { x1: c.x, y1: c.y - w, x2: c.x, y2: c.y + w }; }) : [];
  return (
    <g stroke={color} fill="none" strokeWidth={0.2}>
      {mark.shield && <g stroke={shieldColor}>
        <path d={loop} strokeDasharray="0.9 0.6" />
        {lead && <line x1={lead.from.x} y1={lead.from.y} x2={lead.to.x} y2={lead.to.y} />}
        {ground.map((l, k) => <line key={k} {...l} />)}
        {lead && mark.shieldWired && <circle cx={lead.to.x} cy={lead.to.y} r={0.35} fill={shieldColor} stroke="none" />}
      </g>}
      {twists.map((d, i) => <path key={i} d={d} />)}
    </g>
  );
}

/**
 * Linea di definizione dei fili: una riga sottile che attraversa i fili, un trattino obliquo su ogni filo
 * e, legata con un righino alla fine della riga, la scritta con sezione, colore e tipo (si trascina)
 */
function WireDefView({ d, page, selected }: { d: WireDef; page: Page; selected: boolean }) {
  const [a, b] = d.points;
  const c = selected ? SEL : look.ink;
  const ticks = wireDefCrossings(page, d).map(x => x.at);
  const lines = wireDefLabel(d);
  const { end, at } = wireDefLabelAt(d);
  return (
    <g data-id={d.id} stroke={c} strokeWidth={selected ? 0.3 : 0.18} fill="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={2.5} />
      {/* Trattino obliquo su ogni filo attraversato */}
      {ticks.map((p, i) => <line key={i} x1={p.x - 1.1} y1={p.y + 1.1} x2={p.x + 1.1} y2={p.y - 1.1} strokeWidth={selected ? 0.35 : 0.25} />)}
      {/* Righino dalla fine della riga alla scritta */}
      <line x1={end.x} y1={end.y} x2={at.x} y2={at.y} />
      <g data-wdlabel={d.id} fill={c} stroke="none" fontSize={1.9} style={{ cursor: 'move' }}>
        <rect x={at.x} y={at.y - 2.2} width={Math.max(8, ...lines.map(s => s.length * 1.05)) + 2} height={(lines.length || 1) * 2.6 + 0.6} fill="transparent" />
        {(lines.length ? lines : ['?']).map((s, i) => <text key={i} x={at.x + 0.8} y={at.y + i * 2.6}>{s}</text>)}
      </g>
    </g>
  );
}

/**
 * Linea di definizione cavo: tratto-punto, testi (sigla; tipo e sezione sulla linea principale) nella
 * posizione scelta e trascinabili, nome del conduttore e trattino obliquo (se scelto) su ogni incrocio
 */
function CableView({ line, mark, selected, style: base }: { line: CableLine; mark?: CableMark; selected: boolean; style: ResolvedCableStyle }) {
  const [a, b] = line.points;
  const ink = look.ink;
  // Colori e misure scelti sulla linea: l'altezza vale per la sigla, gli altri testi in proporzione
  const lk = line.look ?? {};
  const k = lk.textSize ? lk.textSize / base.tagSize : 1;
  const style: ResolvedCableStyle = {
    ...base, lineColor: lk.lineColor ?? base.lineColor, lineWidth: lk.lineWidth ?? base.lineWidth,
    tagSize: lk.textSize ?? base.tagSize, textSize: base.textSize * k,
    tagColor: lk.textColor ?? base.tagColor, textColor: lk.textColor ?? base.textColor,
  };
  const lineC = selected ? SEL : style.lineColor ?? ink;
  const show = lineShow(style, line, mark?.main ?? true);
  const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const [s0, s1] = (horiz ? a.x <= b.x : a.y <= b.y) ? [a, b] : [b, a];
  const lines: { text: string; size: number; color: string; bold?: boolean }[] = [];
  if (show.tag) lines.push({ text: mark?.label ?? '-W?', size: style.tagSize, color: style.tagColor ?? ink, bold: true });
  const data = [show.type ? mark?.type : undefined, show.section ? mark?.section : undefined].filter(Boolean).join(' ');
  if (data) lines.push({ text: data, size: style.textSize, color: style.textColor ?? ink });
  if (show.description && mark?.description) lines.push({ text: mark.description, size: style.textSize, color: style.textColor ?? ink });
  const pos = line.labelPos ?? style.labelPos;
  const off = line.labelOffset ?? { x: 0, y: 0 };
  // Righe dei testi: sopra la linea si sale dalla linea verso l'alto, sotto si scende; prima o dopo la
  // linea la sigla sta sopra e i dati sotto. Sulle linee verticali i testi vanno a sinistra, in cima o in fondo.
  // Con lo schermo i testi stanno fuori dall'asola
  const sh = mark?.shield ? shieldGeometry(line, mark.conductors.map(k => k.at), shieldDims(style, line)) : undefined;
  const gap = sh ? sh.r + 0.8 : 1.2, step = (l: { size: number }) => l.size * 1.25;
  const end = pos === 'after' || pos === 'aboveEnd' || pos === 'belowEnd';
  const along = (p: Pt) => (horiz ? p.x : p.y);
  const tip = (p: Pt, u: number): Pt => (horiz ? { x: u, y: p.y } : { x: p.x, y: u });
  const at = end ? (sh ? tip(s1, Math.max(along(s1), sh.hi)) : s1) : (sh ? tip(s0, Math.min(along(s0), sh.lo)) : s0);
  const up = (from: number, list: typeof lines) => { let yy = from; return list.map((_l, k) => { if (k) yy -= step(list[k - 1]); return yy; }).reverse(); };
  const down = (from: number, list: typeof lines) => { let yy = from; return list.map((l, k) => { yy += k ? step(l) : l.size * 0.8; return yy; }); };
  let x: number, anchor: 'start' | 'end', ys: number[];
  if (horiz) {
    anchor = pos === 'before' || pos === 'aboveEnd' || pos === 'belowEnd' ? 'end' : 'start';
    x = at.x + (pos === 'before' ? -1 : pos === 'after' ? 1 : anchor === 'end' ? -0.5 : 0.5);
    if (pos === 'before' || pos === 'after') ys = [at.y - gap, ...down(at.y + gap, lines.slice(1))];
    else if (pos === 'aboveStart' || pos === 'aboveEnd') ys = up(at.y - gap, [...lines].reverse());
    else ys = down(at.y + gap, lines);
  } else {
    anchor = 'end';
    x = at.x - (sh ? sh.r + 0.8 : 1);
    ys = end ? down(at.y + 0.8, lines) : up(at.y - 0.8, [...lines].reverse());
  }
  const rows = lines.map((l, k) => ({ ...l, y: ys[k] }));
  // Testi trascinati via: righino dal punto più vicino della linea ai testi
  let lead: [Pt, Pt] | undefined;
  if (rows.length && (off.x || off.y)) {
    const w = Math.max(...rows.map(r => approxTextW(r.text, r.size)));
    const box = {
      x0: (anchor === 'end' ? x - w : x) + off.x - 0.3, x1: (anchor === 'end' ? x : x + w) + off.x + 0.3,
      y0: Math.min(...rows.map(r => r.y - r.size * 0.95)) + off.y, y1: Math.max(...rows.map(r => r.y + r.size * 0.3)) + off.y,
    };
    const c = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    const from = nearestInBox({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }, c);
    lead = leaderLine(from, box);
  }
  const condC = (k: { problem?: boolean }) => (k.problem ? '#cf222e' : style.condColor ?? ink);
  const condV = (line.condDir ?? style.condDir) === 'v';
  return (
    <g data-id={line.id}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lineC} strokeWidth={selected ? style.lineWidth + 0.2 : style.lineWidth} strokeDasharray="3 0.8 0.6 0.8" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={2.5} />
      {mark && <CableShieldPairs line={line} mark={mark} color={lineC} shieldColor={selected ? SEL : style.shieldColor ?? lineC} style={style} />}
      {style.ticks && mark?.conductors.map((k, i) => <line key={`t${i}`} x1={k.at.x - 1.1} y1={k.at.y + 1.1} x2={k.at.x + 1.1} y2={k.at.y - 1.1} stroke={lineC} strokeWidth={0.25} />)}
      {lead && <line x1={lead[0].x} y1={lead[0].y} x2={lead[1].x} y2={lead[1].y} stroke={lineC} strokeWidth={0.18} />}
      {rows.length > 0 && (
        <g data-cablabel={line.id} stroke="none" transform={off.x || off.y ? `translate(${off.x} ${off.y})` : undefined} style={{ cursor: 'move' }}>
          {rows.map((r, i) => <text key={i} x={x} y={r.y} fontSize={r.size} fontWeight={r.bold ? 600 : undefined} textAnchor={anchor} fill={selected ? SEL : r.color}>{r.text}</text>)}
        </g>
      )}
      {show.conductors && mark?.conductors.map((k, i) => {
        // Verticali: dal basso verso l'alto accanto al filo, sopra la linea (o sopra l'asola dello schermo)
        if (condV) {
          const x0 = horiz ? k.at.x - 0.6 : k.at.x + (sh ? sh.r : 0) + 0.6 + style.condSize * 0.8, y0 = horiz ? k.at.y - (sh ? sh.r + 0.6 : 0.8) : k.at.y - 0.6;
          return <text key={i} x={x0} y={y0} transform={`rotate(-90 ${x0} ${y0})`} fontSize={style.condSize} fill={condC(k)} stroke="none">{k.name}</text>;
        }
        return <text key={i} x={k.at.x + 0.7} y={k.at.y - (mark.shield ? 0.5 : 0.8)} fontSize={style.condSize} fill={condC(k)} stroke="none">{k.name}</text>;
      })}
    </g>
  );
}
export const SEL = '#1f6feb';

export interface PageDerived {
  labels: Map<string, Record<string, string>>;
  xrefs: Map<string, CrossRefInfo>;
  junctions: Pt[];
  /** Nodi a T con il verso scelto: si disegnano con il triangolino verso il braccio scelto, senza pallino */
  tNodes?: TNode[];
  /** Posizioni degli altri rimandi con lo stesso nome */
  linkTargets: Map<string, { loc: string; id: string }[]>;
  /** Rimandi in attesa del corrispondente («/…»); gli altri senza corrispondente finiscono lì («//») */
  linkWaiting?: Set<string>;
  /** Morsetti che mostrano la sigla della morsettiera (il primo di ogni fila) */
  stripLabel: Set<string>;
  /** Numero filo da mostrare su ogni filo (vuoto se disattivato) */
  wireNumbers: Map<string, string>;
  /** Sezione e colore da scrivere sulla lineetta obliqua del filo */
  wireTicks?: Map<string, string>;
  /** Rimandi dei bus di conduttori alle altre pagine: «/pagina» cliccabili in fondo al nome */
  wireRefs?: Map<string, { page: string; id: string }[]>;
  /** Fili che entrano in un bus di conduttori: nome del conduttore scritto accanto */
  bundleTaps?: { at: Pt; next: Pt; name: string; size?: number; color?: string }[];
  /** Colore ereditato dal conduttore per i fili senza colore proprio */
  conductorColor?: Map<string, string>;
  /** Posizione libera del numero filo (vedi wireLabels.ts) */
  wireLabelPos?: Map<string, WireLabelPos[]>;
  /** Verso dei testi dei morsetti scelto nel progetto */
  terminalText?: TerminalTextDir;
  /** Testi dei simboli spostabili sullo schema (impostazione del progetto; assente = bloccati dove li mette l'editor) */
  freeTexts?: boolean;
  /** Sigla da mostrare, con funzione e luogo se presenti (es. "=A1+Q1-2K1") */
  designations: Map<string, string>;
  /** Descrizione e dati tecnici da scrivere sotto la sigla (solo elemento principale) */
  deviceLines: Map<string, string[]>;
  /** Valori dei testi del componente (campi del simbolo) per elemento */
  deviceFields: Map<string, Partial<Record<FieldKey, string>>>;
  /** Colore e altezza di ogni tipo di testo (impostazioni del progetto) */
  textStyles?: Record<TextStyleKey, Required<TextStyle>>;
  /** Proprietà mostrate o nascoste sullo schema per elemento (vedi visibility.ts) */
  show?: Map<string, ShowMap<SymVisKey>>;
  /** Fili disegnati nel loro colore */
  drawWireColors: boolean;
  /** Immagine dei contatti delle bobine in fondo alla pagina invece che sotto il simbolo */
  contactImageBottom?: boolean;
  /** Immagine dei contatti come testo con il disegnino (invece dei simboli dei contatti) */
  contactImageText?: boolean;
  /** Pagina proiettata: pagina e riquadro di origine con i loro dati, disegnati ritagliati sul riquadro */
  projected?: { page: Page; derived: PageDerived; zone: Zone };
  /** Riquadri di luogo con la pagina proiettata nel loro quadro: numero della pagina (rimando cliccabile) */
  zoneRefs?: Map<string, { name: string; id: string }>;
  /** Linee tratteggiate del comando dagli apparecchi alle rappresentazioni dei loro contatti accanto */
  pairLines?: { x1: number; x2: number; y: number }[];
  /** Stampa in bianco e nero (numeri filo in nero) */
  mono?: boolean;
  /** Punti I/O PLC: indirizzo, nome simbolico (vuoto se non assegnato) e rimando alla panoramica */
  plcTexts: Map<string, { address: string; symbol: string; ref?: string }>;
  /** Contenuto della pagina panoramica PLC (solo per le pagine di tipo "plc") */
  overview?: OverviewData;
  /** Linee di definizione cavo: sigla, tipo e conduttori sugli incroci */
  cableMarks?: Map<string, CableMark>;
  /** Pagina di lista: righe del foglio */
  reportSheet?: ReportSheet;
  /** Pagine disegnate dai dati: cablaggio di un cavo, connettore, schema d'insieme */
  drawing?: DrawingData;
  /** Riquadri tratteggiati dei connettori con sigla, tipo e genere */
  connFrames?: ConnectorFrame[];
  /** Nuvolette di revisione: ingombri degli elementi cambiati dopo l'ultima revisione */
  revisionClouds?: RevisionCloud[];
  /** Contenuto della pagina "schema della morsettiera" */
  stripSheet?: StripSheetData;
}

/** Spessore e tipo di linea di una primitiva (assenti: quelli del gruppo che la contiene) */
function primStroke(p: Prim) {
  if (p.t === 'text') return {};
  const ls = wireDash(primLineType(p), p.lw ?? WIRE_WIDTH_DEFAULT, true);
  return { strokeWidth: p.lw, strokeDasharray: ls.dash, strokeLinecap: ls.dash ? ls.cap : undefined };
}

export function PrimSvg({ p }: { p: Prim }) {
  const st = primStroke(p);
  switch (p.t) {
    case 'line': return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} {...st} />;
    case 'rect': return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ? 'currentColor' : 'none'} {...st} />;
    case 'circle': return <circle cx={p.cx} cy={p.cy} r={p.r} fill={p.fill ? 'currentColor' : 'none'} {...st} />;
    case 'arc': {
      const rad = (a: number) => (a * Math.PI) / 180;
      const x0 = p.cx + p.r * Math.cos(rad(p.a0)), y0 = p.cy + p.r * Math.sin(rad(p.a0));
      const x1 = p.cx + p.r * Math.cos(rad(p.a1)), y1 = p.cy + p.r * Math.sin(rad(p.a1));
      const large = ((p.a1 - p.a0 + 360) % 360) > 180 ? 1 : 0;
      return <path d={`M${x0} ${y0} A${p.r} ${p.r} 0 ${large} 1 ${x1} ${y1}`} fill="none" {...st} />;
    }
    case 'text': return <text x={p.x} y={p.y} fontSize={p.size ?? 2.5} textAnchor={p.anchor ?? 'middle'} fill={p.muted ? MUTED : 'currentColor'} stroke="none"
      transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined}>{p.s}</text>;
    case 'ellipse': return <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.fill ? 'currentColor' : 'none'} {...st} />;
    case 'poly': {
      const pts = p.pts.map(q => `${q.x},${q.y}`).join(' ');
      return p.closed
        ? <polygon points={pts} fill={p.fill ? 'currentColor' : 'none'} {...st} />
        : <polyline points={pts} fill="none" {...st} />;
    }
  }
}

export function SymbolGraphic({ sym, noText }: { sym: SymbolDef; noText?: boolean }) {
  return <>{plotPrims(sym).map((p, i) => (noText && p.t === 'text' ? null : <PrimSvg key={i} p={p} />))}</>;
}

/** Testi del simbolo fuori dalla trasformazione: mai specchiati né capovolti */
function SymbolTexts({ inst, sym }: { inst: SymbolInstance; sym: SymbolDef }) {
  return (
    <>
      {plotPrims(sym).map((p, i) => {
        if (p.t !== 'text') return null;
        const r = readableText(inst, p);
        return <text key={i} x={r.x} y={r.y} fontSize={p.size ?? 2.5} textAnchor={r.anchor} fill={p.muted ? MUTED : 'currentColor'} stroke="none"
          transform={r.rot ? `rotate(${r.rot} ${r.x} ${r.y})` : undefined}>{p.s}</text>;
      })}
    </>
  );
}

/**
 * Testo libero formattato: righe a capo (a mano o nel riquadro), grassetto, corsivo, sottolineato,
 * elenchi; allineato a sinistra, al centro o a destra (nel riquadro, se c'è)
 */
export function RichText({ t, transform, fill }: { t: TextItem; transform?: string; fill?: string }) {
  const lines = layoutRich(t);
  const a = t.align ?? 'start';
  const x = !t.w || a === 'start' ? t.x : a === 'end' ? t.x + t.w : t.x + t.w / 2;
  return (
    <text data-id={t.id} transform={transform} x={x} y={t.y} fontSize={t.size} fill={fill} textAnchor={a}>
      {lines.map((l, i) => (
        <tspan key={i} x={x + (a === 'start' ? l.indent * t.size * 0.6 : 0)} y={t.y + i * t.size * LINE_GAP}>
          {l.prefix}
          {l.runs.map((r, k) => (
            <tspan key={k} fontWeight={r.b ? 700 : undefined} fontStyle={r.i ? 'italic' : undefined} textDecoration={r.u ? 'underline' : undefined}>{r.s}</tspan>
          ))}
          {/* Riga vuota: un carattere invisibile tiene il posto */}
          {!l.prefix && !l.runs.length ? '\u200b' : null}
        </tspan>
      ))}
    </text>
  );
}

/** Larghezza del disegnino del contatto nell'immagine dei contatti (mm, con l'altezza predefinita) */
const CONTACT_GLYPH_W = 3.2;

/**
 * Disegnino di un contatto in orizzontale accanto al rimando: il polo del simbolo della libreria (NA,
 * NC, in scambio o di potenza con il semicerchio) ruotato con il morsetto 1 a destra; x, y: estremo
 * sinistro sulla linea dei morsetti
 */
function ContactGlyph({ kind, x, y, k, color }: { kind: string; x: number; y: number; k: number; color: string }) {
  const pole = contactPole(kind);
  const s = (CONTACT_GLYPH_W * k) / 16;
  return (
    <g transform={`translate(${x + 16 * s} ${y}) scale(${s}) rotate(90)`} stroke={color} color={color} strokeWidth={0.16 / s} fill="none" strokeLinecap="round">
      {pole.prims.map((p, i) => <PrimSvg key={i} p={p} />)}
    </g>
  );
}

/**
 * Immagine dei contatti con i simboli: un contatto per riga, ruotato in orizzontale con
 * i morsetti sopra le linee e il rimando a sinistra; la linea tratteggiata del comando passa per le
 * lame sulla verticale cx. bottom: righe che finiscono a y (in fondo alla pagina), altrimenti che
 * cominciano a y (sotto il simbolo)
 */
function ContactImageSymbols({ contacts, cx, y, bottom, xs, fill }: { contacts: NonNullable<CrossRefInfo['contacts']>; cx: number; y: number; bottom: boolean; xs: number; fill: string }) {
  const rows = contactImageRows(contacts);
  if (!rows.length) return null;
  const { s, pinSize } = contactImageScale(xs);
  const geo = rows.map(r => rowGeometry(r, s, pinSize));
  const st = stackRows(geo);
  const y0 = bottom ? y - st.bottom : y - st.top;
  const ox = cx - BLADE_X * s;
  return (
    <g fill={fill} fontSize={pinSize}>
      <line x1={cx} y1={y0 + st.top} x2={cx} y2={y0 + st.bottom} stroke={look.ink} strokeWidth={0.18} strokeDasharray="1 0.6" />
      {rows.map((r, i) => {
        const g = geo[i], yr = y0 + st.ys[i];
        return (
          <g key={i}>
            <g transform={`translate(${ox} ${yr}) scale(${s}) rotate(90)`} stroke={look.ink} color={look.ink} strokeWidth={0.18 / s} fill="none" strokeLinecap="round">
              {r.prims.map((p, j) => <PrimSvg key={j} p={p} />)}
            </g>
            <g stroke="none">
              {g.labels.map((l, j) => l.text ? <text key={j} x={ox + l.x} y={yr + l.y} textAnchor="middle">{l.text}</text> : null)}
              {r.location && <RefText x={ox + g.left - 1} y={yr - 0.3} size={xs} anchor="end" refs={[{ loc: r.location, id: r.id }]} />}
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Allineamento della sigla scelto nel simbolo, sullo schema: specchiato o capovolto si inverte */
export const SymbolView = memo(function SymbolView({ inst, sym, derived, selected }: {
  inst: SymbolInstance; sym: SymbolDef; derived: PageDerived; selected: boolean;
}) {
  if (inst.pairOf && inst.pairCompact) return <PairCompactView inst={inst} sym={sym} derived={derived} selected={selected} />;
  const tr = `translate(${inst.x} ${inst.y}) rotate(${inst.rot})${inst.mirror ? ' scale(-1 1)' : ''}`;
  const color = selected ? SEL : look.ink;
  // Posizione dei testi: scelta nell'editor per questa rotazione o automatica (symbolTexts.ts)
  const tagP = textPlace(inst, sym, 'tag')!, linesP = textPlace(inst, sym, 'lines')!;
  const tag0 = { x: tagP.x, y: tagP.y };
  // Testi spostati a mano sullo schema (se l'impostazione del progetto lo permette): sigla e righe
  // sotto la sigla ciascuna per conto suo
  const off = (k: TextMoveKey) => textOffset(inst, k, derived.freeTexts);
  const tagW = { x: tag0.x + off('tag').x, y: tag0.y + off('tag').y };
  const linesW = { x: linesP.x + off('lines').x, y: linesP.y + off('lines').y };
  // Nei nodi di rete la sigla sta dentro il riquadro, allineata a sinistra
  const anchor = tagP.anchor ?? 'middle';
  const linesAnchor = linesP.anchor ?? anchor;
  const labels = derived.labels.get(inst.id) ?? {};
  // Colore e altezza dei testi: quelli del progetto; selezionato o in bianco e nero, il colore del simbolo
  const ts = (k: TextStyleKey) => {
    const s = derived.textStyles?.[k] ?? DEFAULT_TEXT[k];
    return { size: s.size, fill: selected || derived.mono ? undefined : s.color };
  };
  const sTag = ts(sym.role === 'link' ? 'linkName' : sym.role === 'potential' ? 'potential' : 'tag');
  const sDev = ts('deviceText'), sXref = ts('xref'), sPin = ts('pinLabel'), sTerm = ts('terminal'), sRefs = ts('linkRefs');
  /** Passo delle righe sotto la sigla (2,6 mm con l'altezza predefinita 1,9) */
  const lineStep = Math.max(sDev.size, sXref.size) * 1.37;
  /** Attributi dei testi che si trascinano a mano sullo schema (vedi Canvas): solo se non sono bloccati */
  const movable = (k: TextMoveKey) => (derived.freeTexts || k === 'contacts' ? { 'data-devtext': inst.id, 'data-key': k } : {});
  // Proprietà nascoste sullo schema (interruttore mostra/nascondi nelle proprietà)
  const vis = (k: SymVisKey) => derived.show?.get(inst.id)?.[k] !== false;
  const xr = vis('xref') ? derived.xrefs.get(inst.id) : undefined;
  const isNet = sym.role === 'potential' || sym.role === 'link';
  const tagText = isNet ? (vis('tag') ? inst.tag : '') : inst.tag ? (derived.designations.get(inst.id) ?? `-${inst.tag}`) : '';
  const lines: (string | Ref[])[] = [...(derived.deviceLines.get(inst.id) ?? [])];
  if (xr?.mainLocation) lines.push([{ loc: xr.mainLocation, id: xr.mainId }]);
  // Rimando senza corrispondente: in attesa (non ancora disegnato) è segnalato a colori con «/…»;
  // lasciato solo per scelta o in fondo a una catena è la fine del conduttore e si scrive «//», in nero
  const noTarget = sym.role === 'link' && !derived.linkTargets.get(inst.id)?.length;
  const unpaired = noTarget && !!derived.linkWaiting?.has(inst.id);
  if (sym.role === 'netnode' && vis('netAddress')) {
    const ip = nodeIp(inst);
    if (ip) lines.push(ip);
    if (inst.netAddress && inst.netAddress !== ip) lines.push(inst.netAddress);
  }
  if (sym.role === 'link') {
    const t = derived.linkTargets.get(inst.id);
    lines.push(t?.length ? t.map(x => ({ loc: x.loc, id: x.id })) : unpaired ? '/…' : '//');
  }
  // Morsetti, come in EPLAN: su un filo verticale la morsettiera a sinistra e il numero a destra;
  // su un filo orizzontale il numero sopra e la morsettiera sotto
  const isTerm = sym.role === 'terminal' || sym.role === 'pin';
  const termNum = isTerm && vis('tag') ? inst.tag.slice(inst.tag.indexOf(':') + 1) : undefined;
  // La sigla della morsettiera si mostra o si nasconde a parte; senza scelta solo sul primo morsetto
  const stripOn = derived.show?.get(inst.id)?.strip ?? derived.stripLabel.has(inst.id);
  const termStrip = isTerm && stripOn ? `-${inst.tag.includes(':') ? inst.tag.slice(0, inst.tag.indexOf(':')) : inst.tag}` : undefined;
  const termL = isTerm ? (() => {
    const l = terminalTextLayout(inst, inst.termText ?? derived.terminalText, sTerm.size);
    // Posizione scelta nell'editor; senza un orientamento scelto lì, quello delle impostazioni
    const own = (k: 'termNum' | 'termStrip', d: typeof l.num) => { const p = orientPlace(inst, sym, k); return p ? { ...d, ...p, anchor: p.anchor ?? d.anchor, rot: p.rot ?? d.rot } : d; };
    const num = own('termNum', l.num), strip = own('termStrip', l.strip);
    return { num: { ...num, x: num.x + off('termNum').x, y: num.y + off('termNum').y }, strip: { ...strip, x: strip.x + off('termStrip').x, y: strip.y + off('termStrip').y } };
  })() : undefined;
  const turnT = (p: { x: number; y: number; rot?: number }) => (p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined);

  let mirrorBox: ReactNode = null;
  if (xr?.contacts && xr.contacts.length) {
    const ws = sym.pins.map(p => toWorld(inst, p));
    const kind = (k: string) => k === 'NO' ? 'NA' : k === 'NC' ? 'NC' : k === 'CO' ? 'SC' : 'P';
    const atBottom = !!(inst.contactImage ? inst.contactImage === 'bottom' : derived.contactImageBottom);
    // Nel testo compatto solo i contatti disegnati (con il rimando), non quelli di riserva dell'articolo
    const textContacts = xr.contacts.filter((c): c is typeof c & { location: string } => !!c.location);
    if (!derived.contactImageText) {
      // Simboli dei contatti sulla verticale della bobina: in fondo alla pagina o sotto il simbolo
      const cx = (Math.min(...ws.map(w => w.x)) + Math.max(...ws.map(w => w.x))) / 2;
      const xs = Math.round(sXref.size * 0.9 * 100) / 100;
      mirrorBox = <ContactImageSymbols contacts={xr.contacts} cx={cx} y={atBottom ? FRAME.bottom - 1.2 : Math.max(...ws.map(w => w.y)) + 3} bottom={atBottom} xs={xs} fill={sXref.fill ?? look.ink} />;
    } else if (atBottom) {
      // Come EPLAN: in fondo alla pagina, sotto la barra 0 V, sulla verticale della bobina.
      // Contatti NA (e altri) a sinistra della linea, NC a destra
      const cx = (Math.min(...ws.map(w => w.x)) + Math.max(...ws.map(w => w.x))) / 2;
      // I contatti di potenza vanno uno per riga a coppie di morsetti (1-2, 3-4, 5-6), prima degli ausiliari
      const split = textContacts.flatMap(c => {
        const ps = c.labels.split('-');
        if (c.kind === 'CO' || c.kind === 'NO' || c.kind === 'NC' || ps.length < 4 || ps.length % 2) return [c];
        return Array.from({ length: ps.length / 2 }, (_, k) => ({ ...c, kind: 'P', labels: `${ps[2 * k]}-${ps[2 * k + 1]}` }));
      });
      const left = [...split.filter(c => c.kind !== 'NC' && c.kind !== 'NO' && c.kind !== 'CO'), ...split.filter(c => c.kind === 'NO' || c.kind === 'CO')];
      const right = split.filter(c => c.kind === 'NC');
      const rows = Math.max(left.length, right.length);
      // Riferimenti incrociati: un po' più piccoli dell'altezza scelta (1,7 con quella predefinita 1,9)
      const xs = Math.round(sXref.size * 0.9 * 100) / 100;
      const step = Math.max(2.4, xs * 1.4), yb = FRAME.bottom - 1.8, y0 = yb - (rows - 1) * step;
      // Pin vicini alla linea, rimando all'esterno
      const text = (c: typeof left[number]) => c.kind === 'CO' ? `${kind(c.kind)} ${c.labels}` : c.labels;
      // Accanto al rimando un piccolo disegno del contatto (NA, NC, in scambio, di potenza)
      const g = CONTACT_GLYPH_W * (xs / 1.7);
      const col = (list: typeof left, side: -1 | 1) => list.map((c, i) => {
        const txt = text(c);
        const w = Math.max(...list.map(x => text(x).length)) * xs * 0.56;
        const gx = side < 0 ? cx - 1.6 - w - g : cx + 1.6 + w;
        return (
          <g key={`${side}${i}`}>
            <text x={cx + side * 1} y={y0 + i * step} textAnchor={side < 0 ? 'end' : 'start'}>{txt}</text>
            <ContactGlyph kind={c.kind} x={gx} y={y0 + i * step - xs * 0.35} k={xs / 1.7} color={sXref.fill ?? look.ink} />
            <RefText x={cx + side * (2.2 + w + g)} y={y0 + i * step} size={xs} anchor={side < 0 ? 'end' : 'start'} refs={[{ loc: c.location, id: c.id }]} />
          </g>
        );
      });
      mirrorBox = (
        <g fill={sXref.fill ?? look.ink} fontSize={xs}>
          <line x1={cx} y1={y0 - step + 0.6} x2={cx} y2={yb + 0.8} stroke={look.ink} strokeWidth={0.2} />
          <g stroke="none">{col(left, -1)}{col(right, 1)}</g>
        </g>
      );
    } else {
      const y0 = Math.max(...ws.map(w => w.y)) + 3;
      const x0 = Math.min(...ws.map(w => w.x)) - 4;
      const k = sXref.size / 1.9, g = CONTACT_GLYPH_W * k;
      mirrorBox = (
        <g fill={sXref.fill ?? look.ink} stroke="none" fontSize={sXref.size * 0.95}>
          {textContacts.map((c, i) => (
            <g key={i}>
              <ContactGlyph kind={c.kind} x={x0} y={y0 + i * sXref.size * 1.37 - sXref.size * 0.35} k={k} color={sXref.fill ?? look.ink} />
              <text x={x0 + g + 0.8} y={y0 + i * sXref.size * 1.37}>{c.labels}</text>
              <RefText x={x0 + g + 0.8 + sXref.size * 4.6} y={y0 + i * sXref.size * 1.37} size={sXref.size * 0.95} refs={[{ loc: c.location, id: c.id }]} />
            </g>
          ))}
        </g>
      );
    }
  }

  return (
    <g data-id={inst.id}>
      <g transform={tr} stroke={color} color={color} strokeWidth={look.w.symbol} fill="none" strokeLinecap="round">
        <SymbolGraphic sym={sym} noText />
      </g>
      <g color={color}><SymbolTexts inst={inst} sym={sym} /></g>
      <g fill={color} stroke="none">
        {isTerm && termL ? (
          <>
            {termStrip && <text x={termL.strip.x} y={termL.strip.y} fontSize={sTerm.size * 1.16} fill={sTerm.fill} textAnchor={termL.strip.anchor} transform={turnT(termL.strip)} {...movable('termStrip')}>{termStrip}</text>}
            {termNum && <text x={termL.num.x} y={termL.num.y} fontSize={sTerm.size} fill={sTerm.fill} textAnchor={termL.num.anchor} transform={turnT(termL.num)} {...movable('termNum')}>{termNum}</text>}
          </>
        ) : sym.role === 'link' ? (() => {
          const l = linkTextLayout(inst);
          const t = derived.linkTargets.get(inst.id);
          // Rimando verticale: testi ruotati di -90° attorno al loro punto di attacco
          const turn = (p: { x: number; y: number; rot?: number }) => (p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined);
          // Nome e pagine di destinazione si possono nascondere uno per uno
          return (
            <>
              {vis('tag') && <text x={l.name.x} y={l.name.y} fontSize={sTag.size} fill={sTag.fill} fontWeight={600} textAnchor={l.name.anchor} transform={turn(l.name)}>{tagText || '?'}</text>}
              {vis('refs') && <g transform={turn(l.refs)} fill={sRefs.fill}>
                {t?.length
                  ? <RefText x={l.refs.x} y={l.refs.y} size={sRefs.size} anchor={l.refs.anchor}
                      refs={[...t.slice(0, 2).map(x => ({ loc: x.loc, id: x.id })), ...(t.length > 2 ? [{ loc: `+${t.length - 2}`, more: true }] : [])]} />
                  : unpaired
                    ? <text x={l.refs.x} y={l.refs.y} fontSize={sRefs.size} textAnchor={l.refs.anchor} fill={look.c.unpaired}>/…</text>
                    : <text x={l.refs.x} y={l.refs.y} fontSize={sRefs.size} textAnchor={l.refs.anchor}>//</text>}
              </g>}
            </>
          );
        })() : tagText && (
          <text x={tagW.x} y={tagW.y} fontSize={sTag.size} fill={sTag.fill} fontWeight={isNet ? 600 : 500} textAnchor={anchor} transform={tagP.rot ? `rotate(${tagP.rot} ${tagW.x} ${tagW.y})` : undefined} {...movable('tag')}>{tagText}</text>
        )}
        {sym.role !== 'link' && lines.length > 0 && (
          // Righe girate attorno al loro punto se nell'editor è scelto un orientamento
          <g transform={linesP.rot ? `rotate(${linesP.rot} ${linesW.x} ${linesW.y})` : undefined} {...movable('lines')}>
            {lines.map((l, i) => typeof l === 'string'
              ? <text key={i} x={linesW.x} y={linesW.y + lineStep * (i + 1)} fontSize={sDev.size} textAnchor={linesAnchor} fill={unpaired ? look.c.unpaired : sDev.fill}>{l}</text>
              : <g key={i} fill={sXref.fill}><RefText x={linesW.x} y={linesW.y + lineStep * (i + 1)} size={sXref.size} anchor={linesAnchor} refs={l} /></g>)}
          </g>
        )}
        {sym.textBox && (() => {
          // Testi nel riquadro: uno sotto l'altro, a capo da soli; il primo (indirizzo) in grassetto
          const st = ts('plcText');
          const fs = sym.fields ?? [];
          const vals = fs.map(f => derived.deviceFields.get(inst.id)?.[f.f] ?? '');
          return flowLines(sym.textBox, vals, st.size).map((l, i) => {
            const w = toWorld(inst, l);
            return <text key={`b${i}`} x={w.x} y={w.y} fontSize={st.size} fill={st.fill} fontWeight={fs[l.index]?.f === 'plcAddress' ? 600 : undefined}>{l.s}</text>;
          });
        })()}
        {!sym.textBox && sym.fields?.map((f, i) => {
          const v = derived.deviceFields.get(inst.id)?.[f.f];
          if (!v) return null;
          const r = textPlace(inst, sym, f.f)!;
          const x = r.x + off(f.f).x, y = r.y + off(f.f).y;
          return <text key={`f${i}`} x={x} y={y} fontSize={f.size ?? 1.9} textAnchor={r.anchor} transform={r.rot ? `rotate(${r.rot} ${x} ${y})` : undefined} {...movable(f.f)}>{v}</text>;
        })}
        {!isNet && !isTerm && vis('pins') && sym.pins.map(p => {
          const k = `pin:${p.id}` as const;
          const w = textPlace(inst, sym, k, { pinSize: sPin.size })!;
          const lbl = labels[p.id] ?? p.label;
          const x = w.x + off(k).x, y = w.y + off(k).y;
          return lbl ? <text key={p.id} x={x} y={y} fontSize={sPin.size} fill={sPin.fill} textAnchor={w.anchor && w.anchor !== 'start' ? w.anchor : undefined} transform={w.rot ? `rotate(${w.rot} ${x} ${y})` : undefined} {...movable(k)}>{lbl}</text> : null;
        })}
      </g>
      {mirrorBox && (() => {
        // L'immagine dei contatti si trascina dove si vuole
        const o = off('contacts');
        return <g transform={o.x || o.y ? `translate(${o.x} ${o.y})` : undefined} {...movable('contacts')}>{mirrorBox}</g>;
      })()}
      {sym.role === 'plc' && sym.io && <PlcLabel inst={inst} sym={sym} derived={derived} color={color} vis={vis} />}
    </g>
  );
});

/**
 * Rappresentazione ridotta di un contatto (riferimento a coppie): il simbolo vero più piccolo, senza
 * sigla, con i morsetti e il rimando al contatto vero; in verticale il rimando è scritto sotto, girato
 * come il simbolo (dal basso verso l'alto), in orizzontale a sinistra
 */
function PairCompactView({ inst, sym, derived, selected }: { inst: SymbolInstance; sym: SymbolDef; derived: PageDerived; selected: boolean }) {
  const st = derived.textStyles?.xref ?? DEFAULT_TEXT.xref;
  const size = inst.pairSize ?? st.size;
  const fill = selected ? SEL : derived.mono ? look.ink : st.color;
  const ink = selected ? SEL : look.ink;
  const prims = sym.prims.filter(p => p.t !== 'text');
  const { b, c } = pairCenter(sym);
  const k = pairScale(inst);
  const labels = derived.labels.get(inst.id) ?? {};
  const xr = derived.xrefs.get(inst.id);
  const vertical = pairVertical(inst);
  const half = ((b.y1 - b.y0) * k) / 2;
  const pinSize = size * 0.85;
  const rx = inst.x + size * 0.35, ry = inst.y + half + 0.8;
  return (
    <g data-id={inst.id}>
      <g transform={`translate(${inst.x} ${inst.y}) rotate(${inst.rot})${inst.mirror ? ' scale(-1 1)' : ''} scale(${k}) translate(${-c.x} ${-c.y})`}
        stroke={ink} color={ink} strokeWidth={0.22 / k} fill="none" strokeLinecap="round">
        <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="transparent" stroke="none" />
        {prims.map((p, i) => <PrimSvg key={i} p={p} />)}
      </g>
      <g fill={fill} stroke="none" fontSize={pinSize}>
        {sym.pins.map(p => {
          const lbl = labels[p.id] ?? p.label;
          if (!lbl) return null;
          const q = pairToWorld(inst, sym, p);
          return vertical
            ? <text key={p.id} x={q.x + 0.5} y={q.y < inst.y ? q.y + pinSize : q.y - 0.3}>{lbl}</text>
            : <text key={p.id} x={q.x + (q.x < inst.x ? 1.3 : -1.3)} y={q.y - 0.5} textAnchor="middle">{lbl}</text>;
        })}
        {xr?.mainLocation && (vertical
          ? <g transform={`rotate(-90 ${rx} ${ry})`}><RefText x={rx} y={ry} size={size} anchor="end" refs={[{ loc: xr.mainLocation, id: xr.mainId }]} /></g>
          : <RefText x={inst.x - half - 0.8} y={inst.y + size * 0.35} size={size} anchor="end" refs={[{ loc: xr.mainLocation, id: xr.mainId }]} />)}
      </g>
    </g>
  );
}

/** Indirizzo dentro il riquadro del punto I/O e nome simbolico a destra */
function PlcLabel({ inst, sym, derived, color, vis }: { inst: SymbolInstance; sym: SymbolDef; derived: PageDerived; color: string; vis: (k: SymVisKey) => boolean }) {
  const t = derived.plcTexts.get(inst.id);
  const box = sym.prims.find(p => p.t === 'rect');
  if (!box || box.t !== 'rect') return null;
  const c = toWorld(inst, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const right = toWorld(inst, { x: box.x + box.w + 1, y: box.y + box.h / 2 });
  // Blocchetto con i testi PLC propri: qui restano solo il rimando alla panoramica o il "?" del canale mancante
  if (sym.fields?.some(f => f.f.startsWith('plc'))) {
    return (
      <g fill={t ? color : '#cf222e'} stroke="none">
        {!t && <text x={c.x} y={c.y + 0.9} fontSize={2.4} fontWeight={600} textAnchor="middle">?</text>}
        {t?.ref && <RefText x={right.x} y={right.y + 0.7} size={1.7} refs={[{ loc: t.ref }]} />}
      </g>
    );
  }
  return (
    <g fill={t ? color : '#cf222e'} stroke="none">
      {(!t || vis('plcAddress')) && <text x={c.x} y={c.y + 0.9} fontSize={2.4} fontWeight={600} textAnchor="middle">{t?.address ?? '?'}</text>}
      {t?.symbol && vis('plcSymbol') && <text x={right.x} y={right.y + 0.7} fontSize={1.9}>{t.symbol}</text>}
      {t?.ref && <RefText x={right.x} y={right.y + 3.2} size={1.7} refs={[{ loc: t.ref }]} />}
    </g>
  );
}

export function Frame({ project, page, pageIndex }: { project: Project; page: Page; pageIndex: number }) {
  const colW = (FRAME.right - FRAME.left) / COLUMNS;
  return (
    <g stroke={look.ink} strokeWidth={look.w.frameInner} fill="none">
      <rect x={FRAME.left} y={FRAME.top} width={FRAME.right - FRAME.left} height={FRAME.bottom - FRAME.top} strokeWidth={look.w.frame} />
      {Array.from({ length: COLUMNS }, (_, i) => (
        <g key={i}>
          {i > 0 && <line x1={FRAME.left + i * colW} y1={FRAME.top - 5} x2={FRAME.left + i * colW} y2={FRAME.top} />}
          {i > 0 && <line x1={FRAME.left + i * colW} y1={FRAME.bottom} x2={FRAME.left + i * colW} y2={FRAME.bottom + 4} />}
          <text x={FRAME.left + (i + 0.5) * colW} y={FRAME.top - 1.5} fontSize={2.5} textAnchor="middle" stroke="none" fill={look.ink}>{i + 1}</text>
          <text x={FRAME.left + (i + 0.5) * colW} y={FRAME.bottom + 3} fontSize={2.5} textAnchor="middle" stroke="none" fill={look.ink}>{i + 1}</text>
        </g>
      ))}
      <rect x={FRAME.left} y={FRAME.top - 5} width={FRAME.right - FRAME.left} height={5} />
      <rect x={FRAME.left} y={FRAME.bottom} width={FRAME.right - FRAME.left} height={4} />
      {ROWS > 0 && (() => {
        // Righe A, B, C… in una fascia di 4 mm sui due lati della cornice
        const rowH = (FRAME.bottom - FRAME.top) / ROWS;
        return Array.from({ length: ROWS }, (_, i) => (
          <g key={`r${i}`}>
            {i > 0 && <line x1={FRAME.left - 4} y1={FRAME.top + i * rowH} x2={FRAME.left} y2={FRAME.top + i * rowH} />}
            {i > 0 && <line x1={FRAME.right} y1={FRAME.top + i * rowH} x2={FRAME.right + 4} y2={FRAME.top + i * rowH} />}
            <text x={FRAME.left - 2} y={FRAME.top + (i + 0.5) * rowH + 0.9} fontSize={2.5} textAnchor="middle" stroke="none" fill={look.ink}>{String.fromCharCode(65 + i)}</text>
            <text x={FRAME.right + 2} y={FRAME.top + (i + 0.5) * rowH + 0.9} fontSize={2.5} textAnchor="middle" stroke="none" fill={look.ink}>{String.fromCharCode(65 + i)}</text>
          </g>
        )).concat([
          <rect key="rl" x={FRAME.left - 4} y={FRAME.top} width={4} height={FRAME.bottom - FRAME.top} />,
          <rect key="rr" x={FRAME.right} y={FRAME.top} width={4} height={FRAME.bottom - FRAME.top} />,
        ]);
      })()}
      <TitleBlockView project={project} page={page} pageIndex={pageIndex} />
    </g>
  );
}

/** Cartiglio della pagina secondo il modello scelto (vedi titleBlocks.ts) */
export function TitleBlockView({ project, page, pageIndex }: { project: Project; page: Page; pageIndex: number }) {
  const { prims, logo, place } = titleBlockPrims(project, page, pageIndex);
  return (
    <g transform={`translate(${place.x} ${place.y})${place.scale < 1 ? ` scale(${place.scale})` : ''}`} stroke={look.ink} color={look.ink} strokeWidth={0.25} fill="none">
      {prims.map((p, i) => <PrimSvg key={i} p={p} />)}
      {logo && <image href={logo.href} x={logo.x} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMidYMid meet" />}
    </g>
  );
}


/** Rimando a una posizione "pagina.colonna", eventualmente a un elemento preciso */
export interface Ref { loc: string; id?: string; /** Indicazione "+n" di altri rimandi non scritti */ more?: boolean }

/**
 * Uno o più rimandi "/pagina.colonna" affiancati. Ogni rimando porta data-goto (pagina) e
 * data-goto-id (elemento): nell'app si cliccano per andare alla destinazione, nel PDF
 * diventano collegamenti alla pagina.
 */
export function RefText({ x, y, size, refs, anchor = 'start' }: { x: number; y: number; size: number; refs: Ref[]; anchor?: 'start' | 'middle' | 'end' }) {
  const texts = refs.map(r => (r.more ? r.loc : `/${r.loc}`));
  const widths = texts.map(t => t.length * size * 0.56);
  const gap = size * 0.6;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (texts.length - 1);
  let cx = anchor === 'end' ? x - total : anchor === 'middle' ? x - total / 2 : x;
  return (
    <>
      {refs.map((r, i) => {
        const el = (
          r.more
            ? <text key={i} x={cx} y={y} fontSize={size}>{texts[i]}</text>
            : <text key={i} x={cx} y={y} fontSize={size} className="xref" data-goto={pageOfLocation(r.loc)} data-goto-id={r.id}>{texts[i]}</text>
        );
        cx += widths[i] + gap;
        return el;
      })}
    </>
  );
}

/** Numero filo sul tratto più lungo: sopra i tratti orizzontali, ruotato su quelli verticali */
/**
 * Testo del numero filo; i rimandi in fondo («/3 /5» dei bus di conduttori) diventano «/pagina»
 * cliccabili (data-goto, come i rimandi dei contatti), anche nel PDF
 */
function labelBody(text: string, refs?: { page: string; id: string }[]) {
  const tail = refs?.map(r => `/${r.page}`).join(' ');
  if (!refs?.length || !tail || !text.endsWith(tail)) return text;
  return (
    <>
      {text.slice(0, text.length - tail.length)}
      {refs.map((r, i) => <tspan key={r.id}>{i ? ' ' : ''}<tspan className="xref" data-goto={r.page} data-goto-id={r.id}>/{r.page}</tspan></tspan>)}
    </>
  );
}

function WireLabel({ pts, text: raw, color, size = 1.8, pos, wireId, index, refs }: { pts: Pt[]; text: string; color: string; size?: number; pos?: WireLabelPos; wireId?: string; index?: number; refs?: { page: string; id: string }[] }) {
  const text = labelBody(raw, refs);
  if (pos) {
    const data = wireId ? { 'data-wire-label': wireId, 'data-label': index ?? -1, className: 'wire-label' } : {};
    return pos.vertical
      ? <text x={pos.x} y={pos.y} fontSize={size} fill={color} textAnchor="middle" transform={`rotate(-90 ${pos.x} ${pos.y})`} {...data}>{text}</text>
      : <text x={pos.x} y={pos.y} fontSize={size} fill={color} textAnchor="middle" {...data}>{text}</text>;
  }
  let best = -1, len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (l > len) { len = l; best = i; }
  }
  if (best < 0 || len < 6) return null;
  const a = pts[best], b = pts[best + 1];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const vertical = Math.abs(a.x - b.x) < 0.01;
  return vertical
    ? <text x={mx - 0.7} y={my} fontSize={size} fill={color} textAnchor="middle" transform={`rotate(-90 ${mx - 0.7} ${my})`}>{text}</text>
    : <text x={mx} y={my - 0.8} fontSize={size} fill={color} textAnchor="middle">{text}</text>;
}

/**
 * Lineetta obliqua sul filo con colore e sezione: il testo sta a destra dei fili verticali (girato dal
 * basso verso l'alto) e sotto quelli orizzontali, dalla parte opposta al numero filo. Si trascina
 * lungo il filo (data-wire-tick, vedi Canvas)
 */
export function WireTick({ p, text, size, color, ink, wireId }: { p: { x: number; y: number; vertical: boolean }; text: string; size: number; color: string; ink: string; wireId?: string }) {
  // Il testo parte dalla lineetta: verso l'alto sui fili verticali, verso destra sugli orizzontali
  const tx0 = p.vertical ? p.x + 1.3 + size * 0.75 : p.x - 0.9;
  const ty0 = p.vertical ? p.y + 0.9 : p.y + 1.3 + size * 0.75;
  return (
    <g {...(wireId ? { 'data-wire-tick': wireId, className: 'wire-label' } : {})}>
      <circle cx={p.x} cy={p.y} r={1.2} fill="transparent" />
      <line x1={p.x - 0.9} y1={p.y + 0.9} x2={p.x + 0.9} y2={p.y - 0.9} stroke={ink} strokeWidth={0.22} strokeLinecap="round" />
      <text x={tx0} y={ty0} fontSize={size} fill={color} transform={p.vertical ? `rotate(-90 ${tx0} ${ty0})` : undefined}>{text}</text>
    </g>
  );
}

/**
 * Contenuto di una pagina proiettata: la pagina di origine ritagliata sul riquadro (con un margine per
 * la scritta del riquadro), solo disegno; sotto, il rimando cliccabile alla pagina di origine
 */
function ProjectedZone({ project, page, data }: { project: Project; page: Page; data: NonNullable<PageDerived['projected']> }) {
  const { page: src, derived: sd, zone: z } = data;
  const m = 3, cid = `proj-${page.id}`;
  const panel = project.panels?.find(p => p.id === src.panelId);
  const ts = (sd.textStyles ?? DEFAULT_TEXT).xref;
  return (
    <g>
      <defs><clipPath id={cid}><rect x={z.x - m} y={z.y - m - 6} width={z.w + 2 * m} height={z.h + 2 * m + 6} /></clipPath></defs>
      <g clipPath={`url(#${cid})`} pointerEvents="none">
        <PageContent project={project} page={src} pageIndex={project.pages.indexOf(src)} derived={sd} bare />
      </g>
      <text x={z.x} y={Math.min(z.y + z.h + m + 4, FRAME.bottom - 2)} fontSize={ts.size * 1.1} fill={sd.mono ? look.ink : ts.color} className="xref" data-goto={src.name}>
        {tx('Disegnato a pagina /{0}{1}: qui è solo rappresentato', src.name, panel ? ` (+${panel.code})` : '')}
      </text>
    </g>
  );
}

/** Pagina di lista dentro il progetto: tabella con intestazione, posizioni cliccabili */
/** Simbolo disegnato in una cella di lista (legenda): ridotto se serve, al centro della cella */
function CellSymbol({ sym, x, y, w, h }: { sym: SymbolDef; x: number; y: number; w: number; h: number }) {
  const b = primBounds(plotPrims(sym).filter(p => p.t !== 'text'));
  const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
  const k = Math.min(1, (w - 3) / bw, (h - 2) / bh);
  const tx0 = x + w / 2 - ((b.x0 + b.x1) / 2) * k, ty0 = y + h / 2 - ((b.y0 + b.y1) / 2) * k;
  return (
    <g transform={`translate(${tx0} ${ty0}) scale(${k})`} stroke={look.ink} color={look.ink} strokeWidth={0.3 / k} fill="none" strokeLinecap="round">
      <SymbolGraphic sym={sym} />
    </g>
  );
}

function ReportPage({ data }: { data?: ReportSheet }) {
  if (!data) return <text x={30} y={30} fontSize={4} fill="#cf222e">{tx('Lista vuota o non più presente: rigenera le pagine di lista')}</text>;
  const { table: t, style: st, keys } = data;
  const D = REPORT_DEFAULTS;
  const { x0, x1 } = REPORT_X;
  const top = FRAME.top + 14, rowH = t.rowH ?? D.rowH, headH = styledHeadH(st);
  const size = st.textSize ?? D.textSize, headSize = st.headSize ?? D.headSize;
  const ink = st.textColor ?? look.ink, headInk = st.headColor ?? look.ink;
  const lw = st.lineWidth ?? D.lineWidth;
  const cols = reportColumns(t, st, keys);
  const fit = (s: string, w: number, sz: number) => { const n = Math.floor((w - 1) / (sz * 0.55)); return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s; };
  const tx0 = (c: ReportCol) => (c.align === 'middle' ? c.x + c.w / 2 : c.align === 'end' ? c.x + c.w - 1 : c.x + 1);
  const bottom = top + headH + rowH * t.rows.length;
  const titleX = st.titleAlign === 'middle' ? (x0 + x1) / 2 : st.titleAlign === 'end' ? x1 : x0;
  return (
    <g>
      <text x={titleX} y={FRAME.top + 8} fontSize={st.titleSize ?? D.titleSize} fontWeight={600} textAnchor={st.titleAlign ?? 'start'} fill={st.titleColor ?? look.ink}>{st.title || t.title}</text>
      <rect x={x0} y={top} width={x1 - x0} height={headH} fill={st.headFill ?? D.headFill} />
      {st.zebra && t.rows.map((_, k) => (k % 2 ? <rect key={`z${k}`} x={x0} y={top + headH + rowH * k} width={x1 - x0} height={rowH} fill={st.zebra} /> : null))}
      {cols.map((c, k) => (
        <g key={c.key}>
          <text x={tx0(c)} y={top + headH / 2 + headSize * 0.36} fontSize={headSize} fontWeight={st.headBold === false ? undefined : 600} textAnchor={c.align} fill={headInk}>{fit(c.label, c.w, headSize)}</text>
          {/* Maniglia sul bordo destro dell'intestazione: trascinando si cambia la larghezza della colonna */}
          <rect x={c.x + c.w - 1} y={top} width={2} height={headH} fill="transparent" className="report-col-handle" data-repcol={`${k}`} data-repcol-key={c.key} data-repcol-x={c.x} />
        </g>
      ))}
      {st.vLines && cols.slice(1).map(c => <line key={c.key} x1={c.x} y1={top} x2={c.x} y2={bottom} stroke={st.lineColor ?? D.vLineColor} strokeWidth={lw + 0.03} />)}
      {st.vLines && <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill="none" stroke={st.lineColor ?? D.vLineColor} strokeWidth={lw + 0.03} />}
      {t.rows.map((r, k) => {
        const y = top + headH + rowH * k;
        const sym = t.symbols?.[k];
        const symCol = sym ? cols.find(c => c.i === 0) : undefined;
        return (
          <g key={k}>
            {st.hLines !== false && <line x1={x0} y1={y + rowH} x2={x1} y2={y + rowH} stroke={st.lineColor ?? D.lineColor} strokeWidth={lw} />}
            {sym && symCol && <CellSymbol sym={sym} x={symCol.x} y={y} w={symCol.w} h={rowH} />}
            {cols.map(c => {
              const goto = t.goto?.[k]?.[c.i];
              const cs = st.columns?.[c.key], sz = cs?.size ?? size;
              const v = fit(r[c.i] ?? '', c.w, sz), ty = y + rowH / 2 + sz * 0.43;
              return goto
                ? <text key={c.key} x={tx0(c)} y={ty} fontSize={sz} fontWeight={cs?.bold ? 600 : undefined} textAnchor={c.align} className="xref" data-goto={goto} fill="#0b5cad">{v}</text>
                : <text key={c.key} x={tx0(c)} y={ty} fontSize={sz} fontWeight={cs?.bold ? 600 : undefined} textAnchor={c.align} fill={cs?.color ?? ink}>{v}</text>;
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Copertina: logo, titolo, dati del progetto, tabella delle revisioni e caselle delle firme */
function CoverPage({ project }: { project: Project }) {
  const i = project.info, tb = project.titleBlock;
  const { t } = translator(project);
  const cx = PAGE_W / 2;
  const s = coverStyleOf(project), D = COVER_DEFAULTS;
  const logo = { ...D.logo, ...s.logo };
  const labelSize = s.labelSize ?? D.labelSize, valueSize = s.valueSize ?? D.valueSize;
  const rowsY = s.rowsY ?? D.rowsY, gap = s.rowGap ?? D.rowGap;
  // Nomi di serie tradotti; quelli scritti dall'utente passano solo dal dizionario del progetto
  const lines = coverLines(project, s).filter(l => !l.hidden);
  const revs = (project.revisions ?? []).slice(-(s.revisions ?? D.revisions));
  const signs = s.signatures ?? D.signatures;
  return (
    <g>
      {tb?.logo && !logo.hidden && <image href={tb.logo} x={cx - logo.w / 2} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMidYMid meet" />}
      <text x={cx} y={s.titleY ?? D.titleY} fontSize={s.titleSize ?? D.titleSize} fontWeight={700} textAnchor="middle" fill={look.ink}>{t(i.name)}</text>
      {i.description && <text x={cx} y={(s.titleY ?? D.titleY) + 10} fontSize={s.descSize ?? D.descSize} textAnchor="middle" fill={look.ink}>{t(i.description)}</text>}
      {lines.map((l, k) => (
        <g key={l.key}>
          <text x={cx - 70} y={rowsY + k * gap} fontSize={labelSize} fill="#5b636d">{t(l.label)}</text>
          <text x={cx - 20} y={rowsY + k * gap} fontSize={valueSize} fill={look.ink}>{(l.free ? l.value : t(l.value)) || '—'}</text>
        </g>
      ))}
      {(s.revisions ?? D.revisions) > 0 && <g fontSize={2.6} fill={look.ink}>
        <text x={FRAME.left + 10} y={190} fontWeight={600} fontSize={3}>{t('Revisioni')}</text>
        {revs.map((r, k) => (
          <g key={r.id}>
            <text x={FRAME.left + 10} y={197 + k * 5}>{r.index}</text>
            <text x={FRAME.left + 22} y={197 + k * 5}>{r.date}</text>
            <text x={FRAME.left + 48} y={197 + k * 5}>{r.author}</text>
            <text x={FRAME.left + 70} y={197 + k * 5}>{r.description.slice(0, 70)}</text>
          </g>
        ))}
        {!revs.length && <text x={FRAME.left + 10} y={197} fill="#8a929c">{t('Nessuna revisione congelata')}</text>}
      </g>}
      {signs.map((l, k) => (
        <g key={k}>
          <rect x={FRAME.right - signs.length * 50 + k * 50} y={190} width={46} height={26} fill="none" stroke={look.ink} strokeWidth={0.3} />
          <text x={FRAME.right - signs.length * 50 + 2 + k * 50} y={195} fontSize={2.6} fill="#5b636d">{t(l)}</text>
        </g>
      ))}
    </g>
  );
}

/** Nuvoletta di revisione attorno a un ingombro: archi lungo il perimetro */
function Cloud({ cloud: { box, index, notes } }: { cloud: RevisionCloud }) {
  const pad = 2.5, r = 2;
  const x0 = box[0] - pad, y0 = box[1] - pad, x1 = box[2] + pad, y1 = box[3] + pad;
  const pts: Pt[] = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (2 * r)));
    for (let i = 0; i < n; i++) pts.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n });
  };
  side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
  const d = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const rr = Math.hypot(q.x - p.x, q.y - p.y) / 2 || r;
    return `${i === 0 ? `M${p.x} ${p.y}` : ''} A${rr} ${rr} 0 0 1 ${q.x} ${q.y}`;
  }).join(' ');
  // Triangolo con l'indice della revisione sull'angolo in alto a destra, le note accanto
  const tx0 = x1 + 1, ty = y0 - 1, ts = 4.2;
  return (
    <g className="revision-cloud">
      <path d={d} fill="none" stroke={look.c.cloud} strokeWidth={look.w.cloud} />
      <path d={`M${tx0} ${ty} L${tx0 + ts} ${ty} L${tx0 + ts / 2} ${ty - ts * 0.87} Z`} fill={look.c.paper} stroke={look.c.cloud} strokeWidth={look.w.cloud} />
      <text x={tx0 + ts / 2} y={ty - 0.75} fontSize={index.length > 1 ? 1.5 : 2} textAnchor="middle" fill={look.c.cloud} fontWeight={600}>{index}</text>
      {notes.map((n, k) => <text key={k} x={tx0 + ts + 1} y={ty - 1.6 + k * 2.6} fontSize={2} fill={look.c.cloud}>{n}</text>)}
    </g>
  );
}

/** Trattini obliqui che indicano il numero di conduttori su una linea unifilare */
function PoleTicks({ pts, n, color }: { pts: Pt[]; n: number; color: string }) {
  let best = -1, len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (l > len) { len = l; best = i; }
  }
  if (best < 0) return null;
  const a = pts[best], b = pts[best + 1];
  const vertical = Math.abs(a.x - b.x) < 0.01;
  // Un po' prima del centro, per non coprire il testo della linea
  const cx = a.x + (b.x - a.x) * 0.3, cy = a.y + (b.y - a.y) * 0.3;
  return (
    <g stroke={color} strokeWidth={0.3}>
      {Array.from({ length: n }, (_, i) => {
        const o = (i - (n - 1) / 2) * 1.2;
        const x = vertical ? cx : cx + o, y = vertical ? cy + o : cy;
        return <line key={i} x1={x - 1.2} y1={y + 1.2} x2={x + 1.2} y2={y - 1.2} />;
      })}
    </g>
  );
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Pagina panoramica di una scheda PLC, generata dai dati del progetto */
function PlcOverview({ data, t, S }: { data?: OverviewData; t: (s: string) => string; S: ResolvedDrawingStyle }) {
  if (!data) {
    return <text x={30} y={30} fontSize={4} fill="#cf222e">{tx('Scheda PLC eliminata: rigenera le pagine panoramiche dalla vista PLC')}</text>;
  }
  const h = overviewRowHeight(data.rows.length);
  const { top, x, w } = OVERVIEW;
  const bottom = top + h * data.rows.length;
  const MUTED = '#8a929c';
  const col = { term: x - 10, ch: x + 2, addr: x + w - 2, sym: x + w + 6, comment: x + w + 66, conn: x + w + 166, loc: 372 };
  return (
    <g fontFamily="inherit">
      <text x={28} y={21} fontSize={S.titleSize} fontWeight={600} fill={look.ink}>{`${t('Scheda PLC')} -${data.tag}`}</text>
      <text x={28} y={21 + Math.max(6, S.titleSize * 1.5)} fontSize={S.titleSize * 0.65} fill={look.ink}>{`${t(data.title)}  ·  ${t('stazione')} ${data.station}`}</text>
      <g fontSize={2} fill={MUTED}>
        {S.show('terminal') && <text x={col.term} y={top - 2} textAnchor="end">{t('Morsetto')}</text>}
        <text x={col.ch} y={top - 2}>{t('Canale')}</text>
        <text x={col.addr} y={top - 2} textAnchor="end">{t('Indirizzo')}</text>
        {S.show('symbol') && <text x={col.sym} y={top - 2}>{t('Nome simbolico')}</text>}
        {S.show('comment') && <text x={col.comment} y={top - 2}>{t('Commento')}</text>}
        {S.show('connected') && <text x={col.conn} y={top - 2}>{t('Collegato a')}</text>}
        {S.show('location') && <text x={col.loc} y={top - 2}>{t('Pagina')}</text>}
      </g>
      <rect x={x} y={top} width={w} height={bottom - top} fill="none" stroke={look.ink} strokeWidth={0.5} />
      {data.rows.map((r, i) => {
        const y = top + h * i + h / 2;
        const used = !!r.inst;
        const c = used ? look.ink : MUTED;
        return (
          <g key={r.channel}>
            {i > 0 && <line x1={x} y1={top + h * i} x2={x + w} y2={top + h * i} stroke={look.ink} strokeWidth={0.15} />}
            <line x1={x + w} y1={top + h * (i + 1)} x2={400} y2={top + h * (i + 1)} stroke="#d0d5dc" strokeWidth={0.12} />
            <line x1={x - 8} y1={y} x2={x} y2={y} stroke={look.ink} strokeWidth={0.35} />
            <circle cx={x - 8} cy={y} r={0.8} fill="#fff" stroke={look.ink} strokeWidth={0.3} />
            <g fontSize={Math.min(S.textSize, h * 0.42)} fill={c}>
              {r.terminal !== r.channel && S.show('terminal') && <text x={col.term} y={y + 0.7} textAnchor="end">{r.terminal}</text>}
              <text x={col.ch} y={y + 0.7}>{r.channel}</text>
              <text x={col.addr} y={y + 0.7} textAnchor="end" fontWeight={600}>{r.address}</text>
              {(used || !r.symbolIsDefault) && S.show('symbol') && <text x={col.sym} y={y + 0.7}>{cut(r.symbol, 30)}</text>}
              {S.show('comment') && <text x={col.comment} y={y + 0.7}>{cut(t(r.comment), 48)}</text>}
              {S.show('connected') && <text x={col.conn} y={y + 0.7}>{cut(r.connected, 34)}</text>}
              {r.location && S.show('location') && <RefText x={col.loc} y={y + 0.7} size={Math.min(S.textSize, h * 0.42)} refs={[{ loc: r.location, id: r.inst?.id }]} />}
            </g>
          </g>
        );
      })}
      <text x={x} y={bottom + 6} fontSize={2.2} fill={look.ink}>
        {data.supply.length ? tx('Alimentazione L+ / M: {0}', data.supply.map(l => `/${l}`).join(' ')) : tx('Alimentazione L+ / M: non disegnata')}
      </text>
    </g>
  );
}

/**
 * Schema della morsettiera: una riga per morsetto con destinazioni esterne a sinistra,
 * il morsetto con numero e piano al centro, ponticelli e separatori, destinazioni interne
 * a destra e le posizioni sullo schema (cliccabili, anche nel PDF).
 */
function StripDiagram({ data, t, style: S, cols }: { data?: StripSheetData; t: (s: string) => string; style: typeof STRIP_TEXT; cols?: Pick<StripStyle, 'hide' | 'widths'> }) {
  if (!data) return <text x={30} y={30} fontSize={4} fill="#cf222e">{tx('Morsettiera vuota o eliminata: rigenera gli schemi dalla vista Morsettiere')}</text>;
  const { top } = STRIP_LAYOUT, rowH = S.rowH;
  const MUTED = '#8a929c';
  // Colonne: larghezze scelte o di serie, quelle nascoste larghe 0 (il morsetto resta sempre)
  const hidden = new Set(cols?.hide ?? []);
  const W = (k: keyof typeof STRIP_COLS) => (hidden.has(k) ? 0 : cols?.widths?.[k] ?? STRIP_COLS[k]);
  const on = (k: keyof typeof STRIP_COLS) => !hidden.has(k);
  const box = { x: 28 + W('ext') + W('extWire') + 4, w: 18 };
  const col = { ext: 28, extWire: box.x - 4, intWire: box.x + box.w + 18, int: box.x + box.w + 18 + W('intWire'), loc: box.x + box.w + 18 + W('intWire') + W('int') };
  const chars = (w: number) => Math.max(4, Math.floor(w / (S.textSize * 0.55)));
  const cut = (v: string | undefined, w: number) => (v && v.length > chars(w) ? `${v.slice(0, chars(w) - 1)}…` : v ?? '');
  const bottom = top + rowH * data.rows.length;
  const jx = (c: number) => box.x + box.w + 3 + c * 3;
  return (
    <g>
      <text x={28} y={21} fontSize={S.titleSize} fontWeight={600} fill={look.ink}>{`${t('Morsettiera')} -${data.strip}`}</text>
      <text x={28} y={21 + 2 + S.subSize * 1.5} fontSize={S.subSize} fill={look.ink}>
        {[data.partText, data.sheets > 1 ? `foglio ${data.sheet + 1} di ${data.sheets}` : ''].filter(Boolean).join('  ·  ')}
      </text>
      <g fontSize={S.headSize} fill={MUTED}>
        {on('ext') && <text x={col.ext} y={top - 2}>{t('Destinazione esterna')}</text>}
        {on('extWire') && <text x={col.extWire} y={top - 2} textAnchor="end">{t('Filo')}</text>}
        <text x={box.x + box.w / 2} y={top - 2} textAnchor="middle">{t('Morsetto')}</text>
        {on('intWire') && <text x={col.intWire} y={top - 2}>{t('Filo')}</text>}
        {on('int') && <text x={col.int} y={top - 2}>{t('Destinazione interna')}</text>}
        {on('loc') && <text x={col.loc} y={top - 2}>{t('Pagina')}</text>}
      </g>
      {data.rows.map((r, i) => {
        const y = top + rowH * i, cy = y + rowH / 2 + S.textSize / 3;
        const c = r.row.spare ? MUTED : look.ink;
        return (
          <g key={r.row.no}>
            <rect x={box.x} y={y} width={box.w} height={rowH} fill="none" stroke={look.ink} strokeWidth={0.3} />
            {r.separator && <line x1={box.x - 3} y1={y + rowH} x2={box.x + box.w + 3} y2={y + rowH} stroke={look.ink} strokeWidth={0.9} />}
            <line x1={col.extWire + 1} y1={y + rowH / 2} x2={box.x} y2={y + rowH / 2} stroke={look.ink} strokeWidth={0.25} />
            <line x1={box.x + box.w} y1={y + rowH / 2} x2={col.intWire - 1} y2={y + rowH / 2} stroke={look.ink} strokeWidth={0.25} />
            <line x1={box.x + box.w + 18} y1={y + rowH} x2={Math.max(col.loc + W('loc'), col.int + 10)} y2={y + rowH} stroke="#d0d5dc" strokeWidth={0.12} />
            {col.ext < box.x - 4 && <line x1={col.ext} y1={y + rowH} x2={box.x - 4} y2={y + rowH} stroke="#d0d5dc" strokeWidth={0.12} />}
            <g fontSize={S.textSize} fill={c}>
              {on('ext') && <text x={col.ext} y={cy}>{cut(r.ext, W('ext'))}</text>}
              {on('extWire') && <text x={col.extWire} y={cy} textAnchor="end">{r.extWire}</text>}
              <text x={box.x + box.w / 2} y={cy} textAnchor="middle" fontWeight={600} fontSize={S.noSize}>{r.row.no}</text>
              {r.row.spare && <text x={box.x + 1} y={cy} fontSize={1.6}>R</text>}
              {on('intWire') && <text x={col.intWire} y={cy}>{r.intWire}</text>}
              {on('int') && <text x={col.int} y={cy}>{cut(r.int, W('int'))}</text>}
              {on('loc') && r.locations.length > 0 && <RefText x={col.loc} y={cy} size={S.textSize} refs={r.locations.slice(0, 2)} />}
            </g>
          </g>
        );
      })}
      {data.jumpers.map(j => {
        const ys = j.rows.map(i => top + rowH * i + rowH / 2);
        const x = jx(j.col);
        return (
          <g key={j.jumper.id} stroke={look.ink} strokeWidth={0.35}>
            <line x1={x} y1={Math.min(...ys)} x2={x} y2={Math.max(...ys)} strokeDasharray={j.jumper.kind === 'comb' ? undefined : '1 0.6'} />
            {ys.map((yy, k) => <circle key={k} cx={x} cy={yy} r={0.6} fill={look.ink} />)}
          </g>
        );
      })}
      {/* Fermi terminali (blocchi pieni) e piastra di chiusura (linea spessa) alle estremità della morsettiera */}
      {data.endStopTop && <rect x={box.x - 1} y={top - 1.6} width={box.w + 2} height={1.2} fill={look.ink} />}
      {data.endPlate && <line x1={box.x - 1} y1={bottom + 0.5} x2={box.x + box.w + 1} y2={bottom + 0.5} stroke={look.ink} strokeWidth={1} />}
      {data.endStopBottom && <rect x={box.x - 1} y={bottom + (data.endPlate ? 1.6 : 0.4)} width={box.w + 2} height={1.2} fill={look.ink} />}
      <text x={28} y={bottom + 6} fontSize={S.headSize} fill={MUTED}>
        {tx('Ponticelli: linea continua = a pettine, tratteggiata = fisso  ·  linea spessa = separatore  ·  R = morsetto di riserva')}
        {data.endStopTop || data.endStopBottom || data.endPlate ? `  ·  ${tx('blocco pieno = fermo terminale, linea spessa in fondo = piastra di chiusura')}` : ''}
      </text>
      {data.accessories && <text x={28} y={bottom + 6 + S.headSize * 1.6} fontSize={S.headSize} fill={look.ink}>{`${t('Accessori')}: ${data.accessories.join('  ·  ')}`}</text>}
    </g>
  );
}

/** Nome del conduttore accanto al filo che entra in un bus, dalla parte del filo */
function BundleTapLabel({ tap, def }: { tap: { at: Pt; next: Pt; name: string; size?: number; color?: string }; def: Required<TextStyle> }) {
  const { at, next, name } = tap;
  // Altezza e colore scelti sul bus (proprietà del bus), altrimenti quelli del progetto (Aspetto ▸ Testi)
  const size = tap.size ?? def.size, color = tap.color ?? def.color;
  if (Math.abs(next.x - at.x) < 0.01) {
    // Filo verticale: nome scritto in verticale accanto al filo, appena fuori dal bus
    const down = next.y > at.y;
    const y = down ? at.y + 1.4 : at.y - 1.4;
    return <text x={at.x - 0.6} y={y} fontSize={size} fill={color} textAnchor={down ? 'end' : 'start'} transform={`rotate(-90 ${at.x - 0.6} ${y})`}>{name}</text>;
  }
  const right = next.x > at.x;
  return <text x={right ? at.x + 1.4 : at.x - 1.4} y={at.y - 0.7} fontSize={size} fill={color} textAnchor={right ? 'start' : 'end'}>{name}</text>;
}

/** Immagine sullo schema, con la cornice se richiesta (e quella di selezione) */
function ImageView({ img, selected, offset }: { img: ImageItem; selected: boolean; offset?: Pt }) {
  const x = img.x + (offset?.x ?? 0), y = img.y + (offset?.y ?? 0);
  return (
    <g data-id={img.id}>
      {img.vector
        // Disegno DXF: linee nel colore dell'inchiostro, scalate sul riquadro
        ? <g transform={`translate(${x} ${y}) scale(${img.w / (img.vector.w || 1)} ${img.h / (img.vector.h || 1)})`} stroke={look.ink} color={look.ink} strokeWidth={0.25} fill="none" strokeLinecap="round">
            {img.vector.prims.map((p, i) => <PrimSvg key={i} p={p} />)}
          </g>
        : <image href={img.src} x={x} y={y} width={img.w} height={img.h} preserveAspectRatio="none" />}
      {(img.border || selected) && <rect x={x} y={y} width={img.w} height={img.h} fill="none" stroke={selected ? SEL : '#000'} strokeWidth={selected ? 0.4 : 0.25} strokeDasharray={selected && !img.border ? '1.5 0.8' : undefined} />}
    </g>
  );
}

/**
 * Riquadro di un quadro: sugli schemi bordo tratto-punto con «+codice», nello schema di rete con
 * l'intestazione piena. La scritta si trascina e resta legata al bordo con un righino
 */
function ZoneView({ zone: z0, panel, selected, offset, t, schematic, style }: { zone: Zone; panel?: Panel; selected: boolean; offset?: Pt; t: (s: string) => string; schematic?: boolean; style?: ZoneStyle }) {
  const zone = offset ? { ...z0, x: z0.x + offset.x, y: z0.y + offset.y } : z0;
  const { x, y } = zone, lk = zoneLookOf(zone, style);
  const label = zoneText(zone, panel, style, t);
  // Sugli schemi: riquadro di luogo come in EPLAN, linea tratto-punto con «+codice» in alto a sinistra;
  // quello che contiene prende il luogo
  if (schematic) {
    const ink = selected ? SEL : lk.lineColor ?? look.ink;
    const size = lk.textSize ?? 2.8;
    const { at, box } = zoneLabelBox(zone, label, size, true);
    const lead = zoneLeader(zone, box);
    return (
      <g data-id={zone.id}>
        <rect x={x} y={y} width={zone.w} height={zone.h} fill="none" stroke={ink} strokeWidth={(lk.lineWidth ?? 0.3) + (selected ? 0.2 : 0)} strokeDasharray="5 1.2 1 1.2" />
        {lead && <line x1={lead[0].x} y1={lead[0].y} x2={lead[1].x} y2={lead[1].y} stroke={ink} strokeWidth={0.18} />}
        <g data-zonelabel={zone.id} style={{ cursor: 'move' }}>
          <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} fill="transparent" />
          <text x={at.x} y={at.y} fontSize={size} fontWeight={600} fill={selected ? SEL : lk.textColor ?? lk.lineColor ?? look.ink}>{label}</text>
        </g>
      </g>
    );
  }
  const c = selected ? SEL : lk.lineColor ?? '#57606a';
  const size = lk.textSize ?? 3.2;
  const { at, box } = zoneLabelBox(zone, label, size, false);
  const lead = zoneLeader(zone, box);
  return (
    <g data-id={zone.id}>
      <rect x={x} y={y} width={zone.w} height={zone.h} fill="#f6f8fa" fillOpacity={0.5} stroke={c} strokeWidth={(lk.lineWidth ?? 0.4) + (selected ? 0.2 : 0)} strokeDasharray="4 1 1 1" />
      {lead && <line x1={lead[0].x} y1={lead[0].y} x2={lead[1].x} y2={lead[1].y} stroke={c} strokeWidth={0.25} />}
      <g data-zonelabel={zone.id} style={{ cursor: 'move' }}>
        <rect x={at.x - 2} y={at.y - size * 1.34} width={approxTextW(label, size) * 1.05 + 4} height={size * 1.875} fill={c} />
        <text x={at.x} y={at.y} fontSize={size} fontWeight={600} fill={lk.textColor ?? '#fff'}>{label}</text>
      </g>
    </g>
  );
}

/**
 * Layout del quadro in scala: piastra, guide DIN (tratteggiate), canaline (campite),
 * apparecchi e morsettiere con la sigla, quote della piastra e occupazione delle guide.
 */
export function LayoutDrawing({ layout, selection, drag }: { layout: Layout; selection?: Set<string>; drag?: { id: string; dx: number; dy: number } }) {
  const v = layoutView(layout);
  const P = (x: number, y: number) => ({ x: v.ox + x * v.k, y: v.oy + y * v.k });
  const usage = new Map(railUsage(layout).map(u => [u.rail.id, u]));
  const item = (it: LayoutItem) => {
    const d = drag && drag.id === it.id ? drag : undefined;
    const a = P(it.x + (d?.dx ?? 0), it.y + (d?.dy ?? 0));
    const w = it.w * v.k, h = it.h * v.k;
    const sel = selection?.has(it.id);
    const stroke = sel ? SEL : look.ink;
    if (it.kind === 'rail') {
      const u = usage.get(it.id);
      return (
        <g key={it.id} data-id={it.id}>
          <rect x={a.x} y={a.y} width={w} height={h} fill="#eef1f4" stroke={stroke} strokeWidth={sel ? 0.4 : 0.2} />
          <line x1={a.x} y1={a.y + h / 2} x2={a.x + w} y2={a.y + h / 2} stroke={stroke} strokeWidth={0.12} strokeDasharray="2 1" />
          {u && <text x={a.x + w + 1} y={a.y + h / 2 + 0.8} fontSize={2} fill={u.free < 0 ? '#cf222e' : '#5b636d'}>{tx('{0} {1} mm · libero {2} mm', it.label ?? 'TS35', Math.round(it.w), u.free)}</text>}
        </g>
      );
    }
    if (it.kind === 'duct') {
      return (
        <g key={it.id} data-id={it.id}>
          <rect x={a.x} y={a.y} width={w} height={h} fill="url(#duct-hatch)" stroke={stroke} strokeWidth={sel ? 0.4 : 0.2} />
          {it.label && <text x={a.x + w / 2} y={a.y + h / 2 + 0.7} fontSize={1.8} textAnchor="middle" fill="#5b636d"
            transform={h > w ? `rotate(-90 ${a.x + w / 2} ${a.y + h / 2})` : undefined}>{it.label}</text>}
        </g>
      );
    }
    const fs = Math.max(1.4, Math.min(2.6, w / 4, h / 3));
    return (
      <g key={it.id} data-id={it.id}>
        <rect x={a.x} y={a.y} width={w} height={h} fill="#fff" stroke={stroke} strokeWidth={sel ? 0.45 : 0.3} />
        {it.kind === 'strip' && Array.from({ length: Math.min(200, Math.round(it.w / 5.1)) }, (_, i) => (
          <line key={i} x1={a.x + (i * w) / Math.round(it.w / 5.1)} y1={a.y} x2={a.x + (i * w) / Math.round(it.w / 5.1)} y2={a.y + h} stroke="#c9d1d9" strokeWidth={0.08} />
        ))}
        <text x={a.x + w / 2} y={a.y + h / 2 + fs / 3} fontSize={fs} textAnchor="middle" fill={stroke}
          transform={it.kind === 'strip' && h > w * 1.5 ? undefined : h > w * 2 ? `rotate(-90 ${a.x + w / 2} ${a.y + h / 2})` : undefined}>{`-${it.ref}`}</text>
      </g>
    );
  };
  const o = P(0, 0), e = P(layout.plate.w, layout.plate.h);
  return (
    <g>
      <defs>
        <pattern id="duct-hatch" width={1.5} height={1.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={1.5} height={1.5} fill="#f6f8fa" /><line x1={0} y1={0} x2={0} y2={1.5} stroke="#c9d1d9" strokeWidth={0.3} />
        </pattern>
      </defs>
      <text x={FRAME.left + 4} y={FRAME.top + 8} fontSize={3.4} fontWeight={600} fill={look.ink}>{tx('Layout quadro')}</text>
      <text x={FRAME.right - 4} y={FRAME.top + 8} fontSize={2.6} textAnchor="end" fill={look.ink}>{tx('Piastra {0} × {1} mm · scala 1:{2}', layout.plate.w, layout.plate.h, v.n)}</text>
      <rect x={o.x} y={o.y} width={e.x - o.x} height={e.y - o.y} fill="#fbfbfc" stroke={look.ink} strokeWidth={0.5} />
      {/* Quote della piastra */}
      <g stroke="#5b636d" strokeWidth={0.15} fill="#5b636d" fontSize={2.2}>
        <line x1={o.x} y1={o.y - 3} x2={e.x} y2={o.y - 3} /><line x1={o.x} y1={o.y - 4.5} x2={o.x} y2={o.y - 1.5} /><line x1={e.x} y1={o.y - 4.5} x2={e.x} y2={o.y - 1.5} />
        <text x={(o.x + e.x) / 2} y={o.y - 4} textAnchor="middle" stroke="none">{layout.plate.w}</text>
        <line x1={o.x - 3} y1={o.y} x2={o.x - 3} y2={e.y} /><line x1={o.x - 4.5} y1={o.y} x2={o.x - 1.5} y2={o.y} /><line x1={o.x - 4.5} y1={e.y} x2={o.x - 1.5} y2={e.y} />
        <text x={o.x - 4} y={(o.y + e.y) / 2} textAnchor="middle" stroke="none" transform={`rotate(-90 ${o.x - 4} ${(o.y + e.y) / 2})`}>{layout.plate.h}</text>
      </g>
      {[...layout.items].sort((a, b) => ({ rail: 0, duct: 1, strip: 2, device: 3 }[a.kind] - { rail: 0, duct: 1, strip: 2, device: 3 }[b.kind])).map(item)}
    </g>
  );
}

export function PageContent({ project, page, pageIndex, derived, selection, offset, bare }: {
  project: Project; page: Page; pageIndex: number; derived: PageDerived;
  selection?: Set<string>; offset?: Pt;
  /** Solo il disegno, senza foglio né cornice (contenuto di una pagina proiettata) */
  bare?: boolean;
}) {
  const L = translator(project);
  const lk = applyLook(project.settings);
  const cableStyle = cableStyleOf(project);
  return (
    <g fontFamily={lk.font}>
      {!bare && <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill={lk.c.paper} />}
      {!bare && <Frame project={project} page={page} pageIndex={pageIndex} />}
      {derived.projected && <ProjectedZone project={project} page={page} data={derived.projected} />}
      {page.type === 'plc' && <PlcOverview data={derived.overview} t={L.t} S={drawingStyleOf(project, 'plc')} />}
      {page.type === 'strip' && <StripDiagram data={derived.stripSheet} t={L.t} style={stripTextOf(project)} cols={project.settings?.stripStyle} />}
      {page.type === 'report' && <ReportPage data={derived.reportSheet} />}
      {derived.drawing && <DrawingPage d={derived.drawing} t={L.t} project={project} />}
      {derived.connFrames?.map((f, i) => (
        <g key={`cf${i}`} pointerEvents="none">
          <rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} rx={1.5} fill="none" stroke={look.ink} strokeWidth={0.25} strokeDasharray="1.6 0.8" />
          <text x={f.x0 + 1} y={f.y0 - 1} fontSize={2.2} fill={look.ink}>{f.label}</text>
        </g>
      ))}
      {page.type === 'cover' && <CoverPage project={project} />}
      {page.type === 'layout' && <LayoutDrawing layout={layoutOf(page)} selection={selection} />}
      {page.elements.map(e => e.kind === 'image' && !e.front && <ImageView key={e.id} img={e} selected={!!selection?.has(e.id)} offset={selection?.has(e.id) ? offset : undefined} />)}
      {page.elements.map(e => e.kind === 'zone' && (
        <ZoneView key={e.id} zone={e} panel={project.panels?.find(p => p.id === e.panelId)} t={L.t} style={project.settings?.zoneStyle} selected={!!selection?.has(e.id)} schematic={page.type !== 'network'}
          offset={selection?.has(e.id) ? offset : undefined} />
      ))}
      {!bare && page.elements.map(e => {
        // Riquadro con la pagina proiettata nel suo quadro: rimando cliccabile in basso a destra
        const r = e.kind === 'zone' ? derived.zoneRefs?.get(e.id) : undefined;
        return r && e.kind === 'zone' && (
          <text key={`zr${e.id}`} x={e.x + e.w - 1} y={e.y + e.h - 1.2} fontSize={(derived.textStyles ?? DEFAULT_TEXT).xref.size} textAnchor="end"
            fill={derived.mono ? look.ink : (derived.textStyles ?? DEFAULT_TEXT).xref.color} className="xref" data-goto={r.name}>{`/${r.name}`}</text>
        );
      })}
      {page.elements.map(e => {
        const sel = selection?.has(e.id) ?? false;
        const off = sel && offset ? offset : undefined;
        const tr = off ? `translate(${off.x} ${off.y})` : undefined;
        if (e.kind === 'wire') {
          // Collegamenti di rete: sigla del cavo e protocollo
          const no = derived.wireNumbers.get(e.id);
          const pts = e.points.map(p => `${p.x},${p.y}`).join(' ');
          const bus = protocolOf(e.bus);
          // Colore del filo, o quello del suo conduttore (anche oltre rimandi e morsetti)
          const color = e.color ?? derived.conductorColor?.get(e.id);
          const colored = bus ? { hex: bus.color } : derived.drawWireColors && color ? WIRE_COLORS[color.toUpperCase()] : undefined;
          // Spessore scelto sul filo, altrimenti quello predefinito (un po' più largo se colorato); tipo di linea
          // Bus di conduttori: linea spessa
          const base = bus ? look.w.bus : e.width ?? (e.bundle !== undefined ? look.w.bundle : colored ? look.w.wireColored : look.w.wire);
          const sw = sel ? Math.max(base + 0.15, bus ? 0.9 : 0.5) : base;
          const ls = wireDash(e.lineType, base);
          return (
            <g key={e.id} transform={tr}>
              <polyline data-id={e.id} points={pts}
                fill="none" stroke={sel ? SEL : colored?.hex ?? look.ink} strokeWidth={sw} strokeLinejoin="round"
                strokeDasharray={ls.dash} strokeLinecap={ls.dash ? ls.cap : undefined} />
              {!sel && !bus && !ls.dash && colored && color?.toUpperCase() === 'GNYE' && (
                <polyline points={pts} fill="none" stroke="#d4a72c" strokeWidth={base} strokeDasharray="1.5 1.5" />
              )}
              {no && (() => {
                // Colore e altezza: quelli del filo, altrimenti quelli del progetto per i numeri filo
                const style = wireTextStyle(derived.textStyles ?? DEFAULT_TEXT, e);
                const color = sel ? SEL : derived.mono ? look.ink : bus ? bus.color : e.labelColor ?? style.color;
                const size = e.labelSize ?? style.size;
                const poss = derived.wireLabelPos?.get(e.id);
                // Ogni numero si prende col mouse: data-wire-label è il filo, data-label il numero (-1 = automatico)
                return poss?.length
                  ? poss.map((pos, i) => <WireLabel key={i} pts={e.points} pos={pos} text={no} color={color} size={size} wireId={e.id} index={e.labels?.length ? i : -1} refs={derived.wireRefs?.get(e.id)} />)
                  : <WireLabel pts={e.points} text={no} color={color} size={size} refs={derived.wireRefs?.get(e.id)} />;
              })()}
              {derived.wireTicks?.has(e.id) && (() => {
                // Sezione e colore sulla lineetta obliqua, accanto al numero filo senza toccarlo
                const st = (derived.textStyles ?? DEFAULT_TEXT).wireData;
                const numSize = e.labelSize ?? wireTextStyle(derived.textStyles ?? DEFAULT_TEXT, e).size;
                const text = derived.wireTicks.get(e.id)!;
                const p = tickPoint(e.points, e.tickAt, derived.wireLabelPos?.get(e.id)?.[0], no ? no.length * numSize * 0.28 : 0, text.length * st.size * 0.56);
                return p && <WireTick p={p} text={text} size={st.size} color={sel ? SEL : derived.mono ? look.ink : st.color} ink={sel ? SEL : look.ink} wireId={e.id} />;
              })()}
              {e.poles && <PoleTicks pts={e.points} n={e.poles} color={sel ? SEL : look.ink} />}
            </g>
          );
        }
        if (e.kind === 'cable') {
          return <g key={e.id} transform={tr}><CableView line={e} mark={derived.cableMarks?.get(e.id)} selected={sel} style={cableStyle} /></g>;
        }
        if (e.kind === 'wiredef') return <g key={e.id} transform={tr}><WireDefView d={e} page={page} selected={sel} /></g>;
        if (e.kind === 'zone') return null; // disegnati sotto a tutto
        if (e.kind === 'image') return e.front ? <ImageView key={e.id} img={e} selected={sel} offset={off} /> : null;
        if (e.kind === 'text') {
          return <RichText key={e.id} t={{ ...e, text: L.t(e.text) }} transform={e.rot ? `${tr ?? ''} rotate(${e.rot} ${e.x} ${e.y})`.trim() : tr} fill={sel ? SEL : look.ink} />;
        }
        const sym = getSymbol(e.symbolId, project);
        if (!sym) return null;
        return <g key={e.id} transform={tr}><SymbolView inst={e} sym={sym} derived={derived} selected={sel} /></g>;
      })}
      {derived.pairLines?.map((l, i) => <line key={`pl${i}`} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke={look.ink} strokeWidth={look.w.symbol} strokeDasharray="1.5 1" pointerEvents="none" />)}
      {look.junction === 'dot' && derived.junctions.filter(j => !derived.tNodes?.some(t => samePt(t.p, j))).map((j, i) => <circle key={i} cx={j.x} cy={j.y} r={look.junctionR} fill={look.ink} />)}
      {derived.tNodes?.map((t, i) => {
        // Nodo a T con verso: triangolino pieno nell'angolo tra il gambo e il braccio a cui si collega
        const L = Math.max(2, look.junctionR * 2.8), a = DIR_VEC[t.stem], b = DIR_VEC[t.join!];
        return <polygon key={`t${i}`} points={`${t.p.x},${t.p.y} ${t.p.x + a.x * L},${t.p.y + a.y * L} ${t.p.x + b.x * L},${t.p.y + b.y * L}`} fill={look.ink} />;
      })}
      {derived.bundleTaps?.map((t, i) => <BundleTapLabel key={i} tap={derived.mono ? { ...t, color: look.ink } : t} def={(derived.textStyles ?? DEFAULT_TEXT).bundleTap} />)}
      {derived.revisionClouds?.map((c, i) => <Cloud key={i} cloud={c} />)}
    </g>
  );
}
