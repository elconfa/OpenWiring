// Export PDF: pagine di schema vettoriali (svg2pdf), liste di progetto, indice e segnalibri.
// I rimandi (/pagina.colonna) e le posizioni nelle liste diventano collegamenti cliccabili.
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Project, Part, Page } from '../model/types';
import { PAGE_W, PAGE_H, FRAME } from '../model/types';
import { PageContent } from '../ui/PageSvg';
import { monoSvg, monoPdf } from './mono';

/** Verso del foglio del progetto per jsPDF */
const sheetOrientation = () => (PAGE_W >= PAGE_H ? 'landscape' : 'portrait');
import { INDEX_TITLE, type Table } from '../model/reports';
import { PDFDocument } from 'pdf-lib';
import { DOCS_TITLE, isPdfDoc, usedDocuments, type UsedDoc } from '../model/partDocs';
import { readDocument } from './fileio';
import { translator, translateTable, translateFixed } from '../model/i18n';

export { DEFAULT_PDF_OPTIONS, selectPages, type PdfOptions } from './pdfOptions';
import { DEFAULT_PDF_OPTIONS, type PdfOptions } from './pdfOptions';
import { printPlan } from './printPlan';

export interface PdfResult {
  data: Uint8Array; pages: number; links: number;
  /** Schede tecniche allegate e quelle che non si sono potute leggere (file spostato o non PDF) */
  attached?: number; missing?: string[];
}

interface Outline { add(parent: unknown, title: string, o: { pageNumber: number }): unknown }

export async function exportPdf(project: Project, tables: Table[], library: Part[] = [], opts: PdfOptions = DEFAULT_PDF_OPTIONS): Promise<PdfResult> {
  // Lingua del PDF scelta nel dialogo: vale solo per questo export
  if (opts.lang) project = { ...project, languages: { display: opts.lang, second: opts.second || undefined } };
  // Pagine scelte; senza alcuni quadri anche le liste hanno solo le righe dei quadri rimasti
  const plan = printPlan(project, library, opts, tables);
  tables = (plan.tables.length ? plan.tables : tables).map(t => translateTable(project, t));
  const { t: tr } = translator(project);
  const compact = opts.compact !== false;
  // Compatto: flussi compressi (Flate) e 3 decimali sui numeri (in punti: un millesimo di pt, invisibile)
  const doc = new jsPDF({ orientation: sheetOrientation(), unit: 'mm', format: [PAGE_W, PAGE_H], ...(compact ? { compress: true, floatPrecision: 3 } : {}) });
  if (opts.mono) monoPdf(doc as unknown as Parameters<typeof monoPdf>[0]);
  const info = project.info;
  doc.setProperties({
    title: info.name, subject: info.description || 'Schema elettrico', author: info.author,
    keywords: [info.drawingNr, info.customer].filter(Boolean).join(', '), creator: 'OpenWiring',
  });
  const pages = plan.pages;
  // L'indice delle pagine del PDF è già la sua pagina iniziale
  const tail = new Set(opts.tailLists ?? []);
  const listTables = tables.filter(t => t.rows.length && t.title !== INDEX_TITLE && tail.has(t.title));
  const offset = opts.index ? 1 : 0;
  // Pagina del PDF per ogni pagina di schema esportata
  const pdfPageOf = new Map(pages.map((p, i) => [p.name, i + 1 + offset]));
  const d = plan.derived;
  let links = 0;

  if (opts.index) drawIndexHeader(doc, project);

  // Contenitore nascosto per disegnare le pagine (solo se ce ne sono: senza pagine il PDF si fa anche fuori dal browser)
  const host = pages.length ? document.createElement('div') : undefined;
  if (host) { host.style.cssText = 'position:fixed;left:-10000px;top:0;width:420px;height:297px;'; document.body.appendChild(host); }
  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (i > 0 || opts.index) doc.addPage([PAGE_W, PAGE_H], sheetOrientation());
      const pageIndex = project.pages.indexOf(page);
      const pd = d.pages.get(page.id)!;
      const derived = opts.mono ? { ...pd, drawWireColors: false, mono: true } : pd;
      const markup = renderToStaticMarkup(
        createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${PAGE_W} ${PAGE_H}`, width: PAGE_W, height: PAGE_H },
          createElement('g', { fontFamily: 'helvetica' },
            createElement(PageContent, { project, page, pageIndex, derived }))),
      );
      host!.innerHTML = opts.mono ? monoSvg(markup) : markup;
      const svg = host!.querySelector('svg')!;
      await doc.svg(svg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      // Rimandi cliccabili: l'area del testo diventa un collegamento alla pagina di destinazione
      for (const el of Array.from(svg.querySelectorAll<SVGTextContentElement>('[data-goto]'))) {
        const target = pdfPageOf.get(el.getAttribute('data-goto') ?? '');
        if (!target) continue;
        const b = textBox(el);
        doc.link(b.x - 0.3, b.y - 0.3, b.width + 0.6, b.height + 0.6, { pageNumber: target });
        links++;
      }
    }
  } finally {
    host?.remove();
  }

  const tableStart: { title: string; page: number }[] = [];
  for (const t of listTables) {
    const r = drawTable(doc, project, t, pdfPageOf);
    tableStart.push({ title: t.title, page: r.first });
    links += r.links;
  }

  if (opts.index) links += drawIndexBody(doc, pages, pdfPageOf, tableStart, project);

  // Schede tecniche: si leggono prima, per scrivere nell'elenco la pagina dove comincia ognuna
  const docs: { u: UsedDoc; bytes: Uint8Array; pages: number }[] = [];
  const missing: string[] = [];
  if (opts.attachDocs) {
    const seen = new Set<string>();
    for (const u of usedDocuments(project, library)) {
      if (!isPdfDoc(u.doc.path) || seen.has(u.doc.path)) continue;
      seen.add(u.doc.path);
      const bytes = await readDocument(u.doc.path);
      const n = bytes ? await PDFDocument.load(bytes, { ignoreEncryption: true }).then(d => d.getPageCount(), () => 0) : 0;
      if (bytes && n) docs.push({ u, bytes, pages: n }); else missing.push(u.doc.path);
    }
    if (docs.length) drawDocsList(doc, project, docs.map(d => ({ ...d.u, pages: d.pages })));
  }

  // Segnalibri: indice, pagine di schema e liste
  const outline = (doc as unknown as { outline: Outline }).outline;
  if (opts.index) outline.add(null, translateFixed(project, 'Indice'), { pageNumber: 1 });
  if (pages.length) {
    const root = outline.add(null, translateFixed(project, 'Schemi'), { pageNumber: 1 + offset });
    for (const p of pages) outline.add(root, `${p.name}  ${tr(p.title)}`, { pageNumber: pdfPageOf.get(p.name)! });
  }
  if (tableStart.length) {
    const root = outline.add(null, translateFixed(project, 'Liste'), { pageNumber: tableStart[0].page });
    for (const t of tableStart) outline.add(root, t.title, { pageNumber: t.page });
  }

  const base = new Uint8Array(doc.output('arraybuffer'));
  if (!docs.length && compact) {
    // Le migliaia di collegamenti dei rimandi sono oggetti a sé: pdf-lib li raccoglie in flussi compressi
    const small = await PDFDocument.load(base).then(m => m.save({ useObjectStreams: true }), () => base);
    return { data: small.length < base.length ? small : base, pages: doc.getNumberOfPages(), links, ...(missing.length ? { attached: 0, missing } : {}) };
  }
  if (!docs.length) return { data: base, pages: doc.getNumberOfPages(), links, ...(missing.length ? { attached: 0, missing } : {}) };
  // Le pagine delle schede in coda, così come sono
  const merged = await PDFDocument.load(base);
  for (const d of docs) {
    const src = await PDFDocument.load(d.bytes, { ignoreEncryption: true });
    for (const pg of await merged.copyPages(src, src.getPageIndices())) merged.addPage(pg);
  }
  return { data: await merged.save({ useObjectStreams: compact }), pages: merged.getPageCount(), links, attached: docs.length, missing };
}

/** Pagina «Documenti allegati»: per ogni scheda l'articolo, il documento e la pagina del PDF dove comincia */
function drawDocsList(doc: jsPDF, project: Project, list: (UsedDoc & { pages: number })[]) {
  doc.addPage([PAGE_W, PAGE_H], sheetOrientation());
  frame(doc, translateFixed(project, DOCS_TITLE), project.info.name);
  let page = doc.getNumberOfPages() + 1, y = FRAME.top + 16;
  const cols = [FRAME.left, FRAME.left + 50, FRAME.left + 170, FRAME.left + 280, FRAME.right - 30];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  ['Articolo', 'Descrizione', 'Documento', 'Sigle', 'Pagina'].forEach((h, i) => doc.text(translateFixed(project, h), cols[i] + 1.5, y + 4.2));
  doc.setFont('helvetica', 'normal');
  for (const d of list) {
    y += 6;
    if (y > FRAME.bottom - 8) break;
    const cell = (s: string, i: number) => doc.text((doc.splitTextToSize(s, (cols[i + 1] ?? FRAME.right) - cols[i] - 3)[0] as string) ?? '', cols[i] + 1.5, y + 4.2);
    cell(d.partNr, 0); cell(d.descr, 1); cell(d.doc.name, 2); cell(d.tags, 3);
    doc.text(String(page), cols[4] + 1.5, y + 4.2);
    doc.setLineWidth(0.1); doc.line(FRAME.left, y + 6, FRAME.right, y + 6);
    page += d.pages;
  }
}

/** Area di un testo: dal browser se disponibile, altrimenti stimata da dimensione e lunghezza */
export function textBox(el: SVGTextContentElement): { x: number; y: number; width: number; height: number } {
  try {
    const b = el.getBBox();
    if (b.width > 0) {
      // Il riquadro è nelle coordinate del testo: rotazioni (rimandi verticali) e spostamenti dei testi
      // trascinati vanno riportati sulla pagina, prendendo il riquadro che contiene i quattro angoli
      const svg = el.ownerSVGElement;
      const m = svg && el.getScreenCTM() && svg.getScreenCTM() ? svg.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!) : el.getCTM();
      if (!m) return b;
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
  } catch { /* elemento non misurabile */ }
  const size = parseFloat(el.getAttribute('font-size') ?? '2');
  const x = parseFloat(el.getAttribute('x') ?? '0'), y = parseFloat(el.getAttribute('y') ?? '0');
  return { x, y: y - size, width: (el.textContent ?? '').length * size * 0.56, height: size * 1.2 };
}

function frame(doc: jsPDF, title: string, sub: string) {
  doc.setDrawColor(27, 31, 36);
  doc.setLineWidth(0.5);
  doc.rect(FRAME.left, FRAME.top, FRAME.right - FRAME.left, PAGE_H - 15);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(27, 31, 36);
  doc.text(title, FRAME.left + 4, FRAME.top + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(sub, FRAME.right - 4, FRAME.top + 9, { align: 'right' });
}

function drawIndexHeader(doc: jsPDF, project: Project) {
  const i = project.info;
  frame(doc, translator(project).t(i.name), [i.company, i.customer, i.drawingNr && `${translateFixed(project, 'Dis.')} ${i.drawingNr}`, i.revision && `Rev. ${i.revision}`, i.date].filter(Boolean).join('  ·  '));
}

/** Indice (prima pagina): elenco cliccabile di pagine di schema e liste */
function drawIndexBody(doc: jsPDF, pages: Page[], pdfPageOf: Map<string, number>, tables: { title: string; page: number }[], project: Project): number {
  doc.setPage(1);
  let y = FRAME.top + 22;
  let links = 0;
  const x0 = FRAME.left + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  const F = (s: string) => translateFixed(project, s);
  const { t: tr } = translator(project);
  doc.text(F('Indice'), x0, y); y += 8;
  const row = (left: string, title: string, target: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(11, 92, 173);
    doc.text(left, x0, y);
    doc.setTextColor(27, 31, 36);
    doc.text(title, x0 + 22, y);
    doc.setTextColor(105, 114, 125);
    doc.text(`${F('pag. PDF')} ${target}`, FRAME.right - 8, y, { align: 'right' });
    doc.link(x0 - 1, y - 4, FRAME.right - FRAME.left - 10, 5.5, { pageNumber: target });
    links++;
    y += 6;
  };
  for (const p of pages) {
    if (y > PAGE_H - 20) break;
    row(p.name, tr(p.title), pdfPageOf.get(p.name)!);
  }
  if (tables.length) {
    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(27, 31, 36);
    doc.text(F('Liste'), x0, y); y += 8;
    for (const t of tables) { if (y > PAGE_H - 20) break; row('—', t.title, t.page); }
  }
  // Tabella delle revisioni a destra
  const revs = project.revisions ?? [];
  if (revs.length) {
    const xr = FRAME.left + 230;
    let yr = FRAME.top + 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(27, 31, 36);
    doc.text(F('Revisioni'), xr, yr); yr += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const r of revs.slice(-14)) {
      doc.text(`${r.index}`, xr, yr);
      doc.text(r.date, xr + 10, yr);
      doc.text(doc.splitTextToSize(`${r.description || '—'}${r.pages.length ? ` (pag. ${r.pages.slice(0, 8).join(', ')}${r.pages.length > 8 ? '…' : ''})` : ''}`, 120)[0] ?? '', xr + 34, yr);
      yr += 5.5;
    }
  }
  doc.setTextColor(27, 31, 36);
  return links;
}

function drawTable(doc: jsPDF, project: Project, t: Table, pdfPageOf: Map<string, number>): { first: number; links: number } {
  const x0 = FRAME.left, x1 = FRAME.right;
  const rowH = 6;
  const avail = x1 - x0;
  // Larghezza colonne proporzionale al contenuto più lungo (con limiti)
  const lens = t.columns.map((c, i) => Math.min(60, Math.max(c.length, ...t.rows.map(r => (r[i] ?? '').length), 4)));
  const sum = lens.reduce((a, b) => a + b, 0);
  const widths = lens.map(l => (l / sum) * avail);
  const perPage = Math.floor((FRAME.bottom - FRAME.top - 20) / rowH);
  const pages = Math.max(1, Math.ceil(t.rows.length / perPage));
  let first = 0, links = 0;
  for (let pg = 0; pg < pages; pg++) {
    doc.addPage([PAGE_W, PAGE_H], sheetOrientation());
    if (!first) first = doc.getNumberOfPages();
    frame(doc, t.title, `${project.info.name}  ·  ${pg + 1}/${pages}`);
    let y = FRAME.top + 16;
    doc.setFillColor(234, 238, 242);
    doc.rect(x0, y, avail, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    let x = x0;
    t.columns.forEach((c, i) => { doc.text(c, x + 1.5, y + 4.2); x += widths[i]; });
    doc.setFont('helvetica', 'normal');
    doc.setLineWidth(0.1);
    const start = pg * perPage;
    t.rows.slice(start, start + perPage).forEach((r, k) => {
      y += rowH;
      x = x0;
      const goto = t.goto?.[start + k];
      r.forEach((c, i) => {
        const fit = doc.splitTextToSize(c ?? '', widths[i] - 2)[0] ?? '';
        const target = goto?.[i] ? pdfPageOf.get(goto[i]!) : undefined;
        if (target && fit) {
          doc.setTextColor(11, 92, 173);
          doc.text(fit, x + 1.5, y + 4.2);
          doc.setTextColor(27, 31, 36);
          doc.link(x, y, widths[i], rowH, { pageNumber: target });
          links++;
        } else doc.text(fit, x + 1.5, y + 4.2);
        x += widths[i];
      });
      doc.line(x0, y + rowH, x1, y + rowH);
    });
  }
  return { first, links };
}
