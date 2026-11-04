// Schermata vuota di una vista (nessun cavo, nessun morsetto…): icona, cosa manca, come si comincia
// e un pulsante «Crea il primo…» che porta subito allo strumento giusto.
import { Icon } from './icons';

/** Senza titolo, il titolo è la prima frase del testo («Nessun cavo.») e il resto la spiegazione */
export function EmptyState({ icon, title, text, action, onAction }: { icon: string; title?: string; text: string; action?: string; onAction?: () => void }) {
  if (!title) {
    const m = /^(.+?[.!。])\s+([\s\S]*)$/.exec(text);
    title = m ? m[1].replace(/[.。]$/, '') : text;
    text = m ? m[2] : '';
  }
  return (
    <div className="empty-state">
      <div className="es-icon"><Icon name={icon} size={40} /></div>
      <b>{title}</b>
      {text && <p className="small muted">{text}</p>}
      {action && onAction && <button className="primary" onClick={onAction}>{action}</button>}
    </div>
  );
}
