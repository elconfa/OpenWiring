// Testi del PDF: correzioni perché svg2pdf scriva lo stesso carattere della stampa diretta

/**
 * Spessori del carattere che il PDF sa scrivere: svg2pdf conosce solo normale e grassetto
 * (400/700); con 500 o 600 non trova Helvetica e passa al Times, e il Times resta anche sui testi
 * vicini (rimandi, sigle). Fino a 500 diventa normale, da 600 grassetto, come nella stampa diretta.
 */
export function pdfFontWeights(svg: string): string {
  return svg.replace(/font-weight="([^"]*)"/g, (_, w: string) => {
    const n = w === 'bold' || w === 'bolder' ? 700 : w === 'normal' || w === 'lighter' ? 400 : parseInt(w, 10);
    return `font-weight="${!isNaN(n) && n >= 600 ? 'bold' : 'normal'}"`;
  });
}
