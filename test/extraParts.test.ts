// Più articoli per un componente: in distinta e nella lista d'acquisto con la sigla del dispositivo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { bomReport, purchaseReport } from '../src/model/reports';
import type { Part } from '../src/model/types';

const part = (partNr: string, descr1: string, manufacturer = 'ABB'): Part => ({ partNr, descr1, manufacturer, orderNr: partNr.split('.')[1], functionTemplates: [], attrs: {} });

describe('articoli aggiuntivi', () => {
  it('sezionatore con barra di prolunga e manopola', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    useStore.setState({ library: [part('ABB.OT63', 'Sezionatore 63 A'), part('ABB.OXP6X', 'Barra di prolunga'), part('ABB.OHB45', 'Manopola')] });
    const q = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().assignPart([q.id], 'ABB.OT63');
    st().setExtraParts(q.id, [{ partNr: 'ABB.OXP6X' }, { partNr: 'ABB.OHB45', qty: 2 }]);
    const p = st().project;
    // Copiati nel progetto, così il file resta completo
    expect(p.parts.map(x => x.partNr).sort()).toEqual(['ABB.OHB45', 'ABB.OT63', 'ABB.OXP6X']);
    const bom = bomReport(p);
    const row = (nr: string) => bom.rows.find(r => r[2] === nr)!;
    expect(row('ABB.OT63')[1]).toBe('1');
    expect(row('ABB.OXP6X')[1]).toBe('1');
    expect(row('ABB.OHB45')[1]).toBe('2');
    expect(row('ABB.OHB45')[7]).toBe(row('ABB.OT63')[7]);
    expect(purchaseReport(p).rows.filter(r => r[2] === 'ABB').length).toBe(3);
    // Tolti tutti: il dispositivo torna senza articoli aggiuntivi
    st().setExtraParts(q.id, []);
    expect(bomReport(st().project).rows.length).toBe(1);
  });

  it('codice scritto a mano, che non è in libreria', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    useStore.setState({ library: [part('ABB.OT63', 'Sezionatore 63 A')] });
    const q = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().assignPart([q.id], 'ABB.OT63');
    st().setExtraParts(q.id, [{ partNr: ' 1SCA108 ', descr: 'Manopola rossa', manufacturer: 'ABB', qty: 2 }]);
    const row = bomReport(st().project).rows.find(r => r[2] === '1SCA108')!;
    expect(row[1]).toBe('2');
    expect(row.join('|')).toContain('Manopola rossa');
    expect(purchaseReport(st().project).rows.filter(r => r[2] === 'ABB').length).toBe(2);
  });
});
