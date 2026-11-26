// Sigla della scheda nei gruppi I/O salvati senza scelta (progetti fatti prima della scelta sul primo canale):
// solo sul primo canale del gruppo nella pagina, non su ognuno (si sovrapponeva al riquadro accanto)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import type { SymbolInstance } from '../src/model/types';

describe('sigla della scheda nei gruppi I/O', () => {
  it('senza scelta solo sul primo canale; una scelta scritta vale sempre', () => {
    const p = emptyProject();
    p.plc.cards = [{ id: 'c1', tag: '400A2', typeId: 'di8', station: 'PLC1', start: { DI: 0 } }];
    const ch = (i: number, show?: SymbolInstance['show']): SymbolInstance => ({
      kind: 'symbol', id: `s${i}`, symbolId: 'plc_ch_di2', x: 60 + i * 40, y: 200, rot: 0, tag: '400A2', plcChannel: `DI${i}`,
      autoPins: false, pinLabels: {}, plcGroup: { id: 'g1', index: i, count: 4 }, ...(show ? { show } : {}),
    });
    p.pages[0].elements.push(ch(0), ch(1), ch(2), ch(3, { tag: true }));
    const d = derive(p).pages.get(p.pages[0].id)!;
    const shown = (id: string) => d.designations.get(id) !== '';
    expect(['s0', 's1', 's2', 's3'].map(shown)).toEqual([true, false, false, true]);
  });
});

describe('morsetto di segnale doppio', () => {
  it('stesso pin su due uscite: errore; stesso pin su ingresso e uscita o comuni ripetuti: no', async () => {
    const { plcProblems } = await import('../src/model/plc');
    const p = emptyProject();
    p.plc.cards = [{ id: 'c1', tag: '700A4', typeId: 'di16-do16', station: 'PLC1', start: { DI: 0, DO: 0 }, io: {
      DI0: { pins: ['X10.4', 'X10.1'] }, DI8: { pins: ['X10.2', 'X10.1'] }, DO0: { pins: ['X10.4'] }, DO4: { pins: ['X10.4'] },
    } }];
    expect(plcProblems(p)).toEqual(['-700A4: morsetto di segnale X10.4 su più canali (DO0, DO4)']);
  });
});
