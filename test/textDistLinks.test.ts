// Formato testo: ripartitori (righe «ripartitore» e simboli rip:<sigla>:<gruppo>) e abbinamento scritto dei rimandi
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { linkPartners } from '../src/model/links';
import type { Project, SymbolInstance } from '../src/model/types';

const link = (id: string, tag: string, x: number, y: number, incoming: boolean, linkTo?: string): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId: incoming ? 'link_in' : 'link', x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...(linkTo !== undefined ? { linkTo } : {}) });

function project(): Project {
  const p = emptyProject();
  p.distributors = [{ id: 'r1', tag: 'Q50', kind: 'bar', description: 'Cembre DB100-6/4', groups: [{ name: 'L1', inMax: '35', outs: ['4,5', '4,5', '6'] }, { name: 'L2', outs: ['', '6'] }] }];
  p.pages[0].elements = [
    { kind: 'symbol', id: 'd1', symbolId: 'dist:r1:0', x: 100, y: 40, rot: 0, tag: 'Q50', pinLabels: {}, autoPins: true },
    // Due partenze con lo stesso nome: la prima va alla pagina 2 (a y 40), la seconda a quella a y 80
    link('a', 'L1', 380, 40, false, 'b2'), link('a2', 'L1', 380, 80, false, 'b1'), link('z', 'X9', 380, 120, false, '-'),
  ];
  p.pages.push({ id: 'pg2', name: '2', title: 'Seconda', type: 'multiline', elements: [link('b1', 'L1', 40, 40, true, 'a2'), link('b2', 'L1', 40, 80, true, 'a')] });
  return p;
}

describe('formato testo: ripartitori e rimandi abbinati', () => {
  it('esporta le righe e il simbolo con la sigla del ripartitore', () => {
    const t = pagesToText(project());
    expect(t).toContain('ripartitore -Q50 tipo=barra gruppi="L1:35:4,5;4,5;6 | L2::-;6" descr="Cembre DB100-6/4"');
    expect(t).toContain('simbolo rip:Q50:L1 -Q50 @100,40');
    expect(t).toMatch(/simbolo link L1 @380,40 con=2@40,80/);
    expect(t).toMatch(/simbolo link L1 @380,80 con=2@40,40/);
    expect(t).toMatch(/simbolo link X9 @380,120 con=-/);
  });
  it('reimportato, il progetto ha lo stesso ripartitore e gli stessi abbinamenti (anche incrociati)', () => {
    const src = project();
    const text = pagesToText(src);
    const dst = emptyProject();
    const r = importPagesText(dst, text);
    expect(r.errors).toEqual([]);
    expect(dst.distributors?.[0]).toMatchObject({ tag: 'Q50', kind: 'bar', groups: [{ name: 'L1', inMax: '35', outs: ['4,5', '4,5', '6'] }, { name: 'L2', outs: ['', '6'] }] });
    const d = dst.pages[0].elements.find(e => e.kind === 'symbol' && e.symbolId.startsWith('dist:')) as SymbolInstance;
    expect(d.symbolId).toBe(`dist:${dst.distributors![0].id}:0`);
    expect(dst.customSymbols.some(s => s.id === d.symbolId)).toBe(true);
    const at = (x: number, y: number) => dst.pages.flatMap(p => p.elements).find(e => e.kind === 'symbol' && e.x === x && e.y === y) as SymbolInstance;
    const partners = linkPartners(dst);
    expect(partners.get(at(380, 40).id)!.map(e => e.inst.y)).toEqual([80]);
    expect(partners.get(at(380, 80).id)!.map(e => e.inst.y)).toEqual([40]);
    expect(at(380, 120).linkTo).toBe('-');
  });
  it('errori chiari: ripartitore o gruppo mancante, abbinamento ambiguo', () => {
    const p = emptyProject();
    const r = importPagesText(p, 'pagina 1 "x"\n  simbolo rip:Q9:L1 -Q9 @100,40\n');
    expect(r.errors[0].msg).toContain('ripartitore -Q9 non definito');
    const r2 = importPagesText(emptyProject(), 'pagina 1 "x"\n  simbolo link A @380,40 con=2\npagina 2 "y"\n  simbolo link_in A @40,40\n  simbolo link_in A @40,80\n');
    expect(r2.errors[0].msg).toContain('indica il punto');
  });
});
