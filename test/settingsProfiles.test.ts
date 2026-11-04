import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { emptyProject } from '../src/model/project';
import { makeProfile, applyProfile, profileChanges, serializeProfile, parseProfile, partKeys } from '../src/model/settingsProfiles';
import { settingsOf } from '../src/model/numbering';
import { lookOf, DEFAULT_SETTINGS } from '../src/model/types';

describe('profili di impostazioni', () => {
  it('salva solo le parti scelte e le applica a un altro progetto', () => {
    const a = exampleProject();
    a.settings = { ...settingsOf(a), tagFormat: '{lettera}{n}', wireFormat: '{n}', look: { widths: { symbol: 0.5 }, junction: 'none' } };
    const prof = makeProfile(a, 'Aziendale', ['tags', 'look']);
    expect(prof.settings.tagFormat).toBe('{lettera}{n}');
    expect(prof.settings.wireFormat).toBeUndefined();
    const b = emptyProject();
    const ch = profileChanges(b, prof);
    expect(ch.map(c => c.part)).toEqual(expect.arrayContaining(['tags', 'look']));
    applyProfile(b, prof);
    const s = settingsOf(b);
    expect(s.tagFormat).toBe('{lettera}{n}');
    expect(s.wireFormat).toBe(DEFAULT_SETTINGS.wireFormat);
    expect(lookOf(s).w.symbol).toBe(0.5);
    expect(lookOf(s).junction).toBe('none');
    expect(profileChanges(b, prof)).toEqual([]);
  });

  it('applica solo le parti indicate e rimette i predefiniti per le chiavi assenti', () => {
    const a = emptyProject();
    const prof = makeProfile(a, 'Base', ['tags', 'look']);
    const b = emptyProject();
    b.settings = { ...settingsOf(b), tagFormat: 'X{n}', look: { junction: 'none' } };
    applyProfile(b, prof, ['look']);
    expect(settingsOf(b).tagFormat).toBe('X{n}');
    expect(settingsOf(b).look).toBeUndefined();
  });

  it('file .ecadprofile: andata e ritorno, scarta chiavi di parti non dichiarate', () => {
    const a = exampleProject();
    a.titleBlock = { address: 'Via Roma 1' };
    const prof = makeProfile(a, 'Con cartiglio', ['titleBlock', 'wires'], 'prova');
    const back = parseProfile(serializeProfile(prof))!;
    expect(back.name).toBe('Con cartiglio');
    expect(back.description).toBe('prova');
    expect(back.titleBlock?.block.address).toBe('Via Roma 1');
    expect(back.id).not.toBe(prof.id);
    const raw = JSON.parse(serializeProfile(prof));
    raw.profile.settings.grid = 8;
    expect(parseProfile(JSON.stringify(raw))!.settings.grid).toBeUndefined();
    expect(parseProfile('{"format":"altro"}')).toBeUndefined();
    expect(parseProfile('non json')).toBeUndefined();
    const c = emptyProject();
    applyProfile(c, back);
    expect(c.titleBlock?.address).toBe('Via Roma 1');
  });

  it('ogni parte ha chiavi diverse', () => {
    const all = ['revisions', 'tags', 'wires', 'texts', 'look', 'drawing', 'fixed', 'lists'].flatMap(partKeys);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('profili aziendali bloccati', () => {
  it('bloccano le parti nel progetto, sblocco con la password', async () => {
    const { makeLock, unlockOk, lockedKeys, applicableParts } = await import('../src/model/settingsProfiles');
    const a = exampleProject();
    const prof = makeProfile(a, 'Azienda', ['tags', 'look'], undefined, await makeLock('segreta'));
    const b = emptyProject();
    applyProfile(b, prof);
    expect(b.settings.locks?.profile).toBe('Azienda');
    expect(lockedKeys(b).has('tagFormat')).toBe(true);
    expect(lockedKeys(b).has('wireFormat')).toBe(false);
    expect(await unlockOk(b.settings.locks!, 'sbagliata')).toBe(false);
    expect(await unlockOk(b.settings.locks!, 'segreta')).toBe(true);
    // Un altro profilo non cambia le parti bloccate; lo stesso profilo sì
    const other = makeProfile(a, 'Altro', ['tags', 'wires']);
    expect(applicableParts(b, other)).toEqual(['wires']);
    expect(applicableParts(b, prof)).toEqual(['tags', 'look']);
    // Il blocco viaggia nel file del profilo
    const back = parseProfile(serializeProfile(prof))!;
    expect(await unlockOk(back.lock!, 'segreta')).toBe(true);
  });

  it('lo store rifiuta le impostazioni bloccate', async () => {
    const { useStore } = await import('../src/model/store');
    const { makeLock } = await import('../src/model/settingsProfiles');
    const p = emptyProject();
    applyProfile(p, makeProfile(p, 'Azienda', ['tags'], undefined, await makeLock('')));
    useStore.getState().loadProject(p);
    useStore.getState().updateSettings({ tagFormat: 'X{n}', grid: 8 });
    const s = useStore.getState().project.settings;
    expect(s.tagFormat).toBe(DEFAULT_SETTINGS.tagFormat);
    expect(s.grid).toBe(8);
    useStore.getState().unlockSettings();
    useStore.getState().updateSettings({ tagFormat: 'X{n}' });
    expect(useStore.getState().project.settings.tagFormat).toBe('X{n}');
  });
});
