// Legenda simboli, linea di definizione dei fili, disegni dei cavi, connettori e schema d'insieme
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { exampleProject } from '../src/model/example';
import { importPagesText } from '../src/model/textFormat';
import { legendReport, sheetRows } from '../src/model/reports';
import { applyWireDefs, wireDefLabel } from '../src/model/wireDefs';
import { syncDrawingPages, cableSheet, connectorSheet, pinLayout, systemSheet } from '../src/model/drawings';
import type { Wire, WireDef } from '../src/model/types';

describe('legenda simboli', () => {
  it('un simbolo per riga, disegnato, con righe alte', () => {
    const t = legendReport(exampleProject());
    expect(t.rows.length).toBeGreaterThan(5);
    expect(t.symbols).toHaveLength(t.rows.length);
    expect(new Set(t.symbols!.map(s => s!.id)).size).toBe(t.rows.length);
    expect(sheetRows(t)).toBe(12);
  });
});

describe('linea di definizione dei fili', () => {
  it('solo la sezione a tutti i fili attraversati, anche dal formato testo', () => {
    const p = emptyProject();
    const r = importPagesText(p, `pagina 1 "Prova"
filo 40,40 200,40
filo 40,48 200,48
filo 40,56 200,56
sezionefili 100,60 108,36 sezione=2,5`);
    expect(r.errors).toEqual([]);
    const pg = p.pages.find(x => x.name === '1')!;
    const wires = pg.elements.filter((e): e is Wire => e.kind === 'wire');
    expect(wires.map(w => [w.cross, w.color])).toEqual(Array(3).fill(['2,5', undefined]));
    const d = pg.elements.find((e): e is WireDef => e.kind === 'wiredef')!;
    expect(wireDefLabel(d)).toEqual(['2,5 mm²']);
    d.cross = '1,5';
    expect(applyWireDefs(pg)).toBe(3);
  });
});

describe('pagine disegnate', () => {
  it('cavo, connettore e schema d\'insieme dal progetto di esempio', () => {
    const p = exampleProject();
    const tag = p.cables![0].tag;
    const c = cableSheet(p, tag)!;
    expect(c.rows.length).toBeGreaterThan(0);
    expect(c.rows.every(r => r.a || r.b)).toBe(true);
    expect(syncDrawingPages(p, 'cable').added).toBe(p.cables!.length);
    expect(syncDrawingPages(p, 'cable')).toEqual({ added: 0, removed: 0 });
    expect(syncDrawingPages(p, 'system').added).toBe(1);
    const s = systemSheet(p);
    expect(s.nodes.length).toBeGreaterThan(0);
    // Piedinatura SUB-D 25: 13 pin sopra, 12 sotto sfalsati
    const l = pinLayout('subd', 25);
    expect(l.filter(x => x.row === 0)).toHaveLength(13);
    expect(l[13]).toMatchObject({ no: 14, row: 1, col: 1 });
    expect(connectorSheet(emptyProject(), 'X10').rows).toEqual([]);
  });
});

describe('connettori ILME, RJ45 e DB9', () => {
  it('tipo dal catalogo: pin previsti, liberi, prossimo libero, riquadro e distinta', async () => {
    const { useStore } = await import('../src/model/store');
    const { freePins, pinCount, rangeText, connectorFrames } = await import('../src/model/connectors');
    const { bomReport } = await import('../src/model/reports');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    const tag = st().addConnector('ilme-cne-06', 'MF');
    expect(tag).toBe('X10');
    expect(pinCount(st().project, tag)).toBe(7);
    st().placeConnectorPins(tag);
    expect(st().tool).toMatchObject({ kind: 'place', symbolId: 'conn_pair', tag: 'X10:1' });
    for (const x of [40, 52, 64]) { const t = st().tool; if (t.kind === 'place') st().placeSymbol(t.symbolId, { x, y: 60 }, 0, undefined, t.tag); }
    expect(rangeText(freePins(st().project, tag))).toBe('4–6, PE');
    expect(st().tool).toMatchObject({ tag: 'X10:4' });
    const pg = st().project.pages[0];
    expect(connectorFrames(st().project, pg)).toEqual([expect.objectContaining({ conn: 'X10', label: '-X10 · ILME CNE 6+PE · M/F' })]);
    const bom = bomReport(st().project).rows.map(r => r.join('|')).join('\n');
    expect(bom).toContain('CNEM 06 T');
    expect(bom).toContain('CNEF 06 T');
    // RJ45 e DB9: contatti numerati e lo schermo
    const rj = st().addConnector('rj45-sh', 'F');
    expect(freePins(st().project, rj)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'SH']);
    const db = st().addConnector('db9', 'M');
    expect(pinCount(st().project, db)).toBe(10);
    const sheet = (await import('../src/model/drawings')).connectorSheet(st().project, db);
    expect([sheet.shape, sheet.pins]).toEqual(['subd', 9]);
  });
});
