// Proprietà in una finestra (doppio clic su un simbolo, un filo, un rimando, il cartiglio…): gli
// stessi campi del riquadro Proprietà. Le modifiche si vedono subito nello schema; OK le tiene come
// un solo passo da annullare (anche Invio), Annulla (o ✕, Esc) rimette il progetto com'era all'apertura.
import { useEffect } from 'react';
import { useStore } from '../model/store';
import type { Project } from '../model/types';
import type { derive } from '../model/derive';
import { getSymbol } from '../model/geometry';
import { PropertyPanel } from './PropertyPanel';
import { tx } from '../i18n/ui';

let snap: { project: Project; future: Project[]; dirty: boolean } | undefined;

/** Apre la finestra delle proprietà per la selezione attuale (o la pagina, se non c'è selezione) */
export function openPropsDialog() {
  const s = useStore.getState();
  snap = { project: s.project, future: s.future, dirty: s.dirty };
  s.setDialog('props');
}

/** Il campo che si sta scrivendo salva il valore quando perde il fuoco */
const commitField = () => (document.activeElement as HTMLElement | null)?.blur?.();

function close(keep: boolean) {
  commitField();
  const s = useStore.getState();
  if (snap && s.project !== snap.project) {
    const i = s.past.lastIndexOf(snap.project);
    if (keep) { if (i >= 0) useStore.setState({ past: [...s.past.slice(0, i), snap.project] }); }
    else useStore.setState({ project: snap.project, past: i >= 0 ? s.past.slice(0, i) : s.past, future: snap.future, dirty: snap.dirty });
  }
  snap = undefined;
  s.setDialog(null);
}

function title(): string {
  const { project, pageId, selection } = useStore.getState();
  const page = project.pages.find(p => p.id === pageId);
  const sel = page?.elements.filter(e => selection.includes(e.id)) ?? [];
  if (sel.length > 1) return tx('Proprietà di {0} elementi', sel.length);
  const e = sel[0];
  if (!e) return tx('Proprietà della pagina {0}', page?.name ?? '');
  if (e.kind === 'symbol') {
    const sym = getSymbol(e.symbolId, project);
    const name = sym ? tx(sym.name) : '';
    return e.tag ? tx('Proprietà di -{0}', e.tag) + (name ? ` · ${name}` : '') : tx('Proprietà · {0}', name);
  }
  if (e.kind === 'wire') return tx('Proprietà del collegamento');
  return tx('Proprietà');
}

export function PropsDialog({ derived }: { derived: ReturnType<typeof derive> }) {
  const open = useStore(s => s.dialog === 'props');
  // Il titolo segue la selezione (es. la sigla appena cambiata)
  useStore(s => s.project);
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      // Tasti di un'altra finestra aperta sopra (es. una domanda nata dal campo): non sono per questa
      if (t?.closest?.('.modal') && !t.closest('.props-dialog')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
      // Invio come OK, tranne dove serve per scrivere (testi su più righe) o su un pulsante, che lo usa per sé
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && !t?.closest?.('textarea,[contenteditable="true"],button')) {
        ev.preventDefault(); ev.stopPropagation(); close(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-back">
      <div className="modal props-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Proprietà')}>
        <div className="props-dialog-head">
          <h3>{title()}</h3>
          <button className="panel-pin" title={tx('Chiudi senza salvare le modifiche')} onClick={() => close(false)}>✕</button>
        </div>
        <PropertyPanel derived={derived} />
        <div className="modal-actions">
          <button onClick={() => close(false)} title={tx('Rimette le proprietà com\'erano all\'apertura')}>{tx('Annulla')}</button>
          <button className="primary" onClick={() => close(true)}>{tx('OK')}</button>
        </div>
      </div>
    </div>
  );
}
