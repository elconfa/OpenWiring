// Doppioni su pagine diverse: morsetti, rimandi con lo stesso nome, simboli principali con la stessa sigla
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { checkProject } from '../src/model/checks';
import type { Project, Wire, SymbolInstance, Page } from '../src/model/types';

const sym = (id: string, symbolId: string, tag: string, x: number, y: number, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, tag, x, y, rot: 0, pinLabels: {}, ...extra } as SymbolInstance);
const wire = (id: string, pts: [number, number][]): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]) => ({ x, y })) });
const page = (id: string, name: string, elements: Page['elements']): Page => ({ id, name, title: '', type: 'multiline', elements });
const withPages = (...pages: Page[]): Project => { const p = emptyProject(); p.pages = pages; return p; };

describe('doppioni su pagine diverse', () => {
  it('stesso morsetto su due circuiti diversi: errore', () => {
    const p = withPages(
      page('a', '10', [sym('t1', 'terminal', 'X1:1', 40, 40), wire('w1', [[40, 48], [40, 80]]), sym('k1', 'coil', 'K1', 40, 80)]),
      page('b', '20', [sym('t2', 'terminal', 'X1:1', 40, 40), wire('w2', [[40, 48], [40, 80]]), sym('k2', 'coil', 'K2', 40, 80)]),
    );
    const i = checkProject(p).find(x => x.msg.startsWith('-X1:1 disegnato su 2 pagine'));
    expect(i?.level).toBe('error');
    expect(i?.elementId).toBe('t2');
    expect(i?.msg).toContain('circuiti diversi');
  });

  it('stesso morsetto su due pagine senza circuiti diversi: avviso', () => {
    const p = withPages(page('a', '10', [sym('t1', 'terminal', 'X1:1', 40, 40)]), page('b', '20', [sym('t2', 'terminal', 'X1:1', 40, 40)]));
    expect(checkProject(p).find(x => x.msg.startsWith('-X1:1 disegnato su 2 pagine'))?.level).toBe('warn');
  });

  it('rimandi con lo stesso nome su conduttori diversi: errore', () => {
    const p = withPages(
      page('a', '10', [
        sym('l1', 'link', 'N5', 100, 40, { linkTo: 'l2' }), wire('w1', [[100, 40], [100, 60]]), sym('k1', 'coil', 'K1', 100, 60),
        sym('l3', 'link', 'N5', 200, 40, { linkTo: 'l4' }), wire('w3', [[200, 40], [200, 60]]), sym('k3', 'coil', 'K3', 200, 60),
      ]),
      page('b', '20', [
        sym('l2', 'link_in', 'N5', 100, 40, { linkTo: 'l1' }), wire('w2', [[100, 40], [100, 60]]), sym('k2', 'coil', 'K2', 100, 60),
        sym('l4', 'link_in', 'N5', 200, 40, { linkTo: 'l3' }), wire('w4', [[200, 40], [200, 60]]), sym('k4', 'coil', 'K4', 200, 60),
      ]),
    );
    const i = checkProject(p).find(x => x.msg.startsWith('Rimando "N5" usato su 2 conduttori diversi'));
    expect(i?.level).toBe('error');
  });

  it('due simboli principali con la stessa sigla su pagine diverse: errore', () => {
    const p = withPages(page('a', '10', [sym('k1', 'coil', 'K1', 40, 40)]), page('b', '20', [sym('s1', 'pb_no', 'K1', 40, 40)]));
    const i = checkProject(p).find(x => x.msg.startsWith('-K1: 2 simboli principali'));
    expect(i?.level).toBe('error');
    expect(i?.elementId).toBe('s1');
  });

  it('bobina e contatti con la stessa sigla restano un dispositivo solo', () => {
    const p = withPages(page('a', '10', [sym('k1', 'coil', 'K1', 40, 40)]), page('b', '20', [sym('c1', 'no', 'K1', 40, 40)]));
    expect(checkProject(p).some(x => x.msg.includes('simboli principali'))).toBe(false);
  });
});
