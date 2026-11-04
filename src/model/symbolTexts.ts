// Testi di un simbolo sullo schema (sigla, righe sotto la sigla, testi del componente, numero e
// morsettiera dei morsetti, designazioni dei punti di connessione): posizione automatica e, se
// scelta nell'editor dei simboli, posizione propria per ogni rotazione (orientTexts). Per esempio un
// morsetto in verticale con la morsettiera a sinistra e il numero a destra, in orizzontale il numero
// sopra e la morsettiera sotto. Sullo schema i testi si spostano a mano (textOffsets) solo se le
// impostazioni del progetto li lasciano liberi (freeSymbolTexts).
import type { Pt, SymbolDef, SymbolInstance, TextMoveKey, TextPlace, TerminalTextDir } from './types';
import { toWorld, pinLabelPlace, readableText } from './geometry';
import { terminalTextLayout } from './terminalText';

type Inst = Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>;
type Anchor = 'start' | 'middle' | 'end';

/** Allineamento della sigla scelto nell'editor, girato se il simbolo è specchiato o capovolto */
export function tagAnchorFor(inst: Inst, a: Anchor): Anchor {
  const o = toWorld(inst, { x: 0, y: 0 }), r = toWorld(inst, { x: 1, y: 0 });
  return r.x - o.x < -0.5 && a !== 'middle' ? (a === 'start' ? 'end' : 'start') : a;
}

/** Allineamento automatico della sigla: verso l'esterno del simbolo */
export function anchorFor(inst: Pick<SymbolInstance, 'x'>, w: Pt): Anchor {
  if (w.x < inst.x - 0.5) return 'end';
  if (w.x > inst.x + 0.5) return 'start';
  return 'middle';
}

/**
 * Posizione scelta nell'editor per la rotazione dell'istanza, in coordinate della pagina (con il
 * simbolo specchiato la posizione si specchia e l'allineamento si inverte)
 */
export function orientPlace(inst: Inst, sym: Pick<SymbolDef, 'orientTexts'>, key: TextMoveKey): TextPlace | undefined {
  const p = sym.orientTexts?.[inst.rot]?.[key];
  if (!p) return undefined;
  if (!inst.mirror) return { ...p, x: inst.x + p.x, y: inst.y + p.y };
  const anchor = p.anchor === 'start' ? 'end' : p.anchor === 'end' ? 'start' : p.anchor;
  return { ...p, x: inst.x - p.x, y: inst.y + p.y, ...(anchor ? { anchor } : {}) };
}

/** Testi del simbolo che si possono mettere al loro posto per ogni rotazione */
export function placeableTexts(sym: SymbolDef): TextMoveKey[] {
  const term = sym.role === 'terminal' || sym.role === 'pin';
  const net = sym.role === 'potential' || sym.role === 'link';
  const out: TextMoveKey[] = [];
  if (term) out.push('termStrip', 'termNum');
  else if (sym.role !== 'link') out.push('tag', 'lines');
  if (!sym.textBox) for (const f of sym.fields ?? []) out.push(f.f);
  if (!net && !term) for (const p of sym.pins) out.push(`pin:${p.id}`);
  return out;
}

/**
 * Posizione automatica (come sullo schema, senza scelte dell'editor né spostamenti a mano) di un
 * testo del simbolo nell'istanza
 */
export function autoTextPlace(inst: Inst, sym: SymbolDef, key: TextMoveKey, o: { pinSize?: number; termSize?: number; termDir?: TerminalTextDir } = {}): TextPlace | undefined {
  if (key === 'tag' || key === 'lines') {
    const w = toWorld(inst, sym.tagPos ?? { x: -6, y: 8 });
    const anchor = sym.role === 'netnode' ? 'start' : sym.tagAnchor ? tagAnchorFor(inst, sym.tagAnchor) : anchorFor(inst, w);
    return { ...w, anchor };
  }
  if (key === 'termNum' || key === 'termStrip') {
    const l = terminalTextLayout(inst, o.termDir ?? 'auto', o.termSize ?? 1.9);
    const t = key === 'termNum' ? l.num : l.strip;
    return { x: t.x, y: t.y, anchor: t.anchor, ...(t.rot ? { rot: t.rot } : {}) };
  }
  if (key.startsWith('pin:')) {
    const pin = sym.pins.find(p => p.id === key.slice(4));
    if (!pin) return undefined;
    const w = pinLabelPlace(inst, pin, o.pinSize ?? 1.8);
    return { x: w.x, y: w.y, anchor: w.anchor };
  }
  const f = (sym.fields ?? []).find(x => x.f === key);
  if (!f) return undefined;
  const r = readableText(inst, { t: 'text', x: f.x, y: f.y, s: '', size: f.size ?? 1.9, anchor: f.anchor ?? 'start', ...(f.rot ? { rot: f.rot } : {}) });
  return { x: r.x, y: r.y, anchor: r.anchor, ...(r.rot ? { rot: r.rot } : {}) };
}

/**
 * Posizione del testo nell'istanza: quella scelta nell'editor per la rotazione, altrimenti automatica.
 * Senza un orientamento scelto nell'editor il testo si gira come quello automatico (per i morsetti
 * secondo «Testi dei morsetti»: orizzontali, paralleli o perpendicolari)
 */
export function textPlace(inst: Inst, sym: SymbolDef, key: TextMoveKey, o: Parameters<typeof autoTextPlace>[3] = {}): TextPlace | undefined {
  const own = orientPlace(inst, sym, key);
  if (own) {
    if (own.rot !== undefined && own.anchor) return own;
    const auto = autoTextPlace(inst, sym, key, o);
    const rot = own.rot ?? auto?.rot;
    return { x: own.x, y: own.y, anchor: own.anchor ?? auto?.anchor, ...(rot ? { rot } : {}) };
  }
  // Le righe sotto la sigla seguono la sigla messa al suo posto
  if (key === 'lines') { const t = orientPlace(inst, sym, 'tag'); if (t) return t; }
  return autoTextPlace(inst, sym, key, o);
}

/**
 * Spostamento a mano sullo schema del testo dell'istanza: zero se i testi sono bloccati nella
 * posizione dell'editor (l'immagine dei contatti sotto la bobina resta sempre spostabile)
 */
export function textOffset(inst: Pick<SymbolInstance, 'textOffsets'>, key: TextMoveKey, free: boolean | undefined): Pt {
  return (free || key === 'contacts' ? inst.textOffsets?.[key] : undefined) ?? { x: 0, y: 0 };
}
