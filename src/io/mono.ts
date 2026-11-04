// Bianco e nero per la stampa e il PDF: righe e scritte nere (niente grigi chiari che sulla carta non si
// vedono), riempimenti chiari bianchi e scuri neri, trasparenze tolte. Le immagini restano come sono.

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], yellow: [255, 255, 0], orange: [255, 165, 0],
};

/** Colore in rgb + opacità (undefined se non è un colore: none, url(…), currentColor…) */
function parse(v: string): { rgb: [number, number, number]; a: number } | undefined {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map(c => c + c).join('') : m[1];
    return { rgb: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number], a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { rgb: [n[0], n[1], n[2]], a: n.length > 3 ? n[3] : 1 };
  }
  return NAMED[s] ? { rgb: NAMED[s], a: 1 } : undefined;
}

/** Luminosità sul foglio bianco (0 nero … 1 bianco), con l'opacità */
function paperLum(c: { rgb: [number, number, number]; a: number }, opacity = 1): number {
  const [r, g, b] = c.rgb.map(x => x / 255);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1 - (1 - l) * c.a * opacity;
}

const isWhite = (c: { rgb: [number, number, number]; a: number }) => paperLum(c) > 0.97;

/** Colore del tratto o del testo: nero, tranne il bianco (sfondi, aloni sotto le scritte) */
function inkColor(v: string): string {
  const c = parse(v);
  if (!c) return v;
  return isWhite(c) && c.a >= 1 ? '#fff' : '#000';
}

/** Riempimento delle forme: chiaro → bianco, scuro → nero */
function fillColor(v: string, opacity: number): string {
  const c = parse(v);
  if (!c) return v;
  return paperLum(c, opacity) > 0.7 ? '#fff' : '#000';
}

// Il riempimento dei gruppi è quello delle scritte che contengono
const TEXT_TAGS = new Set(['text', 'tspan', 'textPath', 'g', 'svg']);

/** Converte il markup SVG di una pagina in bianco e nero */
export function monoSvg(markup: string): string {
  return markup.replace(/<([a-zA-Z][\w:-]*)(\s[^>]*?)?(\/?)>/g, (all, tag: string, attrs: string | undefined, close: string) => {
    if (!attrs || tag === 'image') return all;
    const num = (name: string) => {
      const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs) ?? new RegExp(`[;"]\\s*${name}:\\s*([^;"]+)`).exec(attrs);
      const n = m ? parseFloat(m[1]) : 1;
      return isNaN(n) ? 1 : n;
    };
    const fillOpacity = num('fill-opacity') * num('opacity');
    const text = TEXT_TAGS.has(tag);
    const map = (name: string, v: string) => {
      if (name === 'fill') return text ? inkColor(v) : fillColor(v, fillOpacity);
      return inkColor(v);
    };
    let out = attrs
      // Trasparenze tolte: un tratto al 50 % è grigio
      .replace(/\s(opacity|fill-opacity|stroke-opacity)="[^"]*"/g, '')
      .replace(/\s(fill|stroke|color|stop-color)="([^"]*)"/g, (_m, n: string, v: string) => ` ${n}="${map(n, v)}"`)
      .replace(/\sstyle="([^"]*)"/g, (_m, st: string) => ` style="${st
        .replace(/(^|;)\s*(opacity|fill-opacity|stroke-opacity)\s*:[^;]*/g, '$1')
        .replace(/(^|;)\s*(fill|stroke|color|stop-color)\s*:\s*([^;]+)/g, (_x, pre: string, n: string, v: string) => `${pre}${n}:${map(n, v)}`)}"`);
    return `<${tag}${out}${close}>`;
  });
}

/** Colori della pagina disegnata con jsPDF (liste in coda, indice): testo e righe neri, sfondi chiari bianchi */
export function monoPdf(doc: { setTextColor: (...a: unknown[]) => unknown; setDrawColor: (...a: unknown[]) => unknown; setFillColor: (...a: unknown[]) => unknown }) {
  const lum = (a: unknown[]) => {
    if (typeof a[0] === 'string') { const c = parse(a[0]); return c ? paperLum(c) : 0; }
    const [r, g = r, b = r] = a.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const text = doc.setTextColor.bind(doc), draw = doc.setDrawColor.bind(doc), fill = doc.setFillColor.bind(doc);
  doc.setTextColor = (...a: unknown[]) => text(...(lum(a) > 0.97 ? [255, 255, 255] : [0, 0, 0]));
  doc.setDrawColor = (...a: unknown[]) => draw(...(lum(a) > 0.97 ? [255, 255, 255] : [0, 0, 0]));
  doc.setFillColor = (...a: unknown[]) => fill(...(lum(a) > 0.7 ? [255, 255, 255] : [0, 0, 0]));
}
