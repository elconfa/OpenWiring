// Etichette di siglatura per morsetti, fili, dispositivi e cavi, esportate in Excel/CSV
// per Weidmüller M-Print PRO e Cembre GeniusPRO (entrambi importano Excel e CSV con una
// procedura guidata in cui si associa ogni colonna a un campo dell'etichetta).
import type { Project, Part } from './types';
import { computeNetlist, connections } from './netlist';
import { buildDevices, deviceInfo, designation, partsIndex } from './devices';
import { allStrips, stripRows, stripPanel } from './terminals';
import { cableInfos } from './cables';
import { devicePanels, busCableRows, portText, panelOfElement } from './network';
import { allPlaced } from './devices';
import { pinsWorld } from './geometry';
import { tn } from '../i18n/ui';

export type LabelSet = 'terminals' | 'wires' | 'devices' | 'cables';
export type LabelProfile = 'mprint' | 'genius' | 'generic';

export const SET_NAMES: Record<LabelSet, string> = {
  terminals: tn('Morsetti'), wires: tn('Fili'), devices: tn('Dispositivi'), cables: tn('Cavi'),
};
export const PROFILE_NAMES: Record<LabelProfile, string> = {
  mprint: 'Weidmüller M-Print PRO', genius: 'Cembre GeniusPRO', generic: tn('Generico (Excel/CSV)'),
};

export interface LabelOptions {
  /** Morsetti: solo il numero ("1") o la sigla completa ("X1:1") */
  terminalText: 'number' | 'full';
  /** Morsetti: un'etichetta con la sigla della morsettiera all'inizio di ogni fila */
  stripHeader: boolean;
  /** Morsetti di riserva compresi */
  spares: boolean;
  /** Fili: solo il numero, oppure numero e destinazione (all'estremità A si legge dove va il filo) */
  wireText: 'number' | 'destination';
  /** Fili: un'etichetta per ogni estremità */
  bothEnds: boolean;
  /** Dispositivi: sigla completa con =funzione +luogo */
  fullDesignation: boolean;
  /** Cavi: seconda riga con tipo e formazione */
  cableType: boolean;
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  terminalText: 'number', stripHeader: true, spares: true,
  wireText: 'number', bothEnds: true, fullDesignation: false, cableType: true,
};

export interface Label {
  /** Raggruppamento (morsettiera, pagina, cavo): diventa il campo "progetto/gruppo" */
  group: string;
  lines: string[];
}

export function makeLabels(project: Project, set: LabelSet, o: LabelOptions, library: Part[] = []): Label[] {
  const out: Label[] = [];
  if (set === 'terminals') {
    for (const s of allStrips(project)) {
      const rows = stripRows(project, s).filter(r => o.spares || !r.spare);
      if (!rows.length) continue;
      if (o.stripHeader) out.push({ group: `-${s}`, lines: [`-${s}`] });
      for (const r of rows) out.push({ group: `-${s}`, lines: [o.terminalText === 'full' ? `${s}:${r.no}` : r.no] });
    }
  } else if (set === 'wires') {
    const conns = connections(computeNetlist(project), project).filter(c => c.wireNo);
    for (const c of conns) {
      if (c.from === c.net) {
        // Linea di potenziale (L1, N, PE…): un'etichetta all'estremità verso il dispositivo
        out.push({ group: c.toLoc, lines: o.wireText === 'destination' ? [c.wireNo, c.to] : [c.wireNo] });
        continue;
      }
      // All'estremità «qui» si legge la destinazione dall'altra parte
      const ends: [string, string][] = [[c.from, c.to], [c.to, c.from]];
      for (const [, there] of o.bothEnds ? ends : ends.slice(0, 1)) {
        out.push({ group: c.fromLoc || c.toLoc, lines: o.wireText === 'destination' ? [c.wireNo, there] : [c.wireNo] });
      }
    }
  } else if (set === 'devices') {
    const parts = partsIndex(project, library);
    const devs = [...buildDevices(project).values()]
      .filter(d => !d.elements.every(e => e.sym.role === 'terminal'))
      .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
    const where = devicePanels(project);
    for (const d of devs) {
      const info = deviceInfo(d.elements, d.main, parts);
      const loc = info.loc ?? where.get(d.tag)?.code;
      // Il gruppo è il luogo (quadro, pulsantiera…) così le etichette si stampano per contenitore
      out.push({ group: loc ? `+${loc}` : d.elements[0].page.name, lines: [o.fullDesignation ? designation(d.tag, info.func, loc) : `-${d.tag}`] });
    }
  } else {
    for (const ci of cableInfos(project).sort((a, b) => a.cable.tag.localeCompare(b.cable.tag, undefined, { numeric: true }))) {
      const c = ci.cable;
      const second = o.cableType ? [[c.type, c.conductors.length ? `${c.conductors.length}${c.conductors.includes('GNYE') ? 'G' : 'x'}${c.cross ?? ''}` : ''].filter(Boolean).join(' ')] : [];
      // Due etichette per cavo, una per estremità
      for (const end of [c.from, c.to]) out.push({ group: `-${c.tag}`, lines: [`-${c.tag}`, ...second.filter(Boolean), ...(end ? [`→ ${end}`] : [])].slice(0, 3) });
    }
    // Cavi di rete: all'estremità si scrive la porta di arrivo dall'altra parte
    for (const r of busCableRows(project)) {
      if (!r.tag) continue;
      const second = o.cableType ? [r.protocol] : [];
      for (const end of [portText(r.b), portText(r.a)]) out.push({ group: `-${r.tag}`, lines: [`-${r.tag}`, ...second, ...(end ? [`→ ${end}`] : [])].slice(0, 3) });
    }
  }
  return out;
}

/** Righe del foglio per il profilo scelto (intestazione + un'etichetta per riga) */
export function labelRows(labels: Label[], profile: LabelProfile): string[][] {
  const n = Math.max(1, ...labels.map(l => l.lines.length));
  const texts = Array.from({ length: n }, (_, i) => (profile === 'genius' ? `Riga ${i + 1}` : profile === 'mprint' ? `Text ${i + 1}` : `Testo ${i + 1}`));
  // M-Print PRO: il gruppo va nel campo «PROJECT» delle MultiCard; GeniusPRO: colonna in coda
  if (profile === 'mprint') return [['Project', ...texts], ...labels.map(l => [l.group, ...pad(l.lines, n)])];
  if (profile === 'genius') return [[...texts, 'Gruppo'], ...labels.map(l => [...pad(l.lines, n), l.group])];
  return [['Gruppo', ...texts], ...labels.map(l => [l.group, ...pad(l.lines, n)])];
}

const pad = (a: string[], n: number) => [...a, ...Array(Math.max(0, n - a.length)).fill('')];

/** CSV con separatore ";" e BOM UTF-8 (apribile da Excel e dai due programmi) */
export function rowsToCsv(rows: string[][]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
}

export interface WireMarkOptions {
  /** Quadro di un capo: quello del foglio dove è disegnato (di serie) o quello del dispositivo (+luogo, poi la pagina della bobina) */
  by?: 'sheet' | 'device';
  /** Anche i capi dei conduttori dei cavi (di serie no: hanno il colore o il numero del cavo) */
  cables?: boolean;
}

/** Una riga della lista dei numeri filo da stampare: testo, quante etichette, sezione e fogli */
export interface WireMarkRow { panel: string; text: string; qty: number; cross: string; pages: string[] }

/** Ruoli dei simboli che non sono un capo di filo vero (rimandi, potenziali, nodi di rete, unifilare) */
const NOT_AN_END = new Set(['link', 'potential', 'netnode', 'oneline']);

/**
 * Numeri filo da stampare: un'etichetta per ogni capo di filo che arriva su un punto di
 * connessione di un simbolo o di un morsetto (due fili sullo stesso morsetto = due etichette; i
 * fili che finiscono su un altro filo, a T, non hanno etichetta a quel capo). Non contano i rimandi,
 * i punti di potenziale, i conduttori dei cavi (hanno colore o numero del cavo) e i collegamenti di
 * rete. Ogni capo conta nel quadro del suo dispositivo (per i morsetti quello della morsettiera),
 * anche quando il conduttore va da un quadro all'altro.
 * Raggruppate per quadro, numero filo e sezione, con i fogli del quadro dove sono i capi.
 */
export function wireMarkers(project: Project, o: WireMarkOptions = {}): WireMarkRow[] {
  const by = o.by ?? 'sheet';
  const nl = computeNetlist(project);
  const inCable = new Set(!o.cables ? cableInfos(project, nl).flatMap(i => i.conductors.map(c => c.wire.id)) : []);
  const devPanel = devicePanels(project);
  const stripPanels = new Map(allStrips(project).map(s => [s, stripPanel(project, s)?.code ?? '']));
  const panelOf = (el: ReturnType<typeof allPlaced>[number]) => (el.sym.role === 'terminal' && el.inst.tag.includes(':')
    ? stripPanels.get(el.inst.tag.slice(0, el.inst.tag.indexOf(':'))) ?? ''
    : by === 'device' ? devPanel.get(el.inst.tag)?.code ?? panelOfElement(project, el)?.code ?? '' : panelOfElement(project, { ...el, inst: { ...el.inst, loc: undefined } })?.code ?? '');
  const pagePanel = new Map(project.pages.map(pg => [pg.id, (project.panels ?? []).find(x => x.id === pg.panelId)?.code ?? '']));
  const gCross = new Map<string, string>();
  for (const n of nl.nets) for (const { wire } of n.wires) if (wire.cross && !gCross.has(n.group)) gCross.set(n.group, wire.cross);
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const pinsByPage = new Map<string, Map<string, ReturnType<typeof allPlaced>[number]>>();
  for (const el of allPlaced(project)) {
    if (el.page.type !== 'multiline' || NOT_AN_END.has(el.sym.role)) continue;
    const m = pinsByPage.get(el.page.id) ?? new Map();
    pinsByPage.set(el.page.id, m);
    for (const p of pinsWorld(el.inst, el.sym)) if (!m.has(key(p.x, p.y))) m.set(key(p.x, p.y), el);
  }
  // Capi di ogni conduttore, con il quadro
  const ends = new Map<string, { panel: string; page: string; cross: string; wireNo: string }[]>();
  for (const pg of project.pages) {
    const pins = pinsByPage.get(pg.id);
    if (!pins) continue;
    for (const w of pg.elements) {
      if (w.kind !== 'wire' || w.bus || inCable.has(w.id) || w.points.length < 2) continue;
      const net = nl.wireNet.get(w.id);
      if (!net?.wireNo) continue;
      const cross = w.cross ?? gCross.get(net.group) ?? '';
      for (const q of [w.points[0], w.points[w.points.length - 1]]) {
        const el = pins.get(key(q.x, q.y));
        if (el) ends.set(net.id, [...(ends.get(net.id) ?? []), { panel: panelOf(el), page: pg.id, cross, wireNo: net.wireNo }]);
      }
    }
  }
  const agg = new Map<string, WireMarkRow>();
  for (const list of ends.values()) {
    for (const e of list) {
      const k = `${e.panel}|${e.wireNo}|${e.cross}`;
      const r = agg.get(k) ?? { panel: e.panel, text: e.wireNo, qty: 0, cross: e.cross, pages: [] };
      r.qty++;
      const name = project.pages.find(x => x.id === e.page)!.name;
      if ((!pagePanel.get(e.page) || pagePanel.get(e.page) === e.panel) && !r.pages.includes(name)) r.pages.push(name);
      agg.set(k, r);
    }
  }
  const num = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  for (const r of agg.values()) r.pages.sort(num);
  return [...agg.values()].sort((a, b) => num(a.panel, b.panel) || num(a.text, b.text) || num(a.cross, b.cross));
}

/** Righe del CSV come quello richiesto per la stampa (Testo; Quantità; Sezione; Fogli), con o senza la colonna del quadro */
export function wireMarkerTable(rows: WireMarkRow[], withPanel: boolean): string[][] {
  const head = ['Testo', 'Quantità', 'Sezione', 'Fogli'];
  const body = rows.map(r => [r.text, String(r.qty), r.cross.replace('.', ','), r.pages.join(' ')]);
  return withPanel ? [['Quadro', ...head], ...rows.map((r, i) => [r.panel ? `+${r.panel}` : '', ...body[i]])] : [head, ...body];
}

