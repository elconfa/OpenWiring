import { syncPairs, newRepresentation } from './pairs';
import { create } from 'zustand';
import { nextRail } from './fixedPos';
import { nextRot, fitRot, allowedRots, ROTS } from './rotations';
import { applySheet } from './types';
import type { TextMoveKey, ExtraPart, UserPropDef, PinDir } from './types';
import type { DrawingStyleKind, Project, Page, Element, Part, SymbolInstance, Pt, Wire, ProjectInfo, ProjectSettings, DeviceField, PlcCard, IoKind, SymbolDef, TerminalStripData, Jumper, Cable, CableLine, CableMarking, Layout, WireDef, Distributor } from './types';
import { newLayoutPage, autoLayout as autoLayoutModel, layoutOf, type AutoLayoutOptions } from './layout';
import { newPanel, newNetworkPage, assignBusCableTags, unifyBusCableTags, syncBusLinkNames, busCableLinks, assignIps, newIpNetwork, netInterfaces, setNetInterface, stationInterface, splitNetInterface as splitNetInterfaceModel, mergeNetInterface as mergeNetInterfaceModel, assignProfinetNames } from './network';
import { nextPin, freePins, allConnectors, type ConnectorData } from './connectors';
import { genderSymbol, type ConnectorGender } from './connectorTypes';
import { releaseRevision as releaseRevisionModel, openRevision as openRevisionModel, cancelRevision as cancelRevisionModel, unpackProject, isReleased, lastRevision, archiveKb, type Difference, type ReleaseData } from './revisions';
import { parseProject } from '../io/fileio';
import { syncReportPages as syncReportPagesModel, addCoverPage as addCoverPageModel, makeTemplate, projectFromTemplate, type ProjectTemplate } from './templates';
import { projectReports } from './reports';
import type { TitleBlock, TitleBlockTemplate, PlcStation, IolinkPort, ReportStyle, ReportColumnStyle, RevisionNote, ThermalCalc, CableCalc } from './types';
import { newThermal } from './calculations';
import type { Panel, Zone, IpNetwork, LanguageSettings, Lang } from './types';
import { autoTranslate as autoTranslateModel } from './i18n';
import { moveWithWires, normalizeWire, splitWiresAtSymbols, healWiresAtRemoved } from './wireEdit';
import type { IssueFix } from './checks';
import { articlePinPlan } from './articlePins';
import { autoConnect, splitWiresAtPins, quickWirePath } from './autoWire';
import { syncDrawingPages as syncDrawingPagesModel, type DrawingKind } from './drawings';
import { applyWireDefs } from './wireDefs';
import { newDistributor, syncDistSymbols, distOf, isDistSymbol, distSymbolId } from './distributors';
import { textBounds } from './textFlow';
import { replaceSymbol as replaceSymbolModel, canReplace } from './replaceSymbol';
import { alignDeltas, type AlignMode, type AlignBox } from './align';
import { alignWireLabels, labelsOnLine, type WireLabelPos } from './wireLabels';
import { derive } from './derive';
import { tNodeAt } from './wiringOrder';
import { placeByNumber, sortByNumber, proposePageName } from './pages';
import { importPagesText, type TextImportResult } from './textFormat';
import { listEntries, updateList as updateListModel, deleteList as deleteListModel, updateAllLists as updateAllListsModel } from './lists';
import { planTerminalRow, applyTerminalRow, type TerminalPick, type TerminalRowMode } from './terminalRow';
import { newCable, remarkCable, repairPartCables, cableFromPart, crossedWires, copyCableProps, pasteCableProps, lockCableConductors, syncCablesWithPart, differsFromPart, type CableClip } from './cables';
import { allocateChannel, cardByTag, PLC_CARD_TYPES, newCard, cardType, reassignAddresses, adaptAddressFormat, keepAnalogFirst, stationFormat, needsReassign, cardFromPart, applyTagImport, syncOverviewPages, stationNames, type TagImportRow, type TagImportResult } from './plc';
import { DEFAULT_SETTINGS, DEVICE_FIELDS, PIN_OWN_FIELDS, AUX_OWN_FIELDS } from './types';
import { getSymbol, snap, uid, setLibrarySymbols, instanceBounds } from './geometry';
import { blackBoxFromPart, BUILTIN_SYMBOLS } from './symbols';
import { isDeletedSymbol, deletedCategory, applySymbolChoices, mergeSymbols, remapSymbol, type SymbolDiff, type SymbolChoice } from './symbolSync';
import { stripOf, sameDeviceIds, terminalLevelIds, mergeTargets, migrateAuxDescriptions, partsIndex } from './devices';
import { titleBlockTemplates, templateFields } from './titleBlocks';
import { linkPartners, pairLinks } from './links';
import { nameTapsInOrder } from './bundles';
import { withShow, type WireVisKey, type SymVisKey } from './visibility';
import { buildPlcGroup, firstFreeChannel, groupConfig, groupMembers, newGroupId, type PlcGroupCfg } from './plcGroup';
import { nextTerminal, nextToPlace, parseTerminalNo, terminalNo, ensureStrip, renumberStrip as renumberStripModel, renameStrip as renameStripModel, renameTerminals as renameTerminalsModel, addLevel, addJumper as addJumperModel, removeFromJumpers, addSpares as addSparesModel, removeSpares as removeSparesModel, setSparePart, syncStripPages, allStrips } from './terminals';
import { nextTagFor, renumberDevices, settingsOf } from './numbering';
import { computeNetlist, lockWireNumbers, clearWireNumbers, syncPlcLinkNames, withNetlistCache, invalidateNetlist } from './netlist';
import { kvGet, kvSet } from '../io/storage';
import { replaceHits, type SearchHit, type SearchOpts } from './search';
import { arrangePages, isGenerated, moveGroup, nextProjectPageNo, pageGroup, registerPageNumbers, renumberPages as renumberPagesModel } from './pageOrder';
import { copyElements, pasteElements, pasteOffset, duplicatePage as duplicatePageModel, makeMacro, type ClipData, type Macro } from './clipboard';

export type Tool =
  | { kind: 'select' }
  /** bus: protocollo per i collegamenti di rete (es. "Profinet") */
  | { kind: 'wire'; bus?: string; bundle?: boolean }
  /** tag: sigla imposta (es. il piano successivo di un morsetto, "X1:1B") */
  | { kind: 'place'; symbolId: string; rot: SymbolInstance['rot']; partNr?: string; tag?: string; pairOf?: string }
  | { kind: 'text' }
  /** Linea di definizione cavo: due clic attraverso i fili */
  | { kind: 'cable' }
  /** Linea di definizione dei fili (sezione, colore, tipo): due clic attraverso i fili */
  | { kind: 'wiredef' }
  /** Riquadro di un quadro nello schema di rete: trascina per disegnarlo */
  | { kind: 'zone' }
  /** Inserimento di una macro: clic per l'angolo in alto a sinistra */
  | { kind: 'macro'; macroId: string }
  /** Allinea numeri filo: si traccia una linea attraverso i fili, i numeri vanno sulla linea */
  | { kind: 'wireLabels' }
  /** Collegamento rapido: clic tra due punti di connessione in colonna (v) o in riga (h) */
  | { kind: 'quickWire'; axis: 'h' | 'v' }
  /** Incolla al puntatore: gli elementi copiati seguono il mouse e si posano con un clic */
  | { kind: 'paste' }
  /** Morsetti in fila: fili scelti con una linea o con Ctrl/Cmd+clic, nell'ordine di numerazione */
  | { kind: 'terminalRow'; strip?: string; picks: TerminalPick[] };

export type TreeSel =
  | { type: 'project' }
  | { type: 'page'; id: string }
  | { type: 'device'; tag: string }
  | { type: 'part'; partNr: string };

export interface LogEntry { time: string; level: 'info' | 'warn' | 'error'; msg: string }

export type View = 'calcs' | 'schema' | 'parts' | 'reports' | 'plc' | 'terminals' | 'connectors' | 'distributors' | 'cables' | 'bundles' | 'symbol' | 'devices';

/** Progetto aperto ma non attivo: quello che serve per riprenderlo com'era */
export interface OpenProject {
  key: string;
  project: Project;
  filePath?: string;
  dirty: boolean;
  savedAt: number | null;
  past: Project[];
  future: Project[];
  pageId: string;
}

export type Dialog = 'release' | 'revisions' | 'reportStyle' | 'cover' | 'stripStyle' | 'drawingStyle' | 'cableStyle' | 'pdf' | 'print' | 'search' | 'labels' | 'about' | 'text' | 'ai' | 'aiSettings' | 'reportPages' | 'settings' | 'userProps' | 'props' | 'start' | 'customLists' | 'palette' | 'backstage' | 'netAddresses' | null;

/** Oggetto a cui va il valore di una proprietà definita dall'utente */
export type UserPropTarget = { kind: 'device'; instId: string } | { kind: 'page'; pageId: string } | { kind: 'project' } | { kind: 'wire'; wireId: string } | { kind: 'part'; partNr: string };

export type Theme = 'system' | 'light' | 'dark';
export type Sheet = 'white' | 'dark' | 'auto';
/** Aspetto dei comandi: barra multifunzione completa, compatta su una riga, o menu classici con la barra strumenti */
export type UiStyle = 'ribbon' | 'compact' | 'classic';

/** Preferenze di visualizzazione dell'utente (non del progetto), salvate nel browser */
function loadPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(`elettrocad.${key}`) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function savePref(key: string, v: string) {
  try { localStorage.setItem(`elettrocad.${key}`, v); } catch { /* preferenza non salvabile */ }
}

export interface State {
  project: Project;
  pageId: string;
  selection: string[];
  tool: Tool;
  treeSel: TreeSel;
  view: View;
  past: Project[];
  future: Project[];
  library: Part[];
  /** Simboli importati (es. QElectroTech), disponibili in tutti i progetti */
  symbolLibrary: SymbolDef[];
  /** Cartella della libreria dei simboli (app desktop); vuota nel browser */
  symbolDir: string;
  /** Simboli preferiti (id), in cima alla libreria; salvati sul computer, validi in tutti i progetti */
  favorites: string[];
  toggleFavorite(symbolId: string): void;
  log: LogEntry[];
  dirty: boolean;
  filePath?: string;
  cursor: Pt;
  theme: Theme;
  sheet: Sheet;
  /** Scheda aperta nella vista Liste ("checks" = controlli di progetto) */
  reportTab: string;
  setReportTab(t: string): void;
  /** Morsettiera aperta nella vista Morsettiere */
  stripSel?: string;
  setStripSel(strip: string | undefined): void;
  /** Connettore aperto nella vista Connettori */
  connSel?: string;
  /** Cavo mostrato nel pannello Cavi */
  cableSel?: string;
  setConnSel(conn: string | undefined): void;
  /** Ripartitore scelto nella vista Ripartitori */
  distSel?: string;
  setDistSel(id: string | undefined): void;
  /** Ripartitore o morsettiera di distribuzione nuova; ritorna l'id */
  addDistributor(kind: Distributor['kind']): string;
  /** Dati del ripartitore; cambiando la sigla cambia anche sullo schema, togliendo gruppi spariscono i loro simboli */
  updateDistributor(id: string, patch: Partial<Distributor>): void;
  deleteDistributor(id: string): void;
  /** Inserimento del gruppo gi (o del primo non ancora sullo schema): clic sullo schema */
  placeDistGroup(id: string, gi?: number): void;
  setCableSel(id: string | undefined): void;
  /** Dati della morsettiera (articoli predefiniti e accessori) */
  updateStrip(strip: string, patch: Partial<TerminalStripData>): void;
  renumberStrip(strip: string): void;
  renameStrip(from: string, to: string): void;
  /** Cambia il numero ai morsetti (vecchio → nuovo); false con l'errore nel report se un numero è già usato */
  renameTerminals(strip: string, changes: Map<string, string>): boolean;
  /** Rende multipiano il morsetto e attiva l'inserimento del piano successivo */
  addTerminalLevel(instId: string): void;
  addJumper(strip: string, nos: string[], kind: Jumper['kind']): void;
  removeJumpers(strip: string, nos: string[]): void;
  updateJumper(strip: string, id: string, patch: Partial<Jumper>): void;
  /** Morsetti di riserva: nei buchi della numerazione o dal numero dato, con l'articolo se indicato */
  addSpares(strip: string, count: number, start?: string, partNr?: string, levels?: number): void;
  removeSpares(strip: string, nos: string[]): void;
  /** Inserisce i morsetti sui fili scelti con lo strumento «Morsetti in fila»; restituisce i numeri posati */
  placeTerminalRow(picks: TerminalPick[], opts: { strip: string; levels: number; mode: TerminalRowMode; start?: number }): string[];
  toggleSeparator(strip: string, no: string): void;
  /** Assegna un articolo ai morsetti indicati (tutti i piani e le rappresentazioni) */
  assignTerminalPart(strip: string, nos: string[], partNr: string): void;
  syncStripPages(): void;
  /** Pagine disegnate dai dati: una per cavo (cablaggio), una per connettore (piedinatura) o lo schema d'insieme */
  syncDrawingPages(kind: DrawingKind): void;
  /** Finestra di dialogo aperta */
  dialog: Dialog;
  setDialog(d: Dialog): void;
  /** Lingua dell'interfaccia (menu, finestre, messaggi) */
  uiLang: UiLang;
  setUiLang(l: UiLang): void;
  /** Filo il cui potenziale è evidenziato su tutte le pagine (null = nessuno) */
  highlight: string | null;
  setHighlight(wireId: string | null): void;
  /** Applica pagine scritte nel formato testo (annullabile); senza errori sostituisce o aggiunge le pagine */
  importText(text: string): TextImportResult;
  /** Barra strumenti con le scritte sotto le icone (spenta: solo icone, più compatta) */
  toolbarLabels: boolean;
  setToolbarLabels(v: boolean): void;
  uiStyle: UiStyle;
  setUiStyle(v: UiStyle): void;
  /** Barra multifunzione ridotta alle sole schede (Ctrl+F1): si apre con un clic sulla scheda */
  ribbonCollapsed: boolean;
  setRibbonCollapsed(v: boolean): void;
  /** Punti della griglia sullo schema: 'auto' quando si è abbastanza ingranditi, 'off' mai */
  gridMode: 'auto' | 'off';
  setGridMode(v: 'auto' | 'off'): void;
  /** Aggancio ai punti di connessione e ai vertici dei fili (spento: solo griglia) */
  objectSnap: boolean;
  setObjectSnap(v: boolean): void;
  /** Barra degli strumenti di disegno sopra lo schema */
  activeBar: boolean;
  setActiveBar(v: boolean): void;
  /** Striscia delle miniature delle pagine sotto lo schema */
  pageStrip: boolean;
  setPageStrip(v: boolean): void;
  /** Mappa del foglio in un angolo quando lo schema è ingrandito */
  minimap: boolean;
  setMinimap(v: boolean): void;
  /** Menu a raggiera con il tasto destro al posto dell'elenco (l'elenco resta dal centro del menu) */
  radialMenu: boolean;
  setRadialMenu(v: boolean): void;
  /** Animazioni leggere dell'interfaccia (menu, finestre, barra) */
  animations: boolean;
  setAnimations(v: boolean): void;
  /** Zoom dello schema aperto in % (100 = pagina intera), null se lo schema non è a video */
  zoom: number | null;
  /** Ora dell'ultimo salvataggio del file (o della sua apertura), per la barra di stato */
  savedAt: number | null;
  setTheme(t: Theme): void;
  setSheet(s: Sheet): void;

  /** Modifica del progetto come un passo da annullare; rifiutata se il progetto è rilasciato o si guarda una revisione (tranne force) */
  commit(fn: (p: Project) => void, force?: boolean): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project, filePath?: string): void;
  /** Altri progetti aperti insieme a quello attivo (ognuno con la sua cronologia e la pagina aperta) */
  others: OpenProject[];
  /** Apre un progetto accanto a quelli aperti e lo rende attivo */
  openAlongside(p: Project, filePath?: string): void;
  /** Rende attivo un altro progetto aperto (con la pagina indicata) */
  switchProject(key: string, pageId?: string): void;
  /** Chiude un progetto aperto che non è quello attivo (le modifiche non salvate si perdono) */
  closeOther(key: string): void;
  /** Chiude il progetto attivo e attiva il primo degli altri */
  closeActive(): void;
  /** Pagina copiata (anche da un altro progetto aperto) da incollare con «Incolla pagina» */
  pageClipboard: { title: string; type: Page['type']; panelCode?: string; from: string; clip: ClipData } | null;
  copyPage(pageId: string, fromKey?: string): void;
  pastePage(after?: string): void;
  markSaved(filePath?: string): void;

  setPage(id: string): void;
  /** Pagina nuova dopo quella indicata: in fondo il numero dopo il più alto, in mezzo un numero con lettera (12A) */
  /** Pagina nuova dopo quella indicata, con il numero proposto (vedi proposePageName) o quello scelto */
  addPage(after?: string, name?: string): void;
  /** Mette tutte le pagine numerate in ordine di numero */
  sortPages(): void;
  deletePage(id: string): void;
  updatePage(id: string, patch: Partial<Page>): void;
  movePage(id: string, delta: number): void;
  updateInfo(patch: Partial<ProjectInfo>): void;
  updateSettings(patch: Partial<ProjectSettings>): void;
  renumber(): void;
  renumberWires(): void;

  setTool(t: Tool): void;
  setSelection(ids: string[]): void;
  setTreeSel(s: TreeSel): void;
  setView(v: View): void;
  setCursor(p: Pt): void;

  placeSymbol(symbolId: string, at: Pt, rot: SymbolInstance['rot'], partNr?: string, tag?: string): SymbolInstance | undefined;
  /** Riferimento a coppie: il clic successivo disegna la rappresentazione del contatto (anche su un'altra pagina) */
  startRepresentation(instId: string): void;
  placeRepresentation(realId: string, at: Pt, rot: SymbolInstance['rot']): SymbolInstance | undefined;
  addElements(els: Element[]): void;
  /** Filo disegnato: si spezza sui punti di connessione che attraversa */
  /** Disegna un filo; bundle: bus di conduttori con quel nome ("" = senza nome). Restituisce il filo nuovo */
  addWire(points: Pt[], bus?: string, bundle?: string): Wire;
  /** Conduttore del bus a cui si collega un estremo del filo (0 iniziale, 1 finale; "" = nessuno) */
  setWireTap(wireId: string, end: 0 | 1, name: string): void;
  /** Bus fili: conduttore ai fili che lo toccano sulla sua pagina, da sinistra a destra (vedi nameTapsInOrder) */
  nameBundleTaps(bundleWireId: string): number;
  /** Bus scelto nella vista Bus fili (un suo tratto) */
  bundleSel?: string;
  setBundleSel(wireId: string | undefined): void;
  /** Collegamento rapido (tasti V e H) nel punto indicato; false se non c'è niente da collegare */
  quickWire(at: Pt, axis: 'h' | 'v'): boolean;
  /** Filo in alto o in basso nella posizione fissa delle impostazioni (un passo dopo quelli già messi) */
  addRailWire(which: 'top' | 'bottom'): void;
  /** Allinea gli elementi selezionati */
  alignSelection(mode: AlignMode): void;
  /** Numeri filo di più fili in un colpo solo (una sola voce di annullamento) */
  setWireLabelsMany(labels: Map<string, WireLabelPos[]>): void;
  /** Numeri filo messi sulla linea tracciata da p a q (strumento «Allinea numeri filo») */
  wireLabelsOnLine(p: Pt, q: Pt): number;
  /** Sposta a mano un testo del simbolo sullo schema (undefined = di nuovo nella posizione del simbolo) */
  setTextOffset(instId: string, key: TextMoveKey, off: Pt | undefined): void;
  /** Tutti i testi dei simboli indicati di nuovo nella posizione del simbolo */
  resetTextOffsets(instIds: string[]): void;
  /** Mette un altro simbolo al posto di quello dell'elemento: sigla, dati e fili restano */
  replaceSymbol(instId: string, symbolId: string): void;
  /** Morsetti o pin di connettore selezionati: tutti nella morsettiera (o connettore) indicata, con lo stesso numero */
  setStripMany(instIds: string[], strip: string): void;
  /** Mostra o nasconde sullo schema la proprietà di tutti i simboli indicati (per i dispositivi vale per tutti i loro elementi) */
  setSymShowMany(instIds: string[], key: SymVisKey, on: boolean): void;
  updateElement(id: string, patch: Partial<SymbolInstance> | Partial<Wire> | Record<string, unknown>): void;
  /**
   * Il dispositivo diventa un articolo riutilizzabile: codice nuovo (o quello che ha già) con
   * costruttore, tipo, codice ordine e dati tecnici scritti; la descrizione fa da descrizione
   * dell'articolo se questo non ne ha una. Apre l'articolo nella vista Articoli, da completare.
   */
  deviceToPart(instId: string, partNr: string): void;
  /** Sostituisce i dati dell'utente (già uniti con mergeUserData) e li salva nell'archivio */
  applyUserData(d: { library: Part[]; symbols: SymbolDef[]; macros: Macro[]; templates: ProjectTemplate[]; titleBlocks: TitleBlockTemplate[]; favorites: string[] }): void;
  /** Proprietà copiate da un dispositivo (tutti i dati tranne la sigla), da incollare su altri */
  propClipboard: { tag: string; props: Partial<Pick<SymbolInstance, DeviceField>> } | null;
  /** Copia descrizione, articolo, codici, dati tecnici e proprietà del dispositivo, non la sigla */
  copyDeviceProps(instId: string): void;
  /** Incolla le proprietà copiate sui dispositivi degli elementi indicati (sostituiscono le loro) */
  pasteDeviceProps(instIds: string[]): void;
  /** Aggiorna i dati del dispositivo su tutti i suoi elementi (bobina e contatti) */
  updateDevice(instId: string, patch: Partial<Pick<SymbolInstance, DeviceField>>): void;
  /** Modifica in blocco di più dispositivi, annullabile in un passo solo */
  updateDevices(changes: { instId: string; patch: Partial<Pick<SymbolInstance, DeviceField>> }[]): void;
  /** Cambia la sigla di un dispositivo su tutti i suoi elementi; false se la sigla è già usata */
  renameDevice(from: string, to: string): boolean;
  /**
   * Dà all'elemento la sigla di un dispositivo esistente e lo unisce a quel dispositivo: i dati del
   * dispositivo (descrizione, articolo…) restano quelli dell'esistente dove li ha già.
   */
  mergeIntoDevice(instId: string, tag: string): void;
  /** Aggiorna un simbolo su qualunque pagina (usato dalla vista PLC) */
  updateInstance(id: string, patch: Partial<SymbolInstance>): void;
  /** Collega il rimando a quello indicato ("" = nessun corrispondente) */
  pairLinks(id: string, to: string): void;
  /** Gruppo I/O PLC: cambia scheda, primo canale, numero di canali, morsetti per canale o canali nascosti */
  updatePlcGroup(gid: string, patch: Partial<PlcGroupCfg>): void;
  /** Mostra o nasconde sullo schema una proprietà di tutti i canali del gruppo */
  setPlcGroupShow(gid: string, key: SymVisKey, on: boolean): void;

  /** Nuova scheda; con tag la scheda prende quella sigla (es. di un componente già nello schema) */
  addPlcCard(typeId: string, station?: string, tag?: string): PlcCard;
  updatePlcCard(id: string, patch: Partial<PlcCard>): void;
  deletePlcCard(id: string): void;
  movePlcCard(id: string, delta: number): void;
  reassignPlcAddresses(): void;
  addPlcCardFromPart(partNr: string, channels: Partial<Record<IoKind, number>>, tag?: string, station?: string): PlcCard | undefined;
  /** I simboli con la sigla indicata passano alla scheda PLC cardTag (diventano suoi elementi) */
  linkToPlcCard(fromTag: string, cardTag: string): void;
  importPlcTags(rows: TagImportRow[], source: string): TagImportResult;
  /** Crea/aggiorna le pagine panoramiche delle schede PLC */
  syncPlcOverviews(): void;
  deleteSelection(): void;
  setWireNumber(wireId: string, number: string): void;
  /** Posizioni del numero filo scelte a mano (undefined = posizione automatica) */
  setWireLabels(wireId: string, labels: Wire['labels']): void;
  /**
   * Sezione e colore dei fili indicati. Possono variare lungo lo stesso conduttore
   * (es. partenza 6 mm², derivazione 1,5 mm²); con wholeConductor valgono per tutto il conduttore.
   */
  /** Nuovo percorso di un filo (trascinamento di un tratto o di un vertice) */
  setWirePoints(wireId: string, points: Pt[]): void;
  /** Mostra o nasconde sullo schema numero, sezione o colore dei fili indicati */
  setWireShow(wireIds: string[], key: WireVisKey, on: boolean): void;
  /** Verso del nodo a T nel punto (braccio della linea passante a cui va il gambo); undefined = senza verso */
  setTNode(pageId: string, at: Pt, join: PinDir | undefined): void;
  /**
   * Ordine dei collegamenti di un conduttore ("idIstanza|idPunto" in catena); toglie gli ordini che
   * avevano gli stessi punti. null = di nuovo automatico per i punti indicati
   */
  setWireOrder(keys: string[], order: string[] | null): void;
  setWireProps(wireIds: string[], patch: Partial<Pick<Wire, 'cross' | 'color' | 'wireType' | 'bus' | 'poles' | 'text' | 'busCable' | 'lineType' | 'width' | 'labelSize' | 'labelColor' | 'tapSize' | 'tapColor'>>, wholeConductor?: boolean): void;
  moveSelection(dx: number, dy: number): void;
  rotateSelection(): void;
  /** Rotazione scelta nelle proprietà (solo tra quelle ammesse dal simbolo), con i collegamenti automatici */
  rotateTo(ids: string[], rot: SymbolInstance['rot']): void;
  duplicateSelection(): void;
  /** Appunti interni: restano disponibili anche aprendo un altro progetto */
  clipboard: ClipData | null;
  copySelection(): void;
  cutSelection(): void;
  /** Incolla con l'angolo in alto a sinistra nel punto indicato (di default il cursore) */
  paste(at?: Pt): void;
  mirrorSelection(): void;
  /** Dati di una stazione PLC (tipo, IP, nome Profinet) */
  updateStation(name: string, patch: Partial<PlcStation>): void;
  /** Nuova stazione PLC; false se il nome è vuoto o già usato */
  addStation(station: PlcStation): boolean;
  /** Elimina una stazione senza schede; false se ha ancora schede */
  deleteStation(name: string): boolean;
  /** Porta di un master IO-Link */
  updateIolinkPort(cardId: string, port: number, patch: Partial<IolinkPort>): void;
  /** Pagine di lista nel progetto (crea, aggiorna, toglie) */
  /** Crea e toglie le pagine di lista; quiet: senza messaggio (aggiornamento automatico) */
  syncReportPages(quiet?: boolean): void;
  /** Liste e pagine generate, una alla volta (key = gruppo, vedi lists.ts) o tutte insieme */
  updateList(key: string): void;
  deleteList(key: string): void;
  updateAllLists(quiet?: boolean): void;
  addCoverPage(): void;
  updateTitleBlock(patch: Partial<TitleBlock>): void;
  /** Modelli di progetto (libreria personale) */
  templates: ProjectTemplate[];
  saveTemplate(name: string): void;
  deleteTemplate(id: string): void;
  newFromTemplate(id: string): void;
  /** Profili di impostazioni (libreria personale, punto 90c) */
  profiles: SettingsProfile[];
  /** Salva un profilo nuovo dalle parti indicate delle impostazioni del progetto (stesso nome = sostituito) */
  saveProfile(name: string, parts: string[], description?: string, lock?: SettingsProfile['lock']): SettingsProfile;
  /** Aggiunge un profilo letto da file (un nome già usato prende un numero) */
  addProfile(p: SettingsProfile): SettingsProfile;
  updateProfile(id: string, patch: Partial<Pick<SettingsProfile, 'name' | 'description'>>): void;
  /** Rilegge dal progetto le parti indicate del profilo */
  refreshProfile(id: string, parts: string[]): void;
  deleteProfile(id: string): void;
  /** Profilo per i progetti nuovi (undefined = nessuno) */
  setDefaultProfile(id: string | undefined): void;
  /** Applica al progetto le parti indicate del profilo (un passo da annullare); le parti bloccate da un altro profilo restano */
  applyProfile(p: SettingsProfile, parts?: string[]): void;
  /** Morsetti dei dispositivi presi dagli articoli (sigle indicate, assenti = tutti) */
  pinsFromArticles(tags?: string[]): void;
  /**
   * Nomi dall'indirizzo PLC per i fili selezionati (e per quelli dei punti PLC selezionati): il nome
   * si fissa sul filo e passa ai suoi rimandi, anche con l'impostazione automatica spenta
   */
  wiresFromPlc(): void;
  /** Applica le correzioni proposte dai controlli (un solo passo da annullare) */
  applyFixes(fixes: IssueFix[]): void;
  /** Toglie il blocco delle impostazioni (la password si controlla prima, vedi unlockOk) */
  unlockSettings(): void;
  /** Lista aperta nella finestra dell'impaginazione */
  styleList: string;
  openReportStyle(title: string): void;
  /** Tipo di pagina disegnata nella finestra della grafica */
  drawingStyleKind: DrawingStyleKind;
  openDrawingStyle(kind: DrawingStyleKind): void;
  /** «Personalizza la lista» della pagina generata indicata (false se la pagina non è una lista) */
  openListStyleOf(page: Page): boolean;
  /** Impaginazione di una lista: patch dei dati generali (undefined = tutto di serie) */
  setReportStyle(title: string, patch: Partial<ReportStyle> | undefined): void;
  /** Impaginazione di una colonna di una lista (nome originale della colonna) */
  setReportColumn(title: string, key: string, patch: Partial<ReportColumnStyle>): void;
  /** Rilascia una revisione (indice, data, autore, descrizione): archivia il progetto e lo mette in sola lettura */
  releaseRevision(r: ReleaseData): Promise<void>;
  /** Calcolo termico: aggiunge, cambia (patch) o toglie (undefined) quello del quadro indicato */
  setThermal(panelId: string, patch: Partial<ThermalCalc> | undefined): void;
  /** Verifica di un cavo: dati di calcolo (undefined li toglie) */
  setCableCalc(cableId: string, patch: Partial<CableCalc> | undefined): void;
  /** Rinumera le pagine di progetto nell'ordine attuale (comando esplicito, chiude i buchi) */
  renumberPages(start: number, step: number): void;
  /** Segnala come verificate (accettate) le segnalazioni dei controlli, con il motivo; note undefined le riattiva */
  acceptIssues(keys: string[], note: string | undefined, accept: boolean): void;
  /** Nota di una modifica della revisione aperta ("pageId:elementId"); undefined la toglie */
  setRevisionNote(key: string, note: RevisionNote | undefined): void;
  /** Apre una revisione nuova dopo l'ultima rilasciata (il progetto torna modificabile) */
  openRevision(): void;
  /** Annulla la revisione aperta: torna all'ultima rilasciata; false se non c'è la copia archiviata */
  cancelRevision(): Promise<boolean>;
  /** Revisione rilasciata aperta in sola lettura al posto del progetto (con quello da rimettere) */
  viewing: { index: string; date: string; back: { project: Project; past: Project[]; future: Project[]; dirty: boolean; pageId: string } } | null;
  viewRevision(id: string): Promise<void>;
  closeRevisionView(): void;
  /** Risultato del confronto con un altro file di progetto */
  comparison: { file: string; rows: Difference[] } | null;
  setComparison(c: { file: string; rows: Difference[] } | null): void;
  /** Dati di un connettore (pin totali, descrizione, controparte) */
  updateConnector(conn: string, patch: Partial<ConnectorData>): void;
  /** Connettore nuovo (anche senza pin sullo schema), con il tipo del catalogo; ritorna la sigla */
  addConnector(type?: string, gender?: ConnectorGender): string;
  /** Inserimento dei pin liberi del connettore: ogni clic sullo schema mette il prossimo */
  placeConnectorPins(conn: string): void;
  /**
   * Cambia le sigle dei pin di connettore (sigla vecchia → nuova, es. "X10:5" → "X11:1"), tutte in
   * un passo; ids limita la modifica a quegli elementi. Il connettore nuovo prende i dati di quello
   * vecchio se non ne ha
   */
  renamePins(map: Record<string, string>, ids?: string[]): void;
  /** Quadri (sezioni del progetto) */
  /** Piano IP: reti, indirizzi assegnati in automatico */
  addIpNetwork(): void;
  updateIpNetwork(id: string, patch: Partial<IpNetwork>): void;
  deleteIpNetwork(id: string): void;
  assignIps(): void;
  /** Indirizzi di rete: IP e nome di un'interfaccia (key di netInterfaces) o di una stazione PLC senza dispositivo */
  setNetAddress(target: { key: string } | { station: string }, patch: { ip?: string; address?: string }): void;
  splitNetInterface(key: string, ports: string[]): void;
  mergeNetInterface(key: string): void;
  assignProfinetNames(): void;
  /** Lingue e dizionario di progetto */
  setLanguages(patch: Partial<LanguageSettings>): void;
  setTranslation(text: string, lang: Lang, value: string): void;
  autoTranslate(): void;
  mergeDictionary(d: Record<string, Partial<Record<Lang, string>>>): void;
  /** Traduzioni proposte da un assistente IA: entrano nel dizionario come «da verificare» */
  mergeProposedTranslations(d: Record<string, Partial<Record<Lang, string>>>, source: string): number;
  addPanel(name?: string): Panel;
  updatePanel(id: string, patch: Partial<Panel>): void;
  deletePanel(id: string): void;
  addNetworkPage(): void;
  /** Nuova pagina di un tipo (es. schema unifilare) dopo la pagina corrente, nello stesso luogo */
  addTypedPage(type: Page['type'], title: string): void;
  /** Riquadro di un quadro: usa il quadro indicato o il primo senza riquadro nella pagina (o ne crea uno) */
  addZone(x: number, y: number, w: number, h: number, panelId?: string): void;
  /** Ultimo protocollo scelto per i collegamenti di rete */
  busProtocol: string;
  setBusProtocol(p: string): void;
  /** Nuova pagina di layout del quadro */
  addLayoutPage(): void;
  /** Modifica il layout della pagina indicata (una voce di annullamento) */
  updateLayout(pageId: string, fn: (l: Layout) => void): void;
  autoLayout(pageId: string, opts?: AutoLayoutOptions): void;
  /** Macro della libreria personale (circuiti riutilizzabili) */
  macros: Macro[];
  saveMacro(name: string, category: string, description?: string): void;
  addMacros(list: Macro[]): void;
  deleteMacro(id: string): void;
  placeMacro(id: string, at: Pt): void;
  /** Cartigli personali (disponibili in tutti i progetti) */
  tbLibrary: TitleBlockTemplate[];
  /** Cartiglio in modifica nell'editor (stessa vista dell'editor dei simboli) */
  editTitleBlock: TitleBlockTemplate | null;
  openTitleBlockEditor(tpl?: TitleBlockTemplate): void;
  /** Salva il cartiglio nel progetto e nella libreria personale; restituisce il modello salvato */
  saveTitleBlock(tpl: TitleBlockTemplate): TitleBlockTemplate;
  deleteTitleBlock(id: string): void;
  /** Usa il modello per tutto il progetto o, con pageId, solo per quella pagina (id vuoto = come il progetto) */
  useTitleBlock(id: string, pageId?: string): void;
  /** Simbolo in modifica nell'editor dei simboli */
  editSymbol: SymbolDef | null;
  openSymbolEditor(sym?: SymbolDef): void;
  /**
   * Salva il simbolo con lo stesso nome: libreria personale e tutti i componenti del progetto che lo
   * usano. Un simbolo di base diventa una copia personale che lo sostituisce nel progetto; la scatola
   * nera di un articolo resta il simbolo dell'articolo.
   */
  saveSymbol(sym: SymbolDef): SymbolDef;
  /** Salva come simbolo nuovo, con un altro nome, solo nella libreria personale: lo schema non cambia */
  saveSymbolAs(sym: SymbolDef, name: string): SymbolDef;
  /** Torna al simbolo di base: toglie dalla libreria la copia che lo sostituisce (lo schema non cambia) */
  restoreBuiltin(copyId: string): void;
  /** Nuova linea di definizione cavo: crea un cavo nuovo o si riferisce a uno esistente */
  addCableLine(a: Pt, b: Pt, cableId?: string): void;
  /** Linea di definizione dei fili tra a e b: prende i valori del primo filo che li ha e li dà a tutti */
  addWireDef(a: Pt, b: Pt): void;
  updateCable(id: string, patch: Partial<Cable>): void;
  /** Linea principale del cavo (porta tipo e dati): una sola per cavo; false = torna la prima del progetto */
  setMainCableLine(lineId: string, on: boolean): void;
  /** Proprietà di cavo copiate (tutto tranne la sigla) */
  cableClipboard: CableClip | null;
  copyCableProps(id: string): void;
  pasteCableProps(ids: string[]): void;
  /** Stessi dati su più cavi insieme (pannello Cavi) */
  updateCables(ids: string[], patch: Partial<Cable>): void;
  /** Numeri o colori: i conduttori dei cavi si rinominano, le scelte a mano seguono la posizione */
  setCableMarking(ids: string[], marking: CableMarking): void;
  /** Tipologia del cavo da un articolo cavo: tutti i suoi conduttori, sezione e schermo */
  applyCableType(ids: string[], partNr: string): void;
  /** Nome (numero o colore) di un conduttore; i fili assegnati a mano lo seguono */
  renameConductor(cableId: string, index: number, name: string): void;
  /** Conduttore scelto a mano per un filo (vuoto = automatico) */
  assignConductor(cableId: string, wireId: string, name: string): void;
  /** Riassegna in ordine di pagina i conduttori automatici dei cavi (quelli scelti a mano restano) */
  reassignConductors(cableIds: string[]): void;
  deleteCable(id: string): void;
  replaceInProject(hits: SearchHit[], query: string, replacement: string, o: SearchOpts): void;
  duplicatePage(id: string, opts?: { name?: string; title?: string; panelId?: string }): void;

  addPartsToLibrary(parts: Part[], source: string): void;
  addSymbolsToLibrary(symbols: SymbolDef[], source: string): void;
  /** Simboli della libreria personale nella cartella «Eliminare»: non si usano più finché non si spostano */
  deleteLibrarySymbols(ids: string[]): void;
  /** Simboli della libreria personale in un altro ramo dell'albero (anche quelli eliminati, che tornano usabili) */
  moveLibrarySymbols(ids: string[], category: string): void;
  /** Doppioni unificati: per ogni gruppo il simbolo tenuto e quelli che vanno in «Eliminare» */
  unifySymbols(merges: { keep: string; others: string[] }[]): void;
  /** Scelte della finestra di confronto con la libreria (all'apertura del progetto) */
  applyLibrarySync(diffs: SymbolDiff[], choices: Record<string, SymbolChoice>): void;
  /** Simbolo da mostrare nella libreria (n cambia a ogni richiesta) */
  revealSymbol: { id: string; n: number } | null;
  revealInLibrary(symbolId: string): void;
  removeSymbolCategory(category: string): void;
  updatePart(partNr: string, patch: Partial<Part>): void;
  removePart(partNr: string): void;
  /** Toglie più articoli dalla libreria (i progetti conservano i loro) */
  removeParts(partNrs: string[]): void;
  /** Toglie l'articolo dal progetto aperto: dalla copia del progetto e da dispositivi, morsetti, cavi… */
  removePartFromProject(partNr: string): void;
  /**
   * Assegna l'articolo agli elementi. Un codice che non è né in libreria né nel progetto diventa un
   * articolo nuovo della libreria, con costruttore, tipo, codice ordine e dati tecnici scritti sul
   * dispositivo (che da quel momento li prende dall'articolo)
   */
  assignPart(instIds: string[], partNr: string): void;
  /** Crea o aggiorna un articolo nella libreria personale (e nel progetto, se c'è) */
  savePart(partNr: string, patch: Partial<Part>): void;
  /** Articoli completi (es. dal foglio Excel) al posto di quelli con lo stesso codice, in libreria e nel progetto */
  replaceParts(parts: Part[]): void;
  /**
   * Porta nell'articolo assegnato i dati scritti sul dispositivo (costruttore, tipo, codice ordine,
   * dati tecnici): restano nella libreria per i prossimi progetti
   */
  storeDeviceInPart(instId: string): void;
  /** Definizioni delle proprietà definite dall'utente del progetto */
  setUserPropDefs(defs: UserPropDef[]): void;
  /** Valore di una proprietà definita dall'utente ("" = toglie il valore) */
  setUserProp(target: UserPropTarget, id: string, value: string): void;
  /** Articoli aggiuntivi del dispositivo dell'elemento (copiati nel progetto dalla libreria) */
  setExtraParts(instId: string, list: ExtraPart[]): void;
  startPlacePart(partNr: string): void;

  logMsg(msg: string, level?: LogEntry['level']): void;
}

export { emptyProject } from './project';
import { emptyProject } from './project';
import { makeProfile, applyProfile as applyProfileModel, applicableParts, lockedKeys, lockedParts, type SettingsProfile } from './settingsProfiles';
import { repairQetSymbol } from '../io/qet';
import { tx, uiLang, setUiLang as setUiLangModule, type UiLang } from '../i18n/ui';

/** Passi di annullamento ricordati (preferenza del programma, Impostazioni ▸ Programma) */
export const HISTORY_DEFAULT = 100;
export function historySize(): number {
  try { const n = parseInt(localStorage.getItem('elettrocad.history') ?? '', 10); return n >= 10 && n <= 1000 ? n : HISTORY_DEFAULT; } catch { return HISTORY_DEFAULT; }
}
export function setHistorySize(n: number | undefined) {
  try { if (n === undefined) localStorage.removeItem('elettrocad.history'); else localStorage.setItem('elettrocad.history', String(n)); } catch { /* preferenza non salvabile */ }
}

function currentPage(p: Project, pageId: string): Page {
  return p.pages.find(x => x.id === pageId) ?? p.pages[0];
}

let lastReadOnlyWarning = 0;
/** Avviso (al massimo uno ogni pochi secondi) quando una modifica viene rifiutata */
function readOnlyWarning(s: { viewing: { index: string } | null; project: Project; logMsg(m: string, l?: 'info' | 'warn' | 'error'): void }) {
  if (Date.now() - lastReadOnlyWarning < 4000) return;
  lastReadOnlyWarning = Date.now();
  if (s.viewing) s.logMsg(tx('Stai guardando la revisione {0} archiviata: è in sola lettura', s.viewing.index), 'warn');
  else s.logMsg(tx('Progetto rilasciato (revisione {0}): è in sola lettura. Per modificarlo apri una revisione nuova (Progetto ▸ Revisioni)', lastRevision(s.project)?.index ?? ''), 'warn');
}

/** Cavi del progetto che usano l'articolo con conduttori diversi dai suoi */
const cablesUse = (p: Project, part: Part) => !!part.cable?.conductors.length && (p.cables ?? []).some(c => c.partNr === part.partNr && differsFromPart(c, part));

/** Articolo cavo cambiato: i cavi che lo usano prendono i suoi conduttori (con un messaggio) */
function followPart(p: Project, part: Part | undefined) {
  if (!part) return;
  const tags = syncCablesWithPart(p, part);
  if (tags.length) queueMicrotask(() => useStore.getState().logMsg(tx('Cavi con i conduttori dell\'articolo {0} cambiato: {1}', part.partNr, tags.map(t => `-${t}`).join(', '))));
}

export const useStore = create<State>((set, get) => {
  const p0 = emptyProject();
  return {
    project: p0,
    pageId: p0.pages[0].id,
    selection: [],
    tool: { kind: 'select' },
    treeSel: { type: 'project' },
    view: 'schema',
    past: [],
    future: [],
    library: [],
    symbolLibrary: [],
    symbolDir: '',
    favorites: [],
    log: [],
    dirty: false,
    cursor: { x: 0, y: 0 },
    theme: loadPref<Theme>('theme', 'system', ['system', 'light', 'dark']),
    sheet: loadPref<Sheet>('sheet', 'auto', ['white', 'dark', 'auto']),
    setTheme(t) { savePref('theme', t); set({ theme: t }); },
    dialog: null,
    setDialog(d) { set({ dialog: d }); },
    uiLang: uiLang(),
    setUiLang(l) { setUiLangModule(l); set({ uiLang: l }); },
    highlight: null,
    setHighlight(id) { set({ highlight: id }); },
    importText(text) {
      let r: TextImportResult = { errors: [], warnings: [], replaced: [], added: [], elements: 0 };
      const trial = importPagesText(structuredClone(get().project), text);
      if (trial.errors.length) return trial;
      get().commit(p => { r = importPagesText(p, text); });
      const pg = get().project.pages.find(x => x.name === (r.added[0] ?? r.replaced[0]));
      if (pg) set({ pageId: pg.id, view: 'schema', selection: [] });
      get().logMsg(tx('Testo applicato: {0}, {1} elementi', [r.replaced.length && `${r.replaced.length} pagine sostituite (${r.replaced.join(', ')})`, r.added.length && `${r.added.length} pagine nuove (${r.added.join(', ')})`].filter(Boolean).join(', '), r.elements));
      return r;
    },
    toolbarLabels: loadPref<'1' | '0'>('toolbarLabels', '1', ['1', '0']) === '1',
    setToolbarLabels(v) { savePref('toolbarLabels', v ? '1' : '0'); set({ toolbarLabels: v }); },
    uiStyle: loadPref<UiStyle>('uiStyle', 'ribbon', ['ribbon', 'compact', 'classic']),
    setUiStyle(v) { savePref('uiStyle', v); set({ uiStyle: v }); },
    gridMode: loadPref<'auto' | 'off'>('gridMode', 'auto', ['auto', 'off']),
    setGridMode(v) { savePref('gridMode', v); set({ gridMode: v }); },
    objectSnap: loadPref<'1' | '0'>('objectSnap', '1', ['1', '0']) === '1',
    setObjectSnap(v) { savePref('objectSnap', v ? '1' : '0'); set({ objectSnap: v }); },
    activeBar: loadPref<'1' | '0'>('activeBar', '1', ['1', '0']) === '1',
    setActiveBar(v) { savePref('activeBar', v ? '1' : '0'); set({ activeBar: v }); },
    pageStrip: loadPref<'1' | '0'>('pageStrip', '1', ['1', '0']) === '1',
    setPageStrip(v) { savePref('pageStrip', v ? '1' : '0'); set({ pageStrip: v }); },
    minimap: loadPref<'1' | '0'>('minimap', '1', ['1', '0']) === '1',
    setMinimap(v) { savePref('minimap', v ? '1' : '0'); set({ minimap: v }); },
    radialMenu: loadPref<'1' | '0'>('radialMenu', '0', ['1', '0']) === '1',
    setRadialMenu(v) { savePref('radialMenu', v ? '1' : '0'); set({ radialMenu: v }); },
    animations: loadPref<'1' | '0'>('animations', '1', ['1', '0']) === '1',
    setAnimations(v) { savePref('animations', v ? '1' : '0'); set({ animations: v }); },
    zoom: null,
    savedAt: null,
    ribbonCollapsed: loadPref<'1' | '0'>('ribbonCollapsed', '0', ['1', '0']) === '1',
    setRibbonCollapsed(v) { savePref('ribbonCollapsed', v ? '1' : '0'); set({ ribbonCollapsed: v }); },
    setSheet(v) { savePref('sheet', v); set({ sheet: v }); },
    setStripSel(strip) { set({ stripSel: strip }); },
    setConnSel(conn) { set({ connSel: conn }); },
    setDistSel(id) { set({ distSel: id }); },
    addDistributor(kind) {
      const d = newDistributor(get().project, kind);
      get().commit(p => { (p.distributors ??= []).push(d); syncDistSymbols(p); });
      set({ distSel: d.id });
      return d.id;
    },
    updateDistributor(id, patch) {
      get().commit(p => {
        const d = p.distributors?.find(x => x.id === id);
        if (!d) return;
        const oldTag = d.tag;
        Object.assign(d, patch);
        if (!d.description) delete d.description;
        if (!d.partNr) delete d.partNr;
        copyPart(p, get().library, d.partNr);
        for (const pg of p.pages) {
          pg.elements = pg.elements.filter(e => {
            const of = e.kind === 'symbol' ? distOf(p, e.symbolId) : undefined;
            // Gruppi tolti: i loro simboli spariscono dallo schema
            if (e.kind === 'symbol' && isDistSymbol(e.symbolId) && e.symbolId.startsWith(`dist:${id}:`) && !of) return false;
            if (e.kind === 'symbol' && of?.d.id === id && e.tag === oldTag) e.tag = d.tag;
            return true;
          });
        }
        syncDistSymbols(p);
      });
    },
    deleteDistributor(id) {
      get().commit(p => {
        p.distributors = (p.distributors ?? []).filter(x => x.id !== id);
        for (const pg of p.pages) pg.elements = pg.elements.filter(e => !(e.kind === 'symbol' && e.symbolId.startsWith(`dist:${id}:`)));
        syncDistSymbols(p);
      });
      if (get().distSel === id) set({ distSel: undefined });
    },
    placeDistGroup(id, gi) {
      const p = get().project, d = p.distributors?.find(x => x.id === id);
      if (!d?.groups.length) return;
      const placedIds = new Set(p.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' ? [e.symbolId] : []))));
      const k = gi ?? d.groups.findIndex((_, i) => !placedIds.has(distSymbolId(d, i)));
      if (k < 0) { get().logMsg(tx('-{0}: tutti i gruppi sono già sullo schema', d.tag)); return; }
      set({ tool: { kind: 'place', symbolId: distSymbolId(d, k), rot: 0, tag: d.tag }, view: 'schema' });
      get().logMsg(tx('Clic sullo schema per mettere -{0} {1}; poi il gruppo successivo, Esc per finire', d.tag, d.groups[k].name));
    },
    setCableSel(id) { set({ cableSel: id }); },
    reportTab: '',
    setReportTab(t) { set({ reportTab: t }); },
    updateStrip(strip, patch) {
      get().commit(p => {
        const d = ensureStrip(p, strip);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') delete (d as unknown as Record<string, unknown>)[k];
          else (d as unknown as Record<string, unknown>)[k] = v;
        }
        // Gli articoli scelti vengono copiati nel progetto
        for (const k of ['partNr', 'endPlatePartNr', 'endStopPartNr', 'jumperPartNr', 'separatorPartNr'] as const) copyPart(p, get().library, d[k]);
        for (const a of d.accessories ?? []) copyPart(p, get().library, a.partNr);
      });
    },
    renumberStrip(strip) {
      let n = 0;
      get().commit(p => { n = renumberStripModel(p, strip); });
      get().logMsg(tx('Morsettiera -{0} rinumerata: {1} morsetti cambiati', strip, n));
    },
    renameStrip(from, to) {
      to = to.replace(/^-/, '').trim();
      if (!to || to === from) return;
      if (/[:\s]/.test(to)) { get().logMsg(tx('Nome della morsettiera non valido: {0}', to), 'warn'); return; }
      const clash = renameStripModel(structuredClone(get().project), from, to);
      if (clash.length) { get().logMsg(tx('-{0} e -{1} hanno morsetti con lo stesso numero ({2}): rinomina prima i morsetti', from, to, clash.join(', ')), 'warn'); return; }
      const merge = allStrips(get().project).includes(to);
      get().commit(p => { renameStripModel(p, from, to); });
      if (get().stripSel === from) set({ stripSel: to });
      get().logMsg(merge ? tx('Morsettiera -{0} unita a -{1}', from, to) : tx('Morsettiera -{0} rinominata in -{1}', from, to));
    },
    renameTerminals(strip, changes) {
      const err = renameTerminalsModel(structuredClone(get().project), strip, changes);
      if (err) { get().logMsg(err, 'warn'); return false; }
      get().commit(p => { renameTerminalsModel(p, strip, changes); });
      const done = [...changes].filter(([a, b]) => a !== b.trim());
      if (done.length) get().logMsg(tx('Morsettiera -{0}: {1}', strip, done.map(([a, b]) => `${a} → ${b.trim()}`).join(', ')));
      return true;
    },
    startRepresentation(instId) {
      const real = get().project.pages.flatMap(p => p.elements).find((e): e is SymbolInstance => e.kind === 'symbol' && e.id === instId);
      if (!real || real.pairOf) return;
      set({ tool: { kind: 'place', symbolId: real.symbolId, rot: real.rot, tag: real.tag, pairOf: real.id }, view: 'schema' });
      get().logMsg(tx('Rappresentazione di -{0}: clic dove disegnarla, per esempio accanto ai poli (anche su un\'altra pagina)', real.tag));
    },
    placeRepresentation(realId, at, rot) {
      const { project, pageId } = get();
      const real = project.pages.flatMap(p => p.elements).find((e): e is SymbolInstance => e.kind === 'symbol' && e.id === realId);
      if (!real) return;
      const inst = newRepresentation(real, uid('s'), at.x, at.y, rot);
      // Solo disegno: non interrompe i fili e non si collega
      get().commit(p => { currentPage(p, pageId).elements.push(inst); });
      set({ tool: { kind: 'select' } });
      get().setSelection([inst.id]);
      return inst;
    },
    addTerminalLevel(instId) {
      const { project } = get();
      let inst: SymbolInstance | undefined;
      for (const pg of project.pages) for (const e of pg.elements) if (e.id === instId && e.kind === 'symbol') inst = e;
      if (!inst || !inst.tag.includes(':')) return;
      const strip = stripOf(inst.tag);
      let next = '';
      get().commit(p => { next = addLevel(p, strip, terminalNo(inst!.tag)); });
      set({ tool: { kind: 'place', symbolId: inst.symbolId, rot: inst.rot, tag: next, partNr: inst.partNr }, view: 'schema' });
      get().logMsg(tx('Inserisci il piano {0}: clic sullo schema (anche su un\'altra pagina)', next));
    },
    addJumper(strip, nos, kind) { get().commit(p => addJumperModel(p, strip, nos, kind)); },
    removeJumpers(strip, nos) { get().commit(p => removeFromJumpers(p, strip, nos)); },
    updateJumper(strip, id, patch) {
      get().commit(p => {
        const j = ensureStrip(p, strip).jumpers.find(x => x.id === id);
        if (j) Object.assign(j, patch);
        copyPart(p, get().library, patch.partNr);
      });
    },
    addSpares(strip, count, start, partNr, levels) {
      let added: string[] = [];
      get().commit(p => { added = addSparesModel(p, strip, count, start, partNr, levels); if (added.length) copyPart(p, get().library, partNr); });
      if (!added.length) { get().logMsg(tx('Morsettiera -{0}: il morsetto {1} esiste già', strip, start ?? ''), 'warn'); return; }
      get().logMsg(tx('Morsettiera -{0}: aggiunti {1} morsetti di riserva ({2})', strip, added.length, added.join(', ')));
    },
    removeSpares(strip, nos) { get().commit(p => removeSparesModel(p, strip, nos)); },
    placeTerminalRow(picks, opts) {
      const { project, pageId } = get();
      const plan = planTerminalRow(project, currentPage(project, pageId), picks, opts);
      const symbolId = preferredSymbolId('terminal', get().symbolLibrary, project);
      let ids: string[] = [], placed: string[] = [], problems = plan.problems;
      if (plan.items.length) get().commit(p => {
        ensureSymbolInProject(p, symbolId);
        const pg = currentPage(p, pageId);
        const r = applyTerminalRow(p, pg, plan.items, symbolId, opts.strip, p.terminalStrips?.[opts.strip]?.partNr);
        ids = r.ids; placed = r.nos; problems = [...problems, ...r.problems];
      });
      for (const m of [...new Set(problems)]) get().logMsg(m, 'warn');
      if (ids.length) {
        get().logMsg(tx('Morsettiera -{0}: inseriti {1} morsetti ({2})', opts.strip, ids.length, placed.join(', ')));
        set({ tool: { kind: 'select' }, stripSel: opts.strip });
        get().setSelection(ids);
      }
      return placed;
    },
    toggleSeparator(strip, no) {
      get().commit(p => {
        const d = ensureStrip(p, strip);
        d.separators = d.separators.includes(no) ? d.separators.filter(x => x !== no) : [...d.separators, no];
      });
    },
    assignTerminalPart(strip, nos, partNr) {
      const set_ = new Set(nos);
      get().commit(p => {
        copyPart(p, get().library, partNr);
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || !e.tag.includes(':') || stripOf(e.tag) !== strip) continue;
          if (getSymbol(e.symbolId, p)?.role !== 'terminal') continue;
          // Tutti i piani dello stesso morsetto hanno lo stesso articolo
          const no = terminalNo(e.tag);
          const base = parseTerminalNo(no).base;
          if (set_.has(no) || nos.some(n => parseTerminalNo(n).base === base)) {
            if (partNr) e.partNr = partNr; else delete e.partNr;
          }
        }
        // Morsetti di riserva selezionati: l'articolo resta nei dati della morsettiera
        setSparePart(p, strip, nos, partNr || undefined);
      });
    },
    syncDrawingPages(kind) {
      let r = { added: 0, removed: 0 };
      get().commit(p => { r = syncDrawingPagesModel(p, kind, get().library); });
      const what = kind === 'cable' ? tx('Disegni dei cavi') : kind === 'connector' ? tx('Piedinature dei connettori') : tx('Schema d\'insieme');
      get().logMsg(r.added || r.removed ? tx('{0}: {1} pagine aggiunte{2}', what, r.added, r.removed ? `, ${r.removed} rimosse` : '') : tx('{0}: pagine già aggiornate', what));
      // Si va alla prima pagina del tipo
      const pg = get().project.pages.find(x => x.type === kind);
      if (pg) get().setPage(pg.id);
    },
    syncStripPages() {
      let r = { added: 0, removed: 0 };
      get().commit(p => { r = syncStripPages(p); });
      get().logMsg(tx('Schemi delle morsettiere: {0} pagine aggiunte{1}', r.added, r.removed ? `, ${r.removed} rimosse` : ''));
    },

    commit(fn, force) {
      const before = get().project;
      if (!force && (get().viewing || isReleased(before))) { readOnlyWarning(get()); return; }
      const next = structuredClone(before);
      // Con la numerazione bloccata i numeri vengono fissati prima della modifica (così
      // il nuovo filo non fa scalare gli altri) e dopo (per numerare i conduttori nuovi)
      const fixed = () => settingsOf(next).wireNumbering === 'fixed';
      // Conduttori dei cavi: quelli già assegnati restano ai loro fili (un filo nuovo prende il primo libero).
      // I collegamenti si calcolano una volta per i due blocchi (i numeri non cambiano i conduttori).
      const lock = () => withNetlistCache(next, () => { if (fixed()) lockWireNumbers(next); lockCableConductors(next); });
      lock();
      fn(next);
      // Post-elaborazione con una sola rete in cache: dopo ogni passo che cambia qualcosa la cache si butta
      // (la rete calcolata prima di fn non vale: fn può aver cambiato i fili, quindi la cache si apre solo ora)
      withNetlistCache(next, () => {
        const stale = (n: number) => { if (n) invalidateNetlist(next); };
        lock();
        // Fili del PLC con il nome dall'indirizzo: i loro rimandi prendono lo stesso nome
        stale(syncPlcLinkNames(next));
        // Rappresentazioni dei contatti (riferimenti a coppie): sigla e morsetti del contatto vero
        stale(syncPairs(next));
        // Stazioni WAGO (prima gli analogici): una scheda nuova rifà gli indirizzi della stazione
        stale(keepAnalogFirst(next).length);
        // I collegamenti di rete nuovi (disegnati, incollati o cambiati in bus) ricevono la sigla del cavo
        stale(assignBusCableTags(next));
        // Tratti uniti dai rimandi dopo essere stati disegnati: la sigla automatica diventa quella del cavo
        stale(unifyBusCableTags(next));
        // Rimandi dei cavi di rete: si chiamano come il cavo
        syncBusLinkNames(next);
      });
      // Pagine generate in blocchi nell'ordine scelto, con la loro numerazione (IND.1, MOR.2…)
      arrangePages(next);
      registerPageNumbers(next);
      set(s => ({ project: next, past: [...s.past.slice(-historySize() + 1), before], future: [], dirty: true }));
    },
    undo() {
      const { past, project, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selection: [], dirty: true });
      if (!prev.pages.some(pg => pg.id === get().pageId)) set({ pageId: prev.pages[0].id });
    },
    redo() {
      const { past, project, future } = get();
      if (!future.length) return;
      const next = future[0];
      set({ project: next, past: [...past, project], future: future.slice(1), selection: [], dirty: true });
      if (!next.pages.some(pg => pg.id === get().pageId)) set({ pageId: next.pages[0].id });
    },
    loadProject(p, filePath) {
      p.customSymbols = p.customSymbols.map(repairQetSymbol);
      migrateAuxDescriptions(p);
      p.parts = repairPartCables(p.parts) ?? p.parts;
      if (settingsOf(p).wireNumbering === 'fixed') lockWireNumbers(p);
      arrangePages(p);
      set({ viewing: null, project: p, pageId: p.pages[0]?.id ?? '', past: [], future: [], selection: [], dirty: false, filePath, savedAt: filePath ? Date.now() : null, treeSel: { type: 'project' }, view: 'schema' });
    },
    others: [],
    openAlongside(p, filePath) {
      if (get().viewing) { get().logMsg(tx('Chiudi prima la revisione che stai guardando'), 'warn'); return; }
      const cur = slotOf(get());
      get().loadProject(p, filePath);
      set({ others: [...get().others, cur] });
    },
    switchProject(key, pageId) {
      const s = get();
      const next = s.others.find(o => o.key === key);
      if (!next) { if (pageId) s.setPage(pageId); return; }
      if (s.viewing) { s.logMsg(tx('Chiudi prima la revisione che stai guardando'), 'warn'); return; }
      const cur = slotOf(s);
      set({
        others: [...s.others.filter(o => o.key !== key), cur],
        project: next.project, filePath: next.filePath, dirty: next.dirty, savedAt: next.savedAt, past: next.past, future: next.future,
        pageId: pageId ?? next.pageId, selection: [], treeSel: { type: 'project' }, view: 'schema',
      });
    },
    closeOther(key) { set({ others: get().others.filter(o => o.key !== key) }); },
    closeActive() {
      const [next, ...rest] = get().others;
      if (!next) return;
      set({
        others: rest, project: next.project, filePath: next.filePath, dirty: next.dirty, savedAt: next.savedAt, past: next.past, future: next.future,
        pageId: next.pageId, selection: [], treeSel: { type: 'project' }, view: 'schema', viewing: null,
      });
    },
    pageClipboard: null,
    copyPage(pageId, fromKey) {
      const s = get();
      const proj = fromKey ? s.others.find(o => o.key === fromKey)?.project ?? s.project : s.project;
      const pg = proj.pages.find(x => x.id === pageId);
      if (!pg) return;
      const panelCode = proj.panels?.find(x => x.id === pg.panelId)?.code;
      set({ pageClipboard: { title: pg.title, type: pg.type, panelCode, from: proj.info.name, clip: copyElements(proj, pg, pg.elements.map(e => e.id)) } });
      s.logMsg(tx('Pagina {0} copiata da {1}: «Incolla pagina» la mette nel progetto attivo', pg.name, proj.info.name || tx('progetto')));
    },
    pastePage(after) {
      const c = get().pageClipboard;
      if (!c) return;
      const id = uid('p');
      let name = '';
      get().commit(p => {
        // Dopo la pagina indicata o dopo l'ultima di progetto, nel quadro con lo stesso codice se c'è
        const lastOwn = p.pages.findLastIndex(x => x.type !== 'cover' && !isGenerated(x));
        const idx = after ? p.pages.findIndex(x => x.id === after) + 1 : lastOwn + 1;
        const panelId = (after ? p.pages.find(x => x.id === after)?.panelId : undefined) ?? p.panels?.find(x => x.code === c.panelCode)?.id;
        name = nextProjectPageNo(p);
        p.pages.splice(Math.max(0, idx), 0, { id, name, title: c.title, type: c.type === 'cover' || isGenerated({ type: c.type } as Page) ? 'multiline' : c.type, elements: [], ...(panelId ? { panelId } : {}) });
        pasteElements(p, id, c.clip, 0, 0);
        p.pages = placeByNumber(p.pages, id);
      });
      get().setPage(id);
      get().logMsg(tx('Pagina incollata come {0} (da {1}): sigle e numeri filo nuovi', name, c.from || tx('progetto')));
    },
    markSaved(filePath) { set(s => ({ dirty: false, filePath: filePath ?? s.filePath, savedAt: Date.now() })); },

    setPage(id) { set({ pageId: id, selection: [], treeSel: { type: 'page', id }, view: 'schema' }); },
    addPage(after, name) {
      const id = uid('p');
      get().commit(p => {
        // Senza pagina di partenza: dopo l'ultima pagina di progetto (le liste generate restano al loro posto)
        const lastOwn = p.pages.findLastIndex(x => x.type !== 'cover' && !isGenerated(x));
        const idx = after ? p.pages.findIndex(x => x.id === after) + 1 : lastOwn >= 0 ? lastOwn + 1 : p.pages.length;
        const chosen = name?.trim() || proposePageName(p, after);
        // La pagina nuova resta nel quadro (sezione) della pagina da cui si parte
        const panelId = after ? p.pages.find(x => x.id === after)?.panelId : undefined;
        p.pages.splice(idx, 0, { id, name: chosen, title: 'Schema', type: 'multiline', elements: [], ...(panelId ? { panelId } : {}) });
        // Numero scelto a mano: la pagina va al suo posto nell'ordine dei numeri
        if (name?.trim()) p.pages = placeByNumber(p.pages, id);
      });
      const nm = name?.trim();
      if (nm && get().project.pages.some(x => x.id !== id && x.name.trim().toUpperCase() === nm.toUpperCase())) {
        get().logMsg(tx('C\'è già una pagina {0}: i riferimenti /{0}.… diventano ambigui', nm), 'warn');
      }
      get().setPage(id);
    },
    deletePage(id) {
      if (get().project.pages.length <= 1) return;
      get().commit(p => { p.pages = p.pages.filter(x => x.id !== id); });
      if (get().pageId === id) set({ pageId: get().project.pages[0].id });
    },
    updatePage(id, patch) {
      const old = get().project.pages.find(x => x.id === id);
      if (old && isGenerated(old) && patch.name !== undefined && patch.name !== old.name) {
        // Il nome delle pagine generate viene dal prefisso del gruppo (Pagine automatiche)
        get().logMsg(tx('Il numero delle pagine generate viene dal prefisso del loro gruppo: si cambia in «Pagine automatiche»'), 'warn');
        patch = { ...patch }; delete patch.name;
      }
      get().commit(p => {
        Object.assign(p.pages.find(x => x.id === id)!, patch);
        // Numero cambiato: la pagina va al suo posto nell'ordine dei numeri
        if (patch.name !== undefined && patch.name !== old?.name) p.pages = placeByNumber(p.pages, id);
      });
      const name = patch.name?.trim();
      if (name && name !== old?.name && get().project.pages.some(x => x.id !== id && x.name.trim().toUpperCase() === name.toUpperCase())) {
        get().logMsg(tx('C\'è già una pagina {0}: i riferimenti /{0}.… diventano ambigui', name), 'warn');
      }
    },
    sortPages() { get().commit(p => { p.pages = sortByNumber(p.pages); }); },
    movePage(id, delta) {
      get().commit(p => {
        // Una pagina generata sposta tutto il suo gruppo nell'ordine dei blocchi
        const g = p.pages.find(x => x.id === id);
        if (g && pageGroup(g)) { p.settings.pageArrangement = { ...p.settings.pageArrangement, order: moveGroup(p, pageGroup(g)!, delta) }; return; }
        const i = p.pages.findIndex(x => x.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= p.pages.length) return;
        const [pg] = p.pages.splice(i, 1);
        p.pages.splice(j, 0, pg);
      });
    },
    updateInfo(patch) { get().commit(p => { Object.assign(p.info, patch); }); },
    updateSettings(patch) {
      // Le impostazioni bloccate da un profilo aziendale non cambiano
      const locked = lockedKeys(get().project);
      const refused = (Object.keys(patch) as (keyof ProjectSettings)[]).filter(k => locked.has(k));
      if (refused.length) {
        patch = { ...patch };
        for (const k of refused) delete patch[k];
        get().logMsg(tx('Impostazione bloccata dal profilo «{0}»: per cambiarla sbloccala in Impostazioni ▸ Profili', get().project.settings.locks?.profile ?? ''), 'warn');
        if (!Object.keys(patch).length) return;
      }
      let reassigned = false;
      get().commit(p => {
        const old = settingsOf(p);
        p.settings = { ...DEFAULT_SETTINGS, ...p.settings, ...patch };
        // Cambiando il modello dei numeri filo la numerazione bloccata viene rifatta
        const s = p.settings;
        if (s.plcAddressFormat !== old.plcAddressFormat && adaptAddressFormat(p, old.plcAddressFormat, s.plcAddressFormat) === 'reassign') reassigned = true;
        if (s.wireFormat !== old.wireFormat || s.wireScope !== old.wireScope || s.wireReserve !== old.wireReserve || s.wireOrder !== old.wireOrder || s.wireKeepPotentialNames !== old.wireKeepPotentialNames) clearWireNumbers(p);
        // Righe della morsettiera più alte o più basse: cambiano i fogli che servono
        if (s.stripStyle?.rowH !== old.stripStyle?.rowH && p.pages.some(pg => pg.type === 'strip')) syncStripPages(p);
      });
      if (reassigned) get().logMsg(tx('Formato PLC cambiato: unità o aree di indirizzo diverse, indirizzi riassegnati in ordine di scheda'), 'warn');
    },
    renumber() {
      let changed = 0;
      get().commit(p => {
        for (const [a, b] of renumberDevices(p)) if (a !== b) changed++;
      });
      get().logMsg(tx('Rinumerazione dispositivi: {0} sigle modificate', changed));
    },

    setTool(t) {
      // Simbolo di base modificato (es. «Morsetto»): si posa la copia personale che ne prende il posto
      if (t.kind === 'place') t = { ...t, symbolId: preferredSymbolId(t.symbolId, get().symbolLibrary, get().project) };
      if (t.kind === 'place' && isDeletedSymbol(get().symbolLibrary.find(x => x.id === (t as { symbolId: string }).symbolId))) {
        get().logMsg(tx('Simbolo eliminato dalla libreria: per usarlo spostalo prima nell\'albero dei simboli'), 'warn');
        return;
      }
      set({ tool: t, selection: t.kind === 'select' ? get().selection : [] });
    },
    setSelection(ids) {
      // Un canale di un gruppo I/O PLC si seleziona con tutto il gruppo
      const page = get().project.pages.find(p => p.id === get().pageId);
      const groups = new Set(page?.elements.flatMap(e => (e.kind === 'symbol' && e.plcGroup && ids.includes(e.id) ? [e.plcGroup.id] : [])) ?? []);
      if (groups.size && page) ids = [...new Set([...ids, ...page.elements.filter(e => e.kind === 'symbol' && e.plcGroup && groups.has(e.plcGroup.id)).map(e => e.id)])];
      set({ selection: ids });
    },
    setTreeSel(s) { set({ treeSel: s }); },
    setView(v) { set({ view: v }); },
    setCursor(c) { set({ cursor: c }); },

    placeSymbol(symbolId, at, rot, partNr, presetTag) {
      const { project, pageId } = get();
      const sym = getSymbol(symbolId, project);
      if (!sym) return;
      if (isDeletedSymbol(get().symbolLibrary.find(x => x.id === symbolId))) {
        get().logMsg(tx('«{0}» è nella cartella {1} della libreria: per usarlo spostalo prima nell\'albero dei simboli', sym.name, 'Eliminare'), 'warn');
        return;
      }
      rot = fitRot(sym, rot);
      const page = currentPage(project, pageId);
      if (sym.role === 'plc' && !sym.io) {
        const last = project.plc.cards[project.plc.cards.length - 1];
        const card = last ?? newCard(project, 'cpu-14di-10do-2ai', nextTagFor(project, 'A', page, at.x));
        const inst: SymbolInstance = { kind: 'symbol', id: uid('s'), symbolId, x: at.x, y: at.y, rot, tag: card.tag, pinLabels: {}, autoPins: true };
        get().commit(p => {
          if (!last) p.plc.cards.push(card);
          currentPage(p, pageId).elements.push(inst);
        });
        return inst;
      }
      if (sym.plcGroup && sym.io) {
        // Gruppo I/O: la scheda indicata (dalla vista PLC) o quella del primo canale libero; il gruppo
        // parte dal primo canale libero e ha al massimo i canali rimasti sulla scheda
        let card = presetTag ? cardByTag(project, presetTag) : undefined;
        let created = false;
        if (!card || !(cardType(card).channels[sym.io] ?? 0)) {
          const alloc = allocateChannel(project, sym.io, letter => nextTagFor(project, letter, page, at.x));
          card = alloc.card; created = alloc.created;
        }
        const max = cardType(card).channels[sym.io] ?? 0;
        const first = created ? 0 : firstFreeChannel(project, card, sym.io, sym.plcGroup.count);
        const cfg: PlcGroupCfg = { tag: card.tag, kind: sym.io, first, count: Math.max(1, Math.min(sym.plcGroup.count, max - first)), terms: sym.plcGroup.slice.endsWith('2') ? 2 : 1, unused: [] };
        const gid = newGroupId();
        let ids: string[] = [];
        get().commit(p => {
          if (created) p.plc.cards.push(card!);
          const pg = currentPage(p, pageId);
          ids = buildPlcGroup(p, pg, gid, cfg, { at, rot }).ids;
          autoConnect(p, pg, ids);
        });
        if (created) get().logMsg(tx('Creata la scheda PLC -{0} ({1})', card.tag, cardType(card).name));
        get().setSelection(ids);
        const pg = currentPage(get().project, pageId);
        return pg.elements.find(e => e.id === ids[0]) as SymbolInstance | undefined;
      }
      if (sym.role === 'plc' && sym.io) {
        // Primo canale libero del tipo richiesto; se serve viene creata una scheda nuova
        const alloc = allocateChannel(project, sym.io, letter => nextTagFor(project, letter, page, at.x));
        const inst: SymbolInstance = {
          kind: 'symbol', id: uid('s'), symbolId, x: at.x, y: at.y, rot, tag: alloc.card.tag,
          pinLabels: {}, autoPins: true, plcChannel: alloc.channel,
        };
        get().commit(p => {
          if (alloc.created) p.plc.cards.push(alloc.card);
          const pg = currentPage(p, pageId);
          pg.elements.push(inst);
          autoConnect(p, pg, [inst.id]);
        });
        if (alloc.created) get().logMsg(tx('Creata la scheda PLC -{0} ({1})', alloc.card.tag, cardType(alloc.card).name));
        return inst;
      }
      let tag = '';
      if (sym.role === 'potential') tag = symbolId === 'pe' ? 'PE' : symbolId === 'fe' ? 'FE' : 'L1';
      else if (sym.role === 'link') tag = proposeLinkName(project, page);
      else if (sym.role === 'terminal') tag = presetTag ?? nextTerminal(project, lastStrip(project) ?? 'X1');
      else if (sym.role === 'pin') tag = presetTag ?? nextPin(project, lastConnector(project) ?? 'X10', get().library);
      else if (isDistSymbol(symbolId)) tag = presetTag ?? distOf(project, symbolId)?.d.tag ?? '';
      else tag = nextTagFor(project, sym.letter, page, at.x);
      const inst: SymbolInstance = {
        kind: 'symbol', id: uid('s'), symbolId, x: at.x, y: at.y, rot, tag,
        pinLabels: {}, autoPins: true, partNr,
        // Rimando nuovo: il corrispondente si sceglie subito dopo (vedi chooseLinkPartner)
        ...(sym.role === 'link' ? { linkTo: '' } : {}),
      };
      get().commit(p => {
        ensureSymbolInProject(p, symbolId);
        const pg = currentPage(p, pageId);
        pg.elements.push(inst);
        // Inserito sopra un filo: il filo si interrompe sui pin
        splitWiresAtSymbols(p, pg, new Set([inst.id]));
        autoConnect(p, pg, [inst.id]);
      });
      // Inserimento dei piani: il clic successivo inserisce il piano dopo (1B → 1C)
      const tool = get().tool;
      if (sym.role === 'terminal' && presetTag && tool.kind === 'place') {
        const strip = stripOf(presetTag);
        set({ tool: { ...tool, tag: `${strip}:${nextToPlace(get().project, strip, terminalNo(presetTag))}` } });
      }
      // Gruppo di un ripartitore: il clic successivo mette il gruppo dopo non ancora sullo schema
      if (isDistSymbol(symbolId) && tool.kind === 'place') {
        const of = distOf(get().project, symbolId);
        const placedIds = new Set(get().project.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' ? [e.symbolId] : []))));
        const next = of ? of.d.groups.findIndex((_, i) => !placedIds.has(distSymbolId(of.d, i))) : -1;
        set({ tool: next >= 0 && of ? { ...tool, symbolId: distSymbolId(of.d, next), tag: of.d.tag } : { kind: 'select' } });
      }
      // Pin di un connettore: il clic successivo mette il prossimo pin libero; finiti i pin si torna alla selezione
      if (sym.role === 'pin' && presetTag && tool.kind === 'place') {
        const conn = stripOf(presetTag), free = freePins(get().project, conn, get().library);
        if (free.length) set({ tool: { ...tool, tag: `${conn}:${free[0]}` } });
        else { set({ tool: { kind: 'select' } }); get().logMsg(tx('Connettore -{0}: tutti i pin previsti sono sullo schema', conn)); }
      }
      return inst;
    },
    addElements(els) {
      const pageId = get().pageId;
      get().commit(p => { currentPage(p, pageId).elements.push(...els); });
    },
    addWire(points, bus, bundle) {
      const pageId = get().pageId;
      const w: Wire = { kind: 'wire', id: uid('w'), points, ...(bus ? { bus } : {}), ...(bundle !== undefined ? { bundle } : {}) };
      get().commit(p => { const pg = currentPage(p, pageId); pg.elements.push(w); splitWiresAtPins(p, pg, [w.id]); });
      return w;
    },
    nameBundleTaps(bundleWireId) {
      let n = 0;
      get().commit(p => { n = nameTapsInOrder(p, bundleWireId, partsIndex(p, get().library)); });
      return n;
    },
    setBundleSel(wireId) { set({ bundleSel: wireId }); },
    setWireTap(wireId, end, name) {
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'wire' || e.id !== wireId) continue;
          const k = end ? 'tapEnd' : 'tapStart';
          if (name.trim()) e[k] = name.trim(); else delete e[k];
        }
      });
    },
    quickWire(at, axis) {
      const { project, pageId } = get();
      const pts = quickWirePath(project, currentPage(project, pageId), at, axis);
      if (!pts) return false;
      get().addWire(pts);
      return true;
    },
    addRailWire(which) {
      const { project, pageId } = get();
      const pts = nextRail(currentPage(project, pageId), settingsOf(project), which);
      if (!pts) { get().logMsg(tx('Nessun posto libero per un altro filo {0}: cambia le posizioni nelle impostazioni del progetto', which === 'top' ? tx('in alto') : tx('in basso')), 'warn'); return; }
      const w = get().addWire(pts);
      set({ selection: [w.id] });
    },
    setWireLabelsMany(labels) {
      if (!labels.size) return;
      const pageId = get().pageId;
      get().commit(p => {
        for (const w of currentPage(p, pageId).elements) {
          const l = w.kind === 'wire' ? labels.get(w.id) : undefined;
          if (w.kind === 'wire' && l?.length) w.labels = l.map(x => ({ ...x }));
        }
      });
    },
    wireLabelsOnLine(p, q) {
      const { project, pageId, library } = get();
      const page = currentPage(project, pageId);
      const pd = derive(project, library).pages.get(pageId);
      const size = (id: string) => { const w = page.elements.find(e => e.id === id); return (w?.kind === 'wire' ? w.labelSize : undefined) ?? pd?.textStyles?.[w?.kind === 'wire' && w.bundle ? 'bundleTag' : 'wireNo'].size ?? 1.8; };
      const wires = page.elements.filter((e): e is Wire => e.kind === 'wire' && !!pd?.wireNumbers.has(e.id));
      const r = labelsOnLine(wires, pd?.wireLabelPos ?? new Map(), p, q, size);
      get().setWireLabelsMany(r);
      return r.size;
    },
    setTextOffset(instId, key, off) {
      const pageId = get().pageId;
      get().commit(p => {
        const e = currentPage(p, pageId).elements.find(x => x.id === instId);
        if (e?.kind !== 'symbol') return;
        const o = { ...(e.textOffsets ?? {}) };
        if (off && (off.x || off.y)) o[key] = { x: Math.round(off.x * 100) / 100, y: Math.round(off.y * 100) / 100 }; else delete o[key];
        if (Object.keys(o).length) e.textOffsets = o; else delete e.textOffsets;
      });
    },
    resetTextOffsets(instIds) {
      const pageId = get().pageId;
      get().commit(p => { for (const e of currentPage(p, pageId).elements) if (e.kind === 'symbol' && instIds.includes(e.id)) delete e.textOffsets; });
    },
    replaceSymbol(instId, symbolId) {
      const pageId = get().pageId;
      get().commit(p => {
        const pg = currentPage(p, pageId);
        const inst = pg.elements.find((e): e is SymbolInstance => e.kind === 'symbol' && e.id === instId);
        const oldSym = inst && getSymbol(inst.symbolId, p);
        const newSym = getSymbol(symbolId, p);
        if (!inst || !oldSym || !newSym || !canReplace(inst) || oldSym.id === newSym.id) return;
        ensureSymbolInProject(p, symbolId);
        replaceSymbolModel(pg, inst, oldSym, newSym);
      });
    },
    setStripMany(instIds, strip) {
      const to = strip.replace(/^-/, '').trim();
      if (!to || to.includes(':')) return;
      const ids = new Set(instIds);
      let dup = 0;
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || !ids.has(e.id) || !e.tag.includes(':')) continue;
          const role = getSymbol(e.symbolId, p)?.role;
          if (role !== 'terminal' && role !== 'pin') continue;
          e.tag = `${to}:${e.tag.slice(e.tag.indexOf(':') + 1)}`;
        }
        // Stesso numero già usato da un altro elemento della morsettiera o del connettore
        const tags = p.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol' && e.tag.startsWith(`${to}:`));
        dup = tags.filter(e => ids.has(e.id) && tags.some(o => o.id !== e.id && o.tag === e.tag)).length;
      });
      if (dup) get().logMsg(tx('Attenzione: {0} numeri sono già usati in -{1}', dup, to));
    },
    setSymShowMany(instIds, key, on) {
      const { project } = get();
      // Rimandi, potenziali, morsetti, pin e punti PLC: la scelta è del simbolo; per gli altri del
      // dispositivo, scritta su un solo elemento (il principale se c'è) come in updateDevices
      const own = new Set<string>();
      const devs: string[][] = [];
      const seen = new Set<string>();
      for (const id of instIds) {
        if (seen.has(id)) continue;
        const e = project.pages.flatMap(pg => pg.elements).find(x => x.id === id);
        if (e?.kind !== 'symbol') continue;
        const role = getSymbol(e.symbolId, project)?.role;
        const group = role && !['potential', 'link', 'plc', 'terminal', 'pin'].includes(role) ? sameDeviceIds(project, id) : [id];
        if (group.length <= 1) { own.add(id); seen.add(id); continue; }
        group.forEach(x => seen.add(x));
        devs.push(group);
      }
      get().commit(p => {
        const byId = new Map(p.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => [e.id, e]));
        for (const id of own) { const e = byId.get(id); if (e) e.show = withShow(e.show, key, on); }
        for (const g of devs) {
          const els = g.map(id => byId.get(id)).filter((e): e is SymbolInstance => !!e);
          const main = els.find(e => getSymbol(e.symbolId, p)?.role === 'main') ?? els[0];
          const cur = [main, ...els].map(e => e.show).find(v => v !== undefined);
          for (const e of els) delete e.show;
          const next = withShow(cur, key, on);
          if (next) main.show = next;
        }
      });
    },
    alignSelection(mode) {
      const { selection, pageId, project, library } = get();
      const page = currentPage(project, pageId);
      // Solo fili selezionati: si allineano i loro numeri
      const sel = page.elements.filter(e => selection.includes(e.id));
      if (sel.length > 1 && sel.every(e => e.kind === 'wire')) {
        const pd = derive(project, library).pages.get(pageId);
        const wires = selection.map(id => sel.find(e => e.id === id)).filter((e): e is Wire => e?.kind === 'wire' && !!pd?.wireNumbers.has(e.id));
        const size = (id: string) => { const w = wires.find(x => x.id === id); return w?.labelSize ?? pd?.textStyles?.[w?.bundle ? 'bundleTag' : 'wireNo'].size ?? 1.8; };
        get().setWireLabelsMany(alignWireLabels(wires, pd?.wireLabelPos ?? new Map(), mode, size));
        return;
      }
      const els = selection.map(id => page.elements.find(e => e.id === id)).filter((e): e is Element => !!e && (e.kind === 'symbol' || e.kind === 'text'));
      if (els.length < 2) return;
      const boxes: AlignBox[] = els.map(e => {
        if (e.kind === 'text') return { ...textBounds(e), ref: { x: e.x, y: e.y } };
        const sym = e.kind === 'symbol' ? getSymbol(e.symbolId, project) : undefined;
        const b = sym && e.kind === 'symbol' ? instanceBounds(e, sym) : { x0: 0, y0: 0, x1: 0, y1: 0 };
        return { ...b, ref: { x: (e as SymbolInstance).x, y: (e as SymbolInstance).y } };
      });
      const d = alignDeltas(boxes, mode);
      get().commit(p => {
        const pg = currentPage(p, pageId);
        els.forEach((e, i) => {
          // I simboli restano sulla griglia, perché i punti di connessione restino collegabili
          const dx = e.kind === 'symbol' ? snap(d[i].x) : d[i].x, dy = e.kind === 'symbol' ? snap(d[i].y) : d[i].y;
          if (dx || dy) moveElements(p, pg, new Set([e.id]), dx, dy);
        });
      });
    },
    updateElement(id, patch) {
      const pageId = get().pageId;
      get().commit(p => {
        const pg = currentPage(p, pageId), el = pg.elements.find(e => e.id === id);
        if (el) Object.assign(el, patch);
        // Linea di definizione dei fili cambiata: i valori nuovi vanno sui fili
        if (el?.kind === 'wiredef') applyWireDefs(pg, [el.id]);
      });
    },
    renumberWires() {
      get().commit(p => {
        clearWireNumbers(p);
        // Ricalcolo da capo: il blocco dopo la modifica fissa i numeri nuovi
        if (settingsOf(p).wireNumbering === 'fixed') lockWireNumbers(p);
      });
      get().logMsg(tx('Numeri filo ricalcolati da capo'));
    },
    setWireLabels(wireId, labels) {
      const pageId = get().pageId;
      get().commit(p => {
        const w = currentPage(p, pageId).elements.find(e => e.id === wireId);
        if (w?.kind !== 'wire') return;
        if (labels?.length) w.labels = labels; else delete w.labels;
      });
    },
    setWirePoints(wireId, points) {
      const pageId = get().pageId;
      const pts = normalizeWire(points);
      if (pts.length < 2) return;
      get().commit(p => { const w = currentPage(p, pageId).elements.find(e => e.id === wireId); if (w?.kind === 'wire') w.points = pts; });
    },
    setTNode(pageId, at, join) {
      get().commit(p => {
        const pg = p.pages.find(x => x.id === pageId);
        if (!pg) return;
        const t = tNodeAt(pg.elements.filter((e): e is Wire => e.kind === 'wire' && e.bundle === undefined), at);
        if (!t?.holders.length) return;
        for (const h of t.holders) {
          if (!h.wire.tNode) continue;
          delete h.wire.tNode[h.end];
          if (!h.wire.tNode.start && !h.wire.tNode.end) delete h.wire.tNode;
        }
        if (join && t.through.includes(join)) t.holders[0].wire.tNode = { ...t.holders[0].wire.tNode, [t.holders[0].end]: join };
      });
    },
    setWireOrder(keys, order) {
      const ks = new Set(keys);
      get().commit(p => {
        const rest = (p.wireOrders ?? []).filter(o => !o.some(k => ks.has(k)));
        if (order && order.length >= 2) rest.push(order);
        if (rest.length) p.wireOrders = rest; else delete p.wireOrders;
      });
    },
    setWireShow(wireIds, key, on) {
      const ids = new Set(wireIds);
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'wire' || !ids.has(e.id)) continue;
          e.show = withShow(e.show, key, on);
        }
      });
    },
    setWireProps(wireIds, patch, wholeConductor = false) {
      // Scegliendo un colore lo si vuole vedere: si accendono i fili colorati sullo schema
      if (patch.color && !settingsOf(get().project).drawWireColors) {
        get().updateSettings({ drawWireColors: true });
        get().logMsg(tx('Attivati i fili colorati sullo schema (si spengono in Proprietà del progetto → Numeri filo → Fili colorati)'));
      }
      const ids = new Set(wireIds);
      if (wholeConductor) {
        const nl = computeNetlist(get().project);
        for (const id of wireIds) for (const w of nl.wireNet.get(id)?.wires ?? []) ids.add(w.wire.id);
      }
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'wire' || !ids.has(e.id)) continue;
          for (const [k, v] of Object.entries(patch)) {
            if (v) (e as unknown as Record<string, unknown>)[k] = v;
            else delete (e as unknown as Record<string, unknown>)[k];
          }
        }
      });
    },
    setWireNumber(wireId, number) {
      // Il numero vale per tutto il conduttore: lo tengo su un solo filo della rete
      const nl = computeNetlist(get().project);
      const net = nl.wireNet.get(wireId);
      const ids = new Set(net?.wires.map(w => w.wire.id) ?? [wireId]);
      // Conduttore con un rimando: il numero è il nome del rimando, quindi si rinomina il rimando
      // (e il suo corrispondente) invece di scrivere il numero sul filo
      const linkIds = new Set(number ? net?.linkIds ?? [] : []);
      if (linkIds.size) for (const id of [...linkIds]) for (const o of linkPartners(get().project).get(id) ?? []) linkIds.add(o.inst.id);
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind === 'symbol' && linkIds.has(e.id)) e.tag = number;
          if (e.kind === 'wire' && ids.has(e.id)) e.number = e.id === wireId && number && !linkIds.size ? number : undefined;
        }
      });
    },
    updateInstance(id, patch) {
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.id !== id || e.kind !== 'symbol') continue;
          // Rimando di un cavo di rete: il nome è la sigla del cavo, quindi si rinomina il cavo (tutti i tratti)
          if (patch.tag !== undefined && patch.tag.trim() && getSymbol(e.symbolId, p)?.role === 'link') {
            const g = busCableLinks(p).get(e.id);
            if (g) for (const { wire } of g) { wire.busCable = { ...wire.busCable, tag: patch.tag.trim().replace(/^-/, '') }; delete wire.busCable.auto; }
          }
          // Rimando collegato: il corrispondente prende lo stesso nome
          if (patch.tag !== undefined && e.linkTo && getSymbol(e.symbolId, p)?.role === 'link') {
            for (const q of p.pages) for (const o of q.elements) if (o.kind === 'symbol' && o.id === e.linkTo && o.linkTo === e.id) o.tag = patch.tag;
          }
          Object.assign(e, patch);
        }
      });
    },
    pairLinks(id, to) {
      get().commit(p => pairLinks(p, id, to));
    },
    updatePlcGroup(gid, patch) {
      const { pageId } = get();
      const cfg = groupConfig(currentPage(get().project, pageId), gid);
      if (!cfg) return;
      let warnings: string[] = [];
      get().commit(p => { warnings = buildPlcGroup(p, currentPage(p, pageId), gid, { ...cfg, ...patch }).warnings; });
      for (const w of warnings) get().logMsg(w, 'warn');
      get().setSelection(groupMembers(currentPage(get().project, pageId), gid).map(e => e.id));
    },
    setPlcGroupShow(gid, key, on) {
      const { pageId } = get();
      get().commit(p => {
        for (const e of groupMembers(currentPage(p, pageId), gid)) e.show = withShow(e.show, key, on);
      });
    },
    addPlcCard(typeId, station, presetTag) {
      const { project, pageId } = get();
      const tag = presetTag?.trim().replace(/^-/, '') || nextTagFor(project, 'A', currentPage(project, pageId), 0);
      const card = newCard(project, typeId, tag, station ?? stationNames(project)[0] ?? 'PLC1');
      get().commit(p => { p.plc.cards.push(card); });
      get().logMsg(tx('Aggiunta la scheda PLC -{0} ({1})', card.tag, cardType(card).name));
      return card;
    },
    updatePlcCard(id, patch) {
      get().commit(p => {
        const c = p.plc.cards.find(x => x.id === id);
        if (!c) return;
        // Cambiando la sigla della scheda la seguono tutti i suoi punti I/O
        if (patch.tag !== undefined && patch.tag !== c.tag) {
          for (const pg of p.pages) for (const e of pg.elements) {
            if (e.kind === 'symbol' && e.tag === c.tag && getSymbol(e.symbolId, p)?.role === 'plc') e.tag = patch.tag;
          }
        }
        // Tipo cambiato: la scheda prende i canali del tipo scelto (anche se era ricavata da un
        // articolo) e gli indirizzi di tutte le schede si ricalcolano in ordine
        const retype = patch.typeId !== undefined && (patch.typeId !== c.typeId || !!c.custom);
        Object.assign(c, patch);
        if (retype) {
          delete c.custom;
          const t = PLC_CARD_TYPES.find(x => x.id === c.typeId);
          if (t?.iolink) c.iolink = Array.from({ length: t.iolink }, (_, i) => c.iolink?.[i] ?? { port: i + 1, inBytes: 4, outBytes: 4 });
          else delete c.iolink;
          reassignAddresses(p);
        }
      });
      if (patch.typeId !== undefined) get().logMsg(tx('Tipo della scheda cambiato: indirizzi di tutte le schede ricalcolati in ordine di elenco'));
    },
    deletePlcCard(id) {
      get().commit(p => {
        p.plc.cards = p.plc.cards.filter(c => c.id !== id);
        // La pagina panoramica della scheda non ha più senso
        if (p.pages.some(pg => pg.type === 'plc' && pg.cardId === id) && p.pages.length > 1) p.pages = p.pages.filter(pg => !(pg.type === 'plc' && pg.cardId === id));
      });
      if (!get().project.pages.some(pg => pg.id === get().pageId)) set({ pageId: get().project.pages[0].id });
    },
    movePlcCard(id, delta) {
      get().commit(p => {
        const i = p.plc.cards.findIndex(c => c.id === id), j = i + delta;
        if (i < 0 || j < 0 || j >= p.plc.cards.length) return;
        const [c] = p.plc.cards.splice(i, 1);
        p.plc.cards.splice(j, 0, c);
      });
    },
    addPlcCardFromPart(partNr, channels, presetTag, station) {
      const { project, pageId, library } = get();
      const part = library.find(p => p.partNr === partNr) ?? project.parts.find(p => p.partNr === partNr);
      if (!part) return undefined;
      const tag = presetTag?.trim().replace(/^-/, '') || nextTagFor(project, 'A', currentPage(project, pageId), 0);
      const card = cardFromPart(project, part, channels, tag, station ?? stationNames(project)[0] ?? 'PLC1');
      get().commit(p => {
        p.plc.cards.push(card);
        if (!p.parts.some(x => x.partNr === partNr)) p.parts.push(structuredClone(part));
      });
      get().logMsg(tx('Aggiunta la scheda PLC -{0} dall\'articolo {1}', card.tag, partNr));
      return card;
    },
    linkToPlcCard(fromTag, cardTag) {
      const from = fromTag.trim(), to = cardTag.trim().replace(/^-/, '');
      if (!from || !to || from === to) return;
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag.trim() === from) e.tag = to;
      });
      get().logMsg(tx('-{0} collegato alla scheda PLC -{1}', from, to));
    },
    importPlcTags(rows, source) {
      let res: TagImportResult = { placed: 0, unplaced: 0, notFound: [] };
      get().commit(p => { res = applyTagImport(p, rows); });
      get().logMsg(tx('Import variabili da {0}: {1} canali disegnati e {2} non ancora disegnati aggiornati', source, res.placed, res.unplaced));
      if (res.notFound.length) get().logMsg(tx('{0} variabili senza canale corrispondente: {1}{2}', res.notFound.length, res.notFound.slice(0, 10).join(', '), res.notFound.length > 10 ? '…' : ''), 'warn');
      return res;
    },
    syncPlcOverviews() {
      let r = { added: 0, removed: 0 };
      get().commit(p => { r = syncOverviewPages(p); });
      get().logMsg(tx('Pagine panoramiche PLC: {0} aggiunte{1}', r.added, r.removed ? `, ${r.removed} rimosse` : ''));
    },
    reassignPlcAddresses() {
      get().commit(p => reassignAddresses(p));
      get().logMsg(tx('Indirizzi PLC riassegnati in ordine di scheda'));
    },
    propClipboard: null,
    applyUserData(d) {
      const byName = <T extends { name: string; category?: string }>(l: T[]) => [...l].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
      const sorted = [...d.library].sort((a, b) => a.partNr.localeCompare(b.partNr));
      const library = repairPartCables(sorted) ?? sorted;
      const symbolLibrary = byName(d.symbols), macros = byName(d.macros);
      setLibrarySymbols(symbolLibrary);
      set({ library, symbolLibrary, macros, templates: d.templates, tbLibrary: d.titleBlocks, favorites: d.favorites });
      persistLibrary(library);
      void kvSet('symbols', symbolLibrary);
      void kvSet('macros', macros);
      void kvSet('templates', d.templates);
      void kvSet('titleBlocks', d.titleBlocks);
      void kvSet('favorites', d.favorites);
    },
    deviceToPart(instId, partNr) {
      partNr = partNr.trim();
      if (!partNr) return;
      const { past, project } = get();
      const ids = new Set(sameDeviceIds(project, instId));
      const els = project.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol' && ids.has(e.id));
      const description = els.map(e => e.description).find(Boolean);
      if (els.map(e => e.partNr).find(Boolean) !== partNr) get().assignPart([instId], partNr);
      get().storeDeviceInPart(instId);
      const part = get().library.find(x => x.partNr === partNr) ?? get().project.parts.find(x => x.partNr === partNr);
      if (description && !part?.descr1) get().savePart(partNr, { descr1: description });
      if (!get().library.some(x => x.partNr === partNr) && part) get().addPartsToLibrary([structuredClone(part)], 'dispositivo');
      set({ past: [...past, project], treeSel: { type: 'part', partNr }, view: 'parts' });
      get().logMsg(tx('Articolo {0} creato dal dispositivo: completalo nella vista Articoli', partNr));
    },
    copyDeviceProps(instId) {
      const { project } = get();
      const all = project.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol');
      const src = all.find(e => e.id === instId);
      if (!src) return;
      const ids = new Set(sameDeviceIds(project, instId));
      const els = [src, ...all.filter(e => e.id !== instId && ids.has(e.id))];
      const pin = getSymbol(src.symbolId, project)?.role === 'pin';
      const props: Partial<Pick<SymbolInstance, DeviceField>> = {};
      for (const k of DEVICE_FIELDS) {
        const v = (pin && PIN_OWN_FIELDS.includes(k) ? [src] : els).map(e => e[k]).find(x => x !== undefined && x !== '');
        if (v !== undefined) (props as Record<string, unknown>)[k] = structuredClone(v);
      }
      set({ propClipboard: { tag: src.tag, props } });
      get().logMsg(tx('Proprietà di -{0} copiate', src.tag));
    },
    pasteDeviceProps(instIds) {
      const clip = get().propClipboard;
      if (!clip) return;
      const { project, library } = get();
      const roles = new Map(project.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => [e.id, getSymbol(e.symbolId, project)?.role]));
      // Un elemento per dispositivo (bobina e contatti insieme), niente potenziali e rimandi
      const seen = new Set<string>();
      const targets = instIds.filter(id => {
        const r = roles.get(id);
        if (!r || r === 'potential' || r === 'link' || seen.has(id)) return false;
        for (const x of sameDeviceIds(project, id)) if (r !== 'pin' && r !== 'terminal') seen.add(x);
        seen.add(id);
        return true;
      });
      if (!targets.length) return;
      // Tutti i campi: quelli che il dispositivo copiato non ha si svuotano anche qui
      const patch = Object.fromEntries(DEVICE_FIELDS.map(k => [k, structuredClone(clip.props[k])])) as Partial<Pick<SymbolInstance, DeviceField>>;
      const { past } = get();
      const part = clip.props.partNr ? library.find(x => x.partNr === clip.props.partNr) : undefined;
      if (part && !project.parts.some(x => x.partNr === part.partNr)) get().commit(p => { p.parts.push(structuredClone(part)); });
      get().updateDevices(targets.map(instId => ({ instId, patch })));
      set({ past: [...past, project] });
      get().logMsg(tx('Proprietà di -{0} incollate su {1} elementi', clip.tag, targets.length));
    },
    updateDevice(instId, patch) {
      get().updateDevices([{ instId, patch }]);
    },
    updateDevices(changes) {
      const groups = changes.map(c => ({ ...c, ids: new Set(sameDeviceIds(get().project, c.instId)), levels: new Set(terminalLevelIds(get().project, c.instId)) }));
      get().commit(p => {
        const roleOf = new Map(p.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => [e.id, getSymbol(e.symbolId, p)?.role]));
        for (const c of groups) for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol') continue;
          // Morsetto a più piani: un solo morsetto fisico, gli stessi dati su ogni piano
          if (c.levels.size > 1) {
            if (!c.levels.has(e.id)) continue;
            for (const [k, v] of Object.entries(c.patch)) {
              if (v !== undefined && v !== '') (e as unknown as Record<string, unknown>)[k] = structuredClone(v);
              else delete (e as unknown as Record<string, unknown>)[k];
            }
            continue;
          }
          if (!c.ids.has(e.id)) continue;
          // Senza elemento principale i contatti portano i dati del dispositivo, descrizione compresa
          const hasMain = [...c.ids].some(id => roleOf.get(id) === 'main');
          const role = roleOf.get(e.id) === 'aux' && !hasMain ? undefined : roleOf.get(e.id);
          for (const [k, v] of Object.entries(c.patch)) {
            // Descrizione e dati tecnici di un pin, descrizione di un contatto ausiliario: sono solo
            // loro, non si tolgono modificando un altro elemento del dispositivo
            if (e.id !== c.instId && ((role === 'pin' && PIN_OWN_FIELDS.includes(k as DeviceField)) || (role === 'aux' && AUX_OWN_FIELDS.includes(k as DeviceField)))) continue;
            // Il valore resta su un solo elemento per non duplicare i dati: quello modificato
            if (e.id === c.instId && v !== undefined && v !== '') (e as unknown as Record<string, unknown>)[k] = v;
            else delete (e as unknown as Record<string, unknown>)[k];
          }
        }
      });
    },
    renameDevice(from, to) {
      to = to.trim().replace(/^-/, '');
      if (!to || to === from) return false;
      const used = (p: Project) => p.pages.some(pg => pg.elements.some(e => e.kind === 'symbol' && e.tag === to));
      if (used(get().project)) return false;
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || e.tag !== from) continue;
          const sym = getSymbol(e.symbolId, p);
          if (sym && sym.role !== 'potential' && sym.role !== 'link' && sym.role !== 'terminal') e.tag = to;
        }
        for (const c of p.plc.cards) if (c.tag === from) c.tag = to;
      });
      return true;
    },
    mergeIntoDevice(instId, tag) {
      const t = tag.trim().replace(/^-/, '');
      const targets = mergeTargets(get().project, instId, t);
      const own = new Set(DEVICE_FIELDS.filter(k => targets.some(x => x.inst[k] !== undefined && x.inst[k] !== '')));
      get().commit(p => {
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || e.id !== instId) continue;
          e.tag = t;
          for (const k of own) delete e[k];
        }
      });
    },
    deleteSelection() {
      const { selection, pageId } = get();
      if (!selection.length) return;
      let healed = 0;
      get().commit(p => {
        const pg = currentPage(p, pageId);
        const removed = pg.elements.filter(e => selection.includes(e.id));
        pg.elements = pg.elements.filter(e => !selection.includes(e.id));
        // Morsetto tolto da un filo: il filo interrotto torna intero
        healed = healWiresAtRemoved(p, pg, removed);
      });
      if (healed) get().logMsg(tx('Fili ricuciti dove c\'erano i morsetti tolti: {0}', healed));
      set({ selection: [] });
    },
    moveSelection(dx, dy) {
      const { selection, pageId } = get();
      if (!selection.length || (dx === 0 && dy === 0)) return;
      get().commit(p => moveElements(p, currentPage(p, pageId), new Set(selection), dx, dy));
    },
    rotateSelection() {
      const { selection, pageId } = get();
      get().commit(p => {
        for (const e of currentPage(p, pageId).elements) {
          if (e.kind === 'symbol' && selection.includes(e.id)) e.rot = nextRot(getSymbol(e.symbolId, p), e.rot);
        }
        autoConnect(p, currentPage(p, pageId), selection);
      });
    },
    rotateTo(ids, rot) {
      const { pageId } = get();
      get().commit(p => {
        for (const e of currentPage(p, pageId).elements) {
          if (e.kind === 'symbol' && ids.includes(e.id)) e.rot = fitRot(getSymbol(e.symbolId, p), rot);
        }
        autoConnect(p, currentPage(p, pageId), ids);
      });
    },
    duplicateSelection() {
      const { selection, pageId, project } = get();
      if (!selection.length) return;
      const clip = copyElements(project, currentPage(project, pageId), selection);
      let ids: string[] = [];
      get().commit(p => { ids = pasteElements(p, pageId, clip, 8, 8).ids; placedOnWires(p, currentPage(p, pageId), ids); });
      set({ selection: ids });
    },
    clipboard: null,
    copySelection() {
      const { selection, pageId, project } = get();
      if (!selection.length) return;
      const clip = copyElements(project, currentPage(project, pageId), selection);
      set({ clipboard: clip });
      get().logMsg(tx('Copiati {0} elementi', clip.elements.length));
    },
    cutSelection() {
      const { selection, pageId, project } = get();
      if (!selection.length) return;
      // Tagliare = spostare: si ricordano i numeri filo per tenerli dove si incolla
      const clip = copyElements(project, currentPage(project, pageId), selection);
      const nl = computeNetlist(project);
      const wireNos: Record<string, string> = {};
      for (const e of clip.elements) if (e.kind === 'wire') { const no = nl.wireNet.get(e.id)?.wireNo; if (no) wireNos[e.id] = no; }
      set({ clipboard: { ...clip, cut: true, wireNos } });
      get().logMsg(tx('Tagliati {0} elementi: incollandoli tengono sigle, morsetti, rimandi e numeri filo', clip.elements.length));
      get().deleteSelection();
    },
    paste(at) {
      const { clipboard, pageId, cursor } = get();
      if (!clipboard) return;
      const off = pasteOffset(clipboard, at ?? cursor);
      let r = { ids: [] as string[], newCards: [] as string[] };
      get().commit(p => {
        r = pasteElements(p, pageId, clipboard, off.x, off.y);
        placedOnWires(p, currentPage(p, pageId), r.ids);
        // Fili tagliati: se nella pagina nuova il numero cambierebbe, si fissa quello di prima
        if (clipboard.cut && clipboard.wireNos) {
          const nl = computeNetlist(p);
          const byOld = new Map(clipboard.elements.map((e, i) => [e.id, r.ids[i]]));
          const pg = currentPage(p, pageId);
          for (const [old, no] of Object.entries(clipboard.wireNos)) {
            const w = pg.elements.find(e => e.id === byOld.get(old));
            if (w?.kind === 'wire' && !w.number && nl.wireNet.get(w.id)?.wireNo !== no) w.number = no;
          }
        }
      });
      // Dopo il primo incolla gli elementi tagliati sono di nuovo nel progetto: incollare ancora fa una copia
      set({ selection: r.ids, tool: { kind: 'select' }, ...(clipboard.cut ? { clipboard: { ...clipboard, cut: false, wireNos: undefined } } : {}) });
      if (r.newCards.length) get().logMsg(tx('Create le schede PLC {0}', r.newCards.join(', ')));
    },
    addStation(station) {
      const name = station.name.trim();
      if (!name || stationNames(get().project).includes(name)) return false;
      get().commit(p => { (p.plc.stations ??= []).push({ ...station, name }); });
      get().logMsg(tx('Nuova stazione PLC {0}', name));
      return true;
    },
    deleteStation(name) {
      if (get().project.plc.cards.some(c => c.station === name)) return false;
      get().commit(p => { p.plc.stations = (p.plc.stations ?? []).filter(x => x.name !== name); });
      return true;
    },
    updateStation(name, patch) {
      // Un nome già usato da un'altra stazione unirebbe due stazioni: non si cambia
      if (patch.name !== undefined) {
        patch = { ...patch, name: patch.name.trim() };
        if (!patch.name || (patch.name !== name && stationNames(get().project).includes(patch.name))) {
          get().logMsg(tx('La stazione {0} esiste già', patch.name || '""'), 'warn');
          return;
        }
      }
      get().commit(p => {
        const list = (p.plc.stations ??= []);
        let s = list.find(x => x.name === name);
        if (!s) { s = { name }; list.push(s); }
        // Rinominando la stazione la seguono le sue schede
        if (patch.name && patch.name !== name) for (const c of p.plc.cards) if (c.station === name) c.station = patch.name;
        const before = { f: stationFormat(p, s.name), order: s.areaOrder };
        Object.assign(s, patch);
        // Formato o ordine delle aree cambiati: gli indirizzi della stazione si rifanno
        if (needsReassign(before.f, stationFormat(p, s.name)) || before.order !== s.areaOrder) { const n = s.name; reassignAddresses(p, st => st === n); }
      });
    },
    updateIolinkPort(cardId, port, patch) {
      get().commit(p => {
        const c = p.plc.cards.find(x => x.id === cardId);
        const pt = c?.iolink?.find(x => x.port === port);
        if (pt) Object.assign(pt, patch);
      });
    },
    syncReportPages(quiet) {
      let r = { added: 0, removed: 0 };
      const lib = get().library;
      get().commit(p => { r = syncReportPagesModel(p, projectReports(p, lib), undefined, lib); });
      if (quiet) { if (r.added || r.removed) get().logMsg(tx('Pagine di lista aggiornate: {0} aggiunte, {1} tolte', r.added, r.removed)); return; }
      get().logMsg(tx('Pagine di lista: {0} aggiunte{1} (si aggiornano da sole con lo schema)', r.added, r.removed ? `, ${r.removed} rimosse` : ''));
    },
    updateList(key) {
      let r = { added: 0, removed: 0 };
      get().commit(p => { r = updateListModel(p, key, get().library); });
      const e = listEntries(get().project, get().library).find(x => x.key === key);
      if (e && !e.need) get().logMsg(tx('«{0}»: la lista è vuota, nessuna pagina', tx(e.title)), 'warn');
      else get().logMsg(tx('«{0}»: {1} pagine aggiunte, {2} tolte', tx(e?.title ?? key), r.added, r.removed));
      if (e?.pages[0] && r.added) get().setPage(e.pages[0].id);
    },
    deleteList(key) {
      let n = 0;
      get().commit(p => { n = deleteListModel(p, key); });
      const e = listEntries(get().project, get().library).find(x => x.key === key);
      get().logMsg(tx('«{0}»: {1} pagine eliminate', tx(e?.title ?? key), n));
      if (!get().project.pages.some(pg => pg.id === get().pageId)) set({ pageId: get().project.pages[0].id });
    },
    updateAllLists(quiet) {
      let r = { added: 0, removed: 0, lists: 0 };
      get().commit(p => { r = updateAllListsModel(p, get().library); });
      if (!quiet || r.added || r.removed) get().logMsg(tx('Liste aggiornate ({0}): {1} pagine aggiunte, {2} tolte', r.lists, r.added, r.removed));
    },
    addCoverPage() {
      let id = '';
      get().commit(p => { id = addCoverPageModel(p).id; });
      get().setPage(id);
    },
    updateTitleBlock(patch) {
      if (lockedParts(get().project).includes('titleBlock')) { get().logMsg(tx('Cartiglio bloccato dal profilo «{0}»: per cambiarlo sbloccalo in Impostazioni ▸ Profili', get().project.settings.locks?.profile ?? ''), 'warn'); return; }
      get().commit(p => {
        p.titleBlock = { ...(p.titleBlock ?? {}), ...patch };
        for (const k of Object.keys(p.titleBlock) as (keyof TitleBlock)[]) if (p.titleBlock[k] === undefined) delete p.titleBlock[k];
      });
    },
    templates: [],
    saveTemplate(name) {
      const t = makeTemplate(get().project, name);
      const templates = [...get().templates.filter(x => x.name !== name), t];
      set({ templates });
      void kvSet('templates', templates);
      get().logMsg(tx('Modello "{0}" salvato: impostazioni, cartiglio, luoghi e copertina', name));
    },
    deleteTemplate(id) {
      const templates = get().templates.filter(x => x.id !== id);
      set({ templates });
      void kvSet('templates', templates);
    },
    newFromTemplate(id) {
      const t = get().templates.find(x => x.id === id);
      if (!t) return;
      get().loadProject(projectFromTemplate(t));
      get().logMsg(tx('Nuovo progetto dal modello "{0}"', t.name));
    },
    profiles: [],
    saveProfile(name, parts, description, lock) {
      const p = makeProfile(get().project, name, parts, description, lock);
      const old = get().profiles.find(x => x.name === name);
      if (old?.isDefault) p.isDefault = true;
      const profiles = [...get().profiles.filter(x => x !== old), p];
      set({ profiles });
      void kvSet('profiles', profiles);
      get().logMsg(tx('Profilo "{0}" salvato', name));
      return p;
    },
    addProfile(p) {
      const names = new Set(get().profiles.map(x => x.name));
      let name = p.name;
      for (let k = 2; names.has(name); k++) name = `${p.name} (${k})`;
      const added = { ...p, name, isDefault: undefined };
      const profiles = [...get().profiles, added];
      set({ profiles });
      void kvSet('profiles', profiles);
      return added;
    },
    updateProfile(id, patch) {
      const profiles = get().profiles.map(x => (x.id === id ? { ...x, ...patch } : x));
      set({ profiles });
      void kvSet('profiles', profiles);
    },
    refreshProfile(id, parts) {
      const old = get().profiles.find(x => x.id === id);
      if (!old) return;
      const p = { ...makeProfile(get().project, old.name, parts, old.description, old.lock), id, isDefault: old.isDefault };
      const profiles = get().profiles.map(x => (x.id === id ? p : x));
      set({ profiles });
      void kvSet('profiles', profiles);
      get().logMsg(tx('Profilo "{0}" aggiornato dalle impostazioni del progetto', old.name));
    },
    deleteProfile(id) {
      const profiles = get().profiles.filter(x => x.id !== id);
      set({ profiles });
      void kvSet('profiles', profiles);
    },
    setDefaultProfile(id) {
      const profiles = get().profiles.map(x => ({ ...x, isDefault: x.id === id || undefined }));
      set({ profiles });
      void kvSet('profiles', profiles);
    },
    wiresFromPlc() {
      const sel = new Set(get().selection);
      let wires = 0, links = 0, skipped = 0;
      get().commit(p => {
        // Numerazione calcolata come con l'impostazione attiva (stessi oggetti del progetto)
        const nl = computeNetlist({ ...p, settings: { ...p.settings, wirePlcNames: true } });
        const groups = new Set<string>();
        for (const n of nl.nets) {
          const hit = n.wires.some(w => sel.has(w.wire.id)) || n.pins.some(q => q.el.sym.role === 'plc' && sel.has(q.el.inst.id));
          if (!hit) continue;
          if (n.plcNamed) groups.add(n.group); else if (n.wires.some(w => sel.has(w.wire.id))) skipped++;
        }
        for (const g of groups) {
          const group = nl.nets.filter(m => m.group === g);
          const name = group[0].wireNo;
          const all = group.flatMap(m => m.wires.map(w => w.wire));
          if (!all.length) continue;
          all.forEach((w, i) => { if (i === 0) w.number = name; else delete w.number; });
          wires++;
          for (const id of group.flatMap(m => m.linkIds ?? [])) {
            for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.id === id && e.tag !== name) { e.tag = name; links++; }
          }
        }
      });
      if (!wires) { get().logMsg(tx('Nessun filo selezionato è collegato a un solo morsetto di un canale PLC'), 'warn'); return; }
      get().logMsg(tx('Nomi dall\'indirizzo PLC: {0} conduttori, {1} rimandi rinominati', wires, links) + (skipped ? tx(' · {0} fili non collegati a un canale PLC', skipped) : ''));
    },
    pinsFromArticles(tags) {
      const { project, library } = get();
      const plan = articlePinPlan(project, library, tags ? new Set(tags) : undefined);
      if (!plan.devices) { get().logMsg(tags ? tx('L\'articolo non ha un modello funzione con i morsetti') : tx('Nessun dispositivo con un articolo che abbia il modello funzione'), 'warn'); return; }
      if (plan.labels.size) {
        get().commit(p => {
          for (const pg of p.pages) for (const e of pg.elements) {
            const rec = e.kind === 'symbol' ? plan.labels.get(e.id) : undefined;
            if (e.kind !== 'symbol' || !rec) continue;
            e.pinLabels = { ...e.pinLabels, ...rec };
            e.autoPins = false;
          }
        });
      }
      get().logMsg(tx('Morsetti dagli articoli: {0} elementi di {1} dispositivi', plan.labels.size, plan.devices));
      if (plan.unmatched.length) get().logMsg(tx('Senza una funzione adatta nell\'articolo: {0}', plan.unmatched.map(e => `-${e.inst.tag} (${e.sym.name})`).join(', ')), 'warn');
    },
    applyFixes(fixes) {
      if (!fixes.length) return;
      get().commit(p => {
        const find = (pageId: string, id: string) => p.pages.find(pg => pg.id === pageId)?.elements.find(e => e.id === id);
        for (const f of fixes) {
          if (f.kind === 'assignTag' || f.kind === 'renameLink') {
            const e = find(f.pageId, f.id);
            if (e?.kind === 'symbol') e.tag = f.tag;
          } else if (f.kind === 'linkStar') {
            const e = find(f.pageId, f.id);
            if (e?.kind === 'symbol') e.linkStar = true;
          } else if (f.kind === 'deleteElement') {
            const pg = p.pages.find(x => x.id === f.pageId);
            if (pg) pg.elements = pg.elements.filter(e => e.id !== f.id);
          } else if (f.kind === 'allowRot') {
            const sd = p.customSymbols.find(x => x.id === f.symbolId);
            if (sd) {
              const list = allowedRots(sd);
              if (!list.includes(f.rot)) { const n = ROTS.filter(x => x === f.rot || list.includes(x)); sd.rotations = n.length === 4 ? undefined : n; }
            }
          } else if (f.kind === 'fitRot') {
            const e = find(f.pageId, f.id);
            if (e?.kind === 'symbol') e.rot = fitRot(getSymbol(e.symbolId, p), e.rot);
          } else if (f.kind === 'splitWire') {
            const pg = p.pages.find(x => x.id === f.pageId);
            if (pg) splitWiresAtPins(p, pg, f.wireIds);
          } else if (f.kind === 'cableFromPart') {
            const c = p.cables?.find(x => x.id === f.cableId);
            const part = c?.partNr ? partsIndex(p, get().library).get(c.partNr) : undefined;
            if (c && part) Object.assign(c, cableFromPart(c, part));
          } else if (f.kind === 'clearCardOrder') {
            const c = p.plc.cards.find(x => x.id === f.cardId);
            if (c) { delete c.partNr; delete c.orderNr; delete c.manufacturer; }
          } else if (f.kind === 'busCableTag') {
            const ids = new Set(f.wireIds);
            for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'wire' && ids.has(e.id)) e.busCable = { ...e.busCable, tag: f.tag };
          } else if (f.kind === 'renumberWires') {
            const ids = new Set(f.wireIds);
            for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'wire' && ids.has(e.id)) delete e.number;
          }
        }
      });
      get().logMsg(fixes.length === 1 ? tx('Corretto: {0}', fixes[0].label) : tx('Applicate {0} correzioni', fixes.length));
    },
    unlockSettings() {
      const name = get().project.settings.locks?.profile;
      get().commit(p => { delete p.settings.locks; });
      get().logMsg(tx('Impostazioni sbloccate (profilo «{0}»)', name ?? ''));
    },
    applyProfile(p, parts) {
      const use = applicableParts(get().project, p, parts);
      if (use.length < (parts ?? p.parts).length) get().logMsg(tx('Alcune parti sono bloccate dal profilo «{0}» e non sono state applicate', get().project.settings.locks?.profile ?? ''), 'warn');
      get().commit(proj => applyProfileModel(proj, p, use));
      get().logMsg(tx('Applicato il profilo "{0}"', p.name));
    },
    styleList: '',
    openReportStyle(title) { set({ styleList: title, dialog: 'reportStyle' }); },
    drawingStyleKind: 'cable',
    openDrawingStyle(kind) { set({ drawingStyleKind: kind, dialog: 'drawingStyle' }); },
    openListStyleOf(pg) {
      if (pg.type === 'report' && pg.report) get().openReportStyle(pg.report);
      else if (pg.type === 'strip') set({ dialog: 'stripStyle' });
      else if (pg.type === 'cable' || pg.type === 'connector' || pg.type === 'system' || (pg.type === 'plc' && pg.cardId)) get().openDrawingStyle(pg.type as DrawingStyleKind);
      else return false;
      return true;
    },
    setReportStyle(title, patch) {
      const all = { ...settingsOf(get().project).reportStyles };
      if (patch) all[title] = { ...all[title], ...patch }; else delete all[title];
      get().updateSettings({ reportStyles: all });
    },
    setReportColumn(title, key, patch) {
      const cur = settingsOf(get().project).reportStyles?.[title]?.columns ?? {};
      get().setReportStyle(title, { columns: { ...cur, [key]: { ...cur[key], ...patch } } });
    },
    async releaseRevision(r) {
      if (get().viewing || isReleased(get().project)) return;
      const next = await releaseRevisionModel(get().project, r);
      // Il rilascio non si annulla con Ctrl+Z: la revisione emessa resta com'è
      set({ project: next, past: [], future: [], dirty: true, selection: [] });
      const rev = lastRevision(next)!;
      get().logMsg(tx('Revisione {0} rilasciata ({1} kB archiviati), progetto in sola lettura: {2}', r.index, archiveKb(rev),
        rev.pages.length ? tx('pagine modificate {0}', rev.pages.join(', ')) : tx('nessuna pagina modificata')));
    },
    setThermal(panelId, patch) {
      get().commit(p => {
        const list = [...(p.calcs?.thermal ?? [])];
        const i = list.findIndex(c => c.panelId === panelId);
        if (!patch) { if (i >= 0) list.splice(i, 1); }
        else if (i >= 0) list[i] = { ...list[i], ...patch };
        else list.push({ ...newThermal(panelId), ...patch });
        p.calcs = { ...p.calcs, thermal: list };
      });
    },
    setCableCalc(cableId, patch) {
      get().commit(p => {
        const all = { ...p.calcs?.cables };
        if (patch) all[cableId] = { ...all[cableId], ...patch }; else delete all[cableId];
        p.calcs = { ...p.calcs, cables: all };
      });
    },
    renumberPages(start, step) {
      let changed: [string, string][] = [];
      get().commit(p => { changed = renumberPagesModel(p, start, step); });
      get().logMsg(changed.length
        ? tx('Pagine rinumerate: {0} cambiate ({1}). Le sigle dei componenti non cambiano: per rifarle usa Rinumera dispositivi', changed.length, changed.slice(0, 8).map(([a, b]) => `${a}→${b}`).join(', ') + (changed.length > 8 ? '…' : ''))
        : tx('Pagine già numerate così'));
    },
    acceptIssues(keys, note, accept) {
      get().commit(p => {
        const all = { ...p.acceptedIssues };
        const date = new Date().toISOString().slice(0, 10);
        for (const k of keys) { if (accept) all[k] = { date, author: p.info.author || undefined, ...(note ? { note } : {}) }; else delete all[k]; }
        if (Object.keys(all).length) p.acceptedIssues = all; else delete p.acceptedIssues;
      });
    },
    setRevisionNote(key, note) {
      get().commit(p => {
        const all = { ...p.revisionNotes };
        if (note && (note.text.trim() || note.hidden)) all[key] = note; else delete all[key];
        if (Object.keys(all).length) p.revisionNotes = all; else delete p.revisionNotes;
      });
    },
    openRevision() {
      if (get().viewing || !isReleased(get().project)) return;
      get().commit(p => openRevisionModel(p), true);
      get().logMsg(tx('Revisione nuova aperta dopo la {0}: il progetto si può modificare, le modifiche sono segnate con le nuvolette', lastRevision(get().project)?.index ?? ''));
    },
    async cancelRevision() {
      const cur = get().project;
      if (get().viewing || cur.revisionState !== 'review') return false;
      const back = await cancelRevisionModel(cur);
      if (!back) return false;
      let restored: Project;
      try { restored = parseProject(JSON.stringify(back)); } catch (e) { get().logMsg(tx('Revisione non annullata: la copia archiviata non si legge ({0})', e instanceof Error ? e.message : String(e)), 'error'); return false; }
      get().commit(p => { Object.keys(p).forEach(k => delete (p as unknown as Record<string, unknown>)[k]); Object.assign(p, restored); }, true);
      if (!get().project.pages.some(pg => pg.id === get().pageId)) set({ pageId: get().project.pages[0].id });
      get().logMsg(tx('Revisione annullata: il progetto è tornato alla {0} rilasciata', lastRevision(cur)?.index ?? ''));
      return true;
    },
    viewing: null,
    async viewRevision(id) {
      const s = get();
      const real = s.viewing?.back ?? { project: s.project, past: s.past, future: s.future, dirty: s.dirty, pageId: s.pageId };
      const rev = real.project.revisions?.find(r => r.id === id);
      if (!rev?.archive) return;
      let p: Project;
      try { p = parseProject(JSON.stringify(await unpackProject(rev.archive))); } catch (e) { get().logMsg(tx('Revisione {0} non apribile: {1}', rev.index, e instanceof Error ? e.message : String(e)), 'error'); return; }
      set({ viewing: { index: rev.index, date: rev.date, back: real }, project: p, past: [], future: [], dirty: real.dirty, selection: [], pageId: p.pages[0]?.id ?? '', view: 'schema' });
      get().logMsg(tx('Revisione {0} del {1} aperta in sola lettura', rev.index, rev.date));
    },
    closeRevisionView() {
      const v = get().viewing;
      if (!v) return;
      set({ viewing: null, ...v.back, selection: [] });
    },
    comparison: null,
    setComparison(c) { set({ comparison: c }); if (c) set({ view: 'reports', reportTab: 'compare' }); },
    renamePins(map, ids) {
      const only = ids && new Set(ids);
      const entries = Object.entries(map).filter(([a, b]) => b && a !== b && b.includes(':'));
      if (!entries.length) return;
      const m = new Map(entries);
      let dup = 0;
      get().commit(p => {
        const changed = new Set<string>();
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || (only && !only.has(e.id)) || !m.has(e.tag) || getSymbol(e.symbolId, p)?.role !== 'pin') continue;
          e.tag = m.get(e.tag)!;
          changed.add(e.id);
        }
        // Dati del connettore (descrizione, pin, controparte) copiati nel connettore nuovo
        for (const [a, b] of m) {
          const from = stripOf(a), to = stripOf(b);
          if (from !== to && p.connectors?.[from] && !p.connectors[to]) p.connectors[to] = structuredClone(p.connectors[from]);
        }
        // Connettore rinominato del tutto: i suoi dati restano solo con il nome nuovo
        const used = new Set(p.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol' && e.tag.includes(':')).map(e => stripOf(e.tag)));
        for (const a of m.keys()) if (p.connectors?.[stripOf(a)] && !used.has(stripOf(a))) delete p.connectors[stripOf(a)];
        // Sigle nuove già usate da pin non toccati
        const targets = new Set(m.values());
        const others = p.pages.flatMap(pg => pg.elements).filter(e => e.kind === 'symbol' && !changed.has(e.id) && targets.has((e as SymbolInstance).tag));
        dup = new Set(others.map(e => (e as SymbolInstance).tag)).size;
      });
      if (dup) get().logMsg(tx('Attenzione: {0} pin hanno la stessa sigla di pin già esistenti', dup));
    },
    addConnector(type, gender) {
      const p = get().project;
      const used = new Set(allConnectors(p).concat(allStrips(p)));
      let n = 10;
      while (used.has(`X${n}`)) n++;
      const tag = `X${n}`;
      get().updateConnector(tag, { ...(type ? { type } : {}), ...(gender ? { gender } : {}) });
      return tag;
    },
    placeConnectorPins(conn) {
      const { project, library } = get();
      const free = freePins(project, conn, library);
      const tag = free.length ? `${conn}:${free[0]}` : nextPin(project, conn, library);
      set({ tool: { kind: 'place', symbolId: genderSymbol(project.connectors?.[conn]?.gender), rot: 0, tag }, view: 'schema' });
      get().logMsg(tx('Clic sullo schema per mettere il pin {0}; ogni clic mette il prossimo libero, Esc per finire', tag));
    },
    updateConnector(conn, patch) {
      get().commit(p => {
        p.connectors ??= {};
        const d = { ...(p.connectors[conn] ?? {}), ...patch };
        for (const k of Object.keys(d) as (keyof typeof d)[]) if (d[k] === undefined || d[k] === '') delete d[k];
        p.connectors[conn] = d;
        copyPart(p, get().library, d.matingPartNr);
      });
    },
    addIpNetwork() {
      get().commit(p => { (p.ipNetworks ??= []).push(newIpNetwork(p)); });
    },
    updateIpNetwork(id, patch) {
      get().commit(p => { const n = p.ipNetworks?.find(x => x.id === id); if (n) Object.assign(n, patch); });
    },
    deleteIpNetwork(id) {
      get().commit(p => { p.ipNetworks = (p.ipNetworks ?? []).filter(x => x.id !== id); });
    },
    assignIps() {
      let n = 0;
      get().commit(p => { n = assignIps(p); });
      get().logMsg(n ? tx('Assegnati {0} indirizzi IP', n) : tx('Nessun nodo da indirizzare: servono una rete IP e nodi collegati con Profinet, Modbus TCP, EtherNet/IP o Ethernet senza IP'), n ? 'info' : 'warn');
    },
    setNetAddress(target, patch) {
      get().commit(p => {
        const ifs = netInterfaces(p);
        const nif = 'key' in target ? ifs.find(i => i.key === target.key) : undefined;
        const station = (p.plc.stations ?? []).find(s => 'station' in target ? s.name === target.station : !!nif && stationInterface(p, s.name, ifs) === nif);
        if (nif) setNetInterface(nif, patch);
        // La stazione PLC della CPU o della testa resta allineata al dispositivo
        if (station) {
          if (patch.ip !== undefined) station.ip = patch.ip.trim() || undefined;
          if (patch.address !== undefined) station.deviceName = patch.address.trim() || undefined;
        }
      });
    },
    splitNetInterface(key, ports) {
      get().commit(p => { const nif = netInterfaces(p).find(i => i.key === key); if (nif) splitNetInterfaceModel(nif, ports); });
    },
    mergeNetInterface(key) {
      get().commit(p => { const nif = netInterfaces(p).find(i => i.key === key); if (nif) mergeNetInterfaceModel(nif); });
    },
    assignProfinetNames() {
      let n = 0;
      get().commit(p => { n = assignProfinetNames(p); });
      get().logMsg(n ? tx('Scritti {0} nomi Profinet', n) : tx('Nessun nome da scrivere: i dispositivi Profinet hanno già un nome'), n ? 'info' : 'warn');
    },
    setLanguages(patch) {
      get().commit(p => { p.languages = { display: 'it', ...p.languages, ...patch }; if (!p.languages.second) delete p.languages.second; });
    },
    setTranslation(text, lang, value) {
      get().commit(p => {
        const d = (p.dictionary ??= {});
        const e = { ...d[text] };
        if (value.trim()) e[lang] = value.trim(); else delete e[lang];
        e.auto = e.auto?.filter(l => l !== lang);
        if (!e.auto?.length) delete e.auto;
        if (e.en || e.de) d[text] = e; else delete d[text];
      });
    },
    autoTranslate() {
      let r = { added: 0, missing: 0 };
      get().commit(p => { r = autoTranslateModel(p, get().library); });
      get().logMsg(tx('Traduzioni proposte: {0} (da verificare){1}', r.added, r.missing ? `, ${r.missing} testi da tradurre a mano` : ''));
    },
    mergeDictionary(d) {
      get().commit(p => {
        const dict = (p.dictionary ??= {});
        for (const [k, v] of Object.entries(d)) dict[k] = { ...dict[k], ...v, auto: undefined };
      });
      get().logMsg(tx('Dizionario: importate {0} voci', Object.keys(d).length));
    },
    mergeProposedTranslations(d, source) {
      let n = 0;
      get().commit(p => {
        const dict = (p.dictionary ??= {});
        for (const [k, v] of Object.entries(d)) {
          const e = (dict[k] ??= {});
          for (const [l, t] of Object.entries(v) as [Lang, string][]) {
            // Una traduzione già confermata dall'utente non si tocca
            if (e[l] && !e.auto?.includes(l)) continue;
            e[l] = t; n++;
            (e.auto ??= []).includes(l) || e.auto.push(l);
          }
        }
      });
      get().logMsg(tx('Traduzioni proposte da {0}: {1} (da verificare nella scheda Traduzioni)', source, n));
      return n;
    },
    addPanel(name) {
      const pn = newPanel(get().project, name);
      get().commit(p => { (p.panels ??= []).push(pn); });
      return pn;
    },
    updatePanel(id, patch) {
      get().commit(p => {
        const pn = p.panels?.find(x => x.id === id);
        if (!pn) return;
        // Cambiando il codice si aggiorna il luogo (+) dei dispositivi che lo usavano
        if (patch.code !== undefined && patch.code !== pn.code) {
          for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.loc === pn.code) e.loc = patch.code;
        }
        Object.assign(pn, patch);
      });
    },
    deletePanel(id) {
      get().commit(p => {
        // I sottoquadri passano al luogo che conteneva quello eliminato
        const gone = p.panels?.find(x => x.id === id);
        for (const c of p.panels ?? []) if (c.parentId === id) { if (gone?.parentId) c.parentId = gone.parentId; else delete c.parentId; }
        p.panels = (p.panels ?? []).filter(x => x.id !== id);
        for (const pg of p.pages) {
          if (pg.panelId === id) delete pg.panelId;
          pg.elements = pg.elements.filter(e => !(e.kind === 'zone' && e.panelId === id));
        }
      });
    },
    addTypedPage(type, title) {
      const { pageId } = get();
      let id = '';
      get().commit(p => {
        const idx = p.pages.findIndex(x => x.id === pageId) + 1;
        const panelId = p.pages.find(x => x.id === pageId)?.panelId;
        const pg: Page = { id: uid('p'), name: nextProjectPageNo(p), title, type, elements: [], ...(panelId ? { panelId } : {}) };
        id = pg.id;
        p.pages.splice(idx || p.pages.length, 0, pg);
      });
      get().setPage(id);
    },
    addNetworkPage() {
      let id = '';
      get().commit(p => { const pg = newNetworkPage(p); id = pg.id; p.pages.push(pg); });
      get().setPage(id);
      get().logMsg(tx('Schema di rete: inserisci i nodi da «Reti e bus», collegali con lo strumento Bus e disegna i riquadri dei quadri con «Quadro»'));
    },
    addZone(x, y, w, h, panelId) {
      const { project, pageId } = get();
      const page = currentPage(project, pageId);
      const onPage = new Set(page.elements.flatMap(e => (e.kind === 'zone' ? [e.panelId] : [])));
      const existing = panelId ?? (project.panels ?? []).find(pn => !onPage.has(pn.id))?.id;
      const pn = existing ? undefined : newPanel(project);
      const zone: Zone = { kind: 'zone', id: uid('z'), panelId: existing ?? pn!.id, x, y, w, h };
      get().commit(p => {
        if (pn) (p.panels ??= []).push(pn);
        currentPage(p, pageId).elements.unshift(zone);
      });
      set({ selection: [zone.id], tool: { kind: 'select' } });
    },
    busProtocol: 'Profinet',
    setBusProtocol(p) { set({ busProtocol: p }); if (get().tool.kind === 'wire') set({ tool: { kind: 'wire', bus: p } }); },
    addLayoutPage() {
      let id = '';
      get().commit(p => { const pg = newLayoutPage(p); id = pg.id; p.pages.push(pg); });
      get().setPage(id);
    },
    updateLayout(pageId, fn) {
      get().commit(p => {
        const pg = p.pages.find(x => x.id === pageId);
        if (!pg) return;
        pg.layout = layoutOf(pg);
        fn(pg.layout);
      });
    },
    autoLayout(pageId, opts) {
      let r = { placed: 0, missing: [] as string[] };
      const library = get().library;
      const panelId = get().project.pages.find(p => p.id === pageId)?.panelId;
      get().updateLayout(pageId, l => { r = autoLayoutModel(get().project, l, library, panelId, opts); });
      get().logMsg(tx('Posa automatica: {0} elementi posati{1}', r.placed, r.missing.length ? `; senza spazio sulle guide: ${r.missing.join(', ')}` : ''), r.missing.length ? 'warn' : 'info');
    },
    macros: [],
    saveMacro(name, category, description) {
      const { selection, pageId, project } = get();
      if (!selection.length) return;
      const m = makeMacro(copyElements(project, currentPage(project, pageId), selection), name, category, description);
      get().addMacros([m]);
      get().logMsg(tx('Macro "{0}" salvata nella libreria ({1} elementi)', name, m.clip.elements.length));
    },
    addMacros(list) {
      const map = new Map(get().macros.map(m => [m.id, m]));
      for (const m of list) map.set(m.id, m);
      const macros = [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      set({ macros });
      void kvSet('macros', macros);
    },
    deleteMacro(id) {
      const macros = get().macros.filter(m => m.id !== id);
      set({ macros });
      void kvSet('macros', macros);
    },
    placeMacro(id, at) {
      const m = get().macros.find(x => x.id === id);
      if (!m) return;
      const { pageId } = get();
      const off = pasteOffset(m.clip, at);
      let r = { ids: [] as string[], newCards: [] as string[] };
      get().commit(p => { r = pasteElements(p, pageId, m.clip, off.x, off.y); placedOnWires(p, currentPage(p, pageId), r.ids); });
      set({ selection: r.ids });
      if (r.newCards.length) get().logMsg(tx('Create le schede PLC {0}', r.newCards.join(', ')));
    },
    tbLibrary: [],
    editTitleBlock: null,
    openTitleBlockEditor(tpl) {
      const draft: TitleBlockTemplate = tpl ? structuredClone(tpl) : { id: '', name: 'Nuovo cartiglio', prims: [] };
      // I cartigli inclusi non si modificano: se ne crea una copia
      if (draft.builtin) { draft.id = ''; draft.name = `${draft.name} (copia)`; delete draft.builtin; }
      set({ editTitleBlock: draft, editSymbol: null, view: 'symbol' });
    },
    saveTitleBlock(tpl) {
      const t = structuredClone(tpl);
      delete t.builtin;
      if (!t.id) t.id = uid('tb');
      get().commit(p => {
        const list = p.titleBlockTemplates ?? [];
        p.titleBlockTemplates = list.some(x => x.id === t.id) ? list.map(x => (x.id === t.id ? structuredClone(t) : x)) : [...list, structuredClone(t)];
      });
      const lib = get().tbLibrary;
      const tbLibrary = lib.some(x => x.id === t.id) ? lib.map(x => (x.id === t.id ? t : x)) : [...lib, t];
      set({ tbLibrary, editTitleBlock: get().editTitleBlock ? t : null });
      void kvSet('titleBlocks', tbLibrary);
      return t;
    },
    deleteTitleBlock(id) {
      get().commit(p => {
        p.titleBlockTemplates = (p.titleBlockTemplates ?? []).filter(x => x.id !== id);
        if (!p.titleBlockTemplates.length) delete p.titleBlockTemplates;
        if (p.titleBlock?.templateId === id) delete p.titleBlock.templateId;
        for (const pg of p.pages) if (pg.titleBlockId === id) delete pg.titleBlockId;
      });
      const tbLibrary = get().tbLibrary.filter(x => x.id !== id);
      set({ tbLibrary });
      void kvSet('titleBlocks', tbLibrary);
    },
    useTitleBlock(id, pageId) {
      if (!pageId && lockedParts(get().project).includes('titleBlock')) { get().logMsg(tx('Cartiglio bloccato dal profilo «{0}»: per cambiarlo sbloccalo in Impostazioni ▸ Profili', get().project.settings.locks?.profile ?? ''), 'warn'); return; }
      // Un cartiglio della libreria personale viene copiato nel progetto, così il file è completo
      const fromLib = get().tbLibrary.find(x => x.id === id);
      get().commit(p => {
        if (fromLib && !(p.titleBlockTemplates ?? []).some(x => x.id === id)) p.titleBlockTemplates = [...(p.titleBlockTemplates ?? []), structuredClone(fromLib)];
        if (pageId) {
          const pg = p.pages.find(x => x.id === pageId);
          if (pg) { if (id) pg.titleBlockId = id; else delete pg.titleBlockId; }
        } else {
          p.titleBlock = { ...(p.titleBlock ?? {}) };
          if (id && id !== 'standard') p.titleBlock.templateId = id; else delete p.titleBlock.templateId;
        }
        // I campi che il modello usa ({campo:Matricola}…) compaiono nelle Proprietà del progetto, da compilare
        const tpl = titleBlockTemplates(p).find(x => x.id === id);
        const missing = tpl ? templateFields(tpl).filter(f => !(p.titleBlock?.fields ?? []).some(x => x.label.trim().toLowerCase() === f.toLowerCase())) : [];
        if (missing.length) p.titleBlock = { ...(p.titleBlock ?? {}), fields: [...(p.titleBlock?.fields ?? []), ...missing.map(label => ({ label, value: '' }))] };
      });
    },
    editSymbol: null,
    openSymbolEditor(sym) {
      const draft: SymbolDef = sym
        ? structuredClone(sym)
        : { id: '', name: tx('Nuovo simbolo'), category: tx('Simboli personali'), letter: 'A', role: 'single', prims: [], pins: [], tagPos: { x: -8, y: 4 } };
      set({ editSymbol: draft, editTitleBlock: null, view: 'symbol' });
    },
    saveSymbol(sym) {
      const s = structuredClone(sym);
      // La riga "simbolodef" del formato testo non descrive più il simbolo modificato
      delete s.textDef;
      const from = s.id;
      // I simboli di base non si sovrascrivono: la copia personale prende il loro posto nel progetto
      const builtin = BUILTIN_IDS.has(from);
      if (!s.id || builtin) { s.id = uid('user:'); if (builtin) s.replaces = from; }
      // Una sola copia per simbolo di base nella libreria: la nuova prende il posto della precedente
      // (i progetti che usano la precedente ne conservano la loro copia)
      if (s.replaces) {
        const symbolLibrary = get().symbolLibrary.filter(x => x.replaces !== s.replaces || x.id === s.id);
        if (symbolLibrary.length !== get().symbolLibrary.length) { setLibrarySymbols(symbolLibrary); set({ symbolLibrary }); }
      }
      get().addSymbolsToLibrary([s], '');
      const partNr = s.id.startsWith('bb:') ? s.id.slice(3) : undefined;
      const p0 = get().project;
      const used = builtin && p0.pages.some(pg => pg.elements.some(e => e.kind === 'symbol' && e.symbolId === from));
      if (used || p0.customSymbols.some(x => x.id === s.id) || (partNr && p0.parts.some(x => x.partNr === partNr && x.symbolId !== s.id))) {
        get().commit(p => {
          if (used) {
            for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.symbolId === from) e.symbolId = s.id;
            p.customSymbols.push(structuredClone(s));
          } else p.customSymbols = p.customSymbols.map(x => (x.id === s.id ? structuredClone(s) : x));
          // La scatola nera modificata resta il simbolo dell'articolo (non viene rigenerata)
          if (partNr) for (const x of p.parts) if (x.partNr === partNr) x.symbolId = s.id;
        });
      }
      if (partNr && get().library.some(x => x.partNr === partNr && x.symbolId !== s.id)) {
        const library = get().library.map(x => (x.partNr === partNr ? { ...x, symbolId: s.id } : x));
        set({ library });
        persistLibrary(library);
      }
      if (builtin && get().favorites.includes(from)) {
        const favorites = get().favorites.map(x => (x === from ? s.id : x));
        set({ favorites });
        void kvSet('favorites', favorites);
      }
      set({ editSymbol: s });
      return s;
    },
    toggleFavorite(symbolId) {
      const f = get().favorites;
      const favorites = f.includes(symbolId) ? f.filter(x => x !== symbolId) : [...f, symbolId];
      set({ favorites });
      void kvSet('favorites', favorites);
    },
    restoreBuiltin(copyId) {
      const copy = get().symbolLibrary.find(x => x.id === copyId);
      if (!copy?.replaces) return;
      const symbolLibrary = get().symbolLibrary.filter(x => x.id !== copyId);
      setLibrarySymbols(symbolLibrary);
      set({ symbolLibrary });
      void kvSet('symbols', symbolLibrary);
      const favorites = get().favorites.map(x => (x === copyId ? copy.replaces! : x));
      set({ favorites });
      void kvSet('favorites', favorites);
    },
    saveSymbolAs(sym, name) {
      const s = structuredClone(sym);
      delete s.textDef;
      s.id = uid('user:');
      s.name = name;
      delete s.replaces;
      if (BUILTIN_IDS.has(sym.id) || sym.id.startsWith('bb:')) s.category = tx('Simboli personali');
      get().addSymbolsToLibrary([s], '');
      set({ editSymbol: s });
      return s;
    },
    addWireDef(a, b) {
      const { project, pageId } = get();
      const page = currentPage(project, pageId);
      const crossed = crossedWires(page, { points: [a, b] }).map(x => x.wire);
      if (!crossed.length) { get().logMsg(tx('La linea non attraversa nessun filo'), 'warn'); return; }
      const first = <K extends 'cross' | 'color' | 'wireType'>(k: K) => crossed.map(w => w[k]).find(Boolean);
      const d: WireDef = { kind: 'wiredef', id: uid('d'), points: [a, b], cross: first('cross') ?? '1,5' };
      get().commit(p => { const pg = currentPage(p, pageId); pg.elements.push(d); applyWireDefs(pg, [d.id]); });
      // Lo strumento resta attivo per la linea successiva (Esc per finire)
      get().logMsg(tx('Linea di definizione su {0} fili: clic sulla riga per la sezione; la scritta si trascina', crossed.length));
    },
    addCableLine(a, b, cableId) {
      const { project, pageId } = get();
      const page = currentPage(project, pageId);
      const cable = cableId ? undefined : newCable(project, page, { points: [a, b] });
      const line: CableLine = { kind: 'cable', id: uid('k'), cableId: cableId ?? cable!.id, points: [a, b] };
      get().commit(p => {
        if (cable) (p.cables ??= []).push(cable);
        currentPage(p, pageId).elements.push(line);
      });
      set({ selection: [line.id], tool: { kind: 'select' } });
      if (cable) get().logMsg(tx('Cavo -{0} creato con {1} conduttori ({2})', cable.tag, cable.conductors.length, cable.conductors.join(', ')));
    },
    updateCable(id, patch) { get().updateCables([id], patch); },
    setMainCableLine(lineId, on) {
      get().commit(p => {
        const lines = p.pages.flatMap(pg => pg.elements).filter((e): e is CableLine => e.kind === 'cable');
        const me = lines.find(l => l.id === lineId);
        if (!me) return;
        for (const l of lines) if (l.cableId === me.cableId) delete l.main;
        if (on) me.main = true;
      });
    },
    cableClipboard: null,
    copyCableProps(id) {
      const clip = copyCableProps(get().project, id);
      if (!clip) return;
      set({ cableClipboard: clip });
      get().logMsg(tx('Proprietà del cavo -{0} copiate', clip.tag));
    },
    pasteCableProps(ids) {
      const clip = get().cableClipboard;
      if (!clip || !ids.length) return;
      get().commit(p => {
        for (const id of ids) pasteCableProps(p, id, clip);
        copyPart(p, get().library, clip.props.partNr);
      });
      get().logMsg(tx('Proprietà del cavo -{0} incollate su {1} cavi', clip.tag, ids.length));
    },
    updateCables(ids, patch) {
      get().commit(p => {
        for (const c of p.cables ?? []) {
          if (!ids.includes(c.id)) continue;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') delete (c as unknown as Record<string, unknown>)[k];
            else (c as unknown as Record<string, unknown>)[k] = v;
          }
          copyPart(p, get().library, c.partNr);
        }
      });
    },
    setCableMarking(ids, marking) {
      get().commit(p => {
        for (const c of p.cables ?? []) if (ids.includes(c.id)) Object.assign(c, remarkCable(c, marking));
      });
    },
    applyCableType(ids, partNr) {
      const part = partsIndex(get().project, get().library).get(partNr);
      if (!part) return;
      get().commit(p => {
        for (const c of p.cables ?? []) if (ids.includes(c.id)) Object.assign(c, cableFromPart(c, part));
        copyPart(p, get().library, partNr);
      });
    },
    renameConductor(cableId, index, name) {
      name = name.trim();
      get().commit(p => {
        const c = p.cables?.find(x => x.id === cableId);
        const old = c?.conductors[index];
        if (!c || old === undefined || !name || name === old) return;
        c.conductors[index] = name;
        for (const [w, n] of Object.entries(c.assign)) if (n === old) c.assign[w] = name;
      });
    },
    assignConductor(cableId, wireId, name) {
      get().commit(p => {
        const c = p.cables?.find(x => x.id === cableId);
        if (!c) return;
        if (name) c.assign[wireId] = name; else delete c.assign[wireId];
      });
    },
    reassignConductors(cableIds) {
      get().commit(p => { for (const c of p.cables ?? []) if (cableIds.includes(c.id)) delete c.fixed; });
    },
    deleteCable(id) {
      get().commit(p => {
        p.cables = (p.cables ?? []).filter(c => c.id !== id);
        for (const pg of p.pages) pg.elements = pg.elements.filter(e => !(e.kind === 'cable' && e.cableId === id));
      });
      set({ selection: [] });
    },
    replaceInProject(hits, query, replacement, o) {
      let n = 0;
      get().commit(p => { n = replaceHits(p, hits, query, replacement, o); });
      get().logMsg(tx('Sostituiti {0} valori ("{1}" → "{2}")', n, query, replacement));
    },
    mirrorSelection() {
      const { selection, pageId } = get();
      get().commit(p => {
        for (const e of currentPage(p, pageId).elements) if (e.kind === 'symbol' && selection.includes(e.id) && !getSymbol(e.symbolId, p)?.noMirror) e.mirror = !e.mirror;
        autoConnect(p, currentPage(p, pageId), selection);
      });
    },
    duplicatePage(id, opts) {
      let page: Page | undefined;
      get().commit(p => { page = duplicatePageModel(p, id, opts); if (page) p.pages = placeByNumber(p.pages, page.id); });
      if (page) { get().setPage(page.id); get().logMsg(tx('Pagina duplicata come {0}', page.name)); }
    },

    addPartsToLibrary(parts, source) {
      const lib = new Map(get().library.map(p => [p.partNr, p]));
      for (const p of parts) lib.set(p.partNr, p);
      const library = [...lib.values()].sort((a, b) => a.partNr.localeCompare(b.partNr));
      set({ library });
      persistLibrary(library);
      get().logMsg(tx('{0} articoli importati da {1}', parts.length, source));
    },
    addSymbolsToLibrary(symbols, source) {
      const map = new Map(get().symbolLibrary.map(x => [x.id, x]));
      for (const x of symbols) map.set(x.id, x);
      const symbolLibrary = [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setLibrarySymbols(symbolLibrary);
      set({ symbolLibrary });
      void kvSet('symbols', symbolLibrary);
      if (source) get().logMsg(tx('{0} simboli importati da {1}', symbols.length, source));
    },
    deleteLibrarySymbols(ids) {
      const lib = get().symbolLibrary.filter(x => ids.includes(x.id) && !isDeletedSymbol(x) && !x.replaces);
      if (!lib.length) return;
      get().addSymbolsToLibrary(lib.map(x => ({ ...x, category: deletedCategory(x.category) })), '');
      const favorites = get().favorites.filter(f => !ids.includes(f));
      if (favorites.length !== get().favorites.length) { set({ favorites }); void kvSet('favorites', favorites); }
      const t = get().tool;
      if (t.kind === 'place' && ids.includes(t.symbolId)) set({ tool: { kind: 'select' } });
      get().logMsg(lib.length === 1 ? tx('Simbolo «{0}» spostato nella cartella {1}: per usarlo di nuovo spostalo nell\'albero', lib[0].name, 'Eliminare') : tx('{0} simboli spostati nella cartella {1}', lib.length, 'Eliminare'));
    },
    moveLibrarySymbols(ids, category) {
      const cat = category.split('/').map(x => x.trim()).filter(Boolean).join(' / ');
      if (!cat || isDeletedSymbol({ category: cat })) return;
      const lib = get().symbolLibrary.filter(x => ids.includes(x.id) && !x.replaces);
      if (!lib.length) return;
      get().addSymbolsToLibrary(lib.map(x => ({ ...x, category: cat })), '');
      get().logMsg(tx('{0} simboli spostati in «{1}»', lib.length, cat));
    },
    unifySymbols(merges) {
      const byId = new Map(get().symbolLibrary.map(x => [x.id, x]));
      const changed: SymbolDef[] = [];
      const remap = new Map<string, SymbolDef>();
      for (const m of merges) {
        const keep = byId.get(m.keep);
        const others = m.others.map(id => byId.get(id)).filter((x): x is SymbolDef => !!x && x.id !== m.keep);
        if (!keep || !others.length) continue;
        const { kept, removed } = mergeSymbols(keep, others);
        changed.push(kept, ...removed);
        for (const o of others) remap.set(o.id, kept);
      }
      if (!changed.length) return;
      get().addSymbolsToLibrary(changed, '');
      // Il progetto aperto passa subito ai simboli tenuti; gli altri progetti quando si aprono (alias)
      const p0 = get().project;
      if (p0.customSymbols.some(x => remap.has(x.id))) get().commit(p => { for (const [from, to] of remap) if (p.customSymbols.some(x => x.id === from)) remapSymbol(p, from, to); });
      const favorites = [...new Set(get().favorites.map(f => remap.get(f)?.id ?? f))];
      set({ favorites });
      void kvSet('favorites', favorites);
      get().logMsg(tx('{0} doppioni unificati: sono nella cartella {1}', remap.size, 'Eliminare'));
    },
    applyLibrarySync(diffs, choices) {
      let toLibrary: SymbolDef[] = [];
      get().commit(p => { toLibrary = applySymbolChoices(p, diffs, choices); });
      if (toLibrary.length) get().addSymbolsToLibrary(toLibrary, '');
    },
    revealSymbol: null,
    revealInLibrary(symbolId) {
      set({ revealSymbol: { id: symbolId, n: (get().revealSymbol?.n ?? 0) + 1 } });
    },
    removeSymbolCategory(category) {
      const symbolLibrary = get().symbolLibrary.filter(x => x.category !== category);
      setLibrarySymbols(symbolLibrary);
      set({ symbolLibrary });
      void kvSet('symbols', symbolLibrary);
    },
    updatePart(partNr, patch) {
      const library = get().library.map(p => p.partNr === partNr ? { ...p, ...patch } : p);
      set({ library });
      persistLibrary(library);
      const part = library.find(p => p.partNr === partNr) ?? get().project.parts.find(p => p.partNr === partNr);
      if (get().project.parts.some(p => p.partNr === partNr) || (part && cablesUse(get().project, part))) {
        get().commit(p => {
          p.parts = p.parts.map(x => x.partNr === partNr ? { ...x, ...patch } : x);
          followPart(p, p.parts.find(x => x.partNr === partNr) ?? part);
        });
      }
    },
    removePart(partNr) {
      get().removeParts([partNr]);
    },
    removeParts(partNrs) {
      const drop = new Set(partNrs);
      const library = get().library.filter(p => !drop.has(p.partNr));
      set({ library });
      persistLibrary(library);
    },
    removePartFromProject(partNr) {
      get().commit(p => {
        p.parts = p.parts.filter(x => x.partNr !== partNr);
        const { parts: _parts, ...rest } = p;
        dropPartRefs(rest, partNr);
      });
    },
    assignPart(instIds, partNr) {
      partNr = partNr.trim();
      if (partNr && !get().library.some(p => p.partNr === partNr) && !get().project.parts.some(p => p.partNr === partNr)) {
        // Codice nuovo: l'articolo nasce con i dati del dispositivo (un solo passo di annullamento)
        const { past, project } = get();
        get().savePart(partNr, {});
        get().assignPart(instIds, partNr);
        if (instIds[0]) get().storeDeviceInPart(instIds[0]);
        set({ past: [...past, project] });
        get().logMsg(tx('Nuovo articolo {0} nella libreria', partNr));
        return;
      }
      const part = get().library.find(p => p.partNr === partNr) ?? get().project.parts.find(p => p.partNr === partNr);
      // L'articolo vale per tutto il dispositivo: tolgo quello precedente dagli altri elementi
      // I piani di un morsetto sono un morsetto solo: lo stesso articolo su tutti
      const owners = new Set(instIds.flatMap(id => terminalLevelIds(get().project, id)));
      const others = new Set(instIds.flatMap(id => sameDeviceIds(get().project, id)).filter(id => !owners.has(id)));
      get().commit(p => {
        if (part && !p.parts.some(x => x.partNr === partNr)) p.parts.push(structuredClone(part));
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol') continue;
          if (owners.has(e.id)) e.partNr = partNr || undefined;
          else if (others.has(e.id)) delete e.partNr;
        }
      });
    },
    setUserPropDefs(defs) {
      get().commit(p => { if (defs.length) p.userProps = defs; else delete p.userProps; });
    },
    setUserProp(target, id, value) {
      const put = (rec: Record<string, string> | undefined) => {
        const out = { ...(rec ?? {}) };
        if (value.trim()) out[id] = value.trim(); else delete out[id];
        return Object.keys(out).length ? out : undefined;
      };
      if (target.kind === 'device') {
        const ids = sameDeviceIds(get().project, target.instId);
        const cur = get().project.pages.flatMap(pg => pg.elements).find((e): e is SymbolInstance => e.kind === 'symbol' && ids.includes(e.id) && !!e.userProps)?.userProps;
        get().updateDevice(target.instId, { userProps: put(cur) });
        return;
      }
      if (target.kind === 'part') {
        const part = get().library.find(x => x.partNr === target.partNr) ?? get().project.parts.find(x => x.partNr === target.partNr);
        const attrs = { ...(part?.attrs ?? {}) };
        // Articolo leggero (database): gli attributi sono solo le modifiche, "" toglie il valore
        if (value.trim()) attrs[id] = value.trim(); else if (part?.lite) attrs[id] = ''; else delete attrs[id];
        get().savePart(target.partNr, { attrs });
        return;
      }
      get().commit(p => {
        if (target.kind === 'project') { const r = put(p.userPropValues); if (r) p.userPropValues = r; else delete p.userPropValues; }
        for (const pg of p.pages) {
          if (target.kind === 'page' && pg.id === target.pageId) { const r = put(pg.userProps); if (r) pg.userProps = r; else delete pg.userProps; }
          if (target.kind === 'wire') for (const e of pg.elements) {
            if (e.kind !== 'wire' || e.id !== target.wireId) continue;
            const r = put(e.userProps); if (r) e.userProps = r; else delete e.userProps;
          }
        }
      });
    },
    savePart(partNr, patch) {
      partNr = partNr.trim();
      if (!partNr) return;
      const cur = get().library.find(p => p.partNr === partNr) ?? get().project.parts.find(p => p.partNr === partNr);
      const part: Part = { ...(cur ?? { partNr, functionTemplates: [], attrs: {}, source: 'OpenWiring' }), ...patch, partNr };
      // I campi svuotati si tolgono
      for (const k of Object.keys(patch) as (keyof Part)[]) if (part[k] === undefined || part[k] === '') delete part[k];
      const library = [...get().library.filter(p => p.partNr !== partNr), part].sort((a, b) => a.partNr.localeCompare(b.partNr));
      set({ library });
      persistLibrary(library);
      if (get().project.parts.some(p => p.partNr === partNr) || cablesUse(get().project, part)) {
        get().commit(p => { p.parts = p.parts.map(x => (x.partNr === partNr ? structuredClone(part) : x)); followPart(p, part); });
      }
    },
    replaceParts(parts) {
      if (!parts.length) return;
      const by = new Map(parts.map(p => [p.partNr, p]));
      const lib = new Map(get().library.map(p => [p.partNr, p]));
      for (const p of parts) lib.set(p.partNr, p);
      const library = [...lib.values()].sort((a, b) => a.partNr.localeCompare(b.partNr));
      set({ library });
      persistLibrary(library);
      if (get().project.parts.some(p => by.has(p.partNr)) || parts.some(x => cablesUse(get().project, x))) {
        get().commit(p => { p.parts = p.parts.map(x => (by.has(x.partNr) ? structuredClone(by.get(x.partNr)!) : x)); for (const x of parts) followPart(p, x); });
      }
    },
    storeDeviceInPart(instId) {
      const ids = sameDeviceIds(get().project, instId);
      const els = get().project.pages.flatMap(pg => pg.elements).filter((e): e is SymbolInstance => e.kind === 'symbol' && ids.includes(e.id));
      const main = els.find(e => e.id === instId);
      const ordered = main ? [main, ...els.filter(e => e !== main)] : els;
      const own = (k: 'manufacturer' | 'typeNr' | 'orderNr' | 'techData') => ordered.map(e => e[k]).find(v => v !== undefined && v !== '');
      const partNr = ordered.map(e => e.partNr).find(Boolean);
      if (!partNr) return;
      const patch: Partial<Part> = {};
      const m = own('manufacturer'), t = own('typeNr'), o = own('orderNr'), d = own('techData');
      if (m) patch.manufacturer = m;
      if (t) patch.typeNr = t;
      if (o) patch.orderNr = o;
      if (d) patch.descr2 = d;
      if (!Object.keys(patch).length) return;
      get().savePart(partNr, patch);
      // Il dispositivo da ora li prende dall'articolo
      get().commit(p => {
        if (!p.parts.some(x => x.partNr === partNr)) p.parts.push(structuredClone(get().library.find(x => x.partNr === partNr)!));
        for (const pg of p.pages) for (const e of pg.elements) {
          if (e.kind !== 'symbol' || !ids.includes(e.id)) continue;
          for (const k of ['manufacturer', 'typeNr', 'orderNr', 'techData'] as const) delete e[k];
        }
      });
    },
    setExtraParts(instId, list) {
      const clean = list.map(x => ({ ...x, partNr: x.partNr.trim() })).filter(x => x.partNr);
      // Descrizione e costruttore di un codice nuovo vanno nella libreria: al prossimo uso ci sono già
      for (const x of clean) {
        const patch: Partial<Part> = {};
        if (x.descr?.trim()) patch.descr1 = x.descr.trim();
        if (x.manufacturer?.trim()) patch.manufacturer = x.manufacturer.trim();
        if (Object.keys(patch).length) get().savePart(x.partNr, patch);
      }
      const lib = get().library;
      const entries = clean.map(x => {
        const known = lib.some(q => q.partNr === x.partNr) || get().project.parts.some(q => q.partNr === x.partNr);
        return {
          partNr: x.partNr, ...(x.qty && x.qty !== 1 ? { qty: x.qty } : {}),
          // Restano sull'elemento solo per i codici che non sono articoli
          ...(!known && x.descr?.trim() ? { descr: x.descr.trim() } : {}), ...(!known && x.manufacturer?.trim() ? { manufacturer: x.manufacturer.trim() } : {}),
        };
      });
      get().commit(p => {
        for (const x of entries) {
          const part = lib.find(q => q.partNr === x.partNr);
          if (part && !p.parts.some(q => q.partNr === x.partNr)) p.parts.push(structuredClone(part));
        }
      });
      get().updateDevice(instId, { extraParts: entries.length ? entries : undefined });
    },
    startPlacePart(partNr) {
      const part = get().library.find(p => p.partNr === partNr) ?? get().project.parts.find(p => p.partNr === partNr);
      if (!part) return;
      if (part.symbolId && getSymbol(part.symbolId, get().project)) {
        get().commit(p => { if (!p.parts.some(x => x.partNr === partNr)) p.parts.push(structuredClone(part)); });
        set({ tool: { kind: 'place', symbolId: part.symbolId, rot: 0, partNr }, view: 'schema' });
        return;
      }
      const sym = blackBoxFromPart(part);
      get().commit(p => {
        p.customSymbols = p.customSymbols.filter(s => s.id !== sym.id);
        p.customSymbols.push(sym);
        if (!p.parts.some(x => x.partNr === partNr)) p.parts.push(structuredClone(part));
      });
      set({ tool: { kind: 'place', symbolId: sym.id, rot: 0, partNr }, view: 'schema' });
    },

    logMsg(msg, level = 'info') {
      const time = new Date().toLocaleTimeString('it-IT');
      set(s => ({ log: [...s.log.slice(-199), { time, level, msg }] }));
    },
  };
});

/**
 * Nome proposto per un nuovo rimando: il primo rimando di un'altra pagina ancora senza
 * corrispondente, altrimenti un nome nuovo R1, R2…
 */
function proposeLinkName(p: Project, page: Page): string {
  const count = new Map<string, { n: number; pages: Set<string> }>();
  for (const pg of p.pages) for (const e of pg.elements) {
    if (e.kind !== 'symbol' || getSymbol(e.symbolId, p)?.role !== 'link' || !e.tag) continue;
    const c = count.get(e.tag) ?? { n: 0, pages: new Set() };
    c.n++; c.pages.add(pg.id); count.set(e.tag, c);
  }
  for (const [name, c] of count) if (c.n === 1 && !c.pages.has(page.id)) return name;
  let i = 1;
  while (count.has(`R${i}`)) i++;
  return `R${i}`;
}

/**
 * Un simbolo della libreria personale usato in un progetto viene copiato nel progetto,
 * così il file .ecad resta completo anche su un altro computer.
 */
export function ensureSymbolInProject(p: Project, symbolId: string) {
  if (p.customSymbols.some(x => x.id === symbolId)) return;
  const sym = getSymbol(symbolId);
  if (sym && !BUILTIN_IDS.has(symbolId)) p.customSymbols.push(structuredClone(sym));
}
const BUILTIN_IDS = new Set(BUILTIN_SYMBOLS.map(x => x.id));

/** Stato del progetto attivo da mettere da parte quando se ne attiva un altro */
function slotOf(s: Pick<State, 'project' | 'filePath' | 'dirty' | 'savedAt' | 'past' | 'future' | 'pageId'>): OpenProject {
  return { key: uid('o'), project: s.project, filePath: s.filePath, dirty: s.dirty, savedAt: s.savedAt, past: s.past, future: s.future, pageId: s.pageId };
}

/** Copia personale che sostituisce un simbolo di base (dalla libreria, o quella del progetto); altrimenti l'id stesso */
export function preferredSymbolId(id: string, symbolLibrary: SymbolDef[], project: Project): string {
  if (!BUILTIN_IDS.has(id)) return id;
  return (symbolLibrary.find(x => x.replaces === id) ?? project.customSymbols.find(x => x.replaces === id))?.id ?? id;
}

function lastStrip(p: Project): string | undefined {
  let last: string | undefined;
  for (const pg of p.pages) for (const e of pg.elements) {
    if (e.kind === 'symbol' && e.tag.includes(':') && getSymbol(e.symbolId, p)?.role === 'terminal') last = stripOf(e.tag);
  }
  return last;
}

function lastConnector(p: Project): string | undefined {
  let last: string | undefined;
  for (const pg of p.pages) for (const e of pg.elements) {
    if (e.kind === 'symbol' && e.tag.includes(':') && getSymbol(e.symbolId, p)?.role === 'pin') last = stripOf(e.tag);
  }
  return last;
}

/** Copia nel progetto un articolo della libreria (per i dati delle morsettiere) */
/**
 * Toglie ogni riferimento all'articolo: campi partNr e …PartNr con quel codice, articoli aggiuntivi
 * e articoli delle riserve. Così l'articolo eliminato non resta nella lista del progetto.
 */
export function dropPartRefs(o: unknown, partNr: string): void {
  if (Array.isArray(o)) {
    for (let i = o.length - 1; i >= 0; i--) {
      const x = o[i];
      // Articoli aggiuntivi: l'elemento della lista è l'articolo stesso
      if (x && typeof x === 'object' && !Array.isArray(x) && (x as { partNr?: string }).partNr === partNr && Object.keys(x).every(k => ['partNr', 'qty', 'manufacturer', 'descr'].includes(k))) o.splice(i, 1);
      else dropPartRefs(x, partNr);
    }
    return;
  }
  if (!o || typeof o !== 'object') return;
  const r = o as Record<string, unknown>;
  for (const [k, v] of Object.entries(r)) {
    if (v === partNr && (k === 'partNr' || k.endsWith('PartNr'))) delete r[k];
    else if (k === 'spareParts' && v && typeof v === 'object') {
      for (const [no, nr] of Object.entries(v)) if (nr === partNr) delete (v as Record<string, string>)[no];
    } else if (typeof v === 'object') dropPartRefs(v, partNr);
  }
}

function copyPart(p: Project, library: Part[], partNr?: string) {
  if (!partNr || p.parts.some(x => x.partNr === partNr)) return;
  const part = library.find(x => x.partNr === partNr);
  if (part) p.parts.push(structuredClone(part));
}

/**
 * Sposta gli elementi selezionati. Gli estremi dei fili non selezionati collegati ai
 * punti di connessione spostati seguono il simbolo ("elastico"), mantenendo i segmenti ortogonali.
 */
/** Sposta gli elementi e adatta i fili collegati restando ortogonali (vedi wireEdit.ts) */
export function moveElements(p: Project, pg: Page, ids: Set<string>, dx: number, dy: number) {
  moveWithWires(p, pg, ids, dx, dy);
  splitWiresAtSymbols(p, pg, ids);
  autoConnect(p, pg, ids);
  // Linee di definizione spostate: i fili che attraversano ora prendono i loro valori
  applyWireDefs(pg, ids);
}

/** Elementi incollati o duplicati: i simboli posati sopra un filo lo interrompono, come all'inserimento */
function placedOnWires(p: Project, pg: Page, ids: string[]) {
  splitWiresAtSymbols(p, pg, new Set(ids));
  autoConnect(p, pg, ids);
}

// Le misure del foglio (PAGE_W, FRAME, COLUMNS… in types.ts) seguono le impostazioni del progetto aperto
// (anche di una revisione archiviata in visione)
applySheet(useStore.getState().project.settings);
useStore.subscribe((s, prev) => { if (s.project.settings?.sheet !== prev.project.settings?.sheet) applySheet(s.project.settings); });

// Nell'app desktop la libreria articoli sta nel database SQLite (ui/partsDbSync.ts), che segue le
// modifiche della libreria da solo: l'archivio del browser serve solo alla versione web
let libraryInDb = false;
export function setLibraryInDb() { libraryInDb = true; }
function persistLibrary(library: Part[]) { if (!libraryInDb) void kvSet('library', library); }

/** Carica la libreria articoli salvata */
export async function restoreLibrary() {
  const stored = libraryInDb ? undefined : await kvGet<Part[]>('library');
  const lib = stored && repairPartCables(stored);
  if (lib) persistLibrary(lib);
  if ((lib ?? stored)?.length) useStore.setState({ library: lib ?? stored! });
  const templates = await kvGet<ProjectTemplate[]>('templates');
  if (templates?.length) useStore.setState({ templates });
  const profiles = await kvGet<SettingsProfile[]>('profiles');
  if (profiles?.length) useStore.setState({ profiles });
  const macros = await kvGet<Macro[]>('macros');
  if (macros?.length) useStore.setState({ macros });
  const syms = (await kvGet<SymbolDef[]>('symbols'))?.map(repairQetSymbol);
  if (syms) for (const x of syms) {
    if (x.replaces || !x.id.startsWith('user:')) continue;
    const b = BUILTIN_SYMBOLS.find(y => y.name === x.name && y.category === x.category);
    if (b) x.replaces = b.id;
  }
  if (syms?.length) { setLibrarySymbols(syms); useStore.setState({ symbolLibrary: syms }); }
  const favorites = await kvGet<string[]>('favorites');
  if (favorites?.length) useStore.setState({ favorites });
  const tbs = await kvGet<TitleBlockTemplate[]>('titleBlocks');
  if (tbs?.length) useStore.setState({ tbLibrary: tbs });
}
