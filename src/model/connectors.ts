// Connettori e spine: pin disegnati dove servono (sigla "X10:3"), dati del connettore
// (numero di pin, articolo e controparte), lista connettori e controlli.
import type { Project, Part, ConnectorData, Page } from './types';
import { getSymbol, instanceBounds } from './geometry';
import { allPlaced, stripOf, locationOf, partsIndex, type PlacedElement } from './devices';
import { computeNetlist, type Net } from './netlist';
import { compareTerminalNo, terminalNo } from './terminals';
import { connectorType, typePinNames, connectorShortName } from './connectorTypes';

export type { ConnectorData };

const pins = (p: Project) => allPlaced(p).filter(e => e.sym.role === 'pin' && e.inst.tag.includes(':'));

export const connectorData = (p: Project, conn: string): ConnectorData => p.connectors?.[conn] ?? {};

/** Connettori: quelli con i pin sullo schema e quelli creati nella vista Connettori (anche senza pin) */
export function allConnectors(p: Project): string[] {
  return [...new Set([...pins(p).map(e => stripOf(e.inst.tag)), ...Object.keys(p.connectors ?? {})])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Nomi dei pin previsti dal connettore: quelli del tipo (1…n, PE) o 1…pin totali; vuoto se non si sa */
export function pinNames(p: Project, conn: string, library: Part[] = []): string[] {
  const d = connectorData(p, conn), t = connectorType(d.type);
  if (t && !d.pins) return typePinNames(t);
  const n = pinCount(p, conn, library);
  return n ? Array.from({ length: n }, (_, i) => String(i + 1)) : [];
}

/** Pin previsti e non ancora disegnati sullo schema, nell'ordine */
export function freePins(p: Project, conn: string, library: Part[] = []): string[] {
  const used = new Set(pins(p).filter(e => stripOf(e.inst.tag) === conn).map(e => terminalNo(e.inst.tag)));
  return pinNames(p, conn, library).filter(n => !used.has(n));
}

/**
 * Prossimo pin di un connettore: "X10" → "X10:5". Con il tipo del catalogo il primo libero (anche PE),
 * altrimenti quello dopo l'ultimo
 */
export function nextPin(p: Project, conn: string, library: Part[] = []): string {
  const free = connectorType(connectorData(p, conn).type) ? freePins(p, conn, library) : [];
  if (free.length) return `${conn}:${free[0]}`;
  let max = 0;
  for (const e of pins(p)) if (stripOf(e.inst.tag) === conn) { const n = parseInt(terminalNo(e.inst.tag), 10); if (!isNaN(n)) max = Math.max(max, n); }
  return `${conn}:${max + 1}`;
}

/** Testo compatto dei pin liberi: "3, 5, 7–16, PE" */
export function rangeText(names: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    let j = i;
    while (j + 1 < names.length && /^\d+$/.test(names[j]) && parseInt(names[j + 1], 10) === parseInt(names[j], 10) + 1) j++;
    out.push(j > i + 1 ? `${names[i]}–${names[j]}` : j === i + 1 ? `${names[i]}, ${names[j]}` : names[i]);
    i = j;
  }
  return out.join(', ');
}

/** Numero di pin del connettore: scritto nei dati, dal tipo del catalogo o dal modello funzione dell'articolo */
export function pinCount(p: Project, conn: string, library: Part[] = []): number | undefined {
  const d = connectorData(p, conn);
  if (d.pins) return d.pins;
  const t = connectorType(d.type);
  if (t) return typePinNames(t).length;
  const partNr = pins(p).find(e => stripOf(e.inst.tag) === conn && e.inst.partNr)?.inst.partNr;
  const part = partNr ? partsIndex(p, library).get(partNr) : undefined;
  const n = part?.functionTemplates.reduce((a, f) => a + f.connections.filter(Boolean).length, 0);
  return n || undefined;
}

export interface PinRow {
  conn: string;
  no: string;
  els: PlacedElement[];
  /** Destinazioni sui due lati del pin */
  sideA: string;
  sideB: string;
  wires: string;
  type: string;
}

export function connectorRows(p: Project, conn?: string, nets?: Net[]): PinRow[] {
  const nl = nets ?? computeNetlist(p).nets;
  const pinNet = new Map<string, Net>();
  for (const n of nl) for (const x of n.pins) pinNet.set(`${x.el.inst.id}|${x.pinId}`, n);
  const groups = new Map<string, PinRow>();
  for (const e of pins(p)) {
    const c = stripOf(e.inst.tag);
    if (conn && c !== conn) continue;
    const no = terminalNo(e.inst.tag);
    const key = `${c}|${no}`;
    const row = groups.get(key) ?? { conn: c, no, els: [], sideA: '', sideB: '', wires: '', type: e.sym.name };
    row.els.push(e);
    groups.set(key, row);
  }
  for (const r of groups.values()) {
    const side = (i: number) => {
      const t = new Set<string>(), w = new Set<string>();
      for (const e of r.els) {
        const pin = e.sym.pins[i];
        const n = pin && pinNet.get(`${e.inst.id}|${pin.id}`);
        if (!n) continue;
        for (const x of n.pins) if (!r.els.some(o => o.inst.id === x.el.inst.id)) t.add(`-${x.ref}`);
        if (n.wireNo) w.add(n.wireNo);
      }
      return { t: [...t].join(', '), w: [...w] };
    };
    const a = side(0), b = side(1);
    r.sideA = a.t; r.sideB = b.t; r.wires = [...new Set([...a.w, ...b.w])].join(', ');
  }
  return [...groups.values()].sort((a, b) => a.conn.localeCompare(b.conn, undefined, { numeric: true }) || compareTerminalNo(a.no, b.no));
}

export interface ConnIssue { msg: string; pageId: string; elementId: string; loc: string }

/** Pin oltre il numero del connettore e pin ripetuti sulla stessa pagina */
export function connectorProblems(p: Project, library: Part[] = []): ConnIssue[] {
  const out: ConnIssue[] = [];
  for (const r of connectorRows(p)) {
    const max = pinCount(p, r.conn, library);
    const n = parseInt(r.no, 10);
    const e = r.els[0];
    if (max && !isNaN(n) && n > max) out.push({ msg: `-${r.conn}:${r.no}: il connettore ha ${max} pin`, pageId: e.page.id, elementId: e.inst.id, loc: locationOf(e) });
    const byPage = new Map<string, number>();
    for (const x of r.els) byPage.set(x.page.id, (byPage.get(x.page.id) ?? 0) + 1);
    for (const [pg, c] of byPage) if (c > 1) out.push({ msg: `-${r.conn}:${r.no} disegnato ${c} volte sulla stessa pagina`, pageId: pg, elementId: r.els[1].inst.id, loc: locationOf(r.els[1]) });
  }
  return out;
}

export interface ConnectorFrame { conn: string; x0: number; y0: number; x1: number; y1: number; label: string }

/**
 * Riquadri dei connettori sulla pagina: i pin dello stesso connettore vicini tra loro (a meno di 24 mm
 * l'uno dall'altro) stanno in un riquadro tratteggiato con la sigla, il tipo e il genere, come la linea
 * di definizione dei cavi. Un connettore con i pin sparsi ha più riquadri
 */
export function connectorFrames(p: Project, page: Page): ConnectorFrame[] {
  const groups = new Map<string, { b: { x0: number; y0: number; x1: number; y1: number } }[]>();
  for (const e of page.elements) {
    if (e.kind !== 'symbol' || !e.tag.includes(':')) continue;
    const sym = getSymbol(e.symbolId, p);
    if (sym?.role !== 'pin') continue;
    const conn = stripOf(e.tag);
    if (connectorData(p, conn).frame === false) continue;
    (groups.get(conn) ?? groups.set(conn, []).get(conn)!).push({ b: instanceBounds(e, sym) });
  }
  const out: ConnectorFrame[] = [];
  for (const [conn, items] of groups) {
    // Gruppi di pin vicini: si uniscono i riquadri che distano meno di 24 mm
    const boxes = items.map(i => ({ ...i.b }));
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x0 - 24 <= b.x1 && b.x0 - 24 <= a.x1 && a.y0 - 24 <= b.y1 && b.y0 - 24 <= a.y1) {
          boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
          boxes.splice(j, 1);
          merged = true;
        }
      }
    }
    const d = connectorData(p, conn), t = connectorType(d.type);
    const label = [`-${conn}`, t ? connectorShortName(t) : '', d.gender ? ({ M: 'M', F: 'F', MF: 'M/F' } as const)[d.gender] : ''].filter(Boolean).join(' · ');
    for (const b of boxes) out.push({ conn, x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3, label });
  }
  return out;
}
