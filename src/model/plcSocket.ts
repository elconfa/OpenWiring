// Prese M12 a 2 canali delle stazioni I/O (es. ET 200eco PN con doppia assegnazione): ogni presa ha
// +24 V (pin 1), 0 V (pin 3), FE (pin 5) e due canali indipendenti, A sul pin 4 e B sul pin 2, ognuno
// ingresso, uscita o non usato. Sullo schema la presa è un simbolo (plc_m12_body_*) e ogni canale un
// punto I/O normale (plc_m12_a_* / plc_m12_b_*) nello stesso punto, legati da SymbolInstance.plcGroup.
import type { IoKind, Page, Project, SymbolInstance } from './types';
import type { PlcCard } from './types';
import { cardByTag, cardType, parseChannel, usedChannels } from './plc';
import { defaultGroupPins, firstFreeChannel } from './plcGroup';
import { PLC_SOCKET_COMMONS, PLC_SOCKET_PINS, PLC_SOCKET_STEP, plcSocketGeom } from './symbols';
import { toWorld, uid } from './geometry';
import { tn } from '../i18n/ui';
import type { Pt } from './types';

export type SocketKind = 'DI' | 'DO' | null;

export interface PlcSocketCfg {
  /** Sigla della scheda */
  tag: string;
  /** Numero di prese */
  count: number;
  /** Pin in alto (come gli ingressi) o in basso */
  up: boolean;
  /** Canale A della prima presa (pin 4) */
  first: number;
  /** Canale B della prima presa (pin 2): di serie 8 dopo il canale A */
  second: number;
  /** Nome della prima presa (es. X10): le altre seguono (X11, X12…) */
  name: string;
  /** Per ogni presa: canale A e canale B ingresso, uscita o non usato */
  kinds: { a: SocketKind; b: SocketKind }[];
  /** Sigle dei comuni per pin (assente = di serie: 1 «+», 5 «⏚», 3 «−») */
  commons?: Record<string, string>;
  /** Numeri dei pin per id (assente = di serie: A 4, B 2, comuni 1, 5, 3) */
  pinNos?: Record<string, string>;
}

/** Sigle dei comuni della presa: quelle scelte, altrimenti di serie */
export const socketCommons = (e: SymbolInstance): Record<string, string> => ({ ...PLC_SOCKET_COMMONS, ...(e.plcGroup?.commons ?? {}) });

/**
 * Sigle dei comuni di una presa sullo schema (coordinate della pagina): testi, e il segno di terra
 * disegnato a linee al posto di «⏚» (non tutti i caratteri ci sono in stampa e nel DXF)
 */
export function socketCommonMarks(e: SymbolInstance): { texts: (Pt & { s: string })[]; lines: [Pt, Pt][] } {
  const out = { texts: [] as (Pt & { s: string })[], lines: [] as [Pt, Pt][] };
  if (e.plcGroup?.socket !== 'body') return out;
  const g = plcSocketGeom(e.symbolId.endsWith('_up'));
  const labels = socketCommons(e);
  const w = (x: number, y: number) => toWorld(e, { x, y });
  for (const [id, x] of PLC_SOCKET_PINS.body) {
    const s = labels[id] ?? '';
    if (!s) continue;
    if (s === '⏚') {
      const y = g.labelY - 0.6;
      out.lines.push([w(x - 1.4, y - 1.2), w(x + 1.4, y - 1.2)], [w(x - 0.9, y - 0.5), w(x + 0.9, y - 0.5)], [w(x - 0.4, y + 0.2), w(x + 0.4, y + 0.2)], [w(x, y - 2.6), w(x, y - 1.2)]);
    } else out.texts.push({ ...w(x, g.labelY), s });
  }
  return out;
}

/**
 * Canali di serie di un gruppo di prese su una scheda: canale A dal primo libero, canale B 8 dopo
 * (doppia assegnazione) se la scheda ne ha abbastanza, tutti del tipo del gruppo
 */
export function defaultSocketChannels(project: Project, card: PlcCard, io: 'DI' | 'DO', count: number, fresh = false): Pick<PlcSocketCfg, 'first' | 'second' | 'kinds'> {
  const max = cardType(card).channels[io] ?? 0;
  const first = fresh ? 0 : firstFreeChannel(project, card, io, count);
  const second = first + 8 < max ? first + 8 : first + count;
  return { first, second, kinds: Array.from({ length: count }, (_, s) => ({ a: first + s < max ? io : null, b: second + s < max ? io : null })) };
}

/** Scheda adatta alle prese a 2 canali: ha libero il canale A e anche il canale B 8 dopo */
export function socketCardFits(project: Project, card: PlcCard, io: 'DI' | 'DO', count: number): boolean {
  const max = cardType(card).channels[io] ?? 0;
  if (max < 8 + count) return false;
  const used = usedChannels(project, card.tag);
  const first = firstFreeChannel(project, card, io, count);
  return first + 8 + count <= max && !used.has(`${io}${first}`) && !used.has(`${io}${first + 8}`);
}

/** Presa (simbolo con +24 V, FE, 0 V) del canale di una presa M12, cercata nelle pagine del progetto */
export function socketBodyOf(project: Project, e: SymbolInstance | undefined): SymbolInstance | undefined {
  const g = e?.plcGroup;
  if (!g?.socket || g.socket === 'body') return undefined;
  for (const pg of project.pages) for (const x of pg.elements)
    if (x.kind === 'symbol' && x.plcGroup?.socket === 'body' && x.plcGroup.id === g.id && x.plcGroup.index === g.index) return x;
  return undefined;
}

export const isSocketMember = (e: SymbolInstance) => !!e.plcGroup?.socket;

/** Nome della presa s: il numero finale del nome della prima presa cresce (X10 → X11), altrimenti si aggiunge */
export function socketName(name: string, s: number): string {
  const m = /^(.*?)(\d+)$/.exec(name.trim());
  if (m) return `${m[1]}${String(parseInt(m[2], 10) + s).padStart(m[2].length, '0')}`;
  return `${name.trim() || 'X'}${s + 1}`;
}

const bodyId = (up: boolean) => `plc_m12_body_${up ? 'up' : 'down'}`;
const channelId = (part: 'a' | 'b', kind: IoKind, up: boolean) => `plc_m12_${part}_${kind === 'DO' ? 'do' : 'di'}_${up ? 'up' : 'down'}`;
/** Pin della presa per parte */
const PINS = { body: ['1', '3', '5'], a: ['4'], b: ['2'] } as const;
/** Numeri dei pin della presa: quelli scelti (pinNos), altrimenti di serie (A 4, B 2, comuni 1, 5, 3) */
const labelsFor = (part: 'body' | 'a' | 'b', name: string, nos?: Record<string, string>) => Object.fromEntries(PINS[part].map(id => [id, `${name}.${nos?.[id] || id}`]));

export function socketMembers(page: Page, gid: string): SymbolInstance[] {
  const rank = { body: 0, a: 1, b: 2 } as const;
  return page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && e.plcGroup?.id === gid && !!e.plcGroup.socket)
    .sort((a, b) => a.plcGroup!.index - b.plcGroup!.index || rank[a.plcGroup!.socket!] - rank[b.plcGroup!.socket!]);
}

/** Configurazione attuale del gruppo di prese, ricavata dai suoi elementi */
export function socketConfig(page: Page, gid: string): PlcSocketCfg | undefined {
  const m = socketMembers(page, gid);
  const body = m.find(e => e.plcGroup!.socket === 'body');
  if (!body) return undefined;
  const g = body.plcGroup!;
  const count = Math.max(...m.map(e => e.plcGroup!.count), ...m.map(e => e.plcGroup!.index + 1));
  const first = g.first ?? 0;
  const name0 = g.index === 0 ? g.name : undefined;
  const kinds = Array.from({ length: count }, (_, s) => {
    const kind = (part: 'a' | 'b'): SocketKind => {
      const e = m.find(x => x.plcGroup!.index === s && x.plcGroup!.socket === part);
      const k = parseChannel(e?.plcChannel)?.kind;
      return k === 'DI' || k === 'DO' ? k : null;
    };
    return { a: kind('a'), b: kind('b') };
  });
  return {
    tag: body.tag, count, up: body.symbolId.endsWith('_up'), first, second: g.second ?? first + 8,
    name: name0 ?? m.find(e => e.plcGroup!.socket === 'body' && e.plcGroup!.index === 0)?.plcGroup?.name ?? g.name ?? 'X1', kinds,
    ...(g.commons ? { commons: { ...g.commons } } : {}),
    ...(g.pinNos ? { pinNos: { ...g.pinNos } } : {}),
  };
}

/**
 * Ricostruisce il gruppo di prese con la configurazione data (dentro un commit). Le prese restano
 * dove sono; i canali conservano variabile e commento se il canale non cambia, e i pin se non cambia
 * il nome della presa. Senza elementi esistenti il gruppo nasce nel punto at con la rotazione rot.
 */
export function buildSocketGroup(project: Project, page: Page, gid: string, cfg: PlcSocketCfg,
  place?: { at: { x: number; y: number }; rot: SymbolInstance['rot'] }): { ids: string[]; warnings: string[] } {
  const old = socketMembers(page, gid);
  const oldCfg = old.length ? socketConfig(page, gid) : undefined;
  const card = cardByTag(project, cfg.tag);
  const t = card ? cardType(card) : undefined;
  const ref = old.find(e => e.plcGroup!.socket === 'body') ?? old[0];
  const rot = ref?.rot ?? place?.rot ?? 0;
  const mirror = ref?.mirror;
  const o = toWorld({ x: 0, y: 0, rot, mirror }, { x: 0, y: 0 }), s1 = toWorld({ x: 0, y: 0, rot, mirror }, { x: PLC_SOCKET_STEP, y: 0 });
  const axis = { x: s1.x - o.x, y: s1.y - o.y };
  const anchor = ref ? { x: ref.x - axis.x * ref.plcGroup!.index, y: ref.y - axis.y * ref.plcGroup!.index } : place?.at ?? { x: 0, y: 0 };
  const find = (s: number, part: 'body' | 'a' | 'b') => old.find(e => e.plcGroup!.index === s && e.plcGroup!.socket === part);
  const taken = usedChannels(project, cfg.tag);
  for (const e of old) if (e.plcChannel && e.tag === cfg.tag) taken.delete(e.plcChannel);
  const warnings: string[] = [];
  const made: SymbolInstance[] = [];
  const pos = (s: number) => ({ x: Math.round((anchor.x + axis.x * s) * 100) / 100, y: Math.round((anchor.y + axis.y * s) * 100) / 100 });
  // Sigle dei comuni: solo quelle diverse da quelle di serie
  const diff = Object.entries(cfg.commons ?? {}).filter(([id, v]) => v !== PLC_SOCKET_COMMONS[id]);
  const commons = diff.length ? Object.fromEntries(diff) : undefined;
  const nosDiff = Object.entries(cfg.pinNos ?? {}).filter(([id, v]) => v && v !== id);
  const pinNos = nosDiff.length ? Object.fromEntries(nosDiff) : undefined;
  // Numeri dei pin cambiati: i pin si riscrivono
  const nosSame = JSON.stringify(pinNos ?? {}) === JSON.stringify(oldCfg?.pinNos ?? {});
  for (let s = 0; s < cfg.count; s++) {
    const pb0 = find(s, 'body');
    const name = pb0?.plcGroup?.own && pb0.tag === cfg.tag && pb0.plcGroup.name ? pb0.plcGroup.name : socketName(cfg.name, s);
    const pb = find(s, 'body');
    // Prese riunite da gruppi diversi (own): tengono il loro nome e i loro pin
    const ownBody = !!pb?.plcGroup?.own && pb.tag === cfg.tag;
    const sameName = nosSame && (ownBody || (!!oldCfg && socketName(oldCfg.name, s) === name));
    made.push({
      kind: 'symbol', id: pb?.id ?? uid('s'), symbolId: bodyId(cfg.up), ...pos(s), rot, ...(mirror ? { mirror } : {}),
      tag: cfg.tag, autoPins: false,
      pinLabels: pb && sameName ? { ...pb.pinLabels } : labelsFor('body', name, pinNos),
      plcGroup: { id: gid, index: s, count: cfg.count, socket: 'body', first: cfg.first, second: cfg.second, name: ownBody ? pb!.plcGroup!.name ?? cfg.name : cfg.name, ...(commons ? { commons } : {}), ...(pinNos ? { pinNos } : {}), ...(ownBody ? { own: true } : {}) },
      show: { ...(pb?.show ?? {}), tag: s === 0 },
    });
    for (const part of ['a', 'b'] as const) {
      const kind = cfg.kinds[s]?.[part] ?? null;
      if (!kind) continue;
      const prev = find(s, part);
      // Canale scelto per la sua presa (prese riunite): resta quello, se è dello stesso tipo e della stessa scheda
      const ownCh = prev?.plcGroup?.own && prev.tag === cfg.tag ? parseChannel(prev.plcChannel) : undefined;
      const index = ownCh && ownCh.kind === kind ? ownCh.index : (part === 'a' ? cfg.first : cfg.second) + s;
      const channel = `${kind}${index}`;
      const max = t?.channels[kind] ?? 0;
      if (index >= max) { warnings.push(`${name} ${part.toUpperCase()}: la scheda -${cfg.tag} ha ${max} canali ${kind}`); continue; }
      if (taken.has(channel)) warnings.push(`${channel} di -${cfg.tag} è già usato da un altro punto I/O`);
      const keep = prev && prev.plcChannel === channel && prev.tag === cfg.tag;
      const pinLabels = prev && sameName ? { ...prev.pinLabels } : labelsFor(part, name, pinNos);
      // Pin nuovi: si scrivono anche sul canale della scheda (vista PLC, Lista I/O, Excel)
      if (card && !(prev && sameName && prev.plcChannel === channel && prev.tag === cfg.tag)) {
        const cur = { ...(card.io?.[channel] ?? {}), pins: Object.values(pinLabels) };
        card.io = { ...(card.io ?? {}), [channel]: cur };
      }
      made.push({
        kind: 'symbol', id: prev?.id ?? uid('s'), symbolId: channelId(part, kind, cfg.up), ...pos(s), rot, ...(mirror ? { mirror } : {}),
        tag: cfg.tag, plcChannel: channel, autoPins: false, pinLabels,
        plcGroup: { id: gid, index: s, count: cfg.count, socket: part, ...(ownCh && ownCh.kind === kind ? { own: true } : {}) },
        ...(keep && prev?.plcSymbol ? { plcSymbol: prev.plcSymbol } : {}), ...(keep && prev?.plcComment ? { plcComment: prev.plcComment } : {}),
        show: { ...(prev?.show ?? {}), tag: false },
      });
    }
  }
  // Canali che il gruppo lascia (scheda o canale cambiati): via i pin che la presa aveva scritto sulla scheda
  const kept = new Set(made.filter(e => e.plcChannel).map(e => `${e.tag}|${e.plcChannel}`));
  for (const e of old) {
    if (!e.plcChannel || kept.has(`${e.tag}|${e.plcChannel}`)) continue;
    const c = cardByTag(project, e.tag), io = c?.io?.[e.plcChannel];
    if (!c || !io?.pins || io.pins.join('|') !== Object.values(e.pinLabels).join('|')) continue;
    const { pins: _p, ...rest } = io;
    const next = { ...(c.io ?? {}) };
    if (Object.keys(rest).length) next[e.plcChannel] = rest; else delete next[e.plcChannel];
    c.io = next;
  }
  const at = old.length ? page.elements.indexOf(old[0]) : page.elements.length;
  const oldIds = new Set(old.map(e => e.id));
  const rest = page.elements.filter(e => !oldIds.has(e.id));
  const before = page.elements.slice(0, at).filter(e => !oldIds.has(e.id)).length;
  page.elements = [...rest.slice(0, before), ...made, ...rest.slice(before)];
  return { ids: made.map(e => e.id), warnings };
}

/**
 * Separa il gruppo di prese (dentro un commit): ogni presa diventa un gruppo a sé con la sua presa e i
 * suoi due canali (stessi canali, pin, variabili e commenti), da spostare dove serve.
 * Restituisce gli id degli elementi.
 */
export function splitSocketGroup(page: Page, gid: string): string[] {
  const cfg = socketConfig(page, gid);
  const m = socketMembers(page, gid);
  if (!cfg) return [];
  const ids = new Map<number, string>();
  for (const e of m) {
    const s = e.plcGroup!.index;
    const g = ids.get(s) ?? uid('g');
    ids.set(s, g);
    if (e.plcGroup!.socket === 'body') {
      e.plcGroup = { ...e.plcGroup!, id: g, index: 0, count: 1, first: cfg.first + s, second: cfg.second + s, name: e.plcGroup!.own && e.plcGroup!.name ? e.plcGroup!.name : socketName(cfg.name, s), own: true };
      e.show = { ...(e.show ?? {}), tag: true };
    } else e.plcGroup = { ...e.plcGroup!, id: g, index: 0, count: 1, own: true };
  }
  return m.map(e => e.id);
}

/**
 * Riunisce in un gruppo (dentro un commit) le prese scelte (anche di gruppi diversi) della stessa scheda,
 * con i pin dalla stessa parte e la stessa rotazione: nell'ordine lungo il gruppo, una ogni 80 mm a
 * partire dalla prima; ogni presa tiene nome, pin e canali. Restituisce l'id del gruppo o il motivo.
 */
export function joinSockets(page: Page, ids: string[]): { gid?: string; error?: string } {
  const sel = page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && ids.includes(e.id) && !!e.plcGroup?.socket);
  // Prese scelte (anche selezionando solo un canale): la presa e i suoi canali
  const keys = [...new Set(sel.map(e => `${e.plcGroup!.id}|${e.plcGroup!.index}`))];
  const bodies = keys.map(k => page.elements.find((e): e is SymbolInstance => e.kind === 'symbol' && e.plcGroup?.socket === 'body' && `${e.plcGroup.id}|${e.plcGroup.index}` === k)).filter((e): e is SymbolInstance => !!e);
  if (bodies.length < 2) return { error: tn('Scegli almeno due prese M12') };
  const a = bodies[0];
  if (bodies.some(e => e.tag !== a.tag)) return { error: tn('Le prese devono essere della stessa scheda') };
  if (bodies.some(e => e.symbolId !== a.symbolId)) return { error: tn('Le prese devono avere i pin dalla stessa parte (tutte ingressi o tutte uscite)') };
  if (bodies.some(e => e.rot !== a.rot || !!e.mirror !== !!a.mirror)) return { error: tn('Le prese devono avere la stessa rotazione') };
  const o = toWorld({ x: 0, y: 0, rot: a.rot, mirror: a.mirror }, { x: 0, y: 0 }), s1 = toWorld({ x: 0, y: 0, rot: a.rot, mirror: a.mirror }, { x: PLC_SOCKET_STEP, y: 0 });
  const axis = { x: s1.x - o.x, y: s1.y - o.y };
  bodies.sort((p, q) => (p.x * axis.x + p.y * axis.y) - (q.x * axis.x + q.y * axis.y));
  const gid = uid('g');
  const first = bodies[0];
  const names = bodies.map(b => {
    const c = socketConfig(page, b.plcGroup!.id);
    return b.plcGroup!.own && b.plcGroup!.name ? b.plcGroup!.name : socketName(c?.name ?? 'X1', b.plcGroup!.index);
  });
  const commons = first.plcGroup!.commons;
  bodies.forEach((b, i) => {
    const old = { id: b.plcGroup!.id, index: b.plcGroup!.index };
    const dx = Math.round((first.x + axis.x * i - b.x) * 100) / 100, dy = Math.round((first.y + axis.y * i - b.y) * 100) / 100;
    for (const e of page.elements) {
      if (e.kind !== 'symbol' || e.plcGroup?.id !== old.id || e.plcGroup.index !== old.index || !e.plcGroup.socket) continue;
      e.x = Math.round((e.x + dx) * 100) / 100; e.y = Math.round((e.y + dy) * 100) / 100;
      e.plcGroup = e.plcGroup.socket === 'body'
        ? { ...e.plcGroup, id: gid, index: i, count: bodies.length, name: names[i], own: true, ...(commons ? { commons } : { commons: undefined }) }
        : { ...e.plcGroup, id: gid, index: i, count: bodies.length, own: true };
      if (e.plcGroup.socket === 'body') e.show = { ...(e.show ?? {}), tag: i === 0 };
    }
  });
  return { gid };
}

/** Scrive i pin del canale sulla scheda (vista PLC, Lista I/O, Excel) */
function writeCardPins(project: Project, e: SymbolInstance, pins: string[]) {
  const c = cardByTag(project, e.tag);
  if (!c || !e.plcChannel) return;
  c.io = { ...(c.io ?? {}), [e.plcChannel]: { ...(c.io?.[e.plcChannel] ?? {}), pins } };
}

/**
 * Rimette i numeri dei pin automatici (dentro un commit) in un gruppo di prese M12 o in un gruppo I/O:
 * prese «X10.4, X10.1, X10.5, X10.3, X10.2» dal nome della presa; gruppi in sequenza o quelli
 * dell'articolo della scheda. Restituisce quanti elementi sono cambiati.
 */
export function resetGroupPins(project: Project, page: Page, gid: string): number {
  const members = page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && e.plcGroup?.id === gid);
  let n = 0;
  const set = (e: SymbolInstance, labels: Record<string, string>) => {
    if (JSON.stringify(e.pinLabels) !== JSON.stringify(labels)) { e.pinLabels = labels; n++; }
    if (e.plcChannel) writeCardPins(project, e, Object.keys(labels).sort().map(k => labels[k]));
  };
  const bodies = new Map(members.filter(e => e.plcGroup!.socket === 'body').map(e => [e.plcGroup!.index, e]));
  for (const e of members) {
    const g = e.plcGroup!;
    if (g.socket) {
      const body = bodies.get(g.index);
      const bg = body?.plcGroup;
      if (!bg) continue;
      // Nome della presa: il suo (prese riunite) o quello in sequenza dalla prima
      const name = bg.own ? bg.name ?? socketName('X1', g.index) : socketName(bg.name ?? 'X1', g.index);
      set(e, labelsFor(g.socket, name, bg.pinNos));
      continue;
    }
    const ch = parseChannel(e.plcChannel);
    const card = cardByTag(project, e.tag);
    if (!ch) continue;
    // Senza i pin scritti a mano sul canale: quelli dell'articolo o in sequenza
    const terms = Math.max(1, Object.keys(e.pinLabels).length || 1) as 1 | 2 | 4;
    const bare = card ? { ...card, io: { ...(card.io ?? {}), [e.plcChannel!]: { ...(card.io?.[e.plcChannel!] ?? {}), pins: undefined } } } : undefined;
    set(e, defaultGroupPins(bare, ch.kind, ch.index, terms));
  }
  return n;
}
