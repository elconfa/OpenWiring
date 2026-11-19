import { describe, expect, it } from 'vitest';
import { isAbsPath, isPdfDoc, isRelDoc, relToFolder } from '../src/model/partDocs';

describe('schede tecniche con percorso relativo alla cartella Documenti', () => {
  it('riconosce percorsi assoluti, relativi e indirizzi web', () => {
    expect(isAbsPath('/Users/m/Documents/a.pdf')).toBe(true);
    expect(isAbsPath('C:\\Dati\\a.pdf')).toBe(true);
    expect(isAbsPath('\\\\server\\schede\\a.pdf')).toBe(true);
    expect(isAbsPath('Siemens/a.pdf')).toBe(false);
    expect(isRelDoc('Siemens/a.pdf')).toBe(true);
    expect(isRelDoc('https://x.it/a.pdf')).toBe(false);
    expect(isRelDoc('/a.pdf')).toBe(false);
    expect(isPdfDoc('Siemens/a.pdf')).toBe(true);
  });
  it('percorso relativo solo per i file dentro la cartella', () => {
    const mac = '/Users/m/Documents/OpenWiring/Articoli/Documenti';
    expect(relToFolder(mac, `${mac}/Siemens/S7-1200.pdf`)).toBe('Siemens/S7-1200.pdf');
    expect(relToFolder(`${mac}/`, `${mac}/a.pdf`)).toBe('a.pdf');
    expect(relToFolder(mac, '/Users/m/Downloads/a.pdf')).toBeNull();
    expect(relToFolder(mac, `${mac}Vecchi/a.pdf`)).toBeNull();
    expect(relToFolder(mac, `${mac.toUpperCase()}/a.pdf`)).toBeNull();
    const win = 'C:\\Users\\m\\Documents\\OpenWiring\\Articoli\\Documenti';
    expect(relToFolder(win, 'c:\\users\\m\\documents\\openwiring\\articoli\\documenti\\ABB\\x.pdf')).toBe('ABB/x.pdf');
    expect(relToFolder(win, 'D:\\x.pdf')).toBeNull();
  });
});
