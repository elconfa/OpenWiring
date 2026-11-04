// Vista Ripartitori: ripartitori (es. Cembre DB100-6/4) e morsettiere di distribuzione per i conduttori
// di potenza, definiti come i cavi. A sinistra l'occupazione di ingressi e uscite (fili, somma delle
// sezioni, stato), a destra l'elenco, i dati e i gruppi con le sezioni massime delle uscite.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { distSlots, slotRow, SLOT_COLUMNS, parseOuts, outsText, distSymbolId } from '../model/distributors';
import { partsIndex } from '../model/devices';
import type { Distributor, DistGroup } from '../model/types';
import { ColSplitter } from './split';
import { PartInput } from './PropertyPanel';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';

function Field({ value, onCommit, placeholder, width }: { value: string; onCommit: (v: string) => void; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} placeholder={placeholder} style={width ? { width } : undefined} onChange={e => setV(e.target.value)} onClick={e => e.stopPropagation()}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

const KIND_NAMES: Record<Distributor['kind'], string> = { bar: 'Ripartitore', terminals: 'Morsettiera di distribuzione', earth: 'Barra di terra' };
/** Nome dei gruppi per tipo: poli, morsetti di ingresso, barre (PE, N) */
const GROUP_NAMES: Record<Distributor['kind'], [string, string, string]> = {
  bar: ['Poli', 'Polo', '+ Polo'], terminals: ['Morsetti di ingresso', 'Morsetto', '+ Morsetto'], earth: ['Barre', 'Barra', '+ Barra'],
};

export function DistributorsView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const distSel = useStore(s => s.distSel);
  const st = useStore.getState;
  const list = project.distributors ?? [];
  const d = list.find(x => x.id === distSel) ?? list[0];
  const slots = useMemo(() => distSlots(project).filter(s => s.d.id === d?.id), [project, d?.id]);
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const placed = new Set(project.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' ? [e.symbolId] : []))));
  const upd = (patch: Partial<Distributor>) => d && st().updateDistributor(d.id, patch);
  const setGroup = (gi: number, patch: Partial<DistGroup>) => d && upd({ groups: d.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const goTo = (symbolId: string) => {
    const pg = project.pages.find(p => p.elements.some(e => e.kind === 'symbol' && e.symbolId === symbolId));
    const el = pg?.elements.find(e => e.kind === 'symbol' && e.symbolId === symbolId);
    if (!pg || !el) return;
    st().setPage(pg.id); st().setSelection([el.id]); st().setView('schema');
  };
  const bad = slots.filter(s => s.status === 'superata').length;

  return (
    <div className="parts-view distributors-view">
      <div className="parts-list">
        <div className="parts-toolbar">
          <b>{d ? `${tx(KIND_NAMES[d.kind])} -${d.tag}` : tx('Ripartitori')}</b>
          <button onClick={() => st().addDistributor('bar')} title={tx('Barra di ripartizione con più poli (es. Cembre DB100-6/4): per ogni polo un ingresso e le uscite con la loro sezione massima')}>{tx('Nuovo ripartitore')}</button>
          <button onClick={() => st().addDistributor('terminals')} title={tx('Morsetto di ingresso ponticellato con uno o più morsetti di uscita, con la sezione massima di ognuno')}>{tx('Nuova morsettiera di distribuzione')}</button>
          <button onClick={() => st().addDistributor('earth')} title={tx('Barra di terra o equipotenziale (PE, anche N): un foro per ogni filo, con la sezione massima di ognuno')}>{tx('Nuova barra di terra')}</button>
          <div className="tb-spacer" />
          {d && <span className={bad ? 'small error-text' : 'muted small'}>{bad ? tx('{0} uscite oltre la sezione ammessa', bad) : tx('Sezioni entro i limiti')}</span>}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr>{SLOT_COLUMNS.slice(1).map(c => <th key={c}>{tx(c)}</th>)}</tr></thead>
            <tbody>
              {slots.map((s, i) => {
                const r = slotRow(s);
                return (
                  <tr key={i} className={s.status === 'superata' ? 'row-bad' : s.status === 'libera' ? 'muted' : ''}>
                    {r.slice(1, 6).map((c, k) => <td key={k}>{c}</td>)}
                    <td>{tx(s.status)}</td>
                  </tr>
                );
              })}
              {!d && <tr><td colSpan={6}><EmptyState icon="distributor" text={tx('Nessun ripartitore. «Nuovo ripartitore» per una barra (es. DB100-6/4), «Nuova morsettiera di distribuzione» per morsetti ponticellati: imposti uscite e sezioni massime, poi li metti sullo schema.')}
                action={tx('Crea il primo ripartitore')} onAction={() => useStore.getState().addDistributor('bar')} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ColSplitter id="distributors" />
      <div className="part-detail">
        <div className="detail-scroll">
          <h4>{tx('Ripartitori')}</h4>
          <table className="grid">
            <tbody>
              {list.map(x => (
                <tr key={x.id} className={x.id === d?.id ? 'sel' : ''} onClick={() => st().setDistSel(x.id)}>
                  <td>-{x.tag}</td><td>{tx(KIND_NAMES[x.kind])}</td><td className="muted">{x.groups.map(g => g.name).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d && (
            <>
              <h4>{tx('Dati di -{0}', d.tag)}</h4>
              <table className="prop-table">
                <tbody>
                  <tr><td className="prop-name">{tx('Sigla')}</td><td className="prop-value"><Field value={d.tag} onCommit={v => { const t = v.replace(/^-/, '').trim(); if (t && !t.includes(':')) upd({ tag: t }); }} /></td></tr>
                  <tr><td className="prop-name">{tx('Tipo')}</td><td className="prop-value">
                    <select value={d.kind} onChange={e => upd({ kind: e.target.value as Distributor['kind'] })}>
                      {(Object.keys(KIND_NAMES) as Distributor['kind'][]).map(k => <option key={k} value={k}>{tx(KIND_NAMES[k])}</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><Field value={d.description ?? ''} placeholder={tx('es. Cembre DB100-6/4')} onCommit={v => upd({ description: v.trim() || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Articolo')}</td><td className="prop-value"><PartInput listId="dist-parts" value={d.partNr ?? ''} parts={parts} onCommit={v => upd({ partNr: v || undefined })} /></td></tr>
                </tbody>
              </table>
              <h4>{tx(GROUP_NAMES[d.kind][0])}</h4>
              <p className="muted small">{tx('Sezioni massime in mm²: uscite separate da ; (es. «4,5; 4,5; 4,5; 6; 6; 6» oppure «6x4,5»), «-» se non indicata. Più fili sulla stessa uscita: falli partire tutti dal punto dell\'uscita, oppure un filo che scende e si dirama a T; ogni dispositivo raggiunto è un filo dal foro e conta la somma delle sezioni. Il numero filo resta quello dell\'ingresso.')}</p>
              <table className="grid dist-groups">
                <thead><tr><th>{tx(GROUP_NAMES[d.kind][1])}</th><th>{tx('Ingresso max')}</th><th>{tx('Uscite (sezione max)')}</th><th /></tr></thead>
                <tbody>
                  {d.groups.map((g, gi) => (
                    <tr key={gi}>
                      <td><Field value={g.name} width={52} onCommit={v => v.trim() && setGroup(gi, { name: v.trim() })} /></td>
                      <td><Field value={g.inMax ?? ''} width={52} placeholder="mm²" onCommit={v => setGroup(gi, { inMax: v.trim().replace('.', ',') || undefined })} /></td>
                      <td><Field value={outsText(g.outs)} onCommit={v => { const o = parseOuts(v); if (o.length) setGroup(gi, { outs: o }); }} /></td>
                      <td className="nowrap">
                        {placed.has(distSymbolId(d, gi))
                          ? <button className="mini" onClick={() => goTo(distSymbolId(d, gi))} title={tx('Mostra sullo schema')}>→</button>
                          : <button className="mini" onClick={() => st().placeDistGroup(d.id, gi)} title={tx('Clic sullo schema per metterlo')}>{tx('Inserisci')}</button>}
                        <button className="mini" disabled={d.groups.length <= 1} title={tx('Togli il gruppo (anche dallo schema)')} onClick={() => upd({ groups: d.groups.filter((_, i) => i !== gi) })}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row-buttons">
                <button onClick={() => upd({ groups: [...d.groups, { name: d.kind === 'bar' ? `L${d.groups.length + 1}` : d.kind === 'earth' ? (d.groups.some(g => g.name === 'N') ? `PE${d.groups.length + 1}` : 'N') : String(d.groups.length + 1), inMax: d.groups[d.groups.length - 1]?.inMax, outs: [...(d.groups[d.groups.length - 1]?.outs ?? [''])] }] })}>{tx(GROUP_NAMES[d.kind][2])}</button>
                <button disabled={d.groups.length < 2} title={tx('Ingresso e uscite del primo gruppo uguali per tutti')} onClick={() => upd({ groups: d.groups.map(g => ({ ...g, inMax: d.groups[0].inMax, outs: [...d.groups[0].outs] })) })}>{tx('Uguali al primo')}</button>
                <button onClick={() => st().placeDistGroup(d.id)} title={tx('Mette sullo schema i gruppi che mancano, uno per clic')}>{tx('Inserisci sullo schema')}</button>
                <button onClick={() => { if (window.confirm(tx('Eliminare -{0} e i suoi simboli sullo schema?', d.tag))) st().deleteDistributor(d.id); }}>{tx('Elimina')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
