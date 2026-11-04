// Finestre (popup) spostabili: si trascinano per il titolo. Vale per tutte le finestre .modal
// dell'interfaccia, anche nelle finestre staccate dei riquadri (vedi detach.tsx).
const HANDLE = '.props-dialog-head, h3';

/** Da chiamare una volta per documento (la finestra principale e ogni finestra staccata) */
export function installModalDrag(doc: Document) {
  doc.addEventListener('mousedown', ev => {
    const t = ev.target as HTMLElement | null;
    if (ev.button !== 0 || !t?.closest || t.closest('button, input, select, textarea, a')) return;
    const handle = t.closest('.props-dialog-head') ?? t.closest('h3');
    const modal = handle?.closest('.modal') as HTMLElement | null;
    // Solo il titolo della finestra (il primo), non i titoletti delle sezioni
    if (!handle || !modal || modal.querySelector(HANDLE) !== handle) return;
    ev.preventDefault();
    const [x0, y0] = (modal.dataset.drag ?? '0 0').split(' ').map(Number);
    const sx = ev.clientX, sy = ev.clientY;
    const win = doc.defaultView!;
    const r0 = modal.getBoundingClientRect();
    const move = (e: MouseEvent) => {
      // Il titolo resta sempre dentro la finestra, così la si può riprendere
      const dx = Math.max(-r0.left - r0.width + 80, Math.min(win.innerWidth - r0.left - 80, e.clientX - sx));
      const dy = Math.max(-r0.top, Math.min(win.innerHeight - r0.top - 30, e.clientY - sy));
      modal.dataset.drag = `${x0 + dx} ${y0 + dy}`;
      modal.style.translate = `${x0 + dx}px ${y0 + dy}px`;
    };
    const up = () => {
      win.removeEventListener('mousemove', move, true);
      win.removeEventListener('mouseup', up, true);
      doc.body.classList.remove('dragging-modal');
    };
    doc.body.classList.add('dragging-modal');
    win.addEventListener('mousemove', move, true);
    win.addEventListener('mouseup', up, true);
  }, true);
}
