// Barra degli strumenti sopra lo schema (come la «Active Bar» di Altium): gli strumenti di disegno
// sempre a portata di mano, anche con la barra multifunzione ridotta. Il pulsante del simbolo ricorda
// l'ultimo simbolo inserito e apre gli ultimi usati; si nasconde con ✕ e torna da Visualizza.
import { useEffect, useRef, useState } from 'react';
import { useStore, preferredSymbolId, type Tool } from '../model/store';
import { getSymbol } from '../model/geometry';
import type { SymbolDef } from '../model/types';
import { SymbolPreview } from './SymbolLibrary';
import { keyLabel } from './shortcuts';
import { Icon } from './icons';
import { tipProps } from './RichTooltip';
import { tx } from '../i18n/ui';

const PREF = 'elettrocad.recentSymbols';
const MAX = 8;
export const recentSymbols = (): string[] => { try { const v = JSON.parse(localStorage.getItem(PREF) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const saveRecent = (ids: string[]) => { try { localStorage.setItem(PREF, JSON.stringify(ids)); } catch { /* solo comodità */ } };

// Ogni simbolo scelto per l'inserimento (dalla libreria, dalla galleria, da qui) va in cima agli ultimi usati
useStore.subscribe((s, prev) => {
  if (s.tool === prev.tool || s.tool.kind !== 'place') return;
  const id = s.tool.symbolId;
  const cur = recentSymbols();
  if (cur[0] !== id) saveRecent([id, ...cur.filter(x => x !== id)].slice(0, MAX));
});


export function ActiveBar() {
  const tool = useStore(s => s.tool);
  const project = useStore(s => s.project);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', down);
    return () => window.removeEventListener('mousedown', down);
  }, [open]);
  const st = useStore.getState;
  const set = (t: Tool) => () => st().setTool(t);
  const recent = recentSymbols().map(id => getSymbol(id, project)).filter((x): x is SymbolDef => !!x);
  const last = recent[0] ?? getSymbol('no', project);
  const placing = (id: string) => tool.kind === 'place' && (tool.symbolId === id || tool.symbolId === preferredSymbolId(id, st().symbolLibrary, project));
  const btn = (icon: string, title: string, t: Tool, on: boolean, cmd?: string) => (
    <button className={on ? 'ab-btn on' : 'ab-btn'} {...tipProps(title, undefined, cmd ? keyLabel(cmd) : undefined, icon)} aria-pressed={on} onClick={set(t)}><Icon name={icon} size={18} /></button>
  );
  return (
    <div className="active-bar" ref={ref} role="toolbar" aria-label={tx('Strumenti di disegno')}>
      {btn('select', tx('Seleziona (Esc)'), { kind: 'select' }, tool.kind === 'select')}
      {btn('wire', tx('Filo'), { kind: 'wire' }, tool.kind === 'wire' && !tool.bus && !tool.bundle, 'wire')}
      {btn('quickV', tx('Collegamento rapido in verticale'), { kind: 'quickWire', axis: 'v' }, tool.kind === 'quickWire' && tool.axis === 'v', 'quickV')}
      {btn('quickH', tx('Collegamento rapido in orizzontale'), { kind: 'quickWire', axis: 'h' }, tool.kind === 'quickWire' && tool.axis === 'h', 'quickH')}
      <span className="ab-sep" />
      {last && (
        <span className="ab-split">
          <button className={placing(last.id) ? 'ab-btn on' : 'ab-btn'} title={tx('Inserisci: {0}', tx(last.name))} onClick={set({ kind: 'place', symbolId: last.id, rot: 0 })}>
            <SymbolPreview sym={last} size={20} />
          </button>
          <button className="ab-more" title={tx('Ultimi simboli usati')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="chevronDown" size={10} /></button>
          {open && (
            <div className="ab-drop" role="menu">
              {recent.length ? recent.map(sym => (
                <button key={sym.id} role="menuitem" className={placing(sym.id) ? 'on' : ''} title={tx(sym.name)}
                  onClick={() => { setOpen(false); st().setTool({ kind: 'place', symbolId: sym.id, rot: 0 }); }}>
                  <SymbolPreview sym={sym} size={28} /><span>{tx(sym.name)}</span>
                </button>
              )) : <div className="small muted ab-empty">{tx('Gli ultimi simboli inseriti compaiono qui.')}</div>}
            </div>
          )}
        </span>
      )}
      <button className={placing('terminal') ? 'ab-btn on' : 'ab-btn'} title={tx('Morsetto')} onClick={set({ kind: 'place', symbolId: 'terminal', rot: 0 })}><Icon name="terminal" size={18} /></button>
      <button className={placing('link') ? 'ab-btn on' : 'ab-btn'} title={tx('Rimando (partenza)')} onClick={set({ kind: 'place', symbolId: 'link', rot: 0 })}><Icon name="link" size={18} /></button>
      <span className="ab-sep" />
      {btn('cable', tx('Linea di definizione cavo'), { kind: 'cable' }, tool.kind === 'cable')}
      {btn('wiredef', tx('Linea di definizione della sezione dei fili'), { kind: 'wiredef' }, tool.kind === 'wiredef')}
      {btn('zone', tx('Riquadro di luogo (+)'), { kind: 'zone' }, tool.kind === 'zone')}
      {btn('text', tx('Testo'), { kind: 'text' }, tool.kind === 'text')}
      <span className="ab-sep" />
      <button className="ab-btn ab-close" title={tx('Nascondi la barra (torna da Visualizza)')} onClick={() => st().setActiveBar(false)}><Icon name="close" size={14} /></button>
    </div>
  );
}
