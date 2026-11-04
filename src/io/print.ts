// Stampa diretta: le pagine scelte vengono disegnate in SVG in un documento A3 orizzontale
// (una pagina per foglio) e mandate alla finestra di stampa del sistema.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Part, Project } from '../model/types';
import { PAGE_W, PAGE_H, sheetOf } from '../model/types';
import { PageContent } from '../ui/PageSvg';
import type { PdfOptions } from './pdfOptions';
import { printPlan } from './printPlan';
import { monoSvg } from './mono';

/** Documento HTML con una pagina di schema per foglio */
export function printDocument(project: Project, library: Part[], opts: PdfOptions): { html: string; pages: number } {
  if (opts.lang) project = { ...project, languages: { display: opts.lang, second: opts.second || undefined } };
  const { pages, derived: d } = printPlan(project, library, opts);
  // Formato con il nome (A4, A3) che le stampanti riconoscono; gli altri in mm
  const sh = sheetOf(project.settings);
  const pageSize = sh.size === 'A4' || sh.size === 'A3' ? `${sh.size} ${sh.portrait ? 'portrait' : 'landscape'}` : `${PAGE_W}mm ${PAGE_H}mm`;
  const sheets = pages.map(page => {
    const pd = d.pages.get(page.id)!;
    const derived = opts.mono ? { ...pd, drawWireColors: false, mono: true } : pd;
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${PAGE_W} ${PAGE_H}`, width: `${PAGE_W}mm`, height: `${PAGE_H}mm` },
        createElement('g', { fontFamily: 'Helvetica, Arial, sans-serif' },
          createElement(PageContent, { project, page, pageIndex: project.pages.indexOf(page), derived }))),
    );
    return opts.mono ? monoSvg(svg) : svg;
  });
  const title = (project.info.name || 'OpenWiring').replace(/[<&]/g, '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
@page { size: ${pageSize}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; overflow: hidden; page-break-after: always; break-after: page; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
svg { display: block; color: #000; }
</style></head><body>${sheets.map(s => `<div class="sheet">${s}</div>`).join('')}</body></html>`;
  return { html, pages: pages.length };
}

/** Apre la finestra di stampa del sistema con le pagine scelte */
export async function printProject(project: Project, library: Part[], opts: PdfOptions): Promise<number> {
  const { html, pages } = printDocument(project, library, opts);
  if (!pages) return 0;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    await new Promise(r => setTimeout(r, 300));
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  } finally {
    // La finestra di stampa è modale: alla chiusura il documento non serve più
    setTimeout(() => frame.remove(), 1000);
  }
  return pages;
}
