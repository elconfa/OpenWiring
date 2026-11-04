// Cornice delle finestre di impostazione: finestra sopra l'app, oppure pagina dentro l'albero di
// Progetto ▸ Impostazioni del progetto (Embedded), con lo stesso contenuto.
import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type Dialog } from '../model/store';

/** Vero dentro una pagina delle impostazioni del progetto */
export const Embedded = createContext(false);

/** La finestra si mostra: aperta dal menu, o pagina delle impostazioni */
export function useDialogOpen(...names: Dialog[]): boolean {
  const open = useStore(s => names.includes(s.dialog));
  return useContext(Embedded) || open;
}

export function DialogShell({ className, label, onClose, children }: { className: string; label: string; onClose: () => void; children: ReactNode }) {
  if (useContext(Embedded)) return <div className={`settings-embed ${className}`}>{children}</div>;
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`modal ${className}`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={label}>{children}</div>
    </div>
  );
}
