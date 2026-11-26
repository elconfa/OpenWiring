// Impaginazione della pagina indice del PDF (pdf.ts): una o più pagine, senza tagliare l'elenco
import { FRAME, PAGE_H } from '../model/types';

/** Righe dell'indice: titolo «Indice», una riga per pagina, poi titolo «Liste» e una riga per lista */
export type IndexItem = { kind: 'head' | 'page' | 'listHead' | 'list'; i: number; sheet: number; y: number };

/** Posizione di ogni riga dell'indice, su una o più pagine (la prima ha a destra le revisioni) */
export function indexLayout(nPages: number, nTables: number): { items: IndexItem[]; pages: number } {
  const top = FRAME.top + 22, bottom = PAGE_H - 20;
  const items: IndexItem[] = [];
  let sheet = 0, y = top;
  const put = (kind: IndexItem['kind'], i: number, h: number, before = 0) => {
    if (y + before > bottom && y > top) { sheet++; y = top; before = 0; }
    y += before;
    items.push({ kind, i, sheet, y });
    y += h;
  };
  put('head', 0, 8);
  for (let i = 0; i < nPages; i++) put('page', i, 6);
  if (nTables) { put('listHead', 0, 8, 4); for (let i = 0; i < nTables; i++) put('list', i, 6); }
  return { items, pages: sheet + 1 };
}

