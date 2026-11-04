// Pacchetto di rilascio di una revisione (fase 19f): cartella «Rilascio_<indice>» con lo schema in
// PDF, distinta, lista fili e lista morsetti (CSV), il rapporto delle differenze dalla revisione
// precedente (PDF), la copia del progetto rilasciato (.ecad), manifest.json e Checksums.sha256.
// Il contenuto viene dalla copia archiviata nella revisione, quindi è sempre quello emesso.
import { jsPDF } from 'jspdf';
import type { Part, Project, Revision } from '../model/types';
import { projectReports, tableToCsv } from '../model/reports';
import { revisionChanges, statusCounts, type PageStatus } from '../model/revisionChanges';
import { unpackProject } from '../model/revisions';
import { parseProject, readDocument, safeName, serializeProject } from './fileio';
import { isPdfDoc, usedDocuments } from '../model/partDocs';
import { exportPdf, DEFAULT_PDF_OPTIONS } from './pdf';

declare const __APP_VERSION__: string | undefined;

export interface PackageFile { name: string; data: Uint8Array }

const LISTS: [string, string][] = [['Distinta materiali', 'distinta'], ['Lista fili (cablaggio)', 'lista_fili'], ['Lista morsetti', 'lista_morsetti']];
const STATUS: Record<PageStatus, string> = { modificata: 'modificata', automatica: 'aggiornata automaticamente', nuova: 'nuova', eliminata: 'eliminata', invariata: 'invariata' };

async function sha256(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Progetto archiviato in una revisione, pronto da usare */
export async function archivedProject(rev: Revision): Promise<Project | undefined> {
  return rev.archive ? parseProject(JSON.stringify(await unpackProject(rev.archive))) : undefined;
}

/** Rapporto delle differenze in PDF (A4 verticale): dati della revisione, pagine, modifiche, avvisi accettati */
export function differenceReport(cur: Project, prev: Project | undefined, rev: Revision, prevRev: Revision | undefined, library: Part[] = []): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = 15, R = 195, BOTTOM = 282;
  let y = 18;
  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage('a4', 'portrait'); y = 18; } };
  const line = (text: string, size = 9, bold = false, indent = 0) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    for (const part of doc.splitTextToSize(text, R - L - indent) as string[]) { need(size * 0.45); doc.text(part, L + indent, y); y += size * 0.45; }
  };
  const gap = (h = 2) => { y += h; };
  const i = cur.info;
  line(`Rapporto delle differenze — revisione ${rev.index}`, 15, true); gap(2);
  line(`Progetto: ${i.name}${i.description ? ` — ${i.description}` : ''}`);
  if (i.drawingNr) line(`Disegno: ${i.drawingNr}`);
  if (i.customer) line(`Cliente: ${i.customer}`);
  line(`Revisione: ${rev.index} del ${rev.date}${rev.author ? `, ${rev.author}` : ''}`);
  line(`Revisione precedente: ${prevRev ? `${prevRev.index} del ${prevRev.date}` : '— (prima emissione)'}`);
  if (rev.description) line(`Descrizione: ${rev.description}`);
  gap(3);
  if (!prev) {
    line('Prima emissione: tutte le pagine sono nuove.', 10, true);
    line(cur.pages.map(p => p.name).join(', '));
  } else {
    const report = revisionChanges(prev, cur, library);
    const c = statusCounts(report);
    line('Pagine', 11, true);
    line(`Modificate ${c.modificata} · aggiornate automaticamente ${c.automatica} · nuove ${c.nuova} · eliminate ${c.eliminata} · invariate ${c.invariata}`);
    gap(2);
    const notes = rev.notes ?? {};
    for (const p of report.filter(r => r.status !== 'invariata')) {
      gap(1);
      line(`Pagina ${p.name} — ${p.title} (${STATUS[p.status]})`, 9.5, true);
      // Nota della pagina scritta a parte solo se non c'è già la riga della modifica della pagina
      const pn = notes[`${p.pageId}:@page`];
      if (pn?.text && !p.changes.some(ch => ch.key === `${p.pageId}:@page`)) line(`Nota: ${pn.text}`, 8.5, false, 4);
      for (const ch of p.changes) {
        const note = notes[ch.key]?.text;
        line(`${ch.kind}: ${ch.what}${ch.detail ? ` — ${ch.detail}` : ''}${note ? `  [nota: ${note}]` : ''}`, 8.5, false, 4);
      }
    }
  }
  if (rev.accepted?.length) {
    gap(4);
    line('Segnalazioni dei controlli accettate al rilascio', 11, true);
    for (const a of rev.accepted) line(`${a.kind}: ${a.msg}${a.loc ? ` (/${a.loc})` : ''}${a.note ? ` — motivo: ${a.note}` : ''}`, 8.5, false, 4);
  }
  const n = doc.getNumberOfPages();
  for (let k = 1; k <= n; k++) {
    doc.setPage(k);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`${i.name} — rev. ${rev.index} — pagina ${k} di ${n}`, L, 290);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * File del pacchetto di rilascio della revisione indicata, dal progetto archiviato (e da quello
 * della revisione precedente per le differenze). undefined se la revisione non ha la copia.
 */
export async function buildReleasePackage(project: Project, revId: string, library: Part[] = []): Promise<{ folder: string; files: PackageFile[] } | undefined> {
  const revs = project.revisions ?? [];
  const k = revs.findIndex(r => r.id === revId);
  const rev = revs[k];
  if (!rev) return undefined;
  const cur = await archivedProject(rev);
  if (!cur) return undefined;
  const prevRev = k > 0 ? revs[k - 1] : undefined;
  const prev = prevRev ? await archivedProject(prevRev) : undefined;
  const base = `${safeName(cur.info.name || 'Progetto')}_${safeName(rev.index)}`;
  const enc = (s: string) => new TextEncoder().encode(s);
  const files: PackageFile[] = [];
  const tables = projectReports(cur, library);
  files.push({ name: `${base}_schemi.pdf`, data: (await exportPdf(cur, tables, library, DEFAULT_PDF_OPTIONS)).data });
  for (const [title, short] of LISTS) {
    const t = tables.find(x => x.title === title);
    if (t) files.push({ name: `${base}_${short}.csv`, data: enc(tableToCsv(t)) });
  }
  files.push({ name: `${base}_differenze.pdf`, data: differenceReport(cur, prev, rev, prevRev, library) });
  files.push({ name: `${base}.ecad`, data: enc(serializeProject(cur)) });
  // Schede tecniche (PDF sul disco) degli articoli usati, come file a parte
  const seen = new Set<string>();
  for (const u of usedDocuments(cur, library)) {
    if (!isPdfDoc(u.doc.path) || seen.has(u.doc.path)) continue;
    seen.add(u.doc.path);
    const data = await readDocument(u.doc.path);
    if (!data) continue;
    let name = `Scheda_${safeName(u.partNr)}_${safeName(u.doc.name)}.pdf`;
    for (let k = 2; files.some(f => f.name === name); k++) name = `Scheda_${safeName(u.partNr)}_${safeName(u.doc.name)}_${k}.pdf`;
    files.push({ name, data });
  }
  const listed = await Promise.all(files.map(async f => ({ nome: f.name, byte: f.data.length, sha256: await sha256(f.data) })));
  const manifest = {
    progetto: cur.info.name, descrizione: cur.info.description || undefined, disegno: cur.info.drawingNr || undefined, cliente: cur.info.customer || undefined,
    revisione: rev.index, precedente: prevRev?.index ?? null, data: rev.date, autore: rev.author || undefined, descrizioneRevisione: rev.description || undefined,
    pagine: cur.pages.length, programma: `OpenWiring ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}`.trim(), file: listed,
  };
  files.push({ name: 'manifest.json', data: enc(JSON.stringify(manifest, null, 2) + '\n') });
  // Formato di sha256sum: «hash  nome» (con due spazi), anche per il manifest
  const sums = [...listed, { nome: 'manifest.json', sha256: await sha256(files[files.length - 1].data) }].map(f => `${f.sha256}  ${f.nome}`).join('\n') + '\n';
  files.push({ name: 'Checksums.sha256', data: enc(sums) });
  return { folder: `Rilascio_${safeName(rev.index)}`, files };
}
