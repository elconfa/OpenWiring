// Aspetto del disegno in uso (spessori, colori, giunzioni, carattere: impostazioni del progetto ▸ Aspetto).
// PageContent lo aggiorna con le impostazioni del progetto prima di disegnare la pagina, così i componenti
// del disegno lo leggono senza riceverlo come parametro; vale anche per il PDF e la stampa.
import { lookOf, type Look, type ProjectSettings } from '../model/types';

export const look: Look = lookOf(undefined);

export function applyLook(settings: Pick<ProjectSettings, 'look'> | undefined): Look {
  return Object.assign(look, lookOf(settings));
}
