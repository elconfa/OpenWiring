// Cerca e sostituisci (⌘F / Ctrl+F).
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { search, FIELD_LABELS, type SearchOpts, type SearchField } from '../model/search';
import { askConfirm } from './Ask';
import { tx } from '../i18n/ui';

export function SearchDialog() {
  const open = useStore(s => s.dialog === 'search');
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [o, setO] = useState<SearchOpts>({ matchCase: false, wholeWord: false });
  const [field, setField] = useState<SearchField | ''>('');
  const opts = useMemo(() => ({ ...o, fields: field ? [field] : undefined }), [o, field]);
  const hits = useMemo(() => (open ? search(project, q, opts) : []), [open, project, q, opts]);
  if (!open) return null;
  const close = () => st().setDialog(null);
  const go = (pageId: string, id: string) => { st().setView('schema'); st().setPage(pageId); st().setSelection([id]); };
  const replaceable = hits.filter(h => h.replaceable);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal search-modal" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
        <h3>{tx('Cerca e sostituisci')}</h3>
        <label>{tx('Cerca')} <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tx('es. 2K1, 200.01, Pompa')} /></label>
        <label>{tx('Sostituisci con')} <input type="text" value={rep} onChange={e => setRep(e.target.value)} /></label>
        <div className="search-opts">
          <label><input type="checkbox" checked={o.matchCase} onChange={e => setO({ ...o, matchCase: e.target.checked })} /> {tx('Maiuscole/minuscole')}</label>
          <label><input type="checkbox" checked={o.wholeWord} onChange={e => setO({ ...o, wholeWord: e.target.checked })} /> {tx('Parola intera')}</label>
          <select value={field} onChange={e => setField(e.target.value as SearchField | '')}>
            <option value="">{tx('Tutti i campi')}</option>
            {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}
          </select>
        </div>
        <div className="search-results">
          <table className="grid">
            <tbody>
              {hits.slice(0, 500).map((h, i) => (
                <tr key={i} onClick={() => go(h.pageId, h.elementId)}>
                  <td className="nowrap">/{h.loc}</td><td className="muted">{tx(FIELD_LABELS[h.field])}</td><td>{h.value}</td>
                </tr>
              ))}
              {q && !hits.length && <tr><td className="muted pad">{tx('Nessun risultato.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <span className="muted small" style={{ marginRight: 'auto' }}>{q ? tx('{0} risultati', hits.length) : tx('Clic su un risultato per andare all\'elemento')}</span>
          <button disabled={!replaceable.length} onClick={async () => {
            if (await askConfirm(tx('Conferma'), tx('Sostituire "{0}" con "{1}" in {2} valori?', q, rep, replaceable.length), tx('Sostituisci'))) st().replaceInProject(replaceable, q, rep, opts);
          }}>{tx('Sostituisci tutto')}</button>
          <button onClick={close}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}
