// Stampa e PDF di alcuni quadri: le liste (morsetti, dispositivi, connessioni…) tengono solo le
// righe dei quadri scelti e si impaginano di nuovo. Il quadro di una riga viene dal luogo scritto
// (+Q1.1), dal dispositivo o dalla morsettiera citati nella riga.
import type { Panel, Part, Project } from './types';
import { devicePanels, orderedPanels } from './network';
import { bomReport, purchaseReport, manufacturerReport, PURCHASE_TITLE, MAKERS_TITLE, SEQUENCE_TITLE, type Table } from './reports';
import { allStrips } from './terminals';

/** Quadro dal nome della morsettiera: il codice del quadro è all'inizio del nome (X1.2.21 → Q1.2) */
export function panelOfStripName(project: Project, strip: string): Panel | undefined {
  const digits = (t: string) => t.replace(/^[^\d]+/, '');
  const name = digits(strip);
  if (!name) return undefined;
  return (project.panels ?? []).filter(x => digits(x.code) && (name === digits(x.code) || name.startsWith(`${digits(x.code)}.`)))
    .sort((a, b) => digits(b.code).length - digits(a.code).length)[0];
}

/**
 * Luoghi per scegliere cosa stampare o elencare: quelli del progetto (nell'ordine dell'albero) e
 * quelli scritti sui dispositivi (+BM, +P1) ma non definiti, con id «+codice»
 */
export function scopeLocations(project: Project): Panel[] {
  const defined = project.panels ?? [];
  const codes = new Set(defined.map(p => p.code));
  const extra: Panel[] = [];
  for (const pg of project.pages) for (const e of pg.elements) {
    const loc = e.kind === 'symbol' ? e.loc?.trim() : undefined;
    if (loc && !codes.has(loc)) { codes.add(loc); extra.push({ id: `+${loc}`, code: loc, name: '' }); }
  }
  return [...orderedPanels(defined), ...extra.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))];
}

/** Il progetto con anche i luoghi scritti sui dispositivi ma non definiti (per attribuire le righe) */
function withLocations(project: Project): Project {
  const all = scopeLocations(project);
  return all.length === (project.panels?.length ?? 0) ? project : { ...project, panels: all };
}

/** Quanti dispositivi ha ogni luogo (id) */
export function devicesPerLocation(project: Project): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of devicePanels(withLocations(project)).values()) m.set(p.id, (m.get(p.id) ?? 0) + 1);
  return m;
}

/**
 * Quadro (id, "" = nessuno) di un riferimento scritto in una lista: «+Q1.1-K1», «-K1:13»,
 * «-X1.2.21:3», «X1.2.21», «+Q1.2 Quadro slave»
 */
export function panelResolver(source: Project): (ref: string) => string {
  const project = withLocations(source);
  // Codici più lunghi prima: «+Q1.10» non è «+Q1.1»
  const codes = [...(project.panels ?? [])].sort((a, b) => b.code.length - a.code.length);
  const devs = devicePanels(project);
  const strips = new Set(allStrips(project));
  const cache = new Map<string, string>();
  const find = (ref: string): string => {
    const s = ref.trim();
    if (!s) return '';
    const loc = codes.find(p => p.code && new RegExp(`\\+${p.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`).test(s));
    if (loc) return loc.id;
    let tag = s.replace(/^[=+][^-]*/, '').replace(/^-/, '').split(/\s/)[0];
    for (;;) {
      // Morsettiera: prima il codice del quadro nel suo nome, poi dove è disegnata
      if (strips.has(tag)) { const p = panelOfStripName(project, tag) ?? devs.get(tag); if (p) return p.id; }
      const dev = devs.get(tag);
      if (dev) return dev.id;
      const i = tag.lastIndexOf(':');
      if (i < 0) return '';
      tag = tag.slice(0, i);
    }
  };
  return ref => {
    let r = cache.get(ref);
    if (r === undefined) { r = find(ref); cache.set(ref, r); }
    return r;
  };
}

/** Colonne con i riferimenti che danno il quadro della riga, per ogni lista (le altre restano intere) */
const REF_COLUMNS: Record<string, string[]> = {
  'Lista morsetti': ['Morsettiera'],
  [SEQUENCE_TITLE]: ['Morsettiera'],
  'Lista dispositivi': ['Sigla'],
  'Lista connessioni': ['Da', 'A'],
  'Lista fili (cablaggio)': ['Da', 'A'],
  'Lista cavi': ['Cavo', 'Da', 'A'],
  'Collegamenti cavi': ['Da', 'A'],
  'Collegamenti bus fili': ['Da', 'A'],
  'Lista I/O PLC': ['Scheda'],
  'Lista connettori': ['Connettore'],
  'Collegamenti di rete': ['Quadro', 'Quadro'],
  'Nodi di rete': ['Quadro'],
  'Piano indirizzi IP': ['Luogo'],
  'Indirizzi di rete': ['Luogo'],
};

/** Liste che si riducono ai quadri scelti */
export const scopedLists = () => [...Object.keys(REF_COLUMNS), 'Distinta materiali', PURCHASE_TITLE, MAKERS_TITLE];

/**
 * Liste ridotte ai quadri scelti (keep: id dei quadri, "" = righe senza quadro). Una riga resta se
 * uno dei suoi riferimenti è di un quadro scelto (un collegamento tra due quadri resta in tutti e
 * due); la distinta materiali si ricalcola, con le quantità dei soli quadri scelti.
 */
export function scopeTables(project: Project, library: Part[], tables: Table[], keep: Set<string>): Table[] {
  const panelOf = panelResolver(project);
  const kept = (ref: string) => keep.has(panelOf(ref));
  return tables.map(t => {
    if (t.title === 'Distinta materiali') return bomReport(project, library, kept);
    if (t.title === PURCHASE_TITLE) return purchaseReport(project, library, kept);
    if (t.title === MAKERS_TITLE) return manufacturerReport(project, library, kept);
    const cols = REF_COLUMNS[t.title];
    if (!cols) return t;
    const idx = [...new Set(cols.flatMap(c => t.columns.flatMap((x, i) => (x === c ? [i] : []))))];
    const ok = t.rows.map(r => {
      const found = idx.map(i => panelOf(r[i] ?? '')).filter(Boolean);
      return found.length ? found.some(p => keep.has(p)) : keep.has('');
    });
    const pick = <T,>(a?: T[]) => a?.filter((_, i) => ok[i]);
    return { ...t, rows: t.rows.filter((_, i) => ok[i]), goto: pick(t.goto), symbols: pick(t.symbols), wires: pick(t.wires) };
  });
}

/** Blocco delle pagine di lista: la lista intera (panel assente) o le righe di un luogo */
export interface ReportBlock { title: string; panel?: string; table: Table }

/** Chiave di un blocco: titolo e luogo ('*' = tutto il progetto) */
export const blockKey = (title: string, panel?: string) => `${title}\u0000${panel ?? '*'}`;

/** Nome del luogo di un blocco nei titoli delle pagine: «+Q1.1», «senza quadro» */
export function blockLabel(project: Project, panel: string): string {
  const p = scopeLocations(project).find(x => x.id === panel);
  return p ? `+${p.code}` : 'senza quadro';
}

/**
 * Blocchi delle pagine di lista: le liste scelte in settings.reportBlocks (tra quelle che si
 * dividono) diventano un blocco per luogo, nell'ordine dei luoghi, con le righe senza quadro in
 * fondo; le altre restano intere
 */
export function reportBlocks(project: Project, library: Part[], tables: Table[]): ReportBlock[] {
  const split = new Set((project.settings.reportBlocks ?? []).filter(t => scopedLists().includes(t)));
  const out: ReportBlock[] = tables.filter(t => !split.has(t.title)).map(t => ({ title: t.title, table: t }));
  const toSplit = tables.filter(t => split.has(t.title));
  if (!toSplit.length) return out;
  for (const panel of [...scopeLocations(project).map(p => p.id), '']) {
    for (const t of scopeTables(project, library, toSplit, new Set([panel]))) out.push({ title: t.title, panel, table: t });
  }
  return out;
}

/** Quadri da tenere stampando senza quelli tolti (skip: id dei quadri, "" = senza quadro); undefined = tutti */
export function keptPanels(project: Project, skip?: string[]): Set<string> | undefined {
  const all = scopeLocations(project);
  if (!skip?.length || !all.length) return undefined;
  return new Set(['', ...all.map(p => p.id)].filter(id => !skip.includes(id)));
}
