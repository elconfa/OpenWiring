// Stampa e PDF in bianco e nero: righe e scritte nere, niente grigi
import { describe, it, expect } from 'vitest';
import { monoSvg } from '../src/io/mono';
import { printDocument } from '../src/io/print';
import { exampleProject } from '../src/model/example';

describe('bianco e nero', () => {
  it('tratti e scritte grigi diventano neri, riempimenti chiari bianchi, trasparenze tolte', () => {
    const out = monoSvg('<svg><line stroke="#d0d5dc" stroke-opacity="0.5"/><text fill="#8c959f">A</text><rect fill="#f6f8fa" stroke="none"/><path fill="#5b636d"/><rect fill="#fff"/><g style="fill:#b8bfc8;stroke:rgb(140,149,159);opacity:0.4"><text>B</text></g><image href="x.png" fill="#888"/></svg>');
    expect(out).toBe('<svg><line stroke="#000"/><text fill="#000">A</text><rect fill="#fff" stroke="none"/><path fill="#000"/><rect fill="#fff"/><g style="fill:#000;stroke:#000;"><text>B</text></g><image href="x.png" fill="#888"/></svg>');
  });

  it('la stampa in bianco e nero non ha più colori grigi', () => {
    const p = exampleProject();
    const { html } = printDocument(p, [], { pages: 'all', index: false, mono: true });
    const colors = new Set([...html.matchAll(/(?:fill|stroke|color)[=:]"?([^";\s>]+)/g)].map(m => m[1].toLowerCase()));
    for (const c of colors) expect(['#000', '#fff', 'none', 'transparent', 'currentcolor'].includes(c) || c.startsWith('url(')).toBe(true);
    expect(html).not.toMatch(/opacity/);
  });
});
