// Barra dei menu (File, Modifica, Visualizza, Inserisci, Progetto, Liste, Aiuto) con tutti i
// comandi dell'applicazione; la barra strumenti resta per i comandi di disegno più usati.
import { startTerminalRow } from './terminalRowChooser';
import { useEffect, useRef, useState } from 'react';
import { useStore, type State, type UiStyle } from '../model/store';
import * as A from './actions';
import { PROTOCOLS, protocolLabel } from '../model/network';
import { LANGS } from '../model/i18n';
import { K } from './keys';
import { keyLabel, onKeysChange } from './shortcuts';
import { openSettingsAt } from './SettingsDialog';
import { checkUpdates } from './updates';
import { templateFor } from '../model/titleBlocks';
import { settingsOf } from '../model/numbering';
import { ALIGN_MODES } from '../model/align';
import { insertImageFromFile, insertDxfDrawing } from './images';
import { usePanelStore, canDetach } from './panels';
import { tx, tn, UI_LANGS, uiLang } from '../i18n/ui';
import { Icon } from './icons';
import { startTour } from './Tour';
import { checkProjectSymbols, openUnifySymbols } from './LibrarySync';

export type Item =
  | { label: string; run: () => void; key?: string; disabled?: boolean; checked?: boolean; title?: string }
  | { sep: true }
  | { header: string };

const sep = { sep: true } as const;

/** Stili della barra dei comandi (Visualizza e Impostazioni ▸ Programma ▸ Barra dei comandi) */
export const UI_STYLES: [UiStyle, string][] = [['ribbon', tn('Barra multifunzione')], ['compact', tn('Barra multifunzione compatta')], ['classic', tn('Menu classici')]];

export const NAMES = [tn('File'), tn('Modifica'), tn('Visualizza'), tn('Inserisci'), tn('Progetto'), tn('Liste'), tn('Aiuto')];

/** Voci dei menu, calcolate solo quando un menu è aperto (con lo stato del momento) */
export function buildMenus(s: State): { name: string; items: Item[] }[] {
  const st = useStore.getState;
  const hasSel = s.selection.length > 0;
  const schema = s.view === 'schema';
  const page = s.project.pages.find(p => p.id === s.pageId);
  const tool = (t: Parameters<typeof s.setTool>[0]) => () => { st().setView('schema'); st().setTool(t); };
  const tables = A.allReports();
  const panels = usePanelStore.getState().layout;
  return [
    {
      name: 'File', items: [
        { label: tx('Nuovo progetto'), run: A.newProject },
        ...s.templates.map(t => ({ label: tx('Nuovo dal modello «{0}»', t.name), run: () => A.newFromTemplate(t.id) })),
        { label: tx('Schermata iniziale…'), run: () => st().setDialog('start'), title: tx('Progetti recenti, nuovo progetto, modelli e profili') },
        { label: tx('Apri…'), key: keyLabel('open'), run: () => void A.openProject() },
        { label: tx('Apri accanto…'), run: () => void A.openProjectAlongside(), title: tx('Apre un altro progetto senza chiudere questo: tutti e due nella colonna Modello, per copiare simboli e pagine') },
        ...(s.others.length ? [{ label: tx('Chiudi questo progetto'), run: A.closeActiveProject, title: tx('Chiude il progetto attivo e passa a un altro dei progetti aperti') }] : []),
        { label: tx('Salva'), key: keyLabel('save'), run: () => void A.saveProject() },
        { label: tx('Salva con nome…'), key: keyLabel('saveAs'), run: () => void A.saveProject(true) },
        { label: tx('Carica il progetto di esempio'), run: A.loadExample },
        sep,
        { label: tx('Pagine in testo (assistenti IA)…'), run: () => st().setDialog('text'), title: tx('Esporta e importa le pagine in un formato testo che un assistente di intelligenza artificiale sa leggere e modificare') },
        sep,
        { header: tx('Importa') },
        { label: tx('Articoli EDZ / XML / CSV…'), run: () => void A.importParts() },
        { label: tx('Articoli da Excel…'), run: () => void A.importPartsXlsx(), title: tx('Aggiunge e aggiorna gli articoli dal foglio Excel (colonna «Codice articolo» come chiave)') },
        { label: tx('Simboli QElectroTech…'), run: () => void A.importSymbols() },
        { label: tx('Simboli da una cartella…'), run: () => void A.importSymbolFolder(), title: tx('Tutti i simboli della cartella scelta e delle sottocartelle, in un albero con i nomi delle sottocartelle') },
        { label: tx('Schema da PDF (SEE Electrical…)…'), run: () => void A.importPdfSchematic(), title: tx('Ricostruisce un progetto da uno schema esportato in PDF vettoriale: fili, componenti, morsetti e rimandi') },
        { label: tx('Macro…'), run: () => void A.importMacros() },
        { label: tx('Dati utente (da un\'altra installazione)…'), run: () => void A.importUserData(), title: tx('Articoli, simboli, macro, modelli di progetto, cartigli e preferiti esportati da un\'altra installazione') },
        { label: tx('Confronta con un file .ecad…'), run: () => void A.compareWithFile() },
        sep,
        { header: tx('Esporta') },
        { label: tx('PDF…'), run: A.exportPdfAction },
        { label: tx('Stampa…'), key: keyLabel('print'), run: () => st().setDialog('print') },
        { label: page?.type === 'layout' ? tx('DXF di foratura del layout') : tx('DXF della pagina corrente'), run: () => void A.exportDxfAction() },
        { label: tx('DXF di tutto il progetto (ZIP)'), run: () => void A.exportProjectDxf(), title: tx('Un file DXF per pagina, in scala 1:1, raccolti in un archivio ZIP') },
        { label: tx('DWG della pagina corrente'), run: () => void A.exportDwg(false), title: tx('AutoCAD 2018, con ODA File Converter (gratuito, da installare)') },
        { label: tx('DWG di tutto il progetto'), run: () => void A.exportDwg(true), title: tx('Un DWG per pagina in una cartella, con ODA File Converter (gratuito, da installare)') },
        { label: tx('Etichette M-Print PRO / GeniusPRO…'), run: () => st().setDialog('labels') },
        { label: tx('PLCopen XML (variabili PLC)'), run: () => void A.exportPlcopenAction(), disabled: !s.project.plc.cards.length },
        { label: tx('Articoli in XML (formato EPLAN)'), run: () => void A.exportParts() },
        { label: tx('Articoli in Excel (modificabile)'), run: () => void A.exportPartsXlsx(), title: tx('Tutti gli articoli in un foglio Excel, da modificare e reimportare') },
        { label: tx('Dizionario delle traduzioni (CSV)'), run: () => void A.exportDictionary() },
        { label: tx('Dati utente (per un\'altra installazione)…'), run: () => void A.exportUserData(), title: tx('Articoli completi, simboli, macro, modelli di progetto, cartigli e preferiti in un solo file') },
      ],
    },
    {
      name: 'Modifica', items: [
        { label: tx('Annulla##modifica'), key: keyLabel('undo'), run: () => st().undo(), disabled: !s.past.length },
        { label: tx('Ripeti'), key: keyLabel('redo'), run: () => st().redo(), disabled: !s.future.length },
        sep,
        { label: tx('Taglia'), key: keyLabel('cut'), run: () => st().cutSelection(), disabled: !hasSel || !schema },
        { label: tx('Copia'), key: keyLabel('copy'), run: () => st().copySelection(), disabled: !hasSel || !schema },
        { label: tx('Incolla'), key: keyLabel('paste'), run: () => st().setTool({ kind: 'paste' }), disabled: !s.clipboard || !schema, title: tx('Gli elementi copiati seguono il puntatore: clic per posarli, Esc per annullare') },
        { label: tx('Duplica'), key: keyLabel('duplicate'), run: () => st().duplicateSelection(), disabled: !hasSel },
        { label: tx('Elimina'), key: keyLabel('delete'), run: () => st().deleteSelection(), disabled: !hasSel },
        { label: tx('Seleziona tutto'), key: keyLabel('selectAll'), run: () => st().setSelection(page?.elements.map(e => e.id) ?? []), disabled: !schema },
        sep,
        { label: tx('Ruota'), key: keyLabel('rotate'), run: () => st().rotateSelection(), disabled: !hasSel },
        { label: tx('Specchia'), run: () => st().mirrorSelection(), disabled: !hasSel },
        { header: tx('Allinea') },
        ...ALIGN_MODES.map(m => ({ label: `${m.icon}  ${tx(m.name)}`, run: () => st().alignSelection(m.id), disabled: (s.selection.length < 2) || !schema,
          title: tx('Con soli fili selezionati si allineano i loro numeri') })),
        { label: tx('Allinea numeri filo con una linea'), key: keyLabel('wireLabels'), run: () => st().setTool({ kind: 'wireLabels' }), disabled: !schema, title: tx('Si traccia una linea attraverso i fili: i loro numeri vanno sulla linea') },
        { label: tx('Morsetti in fila sui fili'), key: keyLabel('terminalRow'), run: () => startTerminalRow(), disabled: !schema, title: tx('Un morsetto su ogni filo scelto (linea attraverso i fili o Ctrl/Cmd+clic), numerato nell\'ordine scelto') },
        sep,
        { label: tx('Cerca e sostituisci…'), key: keyLabel('search'), run: () => st().setDialog('search') },
      ],
    },
    {
      name: 'Visualizza', items: [
        ...([['schema', tn('Schema')], ['devices', tn('Dispositivi')], ['plc', tn('PLC')], ['terminals', tn('Morsettiere')], ['connectors', tn('Connettori')], ['distributors', tn('Ripartitori')], ['cables', tn('Cavi')], ['calcs', tn('Calcoli')], ['parts', tn('Articoli')], ['reports', tn('Liste')]] as const)
          .map(([v, l]) => ({ label: tx(l), run: () => st().setView(v), checked: s.view === v })),
        sep,
        { header: tx('Riquadri') },
        ...([['tree', tn('Modello##albero')], ['props', tn('Proprietà')], ['right', tn('Simboli')], ['log', tn('Vista report')]] as const)
          .map(([id, l]) => ({ label: tx(l), run: () => usePanelStore.getState().setClosed(id, !panels.closed[id]), checked: !panels.closed[id] })),
        ...(canDetach() ? [
          { header: tx('In una finestra separata (anche sul secondo monitor)') },
          ...([['tree', tn('Modello##albero')], ['props', tn('Proprietà')], ['right', tn('Simboli')], ['log', tn('Vista report')]] as const)
            .map(([id, l]) => ({ label: tx(l), run: () => usePanelStore.getState().setDetached(id, !panels.detached[id]), checked: panels.detached[id] })),
        ] : []),
        sep,
        { label: tx('Adatta pagina'), key: keyLabel('fit'), run: A.fitView, disabled: !schema },
        { label: tx('Pagina precedente'), key: keyLabel('pagePrev'), run: () => A.stepPage(-1) },
        { label: tx('Pagina successiva'), key: keyLabel('pageNext'), run: () => A.stepPage(1) },
        sep,
        { header: tx('Tema') },
        ...([['system', tn('Come il sistema')], ['light', tn('Chiaro')], ['dark', tn('Scuro')]] as const).map(([v, l]) => ({ label: tx(l), run: () => st().setTheme(v), checked: s.theme === v })),
        { header: tx('Foglio di disegno') },
        ...([['white', tn('Bianco')], ['dark', tn('Scuro')], ['auto', tn('Come il tema')]] as const).map(([v, l]) => ({ label: tx(l), run: () => st().setSheet(v), checked: s.sheet === v })),
        { header: 'Language · Lingua' },
        ...UI_LANGS.map(l => ({ label: l.name, run: () => st().setUiLang(l.id), checked: s.uiLang === l.id })),
        { header: tx('Lingua degli schemi') },
        ...LANGS.map(l => ({ label: l.name, run: () => st().setLanguages({ display: l.id }), checked: (s.project.languages?.display ?? 'it') === l.id })),
        { label: tx('Strumenti sul disegno'), run: () => st().setActiveBar(!s.activeBar), checked: s.activeBar, title: tx('Barra degli strumenti di disegno sopra lo schema, con l\'ultimo simbolo usato') },
        { label: tx('Miniature delle pagine'), run: () => st().setPageStrip(!s.pageStrip), checked: s.pageStrip },
        { label: tx('Mappa del foglio'), run: () => st().setMinimap(!s.minimap), checked: s.minimap },
        { label: tx('Menu a raggiera'), run: () => st().setRadialMenu(!s.radialMenu), checked: s.radialMenu, title: tx('Menu a raggiera con il tasto destro (il menu completo resta dal centro)') },
        { label: tx('Griglia'), run: () => st().setGridMode(s.gridMode === 'off' ? 'auto' : 'off'), checked: s.gridMode !== 'off' },
        { label: tx('Aggancio'), run: () => st().setObjectSnap(!s.objectSnap), checked: s.objectSnap },
        { header: tx('Barra dei comandi') },
        ...UI_STYLES.map(([v, l]) => ({ label: tx(l), run: () => st().setUiStyle(v), checked: s.uiStyle === v })),
        { label: tx('Scritte sotto le icone'), run: () => st().setToolbarLabels(!s.toolbarLabels), checked: s.toolbarLabels, disabled: s.uiStyle !== 'classic', title: tx('Spenta: barra strumenti con le sole icone, su una riga') },
        sep,
        { label: tx('Cerca un comando…'), key: keyLabel('palette'), run: () => st().setDialog('palette') },
      ],
    },
    {
      name: 'Inserisci', items: [
        { label: tx('Filo'), key: keyLabel('wire'), run: tool({ kind: 'wire' }) },
        { label: tx('Collegamento rapido in verticale'), key: keyLabel('quickV'), run: tool({ kind: 'quickWire', axis: 'v' }), title: tx('Clic tra due punti di connessione uno sopra l\'altro') },
        { label: tx('Collegamento rapido in orizzontale'), key: keyLabel('quickH'), run: tool({ kind: 'quickWire', axis: 'h' }), title: tx('Clic tra due punti di connessione uno accanto all\'altro') },
        { label: tx('Filo in alto'), run: () => { st().setView('schema'); st().addRailWire('top'); }, disabled: page?.type !== 'multiline', title: tx('Filo orizzontale nella posizione fissa delle impostazioni del progetto, sotto quelli già messi') },
        { label: tx('Filo in basso'), run: () => { st().setView('schema'); st().addRailWire('bottom'); }, disabled: page?.type !== 'multiline', title: tx('Filo orizzontale nella posizione fissa in fondo alla pagina, dopo quelli già messi') },
        { label: tx('Bus di conduttori (modalità BUS)'), run: tool({ kind: 'wire', bundle: true }), title: tx('Una linea spessa porta più conduttori; i fili che vi entrano hanno il nome del conduttore (L1, PE…)') },
        { label: tx('Linea di definizione cavo'), run: tool({ kind: 'cable' }) },
        { label: tx('Linea di definizione della sezione dei fili'), run: tool({ kind: 'wiredef' }), title: tx('Si tira una riga attraverso i fili: la sezione va a tutti, con la scritta legata da un righino') },
        { label: tx('Riquadro di luogo (+)'), run: tool({ kind: 'zone' }), title: tx('Clic su due angoli: quello che sta dentro prende il luogo (quadro, pulsantiera, bordo macchina); nello schema di rete è il riquadro del quadro') },
        { label: tx('Testo'), run: tool({ kind: 'text' }) },
        { label: tx('Disegno DXF…'), run: () => void insertDxfDrawing(), disabled: !schema, title: tx('Grafica di un file DXF (linee, cerchi, archi, testi) sulla pagina, 1:1 in mm se ci sta; si sposta e si ridimensiona come un\'immagine') },
        { label: tx('Immagine…'), run: () => void insertImageFromFile(), disabled: !schema, title: tx('Foto, logo o disegno (PNG, JPG, SVG…); si incolla anche dagli appunti con {0}', K('V')) },
        { header: tx('Collegamento di rete') },
        ...PROTOCOLS.map(p => ({ label: protocolLabel(p.name), run: () => { st().setBusProtocol(p.name); tool({ kind: 'wire', bus: p.name })(); } })),
        sep,
        { header: tx('Pagine') },
        { label: tx('Pagina di schema'), run: () => { void A.newPage(s.pageId).then(() => st().setView('schema')); } },
        { label: tx('Schema unifilare'), run: () => { st().addTypedPage('singleline', 'Schema unifilare'); st().setView('schema'); } },
        { label: tx('Schema di rete'), run: () => { st().addNetworkPage(); st().setView('schema'); } },
        { label: tx('Layout del quadro'), run: () => { st().addLayoutPage(); st().setView('schema'); } },
        { label: tx('Copertina'), run: () => { st().addCoverPage(); st().setView('schema'); } },
        { label: tx('Disegni dei cavi (cablaggio)'), run: () => { st().syncDrawingPages('cable'); st().setView('schema'); }, disabled: !s.project.cables?.length, title: tx('Una pagina per cavo: estremità, conduttori e tabella; si aggiornano da sole') },
        { label: tx('Piedinature dei connettori'), run: () => { st().syncDrawingPages('connector'); st().setView('schema'); }, title: tx('Una pagina per connettore: faccia con i pin numerati e tabella dei collegamenti') },
        { label: tx('Schema d\'insieme'), run: () => { st().syncDrawingPages('system'); st().setView('schema'); }, disabled: !s.project.cables?.length, title: tx('Luoghi (quadri, pulsantiere, bordo macchina) con i dispositivi, le foto e i cavi di collegamento') },
        { label: tx('Pagine automatiche (liste)…'), run: () => st().setDialog('reportPages'), title: tx('Indice, distinta, lista d\'acquisto, dispositivi, morsetti, fili, cavi… come pagine del progetto') },
        { label: tx('Aggiorna le pagine di lista'), run: () => st().syncReportPages() },
        { label: tx('Duplica la pagina corrente…'), run: () => void A.duplicatePageAsk(s.pageId), disabled: page?.type !== 'multiline' },
        { label: tx('Ordina le pagine per numero'), run: () => st().sortPages(), title: tx('12, 12A, 12B, 13…; copertina e pagine senza numero restano dove sono') },
        { label: tx('Elimina la pagina corrente…'), run: () => void A.deletePageAsk(s.pageId), disabled: s.project.pages.length <= 1 },
      ],
    },
    {
      name: 'Progetto', items: [
        { label: tx('Impostazioni del progetto…'), key: keyLabel('settings'), run: () => st().setDialog('settings'), title: tx('Tutte le impostazioni del progetto in una pagina, e le cartelle predefinite') },
        { label: tx('Proprietà del progetto'), run: A.showProjectProps },
        { label: tx('Proprietà definite dall\'utente…'), run: () => st().setDialog('userProps'), title: tx('Proprietà proprie per dispositivi, pagine, collegamenti, progetto e articoli; import ed export XML') },
        { label: tx('Verifica (controlli di progetto)'), key: keyLabel('checks'), run: () => A.openReport('checks') },
        { label: tx('Assistente IA…'), key: keyLabel('ai'), run: () => st().setDialog('ai') },
        { label: tx('Assistenti IA: profili e account…'), run: () => st().setDialog('aiSettings') },
        { label: tx('Modifica con un assistente IA esterno (testo)…'), run: () => st().setDialog('text') },
        sep,
        { label: tx('Rinumera dispositivi…'), run: A.renumberDevices },
        { label: tx('Morsetti dagli articoli'), run: () => st().pinsFromArticles(), title: tx('Bobine, poli e contatti di tutti i dispositivi con articolo prendono i morsetti del modello funzione dell\'articolo') },
        { label: tx('Rinumera fili…'), run: A.renumberWires },
        { label: tx('Fili dall\'indirizzo PLC'), run: () => st().wiresFromPlc(), disabled: !hasSel, title: tx('I fili selezionati (o quelli dei punti PLC selezionati) prendono il nome dall\'indirizzo del canale, anche i loro rimandi') },
        { label: tx('Fili PLC automatici'), run: () => st().updateSettings({ wirePlcNames: !settingsOf(s.project).wirePlcNames }), checked: !!settingsOf(s.project).wirePlcNames, title: tx('Fili collegati a un canale PLC: nome dall\'indirizzo (I0.3; con 2 morsetti per canale I0.3A e I0.3B), anche attraverso i morsetti; i rimandi prendono lo stesso nome') },
        { label: tx('Rinumera pagine…'), run: () => void A.renumberPages(), title: tx('Pagine di progetto 1, 2, 3… nell\'ordine attuale: chiude i buchi lasciati dalle pagine tolte') },
        sep,
        { label: tx('Cartiglio: personalizza o disegna…'), run: () => st().openTitleBlockEditor(templateFor(s.project)) },
        { label: tx('Confronta i simboli con la libreria personale…'), run: () => checkProjectSymbols(true), title: tx('Simboli del progetto diversi da quelli della libreria personale, o solo nel progetto: scegli quale versione tenere') },
        { label: tx('Unifica i simboli doppi della libreria…'), run: openUnifySymbols, title: tx('Simboli della libreria personale con lo stesso disegno o lo stesso nome: se ne tiene uno e i progetti passano a quello') },
        sep,
        { label: tx('Nuovo luogo (quadro, pulsantiera…)…'), run: A.addPlace },
        { label: tx('Nuova rete IP'), run: () => { st().addIpNetwork(); A.showProjectProps(); } },
        { label: tx('Indirizzi di rete…'), run: () => st().setDialog('netAddresses'), title: tx('IP e nomi Profinet di tutti i dispositivi di rete in una tabella') },
        { label: tx('Assegna indirizzi IP'), run: () => st().assignIps(), disabled: !s.project.ipNetworks?.length },
        { label: tx('Piano indirizzi IP'), run: () => A.openReport('Piano indirizzi IP') },
        sep,
        { label: tx('Traduzioni…'), run: () => A.openReport('translations') },
        { label: tx('Proponi le traduzioni mancanti'), run: () => st().autoTranslate() },
        { label: tx('Traduci con l\'assistente IA'), run: () => void A.aiTranslate(), title: tx('Claude, ChatGPT o Gemini traducono i testi mancanti; restano da verificare') },
        sep,
        { label: tx('Revisioni…'), run: () => st().setDialog('revisions') },
        { label: tx('Rilascia revisione…'), run: () => void A.releaseRevision(), disabled: !!s.viewing || s.project.revisionState === 'released' },
        { label: tx('Apri revisione nuova'), run: () => st().openRevision(), disabled: !!s.viewing || s.project.revisionState !== 'released' },
        { label: tx('Salva come modello…'), run: A.saveAsTemplate },
      ],
    },
    {
      name: 'Liste', items: [
        { label: tx('Controlli'), run: () => A.openReport('checks') },
        { label: tx('Traduzioni'), run: () => A.openReport('translations') },
        sep,
        ...tables.map(t => ({ label: `${tx(t.title)} (${t.rows.length})`, run: () => A.openReport(t.title) })),
        { label: tx('Lista I/O PLC e hardware'), run: () => st().setView('plc') },
        sep,
        { label: tx('Liste personalizzate…'), run: () => st().setDialog('customLists'), title: tx('Liste nuove dalle liste del progetto: colonne, filtri, ordinamento e raggruppamento') },
        { label: tx('PDF completo…'), run: A.exportPdfAction },
      ],
    },
    {
      name: 'Aiuto', items: [
        { label: tx('Manuale'), run: () => window.open(`https://github.com/elconfa/OpenWiring/blob/main/docs/manuale/${uiLang()}/00-indice.md`, '_blank'), title: tx('Il manuale completo con foto ed esempi (sul sito del progetto)') },
        { label: tx('Cerca aggiornamenti…'), run: () => void checkUpdates(true), title: tx('Controlla se su GitHub c\'è una versione più nuova') },
        { label: tx('Giro guidato'), run: startTour, title: tx('Le parti della finestra, passo per passo') },
        { label: tx('Scorciatoie da tastiera…'), run: () => openSettingsAt('shortcuts'), title: tx('Elenco dei tasti dei comandi, da cambiare e da stampare') },
        { label: tx('Informazioni'), run: () => st().setDialog('about'), title: tx('Versione, dove scaricarla, progettista e contatto; scorciatoie da tastiera') },
        { label: tx('Guida per agenti IA (.md)…'), run: () => void A.saveAgentGuide() },
        { label: tx('Sito del progetto (GitHub)'), run: () => window.open('https://github.com/elconfa/OpenWiring', '_blank') },
      ],
    },
  ];
}

export function MenuBar() {
  // I tasti dei comandi si possono cambiare nelle impostazioni: i menu si aggiornano
  const [, setKeysTick] = useState(0);
  useEffect(() => onKeysChange(() => setKeysTick(t => t + 1)), []);
  const [open, setOpen] = useState<number | null>(null);
  // Si ridisegna con lo stato aggiornato mentre il menu è aperto
  useStore(s => (open === null ? 0 : s));
  const menus = open === null ? NAMES.map(name => ({ name, items: [] as Item[] })) : buildMenus(useStore.getState());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowRight') setOpen(o => (o === null ? o : (o + 1) % menus.length));
      else if (e.key === 'ArrowLeft') setOpen(o => (o === null ? o : (o + menus.length - 1) % menus.length));
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [open, menus.length]);
  return (
    <div className="menubar" ref={ref} role="menubar">
      {menus.map((m, i) => (
        <div key={m.name} className="menu">
          <button role="menuitem" aria-haspopup="true" aria-expanded={open === i} className={open === i ? 'menu-title open' : 'menu-title'}
            onMouseDown={e => { e.preventDefault(); setOpen(open === i ? null : i); }}
            onMouseEnter={() => { if (open !== null) setOpen(i); }}>{tx(m.name)}</button>
          {open === i && (
            <div className="menu-drop" role="menu">
              {m.items.map((it, k) => 'sep' in it ? <div key={k} className="menu-sep" />
                : 'header' in it ? <div key={k} className="menu-header">{it.header}</div>
                : (
                  <button key={k} role="menuitemcheckbox" aria-checked={it.checked} className="menu-item" disabled={it.disabled} title={it.title}
                    onClick={() => { setOpen(null); it.run(); }}>
                    <span className="menu-check">{it.checked ? '✓' : ''}</span>
                    <span className="menu-label">{it.label}</span>
                    {it.key && <span className="menu-key">{it.key}</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      <div className="tb-spacer" />
      <PaletteButton />
      <ViewTabs />
    </div>
  );
}

/** Schede delle viste principali, a destra nella barra dei menu */
export function ViewTabs() {
  const view = useStore(s => s.view);
  const st = useStore.getState;
  return (
    <div className="tb-tabs" role="tablist">
      {([['schema', tn('Schema')], ['devices', tn('Dispositivi')], ['plc', tn('PLC')], ['terminals', tn('Morsettiere')], ['connectors', tn('Connettori')], ['distributors', tn('Ripartitori')], ['cables', tn('Cavi')], ['calcs', tn('Calcoli')], ['parts', tn('Articoli')], ['reports', tn('Liste')]] as const).map(([v, l]) => (
        <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'tab active' : 'tab'} onClick={() => st().setView(v)}>{tx(l)}</button>
      ))}
    </div>
  );
}

/** Campo «Cerca un comando» (apre la ricerca dei comandi, come il tasto) */
export function PaletteButton() {
  const k = keyLabel('palette');
  return (
    <button className="palette-btn" onClick={() => useStore.getState().setDialog('palette')} title={tx('Comandi, pagine, dispositivi, liste e impostazioni')}>
      <Icon name="search" size={14} /><span>{tx('Cerca un comando')}</span>{k && <kbd>{k}</kbd>}
    </button>
  );
}
