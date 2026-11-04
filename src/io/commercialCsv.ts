// Dati commerciali in CSV esportati da EPLAN (Data Portal ▸ «commercial_data.csv»): una riga per
// articolo con costruttore, tipo, codice ordine, descrizioni, descrizione lunga e link ai documenti.
// Intestazione in inglese, tedesco o italiano; righe che iniziano con # ignorate.
import type { Part } from '../model/types';

/** Righe di un CSV con virgolette (separatore , ; o tabulazione, rilevato dall'intestazione) */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].map(c => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Colonne riconosciute → campo dell'articolo e attributo EPLAN */
const COLUMNS: [string[], keyof Part | undefined, string][] = [
  [['Part number', 'Artikelnummer', 'Codice articolo', 'Articolo'], 'partNr', 'P_ARTICLE_PARTNR'],
  [['Manufacturer (full name)', 'Hersteller (vollständiger Name)', 'Costruttore (nome completo)'], 'manufacturer', 'P_ARTICLE_MANUFACTURER_NAME'],
  [['Manufacturer (abbreviation)', 'Hersteller (Kurzbezeichnung)', 'Costruttore (abbreviazione)'], undefined, 'P_ARTICLE_MANUFACTURER'],
  [['Type number', 'Typnummer', 'Numero tipo', 'Codice tipo'], 'typeNr', 'P_ARTICLE_TYPENR'],
  [['Order number', 'Bestellnummer', 'Numero ordine', 'Codice ordine'], 'orderNr', 'P_ARTICLE_ORDERNR'],
  [['Product group', 'Produktgruppe', 'Gruppo prodotto'], 'productGroup', 'P_ARTICLE_PRODUCTGROUP'],
  [['Description 1', 'Bezeichnung 1', 'Descrizione 1'], 'descr1', 'P_ARTICLE_DESCR1'],
  [['Description 2', 'Bezeichnung 2', 'Descrizione 2'], 'descr2', 'P_ARTICLE_DESCR2'],
  [['Description 3', 'Bezeichnung 3', 'Descrizione 3'], undefined, 'P_ARTICLE_DESCR3'],
  [['Long description', 'Langbeschreibung', 'Descrizione lunga'], 'note', 'P_ARTICLE_NOTE'],
];

/** Link ai documenti dell'articolo (schede tecniche, istruzioni, catalogo) salvati negli attributi */
export const isDocLink = (k: string) => /external document|externes dokument|documento esterno|graphic file|grafikdatei|file grafico/i.test(k);

/** Articoli letti dal CSV; error se il file non ha la colonna dell'articolo */
export function parseCommercialCsv(text: string, source: string): { parts: Part[]; error?: string } {
  const rows = parseCsv(text).filter(r => r.some(c => c.trim()) && !r[0]?.trim().startsWith('#'));
  if (!rows.length) return { parts: [], error: 'vuoto' };
  const head = rows[0].map(h => h.trim());
  const col = (names: string[]) => head.findIndex(h => names.some(n => norm(n) === norm(h)));
  const map = COLUMNS.map(([names, key, attr]) => ({ i: col(names), key, attr }));
  const nr = map.find(m => m.key === 'partNr')!.i;
  if (nr < 0) return { parts: [], error: 'manca la colonna «Part number»' };
  const parts: Part[] = [];
  for (const r of rows.slice(1)) {
    const partNr = (r[nr] ?? '').trim();
    if (!partNr) continue;
    const part: Part = { partNr, functionTemplates: [], attrs: {}, source };
    // Tutte le colonne restano negli attributi con il loro nome (link, quantità, file DXF…)
    head.forEach((h, i) => { const v = (r[i] ?? '').trim(); if (h && v) part.attrs[h] = v; });
    for (const m of map) {
      const v = m.i >= 0 ? (r[m.i] ?? '').trim() : '';
      if (!v) continue;
      part.attrs[m.attr] = v;
      if (m.key && m.key !== 'partNr') (part as unknown as Record<string, string>)[m.key] = v;
    }
    parts.push(part);
  }
  return { parts };
}

/**
 * Unisce un articolo letto dal CSV a quello già in libreria: i campi vuoti si completano, simbolo,
 * morsetti e immagine dell'EDZ restano; gli attributi nuovi si aggiungono
 */
export function mergeCommercial(cur: Part | undefined, add: Part): Part {
  if (!cur) return add;
  const out: Part = { ...cur, attrs: { ...add.attrs, ...cur.attrs } };
  for (const k of ['manufacturer', 'typeNr', 'orderNr', 'productGroup', 'descr1', 'descr2', 'note'] as const) {
    if (!out[k] && add[k]) out[k] = add[k];
  }
  return out;
}
