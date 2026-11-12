// Rotazione non ammessa dal simbolo: il testo la tiene (avviso), la verifica la segnala e la correzione funziona
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { emptyProject } from '../src/model/project';
import { importPagesText, pagesToText } from '../src/model/textFormat';
import { checkProject } from '../src/model/checks';
import { parseProject } from '../src/io/fileio';
import type { SymbolInstance } from '../src/model/types';

const symProject = () => {
  const p = emptyProject();
  p.customSymbols.push({ id: 'u1', name: 'Prova', category: 'x', letter: 'K', role: 'single', prims: [], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1' }], rotations: [0, 90] });
  return p;
};
const rotIssues = (p: ReturnType<typeof emptyProject>) => checkProject(p).filter(i => i.msg.includes('non ammessa dal simbolo'));

describe('rotazione non ammessa dal simbolo', () => {
  it('import dal testo: il simbolo resta, con avviso', () => {
    const p = symProject();
    const r = importPagesText(p, 'pagina 1 "Prova"\nsimbolo u1 -1K1 @40,40 rot=270');
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
    const e = p.pages.flatMap(pg => pg.elements).find(x => x.kind === 'symbol') as SymbolInstance;
    expect(e.rot).toBe(270);
  });
  it('la verifica la segnala e la correzione ammette la rotazione', async () => {
    const p = symProject();
    importPagesText(p, 'pagina 1 "Prova"\nsimbolo u1 -1K1 @40,40 rot=270');
    const iss = rotIssues(p);
    expect(iss.length).toBe(1);
    expect(iss[0].fix?.kind).toBe('allowRot');
    const { useStore } = await import('../src/model/store');
    useStore.getState().loadProject(p);
    useStore.getState().applyFixes([iss[0].fix!]);
    const q = useStore.getState().project;
    expect(q.customSymbols[0].rotations).toEqual([0, 90, 270]);
    expect(rotIssues(q)).toEqual([]);
  });
  const dp = '/Users/massimo/Documents/_APP/Eplan/_Import/DP138_v7.ecad';
  it.skipIf(!existsSync(dp))('DP138: 20 segnalazioni e andata e ritorno senza errori', () => {
    const p = parseProject(readFileSync(dp, 'utf8'));
    expect(rotIssues(p).length).toBe(20);
    const r = importPagesText(structuredClone(p), pagesToText(p));
    expect(r.errors).toEqual([]);
    expect(r.elements).toBe(4355);
  });
});
