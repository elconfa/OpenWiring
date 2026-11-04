// Lettura della grafica vettoriale di un PDF con pdf.js (Mozilla, Apache 2.0): tratti, riempimenti
// e testi di ogni pagina in millimetri, con l'origine in alto a sinistra e l'asse y verso il basso.
// Serve all'import degli schemi esportati in PDF da altri programmi (vedi pdfSchematic.ts).

export interface RawSeg {
  x1: number; y1: number; x2: number; y2: number;
  /** Colore del tratto (o del riempimento) in esadecimale, es. "#0000ff" */
  color: string;
  /** Parte di una forma piena (es. punto di giunzione, punta di freccia piena) */
  fill?: boolean;
  /** Numero del tracciato PDF a cui appartiene */
  path: number;
}

export interface RawText {
  s: string;
  /** Inizio della linea di base */
  x: number;
  y: number;
  /** Altezza del carattere in mm */
  size: number;
  /** Larghezza del testo in mm */
  w: number;
  /** Rotazione in gradi, oraria sullo schermo (come i testi dei simboli) */
  rot: number;
}

export interface RawPage { w: number; h: number; segs: RawSeg[]; texts: RawText[] }

const MM = 25.4 / 72;
type M = [number, number, number, number, number, number];
const mul = (m: M, n: number[]): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

function hex(a: unknown): string {
  if (typeof a === 'string') return a.toLowerCase();
  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    const v = Array.from(a as ArrayLike<number>);
    const to = (x: number) => Math.round(x <= 1 && v.every(y => y <= 1) ? x * 255 : x).toString(16).padStart(2, '0');
    return `#${v.slice(0, 3).map(to).join('')}`;
  }
  return '#000000';
}

type PdfJs = typeof import('pdfjs-dist');

/** Lettera posizionata, in coordinate PDF (punti, y verso l'alto) */
interface Glyph { u: string; x: number; y: number; dx: number; dy: number; size: number; adv: number }

/**
 * Unisce le lettere in testi: stessa linea di base e stessa direzione, distanza piccola. Gli spazi
 * sono solo quelli scritti nel PDF (non si deducono dagli scarti di crenatura).
 */
export function joinGlyphs(chars: Glyph[]): RawText[] {
  const out: RawText[] = [];
  let cur: { g: Glyph[]; ux: number; uy: number } | undefined;
  const flush = () => {
    if (!cur) return;
    const s = cur.g.map(g => g.u).join('').replace(/\s+/g, ' ').trim();
    if (s) {
      const first = cur.g.find(g => g.u.trim()) ?? cur.g[0], last = cur.g[cur.g.length - 1];
      const span = (last.x - first.x) * cur.ux + (last.y - first.y) * cur.uy;
      const n = cur.g.length;
      // Larghezza: passo medio tra le lettere (più affidabile della larghezza dichiarata)
      const w = span + (n > 1 ? Math.min(last.adv, span / (n - 1)) : Math.min(last.adv, last.size * 0.6));
      const ang = Math.atan2(cur.uy, cur.ux) * 180 / Math.PI;
      out.push({ s, x: first.x, y: first.y, size: first.size, w: Math.abs(w), rot: Math.round(-ang) || 0 });
    }
    cur = undefined;
  };
  for (const c of chars) {
    const len = Math.hypot(c.dx, c.dy) || 1;
    const ux = c.dx / len, uy = c.dy / len;
    if (cur) {
      const p = cur.g[cur.g.length - 1];
      // Distanza tra gli inizi delle lettere (le larghezze dichiarate dai font non sono affidabili)
      const along = (c.x - p.x) * ux + (c.y - p.y) * uy;
      const across = -(c.x - p.x) * uy + (c.y - p.y) * ux;
      const sameDir = Math.abs(ux - cur.ux) < 0.01 && Math.abs(uy - cur.uy) < 0.01;
      const step = Math.max(c.size, p.size);
      if (sameDir && Math.abs(c.size - p.size) <= step * 0.2 && Math.abs(across) <= step * 0.2 && along > -step * 0.05 && along <= Math.min(step * 1.05, Math.max(p.adv, step * 0.3) + step * 0.35)) { cur.g.push(c); continue; }
      flush();
    }
    cur = { g: [c], ux, uy };
  }
  flush();
  return out;
}

/** Carica pdf.js: nel browser/Electron con il worker, in Node (test, riga di comando) la versione legacy */
async function loadPdfJs(): Promise<PdfJs> {
  if (typeof Worker === 'undefined' || typeof document === 'undefined') {
    return await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJs;
  }
  const lib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

/**
 * Legge le pagine del PDF. pages: numeri di pagina da leggere (da 1); onPage: avanzamento.
 */
export async function readPdf(data: Uint8Array, opts: { pages?: number[]; onPage?: (n: number, total: number) => void; pdfjs?: PdfJs } = {}): Promise<RawPage[]> {
  const pdfjs = opts.pdfjs ?? await loadPdfJs();
  const { OPS } = pdfjs;
  const doc = await pdfjs.getDocument({ data: data.slice(), verbosity: 0 }).promise;
  const list = opts.pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const out: RawPage[] = [];
  for (const n of list) {
    opts.onPage?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const [vx0, vy0, vx1, vy1] = page.view;
    const H = vy1;
    const segs: RawSeg[] = [];
    let ctm: M = [1, 0, 0, 1, 0, 0];
    let stroke = '#000000', fill = '#000000';
    const stack: [M, string, string][] = [];
    const P = (x: number, y: number) => ({
      x: Math.round((ctm[0] * x + ctm[2] * y + ctm[4] - vx0) * MM * 1000) / 1000,
      y: Math.round((H - (ctm[1] * x + ctm[3] * y + ctm[5])) * MM * 1000) / 1000,
    });
    const ol = await page.getOperatorList();
    let pathNo = 0;
    // Stato del testo: le lettere vengono raccolte una per una e unite dopo (alcuni programmi,
    // es. SEE Electrical, posizionano ogni lettera da sola e pdf.js inserirebbe spazi sbagliati)
    let tm: M = [1, 0, 0, 1, 0, 0], lm: M = tm;
    let fontSize = 1, hscale = 1, charSp = 0, wordSp = 0, leading = 0;
    const chars: Glyph[] = [];
    const show = (glyphs: unknown[]) => {
      for (const g of glyphs) {
        if (typeof g === 'number') { tm = mul(tm, [1, 0, 0, 1, -g / 1000 * fontSize * hscale, 0]); continue; }
        const gl = g as { unicode?: string; width?: number; isSpace?: boolean } | null;
        if (!gl) continue;
        const m = mul(ctm, tm);
        const adv = ((gl.width ?? 0) / 1000 * fontSize + charSp + (gl.isSpace ? wordSp : 0)) * hscale;
        chars.push({
          u: gl.unicode ?? '', x: m[4], y: m[5], dx: m[0], dy: m[1],
          size: fontSize * Math.hypot(m[2], m[3]), adv: adv * Math.hypot(m[0], m[1]),
        });
        tm = mul(tm, [1, 0, 0, 1, adv, 0]);
      }
    };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const f = ol.fnArray[i], a = ol.argsArray[i] as unknown[];
      if (f === OPS.beginText) { tm = [1, 0, 0, 1, 0, 0]; lm = tm; }
      else if (f === OPS.setFont) fontSize = (a[1] as number) || 1;
      else if (f === OPS.setTextMatrix) { tm = Array.from((Array.isArray(a[0]) || ArrayBuffer.isView(a[0]) ? a[0] : a) as ArrayLike<number>) as M; lm = tm; }
      else if (f === OPS.moveText) { lm = mul(lm, [1, 0, 0, 1, a[0] as number, a[1] as number]); tm = lm; }
      else if (f === OPS.setLeadingMoveText) { leading = -(a[1] as number); lm = mul(lm, [1, 0, 0, 1, a[0] as number, a[1] as number]); tm = lm; }
      else if (f === OPS.setLeading) leading = a[0] as number;
      else if (f === OPS.nextLine) { lm = mul(lm, [1, 0, 0, 1, 0, -leading]); tm = lm; }
      else if (f === OPS.setHScale) hscale = (a[0] as number) / 100;
      else if (f === OPS.setCharSpacing) charSp = a[0] as number;
      else if (f === OPS.setWordSpacing) wordSp = a[0] as number;
      else if (f === OPS.showText || f === OPS.showSpacedText) show(a[0] as unknown[]);
      else if (f === OPS.nextLineShowText) { lm = mul(lm, [1, 0, 0, 1, 0, -leading]); tm = lm; show(a[0] as unknown[]); }
      else if (f === OPS.save) stack.push([ctm, stroke, fill]);
      else if (f === OPS.restore) { const s = stack.pop(); if (s) [ctm, stroke, fill] = s; }
      else if (f === OPS.transform) ctm = mul(ctm, a as number[]);
      else if (f === OPS.setStrokeRGBColor || f === OPS.setStrokeColor) stroke = hex(a[0] ?? a);
      else if (f === OPS.setFillRGBColor || f === OPS.setFillColor) fill = hex(a[0] ?? a);
      else if (f === OPS.setStrokeGray) stroke = hex([a[0], a[0], a[0]]);
      else if (f === OPS.setFillGray) fill = hex([a[0], a[0], a[0]]);
      else if (f === OPS.constructPath) {
        const op = a[0] as number;
        const isFill = op === OPS.fill || op === OPS.eoFill;
        const isStroke = op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke;
        if (!isFill && !isStroke) continue;
        const color = isFill ? fill : stroke;
        const d = (a[1] as ArrayLike<number>[])[0];
        if (!d) continue;
        pathNo++;
        let cur = { x: 0, y: 0 }, start = cur;
        // Coordinate grezze dell'ultimo punto per le curve
        let rx = 0, ry = 0;
        const add = (p: { x: number; y: number }) => { segs.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y, color, fill: isFill || undefined, path: pathNo }); cur = p; };
        for (let k = 0; k < d.length;) {
          const c = d[k];
          if (c === 0) { rx = d[k + 1]; ry = d[k + 2]; cur = start = P(rx, ry); k += 3; }
          else if (c === 1) { rx = d[k + 1]; ry = d[k + 2]; add(P(rx, ry)); k += 3; }
          else if (c === 2) {
            // Curva di Bézier cubica approssimata con 6 tratti
            const x0 = rx, y0 = ry, [x1, y1, x2, y2, x3, y3] = [d[k + 1], d[k + 2], d[k + 3], d[k + 4], d[k + 5], d[k + 6]];
            for (let t = 1; t <= 6; t++) {
              const u = t / 6, v = 1 - u;
              add(P(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3));
            }
            rx = x3; ry = y3; k += 7;
          } else if (c === 3) {
            // Quadratica
            const [x1, y1, x2, y2] = [d[k + 1], d[k + 2], d[k + 3], d[k + 4]];
            const x0 = rx, y0 = ry;
            for (let t = 1; t <= 4; t++) { const u = t / 4, v = 1 - u; add(P(v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2)); }
            rx = x2; ry = y2; k += 5;
          } else if (c === 4) { if (cur.x !== start.x || cur.y !== start.y) add(start); k += 1; }
          else k += 1;
        }
      }
    }
    const texts = joinGlyphs(chars).map(t => ({
      ...t, x: Math.round((t.x - vx0) * MM * 1000) / 1000, y: Math.round((H - t.y) * MM * 1000) / 1000,
      size: Math.round(t.size * MM * 100) / 100, w: t.w * MM,
    }));
    out.push({ w: (vx1 - vx0) * MM, h: (vy1 - vy0) * MM, segs, texts });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}
