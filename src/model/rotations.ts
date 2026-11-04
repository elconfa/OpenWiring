// Rotazioni ammesse di un simbolo (scelte nell'editor dei simboli): alcuni simboli non si girano,
// altri solo in certe posizioni. R sullo schema passa alla rotazione ammessa successiva.
import type { SymbolDef, SymbolInstance } from './types';

export type Rot = SymbolInstance['rot'];
export const ROTS: Rot[] = [0, 90, 180, 270];

/** Rotazioni ammesse (tutte se il simbolo non ne indica) */
export function allowedRots(sym: Pick<SymbolDef, 'rotations'> | undefined): Rot[] {
  const r = sym?.rotations?.length ? ROTS.filter(x => sym.rotations!.includes(x)) : ROTS;
  return r.length ? r : ROTS;
}

/** Rotazione ammessa successiva (R) */
export function nextRot(sym: Pick<SymbolDef, 'rotations'> | undefined, rot: Rot): Rot {
  const a = allowedRots(sym);
  return a.find(x => x > rot) ?? a[0];
}

/** La rotazione se ammessa, altrimenti la prima ammessa */
export function fitRot(sym: Pick<SymbolDef, 'rotations'> | undefined, rot: Rot): Rot {
  const a = allowedRots(sym);
  return a.includes(rot) ? rot : a[0];
}
