// Aggiornamenti: all'avvio (al massimo una volta al giorno, si può spegnere) e da Aiuto ▸ Cerca
// aggiornamenti si legge l'ultima versione pubblicata su GitHub. Se è più nuova lo si dice nella
// schermata iniziale e nella Vista report, con il pulsante per scaricarla. L'app è distribuita come
// zip non firmato, quindi non si installa da sola: si scarica lo zip e si sostituisce la cartella.
import { useStore } from '../model/store';
import { openDocument } from '../io/fileio';
import { askChoice } from './Ask';
import { tx } from '../i18n/ui';

declare const __APP_VERSION__: string | undefined;

const API = 'https://api.github.com/repos/elconfa/OpenWiring/releases/latest';
export const RELEASES_PAGE = 'https://github.com/elconfa/OpenWiring/releases/latest';
const PREF_ON = 'elettrocad.updateCheck';
const PREF_LAST = 'elettrocad.updateLast';
const DAY = 24 * 3600 * 1000;

export interface UpdateInfo { version: string; url: string; download?: string; notes?: string }

/** Versione nuova trovata in questa sessione (per la schermata iniziale) */
let found: UpdateInfo | undefined;
const listeners = new Set<() => void>();
export const foundUpdate = () => found;
export function onUpdate(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); }

export const currentVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0');

/** Confronto di versioni «1.10.2» (positivo se a è più nuova di b) */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return 0;
}

export const updateCheckOn = () => { try { return localStorage.getItem(PREF_ON) !== '0'; } catch { return true; } };
export const setUpdateCheckOn = (on: boolean) => { try { if (on) localStorage.removeItem(PREF_ON); else localStorage.setItem(PREF_ON, '0'); } catch { /* preferenza non salvabile */ } };

/** Legge l'ultima versione pubblicata; 'private' se le versioni non sono pubbliche, undefined se GitHub non risponde */
export async function latestRelease(): Promise<UpdateInfo | 'private' | undefined> {
  try {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return 'private';
    if (!r.ok) return undefined;
    const j = await r.json() as { tag_name?: string; html_url?: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
    if (!j.tag_name) return undefined;
    const win = j.assets?.find(a => /-win\.zip$/i.test(a.name));
    return { version: j.tag_name.replace(/^v/, ''), url: j.html_url ?? RELEASES_PAGE, download: win?.browser_download_url, notes: j.body };
  } catch { return undefined; }
}

const isWindows = () => /Windows/i.test(navigator.userAgent);

/** Scarica la versione nuova (lo zip per Windows, altrimenti la pagina della versione) */
export function downloadUpdate(u: UpdateInfo) {
  void openDocument(isWindows() && u.download ? u.download : u.url).catch(() => window.open(u.url, '_blank', 'noopener'));
}

/**
 * Controllo degli aggiornamenti. manual = da menu: dice anche se non c'è niente di nuovo o se GitHub
 * non risponde; altrimenti è silenzioso e si fa al massimo una volta al giorno.
 */
export async function checkUpdates(manual = false): Promise<void> {
  if (!manual) {
    if (!updateCheckOn()) return;
    try {
      const last = Number(localStorage.getItem(PREF_LAST) ?? 0);
      if (Date.now() - last < DAY) return;
      localStorage.setItem(PREF_LAST, String(Date.now()));
    } catch { /* senza preferenze si controlla a ogni avvio */ }
  }
  const u = await latestRelease();
  const st = useStore.getState();
  if (!u || u === 'private') {
    if (manual) await askChoice(tx('Aggiornamenti'), u === 'private' ? tx('Le versioni non sono pubbliche su GitHub: il controllo funziona quando il progetto è pubblico.') : tx('GitHub non risponde: controlla la connessione e riprova.'), [tx('OK')]);
    return;
  }
  if (compareVersions(u.version, currentVersion()) <= 0) {
    if (manual) await askChoice(tx('Aggiornamenti'), tx('Hai già l\'ultima versione ({0}).', currentVersion()), [tx('OK')]);
    return;
  }
  found = u;
  listeners.forEach(f => f());
  st.logMsg(tx('È disponibile OpenWiring {0} (hai la {1}): Aiuto ▸ Cerca aggiornamenti per scaricarla', u.version, currentVersion()), 'warn');
  if (manual) {
    const r = await askChoice(tx('Aggiornamenti'), tx('È disponibile OpenWiring {0} (hai la {1}). Scarica lo zip, chiudi il programma e sostituisci la cartella: progetti, articoli e impostazioni restano.', u.version, currentVersion()), [tx('Scarica'), tx('Novità'), tx('Più tardi')]);
    if (r === 0) downloadUpdate(u);
    else if (r === 1) void openDocument(u.url).catch(() => window.open(u.url, '_blank', 'noopener'));
  }
}
