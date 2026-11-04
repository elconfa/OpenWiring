// App desktop: la libreria dei simboli segue la cartella (cartella simulata in memoria)
import { describe, it, expect } from 'vitest';
import type { SymbolDef } from '../src/model/types';
import { symbolFileText } from '../src/io/symbolFolder';

const files = new Map<string, string>();
let changed: (() => void) | undefined;
/** Eseguito mentre la cartella si legge (per simulare un salvataggio a metà lettura) */
let duringRead: (() => void) | undefined;
const wait = () => new Promise(r => setTimeout(r, 30));
(window as unknown as { elettro: unknown }).elettro = {
  openFile: async () => [], saveFile: async () => undefined,
  symlibRead: async () => {
    const snapshot = [...files].map(([rel, text]) => ({ rel, text }));
    duringRead?.(); duringRead = undefined;
    await new Promise(r => setTimeout(r, 5));
    return { dir: '/Documenti/OpenWiring/Simboli', files: snapshot };
  },
  symlibWrite: async (w: { rel: string; text: string }[], removes: string[]) => { for (const f of w) files.set(f.rel, f.text); for (const r of removes) files.delete(r); return true; },
  onSymlibChanged: (cb: () => void) => { changed = cb; return () => {}; },
};

const sym = (id: string, name: string, category: string): SymbolDef =>
  ({ id, name, category, letter: 'Q', role: 'single', prims: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 8 }], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1' }] });

describe('sincronizzazione con la cartella dei simboli', () => {
  it('copia la libreria esistente, salva, sposta, elimina e ricarica le modifiche esterne', async () => {
    const { useStore } = await import('../src/model/store');
    const { startSymbolFolder } = await import('../src/ui/symbolFolderSync');
    const st = useStore.getState;
    // Primo avvio: la libreria già nell'app finisce nella cartella
    useStore.setState({ symbolLibrary: [sym('user:a', 'Sezionatore 4 poli', 'Simboli personali')] });
    await startSymbolFolder();
    expect([...files.keys()]).toEqual(['Sezionatore 4 poli.ecsym']);
    expect(st().symbolDir).toBe('/Documenti/OpenWiring/Simboli');
    // Simbolo nuovo in un gruppo: sottocartella
    st().addSymbolsToLibrary([sym('user:b', 'Relè', 'Relè / Interfaccia')], '');
    await wait();
    expect(files.has('Rele/Interfaccia/Rele.ecsym')).toBe(true);
    // Cambio di categoria: il file si sposta
    st().addSymbolsToLibrary([sym('user:b', 'Relè', 'Ausiliari')], '');
    await wait();
    expect([...files.keys()].sort()).toEqual(['Ausiliari/Rele.ecsym', 'Sezionatore 4 poli.ecsym']);
    // Gruppo tolto dalla libreria: file eliminato
    st().removeSymbolCategory('Ausiliari');
    await wait();
    expect([...files.keys()]).toEqual(['Sezionatore 4 poli.ecsym']);
    // Dall'esterno: un file copiato da un'altra installazione e uno eliminato
    files.set('Altro PC/Pulsante.ecsym', symbolFileText(sym('user:c', 'Pulsante', 'x')));
    files.delete('Sezionatore 4 poli.ecsym');
    changed!();
    await wait();
    expect(st().symbolLibrary.map(s => [s.id, s.category])).toEqual([['user:c', 'Altro PC']]);
    // La ricarica non riscrive nulla
    expect([...files.keys()]).toEqual(['Altro PC/Pulsante.ecsym']);
    // File arrivati con caratteri particolari (es. da una versione precedente): rinominati una volta
    files.set('Macro EPLAN · SE/Relè termico.ecsym', symbolFileText(sym('user:d', 'Relè termico', 'x')));
    changed!();
    await wait();
    expect([...files.keys()].sort()).toEqual(['Altro PC/Pulsante.ecsym', 'Macro EPLAN/SE/Rele termico.ecsym']);
    expect(st().symbolLibrary.find(s => s.id === 'user:d')?.category).toBe('Macro EPLAN / SE');
  });

  it('un simbolo salvato mentre la cartella si ricarica non scompare e il file resta', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    duringRead = () => st().addSymbolsToLibrary([sym('user:e', 'Motore nuovo', 'Simboli personali')], '');
    changed!();
    await wait(); await wait();
    expect(st().symbolLibrary.some(s => s.id === 'user:e')).toBe(true);
    expect(files.has('Motore nuovo.ecsym')).toBe(true);
    // Un'altra modifica della libreria non lo elimina
    st().addSymbolsToLibrary([sym('user:f', 'Lampada', 'Simboli personali')], '');
    await wait();
    expect(files.has('Motore nuovo.ecsym')).toBe(true);
    expect(st().symbolLibrary.some(s => s.id === 'user:e')).toBe(true);
  });
});
