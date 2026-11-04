// Immagini sullo schema e nuovi cartigli
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { exampleProject } from '../src/model/example';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { pageToDxf } from '../src/io/dxf';
import { BUILTIN_TITLE_BLOCKS, templateFields, titleBlockPrims, fillTitleText, placeholderValues } from '../src/model/titleBlocks';
import type { ImageItem } from '../src/model/types';

const img: ImageItem = { kind: 'image', id: 'i1', x: 50, y: 60, w: 80, h: 40, src: 'data:image/png;base64,AAAA', name: 'foto.png' };

describe('immagini sullo schema', () => {
  it('si spostano con la selezione e restano reimportando la pagina da testo', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = emptyProject();
    p.pages[0].elements.push({ ...img });
    st().loadProject(p);
    st().setSelection(['i1']);
    st().moveSelection(8, 4);
    expect(st().project.pages[0].elements[0]).toMatchObject({ x: 58, y: 64, w: 80, h: 40 });
    const text = pagesToText(st().project);
    expect(text).toContain('# immagine');
    const q = st().project;
    importPagesText(q, text);
    expect(q.pages[0].elements.some(e => e.kind === 'image')).toBe(true);
  });
  it('nel DXF resta il riquadro con il nome', () => {
    const p = emptyProject();
    p.pages[0].elements.push({ ...img });
    expect(pageToDxf(p, p.pages[0])).toContain('foto.png');
  });
});

describe('cartigli nuovi', () => {
  it('nove modelli inclusi, tutti dentro l\'area del cartiglio', () => {
    expect(BUILTIN_TITLE_BLOCKS.length).toBe(9);
    for (const t of BUILTIN_TITLE_BLOCKS) for (const q of t.prims) {
      if (q.t === 'rect') { expect(q.x + q.w).toBeLessThanOrEqual(390.01); expect(q.y + q.h).toBeLessThanOrEqual(35.01); }
    }
  });
  it('i campi usati dal modello si aggiungono scegliendolo', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    expect(templateFields(BUILTIN_TITLE_BLOCKS.find(t => t.id === 'macchina')!)).toContain('Matricola');
    st().useTitleBlock('macchina');
    expect(st().project.titleBlock?.fields?.map(f => f.label)).toContain('Matricola');
    // Valore predefinito annidato: senza «Macchina» compare il nome del progetto
    const p = st().project;
    const texts = titleBlockPrims(p, p.pages[0], 0).prims.flatMap(q => (q.t === 'text' ? [q.s] : []));
    expect(texts).toContain(p.info.name);
    expect(fillTitleText(p, '{campo:Tensione ausiliaria|24 V DC}', placeholderValues(p, p.pages[0], 0))).toBe('24 V DC');
  });
});
