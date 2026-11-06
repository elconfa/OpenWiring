import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { checkProject } from '../src/model/checks';
import { bomReport } from '../src/model/reports';
import { getSymbol } from '../src/model/geometry';

describe('scheda PLC con il dispositivo nello schema', () => {
  // La CPU -3A1 dell'esempio: un elemento non PLC con l'articolo, e nella scheda un articolo vecchio nascosto
  const make = () => {
    const p = exampleProject();
    const card = p.plc.cards[0];
    const el = p.pages.flatMap(pg => pg.elements).find(e => e.kind === 'symbol' && e.tag === card.tag && getSymbol(e.symbolId, p)?.role !== 'plc');
    if (!el || el.kind !== 'symbol') throw new Error('nessun dispositivo -' + card.tag + ' nello schema');
    el.partNr = 'CPU-NUOVA';
    card.partNr = 'CPU-VECCHIA';
    return { p, card };
  };
  it('non segnala l\'articolo nascosto della scheda come mancante, come la distinta', () => {
    const { p } = make();
    const issues = checkProject(p);
    expect(issues.some(i => i.msg.includes('CPU-VECCHIA') && i.level === 'warn')).toBe(false);
    expect(bomReport(p).rows.some(r => r.includes('CPU-VECCHIA'))).toBe(false);
  });
  it('avvisa dei dati nascosti diversi e propone di toglierli', () => {
    const { p, card } = make();
    const i = checkProject(p).find(x => x.fix?.kind === 'clearCardOrder');
    expect(i?.msg).toContain('CPU-VECCHIA');
    expect(i?.msg).toContain('CPU-NUOVA');
    delete card.partNr;
    expect(checkProject(p).some(x => x.fix?.kind === 'clearCardOrder')).toBe(false);
  });
  it('senza dispositivo nello schema l\'articolo della scheda resta controllato', () => {
    const p = exampleProject();
    p.plc.cards[0].tag = 'ZZ9';
    p.plc.cards[0].partNr = 'SOLO-SCHEDA';
    expect(checkProject(p).some(i => i.msg.includes('SOLO-SCHEDA'))).toBe(true);
  });
});
