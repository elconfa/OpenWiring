// Dati commerciali CSV esportati da EPLAN: articoli nuovi o completamento di quelli dell'EDZ
import { describe, it, expect } from 'vitest';
import { parseCommercialCsv, mergeCommercial, parseCsv } from '../src/io/commercialCsv';

const CSV = `"Part number","Manufacturer (abbreviation)","Manufacturer (full name)","Type number","Order number","Product group","Description 1","Description 2","Description 3","Long description","Link to graphic file","Link to external document 1","Link to external document 2","Link to external document 3"
#
#
SIE.3RM1101-1AA04,SIE,Siemens,3RM1101-1AA04,3RM1101-1AA04,,"DIR. STARTER 0,1-0,5A, 24V SAFETY SCREW","SIRIUS Fail-safe direct starter","With electronic overload protection","Motor starter SIRIUS 3RM1",,Siemens\\3RM1101-1AA04_de.pdf,,https://support.industry.siemens.com/cs/ww/de/ps/3RM1101-1AA04
`;

describe('dati commerciali CSV di EPLAN', () => {
  it('virgolette con virgole dentro e righe # ignorate', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
    const { parts } = parseCommercialCsv(CSV, 'commercial_data.csv');
    expect(parts.length).toBe(1);
    expect(parts[0]).toMatchObject({
      partNr: 'SIE.3RM1101-1AA04', manufacturer: 'Siemens', typeNr: '3RM1101-1AA04', orderNr: '3RM1101-1AA04',
      descr1: 'DIR. STARTER 0,1-0,5A, 24V SAFETY SCREW', descr2: 'SIRIUS Fail-safe direct starter', note: 'Motor starter SIRIUS 3RM1',
    });
    expect(parts[0].attrs['Link to external document 3']).toContain('siemens.com');
    expect(parts[0].attrs.P_ARTICLE_MANUFACTURER).toBe('SIE');
  });
  it('un articolo già importato da EDZ si completa senza perdere simbolo e morsetti', () => {
    const { parts } = parseCommercialCsv(CSV, 'x.csv');
    const edz = { partNr: 'SIE.3RM1101-1AA04', descr1: 'Avviatore', symbolId: 'bb1', functionTemplates: [{ connections: ['1', '2'] }], attrs: { P_ARTICLE_DESCR1: 'Avviatore' } } as never;
    const m = mergeCommercial(edz, parts[0]);
    expect(m).toMatchObject({ descr1: 'Avviatore', symbolId: 'bb1', manufacturer: 'Siemens', note: 'Motor starter SIRIUS 3RM1' });
    expect(m.functionTemplates.length).toBe(1);
    expect(m.attrs.P_ARTICLE_DESCR1).toBe('Avviatore');
    expect(m.attrs['Link to external document 3']).toBeTruthy();
  });
  it('senza la colonna dell\'articolo', () => {
    expect(parseCommercialCsv('a,b\n1,2', 'x').error).toBeTruthy();
  });
});
