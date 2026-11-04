// Editor dei componenti: «Salva» aggiorna lo schema, «Salva come…» solo la libreria; testi del componente
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { derive } from '../src/model/derive';
import { blackBoxFromPart } from '../src/model/symbols';
import { getSymbol, uid } from '../src/model/geometry';
import { pageToDxf } from '../src/io/dxf';
import type { Part, SymbolDef, SymbolInstance } from '../src/model/types';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const symbolIds = (p: { pages: { elements: { kind: string }[] }[] }) =>
  p.pages.flatMap(pg => pg.elements.filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => e.symbolId));

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  st().loadProject(exampleProject());
  return st;
}

describe('salvataggio del componente', () => {
  it('«Salva» su un simbolo di base: la copia personale sostituisce il simbolo in tutto lo schema', async () => {
    const st = await store();
    const before = symbolIds(st().project).filter(id => id === 'lamp').length;
    expect(before).toBeGreaterThan(0);
    const lamp = structuredClone(getSymbol('lamp')!);
    lamp.prims.push({ t: 'ellipse', cx: 0, cy: 8, rx: 3, ry: 1.5 });
    const s = st().saveSymbol(lamp);
    expect(s.id).not.toBe('lamp');
    expect(s.name).toBe(lamp.name);
    const ids = symbolIds(st().project);
    expect(ids.filter(id => id === 'lamp').length).toBe(0);
    expect(ids.filter(id => id === s.id).length).toBe(before);
    expect(getSymbol(s.id, st().project)?.prims.some(p => p.t === 'ellipse')).toBe(true);
    expect(st().symbolLibrary.some(x => x.id === s.id)).toBe(true);
    // Si annulla con un solo ⌘Z
    st().undo();
    expect(symbolIds(st().project).filter(id => id === 'lamp').length).toBe(before);
  });

  it('«Salva» su un simbolo personale aggiorna i componenti che lo usano', async () => {
    const st = await store();
    const mine: SymbolDef = { id: 'user:prova', name: 'Prova', category: 'Simboli personali', letter: 'A', role: 'single', prims: [], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1' }] };
    st().saveSymbol(mine);
    st().commit(p => { p.customSymbols.push(structuredClone(mine)); p.pages[0].elements.push(S('user:prova', 300, 100, '1A9')); });
    st().saveSymbol({ ...mine, prims: [{ t: 'rect', x: -2, y: 0, w: 4, h: 4 }] });
    expect(getSymbol('user:prova', st().project)?.prims.length).toBe(1);
  });

  it('«Salva come…» crea un simbolo nuovo solo nella libreria: lo schema non cambia', async () => {
    const st = await store();
    const before = JSON.stringify(st().project);
    const s = st().saveSymbolAs(structuredClone(getSymbol('lamp')!), 'Lampada grande');
    expect(s.id).not.toBe('lamp');
    expect(s.name).toBe('Lampada grande');
    expect(st().symbolLibrary.some(x => x.id === s.id && x.name === 'Lampada grande')).toBe(true);
    expect(JSON.stringify(st().project)).toBe(before);
    // L'editor continua sul simbolo nuovo
    expect(st().editSymbol?.id).toBe(s.id);
  });

  it('la scatola nera di un articolo EPLAN modificata resta il simbolo dell\'articolo', async () => {
    const st = await store();
    const part: Part = { partNr: 'EDZ.CT9', manufacturer: 'Prova', functionTemplates: [
      { pos: 1, description: 'Bobina', connections: ['A1', 'A2'] }, { pos: 2, description: 'NA', connections: ['13', '14'] }], attrs: {} };
    const bb = blackBoxFromPart(part);
    st().commit(p => { p.parts.push(part); p.customSymbols.push(bb); p.pages[0].elements.push(S(bb.id, 300, 100, '1K9', { partNr: part.partNr })); });
    st().saveSymbol({ ...bb, prims: [...bb.prims, { t: 'circle', cx: 0, cy: 0, r: 1 }] });
    expect(st().project.parts.find(x => x.partNr === 'EDZ.CT9')?.symbolId).toBe(bb.id);
    expect(getSymbol(bb.id, st().project)?.prims.length).toBe(bb.prims.length + 1);
  });
});

describe('testi del componente', () => {
  it('mostrano i dati del dispositivo e non si ripetono sotto la sigla', async () => {
    const st = await store();
    const coil = structuredClone(getSymbol('coil')!);
    coil.fields = [{ f: 'description', x: 6, y: 4 }, { f: 'manufacturer', x: 6, y: 7 }, { f: 'loc', x: 6, y: 10 }];
    const s = st().saveSymbol(coil);
    const p = st().project;
    const inst = p.pages.flatMap(pg => pg.elements).find((e): e is SymbolInstance => e.kind === 'symbol' && e.symbolId === s.id && !!e.description)!;
    expect(inst).toBeTruthy();
    const pg = p.pages.find(x => x.elements.includes(inst))!;
    const d = derive(p, st().library).pages.get(pg.id)!;
    const v = d.deviceFields.get(inst.id)!;
    expect(v.description).toBe(inst.description);
    // Nessuna descrizione sotto la sigla: è già nel testo del componente
    expect((d.deviceLines.get(inst.id) ?? []).join(' ')).not.toContain(inst.description!);
    // Anche il DXF porta i testi del componente
    expect(pageToDxf(p, pg)).toContain(inst.description!);
  });
});

describe('componenti preferiti', () => {
  it('la stella aggiunge e toglie; il simbolo di base salvato resta preferito con il nuovo id', async () => {
    const st = await store();
    st().toggleFavorite('lamp');
    st().toggleFavorite('coil');
    expect(st().favorites).toEqual(expect.arrayContaining(['lamp', 'coil']));
    st().toggleFavorite('coil');
    expect(st().favorites).not.toContain('coil');
    const s = st().saveSymbol(structuredClone(getSymbol('lamp')!));
    expect(st().favorites).toContain(s.id);
    expect(st().favorites).not.toContain('lamp');
  });
});

describe('simbolo di base modificato nella libreria', () => {
  it('la copia salvata prende il posto del simbolo di base; si può tornare all\'originale', async () => {
    const st = await store();
    const a = st().saveSymbol({ ...structuredClone(getSymbol('pb_no')!), description: 'prima' });
    expect(a.replaces).toBe('pb_no');
    // Il simbolo di base modificato di nuovo: una sola copia nella libreria, l'ultima
    const b = st().saveSymbol({ ...structuredClone(getSymbol('pb_no')!), description: 'seconda' });
    const copies = st().symbolLibrary.filter(x => x.replaces === 'pb_no');
    expect(copies.map(x => x.id)).toEqual([b.id]);
    // Riaprendo la copia dalla libreria e salvando, resta la stessa
    const c = st().saveSymbol({ ...structuredClone(copies[0]), description: 'terza' });
    expect(c.id).toBe(b.id);
    expect(st().symbolLibrary.find(x => x.id === b.id)?.description).toBe('terza');
    // «Salva come…» non sostituisce il simbolo di base
    expect(st().saveSymbolAs(structuredClone(c), 'Altro pulsante').replaces).toBeUndefined();
    st().restoreBuiltin(b.id);
    expect(st().symbolLibrary.some(x => x.replaces === 'pb_no')).toBe(false);
  });
});
