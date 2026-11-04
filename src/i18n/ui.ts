// Lingua dell'interfaccia (menu, finestre, messaggi): italiano, inglese, francese, tedesco, spagnolo, russo.
// I testi si scrivono in italiano nel codice con tx('…'); i cataloghi ui.<lingua>.json li traducono.
// I segnaposto {0}, {1}… ricevono i valori passati dopo il testo. Un testo senza traduzione resta in
// italiano. La lingua degli schemi e dei documenti è un'altra impostazione (vedi model/i18n.ts).
import en from './ui.en.json';
import fr from './ui.fr.json';
import de from './ui.de.json';
import es from './ui.es.json';
import ru from './ui.ru.json';

export type UiLang = 'it' | 'en' | 'fr' | 'de' | 'es' | 'ru';

export const UI_LANGS: { id: UiLang; name: string }[] = [
  { id: 'it', name: 'Italiano' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es', name: 'Español' },
  { id: 'ru', name: 'Русский' },
];

const CATALOGS: Record<Exclude<UiLang, 'it'>, Record<string, string>> = { en, fr, de, es, ru };
const KEY = 'elettrocad.uiLang';

function initial(): UiLang {
  // Test automatici: sempre in italiano
  if (typeof process !== 'undefined' && process.env?.VITEST) return 'it';
  try {
    const v = localStorage.getItem(KEY) as UiLang | null;
    if (v && UI_LANGS.some(l => l.id === v)) return v;
  } catch { /* preferenza non disponibile */ }
  // Al primo avvio la lingua del sistema, se è una di quelle disponibili
  const sys = (typeof navigator !== 'undefined' ? navigator.language : 'it').slice(0, 2) as UiLang;
  return UI_LANGS.some(l => l.id === sys) ? sys : 'it';
}

let lang: UiLang = initial();

export const uiLang = () => lang;

/** Cambia la lingua (l'app si ridisegna: vedi store.setUiLang) */
export function setUiLang(l: UiLang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* preferenza non salvabile */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** Testi senza traduzione visti durante l'uso (per i controlli nel browser) */
export const missing = new Set<string>();

/** Testo tradotto nella lingua dell'interfaccia; {0}, {1}… sono sostituiti dagli argomenti */
export function tx(s: string, ...args: (string | number | undefined | null)[]): string {
  // "testo##contesto": stesso testo italiano con significati diversi (es. Annulla = annulla l'ultima modifica)
  let out = s.includes('##') ? s.slice(0, s.indexOf('##')) : s;
  if (lang !== 'it') {
    const v = CATALOGS[lang][s];
    if (v) out = v; else missing.add(s);
  }
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => (args[+i] ?? '') + '') : out;
}

/** Nome della lingua dell'interfaccia in italiano, per le istruzioni agli assistenti IA */
export const UI_LANG_NAME_IT: Record<UiLang, string> = { it: 'italiano', en: 'inglese', fr: 'francese', de: 'tedesco', es: 'spagnolo', ru: 'russo' };

/** Segna un testo da tradurre che si mostra più avanti con tx(valore) (es. elenchi di voci) */
export const tn = (s: string) => s;
