// Articoli in Excel (vista Articoli ▸ Esporta Excel / Importa Excel): una riga per articolo, da
// modificare in Excel o LibreOffice e reimportare. Il codice articolo fa da chiave: le righe con un
// codice nuovo diventano articoli nuovi, le altre aggiornano le colonne presenti nel file (una cella
// svuotata toglie il valore). Immagine, documenti e attributi originali dell'XML non sono nel foglio
// e restano come sono.
import type { FunctionTemplate, Part, PartCable } from './types';
import { tn, tx } from '../i18n/ui';
import { partConductors } from './cables';

type Key = 'partNr' | 'typeNr' | 'orderNr' | 'manufacturer' | 'supplier' | 'descr1' | 'descr2' | 'productGroup'
  | 'width' | 'height' | 'depth' | 'weight' | 'price' | 'note' | 'symbolId' | 'functions'
  | 'cableMarking' | 'cableConductors' | 'cableCross' | 'cableShield';

export const PART_COLUMNS: { key: Key; label: string; num?: true; w: number }[] = [
  { key: 'partNr', label: tn('Codice articolo'), w: 26 },
  { key: 'typeNr', label: tn('Numero tipo'), w: 22 },
  { key: 'orderNr', label: tn('Numero d\'ordine'), w: 18 },
  { key: 'manufacturer', label: tn('Costruttore'), w: 16 },
  { key: 'supplier', label: tn('Fornitore'), w: 14 },
  { key: 'descr1', label: tn('Descrizione 1'), w: 40 },
  { key: 'descr2', label: tn('Descrizione 2'), w: 30 },
  { key: 'productGroup', label: tn('Gruppo prodotto'), w: 16 },
  { key: 'width', label: tn('Larghezza (mm)'), num: true, w: 10 },
  { key: 'height', label: tn('Altezza (mm)'), num: true, w: 10 },
  { key: 'depth', label: tn('Profondità (mm)'), num: true, w: 10 },
  { key: 'weight', label: tn('Peso (kg)'), num: true, w: 9 },
  { key: 'price', label: tn('Prezzo'), num: true, w: 9 },
  { key: 'note', label: tn('Note'), w: 24 },
  { key: 'symbolId', label: tn('Simbolo'), w: 18 },
  { key: 'functions', label: tn('Funzioni (punti di connessione)'), w: 30 },
  { key: 'cableMarking', label: tn('Cavo: marcatura (numeri/colori)'), w: 14 },
  { key: 'cableConductors', label: tn('Cavo: conduttori'), w: 40 },
  { key: 'cableCross', label: tn('Cavo: sezione (mm²)'), w: 10 },
  { key: 'cableShield', label: tn('Cavo: schermato (sì/no)'), w: 10 },
];

type CableKey = 'cableMarking' | 'cableConductors' | 'cableCross' | 'cableShield';
const isCableKey = (k: Key): k is CableKey => k.startsWith('cable');

/** Testo della cella per i dati dell'articolo cavo */
function cableCell(p: Part, k: CableKey): string | undefined {
  const c = p.cable;
  if (!c) return undefined;
  if (k === 'cableMarking') return c.marking === 'colors' ? tx('colori') : tx('numeri');
  if (k === 'cableConductors') return c.conductors.join(' ');
  if (k === 'cableCross') return c.cross;
  return c.shield ? tx('sì') : undefined;
}

/** Dati del cavo letti dalla riga (un articolo senza conduttori non è un cavo: vedi partsFromRows) */
function setCableCell(p: Part, k: CableKey, v: string) {
  const c: PartCable = p.cable ? { ...p.cable } : { marking: 'numbers', conductors: [] };
  if (k === 'cableMarking') c.marking = /^(c|colou?r|farb|цвет)/i.test(v) ? 'colors' : 'numbers';
  else if (k === 'cableConductors') c.conductors = v.split(/[\s,;]+/).filter(Boolean);
  else if (k === 'cableCross') { if (v) c.cross = v; else delete c.cross; }
  else if (/^(s|y|j|o|д|1|x|true)/i.test(v)) c.shield = true; else delete c.shield;
  p.cable = c;
}

/** Funzioni come nella vista Articoli: una per riga, designazioni separate da spazio, «;» e descrizione */
export function functionsText(fts: FunctionTemplate[]): string {
  return fts.map(f => `${f.connections.join(' ')}${f.description ? ` ; ${f.description}` : ''}`).join('\n');
}

export function parseFunctions(text: string): FunctionTemplate[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((l, i) => {
    const [conn, ...descr] = l.split(';');
    return { pos: i + 1, description: descr.join(';').trim(), connections: conn.trim().split(/[\s,]+/).filter(Boolean) };
  });
}

/** Righe del foglio: intestazioni nella lingua dell'interfaccia, poi un articolo per riga */
export function partsToRows(parts: Part[]): (string | number | undefined)[][] {
  const head = PART_COLUMNS.map(c => tx(c.label));
  const body = [...parts].sort((a, b) => a.partNr.localeCompare(b.partNr)).map(p => PART_COLUMNS.map(c =>
    c.key === 'functions' ? functionsText(p.functionTemplates) : isCableKey(c.key) ? cableCell(p, c.key) : (p[c.key] as string | number | undefined)));
  return [head, ...body];
}

export interface PartsImport {
  /** Articoli nuovi e modificati, completi (da salvare al posto di quelli presenti) */
  parts: Part[];
  added: number;
  updated: number;
  unchanged: number;
  /** Codici scritti in più righe: vale l'ultima */
  repeated: string[];
  error?: string;
}

const num = (v: string) => {
  const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Legge le righe del foglio. Le colonne si riconoscono dall'intestazione, in italiano o nella
 * lingua dell'interfaccia; quelle che mancano non si toccano.
 */
export function partsFromRows(rows: string[][], existing: Map<string, Part>): PartsImport {
  const empty: PartsImport = { parts: [], added: 0, updated: 0, unchanged: 0, repeated: [] };
  if (!rows.length) return { ...empty, error: tx('File vuoto') };
  const norm = (s: string) => s.trim().toLowerCase();
  const head = rows[0].map(norm);
  const cols = PART_COLUMNS.map(c => ({ ...c, i: head.findIndex(h => h === norm(c.label) || h === norm(tx(c.label)) || h === c.key.toLowerCase()) }))
    .filter(c => c.i >= 0);
  const keyCol = cols.find(c => c.key === 'partNr');
  if (!keyCol) return { ...empty, error: tx('Manca la colonna «{0}»', tx('Codice articolo')) };
  const out = new Map<string, Part>();
  const seen = new Set<string>(), repeated = new Set<string>();
  let added = 0, updated = 0, unchanged = 0;
  for (const r of rows.slice(1)) {
    const partNr = (r[keyCol.i] ?? '').trim();
    if (!partNr) continue;
    if (seen.has(partNr)) repeated.add(partNr);
    seen.add(partNr);
    const cur = out.get(partNr) ?? existing.get(partNr);
    const part: Part = cur ? structuredClone(cur) : { partNr, functionTemplates: [], attrs: {}, source: tx('Excel') };
    for (const c of cols) {
      if (c.key === 'partNr') continue;
      const v = (r[c.i] ?? '').trim();
      if (c.key === 'functions') { part.functionTemplates = parseFunctions(v); continue; }
      if (isCableKey(c.key)) { setCableCell(part, c.key, v); continue; }
      const value = c.num ? (v ? num(v) : undefined) : v || undefined;
      if (value === undefined) delete part[c.key];
      else (part as unknown as Record<string, string | number>)[c.key] = value;
    }
    if (part.cable && !part.cable.conductors.length) delete part.cable;
    if (part.cable) part.cable.conductors = partConductors(part.cable);
    const before = existing.get(partNr);
    if (!before) { if (!out.has(partNr)) added++; out.set(partNr, part); }
    else if (JSON.stringify(sheetView(before)) !== JSON.stringify(sheetView(part))) { if (!out.has(partNr)) updated++; out.set(partNr, part); }
    else if (!out.has(partNr)) unchanged++;
  }
  return { parts: [...out.values()], added, updated, unchanged, repeated: [...repeated] };
}

/** I soli dati che stanno nel foglio, per capire se una riga cambia qualcosa */
function sheetView(p: Part) {
  return PART_COLUMNS.map(c => (c.key === 'functions' ? functionsText(p.functionTemplates) : isCableKey(c.key) ? cableCell(p, c.key) ?? '' : p[c.key] ?? ''));
}
