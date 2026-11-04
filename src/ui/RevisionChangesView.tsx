// Tutte le modifiche della revisione aperta rispetto all'ultima emissione: pagine con il loro stato
// (modificata, aggiornata automaticamente, nuova, eliminata, invariata), le modifiche fatte a mano e
// quelle automatiche con la causa, e la nota di ogni modifica (scritta accanto alla nuvoletta, o
// nascosta). Clic su una riga per andare alla pagina e all'elemento.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { lastRevision, nextRevisionIndex, unpackProject } from '../model/revisions';
import { revisionChanges, statusCounts, type PageStatus } from '../model/revisionChanges';
import { parseProject } from '../io/fileio';
import type { Project } from '../model/types';
import { tn, tx } from '../i18n/ui';

const STATUS: Record<PageStatus, string> = {
  modificata: tn('modificata'), automatica: tn('aggiornata automaticamente'), nuova: tn('nuova'), eliminata: tn('eliminata'), invariata: tn('invariata'),
};
const KIND: Record<string, string> = { aggiunto: tn('aggiunto'), modificato: tn('modificato'), tolto: tn('tolto'), pagina: tn('pagina'), automatico: tn('automatico') };

/** Nota di una modifica, con «nascosta» (resta nell'elenco ma non sulla pagina) */
export function NoteField({ k }: { k: string }) {
  const note = useStore(s => s.project.revisionNotes?.[k]);
  const [v, setV] = useState(note?.text ?? '');
  useEffect(() => setV(note?.text ?? ''), [note?.text]);
  const st = useStore.getState;
  return (
    <span className="nowrap" onClick={e => e.stopPropagation()}>
      <input value={v} placeholder={tx('nota')} onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== (note?.text ?? '')) st().setRevisionNote(k, { text: v, hidden: note?.hidden }); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <label className="small" title={tx('La nota resta nell\'elenco ma non viene scritta accanto alla nuvoletta')}>
        <input type="checkbox" checked={!!note?.hidden} disabled={!note?.text} onChange={e => st().setRevisionNote(k, { text: note?.text ?? '', hidden: e.target.checked || undefined })} /> {tx('nascosta')}
      </label>
    </span>
  );
}

export function RevisionChangesView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const last = lastRevision(project);
  const [base, setBase] = useState<Project | null>(null);
  const [filter, setFilter] = useState<PageStatus | ''>('');
  const [showSame, setShowSame] = useState(false);
  useEffect(() => {
    setBase(null);
    if (last?.archive) void unpackProject(last.archive).then(p => setBase(parseProject(JSON.stringify(p))));
  }, [last?.id, last?.archive]);
  const report = useMemo(() => (base ? revisionChanges(base, project, library) : []), [base, project, library]);
  if (!last) return <p className="muted pad">{tx('Nessuna revisione rilasciata: le modifiche si contano dal primo rilascio.')}</p>;
  if (!last.archive) return <p className="muted pad">{tx('La revisione {0} non ha la copia archiviata (rilasciata con una versione precedente del programma): l\'elenco delle modifiche parte dal prossimo rilascio.', last.index)}</p>;
  if (!base) return <p className="muted pad">{tx('Lettura della revisione {0}…', last.index)}</p>;
  const counts = statusCounts(report);
  const go = (pageId: string, id?: string) => {
    if (!project.pages.some(p => p.id === pageId)) return;
    st().setPage(pageId);
    if (id && project.pages.find(p => p.id === pageId)?.elements.some(e => e.id === id)) st().setSelection([id]);
  };
  const shown = report.filter(r => (filter ? r.status === filter : showSame || r.status !== 'invariata'));
  const open = project.revisionState !== 'released';
  return (
    <>
      <div className="checks-bar">
        <span>{open ? tx('Revisione {0} rispetto alla {1} del {2}', nextRevisionIndex(project), last.index, last.date) : tx('Progetto rilasciato: nessuna modifica dopo la {0}', last.index)}</span>
        <select value={filter} onChange={e => setFilter(e.target.value as PageStatus | '')}>
          <option value="">{tx('pagine cambiate')} ({report.length - counts.invariata})</option>
          {(Object.keys(STATUS) as PageStatus[]).map(k => <option key={k} value={k}>{tx(STATUS[k])} ({counts[k]})</option>)}
        </select>
        {!filter && <label className="small"><input type="checkbox" checked={showSame} onChange={e => setShowSame(e.target.checked)} /> {tx('anche le invariate')}</label>}
        <span className="muted small">{tx('Clic su una riga per andare all\'elemento. La nota viene scritta accanto alla nuvoletta.')}</span>
      </div>
      <table className="grid revision-changes">
        <thead><tr><th>{tx('Pagina')}</th><th>{tx('Stato / modifica')}</th><th>{tx('Elemento')}</th><th>{tx('Dettaglio')}</th><th>{tx('Nota')}</th></tr></thead>
        <tbody>
          {shown.map(r => [
            <tr key={r.pageId} className={`clickable rev-page rev-${r.status}`} onClick={() => go(r.pageId)}>
              <td><b>{r.name}</b></td><td><b>{tx(STATUS[r.status])}</b></td><td colSpan={2}>{r.title}</td>
              <td>{r.status !== 'invariata' && r.status !== 'eliminata' && open && <NoteField k={`${r.pageId}:@page`} />}</td>
            </tr>,
            ...r.changes.map((c, i) => (
              <tr key={`${r.pageId}-${i}`} className={`clickable rev-${c.kind}`} onClick={() => go(c.pageId, c.elementId)}>
                <td />
                <td>{tx(KIND[c.kind])}</td>
                <td>{c.what}</td>
                <td>{c.detail}</td>
                <td>{open && c.kind !== 'automatico' && <NoteField k={c.key} />}</td>
              </tr>
            )),
          ])}
          {!shown.length && <tr><td colSpan={5} className="muted pad">{tx('Nessuna modifica dopo la {0}.', last.index)}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
