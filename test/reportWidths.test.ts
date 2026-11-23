// Pagine di una lista: le colonne si misurano su tutta la lista, così ogni pagina ha le stesse larghezze
import { describe, it, expect } from 'vitest';
import { reportColumns } from '../src/model/reportStyle';

describe('larghezze delle colonne delle liste', () => {
  it('con le lunghezze di tutta la lista due pagine hanno le stesse colonne', () => {
    const columns = ['Sigla', 'Descrizione', 'Costruttore'];
    const p1 = { title: 'L', columns, rows: [['K1', 'Relè', 'Finder']] };
    const p2 = { title: 'L', columns, rows: [['K200', 'Contattore di potenza con bobina 24 V DC', 'Schneider Electric']] };
    const lens = [4, 40, 18];
    const w = (t: typeof p1) => reportColumns(t, {}, undefined, lens).map(c => Math.round(c.w * 100));
    expect(w(p1)).toEqual(w(p2));
    // Senza: ogni pagina si misura da sola e le colonne cambiano
    const own = (t: typeof p1) => reportColumns(t, {}).map(c => Math.round(c.w * 100));
    expect(own(p1)).not.toEqual(own(p2));
  });
});
