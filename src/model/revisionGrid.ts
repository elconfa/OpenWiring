// Tabella «Stato revisione fogli» (punto 176): blocco della pagina, di solito sulla copertina, con la
// griglia dei fogli e sotto ogni foglio l'indice dell'ultima revisione che l'ha cambiato.
// Casella vuota = foglio com'era alla prima emissione; # = foglio non presente (numeri saltati e caselle
// in fondo all'ultima riga). I dati sono quelli della colonna Rev. dell'indice delle pagine.
import type { BlockItem, Project } from './types';
import { FRAME } from './types';
import { pageRevision } from './revisions';
import { translator } from './i18n';
import type { StationMiniDrawing } from './stationMini';

export const REV_GRID = { cols: 16, cellW: 6, labelW: 10, rowH: 3.6, groupGap: 1.6, titleH: 5, size: 1.8, titleSize: 2.4 };

export interface RevGridCell { sheet: string; rev: string }

/** Caselle della griglia: i fogli nell'ordine del progetto (senza copertina), con i numeri saltati e il riempimento dell'ultima riga */
export function revGridCells(project: Project, cols = REV_GRID.cols): RevGridCell[] {
  const first = project.revisions?.[0]?.index;
  const out: RevGridCell[] = [];
  const int = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : undefined);
  let prev: number | undefined;
  for (const pg of project.pages) {
    if (pg.type === 'cover') continue;
    const n = int(pg.name);
    // Fogli saltati nella numerazione (al massimo una riga intera, per non riempire la copertina di #)
    if (n !== undefined && prev !== undefined && n > prev + 1) for (let k = prev + 1; k < n && k - prev <= cols; k++) out.push({ sheet: String(k), rev: '#' });
    if (n !== undefined) prev = n;
    const r = pageRevision(project, pg);
    out.push({ sheet: pg.name, rev: r && r !== first ? r : '' });
  }
  const last = out.length ? int(out[out.length - 1].sheet) : undefined;
  for (let k = 1; out.length % cols; k++) out.push({ sheet: last !== undefined ? String(last + k) : '', rev: '#' });
  return out;
}

const colsOf = (b: BlockItem) => Math.max(4, Math.min(40, b.cols ?? REV_GRID.cols));

/** Ingombro del blocco */
export function revGridBox(project: Project, b: BlockItem) {
  const G = REV_GRID, cols = colsOf(b);
  const rows = Math.max(1, Math.ceil(revGridCells(project, cols).length / cols));
  return { x0: b.x, y0: b.y, x1: b.x + G.labelW + cols * G.cellW, y1: b.y + G.titleH + rows * (2 * G.rowH + G.groupGap) - G.groupGap };
}

/** Disegno della griglia (mm, coordinate della pagina) */
export function revGridDrawing(project: Project, b: BlockItem): StationMiniDrawing {
  const G = REV_GRID, cols = colsOf(b);
  const { t } = translator(project);
  const cells = revGridCells(project, cols);
  const out: StationMiniDrawing = { rects: [], lines: [], arrows: [], texts: [], station: '' };
  out.texts.push({ x: b.x, y: b.y + G.titleSize, s: t('Stato revisione fogli'), size: G.titleSize, bold: true });
  const fit = (s: string, w: number) => Math.min(G.size, (w - 0.6) / Math.max(1, s.length * 0.62));
  const W = G.labelW + cols * G.cellW;
  for (let r = 0; r * cols < cells.length; r++) {
    const y = b.y + G.titleH + r * (2 * G.rowH + G.groupGap);
    out.rects.push({ x: b.x, y, w: W, h: 2 * G.rowH });
    out.lines.push({ x1: b.x, y1: y + G.rowH, x2: b.x + W, y2: y + G.rowH });
    for (let c = 0; c <= cols; c++) { const x = b.x + G.labelW + c * G.cellW; if (c < cols) out.lines.push({ x1: x, y1: y, x2: x, y2: y + 2 * G.rowH }); }
    const lab = [t('Foglio'), t('Rev.')];
    lab.forEach((s, k) => out.texts.push({ x: b.x + 0.6, y: y + k * G.rowH + G.rowH / 2 + G.size * 0.36, s, size: fit(s, G.labelW) }));
    cells.slice(r * cols, r * cols + cols).forEach((cell, c) => {
      const cx = b.x + G.labelW + c * G.cellW + G.cellW / 2;
      if (cell.sheet) out.texts.push({ x: cx, y: y + G.rowH / 2 + G.size * 0.36, s: cell.sheet, size: fit(cell.sheet, G.cellW), anchor: 'middle' });
      if (cell.rev) out.texts.push({ x: cx, y: y + G.rowH * 1.5 + G.size * 0.36, s: cell.rev, size: fit(cell.rev, G.cellW), anchor: 'middle', bold: cell.rev !== '#' });
    });
  }
  return out;
}

/** Posto di serie: in alto a destra, dentro la cornice */
export function revGridPlace(project: Project, b: BlockItem): { x: number; y: number } {
  const box = revGridBox(project, b);
  return { x: FRAME.right - (box.x1 - box.x0) - 4, y: FRAME.top + 4 };
}
