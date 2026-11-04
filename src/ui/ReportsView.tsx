// Liste di progetto generate automaticamente dallo schema, e controlli di progetto.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { tableToCsv, tableToTxt, type Table } from '../model/reports';
import { scopeLocations, scopeTables, scopedLists } from '../model/panelScope';
import { panelLabel } from '../model/network';
import { writeXlsx } from '../io/xlsx';
import { useGrid, Th, gridProps } from './grid';
import { checkProject, acceptedOf, issueKey } from '../model/checks';
import { ask } from './Ask';
import { saveFile, safeName } from '../io/fileio';
import { allReports, exportPdfAction } from './actions';
import { TranslationsView } from './TranslationsView';
import { RevisionChangesView } from './RevisionChangesView';
import { askChoice } from './Ask';
import { tx } from '../i18n/ui';
import { editWireOrder } from './wireOrderDialog';
import { computeNetlist } from '../model/netlist';
import { REPORTS_VIEW_SIZE, PANEL_NONE, setReportsView, setReportsViewColumn, useReportsView } from './reportsViewPrefs';

export function ReportsView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const tab = useStore(s => s.reportTab);
  const comparison = useStore(s => s.comparison);
  const st = useStore.getState;
  // Quadro scelto: le liste hanno solo le sue righe (anche nelle esportazioni)
  const view = useReportsView();
  const panels = useMemo(() => scopeLocations(project), [project]);
  const panelSel = view.panel === PANEL_NONE || panels.some(p => p.id === view.panel) ? view.panel : undefined;
  const tables = useMemo(() => {
    const all = allReports();
    return panelSel ? scopeTables(project, library, all, new Set([panelSel === PANEL_NONE ? '' : panelSel])) : all;
  }, [project, library, panelSel]);
  const panelCode = panelSel === PANEL_NONE ? tx('senza quadro') : panels.find(p => p.id === panelSel)?.code;
  /** Salva la lista (con il quadro scelto) in CSV, Excel o testo */
  const exportTable = async (tb: Table, kind: 'csv' | 'xlsx' | 'txt') => {
    const name = `${safeName(project.info.name)}_${safeName(tb.title)}${panelCode ? `_${safeName(panelCode)}` : ''}.${kind}`;
    const title = panelSel ? { ...tb, title: `${tb.title} – ${panelSel === PANEL_NONE ? panelCode : `+${panelCode}`}` } : tb;
    if (kind === 'csv') await saveFile(name, tableToCsv(tb), [{ name: 'CSV', extensions: ['csv'] }]);
    else if (kind === 'txt') await saveFile(name, tableToTxt(title), [{ name: tx('Testo'), extensions: ['txt'] }]);
    else await saveFile(name, writeXlsx([{ name: tb.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), rows: [tb.columns, ...tb.rows], widths: tb.columns.map((c, j) => Math.min(50, Math.max(c.length, ...tb.rows.map(r => (r[j] ?? '').length)) + 2)) }]), [{ name: 'Excel', extensions: ['xlsx'] }]);
  };
  const allIssues = useMemo(() => checkProject(project, library), [project, library]);
  // Segnalazioni verificate e accettate: fuori dai conteggi, si vedono a richiesta
  const [showAccepted, setShowAccepted] = useState(false);
  const accepted = allIssues.filter(i => acceptedOf(project, i));
  const issues = allIssues.filter(i => !acceptedOf(project, i));
  const t = tables.find(x => x.title === tab) ?? (tab === 'checks' || tab === 'compare' || tab === 'translations' || tab === 'revision' ? undefined : tables[0]);
  const g = useGrid<string[]>(`report:${t?.title ?? ''}`, t?.rows ?? [], Object.fromEntries((t?.columns ?? []).map((_, j) => [String(j), (r: string[]) => {
    // Numeri come numeri (quantità, sezioni), il resto come testo
    const v = r[j] ?? '';
    return /^-?\d+([.,]\d+)?$/.test(v.trim()) ? parseFloat(v.replace(',', '.')) : v;
  }])));
  // Colonne nascoste (per lista) e dimensione del testo delle tabelle: restano in questo computer
  const hiddenCols = new Set(t ? view.hidden?.[t.title] ?? [] : []);
  const flipCol = (c: string, on: boolean) => { if (t) setReportsViewColumn(t.title, c, on); };
  const fontSize = view.size ?? REPORTS_VIEW_SIZE.def;
  // Tasto destro su una riga con un filo: ordine dei collegamenti del suo conduttore
  const [menu, setMenu] = useState<{ x: number; y: number; wireId?: string; label?: string } | null>(null);
  const rowIndex = useMemo(() => new Map((t?.rows ?? []).map((r, i) => [r, i])), [t]);
  const onTableMenu = (e: React.MouseEvent) => {
    if (!t) return;
    e.preventDefault();
    const tr = (e.target as HTMLElement).closest('tbody tr');
    const k = tr ? [...tr.parentElement!.children].indexOf(tr) : -1;
    const i = k >= 0 && g.rows[k] ? rowIndex.get(g.rows[k]) : undefined;
    const wireId = i !== undefined ? t.wires?.[i] : undefined;
    const net = wireId ? computeNetlist(project).wireNet.get(wireId) : undefined;
    if (!wireId || !net || net.named || net.pins.length < 3) { st().openReportStyle(t.title); return; }
    setMenu({ x: e.clientX, y: e.clientY, wireId, label: net.wireNo || net.name });
  };
  const go = (pageId?: string, id?: string) => {
    if (!pageId) return;
    st().setPage(pageId);
    if (id) st().setSelection([id]);
  };
  const errors = issues.filter(i => i.level === 'error').length;
  const warns = issues.filter(i => i.level === 'warn').length;
  const [kind, setKind] = useState('');
  const [hideInfo, setHideInfo] = useState(false);
  const kinds = [...new Set(issues.map(i => i.kind))].sort();
  const shown = (showAccepted ? allIssues : issues).filter(i => (!kind || i.kind === kind) && (!hideInfo || i.level !== 'info'));
  /** Segna come verificate le segnalazioni indicate, chiedendo il motivo (facoltativo) */
  const accept = async (list: typeof issues) => {
    const r = await ask(list.length > 1 ? tx('Verificate {0} segnalazioni', list.length) : tx('Segnalazione verificata'), [
      { label: tx('Motivo (facoltativo): perché non è un errore'), placeholder: tx('es. conduttore che prosegue in campo, voluto così') },
    ]);
    if (r) st().acceptIssues(list.map(issueKey), r[0].trim() || undefined, true);
  };
  const tabs = (
    <>
      <button className={!t && tab !== 'compare' && tab !== 'translations' && tab !== 'revision' ? 'tab active' : 'tab'} onClick={() => st().setReportTab('checks')}>
        {tx('Controlli (')}{errors ? tx('{0} errori, ', errors) : ''}{warns} {tx('avvisi)')}
      </button>
      {!!project.revisions?.length && <button className={tab === 'revision' ? 'tab active' : 'tab'} onClick={() => st().setReportTab('revision')}>{tx('Modifiche della revisione')}</button>}
      {comparison && <button className={tab === 'compare' ? 'tab active' : 'tab'} onClick={() => st().setReportTab('compare')}>{tx('Confronto (')}{comparison.rows.length})</button>}
      <button className={tab === 'translations' ? 'tab active' : 'tab'} onClick={() => st().setReportTab('translations')}>{tx('Traduzioni')}</button>
      {tables.map(x => (
        <button key={x.title} className={x === t ? 'tab active' : 'tab'} onClick={() => st().setReportTab(x.title)}>{tx(x.title)} ({x.rows.length})</button>
      ))}
    </>
  );
  if (tab === 'translations') {
    return (
      <div className="reports">
        <div className="parts-toolbar">{tabs}</div>
        <TranslationsView />
      </div>
    );
  }
  return (
    <div className="reports">
      <div className="parts-toolbar">
        {tabs}
        <div className="tb-spacer" />
        {t && (
          <details className="col-picker">
            <summary title={tx('Colonne da mostrare in questa lista')}>{tx('Colonne')}{hiddenCols.size ? ` (${t.columns.length - hiddenCols.size}/${t.columns.length})` : ''}</summary>
            <div className="col-picker-list">
              {t.columns.map(c => <label key={c}><input type="checkbox" checked={!hiddenCols.has(c)} onChange={e => flipCol(c, e.target.checked)} /> {tx(c)}</label>)}
            </div>
          </details>
        )}
        <span className="nowrap" title={tx('Dimensione del testo delle tabelle')}>
          <button className="mini" onClick={() => setReportsView({ ...view, size: Math.max(REPORTS_VIEW_SIZE.min, fontSize - 1) })}>A−</button>
          <button className="mini" onClick={() => setReportsView({ ...view, size: Math.min(REPORTS_VIEW_SIZE.max, fontSize + 1) })}>A+</button>
        </span>
        {t && <button onClick={() => st().openReportStyle(t.title)} title={tx('Tutte le modifiche di questa lista in una finestra (anche con il tasto destro sulla tabella o sulla pagina)')}>{tx('Personalizza la lista…')}</button>}
        {panels.length > 0 && (
          <label className="nowrap" title={tx('Liste di un solo quadro: righe dei suoi dispositivi, morsetti, cavi e collegamenti (un collegamento tra due quadri è in tutti e due). Vale anche per le esportazioni')}>
            {tx('Quadro')}{' '}
            <select value={panelSel ?? ''} onChange={e => setReportsView({ ...view, panel: e.target.value || undefined })}>
              <option value="">{tx('tutto il progetto')}</option>
              {panels.map(p => <option key={p.id} value={p.id}>{panelLabel(p, project.panels)}</option>)}
              <option value={PANEL_NONE}>{tx('senza quadro')}</option>
            </select>
          </label>
        )}
        {t && panelSel && !scopedLists().includes(t.title) && <span className="muted small" title={tx('Questa lista non si divide per quadro')}>{tx('(tutto il progetto)')}</span>}
        {t && (
          <details className="col-picker">
            <summary title={tx('Salva la lista come si vede (con il quadro scelto) in un file')}>{tx('Esporta')}</summary>
            <div className="col-picker-list">
              <button onClick={() => void exportTable(t, 'csv')}>{tx('CSV (Excel, separato da ;)')}</button>
              <button onClick={() => void exportTable(t, 'xlsx')}>{tx('Excel (.xlsx)')}</button>
              <button onClick={() => void exportTable(t, 'txt')}>{tx('Testo (.txt, colonne allineate)')}</button>
            </div>
          </details>
        )}
        <button onClick={() => st().setDialog('reportPages')} title={tx('Sceglie quali liste diventano pagine del progetto (con cartiglio) e se si aggiornano da sole')}>{tx('Pagine di lista…')}</button>
        <button onClick={exportPdfAction}>{tx('PDF completo')}</button>
      </div>
      {menu && t && (
        <div className="ctx-back" onMouseDown={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }}>
          <div className="ctx-menu" style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 90) }} onMouseDown={e => e.stopPropagation()}>
            <button onClick={() => { setMenu(null); void editWireOrder(menu.wireId!); }}><span>{tx('Ordine dei collegamenti di {0}…', menu.label ?? '')}</span></button>
            <hr />
            <button onClick={() => { setMenu(null); st().openReportStyle(t.title); }}><span>{tx('Personalizza la lista…')}</span></button>
          </div>
        </div>
      )}
      <div className="table-wrap" style={{ fontSize }} onContextMenu={t ? onTableMenu : undefined}
        title={t ? (t.wires ? tx('Tasto destro su una riga: ordine dei collegamenti del conduttore; altrove: personalizza la lista') : tx('Tasto destro: personalizza la lista')) : undefined}>
        {t ? (
          <table {...gridProps(g)}>
            <thead><tr>{t.columns.map((c, j) => (hiddenCols.has(c) ? null : <Th key={c} g={g} k={String(j)}>{tx(c)}</Th>))}</tr></thead>
            <tbody>
              {g.rows.map((r, k) => <tr key={k}>{r.map((c, j) => (hiddenCols.has(t.columns[j]) ? null : <td key={j}>{c}</td>))}</tr>)}
              {!t.rows.length && <tr><td colSpan={t.columns.length} className="muted pad">{tx('Lista vuota.')}</td></tr>}
            </tbody>
          </table>
        ) : tab === 'revision' ? (
          <RevisionChangesView />
        ) : tab === 'compare' && comparison ? (
          <table className="grid">
            <thead><tr><th>{tx('Tipo')}</th><th>{tx('Elemento')}</th><th>{tx('Prima (')}{comparison.file})</th><th>{tx('Adesso')}</th></tr></thead>
            <tbody>
              {comparison.rows.map((r, k) => <tr key={k}><td>{r.kind}</td><td>{r.what}</td><td>{r.before}</td><td>{r.after}</td></tr>)}
              {!comparison.rows.length && <tr><td colSpan={4} className="muted pad">{tx('Nessuna differenza.')}</td></tr>}
            </tbody>
          </table>
        ) : (
          <>
            <div className="checks-bar">
              <span><b className="issue-error">● {errors}</b> {tx('errori ·')} <b className="issue-warn">▲ {warns}</b> {tx('avvisi ·')} <span className="issue-info">○ {issues.length - errors - warns}</span> {tx('dati inutilizzati')}</span>
              <select value={kind} onChange={e => setKind(e.target.value)}>
                <option value="">{tx('tutte le categorie')}</option>
                {kinds.map(k => <option key={k} value={k}>{k} ({issues.filter(i => i.kind === k).length})</option>)}
              </select>
              <label className="small"><input type="checkbox" checked={hideInfo} onChange={e => setHideInfo(e.target.checked)} /> {tx('nascondi i dati inutilizzati')}</label>
              {accepted.length > 0 && <label className="small"><input type="checkbox" checked={showAccepted} onChange={e => setShowAccepted(e.target.checked)} /> {tx('mostra i verificati ({0})', accepted.length)}</label>}
              {shown.some(i => !acceptedOf(project, i)) && <button className="mini" onClick={() => void accept(shown.filter(i => !acceptedOf(project, i)))}
                title={tx('Segna come verificate tutte le segnalazioni elencate (con il filtro attuale), con un unico motivo')}>{tx('Verifica tutte le elencate')}</button>}
              {shown.some(i => i.fix && !acceptedOf(project, i)) && <button className="mini" onClick={async () => {
                const fixes = shown.filter(i => i.fix && !acceptedOf(project, i)).map(i => i.fix!);
                if (await askChoice(tx('Correggi'), tx('Applicare le {0} correzioni proposte per le segnalazioni elencate? Si annullano tutte insieme con Annulla.', fixes.length), [tx('Correggi'), tx('Annulla')]) === 0) st().applyFixes(fixes);
              }} title={tx('Applica in un passo tutte le correzioni proposte (🔧) delle segnalazioni elencate')}>🔧 {tx('Correggi le elencate ({0})', shown.filter(i => i.fix && !acceptedOf(project, i)).length)}</button>}
              <span className="muted small">{tx('Clic su una riga per andare all\'elemento; 🔧 applica la correzione proposta; «Verificato» toglie dai conteggi una segnalazione controllata')}</span>
            </div>
            <table className="grid">
              <thead><tr><th></th><th>{tx('Tipo')}</th><th>{tx('Problema')}</th><th>{tx('Posizione')}</th><th>{tx('Azioni')}</th></tr></thead>
              <tbody>
                {shown.map((i, k) => {
                  const ok = acceptedOf(project, i);
                  return (
                    <tr key={k} className={`${i.pageId ? 'clickable' : ''}${ok ? ' muted' : ''}`} onClick={() => go(i.pageId, i.elementId)}>
                      <td className={ok ? 'issue-ok' : `issue-${i.level}`}>{ok ? '✓' : i.level === 'error' ? '●' : i.level === 'warn' ? '▲' : '○'}</td>
                      <td>{i.kind}</td><td>{i.msg}{ok?.note ? <span className="small"> — {ok.note}</span> : null}</td><td className="nowrap">{i.loc ? `/${i.loc}` : ''}</td>
                      <td className="nowrap" onClick={e => e.stopPropagation()}>
                        {!ok && i.fix && <button className="mini fix" title={tx('Correzione proposta: {0} (si annulla con Annulla)', i.fix.label)} onClick={() => st().applyFixes([i.fix!])}>🔧 {i.fix.label}</button>}{' '}
                        {ok
                          ? <button className="mini" title={tx('Verificato il {0}{1}: clic per riattivare la segnalazione', ok.date, ok.author ? ` (${ok.author})` : '')} onClick={() => st().acceptIssues([issueKey(i)], undefined, false)}>{tx('Riattiva')}</button>
                          : i.level !== 'info' && <button className="mini" title={tx('Controllata: non è un errore. Esce dai conteggi, con il motivo')} onClick={() => void accept([i])}>✓ {tx('Verificato')}</button>}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={5} className="muted pad">{issues.length ? tx('Nessun problema con questo filtro.') : tx('Nessun problema trovato: lo schema è a posto.')}</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
