// CAD 2D dei simboli: export del simbolo in DXF R12 (millimetri, asse y verso l'alto), da riaprire
// con «Importa DXF…» o in un altro CAD. Un livello DXF per ogni livello del simbolo; i punti di
// connessione su un livello a parte, come cerchietti con la loro designazione.
import type { Prim, SymbolDef } from '../model/types';
import { WIRE_LINE_TYPES, primLineType } from '../model/types';
import { norm } from './geom';

/** Nome del livello DXF: lettere, cifre e trattini bassi */
const layerName = (s: string | undefined) => (s ?? '0').normalize('NFD').replace(/[^\w-]+/g, '_').toUpperCase() || '0';

export function symbolToDxf(sym: SymbolDef): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === 'number' ? v.toFixed(4) : v);
  const Y = (y: number) => -y;
  const head = (kind: string, p: Prim | undefined, layer?: string) => {
    g(0, kind); g(8, layer ?? layerName(p && 'layer' in p ? p.layer : undefined));
    if (p && p.t !== 'text') { const lt = WIRE_LINE_TYPES.find(x => x.id === primLineType(p)); if (lt && lt.id !== 'solid') g(6, lt.dxf); }
  };
  const line = (p: Prim, x1: number, y1: number, x2: number, y2: number) => { head('LINE', p); g(10, x1); g(20, Y(y1)); g(30, 0); g(11, x2); g(21, Y(y2)); g(31, 0); };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$INSUNITS'); g(70, '4'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  const LTYPES: [string, number[]][] = [['CONTINUOUS', []], ['DASHED', [3, -1.5]], ['DASHDOT', [4, -1.2, 0, -1.2]], ['DOT', [0, -1.2]]];
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, String(LTYPES.length));
  for (const [name, pat] of LTYPES) {
    g(0, 'LTYPE'); g(2, name); g(70, '0'); g(3, name); g(72, '65'); g(73, String(pat.length));
    g(40, pat.reduce((s, v) => s + Math.abs(v), 0));
    for (const v of pat) g(49, v);
  }
  g(0, 'ENDTAB');
  const layers = ['0', ...new Set([...(sym.layers ?? []).map(l => layerName(l.name)), ...sym.prims.map(p => layerName('layer' in p ? p.layer : undefined)), 'PUNTI_CONNESSIONE'])];
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, String(layers.length));
  for (const l of [...new Set(layers)]) { g(0, 'LAYER'); g(2, l); g(70, '0'); g(62, l === 'PUNTI_CONNESSIONE' ? '3' : '7'); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const p of sym.prims) {
    switch (p.t) {
      case 'line': line(p, p.x1, p.y1, p.x2, p.y2); break;
      case 'rect': {
        const c = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
        c.forEach((a, i) => { const b = c[(i + 1) % 4]; line(p, a[0], a[1], b[0], b[1]); });
        break;
      }
      case 'poly': {
        const q = p.closed ? [...p.pts, p.pts[0]] : p.pts;
        for (let i = 0; i < q.length - 1; i++) line(p, q[i].x, q[i].y, q[i + 1].x, q[i + 1].y);
        break;
      }
      case 'circle': head('CIRCLE', p); g(10, p.cx); g(20, Y(p.cy)); g(30, 0); g(40, p.r); break;
      case 'arc':
        // Con y verso l'alto gli angoli cambiano segno e il verso si inverte (in DXF sempre antiorario)
        head('ARC', p); g(10, p.cx); g(20, Y(p.cy)); g(30, 0); g(40, p.r); g(50, norm(-p.a1)); g(51, norm(-p.a0));
        break;
      case 'ellipse':
        // In R12 l'ellisse non c'è: 36 tratti
        for (let i = 0; i < 36; i++) {
          const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 1) / 36) * Math.PI * 2;
          line(p, p.cx + p.rx * Math.cos(a0), p.cy + p.ry * Math.sin(a0), p.cx + p.rx * Math.cos(a1), p.cy + p.ry * Math.sin(a1));
        }
        break;
      case 'text': {
        const h = p.size ?? 2.5;
        head('TEXT', p); g(10, p.x); g(20, Y(p.y)); g(30, 0); g(40, h); g(1, p.s);
        if (p.rot) g(50, norm(-p.rot));
        // Allineamento orizzontale (72) con il punto di aggancio (11, 21)
        const al = p.anchor === 'end' ? 2 : p.anchor === 'start' ? 0 : 1;
        if (al) { g(72, String(al)); g(11, p.x); g(21, Y(p.y)); g(31, 0); }
        break;
      }
    }
  }
  for (const q of sym.pins) {
    head('CIRCLE', undefined, 'PUNTI_CONNESSIONE'); g(10, q.x); g(20, Y(q.y)); g(30, 0); g(40, 0.5);
    if (q.label) { head('TEXT', undefined, 'PUNTI_CONNESSIONE'); g(10, q.x + 0.8); g(20, Y(q.y) + 0.8); g(30, 0); g(40, 1.8); g(1, q.label); }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
