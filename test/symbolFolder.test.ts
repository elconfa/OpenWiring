// Libreria dei simboli in una cartella: un file .ecsym per simbolo, sottocartelle = categorie
import { describe, it, expect } from 'vitest';
import type { SymbolDef } from '../src/model/types';
import { symbolFileText, symbolFromFile, symbolRelPath, loadSymbolFiles, dirOfCategory, categoryOfRel, ROOT_CATEGORY, safeName, safeRel } from '../src/io/symbolFolder';
import { symbolCatalog, importPagesText } from '../src/model/textFormat';
import { agentGuide } from '../src/model/agentGuide';
import { emptyProject } from '../src/model/project';
import { setLibrarySymbols } from '../src/model/geometry';

const sez4: SymbolDef = {
  id: 'user:sez4', name: 'Sezionatore 4 poli', category: 'Sezionatori / Rotativi', letter: 'Q', role: 'single',
  prims: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 16 }],
  pins: [0, 8, 16, 24].flatMap((x, k) => [
    { id: String(2 * k + 1), x, y: 0, dir: 'up' as const, label: String(2 * k + 1) },
    { id: String(2 * k + 2), x, y: 16, dir: 'down' as const, label: String(2 * k + 2) },
  ]),
};

describe('cartella dei simboli', () => {
  it('un simbolo diventa un file nella sottocartella della sua categoria, e ritorna uguale', () => {
    const rel = symbolRelPath(sez4, () => false);
    expect(rel).toBe('Sezionatori/Rotativi/Sezionatore 4 poli.ecsym');
    const back = symbolFromFile(rel, symbolFileText(sez4));
    expect(back).toEqual(sez4);
    // La categoria viene dalla cartella, non dal file: spostare il file cambia gruppo
    expect(symbolFromFile('Miei/Sezionatore 4 poli.ecsym', symbolFileText(sez4)).category).toBe('Miei');
  });
  it('i simboli personali stanno nella cartella principale; nomi occupati e caratteri non validi', () => {
    expect(dirOfCategory(ROOT_CATEGORY)).toBe('');
    expect(categoryOfRel('x.ecsym')).toBe(ROOT_CATEGORY);
    const s = { ...sez4, name: 'Relè 24V: K/A', category: ROOT_CATEGORY };
    expect(symbolRelPath(s, r => r === 'Rele 24V- K-A.ecsym')).toBe('Rele 24V- K-A (2).ecsym');
  });
  it('nomi di cartelle e file uguali su Mac e Windows: niente accenti né segni particolari', () => {
    expect(dirOfCategory('Macro EPLAN · ETA')).toBe('Macro EPLAN/ETA');
    expect(dirOfCategory('Relè e contattori / Ausiliari')).toBe('Rele e contattori/Ausiliari');
    expect(safeName('Bobina 24 V⎓ «K» ñ Ø 10 µF ±5%')).toBe('Bobina 24 V- -K- n O 10 uF +-5');
    expect(safeName('aux')).toBe('aux_');
    expect(safeName('···')).toBe('simbolo');
    // I file già scritti con nomi vecchi si rinominano
    expect(safeRel('Macro EPLAN · SE/Relè termico.ecsym')).toBe('Macro EPLAN/SE/Rele termico.ecsym');
    expect(safeRel('Macro EPLAN/SE/A9C21134.ecsym')).toBe('Macro EPLAN/SE/A9C21134.ecsym');
  });
  it('una copia fatta a mano dello stesso file diventa un simbolo distinto; i file guasti si segnalano', () => {
    const t = symbolFileText(sez4);
    const r = loadSymbolFiles([{ rel: 'A/x.ecsym', text: t }, { rel: 'B/x.ecsym', text: t }, { rel: 'rotto.ecsym', text: '{' }]);
    expect(r.symbols.map(s => s.id)).toEqual(['user:sez4', 'file:B/x.ecsym']);
    expect(r.errors).toHaveLength(1);
  });
  it('il catalogo per gli agenti comprende la libreria dell\'utente, non i simboli importati in blocco', () => {
    const qet: SymbolDef = { ...sez4, id: 'qet:1', name: 'Importato', source: 'QElectroTech (CC-BY 3.0)', category: 'QET' };
    const cat = symbolCatalog(emptyProject(), [sez4, qet]);
    expect(cat).toContain('user:sez4 · Sezionatore 4 poli · Q');
    expect(cat).toContain('7 (24,0↑)');
    expect(cat).not.toContain('qet:1');
    expect(cat).toContain('Altri 1 simboli importati');
    expect(symbolCatalog(emptyProject(), [sez4, qet], true)).toContain('qet:1');
    expect(agentGuide(emptyProject(), [sez4])).toContain('user:sez4');
  });
  it('un testo che usa un simbolo della cartella lo copia nel progetto', () => {
    setLibrarySymbols([sez4]);
    const p = emptyProject();
    const r = importPagesText(p, 'pagina 1 "Potenza"\nsimbolo user:sez4 -1Q1 @100,80\n');
    expect(r.errors).toEqual([]);
    expect(p.customSymbols.map(s => s.id)).toContain('user:sez4');
    setLibrarySymbols([]);
  });
});
