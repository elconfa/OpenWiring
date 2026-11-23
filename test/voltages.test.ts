// Tabella «Tensioni utilizzate nello schema elettrico»: righe dai potenziali o del progetto, blocco sulla pagina
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { autoVoltageRows, potentialFamily, blockBox, voltageRows, voltageTableDrawing, VOLTAGE_TABLE } from '../src/model/voltages';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import type { BlockItem } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  st().loadProject(emptyProject());
  const pot = (sym: string, x: number, tag: string) => { const e = st().placeSymbol(sym, { x, y: 40 }, 0)!; st().updateElement(e.id, { tag }); return e; };
  pot('potential', 60, 'L+');
  pot('potential', 120, 'M');
  pot('pe', 180, 'PE');
  pot('potential', 240, 'L+');
  return st;
}

describe('tabella delle tensioni', () => {
  it('senza righe scritte: i potenziali dello schema, una volta per nome, con tensione e descrizione suggerite', async () => {
    const st = await store();
    const rows = autoVoltageRows(st().project);
    expect(rows.map(r => r.name)).toEqual(['L+', 'M', 'PE']);
    expect(rows[0]).toMatchObject({ voltage: '24V DC', description: 'DC, positivo' });
    expect(rows[1]).toMatchObject({ voltage: '24V DC', description: 'DC, conduttore mediano (0 V)' });
    expect(rows[2]).toMatchObject({ voltage: 'PE', description: 'Conduttore di protezione' });
    expect(voltageRows(st().project)).toEqual(rows);
  });

  it('rimandi con nome da potenziale raggruppati per famiglia, i numeri filo no', async () => {
    expect(['L1-1.2', 'L3-2.1', 'N1-1.1', '24V3-1.1', '0V-2', 'PE', '+24V'].map(potentialFamily)).toEqual(['L', 'L', 'N', '24V', '0V', 'PE', '+24V']);
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    for (const [i, tag] of ['L1-1.1', 'L2-1.1', 'N1-1.1', '1010.03', '24V1-1.1', '24V2-2.1'].entries()) {
      const e = st().placeSymbol('link', { x: 40 + i * 30, y: 40 }, 0)!; st().updateElement(e.id, { tag });
    }
    expect(autoVoltageRows(st().project).map(r => [r.name, r.voltage])).toEqual([['L', '400V AC'], ['N', '230V AC'], ['24V', '24V DC']]);
  });

  it('colore e linea del campione dai fili del potenziale', async () => {
    const st = await store();
    const lp = st().project.pages[0].elements.find(e => e.kind === 'symbol' && e.tag === 'L+')!;
    const w = st().addWire([{ x: (lp as any).x, y: 40 }, { x: (lp as any).x, y: 80 }]);
    st().updateElement(w.id, { color: 'RD', lineType: 'dash' } as never);
    expect(autoVoltageRows(st().project)[0]).toMatchObject({ name: 'L+', color: 'RD', line: 'dash' });
  });

  it('righe del progetto, blocco posato e disegnato con una riga per tensione', async () => {
    const st = await store();
    st().setVoltages([{ name: 'L+', voltage: '24V DC', description: 'DC, positivo', color: 'RD' }, { name: 'CH1', voltage: '24V DC', description: 'Canale di sicurezza 1' }]);
    st().insertBlock('voltages');
    const b = st().project.pages[0].elements.find(e => e.kind === 'block') as BlockItem;
    expect(st().selection).toEqual([b.id]);
    const box = blockBox(st().project, b);
    const V = VOLTAGE_TABLE;
    expect(box.y1 - box.y0).toBeCloseTo(V.titleH + V.headH + 2 * V.rowH);
    const d = voltageTableDrawing(st().project, b);
    expect(d.samples.map(s => s.color)).toEqual(['RD', undefined]);
    expect(d.texts.map(t => t.s)).toEqual(expect.arrayContaining(['Tensioni utilizzate nello schema elettrico', 'Grafica', 'Tensione', 'Descrizione', '24V DC (L+)', 'CH1   Canale di sicurezza 1']));
    // Ricomincia dallo schema
    st().setVoltages(undefined);
    expect(voltageRows(st().project).map(r => r.name)).toEqual(['L+', 'M', 'PE']);
  });

  it('formato testo: blocco tensioni @x,y', async () => {
    const st = await store();
    st().insertBlock('voltages');
    const text = pagesToText(st().project);
    expect(text).toMatch(/blocco tensioni @\d/);
    const q = structuredClone(st().project);
    q.pages[0].elements = [];
    const r = importPagesText(q, text);
    expect(r.errors).toEqual([]);
    expect(q.pages[0].elements.filter(e => e.kind === 'block').length).toBe(1);
  });
});
