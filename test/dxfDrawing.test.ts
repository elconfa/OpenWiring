import { describe, it, expect } from 'vitest';
import { dxfToPrims } from '../src/io/dxfImport';
import { pageToDxf } from '../src/io/dxf';
import { emptyProject } from '../src/model/project';

const DXF = ['0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '100', '21', '0',
  '0', 'CIRCLE', '8', '0', '10', '50', '20', '20', '40', '10',
  '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('disegno DXF sulla pagina', () => {
  it('si legge e torna nel DXF esportato, scalato sul riquadro', () => {
    const g = dxfToPrims(DXF, 300, 200);
    expect(g.prims.length).toBe(2);
    expect(g.width).toBe(100);
    const p = emptyProject();
    const pg = p.pages[0];
    pg.elements.push({ kind: 'image', id: 'i1', x: 50, y: 50, w: g.width * 2, h: g.height * 2, src: '', name: 'prova.dxf', vector: { prims: g.prims, w: g.width, h: g.height } });
    const out = pageToDxf(p, pg);
    expect(out).toContain('DISEGNI');
    // La linea lunga 100 mm, raddoppiata: da x 50 a x 250
    const lines = out.split(/\r?\n/);
    const i = lines.findIndex((l, k) => l === "DISEGNI" && lines[k - 2] === "LINE");
    expect(Number(lines[i + 2])).toBeCloseTo(50);
    expect(lines.slice(i, i + 12).map(Number)).toContain(250);
  });
});
