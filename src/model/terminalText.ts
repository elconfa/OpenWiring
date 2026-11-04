// Posizione del numero del morsetto e della sigla della morsettiera sullo schema: come in EPLAN su un filo verticale la morsettiera a sinistra e il numero a destra, su
// un filo orizzontale il numero sopra e la morsettiera sotto. I testi sono orizzontali (auto) oppure
// paralleli o perpendicolari al morsetto, a scelta.
import type { SymbolInstance, TerminalTextDir } from './types';
import { toWorld } from './geometry';

export interface TermTextPos { x: number; y: number; anchor: 'start' | 'middle' | 'end'; /** -90: dal basso verso l'alto */ rot?: number }

/** Testi in verticale? Il morsetto è disegnato in verticale con rot 0 e 180 */
export function terminalTextVertical(inst: Pick<SymbolInstance, 'rot'>, dir: TerminalTextDir = 'auto'): boolean {
  const axisH = inst.rot === 90 || inst.rot === 270;
  return dir === 'parallel' ? !axisH : dir === 'perpendicular' ? axisH : false;
}

/** Posizione del numero (num) e della sigla della morsettiera (strip), con l'altezza del numero size */
export function terminalTextLayout(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>, dir: TerminalTextDir = 'auto', size = 1.9): { num: TermTextPos; strip: TermTextPos } {
  const c = toWorld(inst, { x: 0, y: 4 });
  const axisH = inst.rot === 90 || inst.rot === 270;
  const vertical = terminalTextVertical(inst, dir);
  const big = size * 1.16;
  if (!axisH && !vertical) return { num: { x: c.x + 1.9, y: c.y + 0.7, anchor: 'start' }, strip: { x: c.x - 2, y: c.y + 0.8, anchor: 'end' } };
  if (axisH && !vertical) return { num: { x: c.x, y: c.y - 1.9, anchor: 'middle' }, strip: { x: c.x, y: c.y + 4.4, anchor: 'middle' } };
  // Testi ruotati di -90°: le lettere stanno a sinistra della linea di base
  if (!axisH) return { num: { x: c.x + 1.9 + size * 0.8, y: c.y, anchor: 'middle', rot: -90 }, strip: { x: c.x - 1.9, y: c.y, anchor: 'middle', rot: -90 } };
  return { num: { x: c.x + size * 0.36, y: c.y - 1.9, anchor: 'start', rot: -90 }, strip: { x: c.x + big * 0.36, y: c.y + 1.9, anchor: 'end', rot: -90 } };
}
