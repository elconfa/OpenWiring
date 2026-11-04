import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { freezeRevision, changesSince, nextRevisionIndex, pageRevision, compareProjects, lastRevision } from '../src/model/revisions';
import { derive } from '../src/model/derive';

describe('revisioni', () => {
  it('congela, trova le modifiche, indice per pagina e nuvolette', () => {
    const p = exampleProject();
    expect(nextRevisionIndex(p)).toBe('A');
    freezeRevision(p, { index: 'A', date: '2026-10-15', author: 'MC', description: 'Prima emissione' });
    expect(p.revisions![0].pages).toHaveLength(p.pages.length);
    expect(changesSince(p, lastRevision(p)!.snapshot)).toEqual([]);
    // Modifico un dispositivo a pagina 2 e aggiungo un testo a pagina 3
    const coil = p.pages[1].elements.find(e => e.kind === 'symbol' && e.symbolId === 'coil')!;
    if (coil.kind === 'symbol') coil.description = 'Contattore pompa principale';
    p.pages[2].elements.push({ kind: 'text', id: 'nuovo', x: 100, y: 100, text: 'Nota', size: 3 });
    const ch = changesSince(p, lastRevision(p)!.snapshot);
    expect(ch.map(c => c.page.name)).toEqual(['2', '3']);
    expect(derive(p).pages.get(p.pages[1].id)!.revisionClouds).toHaveLength(1);
    expect(nextRevisionIndex(p)).toBe('B');
    freezeRevision(p, { index: 'B', date: '2026-10-16', author: 'MC', description: 'Modifica contattore' });
    expect(p.revisions![1].pages).toEqual(['2', '3']);
    expect(pageRevision(p, p.pages[1])).toBe('B');
    expect(pageRevision(p, p.pages[0])).toBe('A');
    expect(p.info.revision).toBe('B');
    expect(derive(p).pages.get(p.pages[1].id)!.revisionClouds ?? []).toEqual([]);
  });
  it('confronto tra due progetti', () => {
    const a = exampleProject(), b = structuredClone(a);
    b.pages[1].title = 'Comando pompa';
    for (const pg of b.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag === '2P1') e.description = 'Spia verde';
    const d = compareProjects(a, b);
    expect(d.some(x => x.kind === 'Pagina' && x.after === 'Comando pompa')).toBe(true);
    expect(d.some(x => x.kind === 'Dispositivo' && x.what === '-2P1' && x.after.startsWith('Spia verde'))).toBe(true);
  });
});
