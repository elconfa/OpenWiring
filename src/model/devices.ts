// Dispositivi, sigle DT, designazioni dei contatti e riferimenti incrociati.
import type { Project, SymbolInstance, SymbolDef, Page, Part, ExtraPart } from './types';
import type { ShowMap, SymVisKey } from './visibility';
import { columnOf, rowOf, XREF_ROWS, AUX_OWN_FIELDS } from './types';
import { getSymbol } from './geometry';

export interface PlacedElement {
  inst: SymbolInstance;
  sym: SymbolDef;
  page: Page;
  pageIndex: number;
}

export interface Device {
  /** Sigla completa senza trattino, es. "K1" (per i morsetti la morsettiera, es. "X1") */
  tag: string;
  elements: PlacedElement[];
  main?: PlacedElement;
  partNr?: string;
  description?: string;
}

/** Posizione nel formato EPLAN "pagina.colonna" */
export function locationOf(el: { inst: SymbolInstance; page: Page }): string {
  return `${el.page.name}.${columnOf(el.inst.x)}${XREF_ROWS ? rowOf(el.inst.y) : ''}`;
}

export function allPlaced(project: Project): PlacedElement[] {
  const out: PlacedElement[] = [];
  project.pages.forEach((page, pageIndex) => {
    for (const e of page.elements) {
      // Le rappresentazioni (riferimenti a coppie) non sono elementi del dispositivo: solo disegno
      if (e.kind !== 'symbol' || e.pairOf) continue;
      const sym = getSymbol(e.symbolId, project);
      if (sym) out.push({ inst: e, sym, page, pageIndex });
    }
  });
  return out;
}

/** Morsettiera di un morsetto: "X1:3" → "X1" */
export const stripOf = (tag: string) => tag.split(':')[0];

export function deviceKey(el: PlacedElement): string | null {
  if (el.sym.role === 'potential' || el.sym.role === 'link') return null;
  const t = el.inst.tag.trim();
  if (!t) return null;
  return el.sym.role === 'terminal' || el.sym.role === 'pin' ? stripOf(t) : t;
}

export function buildDevices(project: Project): Map<string, Device> {
  const map = new Map<string, Device>();
  const sorted = allPlaced(project).sort(byPosition);
  for (const el of sorted) {
    const key = deviceKey(el);
    if (!key) continue;
    let d = map.get(key);
    if (!d) { d = { tag: key, elements: [] }; map.set(key, d); }
    d.elements.push(el);
    if (el.sym.role === 'main' && !d.main) d.main = el;
    if (el.inst.partNr && !d.partNr) d.partNr = el.inst.partNr;
    if (el.inst.description && !d.description) d.description = el.inst.description;
  }
  return map;
}

export function byPosition(a: PlacedElement, b: PlacedElement): number {
  return a.pageIndex - b.pageIndex || a.inst.x - b.inst.x || a.inst.y - b.inst.y;
}

/**
 * Designazioni effettive dei punti di connessione per ogni istanza.
 * I contatti ausiliari con numerazione automatica seguono la regola EN 50005:
 * cifra d'ordine + cifra di funzione (NA x3/x4, NC x1/x2, scambio x1/x2/x4).
 */
export function effectivePinLabels(project: Project): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  const devices = buildDevices(project);
  const ordinal = new Map<string, number>();
  for (const d of devices.values()) {
    let n = 0;
    for (const el of d.elements) {
      if (el.sym.role === 'aux' && el.sym.contact && el.sym.contact !== 'power') ordinal.set(el.inst.id, ++n);
    }
  }
  for (const el of allPlaced(project)) {
    const labels: Record<string, string> = {};
    for (const p of el.sym.pins) labels[p.id] = p.label;
    const ord = ordinal.get(el.inst.id);
    if (el.inst.autoPins && ord !== undefined) {
      const [a, b, c] = el.sym.pins;
      // EN 50005: 3-4 NA, 1-2 NC; i contatti temporizzati 7-8 NA e 5-6 NC
      if (el.sym.contact === 'NO') { labels[a.id] = `${ord}${el.sym.timed ? 7 : 3}`; labels[b.id] = `${ord}${el.sym.timed ? 8 : 4}`; }
      else if (el.sym.contact === 'NC') { labels[a.id] = `${ord}${el.sym.timed ? 5 : 1}`; labels[b.id] = `${ord}${el.sym.timed ? 6 : 2}`; }
      else if (el.sym.contact === 'CO') { labels[a.id] = `${ord}1`; labels[b.id] = `${ord}2`; labels[c.id] = `${ord}4`; }
    }
    if (el.sym.role === 'terminal' || el.sym.role === 'pin') {
      const num = el.inst.tag.includes(':') ? el.inst.tag.split(':')[1] : '';
      for (const p of el.sym.pins) labels[p.id] = num;
    }
    // Punto I/O PLC: il morsetto porta il nome del canale (DI3, DO0…); con due morsetti per canale
    // (uscite P/M fail-safe, ingresso con alimentazione del sensore) si aggiunge il loro nome: DO0.P, DO0.M
    if (el.sym.role === 'plc' && el.sym.io) {
      const ch = el.inst.plcChannel ?? '';
      for (const p of el.sym.pins) labels[p.id] = ch && p.label && el.sym.pins.length > 1 ? `${ch}.${p.label}` : ch;
    }
    if (!el.inst.autoPins || ord === undefined) {
      for (const [k, v] of Object.entries(el.inst.pinLabels)) if (v !== '') labels[k] = v;
    }
    out.set(el.inst.id, labels);
  }
  return out;
}

export interface CrossRefInfo {
  /** Per gli elementi secondari: dove si trova l'elemento principale */
  mainLocation?: string;
  mainId?: string;
  /** Per l'elemento principale: immagine dei contatti */
  contacts?: { kind: string; labels: string; location: string; id: string }[];
}

/** Pagina indicata da una posizione "pagina.colonna" (il nome pagina può contenere punti) */
export const pageOfLocation = (loc: string) => loc.slice(0, loc.lastIndexOf('.'));

export function crossReferences(project: Project): Map<string, CrossRefInfo> {
  const out = new Map<string, CrossRefInfo>();
  const labels = effectivePinLabels(project);
  for (const d of buildDevices(project).values()) {
    if (!d.main) continue;
    const mainLoc = locationOf(d.main);
    const contacts = d.elements.filter(e => e !== d.main && e.sym.role === 'aux').map(e => {
      const l = labels.get(e.inst.id) ?? {};
      return {
        kind: e.sym.contact ?? '',
        labels: e.sym.pins.map(p => l[p.id]).join('-'),
        location: locationOf(e),
        id: e.inst.id,
      };
    });
    out.set(d.main.inst.id, { contacts });
    for (const e of d.elements) if (e !== d.main && e.sym.role === 'aux') out.set(e.inst.id, { mainLocation: mainLoc, mainId: d.main.inst.id });
  }
  return out;
}

/** Articoli aggiuntivi in una riga di testo, es. "3KD9-1 ×2; 8UC7" (elenco dispositivi, Excel) */
export function extraPartsText(list: ExtraPart[] | undefined): string {
  return (list ?? []).map(x => (x.qty && x.qty !== 1 ? `${x.partNr} ×${x.qty}` : x.partNr)).join('; ');
}

/** Il contrario di extraPartsText; la quantità si scrive anche "x2" o "*2" dopo uno spazio */
export function parseExtraParts(text: string): ExtraPart[] {
  return text.split(/[;\n]/).map(t => t.trim()).filter(Boolean).map(t => {
    const m = /^(.*?)\s*(?:×|\s[x*])\s*(\d+(?:[.,]\d+)?)$/i.exec(t);
    const qty = m ? parseFloat(m[2].replace(',', '.')) : 1;
    return { partNr: (m ? m[1] : t).trim(), ...(qty > 0 && qty !== 1 ? { qty } : {}) };
  }).filter(x => x.partNr);
}

/** Designazione completa con funzione e luogo, es. "=A1+Q1-2K1" (solo la sigla se mancano) */
export function designation(tag: string, func?: string, loc?: string): string {
  return `${func ? `=${func}` : ''}${loc ? `+${loc}` : ''}-${tag}`;
}

export interface DeviceInfo {
  description?: string;
  techData?: string;
  manufacturer?: string;
  typeNr?: string;
  orderNr?: string;
  note?: string;
  func?: string;
  loc?: string;
  partNr?: string;
  part?: Part;
  /** Testi sullo schema: impostazione del dispositivo (undefined = come progetto) */
  showTexts?: boolean;
  /** Proprietà mostrate o nascoste sullo schema */
  show?: ShowMap<SymVisKey>;
  /** Articoli aggiuntivi del dispositivo */
  extraParts?: ExtraPart[];
  /** Proprietà definite dall'utente */
  userProps?: Record<string, string>;
}

/**
 * Dati effettivi del dispositivo: il valore scritto sul dispositivo (cercato prima
 * nell'elemento principale, poi negli altri) prevale su quello dell'articolo assegnato.
 */
export function deviceInfo(elements: { inst: SymbolInstance; sym?: SymbolDef }[], main: { inst: SymbolInstance } | undefined, parts: Map<string, Part>): DeviceInfo {
  const ordered = main ? [main, ...elements.filter(e => e !== main)] : elements;
  // Con l'elemento principale la descrizione di un contatto ausiliario è solo del contatto
  const auxOwn = (e: { inst: SymbolInstance; sym?: SymbolDef }, k: keyof SymbolInstance) =>
    !!main && e.inst !== main.inst && e.sym?.role === 'aux' && (AUX_OWN_FIELDS as readonly string[]).includes(k);
  const own = <K extends keyof SymbolInstance>(k: K) => ordered.filter(e => !auxOwn(e, k)).map(e => e.inst[k]).find(v => v !== undefined && v !== '');
  const partNr = own('partNr') as string | undefined;
  const part = partNr ? parts.get(partNr) : undefined;
  return {
    description: (own('description') as string | undefined) ?? part?.descr1,
    techData: (own('techData') as string | undefined) ?? part?.descr2,
    manufacturer: (own('manufacturer') as string | undefined) ?? part?.manufacturer,
    typeNr: (own('typeNr') as string | undefined) ?? part?.typeNr,
    orderNr: (own('orderNr') as string | undefined) ?? part?.orderNr,
    note: own('note') as string | undefined,
    func: own('func') as string | undefined,
    loc: own('loc') as string | undefined,
    showTexts: own('showTexts') as boolean | undefined,
    show: own('show') as ShowMap<SymVisKey> | undefined,
    extraParts: own('extraParts') as ExtraPart[] | undefined,
    userProps: own('userProps') as Record<string, string> | undefined,
    partNr, part,
  };
}

/** Indice degli articoli: libreria personale e articoli copiati nel progetto */
export function partsIndex(project: Project, library: Part[] = []): Map<string, Part> {
  const m = new Map<string, Part>();
  for (const p of library) m.set(p.partNr, p);
  for (const p of project.parts) m.set(p.partNr, p);
  return m;
}

const MERGEABLE = new Set<SymbolDef['role']>(['main', 'aux', 'single']);

/**
 * Elementi di un altro dispositivo che hanno già la sigla data: dando quella sigla all'elemento
 * (bobina, contatto, apparecchio) i due diventano un dispositivo solo, con i rimandi tra loro.
 * Vuoto se la sigla è libera, se è già la sua o per morsetti, potenziali, rimandi e punti PLC.
 */
export function mergeTargets(project: Project, instId: string, tag: string): PlacedElement[] {
  const t = tag.trim().replace(/^-/, '');
  const all = allPlaced(project);
  const el = all.find(e => e.inst.id === instId);
  if (!t || !el || !MERGEABLE.has(el.sym.role) || el.inst.tag.trim() === t) return [];
  return all.filter(e => e.inst.id !== instId && MERGEABLE.has(e.sym.role) && e.inst.tag.trim() === t);
}

/** Id degli elementi che appartengono allo stesso dispositivo dell'elemento dato */
export function sameDeviceIds(project: Project, instId: string): string[] {
  const all = allPlaced(project);
  const el = all.find(e => e.inst.id === instId);
  if (!el) return [];
  const key = deviceKey(el);
  if (!key || el.sym.role === 'terminal') return [instId];
  return all.filter(e => e.sym.role !== 'terminal' && deviceKey(e) === key).map(e => e.inst.id);
}

/**
 * Piani dello stesso morsetto fisico: per "X1:1A" anche "X1:1B", "X1:1C"… (e "X1:1" se c'è).
 * I dati d'ordine (articolo, costruttore, codice…) valgono per tutti i piani insieme.
 * Per gli altri simboli, o per un morsetto con nome non numerico, solo l'elemento dato.
 */
export function terminalLevelIds(project: Project, instId: string): string[] {
  const all = allPlaced(project);
  const el = all.find(e => e.inst.id === instId);
  if (!el || el.sym.role !== 'terminal' || !el.inst.tag.includes(':')) return [instId];
  const physical = (tag: string) => /^(.*:\d+)[A-Za-z]?$/.exec(tag.trim())?.[1];
  const key = physical(el.inst.tag);
  if (!key) return [instId];
  return all.filter(e => e.sym.role === 'terminal' && physical(e.inst.tag) === key).map(e => e.inst.id);
}

/**
 * Progetti salvati prima della 1.1.1: la descrizione del dispositivo poteva stare su un contatto
 * ausiliario. Se la bobina (e gli altri elementi non ausiliari) non ne hanno una, quella del primo
 * contatto che la ha passa alla bobina; da allora le descrizioni dei contatti sono solo loro.
 */
export function migrateAuxDescriptions(p: Project): void {
  if (p.auxOwnDescription) return;
  p.auxOwnDescription = true;
  for (const d of buildDevices(p).values()) {
    if (!d.main) continue;
    const aux = d.elements.filter(e => e.sym.role === 'aux' && e.inst !== d.main!.inst);
    if (d.elements.some(e => !aux.includes(e) && e.inst.description)) continue;
    const from = aux.find(e => e.inst.description);
    if (!from) continue;
    d.main.inst.description = from.inst.description;
    delete from.inst.description;
  }
}
