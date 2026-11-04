// Liste personalizzate (editor dei modelli delle liste): una lista nuova costruita da una lista del
// progetto (dispositivi, distinta, fili, morsetti, cavi…) scegliendo colonne e loro nomi, filtro,
// ordinamento e raggruppamento con il conteggio. Diventa una lista come le altre: Vista report,
// pagine di lista, PDF, CSV ed Excel.
import type { CustomList, CustomListFilter } from './types';
import type { Table } from './reports';
import { tn } from '../i18n/ui';

const cmpNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function test(f: CustomListFilter, v: string): boolean {
  const a = v.toLowerCase(), b = (f.value ?? '').toLowerCase();
  switch (f.op) {
    case 'contains': return a.includes(b);
    case 'notContains': return !a.includes(b);
    case 'equals': return a === b;
    case 'startsWith': return a.startsWith(b);
    case 'empty': return !a.trim();
    case 'notEmpty': return !!a.trim();
  }
}

export const FILTER_OPS: [CustomListFilter['op'], string][] = [
  ['contains', tn('contiene')], ['notContains', tn('non contiene')], ['equals', tn('è uguale a')], ['startsWith', tn('comincia con')], ['empty', tn('è vuota')], ['notEmpty', tn('non è vuota')],
];

/** Lista personalizzata calcolata dalle liste del progetto; undefined se la lista di partenza non c'è */
export function customListTable(base: Table[], def: CustomList): Table | undefined {
  const src = base.find(t => t.title === def.source);
  if (!src) return undefined;
  const idx = (name: string) => src.columns.indexOf(name);
  const cols = def.columns.filter(c => idx(c.field) >= 0);
  let rows = src.rows.map((r, i) => ({ r, i }));
  for (const f of def.filters ?? []) {
    const k = idx(f.field);
    if (k >= 0) rows = rows.filter(({ r }) => test(f, r[k] ?? ''));
  }
  const sortK = def.sort ? idx(def.sort.field) : -1;
  if (sortK >= 0) rows.sort((a, b) => cmpNum(a.r[sortK] ?? '', b.r[sortK] ?? '') * (def.sort!.desc ? -1 : 1));
  // Raggruppamento: righe uguali nelle colonne scelte diventano una sola, con la quantità
  if (def.groupCount) {
    const groups = new Map<string, { r: string[]; n: number; i: number }>();
    for (const { r, i } of rows) {
      const vals = cols.map(c => r[idx(c.field)] ?? '');
      const key = JSON.stringify(vals);
      const g = groups.get(key);
      if (g) g.n++; else groups.set(key, { r: vals, n: 1, i });
    }
    return {
      title: def.title,
      columns: [...cols.map(c => c.label || c.field), def.countLabel || 'Quantità'],
      rows: [...groups.values()].map(g => [...g.r, String(g.n)]),
    };
  }
  // Collegamenti alle pagine: quelli delle colonne tenute, alla nuova posizione
  const goto = src.goto ? rows.map(({ i }) => {
    const o: Record<number, string | undefined> = {};
    cols.forEach((c, k) => { const v = src.goto![i]?.[idx(c.field)]; if (v !== undefined) o[k] = v; });
    return o;
  }) : undefined;
  return {
    title: def.title,
    columns: cols.map(c => c.label || c.field),
    rows: rows.map(({ r }) => cols.map(c => r[idx(c.field)] ?? '')),
    goto,
    symbols: src.symbols && cols[0] && idx(cols[0].field) === 0 ? rows.map(({ i }) => src.symbols![i]) : undefined,
    rowH: src.rowH,
  };
}
