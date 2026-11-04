// Testi che vanno a capo da soli dentro un riquadro (es. indirizzo, variabile e commento dei canali
// dei gruppi I/O PLC): uno sotto l'altro, a parole intere; le parole più lunghe della riga si
// spezzano. Quello che non entra nel riquadro finisce con "…".
import { layoutRich, lineText } from './textRich';

export interface TextBox { x: number; y: number; w: number; h: number }

/** Larghezza stimata di un carattere rispetto all'altezza del testo */
const CHAR = 0.6;
/** Distanza tra le righe rispetto all'altezza del testo */
export const LINE_GAP = 1.3;

/** Righe di un testo larghe al massimo width caratteri */
export function wrapWords(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (let w of text.split(/\s+/).filter(Boolean)) {
    // Parola più lunga della riga: si spezza
    while (w.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!w) continue;
    if (line && line.length + 1 + w.length > width) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/**
 * Righe dei testi nel riquadro (coordinate del simbolo, linea di base): i testi in ordine, ognuno
 * su una o più righe; first: la riga è la prima di un testo (per scriverla in grassetto se serve)
 */
export function flowLines(box: TextBox, texts: string[], size: number): { x: number; y: number; s: string; first: boolean; index: number }[] {
  const per = Math.max(1, Math.floor(box.w / (size * CHAR)));
  const step = size * LINE_GAP;
  const out: { x: number; y: number; s: string; first: boolean; index: number }[] = [];
  let y = box.y + size * 1.05;
  for (let i = 0; i < texts.length; i++) {
    const lines = wrapWords(texts[i], per);
    for (let k = 0; k < lines.length; k++) {
      if (y > box.y + box.h + 0.01) {
        // Non c'è più posto: l'ultima riga scritta finisce con "…"
        const last = out[out.length - 1];
        if (last) last.s = `${last.s.slice(0, Math.max(0, per - 1))}…`;
        return out;
      }
      out.push({ x: box.x, y: Math.round(y * 100) / 100, s: lines[k], first: k === 0, index: i });
      y += step;
    }
  }
  return out;
}

/**
 * Righe di un testo libero dello schema, senza segni di formattazione: "\n" va sempre a capo; con
 * la larghezza del riquadro w (mm) va a capo da solo a parole intere (vedi textRich.ts)
 */
export function textLines(t: { text: string; size: number; w?: number }): string[] {
  return layoutRich(t).map(lineText);
}

/** Ingombro di un testo libero (senza rotazione): la prima linea di base è in y; align come il testo */
export function textBounds(t: { x: number; y: number; text: string; size: number; w?: number; align?: 'start' | 'middle' | 'end' }) {
  const lines = textLines(t);
  const w = t.w ?? Math.max(...lines.map(l => l.length)) * t.size * CHAR;
  // Senza riquadro il punto è l'aggancio del testo; con il riquadro è il suo angolo a sinistra
  const x0 = t.w || !t.align || t.align === 'start' ? t.x : t.align === 'end' ? t.x - w : t.x - w / 2;
  return { x0, y0: t.y - t.size, x1: x0 + w, y1: t.y + (lines.length - 1) * t.size * LINE_GAP + 0.4 };
}
