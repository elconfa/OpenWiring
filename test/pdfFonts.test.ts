// Carattere del PDF uguale alla stampa diretta: svg2pdf conosce solo normale e grassetto
import { describe, it, expect } from 'vitest';
import { pdfFontWeights } from '../src/io/pdfFonts';

describe('spessori del carattere nel PDF', () => {
  it('500 diventa normale e 600 grassetto: niente Times sui rimandi e sulle sigle', () => {
    const svg = '<text font-weight="500">24V2</text><text font-weight="600">-K1</text><text font-weight="700">T</text><text font-weight="normal">a</text><text font-weight="bold">b</text>';
    expect(pdfFontWeights(svg)).toBe('<text font-weight="normal">24V2</text><text font-weight="bold">-K1</text><text font-weight="bold">T</text><text font-weight="normal">a</text><text font-weight="bold">b</text>');
  });
});
