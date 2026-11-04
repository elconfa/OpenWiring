// Fili sui punti di connessione allineati: filo che si spezza, collegamento rapido, collegamento
// automatico come in EPLAN; allineamento degli elementi selezionati
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { alignDeltas } from '../src/model/align';
import type { Wire } from '../src/model/types';

async function store(autoConnect = true) {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = autoConnect;
  st().loadProject(p);
  return st;
}
const wires = (st: Awaited<ReturnType<typeof store>>) => st().project.pages[0].elements.filter((e): e is Wire => e.kind === 'wire').map(w => w.points.map(q => [q.x, q.y]));

describe('filo attraverso i punti di connessione', () => {
  it('si spezza su ogni punto e salta l\'interno dei simboli', async () => {
    const st = await store(false);
    // Due contatti in colonna: 13 a y 40, 14 a y 56; 13 a y 80, 14 a y 96
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('no', { x: 40, y: 80 }, 0);
    st().addWire([{ x: 40, y: 20 }, { x: 40, y: 120 }]);
    expect(wires(st)).toEqual([[[40, 20], [40, 40]], [[40, 56], [40, 80]], [[40, 96], [40, 120]]]);
  });
  it('i poli affiancati di un simbolo restano uniti dal filo (ponticello)', async () => {
    const st = await store(false);
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('no', { x: 48, y: 40 }, 0);
    st().addWire([{ x: 32, y: 40 }, { x: 56, y: 40 }]);
    // Pin di simboli diversi in riga, rivolti in alto: il filo si spezza ma resta tutto
    expect(wires(st)).toEqual([[[32, 40], [40, 40]], [[40, 40], [48, 40]], [[48, 40], [56, 40]]]);
  });
});

describe('collegamento rapido', () => {
  it('V: clic tra due punti uno sopra l\'altro li collega; con un solo punto parte dal clic', async () => {
    const st = await store(false);
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('no', { x: 40, y: 80 }, 0);
    expect(st().quickWire({ x: 41, y: 68 }, 'v')).toBe(true);
    expect(wires(st)).toEqual([[[40, 56], [40, 80]]]);
    // Già collegati: niente filo doppio
    expect(st().quickWire({ x: 40, y: 70 }, 'v')).toBe(false);
    expect(st().quickWire({ x: 39, y: 22 }, 'v')).toBe(true);
    // Il clic va sulla griglia di 4 mm
    expect(wires(st)[1]).toEqual([[40, 24], [40, 40]]);
    // Lontano dai punti: niente
    expect(st().quickWire({ x: 100, y: 22 }, 'v')).toBe(false);
  });
  it('H: a sinistra e a destra', async () => {
    const st = await store(false);
    st().placeSymbol('no', { x: 40, y: 40 }, 90);
    st().placeSymbol('no', { x: 80, y: 40 }, 90);
    // Ruotati di 90°: 13 a x 40 (rivolto a destra?) e 14 a x 24
    expect(st().quickWire({ x: 60, y: 41 }, 'h')).toBe(true);
    expect(wires(st)).toEqual([[[40, 40], [64, 40]]]);
  });
});

describe('collegamento automatico', () => {
  it('due contatti uno sotto l\'altro si collegano da soli', async () => {
    const st = await store();
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('nc', { x: 40, y: 80 }, 0);
    expect(wires(st)).toEqual([[[40, 80], [40, 56]]]);
    // Spostando il secondo il filo lo segue e non si raddoppia
    st().setSelection([st().project.pages[0].elements[1].id]);
    st().moveSelection(0, 8);
    expect(wires(st).length).toBe(1);
  });
  it('non collega punti rivolti dalla stessa parte, né attraverso un simbolo', async () => {
    const st = await store();
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('no', { x: 48, y: 40 }, 0);
    expect(wires(st)).toEqual([]);
    st().placeSymbol('coil', { x: 120, y: 40 }, 0);
    // Una bobina orizzontale in mezzo (ruotata) blocca il collegamento
    st().placeSymbol('coil', { x: 128, y: 70 }, 90);
    st().placeSymbol('no', { x: 120, y: 100 }, 0);
    expect(wires(st).some(w => w[0][0] === 120)).toBe(false);
  });
  it('rimando di arrivo e di partenza sulla stessa linea', async () => {
    const st = await store();
    st().placeSymbol('link_in', { x: 60, y: 20 }, 180);
    st().placeSymbol('link', { x: 60, y: 100 }, 0);
    expect(wires(st)).toEqual([[[60, 100], [60, 20]]]);
  });
  it('spento nelle impostazioni del progetto', async () => {
    const st = await store(false);
    st().placeSymbol('no', { x: 40, y: 40 }, 0);
    st().placeSymbol('nc', { x: 40, y: 80 }, 0);
    expect(wires(st)).toEqual([]);
  });
});

describe('allineamento', () => {
  const b = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number) => ({ x0, y0, x1, y1, ref: { x: rx, y: ry } });
  it('bordi sull\'elemento più esterno, centri sul primo selezionato', () => {
    const boxes = [b(10, 10, 20, 20, 15, 10), b(30, 5, 50, 25, 40, 5)];
    expect(alignDeltas(boxes, 'left')).toEqual([{ x: 0, y: 0 }, { x: -20, y: 0 }]);
    expect(alignDeltas(boxes, 'bottom')).toEqual([{ x: 0, y: 5 }, { x: 0, y: 0 }]);
    expect(alignDeltas(boxes, 'column')).toEqual([{ x: 0, y: 0 }, { x: -25, y: 0 }]);
    expect(alignDeltas(boxes, 'row')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 5 }]);
  });
  it('sullo schema i simboli restano sulla griglia e i fili seguono', async () => {
    const st = await store(false);
    const a = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    const c = st().placeSymbol('no', { x: 80, y: 60 }, 0)!;
    st().setSelection([a.id, c.id]);
    st().alignSelection('column');
    const els = st().project.pages[0].elements;
    expect(els.map(e => (e.kind === 'symbol' ? e.x : 0))).toEqual([40, 40]);
  });
});
