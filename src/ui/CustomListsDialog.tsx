// Liste ▸ Liste personalizzate: editor dei modelli delle liste. Una lista nuova parte da una lista del
// progetto; si scelgono colonne (ordine e nome), filtri, ordinamento e raggruppamento con la quantità.
// Le modifiche si vedono subito nell'anteprima e si salvano nel progetto con «Salva».
import { DialogShell, useDialogOpen } from './DialogShell';
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { projectReports } from '../model/reports';
import { customListTable, FILTER_OPS } from '../model/customLists';
import { settingsOf } from '../model/numbering';
import type { CustomList, CustomListFilter } from '../model/types';
import { askChoice } from './Ask';
import { tx } from '../i18n/ui';

const uid = () => `cl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function CustomListsDialog() {
  const open = useDialogOpen('customLists');
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const saved = settingsOf(project).customLists ?? [];
  const [draft, setDraft] = useState<CustomList[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const lists = draft ?? saved;
  // Liste del progetto senza quelle personalizzate (le sorgenti), più quelle personalizzate prima di ognuna
  const base = useMemo(() => (open ? projectReports({ ...project, settings: { ...project.settings, customLists: [] } }, library) : []), [open, project, library]);
  if (!open) return null;
  const sel = lists.find(l => l.id === selId) ?? lists[0];
  const sources = (l: CustomList) => [...base.map(t => t.title), ...lists.slice(0, lists.indexOf(l)).map(x => x.title)];
  const tableOf = (title: string): { columns: string[] } | undefined => {
    const b = base.find(t => t.title === title);
    if (b) return b;
    const before = lists.find(x => x.title === title);
    return before ? { columns: before.columns.map(c => c.label || c.field).concat(before.groupCount ? [before.countLabel || 'Quantità'] : []) } : undefined;
  };
  const edit = (patch: Partial<CustomList>) => setDraft(lists.map(l => (l.id === sel.id ? { ...l, ...patch } : l)));
  const add = () => {
    const src = base.find(t => t.title === 'Lista dispositivi') ?? base[0];
    let title = tx('Lista personalizzata');
    for (let k = 2; [...base.map(t => t.title), ...lists.map(l => l.title)].includes(title); k++) title = `${tx('Lista personalizzata')} ${k}`;
    const l: CustomList = { id: uid(), title, source: src.title, columns: src.columns.map(c => ({ field: c })) };
    setDraft([...lists, l]);
    setSelId(l.id);
  };
  const close = async () => {
    if (draft && await askChoice(tx('Liste personalizzate'), tx('Salvare le modifiche alle liste?'), [tx('Salva'), tx('Non salvare')]) === 0) save();
    setDraft(null);
    st().setDialog(null);
  };
  const save = () => { if (draft) st().updateSettings({ customLists: draft.length ? draft : undefined }); setDraft(null); };
  const dupTitle = sel && (base.some(t => t.title === sel.title) || lists.some(l => l !== sel && l.title === sel.title));

  // Anteprima con le liste personalizzate che precedono quella scelta
  const preview = (() => {
    if (!sel) return undefined;
    const tables = [...base];
    for (const l of lists) {
      const t = customListTable(tables, l);
      if (l === sel) return t;
      if (t) tables.push(t);
    }
    return undefined;
  })();
  const srcCols = sel ? tableOf(sel.source)?.columns ?? [] : [];
  const used = new Set(sel?.columns.map(c => c.field));
  const move = (i: number, d: number) => {
    const cols = [...sel.columns];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    edit({ columns: cols });
  };
  const setFilter = (i: number, patch: Partial<CustomListFilter>) => edit({ filters: (sel.filters ?? []).map((f, k) => (k === i ? { ...f, ...patch } : f)) });

  return (
    <DialogShell className="wide custom-lists" label={tx('Liste personalizzate')} onClose={() => void close()}>
        <h3>{tx('Liste personalizzate')}</h3>
        <div className="custom-lists-layout">
          <nav className="custom-lists-nav">
            {lists.map(l => <button key={l.id} type="button" className={l === sel ? 'active' : ''} onClick={() => setSelId(l.id)}>{l.title}</button>)}
            <button type="button" className="primary" onClick={add}>{tx('+ Nuova lista')}</button>
            <p className="small muted">{tx('Una lista personalizzata parte da una lista del progetto: scegli le colonne, i filtri e l\'ordine. Diventa una lista come le altre (Vista report, pagine di lista, PDF, Excel).')}</p>
          </nav>
          {sel ? (
            <div className="custom-lists-edit">
              <div className="custom-row">
                <label>{tx('Titolo')} <input value={sel.title} onChange={e => edit({ title: e.target.value })} /></label>
                <label>{tx('Dalla lista')} <select value={sel.source} onChange={e => { const cols = tableOf(e.target.value)?.columns ?? []; edit({ source: e.target.value, columns: cols.map(c => ({ field: c })), filters: [], sort: undefined }); }}>
                  {sources(sel).map(t => <option key={t} value={t}>{tx(t)}</option>)}
                </select></label>
                <button className="danger" onClick={() => { setDraft(lists.filter(l => l !== sel)); setSelId(null); }}>{tx('Elimina la lista')}</button>
              </div>
              {dupTitle && <p className="small warn-text">{tx('C\'è già una lista con questo titolo: cambialo.')}</p>}
              <h4>{tx('Colonne')}</h4>
              <table className="grid custom-cols">
                <tbody>
                  {sel.columns.map((c, i) => (
                    <tr key={c.field}>
                      <td className="nowrap">
                        <button className="mini" disabled={!i} onClick={() => move(i, -1)} title={tx('Sposta su')}>↑</button>
                        <button className="mini" disabled={i === sel.columns.length - 1} onClick={() => move(i, 1)} title={tx('Sposta giù')}>↓</button>
                      </td>
                      <td>{tx(c.field)}</td>
                      <td><input value={c.label ?? ''} placeholder={tx('nome nella lista (come la colonna)')} onChange={e => edit({ columns: sel.columns.map((x, k) => (k === i ? { ...x, label: e.target.value || undefined } : x)) })} /></td>
                      <td><button className="mini" title={tx('Togli la colonna')} onClick={() => edit({ columns: sel.columns.filter((_, k) => k !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {srcCols.some(c => !used.has(c)) && (
                <select value="" onChange={e => { if (e.target.value) edit({ columns: [...sel.columns, { field: e.target.value }] }); }}>
                  <option value="">{tx('+ Aggiungi colonna')}</option>
                  {srcCols.filter(c => !used.has(c)).map(c => <option key={c} value={c}>{tx(c)}</option>)}
                </select>
              )}
              <h4>{tx('Filtri')}</h4>
              {(sel.filters ?? []).map((f, i) => (
                <div key={i} className="custom-row">
                  <select value={f.field} onChange={e => setFilter(i, { field: e.target.value })}>{srcCols.map(c => <option key={c} value={c}>{tx(c)}</option>)}</select>
                  <select value={f.op} onChange={e => setFilter(i, { op: e.target.value as CustomListFilter['op'] })}>{FILTER_OPS.map(([v, n]) => <option key={v} value={v}>{tx(n)}</option>)}</select>
                  {f.op !== 'empty' && f.op !== 'notEmpty' && <input value={f.value ?? ''} onChange={e => setFilter(i, { value: e.target.value })} />}
                  <button className="mini" onClick={() => edit({ filters: (sel.filters ?? []).filter((_, k) => k !== i) })}>✕</button>
                </div>
              ))}
              <button className="mini" disabled={!srcCols.length} onClick={() => edit({ filters: [...(sel.filters ?? []), { field: srcCols[0], op: 'contains', value: '' }] })}>{tx('+ Filtro')}</button>
              <h4>{tx('Ordine e raggruppamento')}</h4>
              <div className="custom-row">
                <label>{tx('Ordina per')} <select value={sel.sort?.field ?? ''} onChange={e => edit({ sort: e.target.value ? { field: e.target.value, desc: sel.sort?.desc } : undefined })}>
                  <option value="">{tx('come la lista di partenza')}</option>
                  {srcCols.map(c => <option key={c} value={c}>{tx(c)}</option>)}
                </select></label>
                {sel.sort && <label className="inline"><input type="checkbox" checked={!!sel.sort.desc} onChange={e => edit({ sort: { ...sel.sort!, desc: e.target.checked || undefined } })} />{tx('decrescente')}</label>}
                <label className="inline" title={tx('Le righe con gli stessi valori nelle colonne scelte diventano una sola, con la quantità')}>
                  <input type="checkbox" checked={!!sel.groupCount} onChange={e => edit({ groupCount: e.target.checked || undefined })} />{tx('Raggruppa le righe uguali e conta')}</label>
                {sel.groupCount && <input value={sel.countLabel ?? ''} placeholder={tx('Quantità')} onChange={e => edit({ countLabel: e.target.value || undefined })} />}
              </div>
              <h4>{tx('Anteprima')} <span className="small muted">{preview ? tx('{0} righe', preview.rows.length) : tx('lista di partenza non presente')}</span></h4>
              {preview && (
                <div className="custom-preview">
                  <table className="grid">
                    <thead><tr>{preview.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                    <tbody>{preview.rows.slice(0, 15).map((r, i) => <tr key={i}>{r.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          ) : <p className="small muted">{tx('Nessuna lista personalizzata: crea la prima con «+ Nuova lista».')}</p>}
        </div>
        <div className="modal-actions">
          {draft && <span className="small muted">{tx('Modifiche non salvate')}</span>}
          <button className="dlg-close" onClick={() => void close()}>{tx('Chiudi')}</button>
          <button className="primary" disabled={!draft || !!dupTitle} onClick={save}>{tx('Salva')}</button>
        </div>
    </DialogShell>
  );
}
