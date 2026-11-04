// Accesso ai file: in Electron usa i dialoghi nativi, nel browser input/download.
import type { Part, Project } from '../model/types';
import { DEFAULT_SETTINGS } from '../model/types';

export interface Filter { name: string; extensions: string[] }
/** Tipi di cartella dei dialoghi: progetti, file da importare, file esportati */
export type FolderKind = 'projects' | 'import' | 'export';
/** big: archivio troppo grande per leggerlo in memoria (data vuoto, si estrae con edzOpen) */
export interface OpenedFile { name: string; path?: string; data: Uint8Array; size?: number; big?: boolean }

interface ElettroBridge {
  openFile(filters: Filter[], multi: boolean): Promise<OpenedFile[]>;
  readProject?(file: string): Promise<OpenedFile | null>;
  scanProjects?(dir: string): Promise<string[]>;
  dwgFind?(): Promise<string | null>;
  dwgExport?(conv: string | undefined, files: { name: string; data: string }[], name: string, single: boolean): Promise<{ path?: string; count?: number; canceled?: boolean; error?: string }>;
  saveFile(defaultName: string, data: Uint8Array, filters: Filter[], path?: string, backupKeep?: number): Promise<string | undefined>;
  saveFolder?(folderName: string, files: { name: string; data: Uint8Array }[]): Promise<string | undefined>;
  choosePaths?(filters: Filter[]): Promise<string[]>;
  openPath?(target: string): Promise<string>;
  readDoc?(file: string): Promise<Uint8Array | undefined>;
  readMacro?(from: string, ref: string): Promise<{ name: string; data: Uint8Array } | null>;
  foldersGet?(): Promise<{ defaults: Partial<Record<FolderKind, string>>; last: Partial<Record<FolderKind, string>>; documents: string }>;
  foldersSet?(kind: FolderKind, dir: string | null): Promise<boolean>;
  foldersChoose?(kind: FolderKind): Promise<string | null>;
  symbolsFolder?(): Promise<{ name: string; files: { rel: string; text: string }[] } | null>;
  symlibRead?(): Promise<{ dir: string; files: { rel: string; text: string }[] }>;
  symlibWrite?(files: { rel: string; text: string }[], removes: string[]): Promise<boolean>;
  symlibOpen?(): Promise<void>;
  symlibChoose?(): Promise<string | null>;
  onSymlibChanged?(cb: () => void): () => void;
  onCloseRequest?(cb: () => void): () => void;
  confirmClose?(): void;
  cancelClose?(): void;
  edzOpen?(archive: string, opts?: { pictures?: boolean; symbols?: boolean }): Promise<{ id: string; files: { path: string; size: number }[]; all: string[] }>;
  edzRead?(id: string, paths: string[]): Promise<{ path: string; data: Uint8Array }[]>;
  edzClose?(id: string): Promise<void>;
  partsList?(): Promise<{ file: string; parts: Part[] }>;
  partsPut?(parts: Part[]): Promise<Part[]>;
  partsRemove?(partNrs: string[]): Promise<number>;
  partsGet?(partNrs: string[], pictures: boolean): Promise<Part[]>;
  partsSearch?(q: string, limit?: number): Promise<string[]>;
  partsOpen?(): Promise<void>;
  partsExport?(partNrs: string[], name: string): Promise<{ file: string; count: number } | null>;
  partsImport?(): Promise<{ file: string; added: number; replaced: number; parts: Part[] } | null>;
  aiHttp?(req: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; text: string }>;
  aiCli?(req: { id: string; provider: string; model?: string; configDir?: string; system: string; prompt: string }): Promise<{ text: string; cost?: number }>;
  aiCliCheck?(req: { provider: string; configDir?: string }): Promise<{ ok: boolean; version?: string; error?: string }>;
  aiCancel?(id: string): Promise<void>;
  encrypt?(text: string): Promise<string | null>;
  decrypt?(data: string): Promise<string | null>;
  titleBar?(colors: { color: string; symbol: string; height: number }): void;
}

declare global { interface Window { elettro?: ElettroBridge } }

export const isElectron = () => !!window.elettro;

export async function openFiles(filters: Filter[], multi = false): Promise<OpenedFile[]> {
  if (window.elettro) return window.elettro.openFile(filters, multi);
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multi;
    input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',');
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      resolve(await Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.click();
  });
}

/** Cartella con le sottocartelle: i file di simboli con il percorso relativo (null = annullato) */
export async function openSymbolFolder(): Promise<{ name: string; files: { rel: string; text: string }[] } | null> {
  if (window.elettro?.symbolsFolder) return window.elettro.symbolsFolder();
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = async () => {
      const all = Array.from(input.files ?? []);
      const name = all[0]?.webkitRelativePath.split('/')[0] ?? '';
      const files = all.map(f => ({ f, rel: f.webkitRelativePath.split('/').slice(1).join('/') }))
        .filter(x => /\.(elmt|qet|ecsym)$/i.test(x.rel) || /(^|\/)qet_directory$/.test(x.rel));
      resolve(all.length ? { name, files: await Promise.all(files.map(async x => ({ rel: x.rel, text: await x.f.text() }))) } : null);
    };
    input.click();
  });
}

/** backupKeep: nell'app desktop, copie di sicurezza da tenere del progetto che si sovrascrive (vedi main.cjs) */
export async function saveFile(defaultName: string, data: Uint8Array | string, filters: Filter[], path?: string, backupKeep?: number): Promise<string | undefined> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (window.elettro) return window.elettro.saveFile(defaultName, bytes, filters, path, backupKeep);
  const blob = new Blob([bytes as BlobPart]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return defaultName;
}

/**
 * Salva più file in una cartella nuova (app desktop: si sceglie dove crearla). Nel browser i file
 * si scaricano uno per uno con il nome della cartella davanti.
 */
export async function saveFolder(folderName: string, files: { name: string; data: Uint8Array | string }[]): Promise<string | undefined> {
  const list = files.map(f => ({ name: f.name, data: typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data }));
  if (window.elettro?.saveFolder) return window.elettro.saveFolder(folderName, list);
  for (const f of list) await saveFile(`${folderName}_${f.name}`, f.data, []);
  return folderName;
}

/** Apre un documento (file sul disco o indirizzo web) con il programma predefinito */
export async function openDocument(target: string): Promise<void> {
  if (window.elettro?.openPath) { const err = await window.elettro.openPath(target); if (err) throw new Error(err); return; }
  if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener');
  else throw new Error('i file sul disco si aprono dall\'app desktop');
}

/** Contenuto di un documento PDF sul disco (app desktop); undefined se manca o non si legge */
export async function readDocument(file: string): Promise<Uint8Array | undefined> {
  if (!window.elettro?.readDoc || /^https?:\/\//i.test(file)) return undefined;
  return window.elettro.readDoc(file).catch(() => undefined);
}

export const PROJECT_FILTER: Filter[] = [{ name: 'Progetto OpenWiring', extensions: ['ecad'] }];

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 1);
}

export function parseProject(text: string): Project {
  const p = JSON.parse(text) as Project;
  if (p.format !== 'elettrocad' || !Array.isArray(p.pages)) throw new Error('Il file non è un progetto OpenWiring');
  p.customSymbols ??= [];
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
  p.parts ??= [];
  p.plc ??= { cards: [] };
  p.panels ??= [];
  for (const c of p.cables ?? []) { c.assign ??= {}; c.conductors ??= []; }
  return p;
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'progetto';
