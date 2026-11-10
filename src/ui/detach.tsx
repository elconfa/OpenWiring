// Riquadri in una finestra propria (⧉ sul titolo, o Visualizza ▸ Riquadri): la finestra si porta
// dove si vuole, anche sul secondo monitor, e riapre nello stesso punto la volta dopo. Il riquadro
// resta lo stesso componente dell'app (stessi dati, aggiornati subito): è disegnato nella finestra
// nuova con un portale di React. Chiudendo la finestra il riquadro torna al suo posto.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePanelStore, type BoxId } from './panels';
import { installModalDrag } from './dragModals';
import { installSuggestLists } from './suggestLists';
import { tx } from '../i18n/ui';
import { textKey } from './textKeys';

/** Copia nella finestra i fogli di stile e il tema della finestra principale */
function syncLook(d: Document) {
  d.head.querySelectorAll('[data-ecad-style]').forEach(n => n.remove());
  document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(n => {
    const c = n.cloneNode(true) as HTMLElement;
    if (n instanceof HTMLLinkElement) (c as HTMLLinkElement).href = n.href;
    c.dataset.ecadStyle = '';
    d.head.appendChild(c);
  });
  const src = document.documentElement, dst = d.documentElement;
  for (const a of ['data-theme', 'lang']) {
    const v = src.getAttribute(a);
    if (v === null) dst.removeAttribute(a); else dst.setAttribute(a, v);
  }
}

export function DetachedPanel({ id, title, children }: { id: BoxId; title: string; children: ReactNode }) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const P = usePanelStore.getState();
    const b = P.layout.bounds[id];
    // La prima volta le finestre si aprono sfalsate, a destra della finestra principale
    const n = ['tree', 'props', 'right', 'log'].indexOf(id);
    const [ww, wh] = id === 'log' ? [900, 260] : [380, 720];
    const feat = b ? `left=${b.x},top=${b.y},width=${b.w},height=${b.h}`
      : `left=${window.screenX + Math.max(0, window.outerWidth - ww - 60 - n * 40)},top=${window.screenY + 80 + n * 40},width=${ww},height=${wh}`;
    const w = window.open('', `ecad-panel-${id}`, feat);
    if (!w) { P.setDetached(id, false); return; }
    const d = w.document;
    // Una finestra rimasta aperta da prima (stesso nome) si ripulisce
    d.head.innerHTML = '<meta charset="utf-8">';
    d.body.innerHTML = '';
    d.title = `${title} · OpenWiring`;
    syncLook(d);
    d.body.className = 'detached-body';
    const root = d.createElement('div');
    root.className = 'detached-panel';
    d.body.appendChild(root);
    installModalDrag(d);
    installSuggestLists(d);
    // Tema cambiato o stili aggiunti (sviluppo): si ricopiano
    const mo = new MutationObserver(() => syncLook(d));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
    mo.observe(document.head, { childList: true });
    let last = '';
    const save = () => {
      if (w.closed) return;
      const nb = { x: w.screenX, y: w.screenY, w: w.innerWidth, h: w.innerHeight };
      const k = JSON.stringify(nb);
      if (k !== last && nb.w > 0) { last = k; usePanelStore.getState().setBounds(id, nb); }
    };
    // Le finestre non avvisano quando si spostano: la posizione si controlla ogni tanto
    const timer = window.setInterval(save, 1000);
    let closing = false;
    // Chiusa con la ✕ della finestra: il riquadro torna nella finestra principale
    const onClose = () => { if (!closing) { save(); usePanelStore.getState().setDetached(id, false); } };
    w.addEventListener('pagehide', onClose);
    // I tasti dello schema (Canc, R, Ctrl+Z…) agiscono anche dalla finestra staccata
    const forward = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('input,textarea,select,[contenteditable="true"]') || textKey(ev)) return;
      const copy = new KeyboardEvent('keydown', { key: ev.key, code: ev.code, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey, altKey: ev.altKey, bubbles: true, cancelable: true });
      document.body.dispatchEvent(copy);
      if (copy.defaultPrevented) ev.preventDefault();
    };
    w.addEventListener('keydown', forward);
    setBox(root);
    return () => {
      closing = true;
      save();
      window.clearInterval(timer);
      mo.disconnect();
      setBox(null);
      w.close();
    };
  }, [id, title]);
  if (!box) return null;
  return createPortal(
    <>
      <div className="panel-title">
        {title}
        <button className="panel-pin" onClick={() => usePanelStore.getState().setDetached(id, false)}
          title={tx('Rimetti il riquadro nella finestra principale')}>⇱</button>
      </div>
      {children}
    </>,
    box,
  );
}
