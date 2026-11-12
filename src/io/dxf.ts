// Export DXF R12 di una pagina (scala 1:1, millimetri, asse Y verso l'alto).
import type { Project, Page, Prim, Part, TextMoveKey } from '../model/types';
import { PAGE_H, PAGE_W, FRAME, COLUMNS, WIRE_LINE_TYPES, primLineType, plotPrims } from '../model/types';
import { titleBlockPrims } from '../model/titleBlocks';
import { getSymbol, toWorld, readableText, pinLabelPlace } from '../model/geometry';
import { flowLines, textLines, LINE_GAP } from '../model/textFlow';
import { effectivePinLabels } from '../model/devices';
import { derive } from '../model/derive';
import { textOffset } from '../model/symbolTexts';
import { wireDefLabel, wireDefLabelAt } from '../model/wireDefs';
import { zoneLabelBox, zoneLeader, zoneText } from '../model/leaders';

export function pageToDxf(project: Project, page: Page, library: Part[] = []): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === 'number' ? v.toFixed(4) : v);
  const Y = (y: number) => PAGE_H - y;
  const line = (x1: number, y1: number, x2: number, y2: number, layer: string, ltype?: string) => {
    g(0, 'LINE'); g(8, layer); if (ltype) g(6, ltype); g(10, x1); g(20, Y(y1)); g(30, 0); g(11, x2); g(21, Y(y2)); g(31, 0);
  };
  const text = (x: number, y: number, s: string, h: number, layer: string, rot = 0) => {
    if (!s) return;
    g(0, 'TEXT'); g(8, layer); g(10, x); g(20, Y(y)); g(30, 0); g(40, h); g(1, s.replace(/[\r\n]/g, ' '));
    if (rot) g(50, rot);
  };
  const labels = effectivePinLabels(project);
  const d = derive(project, library);
  const pd = d.pages.get(page.id)!;

  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$INSUNITS'); g(70, '4'); g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(9, '$EXTMAX'); g(10, PAGE_W); g(20, PAGE_H); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  // Tipi di linea dei fili (lunghezze in mm: tratto positivo, spazio negativo, 0 = punto)
  const LTYPES: [string, string, number[]][] = [
    ['CONTINUOUS', 'Continua', []], ['DASHED', 'Tratteggiata __ __ __', [3, -1.5]],
    ['DASHDOT', 'Linea-punto __ . __ .', [4, -1.2, 0, -1.2]], ['DOT', 'Punti . . . .', [0, -1.2]],
  ];
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, String(LTYPES.length));
  for (const [name, descr, pat] of LTYPES) {
    g(0, 'LTYPE'); g(2, name); g(70, '0'); g(3, descr); g(72, '65'); g(73, String(pat.length));
    g(40, pat.reduce((s, v) => s + Math.abs(v), 0));
    for (const v of pat) g(49, v);
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, '7');
  for (const [name, color] of [['CORNICE', 7], ['CARTIGLIO', 7], ['SIMBOLI', 7], ['FILI', 5], ['TESTI', 3], ['SIGLE', 1], ['NUMERI_FILO', 4]] as const) {
    g(0, 'LAYER'); g(2, name); g(70, '0'); g(62, String(color)); g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');

  // Cornice e cartiglio
  const rect = (x0: number, y0: number, x1: number, y1: number, l: string) => {
    line(x0, y0, x1, y0, l); line(x1, y0, x1, y1, l); line(x1, y1, x0, y1, l); line(x0, y1, x0, y0, l);
  };
  rect(FRAME.left, FRAME.top, FRAME.right, FRAME.bottom, 'CORNICE');
  const colW = (FRAME.right - FRAME.left) / COLUMNS;
  for (let i = 0; i < COLUMNS; i++) text(FRAME.left + (i + 0.45) * colW, FRAME.top - 1.5, String(i + 1), 2.5, 'CORNICE');
  // Cartiglio secondo il modello della pagina
  const tb = titleBlockPrims(project, page, project.pages.indexOf(page));
  const k = tb.place.scale;
  for (const q of tb.prims) {
    const X = (x: number) => tb.place.x + x * k, YY = (y: number) => tb.place.y + y * k;
    if (q.t === 'line') line(X(q.x1), YY(q.y1), X(q.x2), YY(q.y2), 'CARTIGLIO');
    else if (q.t === 'rect') rect(X(q.x), YY(q.y), X(q.x + q.w), YY(q.y + q.h), 'CARTIGLIO');
    else if (q.t === 'poly') q.pts.forEach((a, i) => { const b = q.pts[i + 1] ?? (q.closed ? q.pts[0] : undefined); if (b) line(X(a.x), YY(a.y), X(b.x), YY(b.y), 'CARTIGLIO'); });
    else if (q.t === 'circle') { g(0, 'CIRCLE'); g(8, 'CARTIGLIO'); g(10, X(q.cx)); g(20, Y(YY(q.cy))); g(30, 0); g(40, q.r * k); }
    else if (q.t === 'text') {
      const h = (q.size ?? 2.5) * k, w = q.s.length * h * 0.6;
      const dx = q.anchor === 'end' ? -w : q.anchor === 'start' ? 0 : -w / 2;
      text(X(q.x) + dx, YY(q.y), q.s, h, 'CARTIGLIO');
    }
  }

  for (const e of page.elements) {
    if (e.kind === 'wire') {
      const ltype = WIRE_LINE_TYPES.find(t => t.id === e.lineType && t.id !== 'solid')?.dxf;
      if (e.width) {
        // Spessore scelto: polilinea con larghezza (le LINE del DXF R12 non hanno spessore)
        g(0, 'POLYLINE'); g(8, 'FILI'); if (ltype) g(6, ltype); g(66, '1'); g(10, 0); g(20, 0); g(30, 0); g(40, e.width); g(41, e.width);
        for (const p of e.points) { g(0, 'VERTEX'); g(8, 'FILI'); g(10, p.x); g(20, Y(p.y)); g(30, 0); }
        g(0, 'SEQEND'); g(8, 'FILI');
      } else {
        for (let i = 0; i < e.points.length - 1; i++) {
          line(e.points[i].x, e.points[i].y, e.points[i + 1].x, e.points[i + 1].y, 'FILI', ltype);
        }
      }
      // Numero filo come sullo schema (con le scelte mostra/nascondi del filo)
      const no = pd.wireNumbers.get(e.id);
      const poss = pd.wireLabelPos?.get(e.id) ?? [];
      if (no && poss.length) {
        // Stessa posizione dello schema (testo centrato sul punto)
        const w = no.length * 1.8 * 0.6;
        for (const pos of poss) {
          if (pos.vertical) text(pos.x, pos.y + w / 2, no, 1.8, 'NUMERI_FILO', 90);
          else text(pos.x - w / 2, pos.y, no, 1.8, 'NUMERI_FILO');
        }
      } else if (no) {
        const [a, b] = [e.points[0], e.points[1]];
        text((a.x + b.x) / 2 + 0.6, (a.y + b.y) / 2 - 0.6, no, 1.8, 'NUMERI_FILO');
      }
    } else if (e.kind === 'text') {
      textLines(e).forEach((l, i) => text(e.x, e.y + i * e.size * LINE_GAP, l, e.size, 'TESTI'));
    } else if (e.kind === 'cable') {
      line(e.points[0].x, e.points[0].y, e.points[1].x, e.points[1].y, 'CAVI');
      const c = project.cables?.find(x => x.id === e.cableId);
      if (c) text(e.points[0].x + 1, e.points[0].y - 1, `-${c.tag}`, 2.4, 'CAVI');
    } else if (e.kind === 'wiredef') {
      line(e.points[0].x, e.points[0].y, e.points[1].x, e.points[1].y, 'FILI');
      const { end, at } = wireDefLabelAt(e);
      line(end.x, end.y, at.x, at.y, 'FILI');
      wireDefLabel(e).forEach((s, i) => text(at.x + 0.8, at.y + i * 2.6, s, 1.9, 'TESTI'));
    } else if (e.kind === 'zone') {
      line(e.x, e.y, e.x + e.w, e.y, 'QUADRI'); line(e.x + e.w, e.y, e.x + e.w, e.y + e.h, 'QUADRI');
      line(e.x + e.w, e.y + e.h, e.x, e.y + e.h, 'QUADRI'); line(e.x, e.y + e.h, e.x, e.y, 'QUADRI');
      const pn = project.panels?.find(x => x.id === e.panelId);
      if (pn) { const s = zoneText(e, pn, project.settings?.zoneStyle); const { at, box } = zoneLabelBox(e, s, 3, true); const ld = zoneLeader(e, box); if (ld) line(ld[0].x, ld[0].y, ld[1].x, ld[1].y, 'QUADRI'); text(at.x, at.y, s, 3, 'QUADRI'); }
    } else if (e.kind === 'image' && e.vector) {
      // Disegno importato da DXF: torna linee, cerchi e testi, scalati sul riquadro
      const sx = e.w / (e.vector.w || 1), sy = e.h / (e.vector.h || 1);
      const X = (x: number) => e.x + x * sx, YY = (y: number) => e.y + y * sy;
      for (const q of e.vector.prims) {
        if (q.t === 'line') line(X(q.x1), YY(q.y1), X(q.x2), YY(q.y2), 'DISEGNI');
        else if (q.t === 'rect') { line(X(q.x), YY(q.y), X(q.x + q.w), YY(q.y), 'DISEGNI'); line(X(q.x + q.w), YY(q.y), X(q.x + q.w), YY(q.y + q.h), 'DISEGNI'); line(X(q.x + q.w), YY(q.y + q.h), X(q.x), YY(q.y + q.h), 'DISEGNI'); line(X(q.x), YY(q.y + q.h), X(q.x), YY(q.y), 'DISEGNI'); }
        else if (q.t === 'poly') q.pts.forEach((a, i) => { const b = q.pts[i + 1] ?? (q.closed ? q.pts[0] : undefined); if (b) line(X(a.x), YY(a.y), X(b.x), YY(b.y), 'DISEGNI'); });
        else if (q.t === 'circle') { g(0, 'CIRCLE'); g(8, 'DISEGNI'); g(10, X(q.cx)); g(20, Y(YY(q.cy))); g(30, 0); g(40, q.r * sx); }
        else if (q.t === 'text') text(X(q.x), YY(q.y), q.s, (q.size ?? 2.5) * sy, 'DISEGNI');
      }
    } else if (e.kind === 'image') {
      // Il DXF non porta l'immagine dentro il file: resta il suo riquadro con il nome
      line(e.x, e.y, e.x + e.w, e.y, 'IMMAGINI'); line(e.x + e.w, e.y, e.x + e.w, e.y + e.h, 'IMMAGINI');
      line(e.x + e.w, e.y + e.h, e.x, e.y + e.h, 'IMMAGINI'); line(e.x, e.y + e.h, e.x, e.y, 'IMMAGINI');
      text(e.x + 1, e.y + 3, e.name ?? 'immagine', 2.5, 'IMMAGINI');
    } else {
      const sym = getSymbol(e.symbolId, project);
      if (!sym) continue;
      const inst = e;
      const W = (x: number, y: number) => toWorld(inst, { x, y });
      for (const p of plotPrims(sym)) emitPrim(p);
      function emitPrim(p: Prim) {
        // Tipo di linea della grafica del simbolo (tratteggiata, linea-punto, a punti)
        const lt = WIRE_LINE_TYPES.find(t => t.id === primLineType(p) && t.id !== 'solid')?.dxf;
        switch (p.t) {
          case 'line': { const a = W(p.x1, p.y1), b = W(p.x2, p.y2); line(a.x, a.y, b.x, b.y, 'SIMBOLI', lt); break; }
          case 'rect': {
            const c = [W(p.x, p.y), W(p.x + p.w, p.y), W(p.x + p.w, p.y + p.h), W(p.x, p.y + p.h)];
            for (let i = 0; i < 4; i++) line(c[i].x, c[i].y, c[(i + 1) % 4].x, c[(i + 1) % 4].y, 'SIMBOLI', lt);
            break;
          }
          case 'circle': { const c = W(p.cx, p.cy); g(0, 'CIRCLE'); g(8, 'SIMBOLI'); g(10, c.x); g(20, Y(c.y)); g(30, 0); g(40, p.r); break; }
          case 'arc': {
            const c = W(p.cx, p.cy);
            // Angoli degli estremi in coordinate schermo; l'arco va in senso orario sullo schermo
            // (invertito se specchiato). In DXF l'asse Y è ribaltato: orario → antiorario.
            const ang = (a: number) => {
              const q = W(p.cx + p.r * Math.cos(a * Math.PI / 180), p.cy + p.r * Math.sin(a * Math.PI / 180));
              return Math.atan2(q.y - c.y, q.x - c.x) * 180 / Math.PI;
            };
            const [s, en] = inst.mirror ? [ang(p.a1), ang(p.a0)] : [ang(p.a0), ang(p.a1)];
            g(0, 'ARC'); g(8, 'SIMBOLI'); g(10, c.x); g(20, Y(c.y)); g(30, 0); g(40, p.r); g(50, -en); g(51, -s);
            break;
          }
          case 'text': {
            // Stessa posizione e rotazione dello schema (testo sempre leggibile)
            const r = readableText(inst, p), h = p.size ?? 2.5, w = p.s.length * h * 0.6;
            const back = r.anchor === 'end' ? w : r.anchor === 'middle' ? w / 2 : 0;
            const a = (r.rot * Math.PI) / 180;
            text(r.x - back * Math.cos(a), r.y - back * Math.sin(a), p.s, h, 'SIMBOLI', -r.rot);
            break;
          }
          case 'ellipse': {
            // Approssimata con 24 segmenti (le ellissi DXF R12 non esistono)
            for (let i = 0; i < 24; i++) {
              const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
              const q0 = W(p.cx + p.rx * Math.cos(a0), p.cy + p.ry * Math.sin(a0)), q1 = W(p.cx + p.rx * Math.cos(a1), p.cy + p.ry * Math.sin(a1));
              line(q0.x, q0.y, q1.x, q1.y, 'SIMBOLI');
            }
            break;
          }
          case 'poly': {
            const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
            for (let i = 0; i < pts.length - 1; i++) { const a = W(pts[i].x, pts[i].y), b = W(pts[i + 1].x, pts[i + 1].y); line(a.x, a.y, b.x, b.y, 'SIMBOLI', lt); }
            break;
          }
        }
      }
      const t0 = toWorld(e, sym.tagPos ?? { x: -6, y: 8 });
      // Testi spostati a mano sullo schema (se l'impostazione del progetto li lascia liberi)
      const off = (k: TextMoveKey) => textOffset(e, k, pd.freeTexts);
      const tp = { x: t0.x + off('tag').x, y: t0.y + off('tag').y }, lp = { x: t0.x + off('lines').x, y: t0.y + off('lines').y };
      const vis = (k: 'tag' | 'pins') => pd.show?.get(e.id)?.[k] !== false;
      const tag = sym.role === 'potential' || sym.role === 'link' ? (vis('tag') ? e.tag : '') : e.tag ? (pd.designations.get(e.id) ?? `-${e.tag}`) : '';
      text(t0.x < e.x ? tp.x - tag.length * 1.6 : tp.x, tp.y, tag, 2.5, 'SIGLE');
      (pd.deviceLines.get(e.id) ?? []).forEach((l, i) => text(t0.x < e.x ? lp.x - l.length * 1.15 : lp.x, lp.y + 2.6 * (i + 1), l, 1.9, 'TESTI'));
      if (sym.textBox) {
        // Testi nel riquadro, a capo come sullo schema
        const size = pd.textStyles?.plcText.size ?? 2.5;
        const vals = (sym.fields ?? []).map(f => pd.deviceFields.get(e.id)?.[f.f] ?? '');
        for (const l of flowLines(sym.textBox, vals, size)) { const w = toWorld(e, l); text(w.x, w.y, l.s, size, 'TESTI'); }
      }
      for (const f of sym.textBox ? [] : sym.fields ?? []) {
        const v = pd.deviceFields.get(e.id)?.[f.f];
        if (!v) continue;
        const w = toWorld(e, f), h = f.size ?? 1.9, a = f.anchor ?? 'start';
        if (f.rot) {
          // Testo ruotato (es. dal basso verso l'alto nei gruppi I/O): stessa posizione dello schema
          const r = readableText(e, { t: 'text', x: f.x, y: f.y, s: v, size: h, anchor: a, rot: f.rot });
          text(r.x + off(f.f).x, r.y + off(f.f).y, v, h, 'TESTI', -r.rot);
          continue;
        }
        // Allineamento come nello schema (larghezza stimata del testo)
        const dx = a === 'end' ? -v.length * h * 0.6 : a === 'middle' ? -v.length * h * 0.3 : 0;
        text(w.x + dx + off(f.f).x, w.y + off(f.f).y, v, h, 'TESTI');
      }
      const l = labels.get(e.id) ?? {};
      if (sym.role !== 'terminal' && sym.role !== 'potential' && sym.role !== 'link' && vis('pins')) {
        for (const pin of sym.pins) {
          const w = pinLabelPlace(e, pin);
          const s = l[pin.id] ?? pin.label;
          text(w.anchor === 'end' ? w.x - s.length * 1.8 * 0.6 : w.x, w.y, s, 1.8, 'SIGLE');
        }
      }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
