// Vista Connettori: pin incollati spostati in un connettore nuovo, rinomina e rinumera
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { allConnectors, connectorRows } from '../src/model/connectors';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  return st;
}
const tags = (st: Awaited<ReturnType<typeof store>>) => connectorRows(st().project).map(r => `${r.conn}:${r.no}`);

describe('connettori', () => {
  it('copia e incolla: i pin incollati vanno in un connettore nuovo, numerati da 1', async () => {
    const st = await store();
    const ids = [1, 2, 3, 4].map(n => { const q = st().placeSymbol('conn_male', { x: 20 + n * 12, y: 40 }, 0)!; st().updateElement(q.id, { tag: `X10:${n}` }); return q.id; });
    st().updateConnector('X10', { description: 'Motore', pins: 4 });
    st().setSelection(ids);
    st().copySelection();
    st().paste({ x: 40, y: 120 });
    expect(tags(st)).toEqual(['X10:1', 'X10:2', 'X10:3', 'X10:4', 'X10:5', 'X10:6', 'X10:7', 'X10:8']);
    st().renamePins({ 'X10:5': 'X11:1', 'X10:6': 'X11:2', 'X10:7': 'X11:3', 'X10:8': 'X11:4' });
    expect(allConnectors(st().project)).toEqual(['X10', 'X11']);
    expect(tags(st).filter(t => t.startsWith('X11'))).toEqual(['X11:1', 'X11:2', 'X11:3', 'X11:4']);
    // Il connettore nuovo prende i dati di quello copiato, da modificare
    expect(st().project.connectors?.X11).toEqual({ description: 'Motore', pins: 4 });
    // Rinomina di tutto il connettore: i dati restano solo con il nome nuovo
    st().renamePins({ 'X11:1': 'X12:1', 'X11:2': 'X12:2', 'X11:3': 'X12:3', 'X11:4': 'X12:4' });
    expect(Object.keys(st().project.connectors ?? {}).sort()).toEqual(['X10', 'X12']);
    // Scambio di due numeri in un passo
    st().renamePins({ 'X12:1': 'X12:2', 'X12:2': 'X12:1' });
    expect(tags(st).filter(t => t.startsWith('X12'))).toEqual(['X12:1', 'X12:2', 'X12:3', 'X12:4']);
  });
});
