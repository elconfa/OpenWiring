// Menu del tasto destro dentro la finestra: dopo l'apertura il menu si misura e, se esce in basso o a
// destra, si sposta in su o a sinistra; se è più alto della finestra scorre (max-height in styles.css).

/** Da usare come ref del menu: <div className="ctx-menu" ref={fitMenu} style={{ left, top }}> */
export function fitMenu(el: HTMLElement | null): void {
  if (!el) return;
  const margin = 8;
  const r = el.getBoundingClientRect();
  const maxTop = window.innerHeight - margin - r.height;
  const maxLeft = window.innerWidth - margin - r.width;
  if (r.top > maxTop) el.style.top = `${Math.max(margin, maxTop)}px`;
  if (r.left > maxLeft) el.style.left = `${Math.max(margin, maxLeft)}px`;
}
