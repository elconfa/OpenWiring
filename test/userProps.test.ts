// Proprietà definite dall'utente come in EPLAN: import/export XML, valori e cartiglio
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { parseUserPropsXml, userPropsToXml, userPropIdError, mlText, mergeDefs } from '../src/model/userProps';
import { fillTitleText, placeholderValues } from '../src/model/titleBlocks';
import type { SymbolInstance } from '../src/model/types';

describe('proprietà definite dall\'utente', () => {
  it('nome identificativo come in EPLAN', () => {
    expect(userPropIdError('Ditta.Commessa')).toBeUndefined();
    expect(userPropIdError('Commessa')).toBeDefined();
    expect(userPropIdError('.Commessa')).toBeDefined();
    expect(userPropIdError('EPLAN.Prova')).toBeDefined();
    expect(userPropIdError('Ditta.Com messa')).toBeDefined();
  });

  it('testi multilingua di EPLAN', () => {
    expect(mlText('de_DE@Auftrag;it_IT@Commessa;en_US@Order;', 'it')).toBe('Commessa');
    expect(mlText('de_DE@Auftrag;en_US@Order;', 'it')).toBe('Order');
    expect(mlText('Semplice', 'it')).toBe('Semplice');
  });

  it('legge un XML con nomi in inglese o tedesco, elenchi di scelta e proprietà dismesse', () => {
    const xml = `<?xml version="1.0"?>
<UserDefinedProperties>
  <UserDefinedProperty IdentifyingName="ACME.Order.Code" DisplayName="de_DE@Auftrag;it_IT@Commessa;" Assignment="Project" FieldType="Text" Category="Gestione" />
  <Eigenschaft Identifikationsname="ACME.Safety.SIL" Anzeigename="it_IT@Livello SIL;" Zuordnung="Funktion" Feldtyp="Ganzzahl" Eingabehilfe="Auswahlliste">
    <Auswahlliste><Wert>it_IT@1;</Wert><Wert>it_IT@2;</Wert><Wert>it_IT@3;</Wert></Auswahlliste>
  </Eigenschaft>
  <UserDefinedProperty IdentifyingName="ACME.Old" DoNotUseAnymore="true" FieldType="Bool" Assignment="Page" />
  <UserDefinedProperty IdentifyingName="NoDot" FieldType="Text" />
</UserDefinedProperties>`;
    const r = parseUserPropsXml(xml, 'it');
    expect(r.skipped).toBe(1);
    expect(r.defs).toEqual([
      { id: 'ACME.Order.Code', name: 'Commessa', assign: 'project', type: 'text', category: 'Gestione' },
      { id: 'ACME.Safety.SIL', name: 'Livello SIL', assign: 'function', type: 'int', choices: ['1', '2', '3'], input: 'list' },
      { id: 'ACME.Old', name: 'Old', assign: 'page', type: 'bool', obsolete: true },
    ]);
    // Export e reimport: stesse definizioni (senza quelle dismesse)
    const back = parseUserPropsXml(userPropsToXml(r.defs, 'it'), 'it').defs;
    expect(back).toEqual(r.defs.filter(d => !d.obsolete));
    expect(mergeDefs(r.defs, [{ id: 'ACME.Old', name: 'Vecchia', assign: 'page', type: 'text' }])).toMatchObject({ added: 0, updated: 1 });
  });

  it('valori su dispositivo, pagina, progetto e collegamento; nel cartiglio con {prop:…}', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = emptyProject();
    p.settings.autoConnect = false;
    st().loadProject(p);
    st().setUserPropDefs([
      { id: 'ACME.SIL', name: 'SIL', assign: 'function', type: 'int' },
      { id: 'ACME.Commessa', name: 'Commessa', assign: 'project', type: 'text' },
      { id: 'ACME.Zona', name: 'Zona', assign: 'page', type: 'text' },
    ]);
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const c = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    st().mergeIntoDevice(c.id, k.tag);
    st().setUserProp({ kind: 'device', instId: c.id }, 'ACME.SIL', '2');
    st().setUserProp({ kind: 'project' }, 'ACME.Commessa', 'C-77');
    st().setUserProp({ kind: 'page', pageId: st().project.pages[0].id }, 'ACME.Zona', 'Z1');
    const els = st().project.pages[0].elements as SymbolInstance[];
    // Il valore vale per tutto il dispositivo (bobina e contatto), scritto una volta sola
    expect(els.filter(e => e.userProps?.['ACME.SIL'] === '2').length).toBe(1);
    const pr = st().project;
    const v = placeholderValues(pr, pr.pages[0], 0);
    expect(fillTitleText(pr, 'Commessa {prop:ACME.Commessa} · {prop:ACME.Zona}', v)).toBe('Commessa C-77 · Z1');
    st().setUserProp({ kind: 'project' }, 'ACME.Commessa', '');
    expect(st().project.userPropValues).toBeUndefined();
  });
});
