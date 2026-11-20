// Lista I/O in Excel: esporta, modifica e reimporta pin, nomi, commenti e dati delle schede
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { ioAssignments } from '../src/model/plc';
import { applyCardsSheet, applyIoSheet, cardsSheetRows, ioSheetRows, isCardsSheet, isIoSheet } from '../src/model/plcIoSheet';
import { writeXlsx, readXlsx } from '../src/io/xlsx';

function project() {
  const p = emptyProject();
  p.plc.cards = [{ id: 'c1', tag: '700A4', typeId: 'di16', station: 'PLC1', start: { DI: 10 } }];
  return p;
}

describe('lista I/O Excel', () => {
  it('esporta tutti i canali e le schede, e si rilegge dal file xlsx', () => {
    const p = project();
    const io = ioSheetRows(p), cards = cardsSheetRows(p);
    expect(io[0]).toContain('Morsetto 5');
    expect(io.length).toBe(17);
    expect(io[1].slice(0, 9)).toEqual(['PLC1', '-700A4', '', '', 'Ingressi digitali 16 DI', '', 'DI0', 'DI', 'I10.0']);
    expect(cards[1].slice(0, 7)).toEqual(['1', 'PLC1', '-700A4', '', '', 'Ingressi digitali 16 DI', '16 DI']);
    const back = readXlsx(writeXlsx([{ name: 'Lista I/O', rows: io }, { name: 'Schede', rows: cards }]));
    expect(isIoSheet(back[0].rows)).toBe(true);
    expect(isCardsSheet(back[1].rows)).toBe(true);
    expect(isIoSheet(back[1].rows)).toBe(false);
  });
  it('reimporta pin (fino a 5), nome simbolico, commento e dati della scheda', () => {
    const p = project();
    const io = ioSheetRows(p);
    const h = io[0];
    const c = (n: string) => h.indexOf(n);
    io[1][c('Morsetto 1')] = 'X10.1'; io[1][c('Morsetto 2')] = 'X10.4'; io[1][c('Morsetto 3')] = 'X10.3'; io[1][c('Morsetto 5')] = 'X10.5';
    io[1][c('Nome simbolico')] = 'Fotocellula ingresso'; io[1][c('Commento')] = 'Presenza pacco';
    io.push(['', '-9A9', '', '', '', '', 'DI0']);
    const r = applyIoSheet(p, io);
    expect(r).toMatchObject({ changed: 1, rows: 16, unknown: ['-9A9 DI0'] });
    const row = ioAssignments(p).find(x => x.channel === 'DI0')!;
    expect(row.pins).toEqual(['X10.1', 'X10.4', 'X10.3', '', 'X10.5']);
    expect(row.symbol).toBe('Fotocellula_ingresso');
    expect(row.comment).toBe('Presenza pacco');
    // Reimportando lo stesso file non cambia nulla; svuotando il commento si toglie
    expect(applyIoSheet(p, ioSheetRows(p)).changed).toBe(0);
    const again = ioSheetRows(p); again[1][c('Commento')] = '';
    applyIoSheet(p, again);
    expect(p.plc.cards[0].io?.DI0?.comment).toBeUndefined();

    const cards = cardsSheetRows(p);
    const k = (n: string) => cards[0].indexOf(n);
    cards[1][k('Rack')] = '0'; cards[1][k('Slot')] = '3'; cards[1][k('Descrizione')] = 'ET 200eco PN 16 DIQ';
    cards[1][k('Articolo')] = '6ES7143-6BH00-0BB0'; cards[1][k('Inizio DI')] = '20'; cards[1][k('Inizio DO')] = '5';
    const rc = applyCardsSheet(p, cards);
    expect(rc.changed).toBe(1);
    expect(p.plc.cards[0]).toMatchObject({ rack: 0, slot: 3, description: 'ET 200eco PN 16 DIQ', partNr: '6ES7143-6BH00-0BB0', start: { DI: 20 } });
    // Scheda senza uscite: l'inizio DO si ignora
    expect(p.plc.cards[0].start.DO).toBeUndefined();
  });
});

describe('nomi dei fogli Excel', () => {
  it('senza caratteri vietati, non vuoti, al massimo 31 caratteri e diversi tra loro', async () => {
    const { sheetNames } = await import('../src/io/xlsx');
    expect(sheetNames(['Lista I/O', 'a:b*c?[d]\\e', '', 'Schede', 'schede', 'x'.repeat(40)]))
      .toEqual(['Lista I-O', 'a-b-c--d--e', 'Foglio3', 'Schede', 'schede 2', 'x'.repeat(31)]);
  });
});
