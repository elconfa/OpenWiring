// Rilascio di una revisione (fase 19e): prima il controllo del progetto. Gli errori bloccano il
// rilascio (si correggono, o si segnano «Verificato» nei Controlli se non lo sono); gli avvisi si
// accettano tutti con un motivo scritto. Le segnalazioni accettate finiscono nella revisione e nel
// rapporto del pacchetto di rilascio.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { acceptedOf, issueKey, releaseCheck, type Issue } from '../model/checks';
import { nextRevisionIndex } from '../model/revisions';
import { releasePackage } from './actions';
import { tx } from '../i18n/ui';

function IssueList({ list, max = 8 }: { list: Issue[]; max?: number }) {
  const st = useStore.getState;
  const go = (i: Issue) => { if (!i.pageId) return; st().setDialog(null); st().setView('schema'); st().setPage(i.pageId); if (i.elementId) st().setSelection([i.elementId]); };
  return (
    <table className="grid release-issues">
      <tbody>
        {list.slice(0, max).map((i, k) => (
          <tr key={k} className={i.pageId ? 'clickable' : ''} onClick={() => go(i)} title={i.pageId ? tx('Vai all\'elemento') : undefined}>
            <td className="nowrap">{i.kind}</td><td>{i.msg}</td><td className="nowrap">{i.loc ? `/${i.loc}` : ''}</td>
          </tr>
        ))}
        {list.length > max && <tr><td colSpan={3} className="muted">{tx('… e altre {0}: l\'elenco completo è in Liste ▸ Controlli', list.length - max)}</td></tr>}
      </tbody>
    </table>
  );
}

export function ReleaseDialog() {
  const open = useStore(s => s.dialog === 'release');
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const check = useMemo(() => (open ? releaseCheck(project, library) : undefined), [open, project, library]);
  const [index, setIndex] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState(true);
  if (!open || !check) return null;
  const idx = index ?? nextRevisionIndex(project);
  const who = author ?? project.info.author;
  const used = (project.revisions ?? []).some(r => r.index.toUpperCase() === idx.trim().toUpperCase());
  const blocked = check.errors.length > 0 || (check.warnings.length > 0 && !reason.trim()) || !idx.trim() || used || busy;
  const close = () => { st().setDialog(null); setIndex(null); setAuthor(null); setDescription(''); setReason(''); };
  const release = async () => {
    setBusy(true);
    try {
      // Gli avvisi accettati con il motivo restano verificati anche nei Controlli
      if (check.warnings.length) st().acceptIssues(check.warnings.map(issueKey), reason.trim(), true);
      const p = useStore.getState().project;
      const accepted = [...check.accepted, ...check.warnings].map(i => ({ kind: i.kind, msg: i.msg, loc: i.loc, note: acceptedOf(p, i)?.note }));
      await st().releaseRevision({ index: idx.trim(), date: new Date().toISOString().slice(0, 10), author: who.trim(), description: description.trim(), accepted });
      close();
      const rev = useStore.getState().project.revisions?.at(-1);
      if (pack && rev) await releasePackage(rev.id);
    } finally { setBusy(false); }
  };
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal release-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Rilascia revisione')}>
        <h3>{tx('Rilascia revisione')}</h3>
        <h4 className={check.errors.length ? 'error-text' : ''}>{check.errors.length ? tx('{0} errori: il rilascio è bloccato', check.errors.length) : tx('Nessun errore')}</h4>
        {check.errors.length > 0 && <>
          <p className="muted small">{tx('Correggi gli errori (clic su una riga per andarci). Se uno non è un errore, segnalo «Verificato» con il motivo in Liste ▸ Controlli.')}</p>
          <IssueList list={check.errors} />
        </>}
        <h4>{check.warnings.length ? tx('{0} avvisi da accettare', check.warnings.length) : tx('Nessun avviso da accettare')}</h4>
        {check.warnings.length > 0 && <>
          <IssueList list={check.warnings} max={6} />
          <label className="ask-field"><span>{tx('Motivo per accettare gli avvisi (finisce nel rapporto della revisione)')}</span>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder={tx('es. canali di riserva, conduttori che proseguono in campo')} />
          </label>
        </>}
        {check.accepted.length > 0 && <p className="muted small">{tx('{0} segnalazioni già verificate: entrano nel rapporto con il loro motivo.', check.accepted.length)}</p>}
        <h4>{tx('Dati della revisione')}</h4>
        <label className="ask-field"><span>{tx('Indice')}</span><input value={idx} onChange={e => setIndex(e.target.value)} /></label>
        {used && <p className="small error-text">{tx('La revisione {0} esiste già', idx)}</p>}
        <label className="ask-field"><span>{tx('Descrizione della revisione')}</span><input value={description} onChange={e => setDescription(e.target.value)} placeholder={tx('es. Aggiunto motore pompa 2')} /></label>
        <label className="ask-field"><span>{tx('Autore')}</span><input value={who} onChange={e => setAuthor(e.target.value)} /></label>
        <label className="row"><input type="checkbox" checked={pack} onChange={e => setPack(e.target.checked)} /> {tx('Crea subito il pacchetto di rilascio (cartella con schemi PDF, liste, differenze, manifest e checksum)')}</label>
        <div className="modal-actions">
          <span className="tb-spacer" />
          <button onClick={close}>{tx('Annulla')}</button>
          <button className="primary" disabled={blocked} onClick={() => void release()}
            title={check.errors.length ? tx('Ci sono errori da correggere') : check.warnings.length && !reason.trim() ? tx('Scrivi il motivo per accettare gli avvisi') : undefined}>{tx('Rilascia')}</button>
        </div>
      </div>
    </div>
  );
}
