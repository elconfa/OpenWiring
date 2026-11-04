// Testi liberi formattati sullo schema: a capo a mano, grassetto, corsivo, sottolineato, elenchi
// puntati e numerati. Il testo resta una stringa con segni semplici (come nei messaggi):
//   **grassetto**  *corsivo*  __sottolineato__
//   "- " o "• " a inizio riga = elenco puntato, "1. " = elenco numerato
// così si cerca, si sostituisce, si traduce e si scrive nel formato testo come prima.

/** Pezzo di testo con lo stesso stile */
export interface Run { s: string; b?: boolean; i?: boolean; u?: boolean }
/** Riga disegnata: rientro in caratteri (seconde righe delle voci di elenco), segno della voce, testo */
export interface RichLine { indent: number; prefix: string; runs: Run[] }

const CHAR = 0.6;

/** Pezzi di una riga con i segni di grassetto, corsivo e sottolineato */
export function parseInline(s: string): Run[] {
  const out: Run[] = [];
  const st = { b: false, i: false, u: false };
  let cur = '';
  const push = () => { if (cur) out.push({ s: cur, ...(st.b ? { b: true } : {}), ...(st.i ? { i: true } : {}), ...(st.u ? { u: true } : {}) }); cur = ''; };
  for (let k = 0; k < s.length; k++) {
    if (s.startsWith('**', k)) { push(); st.b = !st.b; k++; continue; }
    if (s.startsWith('__', k)) { push(); st.u = !st.u; k++; continue; }
    if (s[k] === '*') { push(); st.i = !st.i; continue; }
    cur += s[k];
  }
  push();
  return out;
}

/** Testo senza segni di formattazione (per DXF, ricerca, larghezza) */
export function plainText(text: string): string {
  return text.split('\n').map(l => {
    const m = listItem(l);
    return (m ? m.prefix : '') + parseInline(m ? m.rest : l).map(r => r.s).join('');
  }).join('\n');
}

/** Voce di elenco: segno da scrivere ("• " o "3. ") e resto della riga */
function listItem(line: string): { prefix: string; rest: string } | undefined {
  const b = /^\s*[-•]\s+(.*)$/.exec(line);
  if (b) return { prefix: '• ', rest: b[1] };
  const n = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
  if (n) return { prefix: `${n[1]}. `, rest: n[2] };
  return undefined;
}

/**
 * Righe del testo da disegnare: "\n" va a capo; con la larghezza del riquadro w (mm) le righe lunghe
 * vanno a capo da sole a parole intere, e le seconde righe delle voci di elenco rientrano
 */
export function layoutRich(t: { text: string; size: number; w?: number }): RichLine[] {
  const per = t.w ? Math.max(1, Math.floor(t.w / (t.size * CHAR))) : Infinity;
  const out: RichLine[] = [];
  for (const para of t.text.split('\n')) {
    const m = listItem(para);
    const prefix = m?.prefix ?? '';
    const runs = parseInline(m ? m.rest : para);
    // Parole con il loro stile (gli spazi restano attaccati alla parola che precede)
    const words: Run[] = [];
    for (const r of runs) for (const part of r.s.split(/(?<= )/)) if (part) words.push({ ...r, s: part });
    let line: Run[] = [], len = prefix.length, first = true;
    const flush = () => {
      // Lo spazio in fondo alla riga non conta
      if (line.length) line[line.length - 1] = { ...line[line.length - 1], s: line[line.length - 1].s.replace(/ +$/, '') };
      out.push({ indent: first ? 0 : prefix.length, prefix: first ? prefix : '', runs: line.filter(r => r.s) });
      line = []; len = prefix.length; first = false;
    };
    for (let w of words) {
      const bare = w.s.replace(/ +$/, '').length;
      if (len + bare > per && len > prefix.length) flush();
      // Parola più lunga della riga: si spezza
      while (prefix.length + w.s.replace(/ +$/, '').length > per && per - prefix.length > 0) {
        const cut = per - prefix.length;
        line.push({ ...w, s: w.s.slice(0, cut) }); flush();
        w = { ...w, s: w.s.slice(cut) };
      }
      line.push(w); len += w.s.length;
    }
    flush();
  }
  return out;
}

/** Testo semplice di una riga disegnata */
export const lineText = (l: RichLine) => ' '.repeat(l.indent) + l.prefix + l.runs.map(r => r.s).join('');
