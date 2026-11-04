// Posizioni fisse sullo schema, dalle impostazioni del progetto, così tutte le pagine hanno la
// stessa impaginazione: fili in alto e in basso (comandi «Filo in alto» / «Filo in basso», ognuno un
// passo dopo quelli già messi) e la riga dei punti I/O PLC. Gli elementi restano poi spostabili.
import type { IoKind, Page, ProjectSettings, Pt, RailSetting } from './types';

export const RAIL_DEFAULTS: Record<'top' | 'bottom', RailSetting> = {
  top: { y: 20, step: 4, x0: 24, x1: 404 },
  bottom: { y: 236, step: 4, x0: 24, x1: 404, up: true },
};
export const PLC_ROW_DEFAULT = { y: 160, yOut: 60, x0: 40, step: 16 };

export const railOf = (s: Partial<ProjectSettings>, which: 'top' | 'bottom'): RailSetting =>
  ({ ...RAIL_DEFAULTS[which], ...(which === 'top' ? s.railTop : s.railBottom) });

/** Quota del filo k (0 = il primo): in alto verso il basso; in basso di serie verso l'alto (up), o verso il basso */
export const railY = (r: RailSetting, k: number) => r.y + (r.up ? -1 : 1) * k * r.step;

/** Un tratto orizzontale di filo a quota y che tocca l'intervallo da x0 a x1? */
function taken(page: Page, y: number, x0: number, x1: number): boolean {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  return page.elements.some(e => e.kind === 'wire' && e.points.some((a, i) => {
    const b = e.points[i + 1];
    return b && Math.abs(a.y - y) < 0.01 && Math.abs(b.y - y) < 0.01 && Math.max(a.x, b.x) > lo + 0.01 && Math.min(a.x, b.x) < hi - 0.01;
  }));
}

/** Punti del prossimo filo in alto o in basso della pagina (il primo posto libero), o undefined se sono tutti occupati */
export function nextRail(page: Page, s: Partial<ProjectSettings>, which: 'top' | 'bottom', max = 16): Pt[] | undefined {
  const r = railOf(s, which);
  for (let k = 0; k < max; k++) {
    const y = railY(r, k);
    if (!taken(page, y, r.x0, r.x1)) return [{ x: r.x0, y }, { x: r.x1, y }];
  }
  return undefined;
}

/** Quota della riga per il tipo di I/O: gli ingressi in basso (y), le uscite più in alto (yOut), con i carichi sotto */
export const plcRowY = (r: NonNullable<ProjectSettings['plcRow']>, io?: IoKind) =>
  (io === 'DO' || io === 'AO' ? r.yOut ?? PLC_ROW_DEFAULT.yOut : r.y);

/** Punto I/O PLC sulla riga fissa: y della riga (ingressi o uscite), x sul posto più vicino (dal primo in poi) */
export function plcSlot(s: Partial<ProjectSettings>, at: Pt, io?: IoKind): Pt | undefined {
  const r = s.plcRow;
  if (!r || !(r.step > 0)) return undefined;
  const k = Math.max(0, Math.round((at.x - r.x0) / r.step));
  return { x: r.x0 + k * r.step, y: plcRowY(r, io) };
}
