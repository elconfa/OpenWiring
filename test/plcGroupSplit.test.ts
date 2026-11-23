// Gruppi I/O PLC separati in canali singoli (ognuno sotto il suo circuito) e riuniti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { groupMembers } from '../src/model/plcGroup';
import { ioAssignments } from '../src/model/plc';
import { derive } from '../src/model/derive';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}
const chans = (st: any) => st().project.pages[0].elements.filter((e: any) => e.kind === 'symbol' && e.symbolId.startsWith('plc_ch_')) as SymbolInstance[];

describe('gruppi I/O PLC separati e riuniti', () => {
  it('separato: canali singoli con canale, variabile e sigla della scheda su ognuno; si spostano da soli', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const gid = first.plcGroup!.id;
    const m = groupMembers(st().project.pages[0], gid);
    st().updateInstance(m[2].id, { plcSymbol: 'Pressostato' });
    st().splitPlcGroup(gid);
    const c = chans(st);
    expect(c.length).toBe(8);
    expect(c.every(e => !e.plcGroup)).toBe(true);
    expect(c.map(e => e.plcChannel)).toEqual(['DI0', 'DI1', 'DI2', 'DI3', 'DI4', 'DI5', 'DI6', 'DI7']);
    expect(c.every(e => e.show?.tag !== false)).toBe(true);
    expect(c[2].plcSymbol).toBe('Pressostato');
    // Un canale si seleziona e si sposta da solo
    st().setSelection([c[3].id]);
    expect(st().selection).toEqual([c[3].id]);
    st().moveSelection(100, 60);
    expect(chans(st).find(e => e.id === c[3].id)).toMatchObject({ x: 260, y: 100 });
    // Restano punti I/O con indirizzo
    expect(ioAssignments(st().project).filter(r => r.inst).map(r => r.address)).toContain('I0.3');
    expect(derive(st().project).pages.get(st().project.pages[0].id)!.deviceFields.get(c[3].id)?.plcAddress).toBe('I0.3');
  });

  it('riuniti: di nuovo un gruppo allineato, nell\'ordine lungo il gruppo, con i loro canali', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    st().splitPlcGroup(first.plcGroup!.id);
    const c = chans(st);
    // Tre canali sparsi: DI5 a sinistra di DI1
    st().setSelection([c[5].id]); st().moveSelection(-200, 30);
    st().joinPlcChannels([c[1].id, c[5].id, c[6].id]);
    const g = chans(st).filter(e => e.plcGroup);
    expect(g.length).toBe(3);
    const m = groupMembers(st().project.pages[0], g[0].plcGroup!.id);
    expect(m.map(e => e.plcChannel)).toEqual(['DI5', 'DI1', 'DI6']);
    expect(m.map(e => e.x)).toEqual([40, 80, 120]);
    expect(m.map(e => e.y)).toEqual([70, 70, 70]);
    expect(m.map(e => e.show?.tag)).toEqual([true, false, false]);
  });

  it('non si riuniscono canali di schede o tipi diversi', async () => {
    const st = await store();
    const a = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const b = st().placeSymbol('plc_grp_do1', { x: 40, y: 120 }, 0)!;
    st().splitPlcGroup(a.plcGroup!.id); st().splitPlcGroup(b.plcGroup!.id);
    const c = chans(st);
    const before = JSON.stringify(st().project);
    st().joinPlcChannels([c[0].id, c[8].id]);
    expect(JSON.stringify(st().project)).toBe(before);
  });
});
