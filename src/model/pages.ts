// Numeri di pagina: numeri con lettera per le pagine inserite in mezzo
// (12A tra 12 e 13), ordine delle pagine dal numero, numero della prossima pagina intermedia.
import type { Page, Project } from './types';
import { nextProjectPageNo } from './pageOrder';
import { nextRevisionIndex } from './revisions';

/**
 * Numero e aggiunta di una pagina: "12A" → 12, "A"; "12-B" o "12.B2" (pagine aggiunte in una
 * revisione) → 12, "-B" / ".B2"; undefined se il nome non comincia con un numero
 */
export function parsePageNo(name: string): { n: number; suffix: string } | undefined {
  const m = /^\s*(\d+)\s*(?:([A-Za-z]*)|([-._])\s*([A-Za-z0-9]+))\s*$/.exec(name);
  if (!m) return undefined;
  return { n: parseInt(m[1], 10), suffix: m[3] ? `${m[3]}${m[4].toUpperCase()}` : (m[2] ?? '').toUpperCase() };
}

/** Lettere in ordine: "" < A < B … < Z < AA */
const suffixKey = (s: string) => s.length * 1e6 + [...s].reduce((v, c) => v * 27 + (c.charCodeAt(0) - 64), 0);

/** Aggiunte in ordine: nessuna, poi le lettere (12A, 12B), poi quelle di revisione (12-B, 12-B2) */
function compareSuffix(a: string, b: string): number {
  const sa = /^[-._]/.test(a), sb = /^[-._]/.test(b);
  if (sa !== sb) return sa ? 1 : -1;
  if (!sa) return suffixKey(a) - suffixKey(b);
  return a.slice(1).localeCompare(b.slice(1), undefined, { numeric: true });
}

/** Confronto tra due numeri di pagina (12 < 12A < 12B < 13); 0 se uno dei due non è un numero */
export function comparePageNames(a: string, b: string): number {
  const x = parsePageNo(a), y = parsePageNo(b);
  if (!x || !y) return 0;
  return x.n - y.n || compareSuffix(x.suffix, y.suffix);
}

/**
 * Sposta la pagina nella posizione giusta secondo il suo numero: dopo l'ultima pagina con un numero
 * più basso (le pagine senza numero, es. copertina o indice, restano dove sono)
 */
export function placeByNumber(pages: Page[], id: string): Page[] {
  const pg = pages.find(p => p.id === id);
  if (!pg || !parsePageNo(pg.name)) return pages;
  const rest = pages.filter(p => p.id !== id);
  let at = -1;
  rest.forEach((p, i) => { if (parsePageNo(p.name) && comparePageNames(p.name, pg.name) < 0) at = i; });
  if (at < 0) {
    // Nessuna pagina più bassa: prima della prima pagina numerata più alta
    const first = rest.findIndex(p => parsePageNo(p.name) && comparePageNames(p.name, pg.name) > 0);
    if (first < 0) return pages;
    return [...rest.slice(0, first), pg, ...rest.slice(first)];
  }
  return [...rest.slice(0, at + 1), pg, ...rest.slice(at + 1)];
}

/** Tutte le pagine numerate in ordine di numero; quelle senza numero restano al loro posto */
export function sortByNumber(pages: Page[]): Page[] {
  const slots = pages.map((p, i) => (parsePageNo(p.name) ? i : -1)).filter(i => i >= 0);
  const sorted = slots.map(i => pages[i]).sort((a, b) => comparePageNames(a.name, b.name));
  const out = [...pages];
  slots.forEach((i, k) => { out[i] = sorted[k]; });
  return out;
}

/** Numero della pagina intermedia dopo quella indicata: dopo 12 → 12A (o la prima lettera libera), dopo 12A → 12B */
export function nextIntermediate(project: Project, after: string): string | undefined {
  const p = parsePageNo(after);
  if (!p || /^[-._]/.test(p.suffix)) return undefined;
  const used = new Set(project.pages.map(x => x.name.trim().toUpperCase()));
  let s = p.suffix;
  for (let k = 0; k < 700; k++) {
    s = nextSuffix(s);
    if (!used.has(`${p.n}${s}`)) return `${p.n}${s}`;
  }
  return undefined;
}

function nextSuffix(s: string): string {
  if (!s) return 'A';
  const last = s[s.length - 1];
  return last === 'Z' ? `${nextSuffix(s.slice(0, -1))}A` : `${s.slice(0, -1)}${String.fromCharCode(last.charCodeAt(0) + 1)}`;
}

/**
 * Numero di una pagina aggiunta in revisione dopo la pagina indicata: il numero della pagina
 * seguito dall'indice della revisione ("12-B", poi "12-B2"…); undefined se la pagina non ha numero
 */
export function revisionPageName(project: Project, after: string, index: string, sep = '-'): string | undefined {
  const p = parsePageNo(after);
  if (!p) return undefined;
  const used = new Set(project.pages.map(x => x.name.trim().toUpperCase()));
  for (let k = 1; k < 100; k++) {
    const name = `${p.n}${sep}${index}${k > 1 ? k : ''}`;
    if (!used.has(name.toUpperCase())) return name;
  }
  return undefined;
}

/**
 * Numero proposto per una pagina nuova dopo quella indicata: in mezzo ad altre pagine la pagina
 * intermedia (12A) o, durante una revisione, il numero con l'indice della revisione (12-B);
 * in fondo il numero dopo il più alto (dopo il primo rilascio, il più alto mai usato)
 */
export function proposePageName(p: Project, afterId?: string): string {
  const prev = afterId ? p.pages.find(x => x.id === afterId) : undefined;
  const idx = prev ? p.pages.indexOf(prev) + 1 : p.pages.length;
  const between = prev && parsePageNo(prev.name) && p.pages.slice(idx).some(x => parsePageNo(x.name) && comparePageNames(x.name, prev.name) > 0);
  if (prev && between) {
    const mode = p.settings.revisionPageNo ?? '-';
    if (p.revisionState === 'review' && mode !== 'letter') {
      const r = revisionPageName(p, prev.name, nextRevisionIndex(p), mode);
      if (r) return r;
    }
    const m = nextIntermediate(p, prev.name);
    if (m) return m;
  }
  return nextProjectPageNo(p);
}
