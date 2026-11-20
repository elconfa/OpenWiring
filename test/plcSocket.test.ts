// Prese M12 a 2 canali (es. ET 200eco PN): canale A sul pin 4 e B sul pin 2, ognuno DI, DO o non usato
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { ioAssignments } from '../src/model/plc';
import { socketConfig, socketMembers, socketName } from '../src/model/plcSocket';
import { checkProject } from '../src/model/checks';
import { copyElements, pasteElements } from '../src/model/clipboard';
import { getSymbol, pinsWorld } from '../src/model/geometry';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [{ id: 'c1', tag: '700A4', typeId: 'custom', station: 'PLC1', start: { DI: 0, DO: 0 }, custom: { name: '16 DIQ', channels: { DI: 16, DO: 16 } } }];
  st().loadProject(p);
  return st;
}

describe('prese M12 a 2 canali', () => {
  it('nome delle prese', () => {
    expect([0, 1, 7].map(s => socketName('X10', s))).toEqual(['X10', 'X11', 'X17']);
    expect(socketName('P', 0)).toBe('P1');
  });
  it('inserito: 4 prese con +24 V, 0 V, FE e due canali, A dal primo libero e B 8 dopo', async () => {
    const st = await store();
    st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, '700A4');
    const page = st().project.pages[0];
    const gid = page.elements.find(e => e.kind === 'symbol' && e.plcGroup?.socket)!.kind === 'symbol' ? (page.elements.find(e => e.kind === 'symbol' && e.plcGroup?.socket) as any).plcGroup.id : '';
    st().updatePlcSocket(gid, { name: 'X10' });
    const m = socketMembers(st().project.pages[0], gid);
    expect(m.length).toBe(12);
    const cfg = socketConfig(st().project.pages[0], gid)!;
    expect(cfg).toMatchObject({ tag: '700A4', count: 4, up: true, first: 0, second: 8, name: 'X10' });
    expect(m.filter(e => e.plcGroup!.socket !== 'body').map(e => e.plcChannel)).toEqual(['DI0', 'DI8', 'DI1', 'DI9', 'DI2', 'DI10', 'DI3', 'DI11']);
    // Pin a 16 mm l'uno dall'altro nell'ordine 1, 4, 3, 2, 5; prese ogni 80 mm
    const world = (e: typeof m[number]) => pinsWorld(e, getSymbol(e.symbolId)!).map(p => [e.pinLabels[p.pin.id], p.x]);
    expect(m.slice(0, 3).flatMap(world).sort((a, b) => (a[1] as number) - (b[1] as number))).toEqual([['X10.1', 40], ['X10.4', 56], ['X10.3', 72], ['X10.2', 88], ['X10.5', 104]]);
    expect(world(m[3])).toEqual([['X11.1', 120], ['X11.3', 152], ['X11.5', 184]]);
    // Pin del canale anche sulla scheda: vista PLC, Lista I/O, Excel
    expect(ioAssignments(st().project).find(r => r.channel === 'DI8')!.pins).toEqual(['X10.2']);
  });
  it('ogni canale si sceglie ingresso, uscita o non usato; variabili e posizione restano', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, '700A4')!;
    const gid = first.plcGroup!.id;
    const page = () => st().project.pages[0];
    const a0 = socketMembers(page(), gid).find(e => e.plcChannel === 'DI0')!;
    st().updateInstance(a0.id, { plcSymbol: 'Fotocellula' });
    const cfg = socketConfig(page(), gid)!;
    st().updatePlcSocket(gid, { kinds: [{ a: 'DI', b: 'DO' }, { a: 'DO', b: 'DO' }, { a: null, b: 'DI' }, { a: 'DI', b: null }] });
    const m = socketMembers(page(), gid);
    expect(m.filter(e => e.plcGroup!.socket !== 'body').map(e => `${e.plcChannel}:${e.symbolId}`)).toEqual([
      'DI0:plc_m12_a_di_up', 'DO8:plc_m12_b_do_up', 'DO1:plc_m12_a_do_up', 'DO9:plc_m12_b_do_up', 'DI10:plc_m12_b_di_up', 'DI3:plc_m12_a_di_up']);
    expect(m.find(e => e.plcChannel === 'DI0')!.plcSymbol).toBe('Fotocellula');
    expect(m.filter(e => e.plcGroup!.socket === 'body').length).toBe(4);
    expect(m[0].x).toBe(40);
    expect(socketConfig(page(), gid)!.kinds).toEqual([{ a: 'DI', b: 'DO' }, { a: 'DO', b: 'DO' }, { a: null, b: 'DI' }, { a: 'DI', b: null }]);
    expect(cfg.count).toBe(4);
    // Selezionando un elemento si seleziona tutto il gruppo, presa compresa
    st().setSelection([m[1].id]);
    expect(st().selection.length).toBe(m.length);
    // Controlli: nessun errore di canali o sigle
    const errs = checkProject(st().project).filter(i => i.level === 'error');
    expect(errs.map(i => i.msg)).toEqual([]);
  });
  it('copiato diventa un gruppo nuovo con le prese sulla stessa scheda dei canali', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, '700A4')!;
    const gid = first.plcGroup!.id;
    st().updatePlcSocket(gid, { count: 2 });
    const p = structuredClone(st().project), page = p.pages[0];
    const { ids } = pasteElements(p, page.id, copyElements(p, page, socketMembers(page, gid).map(e => e.id)), 0, 80);
    const pasted = page.elements.filter(e => ids.includes(e.id));
    const gids = new Set(pasted.map(e => (e as any).plcGroup?.id));
    expect(gids.size).toBe(1);
    expect([...gids][0]).not.toBe(gid);
    expect(new Set(pasted.map(e => (e as any).tag))).toEqual(new Set(['700A4']));
  });
});
