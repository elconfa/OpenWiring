// Scambio delle morsettiere con Weidmüller Configurator (WMC) nel formato CAEdex (.caedex, lo
// stesso dell'esportazione «per SEE Suite» e «per SPAC»). Il file descrive le guide (Rail) con la
// sequenza dei pezzi: fermo terminale con la targhetta del nome della morsettiera, morsetti con
// le targhette dei numeri (una per piano), piastre di chiusura e di separazione, ponticelli
// (Bridge, collegati ai morsetti su un piano). I collegamenti dello schema non ci sono: il
// progetto resta il riferimento per i numeri, il file porta articoli, ponticelli, separatori e
// morsetti in più (riserve); le morsettiere che il progetto non ha diventano morsettiere nuove
// fatte di riserve, da disegnare poi sullo schema (il primo morsetto libero proposto è una riserva).
import type { Part, Project, TerminalStripData, WmcCodes } from '../model/types';
import { parseXml, type Node } from './ema';
import { partsIndex } from '../model/devices';
import { stripRows, stripData, ensureStrip, compareTerminalNo, allStrips, type TerminalRow } from '../model/terminals';
import { uid } from '../model/geometry';

export interface WmcTerminal {
  /** Numeri delle targhette, dal primo piano (A) all'ultimo; vuoto = senza targhetta */
  nos: string[];
  code: string;
  type: string;
  /** Sezione nominale in mm² */
  section?: string;
  /** Ponticelli (id del file) con il piano a cui sono collegati (0 = primo) */
  bridges: { id: string; level: number }[];
  /** Separatore subito dopo questo morsetto (codice) */
  sepAfter?: string;
}

export interface WmcStrip {
  /** Nome dalla targhetta del fermo terminale; "" = pezzi prima del primo fermo con nome */
  name: string;
  rail: string;
  terminals: WmcTerminal[];
  endStop?: string;
  /** Codici dei ponticelli per id */
  bridgeCodes: Record<string, string>;
}

const attrsOf = (e: Node) => e.children.filter(c => c.tag === 'Attribute');
const attr = (e: Node, name: string) => attrsOf(e).find(a => a.attrs.name === name && !a.attrs.tokenId)?.attrs.value ?? attrsOf(e).find(a => a.attrs.name === name)?.attrs.value;
const refs = (e: Node) => e.children.filter(c => c.tag === 'ChildRef').map(c => ({ id: c.attrs.id, token: c.attrs.tokenId ?? '' }));
/** Piano di ogni punto del morsetto (targhette, morsetti, ponticelli): attributo DEFpattr520813107600 per tokenId */
const LEVEL_ATTR = 'DEFpattr520813107600';

/** Legge un file CAEdex: le morsettiere di ogni guida nell'ordine di montaggio */
export function parseCaedex(xml: string): WmcStrip[] {
  const root = parseXml(xml.replace(/^﻿/, ''));
  if (!root || root.tag !== 'CAEdex') throw new Error('Il file non è un CAEdex di Weidmüller Configurator');
  const entries = new Map(root.children.filter(c => c.tag === 'Entry').map(e => [e.attrs.id, e]));
  const out: WmcStrip[] = [];
  for (const rail of entries.values()) {
    if (rail.attrs.type !== 'Rail') continue;
    const railName = attr(rail, '.name') ?? '';
    let cur: WmcStrip | undefined;
    const start = (name: string, endStop?: string) => { cur = { name, rail: railName, terminals: [], endStop, bridgeCodes: {} }; out.push(cur); };
    for (const r of refs(rail)) {
      const e = entries.get(r.id);
      if (!e) continue;
      if (e.attrs.type === 'Separator') {
        const last = cur?.terminals[cur.terminals.length - 1];
        if (last) last.sepAfter = attr(e, '.code') ?? '';
        continue;
      }
      if (e.attrs.type !== 'Terminal') continue;
      const levels = new Map(attrsOf(e).filter(a => a.attrs.name === LEVEL_ATTR && a.attrs.tokenId).map(a => [a.attrs.tokenId, Number(a.attrs.value) || 1]));
      const marks = refs(e).map(x => ({ ...x, e: entries.get(x.id) })).filter(x => x.e?.attrs.type === 'Marker')
        .sort((a, b) => (levels.get(a.token) ?? 1) - (levels.get(b.token) ?? 1) || a.token.localeCompare(b.token));
      const texts = marks.map(m => (attr(m.e!, '.text') ?? '').trim());
      const type = attr(e, '.productType') ?? '';
      if (type === 'End bracket') { start(texts[0] ?? '', attr(e, '.code')); continue; }
      if (!cur) start('');
      const bridges = refs(e).filter(x => entries.get(x.id)?.attrs.type === 'Bridge').map(x => {
        cur!.bridgeCodes[x.id] = attr(entries.get(x.id)!, '.code') ?? '';
        return { id: x.id, level: Math.max(0, (levels.get(x.token) ?? (Number(/0(\d)$/.exec(x.token)?.[1]) || 1)) - 1) };
      });
      cur!.terminals.push({ nos: texts.filter(Boolean), code: attr(e, '.code') ?? '', type, section: attr(e, 'DEFA395_1002965.NOMINAL'), bridges });
    }
  }
  return out.filter(s => s.terminals.length);
}

/**
 * Codici degli accessori usati nel file (il più frequente per ogni tipo): servono a esportare i
 * pezzi che il progetto non descrive (targhette, fermi, guide, piastre di chiusura)
 */
export function parseCaedexCodes(xml: string): WmcCodes {
  const root = parseXml(xml.replace(/^\uFEFF/, ''));
  if (!root || root.tag !== 'CAEdex') return {};
  const entries = new Map(root.children.filter(c => c.tag === 'Entry').map(e => [e.attrs.id, e]));
  const markers = new Map<string, string[]>(), plates = new Map<string, string[]>(), all: string[] = [], covers: string[] = [], brackets: string[] = [], rails: string[] = [];
  for (const e of entries.values()) {
    const code = attr(e, '.code') ?? '';
    if (e.attrs.type === 'Rail') {
      rails.push(code);
      // Piastra di chiusura subito dopo un morsetto: quella di quel codice di morsetto
      let last = '';
      for (const r of refs(e)) {
        const x = entries.get(r.id);
        if (x?.attrs.type === 'Terminal' && attr(x, '.productType') !== 'End bracket') last = attr(x, '.code') ?? '';
        if (x?.attrs.type === 'Separator' && attr(x, '.productType') === 'End plate' && last) plates.set(last, [...(plates.get(last) ?? []), attr(x, '.code') ?? '']);
      }
    }
    if (e.attrs.type !== 'Terminal') continue;
    const bracket = attr(e, '.productType') === 'End bracket';
    if (bracket) brackets.push(code);
    for (const r of refs(e)) {
      const m = entries.get(r.id);
      if (m?.attrs.type !== 'Marker') continue;
      const mc = attr(m, '.code') ?? '';
      if (bracket) covers.push(mc);
      else { markers.set(code, [...(markers.get(code) ?? []), mc]); all.push(mc); }
    }
  }
  const pick = (m: Map<string, string[]>) => Object.fromEntries([...m].map(([k, v]) => [k, mostCommon(v)]).filter((x): x is [string, string] => !!x[0] && !!x[1]));
  const out: WmcCodes = { marker: pick(markers), markerDefault: mostCommon(all), stripMarker: mostCommon(covers), endBracket: mostCommon(brackets), rail: mostCommon(rails), endPlate: pick(plates) };
  for (const k of Object.keys(out) as (keyof WmcCodes)[]) if (out[k] === undefined || (typeof out[k] === 'object' && !Object.keys(out[k]!).length)) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------
// Abbinamento con il progetto
// ---------------------------------------------------------------------------

export interface WmcStripPlan {
  wmc: WmcStrip;
  /** Morsettiera del progetto a cui si applica (anche se il nome nel file è diverso) */
  strip: string;
  status: 'match' | 'new' | 'skip';
  /** Nome corretto rispetto al file (es. X1.1.12 sulla guida di Q2.1 → X2.1.12) */
  renamed?: boolean;
  /** Numeri del file → numeri del progetto, per piano di ogni morsetto */
  numbers: string[][];
  /** Abbinati per posizione perché i numeri del file non sono quelli del progetto */
  byPosition?: boolean;
  /** Morsetti del file che il progetto non ha (diventano riserve) */
  added: number;
  /** Morsetti del progetto che il file non ha */
  missing: string[];
  notes: string[];
}

const prefixOf = (name: string) => name.match(/^(.*)\.[^.]+$/)?.[1] ?? '';

/** Morsetti fisici del progetto (i piani insieme) nell'ordine della morsettiera */
function physical(rows: TerminalRow[]): TerminalRow[][] {
  const out = new Map<string, TerminalRow[]>();
  for (const r of rows) {
    const k = isNaN(parseInt(r.base, 10)) ? r.no : r.base;
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return [...out.values()];
}

/** Abbina le morsettiere del file a quelle del progetto, senza cambiare niente */
export function planWmc(p: Project, strips: WmcStrip[]): WmcStripPlan[] {
  const have = new Set(allStrips(p));
  // Prefisso più frequente su ogni guida (X2.1 sulla guida di Q2.1)
  const railPrefix = new Map<string, string>();
  for (const rail of new Set(strips.map(s => s.rail))) {
    const n = new Map<string, number>();
    for (const s of strips) if (s.rail === rail && s.name) n.set(prefixOf(s.name), (n.get(prefixOf(s.name)) ?? 0) + 1);
    const best = [...n].sort((a, b) => b[1] - a[1])[0];
    if (best) railPrefix.set(rail, best[0]);
  }
  const count = new Map<string, number>();
  for (const s of strips) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  const used = new Set<string>();
  return strips.map(w => {
    const notes: string[] = [];
    if (!w.name) return { wmc: w, strip: '', status: 'skip', numbers: [], added: 0, missing: [], notes: [`${w.terminals.length} morsetti senza nome della morsettiera sulla guida ${w.rail}: non importati`] };
    let name = w.name, renamed = false;
    // Nome con il prefisso di un altro quadro: copiato in WMC da un'altra guida
    const rp = railPrefix.get(w.rail), own = prefixOf(name);
    if (rp && own && own !== rp) {
      const fixed = `${rp}${name.slice(own.length)}`;
      if ((count.get(name) ?? 0) > 1 || !have.has(name) || have.has(fixed)) {
        notes.push(`nel file si chiama ${name}, ma è sulla guida ${w.rail} con le morsettiere ${rp}.*: considerata ${fixed}`);
        name = fixed; renamed = true;
      }
    }
    if (used.has(name)) {
      notes.push(`${name} compare più volte nel file: importata solo la prima`);
      return { wmc: w, strip: name, status: 'skip', renamed, numbers: [], added: 0, missing: [], notes };
    }
    used.add(name);
    const unnamed = w.terminals.filter(t => !t.nos.length).length;
    if (unnamed) notes.push(`${unnamed} morsetti senza targhetta`);
    if (!have.has(name)) {
      return { wmc: w, strip: name, status: 'new', renamed, numbers: newNumbers(w), added: w.terminals.length, missing: [], notes };
    }
    const phys = physical(stripRows(p, name));
    const projNos = new Set(phys.flat().map(r => r.no.toUpperCase()));
    const fileNos = w.terminals.flatMap(t => t.nos);
    const sameNames = fileNos.length > 0 && fileNos.every(n => projNos.has(n.toUpperCase()));
    let numbers: string[][];
    let byPosition = false;
    if (sameNames) {
      const canon = new Map(phys.flat().map(r => [r.no.toUpperCase(), r.no]));
      numbers = w.terminals.map(t => t.nos.map(n => canon.get(n.toUpperCase())!));
    } else {
      // Numeri diversi (es. E0.0 invece di 1A): il morsetto n del file è il morsetto n del progetto
      byPosition = true;
      const extra = nextFree(phys);
      numbers = w.terminals.map((t, i) => {
        const g = phys[i];
        if (g) return g.map(r => r.no);
        const n = extra();
        const lv = Math.max(1, t.nos.length);
        return lv > 1 ? Array.from({ length: lv }, (_, k) => `${n}${String.fromCharCode(65 + k)}`) : [String(n)];
      });
      notes.push(`numeri diversi dal progetto (nel file ${fileNos.slice(0, 3).join(', ')}…): abbinati per posizione`);
    }
    const got = new Set(numbers.flat());
    const missing = phys.flat().map(r => r.no).filter(n => !got.has(n));
    const added = numbers.filter(ns => ns.some(n => !projNos.has(n.toUpperCase()))).length;
    return { wmc: w, strip: name, status: 'match', renamed, numbers, byPosition, added, missing, notes };
  });
}

/** Numeri di una morsettiera nuova: quelli delle targhette, oppure 1, 2… (1A/1B… con più piani) */
function newNumbers(w: WmcStrip): string[][] {
  const seen = new Set<string>();
  let n = 0;
  return w.terminals.map(t => {
    n++;
    const ok = t.nos.length && t.nos.every(x => !seen.has(x.toUpperCase()));
    const nos = ok ? t.nos : t.type.includes('Double') || t.nos.length > 1 ? [`${n}A`, `${n}B`] : [String(n)];
    for (const x of nos) seen.add(x.toUpperCase());
    return nos;
  });
}

function nextFree(phys: TerminalRow[][]): () => number {
  let max = 0;
  for (const g of phys) { const v = parseInt(g[0].base, 10); if (!isNaN(v)) max = Math.max(max, v); }
  return () => ++max;
}

// ---------------------------------------------------------------------------
// Applicazione
// ---------------------------------------------------------------------------

const WM = 'Weidmüller';
const PRODUCT_IT: Record<string, string> = {
  'Feed-through terminal': 'Morsetto passante', 'Double-tier terminal': 'Morsetto a due piani', 'PE terminal': 'Morsetto di terra',
  'Fuse terminal': 'Morsetto portafusibile', 'Supply terminal': 'Morsetto di alimentazione', 'End bracket': 'Fermo terminale',
  'End plate': 'Piastra di chiusura', 'Partition plate': 'Piastra di separazione', 'Cross-connector': 'Ponticello',
};

/**
 * Nomi brevi degli articoli (codice → «A2T 2.5») dai file .iax che WMC esporta insieme al CAEdex,
 * per dare un nome agli articoli che il progetto non ha ancora
 */
export function parseIaxNames(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<Part\b[^>]*\barticleNumber="([^"]+)"[^>]*>([\s\S]*?)<\/Part>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const n = m[2].match(/name="\.materialShortName" value="([^"]*)"/);
    if (n?.[1] && !out[m[1]]) out[m[1]] = n[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  }
  return out;
}

/** Articolo con quel codice Weidmüller (codice d'ordine o codice articolo); se manca lo crea nel progetto */
function partFor(p: Project, library: Part[], code: string, descr?: string, levels?: number, names: Record<string, string> = {}): string | undefined {
  if (!code) return undefined;
  const all = [...partsIndex(p, library).values()];
  const f = all.find(x => x.orderNr === code) ?? all.find(x => x.partNr === code);
  if (f) {
    if (!p.parts.some(x => x.partNr === f.partNr)) p.parts.push(structuredClone(f));
    return f.partNr;
  }
  const name = names[code];
  const partNr = name && !all.some(x => x.partNr === name) ? name : code;
  p.parts.push({
    partNr, orderNr: code, typeNr: name ?? code, manufacturer: WM, descr1: descr ? PRODUCT_IT[descr] ?? descr : '',
    functionTemplates: [], attrs: {}, ...(levels ? { terminal: { levels } } : {}),
  });
  return partNr;
}

const mostCommon = (xs: (string | undefined)[]) => {
  const n = new Map<string, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export interface WmcResult { strips: number; created: number; spares: number; jumpers: number; parts: number }

/**
 * Applica al progetto le morsettiere abbinate: articoli dei morsetti (quello più usato diventa
 * l'articolo della morsettiera, gli altri vanno sui singoli morsetti), ponticelli, separatori,
 * piastra di chiusura, fermi terminali e i morsetti in più come riserve.
 */
export function applyWmc(p: Project, plans: WmcStripPlan[], library: Part[] = [], names: Record<string, string> = {}): WmcResult {
  const part = (code: string | undefined, descr?: string, levels?: number) => partFor(p, library, code ?? '', descr, levels, names);
  const res: WmcResult = { strips: 0, created: 0, spares: 0, jumpers: 0, parts: 0 };
  const parts0 = p.parts.length;
  for (const pl of plans) {
    if (pl.status === 'skip') continue;
    const w = pl.wmc, strip = pl.strip;
    if (pl.status === 'new') res.created++; else res.strips++;
    const d: TerminalStripData = ensureStrip(p, strip);
    const codes = w.terminals.map(t => part(t.code, t.type, Math.max(1, t.nos.length)));
    const main = mostCommon(codes);
    if (main) d.partNr = main;
    if (w.endStop) d.endStopPartNr = part(w.endStop, 'End bracket');
    // Separatori: l'ultimo è la piastra di chiusura, gli altri separano i morsetti
    const endIdx = w.terminals.length - 1;
    if (w.terminals[endIdx]?.sepAfter) d.endPlatePartNr = part(w.terminals[endIdx].sepAfter!, 'End plate');
    const seps = w.terminals.map((t, i) => (t.sepAfter && i < endIdx ? pl.numbers[i][pl.numbers[i].length - 1] : undefined)).filter((x): x is string => !!x);
    d.separators = [...new Set(seps)].sort(compareTerminalNo);
    const sepCode = mostCommon(w.terminals.slice(0, endIdx).map(t => t.sepAfter));
    if (sepCode) d.separatorPartNr = part(sepCode, 'Partition plate');
    // Morsetti: quelli che il progetto non ha diventano riserve; articolo proprio se diverso
    const rows = new Map(stripRows(p, strip).map(r => [r.no, r]));
    w.terminals.forEach((_, i) => {
      const nos = pl.numbers[i], code = codes[i];
      for (const no of nos) {
        const r = rows.get(no);
        if (!r) { d.spares.push(no); res.spares++; }
        if (code && code !== main) {
          if (r?.els.length) for (const e of r.els) e.inst.partNr = code;
          else (d.spareParts ??= {})[no] = code;
        } else if (!r?.els.length && d.spareParts?.[no]) delete d.spareParts[no];
      }
    });
    if (d.spareParts && !Object.keys(d.spareParts).length) delete d.spareParts;
    d.spares = [...new Set(d.spares)];
    // Ponticelli: uno per ponticello del file, sul piano a cui è collegato
    const groups = new Map<string, string[]>();
    w.terminals.forEach((t, i) => {
      for (const b of t.bridges) {
        const no = pl.numbers[i][Math.min(b.level, pl.numbers[i].length - 1)];
        groups.set(b.id, [...(groups.get(b.id) ?? []), no]);
      }
    });
    const kind = d.jumpers.length && d.jumpers.every(j => j.kind === 'fixed') ? 'fixed' : d.jumpers.length ? 'comb' : 'fixed';
    d.jumpers = [...groups].filter(([, nos]) => nos.length >= 2).map(([id, nos]) => ({
      id: uid('j'), kind, terminals: [...new Set(nos)].sort(compareTerminalNo), partNr: part(w.bridgeCodes[id], 'Cross-connector'),
    }));
    const jp = mostCommon(d.jumpers.map(j => j.partNr));
    if (jp) { d.jumperPartNr = jp; for (const j of d.jumpers) if (j.partNr === jp) delete j.partNr; }
    res.jumpers += d.jumpers.length;
  }
  res.parts = p.parts.length - parts0;
  return res;
}

/** Riassunto leggibile dell'abbinamento, una riga per morsettiera */
export function wmcReport(plans: WmcStripPlan[]): string[] {
  return plans.map(pl => {
    const w = pl.wmc;
    const head = pl.status === 'skip' ? 'non importata' : pl.status === 'new' ? `nuova, ${w.terminals.length} morsetti (riserve)` : `abbinata, ${w.terminals.length} morsetti`;
    const bits = [
      pl.status === 'match' && pl.added ? `${pl.added} in più (riserve)` : '',
      pl.missing.length ? `nel progetto ma non nel file: ${pl.missing.slice(0, 6).join(' ')}${pl.missing.length > 6 ? '…' : ''}` : '',
      ...pl.notes,
    ].filter(Boolean);
    return `${pl.strip ? `-${pl.strip}` : '(senza nome)'} [${w.rail}]: ${head}${bits.length ? ` · ${bits.join(' · ')}` : ''}`;
  });
}

// ---------------------------------------------------------------------------
// Esportazione verso WMC
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PRODUCT_EN: [RegExp, string][] = [[/terra|PE\b/i, 'PE terminal'], [/fusib/i, 'Fuse terminal'], [/alimentaz/i, 'Supply terminal']];

/**
 * File CAEdex con le morsettiere del progetto (una guida per quadro, dal prefisso X1.1 → la guida
 * del quadro +Q1.1 se c'è): fermo terminale con il nome, morsetti con le targhette di ogni
 * piano e il codice Weidmüller dell'articolo, separatori, piastra di chiusura e ponticelli.
 */
export interface CaedexExport { xml: string; problems: string[] }

/**
 * Codici tipici (Klippon Connect, passo 5 mm) per i pezzi che il progetto non descrive, finché non
 * si importa un file da Weidmüller Configurator: targhetta, targhetta del nome, fermo, guida TS 35
 */
const WMC_DEFAULTS = { marker: '1640740000', stripMarker: '1112910000', endBracket: '1991920000', rail: '0236400000' };
/** Numero d'ordine Weidmüller: 10 cifre (es. 1547610000) */
const isWm = (code: string) => /^\d{10}$/.test(code);

/**
 * Guide (una per quadro) con le loro morsettiere: il quadro delle pagine dove sono disegnati i
 * morsetti, altrimenti quello del nome (X1.2.15 → Q1.2)
 */
export function wmcRails(p: Project, strips = allStrips(p)): Map<string, string[]> {
  const byRail = new Map<string, string[]>();
  const panelCode = new Map((p.panels ?? []).map(x => [x.id, x.code]));
  for (const s of strips) {
    const fromPages = mostCommon(stripRows(p, s).flatMap(r => r.els.map(e => (e.page.panelId ? panelCode.get(e.page.panelId) : undefined))));
    const rail = fromPages ?? (s.match(/^X(\d+(?:\.\d+)?)/i)?.[1] ? `Q${s.match(/^X(\d+(?:\.\d+)?)/i)![1]}` : 'Q');
    byRail.set(rail, [...(byRail.get(rail) ?? []), s]);
  }
  return byRail;
}

export function exportCaedex(p: Project, library: Part[] = [], strips = allStrips(p)): CaedexExport {
  const parts = partsIndex(p, library);
  const known = p.settings.wmcCodes ?? {};
  const code = (nr?: string) => (nr ? parts.get(nr)?.orderNr || nr : '');
  const wm = (nr?: string) => { const c = code(nr); return isWm(c) ? c : ''; };
  const problems: string[] = [];
  // Voci raccolte e poi scritte dall'alto come fa il Configurator: guida, pezzo, sue targhette…
  const nodes: { type: string; attrs: [string, string, string?][]; children: [number, string][] }[] = [];
  const rails: number[] = [];
  const entry = (type: string, attrs: [string, string, string?][], children: [number, string][] = []) => nodes.push({ type, attrs, children }) - 1;
  const base = (c: string, type: string, name = ''): [string, string][] => [['.name', name], ['.manufacturer', WM], ['.code', c], ['.productType', type]];
  // Targhetta con il testo e il suo aspetto (senza carattere e dimensione il Configurator non scrive il testo):
  // nome della morsettiera grande e orizzontale, numeri dei morsetti ruotati come nei file del Configurator
  const marker = (text: string, c: string, type: string) => {
    const cover = type === 'Cover', tok = 'MP_01.01';
    const size = cover ? '17' : text.length > 3 ? '8' : '10';
    return entry('Marker', [
      ['.font', 'Arial', tok], ['.fontSize', size, tok], ['.text', text, tok], ['.textColor', '#FF000000', tok],
      ['.textRotation', cover ? '0' : '270', tok], ['.textHorizontalAlignment', 'Center', tok], ['.textVerticalAlignment', 'Center', tok],
      ...base(c, type, text),
    ]);
  };
  const bracketCode = (nr?: string) => wm(nr) || known.endBracket || WMC_DEFAULTS.endBracket;
  for (const [rail, list] of wmcRails(p, strips)) {
    const kids: [number, string][] = [];
    let k = 0;
    // Sulla guida i morsetti e i fermi hanno il token MA_01.01-FL01#n, le piastre ME_01.01#n
    const put = (n: number, tok = 'MA_01.01-FL01') => kids.push([n, `${tok}#${k++}`]);
    for (const s of list) {
      const d = stripData(p, s);
      const groups = physical(stripRows(p, s));
      const ownOf = (g: TerminalRow[]) => g.flatMap(r => r.els).map(e => e.inst.partNr).find(Boolean) ?? g.map(r => d.spareParts?.[r.no]).find(Boolean) ?? d.partNr;
      // Nessun morsetto Weidmüller: la morsettiera resta fuori (niente fermi vuoti sulla guida)
      if (!groups.some(g => wm(ownOf(g)))) {
        problems.push(`-${s}: nessun morsetto con codice Weidmüller (${[...new Set(groups.map(g => ownOf(g) ?? '—'))].join(', ')}), morsettiera non esportata`);
        continue;
      }
      put(entry('Terminal', base(bracketCode(d.endStopPartNr), 'End bracket'), [[marker(s, known.stripMarker || WMC_DEFAULTS.stripMarker, 'Cover'), 'MM_01.02']]));
      // Ponticelli: un pezzo per ponticello, collegato a ogni morsetto
      const bridge = new Map<string, number>();
      for (const j of d.jumpers) {
        const c = wm(j.partNr ?? d.jumperPartNr);
        if (c) bridge.set(j.id, entry('Bridge', base(c, 'Cross-connector')));
        else problems.push(`-${s}: ponticello ${j.terminals[0]}–${j.terminals[j.terminals.length - 1]} senza codice Weidmüller, non esportato`);
      }
      let lastCode = '';
      for (const g of groups) {
        const own = ownOf(g);
        const c = wm(own);
        const nos = g.map(r => r.no).join('/');
        // Weidmüller Configurator cerca il pezzo per codice: senza un codice Weidmüller non lo trova
        if (!c) { problems.push(`-${s}:${nos}: ${own ? `articolo ${own} senza codice Weidmüller` : 'senza articolo'}, non esportato`); continue; }
        const lvMax = own ? parts.get(own)?.terminal?.levels : undefined;
        if (lvMax && g.length > lvMax) problems.push(`-${s}:${nos}: ${g.length} piani su un morsetto a ${lvMax} piani (${own}): esportati i primi ${lvMax}`);
        if (lvMax && g.length > lvMax) g.splice(lvMax);
        lastCode = c;
        const descr = (own && parts.get(own)?.descr1) ?? '';
        const type = PRODUCT_EN.find(([re]) => re.test(descr))?.[1] ?? (g.length > 1 ? 'Double-tier terminal' : 'Feed-through terminal');
        const mc = known.marker?.[c] || known.markerDefault || WMC_DEFAULTS.marker;
        const children: [number, string][] = g.map((r, lv) => [marker(r.no, mc, 'Terminal marker'), `MM_01.0${lv + 1}`]);
        g.forEach((r, lv) => {
          const j = d.jumpers.find(x => x.terminals.includes(r.no));
          const b = j && bridge.get(j.id);
          if (b !== undefined) children.push([b, `EB_01.0${lv + 1}`]);
        });
        // Niente attributi sui token delle targhette e dei ponticelli: il Configurator rifiuta un
        // ChildRef il cui token ha anche un attributo («refer(s) to an attribute»)
        put(entry('Terminal', base(c, type), children));
        if (g.some(r => d.separators.includes(r.no))) {
          const sc = wm(d.separatorPartNr ?? d.endPlatePartNr) || known.endPlate?.[c];
          if (sc) put(entry('Separator', base(sc, 'Partition plate')), 'ME_01.01');
        }
      }
      const ep = wm(d.endPlatePartNr) || (lastCode ? known.endPlate?.[lastCode] : undefined);
      if (ep) put(entry('Separator', base(ep, 'End plate')), 'ME_01.01');
      put(entry('Terminal', base(bracketCode(d.endStopPartNr), 'End bracket')));
    }
    rails.push(entry('Rail', [['.name', rail], ['.manufacturer', WM], ['.code', known.rail || WMC_DEFAULTS.rail], ['.productType', 'Rail']], kids));
  }
  const ids = new Map<number, number>(), order: number[] = [];
  const visit = (n: number) => { if (ids.has(n)) return; ids.set(n, order.length); order.push(n); for (const [c] of nodes[n].children) visit(c); };
  rails.forEach(visit);
  const entries = order.map(n => {
    const { type, attrs, children } = nodes[n];
    return `  <Entry id="${ids.get(n)}" type="${type}">\n${attrs.map(([k, v, t]) => `    <Attribute name="${esc(k)}" value="${esc(v)}"${t ? ` tokenId="${t}"` : ''} />`).join('\n')}${children.map(([c, t]) => `\n    <ChildRef id="${ids.get(c)}" tokenId="${t}" />`).join('')}\n  </Entry>`;
  });
  const head = [
    ['.localProductIndicator', '#'], ['.localLocationIndicator', '++'], ['.localFunctionIndicator', '=='],
    ['.productIndicator', '-'], ['.locationIndicator', '+'], ['.functionIndicator', '='], ['.caeDescription', p.info.name], ['.caeId', ''],
  ].map(([k, v]) => `  <Attribute name="${k}" value="${esc(v)}" />`).join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<CAEdex xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" creationDate="${new Date().toISOString()}" projectName="${esc(p.info.name)}" author="${esc(p.info.author)}" version="1" xsi:noNamespaceSchemaLocation="http://wmc.weidmueller.com/CAEdex.xsd">\n${head}\n${entries.join('\n')}\n</CAEdex>\n`;
  return { xml, problems };
}

