// Revisioni del progetto: stato (in lavorazione, rilasciato in sola lettura, in revisione), rilascio
// con l'archivio della copia completa, revisione nuova, annullamento, e le revisioni rilasciate da
// aprire in sola lettura, stampare o salvare come file a parte.
import { useStore } from '../model/store';
import { archiveKb, lastRevision } from '../model/revisions';
import type { Project } from '../model/types';
import { releaseRevision, cancelRevision, releasePackage } from './actions';
import { tx } from '../i18n/ui';

/** Stato del progetto in parole */
export function revisionStateText(p: Project): string {
  const last = lastRevision(p);
  if (p.revisionState === 'released') return tx('Rilasciato, revisione {0}: sola lettura', last?.index ?? '');
  if (p.revisionState === 'review') return tx('In revisione dopo la {0}', last?.index ?? '');
  return last ? tx('In lavorazione (ultima revisione {0})', last.index) : tx('In lavorazione, mai rilasciato');
}

export function RevisionsDialog() {
  const open = useStore(s => s.dialog === 'revisions');
  const viewing = useStore(s => s.viewing);
  const current = useStore(s => s.project);
  const st = useStore.getState;
  if (!open) return null;
  // Guardando una revisione archiviata, l'elenco e i comandi sono quelli del progetto vero
  const project = viewing?.back.project ?? current;
  const revs = project.revisions ?? [];
  const close = () => st().setDialog(null);
  const released = project.revisionState === 'released';
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal revisions-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Revisioni')}>
        <h3>{tx('Revisioni')}</h3>
        <p><b>{revisionStateText(project)}</b></p>
        <p className="muted small">{tx('«Rilascia» archivia nel file una copia completa del progetto e lo mette in sola lettura. Per modificarlo si apre una revisione nuova: le modifiche sono segnate con le nuvolette e «Annulla revisione» torna esattamente all\'ultima rilasciata. Le revisioni rilasciate si aprono in sola lettura per guardarle, stamparle o salvarle come file a parte.')}</p>
        <table className="grid">
          <thead><tr><th>{tx('Rev.')}</th><th>{tx('Data')}</th><th>{tx('Autore')}</th><th>{tx('Descrizione')}</th><th>{tx('Pagine')}</th><th>{tx('Copia')}</th><th /></tr></thead>
          <tbody>
            {revs.map(r => (
              <tr key={r.id} className={viewing && viewing.index === r.index ? 'sel' : ''}>
                <td><b>{r.index}</b></td><td className="nowrap">{r.date}</td><td>{r.author}</td><td>{r.description}</td>
                <td title={r.pages.join(', ')}>{r.pages.length}</td>
                <td className="nowrap muted">{r.archive ? `${archiveKb(r)} kB` : '—'}</td>
                <td className="nowrap">{r.archive && <>
                  <button className="mini" onClick={() => { void st().viewRevision(r.id); close(); }} title={tx('Apre la revisione com\'era al rilascio, in sola lettura')}>{tx('Apri')}</button>
                  <button className="mini" onClick={() => void releasePackage(r.id)} title={tx('Cartella Rilascio_{0}: schemi PDF, distinta, lista fili, lista morsetti, rapporto delle differenze, progetto, manifest e checksum', r.index)}>{tx('Pacchetto…')}</button>
                </>}</td>
              </tr>
            ))}
            {!revs.length && <tr><td colSpan={7} className="muted pad">{tx('Nessuna revisione. Il primo rilascio segna tutte le pagine come nuove, senza nuvolette.')}</td></tr>}
          </tbody>
        </table>
        <div className="modal-actions">
          {viewing && <button onClick={() => { st().closeRevisionView(); close(); }}>{tx('Torna al progetto')}</button>}
          <span className="tb-spacer" />
          <button onClick={close}>{tx('Chiudi')}</button>
          {!viewing && !!revs.length && <button onClick={() => { st().setView('reports'); st().setReportTab('revision'); close(); }} title={tx('Pagine e modifiche rispetto all\'ultima revisione rilasciata, con le note')}>{tx('Modifiche della revisione')}</button>}
          {!viewing && project.revisionState === 'review' && <button onClick={() => { close(); void cancelRevision(); }}>{tx('Annulla revisione')}</button>}
          {!viewing && released && <button className="primary" onClick={() => { st().openRevision(); close(); }}>{tx('Apri revisione nuova')}</button>}
          {!viewing && !released && <button className="primary" onClick={() => { close(); void releaseRevision(); }}>{tx('Rilascia revisione…')}</button>}
        </div>
      </div>
    </div>
  );
}

/** Barra sotto il menu: revisione archiviata aperta o progetto rilasciato in sola lettura */
export function RevisionBanner() {
  const viewing = useStore(s => s.viewing);
  const state = useStore(s => s.project.revisionState);
  const project = useStore(s => s.project);
  const st = useStore.getState;
  if (viewing) {
    return (
      <div className="revision-banner viewing">
        <span>{tx('Revisione {0} del {1}, archiviata: sola lettura', viewing.index, viewing.date)}</span>
        <button onClick={() => st().setDialog('revisions')}>{tx('Revisioni…')}</button>
        <button className="primary" onClick={() => st().closeRevisionView()}>{tx('Torna al progetto')}</button>
      </div>
    );
  }
  if (state === 'released') {
    return (
      <div className="revision-banner">
        <span>{revisionStateText(project)}</span>
        <button onClick={() => st().setDialog('revisions')}>{tx('Revisioni…')}</button>
        <button className="primary" onClick={() => st().openRevision()}>{tx('Apri revisione nuova')}</button>
      </div>
    );
  }
  return null;
}
