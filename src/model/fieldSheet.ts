// Schema dei collegamenti morsettiera → campo (punto 173): per una morsettiera (o una scheda PLC con le
// prese M12, o un connettore del quadro), in alto i morsetti in
// fila con il numero filo, sotto i cavi che partono dai morsetti (riquadro tratteggiato con sigla, tipo,
// sezione, schermo e il nome o colore di ogni conduttore) e in fondo il dispositivo in campo con i suoi
// pin, la sigla e la descrizione. Vale anche per i sensori con il cavo preconfezionato: il dispositivo
// si trova anche attraverso i pin di un connettore (presa M12 sul cavo).
// Si genera dai dati: le pagine sono «Collegamenti in campo» (drawings.ts, tipo di pagina 'field').
import type { Part, Project } from './types';
import { FRAME } from './types';
import { computeNetlist, type Net, type NetPin, type NetlistResult } from './netlist';
import { cableInfos, type Conductor } from './cables';
import { buildDevices, deviceInfo, partsIndex, stripOf } from './devices';
import { stripRows } from './terminals';

/** Ruoli che non sono un dispositivo in campo */
const NOT_FIELD = new Set(['plc', 'terminal', 'pin', 'potential', 'link', 'netnode']);

/** Misure della pagina (mm) */
export const FIELD = { pitch: 7, gap: 10, left: FRAME.left + 34, right: FRAME.right - 8 };

export interface FieldColumn {
  /** Morsetto (numero, es. «3» o «1A») e numero filo */
  term: string;
  wireNo: string;
  /** Conduttore del cavo (numero o colore, es. «BN») */
  cond: string;
  /** Dispositivo in campo raggiunto (sigla senza trattino) e suo pin; vuoti se il conduttore non arriva a un dispositivo */
  dev: string;
  pin: string;
}

export interface FieldCable {
  tag: string;
  type: string;
  section: string;
  shield: boolean;
  length?: number;
  cols: FieldColumn[];
}

export interface FieldDevice { tag: string; description: string }

export interface FieldSheet {
  strip: string;
  sheet: number;
  sheets: number;
  cables: FieldCable[];
  /** Dispositivi in campo dei cavi del foglio, con la descrizione */
  devices: Record<string, FieldDevice>;
}

const ITEM_SEP = '|';
/** Elemento della pagina: la morsettiera, con il foglio se sono più di uno (X1|2) */
export const fieldItem = (strip: string, sheet: number, sheets: number) => (sheets > 1 ? `${strip}${ITEM_SEP}${sheet + 1}` : strip);
const parseItem = (item: string) => { const i = item.lastIndexOf(ITEM_SEP); return i > 0 ? { strip: item.slice(0, i), sheet: Math.max(0, parseInt(item.slice(i + 1), 10) - 1 || 0) } : { strip: item, sheet: 0 }; };

/** Larghezza di un cavo nel disegno */
const cableWidth = (c: FieldCable) => c.cols.length * FIELD.pitch + FIELD.gap;

/** Cavi che partono da ogni morsettiera (o scheda PLC, o connettore), con i conduttori in ordine di morsetto */
function stripCables(project: Project, nl: NetlistResult): Map<string, FieldCable[]> {
  const out = new Map<string, FieldCable[]>();
  if (!project.cables?.length) return out;
  const netOfPin = new Map<string, Net>();
  for (const n of nl.nets) for (const p of n.pins) netOfPin.set(`${p.el.inst.id}|${p.pinId}`, n);
  const order = new Map<string, Map<string, number>>();
  const orderOf = (group: string) => {
    let m = order.get(group);
    if (!m) { m = new Map(stripRows(project, group).map((r, i) => [r.no, i])); order.set(group, m); }
    return m;
  };
  const role = (p: NetPin) => p.el.sym.role;
  /** Il punto più vicino al conduttore sulla sua pagina (un potenziale comune come il PE tocca tanti morsetti) */
  const nearest = (pins: NetPin[], k: Conductor) => pins.filter(p => p.el.page.id === k.pageId)
    .sort((a, b) => Math.hypot(a.pos.x - k.at.x, a.pos.y - k.at.y) - Math.hypot(b.pos.x - k.at.x, b.pos.y - k.at.y))[0];
  const after = (tag: string) => tag.slice(tag.indexOf(':') + 1);
  /** Punto di partenza in quadro: morsetto, pin della scheda PLC o connettore (seguito fino alla scheda o al morsetto) */
  const startOf = (k: Conductor): { group: string; term: string; pin: NetPin } | undefined => {
    const pins = k.net!.pins;
    const t = nearest(pins.filter(p => role(p) === 'terminal' && p.el.inst.tag.includes(':')), k);
    if (t) return { group: stripOf(t.el.inst.tag), term: after(t.el.inst.tag), pin: t };
    const plc = nearest(pins.filter(p => role(p) === 'plc' && p.el.inst.tag), k);
    if (plc) return { group: plc.el.inst.tag, term: plc.label || plc.pinId, pin: plc };
    const conns = pins.filter(p => role(p) === 'pin' && p.el.inst.tag.includes(':') && p.el.page.id === k.pageId);
    let fallback: { group: string; term: string; pin: NetPin } | undefined;
    for (const c of conns) {
      for (const q of c.el.sym.pins) {
        const m = netOfPin.get(`${c.el.inst.id}|${q.id}`);
        if (!m || m === k.net) continue;
        const beyond = m.pins.filter(x => x.el.page.id === c.el.page.id);
        const bt = beyond.find(x => role(x) === 'terminal' && x.el.inst.tag.includes(':'));
        if (bt) return { group: stripOf(bt.el.inst.tag), term: after(bt.el.inst.tag), pin: c };
        const bp = beyond.find(x => role(x) === 'plc' && x.el.inst.tag);
        if (bp) return { group: bp.el.inst.tag, term: bp.label || after(c.el.inst.tag), pin: c };
      }
      fallback ??= { group: stripOf(c.el.inst.tag), term: after(c.el.inst.tag), pin: c };
    }
    return fallback;
  };
  /** Dispositivo in campo raggiunto dal conduttore, anche oltre un pin di connettore; altrimenti l'altro morsetto */
  const deviceOf = (k: Conductor, start: NetPin): { dev: string; pin: string } => {
    const net = k.net!;
    const field = (ps: NetPin[]) => ps.filter(p => !NOT_FIELD.has(role(p)) && p.el.inst.tag);
    const d = nearest(field(net.pins), k) ?? field(net.pins)[0];
    if (d) return { dev: d.el.inst.tag, pin: d.label };
    for (const p of net.pins) {
      if (role(p) !== 'pin' || p === start) continue;
      for (const q of p.el.sym.pins) {
        const m = netOfPin.get(`${p.el.inst.id}|${q.id}`);
        if (!m || m === net) continue;
        const x = field(m.pins)[0];
        if (x) return { dev: x.el.inst.tag, pin: x.label };
      }
    }
    const other = net.pins.find(p => p !== start && role(p) === 'terminal' && p.el.inst.tag.includes(':') && stripOf(p.el.inst.tag) !== stripOf(start.el.inst.tag));
    return other ? { dev: stripOf(other.el.inst.tag), pin: after(other.el.inst.tag) } : { dev: '', pin: '' };
  };
  const devTags = new Set(buildDevices(project).keys());
  for (const info of cableInfos(project, nl)) {
    const byGroup = new Map<string, (FieldColumn & { k: number })[]>();
    const seen = new Set<string>();
    for (const k of info.conductors) {
      if (!k.net || seen.has(k.name)) continue;
      const s = startOf(k);
      if (!s) continue;
      seen.add(k.name);
      const d = deviceOf(k, s.pin);
      // Partenza da un connettore (presa M12): il cavo va pin a pin, il pin del dispositivo è quello del connettore
      const cpin = role(s.pin) === 'pin' ? after(s.pin.el.inst.tag) : '';
      const list = byGroup.get(s.group) ?? [];
      list.push({ term: s.term, wireNo: k.net.wireNo, cond: k.name, dev: d.dev, pin: d.pin || cpin, k: orderOf(s.group).get(s.term) ?? 1e6 });
      byGroup.set(s.group, list);
    }
    for (const [group, cols] of byGroup) {
      // Conduttori senza dispositivo (es. +24 V e 0 V del sensore disegnati altrove): vanno al dispositivo del cavo
      const count = new Map<string, number>();
      for (const x of cols) if (x.dev) count.set(x.dev, (count.get(x.dev) ?? 0) + 1);
      const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (main && devTags.has(main)) for (const x of cols) if (!x.dev) x.dev = main;
      cols.sort((a, b) => a.k - b.k || a.term.localeCompare(b.term, undefined, { numeric: true }) || a.cond.localeCompare(b.cond, undefined, { numeric: true }));
      const c = info.cable;
      (out.get(group) ?? out.set(group, []).get(group)!).push({
        tag: c.tag, type: c.type ?? '', section: c.cross ?? '', shield: !!c.shield, length: c.length,
        cols: cols.map(({ k: _k, ...x }) => x),
      });
    }
  }
  // Cavi in ordine del primo morsetto
  for (const [group, list] of out) {
    const o = orderOf(group);
    const rank = (c: FieldCable) => o.get(c.cols[0].term) ?? 1e6;
    list.sort((a, b) => rank(a) - rank(b) || a.cols[0].term.localeCompare(b.cols[0].term, undefined, { numeric: true }) || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  }
  return out;
}

/** Cavi divisi in fogli: ogni foglio quanti cavi ci stanno in larghezza (un cavo più largo del foglio va da solo) */
function paginate(cables: FieldCable[]): FieldCable[][] {
  const width = FIELD.right - FIELD.left;
  const sheets: FieldCable[][] = [];
  let cur: FieldCable[] = [], used = 0;
  for (const c of cables) {
    const w = cableWidth(c);
    if (cur.length && used + w > width) { sheets.push(cur); cur = []; used = 0; }
    cur.push(c); used += w;
  }
  if (cur.length) sheets.push(cur);
  return sheets;
}

/** Pagine da generare: una o più per ogni morsettiera da cui parte almeno un cavo */
export function fieldItems(project: Project, nl = computeNetlist(project)): string[] {
  const all = stripCables(project, nl);
  return [...all.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).flatMap(s => {
    const n = paginate(all.get(s)!).length;
    return Array.from({ length: n }, (_, i) => fieldItem(s, i, n));
  });
}

/** Titolo della pagina */
export function fieldTitle(item: string): string {
  const { strip, sheet } = parseItem(item);
  return `Collegamenti in campo -${strip}${item.includes(ITEM_SEP) ? ` (${sheet + 1})` : ''}`;
}

/** Dati di un foglio */
export function fieldSheet(project: Project, item: string, library: Part[] = [], nl = computeNetlist(project)): FieldSheet | undefined {
  const { strip, sheet } = parseItem(item);
  const cables = stripCables(project, nl).get(strip);
  if (!cables?.length) return undefined;
  const sheets = paginate(cables);
  const mine = sheets[Math.min(sheet, sheets.length - 1)];
  const parts = partsIndex(project, library);
  const devs = buildDevices(project);
  const devices: Record<string, FieldDevice> = {};
  for (const c of mine) for (const k of c.cols) {
    if (!k.dev || devices[k.dev]) continue;
    const d = devs.get(k.dev);
    devices[k.dev] = { tag: k.dev, description: d ? deviceInfo(d.elements, d.main, parts).description ?? '' : '' };
  }
  return { strip, sheet, sheets: sheets.length, cables: mine, devices };
}
