// Cerca e sostituisci su sigle, testi, descrizioni, numeri filo e nomi PLC.
import type { Project, Element } from './types';
import { columnOf } from './types';
import { getSymbol } from './geometry';
import { computeNetlist } from './netlist';
import { tn } from '../i18n/ui';

export type SearchField = 'tag' | 'description' | 'techData' | 'note' | 'text' | 'wireNo' | 'plcSymbol' | 'plcComment' | 'orderNr' | 'typeNr';

export const FIELD_LABELS: Record<SearchField, string> = {
  tag: tn('Sigla / nome'), description: tn('Descrizione'), techData: tn('Dati tecnici'), note: tn('Note'), text: tn('Testo'),
  wireNo: tn('Numero filo'), plcSymbol: tn('Nome simbolico PLC'), plcComment: tn('Commento PLC'), orderNr: tn('Codice ordinazione'), typeNr: tn('Tipo'),
};

export interface SearchOpts { matchCase: boolean; wholeWord: boolean; fields?: SearchField[] }

export interface SearchHit {
  pageId: string;
  pageName: string;
  elementId: string;
  field: SearchField;
  value: string;
  /** Posizione "pagina.colonna" */
  loc: string;
  /** Il numero filo calcolato in automatico non è sostituibile (va scritto come numero manuale) */
  replaceable: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function searchRegex(query: string, o: SearchOpts): RegExp | undefined {
  if (!query) return undefined;
  const body = o.wholeWord ? `(?<![\\w.:-])${esc(query)}(?![\\w.:-])` : esc(query);
  return new RegExp(body, o.matchCase ? 'g' : 'gi');
}

const xOf = (e: Element) => (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef' ? e.points[0].x : e.x);

export function search(project: Project, query: string, o: SearchOpts): SearchHit[] {
  const re = searchRegex(query, o);
  if (!re) return [];
  const want = (f: SearchField) => !o.fields || o.fields.includes(f);
  const out: SearchHit[] = [];
  const test = (v: string | undefined) => { re.lastIndex = 0; return !!v && re.test(v); };
  const nl = want('wireNo') ? computeNetlist(project) : undefined;
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      const hit = (field: SearchField, value: string, replaceable = true) =>
        out.push({ pageId: pg.id, pageName: pg.name, elementId: e.id, field, value, loc: `${pg.name}.${columnOf(xOf(e))}`, replaceable });
      if (e.kind === 'symbol') {
        if (want('tag') && test(e.tag)) hit('tag', getSymbol(e.symbolId, project)?.role === 'potential' || getSymbol(e.symbolId, project)?.role === 'link' ? e.tag : `-${e.tag}`);
        for (const f of ['description', 'techData', 'note', 'plcSymbol', 'plcComment', 'orderNr', 'typeNr'] as const) {
          if (want(f) && test(e[f])) hit(f, e[f]!);
        }
      } else if (e.kind === 'text') {
        if (want('text') && test(e.text)) hit('text', e.text);
      } else if (nl && e.kind === 'wire') {
        const net = nl.wireNet.get(e.id);
        // Un conduttore compare una volta sola: sul filo che porta il numero, oppure sul primo
        const shown = net?.wires.find(w => w.wire.number)?.wire.id ?? net?.wires[0]?.wire.id;
        if (net && shown === e.id && test(net.wireNo)) hit('wireNo', net.wireNo, !!e.number || !net.named);
      }
    }
  }
  return out;
}

/**
 * Sostituisce il testo nei risultati indicati (modifica il progetto). I numeri filo
 * sostituiti diventano numeri manuali. Restituisce quanti valori sono cambiati.
 */
export function replaceHits(project: Project, hits: SearchHit[], query: string, replacement: string, o: SearchOpts): number {
  const re = searchRegex(query, o);
  if (!re) return 0;
  const rep = (v: string) => v.replace(re, () => replacement);
  const byId = new Map<string, Element>();
  for (const pg of project.pages) for (const e of pg.elements) byId.set(e.id, e);
  let n = 0;
  for (const h of hits) {
    const e = byId.get(h.elementId);
    if (!e || !h.replaceable) continue;
    if (e.kind === 'symbol' && h.field !== 'wireNo' && h.field !== 'text') {
      const v = e[h.field];
      if (typeof v === 'string' && rep(v) !== v) { e[h.field] = rep(v); n++; }
    } else if (e.kind === 'text' && h.field === 'text') {
      if (rep(e.text) !== e.text) { e.text = rep(e.text); n++; }
    } else if (e.kind === 'wire' && h.field === 'wireNo') {
      const nv = rep(h.value);
      if (nv !== h.value) { e.number = nv; n++; }
    }
  }
  return n;
}
