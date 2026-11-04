import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { newLayoutPage, autoLayout, placeables, railUsage, layoutProblems, wireList, ferrule, layoutToDxf, snapItem, layoutView } from '../src/model/layout';
import { wireListReport, bomReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

describe('layout del quadro', () => {
  it('misure dall\'articolo o tipiche, morsettiera larga quanto i morsetti', () => {
    const p = exampleProject();
    p.parts.push({ partNr: 'CT', width: 54, height: 85, functionTemplates: [], attrs: {} });
    for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag === '2K1') e.partNr = 'CT';
    const pl = placeables(p);
    expect(pl.find(x => x.ref === '2K1')).toMatchObject({ w: 54, h: 85 });
    expect(pl.find(x => x.ref === 'X1')).toMatchObject({ kind: 'strip', w: 20.4 });
  });
  it('la posa automatica crea guide e canaline e posa tutto', () => {
    const p = exampleProject();
    const pg = newLayoutPage(p);
    p.pages.push(pg);
    const r = autoLayout(p, pg.layout!);
    expect(r.missing).toEqual([]);
    expect(r.placed).toBe(placeables(p).length);
    expect(pg.layout!.items.filter(i => i.kind === 'rail').length).toBe(6);
    expect(railUsage(pg.layout!).every(u => u.free >= 0)).toBe(true);
    expect(layoutProblems(p)).toEqual([]);
    expect(checkProject(p).filter(i => i.kind === 'Layout')).toEqual([]);
    // Lunghezze stimate tra apparecchi posati: percorso a L + 2 × 150 mm di riserva
    const w = wireList(p).find(x => x.conn.from === '-X1:1' || x.conn.to === '-X1:1');
    expect(w?.length).toBeGreaterThan(300);
    expect(wireListReport(p).rows.some(r => r[8] !== '')).toBe(true);
    // La pagina di layout ha una scala normalizzata
    expect(layoutView(pg.layout!).n).toBe(5);
  });
  it('aggancio alla guida, sovrapposizioni e guida piena', () => {
    const p = exampleProject();
    const pg = newLayoutPage(p, { w: 300, h: 200 });
    p.pages.push(pg);
    const l = pg.layout!;
    l.items.push({ id: 'r', kind: 'rail', x: 20, y: 80, w: 100, h: 35 });
    const s = snapItem(l, { id: 'd', kind: 'device', ref: '2K1', x: 30.4, y: 70.2, w: 45, h: 80 });
    expect(s.y).toBe(57.5); // centrato sulla guida (80 + 17,5 − 40)
    l.items.push(s, { id: 'e', kind: 'device', ref: '1Q1', x: 60, y: 57.5, w: 45, h: 90 }, { id: 'f', kind: 'device', ref: '1F1', x: 280, y: 0, w: 45, h: 90 });
    const msgs = layoutProblems(p).map(x => x.msg);
    expect(msgs.some(m => m.includes('-2K1 e -1Q1 si sovrappongono'))).toBe(true);
    expect(msgs.some(m => m.includes('-1F1 esce dalla piastra'))).toBe(true);
  });
  it('distinta di guide e canaline in metri, puntali, DXF con fori', () => {
    const p = exampleProject();
    const pg = newLayoutPage(p, { w: 600, h: 400 });
    p.pages.push(pg);
    p.parts.push({ partNr: 'TS35', functionTemplates: [], attrs: {} });
    pg.layout!.items.push({ id: 'r1', kind: 'rail', x: 50, y: 100, w: 500, h: 35, partNr: 'TS35' }, { id: 'r2', kind: 'rail', x: 50, y: 250, w: 250, h: 35, partNr: 'TS35' });
    expect(bomReport(p).rows.find(r => r[2] === 'TS35')?.[1]).toBe('0,75');
    expect(ferrule('1,5')).toBe('H1,5/8');
    expect(ferrule('6')).toBe('H6/12');
    const dxf = layoutToDxf(pg);
    expect(dxf).toContain('PIASTRA');
    expect(dxf.split('CIRCLE').length - 1).toBe(6 + 4);
  });
});
