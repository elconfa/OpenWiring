// Progetto vuoto (senza dipendenze dall'interfaccia: usato anche dalla riga di comando).
import type { Project } from './types';
import { DEFAULT_SETTINGS } from './types';
import { uid } from './geometry';

export function emptyProject(): Project {
  return {
    format: 'elettrocad', version: 1, auxOwnDescription: true,
    info: {
      name: 'Nuovo progetto', description: '', company: '', customer: '', author: '',
      drawingNr: '', revision: '0', date: new Date().toISOString().slice(0, 10),
    },
    settings: { ...DEFAULT_SETTINGS },
    plc: { cards: [] },
    pages: [{ id: uid('p'), name: '1', title: 'Schema', type: 'multiline', elements: [] }],
    customSymbols: [],
    parts: [],
  };
}
