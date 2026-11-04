// Menu a raggiera del tasto destro (facoltativo, come in Fusion 360; Impostazioni ▸ Programma ▸ Barra
// dei comandi): otto comandi attorno al puntatore, scelti in base a cosa è selezionato. Si sceglie con
// un clic, oppure tenendo premuto il tasto destro, spostandosi verso il comando e lasciando. Il centro
// apre il menu completo di sempre.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { Derived } from '../model/derive';
import { getSymbol } from '../model/geometry';
import { openPropsDialog } from './PropsDialog';
import { recentSymbols } from './ActiveBar';
import * as A from './actions';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

interface RItem { icon: string; label: string; run: () => void; disabled?: boolean }

/** Voci su un'ellisse (più larga che alta: le scritte stanno affiancate) */
const RX = 150, RY = 100;

export function radialItems(derived: Derived, at: { x: number; y: number }): RItem[] {
  const st = useStore.getState();
  const sel = st.selection;
  const page = st.project.pages.find(p => p.id === st.pageId);
  if (sel.length) {
    const one = sel.length === 1 ? page?.elements.find(e => e.id === sel[0]) : undefined;
    const xr = one ? derived.pages.get(st.pageId)?.xrefs.get(one.id) : undefined;
    const goTo = (id: string) => {
      const pg = st.project.pages.find(p => p.elements.some(e => e.id === id));
      if (pg) { st.setPage(pg.id); st.setSelection([id]); }
    };
    const jump = xr?.mainId ?? xr?.contacts?.[0]?.id;
    return [
      { icon: 'rotate', label: tx('Ruota'), run: () => st.rotateSelection() },
      { icon: 'props', label: tx('Proprietà'), run: openPropsDialog },
      { icon: 'copy', label: tx('Copia'), run: () => st.copySelection() },
      { icon: 'mirror', label: tx('Specchia'), run: () => st.mirrorSelection() },
      { icon: 'delete', label: tx('Elimina'), run: () => st.deleteSelection() },
      { icon: 'link', label: xr?.mainId ? tx('Vai all\'elemento principale') : tx('Vai al contatto'), run: () => { if (jump) goTo(jump); }, disabled: !jump },
      { icon: 'duplicate', label: tx('Duplica'), run: () => st.duplicateSelection() },
      { icon: 'cut', label: tx('Taglia'), run: () => st.cutSelection() },
    ];
  }
  const last = recentSymbols().map(id => getSymbol(id, st.project)).find(Boolean);
  return [
    { icon: 'wire', label: tx('Filo'), run: () => st.setTool({ kind: 'wire' }) },
    { icon: 'paste', label: tx('Incolla qui'), run: () => st.paste(at), disabled: !st.clipboard },
    { icon: 'contact', label: last ? tx(last.name) : tx('Simboli'), run: () => { if (last) st.setTool({ kind: 'place', symbolId: last.id, rot: 0 }); }, disabled: !last },
    { icon: 'terminal', label: tx('Morsetto'), run: () => st.setTool({ kind: 'place', symbolId: 'terminal', rot: 0 }) },
    { icon: 'fit', label: tx('Adatta'), run: A.fitView },
    { icon: 'text', label: tx('Testo'), run: () => st.setTool({ kind: 'text' }) },
    { icon: 'selectAll', label: tx('Seleziona tutto'), run: () => st.setSelection(page?.elements.map(e => e.id) ?? []) },
    { icon: 'search', label: tx('Cerca un comando…'), run: () => st.setDialog('palette') },
  ];
}

export function RadialMenu({ cx, cy, items, onClose, onFull }: { cx: number; cy: number; items: RItem[]; onClose: () => void; onFull: () => void }) {
  const [hot, setHot] = useState<number | null>(null);
  const hotRef = useRef<number | null>(null);
  hotRef.current = hot;
  // Il menu resta dentro la finestra
  const x = Math.max(RX + 70, Math.min(window.innerWidth - RX - 70, cx));
  const y = Math.max(RY + 30, Math.min(window.innerHeight - RY - 30, cy));
  const run = (i: number) => { const it = items[i]; if (!it || it.disabled) return; onClose(); it.run(); };
  useEffect(() => {
    const t0 = Date.now();
    // Direzione del puntatore: il comando nello spicchio verso cui ci si sposta
    const move = (e: MouseEvent) => {
      const dx = e.clientX - x, dy = e.clientY - y;
      if (Math.hypot(dx, dy) < 26) { setHot(null); return; }
      const a = (Math.atan2(dy / RY, dx / RX) + Math.PI / 2 + Math.PI * 2 + Math.PI / items.length) % (Math.PI * 2);
      setHot(Math.floor(a / (Math.PI * 2 / items.length)));
    };
    // Tasto destro tenuto premuto e lasciato su un comando (gesto veloce)
    const up = (e: MouseEvent) => { if (e.button === 2 && Date.now() - t0 > 250 && hotRef.current !== null) run(hotRef.current); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', key); };
  });
  return (
    <div className="radial-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={e => e.preventDefault()}>
      <div className="radial" style={{ left: x, top: y }}>
        <svg className="radial-ring" width={RX * 2 + 40} height={RY * 2 + 40} viewBox={`${-RX - 20} ${-RY - 20} ${RX * 2 + 40} ${RY * 2 + 40}`}>
          <ellipse rx={RX - 30} ry={RY - 20} className="rr-track" />
          {hot !== null && (() => {
            const a = (hot / items.length) * Math.PI * 2 - Math.PI / 2;
            return <line x1={Math.cos(a) * 24} y1={Math.sin(a) * 24} x2={Math.cos(a) * (RX - 60)} y2={Math.sin(a) * (RY - 30)} className="rr-ray" />;
          })()}
        </svg>
        <button className="radial-center" title={tx('Menu completo')} onClick={onFull}><Icon name="more" size={18} /></button>
        {items.map((it, i) => {
          const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button key={i} className={`radial-item${hot === i ? ' hot' : ''}`} disabled={it.disabled}
              style={{ left: Math.cos(a) * RX, top: Math.sin(a) * RY }} onMouseEnter={() => setHot(i)} onClick={() => run(i)}>
              <Icon name={it.icon} size={16} /><span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
