// Profili di impostazioni: una parte delle impostazioni del progetto (le pagine
// scelte dell'albero delle impostazioni, più il cartiglio) salvata con un nome nella libreria personale,
// da applicare a un progetto con un clic, da usare per i progetti nuovi e da scambiare come file
// .ecadprofile. Il progetto riceve una copia: cambiare il profilo dopo non cambia i progetti.
import type { Project, ProjectSettings, TitleBlock, TitleBlockTemplate } from './types';
import { DEFAULT_SETTINGS } from './types';
import { settingsOf } from './numbering';
import { tn } from '../i18n/ui';

/** Parte di un profilo: le impostazioni di una pagina dell'albero (o il cartiglio, che non è in settings) */
export interface SettingsPart { id: string; name: string; keys: (keyof ProjectSettings)[] }

export const SETTINGS_PARTS: SettingsPart[] = [
  { id: 'titleBlock', name: tn('Cartiglio (modello, logo, indirizzo, campi)'), keys: [] },
  { id: 'sheet', name: tn('Formato del foglio, cornice, colonne e righe'), keys: ['sheet'] },
  { id: 'revisions', name: tn('Revisioni'), keys: ['revisionFormat', 'revisionPageNo', 'showRevisionClouds'] },
  { id: 'tags', name: tn('Sigle dispositivi'), keys: ['tagFormat', 'tagScope', 'contactImage'] },
  { id: 'wires', name: tn('Numeri filo'), keys: ['showWireNumbers', 'wireNoMinLength', 'showWireData', 'drawWireColors', 'wireNumbering', 'wireFormat', 'wireScope', 'wireReserve', 'wireOrder', 'wireKeepPotentialNames', 'wirePlcNames'] },
  { id: 'texts', name: tn('Testi'), keys: ['textStyles'] },
  { id: 'look', name: tn('Linee, colori e giunzioni'), keys: ['look'] },
  { id: 'drawing', name: tn('Disegno e collegamenti'), keys: ['showDeviceTexts', 'grid', 'terminalText', 'connectorFrames', 'freeSymbolTexts', 'autoConnect', 'plcAddressFormat'] },
  { id: 'fixed', name: tn('Posizioni fisse'), keys: ['railTop', 'railBottom', 'plcRow'] },
  { id: 'cover', name: tn('Copertina'), keys: ['cover'] },
  { id: 'cableStyle', name: tn('Cavi'), keys: ['cableStyle'] },
  { id: 'zoneStyle', name: tn('Riquadri di luogo'), keys: ['zoneStyle'] },
  { id: 'listStyle', name: tn('Stile di liste, morsettiere e disegni'), keys: ['stripStyle', 'drawingStyles', 'listTextScale'] },
  { id: 'lists', name: tn('Pagine di lista'), keys: ['reportPages', 'autoReportPages', 'reportBlocks', 'reportBlocksAt', 'pageArrangement', 'reportStyles', 'customLists'] },
];

export const partKeys = (id: string) => SETTINGS_PARTS.find(p => p.id === id)?.keys ?? [];

/** Nomi delle impostazioni per l'elenco delle differenze */
const KEY_NAMES: Partial<Record<keyof ProjectSettings, string>> = {
  revisionFormat: tn('Formato dell\'indice di revisione'), revisionPageNo: tn('Pagine inserite in revisione'), showRevisionClouds: tn('Nuvolette sulle modifiche'),
  tagFormat: tn('Modello della sigla'), tagScope: tn('Contatore delle sigle'), contactImage: tn('Contatti delle bobine'),
  showWireNumbers: tn('Numeri filo mostrati'), wireNoMinLength: tn('Niente numero sui fili corti'), showWireData: tn('Sezione e colore'), drawWireColors: tn('Fili colorati'), wireNumbering: tn('Numerazione dei fili'),
  wireFormat: tn('Modello del numero filo'), wireScope: tn('Contatore dei fili'), wireReserve: tn('Numeri di riserva per pagina'), wireOrder: tn('Ordine dei fili sulla pagina'), wireKeepPotentialNames: tn('Potenziali (L1, N, PE)'), wirePlcNames: tn('Fili del PLC: nome dall\'indirizzo'),
  textStyles: tn('Colore e altezza dei testi'), sheet: tn('Formato del foglio'), look: tn('Spessori, colori, giunzioni e carattere'),
  showDeviceTexts: tn('Descrizioni sullo schema'), grid: tn('Passo griglia'), terminalText: tn('Testi dei morsetti'), connectorFrames: tn('Riquadri dei connettori'),
  freeSymbolTexts: tn('Testi dei simboli spostabili'), autoConnect: tn('Collegamento automatico'), plcAddressFormat: tn('Formato degli indirizzi PLC'),
  railTop: tn('Fili in alto'), railBottom: tn('Fili in basso'), plcRow: tn('Riga fissa dei punti I/O PLC'),
  reportPages: tn('Liste come pagine'), autoReportPages: tn('Pagine di lista automatiche'), reportBlocks: tn('Liste divise per quadro'), reportBlocksAt: tn('Posto delle liste per quadro'), pageArrangement: tn('Ordine e prefissi delle pagine generate'), reportStyles: tn('Impaginazione delle liste'), customLists: tn('Liste personalizzate'),
  cover: tn('Copertina'), cableStyle: tn('Stile dei cavi'), zoneStyle: tn('Riquadri di luogo'), stripStyle: tn('Stile delle morsettiere'), drawingStyles: tn('Stile dei disegni'), listTextScale: tn('Scala dei testi delle liste'),
};
export const keyName = (k: keyof ProjectSettings) => KEY_NAMES[k] ?? k;

export interface SettingsProfile {
  id: string;
  name: string;
  description?: string;
  /** Parti contenute (id di SETTINGS_PARTS) */
  parts: string[];
  /** Valori delle impostazioni delle parti; una chiave assente = valore predefinito */
  settings: Partial<ProjectSettings>;
  /** Cartiglio del progetto e, se non è uno di quelli inclusi, il suo modello */
  titleBlock?: { block: TitleBlock; template?: TitleBlockTemplate };
  /** Profilo usato per i progetti nuovi */
  isDefault?: boolean;
  /** Applicandolo, le sue parti restano bloccate nel progetto (sblocco con la password, se c'è) */
  lock?: { salt?: string; pass?: string };
  date: string;
}

const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));
const uid = () => `pr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Profilo con le parti scelte, preso dal progetto */
export function makeProfile(project: Project, name: string, parts: string[], description?: string, lock?: SettingsProfile['lock']): SettingsProfile {
  const s = project.settings ?? DEFAULT_SETTINGS;
  const settings: Partial<ProjectSettings> = {};
  for (const id of parts) for (const k of partKeys(id)) if (s[k] !== undefined) (settings as Record<string, unknown>)[k] = clone(s[k]);
  const out: SettingsProfile = { id: uid(), name, parts: [...parts], settings, date: new Date().toISOString().slice(0, 10) };
  if (description) out.description = description;
  if (lock) out.lock = lock;
  if (parts.includes('titleBlock')) {
    const block = clone(project.titleBlock ?? {});
    const template = block.templateId ? (project.titleBlockTemplates ?? []).find(t => t.id === block.templateId) : undefined;
    out.titleBlock = { block, template: clone(template) };
  }
  return out;
}

/** Applica al progetto (dentro un commit) le parti indicate del profilo (assenti = tutte quelle del profilo) */
export function applyProfile(project: Project, profile: SettingsProfile, parts = profile.parts): void {
  const use = parts.filter(id => profile.parts.includes(id));
  const s = { ...(project.settings ?? DEFAULT_SETTINGS) } as Record<string, unknown>;
  for (const id of use) {
    for (const k of partKeys(id)) {
      const v = profile.settings[k] ?? DEFAULT_SETTINGS[k];
      if (v === undefined) delete s[k]; else s[k] = clone(v);
    }
  }
  // Profilo con il blocco: le sue parti restano bloccate (anche quelle non applicate ora)
  if (profile.lock) s.locks = { profile: profile.name, parts: [...profile.parts], ...profile.lock };
  project.settings = s as unknown as ProjectSettings;
  if (use.includes('titleBlock') && profile.titleBlock) {
    const t = profile.titleBlock.template;
    if (t && !(project.titleBlockTemplates ?? []).some(x => x.id === t.id)) project.titleBlockTemplates = [...(project.titleBlockTemplates ?? []), clone(t)];
    project.titleBlock = clone(profile.titleBlock.block);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Valore leggibile di un'impostazione (gli oggetti diventano «personalizzato» o «predefinito») */
function show(v: unknown): string {
  if (v === undefined || v === null) return tn('predefinito');
  if (typeof v === 'boolean') return v ? tn('sì') : tn('no');
  if (typeof v === 'object') return Array.isArray(v) ? v.join(', ') : tn('personalizzato');
  return String(v);
}

export interface ProfileChange { part: string; what: string; from: string; to: string }

/** Cosa cambierebbe nel progetto applicando le parti indicate del profilo */
export function profileChanges(project: Project, profile: SettingsProfile, parts = profile.parts): ProfileChange[] {
  const cur = settingsOf(project);
  const out: ProfileChange[] = [];
  for (const id of parts.filter(x => profile.parts.includes(x))) {
    for (const k of partKeys(id)) {
      const to = profile.settings[k] ?? DEFAULT_SETTINGS[k];
      const from = cur[k] ?? DEFAULT_SETTINGS[k];
      if (!same(from, to)) out.push({ part: id, what: keyName(k), from: show(from), to: show(to) });
    }
    if (id === 'titleBlock' && profile.titleBlock && !same(project.titleBlock ?? {}, profile.titleBlock.block)) {
      out.push({ part: id, what: tn('Cartiglio'), from: project.titleBlock?.templateId ?? 'standard', to: profile.titleBlock.template?.name ?? profile.titleBlock.block.templateId ?? 'standard' });
    }
  }
  return out;
}

/** Parti bloccate nel progetto (vuoto se nessun profilo le blocca) */
export function lockedParts(project: Project): string[] {
  return project.settings?.locks?.parts ?? [];
}

/** Impostazioni bloccate nel progetto */
export function lockedKeys(project: Project): Set<keyof ProjectSettings> {
  return new Set(lockedParts(project).flatMap(partKeys));
}

/** Parti del profilo che si possono applicare al progetto: quelle bloccate solo se il blocco è dello stesso profilo */
export function applicableParts(project: Project, profile: SettingsProfile, parts = profile.parts): string[] {
  const lock = project.settings?.locks;
  return parts.filter(id => !lock || lock.profile === profile.name || !lock.parts.includes(id));
}

/** Hash della password di sblocco */
export async function hashPassword(salt: string, password: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Blocco con la password indicata (vuota = senza password) */
export async function makeLock(password: string): Promise<NonNullable<SettingsProfile['lock']>> {
  if (!password) return {};
  const salt = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  return { salt, pass: await hashPassword(salt, password) };
}

/** La password sblocca il blocco del progetto */
export async function unlockOk(lock: { salt?: string; pass?: string }, password: string): Promise<boolean> {
  return !lock.pass || (await hashPassword(lock.salt ?? '', password)) === lock.pass;
}

const FORMAT = 'elettrocad-profile';

/** File .ecadprofile */
export function serializeProfile(p: SettingsProfile): string {
  const { isDefault: _d, ...rest } = p;
  return JSON.stringify({ format: FORMAT, version: 1, profile: rest }, null, 2) + '\n';
}

/** Legge un file .ecadprofile (con un id nuovo); undefined se non è un profilo */
export function parseProfile(text: string): SettingsProfile | undefined {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return undefined; }
  const o = raw as { format?: string; profile?: Partial<SettingsProfile> };
  const p = o?.format === FORMAT ? o.profile : undefined;
  if (!p || typeof p.name !== 'string' || !Array.isArray(p.parts) || typeof p.settings !== 'object' || !p.settings) return undefined;
  const parts = p.parts.filter((x): x is string => typeof x === 'string' && SETTINGS_PARTS.some(s => s.id === x));
  // Solo le chiavi delle parti dichiarate
  const allowed = new Set(parts.flatMap(partKeys));
  const settings = Object.fromEntries(Object.entries(p.settings).filter(([k]) => allowed.has(k as keyof ProjectSettings))) as Partial<ProjectSettings>;
  const out: SettingsProfile = { id: uid(), name: p.name.trim() || 'Profilo', parts, settings, date: typeof p.date === 'string' ? p.date : new Date().toISOString().slice(0, 10) };
  if (typeof p.description === 'string' && p.description) out.description = p.description;
  if (parts.includes('titleBlock') && p.titleBlock && typeof p.titleBlock === 'object' && p.titleBlock.block) out.titleBlock = p.titleBlock;
  if (p.lock && typeof p.lock === 'object') {
    const { salt, pass } = p.lock;
    out.lock = typeof pass === 'string' && typeof salt === 'string' ? { salt, pass } : {};
  }
  return out;
}
