// Riquadro del canale PLC completo (punto 175): scheda con il foglio della panoramica, stazione/rack/slot, morsetti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { groupMembers } from '../src/model/plcGroup';
import { derive } from '../src/model/derive';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}

describe('riquadro del canale PLC', () => {
  it('semplice di serie; completo dalle impostazioni; ogni campo si nasconde sul canale', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const gid = first.plcGroup!.id;
    const card = st().project.plc.cards[0];
    st().updatePlcCard(card.id, { rack: 0, slot: 3 });
    const m = groupMembers(st().project.pages[0], gid);
    const f = () => derive(st().project).pages.get(st().project.pages[0].id)!.deviceFields.get(m[2].id)!;
    expect(f().plcAddress).toBe('I0.2');
    expect(f().plcCard).toBeUndefined();
    st().updateSettings({ plcChannelBox: 'full' });
    expect(f().plcCard).toBe(`-${card.tag}`);
    expect(f().plcPlace).toBe(`${card.station} · R0 · S3`);
    expect(f().plcPins).toMatch(/^Morsett[oi] \S+/);
    // Occhio sul gruppo: niente morsetti nel riquadro
    st().setPlcGroupShow(gid, 'plcPins', false);
    expect(f().plcPins).toBeUndefined();
    expect(f().plcCard).toBe(`-${card.tag}`);
  });
});
