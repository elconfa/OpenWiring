// Revisioni: congelamento del progetto, pagine modificate, nuvolette sulle modifiche
// successive e confronto con un altro file di progetto.
import { textBounds } from './textFlow';
import type { Project, Revision, RevisionFormat, Element, Page, Part } from './types';
import { getSymbol, instanceBounds, uid } from './geometry';
import { buildDevices, deviceInfo, partsIndex } from './devices';

/** Firma numerica di un elemento (FNV-1a sul JSON) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export type Box = [number, number, number, number];

export function elementBox(e: Element, project: Project): Box {
  const r = (v: number) => Math.round(v * 10) / 10;
  if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') {
    const xs = e.points.map(p => p.x), ys = e.points.map(p => p.y);
    return [r(Math.min(...xs)), r(Math.min(...ys)), r(Math.max(...xs)), r(Math.max(...ys))];
  }
  if (e.kind === 'text') { const b = textBounds(e); return [b.x0, b.y0, r(b.x1), r(b.y1)]; }
  if (e.kind === 'zone' || e.kind === 'image') return [e.x, e.y, e.x + e.w, e.y + e.h];
  const sym = getSymbol(e.symbolId, project);
  if (!sym) return [e.x - 2, e.y - 2, e.x + 2, e.y + 2];
  const b = instanceBounds(e, sym);
  return [r(b.x0), r(b.y0), r(b.x1), r(b.y1)];
}

export function snapshotOf(project: Project): Revision['snapshot'] {
  const out: Revision['snapshot'] = {};
  for (const pg of project.pages) {
    const m: Record<string, [number, number, number, number, number]> = {};
    // Il titolo della pagina conta come modifica della pagina
    m['@page'] = [hash(`${pg.name}|${pg.title}|${pg.type}`), 0, 0, 0, 0];
    for (const e of pg.elements) m[e.id] = [hash(JSON.stringify(e)), ...elementBox(e, project)];
    out[pg.id] = m;
  }
  return out;
}

export interface PageChanges {
  page: Page; added: Box[]; changed: Box[]; removed: Box[]; newPage: boolean;
  /** Le stesse modifiche con l'elemento: per le note e per raggruppare le nuvolette */
  items: { id: string; kind: 'added' | 'changed' | 'removed'; box: Box }[];
}

/** Modifiche di ogni pagina rispetto a un'impronta (di solito l'ultima revisione) */
export function changesSince(project: Project, snap: Revision['snapshot'] | undefined): PageChanges[] {
  if (!snap) return [];
  const out: PageChanges[] = [];
  for (const pg of project.pages) {
    const old = snap[pg.id];
    const c: PageChanges = { page: pg, added: [], changed: [], removed: [], newPage: !old, items: [] };
    if (old) {
      const now = new Set<string>();
      for (const e of pg.elements) {
        now.add(e.id);
        const o = old[e.id];
        if (!o) { const b = elementBox(e, project); c.added.push(b); c.items.push({ id: e.id, kind: 'added', box: b }); }
        else if (o[0] !== hash(JSON.stringify(e))) { const b = elementBox(e, project); c.changed.push(b); c.items.push({ id: e.id, kind: 'changed', box: b }); }
      }
      for (const [id, o] of Object.entries(old)) {
        if (id === '@page' || now.has(id)) continue;
        c.removed.push([o[1], o[2], o[3], o[4]]);
        c.items.push({ id, kind: 'removed', box: [o[1], o[2], o[3], o[4]] });
      }
      if (old['@page'] && old['@page'][0] !== hash(`${pg.name}|${pg.title}|${pg.type}`)) c.changed.push([0, 0, 0, 0]);
    }
    if (c.newPage || c.added.length || c.changed.length || c.removed.length) out.push(c);
  }
  return out;
}

export const lastRevision = (p: Project): Revision | undefined => p.revisions?.[p.revisions.length - 1];

export const REVISION_FORMATS: RevisionFormat[] = ['A', '0', '00', 'R00'];

/** Indice k-esimo (da 0) nel formato scelto: A, B … Z, AA / 0, 1 / 00, 01 / R00, R01 */
export function formatRevisionIndex(fmt: RevisionFormat | undefined, k: number): string {
  if (fmt === '0') return String(k);
  if (fmt === '00') return String(k).padStart(2, '0');
  if (fmt === 'R00') return `R${String(k).padStart(2, '0')}`;
  let s = '';
  for (let n = k + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Indice proposto per la revisione successiva, nel formato delle impostazioni del progetto */
export function nextRevisionIndex(p: Project): string {
  const used = new Set((p.revisions ?? []).map(r => r.index.toUpperCase()));
  let k = p.revisions?.length ?? 0;
  while (used.has(formatRevisionIndex(p.settings.revisionFormat, k).toUpperCase())) k++;
  return formatRevisionIndex(p.settings.revisionFormat, k);
}

/** Progetto in sola lettura: l'ultima revisione è rilasciata e non è stata aperta una revisione nuova */
export const isReleased = (p: Project) => p.revisionState === 'released';

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(t));
  return new Uint8Array(await out.arrayBuffer());
}

/** Copia compressa del progetto da archiviare in una revisione (le revisioni dentro restano senza copia) */
export async function packProject(p: Project): Promise<string> {
  const copy: Project = { ...p, revisions: p.revisions?.map(({ archive: _a, ...r }) => r) };
  return toBase64(await pipe(new TextEncoder().encode(JSON.stringify(copy)), new CompressionStream('gzip')));
}

export async function unpackProject(archive: string): Promise<Project> {
  return JSON.parse(new TextDecoder().decode(await pipe(fromBase64(archive), new DecompressionStream('gzip')))) as Project;
}

/** Peso dell'archivio in kB (per l'elenco delle revisioni) */
export const archiveKb = (r: Revision) => (r.archive ? Math.round((r.archive.length * 3) / 4 / 1024) : 0);

/** Dati del rilascio: indice, data, autore, descrizione e le segnalazioni accettate al controllo */
export interface ReleaseData { index: string; date: string; author: string; description: string; accepted?: Revision['accepted'] }

/**
 * Rilascio: congela la revisione (pagine cambiate, impronta), mette il progetto in sola lettura e
 * archivia nella revisione la copia completa del progetto così com'è stato emesso
 */
export async function releaseRevision(project: Project, r: ReleaseData): Promise<Project> {
  const p = structuredClone(project);
  const { accepted, ...data } = r;
  const rev = freezeRevision(p, data);
  if (accepted?.length) rev.accepted = accepted;
  // Le note delle modifiche passano nella revisione rilasciata
  if (p.revisionNotes && Object.keys(p.revisionNotes).length) rev.notes = p.revisionNotes;
  delete p.revisionNotes;
  p.revisionState = 'released';
  rev.archive = await packProject(p);
  return p;
}

/** Nuova revisione dopo l'ultima rilasciata: il progetto torna modificabile */
export function openRevision(p: Project): void {
  if (isReleased(p)) p.revisionState = 'review';
}

/**
 * Annulla la revisione aperta: il progetto torna esattamente com'era all'ultimo rilascio (con le
 * revisioni archiviate di adesso); undefined se l'ultima revisione non ha la copia
 */
export async function cancelRevision(p: Project): Promise<Project | undefined> {
  const last = lastRevision(p);
  if (!last?.archive) return undefined;
  const back = await unpackProject(last.archive);
  back.revisions = p.revisions;
  back.revisionState = 'released';
  return back;
}

/** Congela una revisione: registra le pagine cambiate dalla precedente e aggiorna l'indice del progetto */
export function freezeRevision(p: Project, r: { index: string; date: string; author: string; description: string }): Revision {
  const prev = lastRevision(p);
  const pages = prev ? changesSince(p, prev.snapshot).map(c => c.page.name) : p.pages.map(pg => pg.name);
  const rev: Revision = { id: uid('r'), ...r, pages, snapshot: snapshotOf(p) };
  (p.revisions ??= []).push(rev);
  p.info.revision = r.index;
  return rev;
}

/** Indice di revisione di una pagina: l'ultima revisione che l'ha modificata */
export function pageRevision(p: Project, page: Page): string | undefined {
  for (let i = (p.revisions?.length ?? 0) - 1; i >= 0; i--) if (p.revisions![i].pages.includes(page.name)) return p.revisions![i].index;
  return undefined;
}

export interface Difference { kind: string; what: string; before: string; after: string }

/** Confronto tra due progetti (es. revisione inviata al cliente e versione attuale) */
export function compareProjects(a: Project, b: Project, library: Part[] = []): Difference[] {
  const out: Difference[] = [];
  const pa = new Map(a.pages.map(p => [p.name, p])), pb = new Map(b.pages.map(p => [p.name, p]));
  for (const [n, p] of pa) if (!pb.has(n)) out.push({ kind: 'Pagina', what: n, before: p.title, after: '(eliminata)' });
  for (const [n, p] of pb) {
    const o = pa.get(n);
    if (!o) { out.push({ kind: 'Pagina', what: n, before: '(nuova)', after: p.title }); continue; }
    if (o.title !== p.title) out.push({ kind: 'Pagina', what: n, before: o.title, after: p.title });
    const sig = (pg: Page) => new Set(pg.elements.map(e => JSON.stringify({ ...e, id: undefined })));
    const sa = sig(o), sb = sig(p);
    const added = [...sb].filter(x => !sa.has(x)).length, removed = [...sa].filter(x => !sb.has(x)).length;
    if (added || removed) out.push({ kind: 'Pagina', what: n, before: `${removed} elementi tolti o cambiati`, after: `${added} elementi nuovi o cambiati` });
  }
  const info = (p: Project) => {
    const parts = partsIndex(p, library);
    return new Map([...buildDevices(p).values()].map(d => {
      const i = deviceInfo(d.elements, d.main, parts);
      return [d.tag, [i.description, i.techData, i.partNr, i.orderNr].map(x => x ?? '').join(' · ')];
    }));
  };
  const da = info(a), db = info(b);
  for (const [t, v] of da) if (!db.has(t)) out.push({ kind: 'Dispositivo', what: `-${t}`, before: v, after: '(eliminato)' });
  for (const [t, v] of db) {
    if (!da.has(t)) out.push({ kind: 'Dispositivo', what: `-${t}`, before: '(nuovo)', after: v });
    else if (da.get(t) !== v) out.push({ kind: 'Dispositivo', what: `-${t}`, before: da.get(t)!, after: v });
  }
  for (const k of Object.keys(b.info) as (keyof Project['info'])[]) {
    if (a.info[k] !== b.info[k]) out.push({ kind: 'Progetto', what: k, before: a.info[k], after: b.info[k] });
  }
  return out;
}

/** Nuvoletta: ingombro di un gruppo di modifiche vicine, con gli elementi che contiene */
export interface CloudBox { box: Box; ids: string[] }

/** Raggruppa le modifiche vicine (entro gap mm) in una sola nuvoletta */
export function mergeClouds(items: { id: string; box: Box }[], gap = 3): CloudBox[] {
  const out: CloudBox[] = items.filter(i => i.box[2] > i.box[0] || i.box[3] > i.box[1]).map(i => ({ box: [...i.box] as Box, ids: [i.id] }));
  const near = (a: Box, b: Box) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (!near(out[i].box, out[j].box)) continue;
        const a = out[i].box, b = out[j].box;
        out[i] = { box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], ids: [...out[i].ids, ...out[j].ids] };
        out.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return out;
}
