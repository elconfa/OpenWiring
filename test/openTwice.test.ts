// Stesso progetto aperto due volte («Apri accanto…», Apri, Recenti): si va su quello già aperto,
// così due copie dello stesso file non si sovrascrivono a vicenda. Profili nei dati utente e
// impostazioni prese da un progetto .ecad.
import { describe, it, expect } from 'vitest';
import { emptyProject, useStore, samePath } from '../src/model/store';
import { makeUserData, parseUserData, mergeUserData } from '../src/model/userData';
import { makeProfile, SETTINGS_PARTS } from '../src/model/settingsProfiles';
import { serializeProject } from '../src/io/fileio';

const named = (name: string) => { const p = emptyProject(); p.info.name = name; return p; };

describe('progetto aperto una volta sola', () => {
  it('«Apri accanto» dello stesso file porta su quello già aperto, senza copie', () => {
    const st = useStore.getState;
    useStore.setState({ others: [] });
    st().loadProject(named('A'), '/p/A.ecad');
    st().openAlongside(named('B'), '/p/B.ecad');
    expect(st().others).toHaveLength(1);
    // B attivo: riaprire A accanto attiva A, riaprire B non fa niente
    st().openAlongside(named('A'), '/p/A.ecad');
    expect(st().project.info.name).toBe('A');
    expect(st().others).toHaveLength(1);
    st().openAlongside(named('A'), '/P/a.ecad');
    expect(st().others).toHaveLength(1);
    expect(st().openSlotOf('/p/B.ecad')).toBe(st().others[0].key);
    expect(st().openSlotOf('/p/A.ecad')).toBe('active');
    expect(st().openSlotOf('/p/C.ecad')).toBeNull();
  });
  it('percorsi di Windows: maiuscole e barre non contano', () => {
    expect(samePath('C:\\Progetti\\DP138.ecad', 'c:/progetti/dp138.ecad')).toBe(true);
    expect(samePath(undefined, undefined)).toBe(false);
  });
});

describe('profili nei dati utente', () => {
  const prof = (id: string, isDefault?: boolean) => ({ ...makeProfile(emptyProject(), id, ['texts']), id, isDefault });
  const empty = { library: [], symbols: [], macros: [], templates: [], titleBlocks: [], favorites: [] };
  it('il file porta i profili; senza profilo predefinito qui vale quello del file', () => {
    const r = parseUserData(JSON.stringify(makeUserData({ ...empty, profiles: [prof('x', true)] })));
    expect(r.data!.profiles.map(p => p.id)).toEqual(['x']);
    const m = mergeUserData({ ...empty, profiles: [prof('mio')] }, r.data!, false);
    expect(m.result.profiles!.find(p => p.isDefault)?.id).toBe('x');
    expect(m.counts.profiles.added).toBe(1);
  });
  it('con un profilo predefinito qui resta quello', () => {
    const m = mergeUserData({ ...empty, profiles: [prof('mio', true)] }, { ...empty, profiles: [prof('x', true)] }, false);
    expect(m.result.profiles!.filter(p => p.isDefault).map(p => p.id)).toEqual(['mio']);
  });
  it('file vecchi senza profili', () => {
    const { profiles: _p, ...old } = makeUserData(empty);
    expect(parseUserData(JSON.stringify(old)).data!.profiles).toEqual([]);
  });
});

describe('impostazioni da un progetto .ecad', () => {
  it('tutte le parti e il cartiglio del progetto', async () => {
    const { profileFromProjectFile } = await import('../src/ui/ProfilesPanel');
    const p = named('DP138');
    const text = serializeProject(p);
    const prof = profileFromProjectFile(text, 'DP138_v8.ecad')!;
    expect(prof.name).toBe('DP138');
    expect(prof.parts.sort()).toEqual(SETTINGS_PARTS.map(x => x.id).sort());
    expect(prof.titleBlock).toBeTruthy();
    expect(profileFromProjectFile(text, 'x.ecadprofile')).toBeUndefined();
  });
});

describe('salvataggio sul progetto giusto', () => {
  it('passando a un altro progetto durante il salvataggio, il file resta di quello salvato', () => {
    const st = useStore.getState;
    useStore.setState({ others: [] });
    st().loadProject(named('A'), '/p/A.ecad');
    st().openAlongside(named('B'));
    const b = st().project;
    const at = st().others;
    // Mentre B si salva l'utente torna su A
    st().switchProject(st().others[0].key);
    st().markSavedProject(b, '/p/B.ecad', at);
    expect(st().filePath).toBe('/p/A.ecad');
    expect(st().others.find(o => o.project === b)?.filePath).toBe('/p/B.ecad');
  });
  it('un altro progetto sul disco si riconosce dalle pagine', async () => {
    const { sameProjectPages } = await import('../src/ui/actions');
    const a = named('A');
    expect(sameProjectPages(a, a.pages)).toBe(true);
    expect(sameProjectPages(a, named('B').pages)).toBe(false);
    expect(sameProjectPages(a, [])).toBe(true);
  });
});
