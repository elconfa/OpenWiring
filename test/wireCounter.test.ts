// Contatore avanzato dei numeri filo: lettere, {quadro}, contatore per quadro, riserva per pagina, ordine per righe
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, Wire, ProjectSettings } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { computeNetlist, lockWireNumbers } from '../src/model/netlist';
import { formatPattern, counterOf, nextTagFor } from '../src/model/numbering';

/** Filo verticale nella colonna x, da y a y+20 */
const W = (x: number, y = 40): Wire => ({ kind: 'wire', id: uid('w'), points: [{ x, y }, { x, y: y + 20 }] });

/** Pagine 1 e 2 nel quadro Q1, pagina 3 nel Q2; due fili per pagina */
function project(settings: Partial<ProjectSettings>): Project {
  const p = emptyProject();
  p.panels = [{ id: 'q1', code: 'Q1', name: '' }, { id: 'q2', code: 'Q2', name: '' }];
  p.pages = ['q1', 'q1', 'q2'].map((panelId, i) => ({ id: `p${i + 1}`, name: String(i + 1), title: '', type: 'multiline' as const, panelId, elements: [W(40), W(80)] }));
  Object.assign(p.settings, settings);
  return p;
}
const numbers = (p: Project) => p.pages.map(pg => pg.elements.map(e => computeNetlist(p).wireNet.get(e.id)?.wireNo));

describe('contatore avanzato dei numeri filo', () => {
  it('contatore in lettere e codice del quadro nel modello', () => {
    expect(formatPattern('{pagina}.{n:A}', { pagina: '2', colonna: 1, lettera: '', n: 28 })).toBe('2.AB');
    expect(formatPattern('{quadro}-{n:a}', { pagina: '2', colonna: 1, lettera: '', n: 3, quadro: 'Q1' })).toBe('Q1-c');
    expect(counterOf('{pagina}.{n:A}', { pagina: '2' }, '2.AB')).toBe(28);
    expect(counterOf('{pagina}.{n:A}', { pagina: '2' }, '2.12')).toBeUndefined();
    expect(numbers(project({ wireFormat: '{quadro}.{n:A}', wireScope: 'panel' }))).toEqual([['Q1.A', 'Q1.B'], ['Q1.C', 'Q1.D'], ['Q2.A', 'Q2.B']]);
  });
  it('il contatore riparte su ogni quadro', () => {
    expect(numbers(project({ wireFormat: '{n}', wireScope: 'panel' }))).toEqual([['1', '2'], ['3', '4'], ['1', '2']]);
    expect(numbers(project({ wireFormat: '{n}', wireScope: 'project' }))).toEqual([['1', '2'], ['3', '4'], ['5', '6']]);
  });
  it('la riserva lascia numeri liberi dopo ogni pagina; un filo aggiunto resta nella serie della pagina', () => {
    const p = project({ wireFormat: '{n}', wireScope: 'project', wireReserve: 3 });
    expect(numbers(p)).toEqual([['1', '2'], ['6', '7'], ['11', '12']]);
    lockWireNumbers(p);
    p.pages[0].elements.push(W(120));
    expect(numbers(p)[0]).toEqual(['1', '2', '3']);
    // Senza riserva il filo nuovo prende il numero dopo il più alto del progetto
    const q = project({ wireFormat: '{n}', wireScope: 'project' });
    lockWireNumbers(q);
    q.pages[0].elements.push(W(120));
    expect(numbers(q)[0]).toEqual(['1', '2', '7']);
  });
  it('a riserva esaurita salta i numeri già usati dalle pagine seguenti', () => {
    const p = project({ wireFormat: '{n}', wireScope: 'project', wireReserve: 1 });
    expect(numbers(p)).toEqual([['1', '2'], ['4', '5'], ['7', '8']]);
    lockWireNumbers(p);
    p.pages[0].elements.push(W(120), W(160), W(200));
    expect(numbers(p)[0]).toEqual(['1', '2', '3', '6', '9']);
  });
  it('ordine per righe: dall\'alto in basso prima che da sinistra a destra', () => {
    const p = project({ wireFormat: '{n}', wireScope: 'page' });
    p.pages = [p.pages[0]];
    p.pages[0].elements = [W(80, 40), W(40, 100)];
    expect(numbers(p)).toEqual([['2', '1']]);
    p.settings.wireOrder = 'rows';
    expect(numbers(p)).toEqual([['1', '2']]);
  });
  it('salta un numero già scritto a mano su un\'altra pagina', () => {
    const p = project({ wireFormat: '{pagina}.{n:2}', wireScope: 'page' });
    (p.pages[1].elements[0] as Wire).number = '1.01';
    expect(numbers(p)[0]).toEqual(['1.02', '1.03']);
  });
  it('anche le sigle possono contenere il quadro', () => {
    const p = project({ tagFormat: '{quadro}{lettera}{n}', tagScope: 'project' });
    expect(nextTagFor(p, 'K', p.pages[2], 40)).toBe('Q2K1');
  });
});
