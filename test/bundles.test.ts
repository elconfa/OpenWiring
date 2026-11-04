// Modalità BUS: i fili con lo stesso conduttore sullo stesso bus sono collegati, anche tra pagine
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { computeNetlist } from '../src/model/netlist';
import { schemaProblems } from '../src/model/checks';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import type { Project, Wire, Page } from '../src/model/types';

const wire = (id: string, pts: [number, number][], extra: Partial<Wire> = {}): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]) => ({ x, y })), ...extra });
const page = (id: string, name: string, elements: Wire[]): Page => ({ id, name, title: '', type: 'multiline', elements });

function project(): Project {
  const p = emptyProject();
  p.pages = [
    page('p1', '1', [
      wire('bus1', [[20, 40], [200, 40]], { bundle: '400V' }),
      wire('a', [[40, 40], [40, 80]], { tapStart: 'L1' }),
      wire('c', [[60, 40], [60, 80]], { tapStart: 'L2' }),
      wire('d', [[80, 80], [80, 40]], { tapEnd: 'L2' }),
    ]),
    page('p2', '2', [
      wire('bus2', [[20, 60], [200, 60]], { bundle: '400V' }),
      wire('b', [[150, 60], [150, 100]], { tapStart: 'L1' }),
    ]),
  ];
  return p;
}

describe('bus di conduttori', () => {
  it('stesso conduttore = stesso filo, anche su un\'altra pagina con lo stesso nome di bus', () => {
    const nl = computeNetlist(project());
    const net = (id: string) => nl.wireNet.get(id)!;
    expect(net('a')).toBe(net('b'));
    expect(net('c')).toBe(net('d'));
    expect(net('a')).not.toBe(net('c'));
    // Il bus non è un conduttore
    expect(nl.wireNet.has('bus1')).toBe(false);
  });

  it('senza conduttore il filo non si collega, e la verifica lo segnala', () => {
    const p = project();
    (p.pages[0].elements[1] as Wire).tapStart = undefined;
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('a')).not.toBe(nl.wireNet.get('b'));
    const msgs = schemaProblems(p, nl).map(i => i.msg);
    expect(msgs.some(m => m.includes('senza il nome del conduttore'))).toBe(true);
    // L1 resta solo sulla pagina 2: entra ma non esce
    expect(msgs.some(m => m.includes('L1') && m.includes('non esce'))).toBe(true);
  });

  it('bus che si toccano sono un bus solo', () => {
    const p = project();
    p.pages[1].elements.push(wire('bus3', [[200, 60], [200, 140]], { bundle: '' }), wire('e', [[200, 120], [240, 120]], { tapStart: 'L1' }));
    p.pages[1].elements[0] = wire('bus2', [[20, 60], [200, 60]], { bundle: '' });
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('e')).toBe(nl.wireNet.get('b'));
    expect(nl.wireNet.get('e')).not.toBe(nl.wireNet.get('a'));
  });

  it('formato testo: busfili e conduttori degli estremi', () => {
    const p = project();
    const text = pagesToText(p);
    expect(text).toContain('busfili=400V');
    expect(text).toContain('cond1=L1');
    expect(text).toContain('cond2=L2');
    const q = emptyProject();
    const r = importPagesText(q, text);
    expect(r.errors ?? []).toEqual([]);
    const nl = computeNetlist(q);
    const ws = q.pages.flatMap(pg => pg.elements).filter((e): e is Wire => e.kind === 'wire' && !!e.tapStart && e.tapStart === 'L1');
    expect(ws.length).toBe(2);
    expect(nl.wireNet.get(ws[0].id)).toBe(nl.wireNet.get(ws[1].id));
  });
});

describe('elenco filtrato mentre si scrive', () => {
  it('prima le voci il cui valore inizia con il testo', async () => {
    const { filterCombo } = await import('../src/ui/Ask');
    const items = ['L1', 'L2', 'N', 'PE'].map(v => ({ value: v, label: `${v} · già nel bus` }));
    expect(filterCombo(items, 'n').map(i => items[i].value)[0]).toBe('N');
    expect(filterCombo(items, 'pe').map(i => items[i].value)).toEqual(['PE']);
  });
});

describe('rimandi dei bus di conduttori e bus generico', () => {
  it('il nome del bus porta le altre pagine come rimandi cliccabili al primo tratto', async () => {
    const { derive } = await import('../src/model/derive');
    const d = derive(project());
    expect(d.pages.get('p1')!.wireNumbers.get('bus1')).toBe('400V  /2');
    expect(d.pages.get('p1')!.wireRefs?.get('bus1')).toEqual([{ page: '2', id: 'bus2' }]);
    expect(d.pages.get('p2')!.wireRefs?.get('bus2')).toEqual([{ page: '1', id: 'bus1' }]);
  });

  it('bus generico: al posto del protocollo il tipo del cavo o l\'articolo', async () => {
    const { derive } = await import('../src/model/derive');
    const { GENERIC_BUS, PROTOCOLS } = await import('../src/model/network');
    expect(PROTOCOLS.some(p => p.name === GENERIC_BUS)).toBe(true);
    const p = project();
    p.pages[0].elements.push(wire('pad', [[20, 150], [200, 150]], { bus: GENERIC_BUS, busCable: { type: 'Cavo smartPAD 10 m' } }));
    p.pages[0].elements.push(wire('pad2', [[20, 170], [200, 170]], { bus: GENERIC_BUS, busCable: { partNr: 'KUKA.00-168-334' } }));
    const d = derive(p).pages.get('p1')!;
    expect(d.wireNumbers.get('pad')).toBe('Cavo smartPAD 10 m');
    expect(d.wireNumbers.get('pad2')).toBe('KUKA.00-168-334');
  });
});
