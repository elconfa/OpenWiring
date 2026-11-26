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
    expect(io[0]).toEqual(expect.arrayContaining(['Segnale 1', 'Segnale 2', 'Comune 1', 'Comune 2', 'Comune 3']));
    expect(io.length).toBe(17);
    expect(io[1].slice(0, 9)).toEqual(['PLC1', '-700A4', '', '', 'Ingressi digitali 16 DI', '', 'DI0', 'DI', 'I10.0']);
    expect(cards[1].slice(0, 7)).toEqual(['1', 'PLC1', '-700A4', '', '', 'Ingressi digitali 16 DI', '16 DI']);
    const back = readXlsx(writeXlsx([{ name: 'Lista I/O', rows: io }, { name: 'Schede', rows: cards }]));
    expect(isIoSheet(back[0].rows)).toBe(true);
    expect(isCardsSheet(back[1].rows)).toBe(true);
    expect(isIoSheet(back[1].rows)).toBe(false);
  });
  it('reimporta i segnali, nome simbolico, commento e dati della scheda; un canale a 2 morsetti non ha comuni', () => {
    const p = project();
    const io = ioSheetRows(p);
    const h = io[0];
    const c = (n: string) => h.indexOf(n);
    io[1][c('Segnale 1')] = '1'; io[1][c('Segnale 2')] = '2'; io[1][c('Comune 1')] = '3';
    io[1][c('Nome simbolico')] = 'Fotocellula ingresso'; io[1][c('Commento')] = 'Presenza pacco';
    io.push(['', '-9A9', '', '', '', '', 'DI0']);
    const r = applyIoSheet(p, io);
    expect(r).toMatchObject({ changed: 1, rows: 16, unknown: ['-9A9 DI0'] });
    const row = ioAssignments(p).find(x => x.channel === 'DI0')!;
    expect(row.pins).toEqual(['1', '2']);
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
  it('comuni delle prese M12: esportati per i due canali della presa e reimportati sulla presa', async () => {
    const { useStore } = await import('../src/model/store');
    const { socketMembers } = await import('../src/model/plcSocket');
    const st = useStore.getState;
    st().loadProject(project());
    const f = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, undefined, '700A4')!;
    st().updatePlcSocket(f.plcGroup!.id, { name: 'X10' });
    const p = st().project;
    const io = ioSheetRows(p);
    const c = (n: string) => io[0].indexOf(n);
    const line = (ch: string) => io.find(r => r[c('Canale')] === ch)!;
    expect(['Segnale 1', 'Segnale 2', 'Comune 1', 'Comune 2', 'Comune 3'].map(n => line('DI8')[c(n)])).toEqual(['X10.2', '', 'X10.1', 'X10.5', 'X10.3']);
    expect(line('DI0')[c('Comune 1')]).toBe('X10.1');
    expect(line('DI4')[c('Comune 1')]).toBe('');
    // Cambiato su una sola delle due righe della presa: vale per la presa
    line('DI8')[c('Comune 3')] = 'X10.3A';
    const q = structuredClone(p);
    expect(applyIoSheet(q, io).changed).toBe(1);
    const body = socketMembers(q.pages[0], f.plcGroup!.id).find(e => e.plcGroup!.socket === 'body' && e.plcGroup!.index === 0)!;
    expect(body.pinLabels).toEqual({ 1: 'X10.1', 3: 'X10.3A', 5: 'X10.5' });
    expect(applyIoSheet(q, ioSheetRows(q)).changed).toBe(0);
    // File di una versione precedente: le colonne con i nomi vecchi si leggono ancora
    const old = ioSheetRows(q).map(r => [...r]);
    old[0] = old[0].map(n => ({ 'Segnale 1': 'Segnale', 'Comune 1': 'Comune +24 V', 'Comune 2': 'Comune FE', 'Comune 3': 'Comune 0 V' } as Record<string, string>)[n] ?? n);
    old.find(r => r[c('Canale')] === 'DI0')![c('Comune 1')] = 'X10.1B';
    expect(applyIoSheet(q, old).changed).toBe(1);
    expect(body.pinLabels[1]).toBe('X10.1B');
  });
});

