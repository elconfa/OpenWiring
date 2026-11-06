import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { foreignDevices } from '../src/model/network';
import { checkProject } from '../src/model/checks';
import { pagesFor } from '../src/io/pdfOptions';
import { getSymbol } from '../src/model/geometry';

// Esempio: un dispositivo disegnato in una pagina del +Q1 ma montato nel +Q2 (luogo scritto)
const make = (kind?: string) => {
  const p = exampleProject();
  const [q1, q2] = p.panels!;
  if (kind) q2.kind = kind;
  const page = p.pages.find(pg => pg.panelId === q1.id)!;
  const el = page.elements.find(e => e.kind === 'symbol' && e.tag && getSymbol(e.symbolId, p)?.role === 'single')!;
  if (el.kind !== 'symbol') throw new Error();
  el.loc = q2.code;
  return { p, q1, q2, page, tag: el.tag! };
};

describe('dispositivi disegnati nelle pagine di un altro quadro', () => {
  it('li trova e li segnala nei controlli', () => {
    const { p, q1, q2, page, tag } = make();
    const f = foreignDevices(p);
    expect(f.map(x => [x.tag, x.panel.id, x.pagePanel.id])).toContainEqual([tag, q2.id, q1.id]);
    expect(f.find(x => x.tag === tag)!.pages.map(x => x.id)).toContain(page.id);
    expect(checkProject(p).some(i => i.level === 'warn' && i.msg.startsWith(`+${q2.code}-${tag} `) && i.msg.includes(`+${q1.code}`))).toBe(true);
  });
  it('a bordo macchina o in campo non è un problema', () => {
    expect(foreignDevices(make('Bordo macchina').p)).toEqual([]);
    expect(foreignDevices(make('Campo').p)).toEqual([]);
  });
  it('un sottoluogo dello stesso quadro non conta', () => {
    const { p, q1, q2 } = make();
    q2.parentId = q1.id;
    expect(foreignDevices(p)).toEqual([]);
  });
  it('nel PDF del solo +Q2 la pagina entra solo con l\'opzione', () => {
    const { p, q1, page } = make();
    const base = { pages: 'all', skipPanels: [q1.id] };
    expect(pagesFor(p, base).some(x => x.id === page.id)).toBe(false);
    expect(pagesFor(p, { ...base, foreignPages: true }).some(x => x.id === page.id)).toBe(true);
    // stampando tutto, niente cambia
    expect(pagesFor(p, { pages: 'all', foreignPages: true }).length).toBe(pagesFor(p, { pages: 'all' }).length);
  });
});
