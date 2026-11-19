// Schede tecniche e documenti degli articoli (punto 87 b): documenti scelti dall'utente (file PDF sul
// disco o indirizzi web) e quelli che arrivano con i dati EPLAN (indirizzi negli attributi). Il loro
// elenco è una lista del progetto; i PDF sul disco si possono allegare in fondo al PDF dello schema.
import type { DocKind, Part, PartDoc, Project } from './types';
import { bomReport, type Table } from './reports';
import { partsIndex } from './devices';
import { isDocLink } from '../io/commercialCsv';

export const DOCS_TITLE = 'Elenco documenti allegati';

export const isWebDoc = (path: string) => /^https?:\/\//i.test(path);
export const isPdfDoc = (path: string) => !isWebDoc(path) && /\.pdf$/i.test(path);

/** Percorso assoluto (Mac, Linux, Windows o cartella di rete); gli altri sono relativi alla cartella Documenti */
export const isAbsPath = (path: string) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
/** Documento sul disco con percorso relativo alla cartella Documenti degli articoli */
export const isRelDoc = (path: string) => !!path && !isWebDoc(path) && !isAbsPath(path);

/**
 * Percorso relativo alla cartella (con le barre "/") se il file sta dentro, altrimenti null.
 * Su Windows le lettere maiuscole e minuscole dei percorsi non contano.
 */
export function relToFolder(folder: string, file: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const win = /^[A-Za-z]:|^\\\\/.test(folder);
  const f = norm(folder), p = norm(file);
  const same = win ? p.toLowerCase().startsWith(`${f.toLowerCase()}/`) : p.startsWith(`${f}/`);
  return same ? p.slice(f.length + 1) : null;
}

/** Nome del file di un percorso (con / o \) */
export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * Tipi di documento, nell'ordine delle liste, con la sottocartella di Documenti dove stanno i loro file
 * (la stessa struttura la crea il programma: electron/partdocs.cjs)
 */
export const DOC_KINDS: { kind: DocKind; label: string; folder: string }[] = [
  { kind: 'datasheet', label: 'Scheda tecnica', folder: 'Data Sheet' },
  { kind: 'ce', label: 'Dichiarazione CE', folder: 'Dichiarazioni/CE' },
  { kind: 'ul', label: 'Dichiarazione UL', folder: 'Dichiarazioni/UL' },
  { kind: 'decl', label: 'Altra dichiarazione', folder: 'Dichiarazioni/Altre' },
  { kind: 'manual', label: 'Manuale', folder: 'Manuali' },
  { kind: 'other', label: 'Altro documento', folder: '' },
];
export const docKindInfo = (k: DocKind) => DOC_KINDS.find(d => d.kind === k) ?? DOC_KINDS[DOC_KINDS.length - 1];

/** Tipo dalla sottocartella di Documenti (percorso relativo, o assoluto che passa da quelle cartelle) */
export function kindFromFolder(path: string): DocKind | undefined {
  const p = `/${path.replace(/\\/g, '/').toLowerCase()}`;
  // Prima le cartelle più profonde (Dichiarazioni/CE prima di un'eventuale Dichiarazioni)
  for (const d of [...DOC_KINDS].sort((a, b) => b.folder.length - a.folder.length)) {
    if (!d.folder) continue;
    const f = `/${d.folder.toLowerCase()}/`;
    if (isAbsPath(path) ? p.includes(`/documenti${f}`) : p.startsWith(f)) return d.kind;
  }
  return undefined;
}

/** Tipo dal nome del documento o del file (parole come DoC, CE, UL, RoHS, manuale, datasheet) */
export function kindFromName(text: string): DocKind | undefined {
  const w = ` ${text.toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9àèéìòù]+/g, ' ')} `;
  const has = (re: RegExp) => re.test(w);
  if (has(/ (ul|cul|ulus|culus|csa|ul508a?|ul 508a?|ul listed|ul recognized) /)) return 'ul';
  if (has(/ (ce|ue|eu|doc|dop|konformitätserklärung|konformitatserklarung|konformit\w*|conformit\w*|declaration of conformity|dichiarazione di conformit\w*) /)) return 'ce';
  if (has(/ (rohs|reach|atex|iecex|ukca|ccc|eac|weee|dichiarazione|declaration|erklärung|erklarung|certificat\w*|zertifikat) /)) return 'decl';
  if (has(/ (manual\w*|handbuch|istruzion\w*|instructions?|anleitung|bedienungsanleitung|betriebsanleitung|guida|guide|montageanleitung) /)) return 'manual';
  if (has(/ (datasheet|data sheet|datenblatt|scheda tecnica|scheda|technical data|technische daten) /)) return 'datasheet';
  return undefined;
}

/** Tipo del documento: scelto a mano, altrimenti dalla sottocartella, dal nome, e di serie scheda tecnica */
export const docKind = (doc: PartDoc): DocKind =>
  doc.kind ?? kindFromFolder(doc.path) ?? kindFromName(`${doc.name} ${fileName(doc.path)}`) ?? 'datasheet';

/** Documenti dei dati EPLAN dell'articolo (indirizzo sulla prima riga dell'attributo) */
export function edzDocs(part: Part): PartDoc[] {
  const links = [...new Set(Object.entries(part.attrs ?? {}).filter(([k, v]) => (isDocLink(k) || /^P_ARTICLE_EXTERNAL_DOCUMENT/i.test(k)) && v)
    .map(([, v]) => v.split(/\r?\n/)[0].trim()).filter(Boolean))];
  return links.map(path => ({ name: isWebDoc(path) ? 'Documento del costruttore' : fileName(path), path }));
}

/** Tutti i documenti dell'articolo: prima quelli scelti, poi quelli dei dati EPLAN non già presenti */
export function partDocuments(part: Part): PartDoc[] {
  const own = part.docs ?? [];
  return [...own, ...edzDocs(part).filter(d => !own.some(o => o.path === d.path))];
}

export interface UsedDoc { partNr: string; descr: string; tags: string; doc: PartDoc; kind: DocKind }

const kindRank = (k: DocKind) => DOC_KINDS.findIndex(d => d.kind === k);

/**
 * Documenti degli articoli usati nel progetto: per tipo (schede tecniche, dichiarazioni CE, UL, altre,
 * manuali, altri) e dentro ogni tipo nell'ordine della distinta; kinds limita ai tipi scelti
 */
export function usedDocuments(project: Project, library: Part[] = [], kinds?: DocKind[]): UsedDoc[] {
  const parts = partsIndex(project, library);
  const out: UsedDoc[] = [];
  for (const r of bomReport(project, library).rows) {
    const part = parts.get(r[2]);
    if (!part) continue;
    for (const doc of partDocuments(part)) {
      const kind = docKind(doc);
      if (!kinds || kinds.includes(kind)) out.push({ partNr: part.partNr, descr: part.descr1 ?? r[4] ?? '', tags: r[7] ?? '', doc, kind });
    }
  }
  return out.map((u, i) => [u, i] as const).sort((a, b) => kindRank(a[0].kind) - kindRank(b[0].kind) || a[1] - b[1]).map(([u]) => u);
}

/** Lista «Elenco documenti allegati»: tipo, articolo, descrizione, documento, file o indirizzo, sigle */
export function documentsReport(project: Project, library: Part[] = []): Table {
  const rows = usedDocuments(project, library).map(u => [docKindInfo(u.kind).label, u.partNr, u.descr, u.doc.name, isWebDoc(u.doc.path) ? u.doc.path : fileName(u.doc.path), u.tags]);
  return { title: DOCS_TITLE, columns: ['Tipo', 'Articolo', 'Descrizione', 'Documento', 'File o indirizzo', 'Sigle'], rows };
}
