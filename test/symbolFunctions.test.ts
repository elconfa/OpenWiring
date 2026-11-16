// Funzione dei simboli (DA_FARE 164): riconoscimento da nome, cartella, ruolo e codice d'ordine
import { describe, it, expect } from 'vitest';
import type { SymbolDef } from '../src/model/types';
import { BUILTIN_FUNCTIONS, withFunctions, guessFunction, newFunctionId, allFunctions } from '../src/model/symbolFunctions';
import { useStore } from '../src/model/store';
import { makeUserData, parseUserData } from '../src/model/userData';

const S = (name: string, category = '', extra: Partial<SymbolDef> = {}): SymbolDef =>
  ({ id: name, name, category, letter: 'A', role: 'single', prims: [], pins: [], ...extra });
const QET = 'qelectrotech-elements-main / Elettrica';

describe('funzione dei simboli', () => {
  it('codici unici e ogni regola porta a una funzione dell\'elenco', () => {
    const ids = BUILTIN_FUNCTIONS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each([
    ['Pulsante NC', 'Comandi', 'pulsante-nc'],
    ['Interruttore differenziale', `${QET} / Multifilare / Fusibili e protezioni`, 'differenziale'],
    ['Int. aut. magneto-termico 1P+N', `${QET} / Multifilare / Fusibili e protezioni`, 'magnetotermico'],
    ['Motore trifase', `${QET} / Multifilare / Utilizzatori e attuatori / Motori`, 'motore-3f'],
    ['5/2p [pneu]-[airspring]', 'qelectrotech-elements-main / Pneumatica / valvole', 'valvola-5-2'],
    ['750-458', `${QET} / Marchi produttori / WAGO Limited / Schematic / I-O 750 / AnalogIN`, 'plc-ai'],
    ['6ES7 221-1BF30-0XB0', `${QET} / Marchi produttori / Siemens / PLC e controllori / 6ES7-1200`, 'plc-di'],
    ['6ES7132-6BF01-0BA0 DARK', 'PLC', 'plc-do'],
    ['6ES7214-1AF50-0XB0', 'PLC', 'plc-cpu'],
    ['REX12D-TA2-100-DC24V-2A/2A', 'Macro EPLAN / ETA', 'protezione-elettronica'],
    ['XPS-AM', `${QET} / Marchi produttori / Schneider Electric / Preventa / Moduli di sicurezza`, 'rele-sicurezza'],
    ['Lampada spia', `${QET} / Multifilare / Segnalazione e comando`, 'lampada-spia'],
    ['2002-1291', `${QET} / Marchi produttori / WAGO Limited / Front-View / Terminals / Series 2002`, 'morsetto'],
    ['Sonda di temperatura', '', 'sonda-temperatura'],
    ['Xyz-123 unità', '', 'altro'],
  ])('%s → %s', (name, cat, f) => expect(guessFunction(S(name, cat))).toBe(f));
  it('ruolo e contatto del simbolo quando il nome non basta', () => {
    expect(guessFunction(S('Simbolo 1', 'Bobine e contatti', { role: 'aux', contact: 'NC' }))).toBe('contatto-nc');
    expect(guessFunction(S('Morsetto PE', '', { role: 'terminal' }))).toBe('morsetto-terra');
    expect(guessFunction(S('Canale', '', { role: 'plc', io: 'DI' }))).toBe('plc-canale');
  });
  it('funzione nuova dell\'utente: codice proprio, non uguale agli altri', () => {
    const a = newFunctionId('Barriera tipo 4', BUILTIN_FUNCTIONS);
    expect(a).toBe('u-barriera-tipo-4');
    expect(newFunctionId('Barriera tipo 4', allFunctions([{ id: a, name: 'x', group: 'Altro' }]))).toBe('u-barriera-tipo-4-2');
  });
  it('«Assegna le funzioni» cataloga la libreria; con «solo senza funzione» lascia quelle scelte', () => {
    useStore.setState({ symbolLibrary: [S('Contatto NA', 'Bobine e contatti', { role: 'aux', contact: 'NO' }), S('Motore trifase', '', { func: 'pompa' })] });
    expect(useStore.getState().assignSymbolFunctions(false)).toBe(1);
    expect(useStore.getState().symbolLibrary.map(x => x.func)).toEqual(['contatto-na', 'pompa']);
    expect(useStore.getState().assignSymbolFunctions(true)).toBe(1);
    expect(useStore.getState().symbolLibrary[1].func).toBe('motore-3f');
  });
  it('simboli importati: funzione proposta subito, quella già scelta resta', () => {
    expect(withFunctions([S('Relè termico', 'QET'), S('Relè termico', 'QET', { func: 'rele' })]).map(x => x.func)).toEqual(['rele-termico', 'rele']);
  });
  it('le funzioni dell\'utente viaggiano con i dati utente', () => {
    const d = parseUserData(JSON.stringify(makeUserData({ library: [], symbols: [], macros: [], templates: [], titleBlocks: [], favorites: [], functions: [{ id: 'u-x', name: 'X', group: 'Altro' }] })));
    expect(d.data!.functions).toEqual([{ id: 'u-x', name: 'X', group: 'Altro' }]);
  });
});
