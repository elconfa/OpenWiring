import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, restoreLibrary } from './model/store';
import { startSymbolFolder } from './ui/symbolFolderSync';
import { startPartsDb } from './ui/partsDbSync';
import { derive } from './model/derive';
import { potentialOf } from './model/netlist';
import { getSymbol, setGridSize } from './model/geometry';
import { settingsOf } from './model/numbering';
import { Toolbar } from './ui/Toolbar';
import { MenuBar } from './ui/MenuBar';
import { Ribbon } from './ui/Ribbon';
import { ActiveBar } from './ui/ActiveBar';
import { PageStrip } from './ui/PageStrip';
import { useWindowChrome } from './ui/windowChrome';
import { RichTooltip } from './ui/RichTooltip';
import { Tour } from './ui/Tour';
import { IssuesIndicator, SnapToggles, SaveState, ZoomControl, WaitingLinks } from './ui/StatusBar';
import { Backstage } from './ui/Backstage';
import { CommandPalette } from './ui/CommandPalette';
import { AboutDialog } from './ui/AboutDialog';
import { TextDialog } from './ui/TextDialog';
import { ProjectTree } from './ui/ProjectTree';
import { PropertyPanel } from './ui/PropertyPanel';
import { SymbolLibrary } from './ui/SymbolLibrary';
import { usePanels, useDrag, PinButton, CloseButton, DetachButton, awayOf, type PanelId } from './ui/panels';
import { DetachedPanel } from './ui/detach';
import { textKey } from './ui/textKeys';
import { Canvas } from './ui/Canvas';
import { PartsManager } from './ui/PartsManager';
import { ReportsView } from './ui/ReportsView';
import { CablesView } from './ui/CablesView';
import { PlcView } from './ui/PlcView';
import { TerminalsView } from './ui/TerminalsView';
import { ConnectorsView } from './ui/ConnectorsView';
import { DistributorsView } from './ui/DistributorsView';
import { BundlesView } from './ui/BundlesView';
import { CalcsView } from './ui/CalcsView';
import { PdfDialog } from './ui/PdfDialog';
import { SearchDialog } from './ui/SearchDialog';
import { SymbolEditor } from './ui/SymbolEditor';
import { LabelsDialog } from './ui/LabelsDialog';
import { LayoutView } from './ui/LayoutView';
import { DeviceTable } from './ui/DeviceTable';
import * as A from './ui/actions';
import { kvGet, kvSet } from './io/storage';
import type { Project } from './model/types';
import { parseProject, serializeProject } from './io/fileio';
import { AskHost } from './ui/Ask';
import { AiPanel } from './ui/AiPanel';
import { AiSettings } from './ui/AiSettings';
import { RevisionsDialog, RevisionBanner, revisionStateText } from './ui/RevisionsDialog';
import { ReleaseDialog } from './ui/ReleaseDialog';
import { ListStyleDialog } from './ui/ListStyleDialog';
import { CoverDialog, CableStyleDialog } from './ui/PageStyleDialogs';
import { ReportPagesDialog } from './ui/ReportPagesDialog';
import { NetAddressDialog } from './ui/NetAddressDialog';
import { projectReports } from './model/reports';
import { reportPagesOutdated } from './model/templates';
import { SettingsDialog } from './ui/SettingsDialog';
import { UserPropsDialog } from './ui/UserPropsDialog';
import { RichTextHost } from './ui/RichTextEditor';
import { ReplaceSymbolHost } from './ui/ReplaceSymbolDialog';
import { SymbolSyncHost, UnifySymbolsHost, setSymbolLibraryReady, afterProjectOpen } from './ui/LibrarySync';
import { BranchPickerHost } from './ui/BranchPicker';
import { PropsDialog } from './ui/PropsDialog';
import { pasteImages } from './ui/images';
import { tx, tn } from './i18n/ui';
import { autosaveMinutes, startScreenOn } from './ui/appPrefs';
import { StartScreen } from './ui/StartScreen';
import { CustomListsDialog } from './ui/CustomListsDialog';
import { checkUpdates } from './ui/updates';
import { isElectron } from './io/fileio';
import { handleShortcut, modalOpen } from './ui/shortcuts';

/**
 * Dati per il recupero dopo un blocco: file, modifiche non salvate, quando. closed = l'applicazione
 * è stata chiusa normalmente (niente recupero: si riaprono i file salvati, files).
 */
interface RecoveryMeta { filePath?: string; dirty: boolean; time: number; closed?: boolean; files?: string[] }
/** Copie degli altri progetti aperti, per il recupero dopo un blocco */
interface RecoveryOther { text: string; filePath?: string; dirty: boolean }
/** Chiusura in corso: l'autosalvataggio non deve più scrivere */
let closing = false;

const HINTS: Record<string, string> = {
  select: tn('Clic per selezionare · trascina per spostare · riquadro da sinistra = contenuti, da destra = intersecati · Alt/tasto centrale per spostare la vista'),
  wire: tn('Clic sul punto di partenza, clic per gli angoli · termina su un punto di connessione, doppio clic, Invio o tasto destro · Esc annulla'),
  place: tn('Clic per inserire · R ruota · Esc o tasto destro per terminare'),
  text: tn('Clic per posizionare il testo'),
  macro: tn('Macro: clic per inserire (angolo in alto a sinistra) · sigle e numeri filo nuovi · Esc per terminare'),
  zone: 'Quadro: clic su un angolo e clic sull\'angolo opposto · i nodi dentro il riquadro appartengono a quel quadro',
  cable: 'Cavo: clic su un lato dei fili e clic sull\'altro lato · i fili attraversati diventano conduttori del cavo · Esc annulla',
  quickWire: tn('Collegamento rapido: clic tra due punti di connessione (V uno sopra l\'altro, H uno accanto all\'altro) o tra il punto del clic e un punto di connessione · Esc o tasto destro per terminare'),
  wireLabels: tn('Allinea numeri filo: clic e clic per tracciare una linea attraverso i fili; i loro numeri vanno sulla linea, dal lato in cui erano · Esc per terminare'),
  paste: tn('Incolla: clic per posare gli elementi copiati · Esc o tasto destro per annullare'),
};

function LogView({ height }: { height?: number }) {
  const log = useStore(s => s.log);
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log]);
  return (
    <div className={height ? 'log' : 'log fill'} ref={ref} style={height ? { height } : undefined} tabIndex={0}>
      {log.length > 0 && <button className="mini log-copy" title={tx('Copia tutti i messaggi negli appunti')}
        onClick={() => void navigator.clipboard.writeText(log.map(l => `${l.time} ${l.msg}`).join('\n')).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>{copied ? tx('Copiato ✓') : tx('Copia tutto')}</button>}
      {log.map((l, i) => <div key={i} className={`log-${l.level}`}><span className="muted">{l.time}</span> {l.msg}</div>)}
      {!log.length && <div className="muted">{tx('Vista report: qui compaiono i messaggi di import ed export.')}</div>}
    </div>
  );
}

/** Potenziale evidenziato: nome e pagine in cui compare, cliccabili */
function PotentialBar({ derived }: { derived: ReturnType<typeof derive> }) {
  const highlight = useStore(s => s.highlight);
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const pot = useMemo(() => (highlight ? potentialOf(project, derived.netlist, highlight) : undefined), [highlight, project, derived]);
  if (!highlight) return null;
  const st = useStore.getState;
  return (
    <span className="potential-bar">
      <b>{tx('Potenziale')} {pot?.name || '?'}</b>
      {pot ? tx(' · {0} fili · pag.', pot.wireIds.size) : tx(' non più presente')}
      {pot?.pageIds.map(id => {
        const pg = project.pages.find(p => p.id === id)!;
        return <button key={id} className={id === pageId ? 'link active' : 'link'} onClick={() => st().setPage(id)}>{pg.name}</button>;
      })}
      <button className="link" title={tx('Togli evidenziazione')} onClick={() => st().setHighlight(null)}>✕</button>
    </span>
  );
}

function StatusBar({ derived }: { derived: ReturnType<typeof derive> }) {
  const cursor = useStore(s => s.cursor);
  const tool = useStore(s => s.tool);
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const schema = useStore(s => s.view === 'schema');
  const page = project.pages.find(p => p.id === pageId);
  const sym = tool.kind === 'place' ? getSymbol(tool.symbolId, project) : undefined;
  return (
    <div className="statusbar">
      <span>{sym ? tx('Inserisci: {0}', tx(sym.name)) : tx(HINTS[tool.kind] ?? '')}</span>
      <span className="tb-spacer" />
      <PotentialBar derived={derived} />
      {project.revisionState && <span className="muted">{revisionStateText(project)}</span>}
      <WaitingLinks waiting={derived.linkWaiting} />
      <IssuesIndicator />
      {schema && <SnapToggles />}
      <SaveState />
      <span>{tx('Pag.')} {page?.name}</span>
      {schema && <span className="mono">X {cursor.x.toFixed(0)}  Y {cursor.y.toFixed(0)} {tx('mm')}</span>}
      <ZoomControl />
    </div>
  );
}

export function App() {
  const project = useStore(s => s.project);
  // Riquadri: misure, riquadri nascosti e quello aperto al passaggio del mouse
  const P = usePanels();
  const L = P.layout;
  // Riquadri chiusi o in una finestra propria: nella finestra principale non ci sono
  const C = awayOf(L);
  const leftOff = C.tree && C.props;
  const start = useRef(L);
  const begin = () => { start.current = P.layout; };
  const dragLeft = useDrag(({ dx }) => P.set({ leftW: start.current.leftW + dx }), begin);
  const dragRight = useDrag(({ dx }) => P.set({ rightW: start.current.rightW - dx }), begin);
  const dragTree = useDrag(({ dy }) => P.set({ treeH: start.current.treeH + dy }), begin);
  const dragLog = useDrag(({ dy }) => P.set({ logH: start.current.logH - dy }), begin);
  /** Classe del riquadro: fisso, nascosto o aperto sopra il disegno al passaggio del mouse */
  const mode = (id: PanelId) => (!L.hidden[id] ? '' : P.peek === id ? ' floating' : ' gone');
  const leave = (id: PanelId) => () => { if (L.hidden[id]) P.setPeek(null); };
  const theme = useStore(s => s.theme);
  useWindowChrome();
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const view = useStore(s => s.view);
  const uiStyle = useStore(s => s.uiStyle);
  const activeBar = useStore(s => s.activeBar);
  const pageStrip = useStore(s => s.pageStrip);
  const pageId = useStore(s => s.pageId);
  const currentPage = project.pages.find(p => p.id === pageId);
  const library = useStore(s => s.library);
  const dirty = useStore(s => s.dirty);
  const derived = useMemo(() => {
    setGridSize(settingsOf(project).grid);
    return derive(project, library);
  }, [project, library]);

  // Ripristino libreria articoli e ultimo progetto in lavorazione (anche dopo un arresto del programma)
  useEffect(() => {
    void startPartsDb().then(() => restoreLibrary()).then(() => startSymbolFolder()).then(() => setSymbolLibraryReady());
    void Promise.all([kvGet<string>('autosave'), kvGet<RecoveryMeta>('autosaveMeta'), kvGet<RecoveryOther[]>('autosaveOthers')]).then(async ([txt, meta, others]) => {
      const st = useStore.getState();
      // Chiusura normale: niente recupero, si riaprono i progetti salvati che erano aperti
      if (meta?.closed) {
        let first = true;
        for (const f of meta.files ?? []) {
          const r = await window.elettro?.readProject?.(f);
          if (!r) continue;
          try {
            const p = parseProject(new TextDecoder().decode(r.data));
            if (first) st.loadProject(p, r.path); else useStore.getState().openAlongside(p, r.path);
            first = false;
          } catch { /* file non più leggibile: si salta */ }
        }
        if (first) A.loadExample();
        return;
      }
      if (!txt) { A.loadExample(); return; }
      try {
        // Recupero dopo un blocco: il progetto torna con il suo file e, se non era stato salvato, con le modifiche da salvare
        st.loadProject(parseProject(txt), meta?.filePath);
        if (meta?.dirty) {
          useStore.setState({ dirty: true });
          st.logMsg(tx('Recuperate le modifiche non salvate del {0}{1}: salva il progetto per tenerle', new Date(meta.time).toLocaleString(), meta.filePath ? ` (${meta.filePath})` : ''));
        } else st.logMsg(tx('Ripristinato l\'ultimo progetto in lavorazione'));
        // Anche gli altri progetti che erano aperti
        const main = useStore.getState().project;
        for (const o of others ?? []) {
          useStore.getState().openAlongside(parseProject(o.text), o.filePath);
          if (o.dirty) useStore.setState({ dirty: true });
        }
        // Torna attivo il progetto che lo era
        const back = useStore.getState().others.find(x => x.project === main);
        if (back) useStore.getState().switchProject(back.key);
        if (others?.length) st.logMsg(tx('Recuperati anche {0} altri progetti aperti', others.length));
      } catch { A.loadExample(); }
    }).finally(() => {
      afterProjectOpen();
      if (startScreenOn()) useStore.getState().setDialog('start');
      // Versione nuova su GitHub (solo app installata: la versione web è sempre l'ultima)
      if (isElectron()) void checkUpdates();
    });
  }, []);

  // Pagine di lista automatiche: si creano e si tolgono da sole quando cambia lo schema
  useEffect(() => {
    // Progetto rilasciato o revisione archiviata aperta: in sola lettura, niente pagine da rifare
    if (!project.settings.autoReportPages || project.revisionState === 'released' || useStore.getState().viewing) return;
    const t = setTimeout(() => {
      const s = useStore.getState();
      if (reportPagesOutdated(s.project, projectReports(s.project, s.library), s.library)) s.syncReportPages(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [project]);

  // Autosalvataggio locale (non sostituisce «Salva»)
  useEffect(() => {
    // Guardando una revisione archiviata si tiene il progetto vero
    const t = setTimeout(() => {
      if (closing) return;
      const s = useStore.getState();
      const back = s.viewing?.back;
      void kvSet('autosave', serializeProject((back?.project ?? project) as Project));
      void kvSet('autosaveMeta', { filePath: s.filePath, dirty: back ? back.dirty : s.dirty, time: Date.now() } satisfies RecoveryMeta);
    }, 800);
    return () => clearTimeout(t);
  }, [project, dirty]);

  // Copie degli altri progetti aperti (cambiano solo quando si passa da un progetto all'altro)
  const others = useStore(s => s.others);
  useEffect(() => {
    if (closing) return;
    void kvSet('autosaveOthers', others.map(o => ({ text: serializeProject(o.project), filePath: o.filePath, dirty: o.dirty })) satisfies RecoveryOther[]);
  }, [others]);

  // Chiusura dell'applicazione: Salva / Cancella / Annulla per ogni progetto non salvato; dopo una
  // chiusura normale al prossimo avvio non c'è recupero
  useEffect(() => {
    const markClosed = async () => {
      closing = true;
      const s = useStore.getState();
      const files = [s.filePath, ...s.others.map(o => o.filePath)].filter((f): f is string => !!f);
      await kvSet('autosaveMeta', { dirty: false, time: Date.now(), closed: true, files } satisfies RecoveryMeta);
    };
    const off = window.elettro?.onCloseRequest?.(async () => {
      if (modalOpen()) useStore.getState().setDialog(null);
      if (await A.confirmCloseAll()) { await markClosed(); window.elettro?.confirmClose?.(); } else window.elettro?.cancelClose?.();
    });
    if (off) return off;
    // Nel browser: avviso del browser se ci sono modifiche, altrimenti chiusura normale
    const before = (e: BeforeUnloadEvent) => {
      const s = useStore.getState();
      if (s.dirty || s.viewing?.back.dirty || s.others.some(o => o.dirty)) { e.preventDefault(); return; }
      void markClosed();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  // Salvataggio automatico del file (Impostazioni ▸ Programma ▸ Salvataggio): controllo ogni 30 s
  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      const min = autosaveMinutes();
      if (!min || Date.now() - last < min * 60000) return;
      last = Date.now();
      void A.autoSaveProject();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest('input,textarea,select')) return;
      // Testo selezionato (es. nella Vista report): Ctrl+C lo copia; Ctrl+A nella Vista report la seleziona tutta
      if (textKey(ev)) return;
      const st = useStore.getState();
      // Con la finestra delle proprietà aperta i tasti non agiscono sullo schema
      if (st.dialog === 'props') return;
      // Comandi con le scorciatoie configurabili (shortcuts.ts)
      if (handleShortcut(ev)) return;
      const k = ev.key.toLowerCase();
      if (ev.metaKey || ev.ctrlKey || ev.altKey || modalOpen()) return;
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k) && st.selection.length) {
        ev.preventDefault();
        const d = ev.shiftKey ? 16 : 4;
        st.moveSelection(k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0);
      }
    };
    const onPaste = (ev: ClipboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (useStore.getState().view !== 'schema') return;
      if ([...(ev.clipboardData?.files ?? [])].some(f => f.type.startsWith('image/'))) { ev.preventDefault(); void pasteImages(ev.clipboardData); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, []);

  return (
    <div className="app">
      {uiStyle === 'classic' ? <><MenuBar /><Toolbar /></> : <Ribbon />}
      <RevisionBanner />
      <div className={view === 'symbol' ? 'main focus-editor' : 'main'}
        style={view === 'symbol' ? undefined : { gridTemplateColumns: `${leftOff ? 0 : L.hidden.left ? 8 : L.leftW}px minmax(0, 1fr) ${C.right ? 0 : L.hidden.right ? 8 : L.rightW}px` }}>
        {!leftOff && L.hidden.left && <div className="peek peek-left" onMouseEnter={() => P.setPeek('left')} title={tx('Modello e Proprietà')} />}
        {leftOff ? <div /> : (
          <aside className={`left${mode('left')}`} style={L.hidden.left ? { width: L.leftW } : undefined} onMouseLeave={leave('left')}>
            {!C.tree && (
              <>
                <div className="panel-title">{tx('Modello##albero')}<PinButton side="left" hidden={L.hidden.left} onClick={() => P.toggle('left')} /><DetachButton id="tree" /><CloseButton id="tree" /></div>
                <div className={C.props ? 'tree-wrap fill' : 'tree-wrap'} style={C.props ? undefined : { height: L.treeH }}><ProjectTree /></div>
              </>
            )}
            {!C.props && (
              <>
                <div className={C.tree ? 'panel-title' : 'panel-title resize-v'} onMouseDown={C.tree ? undefined : dragTree} title={C.tree ? undefined : tx('Trascina per cambiare l\'altezza')}>
                  {tx('Proprietà')}{C.tree && <PinButton side="left" hidden={L.hidden.left} onClick={() => P.toggle('left')} />}<DetachButton id="props" /><CloseButton id="props" />
                </div>
                <PropertyPanel derived={derived} />
              </>
            )}
            <div className="col-resizer right-edge" onMouseDown={dragLeft} title={tx('Trascina per cambiare la larghezza')} />
          </aside>
        )}
        <section className="center">
          {view === 'schema' && (currentPage?.type === 'layout' ? <LayoutView page={currentPage} /> : <Canvas derived={derived} />)}
          {view === 'schema' && activeBar && currentPage?.type !== 'layout' && <ActiveBar />}
          {view === 'schema' && pageStrip && <PageStrip derived={derived} />}
          {view === 'parts' && <PartsManager />}
          {view === 'reports' && <ReportsView />}
          {view === 'devices' && <DeviceTable />}
          {view === 'plc' && <PlcView />}
          {view === 'terminals' && <TerminalsView />}
          {view === 'connectors' && <ConnectorsView />}
          {view === 'distributors' && <DistributorsView />}
          {view === 'calcs' && <CalcsView />}
          {view === 'cables' && <CablesView />}
          {view === 'bundles' && <BundlesView />}
          {view === 'symbol' && <SymbolEditor />}
          {!C.log && L.hidden.log && <div className="peek peek-bottom" onMouseEnter={() => P.setPeek('log')} title={tx('Vista report')} />}
          {!C.log && (
            <div className={`log-panel${mode('log')}`} onMouseLeave={leave('log')}>
              <div className="panel-title resize-v" onMouseDown={dragLog} title={tx('Trascina per cambiare l\'altezza')}>
                {tx('Vista report')}<PinButton side="bottom" hidden={L.hidden.log} onClick={() => P.toggle('log')} /><DetachButton id="log" /><CloseButton id="log" />
              </div>
              <LogView height={L.logH} />
            </div>
          )}
        </section>
        {!C.right && L.hidden.right && <div className="peek peek-right" onMouseEnter={() => P.setPeek('right')} title={tx('Simboli')} />}
        {C.right ? <div /> : (
          <aside className={`right${mode('right')}`} style={L.hidden.right ? { width: L.rightW } : undefined} onMouseLeave={leave('right')}>
            <div className="panel-title">{tx('Simboli')}<PinButton side="right" hidden={L.hidden.right} onClick={() => P.toggle('right')} /><DetachButton id="right" /><CloseButton id="right" /></div>
            <SymbolLibrary />
            <div className="col-resizer left-edge" onMouseDown={dragRight} title={tx('Trascina per cambiare la larghezza')} />
          </aside>
        )}
      </div>
      {L.detached.tree && <DetachedPanel id="tree" title={tx('Modello##albero')}><div className="tree-wrap fill"><ProjectTree /></div></DetachedPanel>}
      {L.detached.props && <DetachedPanel id="props" title={tx('Proprietà')}><PropertyPanel derived={derived} /></DetachedPanel>}
      {L.detached.right && <DetachedPanel id="right" title={tx('Simboli')}><SymbolLibrary /></DetachedPanel>}
      {L.detached.log && <DetachedPanel id="log" title={tx('Vista report')}><LogView /></DetachedPanel>}
      <StatusBar derived={derived} />
      <PdfDialog />
      <SearchDialog />
      <AskHost />
      <SymbolSyncHost />
      <UnifySymbolsHost />
      <BranchPickerHost />
      <LabelsDialog />
      <AboutDialog />
      <StartScreen />
      <Backstage />
      <CommandPalette />
      <RichTooltip />
      <Tour />
      <CustomListsDialog />
      <TextDialog />
      <AiPanel />
      <AiSettings />
      <ReportPagesDialog />
      <NetAddressDialog />
      <RevisionsDialog />
      <ReleaseDialog />
      <ListStyleDialog />
      <CoverDialog />
      <CableStyleDialog />
      <SettingsDialog />
      <UserPropsDialog />
      <RichTextHost />
      <ReplaceSymbolHost />
      <PropsDialog derived={derived} />
    </div>
  );
}
