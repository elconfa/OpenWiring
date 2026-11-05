// Opzioni dell'export PDF e della stampa, con il riepilogo dei controlli del progetto e l'anteprima delle
// pagine scelte.
import { useEffect, useMemo, useRef, useState } from 'react';
import { derive } from '../model/derive';
import { releaseCheck } from '../model/checks';
import { PageContent } from './PageSvg';
import { openReport } from './actions';
import { PAGE_W, PAGE_H, sheetOf } from '../model/types';
import { useStore } from '../model/store';
import { runPdfExport, runPrint } from './actions';
import { COVER_GROUP, DEFAULT_PDF_OPTIONS, pagesFor, pagePanel, printGroup, type PdfOptions } from '../io/pdfOptions';
import { pageGroup, SCHEMA_GROUP } from '../model/pageOrder';
import { listEntries, outdated, type ListEntry } from '../model/lists';
import { projectReports } from '../model/reports';
import { reportStyleOf, sheetRanges } from '../model/reportStyle';
import { panelLabel } from '../model/network';
import { devicesPerLocation, scopeLocations } from '../model/panelScope';
import { LANGS } from '../model/i18n';
import type { Lang } from '../model/types';
import { tx } from '../i18n/ui';

const KEY = 'elettrocad.pdf';

function loadOpts(): PdfOptions {
  // «lists» (tutte le liste in coda) delle versioni precedenti non vale più: le liste in coda si scelgono una per una
  try { const { lists: _old, ...o } = JSON.parse(localStorage.getItem(KEY) ?? '{}') as PdfOptions & { lists?: boolean }; return { ...DEFAULT_PDF_OPTIONS, ...o }; } catch { return DEFAULT_PDF_OPTIONS; }
}

/** Miniatura della pagina: si disegna solo quando entra nell'area visibile dell'anteprima (anche con centinaia di pagine) */
function LazyThumb({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <figure ref={ref} className="pdf-thumb" title={title}>
      <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>{seen ? children : null}</svg>
      <figcaption className="small">{caption}</figcaption>
    </figure>
  );
}

export function PdfDialog() {
  const dialog = useStore(s => s.dialog);
  const open = dialog === 'pdf' || dialog === 'print';
  const print = dialog === 'print';
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const st = useStore.getState;
  const [o, setO] = useState<PdfOptions>(loadOpts);
  const [mode, setMode] = useState<'all' | 'current' | 'one' | 'range'>(() => (o.pages === 'all' || o.pages === 'current' ? o.pages : 'range'));
  const [range, setRange] = useState(o.pages !== 'all' && o.pages !== 'current' ? o.pages : '');
  const [one, setOne] = useState('');
  const library = useStore(s => s.library);
  const spec = mode === 'range' ? range : mode === 'one' ? 'current' : mode;
  const onePage = mode === 'one' ? (project.pages.find(p => p.id === one) ?? project.pages.find(p => p.id === pageId))?.id : undefined;
  const filter = { skipPanels: o.skipPanels, skipGroups: o.skipGroups };
  const chosen = open ? pagesFor(project, { pages: spec, currentPageId: onePage ?? pageId, ...filter }) : [];
  // Luoghi presenti (anche quelli scritti solo sui dispositivi, es. +BM), con quante pagine e quanti dispositivi
  const devs = useMemo(() => (open ? devicesPerLocation(project) : new Map<string, number>()), [open, project]);
  const panelsIn = open ? [
    ...scopeLocations(project).map(x => ({ id: x.id, label: panelLabel(x, project.panels), n: project.pages.filter(pg => pagePanel(project, pg) === x.id).length, d: devs.get(x.id) ?? 0, undef: !project.panels?.some(q => q.id === x.id) })),
    { id: '', label: tx('Pagine senza quadro'), n: project.pages.filter(pg => !pagePanel(project, pg) && !pageGroup(pg)).length, d: 0, undef: false },
  ].filter(x => x.n || x.d) : [];
  // Liste con le pagine da aggiornare (strisce, cavi o righe nuove dall'ultima volta)
  const entries = useMemo(() => (open ? listEntries(project, library) : []), [open, project, library]);
  const stale = entries.filter(outdated);
  const update = o.updateLists !== false;
  const flipIn = (k: 'skipPanels' | 'skipGroups', v: string, on: boolean) => {
    const cur = new Set(o[k] ?? []);
    if (on) cur.delete(v); else cur.add(v);
    setO({ ...o, [k]: cur.size ? [...cur] : undefined });
  };
  // Elenco di cosa entra: copertina, pagine di schema e le liste con gli stessi nomi del Modello ▸ Liste
  const all = mode === 'all';
  const nOf = (g: string) => project.pages.filter(pg => printGroup(pg) === g).length;
  const tables = useMemo(() => (open ? projectReports(project, library) : []), [open, project, library]);
  const tailSet = new Set(o.tailLists ?? []);
  const tailSheets = print ? 0 : tables.filter(t => tailSet.has(t.title) && t.rows.length).reduce((n, t) => n + sheetRanges(t, reportStyleOf(project, t.title)).length, 0);
  const flipTail = (title: string, on: boolean) => {
    const cur = new Set(o.tailLists ?? []);
    if (on) cur.add(title); else cur.delete(title);
    setO({ ...o, tailLists: cur.size ? [...cur] : undefined });
  };
  const setGroups = (skip: string[]) => setO({ ...o, skipGroups: skip.length ? skip : undefined });
  const count = chosen.length;
  const total = count + tailSheets + (!print && o.index ? 1 : 0);
  // Controlli del progetto (gli avvisi verificati non contano)
  const check = useMemo(() => (open ? releaseCheck(project, library) : undefined), [open, project, library]);
  // Anteprima: le pagine come verranno, nella lingua scelta
  const shown = useMemo(() => (o.lang ? { ...project, languages: { display: o.lang, second: o.second || undefined } } : project), [project, o.lang, o.second]);
  const derived = useMemo(() => (open ? derive(shown, library) : undefined), [open, shown, library]);
  if (!open) return null;
  // Riga di una lista: le sue pagine (se ci sono), la lista in coda (PDF) o il comando per crearla
  const listRow = (e: ListEntry) => {
    const n = e.pages.length, report = e.style === 'report';
    return (
      <tr key={e.key} className={n ? '' : 'muted'}>
        <td>{n ? <input type="checkbox" disabled={!all} checked={!o.skipGroups?.includes(e.key)} onChange={ev => flipIn('skipGroups', e.key, ev.target.checked)} /> : null}</td>
        <td>{tx(e.title)}</td>
        <td className="nowrap">{n
          ? <>{n}{outdated(e) ? <span className="pdf-stale" title={tx('Servono {0} pagine: si aggiornano prima di stampare se la casella sotto è spuntata', e.need)}> → {e.need}</span> : null}</>
          : e.need
            ? <button className="mini" onClick={() => st().updateList(e.key)} title={tx('Crea le pagine della lista nel progetto ({0})', e.need)}>{tx('Crea ({0})', e.need)}</button>
            : <span className="small">{tx('vuota')}</span>}</td>
        {!print && <td>{report && e.need > 0 && e.key !== 'index' && (!n || tailSet.has(e.title)) ? <input type="checkbox" checked={tailSet.has(e.title)} onChange={ev => flipTail(e.title, ev.target.checked)} title={n ? tx('Attenzione: la lista ha già pagine nel progetto, in coda verrebbe ripetuta') : undefined} /> : null}</td>}
      </tr>
    );
  };
  const sheet = sheetOf(project.settings);
  const close = () => st().setDialog(null);
  const go = () => {
    const opts = { ...o, pages: spec, ...(onePage ? { currentPageId: onePage } : {}) };
    try { localStorage.setItem(KEY, JSON.stringify({ ...opts, currentPageId: undefined, pages: mode === 'one' ? 'current' : spec })); } catch { /* preferenze non salvabili */ }
    close();
    if (update && stale.length) st().updateAllLists();
    if (print) void runPrint(opts); else void runPdfExport(opts);
  };
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal wide pdf-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={print ? tx('Stampa') : tx('Esporta PDF')}>
        <h3>{print ? tx('Stampa') : tx('Esporta PDF')}</h3>
        <div className="pdf-layout">
        <div className="pdf-options">
        {check && (check.errors.length || check.warnings.length ? (
          <div className="pdf-check warn">
            <b>{tx('Controlli: {0} errori, {1} avvisi da verificare', check.errors.length, check.warnings.length)}</b>
            <span className="small">{tx('Si può {0} lo stesso; meglio controllare prima.', print ? tx('stampare') : tx('esportare'))}</span>
            <button onClick={() => { close(); openReport('checks'); }}>{tx('Vedi i controlli')}</button>
          </div>
        ) : <div className="pdf-check ok small">{tx('Controlli: nessun errore e nessun avviso da verificare')}</div>)}
        <fieldset>
          <legend>{tx('Quali pagine')}</legend>
          <label><input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> {tx('Quelle spuntate nell\'elenco qui sotto')}</label>
          <label><input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} /> {tx('Solo la pagina corrente')}</label>
          <label className="row">
            <input type="radio" checked={mode === 'one'} onChange={() => setMode('one')} /> {tx('Una pagina:')}
            <select value={onePage ?? pageId} onFocus={() => setMode('one')} onChange={e => { setOne(e.target.value); setMode('one'); }}>
              {project.pages.map(p => <option key={p.id} value={p.id}>{p.name} · {p.title}</option>)}
            </select>
          </label>
          <label className="row">
            <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> {tx('Pagine:')}
            <input type="text" value={range} placeholder={tx('es. 1-3, 5  oppure  MOR.1-MOR.4')} onFocus={() => setMode('range')} onChange={e => setRange(e.target.value)} />
          </label>
          {!all && <p className="muted small">{tx('Una pagina o un intervallo scelti si stampano sempre, anche se la loro lista è tolta dall\'elenco.')}</p>}
        </fieldset>
        <fieldset className={all ? '' : 'muted'}>
          <legend>{tx('Cosa entra')}</legend>
          <div className="row-buttons">
            <button className="mini" disabled={!all} onClick={() => setGroups([])}>{tx('Tutto')}</button>
            <button className="mini" disabled={!all} onClick={() => setGroups(entries.map(e => e.key))} title={tx('Copertina e pagine di schema, senza le liste')}>{tx('Solo lo schema')}</button>
            <button className="mini" disabled={print} onClick={() => setO({ ...o, tailLists: undefined })}>{tx('Nessuna lista in coda')}</button>
          </div>
          <table className="grid pdf-what">
            <thead><tr><th /><th>{tx('Pagine e liste')}</th><th>{tx('Pagine')}</th>{!print && <th title={tx('Lista aggiunta in fondo al PDF come tabella, senza farne pagine del progetto')}>{tx('In coda')}</th>}</tr></thead>
            <tbody>
              {[COVER_GROUP, SCHEMA_GROUP].filter(g => nOf(g)).map(g => (
                <tr key={g}>
                  <td><input type="checkbox" disabled={!all} checked={!o.skipGroups?.includes(g)} onChange={e => flipIn('skipGroups', g, e.target.checked)} /></td>
                  <td><b>{g === COVER_GROUP ? tx('Copertina') : tx('Pagine di schema')}</b></td><td>{nOf(g)}</td>{!print && <td />}
                </tr>
              ))}
              {entries.map(listRow)}
            </tbody>
          </table>
          <label className={stale.length ? 'pdf-stale' : ''} title={stale.length ? stale.map(e => `${tx(e.title)}: ${e.pages.length} → ${e.need}`).join('\n') : undefined}>
            <input type="checkbox" checked={update} onChange={e => setO({ ...o, updateLists: e.target.checked })} />
            {' '}{tx('Aggiorna le liste che hanno già pagine prima di {0}', print ? tx('stampare') : tx('esportare'))}
            {' '}<span className="muted">{stale.length ? tx('({0} da aggiornare)', stale.length) : tx('(già aggiornate)')}</span>
          </label>
        </fieldset>
        {panelsIn.length > 1 && (
          <fieldset className={all ? '' : 'muted'}>
            <legend>{tx('Quadri e luoghi')}</legend>
            {panelsIn.map(x => (
              <label key={x.id || '-'}><input type="checkbox" disabled={!all} checked={!o.skipPanels?.includes(x.id)} onChange={e => flipIn('skipPanels', x.id, e.target.checked)} /> {x.label} <span className="muted" title={x.undef ? tx('Luogo scritto sui dispositivi ma non definito tra i luoghi del progetto') : undefined}>({x.d ? tx('pagine: {0}, dispositivi: {1}', x.n, x.d) : x.n}{x.undef ? ' · ' + tx('non definito') : ''})</span></label>
            ))}
            {all && !!o.skipPanels?.length && <p className="muted small">{tx('Anche le liste (morsetti, dispositivi, distinta, acquisti, I/O PLC, connessioni, cavi…) hanno solo le righe dei quadri scelti; i loro fogli si impaginano di nuovo.')}</p>}
          </fieldset>
        )}
        <fieldset>
          <legend>{tx('Contenuto')}</legend>
          {!print && <>
          <label><input type="checkbox" checked={o.index} onChange={e => setO({ ...o, index: e.target.checked })} /> {tx('Pagina indice iniziale (cliccabile)')}</label>
          <label title={tx('I file PDF collegati agli articoli usati (Articoli ▸ Schede tecniche e documenti), con una pagina di elenco; solo nell\'app desktop')}><input type="checkbox" checked={!!o.attachDocs} onChange={e => setO({ ...o, attachDocs: e.target.checked })} /> {tx('Schede tecniche degli articoli allegate in fondo')}</label>
          </>}
          <label><input type="checkbox" checked={o.mono} onChange={e => setO({ ...o, mono: e.target.checked })} /> {tx('Bianco e nero')}{print ? '' : tx(' per la stampa')}</label>
          {!print && <label title={tx('Comprime il contenuto delle pagine e arrotonda le coordinate: il file è molto più piccolo, il disegno è lo stesso e rimandi, indice e segnalibri restano cliccabili')}><input type="checkbox" checked={o.compact !== false} onChange={e => setO({ ...o, compact: e.target.checked })} /> {tx('File compatto (più piccolo)')}</label>}
        </fieldset>
        <fieldset>
          <legend>{tx('Lingua')}</legend>
          <label className="row">{tx('Lingua del PDF:')}
            <select value={o.lang ?? ''} onChange={e => setO({ ...o, lang: (e.target.value || undefined) as Lang | undefined })}>
              <option value="">{tx('come il progetto (')}{LANGS.find(l => l.id === (project.languages?.display ?? 'it'))?.name})</option>
              {LANGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {o.lang && (
            <label className="row">{tx('Seconda lingua:')}
              <select value={o.second ?? ''} onChange={e => setO({ ...o, second: e.target.value as Lang | '' })}>
                <option value="">{tx('nessuna')}</option>
                {LANGS.filter(l => l.id !== o.lang).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
        </fieldset>
        {print
          ? <p className="muted small">{tx('Formato {0} {1}, una pagina per foglio. Le liste non ancora generate si creano nel Modello ▸ Liste (tasto destro ▸ Crea la lista).', sheet.size, sheet.portrait ? tx('verticale') : tx('orizzontale'))}</p>
          : <p className="muted small">{tx('I rimandi (/pagina.colonna), l\'indice e le posizioni nelle liste sono collegamenti cliccabili; il PDF ha i segnalibri di pagine e liste.')}</p>}
        </div>
        <div className="pdf-preview" aria-label={tx('Anteprima')}>
          <div className="small muted">{tx('Anteprima')} · {tx('{0} pagine', count)}{tailSheets ? ` + ${tx('{0} in coda', tailSheets)}` : ''}</div>
          <div className="pdf-thumbs">
            {derived && chosen.map((pg, i) => {
              const pd = derived.pages.get(pg.id);
              if (!pd) return null;
              const d = o.mono ? { ...pd, drawWireColors: false, mono: true } : pd;
              return (
                <LazyThumb key={pg.id} title={`${i + 1}/${count} · ${pg.name} · ${pg.title}`} caption={`${pg.name} · ${pg.title}`}>
                  <PageContent project={shown} page={pg} pageIndex={project.pages.indexOf(pg)} derived={d} />
                </LazyThumb>
              );
            })}
          </div>
        </div>
        </div>
        <div className="modal-actions">
          <button onClick={close}>{tx('Annulla')}</button>
          <span className="muted small">{tx('Totale: {0} pagine', total)}{tailSheets ? ` (${tx('{0} in coda', tailSheets)})` : ''}</span>
          <span className="tb-spacer" />
          <button className="primary" disabled={!count && !tailSheets} onClick={go}>{print ? tx('Stampa…') : tx('Esporta')}</button>
        </div>
      </div>
    </div>
  );
}
