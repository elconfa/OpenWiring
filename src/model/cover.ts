// Copertina del progetto: logo, nome e descrizione, righe dei dati scelte dall'utente (campi del
// progetto, del cartiglio, proprietà di progetto o righe libere), tabella delle revisioni e firme.
import type { CoverRow, CoverStyle, Project } from './types';

export const COVER_DEFAULTS = {
  logo: { w: 80, h: 30, y: 24 }, titleSize: 9, titleY: 74, descSize: 4.5, labelSize: 3, valueSize: 3.6,
  rowsY: 104, rowGap: 8, revisions: 6, signatures: ['Redatto', 'Verificato', 'Approvato'],
};

/** Campi del progetto che possono stare in copertina, con il nome di serie */
export const COVER_INFO: [string, string][] = [
  ['customer', 'Cliente'], ['drawingNr', 'Disegno n.'], ['revision', 'Revisione'], ['date', 'Data'], ['author', 'Autore'],
  ['company', 'Ditta'], ['address', 'Indirizzo'], ['name', 'Nome progetto'], ['description', 'Descrizione'],
];
/** Righe mostrate di serie (le altre disponibili ci sono, ma nascoste) */
const SHOWN = new Set(['customer', 'drawingNr', 'revision', 'date', 'author']);

export const coverStyleOf = (p: Project): CoverStyle => p.settings?.cover ?? {};

export interface CoverLine { key: string; label: string; value: string; hidden: boolean; custom: boolean; free: boolean }

/**
 * Righe della copertina nell'ordine scelto, con nome e valore: prima quelle elencate nello stile,
 * poi le altre disponibili (i campi del cartiglio di serie visibili, come le prime cinque).
 */
export function coverLines(p: Project, s: CoverStyle = coverStyleOf(p)): CoverLine[] {
  const info = p.info as unknown as Record<string, string>;
  const avail = new Map<string, { label: string; value: string; shown: boolean }>();
  for (const [k, l] of COVER_INFO) avail.set(k, { label: l, value: k === 'address' ? p.titleBlock?.address ?? '' : info[k] ?? '', shown: SHOWN.has(k) });
  (p.titleBlock?.fields ?? []).forEach((f, i) => avail.set(`tb:${i}`, { label: f.label, value: f.value, shown: true }));
  for (const d of p.userProps ?? []) {
    if (d.assign === 'project' && !d.obsolete) avail.set(`up:${d.id}`, { label: d.name, value: p.userPropValues?.[d.id] ?? '', shown: false });
  }
  const out: CoverLine[] = [];
  const seen = new Set<string>();
  for (const r of s.rows ?? []) {
    const free = r.key.startsWith('free:'), a = avail.get(r.key);
    if ((!a && !free) || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push({ key: r.key, label: r.label ?? a?.label ?? '', value: free ? r.value ?? '' : a!.value, hidden: !!r.hidden, custom: r.label !== undefined, free });
  }
  for (const [k, a] of avail) if (!seen.has(k)) out.push({ key: k, label: a.label, value: a.value, hidden: !a.shown, custom: false, free: false });
  return out;
}

/** Righe da salvare nello stile dopo una modifica (tutte, nell'ordine attuale) */
export const coverRowsOf = (lines: CoverLine[]): CoverRow[] =>
  lines.map(l => ({ key: l.key, ...(l.custom || l.free ? { label: l.label } : {}), ...(l.free ? { value: l.value } : {}), ...(l.hidden ? { hidden: true } : {}) }));
