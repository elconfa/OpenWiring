import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { checkProject } from '../src/model/checks';
import { importPagesText } from '../src/model/textFormat';
import { lockWireNumbers } from '../src/model/netlist';

describe('verifica dello schema', () => {
  it('l\'esempio non ha problemi (le barre di potenziale al bordo non sono fili liberi)', () => {
    expect(checkProject(exampleProject())).toEqual([]);
  });
  it('trova orfani, cortocircuiti, collegamenti apparenti, sovrapposizioni e dati inutilizzati', () => {
    const p = exampleProject();
    // Numeri bloccati: un numero scritto a mano uguale a uno già assegnato resta doppio
    lockWireNumbers(p);
    const r = importPagesText(p, `
pagina 9 "Errori voluti"
  simbolo potential L1 @28,24
  simbolo potential N @28,32
  filo 28,24 400,24
  filo 28,32 400,32
  filo 60,24 60,32                         # L1 e N in corto
  simbolo coil -9K1 @100,60
  filo 100,40 100,60
  filo 100,60 90,60 90,76 100,76           # A1 e A2 sullo stesso conduttore
  filo 100,40 120,40 n=2.01                 # numero filo già usato a pagina 2
  simbolo lamp -9P1 @160,60
  filo 160,40 160,90                        # passa sopra i punti della lampada senza terminarci
  simbolo no -9K2 @200,60                   # contatto senza bobina e non collegato
  simbolo lamp -9P2 @240,60
  simbolo lamp -9P2 @240,60                 # incollato due volte
  simbolo lamp -9P3 @280,60
  filo 280,40 280,60                        # X2 della lampada resta libero
  filo 300,100 340,100                      # filo isolato
  filo 300,100 320,100                      # sovrapposto al precedente
`);
    expect(r.errors).toEqual([]);
    p.parts.push({ partNr: 'NON.USATO', descr1: 'Relè', functionTemplates: [], attrs: {} });
    const pg = p.pages.find(x => x.name === '9')!;
    const m = checkProject(p).filter(i => !i.pageId || i.pageId === pg.id || i.kind === 'Cortocircuiti').map(i => `${i.level} ${i.kind}: ${i.msg}`);
    expect(m).toContain('error Cortocircuiti: Potenziali L1 e N collegati tra loro');
    expect(m.some(x => /error Cortocircuiti: -9K1 \(Bobina relè\/contattore\) cortocircuitato/.test(x))).toBe(true);
    expect(m).toContain('error Numeri filo: Numero filo 2.01 usato da 2 conduttori diversi');
    expect(m.some(x => x.startsWith('error Collegamenti: -9P1:X1 sembra collegato'))).toBe(true);
    expect(m).toContain('warn Orfani: -9K2: Contatto NA senza collegamenti');
    expect(m).toContain('error Contatti: -9K2: contatto senza bobina o dispositivo principale');
    expect(m).toContain('error Simboli: -9P2: due simboli uguali sovrapposti nello stesso punto');
    expect(m).toContain('warn Collegamenti: -9P3:X2 non collegato');
    expect(m).toContain('warn Orfani: Filo isolato: non collega nessun punto di connessione');
    expect(m).toContain('warn Fili: Fili sovrapposti per 20 mm');
    expect(m).toContain('info Orfani: Articolo NON.USATO (Relè) copiato nel progetto ma non usato');
  });
});
