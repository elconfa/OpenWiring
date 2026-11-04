// Andata e ritorno nel formato testo: progetto → testo → progetto senza perdere niente. Se una funzione
// nuova aggiunge un dato agli elementi, ai cavi o alle morsettiere, la compilazione chiede di dire in
// TEXT_COVERAGE (src/model/textCoverage.ts) come lo porta il testo; questo test controlla che il dato
// torni davvero. Nel progetto di prova qui sotto va impostato anche il dato nuovo.
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { TEXT_COVERAGE, notInText } from '../src/model/textCoverage';
import type { Project, Element, Wire, CableLine, SymbolInstance, TextItem } from '../src/model/types';

/** Dati che il formato testo non porta, di proposito (le immagini restano sulla pagina, fuori dal testo) */
const dropped = (kind: Element['kind']) => (kind in TEXT_COVERAGE ? notInText(kind as keyof typeof TEXT_COVERAGE) : []);

/** Progetto di esempio con le funzioni recenti: linee dei cavi, conduttori, morsettiere, testi, articoli */
function richProject(): Project {
  const p = exampleProject();
  const pg = p.pages.find(x => x.elements.some(e => e.kind === 'cable'))!;
  const line = pg.elements.find((e): e is CableLine => e.kind === 'cable')!;
  Object.assign(line, { main: true, show: { type: false, description: true }, labelPos: 'aboveEnd', labelOffset: { x: 2, y: -1.5 }, shieldGround: 'start', shieldHeight: 6, condDir: 'v', look: { lineColor: '#cc0000', lineWidth: 0.35, textSize: 3, textColor: '#000000' } });
  const cable = p.cables!.find(c => c.id === line.cableId)!;
  Object.assign(cable, { marking: 'colors', pieces: true, pinsOf: '2K1', shield: true });
  const wires = pg.elements.filter((e): e is Wire => e.kind === 'wire');
  cable.assign[wires[0].id] = cable.conductors[1];
  cable.fixed = { [wires[1].id]: cable.conductors[0] };
  Object.assign(wires[2], { wireType: 'H07V-K', labelSize: 2.5, labelColor: '#c00000', labels: [{ x: 50, y: 60, vertical: true }], show: { number: false }, userProps: { Lunghezza: '2 m' } });
  const sym = pg.elements.find((e): e is SymbolInstance => e.kind === 'symbol' && !e.plcGroup)!;
  Object.assign(sym, { extraParts: [{ partNr: '3RV2901-1E', qty: 2 }, { partNr: 'X-NUOVO', descr: 'Manopola', manufacturer: 'ACME' }], userProps: { Colore: 'grigio' }, show: { tag: true, description: false }, textOffsets: { tag: { x: 1, y: -2 } }, contactImage: 'symbol', termText: 'perpendicular' });
  Object.assign(wires[3], { bundle: 'B1', tapStart: 'L1', tapEnd: 'L2', busCable: { tag: '9W1', type: 'Profinet', length: 4, partNr: 'PN-2X2' } });
  pg.elements.push({ kind: 'wiredef', id: 'wd1', points: [{ x: 300, y: 240 }, { x: 320, y: 240 }], cross: '2,5', label: { x: 324, y: 236 } });
  const zone = p.pages.flatMap(x => x.elements).find(e => e.kind === 'zone')!;
  Object.assign(zone, { label: { x: -12, y: 5.5 }, codeOnly: true, look: { lineColor: '#0055aa', textSize: 3.5 } });
  sym.mirror = true;
  pg.elements.push({ kind: 'text', id: 'tx1', x: 100, y: 100, text: 'Nota "importante"\nseconda riga', size: 2.5, rot: 90, align: 'middle', w: 40 } as TextItem);
  p.terminalStrips = {
    X1: {
      partNr: 'WDU 2.5', endStopPartNr: 'WEW 35/2', endStopQty: 3, endPlatePartNr: 'WAP 2.5-10', endPlateQty: 0, jumperPartNr: 'WQV 2.5/3', separatorPartNr: 'WTW 2.5',
      jumpers: [{ id: 'j1', kind: 'comb', terminals: ['1', '2', '3'] }, { id: 'j2', kind: 'fixed', terminals: ['4', '5'], partNr: 'WQV 2.5/2' }],
      spares: ['11', '12'], spareParts: { 11: 'WDK 2.5' }, separators: ['3'],
      accessories: [{ id: 'a1', partNr: 'TS35', qty: 1, note: 'guida 1 m' }],
    },
  };
  return p;
}

/** Senza le chiavi indicate e senza i valori vuoti (un testo "" vale come assente) */
const strip = (o: object, drop: string[]) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !drop.includes(k) && v !== undefined && v !== ''));

/** Forma confrontabile del progetto: niente identificativi, riferimenti scritti per pagina e posizione */
function canon(p: Project) {
  const sig = new Map<string, string>();
  for (const pg of p.pages) for (const e of pg.elements) {
    const at = 'points' in e ? JSON.stringify(e.points) : `${(e as { x: number }).x},${(e as { y: number }).y}`;
    sig.set(e.id, `${pg.name}@${at}`);
  }
  const cableTag = new Map((p.cables ?? []).map(c => [c.id, c.tag]));
  const panelCode = new Map((p.panels ?? []).map(x => [x.id, x.code]));
  const el = (e: Element) => {
    const drop = ['id', ...dropped(e.kind)];
    const o = strip(e, drop) as Record<string, unknown>;
    if (e.kind === 'symbol' && e.linkTo) o.linkTo = sig.get(e.linkTo) ?? e.linkTo;
    if (e.kind === 'cable') o.cableId = cableTag.get(e.cableId);
    if (e.kind === 'zone') o.panelId = panelCode.get(e.panelId);
    return JSON.stringify(o, Object.keys(o).sort());
  };
  const byWire = (m?: Record<string, string>) => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [sig.get(k) ?? k, v]).sort());
  return {
    pages: p.pages.filter(pg => !['plc', 'report', 'strip', 'cable', 'connector', 'system', 'cover', 'layout', 'notes'].includes(pg.type)).map(pg => ({
      name: pg.name, title: pg.title, type: pg.type, panel: pg.panelId ? panelCode.get(pg.panelId) : undefined,
      elements: pg.elements.filter(e => e.kind !== 'image').map(el).sort(),
    })),
    cables: (p.cables ?? []).map(c => ({ ...strip(c, ['id', 'assign', 'fixed']), assign: byWire(c.assign), fixed: byWire(c.fixed) ?? {} })),
    strips: Object.fromEntries(Object.entries(p.terminalStrips ?? {}).map(([k, d]) => [k, {
      ...strip(d, ['jumpers', 'accessories']), jumpers: d.jumpers.map(j => strip(j, ['id'])), accessories: d.accessories?.map(a => strip(a, ['id'])),
    }])),
    panels: (p.panels ?? []).map(x => strip(x, ['id'])),
    connectors: p.connectors ?? {},
    info: p.info,
  };
}

/** Lo stesso progetto senza le pagine di schema e senza i dati che il testo riscrive */
function emptied(p: Project): Project {
  const q = structuredClone(p);
  q.pages = q.pages.filter(pg => !['multiline', 'singleline', 'network'].includes(pg.type));
  q.cables = []; q.terminalStrips = {}; q.connectors = {}; q.panels = [];
  q.info = { name: '' } as Project['info'];
  return q;
}

describe('formato testo: andata e ritorno', () => {
  it('ogni dato portato dal testo è documentato nell\'aiuto del formato', async () => {
    const { TEXT_HELP } = await import('../src/model/textFormat');
    const attrs = Object.values(TEXT_COVERAGE).flatMap(m => Object.values(m as Record<string, string>)).filter(v => !v.startsWith('no:'))
      .flatMap(v => v.split(/\s+/)).filter(w => w.endsWith('=')).map(w => w.replace(/^.*\s/, ''));
    for (const a of new Set(attrs)) expect(TEXT_HELP, `manca ${a} nell'aiuto`).toContain(a);
  });

  it('progetto → testo → progetto: stessi elementi, cavi, conduttori, morsettiere e luoghi', () => {
    const p = richProject();
    const text = pagesToText(p);
    const q = emptied(p);
    const r = importPagesText(q, text);
    expect(r.errors).toEqual([]);
    // Ordine delle pagine: quelle di schema tornano in coda, conta il contenuto
    const a = canon(p), b = canon(q);
    expect(b.pages.sort((x, y) => x.name.localeCompare(y.name))).toEqual(a.pages.sort((x, y) => x.name.localeCompare(y.name)));
    expect(b.cables).toEqual(a.cables);
    expect(b.strips).toEqual(a.strips);
    expect(b.panels).toEqual(a.panels);
    expect(b.connectors).toEqual(a.connectors);
    expect(b.info).toEqual(a.info);
  });

  it('dal secondo giro il testo non cambia più', () => {
    const p = richProject();
    const q = emptied(p);
    importPagesText(q, pagesToText(p));
    const t2 = pagesToText(q);
    const q2 = emptied(q);
    expect(importPagesText(q2, t2).errors).toEqual([]);
    expect(pagesToText(q2)).toEqual(t2);
  });

  it('riscrivendo una pagina da testo i conduttori scelti dei suoi fili restano', () => {
    const p = richProject();
    const pg = p.pages.find(x => x.elements.some(e => e.kind === 'cable'))!;
    const cable = p.cables![0];
    const before = Object.values(cable.assign);
    importPagesText(p, pagesToText(p, { pageIds: [pg.id], projectData: false }));
    expect(Object.values(p.cables![0].assign)).toEqual(before);
    // Le chiavi sono i fili nuovi della pagina riscritta
    const ids = new Set(p.pages.flatMap(x => x.elements.map(e => e.id)));
    expect(Object.keys(p.cables![0].assign).every(k => ids.has(k))).toBe(true);
  });
});
