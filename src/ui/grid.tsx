// Tabelle delle viste (Dispositivi, Morsettiere, Articoli, PLC…): ordinamento con clic sul titolo
// della colonna (crescente, decrescente, di nuovo com'era) e larghezza delle colonne trascinando il
// bordo destro del titolo (doppio clic: larghezze automatiche). Ordine e larghezze restano per
// tabella in questo computer.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { tx } from '../i18n/ui';

type Value = string | number | undefined | null;
interface Saved { sort?: { key: string; dir: 1 | -1 }; widths?: Record<string, number> }

const load = (id: string): Saved => {
  try { return JSON.parse(localStorage.getItem(`grid:${id}`) ?? '{}') as Saved; } catch { return {}; }
};
const save = (id: string, v: Saved) => {
  try { localStorage.setItem(`grid:${id}`, JSON.stringify(v)); } catch { /* memoria del browser non disponibile */ }
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function compareValues(a: Value, b: Value): number {
  const ea = a === undefined || a === null || a === '', eb = b === undefined || b === null || b === '';
  // Le celle vuote vanno in fondo in tutti e due i versi
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Righe ordinate secondo la colonna scelta; senza ordinamento restano nell'ordine ricevuto */
export function sortRows<T>(rows: T[], get: ((r: T) => Value) | undefined, dir: 1 | -1): T[] {
  if (!get) return rows;
  return rows.map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const c = compareValues(a.v, b.v);
      const empty = (x: Value) => x === undefined || x === null || x === '';
      return (empty(a.v) || empty(b.v) ? c : c * dir) || a.i - b.i;
    })
    .map(x => x.r);
}

export interface Grid<T> {
  rows: T[];
  sortKey?: string;
  dir: 1 | -1;
  widths: Record<string, number>;
  toggleSort(key: string): void;
  setWidths(w: Record<string, number>): void;
  sortable(key: string): boolean;
  id: string;
}

/**
 * Stato di una tabella: id per ricordare ordine e larghezze, righe e valore di ogni colonna
 * ordinabile (le colonne senza valore non si ordinano)
 */
export function useGrid<T>(id: string, rows: T[], columns: Record<string, (r: T) => Value>): Grid<T> {
  // La stessa vista può mostrare tabelle diverse (es. le liste): lo stato segue l'id
  const [state, setState] = useState(() => ({ id, saved: load(id) }));
  const saved = state.id === id ? state.saved : load(id);
  if (state.id !== id) setState({ id, saved });
  const update = (v: Saved) => { setState({ id, saved: v }); save(id, v); };
  const sort = saved.sort && columns[saved.sort.key] ? saved.sort : undefined;
  const sorted = useMemo(() => sortRows(rows, sort ? columns[sort.key] : undefined, sort?.dir ?? 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort?.key, sort?.dir, id]);
  return {
    id, rows: sorted, sortKey: sort?.key, dir: sort?.dir ?? 1, widths: saved.widths ?? {},
    sortable: k => !!columns[k],
    toggleSort: key => {
      // Crescente → decrescente → ordine originale
      const next = sort?.key !== key ? { key, dir: 1 as const } : sort.dir === 1 ? { key, dir: -1 as const } : undefined;
      update({ ...saved, sort: next });
    },
    setWidths: w => update({ ...saved, widths: Object.keys(w).length ? w : undefined }),
  };
}

/**
 * Titolo di colonna: clic per ordinare, maniglia sul bordo destro per la larghezza. Alla prima
 * maniglia trascinata si fissano le larghezze attuali di tutte le colonne (la tabella passa a
 * larghezze fisse); doppio clic sulla maniglia le rimette automatiche.
 */
export function Th({ g, k, children, title, className }: { g: Grid<unknown> | Grid<never>; k: string; children?: ReactNode; title?: string; className?: string }) {
  const grid = g as Grid<unknown>;
  const w = grid.widths[k];
  const on = grid.sortKey === k;
  // Dopo un trascinamento del bordo il clic che segue non deve ordinare
  const resized = useRef(false);
  const EDGE = 8;
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resized.current = true;
    const th = (e.currentTarget as HTMLElement).closest('th')!;
    const row = th.parentElement!;
    // Larghezze di partenza: quelle salvate o quelle che le colonne hanno adesso
    const base: Record<string, number> = { ...grid.widths };
    for (const cell of Array.from(row.children) as HTMLElement[]) {
      const key = cell.dataset.col;
      if (key && base[key] === undefined) base[key] = Math.round(cell.getBoundingClientRect().width);
    }
    const x0 = e.clientX, w0 = base[k] ?? th.getBoundingClientRect().width;
    // Un clic sul bordo senza spostare il mouse non cambia niente
    let cur: Record<string, number> | undefined;
    const move = (ev: MouseEvent) => {
      if (!cur && Math.abs(ev.clientX - x0) < 2) return;
      cur = { ...base, [k]: Math.max(32, Math.round(w0 + ev.clientX - x0)) };
      grid.setWidths(cur);
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); if (cur) grid.setWidths(cur); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const style = w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  return (
    <th data-col={k} style={style} className={[className, grid.sortable(k) ? 'sortable' : '', on ? 'sorted' : ''].filter(Boolean).join(' ') || undefined}
      title={title ?? (grid.sortable(k) ? tx('Clic per ordinare; trascina il bordo destro per la larghezza') : undefined)}
      onMouseDown={e => {
        // Il bordo destro (gli ultimi pixel del titolo) regola la larghezza
        resized.current = false;
        if (e.button === 0 && e.clientX > e.currentTarget.getBoundingClientRect().right - EDGE) startResize(e);
      }}
      onClick={() => { if (!resized.current && grid.sortable(k)) grid.toggleSort(k); resized.current = false; }}
      onDoubleClick={e => { if (e.clientX > e.currentTarget.getBoundingClientRect().right - EDGE) grid.setWidths({}); }}>
      {children}{on && <span className="sort-arrow">{grid.dir === 1 ? ' ▲' : ' ▼'}</span>}
      <span className="col-resize" title={tx('Trascina per la larghezza; doppio clic: larghezze automatiche')} />
    </th>
  );
}

/**
 * Attributi della tabella: con almeno una larghezza impostata dall'utente le colonne diventano a
 * larghezza fissa e la tabella è larga quanto la loro somma (si scorre di lato se serve)
 */
export function gridProps(g: Grid<unknown> | Grid<never>, base = 'grid'): { className: string; style?: React.CSSProperties } {
  const w = Object.values((g as Grid<unknown>).widths);
  return w.length ? { className: `${base} fixed-cols`, style: { width: w.reduce((a, b) => a + b, 0) } } : { className: base };
}
