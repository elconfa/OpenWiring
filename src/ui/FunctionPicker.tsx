// Scelta della funzione di un simbolo (DA_FARE 164): elenco scorrevole delle funzioni per gruppo,
// con ricerca e quanti simboli della libreria l'hanno già; in fondo si aggiunge una funzione nuova.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { FUNCTION_GROUPS, allFunctions, newFunctionId, type SymbolFunction } from '../model/symbolFunctions';
import { tx } from '../i18n/ui';

/** Risposta: id della funzione, null = nessuna funzione, undefined = annullato */
type Answer = string | null | undefined;
interface Request { title: string; value?: string; suggested?: string; letter?: string; resolve: (v: Answer) => void }

let show: ((r: Request) => void) | undefined;

/** Chiede la funzione del simbolo; suggested = quella proposta dal nome e dalla cartella */
export function pickFunction(title: string, value?: string, suggested?: string, letter?: string): Promise<Answer> {
  return new Promise(resolve => {
    if (!show) { resolve(undefined); return; }
    show({ title, value, suggested, letter, resolve });
  });
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FunctionPickerHost() {
  const userFunctions = useStore(s => s.userFunctions);
  const symbolLibrary = useStore(s => s.symbolLibrary);
  const [req, setReq] = useState<Request | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<{ name: string; group: string; letter: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    show = r => { setReq(r); setSel(r.value ?? r.suggested ?? null); setQ(''); setAdding(null); };
    return () => { show = undefined; };
  }, []);
  useEffect(() => {
    if (req) requestAnimationFrame(() => listRef.current?.querySelector('.tree-row.active')?.scrollIntoView({ block: 'center' }));
  }, [req]);
  const all = useMemo(() => allFunctions(userFunctions), [userFunctions]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of symbolLibrary) if (s.func) m.set(s.func, (m.get(s.func) ?? 0) + 1);
    return m;
  }, [symbolLibrary]);
  if (!req) return null;
  const finish = (v: Answer) => { req.resolve(v); setReq(null); };
  const ql = plain(q.trim());
  const shown = ql ? all.filter(f => plain(`${f.name} ${tx(f.name)} ${f.group} ${tx(f.group)} ${f.id} ${f.iec60617 ?? ''}`).includes(ql)) : all;
  const groups = [...new Set([...FUNCTION_GROUPS, ...all.map(f => f.group)])];
  const row = (f: SymbolFunction) => (
    <div key={f.id} className={`tree-row${f.id === sel ? ' focus active' : ''}`} title={[f.iec60617 && `IEC 60617 ${f.iec60617}`, f.letter && tx('Lettera {0}', f.letter), f.description].filter(Boolean).join(' · ')}
      onClick={() => setSel(f.id)} onDoubleClick={() => finish(f.id)}>
      <span className="tree-guides" style={{ width: 14 }} />
      <span className="tree-label">{tx(f.name)}{f.id === req.suggested && f.id !== req.value ? <span className="muted small"> · {tx('proposta')}</span> : null}</span>
      {f.letter && <span className="muted small fn-letter">{f.letter}</span>}
      <span className="tree-count">{counts.get(f.id) ?? ''}</span>
    </div>
  );
  const add = () => {
    if (!adding?.name.trim()) return;
    const f: SymbolFunction = { id: newFunctionId(adding.name, all), name: adding.name.trim(), group: adding.group, letter: adding.letter.trim().toUpperCase() || undefined };
    useStore.getState().saveUserFunction(f);
    setAdding(null);
    setSel(f.id);
    setQ('');
  };
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) finish(undefined); }}>
      <div className="modal branch-picker function-picker" role="dialog" aria-label={req.title}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); finish(undefined); } }}>
        <h3>{req.title}</h3>
        <input type="search" className="search" autoFocus placeholder={tx('Cerca una funzione…')} value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && shown.length === 1) finish(shown[0].id); }} />
        <div className="sym-tree branch-list" ref={listRef}>
          {groups.map(g => {
            const list = shown.filter(f => f.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="tree-row folder fn-group"><span className="tree-label">{tx(g)}</span></div>
                {list.map(row)}
              </div>
            );
          })}
          {!shown.length && <p className="muted small pad">{tx('Nessuna funzione trovata: aggiungila con «Nuova funzione…».')}</p>}
        </div>
        {adding ? (
          <div className="fn-new">
            <input type="text" value={adding.name} autoFocus placeholder={tx('Nome della funzione, es. Barriera di sicurezza tipo 4')}
              onChange={e => setAdding({ ...adding, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <select value={adding.group} onChange={e => setAdding({ ...adding, group: e.target.value })} title={tx('Gruppo')}>
              {groups.map(g => <option key={g} value={g}>{tx(g)}</option>)}
            </select>
            <input type="text" className="fn-letter-input" value={adding.letter} maxLength={3} placeholder={tx('Lettera')} title={tx('Lettera IEC 81346 tipica')}
              onChange={e => setAdding({ ...adding, letter: e.target.value })} />
            <button onClick={() => setAdding(null)}>{tx('Annulla')}</button>
            <button className="primary" disabled={!adding.name.trim()} onClick={add}>{tx('Aggiungi')}</button>
          </div>
        ) : null}
        <div className="modal-actions">
          {!adding && <button onClick={() => setAdding({ name: q.trim(), group: all.find(f => f.id === sel)?.group ?? FUNCTION_GROUPS[FUNCTION_GROUPS.length - 1], letter: req.letter ?? '' })}>{tx('Nuova funzione…')}</button>}
          <span className="spacer" />
          {req.value && <button onClick={() => finish(null)}>{tx('Nessuna funzione')}</button>}
          <button onClick={() => finish(undefined)}>{tx('Annulla')}</button>
          <button className="primary" disabled={!sel} onClick={() => finish(sel)}>{tx('Scegli')}</button>
        </div>
      </div>
    </div>
  );
}
