// Comandi dell'applicazione richiamati da barra strumenti, menu e scorciatoie.
import { proposePageName } from '../model/pages';
import { withFullParts, flushParts, applyFromDb, shrinkPicture } from './partsDbSync';
import { parseCommercialCsv, mergeCommercial } from '../io/commercialCsv';
import type { Part } from '../model/types';
import { useStore, emptyProject } from '../model/store';
import { exampleProject } from '../model/example';
import { openFiles, openSymbolFolder, saveFile, PROJECT_FILTER, serializeProject, parseProject, safeName, saveFolder, isElectron, openDocument } from '../io/fileio';
import { importEdz, importFromFiles, importExtracted, toDataUrl, extractArchive, decodeXml, type EdzResult, type EdzOptions } from '../io/edz';
import { edzPrefs } from './edzPrefs';
import { parseQetXml } from '../io/qet';
import { symbolsFromFolder, symbolsFromFolderAsync, isSymbolFile } from '../io/symbolImport';
import type { SymbolDef } from '../model/types';
import { parsePartsXml, exportPartsXml } from '../io/eplanXml';
import { pageToDxf } from '../io/dxf';
import type { PdfOptions } from '../io/pdfOptions';
import { projectReports, plcIoReport, type Table } from '../model/reports';
import { layoutToDxf } from '../model/layout';
import { useAi, activeProfile } from './aiState';
import { aiAsk, PROVIDERS } from '../io/ai';
import { translateSystem, translatePrompt, parseTranslations } from '../model/aiPrompts';
import { projectTexts, translateText, TARGET_LANGS } from '../model/i18n';
import { pageOfLocation } from '../model/devices';
import { plcopenXml } from '../model/plc';
import { nextRevisionIndex } from '../model/revisions';
import { dictionaryCsv } from '../model/i18n';
import { ask, askText, askChoice, askChecks } from './Ask';
import { duplicatePageDefaults } from '../model/clipboard';
import { panelLabel } from '../model/network';
import { applyProfile } from '../model/settingsProfiles';
import { backupKeep, addRecent, removeRecent, dwgConverter } from './appPrefs';
import { openSettingsAt } from './SettingsDialog';
import { afterProjectOpen } from './LibrarySync';
import { makeUserData, parseUserData, mergeUserData, userDataConflicts, USER_DATA_KINDS } from '../model/userData';
import { partsToRows, partsFromRows, PART_COLUMNS } from '../model/partsSheet';
import { writeXlsx, readXlsx } from '../io/xlsx';
import { tx, uiLang } from '../i18n/ui';
import { parseCaedex, parseCaedexCodes, parseIaxNames, planWmc, wmcReport, applyWmc, exportCaedex, wmcRails, type WmcStrip, type WmcResult } from '../io/wmc';

const st = () => useStore.getState();

const confirmDiscard = () => !(st().viewing?.back.dirty ?? st().dirty) || window.confirm(tx('Ci sono modifiche non salvate. Continuare?'));

export function newProject() {
  if (!confirmDiscard()) return;
  const p = emptyProject();
  // Profilo di impostazioni per i progetti nuovi (Impostazioni ▸ Profili)
  const prof = st().profiles.find(x => x.isDefault);
  if (prof) applyProfile(p, prof);
  st().loadProject(p);
  st().logMsg(prof ? tx('Nuovo progetto con il profilo "{0}"', prof.name) : tx('Nuovo progetto'));
}

export function loadExample() {
  if (!confirmDiscard()) return;
  st().loadProject(exampleProject());
  st().logMsg(tx('Caricato il progetto di esempio "Avviamento motore pompa"'));
}

export async function openProject() {
  if (!confirmDiscard()) return;
  const [f] = await openFiles(PROJECT_FILTER);
  if (!f) return;
  try {
    const p = parseProject(new TextDecoder().decode(f.data));
    st().loadProject(p, f.path);
    if (f.path) addRecent(f.path, p.info.name || f.name);
    st().logMsg(tx('Aperto {0}', f.name));
    afterProjectOpen();
  } catch (e) {
    st().logMsg(tx('Impossibile aprire {0}: {1}', f.name, (e as Error).message), 'error');
  }
}

/** Salva il progetto attivo; true se è stato salvato (false se l'utente ha annullato il dialogo) */
export async function saveProject(saveAs = false): Promise<boolean> {
  const { project, filePath, viewing } = st();
  if (viewing) {
    // Revisione archiviata aperta: si salva solo come file a parte, il progetto resta quello di prima
    const path = await saveFile(`${safeName(project.info.name)}_rev${safeName(viewing.index)}.ecad`, serializeProject(project), PROJECT_FILTER);
    if (path) st().logMsg(tx('Copia della revisione {0} salvata: {1}', viewing.index, path));
    return !!path;
  }
  const path = await saveFile(`${safeName(project.info.name)}.ecad`, serializeProject(project), PROJECT_FILTER, saveAs ? undefined : filePath, backupKeep());
  if (path) { st().markSaved(path); st().logMsg(tx('Progetto salvato: {0}', path)); if (isElectron()) addRecent(path, project.info.name || path); }
  return !!path;
}

/**
 * Chiusura dell'applicazione: per ogni progetto aperto con modifiche chiede Salva / Cancella
 * (chiude senza salvare) / Annulla (l'applicazione resta aperta). true = si può chiudere.
 */
export async function confirmCloseAll(): Promise<boolean> {
  // Una revisione archiviata aperta si lascia, così si chiede del progetto vero
  if (st().viewing) st().closeRevisionView();
  const queue = [null, ...st().others.map(o => o.key)];
  for (const key of queue) {
    const s = st();
    const slot = key ? s.others.find(o => o.key === key) : undefined;
    const dirty = key ? slot?.dirty : s.dirty;
    if (!dirty) continue;
    const name = (key ? slot?.project.info.name : s.project.info.name) || tx('Progetto senza nome');
    const c = await askChoice(tx('{0} non salvato', name), tx('Il progetto «{0}» ha modifiche non salvate.\nSalva: le salva nel file. Cancella: chiude senza salvarle. Annulla: OpenWiring resta aperto.', name), [tx('Salva'), tx('Cancella'), tx('Annulla')]);
    if (c === 1) continue;
    if (c !== 0) return false;
    if (key) st().switchProject(key);
    if (!(await saveProject())) return false;
  }
  return true;
}

/** Riapre un progetto recente dal suo percorso (schermata iniziale); se il file non c'è più lo toglie dall'elenco */
export async function openRecent(path: string): Promise<boolean> {
  if (!confirmDiscard()) return false;
  const f = await window.elettro?.readProject?.(path);
  if (!f) {
    removeRecent(path);
    st().logMsg(tx('Il file {0} non c\'è più: tolto dai progetti recenti', path), 'error');
    return false;
  }
  try {
    const p = parseProject(new TextDecoder().decode(f.data));
    st().loadProject(p, f.path);
    addRecent(path, p.info.name || f.name);
    st().logMsg(tx('Aperto {0}', f.name));
    afterProjectOpen();
    return true;
  } catch (e) {
    st().logMsg(tx('Impossibile aprire {0}: {1}', f.name, (e as Error).message), 'error');
    return false;
  }
}

/**
 * Salvataggio automatico (Impostazioni ▸ Programma ▸ Salvataggio): solo nell'app desktop, per un
 * progetto che ha già un file, con modifiche da salvare e senza una revisione archiviata aperta.
 * Restituisce true se ha salvato.
 */
export async function autoSaveProject(): Promise<boolean> {
  const { project, filePath, viewing, dirty } = st();
  if (!isElectron() || !filePath || !dirty || viewing) return false;
  const path = await saveFile(`${safeName(project.info.name)}.ecad`, serializeProject(project), PROJECT_FILTER, filePath, backupKeep());
  // Salvato quello che c'era quando è partito: se nel frattempo è cambiato, resta da salvare
  if (path && st().project === project) st().markSaved(path);
  if (path) st().logMsg(tx('Salvato automaticamente: {0}', path));
  return !!path;
}

/**
 * Schema da PDF vettoriale (es. esportato da SEE Electrical): nuovo progetto con fili, componenti,
 * morsetti e rimandi ricostruiti dalla grafica (vedi io/pdfSchematic.ts).
 */
export async function importPdfSchematic() {
  if (!confirmDiscard()) return;
  const [f] = await openFiles([{ name: 'Schema in PDF', extensions: ['pdf'] }]);
  if (!f) return;
  try {
    st().logMsg(tx('Lettura di {0}…', f.name));
    const { readPdf } = await import('../io/pdfRead');
    const { pdfToProject } = await import('../io/pdfSchematic');
    let last = 0;
    const raw = await readPdf(f.data, { onPage: (n, tot) => { if (n - last >= 25 || n === tot) { last = n; st().logMsg(tx('{0}: pagina {1} di {2}', f.name, n, tot)); } } });
    const { project, report } = pdfToProject(raw, { fileName: f.name });
    st().loadProject(project);
    useStore.setState({ dirty: true });
    st().logMsg(tx('{0}: importati {1} fogli di schema con {2} fili, {3} componenti con sigla, {4} morsetti, {5} rimandi ({6} simboli diversi, categoria «Importati da PDF»)', f.name, report.imported, report.wires, report.devices, report.terminals, report.links, report.symbols));
    if (report.skipped.length) st().logMsg(tx('{0}: {1} pagine saltate perché non sono fogli di schema (copertina, liste, morsettiere): OpenWiring genera le sue liste dallo schema', f.name, report.skipped.length));
    report.warnings.forEach(w => st().logMsg(w, 'warn'));
    st().logMsg(tx('Controlla il risultato con Progetto ▸ Verifica: i componenti sono riconosciuti dalla grafica e vanno ricontrollati (sigle, morsetti, contatti)'));
  } catch (e) {
    st().logMsg(tx('Errore nell\'import di {0}: {1}', f.name, (e as Error).message ?? e), 'error');
  }
}

const MAX_LINES = 50;

/**
 * EDZ grande (app desktop): estratto su disco da un processo a parte; gli articoli vanno nella
 * libreria subito, le foto si aggiungono a gruppi (e passano nel database) senza tenerle tutte in memoria
 */
async function importBigEdz(f: { name: string; path: string }, opts: EdzOptions) {
  const b = window.elettro!;
  st().logMsg(tx('Estrazione di {0} (archivio grande: può richiedere qualche minuto)…', f.name));
  const h = await b.edzOpen!(f.path, opts);
  try {
    const read = (paths: string[]) => b.edzRead!(h.id, paths);
    const r = await importExtracted(h.files, h.all, read, f.name, msg => st().logMsg(msg), opts);
    addEdzResult(r, f.name, opts);
    const nrs = [...r.pictures.keys()];
    if (!nrs.length) return;
    st().logMsg(tx('{0}: foto di {1} articoli…', f.name, nrs.length));
    for (let i = 0; i < nrs.length; i += 300) {
      const chunk = nrs.slice(i, i + 300);
      const files = new Map((await read([...new Set(chunk.map(nr => r.pictures.get(nr)!))])).map(x => [x.path, x]));
      const lib = new Map(st().library.map(p => [p.partNr, p]));
      const upd: Part[] = [];
      for (const nr of chunk) {
        const p = lib.get(nr), img = files.get(r.pictures.get(nr)!);
        const url = img && toDataUrl(img);
        if (p && url) upd.push({ ...p, picture: await shrinkPicture(url) });
      }
      st().replaceParts(upd);
      // Si aspetta che il gruppo sia nel database (e tolto dalla memoria) prima del successivo
      await flushParts();
    }
    st().logMsg(tx('{0}: foto aggiunte', f.name));
  } finally {
    await b.edzClose!(h.id);
  }
}

/**
 * Articoli, simboli e messaggi di un import EPLAN (EDZ, oppure XML con le sue macro). Con foto o
 * simboli esclusi (opts), gli articoli già in libreria tengono la foto e il simbolo che avevano
 */
function addEdzResult(r: EdzResult, name: string, opts: EdzOptions = {}) {
  const skip = [opts.pictures === false && tx('foto'), opts.symbols === false && r.macros.length && tx('simboli dalle macro')].filter(Boolean);
  if (skip.length && r.parts.length) st().logMsg(tx('{0}: importati solo i dati articolo, senza {1} (caselle nella vista Articoli)', name, skip.join(tx(' e '))));
  if (opts.pictures === false || opts.symbols === false) {
    const lib = new Map(st().library.map(p => [p.partNr, p]));
    r = { ...r, parts: r.parts.map(p => {
      const old = lib.get(p.partNr);
      if (!old) return p;
      return { ...p,
        ...(opts.pictures === false && old.picture ? { picture: old.picture } : {}),
        ...(opts.symbols === false && old.symbolId ? { symbolId: old.symbolId } : {}) };
    }) };
  }
  // Con i pacchetti di un intero costruttore gli avvisi sono migliaia: i primi, poi il conteggio
  r.warnings.slice(0, MAX_LINES).forEach(w => st().logMsg(w, 'warn'));
  if (r.warnings.length > MAX_LINES) st().logMsg(tx('{0}: … e altri {1} avvisi', name, r.warnings.length - MAX_LINES), 'warn');
  if (r.symbols.length) {
    st().addSymbolsToLibrary(r.symbols, '');
    st().logMsg(tx('{0}: disegno del costruttore letto dalla macro EPLAN ({1} {2}, categoria «{3}»)', name, r.symbols.length, r.symbols.length === 1 ? 'variante' : 'varianti', r.symbols[0].category));
  }
  if (r.unreadMacros.length && !r.symbols.length) st().logMsg(tx('{0}: macro EPLAN in formato binario, non leggibile; verrà generata una scatola nera dal modello funzione', name), 'warn');
  if (r.documents.length) st().logMsg(tx('{0}: documenti inclusi: {1}', name, r.documents.slice(0, 10).map(d => d.path.split('/').pop()).join(', ') + (r.documents.length > 10 ? tx(' e altri {0}', r.documents.length - 10) : '')));
  if (r.parts.length || !r.symbols.length) st().addPartsToLibrary(r.parts, name);
}

export async function importParts() {
  const files = await openFiles([{ name: 'Dati articolo EPLAN', extensions: ['edz', 'xml', 'zip', 'ema', 'ems', 'html', 'htm', 'csv'] }], true);
  // Dati commerciali in CSV (EPLAN Data Portal): completano gli articoli già in libreria
  const csv = files.filter(f => /\.csv$/i.test(f.name));
  if (csv.length) {
    const lib = new Map(st().library.map(p => [p.partNr, p]));
    const merged = new Map<string, Part>();
    let added = 0, completed = 0;
    for (const f of csv) {
      const r = parseCommercialCsv(new TextDecoder().decode(f.data), f.name);
      if (r.error) { st().logMsg(tx('{0}: {1}', f.name, r.error), 'warn'); continue; }
      for (const p of r.parts) {
        const cur = merged.get(p.partNr) ?? lib.get(p.partNr);
        if (cur) completed++; else added++;
        merged.set(p.partNr, mergeCommercial(cur, p));
      }
    }
    if (merged.size) {
      st().addPartsToLibrary([...merged.values()], csv.length === 1 ? csv[0].name : tx('{0} file CSV', csv.length));
      st().logMsg(tx('Dati commerciali: {0} articoli nuovi, {1} completati', added, completed));
    }
  }
  if (csv.length === files.length) { if (files.length) st().setView('parts'); return; }
  // Macro scelte insieme ai file XML degli articoli
  const emas = files.filter(f => /\.em[as]$/i.test(f.name)).map(f => ({ path: f.name, data: f.data }));
  // Solo macro, senza l'XML degli articoli: diventano simboli della libreria
  if (emas.length && !files.some(f => /\.(xml|edz|zip|html?)$/i.test(f.name))) {
    addEdzResult(importFromFiles(emas, 'macro'), emas.length === 1 ? emas[0].path : tx('{0} macro EPLAN', emas.length));
    st().setView('schema');
    return;
  }
  const opts = edzPrefs();
  for (const f of files) {
    if (/\.em[as]$/i.test(f.name)) continue;
    try {
      if (/\.html?$/i.test(f.name)) {
        // Pagina dell'articolo salvata dall'EPLAN Data Portal
        addEdzResult(importFromFiles([{ path: f.name, data: f.data }], f.name), f.name);
      } else if (/\.xml$/i.test(f.name)) {
        // Le macro richiamate dagli articoli: tra quelle scelte o, in Electron, nella cartella del pacchetto
        // (le macro scelte a mano si importano comunque come simboli)
        const extra = [...emas];
        const bridge = window.elettro;
        if (f.path && bridge?.readMacro && opts.symbols) {
          const { parts } = parsePartsXml(decodeXml(f.data), f.name);
          const refs = new Set(parts.flatMap(p => [p.attrs.P_ARTICLE_GROUPSYMBOLMACRO, p.macro]).filter((r): r is string => !!r && !/_3d\.ema$/i.test(r)));
          for (const ref of refs) {
            if (extra.some(e => e.path.toLowerCase() === ref.split(/[\\/]/).pop()!.toLowerCase())) continue;
            const m = await bridge.readMacro(f.path, ref);
            if (m) extra.push({ path: m.name, data: m.data });
            else st().logMsg(tx('{0}: macro {1} non trovata accanto al file; sceglila insieme all\'XML per avere il disegno del costruttore', f.name, ref.split(/[\\/]/).pop()!), 'warn');
          }
        }
        const o = { ...opts, symbols: opts.symbols || emas.length > 0 };
        addEdzResult(importFromFiles([{ path: f.name, data: f.data }, ...extra], f.name, o), f.name, o);
      } else if (f.big && f.path && window.elettro?.edzOpen) {
        await importBigEdz({ name: f.name, path: f.path }, opts);
      } else {
        st().logMsg(tx('Estrazione di {0}…', f.name));
        addEdzResult(await importEdz(f.data, f.name, opts), f.name, opts);
      }
    } catch (e) {
      st().logMsg(tx('Errore nell\'import di {0}: {1}', f.name, (e as Error).message ?? e), 'error');
    }
  }
  if (files.length) st().setView('parts');
}

/** Toglie dalla libreria gli articoli elencati (tutti, o quelli trovati dalla ricerca) dopo la conferma */
/**
 * Elimina un articolo: dalla libreria e, se c'è, dal progetto aperto (copia dell'articolo e
 * riferimenti di dispositivi, morsetti, cavi…). Se il progetto lo usa si può scegliere di lasciarlo lì.
 */
export async function deletePart(partNr: string): Promise<boolean> {
  const s = st();
  const inLibrary = s.library.some(p => p.partNr === partNr);
  const { parts: _p, ...rest } = s.project;
  const uses = JSON.stringify(rest).split(JSON.stringify(partNr)).length - 1;
  const inProject = s.project.parts.some(p => p.partNr === partNr) || uses > 0;
  let fromProject = inProject;
  if (inProject && uses > 0) {
    const where = inLibrary ? [tx('Elimina dalla libreria e dal progetto'), tx('Elimina solo dalla libreria')] : [tx('Togli dal progetto')];
    const c = await askChoice(tx('Elimina articolo'), tx('L\'articolo {0} è usato {1} volte nel progetto aperto: togliendolo dal progetto, dispositivi e morsetti restano senza articolo.', partNr, uses), [...where, tx('Annulla')]);
    if (c === null || c === where.length) return false;
    fromProject = c === 0;
  } else {
    const c = await askChoice(tx('Elimina articolo'), tx('Eliminare l\'articolo {0}?', partNr), [tx('Elimina'), tx('Annulla')]);
    if (c !== 0) return false;
  }
  if (inLibrary) s.removeParts([partNr]);
  if (fromProject) s.removePartFromProject(partNr);
  s.logMsg(fromProject && inLibrary ? tx('Articolo {0} eliminato dalla libreria e dal progetto', partNr)
    : fromProject ? tx('Articolo {0} tolto dal progetto', partNr) : tx('Articolo {0} eliminato dalla libreria (il progetto aperto ne conserva una copia)', partNr));
  return true;
}

export function removeListedParts(partNrs: string[], filtered: boolean): boolean {
  if (!partNrs.length) return false;
  const msg = filtered
    ? tx('Eliminare dalla libreria i {0} articoli elencati, con le loro foto? I progetti che li usano ne conservano una copia.', partNrs.length)
    : tx('Eliminare tutti i {0} articoli della libreria, con le loro foto? I progetti che li usano ne conservano una copia.', partNrs.length);
  if (!window.confirm(msg)) return false;
  st().removeParts(partNrs);
  st().logMsg(tx('{0} articoli eliminati dalla libreria', partNrs.length));
  return true;
}

declare const __APP_VERSION__: string | undefined;

/** Dati dell'utente in un file da importare su un'altra installazione */
export async function exportUserData() {
  const s = st();
  const data = makeUserData({
    app: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
    library: await withFullParts(s.library, true), symbols: s.symbolLibrary, macros: s.macros, templates: s.templates, titleBlocks: s.tbLibrary, favorites: s.favorites,
  });
  const day = data.exported.slice(0, 10);
  const p = await saveFile(`OpenWiring_dati_utente_${day}.json`, new TextEncoder().encode(JSON.stringify(data)), [{ name: tx('Dati utente OpenWiring'), extensions: ['json'] }]);
  if (p) s.logMsg(tx('Dati utente esportati in {0}: {1} articoli, {2} simboli, {3} macro, {4} modelli di progetto, {5} cartigli', p,
    data.library.length, data.symbols.length, data.macros.length, data.templates.length, data.titleBlocks.length));
}

/** Dati dell'utente da un'altra installazione: si aggiungono a quelli presenti */
export async function importUserData() {
  const [f] = await openFiles([{ name: tx('Dati utente OpenWiring'), extensions: ['json'] }]);
  if (!f) return;
  const r = parseUserData(new TextDecoder().decode(f.data));
  if (!r.data) { st().logMsg(tx(r.error ?? ''), 'error'); return; }
  const s = st();
  // Confronto con gli articoli completi (attributi e foto del database), non con quelli leggeri
  const cur = { library: await withFullParts(s.library, true), symbols: s.symbolLibrary, macros: s.macros, templates: s.templates, titleBlocks: s.tbLibrary, favorites: s.favorites };
  const conflicts = userDataConflicts(cur, r.data);
  let overwrite = false;
  if (conflicts) {
    const c = await askChoice(tx('Dati utente da {0}', f.name),
      tx('{0} elementi del file (articoli, simboli, macro, modelli o cartigli) ci sono già qui ma con dati diversi. Gli elementi nuovi si aggiungono comunque.', conflicts),
      [tx('Tieni i miei'), tx('Usa quelli del file'), tx('Annulla')]);
    if (c === null || c === 2) return;
    overwrite = c === 1;
  }
  const m = mergeUserData(cur, r.data, overwrite);
  s.applyUserData(m.result);
  const parts = USER_DATA_KINDS.map(k => {
    const c = m.counts[k.key];
    const n = c.added + c.replaced;
    return n ? `${n} ${tx(k.name)}` : '';
  }).filter(Boolean);
  s.logMsg(parts.length ? tx('Dati utente importati da {0}: {1}', f.name, parts.join(', ')) : tx('Dati utente da {0}: niente di nuovo', f.name));
}

export async function exportParts() {
  const { library, project } = st();
  const all = new Map([...await withFullParts(library, false), ...project.parts].map(p => [p.partNr, p]));
  await saveFile('articoli_eplan.xml', exportPartsXml([...all.values()]), [{ name: 'XML EPLAN', extensions: ['xml'] }]);
  st().logMsg(tx('Esportati {0} articoli in formato XML EPLAN', all.size));
}

/** Tutti gli articoli: libreria e progetto (la libreria vince se ci sono entrambi) */
function allParts(): Map<string, Part> {
  const { library, project } = st();
  return new Map([...project.parts, ...library].map(p => [p.partNr, p]));
}

/** Articolo con quel codice già presente (in libreria o nel progetto) */
export function partExists(partNr: string): boolean {
  return allParts().has(partNr.trim());
}

/** Avviso: il codice è già usato da un altro articolo */
export async function warnPartExists(partNr: string) {
  await askChoice(tx('Articolo già presente'), tx('L\'articolo {0} non può essere aggiunto perché è già presente.', partNr), [tx('OK')]);
}

/** Articoli in Excel, da modificare e reimportare */
export async function exportPartsXlsx() {
  const all = allParts();
  const p = await saveFile('articoli.xlsx', writeXlsx([{ name: tx('Articoli'), rows: partsToRows(await withFullParts([...all.values()], false)), widths: PART_COLUMNS.map(c => c.w) }]), [{ name: 'Excel', extensions: ['xlsx'] }]);
  if (p) st().logMsg(tx('Esportati {0} articoli in Excel: {1}. Modifica il file e reimportalo con «Importa Excel».', all.size, p));
}

/** Articoli elencati, con foto e attributi, in un file SQLite (app desktop) */
export async function exportPartsDb(partNrs: string[]) {
  const b = window.elettro;
  if (!b?.partsExport || !partNrs.length) return;
  try {
    await flushParts();
    const r = await b.partsExport(partNrs, 'articoli_elettrocad.sqlite');
    if (r) st().logMsg(tx('Esportati {0} articoli nella libreria {1}', r.count, r.file));
  } catch (e) {
    st().logMsg(tx('Esporta libreria: {0}', (e as Error).message ?? String(e)), 'error');
  }
}

/** Articoli da un file della libreria (SQLite) di un'altra installazione */
export async function importPartsDb() {
  const b = window.elettro;
  if (!b?.partsImport) return;
  try {
    await flushParts();
    const r = await b.partsImport();
    if (!r) return;
    applyFromDb(r.parts);
    st().setView('parts');
    st().logMsg(tx('Libreria {0}: {1} articoli nuovi, {2} sostituiti', r.file, r.added, r.replaced));
  } catch (e) {
    st().logMsg(tx('Importa libreria: {0}', (e as Error).message ?? String(e)), 'error');
  }
}

export async function importPartsXlsx() {
  const [f] = await openFiles([{ name: 'Excel', extensions: ['xlsx'] }]);
  if (!f) return;
  let rows: string[][];
  try { rows = readXlsx(f.data)[0]?.rows ?? []; } catch { st().logMsg(tx('{0}: non è un file Excel (.xlsx) valido', f.name), 'error'); return; }
  const r = partsFromRows(rows, allParts());
  if (r.error) { st().logMsg(tx('{0}: {1}', f.name, r.error), 'error'); await askChoice(tx('Importa Excel'), r.error, [tx('OK')]); return; }
  st().replaceParts(r.parts);
  st().setView('parts');
  st().logMsg(tx('Articoli da {0}: {1} nuovi, {2} aggiornati, {3} invariati', f.name, r.added, r.updated, r.unchanged));
  if (r.repeated.length) st().logMsg(tx('Codici ripetuti in più righe (vale l\'ultima): {0}', r.repeated.join(', ')), 'warn');
}

export function allReports(): Table[] {
  const { project, library } = st();
  return projectReports(project, library);
}

/** Lista di assegnazione I/O come tabella (liste, PDF, CSV) */
export function plcIoTable(): Table {
  const { project, library } = st();
  return plcIoReport(project, library);
}

export function exportPdfAction() {
  st().setDialog('pdf');
}

export async function runPdfExport(opts: PdfOptions) {
  const { project, library, pageId } = st();
  st().logMsg(tx('Generazione PDF in corso…'));
  try {
    const { exportPdf } = await import('../io/pdf');
    const r = await exportPdf(project, allReports(), library, { ...opts, currentPageId: opts.currentPageId ?? pageId });
    const p = await saveFile(`${safeName(project.info.name)}.pdf`, r.data, [{ name: 'PDF', extensions: ['pdf'] }]);
    if (p) st().logMsg(tx('PDF esportato: {0} ({1} pagine, {2} collegamenti cliccabili)', p, r.pages, r.links));
    if (r.attached) st().logMsg(tx('Allegate {0} schede tecniche in fondo al PDF', r.attached));
    if (r.missing?.length) st().logMsg(tx('Schede tecniche non allegate (file non trovato o non PDF): {0}', r.missing.join(', ')), 'warn');
  } catch (e) {
    st().logMsg(tx('Errore export PDF: {0}', (e as Error).message), 'error');
  }
}

export async function runPrint(opts: PdfOptions) {
  const { project, library, pageId } = st();
  try {
    const { printProject } = await import('../io/print');
    const n = await printProject(project, library, { ...opts, currentPageId: opts.currentPageId ?? pageId });
    if (n) st().logMsg(tx('Inviate alla stampa {0} pagine', n));
  } catch (e) {
    st().logMsg(tx('Errore di stampa: {0}', (e as Error).message), 'error');
  }
}

/** Tutte le pagine di schema in DXF, un file per pagina, raccolte in uno ZIP */
export async function exportProjectDxf() {
  const { project, library } = st();
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  let n = 0;
  for (const page of project.pages) {
    const name = `${String(++n).padStart(3, '0')}_pag${safeName(page.name)}.dxf`;
    files[name] = strToU8(page.type === 'layout' ? layoutToDxf(page) : pageToDxf(project, page, library));
  }
  const p = await saveFile(`${safeName(project.info.name)}_DXF.zip`, zipSync(files, { level: 6 }), [{ name: 'ZIP', extensions: ['zip'] }]);
  if (p) st().logMsg(tx('DXF del progetto esportati: {0} ({1} pagine, un file DXF R12 per pagina, scala 1:1 in mm)', p, n));
}

export const ODA_URL = 'https://www.opendesign.com/guestfiles/oda_file_converter';

/**
 * Export DWG (AutoCAD 2018) della pagina corrente o di tutto il progetto: i DXF del programma convertiti
 * da ODA File Converter, gratuito, da installare a parte (Impostazioni ▸ Programma ▸ Export DWG).
 */
export async function exportDwg(all: boolean) {
  const { project, pageId, library } = st();
  if (!window.elettro?.dwgExport) { st().logMsg(tx('L\'export DWG funziona nell\'app installata'), 'warn'); return; }
  const pages = all ? project.pages : project.pages.filter(p => p.id === pageId);
  const files = pages.map((page, i) => ({
    name: `${all ? `${String(i + 1).padStart(3, '0')}_` : ''}pag${safeName(page.name)}.dxf`,
    data: page.type === 'layout' ? layoutToDxf(page) : pageToDxf(project, page, library),
  }));
  const name = all ? safeName(project.info.name) : `${safeName(project.info.name)}_pag${safeName(pages[0]?.name ?? '')}`;
  st().logMsg(tx('Conversione in DWG di {0} pagine…', files.length));
  const r = await window.elettro.dwgExport(dwgConverter(), files, name, !all);
  if (r.canceled) return;
  if (r.error === 'converter') {
    const c = await askChoice(tx('Export DWG'), tx('Per scrivere i DWG serve ODA File Converter (gratuito). Installalo e, se non viene trovato da solo, indicalo in Impostazioni ▸ Programma ▸ Export DWG.'), [tx('Scarica ODA File Converter'), tx('Impostazioni'), tx('Annulla')]);
    if (c === 0) void openDocument(ODA_URL).catch(() => window.open(ODA_URL, '_blank', 'noopener'));
    else if (c === 1) openSettingsAt('dwg');
    return;
  }
  if (r.error) { st().logMsg(tx('Conversione in DWG non riuscita: {0}', r.error), 'error'); return; }
  st().logMsg(all ? tx('DWG del progetto esportati: {0} ({1} file, AutoCAD 2018)', r.path ?? '', r.count ?? 0) : tx('DWG esportato: {0}', r.path ?? ''));
}

export async function exportDxfAction() {
  const { project, pageId, library } = st();
  const page = project.pages.find(p => p.id === pageId)!;
  if (page.type === 'layout') {
    const lp = await saveFile(`${safeName(project.info.name)}_layout_pag${safeName(page.name)}.dxf`, layoutToDxf(page), [{ name: 'DXF', extensions: ['dxf'] }]);
    if (lp) st().logMsg(tx('DXF del layout in scala 1:1 esportato: {0}', lp));
    return;
  }
  const p = await saveFile(`${safeName(project.info.name)}_pag${safeName(page.name)}.dxf`, pageToDxf(project, page, library), [{ name: 'DXF', extensions: ['dxf'] }]);
  if (p) st().logMsg(tx('DXF esportato: {0}', p));
}

/** Esporta le macro della libreria in un file da condividere (.ecmacro, JSON) */
export async function exportMacros(ids?: string[]) {
  const list = st().macros.filter(m => !ids || ids.includes(m.id));
  if (!list.length) return;
  const p = await saveFile(`${list.length === 1 ? safeName(list[0].name) : 'macro'}.ecmacro`, JSON.stringify({ format: 'elettrocad-macro', macros: list }, null, 1), [{ name: 'Macro OpenWiring', extensions: ['ecmacro'] }]);
  if (p) st().logMsg(tx('Esportate {0} macro: {1}', list.length, p));
}

export async function importMacros() {
  const files = await openFiles([{ name: 'Macro OpenWiring', extensions: ['ecmacro', 'json'] }], true);
  for (const f of files) {
    try {
      const data = JSON.parse(new TextDecoder().decode(f.data));
      if (data.format !== 'elettrocad-macro' || !Array.isArray(data.macros)) throw new Error(tx('non è un file di macro OpenWiring'));
      st().addMacros(data.macros);
      st().logMsg(tx('{0} macro importate da {1}', data.macros.length, f.name));
    } catch (e) {
      st().logMsg(tx('Impossibile importare {0}: {1}', f.name, (e as Error).message), 'error');
    }
  }
}

/** Confronta il progetto aperto con un altro file .ecad (per esempio la revisione inviata al cliente) */
export async function compareWithFile() {
  const [f] = await openFiles(PROJECT_FILTER);
  if (!f) return;
  try {
    const { compareProjects } = await import('../model/revisions');
    const other = parseProject(new TextDecoder().decode(f.data));
    st().setComparison({ file: f.name, rows: compareProjects(other, st().project, st().library) });
    st().logMsg(tx('Confronto con {0}: {1} differenze', f.name, st().comparison?.rows.length ?? 0));
  } catch (e) {
    st().logMsg(tx('Impossibile confrontare con {0}: {1}', f.name, (e as Error).message), 'error');
  }
}

export function fitView() {
  window.dispatchEvent(new Event('elettrocad:fit'));
}

/** Importa componenti QElectroTech: file .elmt, progetti .qet o archivi .zip/.7z di cartelle */
export async function importSymbols() {
  const files = await openFiles([{ name: 'Componenti QElectroTech', extensions: ['elmt', 'qet', 'zip', '7z'] }], true);
  const all: SymbolDef[] = [];
  for (const f of files) {
    try {
      if (f.big) {
        st().logMsg(tx('{0}: archivio troppo grande; estrai la cartella e scegli i file .elmt', f.name), 'error');
      } else if (/\.(zip|7z)$/i.test(f.name)) {
        st().logMsg(tx('Estrazione di {0}…', f.name));
        // Le cartelle dell'archivio diventano i rami dell'albero, sotto il nome dell'archivio
        const entries = await extractArchive(f.data, f.name);
        const files = entries.filter(e => isSymbolFile(e.path)).map(e => ({ rel: e.path.replace(/\\/g, '/'), text: new TextDecoder().decode(e.data) }));
        all.push(...symbolsFromFolder(f.name.replace(/\.(zip|7z)$/i, ''), files, uiLang()).symbols);
      } else {
        all.push(...parseQetXml(new TextDecoder().decode(f.data), f.name));
      }
    } catch (e) {
      st().logMsg(tx('Errore nell\'import di {0}: {1}', f.name, (e as Error).message), 'error');
    }
  }
  if (files.length) {
    if (all.length) st().addSymbolsToLibrary(all, files.map(f => f.name).join(', '));
    else st().logMsg(tx('Nessun componente trovato nei file scelti'), 'warn');
  }
}

/** Importa tutti i simboli di una cartella e delle sottocartelle: le sottocartelle diventano l'albero della libreria */
export async function importSymbolFolder() {
  const r = await openSymbolFolder();
  if (!r) return;
  st().logMsg(tx('Lettura della cartella {0}: {1} file…', r.name, r.files.length));
  const { symbols, errors, folders } = await symbolsFromFolderAsync(r.name, r.files, uiLang(), (done, total) => {
    if (done % 3000 === 0) st().logMsg(tx('{0} file su {1}…', done, total));
  });
  for (const e of errors.slice(0, 10)) st().logMsg(e, 'warn');
  if (errors.length > 10) st().logMsg(tx('… altri {0} file non importati', errors.length - 10), 'warn');
  if (!symbols.length) { st().logMsg(tx('Nessun simbolo trovato nella cartella {0} (file .elmt, .qet o .ecsym)', r.name), 'warn'); return; }
  st().addSymbolsToLibrary(symbols, '');
  st().logMsg(tx('{0} simboli importati dalla cartella {1}, in {2} gruppi della libreria', symbols.length, r.name, folders));
}

export async function exportPlcopenAction() {
  const { project, library } = st();
  const path = await saveFile(`${safeName(project.info.name)}_plcopen.xml`, plcopenXml(project, library), [{ name: 'PLCopen XML', extensions: ['xml'] }]);
  if (path) st().logMsg(tx('PLCopen XML esportato: {0}', path));
}

export async function exportDictionary() {
  const { project, library } = st();
  const p = await saveFile(`${safeName(project.info.name)}_dizionario.csv`, dictionaryCsv(project, library), [{ name: 'CSV', extensions: ['csv'] }]);
  if (p) st().logMsg(tx('Dizionario esportato: {0}', p));
}

/** Duplica una pagina chiedendo prima numero, nome e luogo della copia */
export async function duplicatePageAsk(pageId: string) {
  const { project } = st();
  const src = project.pages.find(p => p.id === pageId);
  const def = duplicatePageDefaults(project, pageId);
  if (!src || !def || src.type !== 'multiline') return;
  const panels = project.panels ?? [];
  let values = [def.name, def.title, def.panelId ?? ''];
  for (;;) {
    const r = await ask(tx('Duplica la pagina {0}', src.name), [
      { label: tx('Numero della pagina'), value: values[0] },
      { label: tx('Nome della pagina'), value: values[1] },
      ...(panels.length ? [{ label: tx('Luogo (sezione)'), value: values[2], options: [{ value: '', label: tx('— nessuno (pagine generali) —') }, ...panels.map(p => ({ value: p.id, label: panelLabel(p) }))] }] : []),
    ]);
    if (!r) return;
    values = [r[0].trim(), r[1].trim(), r[2] ?? ''];
    if (!values[0]) continue;
    // Numero già usato da un'altra pagina: si chiede un altro numero
    if (st().project.pages.some(p => p.name === values[0])) {
      if (await askChoice(tx('Numero già usato'), tx('C\'è già una pagina {0}. Scegli un altro numero.', values[0]), [tx('OK'), tx('Annulla')]) !== 0) return;
      continue;
    }
    st().duplicatePage(pageId, { name: values[0], title: values[1], panelId: values[2] || undefined });
    return;
  }
}

/** Elimina una pagina dopo la conferma */
export async function deletePageAsk(pageId: string) {
  const { project } = st();
  const pg = project.pages.find(p => p.id === pageId);
  if (!pg || project.pages.length <= 1) return;
  const n = pg.elements.length;
  const c = await askChoice(tx('Eliminare la pagina {0}?', `${pg.name} ${pg.title}`.trim()),
    n ? tx('La pagina contiene {0} elementi. Si può annullare con Modifica ▸ Annulla.', n) : tx('La pagina è vuota.'),
    [tx('Elimina'), tx('Annulla')]);
  if (c === 0) st().deletePage(pageId);
}

/** Congela una nuova revisione chiedendo indice e descrizione */
/** Rilascio della revisione: controllo del progetto e dati della revisione nella finestra di rilascio */
export function releaseRevision() {
  const { project, viewing } = st();
  if (viewing || project.revisionState === 'released') return;
  st().setDialog('release');
}

/** Pacchetto di rilascio di una revisione: cartella con PDF, liste, differenze, progetto, manifest e checksum */
export async function releasePackage(revId: string) {
  const s = st();
  const project = s.viewing?.back.project ?? s.project;
  const rev = project.revisions?.find(r => r.id === revId);
  if (!rev) return;
  s.logMsg(tx('Preparazione del pacchetto di rilascio della revisione {0}…', rev.index));
  try {
    const { buildReleasePackage } = await import('../io/releasePackage');
    const pkg = await buildReleasePackage(project, revId, s.library);
    if (!pkg) { s.logMsg(tx('La revisione {0} non ha la copia archiviata: il pacchetto non si può creare', rev.index), 'warn'); return; }
    const where = await saveFolder(pkg.folder, pkg.files);
    if (where) s.logMsg(tx('Pacchetto di rilascio salvato: {0} ({1} file)', where, pkg.files.length));
  } catch (e) {
    s.logMsg(tx('Errore nel pacchetto di rilascio: {0}', (e as Error).message ?? String(e)), 'error');
  }
}

export async function cancelRevision() {
  const last = st().project.revisions?.at(-1);
  if (!last || !window.confirm(tx('Annullare la revisione aperta? Tutte le modifiche fatte dopo il rilascio della {0} vanno perse.', last.index))) return;
  if (!(await st().cancelRevision())) st().logMsg(tx('La revisione {0} non ha la copia archiviata (rilasciata con una versione precedente del programma): non si può tornare indietro', last.index), 'warn');
}

export async function saveAsTemplate() {
  const n = (await askText(tx('Nome del modello (es. Quadro standard):')))?.trim();
  if (n) st().saveTemplate(n);
}

/** Nuova macro dalla selezione: chiede nome e categoria */
export async function saveMacroFromSelection() {
  const r = await ask(tx('Crea macro dalla selezione'), [{ label: tx('Nome'), placeholder: tx('es. Avviamento diretto motore') }, { label: tx('Categoria'), value: 'Macro' }]);
  const name = r?.[0].trim();
  if (r && name) st().saveMacro(name, r[1].trim() || 'Macro');
}

export function newFromTemplate(id: string) {
  if (confirmDiscard()) st().newFromTemplate(id);
}

/** Nuovo luogo (quadro, pulsantiera, bordo macchina…) con codice e nome */
export async function addPlace() {
  const r = await ask(tx('Nuovo luogo'), [{ label: tx('Codice'), placeholder: tx('es. QE, BM, P1, QS1') }, { label: tx('Nome'), placeholder: tx('es. Quadro elettrico, Bordo macchina') }]);
  const code = r?.[0].trim();
  if (!r || !code) return;
  const name = r[1].trim();
  const pn = st().addPanel(name);
  st().updatePanel(pn.id, { code: code.replace(/^\+/, '').trim().toUpperCase() });
}

export function renumberDevices() {
  if (window.confirm(tx('Rinumerare tutti i dispositivi secondo il modello? I contatti seguono la sigla della bobina.'))) st().renumber();
}

/**
 * Pagina nuova dopo quella indicata. Durante una revisione si sceglie il numero (proposto: in mezzo
 * il numero con l'indice della revisione, es. 12-B; in fondo il numero dopo il più alto mai usato)
 */
export async function newPage(after?: string) {
  const p = st().project;
  if (p.revisionState !== 'review') { st().addPage(after); return; }
  const r = await ask(tx('Nuova pagina nella revisione {0}', nextRevisionIndex(p)), [{ label: tx('Numero della pagina'), value: proposePageName(p, after) }]);
  if (!r || !r[0].trim()) return;
  st().addPage(after, r[0].trim());
}

/** Rinumerazione esplicita delle pagine di progetto (le liste generate hanno la loro numerazione) */
export async function renumberPages() {
  const r = await ask(tx('Rinumera pagine'), [{ label: tx('Primo numero'), value: '1' }, { label: tx('Passo'), value: '1' }]);
  if (!r) return;
  const start = parseInt(r[0], 10), step = parseInt(r[1], 10);
  if (!(start >= 0) || !(step > 0)) { st().logMsg(tx('Numero o passo non validi'), 'warn'); return; }
  const revised = !!st().project.revisions?.length;
  if (revised && !window.confirm(tx('Il progetto ha revisioni: i numeri delle pagine emesse cambiano e la rinumerazione finisce tra le modifiche della revisione. Continuare?'))) return;
  st().renumberPages(start, step);
}

export function renumberWires() {
  if (window.confirm(tx('Ricalcolare da capo tutti i numeri filo? I numeri assegnati, anche quelli manuali, verranno sostituiti.'))) st().renumberWires();
}

/** Proprietà del progetto nel pannello a sinistra */
export function showProjectProps() {
  st().setTreeSel({ type: 'project' });
  st().setSelection([]);
}

export function openReport(tab: string) {
  st().setReportTab(tab);
  st().setView('reports');
}

/** Pagina precedente o successiva */
export function stepPage(d: number) {
  const { project, pageId } = st();
  const pg = project.pages[project.pages.findIndex(p => p.id === pageId) + d];
  if (pg) st().setPage(pg.id);
}

/** Guida per agenti di intelligenza artificiale (Markdown) con il catalogo dei simboli del progetto */
export async function saveAgentGuide() {
  const { agentGuide } = await import('../model/agentGuide');
  const p = await saveFile('OpenWiring_guida_agenti_IA.md', agentGuide(st().project, st().symbolLibrary), [{ name: 'Markdown', extensions: ['md'] }]);
  if (p) st().logMsg(tx('Guida per agenti IA salvata: {0}', p));
}

/**
 * Traduce con l'assistente IA del profilo attivo i testi del progetto senza traduzione (e le
 * proposte parola per parola ancora da verificare). Le traduzioni restano «da verificare».
 */
export async function aiTranslate(): Promise<void> {
  await useAi.getState().load();
  const profile = activeProfile();
  if (!profile) { st().setDialog('aiSettings'); return; }
  const { project, library } = st();
  const dict = project.dictionary ?? {};
  const todo = projectTexts(project, library).map(({ text }) => ({
    text,
    langs: TARGET_LANGS.filter(l => (dict[text]?.[l] ? !!dict[text]?.auto?.includes(l) : translateText(project, text, l) === text)),
  })).filter(i => i.langs.length);
  if (!todo.length) { st().logMsg(tx('Traduzioni: tutti i testi sono già tradotti')); return; }
  st().logMsg(tx('Traduzione con {0} ({1}): {2} testi…', profile.name, PROVIDERS[profile.provider].name, todo.length));
  let total = 0;
  for (let i = 0; i < todo.length; i += 120) {
    const chunk = todo.slice(i, i + 120);
    try {
      const a = await aiAsk(profile, translateSystem(), [{ role: 'user', text: translatePrompt(chunk) }]);
      const parsed = parseTranslations(a.text);
      // Solo i testi e le lingue chiesti
      const wanted = new Map(chunk.map(c => [c.text, c.langs]));
      const clean = Object.fromEntries(Object.entries(parsed).filter(([k]) => wanted.has(k))
        .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([l]) => wanted.get(k)!.includes(l as 'en' | 'de')))]));
      total += st().mergeProposedTranslations(clean, profile.name);
    } catch (e) {
      st().logMsg(tx('Traduzione interrotta: {0}', (e as Error).message), 'error');
      break;
    }
  }
  if (total) { st().setReportTab('translations'); st().setView('reports'); }
}

/**
 * Morsettiere da Weidmüller Configurator: file CAEdex (esportazione «per SEE Suite» o «per SPAC»),
 * con i file .iax scelti insieme per i nomi degli articoli. Prima mostra l'abbinamento con le
 * morsettiere del progetto, poi lo applica (annullabile).
 */
export async function importWmc() {
  const files = await openFiles([{ name: 'Weidmüller Configurator (CAEdex, iax)', extensions: ['caedex', 'WMCtoSPAC', 'xml', 'iax'] }], true);
  const main = files.find(f => !/\.iax$/i.test(f.name));
  const st = useStore.getState();
  if (!main) { if (files.length) st.logMsg(tx('Scegli il file CAEdex esportato da Weidmüller Configurator (i file .iax servono solo per i nomi degli articoli)'), 'warn'); return; }
  let strips: WmcStrip[];
  try { strips = parseCaedex(new TextDecoder().decode(main.data)); } catch (e) { st.logMsg(String((e as Error).message ?? e), 'error'); return; }
  const names = Object.assign({}, ...files.filter(f => /\.iax$/i.test(f.name)).map(f => parseIaxNames(new TextDecoder().decode(f.data))));
  const plans = planWmc(st.project, strips);
  const lines = wmcReport(plans);
  const n = (s: string) => plans.filter(x => x.status === s).length;
  const msg = `${tx('{0} morsettiere abbinate, {1} nuove, {2} non importate.', n('match'), n('new'), n('skip'))}\n\n${lines.join('\n')}`;
  // Morsettiere del file da applicare: di serie tutte quelle abbinate e le nuove, per guida
  const picks = await askChecks(tx('Morsettiere da Weidmüller Configurator'), msg.split('\n\n')[0] + '\n' + tx('Spunta le morsettiere da applicare al progetto; le altre restano come sono.'),
    plans.map((pl, i) => ({ label: pl.strip ? `-${pl.strip}` : tx('(senza nome)'), group: pl.wmc.rail || tx('Guida'), checked: pl.status !== 'skip', disabled: pl.status === 'skip', note: lines[i]?.replace(/^.*?\]:\s*/, '') })),
    tx('Applica'));
  if (!picks) return;
  let r: WmcResult | undefined;
  const codes = parseCaedexCodes(new TextDecoder().decode(main.data));
  st.commit(p => {
    r = applyWmc(p, planWmc(p, strips).filter((_, i) => picks[i]), st.library, names);
    // Codici degli accessori del Configurator: servono per esportare di nuovo
    if (Object.keys(codes).length) p.settings.wmcCodes = codes;
  });
  if (!r) return;
  for (const l of lines.filter((_, i) => picks[i])) st.logMsg(l);
  st.logMsg(tx('Weidmüller: {0} morsettiere aggiornate, {1} nuove, {2} riserve aggiunte, {3} ponticelli, {4} articoli nuovi', r.strips, r.created, r.spares, r.jumpers, r.parts));
}

/** Morsettiere del progetto in un file CAEdex da importare in Weidmüller Configurator */
export async function exportWmc() {
  const st = useStore.getState();
  // Morsettiere da esportare, per guida (quadro): di serie tutte
  const rails = [...wmcRails(st.project)];
  const list = rails.flatMap(([rail, strips]) => strips.map(s => ({ rail, s })));
  if (!list.length) { st.logMsg(tx('Nessuna morsettiera da esportare'), 'warn'); return; }
  const sel = st.stripSel;
  const picks = await askChecks(tx('Morsettiere per Weidmüller Configurator'),
    tx('Ogni quadro diventa una guida. Per la prima prova conviene una morsettiera sola, poi un quadro intero alla volta.'),
    list.map(x => ({ label: `-${x.s}`, group: x.rail, checked: true, note: x.s === sel ? tx('selezionata') : undefined })), tx('Esporta'));
  if (!picks) return;
  const chosen = list.filter((_, i) => picks[i]).map(x => x.s);
  const { xml, problems } = exportCaedex(st.project, st.library, chosen);
  // Pezzi senza codice Weidmüller: il Configurator non li troverebbe e rifiuterebbe il file
  if (problems.length) {
    const r = await askChoice(tx('Morsettiere per Weidmüller Configurator'),
      `${tx('{0} pezzi non hanno un codice Weidmüller (10 cifre) e restano fuori dal file. Per esportarli scegli un articolo Weidmüller o scrivi il numero d\'ordine Weidmüller nell\'articolo.', problems.length)}\n\n${problems.slice(0, 40).join('\n')}${problems.length > 40 ? '\n…' : ''}`,
      [tx('Esporta lo stesso'), tx('Annulla')]);
    if (r !== 0) return;
  }
  const railsIn = [...new Set(list.filter((_, i) => picks[i]).map(x => x.rail))];
  const suffix = chosen.length === 1 ? chosen[0] : railsIn.length === 1 && chosen.length === rails.find(r => r[0] === railsIn[0])![1].length ? railsIn[0] : chosen.length === list.length ? 'morsettiere' : `${chosen.length}_morsettiere`;
  const path = await saveFile(`${safeName(st.project.info.name || 'progetto')}_${safeName(suffix)}.caedex`, xml, [{ name: 'CAEdex', extensions: ['caedex'] }]);
  if (!path) return;
  st.logMsg(tx('Morsettiere esportate per Weidmüller Configurator: {0}', path));
  for (const m of problems) st.logMsg(m, 'warn');
  if (!st.project.settings.wmcCodes) st.logMsg(tx('Codici di targhette, fermi e guida: quelli tipici (Klippon Connect). Per usare i tuoi importa una volta le morsettiere da Weidmüller Configurator (Da Weidmüller…).'));
}

/** Apre un progetto accanto a quello attivo (che resta aperto nella colonna Modello) */
export async function openProjectAlongside() {
  const files = await openFiles(PROJECT_FILTER, true);
  for (const f of files) {
    try {
      const p = parseProject(new TextDecoder().decode(f.data));
      st().openAlongside(p, f.path);
      if (f.path) addRecent(f.path, p.info.name || f.name);
      st().logMsg(tx('Aperto {0} accanto agli altri progetti', f.name));
    } catch (e) {
      st().logMsg(tx('Impossibile aprire {0}: {1}', f.name, (e as Error).message), 'error');
    }
  }
  if (files.length) afterProjectOpen();
}

/** Chiude il progetto attivo quando ce ne sono altri aperti (chiede se ci sono modifiche) */
export function closeActiveProject() {
  if (!st().others.length) { st().logMsg(tx('È l\'unico progetto aperto'), 'warn'); return; }
  if (!confirmDiscard()) return;
  st().closeActive();
}
