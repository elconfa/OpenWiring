import { describe, it, expect, beforeEach } from 'vitest';
import { exampleProject } from '../src/model/example';
import { useStore } from '../src/model/store';
import { formatRevisionIndex, nextRevisionIndex, unpackProject, changesSince, lastRevision } from '../src/model/revisions';

const st = useStore.getState;
const rev = (index: string) => ({ index, date: '2026-10-26', author: 'MC', description: `Revisione ${index}` });
const firstPage = () => st().project.pages.find(p => p.type === 'multiline')!;

describe('revisioni: rilascio, sola lettura, annullamento', () => {
  beforeEach(() => st().loadProject(exampleProject()));

  it('formati dell\'indice', () => {
    expect([0, 1, 25, 26].map(k => formatRevisionIndex('A', k))).toEqual(['A', 'B', 'Z', 'AA']);
    expect(formatRevisionIndex('0', 3)).toBe('3');
    expect(formatRevisionIndex('00', 3)).toBe('03');
    expect(formatRevisionIndex('R00', 0)).toBe('R00');
    const p = exampleProject();
    p.settings.revisionFormat = '00';
    expect(nextRevisionIndex(p)).toBe('00');
  });

  it('il rilascio archivia la copia completa e blocca le modifiche', async () => {
    await st().releaseRevision(rev('A'));
    const p = st().project;
    expect(p.revisionState).toBe('released');
    expect(p.info.revision).toBe('A');
    const r = lastRevision(p)!;
    // Prima emissione: tutte le pagine nuove, nessuna nuvoletta
    expect(r.pages.length).toBe(p.pages.length);
    expect(changesSince(p, r.snapshot)).toEqual([]);
    const copy = await unpackProject(r.archive!);
    expect(copy.pages.map(x => x.id)).toEqual(p.pages.map(x => x.id));
    expect(copy.revisions?.[0].archive).toBeUndefined();
    // Sola lettura: la modifica viene rifiutata e non c'è niente da annullare
    const n = firstPage().elements.length;
    st().commit(q => { q.pages.find(x => x.id === firstPage().id)!.elements = []; });
    expect(firstPage().elements.length).toBe(n);
    expect(st().past.length).toBe(0);
  });

  it('revisione nuova, modifica, annullamento torna all\'ultima rilasciata', async () => {
    await st().releaseRevision(rev('A'));
    st().openRevision();
    expect(st().project.revisionState).toBe('review');
    const id = firstPage().id, n = firstPage().elements.length;
    st().commit(q => { q.pages.find(x => x.id === id)!.elements.pop(); q.info.customer = 'Altro'; });
    expect(firstPage().elements.length).toBe(n - 1);
    expect(changesSince(st().project, lastRevision(st().project)!.snapshot).length).toBeGreaterThan(0);
    expect(await st().cancelRevision()).toBe(true);
    expect(st().project.revisionState).toBe('released');
    expect(firstPage().elements.length).toBe(n);
    expect(st().project.info.customer).not.toBe('Altro');
    expect(lastRevision(st().project)?.archive).toBeTruthy();
  });

  it('una revisione archiviata si apre in sola lettura e si torna al progetto', async () => {
    await st().releaseRevision(rev('A'));
    st().openRevision();
    const id = firstPage().id;
    st().commit(q => { q.pages.find(x => x.id === id)!.title = 'Cambiata'; });
    await st().releaseRevision(rev('B'));
    const [a] = st().project.revisions!;
    await st().viewRevision(a.id);
    expect(st().viewing?.index).toBe('A');
    expect(st().project.pages.find(x => x.id === id)!.title).not.toBe('Cambiata');
    st().commit(q => { q.info.name = 'No'; });
    expect(st().project.info.name).not.toBe('No');
    st().closeRevisionView();
    expect(st().viewing).toBeNull();
    expect(st().project.pages.find(x => x.id === id)!.title).toBe('Cambiata');
    expect(st().project.revisions!.map(r => r.index)).toEqual(['A', 'B']);
  });
});

describe('revisioni: modifiche manuali e automatiche (19c)', () => {
  beforeEach(() => st().loadProject(exampleProject()));

  it('spostando la bobina, la pagina dei contatti è aggiornata automaticamente con la causa', async () => {
    const { revisionChanges, statusCounts } = await import('../src/model/revisionChanges');
    await st().releaseRevision(rev('A'));
    st().openRevision();
    const p2 = st().project.pages.find(p => p.name === '2')!;
    const coil = p2.elements.find(e => e.kind === 'symbol' && e.symbolId === 'coil')!;
    st().commit(q => { const e = q.pages.find(p => p.id === p2.id)!.elements.find(x => x.id === coil.id)!; if (e.kind === 'symbol') e.x += 120; }, false);
    st().commit(q => { q.pages.find(p => p.id === p2.id)!.title = 'Comandi nuovi'; });
    const base = await unpackProject(lastRevision(st().project)!.archive!);
    const r = revisionChanges(base, st().project);
    const page2 = r.find(x => x.pageId === p2.id)!;
    expect(page2.status).toBe('modificata');
    expect(page2.changes.find(c => c.elementId === coil.id)).toMatchObject({ kind: 'modificato', detail: 'posizione' });
    expect(page2.changes.some(c => c.kind === 'pagina' && c.detail.includes('descrizione'))).toBe(true);
    const page1 = r.find(x => x.name === '1')!;
    expect(page1.status).toBe('automatica');
    const auto = page1.changes.find(c => c.kind === 'automatico')!;
    expect(auto.what).toContain('2K1');
    expect(auto.detail).toMatch(/\/2\.\d+ → \/2\.\d+/);
    expect(statusCounts(r).modificata).toBe(1);
    // Nuvoletta con l'indice della revisione aperta e la nota non nascosta
    st().commit(q => { q.revisionNotes = { [`${p2.id}:${coil.id}`]: { text: 'Bobina spostata' } }; });
    const { derive } = await import('../src/model/derive');
    const clouds = derive(st().project).pages.get(p2.id)!.revisionClouds!;
    expect(clouds.some(c => c.index === 'B' && c.notes.includes('Bobina spostata'))).toBe(true);
    // Al rilascio la nota passa nella revisione
    await st().releaseRevision(rev('B'));
    expect(lastRevision(st().project)!.notes?.[`${p2.id}:${coil.id}`]?.text).toBe('Bobina spostata');
    expect(st().project.revisionNotes).toBeUndefined();
  });
});

describe('controllo prima del rilascio (19e)', () => {
  beforeEach(() => st().loadProject(exampleProject()));
  it('errori bloccanti, avvisi da accettare, verificati nel rapporto della revisione', async () => {
    const { releaseCheck, issueKey } = await import('../src/model/checks');
    // Un filo con un capo libero (avviso) e un simbolo inesistente (errore)
    const pg = firstPage();
    st().commit(q => {
      const p = q.pages.find(x => x.id === pg.id)!;
      p.elements.push({ kind: 'wire', id: 'wfree', points: [{ x: 300, y: 120 }, { x: 320, y: 120 }] });
      p.elements.push({ kind: 'symbol', id: 'sbad', symbolId: 'non_esiste', x: 340, y: 120, rot: 0, tag: 'Z1', pinLabels: {}, autoPins: true });
    });
    let c = releaseCheck(st().project);
    expect(c.errors.some(i => i.elementId === 'sbad')).toBe(true);
    expect(c.warnings.some(i => i.elementId === 'wfree')).toBe(true);
    // L'errore verificato non blocca più e va nel rapporto con il motivo
    st().acceptIssues(c.errors.filter(i => i.elementId === 'sbad').map(issueKey), 'simbolo di prova', true);
    c = releaseCheck(st().project);
    expect(c.errors.some(i => i.elementId === 'sbad')).toBe(false);
    expect(c.accepted.some(i => i.elementId === 'sbad')).toBe(true);
    await st().releaseRevision({ ...rev('A'), accepted: [{ kind: 'Simboli', msg: 'x', note: 'simbolo di prova' }] });
    expect(lastRevision(st().project)!.accepted?.[0].note).toBe('simbolo di prova');
  });
});
