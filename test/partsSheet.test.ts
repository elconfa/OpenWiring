import { describe, it, expect } from 'vitest';
import { partsToRows, partsFromRows } from '../src/model/partsSheet';
import { writeXlsx, readXlsx } from '../src/io/xlsx';
import type { Part } from '../src/model/types';

const k1: Part = {
  partNr: 'DEMO.K1', typeNr: 'K-100', manufacturer: 'DEMO', descr1: 'Contattore', price: 12.5, width: 45,
  functionTemplates: [{ pos: 1, description: 'Bobina', connections: ['A1', 'A2'] }, { pos: 2, description: '', connections: ['13', '14'] }],
  attrs: { 'P_ARTICLE_X': 'resta' }, picture: 'data:image/png;base64,AAA',
};

describe('articoli in Excel', () => {
  it('esporta e reimporta senza cambiare nulla', () => {
    const rows = readXlsx(writeXlsx([{ name: 'Articoli', rows: partsToRows([k1]) }]))[0].rows;
    expect(rows[1][0]).toBe('DEMO.K1');
    const r = partsFromRows(rows, new Map([[k1.partNr, k1]]));
    expect(r).toMatchObject({ added: 0, updated: 0, unchanged: 1, parts: [] });
  });

  it('aggiorna le colonne modificate, aggiunge i codici nuovi e conserva i dati fuori dal foglio', () => {
    const rows = readXlsx(writeXlsx([{ name: 'Articoli', rows: partsToRows([k1]) }]))[0].rows;
    const head = rows[0];
    const col = (label: string) => head.indexOf(label);
    rows[1][col('Prezzo')] = '13,8';
    rows[1][col('Larghezza (mm)')] = '';
    rows[1][col('Funzioni (punti di connessione)')] = 'A1 A2 ; Bobina\n21 22 ; NC';
    const nuovo = Array(head.length).fill('');
    nuovo[0] = 'DEMO.Q1'; nuovo[col('Descrizione 1')] = 'Interruttore';
    rows.push(nuovo);
    const r = partsFromRows(rows, new Map([[k1.partNr, k1]]));
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    const k = r.parts.find(p => p.partNr === 'DEMO.K1')!;
    expect(k.price).toBe(13.8);
    expect(k.width).toBeUndefined();
    expect(k.functionTemplates.map(f => f.connections.join(' '))).toEqual(['A1 A2', '21 22']);
    expect(k.attrs.P_ARTICLE_X).toBe('resta');
    expect(k.picture).toBe(k1.picture);
    expect(r.parts.find(p => p.partNr === 'DEMO.Q1')?.descr1).toBe('Interruttore');
  });

  it('senza la colonna del codice non importa niente', () => {
    expect(partsFromRows([['Tipo'], ['X']], new Map()).error).toBeTruthy();
  });
});
