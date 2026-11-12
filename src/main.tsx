import { createRoot } from 'react-dom/client';
import wasmUrl from '7z-wasm/7zz.wasm?url';
import { setSevenZipWasmUrl } from './io/edz';
import { App } from './App';
import { useStore } from './model/store';
import { installModalDrag } from './ui/dragModals';
import { installSuggestLists } from './ui/suggestLists';
import { tx } from './i18n/ui';
import './styles.css';

setSevenZipWasmUrl(wasmUrl);
installModalDrag(document);
installSuggestLists(document);
// Errori non gestiti (azioni asincrone fuori da un try): finiscono nella Vista report invece di sparire
const reportError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ResizeObserver loop/.test(msg)) return; // avviso innocuo del browser
  useStore.getState().logMsg(tx('Errore: {0}', msg), 'error');
};
window.addEventListener('unhandledrejection', ev => reportError(ev.reason));
window.addEventListener('error', ev => reportError(ev.error ?? ev.message));
// Foto del manuale (scripts/manual-shots.cjs): lo script comanda l'app tramite lo stato e le azioni
if (new URLSearchParams(location.search).has('shots')) {
  void Promise.all([import('./model/store'), import('./ui/actions'), import('./model/example'), import('./model/symbols'), import('./model/titleBlocks'), import('./io/edz'), import('./i18n/ui'), import('./model/i18n'), import('./ui/bundleChooser'), import('./ui/pasteChooser')]).then(([s, a, ex, sy, tb, edz, i18n, lang, bc, pc]) => {
    (window as unknown as Record<string, unknown>).__ecad = { useStore: s.useStore, actions: a, store: s, example: ex, symbols: sy, titleBlocks: tb, edz, tx: i18n.tx, translateText: lang.translateText, bundleChooser: bc, pasteChooser: pc };
  });
}
// Cambiando la lingua dell'interfaccia l'app si ridisegna da capo (il progetto resta)
function Root() {
  const lang = useStore(s => s.uiLang);
  return <App key={lang} />;
}
document.documentElement.lang = useStore.getState().uiLang;
createRoot(document.getElementById('root')!).render(<Root />);
