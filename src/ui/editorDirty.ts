// Modifiche non salvate nell'editor dei simboli / del cartiglio: lo dice l'editor, lo legge
// chi porta fuori dall'editor (schede Schema / Altre viste) per chiedere conferma.
import { useStore, type State } from '../model/store';
import { askConfirm } from './Ask';
import { tx } from '../i18n/ui';

let dirty = false;
export const setEditorDirty = (v: boolean) => { dirty = v; };

/** Cambia vista; uscendo dall'editor con modifiche non salvate chiede conferma */
export async function goView(v: State['view']): Promise<void> {
  const s = useStore.getState();
  if (s.view === 'symbol' && v !== 'symbol' && dirty && !(await askConfirm(tx('Modifiche non salvate'), tx('Ci sono modifiche non salvate. Chiudere l\'editor?'), tx('Continua')))) return;
  useStore.getState().setView(v);
}
