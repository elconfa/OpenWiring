// Articoli ▸ Cerca nei progetti: dove è usato un articolo nel progetto aperto e nei progetti .ecad di una
// cartella (con le sottocartelle). Clic su un risultato: si apre il progetto alla pagina del dispositivo.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { findPartInProject, type PartHit } from '../model/partSearch';
import { isElectron, parseProject } from '../io/fileio';
import { openRecent } from './actions';
import { tx } from '../i18n/ui';

interface FileHits { path?: string; name: string; hits: PartHit[]; current?: boolean }

export function PartSearchDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const st = useStore.getState;
  const [q, setQ] = useState(initial);
  const [dir, setDir] = useState('');
  const [results, setResults] = useState<FileHits[] | null>(null);
  const [progress, setProgress] = useState('');
  const stop = useRef(false);
  useEffect(() => {
    void window.elettro?.foldersGet?.().then(f => setDir(f.defaults.projects ?? f.last.projects ?? f.documents));
    return () => { stop.current = true; };
  }, []);

  const run = async () => {
    stop.current = false;
    const s = st();
    const out: FileHits[] = [];
    const cur = findPartInProject(s.project, q);
    out.push({ path: s.filePath, name: s.project.info.name || tx('progetto aperto'), hits: cur, current: true });
    setResults([...out]);
    if (!isElectron() || !dir) return;
    setProgress(tx('Ricerca dei progetti…'));
    const paths = (await window.elettro?.scanProjects?.(dir)) ?? [];
    let n = 0;
    for (const p of paths) {
      if (stop.current) break;
      n++;
      if (p === s.filePath) continue;
      setProgress(tx('{0} di {1}: {2}', n, paths.length, p.split(/[\\/]/).pop() ?? p));
      const f = await window.elettro?.readProject?.(p);
      if (!f) continue;
      try {
        const proj = parseProject(new TextDecoder().decode(f.data));
        const hits = findPartInProject(proj, q);
        if (hits.length) { out.push({ path: p, name: proj.info.name || f.name, hits }); setResults([...out]); }
      } catch { /* file non leggibile: si salta */ }
    }
    setProgress(tx('{0} progetti esaminati', paths.length));
  };

  const go = async (f: FileHits, h: PartHit) => {
    if (!f.current && f.path && !(await openRecent(f.path))) return;
    const s = st();
    s.setView('schema');
    s.setPage(h.pageId);
    s.setSelection([h.elementId]);
    onClose();
  };

  const total = results?.reduce((a, f) => a + f.hits.length, 0) ?? 0;
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal wide part-search" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Cerca l\'articolo nei progetti')}>
        <h3>{tx('Cerca l\'articolo nei progetti')}</h3>
        <div className="part-search-bar">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Codice articolo, tipo o codice d\'ordinazione')} autoFocus onKeyDown={e => { if (e.key === 'Enter' && q.trim()) void run(); }} />
          <button className="primary" disabled={!q.trim()} onClick={() => void run()}>{tx('Cerca')}</button>
        </div>
        {isElectron() ? (
          <div className="part-search-bar small">
            <span className="muted">{tx('Cartella dei progetti:')}</span> <span className="mono">{dir || '—'}</span>
            <button className="mini" onClick={async () => { const d = await window.elettro?.foldersChoose?.('projects'); if (d) setDir(d); }}>{tx('Cambia…')}</button>
          </div>
        ) : <p className="small muted">{tx('Nel browser si cerca solo nel progetto aperto: le cartelle dei progetti si leggono nell\'app installata.')}</p>}
        {progress && <p className="small muted">{progress}</p>}
        <div className="part-search-results">
          {results && !total && <p className="small muted">{tx('Nessun dispositivo con questo articolo.')}</p>}
          {results?.filter(f => f.hits.length).map(f => (
            <section key={f.path ?? 'current'}>
              <h4>{f.name}{f.current ? ` (${tx('aperto')})` : ''} <span className="small muted">{f.path ?? ''}</span></h4>
              <table className="grid">
                <tbody>
                  {f.hits.map((h, i) => (
                    <tr key={i} className="clickable" onClick={() => void go(f, h)} title={tx('Apri alla pagina del dispositivo')}>
                      <td className="mono">{h.tag ? `-${h.tag}` : '—'}</td><td>{h.partNr}</td><td className="nowrap">/{h.loc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}
