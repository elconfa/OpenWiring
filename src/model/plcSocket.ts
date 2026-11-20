// Prese M12 a 2 canali delle stazioni I/O (es. ET 200eco PN con doppia assegnazione): ogni presa ha
// +24 V (pin 1), 0 V (pin 3), FE (pin 5) e due canali indipendenti, A sul pin 4 e B sul pin 2, ognuno
// ingresso, uscita o non usato. Sullo schema la presa è un simbolo (plc_m12_body_*) e ogni canale un
// punto I/O normale (plc_m12_a_* / plc_m12_b_*) nello stesso punto, legati da SymbolInstance.plcGroup.
import type { IoKind, Page, Project, SymbolInstance } from './types';
import { cardByTag, cardType, parseChannel, usedChannels } from './plc';
import { PLC_SOCKET_STEP } from './symbols';
import { toWorld, uid } from './geometry';

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
const labelsFor = (part: 'body' | 'a' | 'b', name: string) => Object.fromEntries(PINS[part].map(id => [id, `${name}.${id}`]));

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
  for (let s = 0; s < cfg.count; s++) {
    const name = socketName(cfg.name, s);
    const sameName = !!oldCfg && socketName(oldCfg.name, s) === name;
    const pb = find(s, 'body');
    made.push({
      kind: 'symbol', id: pb?.id ?? uid('s'), symbolId: bodyId(cfg.up), ...pos(s), rot, ...(mirror ? { mirror } : {}),
      tag: cfg.tag, autoPins: false,
      pinLabels: pb && sameName ? { ...pb.pinLabels } : labelsFor('body', name),
      plcGroup: { id: gid, index: s, count: cfg.count, socket: 'body', first: cfg.first, second: cfg.second, name: cfg.name },
      show: { ...(pb?.show ?? {}), tag: s === 0 },
    });
    for (const part of ['a', 'b'] as const) {
      const kind = cfg.kinds[s]?.[part] ?? null;
      if (!kind) continue;
      const index = (part === 'a' ? cfg.first : cfg.second) + s;
      const channel = `${kind}${index}`;
      const max = t?.channels[kind] ?? 0;
      if (index >= max) { warnings.push(`${name} ${part.toUpperCase()}: la scheda -${cfg.tag} ha ${max} canali ${kind}`); continue; }
      if (taken.has(channel)) warnings.push(`${channel} di -${cfg.tag} è già usato da un altro punto I/O`);
      const prev = find(s, part);
      const keep = prev && prev.plcChannel === channel && prev.tag === cfg.tag;
      const pinLabels = prev && sameName ? { ...prev.pinLabels } : labelsFor(part, name);
      // Pin nuovi: si scrivono anche sul canale della scheda (vista PLC, Lista I/O, Excel)
      if (card && !(prev && sameName && prev.plcChannel === channel)) {
        const cur = { ...(card.io?.[channel] ?? {}), pins: Object.values(pinLabels) };
        card.io = { ...(card.io ?? {}), [channel]: cur };
      }
      made.push({
        kind: 'symbol', id: prev?.id ?? uid('s'), symbolId: channelId(part, kind, cfg.up), ...pos(s), rot, ...(mirror ? { mirror } : {}),
        tag: cfg.tag, plcChannel: channel, autoPins: false, pinLabels,
        plcGroup: { id: gid, index: s, count: cfg.count, socket: part },
        ...(keep && prev?.plcSymbol ? { plcSymbol: prev.plcSymbol } : {}), ...(keep && prev?.plcComment ? { plcComment: prev.plcComment } : {}),
        show: { ...(prev?.show ?? {}), tag: false },
      });
    }
  }
  const at = old.length ? page.elements.indexOf(old[0]) : page.elements.length;
  const oldIds = new Set(old.map(e => e.id));
  const rest = page.elements.filter(e => !oldIds.has(e.id));
  const before = page.elements.slice(0, at).filter(e => !oldIds.has(e.id)).length;
  page.elements = [...rest.slice(0, before), ...made, ...rest.slice(before)];
  return { ids: made.map(e => e.id), warnings };
}
