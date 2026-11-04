// Preferenze del programma salvate nel computer (non nel progetto): Impostazioni ▸ Programma ▸ Salvataggio.
// Lette a ogni uso, così valgono subito dopo la modifica.

const num = (key: string, def: number, min: number, max: number): number => {
  try {
    const v = localStorage.getItem(`elettrocad.${key}`);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  } catch { return def; }
};
const setNum = (key: string, v: number | undefined) => {
  try { if (v === undefined) localStorage.removeItem(`elettrocad.${key}`); else localStorage.setItem(`elettrocad.${key}`, String(v)); } catch { /* preferenza non salvabile */ }
};

/** Salvataggio automatico del file del progetto ogni n minuti (0 = spento) */
export const AUTOSAVE_DEFAULT = 0;
export const autosaveMinutes = () => num('autosaveMin', AUTOSAVE_DEFAULT, 0, 120);
export const setAutosaveMinutes = (v: number) => setNum('autosaveMin', v === AUTOSAVE_DEFAULT ? undefined : v);

/** Copie di sicurezza tenute per ogni progetto salvato (0 = nessuna) */
export const BACKUP_DEFAULT = 5;
export const backupKeep = () => num('backupKeep', BACKUP_DEFAULT, 0, 50);
export const setBackupKeep = (v: number) => setNum('backupKeep', v === BACKUP_DEFAULT ? undefined : v);

/** Schermata iniziale all'avvio (assente = sì) */
export const startScreenOn = () => { try { return localStorage.getItem('elettrocad.startScreen') !== '0'; } catch { return true; } };
export const setStartScreenOn = (on: boolean) => { try { if (on) localStorage.removeItem('elettrocad.startScreen'); else localStorage.setItem('elettrocad.startScreen', '0'); } catch { /* preferenza non salvabile */ } };

/** Progetti aperti o salvati di recente (solo app desktop: servono i percorsi dei file) */
export interface RecentProject { path: string; name: string; time: number }
const RECENT = 'elettrocad.recent';
const RECENT_MAX = 12;
export function recentProjects(): RecentProject[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]'); return Array.isArray(v) ? v.filter(r => r && typeof r.path === 'string') : []; } catch { return []; }
}
function saveRecent(list: RecentProject[]) {
  try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* preferenza non salvabile */ }
}
export function addRecent(path: string, name: string) {
  saveRecent([{ path, name, time: Date.now() }, ...recentProjects().filter(r => r.path !== path)]);
}
export function removeRecent(path: string) {
  saveRecent(recentProjects().filter(r => r.path !== path));
}

/** Programma ODA File Converter per l'export DWG (assente = cercato nelle cartelle di installazione) */
export const dwgConverter = () => { try { return localStorage.getItem('elettrocad.dwgConverter') || undefined; } catch { return undefined; } };
export const setDwgConverter = (p: string | undefined) => { try { if (p) localStorage.setItem('elettrocad.dwgConverter', p); else localStorage.removeItem('elettrocad.dwgConverter'); } catch { /* preferenza non salvabile */ } };
