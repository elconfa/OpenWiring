// Più progetti aperti insieme: scambio del progetto attivo, cronologia separata, pagine copiate tra progetti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { exampleProject } from '../src/model/example';

async function store() {
  const { useStore } = await import('../src/model/store');
  return useStore.getState;
}

describe('più progetti aperti', () => {
  it('apre accanto, cambia progetto e copia una pagina dall\'uno all\'altro', async () => {
    const st = await store();
    const a = emptyProject(); a.info.name = 'A';
    st().loadProject(a);
    st().addPage();
    expect(st().dirty).toBe(true);
    const b = exampleProject(); b.info.name = 'B';
    st().openAlongside(b);
    expect(st().project.info.name).toBe('B');
    expect(st().others.map(o => [o.project.info.name, o.dirty])).toEqual([['A', true]]);
    // Pagina 1 di B (con simboli e fili) copiata, poi incollata in A
    const src = st().project.pages.find(p => p.type === 'multiline' && p.elements.length)!;
    st().copyPage(src.id);
    const keyA = st().others[0].key;
    st().switchProject(keyA);
    expect(st().project.info.name).toBe('A');
    expect(st().others[0].project.info.name).toBe('B');
    const before = st().project.pages.length;
    st().pastePage();
    expect(st().project.pages.length).toBe(before + 1);
    const pasted = st().project.pages.find(p => p.id === st().pageId)!;
    expect(pasted.elements.length).toBe(src.elements.length);
    expect(pasted.title).toBe(src.title);
    // Annulla vale solo per il progetto attivo
    st().undo();
    expect(st().project.pages.length).toBe(before);
    // Copia anche da un progetto non attivo
    const keyB = st().others[0].key;
    st().copyPage(src.id, keyB);
    expect(st().pageClipboard?.from).toBe('B');
    st().closeOther(keyB);
    expect(st().others).toEqual([]);
  });
});
