// Gruppi I/O PLC: un simbolo con più canali di una scheda (es. 8 ingressi), con 1 o 2 morsetti per
// canale. Sullo schema il gruppo è fatto di canali uno accanto all'altro (simboli plc_ch_*), legati
// da SymbolInstance.plcGroup: per il resto del programma ogni canale è un normale punto I/O (lista
// I/O, tabelle variabili, panoramica, controlli e netlist non cambiano).
import type { IoKind, Page, PlcCard, Project, SymbolInstance } from './types';
import { cardByTag, cardType, parseChannel, usedChannels } from './plc';
import { plcGroupStep, type PlcTerms } from './symbols';
import { toWorld, uid } from './geometry';
import { tn } from '../i18n/ui';

export interface PlcGroupCfg {
  /** Sigla della scheda */
  tag: string;
  kind: IoKind;
  /** Numero del primo canale (DI0 → 0) */
  first: number;
  /** Canali del gruppo, anche quelli nascosti */
  count: number;
  /** Morsetti per canale */
  terms: PlcTerms;
  /** Canali nascosti (posizioni nel gruppo): lo spazio resta, il canale non c'è */
  unused: number[];
}

export const sliceIdFor = (kind: IoKind, terms: PlcTerms) => `plc_ch_${kind === 'DO' ? 'do' : 'di'}${terms}`;
export const termsOf = (symbolId: string): PlcTerms => (symbolId.endsWith('4') ? 4 : symbolId.endsWith('2') ? 2 : 1);

/** Canali di un gruppo sulla pagina, in ordine di posizione */
export function groupMembers(page: Page, gid: string): SymbolInstance[] {
  return page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && e.plcGroup?.id === gid)
    .sort((a, b) => a.plcGroup!.index - b.plcGroup!.index);
}

/** Configurazione attuale del gruppo, ricavata dai suoi canali */
export function groupConfig(page: Page, gid: string): PlcGroupCfg | undefined {
  const m = groupMembers(page, gid);
  if (!m.length) return undefined;
  const ref = m.find(e => !e.plcGroup!.own && parseChannel(e.plcChannel)) ?? m[0];
  const ch = parseChannel(ref.plcChannel);
  const count = Math.max(...m.map(e => e.plcGroup!.count), ...m.map(e => e.plcGroup!.index + 1));
  const present = new Set(m.map(e => e.plcGroup!.index));
  return {
    tag: ref.tag, kind: ch?.kind ?? (ref.symbolId.includes('_do') ? 'DO' : 'DI'),
    first: Math.max(0, (ch?.index ?? 0) - ref.plcGroup!.index), count, terms: termsOf(ref.symbolId),
    unused: Array.from({ length: count }, (_, i) => i).filter(i => !present.has(i)),
  };
}

/**
 * Numeri dei pin della scheda proposti per un canale: quelli dell'articolo se ci sono, altrimenti
 * in sequenza (1 morsetto: 1, 2, 3…; 2 morsetti: 1-2, 3-4…; 4 morsetti: 1-4, 5-8…)
 */
export function defaultGroupPins(card: PlcCard | undefined, kind: IoKind, index: number, terms: PlcTerms): Record<string, string> {
  const ids = Array.from({ length: terms }, (_, i) => String(i + 1));
  // Pin già scritti sul canale (vista PLC o un altro gruppo): si usano quelli
  const own = card?.io?.[`${kind}${index}`]?.pins;
  if (own?.some(Boolean)) return Object.fromEntries(ids.map((id, i) => [id, own[i] ?? '']));
  const fromPart = card?.custom?.terminals?.[`${kind}${index}`];
  if (fromPart) return Object.fromEntries(ids.map((id, i) => [id, i === 0 ? fromPart : '']));
  return Object.fromEntries(ids.map((id, i) => [id, String(terms * index + i + 1)]));
}

/**
 * Ricostruisce il gruppo con la configurazione data (dentro un commit): i canali restano dove
 * sono, uno ogni 8 mm dal primo, e conservano variabile, commento, pin scelti e visibilità.
 * Senza canali esistenti il gruppo nasce nel punto at con la rotazione rot.
 * Restituisce gli id dei canali e gli avvisi (canali oltre quelli della scheda o già usati).
 */
export function buildPlcGroup(project: Project, page: Page, gid: string, cfg: PlcGroupCfg,
  place?: { at: { x: number; y: number }; rot: SymbolInstance['rot'] }): { ids: string[]; warnings: string[] } {
  const old = groupMembers(page, gid);
  const card = cardByTag(project, cfg.tag);
  const max = card ? cardType(card).channels[cfg.kind] ?? 0 : 0;
  const rot = old[0]?.rot ?? place?.rot ?? 0;
  const mirror = old[0]?.mirror;
  // Passo lungo il gruppo, secondo la rotazione; origine del canale 0
  // (il passo dipende dai morsetti per canale: l'origine si ricava con il passo dei canali che c'erano)
  const axisOf = (terms: PlcTerms) => {
    const o = toWorld({ x: 0, y: 0, rot, mirror }, { x: 0, y: 0 }), s = toWorld({ x: 0, y: 0, rot, mirror }, { x: plcGroupStep(terms), y: 0 });
    return { x: s.x - o.x, y: s.y - o.y };
  };
  const axis = axisOf(cfg.terms), oldAxis = old.length ? axisOf(termsOf(old[0].symbolId)) : axis;
  const anchor = old.length ? { x: old[0].x - oldAxis.x * old[0].plcGroup!.index, y: old[0].y - oldAxis.y * old[0].plcGroup!.index } : place?.at ?? { x: 0, y: 0 };
  // Canali usati fuori dal gruppo
  const taken = usedChannels(project, cfg.tag);
  for (const e of old) if (e.plcChannel && e.tag === cfg.tag) taken.delete(e.plcChannel);
  const byIndex = new Map(old.map(e => [e.plcGroup!.index, e]));
  const warnings: string[] = [];
  const made: SymbolInstance[] = [];
  for (let k = 0; k < cfg.count; k++) {
    if (cfg.unused.includes(k)) continue;
    const prev = byIndex.get(k);
    const own = prev?.plcGroup?.own && prev.tag === cfg.tag && parseChannel(prev.plcChannel)?.kind === cfg.kind;
    const channel = own ? prev!.plcChannel! : `${cfg.kind}${cfg.first + k}`;
    const ch = parseChannel(channel)!;
    if (ch.index >= max) { warnings.push(`${channel}: la scheda -${cfg.tag} ha ${max} canali ${cfg.kind}`); continue; }
    if (taken.has(channel)) warnings.push(`${channel} di -${cfg.tag} è già usato da un altro punto I/O`);
    const keepPins = prev && termsOf(prev.symbolId) === cfg.terms && prev.tag === cfg.tag && (own || prev.plcChannel === channel);
    made.push({
      kind: 'symbol', id: prev?.id ?? uid('s'), symbolId: sliceIdFor(cfg.kind, cfg.terms),
      x: Math.round((anchor.x + axis.x * k) * 100) / 100, y: Math.round((anchor.y + axis.y * k) * 100) / 100, rot, ...(mirror ? { mirror } : {}),
      tag: cfg.tag, plcChannel: channel, autoPins: false,
      pinLabels: keepPins ? { ...prev!.pinLabels } : defaultGroupPins(card, cfg.kind, ch.index, cfg.terms),
      plcGroup: { id: gid, index: k, count: cfg.count, ...(own ? { own: true } : {}) },
      ...(prev?.plcSymbol ? { plcSymbol: prev.plcSymbol } : {}), ...(prev?.plcComment ? { plcComment: prev.plcComment } : {}),
      // La sigla della scheda solo sul primo canale visibile
      show: { ...(prev?.show ?? {}), tag: made.length === 0 },
    });
  }
  // I canali nuovi prendono il posto dei vecchi nell'ordine degli elementi della pagina
  const at = old.length ? page.elements.indexOf(old[0]) : page.elements.length;
  const oldIds = new Set(old.map(e => e.id));
  const rest = page.elements.filter(e => !oldIds.has(e.id));
  const before = page.elements.slice(0, at).filter(e => !oldIds.has(e.id)).length;
  page.elements = [...rest.slice(0, before), ...made, ...rest.slice(before)];
  return { ids: made.map(e => e.id), warnings };
}

/** Primo canale libero di una scheda da cui c'è posto per il gruppo (o il primo libero) */
export function firstFreeChannel(project: Project, card: PlcCard, kind: IoKind, count: number): number {
  const used = usedChannels(project, card.tag);
  const max = cardType(card).channels[kind] ?? 0;
  for (let i = 0; i < max; i++) {
    let ok = true;
    for (let k = 0; k < count && i + k < max; k++) if (used.has(`${kind}${i + k}`)) { ok = false; break; }
    if (ok) return i;
  }
  for (let i = 0; i < max; i++) if (!used.has(`${kind}${i}`)) return i;
  return 0;
}

export const newGroupId = () => uid('g');

/**
 * Separa il gruppo (dentro un commit): ogni canale diventa un punto I/O a sé, con lo stesso canale,
 * pin, variabile e commento e con la sigla della scheda, da spostare sotto il suo circuito.
 * Restituisce gli id dei canali.
 */
export function splitPlcGroup(page: Page, gid: string): string[] {
  const m = groupMembers(page, gid);
  for (const e of m) {
    delete e.plcGroup;
    // La sigla della scheda su ogni canale (nel gruppo stava solo sul primo)
    if (e.show) { const s = { ...e.show }; delete s.tag; if (Object.keys(s).length) e.show = s; else delete e.show; }
  }
  return m.map(e => e.id);
}

/**
 * Riunisce in un gruppo (dentro un commit) i canali singoli scelti della stessa scheda, con lo stesso
 * simbolo (ingressi o uscite, morsetti per canale) e la stessa rotazione: nell'ordine lungo il gruppo,
 * ognuno con il suo canale, allineati a partire dal primo. Restituisce l'id del gruppo o il motivo.
 */
export function joinPlcChannels(project: Project, page: Page, ids: string[]): { gid?: string; error?: string; warnings?: string[] } {
  const sel = page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && ids.includes(e.id) && e.symbolId.startsWith('plc_ch_') && !e.plcGroup);
  if (sel.length < 2) return { error: tn('Scegli almeno due canali singoli di gruppo I/O (separati con «Separa in canali»)') };
  const a = sel[0];
  if (sel.some(e => e.tag !== a.tag)) return { error: tn('I canali devono essere della stessa scheda') };
  if (sel.some(e => e.symbolId !== a.symbolId)) return { error: tn('I canali devono essere tutti ingressi o tutte uscite, con gli stessi morsetti per canale') };
  if (sel.some(e => e.rot !== a.rot || !!e.mirror !== !!a.mirror)) return { error: tn('I canali devono avere la stessa rotazione') };
  // Ordine lungo l'asse del gruppo (verso dei canali secondo la rotazione)
  const o = toWorld({ x: 0, y: 0, rot: a.rot, mirror: a.mirror }, { x: 0, y: 0 }), s = toWorld({ x: 0, y: 0, rot: a.rot, mirror: a.mirror }, { x: 1, y: 0 });
  const ax = { x: s.x - o.x, y: s.y - o.y };
  sel.sort((p, q) => (p.x * ax.x + p.y * ax.y) - (q.x * ax.x + q.y * ax.y));
  const gid = newGroupId();
  sel.forEach((e, i) => { e.plcGroup = { id: gid, index: i, count: sel.length, own: true }; });
  const cfg = groupConfig(page, gid)!;
  const { warnings } = buildPlcGroup(project, page, gid, cfg);
  return { gid, warnings };
}
