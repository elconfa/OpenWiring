// Scorciatoie da tastiera configurabili (Impostazioni ▸ Programma ▸ Scorciatoie da tastiera): ogni
// comando ha i suoi tasti di serie, l'utente li cambia o li toglie e la scelta resta nel computer.
// Le combinazioni si scrivono come «Mod+Maiusc+Z»: Mod è ⌘ su macOS e Ctrl su Windows e Linux.
// Restano fissi i tasti dentro gli strumenti (Esc, Invio, frecce per spostare la selezione).
import { startTerminalRow } from './terminalRowChooser';
import { useStore } from '../model/store';
import * as A from './actions';
import { tn, tx } from '../i18n/ui';
import { MAC } from './keys';

export interface Command {
  id: string;
  name: string;
  group: string;
  /** Tasti di serie (anche più di uno) */
  keys: string[];
  /** Solo nello schema */
  schema?: boolean;
  /** Esegue il comando; false = il tasto non era per questo comando (l'evento prosegue) */
  run: (shift: boolean) => void | boolean;
}

const st = () => useStore.getState();
const G_FILE = tn('File'), G_EDIT = tn('Modifica'), G_VIEW = tn('Visualizza'), G_DRAW = tn('Inserisci'), G_PROJ = tn('Progetto');

export const COMMANDS: Command[] = [
  { id: 'new', name: tn('Nuovo progetto'), group: G_FILE, keys: [], run: () => A.newProject() },
  { id: 'open', name: tn('Apri…'), group: G_FILE, keys: ['Mod+O'], run: () => void A.openProject() },
  { id: 'openAlongside', name: tn('Apri accanto…'), group: G_FILE, keys: [], run: () => void A.openProjectAlongside() },
  { id: 'save', name: tn('Salva'), group: G_FILE, keys: ['Mod+S'], run: () => void A.saveProject() },
  { id: 'saveAs', name: tn('Salva con nome…'), group: G_FILE, keys: ['Mod+Maiusc+S'], run: () => void A.saveProject(true) },
  { id: 'pdf', name: tn('Esporta PDF…'), group: G_FILE, keys: [], run: () => A.exportPdfAction() },
  { id: 'print', name: tn('Stampa…'), group: G_FILE, keys: ['Mod+P'], run: () => st().setDialog('print') },
  { id: 'undo', name: tn('Annulla##modifica'), group: G_EDIT, keys: ['Mod+Z'], run: () => st().undo() },
  { id: 'redo', name: tn('Ripeti'), group: G_EDIT, keys: ['Mod+Maiusc+Z', 'Mod+Y'], run: () => st().redo() },
  { id: 'cut', name: tn('Taglia'), group: G_EDIT, keys: ['Mod+X'], schema: true, run: () => st().cutSelection() },
  { id: 'copy', name: tn('Copia'), group: G_EDIT, keys: ['Mod+C'], schema: true, run: () => st().copySelection() },
  // Senza elementi copiati il tasto lascia arrivare l'evento «incolla»: un'immagine negli appunti va sulla pagina
  { id: 'paste', name: tn('Incolla'), group: G_EDIT, keys: ['Mod+V'], schema: true, run: () => { if (!st().clipboard) return false; st().setTool({ kind: 'paste' }); } },
  { id: 'duplicate', name: tn('Duplica'), group: G_EDIT, keys: ['Mod+D'], run: () => st().duplicateSelection() },
  { id: 'delete', name: tn('Elimina'), group: G_EDIT, keys: ['Canc', 'Backspace'], run: () => st().deleteSelection() },
  { id: 'selectAll', name: tn('Seleziona tutto'), group: G_EDIT, keys: ['Mod+A'], run: () => { const s = st(); s.setSelection(s.project.pages.find(p => p.id === s.pageId)?.elements.map(e => e.id) ?? []); } },
  { id: 'rotate', name: tn('Ruota'), group: G_EDIT, keys: ['R'], run: () => st().rotateSelection() },
  { id: 'search', name: tn('Cerca e sostituisci…'), group: G_EDIT, keys: ['Mod+F'], run: () => st().setDialog('search') },
  { id: 'palette', name: tn('Cerca un comando…'), group: G_VIEW, keys: ['Mod+K'], run: () => { const s = st(); s.setDialog(s.dialog === 'palette' ? null : 'palette'); } },
  { id: 'ribbon', name: tn('Riduci la barra multifunzione'), group: G_VIEW, keys: ['Mod+F1'], run: () => { const s = st(); if (s.uiStyle === 'classic') return false; s.setRibbonCollapsed(!s.ribbonCollapsed); } },
  { id: 'fit', name: tn('Adatta pagina'), group: G_VIEW, keys: ['F'], run: () => A.fitView() },
  { id: 'pagePrev', name: tn('Pagina precedente'), group: G_VIEW, keys: ['PagSu'], run: () => A.stepPage(-1) },
  { id: 'pageNext', name: tn('Pagina successiva'), group: G_VIEW, keys: ['PagGiù'], run: () => A.stepPage(1) },
  { id: 'wire', name: tn('Filo'), group: G_DRAW, keys: ['W'], run: () => st().setTool({ kind: 'wire' }) },
  { id: 'quickV', name: tn('Collegamento rapido in verticale'), group: G_DRAW, keys: ['V'], schema: true, run: () => st().setTool({ kind: 'quickWire', axis: 'v' }) },
  { id: 'quickH', name: tn('Collegamento rapido in orizzontale'), group: G_DRAW, keys: ['H'], schema: true, run: () => st().setTool({ kind: 'quickWire', axis: 'h' }) },
  { id: 'wireLabels', name: tn('Allinea numeri filo con una linea'), group: G_DRAW, keys: ['N'], schema: true, run: () => st().setTool({ kind: 'wireLabels' }) },
  { id: 'wireTicks', name: tn('Allinea le lineette di sezione e colore con una linea'), group: G_DRAW, keys: ['Maiusc+N'], schema: true, run: () => st().setTool({ kind: 'wireTicks' }) },
  { id: 'terminalRow', name: tn('Morsetti in fila sui fili'), group: G_DRAW, keys: ['M'], schema: true, run: () => startTerminalRow() },
  { id: 'settings', name: tn('Impostazioni del progetto…'), group: G_PROJ, keys: [], run: () => st().setDialog('settings') },
  { id: 'checks', name: tn('Verifica (controlli di progetto)'), group: G_PROJ, keys: [], run: () => A.openReport('checks') },
  { id: 'ai', name: tn('Assistente IA…'), group: G_PROJ, keys: ['Mod+I'], run: () => { const s = st(); s.setDialog(s.dialog === 'ai' ? null : 'ai'); } },
];

const PREF = 'elettrocad.shortcuts';

/** Tasti scelti dall'utente (id del comando → combinazioni; [] = nessun tasto) */
export function userKeys(): Record<string, string[]> {
  try { const v = JSON.parse(localStorage.getItem(PREF) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function setUserKeys(map: Record<string, string[]>) {
  try { if (Object.keys(map).length) localStorage.setItem(PREF, JSON.stringify(map)); else localStorage.removeItem(PREF); } catch { /* preferenza non salvabile */ }
  listeners.forEach(f => f());
}
const listeners = new Set<() => void>();
/** Avvisa quando cambiano le scorciatoie (per i menu) */
export function onKeysChange(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); }

export const keysOf = (id: string): string[] => userKeys()[id] ?? COMMANDS.find(c => c.id === id)?.keys ?? [];

/** Nomi dei tasti speciali (come li scrive event.key) */
const KEY_NAMES: Record<string, string> = { delete: 'Canc', backspace: 'Backspace', pageup: 'PagSu', pagedown: 'PagGiù', home: 'Inizio', end: 'Fine', insert: 'Ins', ' ': 'Spazio' };

/** Combinazione premuta, nella forma «Mod+Maiusc+Z»; undefined per i soli modificatori e i tasti fissi */
export function comboOf(ev: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): string | undefined {
  const k = ev.key.toLowerCase();
  if (['shift', 'control', 'meta', 'alt', 'escape', 'enter', 'tab', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'dead'].includes(k)) return undefined;
  const name = KEY_NAMES[k] ?? (/^f\d{1,2}$/.test(k) ? k.toUpperCase() : k.length === 1 ? k.toUpperCase() : ev.key);
  return [ev.metaKey || ev.ctrlKey ? 'Mod' : '', ev.altKey ? 'Alt' : '', ev.shiftKey ? 'Maiusc' : '', name].filter(Boolean).join('+');
}

/** Combinazione come si mostra nei menu: ⌘⇧Z su macOS, Ctrl+Maiusc+Z altrove */
export function showCombo(c: string): string {
  const parts = c.split('+');
  const key = parts.pop()!;
  const shown = key === 'Canc' ? tx('Canc') : key === 'PagSu' ? tx('PagSu') : key === 'PagGiù' ? tx('PagGiù') : key === 'Spazio' ? tx('Spazio') : key;
  if (MAC) return parts.map(p => (p === 'Mod' ? '⌘' : p === 'Maiusc' ? '⇧' : p === 'Alt' ? '⌥' : p)).join('') + shown;
  return [...parts.map(p => (p === 'Mod' ? 'Ctrl' : p === 'Maiusc' ? tx('Maiusc') : p)), shown].join('+');
}

/** Primo tasto del comando per i menu ('' se non ne ha) */
export const keyLabel = (id: string) => { const k = keysOf(id)[0]; return k ? showCombo(k) : ''; };

/** Comando legato alla combinazione */
export function commandFor(combo: string): Command | undefined {
  return COMMANDS.find(c => keysOf(c.id).includes(combo));
}

/** C'è una finestra (dialogo o domanda) aperta sopra lo schema */
export const modalOpen = () => typeof document !== 'undefined' && !!document.querySelector('.modal-back');

/** Gestisce un tasto premuto: true se un comando l'ha usato */
export function handleShortcut(ev: KeyboardEvent): boolean {
  const combo = comboOf(ev);
  if (!combo) return false;
  // Con una finestra aperta i tasti senza Ctrl/⌘ non agiscono sullo schema (si stava scrivendo nella finestra)
  if (!/^(Mod|Alt)\+/.test(combo) && modalOpen()) return false;
  const cmd = commandFor(combo);
  if (!cmd || (cmd.schema && st().view !== 'schema')) return false;
  if (cmd.run(ev.shiftKey) === false) return false;
  ev.preventDefault();
  return true;
}
