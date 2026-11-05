// Opzioni dell'export PDF e selezione delle pagine (senza dipendenze pesanti).
import type { Project, Page, Lang } from '../model/types';
import { pageGroup, SCHEMA_GROUP } from '../model/pageOrder';
import { panelOfStripName } from '../model/panelScope';

export interface PdfOptions {
  /** "all", "current" oppure un elenco/intervallo di pagine, es. "1-3, 5" o "200-205" */
  pages: string;
  currentPageId?: string;
  /** Pagina indice iniziale con i collegamenti a tutte le pagine */
  index: boolean;
  /** Liste aggiunte in coda come tabelle (titoli), per le liste che non sono pagine del progetto */
  tailLists?: string[];
  /** Bianco e nero per la stampa: fili e numeri filo in nero */
  mono: boolean;
  /** Schede tecniche (PDF sul disco) degli articoli usati, allegate in fondo con la loro pagina di elenco */
  attachDocs?: boolean;
  /** Lingua del PDF (se manca vale quella del progetto) e seconda lingua opzionale */
  lang?: Lang;
  second?: Lang | '';
  /** Quadri da non stampare (id del luogo; "" = le pagine senza quadro) */
  skipPanels?: string[];
  /**
   * Gruppi di pagine da non stampare ('index', 'strip', 'report:Distinta materiali'…, vedi pageOrder;
   * SCHEMA_GROUP = le pagine di schema, COVER_GROUP = la copertina). Valgono solo stampando tutte le pagine:
   * una pagina o un intervallo scelti si stampano sempre
   */
  skipGroups?: string[];
  /**
   * File più piccolo: flussi compressi, coordinate con meno decimali e oggetti raccolti in flussi compressi.
   * Senza perdite visibili; rimandi, indice e segnalibri restano cliccabili. Di serie sì (false = come prima della 2.0.4)
   */
  compact?: boolean;
  /** Aggiorna tutte le liste prima di stampare o esportare (di serie sì) */
  updateLists?: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = { pages: 'all', index: true, mono: false };

/** Gruppo della copertina nella scelta delle pagine da stampare */
export const COVER_GROUP = '@cover';

/** Gruppo di una pagina nella scelta delle pagine da stampare: lista, copertina o pagine di schema */
export const printGroup = (pg: Page) => pageGroup(pg) ?? (pg.type === 'cover' ? COVER_GROUP : SCHEMA_GROUP);

/**
 * Pagine scelte. Gli intervalli usano i numeri di pagina del progetto ("200-205"); se i
 * nomi non esistono vale la posizione nel progetto (1 = prima pagina).
 */
export function selectPages(project: Project, spec: string, currentPageId?: string): Page[] {
  if (spec === 'all' || !spec.trim()) return project.pages;
  if (spec === 'current') return project.pages.filter(p => p.id === currentPageId);
  const chosen = new Set<Page>();
  const byName = (name: string) => project.pages.find(p => p.name === name);
  for (const tok of spec.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(.+?)-(.+)$/.exec(tok);
    if (!m) { const p = byName(tok) ?? project.pages[parseInt(tok, 10) - 1]; if (p) chosen.add(p); continue; }
    const [a, b] = [m[1], m[2]];
    const ia = project.pages.indexOf(byName(a)!), ib = project.pages.indexOf(byName(b)!);
    if (ia >= 0 && ib >= 0) project.pages.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).forEach(p => chosen.add(p));
    else {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) project.pages.slice(Math.min(na, nb) - 1, Math.max(na, nb)).forEach(p => chosen.add(p));
    }
  }
  return project.pages.filter(p => chosen.has(p));
}

/**
 * Quadro di una pagina: il luogo della pagina; per lo schema di una morsettiera quello il cui
 * codice è all'inizio del nome della morsettiera (X1.2.21 → Q1.2); "" = nessun quadro
 */
export function pagePanel(project: Project, pg: Page): string {
  const panels = project.panels ?? [];
  if (pg.panelId && panels.some(x => x.id === pg.panelId)) return pg.panelId;
  if (pg.type === 'strip' && pg.strip) {
    const best = panelOfStripName(project, pg.strip);
    if (best) return best.id;
  }
  return '';
}

/** Pagine da stampare o esportare: quelle scelte (tutte, corrente, intervallo); stampando tutte, senza i quadri e i gruppi tolti */
export function pagesFor(project: Project, o: Pick<PdfOptions, 'pages' | 'currentPageId' | 'skipPanels' | 'skipGroups'>): Page[] {
  const chosen = selectPages(project, o.pages, o.currentPageId);
  if (o.pages !== 'all') return chosen;
  const panels = new Set(o.skipPanels ?? []), groups = new Set(o.skipGroups ?? []);
  return chosen.filter(pg => {
    const g = pageGroup(pg);
    if (groups.has(printGroup(pg))) return false;
    // Lista divisa per quadro: la pagina segue il suo luogo, anche «+BM» non definito o senza quadro
    if (pg.type === 'report' && pg.reportPanel !== undefined) return !panels.has(pg.reportPanel);
    // Le pagine generate senza quadro (indice, liste) si scelgono solo per gruppo
    const panel = pagePanel(project, pg);
    return !(panels.has(panel) && (panel || !g));
  });
}
