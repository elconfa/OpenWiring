// Pagine automatiche: quali liste diventano pagine del progetto (con cartiglio, nel PDF e in
// stampa) e se si aggiornano da sole quando cambia lo schema.
import { DialogShell, useDialogOpen, Embedded } from './DialogShell';
import { useContext, useMemo } from 'react';
import { useStore } from '../model/store';
import { projectReports } from '../model/reports';
import { REPORT_ROWS } from '../model/templates';
import { reportStyleOf, sheetRanges } from '../model/reportStyle';
import { groupOrder, groupName, groupPrefix, moveGroup, pageGroup, SCHEMA_GROUP } from '../model/pageOrder';
import { reportBlocks, scopeLocations, scopedLists } from '../model/panelScope';
import { Field } from './PropertyPanel';
import { tx } from '../i18n/ui';

export function ReportPagesDialog() {
  const open = useDialogOpen('reportPages');
  const embedded = useContext(Embedded);
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const tables = useMemo(() => (open ? projectReports(project, library) : []), [open, project, library]);
  // Fogli per lista, sommando i blocchi delle liste divise per quadro
  const sheets = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of reportBlocks(project, library, tables)) if (b.table.rows.length) m.set(b.title, (m.get(b.title) ?? 0) + sheetRanges(b.table, reportStyleOf(project, b.title)).length);
    return m;
  }, [project, library, tables]);
  const places = useMemo(() => (open ? scopeLocations(project).length : 0), [open, project]);
  if (!open) return null;
  const chosen = project.settings.reportPages;
  const on = (t: string) => !chosen || chosen.includes(t);
  const toggle = (t: string) => {
    const cur = chosen ?? tables.map(x => x.title);
    st().updateSettings({ reportPages: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] });
  };
  const blocks = project.settings.reportBlocks ?? [];
  const splittable = new Set(scopedLists());
  const toggleBlocks = (t: string) => st().updateSettings({ reportBlocks: blocks.includes(t) ? blocks.filter(x => x !== t) : [...blocks, t] });
  const arr = project.settings.pageArrangement ?? {};
  const order = groupOrder(project);
  const pages = (title: string) => project.pages.filter(p => p.type === 'report' && p.report === title).length;
  const close = () => st().setDialog(null);
  return (
    <DialogShell className="" label={tx('Pagine automatiche')} onClose={close}>
        <h3>{tx('Pagine automatiche (liste)')}</h3>
        <p className="muted small">
          {tx('Le liste scelte diventano pagine del progetto con cartiglio, in PDF e in stampa. Il contenuto si aggiorna sempre con lo schema; ogni foglio contiene')} {REPORT_ROWS} {tx('righe.')}
        </p>
        <table className="grid">
          <thead><tr><th /><th>{tx('Lista')}</th><th>{tx('Righe')}</th><th title={tx('Un blocco di pagine per ogni quadro o luogo, con le sole righe di quel luogo')}>{tx('Per quadro')}</th><th>{tx('Fogli')}</th><th>{tx('Pagine ora')}</th><th /></tr></thead>
          <tbody>
            {tables.map(t => (
              <tr key={t.title} className={t.rows.length ? '' : 'free'}>
                <td><input type="checkbox" checked={on(t.title)} onChange={() => toggle(t.title)} /></td>
                <td>{tx(t.title)}</td>
                <td>{t.rows.length || 'vuota'}</td>
                <td>{splittable.has(t.title) && <input type="checkbox" disabled={!places} checked={blocks.includes(t.title)} onChange={() => toggleBlocks(t.title)} />}</td>
                <td>{sheets.get(t.title) ?? 0}</td>
                <td>{pages(t.title) || ''}</td>
                <td><button className="mini" onClick={() => st().openReportStyle(t.title)} title={tx('Testi, colonne, righe, pagine, colori e vista a schermo di questa lista')}>{tx('Personalizza…')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="row"><input type="checkbox" checked={!!project.settings.autoReportPages}
          onChange={e => st().updateSettings({ autoReportPages: e.target.checked })} /> {tx('Crea e togli le pagine da sole quando cambia lo schema')}</label>
        <p className="muted small">{tx('Le liste vuote non creano pagine.')}</p>
        {places > 0 && (
          <label className="row" title={tx('Le pagine dei luoghi senza pagine di progetto (es. +BM scritto solo sui dispositivi) restano nel gruppo della lista')}>
            {tx('Liste per quadro:')}
            <select value={project.settings.reportBlocksAt ?? ''} onChange={e => st().updateSettings({ reportBlocksAt: e.target.value === 'panel' ? 'panel' : undefined })}>
              <option value="">{tx('nel gruppo della lista, un quadro dopo l\'altro')}</option>
              <option value="panel">{tx('subito dopo le pagine del loro quadro')}</option>
            </select>
          </label>
        )}
        <h4>{tx('Ordine e numerazione')}</h4>
        <p className="muted small">{tx('Le pagine generate hanno una numerazione propria, con il prefisso del gruppo (es. IND.1, MOR.3), che non tocca i numeri delle pagine di progetto. Le frecce spostano i gruppi prima o dopo il progetto; la copertina resta in testa. Gruppi con lo stesso prefisso continuano la stessa numerazione.')}</p>
        <table className="grid">
          <thead><tr><th>{tx('Gruppo')}</th><th>{tx('Prefisso')}</th><th>{tx('Pagine')}</th><th /></tr></thead>
          <tbody>
            {order.map((g, i) => (
              <tr key={g} className={g === SCHEMA_GROUP ? 'sel' : ''}>
                <td>{tx(groupName(g))}</td>
                <td>{g === SCHEMA_GROUP ? <span className="muted">1, 2, 3…</span> : <Field value={arr.prefixes?.[g] ?? ''} placeholder={groupPrefix(project, g)} onCommit={v => st().updateSettings({ pageArrangement: { ...arr, prefixes: { ...arr.prefixes, [g]: v.trim() } } })} />}</td>
                <td>{g === SCHEMA_GROUP ? project.pages.filter(x => x.type !== 'cover' && !pageGroup(x)).length : project.pages.filter(x => pageGroup(x) === g).length}</td>
                <td className="nowrap">
                  <button className="mini" disabled={i === 0} title={tx('Prima')} onClick={() => st().updateSettings({ pageArrangement: { ...arr, order: moveGroup(project, g, -1) } })}>↑</button>
                  <button className="mini" disabled={i === order.length - 1} title={tx('Dopo')} onClick={() => st().updateSettings({ pageArrangement: { ...arr, order: moveGroup(project, g, 1) } })}>↓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-buttons">
          <button disabled={!arr.order && !arr.prefixes} onClick={() => st().updateSettings({ pageArrangement: undefined })} title={tx('Indice e legenda prima del progetto, le altre pagine dopo; prefissi di serie')}>{tx('Ordine e prefissi di serie')}</button>
        </div>
        <div className="modal-actions">
          <button onClick={() => { st().updateSettings({ reportPages: [] }); st().syncReportPages(); }}>{tx('Togli tutte le pagine')}</button>
          <span className="tb-spacer" />
          <button className="dlg-close" onClick={close}>{tx('Chiudi')}</button>
          <button className="primary" onClick={() => { st().syncReportPages(); if (!embedded) close(); }}>{tx('Crea / aggiorna le pagine')}</button>
        </div>
    </DialogShell>
  );
}
