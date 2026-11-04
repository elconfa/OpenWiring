// Allineamento degli elementi selezionati, sullo schema e nell'editor dei
// simboli: a sinistra, a destra, in alto, in basso, sulla stessa colonna o sulla stessa riga.
import type { Pt } from './types';
import { tn } from '../i18n/ui';

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'column' | 'row';

export const ALIGN_MODES: { id: AlignMode; name: string; icon: string }[] = [
  { id: 'left', name: tn('Allinea a sinistra'), icon: '⇤' },
  { id: 'right', name: tn('Allinea a destra'), icon: '⇥' },
  { id: 'top', name: tn('Allinea in alto'), icon: '⤒' },
  { id: 'bottom', name: tn('Allinea in basso'), icon: '⤓' },
  { id: 'column', name: tn('Centro verticale (stessa colonna)'), icon: '┃' },
  { id: 'row', name: tn('Centro orizzontale (stessa riga)'), icon: '━' },
];

/**
 * Ingombro di un elemento e il suo punto di riferimento per i centri (per i simboli il punto di
 * inserimento, così i punti di connessione finiscono sulla stessa linea)
 */
export interface AlignBox { x0: number; y0: number; x1: number; y1: number; ref: Pt }

/**
 * Spostamento di ogni elemento: i bordi si allineano a quello più esterno della selezione, i
 * centri al riferimento del primo elemento selezionato
 */
export function alignDeltas(boxes: AlignBox[], mode: AlignMode): Pt[] {
  if (boxes.length < 2) return boxes.map(() => ({ x: 0, y: 0 }));
  const first = boxes[0].ref;
  const x0 = Math.min(...boxes.map(b => b.x0)), x1 = Math.max(...boxes.map(b => b.x1));
  const y0 = Math.min(...boxes.map(b => b.y0)), y1 = Math.max(...boxes.map(b => b.y1));
  return boxes.map(b => {
    switch (mode) {
      case 'left': return { x: x0 - b.x0, y: 0 };
      case 'right': return { x: x1 - b.x1, y: 0 };
      case 'top': return { x: 0, y: y0 - b.y0 };
      case 'bottom': return { x: 0, y: y1 - b.y1 };
      case 'column': return { x: first.x - b.ref.x, y: 0 };
      case 'row': return { x: 0, y: first.y - b.ref.y };
    }
  });
}
