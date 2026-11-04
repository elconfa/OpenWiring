import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import { addSpares, syncStripPages } from '../src/model/terminals';
import { arrangePages } from '../src/model/pageOrder';
import { listEntries, updateList, deleteList, updateAllLists, outdated } from '../src/model/lists';

describe('liste e pagine generate', () => {
  it('gli schemi delle morsettiere sono in ordine di sigla', () => {
    const p = emptyProject();
    for (const s of ['X10', 'X2', 'X1.1.2', 'X1']) { addSpares(p, s, 2); syncStripPages(p); }
    arrangePages(p);
    expect(p.pages.filter(pg => pg.type === 'strip').map(pg => pg.strip)).toEqual(['X1', 'X1.1.2', 'X2', 'X10']);
  });
  it('tutte le liste sono elencate anche senza pagine; crea, aggiorna ed elimina una lista', () => {
    const p = emptyProject();
    addSpares(p, 'X1', 3);
    const e0 = listEntries(p);
    expect(e0.some(e => e.key === 'strip' && !e.pages.length && e.need === 1)).toBe(true);
    expect(e0.some(e => e.key === 'report:Lista morsetti')).toBe(true);
    updateList(p, 'report:Lista morsetti');
    updateList(p, 'strip');
    expect(p.pages.filter(pg => pg.type === 'report').map(pg => pg.report)).toEqual(['Lista morsetti']);
    expect(p.settings.reportPages).toEqual(['Lista morsetti']);
    // Morsettiera nuova: la lista degli schemi è da aggiornare, «aggiorna tutte» la sistema
    addSpares(p, 'X2', 3);
    expect(outdated(listEntries(p).find(e => e.key === 'strip')!)).toBe(true);
    updateAllLists(p);
    expect(p.pages.filter(pg => pg.type === 'strip').length).toBe(2);
    // Aggiorna tutte non crea liste mai generate
    expect(p.pages.some(pg => pg.type === 'cable' || pg.report === 'Distinta materiali')).toBe(false);
    expect(deleteList(p, 'report:Lista morsetti')).toBe(2);
    expect(p.settings.reportPages).toEqual([]);
    updateAllLists(p);
    expect(p.pages.some(pg => pg.type === 'report')).toBe(false);
  });
});
