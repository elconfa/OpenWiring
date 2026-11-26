// Tabelle materiali dei componenti sullo schema: scelte per componente, in colonna, spostate, agganciate
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import { layoutPartTables, partTableDropTarget, partTables } from '../src/model/partTables';
import { FRAME } from '../src/model/types';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { bomReport } from '../src/model/reports';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.parts = [
    { partNr: 'SIE.3RT2015', manufacturer: 'Siemens', orderNr: '3RT2015-1BB41', functionTemplates: [], attrs: {} },
    { partNr: 'SIE.3RH', manufacturer: 'Siemens', orderNr: '3RH2911-1HA11', functionTemplates: [], attrs: {} },
    { partNr: 'FIN.40', manufacturer: 'Finder', orderNr: '40.52.9.024', functionTemplates: [], attrs: {} },
  ];
  st().loadProject(p);
  const put = (sym: string, x: number, tag: string) => { const e = st().placeSymbol(sym, { x, y: 80 }, 0)!; st().updateElement(e.id, { tag }); return e.id; };
  const k1id = put('coil', 60, 'K1'), k2id = put('coil', 100, 'K2');
  put('no', 140, 'K1');
  const els = () => st().project.pages[0].elements.filter(e => e.kind === 'symbol') as any[];
  const k1 = els().find(e => e.id === k1id), k2 = els().find(e => e.id === k2id);
  st().updateDevice(k1.id, { partNr: 'SIE.3RT2015', loc: 'QA', extraParts: [{ partNr: 'SIE.3RH', qty: 2 }] });
  st().updateDevice(k2.id, { partNr: 'FIN.40' });
  return { st, k1: k1.id as string, k2: k2.id as string, els };
}

describe('tabelle materiali', () => {
  it('solo sui componenti scelti, con luogo, sigla e articoli', async () => {
    const { st, k1, k2 } = await store();
    expect(partTables(st().project).size).toBe(0);
    st().setPartTable(k1, true);
    const pg = st().project.pages[0];
    const list = partTables(st().project).get(pg.id)!;
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ instId: k1, head: ['Luogo: +QA   Sigla: K1'] });
    expect(list[0].rows.map(r => ({ qty: r.qty, manufacturer: r.manufacturer, code: r.code }))).toEqual([
      { qty: '1', manufacturer: 'Siemens', code: '3RT2015-1BB41' },
      { qty: '2', manufacturer: 'Siemens', code: '3RH2911-1HA11' },
    ]);
    // Anche dal contatto: la scelta è del dispositivo
    st().setPartTable(k2, true);
    expect(derive(st().project).pages.get(pg.id)!.partTables!.map(t => t.instId).sort()).toEqual([k1, k2].sort());
    st().setPartTable(k1, false);
    expect(partTables(st().project).get(pg.id)!.map(t => t.instId)).toEqual([k2]);
  });

  it('più simboli insieme: una tabella per dispositivo, un solo passo da annullare', async () => {
    const { st, k1, k2, els } = await store();
    const k1no = els().find((e: any) => e.symbolId === 'no').id;
    const pg = () => st().project.pages[0];
    const n = st().past.length;
    // Bobina e contatto di K1 scelti insieme a K2: due tabelle, agganciate in colonna
    st().setPartTables([k1, k1no, k2], true);
    expect(partTables(st().project).get(pg().id)!.map(t => t.instId).sort()).toEqual([k1, k2].sort());
    expect(st().past.length).toBe(n + 1);
    st().setPartTables([k1no, k2], false);
    expect(partTables(st().project).get(pg().id) ?? []).toEqual([]);
    st().undo();
    expect(partTables(st().project).get(pg().id)!.length).toBe(2);
    st().undo();
    expect(partTables(st().project).get(pg().id) ?? []).toEqual([]);
  });

  it('in colonna sul margine destro, trascinata resta legata al simbolo, agganciata segue la madre', async () => {
    const { st, k1, k2 } = await store();
    st().setPartTable(k1, true); st().setPartTable(k2, true);
    const pg = () => st().project.pages[0];
    const tables = () => partTables(st().project).get(pg().id)!;
    let pos = layoutPartTables(tables(), pg().elements);
    const [a, b] = tables();
    // In colonna: allineate a destra; la seconda creata si aggancia sotto la prima
    expect(pos.get(a.instId)!.x + a.w).toBeCloseTo(FRAME.right - 4);
    expect(pos.get(b.instId)!.y).toBeCloseTo(pos.get(a.instId)!.y + a.h + 1);
    expect((pg().elements.find(e => e.id === k2) as any).partsLink).toBe(k1);
    // K2 trascinata: rispetto al simbolo
    st().setPartTablePlace(k2, { x: 10, y: -30 }, undefined);
    pos = layoutPartTables(tables(), pg().elements);
    expect(pos.get(k2)).toEqual({ x: 110, y: 50 });
    // Lasciata sotto K2: K1 le si aggancia e la segue
    const k2t = tables().find(t => t.instId === k2)!;
    const target = partTableDropTarget(tables(), pos, k1, { x: 111, y: 50 + k2t.h + 2 }, pg().elements);
    expect(target).toBe(k2);
    st().setPartTablePlace(k1, undefined, target);
    st().setPartTablePlace(k2, { x: 20, y: -40 }, undefined);
    pos = layoutPartTables(tables(), pg().elements);
    expect(pos.get(k1)).toEqual({ x: 120, y: 40 + k2t.h + 1 });
    // Non si aggancia a una delle proprie agganciate
    expect(partTableDropTarget(tables(), pos, k2, { x: 120, y: 40 + k2t.h + 1 + tables().find(t => t.instId === k1)!.h + 1 }, pg().elements)).toBeUndefined();
  });

  it('create una dopo l\'altra si agganciano in catena (un passo da annullare); togliendone una la catena resta unita', async () => {
    const { st, k1, k2 } = await store();
    const k3 = st().placeSymbol('coil', { x: 180, y: 80 }, 0)!.id;
    st().updateElement(k3, { tag: 'K3' });
    st().updateDevice(k3, { partNr: 'FIN.40' });
    const link = (id: string) => (st().project.pages[0].elements.find(e => e.id === id) as any).partsLink;
    st().setPartTable(k1, true);
    expect(link(k1)).toBeUndefined();
    st().setPartTable(k2, true); st().setPartTable(k3, true);
    expect([link(k2), link(k3)]).toEqual([k1, k2]);
    // Un solo passo da annullare: tolto l'aggancio si toglie anche la tabella
    st().undo();
    expect(st().project.pages[0].elements.some(e => e.id === k3 && (e as any).show?.parts)).toBe(false);
    st().redo();
    // Tolta quella in mezzo: K3 passa sotto K1
    st().setPartTable(k2, false);
    expect(link(k3)).toBe(k1);
    // Catena trascinata altrove: la nuova parte da sola in colonna; in colonna con un'altra le si aggancia
    st().setPartTablePlace(k1, { x: 0, y: -40 }, undefined);
    st().setPartTable(k2, true);
    expect(link(k2)).toBeUndefined();
    st().setPartTable(k3, false); st().setPartTable(k3, true);
    expect(link(k3)).toBe(k2);
  });

  it('colonne fisse uguali in tutta la pagina: del progetto, cambiate per una pagina; testi lunghi a capo', async () => {
    const { st, k1, k2 } = await store();
    st().setPartTable(k1, true); st().setPartTable(k2, true);
    const pg = () => st().project.pages[0];
    let list = partTables(st().project).get(pg().id)!;
    expect(new Set(list.map(t => t.w))).toEqual(new Set([6 + 26 + 32]));
    expect(list.every(t => t.cols.join() === '6,26,32')).toBe(true);
    st().updateSettings({ partTableCols: { qty: 5, maker: 12, code: 20 } });
    list = partTables(st().project).get(pg().id)!;
    expect(list[0].cols).toEqual([5, 12, 20]);
    // «Siemens» sta in 12 mm, il codice lungo no
    expect(list.find(t => t.instId === k1)!.rows[0].lines).toEqual({ qty: ['1'], manufacturer: ['Siemens'], code: ['3RT2015-1BB41'] });
    st().updatePage(pg().id, { partTableCols: { qty: 5, maker: 6, code: 12 } });
    list = partTables(st().project).get(pg().id)!;
    expect(list[0].w).toBe(23);
    // Testi più larghi della colonna: a capo (il codice dopo il trattino), la riga diventa più alta
    const r0 = list.find(t => t.instId === k1)!.rows[0];
    expect(r0.lines.code).toEqual(['3RT2015-', '1BB41']);
    expect(r0.lines.manufacturer).toEqual(['Sie', 'men', 's']);
    expect(r0.code).toBe('3RT2015-1BB41');
    expect(r0.h).toBeCloseTo(4 + 2 * 2.7);
  });

  it('articolo con set e codice proprio: c\'è anche lui oltre ai componenti (fotocellula + catarifrangente)', async () => {
    const { st, k2 } = await store();
    st().commit(p => { p.parts.push(
      { partNr: 'E3Z', manufacturer: 'OMRON', orderNr: ' E3Z-R86', functionTemplates: [], attrs: {}, kit: [{ partNr: 'E39' }] },
      { partNr: 'E39', manufacturer: 'OMRON', orderNr: 'E39-R1S', functionTemplates: [], attrs: {} }); });
    st().updateDevice(k2, { partNr: 'E3Z' });
    st().setPartTable(k2, true);
    const t = partTables(st().project).get(st().project.pages[0].id)!.find(x => x.instId === k2)!;
    expect(t.rows.map(r => r.code)).toEqual(['E3Z-R86', 'E39-R1S']);
    const bom = bomReport(st().project).rows.map(r => r[6]);
    expect(bom).toEqual(expect.arrayContaining([' E3Z-R86', 'E39-R1S']));
  });

  it('un giro di agganci non fa sparire le tabelle', async () => {
    const { st, k1, k2 } = await store();
    st().setPartTable(k1, true); st().setPartTable(k2, true);
    st().setPartTablePlace(k1, undefined, k2);
    st().setPartTablePlace(k2, undefined, k1);
    const pg = st().project.pages[0];
    expect(layoutPartTables(partTables(st().project).get(pg.id), pg.elements).size).toBe(2);
  });

  it('formato testo: tabellasotto= con la sigla della madre', async () => {
    const { st, k1, k2 } = await store();
    st().setPartTable(k1, true); st().setPartTable(k2, true);
    st().setPartTablePlace(k1, undefined, k2);
    const text = pagesToText(st().project);
    expect(text).toContain('tabellasotto=-K2');
    const q = structuredClone(st().project);
    q.pages[0].elements = [];
    const r = importPagesText(q, text);
    expect(r.errors).toEqual([]);
    const els = q.pages[0].elements.filter(e => e.kind === 'symbol') as any[];
    const back1 = els.find(e => e.tag === 'K1' && e.symbolId === 'coil');
    expect(back1.partsLink).toBe(els.find(e => e.tag === 'K2').id);
  });
});
