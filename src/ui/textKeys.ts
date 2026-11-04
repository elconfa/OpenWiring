// Tasti di testo: con del testo selezionato fuori dallo schema (es. nella Vista report) Ctrl+C
// copia quel testo invece degli elementi dello schema.
/** Ctrl+C / Ctrl+X con del testo selezionato, Ctrl+A nella Vista report: lavoro del browser, non dello schema */
export function textKey(ev: KeyboardEvent): boolean {
  if (!(ev.metaKey || ev.ctrlKey)) return false;
  const k = ev.key.toLowerCase();
  const doc = (ev.target as Node | null)?.ownerDocument ?? document;
  const sel = doc.getSelection();
  if ((k === 'c' || k === 'x') && sel && !sel.isCollapsed && sel.toString().trim()) return true;
  const log = (ev.target as HTMLElement | null)?.closest?.('.log');
  if (k === 'a' && log && sel) { ev.preventDefault(); sel.selectAllChildren(log); return true; }
  return false;
}
