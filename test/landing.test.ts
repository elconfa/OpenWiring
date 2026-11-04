import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import { importPagesText } from '../src/model/textFormat';
import { terminalConnections } from '../src/model/terminals';

describe('dove arriva il filo', () => {
  it('il morsetto mostra il pin collegato, anche oltre un rimando; sul potenziale solo il nome', () => {
    const p = emptyProject();
    const r = importPagesText(p, `
simbolodef dev2 "Dispositivo" lettera=U pin="1:0,0 2:8,0 3:16,0"
pagina 1 "Campo"
  simbolo potential L+ @20,40
  filo 20,40 300,40
  simbolo dev2 -1U1 @100,100
  simbolo terminal -X1:1 @100,140
  simbolo terminal -X1:2 @108,140
  simbolo terminal -X1:3 @116,140
  filo 100,100 100,140
  filo 108,100 108,140
  filo 116,40 116,140
  simbolo potential L+ @200,40
  filo 200,40 200,80
  simbolo dev2 -1U2 @200,80
  simbolo link E1 @108,200
  filo 108,148 108,200
pagina 2 "Quadro"
  simbolo link_in E1 @60,40
  filo 60,40 60,80
  simbolo dev2 -2A1 @60,80
`);
    expect(r.errors).toEqual([]);
    const c = new Map(terminalConnections(p, 'X1').map(x => [x.row.no, x]));
    expect(c.get('1')!.ext).toBe('-1U1:1');
    expect(c.get('2')!.int).toBe('-2A1:1');
    // Morsetto sul potenziale: il nome, non tutti i punti del potenziale
    expect(c.get('3')!.ext).toBe('L+');
  });
});
