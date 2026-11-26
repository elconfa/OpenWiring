// Prese M12 a 2 canali (es. ET 200eco PN): canale A sul pin 4 e B sul pin 2, ognuno DI, DO o non usato
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { ioAssignments } from '../src/model/plc';
import { socketCommonMarks, socketConfig, socketMembers, socketName } from '../src/model/plcSocket';
import { checkProject } from '../src/model/checks';
import { copyElements, pasteElements } from '../src/model/clipboard';
import { getSymbol, pinsWorld } from '../src/model/geometry';
import { derive } from '../src/model/derive';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useStoreRef: any;
async function store() {
  const { useStore } = await import('../src/model/store');
  useStoreRef = useStore;
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
    // Segnale A all'estremo sinistro, comuni al centro a 12 mm (1, 5, 3), segnale B all'estremo destro; prese ogni 80 mm
    const world = (e: typeof m[number]) => pinsWorld(e, getSymbol(e.symbolId)!).map(p => [e.pinLabels[p.pin.id], p.x]);
    expect(m.slice(0, 3).flatMap(world).sort((a, b) => (a[1] as number) - (b[1] as number))).toEqual([['X10.4', 40], ['X10.1', 60], ['X10.5', 72], ['X10.3', 84], ['X10.2', 104]]);
    expect(world(m[3])).toEqual([['X11.1', 140], ['X11.5', 152], ['X11.3', 164]]);
    // Sigle dei comuni: di serie +, ⏚ (disegnato a linee), −; si cambiano per tutte le prese del gruppo
    expect(socketCommonMarks(m[0]).texts.map(t => [t.s, t.x])).toEqual([['+', 60], ['−', 84]]);
    expect(socketCommonMarks(m[0]).lines.length).toBe(4);
    st().updatePlcSocket(gid, { commons: { 1: 'L+', 5: 'FE', 3: 'M' } });
    const m2 = socketMembers(st().project.pages[0], gid);
    expect(socketConfig(st().project.pages[0], gid)!.commons).toEqual({ 1: 'L+', 5: 'FE', 3: 'M' });
    expect(socketCommonMarks(m2[3]).texts.map(t => t.s)).toEqual(['L+', 'FE', 'M']);
    // Pin del canale anche sulla scheda: vista PLC, Lista I/O, Excel
    expect(ioAssignments(st().project).find(r => r.channel === 'DI8')!.pins).toEqual(['X10.2']);
  });
  it('canale già disegnato altrove: indirizzo scritto anche sulla presa; il canale B segue il canale A', async () => {
    const st = await store();
    // DI8 già usato da un punto I/O su un'altra pagina (es. gruppo a 4 morsetti)
    st().placeSymbol('plc_ch_di2', { x: 40, y: 150 }, 0, undefined, '700A4');
    const old = st().project.pages[0].elements.find(e => e.kind === 'symbol' && e.plcChannel) as any;
    st().updateInstance(old.id, { plcChannel: 'DI8' });
    const msgs: string[] = [];
    const log = st().logMsg;
    useStoreRef.setState({ logMsg: (m: string) => { msgs.push(m); } } as any);
    const first = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, undefined, '700A4')!;
    useStoreRef.setState({ logMsg: log } as any);
    const gid = first.plcGroup!.id;
    const b0 = socketMembers(st().project.pages[0], gid).find(e => e.plcGroup!.socket === 'b' && e.plcGroup!.index === 0)!;
    expect(b0.plcChannel).toBe('DI8');
    expect(msgs.some(m => m.includes('DI8'))).toBe(true);
    const d = derive(st().project).pages.get(st().project.pages[0].id)!;
    expect(d.deviceFields.get(b0.id)?.plcAddress).toBe(d.deviceFields.get(old.id)?.plcAddress);
    expect(d.deviceFields.get(b0.id)?.plcAddress).toBeTruthy();
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
  it('uscite: scelta la scheda dove ci stanno anche i canali B; cambiando scheda canali A e B di serie e via i pin dalla vecchia', async () => {
    const st = await store();
    // Una scheda di uscite a 8 canali prima della 16 DIQ (es. modulo F-DQ della stazione)
    st().project.plc.cards.unshift({ id: 'c0', tag: '400A4', typeId: 'fdo8', station: 'PLC1', start: { DO: 0 } });
    const f = st().placeSymbol('plc_grp_m12_down', { x: 40, y: 60 }, 0)!;
    const gid = f.plcGroup!.id;
    const ch = () => socketMembers(st().project.pages[0], gid).filter(e => e.plcGroup!.socket !== 'body').map(e => `${e.tag}:${e.plcChannel}`);
    expect(ch()).toEqual(['700A4:DO0', '700A4:DO8', '700A4:DO1', '700A4:DO9', '700A4:DO2', '700A4:DO10', '700A4:DO3', '700A4:DO11']);
    // Sulla scheda a 8 canali: canali B subito dopo i canali A; tornando alla 16 DIQ canali B 8 dopo
    st().updatePlcSocket(gid, { tag: '400A4' });
    expect(ch()).toEqual(['400A4:DO0', '400A4:DO4', '400A4:DO1', '400A4:DO5', '400A4:DO2', '400A4:DO6', '400A4:DO3', '400A4:DO7']);
    st().updatePlcSocket(gid, { tag: '700A4' });
    expect(ch()).toEqual(['700A4:DO0', '700A4:DO8', '700A4:DO1', '700A4:DO9', '700A4:DO2', '700A4:DO10', '700A4:DO3', '700A4:DO11']);
    // I pin scritti dalla presa restano solo sulla scheda attuale
    expect(st().project.plc.cards.find((c: { tag: string }) => c.tag === '400A4')!.io ?? {}).toEqual({});
    expect(ioAssignments(st().project).find(r => r.card.tag === '700A4' && r.channel === 'DO8')!.pins).toEqual(['X1.2']);
  });
  it('separa in prese e riunisce: ogni presa tiene nome, pin e canali; cambiando il nome tornano in sequenza', async () => {
    const st = await store();
    const f = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0, undefined, '700A4')!;
    st().updatePlcSocket(f.plcGroup!.id, { name: 'X10' });
    st().splitSocketGroup(f.plcGroup!.id);
    const page = () => st().project.pages[0];
    const bodies = () => page().elements.filter((e: any) => e.plcGroup?.socket === 'body') as any[];
    expect(new Set(bodies().map(b => b.plcGroup.id)).size).toBe(4);
    expect(bodies().map(b => [b.plcGroup.name, b.pinLabels['1'], b.show?.tag])).toEqual([['X10', 'X10.1', true], ['X11', 'X11.1', true], ['X12', 'X12.1', true], ['X13', 'X13.1', true]]);
    // Ogni presa da sola: cambiando il tipo di un canale resta la sua presa
    const x12 = bodies()[2];
    st().updatePlcSocket(x12.plcGroup.id, { kinds: [{ a: 'DI', b: null }] });
    const g12 = socketMembers(page(), x12.plcGroup.id);
    expect(g12.map(e => `${e.plcGroup!.socket}:${e.plcChannel ?? Object.values(e.pinLabels).join(',')}`)).toEqual(['body:X12.1,X12.3,X12.5', 'a:DI2']);
    // X13 spostata lontano, poi riunita con X10 e X12 (X11 resta da sola)
    const x13 = bodies()[3];
    for (const e of socketMembers(page(), x13.plcGroup.id)) st().updateInstance(e.id, { x: e.x + 200, y: e.y + 80 });
    const pick = [bodies()[0], bodies()[2], bodies()[3]].map(b => b.id);
    st().joinSockets(pick);
    const b2 = bodies().filter(b => b.plcGroup.count === 3);
    expect(b2.map(b => [b.plcGroup.name, b.x, b.y, b.plcGroup.index])).toEqual([['X10', 40, 60, 0], ['X12', 120, 60, 1], ['X13', 200, 60, 2]]);
    const gid = b2[0].plcGroup.id;
    expect(socketMembers(page(), gid).filter(e => e.plcGroup!.socket !== 'body').map(e => e.plcChannel)).toEqual(['DI0', 'DI8', 'DI2', 'DI3', 'DI11']);
    // Il gruppo riunito si modifica come gli altri senza perdere i canali delle prese
    st().updatePlcSocket(gid, { kinds: [{ a: 'DI', b: 'DI' }, { a: 'DI', b: null }, { a: 'DI', b: null }] });
    expect(socketMembers(page(), gid).filter(e => e.plcGroup!.socket !== 'body').map(e => e.plcChannel)).toEqual(['DI0', 'DI8', 'DI2', 'DI3']);
    // Nome della prima presa scelto per il gruppo: le prese tornano in sequenza
    st().updatePlcSocket(gid, { name: 'X20' });
    expect(socketMembers(page(), gid).filter(e => e.plcGroup!.socket === 'body').map(e => e.pinLabels['1'])).toEqual(['X20.1', 'X21.1', 'X22.1']);
  });
});

