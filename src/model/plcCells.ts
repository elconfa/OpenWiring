// Riquadro a celle fisse dei canali dei gruppi I/O PLC e delle prese M12: ogni dato ha la sua casella,
// con il nome del campo scritto in piccolo in alto a sinistra e il valore sotto.
//   Indirizzo | Morsetti
//   Variabile
//   Commento (due righe)
//   Scheda | Stazione | Rack | Slot
// Le celle restano anche vuote; spariscono solo con il canale (canale non usato = simbolo assente).
// Le linee delle celle sono nel disegno del simbolo, i testi li prepara derive.ts (già tradotti).

export type PlcCellKey = 'address' | 'pins' | 'symbol' | 'comment' | 'card' | 'station' | 'rack' | 'slot';

export interface PlcCellBox {
  x: number; y: number; w: number; h: number;
  /** Celle più piccole (metà di una presa M12) */
  small?: boolean;
}

interface CellDef { key: PlcCellKey; label: string; f: number; bold?: boolean; lines?: number }

/** Righe del riquadro e larghezza delle celle (parte della riga) */
const ROWS: CellDef[][] = [
  [{ key: 'address', label: 'Indirizzo', f: 0.6, bold: true }, { key: 'pins', label: 'Morsetti', f: 0.4 }],
  [{ key: 'symbol', label: 'Variabile', f: 1 }],
  [{ key: 'comment', label: 'Commento', f: 1, lines: 2 }],
  [{ key: 'card', label: 'Scheda', f: 0.42 }, { key: 'station', label: 'Stazione', f: 0.3 }, { key: 'rack', label: 'Rack', f: 0.14 }, { key: 'slot', label: 'Slot', f: 0.14 }],
];
/** Altezze delle righe (parti dell'altezza) e dei testi (mm): riquadro del gruppo e metà della presa */
const SIZES = {
  normal: { rows: [8, 8, 12, 10], caption: 1.6, value: 2.8 },
  small: { rows: [7, 7, 9.5, 7], caption: 1.4, value: 2.6 },
};
/** Nomi dei campi (da tradurre) */
export const PLC_CELL_LABELS = ROWS.flat().map(c => c.label);

/** Larghezza stimata di un carattere rispetto all'altezza (Helvetica, testi brevi) */
const CHAR = 0.55;
/** Il valore troppo lungo si rimpicciolisce fino a questa parte, poi finisce con «…» */
const MIN_SCALE = 0.75;

export interface PlcCell { key: PlcCellKey; label: string; x: number; y: number; w: number; h: number; bold?: boolean; lines: number }

/** Celle del riquadro (coordinate del simbolo) */
export function plcCells(box: PlcCellBox): PlcCell[] {
  const sz = box.small ? SIZES.small : SIZES.normal;
  const total = sz.rows.reduce((a, b) => a + b, 0);
  const out: PlcCell[] = [];
  let y = box.y;
  ROWS.forEach((row, i) => {
    const h = (box.h * sz.rows[i]) / total;
    let x = box.x;
    for (const c of row) {
      const w = box.w * c.f;
      out.push({ key: c.key, label: c.label, x: r2(x), y: r2(y), w: r2(w), h: r2(h), bold: c.bold, lines: c.lines ?? 1 });
      x += w;
    }
    y += h;
  });
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Linee interne delle celle (il contorno è quello del riquadro del canale) */
export function plcCellLines(box: PlcCellBox): { x1: number; y1: number; x2: number; y2: number }[] {
  const cells = plcCells(box);
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const rows = [...new Set(cells.map(c => c.y))].filter(y => y > box.y + 0.01);
  for (const y of rows) out.push({ x1: box.x, y1: y, x2: r2(box.x + box.w), y2: y });
  for (const c of cells) if (c.x > box.x + 0.01) out.push({ x1: c.x, y1: c.y, x2: c.x, y2: r2(c.y + c.h) });
  return out;
}

export interface PlcCellText { x: number; y: number; s: string; size: number; bold?: boolean; caption?: boolean }

/** Righe di un valore nella cella: a capo sulle parole, poi più piccolo, poi «…» */
function fitValue(s: string, w: number, size: number, lines: number): { lines: string[]; size: number } {
  const per = (sz: number) => Math.max(1, Math.floor(w / (sz * CHAR)));
  const wrapTo = (sz: number) => {
    const n = per(sz);
    // Una riga sola: il testo intero, accorciato in fondo se serve
    if (lines === 1) return [s];
    const words = s.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length > n && cur) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  for (let k = 1; k >= MIN_SCALE - 1e-6; k -= 0.05) {
    const sz = size * k, ls = wrapTo(sz);
    if (ls.length <= lines && ls.every(l => l.length <= per(sz))) return { lines: ls, size: r2(sz) };
  }
  const sz = size * MIN_SCALE, n = per(sz), ls = wrapTo(sz);
  const cut = ls.slice(0, lines).map(l => (l.length > n ? l.slice(0, n) : l));
  const last = cut.length - 1;
  if (ls.length > lines || ls.some(l => l.length > n)) cut[last] = `${cut[last].slice(0, Math.max(0, n - 1))}…`;
  return { lines: cut, size: r2(sz) };
}

/** Nome del campo nella cella: con due lingue («Stazione / Station») solo la prima se non ci stanno tutte e due */
function fitCaption(s: string, w: number, size: number): string {
  const n = Math.max(1, Math.floor(w / (size * CHAR)));
  if (s.length <= n) return s;
  const first = s.split(' / ')[0];
  return first.length <= n ? first : `${first.slice(0, Math.max(1, n - 1))}.`;
}

/** Testi del riquadro (coordinate del simbolo, linea di base): nomi dei campi e valori */
export function plcCellTexts(box: PlcCellBox, values: Partial<Record<PlcCellKey, string>>, t: (s: string) => string = s => s): PlcCellText[] {
  const sz = box.small ? SIZES.small : SIZES.normal;
  const out: PlcCellText[] = [];
  for (const c of plcCells(box)) {
    const cap = sz.caption;
    out.push({ x: r2(c.x + 0.7), y: r2(c.y + cap + 0.5), s: fitCaption(t(c.label), c.w - 1.2, cap), size: cap, caption: true });
    const v = values[c.key]?.trim();
    if (!v) continue;
    const f = fitValue(v, c.w - 1.4, sz.value, c.lines);
    const lh = f.size * 1.2, top = c.y + cap + 0.9, room = c.h - cap - 0.9;
    const y0 = top + (room - f.lines.length * lh) / 2 + f.size * 0.85;
    f.lines.forEach((s, i) => out.push({ x: r2(c.x + 0.7), y: r2(y0 + i * lh), s, size: f.size, bold: c.bold }));
  }
  return out;
}
