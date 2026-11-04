// Riquadri della finestra: Modello e Proprietà a sinistra, Simboli a destra,
// Vista report in basso. Si allargano e si alzano trascinando i bordi e i titoli; si possono
// nascondere: resta una striscia sul bordo, passandoci sopra col mouse il riquadro si riapre sopra
// il disegno e si richiude allontanando il mouse. Si possono anche chiudere del tutto (✕) e riaprire
// dal menu Visualizza ▸ Riquadri, o staccare in una finestra propria da portare sul secondo monitor
// (⧉, vedi detach.tsx). Le misure e la posizione delle finestre restano per le volte successive.
import { useRef } from 'react';
import { create } from 'zustand';
import { tx } from '../i18n/ui';

export type PanelId = 'left' | 'right' | 'log';
/** Riquadri che si chiudono del tutto (✕ sul titolo) e si riaprono da Visualizza ▸ Riquadri */
export type BoxId = 'tree' | 'props' | 'right' | 'log';

export interface PanelLayout {
  leftW: number; rightW: number;
  /** Altezza dell'albero del Modello (il resto va alle Proprietà) */
  treeH: number;
  /** Altezza della Vista report */
  logH: number;
  hidden: Record<PanelId, boolean>;
  closed: Record<BoxId, boolean>;
  /** Riquadri in una finestra propria (es. sul secondo monitor) */
  detached: Record<BoxId, boolean>;
  /** Posizione e misure delle finestre staccate, sullo schermo */
  bounds: Partial<Record<BoxId, WinBounds>>;
}

export interface WinBounds { x: number; y: number; w: number; h: number }

const KEY = 'elettrocad.panels';
const DEFAULT: PanelLayout = {
  leftW: 290, rightW: 250, treeH: 300, logH: 92,
  hidden: { left: false, right: false, log: false }, closed: { tree: false, props: false, right: false, log: false },
  detached: { tree: false, props: false, right: false, log: false }, bounds: {},
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function load(): PanelLayout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PanelLayout>;
    return { ...DEFAULT, ...v, hidden: { ...DEFAULT.hidden, ...(v.hidden ?? {}) }, closed: { ...DEFAULT.closed, ...(v.closed ?? {}) },
      detached: { ...DEFAULT.detached, ...(v.detached ?? {}) }, bounds: { ...(v.bounds ?? {}) } };
  } catch { return DEFAULT; }
}

interface PanelState {
  layout: PanelLayout;
  /** Riquadro nascosto aperto al passaggio del mouse */
  peek: PanelId | null;
  set(patch: Partial<PanelLayout>): void;
  setPeek(id: PanelId | null): void;
  /** Nasconde il riquadro (resta la striscia sul bordo) o lo fissa di nuovo */
  toggle(id: PanelId): void;
  /** Chiude o riapre un riquadro */
  setClosed(id: BoxId, closed: boolean): void;
  /** Porta il riquadro in una finestra propria o lo rimette nella finestra principale */
  setDetached(id: BoxId, detached: boolean): void;
  setBounds(id: BoxId, b: WinBounds): void;
}

/** Misure e stato dei riquadri, condivisi tra la finestra e il menu Visualizza */
export const usePanelStore = create<PanelState>((set) => ({
  layout: load(),
  peek: null,
  set: patch => set(s => {
    const n = { ...s.layout, ...patch };
    return { layout: { ...n, leftW: clamp(n.leftW, 180, 700), rightW: clamp(n.rightW, 170, 600), treeH: clamp(n.treeH, 60, 1200), logH: clamp(n.logH, 40, 600) } };
  }),
  setPeek: peek => set({ peek }),
  toggle: id => set(s => ({ layout: { ...s.layout, hidden: { ...s.layout.hidden, [id]: !s.layout.hidden[id] } }, peek: null })),
  setClosed: (id, closed) => set(s => {
    // Un riquadro chiuso o riaperto dal menu torna nella finestra principale
    const layout = { ...s.layout, closed: { ...s.layout.closed, [id]: closed }, detached: { ...s.layout.detached, [id]: false } };
    // Un riquadro riaperto si vede subito, anche se prima era a scomparsa
    const side: PanelId = id === 'tree' || id === 'props' ? 'left' : id;
    if (!closed) layout.hidden = { ...layout.hidden, [side]: false };
    return { layout, peek: null };
  }),
  setDetached: (id, detached) => set(s => ({
    layout: { ...s.layout, detached: { ...s.layout.detached, [id]: detached }, closed: { ...s.layout.closed, [id]: false } }, peek: null,
  })),
  setBounds: (id, b) => set(s => ({ layout: { ...s.layout, bounds: { ...s.layout.bounds, [id]: b } } })),
}));

/** Riquadri che non stanno nella finestra principale: chiusi o in una finestra propria */
export const awayOf = (L: PanelLayout): Record<BoxId, boolean> =>
  ({ tree: L.closed.tree || L.detached.tree, props: L.closed.props || L.detached.props, right: L.closed.right || L.detached.right, log: L.closed.log || L.detached.log });

/** Le finestre staccate si aprono solo nell'app desktop */
export const canDetach = () => !!window.elettro;
usePanelStore.subscribe(s => { try { localStorage.setItem(KEY, JSON.stringify(s.layout)); } catch { /* preferenza non salvata */ } });

/** Misure dei riquadri e riquadro aperto al passaggio del mouse (peek) */
export function usePanels() {
  return usePanelStore();
}

/** Pulsante ✕ sul titolo: chiude il riquadro (si riapre da Visualizza ▸ Riquadri) */
export function CloseButton({ id }: { id: BoxId }) {
  return (
    <button className="panel-pin panel-close" onClick={() => usePanelStore.getState().setClosed(id, true)}
      title={tx('Chiudi il riquadro: si riapre dal menu Visualizza ▸ Riquadri')}>✕</button>
  );
}

/** Pulsante ⧉ sul titolo: porta il riquadro in una finestra propria (es. sul secondo monitor) */
export function DetachButton({ id }: { id: BoxId }) {
  if (!canDetach()) return null;
  return (
    <button className="panel-pin" onClick={() => usePanelStore.getState().setDetached(id, true)}
      title={tx('Apri in una finestra separata, da spostare anche sul secondo monitor')}>⧉</button>
  );
}

/**
 * Maniglia da trascinare: onDrag riceve lo spostamento del mouse dall'inizio (dx o dy) e la misura
 * di partenza la tiene chi la usa
 */
export function useDrag(onDrag: (d: { dx: number; dy: number }) => void, onStart?: () => void) {
  const ref = useRef(onDrag);
  ref.current = onDrag;
  return (ev: React.MouseEvent) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest('button')) return;
    ev.preventDefault();
    onStart?.();
    const x0 = ev.clientX, y0 = ev.clientY;
    const move = (e: MouseEvent) => ref.current({ dx: e.clientX - x0, dy: e.clientY - y0 });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('dragging-panel'); };
    document.body.classList.add('dragging-panel');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
}

/** Pulsante sul titolo del riquadro: nasconde il riquadro, o lo fissa di nuovo se è nascosto */
export function PinButton({ hidden, onClick, side }: { hidden: boolean; onClick: () => void; side: 'left' | 'right' | 'bottom' }) {
  const icon = hidden ? '📌' : side === 'left' ? '⇤' : side === 'right' ? '⇥' : '⤓';
  return (
    <button className="panel-pin" onClick={onClick}
      title={hidden ? tx('Fissa il riquadro') : tx('Nascondi il riquadro: si riapre passando con il mouse sul bordo')}>{icon}</button>
  );
}
