import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { buildDevices } from '../src/model/devices';
import { articlePinPlan, functionKind } from '../src/model/articlePins';
import type { Part } from '../src/model/types';

const ft = (connections: string[], category?: string) => ({ pos: 0, description: '', connections, category });

describe('morsetti dei dispositivi dall\'articolo', () => {
  it('tipi delle funzioni', () => {
    expect(functionKind(ft(['A1', 'A2']))).toBe('coil');
    expect(functionKind(ft(['1', '2']))).toBe('power');
    expect(functionKind(ft(['L1', 'T1']))).toBe('power');
    expect(functionKind(ft(['43', '44']))).toBe('NO');
    expect(functionKind(ft(['21', '22']))).toBe('NC');
  });

  it('contattore: bobina, poli e contatti dalle funzioni dell\'articolo', () => {
    const p = exampleProject();
    const d = [...buildDevices(p).values()].find(x => x.main && x.elements.some(e => e.sym.contact === 'NO'))!;
    expect(d).toBeTruthy();
    const part: Part = { partNr: 'TEST.K', functionTemplates: [ft(['A1', 'A2']), ft(['1', '2']), ft(['3', '4']), ft(['5', '6']), ft(['43', '44'], '201'), ft(['31', '32'], '202')] } as Part;
    p.parts = [...(p.parts ?? []), part];
    for (const e of d.elements) e.inst.partNr = undefined;
    d.main!.inst.partNr = 'TEST.K';
    const plan = articlePinPlan(p, [], new Set([d.tag]));
    expect(plan.devices).toBe(1);
    const coil = plan.labels.get(d.main!.inst.id)!;
    expect(Object.values(coil).sort()).toEqual(['A1', 'A2']);
    const no = d.elements.find(e => e.sym.contact === 'NO')!;
    expect(Object.values(plan.labels.get(no.inst.id)!).sort()).toEqual(['43', '44']);
  });

  it('articolo con un morsetto per funzione: stessa designazione (1 → 1/L1)', () => {
    const p = exampleProject();
    const d = [...buildDevices(p).values()].find(x => x.main && x.elements.some(e => e.sym.contact === 'NO'))!;
    p.parts = [...(p.parts ?? []), { partNr: 'TEST.S', functionTemplates: ['A1', 'A2', '1/L1', '2/T1'].map(c => ft([c])) } as Part];
    for (const e of d.elements) e.inst.partNr = undefined;
    d.main!.inst.partNr = 'TEST.S';
    const plan = articlePinPlan(p, [], new Set([d.tag]));
    expect(Object.values(plan.labels.get(d.main!.inst.id)!).sort()).toEqual(['A1', 'A2']);
  });
});
