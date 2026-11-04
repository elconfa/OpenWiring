// Riquadri regolabili delle viste: barra verticale tra elenco e dettagli (larghezza) e barra sotto
// le sezioni (altezza). Si trascina la barra; doppio clic rimette la misura predefinita. Le misure
// restano per riquadro in questo computer.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tx } from '../i18n/ui';

const load = (id: string): number | undefined => {
  try { const v = Number(localStorage.getItem(`split:${id}`)); return v > 0 ? v : undefined; } catch { return undefined; }
};
const save = (id: string, v: number | undefined) => {
  try { if (v) localStorage.setItem(`split:${id}`, String(Math.round(v))); else localStorage.removeItem(`split:${id}`); } catch { /* memoria del browser non disponibile */ }
};

/** Trascinamento: misura di partenza più lo spostamento del mouse, entro i limiti */
function drag(e: React.MouseEvent, axis: 'x' | 'y', start: number, min: number, max: number, set: (v: number) => void) {
  e.preventDefault();
  const p0 = axis === 'x' ? e.clientX : e.clientY;
  document.body.classList.add(axis === 'x' ? 'dragging-x' : 'dragging-y');
  const move = (ev: MouseEvent) => set(Math.max(min, Math.min(max, start + (axis === 'x' ? ev.clientX : ev.clientY) - p0)));
  const up = () => {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging-x', 'dragging-y');
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/**
 * Barra tra l'elenco e i dettagli di una vista a due colonne (Articoli, Morsettiere, Connettori):
 * va messa in mezzo ai due riquadri e imposta le colonne della vista. Senza misura salvata le
 * colonne restano in proporzione (1,4 : 1).
 */
export function ColSplitter({ id }: { id: string }) {
  const [w, setW] = useState(() => load(id));
  const set = (v: number | undefined) => { setW(v); save(id, v); };
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    if (box) box.style.gridTemplateColumns = w ? `${w}px 5px minmax(0, 1fr)` : 'minmax(0, 1.4fr) 5px minmax(0, 1fr)';
  }, [w]);
  return (
    <div ref={ref} className="v-splitter" title={tx('Trascina per la larghezza; doppio clic: misura predefinita')}
      onMouseDown={e => {
        const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const cur = (e.currentTarget.previousElementSibling as HTMLElement).getBoundingClientRect().width;
        drag(e, 'x', cur, 200, box.width - 220, set);
      }}
      onDoubleClick={() => set(undefined)} />
  );
}

/**
 * Sezione con l'altezza regolabile dalla barra sotto: senza misura salvata usa l'altezza del suo
 * stile (es. al massimo un terzo della vista)
 */
export function ResizableSection({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const [h, setH] = useState(() => load(id));
  const set = (v: number | undefined) => { setH(v); save(id, v); };
  return (
    <>
      <div className={className} style={h ? { height: h, maxHeight: 'none', flex: '0 0 auto' } : undefined}>{children}</div>
      <div className="h-splitter" title={tx('Trascina per l\'altezza; doppio clic: misura predefinita')}
        onMouseDown={e => drag(e, 'y', (e.currentTarget.previousElementSibling as HTMLElement).getBoundingClientRect().height, 40, window.innerHeight - 160, set)}
        onDoubleClick={() => set(undefined)} />
    </>
  );
}
