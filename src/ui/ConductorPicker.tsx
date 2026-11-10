// Campo del conduttore di un filo nel bus con il suo elenco a discesa (al posto di quello del sistema,
// che resta bianco anche con il tema scuro e non scorre): conduttori del cavo in ordine con il colore,
// lo stato (libero, entrato e in attesa dell'uscita, già usato) e la barra di scorrimento.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConductorSwatch } from './CablesView';
import { tx } from '../i18n/ui';

export interface ConductorChoice { name: string; count: number }

const MAX_H = 320;

export function ConductorPicker({ value, choices, onCommit, width = 80, placeholder = '—' }: {
  value: string; choices: ConductorChoice[]; onCommit: (v: string) => void; width?: number; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number; up: boolean }>();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Scrivendo si filtra; con il campo appena aperto si vedono tutti, con il valore attuale evidenziato
  const [typed, setTyped] = useState(false);
  useEffect(() => setV(value), [value]);
  const q = typed ? v.trim().toLowerCase() : '';
  const shown = q ? choices.filter(c => c.name.toLowerCase().includes(q)) : choices;

  const place = () => {
    const el = input.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), H = el.ownerDocument.defaultView?.innerHeight ?? 800;
    const below = H - r.bottom - 8, above = r.top - 8;
    const up = below < 160 && above > below;
    setPos({ left: r.left, top: up ? r.top - 2 : r.bottom + 2, maxH: Math.min(MAX_H, up ? above : below), up });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const win = input.current?.ownerDocument.defaultView ?? window;
    const away = (e: MouseEvent) => { if (!input.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) close(true); };
    const move = () => place();
    win.addEventListener('mousedown', away, true);
    win.addEventListener('resize', move);
    win.addEventListener('scroll', move, true);
    return () => { win.removeEventListener('mousedown', away, true); win.removeEventListener('resize', move); win.removeEventListener('scroll', move, true); };
  });
  // L'elemento evidenziato resta visibile scorrendo con le frecce
  useEffect(() => { list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [hi, open]);

  const commit = (val: string) => { const t = val.trim(); setV(t); if (t !== value) onCommit(t); };
  const close = (save: boolean) => { setOpen(false); setTyped(false); if (save) commit(v); };
  const pick = (name: string) => { setOpen(false); setTyped(false); commit(name); input.current?.blur(); };
  // Evidenziato: il conduttore scritto, altrimenti quello proposto (in attesa dell'uscita, poi il primo libero)
  const suggested = () => { const w = choices.findIndex(c => c.count === 1); return w >= 0 ? w : Math.max(0, choices.findIndex(c => !c.count)); };
  const openList = () => { setOpen(true); const i = choices.findIndex(c => c.name === v); setHi(i >= 0 ? i : suggested()); };

  const tone = (c: ConductorChoice) => (c.count === 1 ? 'tone-wait' : c.count ? 'tone-used' : 'tone-free');
  const state = (c: ConductorChoice) => (c.count === 1 ? tx('entrato, aspetta l\'uscita') : c.count ? tx('già usato ({0})', c.count) : tx('libero'));

  return (
    <span className="cond-picker">
      <input ref={input} value={v} style={{ width }} placeholder={placeholder}
        onChange={e => { setV(e.target.value); setTyped(true); setHi(0); if (!open) setOpen(true); }}
        onFocus={openList} onClick={() => { if (!open) openList(); }}
        onBlur={e => { if (!list.current?.contains(e.relatedTarget as Node)) close(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setHi(h => Math.min(shown.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[hi]) pick(shown[hi].name); else { close(true); input.current?.blur(); } }
          else if (e.key === 'Escape') { e.stopPropagation(); setV(value); setOpen(false); setTyped(false); }
        }} />
      <button type="button" className="cond-picker-btn" tabIndex={-1} aria-label={tx('Conduttori')}
        onMouseDown={e => { e.preventDefault(); if (open) setOpen(false); else { input.current?.focus(); openList(); } }}>▾</button>
      {open && pos && shown.length > 0 && input.current && createPortal(
        <div ref={list} className="cond-picker-list" role="listbox" tabIndex={-1}
          style={{ left: pos.left, top: pos.top, maxHeight: pos.maxH, transform: pos.up ? 'translateY(-100%)' : undefined }}
          onMouseDown={e => e.preventDefault()}>
          {shown.map((c, i) => (
            <div key={c.name} role="option" aria-selected={c.name === v} className={`cond-picker-item ${tone(c)}${i === hi ? ' sel' : ''}${c.name === value ? ' cur' : ''}`}
              onMouseEnter={() => setHi(i)} onClick={() => pick(c.name)}>
              <ConductorSwatch name={c.name} />
              <span className="cond-picker-name">{c.name}</span>
              <span className="cond-picker-state">{state(c)}</span>
            </div>
          ))}
        </div>,
        input.current.ownerDocument.body,
      )}
    </span>
  );
}
