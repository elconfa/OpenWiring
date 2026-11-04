// Vista Liste a schermo: colonne nascoste per lista e dimensione del testo delle tabelle. Restano in
// questo computer (non nel progetto); si cambiano dalla vista o dalla finestra «Personalizza la lista».
import { useSyncExternalStore } from 'react';

export interface ReportsViewPrefs {
  hidden: Record<string, string[]>; size?: number;
  /** Quadro delle liste (id; PANEL_NONE = righe senza quadro; assente = tutto il progetto) */
  panel?: string;
}

export const PANEL_NONE = '#none';

const KEY = 'reports:view';
let prefs: ReportsViewPrefs = (() => {
  try { return { hidden: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as ReportsViewPrefs; } catch { return { hidden: {} }; }
})();
const subs = new Set<() => void>();

export function setReportsView(next: ReportsViewPrefs) {
  prefs = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* memoria del browser non disponibile */ }
  subs.forEach(f => f());
}

export const useReportsView = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => prefs);

/** Mostra o nasconde una colonna di una lista nella vista a schermo */
export function setReportsViewColumn(title: string, col: string, on: boolean) {
  const h = new Set(prefs.hidden?.[title] ?? []);
  if (on) h.delete(col); else h.add(col);
  setReportsView({ ...prefs, hidden: { ...prefs.hidden, [title]: [...h] } });
}

export const REPORTS_VIEW_SIZE = { def: 12, min: 9, max: 22 };
