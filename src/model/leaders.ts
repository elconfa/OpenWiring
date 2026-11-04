// Righini guida: una scritta spostata lontano dal suo elemento (riquadro di luogo, linea del cavo)
// resta legata con una riga sottile dal punto più vicino dell'elemento al punto più vicino della scritta.
import type { ItemLook, Panel, Pt, Zone, ZoneStyle } from './types';

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Larghezza indicativa di una scritta (caratteri proporzionali) */
export const approxTextW = (s: string, size: number) => s.length * size * 0.62;

/** Punto del rettangolo più vicino a p (p stesso se è dentro) */
export function nearestInBox(b: Box, p: Pt): Pt {
  return { x: Math.min(Math.max(p.x, b.x0), b.x1), y: Math.min(Math.max(p.y, b.y0), b.y1) };
}

/** Punto del bordo del rettangolo più vicino a p (anche quando p è dentro) */
export function nearestOnBorder(b: Box, p: Pt): Pt {
  const q = nearestInBox(b, p);
  if (q.x !== p.x || q.y !== p.y) return q;
  const d = [p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y];
  const m = Math.min(...d);
  return m === d[0] ? { x: b.x0, y: p.y } : m === d[1] ? { x: b.x1, y: p.y } : m === d[2] ? { x: p.x, y: b.y0 } : { x: p.x, y: b.y1 };
}

/** Righino dal punto dell'elemento alla scritta; nessuno se la scritta lo tocca già */
export function leaderLine(from: Pt, label: Box, min = 0.8): [Pt, Pt] | undefined {
  const to = nearestInBox(label, from);
  return Math.hypot(to.x - from.x, to.y - from.y) > min ? [from, to] : undefined;
}

/** Aspetto del riquadro: quello scelto sul riquadro, poi lo stile del progetto */
export function zoneLookOf(z: Pick<Zone, 'look'>, style?: ZoneStyle): ItemLook {
  const pick = (o?: ItemLook) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => v !== undefined && k !== 'codeOnly'));
  return { ...pick(style), ...pick(z.look) };
}

/** Solo «+codice» senza il nome: scelto sul riquadro, altrimenti come lo stile del progetto */
export const zoneCodeOnly = (z: Pick<Zone, 'codeOnly'>, style?: ZoneStyle) => z.codeOnly ?? style?.codeOnly ?? false;

/** Scritta del riquadro: «+codice  nome» o solo «+codice» */
export function zoneText(z: Pick<Zone, 'codeOnly'>, panel: Pick<Panel, 'code' | 'name'> | undefined, style?: ZoneStyle, t: (s: string) => string = s => s): string {
  if (!panel) return 'Quadro mancante';
  return `+${panel.code}${panel.name && !zoneCodeOnly(z, style) ? `  ${t(panel.name)}` : ''}`;
}

/** Posizione di serie della scritta del riquadro (linea di base, a sinistra), rispetto all'angolo in alto a sinistra */
export const zoneLabelDefault = (schematic: boolean): Pt => (schematic ? { x: 1.5, y: 3.6 } : { x: 2, y: 4.3 });

/** Scritta del riquadro: punto di partenza sulla pagina e rettangolo che occupa */
export function zoneLabelBox(z: Zone, text: string, size: number, schematic: boolean): { at: Pt; box: Box } {
  const rel = z.label ?? zoneLabelDefault(schematic);
  const at = { x: z.x + rel.x, y: z.y + rel.y };
  return { at, box: { x0: at.x - 0.5, y0: at.y - size * 0.95, x1: at.x + approxTextW(text, size) + 0.5, y1: at.y + size * 0.35 } };
}

/** Righino del riquadro: solo con la scritta spostata a mano, dal bordo più vicino alla scritta */
export function zoneLeader(z: Zone, box: Box): [Pt, Pt] | undefined {
  if (!z.label) return undefined;
  const zb = { x0: z.x, y0: z.y, x1: z.x + z.w, y1: z.y + z.h };
  const c = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  return leaderLine(nearestOnBorder(zb, c), box);
}

/** Maniglie del riquadro: angoli e metà dei lati */
export type ZoneHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function zoneHandles(z: Pick<Zone, 'x' | 'y' | 'w' | 'h'>): [ZoneHandle, Pt][] {
  const { x, y, w, h } = z;
  return [['nw', { x, y }], ['n', { x: x + w / 2, y }], ['ne', { x: x + w, y }], ['e', { x: x + w, y: y + h / 2 }],
    ['se', { x: x + w, y: y + h }], ['s', { x: x + w / 2, y: y + h }], ['sw', { x, y: y + h }], ['w', { x, y: y + h / 2 }]];
}

/** Riquadro con la maniglia portata in p (almeno 8 mm per lato; il lato opposto resta fermo) */
export function resizeZone(z: Pick<Zone, 'x' | 'y' | 'w' | 'h'>, h: ZoneHandle, p: Pt): { x: number; y: number; w: number; h: number } {
  let x0 = z.x, y0 = z.y, x1 = z.x + z.w, y1 = z.y + z.h;
  const MIN = 8;
  if (h.includes('w')) x0 = Math.min(p.x, x1 - MIN);
  if (h.includes('e')) x1 = Math.max(p.x, x0 + MIN);
  if (h.includes('n')) y0 = Math.min(p.y, y1 - MIN);
  if (h.includes('s')) y1 = Math.max(p.y, y0 + MIN);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
