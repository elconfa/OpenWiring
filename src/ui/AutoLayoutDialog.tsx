// Layout ▸ Posa automatica…: si sceglie cosa montare sulla piastra (apparecchi e morsettiere non ancora
// posati), l'ordine sulle guide e lo spazio tra gli elementi. Guide e canaline si creano se mancano.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { layoutCandidates, layoutOf } from '../model/layout';
import { tx } from '../i18n/ui';

export function AutoLayoutDialog({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const page = project.pages.find(p => p.id === pageId)!;
  const cands = useMemo(() => layoutCandidates(project, layoutOf(page), library, page.panelId), [project, page, library]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(cands.map(c => c.key)));
  const [order, setOrder] = useState<'tag' | 'page'>('tag');
  const [gap, setGap] = useState(2);
  const flip = (k: string) => setChosen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const width = cands.filter(c => chosen.has(c.key)).reduce((a, c) => a + c.w + gap, 0);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal wide auto-layout" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Posa automatica')}>
        <h3>{tx('Posa automatica')}</h3>
        <p className="small muted">{tx('Gli elementi scelti vanno sulle guide in ordine, da sinistra; le morsettiere sulle guide più in basso. Se la piastra non ha guide, si creano guide e canaline.')}</p>
        <div className="custom-row">
          <label>{tx('Ordine')} <select value={order} onChange={e => setOrder(e.target.value as 'tag' | 'page')}>
            <option value="tag">{tx('per sigla')}</option>
            <option value="page">{tx('come nello schema (per pagina)')}</option>
          </select></label>
          <label>{tx('Spazio tra gli elementi (mm)')} <input type="number" min={0} max={50} value={gap} onChange={e => setGap(Math.max(0, Number(e.target.value) || 0))} style={{ width: 60 }} /></label>
          <button className="mini" onClick={() => setChosen(new Set(cands.map(c => c.key)))}>{tx('Tutti')}</button>
          <button className="mini" onClick={() => setChosen(new Set())}>{tx('Nessuno')}</button>
        </div>
        <div className="auto-layout-list">
          {!cands.length && <p className="small muted">{tx('Tutti gli apparecchi e le morsettiere sono già posati.')}</p>}
          <table className="grid">
            <tbody>
              {cands.map(c => (
                <tr key={c.key} className="clickable" onClick={() => flip(c.key)}>
                  <td><input type="checkbox" checked={chosen.has(c.key)} onChange={() => flip(c.key)} onClick={e => e.stopPropagation()} /></td>
                  <td className="mono">{c.kind === 'strip' ? c.ref : `-${c.ref}`}</td>
                  <td>{c.text}</td>
                  <td className="nowrap">{Math.round(c.w)} × {Math.round(c.h)} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">{tx('{0} elementi scelti, {1} mm di guida', chosen.size, Math.round(width))}</p>
        <div className="modal-actions">
          <button onClick={onClose}>{tx('Annulla')}</button>
          <button className="primary" disabled={!chosen.size} onClick={() => { st().autoLayout(pageId, { refs: chosen, order, gap }); onClose(); }}>{tx('Posa')}</button>
        </div>
      </div>
    </div>
  );
}
