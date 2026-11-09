// Barra multifunzione (come Office ed EPLAN): i comandi in schede per argomento, raggruppati, con le
// icone grandi per i più usati. Le schede contestuali (Simbolo, Revisione archiviata) compaiono solo
// quando servono. Due forme: completa e compatta su una riga (Impostazioni ▸ Programma ▸ Barra dei
// comandi); con Ctrl+F1 resta solo la riga delle schede e il contenuto si apre con un clic.
// La scheda File apre la pagina File (Backstage.tsx); i menu classici restano in MenuBar.tsx.
import { startTerminalRow } from './terminalRowChooser';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, type State, type Tool } from '../model/store';
import * as A from './actions';
import { PROTOCOLS, protocolLabel } from '../model/network';
import { ALIGN_MODES } from '../model/align';
import { LANGS } from '../model/i18n';
import { getSymbol } from '../model/geometry';
import { canReplace } from '../model/replaceSymbol';
import { templateFor } from '../model/titleBlocks';
import { settingsOf } from '../model/numbering';
import type { SymbolDef, SymbolInstance } from '../model/types';
import { keyLabel, onKeysChange } from './shortcuts';
import { openSettingsAt } from './SettingsDialog';
import { openPropsDialog } from './PropsDialog';
import { chooseReplacement } from './ReplaceSymbolDialog';
import { chooseRepresentation } from './representationChooser';
import { checkUpdates } from './updates';
import { insertImageFromFile, insertDxfDrawing } from './images';
import { usePanelStore } from './panels';
import { SymbolPreview } from './SymbolLibrary';
import { PaletteButton, ViewTabs, UI_STYLES, type Item } from './MenuBar';
import { Icon } from './icons';
import { tipProps } from './RichTooltip';
import { startTour } from './Tour';
import { tx, tn, UI_LANGS, uiLang } from '../i18n/ui';

/** Un comando della barra: grande (icona sopra, scritta sotto) o piccolo (icona e scritta su una riga) */
export interface RButton {
  icon: string;
  label: string;
  run?: () => void;
  /** Comando con le scorciatoie configurabili: il tasto va nel suggerimento */
  cmd?: string;
  title?: string;
  big?: boolean;
  active?: boolean;
  disabled?: boolean;
  /** Menu a discesa al posto del comando (o accanto, se c'è anche run) */
  menu?: () => Item[];
}
type RItem = RButton | { gallery: true } | { custom: ReactNode };
interface RGroup { name: string; items: RItem[] }
export interface RTab { id: string; name: string; groups: RGroup[]; /** Scheda contestuale: titolo sopra la scheda */ ctx?: string }

const isButton = (i: RItem): i is RButton => 'icon' in i;

/** Suggerimento con il tasto del comando, se ne ha uno */
const hint = (text: string, id?: string) => { const k = id && keyLabel(id); return k ? `${text} (${k})` : text; };

/** Simboli della galleria quando non ci sono preferiti */
const GALLERY_DEFAULT = ['coil', 'no', 'nc', 'terminal', 'link', 'link_in', 'motor3'];

/** Schede della barra, con lo stato del momento (comandi attivi, disattivati, selezionati) */
export function ribbonTabs(s: State): RTab[] {
  const st = useStore.getState;
  const hasSel = s.selection.length > 0;
  const schema = s.view === 'schema';
  const page = s.project.pages.find(p => p.id === s.pageId);
  const multi = page?.type === 'multiline';
  const tool = (t: Tool) => () => { st().setView('schema'); st().setTool(t); };
  const is = (f: (t: Tool) => boolean) => schema && f(s.tool);
  const panels = usePanelStore.getState().layout;
  const released = s.project.revisionState === 'released';
  const tabs: RTab[] = [
    {
      id: 'home', name: tn('Home'), groups: [
        { name: tn('Appunti'), items: [
          { icon: 'paste', label: tx('Incolla'), big: true, cmd: 'paste', run: () => st().setTool({ kind: 'paste' }), disabled: !s.clipboard || !schema, title: tx('Gli elementi copiati seguono il puntatore: clic per posarli, Esc per annullare') },
          { icon: 'cut', label: tx('Taglia'), cmd: 'cut', run: () => st().cutSelection(), disabled: !hasSel || !schema },
          { icon: 'copy', label: tx('Copia'), cmd: 'copy', run: () => st().copySelection(), disabled: !hasSel || !schema },
          { icon: 'duplicate', label: tx('Duplica'), cmd: 'duplicate', run: () => st().duplicateSelection(), disabled: !hasSel },
        ] },
        { name: tn('Disegno'), items: [
          { icon: 'select', label: tx('Seleziona'), big: true, run: tool({ kind: 'select' }), active: is(t => t.kind === 'select'), title: tx('Seleziona (Esc)') },
          { icon: 'wire', label: tx('Filo'), big: true, cmd: 'wire', run: tool({ kind: 'wire' }), active: is(t => t.kind === 'wire' && !t.bus && !t.bundle), title: tx('Disegna collegamento') },
          { icon: 'quickV', label: tx('Rapido V'), cmd: 'quickV', run: tool({ kind: 'quickWire', axis: 'v' }), active: is(t => t.kind === 'quickWire' && t.axis === 'v'), title: tx('Collegamento rapido in verticale (V): clic tra due punti di connessione uno sopra l\'altro') },
          { icon: 'quickH', label: tx('Rapido H'), cmd: 'quickH', run: tool({ kind: 'quickWire', axis: 'h' }), active: is(t => t.kind === 'quickWire' && t.axis === 'h'), title: tx('Collegamento rapido in orizzontale (H): clic tra due punti di connessione uno accanto all\'altro') },
          { icon: 'wireNumbers', label: tx('Allinea n.'), cmd: 'wireLabels', run: tool({ kind: 'wireLabels' }), active: is(t => t.kind === 'wireLabels'), title: tx('Allinea numeri filo (N): traccia una linea attraverso i fili, i numeri vanno sulla linea') },
          { icon: 'terminal', label: tx('Morsetti in fila'), cmd: 'terminalRow', run: () => startTerminalRow(), active: is(t => t.kind === 'terminalRow'), title: tx('Morsetti in fila (M): linea attraverso i fili o Ctrl/Cmd+clic sui fili, poi Invio; un morsetto su ogni filo, numerato nell\'ordine scelto') },
          { icon: 'text', label: tx('Testo'), run: tool({ kind: 'text' }), active: is(t => t.kind === 'text') },
        ] },
        { name: tn('Modifica'), items: [
          { icon: 'rotate', label: tx('Ruota'), big: true, cmd: 'rotate', run: () => st().rotateSelection(), disabled: !hasSel },
          { icon: 'mirror', label: tx('Specchia'), run: () => st().mirrorSelection(), disabled: !hasSel },
          { icon: 'align', label: tx('Allinea'), disabled: s.selection.length < 2 || !schema, title: tx('Con soli fili selezionati si allineano i loro numeri'),
            menu: () => ALIGN_MODES.map(m => ({ label: `${m.icon}  ${tx(m.name)}`, run: () => st().alignSelection(m.id) })) },
          { icon: 'delete', label: tx('Elimina'), cmd: 'delete', run: () => st().deleteSelection(), disabled: !hasSel },
        ] },
        { name: tn('Trova'), items: [
          { icon: 'search', label: tx('Cerca'), big: true, cmd: 'search', run: () => st().setDialog('search'), title: tx('Cerca e sostituisci') },
          { icon: 'fit', label: tx('Adatta'), cmd: 'fit', run: A.fitView, disabled: !schema, title: tx('Adatta pagina') },
          { icon: 'prev', label: tx('Pagina precedente'), cmd: 'pagePrev', run: () => A.stepPage(-1) },
          { icon: 'next', label: tx('Pagina successiva'), cmd: 'pageNext', run: () => A.stepPage(1) },
        ] },
        { name: tn('Controllo'), items: [
          { icon: 'check', label: tx('Verifica'), big: true, cmd: 'checks', run: () => A.openReport('checks'), title: tx('Controlli di progetto: sigle, contatti, rimandi, fili aperti, morsetti, PLC') },
          { icon: 'pdf', label: 'PDF', big: true, cmd: 'pdf', run: A.exportPdfAction, title: tx('Esporta schemi e liste in PDF') },
          { icon: 'print', label: tx('Stampa…'), cmd: 'print', run: () => st().setDialog('print') },
        ] },
      ],
    },
    {
      id: 'insert', name: tn('Inserisci'), groups: [
        { name: tn('Simboli'), items: [
          { gallery: true },
          { icon: 'coil', label: tx('Simboli'), big: true, run: () => usePanelStore.getState().setClosed('right', !panels.closed.right), active: !panels.closed.right, title: tx('Riquadro dei simboli e degli articoli') },
          { icon: 'macro', label: tx('Macro'), disabled: !s.macros.length, title: tx('Gruppo di elementi salvato: clic per l\'angolo in alto a sinistra'),
            menu: () => s.macros.map(m => ({ label: m.name, run: tool({ kind: 'macro', macroId: m.id }) })) },
        ] },
        { name: tn('Collegamenti'), items: [
          { icon: 'bundle', label: tx('Bus fili'), run: tool({ kind: 'wire', bundle: true }), active: is(t => t.kind === 'wire' && !!t.bundle), title: tx('Modalità BUS: una linea spessa porta più conduttori; i fili che vi entrano hanno il nome del conduttore (L1, PE…)') },
          { icon: 'bus', label: tx('Bus') + ` · ${protocolLabel(s.busProtocol)}`, run: tool({ kind: 'wire', bus: s.busProtocol }), active: is(t => t.kind === 'wire' && !!t.bus), title: tx('Collegamento di rete/bus tra le porte dei nodi (protocollo a destra)'),
            menu: () => [{ header: tx('Protocollo dei collegamenti di rete') }, ...PROTOCOLS.map(p => ({ label: protocolLabel(p.name), checked: s.busProtocol === p.name, run: () => { st().setBusProtocol(p.name); tool({ kind: 'wire', bus: p.name })(); } }))] },
          { icon: 'cable', label: tx('Cavo'), big: true, run: tool({ kind: 'cable' }), active: is(t => t.kind === 'cable'), title: tx('Linea di definizione cavo: clic prima e dopo i fili da includere') },
          { icon: 'wiredef', label: tx('Sezione'), run: tool({ kind: 'wiredef' }), active: is(t => t.kind === 'wiredef'), title: tx('Sezione dei fili: si tira una riga attraverso i fili e la sezione va a tutti') },
          { icon: 'railTop', label: tx('Filo in alto'), run: () => { st().setView('schema'); st().addRailWire('top'); }, disabled: !multi, title: tx('Filo orizzontale nella posizione fissa delle impostazioni del progetto, sotto quelli già messi') },
          { icon: 'railBottom', label: tx('Filo in basso'), run: () => { st().setView('schema'); st().addRailWire('bottom'); }, disabled: !multi, title: tx('Filo orizzontale nella posizione fissa in fondo alla pagina, dopo quelli già messi') },
        ] },
        { name: tn('Luoghi'), items: [
          { icon: 'zone', label: tx('Luogo'), big: true, run: tool({ kind: 'zone' }), active: is(t => t.kind === 'zone'), title: tx('Riquadro di luogo (+): clic su due angoli, quello che sta dentro prende il luogo') },
          { icon: 'place', label: tx('Nuovo luogo…'), run: A.addPlace, title: tx('Nuovo luogo (quadro, pulsantiera…)…') },
        ] },
        { name: tn('Grafica'), items: [
          { icon: 'text', label: tx('Testo'), big: true, run: tool({ kind: 'text' }), active: is(t => t.kind === 'text') },
          { icon: 'image', label: tx('Immagine…'), run: () => void insertImageFromFile(), disabled: !schema, title: tx('Foto, logo o disegno (PNG, JPG, SVG…); si incolla anche dagli appunti') },
          { icon: 'drawing', label: tx('Disegno DXF…'), run: () => void insertDxfDrawing(), disabled: !schema, title: tx('Grafica di un file DXF (linee, cerchi, archi, testi) sulla pagina, 1:1 in mm se ci sta; si sposta e si ridimensiona come un\'immagine') },
        ] },
      ],
    },
    {
      id: 'pages', name: tn('Pagine'), groups: [
        { name: tn('Nuova pagina'), items: [
          { icon: 'schema', label: tx('Pagina di schema'), big: true, run: () => { void A.newPage(s.pageId).then(() => st().setView('schema')); } },
          { icon: 'singleline', label: tx('Schema unifilare'), run: () => { st().addTypedPage('singleline', 'Schema unifilare'); st().setView('schema'); } },
          { icon: 'network', label: tx('Schema di rete'), run: () => { st().addNetworkPage(); st().setView('schema'); } },
          { icon: 'cabinet', label: tx('Layout del quadro'), run: () => { st().addLayoutPage(); st().setView('schema'); } },
          { icon: 'cover', label: tx('Copertina'), run: () => { st().addCoverPage(); st().setView('schema'); } },
        ] },
        { name: tn('Pagine automatiche'), items: [
          { icon: 'list', label: tx('Liste'), big: true, run: () => st().setDialog('reportPages'), title: tx('Indice, distinta, lista d\'acquisto, dispositivi, morsetti, fili, cavi… come pagine del progetto') },
          { icon: 'cable', label: tx('Disegni dei cavi (cablaggio)'), run: () => { st().syncDrawingPages('cable'); st().setView('schema'); }, disabled: !s.project.cables?.length, title: tx('Una pagina per cavo: estremità, conduttori e tabella; si aggiornano da sole') },
          { icon: 'connector', label: tx('Piedinature dei connettori'), run: () => { st().syncDrawingPages('connector'); st().setView('schema'); }, title: tx('Una pagina per connettore: faccia con i pin numerati e tabella dei collegamenti') },
          { icon: 'system', label: tx('Schema d\'insieme'), run: () => { st().syncDrawingPages('system'); st().setView('schema'); }, disabled: !s.project.cables?.length, title: tx('Luoghi (quadri, pulsantiere, bordo macchina) con i dispositivi, le foto e i cavi di collegamento') },
          { icon: 'update', label: tx('Aggiorna le pagine di lista'), run: () => st().syncReportPages() },
        ] },
        { name: tn('Organizza'), items: [
          { icon: 'duplicate', label: tx('Duplica'), big: true, run: () => void A.duplicatePageAsk(s.pageId), disabled: !multi, title: tx('Duplica la pagina corrente…') },
          { icon: 'sort', label: tx('Ordina le pagine per numero'), run: () => st().sortPages(), title: tx('12, 12A, 12B, 13…; copertina e pagine senza numero restano dove sono') },
          { icon: 'number', label: tx('Rinumera pagine…'), run: () => void A.renumberPages(), title: tx('Pagine di progetto 1, 2, 3… nell\'ordine attuale: chiude i buchi lasciati dalle pagine tolte') },
          { icon: 'delete', label: tx('Elimina la pagina corrente…'), run: () => void A.deletePageAsk(s.pageId), disabled: s.project.pages.length <= 1 },
        ] },
        { name: tn('Foglio'), items: [
          { icon: 'titleBlock', label: tx('Cartiglio'), big: true, run: () => st().openTitleBlockEditor(templateFor(s.project)), title: tx('Cartiglio: personalizza o disegna…') },
          { icon: 'settings', label: tx('Formato e cornice'), run: () => openSettingsAt('sheet') },
          { icon: 'text', label: tx('Testi'), run: () => openSettingsAt('texts') },
        ] },
      ],
    },
    {
      id: 'project', name: tn('Progetto'), groups: [
        { name: tn('Progetto'), items: [
          { icon: 'settings', label: tx('Impostazioni'), big: true, cmd: 'settings', run: () => st().setDialog('settings'), title: tx('Impostazioni del progetto…') },
          { icon: 'props', label: tx('Proprietà del progetto'), run: A.showProjectProps },
          { icon: 'user', label: tx('Proprietà definite dall\'utente…'), run: () => st().setDialog('userProps'), title: tx('Proprietà proprie per dispositivi, pagine, collegamenti, progetto e articoli; import ed export XML') },
          { icon: 'template', label: tx('Profili…'), run: () => openSettingsAt('profiles') },
        ] },
        { name: tn('Numerazione'), items: [
          { icon: 'number', label: tx('Rinumera dispositivi…'), run: A.renumberDevices },
          { icon: 'number', label: tx('Rinumera fili…'), run: A.renumberWires },
          { icon: 'plc', label: tx('Fili dall\'indirizzo PLC'), run: () => st().wiresFromPlc(), disabled: !s.selection.length, title: tx('I fili selezionati (o quelli dei punti PLC selezionati) prendono il nome dall\'indirizzo del canale, anche i loro rimandi') },
          { icon: 'plc', label: tx('Fili PLC automatici'), run: () => st().updateSettings({ wirePlcNames: !settingsOf(s.project).wirePlcNames }), active: !!settingsOf(s.project).wirePlcNames, title: tx('Fili collegati a un canale PLC: nome dall\'indirizzo (I0.3; con 2 morsetti per canale I0.3A e I0.3B), anche attraverso i morsetti; i rimandi prendono lo stesso nome') },
          { icon: 'terminal', label: tx('Morsetti dagli articoli'), run: () => st().pinsFromArticles(), title: tx('Bobine, poli e contatti di tutti i dispositivi con articolo prendono i morsetti del modello funzione dell\'articolo') },
        ] },
        { name: tn('Articoli'), items: [
          { icon: 'part', label: tx('Articoli'), big: true, run: () => st().setView('parts'), active: s.view === 'parts' },
          { icon: 'import', label: tx('Articoli EDZ / XML / CSV…'), run: () => void A.importParts(), title: tx('Importa articoli dai produttori (pacchetti EDZ, XML o CSV)') },
          { icon: 'table', label: tx('Articoli da Excel…'), run: () => void A.importPartsXlsx(), title: tx('Aggiunge e aggiorna gli articoli dal foglio Excel (colonna «Codice articolo» come chiave)') },
        ] },
        { name: tn('Reti'), items: [
          { icon: 'network', label: tx('Nuova rete IP'), run: () => { st().addIpNetwork(); A.showProjectProps(); } },
          { icon: 'table', label: tx('Indirizzi di rete'), run: () => st().setDialog('netAddresses'), title: tx('IP e nomi Profinet di tutti i dispositivi di rete in una tabella') },
          { icon: 'number', label: tx('Assegna indirizzi IP'), run: () => st().assignIps(), disabled: !s.project.ipNetworks?.length },
          { icon: 'list', label: tx('Piano indirizzi IP'), run: () => A.openReport('Piano indirizzi IP') },
        ] },
        { name: tn('Lingue'), items: [
          { icon: 'translate', label: tx('Traduzioni'), big: true, run: () => A.openReport('translations') },
          { icon: 'language', label: tx('Proponi le traduzioni mancanti'), run: () => st().autoTranslate() },
          { icon: 'ai', label: tx('Traduci con l\'assistente IA'), run: () => void A.aiTranslate(), title: tx('Claude, ChatGPT o Gemini traducono i testi mancanti; restano da verificare') },
        ] },
        { name: tn('Assistente'), items: [
          { icon: 'ai', label: tx('Assistente IA'), big: true, cmd: 'ai', run: () => st().setDialog('ai') },
          { icon: 'text', label: tx('Pagine in testo (assistenti IA)…'), run: () => st().setDialog('text'), title: tx('Esporta e importa le pagine in un formato testo che un assistente di intelligenza artificiale sa leggere e modificare') },
          { icon: 'settings', label: tx('Assistenti IA: profili e account…'), run: () => st().setDialog('aiSettings') },
        ] },
      ],
    },
    {
      id: 'lists', name: tn('Liste'), groups: [
        { name: tn('Controllo'), items: [
          { icon: 'check', label: tx('Controlli'), big: true, run: () => A.openReport('checks') },
          { icon: 'list', label: tx('Liste'), big: true, title: tx('Tutte le liste del progetto'),
            menu: () => A.allReports().map(t => ({ label: `${tx(t.title)} (${t.rows.length})`, run: () => A.openReport(t.title) })) },
          { icon: 'plc', label: tx('Lista I/O PLC e hardware'), run: () => st().setView('plc') },
          { icon: 'table', label: tx('Liste personalizzate…'), run: () => st().setDialog('customLists'), title: tx('Liste nuove dalle liste del progetto: colonne, filtri, ordinamento e raggruppamento') },
        ] },
        { name: tn('Viste'), items: [
          { icon: 'table', label: tx('Dispositivi'), big: true, run: () => st().setView('devices'), active: s.view === 'devices' },
          { icon: 'terminalStrip', label: tx('Morsettiere'), big: true, run: () => st().setView('terminals'), active: s.view === 'terminals' },
          { icon: 'connector', label: tx('Connettori'), run: () => st().setView('connectors'), active: s.view === 'connectors' },
          { icon: 'cable', label: tx('Cavi'), run: () => st().setView('cables'), active: s.view === 'cables' },
          { icon: 'bundle', label: tx('Bus fili'), run: () => st().setView('bundles'), active: s.view === 'bundles', title: tx('Tutti i conduttori che entrano ed escono dai bus fili, da controllare e correggere') },
          { icon: 'distributor', label: tx('Ripartitori'), run: () => st().setView('distributors'), active: s.view === 'distributors' },
          { icon: 'calc', label: tx('Calcoli'), run: () => st().setView('calcs'), active: s.view === 'calcs' },
        ] },
        { name: tn('Esporta'), items: [
          { icon: 'pdf', label: tx('PDF completo…'), big: true, run: A.exportPdfAction },
          { icon: 'label', label: tx('Etichette M-Print PRO / GeniusPRO…'), run: () => st().setDialog('labels') },
          { icon: 'plc', label: tx('PLCopen XML (variabili PLC)'), run: () => void A.exportPlcopenAction(), disabled: !s.project.plc.cards.length },
        ] },
      ],
    },
    {
      id: 'revisions', name: tn('Revisioni'), groups: [
        { name: tn('Revisioni'), items: [
          { icon: 'revision', label: tx('Revisioni…'), big: true, run: () => st().setDialog('revisions') },
          { icon: 'release', label: tx('Rilascia revisione…'), big: true, run: () => void A.releaseRevision(), disabled: !!s.viewing || released },
          { icon: 'new', label: tx('Apri revisione nuova'), run: () => st().openRevision(), disabled: !!s.viewing || !released },
          { icon: 'list', label: tx('Modifiche della revisione'), run: () => { st().setView('reports'); st().setReportTab('revision'); }, title: tx('Pagine e modifiche rispetto all\'ultima revisione rilasciata, con le note') },
        ] },
        { name: tn('Confronta'), items: [
          { icon: 'compare', label: tx('Confronta con un file .ecad…'), big: true, run: () => void A.compareWithFile() },
          { icon: 'template', label: tx('Salva come modello…'), run: A.saveAsTemplate },
        ] },
      ],
    },
    {
      id: 'view', name: tn('Visualizza'), groups: [
        { name: tn('Riquadri'), items: ([['tree', tn('Modello##albero'), 'panels'], ['props', tn('Proprietà'), 'props'], ['right', tn('Simboli'), 'coil'], ['log', tn('Vista report'), 'list']] as const)
          .map(([id, l, icon]) => ({ icon, label: tx(l), run: () => usePanelStore.getState().setClosed(id, !panels.closed[id]), active: !panels.closed[id] })) },
        { name: tn('Aspetto'), items: [
          { icon: 'theme', label: tx('Tema'), big: true, menu: () => ([['system', tn('Come il sistema')], ['light', tn('Chiaro')], ['dark', tn('Scuro')]] as const).map(([v, l]) => ({ label: tx(l), run: () => st().setTheme(v), checked: s.theme === v })) },
          { icon: 'page', label: tx('Foglio di disegno'), menu: () => ([['white', tn('Bianco')], ['dark', tn('Scuro')], ['auto', tn('Come il tema')]] as const).map(([v, l]) => ({ label: tx(l), run: () => st().setSheet(v), checked: s.sheet === v })) },
          { icon: 'language', label: 'Language · Lingua', menu: () => UI_LANGS.map(l => ({ label: l.name, run: () => st().setUiLang(l.id), checked: s.uiLang === l.id })) },
          { icon: 'translate', label: tx('Lingua degli schemi'), menu: () => LANGS.map(l => ({ label: l.name, run: () => st().setLanguages({ display: l.id }), checked: (s.project.languages?.display ?? 'it') === l.id })) },
        ] },
        { name: tn('Schema'), items: [
          { icon: 'select', label: tx('Strumenti sul disegno'), run: () => st().setActiveBar(!s.activeBar), active: s.activeBar, title: tx('Barra degli strumenti di disegno sopra lo schema, con l\'ultimo simbolo usato') },
          { icon: 'table', label: tx('Griglia'), run: () => st().setGridMode(s.gridMode === 'off' ? 'auto' : 'off'), active: s.gridMode !== 'off', title: tx('Punti della griglia sullo schema (si vedono quando si è ingranditi)') },
          { icon: 'page', label: tx('Miniature delle pagine'), run: () => st().setPageStrip(!s.pageStrip), active: s.pageStrip, title: tx('Striscia delle pagine sotto lo schema: clic per andarci, trascinando si cambia l\'ordine') },
          { icon: 'fit', label: tx('Mappa del foglio'), run: () => st().setMinimap(!s.minimap), active: s.minimap, title: tx('Con lo schema ingrandito, la pagina intera in piccolo in un angolo: clic per spostarsi') },
          { icon: 'more', label: tx('Menu a raggiera'), run: () => st().setRadialMenu(!s.radialMenu), active: s.radialMenu, title: tx('Menu a raggiera con il tasto destro (il menu completo resta dal centro)') },
          { icon: 'wire', label: tx('Aggancio'), run: () => st().setObjectSnap(!s.objectSnap), active: s.objectSnap, title: tx('Aggancio ai punti di connessione e ai vertici dei fili; spento resta l\'aggancio alla griglia') },
        ] },
        { name: tn('Barra dei comandi'), items: [
          { icon: 'panels', label: tx('Stile'), big: true, menu: () => UI_STYLES.map(([v, l]) => ({ label: tx(l), run: () => st().setUiStyle(v), checked: s.uiStyle === v })) },
          { icon: s.ribbonCollapsed ? 'chevronDown' : 'chevronUp', label: s.ribbonCollapsed ? tx('Mostra la barra') : tx('Riduci la barra'), cmd: 'ribbon', run: () => st().setRibbonCollapsed(!s.ribbonCollapsed) },
          { icon: 'search', label: tx('Cerca un comando…'), cmd: 'palette', run: () => st().setDialog('palette') },
        ] },
        { name: tn('Pagina'), items: [
          { icon: 'fit', label: tx('Adatta'), big: true, cmd: 'fit', run: A.fitView, disabled: !schema, title: tx('Adatta pagina') },
          { icon: 'prev', label: tx('Pagina precedente'), cmd: 'pagePrev', run: () => A.stepPage(-1) },
          { icon: 'next', label: tx('Pagina successiva'), cmd: 'pageNext', run: () => A.stepPage(1) },
        ] },
      ],
    },
    {
      id: 'help', name: tn('Aiuto'), groups: [
        { name: tn('Aiuto'), items: [
          { icon: 'help', label: tx('Manuale'), big: true, run: () => window.open(`https://github.com/elconfa/OpenWiring/blob/main/docs/manuale/${uiLang()}/00-indice.md`, '_blank'), title: tx('Il manuale completo con foto ed esempi (sul sito del progetto)') },
          { icon: 'next', label: tx('Giro guidato'), run: startTour, title: tx('Le parti della finestra, passo per passo') },
          { icon: 'keyboard', label: tx('Scorciatoie da tastiera…'), run: () => openSettingsAt('shortcuts'), title: tx('Elenco dei tasti dei comandi, da cambiare e da stampare') },
          { icon: 'ai', label: tx('Guida per agenti IA (.md)…'), run: () => void A.saveAgentGuide() },
        ] },
        { name: tn('Programma'), items: [
          { icon: 'update', label: tx('Cerca aggiornamenti…'), big: true, run: () => void checkUpdates(true), title: tx('Controlla se su GitHub c\'è una versione più nuova') },
          { icon: 'info', label: tx('Informazioni'), run: () => st().setDialog('about'), title: tx('Versione, dove scaricarla, progettista e contatto; scorciatoie da tastiera') },
          { icon: 'web', label: tx('Sito del progetto (GitHub)'), run: () => window.open('https://github.com/elconfa/OpenWiring', '_blank') },
        ] },
      ],
    },
  ];

  // Schede contestuali
  const symbols = schema && page ? page.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && s.selection.includes(e.id)) : [];
  const one = symbols.length === 1 && s.selection.length === 1 ? symbols[0] : undefined;
  const sym: SymbolDef | undefined = one ? getSymbol(one.symbolId, s.project) : undefined;
  if (symbols.length) {
    tabs.push({
      id: 'symbol', name: tn('Simbolo'), ctx: one ? (one.tag ? `-${one.tag}` : tx(sym?.name ?? '')) : tx('{0} simboli', symbols.length), groups: [
        { name: tn('Simbolo'), items: [
          { icon: 'props', label: tx('Proprietà'), big: true, run: openPropsDialog, title: tx('Proprietà in una finestra (anche con un doppio clic)') },
          { icon: 'replace', label: tx('Sostituisci simbolo…'), run: () => { if (one && sym) void chooseReplacement(sym).then(id => { if (id) st().replaceSymbol(one.id, id); }); }, disabled: !one || !sym || !canReplace(one) },
          { icon: 'drawing', label: tx('Modifica il componente…'), run: () => { if (sym) st().openSymbolEditor(sym); }, disabled: !sym },
          { icon: 'star', label: sym && s.favorites.includes(sym.id) ? tx('Togli dai preferiti') : tx('Aggiungi ai preferiti'), run: () => { if (sym) st().toggleFavorite(sym.id); }, disabled: !sym, active: !!sym && s.favorites.includes(sym.id) },
          { icon: 'link', label: tx('Rappresentazione…'), title: tx('Riferimento a coppie: disegna il contatto anche in un altro punto (per esempio l\'ausiliario accanto ai poli). Su un contatto lo disegna subito; su una bobina o un salvamotore chiede quale dei suoi contatti'),
            run: () => { if (!one) return; if (sym?.role === 'aux') st().startRepresentation(one.id); else void chooseRepresentation(one.id); },
            disabled: !one || !!one.pairOf || (sym?.role !== 'aux' && sym?.role !== 'main') },
        ] },
        { name: tn('Dati'), items: [
          { icon: 'terminal', label: tx('Morsetti dall\'articolo'), run: () => st().pinsFromArticles([...new Set(symbols.map(e => e.tag).filter(Boolean))]), title: tx('Bobina, poli e contatti del dispositivo prendono i morsetti del modello funzione dell\'articolo (si annulla con Annulla)') },
          { icon: 'copy', label: tx('Copia proprietà'), run: () => { if (one) st().copyDeviceProps(one.id); }, disabled: !one || sym?.role === 'potential' || sym?.role === 'link' },
          { icon: 'paste', label: s.propClipboard ? tx('Incolla proprietà di -{0}', s.propClipboard.tag) : tx('Incolla proprietà'), run: () => st().pasteDeviceProps(symbols.map(e => e.id)), disabled: !s.propClipboard },
        ] },
        { name: tn('Disponi'), items: [
          { icon: 'rotate', label: tx('Ruota'), big: true, cmd: 'rotate', run: () => st().rotateSelection() },
          { icon: 'mirror', label: tx('Specchia'), run: () => st().mirrorSelection() },
          { icon: 'duplicate', label: tx('Duplica'), cmd: 'duplicate', run: () => st().duplicateSelection() },
          { icon: 'delete', label: tx('Elimina'), cmd: 'delete', run: () => st().deleteSelection() },
        ] },
      ],
    });
  }
  if (s.viewing) {
    tabs.push({
      id: 'archived', name: tn('Revisione'), ctx: tx('Revisione archiviata'), groups: [
        { name: tn('Revisione archiviata'), items: [
          { icon: 'back', label: tx('Torna al progetto'), big: true, run: () => st().closeRevisionView() },
          { icon: 'revision', label: tx('Revisioni…'), run: () => st().setDialog('revisions') },
        ] },
      ],
    });
  }
  return tabs;
}

/** Icone dei comandi della barra per nome, per «Cerca un comando» */
export function ribbonIcons(s: State): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ribbonTabs(s)) for (const g of t.groups) for (const i of g.items) if (isButton(i) && !m.has(i.label)) m.set(i.label, i.icon);
  return m;
}

/** Simboli preferiti (o i più comuni) da inserire con un clic */
function Gallery() {
  const favorites = useStore(s => s.favorites);
  const project = useStore(s => s.project);
  const placing = useStore(s => (s.tool.kind === 'place' ? s.tool.symbolId : ''));
  const ids = (favorites.length ? favorites : GALLERY_DEFAULT).slice(0, 12);
  const syms = ids.map(id => getSymbol(id, project)).filter((x): x is SymbolDef => !!x);
  const st = useStore.getState;
  return (
    <div className="rb-gallery" role="listbox" aria-label={favorites.length ? tx('Simboli preferiti') : tx('Simboli più usati')}>
      {syms.map(sym => (
        <button key={sym.id} role="option" aria-selected={placing === sym.id} className={placing === sym.id ? 'active' : ''} title={`${tx(sym.name)}${sym.letter ? ` (-${sym.letter})` : ''}`}
          onClick={() => { st().setView('schema'); st().setTool({ kind: 'place', symbolId: sym.id, rot: 0 }); }}>
          <SymbolPreview sym={sym} size={30} />
        </button>
      ))}
    </div>
  );
}

/** Menu a discesa di un comando della barra (stesse voci dei menu classici) */
function DropMenu({ items, onClose }: { items: Item[]; onClose: () => void }) {
  return (
    <div className="menu-drop rb-drop" role="menu" onMouseDown={e => e.stopPropagation()}>
      {items.map((it, k) => 'sep' in it ? <div key={k} className="menu-sep" />
        : 'header' in it ? <div key={k} className="menu-header">{it.header}</div>
        : (
          <button key={k} role="menuitemcheckbox" aria-checked={it.checked} className="menu-item" disabled={it.disabled} title={it.title}
            onClick={() => { onClose(); it.run(); }}>
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span className="menu-label">{it.label}</span>
            {it.key && <span className="menu-key">{it.key}</span>}
          </button>
        ))}
      {!items.length && <div className="menu-header">{tx('Nessuna voce')}</div>}
    </div>
  );
}

function Button({ b, compact, onRun, menuOpen, setMenu }: {
  b: RButton; compact: boolean; onRun: () => void; menuOpen: boolean; setMenu: (open: boolean) => void;
}) {
  const big = !!b.big;
  const showLabel = big || !compact;
  const tip = tipProps(b.label, b.title, b.cmd ? keyLabel(b.cmd) : undefined, b.icon);
  const cls = `rb-btn ${big ? 'big' : 'small'}${b.active ? ' active' : ''}${b.menu ? ' has-menu' : ''}`;
  const click = () => {
    if (b.menu && !b.run) { setMenu(!menuOpen); return; }
    b.run?.(); onRun();
  };
  return (
    <span className="rb-cell">
      <button className={cls} disabled={b.disabled} {...tip} aria-pressed={b.active} aria-haspopup={b.menu ? 'menu' : undefined} aria-expanded={b.menu ? menuOpen : undefined}
        onMouseDown={e => { if (b.menu) e.stopPropagation(); }} onClick={click}>
        <Icon name={b.icon} size={big && !compact ? 30 : 18} />
        {showLabel && <span className="rb-label">{b.label}{b.menu && !b.run && <Icon name="chevronDown" size={10} className="rb-caret" />}</span>}
        {!showLabel && b.menu && !b.run && <Icon name="chevronDown" size={10} className="rb-caret" />}
      </button>
      {b.menu && b.run && (
        <button className="rb-split" disabled={b.disabled} title={tx('Altre scelte')} aria-haspopup="menu" aria-expanded={menuOpen}
          onMouseDown={e => e.stopPropagation()} onClick={() => setMenu(!menuOpen)}><Icon name="chevronDown" size={10} /></button>
      )}
      {menuOpen && b.menu && <DropMenu items={b.menu()} onClose={() => { setMenu(false); onRun(); }} />}
    </span>
  );
}

/** Comandi piccoli impilati a tre a tre (nella forma completa) */
function layoutItems(items: RItem[], compact: boolean): (RItem | RButton[])[] {
  if (compact) return items;
  const out: (RItem | RButton[])[] = [];
  let stack: RButton[] = [];
  const flush = () => { if (stack.length) out.push(stack); stack = []; };
  for (const it of items) {
    if (isButton(it) && !it.big) { stack.push(it); if (stack.length === 3) flush(); }
    else { flush(); out.push(it); }
  }
  flush();
  return out;
}

const TAB_PREF = 'elettrocad.ribbonTab';
const loadTab = () => { try { return localStorage.getItem(TAB_PREF) ?? 'home'; } catch { return 'home'; } };

export function Ribbon() {
  // Si ridisegna quando cambia ciò che i comandi mostrano (attivi, disattivati, voci dei menu)
  useStore(useShallow(s => [s.tool, s.selection, s.past.length, s.future.length, s.view, s.pageId, s.project, s.clipboard, s.viewing,
    s.theme, s.sheet, s.uiLang, s.dirty, s.filePath, s.busProtocol, s.favorites, s.macros, s.propClipboard, s.uiStyle, s.ribbonCollapsed, s.activeBar, s.gridMode, s.objectSnap, s.pageStrip, s.minimap, s.radialMenu]));
  usePanelStore(p => p.layout.closed);
  const [, setKeysTick] = useState(0);
  useEffect(() => onKeysChange(() => setKeysTick(t => t + 1)), []);
  const s = useStore.getState();
  const compact = s.uiStyle === 'compact';
  const collapsed = s.ribbonCollapsed;
  const [tabId, setTabId] = useState(loadTab);
  const [floating, setFloating] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tabs = ribbonTabs(s);
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const showBody = !collapsed || floating;

  // Clic fuori: si chiudono il menu a discesa e la barra aperta sopra lo schema
  useEffect(() => {
    if (!menu && !floating) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setMenu(null); setFloating(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setFloating(false); } };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [menu, floating]);

  const choose = (id: string) => {
    if (collapsed) setFloating(f => !(f && id === tab.id));
    setTabId(id);
    try { localStorage.setItem(TAB_PREF, id); } catch { /* solo comodità */ }
  };
  const afterRun = () => { setMenu(null); setFloating(false); };
  const st = useStore.getState;

  return (
    <div className={`ribbon${compact ? ' compact' : ''}${collapsed ? ' collapsed' : ''}`} ref={ref}>
      <div className="rb-top">
        <div className="rb-qat" aria-label={tx('Barra di accesso rapido')}>
          <button title={hint(tx('Salva'), 'save')} onClick={() => void A.saveProject()}><Icon name="save" size={16} /></button>
          <button title={hint(tx('Annulla##modifica'), 'undo')} disabled={!s.past.length} onClick={() => st().undo()}><Icon name="undo" size={16} /></button>
          <button title={hint(tx('Ripeti'), 'redo')} disabled={!s.future.length} onClick={() => st().redo()}><Icon name="redo" size={16} /></button>
        </div>
        <button className="rb-file" onClick={() => st().setDialog('backstage')} title={tx('Progetti recenti, nuovo, apri, salva, importa, esporta')}>{tx('File')}</button>
        <div className="rb-tabs" role="tablist">
          {tabs.map(t => (
            <div key={t.id} className={t.ctx ? 'rb-tabwrap ctx' : 'rb-tabwrap'}>
              <button role="tab" aria-selected={t.id === tab.id} className={`rb-tab${t.id === tab.id && showBody ? ' on' : ''}${t.ctx ? ' ctx' : ''}`}
                onClick={() => choose(t.id)} onDoubleClick={() => { st().setRibbonCollapsed(!collapsed); setFloating(false); }}
                title={tx('Doppio clic: riduci o mostra la barra')}>{tx(t.name)}{t.ctx && <small className="rb-ctx-title">{t.ctx}</small>}</button>
            </div>
          ))}
        </div>
        <div className="rb-title" title={s.filePath ?? undefined}>{s.project.info.name || ''}{s.dirty ? ' •' : ''}</div>
        <PaletteButton />
        <ViewTabs />
      </div>
      {showBody && (
        <div className={`rb-body${floating ? ' floating' : ''}${tab.ctx ? ' ctx' : ''}`} role="tabpanel" aria-label={tx(tab.name)}>
          {tab.groups.map(g => (
            <div key={g.name} className="rb-group">
              <div className="rb-items">
                {layoutItems(g.items, compact).map((it, k) => {
                  const key = `${g.name}/${k}`;
                  if (Array.isArray(it)) {
                    return (
                      <div key={key} className="rb-stack">
                        {it.map((b, j) => <Button key={j} b={b} compact={compact} onRun={afterRun} menuOpen={menu === `${key}/${j}`} setMenu={o => setMenu(o ? `${key}/${j}` : null)} />)}
                      </div>
                    );
                  }
                  if ('gallery' in it) return compact ? null : <Gallery key={key} />;
                  if ('custom' in it) return <span key={key}>{it.custom}</span>;
                  return <Button key={key} b={it} compact={compact} onRun={afterRun} menuOpen={menu === key} setMenu={o => setMenu(o ? key : null)} />;
                })}
              </div>
              {!compact && <div className="rb-glabel">{tx(g.name)}</div>}
            </div>
          ))}
          <div className="tb-spacer" />
          <button className="rb-collapse" onClick={() => { st().setRibbonCollapsed(!collapsed); setFloating(false); }}
            title={hint(collapsed ? tx('Tieni la barra aperta') : tx('Riduci la barra alle schede'), 'ribbon')}>
            <Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
