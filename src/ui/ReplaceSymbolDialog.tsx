// Scelta del simbolo che sostituisce quello di un elemento (clic destro ▸ Sostituisci simbolo…):
// ricerca per nome, lettera e categoria; prima i simboli simili (stessa categoria o lettera).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { BUILTIN_SYMBOLS } from '../model/symbols';
import type { SymbolDef } from '../model/types';
import { SymbolPreview } from './SymbolLibrary';
import { isDeletedSymbol } from '../model/symbolSync';
import { tx } from '../i18n/ui';

let show: ((cur: SymbolDef, resolve: (id: string | null) => void) => void) | null = null;

/** Apre la scelta del simbolo nuovo; null se si annulla */
export function chooseReplacement(cur: SymbolDef): Promise<string | null> {
  return new Promise(resolve => { if (show) show(cur, resolve); else resolve(null); });
}

const MAX = 240;

export function ReplaceSymbolHost() {
  const [req, setReq] = useState<{ cur: SymbolDef; resolve: (id: string | null) => void } | null>(null);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const symbolLibrary = useStore(s => s.symbolLibrary);
  const customSymbols = useStore(s => s.project.customSymbols);
  useEffect(() => {
    show = (cur, resolve) => { setQ(''); setReq({ cur, resolve }); };
    return () => { show = null; };
  }, []);
  useEffect(() => { if (req) setTimeout(() => input.current?.focus(), 0); }, [req]);
  // Simboli di base (o la loro copia modificata), della libreria personale e del progetto
  const all = useMemo(() => {
    const overrides = new Map(symbolLibrary.filter(x => x.replaces).map(x => [x.replaces!, x]));
    const out: SymbolDef[] = BUILTIN_SYMBOLS.filter(s => !s.hidden && !s.plcGroup).map(b => overrides.get(b.id) ?? b);
    const seen = new Set(out.map(s => s.id));
    for (const s of [...symbolLibrary, ...customSymbols]) {
      if (seen.has(s.id) || s.hidden || s.plcGroup || isDeletedSymbol(s) || (s.replaces && overrides.get(s.replaces) === s)) continue;
      seen.add(s.id); out.push(s);
    }
    return out;
  }, [symbolLibrary, customSymbols]);
  if (!req) return null;
  const close = (id: string | null) => { req.resolve(id); setReq(null); };
  const { cur } = req;
  const ql = q.trim().toLowerCase();
  const name = (s: SymbolDef) => (BUILTIN_SYMBOLS.includes(s) ? tx(s.name) : s.name);
  const hits = all.filter(s => s.id !== cur.id && (!ql || `${s.name} ${tx(s.name)} ${s.letter} ${s.category}`.toLowerCase().includes(ql)));
  // Prima i simili: stessa lettera e categoria, poi stessa categoria, poi stessa lettera
  const score = (s: SymbolDef) => (s.category === cur.category ? 2 : 0) + (s.letter && s.letter === cur.letter ? 1 : 0);
  const list = hits.map((s, i) => ({ s, i, k: score(s) })).sort((a, b) => b.k - a.k || a.i - b.i).map(x => x.s);
  return (
    <div className="modal-back" onMouseDown={() => close(null)}>
      <div className="modal wide replace-symbol" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Sostituisci simbolo')}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } }}>
        <h3>{tx('Sostituisci simbolo')}</h3>
        <p className="small muted">{tx('Al posto di «{0}». Sigla, dati del dispositivo e fili restano; i punti di connessione si abbinano per designazione.', name(cur))}</p>
        <input ref={input} className="search" placeholder={tx('Cerca…')} value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && list.length) close(list[0].id); }} />
        <div className="replace-grid">
          {list.slice(0, MAX).map(s => (
            <button key={s.id} type="button" className="sym-item" title={`${name(s)}${s.letter ? ` (-${s.letter})` : ''} · ${tx(s.category)}`} onClick={() => close(s.id)}>
              <SymbolPreview sym={s} />
              <span>{name(s)}</span>
            </button>
          ))}
          {!list.length && <p className="muted small">{tx('Nessun simbolo trovato')}</p>}
        </div>
        {list.length > MAX && <p className="muted small">{tx('… altri')} {list.length - MAX}{tx(': usa la ricerca')}</p>}
        <div className="modal-actions">
          <button onClick={() => close(null)}>{tx('Annulla')}</button>
        </div>
      </div>
    </div>
  );
}
