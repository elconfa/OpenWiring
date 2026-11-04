import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { proposeTranslation, translator, projectTexts, autoTranslate, translateTable, dictionaryCsv, parseDictionaryCsv } from '../src/model/i18n';
import { deviceReport } from '../src/model/reports';
import { derive } from '../src/model/derive';

describe('testi multilingua', () => {
  it('proposte dal dizionario: frasi, parole, numeri e sigle in coda', () => {
    expect(proposeTranslation('Contattore pompa', 'en')).toBe('Pump contactor');
    expect(proposeTranslation('Contattore pompa', 'de')).toBe('Schütz Pumpe');
    expect(proposeTranslation('Lampada guasto', 'en')).toBe('Fault lamp');
    expect(proposeTranslation('Pompa 2', 'en')).toBe('Pump 2');
    expect(proposeTranslation('Motore pompa -1M1', 'de')).toBe('Pumpenmotor -1M1');
    expect(proposeTranslation('Livello massimo serbatoio', 'en')).toBe('Tank maximum level');
    expect(proposeTranslation('Frobnicatore', 'en')).toBeUndefined();
  });
  it('schemi nella lingua scelta e in due lingue', () => {
    const p = exampleProject();
    p.languages = { display: 'en' };
    p.dictionary = { 'Circuito di comando': { en: 'Control', de: 'Steuerung' } };
    expect(translator(p).t('Circuito di comando')).toBe('Control'); // il dizionario di progetto vale più di quello incluso
    expect(translator(p).t('Pompa ferma')).toBe('Pump stopped');
    const q = { ...p, languages: { display: 'it' as const, second: 'de' as const } };
    expect(translator(q).t('Pompa ferma')).toBe('Pompa ferma / Pumpe steht');
    expect(translator(q).t('Testo non tradotto')).toBe('Testo non tradotto');
    const d = derive(p).pages.get(p.pages[1].id)!;
    expect([...d.deviceLines.values()].flat()).toContain('Pump contactor');
  });
  it('liste tradotte: titolo, colonne e descrizioni, non le sigle', () => {
    const p = exampleProject();
    p.languages = { display: 'de' };
    const t = translateTable(p, deviceReport(p));
    expect(t.title).toBe('Betriebsmittelliste');
    expect(t.columns.slice(0, 3)).toEqual(['BMK', 'Beschreibung', 'Technische Daten']);
    expect(t.rows.find(r => r[0].endsWith('-2K1'))?.[1]).toBe('Schütz Pumpe');
  });
  it('testi del progetto, proposte e CSV', () => {
    const p = exampleProject();
    p.pages[0].elements.push({ kind: 'text', id: 't1', x: 0, y: 0, text: 'Lampada guasto pompa', size: 3 });
    p.pages[0].elements.push({ kind: 'text', id: 't2', x: 0, y: 0, text: 'Nota del cliente', size: 3 });
    const texts = projectTexts(p).map(x => x.text);
    expect(texts).toContain('Contattore pompa');
    expect(texts).toContain('Quadro master');
    const r = autoTranslate(p);
    expect(p.dictionary!['Lampada guasto pompa']).toEqual({ en: 'Pump fault lamp', de: 'Leuchte Störung Pumpe', auto: ['en', 'de'] });
    expect(r.missing).toBeGreaterThan(0); // "Nota del cliente" resta da tradurre
    const csv = dictionaryCsv(p);
    expect(csv.split('\r\n')[0]).toBe('﻿Italiano;English;Deutsch');
    const back = parseDictionaryCsv('Italiano;English;Deutsch\r\nNota del cliente;Customer note;Kundenhinweis\r\n"Testo; con punto e virgola";A;B');
    expect(back).toEqual({ 'Nota del cliente': { en: 'Customer note', de: 'Kundenhinweis' }, 'Testo; con punto e virgola': { en: 'A', de: 'B' } });
  });
});
