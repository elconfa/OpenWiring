import { describe, it, expect } from 'vitest';
import { COMMANDS, comboOf, commandFor } from '../src/ui/shortcuts';

const ev = (key: string, mod = false, shift = false, alt = false) => ({ key, metaKey: mod, ctrlKey: false, shiftKey: shift, altKey: alt });

describe('scorciatoie da tastiera', () => {
  it('combinazioni dai tasti premuti', () => {
    expect(comboOf(ev('z', true))).toBe('Mod+Z');
    expect(comboOf(ev('Z', true, true))).toBe('Mod+Maiusc+Z');
    expect(comboOf(ev('Delete'))).toBe('Canc');
    expect(comboOf(ev('PageDown'))).toBe('PagGiù');
    expect(comboOf(ev('F5'))).toBe('F5');
    expect(comboOf(ev('Shift', false, true))).toBeUndefined();
    expect(comboOf(ev('Escape'))).toBeUndefined();
  });
  it('i tasti di serie portano ai comandi e non si ripetono', () => {
    expect(commandFor('Mod+Z')?.id).toBe('undo');
    expect(commandFor('Mod+Y')?.id).toBe('redo');
    expect(commandFor('W')?.id).toBe('wire');
    const all = COMMANDS.flatMap(c => c.keys);
    expect(new Set(all).size).toBe(all.length);
  });
});
