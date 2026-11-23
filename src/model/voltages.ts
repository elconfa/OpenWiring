// Tabella «Tensioni utilizzate nello schema elettrico»: un blocco da posare su una pagina (di solito il
// frontespizio) con, per ogni potenziale, il campione della linea (colore e tratteggio del filo), la
// tensione e la descrizione. Le righe sono quelle scritte nel progetto (Progetto ▸ Tensioni utilizzate);
// finché non se ne scrive nessuna si ricavano dai punti di potenziale dello schema (e dai rimandi con un
// nome da potenziale: L1, N, PE, +24V…), con colore e tipo di
// linea dei fili collegati e tensione e descrizione suggerite dal nome (L1, N, PE, +24V, 0V…).
import type { BlockItem, Project, VoltageRow, WireLineType } from './types';
import { computeNetlist, withNetlistCache } from './netlist';
import { translator } from './i18n';
import { stationMiniBox } from './stationMini';
import { revGridBox } from './revisionGrid';
import { getSymbol } from './geometry';
import { tn } from '../i18n/ui';

/** Misure della tabella (mm) */
export const VOLTAGE_TABLE = { titleH: 9, headH: 6.5, rowH: 6.5, cols: [32, 30, 58] as const, titleSize: 3.6, headSize: 2.8, size: 2.6, sample: 22 };

/** Tensione e descrizione suggerite dal nome del potenziale */
function guess(name: string): Pick<VoltageRow, 'voltage' | 'description'> {
  const n = name.trim().toUpperCase().replace(/\s+/g, '');
  if (/^PE\b|^PE$/.test(n)) return { voltage: 'PE', description: tn('Conduttore di protezione') };
  if (/^FE$/.test(n)) return { voltage: 'FE', description: tn('Terra funzionale') };
  if (/^N(\d|$|[-.])/.test(n)) return { voltage: '230V AC', description: tn('Neutro') };
  if (/^L[123](\b|[-.]|$)/.test(n)) return { voltage: '400V AC', description: tn('Fase') };
  if (/^(M|0V|-24V?)(\b|[-.\d]|$)/.test(n)) return { voltage: '24V DC', description: tn('DC, conduttore mediano (0 V)') };
  const v = /(\d+)\s*V/.exec(n)?.[1] ?? (/^\+?L\+?\d*$/.test(n) || /^\+/.test(n) ? '24' : undefined);
  if (v) return { voltage: `${v}V DC`, description: tn('DC, positivo') };
  return {};
}

/**
 * Famiglia del nome di un rimando: il tipo di potenziale senza il circuito né il numero della fase
 * (L1-1.2 → L, N1-2.1 → N, 24V3-1.1 → 24V, 0V-2 → 0V, PE → PE)
 */
export function potentialFamily(name: string): string {
  const head = name.trim().split(/[-./]/)[0] || name.trim();
  return /^(.*?[A-Za-z+])\d+$/.exec(head)?.[1] ?? head;
}

/**
 * Righe ricavate dallo schema, nell'ordine in cui compaiono: i punti di potenziale con il loro nome, i
 * rimandi con un nome da potenziale raggruppati per famiglia (una riga per L, N, 24V…); campione della
 * linea con il colore e il tipo di linea più usati dai fili del gruppo
 */
export function autoVoltageRows(project: Project): VoltageRow[] {
  const keyOf = new Map<string, string>();
  const order: string[] = [];
  // Primo nome di ogni gruppo: da quello si suggeriscono tensione e descrizione (L1-1.2 → 400V AC, fase)
  const first = new Map<string, string>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind !== 'symbol' || !e.tag?.trim()) continue;
    const role = getSymbol(e.symbolId, project)?.role;
    const name = e.tag.trim();
    // Punti di potenziale; rimandi solo con un nome da potenziale (L1, N, PE, +24V…), non i numeri filo
    if (role !== 'potential' && !(role === 'link' && Object.keys(guess(name)).length)) continue;
    const key = role === 'potential' ? name : potentialFamily(name);
    if (!keyOf.has(name) || role === 'potential') keyOf.set(name, key);
    if (!order.includes(key)) { order.push(key); first.set(key, name); }
  }
  // Colore e linea più usati dai fili di ogni gruppo
  const count = new Map<string, Map<string, number>>();
  const nets = withNetlistCache(project, () => computeNetlist(project)).nets;
  for (const n of nets) {
    const keys = new Set([...(n.potentials ?? []), ...(n.links ?? [])].map(x => keyOf.get(x)).filter((k): k is string => !!k));
    for (const key of keys) {
      const c = count.get(key) ?? new Map<string, number>();
      for (const { wire } of n.wires) { const k = `${wire.color?.toUpperCase() ?? ''}|${wire.lineType ?? ''}`; c.set(k, (c.get(k) ?? 0) + 1); }
      count.set(key, c);
    }
  }
  return order.map(name => {
    const best = [...(count.get(name) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    const [color, line] = best ? best.split('|') : ['', ''];
    return { name, ...guess(first.get(name) ?? name), ...(color ? { color } : {}), ...(line ? { line: line as WireLineType } : {}) };
  });
}

/** Righe della tabella: quelle del progetto, altrimenti ricavate dallo schema */
export const voltageRows = (project: Project): VoltageRow[] => project.voltages ?? autoVoltageRows(project);

/** Riquadro del blocco sulla pagina (mm) */
export function blockBox(project: Project, b: BlockItem): { x0: number; y0: number; x1: number; y1: number } {
  if (b.block === 'station') return stationMiniBox(project, b);
  if (b.block === 'revgrid') return revGridBox(project, b);
  const V = VOLTAGE_TABLE;
  const w = V.cols[0] + V.cols[1] + V.cols[2];
  const h = V.titleH + V.headH + V.rowH * Math.max(1, voltageRows(project).length);
  return { x0: b.x, y0: b.y, x1: b.x + w, y1: b.y + h };
}

/** Testi fissi della tabella nella lingua del progetto */
export function voltageTableTexts(project: Project) {
  const { t } = translator(project);
  return { title: t('Tensioni utilizzate nello schema elettrico'), cols: [t('Grafica'), t('Tensione'), t('Descrizione')] };
}

/** Disegno della tabella: righe della griglia, testi e campioni delle linee (mm, coordinate della pagina) */
export interface VoltageTableDrawing {
  lines: { x1: number; y1: number; x2: number; y2: number; bold?: boolean }[];
  texts: { x: number; y: number; s: string; size: number; anchor: 'start' | 'middle'; bold?: boolean }[];
  samples: { x1: number; x2: number; y: number; color?: string; line?: WireLineType }[];
}

export function voltageTableDrawing(project: Project, b: BlockItem): VoltageTableDrawing {
  const V = VOLTAGE_TABLE;
  const rows = voltageRows(project);
  const T = voltageTableTexts(project);
  const { t } = translator(project);
  const box = blockBox(project, b);
  const xs = [box.x0, box.x0 + V.cols[0], box.x0 + V.cols[0] + V.cols[1], box.x1];
  const yHead = box.y0 + V.titleH, yRows = yHead + V.headH;
  const out: VoltageTableDrawing = { lines: [], texts: [], samples: [] };
  // Cornice, riga sotto il titolo e sotto l'intestazione, righe e colonne
  out.lines.push({ x1: box.x0, y1: box.y0, x2: box.x1, y2: box.y0, bold: true }, { x1: box.x0, y1: box.y1, x2: box.x1, y2: box.y1, bold: true },
    { x1: box.x0, y1: box.y0, x2: box.x0, y2: box.y1, bold: true }, { x1: box.x1, y1: box.y0, x2: box.x1, y2: box.y1, bold: true },
    { x1: box.x0, y1: yHead, x2: box.x1, y2: yHead }, { x1: box.x0, y1: yRows, x2: box.x1, y2: yRows });
  for (const x of xs.slice(1, 3)) out.lines.push({ x1: x, y1: yHead, x2: x, y2: box.y1 });
  for (let i = 1; i < rows.length; i++) out.lines.push({ x1: box.x0, y1: yRows + i * V.rowH, x2: box.x1, y2: yRows + i * V.rowH });
  out.texts.push({ x: (box.x0 + box.x1) / 2, y: box.y0 + V.titleH / 2 + V.titleSize * 0.36, s: T.title, size: V.titleSize, anchor: 'middle', bold: true });
  T.cols.forEach((s, i) => out.texts.push({ x: (xs[i] + xs[i + 1]) / 2, y: yHead + V.headH / 2 + V.headSize * 0.36, s, size: V.headSize, anchor: 'middle' }));
  rows.forEach((r, i) => {
    const yc = yRows + i * V.rowH + V.rowH / 2;
    out.samples.push({ x1: xs[0] + (V.cols[0] - V.sample) / 2, x2: xs[0] + (V.cols[0] + V.sample) / 2, y: yc, color: r.color, line: r.line });
    const ty = yc + V.size * 0.36;
    out.texts.push({ x: xs[1] + 1.5, y: ty, s: [r.voltage, r.voltage && r.name && r.voltage !== r.name ? `(${r.name})` : !r.voltage ? r.name : ''].filter(Boolean).join(' '), size: V.size, anchor: 'start' });
    out.texts.push({ x: xs[2] + 1.5, y: ty, s: [r.name, r.description ? t(r.description) : ''].filter(Boolean).join('   '), size: V.size, anchor: 'start' });
  });
  return out;
}
