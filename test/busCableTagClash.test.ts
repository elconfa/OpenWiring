// Sigle automatiche dei cavi di rete: se coincidono con un altro cavo si rifanno (le sigle scritte a mano restano)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { assignBusCableTags } from '../src/model/network';
import { checkProject } from '../src/model/checks';
import type { Wire } from '../src/model/types';

const bus = (id: string, x: number, tag?: string, auto?: boolean): Wire => ({ kind: 'wire', id, points: [{ x, y: 40 }, { x: x + 30, y: 40 }], bus: 'Profinet', ...(tag ? { busCable: { tag, ...(auto ? { auto: true } : {}) } } : {}) });

describe('sigle dei cavi di rete', () => {
  it('automatica uguale a un cavo del progetto o a un\'altra: si rifà con la prima libera della pagina', () => {
    const p = emptyProject();
    p.pages[0].name = '700';
    p.cables = [{ id: 'c1', tag: '701W1', conductors: ['1', '2', '3', '4'], assign: {} }];
    p.pages[0].elements = [bus('a', 40, '701W1', true), bus('b', 100, '701W2', true), bus('c', 160, '701W2', true), bus('d', 220, '701W3')];
    expect(checkProject(p).filter(x => x.level === 'error' && /usata da/.test(x.msg)).length).toBeGreaterThan(0);
    assignBusCableTags(p);
    const tags = p.pages[0].elements.map(e => (e as Wire).busCable?.tag);
    // a cede al cavo multipolare, c alla prima con 701W2; b resta, d è scritta a mano
    expect(tags[1]).toBe('701W2');
    expect(tags[3]).toBe('701W3');
    expect(tags[0]).toMatch(/^700W\d+$/);
    expect(tags[2]).toMatch(/^700W\d+$/);
    expect(tags[0]).not.toBe(tags[2]);
    expect(checkProject(p).filter(x => x.level === 'error' && /usata da/.test(x.msg))).toEqual([]);
  });
  it('una sigla scritta a mano non cambia mai, anche se uguale a un cavo', () => {
    const p = emptyProject();
    p.cables = [{ id: 'c1', tag: 'W9', conductors: ['1'], assign: {} }];
    p.pages[0].elements = [bus('a', 40, 'W9')];
    assignBusCableTags(p);
    expect((p.pages[0].elements[0] as Wire).busCable?.tag).toBe('W9');
  });
});
