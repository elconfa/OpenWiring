// Modifiche della revisione aperta rispetto all'ultima emissione (fase 19c): per ogni pagina le
// modifiche fatte a mano (elementi aggiunti, cambiati, tolti, dati della pagina) e quelle automatiche,
// cioè i testi calcolati dallo schema che sono cambiati senza toccare la pagina (rimandi, numeri
// filo, sigle, immagini dei contatti, contenuto delle liste) con la causa. Stato di ogni pagina:
// invariata, modificata, automatica, nuova, eliminata.
import type { Element, Part, Project } from './types';
import { derive, type Derived } from './derive';
import { getSymbol } from './geometry';
import { elementBox, type Box } from './revisions';
import { isGenerated } from './pageOrder';
import { tn } from '../i18n/ui';

export type PageStatus = 'invariata' | 'modificata' | 'automatica' | 'nuova' | 'eliminata';
export type ChangeKind = 'aggiunto' | 'modificato' | 'tolto' | 'pagina' | 'automatico';

export interface ChangeItem {
  /** Chiave della nota: "pageId:elementId" o "pageId:@page" */
  key: string;
  pageId: string;
  elementId?: string;
  kind: ChangeKind;
  what: string;
  detail: string;
  box?: Box;
}

export interface PageReport { pageId: string; name: string; title: string; status: PageStatus; changes: ChangeItem[] }

/** Nomi delle proprietà di un elemento, per dire cosa è cambiato */
const PROP_NAMES: Record<string, string> = {
  x: tn('posizione'), y: tn('posizione'), points: tn('tracciato'), rot: tn('rotazione'), mirror: tn('specchiatura'),
  tag: tn('sigla'), symbolId: tn('simbolo'), partNr: tn('articolo'), description: tn('descrizione'), techData: tn('dati tecnici'),
  pinLabels: tn('morsetti'), color: tn('colore'), section: tn('sezione'), text: tn('testo'), wireNo: tn('numero filo'),
  function: tn('funzione'), location: tn('luogo'), textOffsets: tn('posizione dei testi'), w: tn('dimensioni'), h: tn('dimensioni'),
};
const ELEMENT_NAMES: Record<string, string> = {
  wire: tn('Filo'), text: tn('Testo'), zone: tn('Zona'), image: tn('Immagine'), cable: tn('Cavo'), wiredef: tn('Linea delle sezioni'),
};

/** Nome breve di un elemento: sigla del componente, numero del filo, testo… */
function elementName(e: Element, project: Project, d?: Derived, pageId?: string): string {
  const pd = pageId ? d?.pages.get(pageId) : undefined;
  if (e.kind === 'symbol') {
    const sym = getSymbol(e.symbolId, project);
    const tag = pd?.designations.get(e.id) || (e.tag ? `-${e.tag}` : '');
    return [tag, sym?.name].filter(Boolean).join(' ') || e.symbolId;
  }
  if (e.kind === 'wire') { const n = pd?.wireNumbers.get(e.id); return n ? `${ELEMENT_NAMES.wire} ${n}` : ELEMENT_NAMES.wire; }
  if (e.kind === 'text') return `${ELEMENT_NAMES.text} «${('text' in e ? String(e.text) : '').slice(0, 30)}»`;
  return ELEMENT_NAMES[e.kind] ?? e.kind;
}

/** Proprietà diverse tra due versioni di un elemento */
function changedProps(a: Element, b: Element): string {
  const ra = a as unknown as Record<string, unknown>, rb = b as unknown as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter(k => JSON.stringify(ra[k]) !== JSON.stringify(rb[k]));
  return [...new Set(keys.map(k => PROP_NAMES[k] ?? k))].join(', ');
}

/** Testi calcolati dallo schema per un elemento della pagina, con il loro nome */
function computedTexts(d: Derived, pageId: string, id: string): Record<string, string> {
  const pd = d.pages.get(pageId);
  if (!pd) return {};
  const out: Record<string, string> = {};
  const put = (k: string, v: string | undefined) => { if (v) out[k] = v; };
  put(tn('sigla'), pd.designations.get(id));
  put(tn('numero filo'), pd.wireNumbers.get(id));
  const x = pd.xrefs.get(id);
  put(tn('rimando all\'elemento principale'), x?.mainLocation ? `/${x.mainLocation}` : undefined);
  put(tn('immagine dei contatti'), x?.contacts?.map(c => `${c.labels} /${c.location}`).join(', '));
  put(tn('rimandi'), pd.linkTargets.get(id)?.map(t => `/${t.loc}`).join(', '));
  put(tn('testi del componente'), pd.deviceLines.get(id)?.join(' / '));
  const f = pd.deviceFields.get(id);
  put(tn('campi'), f && Object.keys(f).length ? Object.entries(f).map(([k, v]) => `${k}=${v}`).join(', ') : undefined);
  const plc = pd.plcTexts.get(id);
  put(tn('indirizzo PLC'), plc ? [plc.address, plc.symbol, plc.ref].filter(Boolean).join(' ') : undefined);
  const l = pd.labels.get(id);
  put(tn('nomi dei morsetti'), l && Object.keys(l).length ? Object.entries(l).map(([k, v]) => `${k}:${v}`).join(' ') : undefined);
  return out;
}

/** Contenuto calcolato delle pagine generate (liste, morsettiere, panoramiche, disegni) */
function generatedContent(d: Derived, pageId: string): string {
  const pd = d.pages.get(pageId);
  if (!pd) return '';
  return JSON.stringify([pd.reportSheet?.table.rows, pd.reportSheet?.table.title, pd.stripSheet, pd.overview, pd.drawing]);
}

/**
 * Modifiche della revisione: base è il progetto dell'ultima emissione (dall'archivio), cur quello
 * attuale. Le pagine si riconoscono dall'identificativo, gli elementi pure.
 */
export function revisionChanges(base: Project, cur: Project, library: Part[] = [], dBase = derive(base, library), dCur = derive(cur, library)): PageReport[] {
  const out: PageReport[] = [];
  const basePages = new Map(base.pages.map(p => [p.id, p]));
  for (const pg of cur.pages) {
    const old = basePages.get(pg.id);
    const rep: PageReport = { pageId: pg.id, name: pg.name, title: pg.title, status: 'invariata', changes: [] };
    out.push(rep);
    if (!old) { rep.status = 'nuova'; continue; }
    const key = (id: string) => `${pg.id}:${id}`;
    // Dati della pagina
    const pageDiff = [old.name !== pg.name && tn('numero'), old.title !== pg.title && tn('descrizione'), old.panelId !== pg.panelId && tn('luogo'), old.titleBlockId !== pg.titleBlockId && tn('cartiglio')].filter(Boolean) as string[];
    if (pageDiff.length) rep.changes.push({ key: key('@page'), pageId: pg.id, kind: 'pagina', what: tn('Pagina'), detail: pageDiff.join(', ') });
    // Elementi aggiunti, cambiati e tolti a mano
    const before = new Map(old.elements.map(e => [e.id, e]));
    const now = new Set(pg.elements.map(e => e.id));
    for (const e of pg.elements) {
      const o = before.get(e.id);
      if (!o) rep.changes.push({ key: key(e.id), pageId: pg.id, elementId: e.id, kind: 'aggiunto', what: elementName(e, cur, dCur, pg.id), detail: '', box: elementBox(e, cur) });
      else if (JSON.stringify(o) !== JSON.stringify(e)) rep.changes.push({ key: key(e.id), pageId: pg.id, elementId: e.id, kind: 'modificato', what: elementName(e, cur, dCur, pg.id), detail: changedProps(o, e), box: elementBox(e, cur) });
    }
    for (const o of old.elements) {
      if (!now.has(o.id)) rep.changes.push({ key: key(o.id), pageId: pg.id, elementId: o.id, kind: 'tolto', what: elementName(o, base, dBase, pg.id), detail: '', box: elementBox(o, base) });
    }
    const manual = rep.changes.length > 0;
    // Testi calcolati cambiati sugli elementi non toccati: la causa è altrove nel progetto
    for (const e of pg.elements) {
      const o = before.get(e.id);
      if (!o || JSON.stringify(o) !== JSON.stringify(e)) continue;
      const a = computedTexts(dBase, pg.id, e.id), b = computedTexts(dCur, pg.id, e.id);
      const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
      if (!diff.length) continue;
      rep.changes.push({
        key: key(e.id), pageId: pg.id, elementId: e.id, kind: 'automatico', what: elementName(e, cur, dCur, pg.id),
        detail: diff.map(k => `${k}: ${a[k] || '—'} → ${b[k] || '—'}`).join('; '), box: elementBox(e, cur),
      });
    }
    if (isGenerated(pg) && generatedContent(dBase, pg.id) !== generatedContent(dCur, pg.id)) {
      rep.changes.push({ key: key('@content'), pageId: pg.id, kind: 'automatico', what: tn('Contenuto'), detail: tn('ricalcolato dallo schema') });
    }
    rep.status = manual ? 'modificata' : rep.changes.length ? 'automatica' : 'invariata';
  }
  const curIds = new Set(cur.pages.map(p => p.id));
  for (const p of base.pages) {
    if (!curIds.has(p.id)) out.push({ pageId: p.id, name: p.name, title: p.title, status: 'eliminata', changes: [] });
  }
  return out;
}

/** Conteggi per stato (per il riepilogo) */
export function statusCounts(r: PageReport[]): Record<PageStatus, number> {
  const c: Record<PageStatus, number> = { invariata: 0, modificata: 0, automatica: 0, nuova: 0, eliminata: 0 };
  for (const p of r) c[p.status]++;
  return c;
}

