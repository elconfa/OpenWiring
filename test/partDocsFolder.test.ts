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

import { docKind, kindFromFolder, kindFromName } from '../src/model/partDocs';

describe('tipi di documento degli articoli', () => {
  it('dalla sottocartella di Documenti', () => {
    expect(kindFromFolder('Dichiarazioni/CE/3RT2.pdf')).toBe('ce');
    expect(kindFromFolder('dichiarazioni/ul/3RT2.pdf')).toBe('ul');
    expect(kindFromFolder('Dichiarazioni/Altre/RoHS.pdf')).toBe('decl');
    expect(kindFromFolder('Manuali/S7-1200.pdf')).toBe('manual');
    expect(kindFromFolder('Data Sheet/Siemens/3RT2.pdf')).toBe('datasheet');
    expect(kindFromFolder('C:\\Users\\m\\Documents\\OpenWiring\\Articoli\\Documenti\\Dichiarazioni\\UL\\x.pdf')).toBe('ul');
    expect(kindFromFolder('Siemens/x.pdf')).toBeUndefined();
    expect(kindFromFolder('/Users/m/Downloads/Manuali/x.pdf')).toBeUndefined();
  });
  it('dal nome del file', () => {
    expect(kindFromName('3RT2015_DoC_EN.pdf')).toBe('ce');
    expect(kindFromName('Konformitätserklärung 3RV2')).toBe('ce');
    expect(kindFromName('UL_certificate_E123.pdf')).toBe('ul');
    expect(kindFromName('cULus listing')).toBe('ul');
    expect(kindFromName('RoHS-REACH declaration.pdf')).toBe('decl');
    expect(kindFromName('S7-1200 System Manual.pdf')).toBe('manual');
    expect(kindFromName('Datenblatt 3RT2015.pdf')).toBe('datasheet');
    expect(kindFromName('3RT2015-1BB41.pdf')).toBeUndefined();
    expect(kindFromName('Cella.pdf')).toBeUndefined();
  });
  it('scelto a mano vale su cartella e nome; di serie scheda tecnica', () => {
    expect(docKind({ name: 'x', path: 'Manuali/x.pdf', kind: 'ce' })).toBe('ce');
    expect(docKind({ name: 'Manuale d\'uso', path: 'Data Sheet/x.pdf' })).toBe('datasheet');
    expect(docKind({ name: 'Manuale d\'uso', path: '/tmp/x.pdf' })).toBe('manual');
    expect(docKind({ name: '3RT2', path: 'https://x.it/a' })).toBe('datasheet');
  });
});
