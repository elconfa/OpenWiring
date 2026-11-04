// Progetto ▸ Impostazioni del progetto: le impostazioni del progetto in
// un albero apribile (Progetto, Foglio, Numerazione, Aspetto, Disegno, Liste) con la ricerca per nome e
// i valori predefiniti di ogni pagina, più il ramo Programma con le cartelle predefinite dei dialoghi
// (punto 6), che valgono per tutti i progetti.
import { useEffect, useState } from 'react';
import type { ProjectSettings } from '../model/types';
import { settingsOf } from '../model/numbering';
import { useStore, historySize, setHistorySize, HISTORY_DEFAULT, type UiStyle } from '../model/store';
import { keyLabel } from './shortcuts';
import { startTour } from './Tour';
import { DEFAULT_SETTINGS } from '../model/types';
import { isElectron, openDocument, type FolderKind } from '../io/fileio';
import { SETTINGS_TREE, SettingsDatalists, SettingsFilter, settingsMatch, type SettingsBranch, type SettingsLeaf } from './PropertyPanel';
import { Embedded } from './DialogShell';
import { CableStyleDialog, CoverDialog, ZoneStyleRows } from './PageStyleDialogs';
import { ListStyleDialog } from './ListStyleDialog';
import { ReportPagesDialog } from './ReportPagesDialog';
import { CustomListsDialog } from './CustomListsDialog';
import { UserPropsDialog } from './UserPropsDialog';
import { askChoice } from './Ask';
import { tx, tn } from '../i18n/ui';
import { autosaveMinutes, setAutosaveMinutes, backupKeep, setBackupKeep, dwgConverter, setDwgConverter } from './appPrefs';
import { ODA_URL } from './actions';
import { ProfilesPanel } from './ProfilesPanel';
import { ShortcutsPanel } from './ShortcutsPanel';
import { checkUpdates, currentVersion, setUpdateCheckOn, updateCheckOn } from './updates';

const FOLDERS: [FolderKind, string, string][] = [
  ['projects', tn('Progetti'), tn('Apri e salva i progetti (.ecad)')],
  ['import', tn('File da importare'), tn('EDZ, XML EPLAN, DXF, PDF, pagine scritte dall\'IA, tabelle…')],
  ['export', tn('File esportati'), tn('PDF, DXF, Excel, CSV, etichette, guida per gli agenti…')],
];

function FolderRows() {
  const [f, setF] = useState<Awaited<ReturnType<NonNullable<NonNullable<typeof window.elettro>['foldersGet']>>>>();
  const load = () => void window.elettro?.foldersGet?.().then(setF);
  useEffect(load, []);
  if (!isElectron()) return <p className="small muted">{tx('Le cartelle predefinite si scelgono nell\'app installata: nel browser i file si aprono e si scaricano dal browser.')}</p>;
  const choose = async (k: FolderKind) => {
    const dir = await window.elettro?.foldersChoose?.(k);
    if (dir) { await window.elettro?.foldersSet?.(k, dir); load(); }
  };
  const clear = async (k: FolderKind) => { await window.elettro?.foldersSet?.(k, null); load(); };
  return (
    <table className="prop-table">
      <tbody>
        {FOLDERS.map(([k, name, hint]) => (
          <tr key={k}>
            <td className="prop-name" title={tx(hint)}>{tx(name)}</td>
            <td className="prop-value">
              <div className="mono small">{f?.defaults[k] ?? tx('Documenti ({0})', f?.documents ?? '')}</div>
              {f?.last[k] && f.last[k] !== f.defaults[k] && <div className="small muted">{tx('ultima usata: {0}', f.last[k]!)}</div>}
              <button onClick={() => void choose(k)}>{tx('Scegli…')}</button>{' '}
              {f?.defaults[k] && <button onClick={() => void clear(k)}>{tx('Documenti')}</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Preferenze di modifica del programma (salvate nel computer, non nel progetto) */
function EditingRows() {
  const [n, setN] = useState(historySize);
  return (
    <table className="prop-table"><tbody>
      <tr>
        <td className="prop-name">{tx('Passi di annullamento')}</td>
        <td className="prop-value">
          <input type="number" min={10} max={1000} value={n} onChange={e => setN(parseInt(e.target.value, 10) || 0)}
            onBlur={() => { const v = Math.min(1000, Math.max(10, n || HISTORY_DEFAULT)); setN(v); setHistorySize(v === HISTORY_DEFAULT ? undefined : v); }}
            title={tx('Quante modifiche si possono annullare (da 10 a 1000; più passi usano più memoria con i progetti grandi)')} />
        </td>
      </tr>
    </tbody></table>
  );
}

/** Campo numerico di una preferenza: si conferma uscendo dal campo, fuori dai limiti torna al valore valido */
function PrefNumber({ get, set, min, max, title }: { get: () => number; set: (v: number) => void; min: number; max: number; title?: string }) {
  const [v, setV] = useState(() => String(get()));
  return (
    <input type="number" min={min} max={max} value={v} title={title} onChange={e => setV(e.target.value)}
      onBlur={() => { const n = Math.round(Number(v)); const ok = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : get(); set(ok); setV(String(ok)); }} />
  );
}

/** Salvataggio automatico del file, copie di sicurezza e recupero */
function SavingRows() {
  return (
    <>
      <table className="prop-table"><tbody>
        <tr>
          <td className="prop-name">{tx('Salva il file automaticamente ogni')}</td>
          <td className="prop-value"><span className="color-row">
            <PrefNumber get={autosaveMinutes} set={setAutosaveMinutes} min={0} max={120} title={tx('Minuti tra un salvataggio e l\'altro; 0 = mai. Vale per i progetti che hanno già un file, con modifiche da salvare')} />
            <span className="muted small">{tx('minuti (0 = mai)')}</span>
          </span></td>
        </tr>
        <tr>
          <td className="prop-name">{tx('Copie di sicurezza per progetto')}</td>
          <td className="prop-value"><span className="color-row">
            <PrefNumber get={backupKeep} set={setBackupKeep} min={0} max={50} title={tx('A ogni salvataggio il file com\'era va nella cartella «Backup OpenWiring» accanto al progetto; restano le ultime copie (0 = nessuna)')} />
            <span className="muted small">{tx('ultime copie (0 = nessuna)')}</span>
          </span></td>
        </tr>
      </tbody></table>
      <p className="small muted">{isElectron()
        ? tx('Le copie stanno nella cartella «Backup OpenWiring» accanto al file del progetto, con data e ora nel nome. Il file si scrive prima in una copia temporanea, così un arresto a metà non lo rovina.')
        : tx('Salvataggio automatico e copie di sicurezza funzionano nell\'app installata: nel browser il progetto si scarica.')}</p>
      <p className="small muted">{tx('In ogni caso il programma tiene da parte il progetto aperto a ogni modifica: dopo un arresto riparte da lì, con il suo file e le modifiche non ancora salvate.')}</p>
    </>
  );
}

/** Convertitore per l'export DWG (ODA File Converter, gratuito) */
function DwgRows() {
  const [conv, setConv] = useState(dwgConverter);
  const [found, setFound] = useState<string | null | undefined>(undefined);
  useEffect(() => { void window.elettro?.dwgFind?.().then(setFound); }, []);
  if (!isElectron()) return <p className="small muted">{tx('L\'export DWG funziona nell\'app installata.')}</p>;
  const choose = async () => {
    const [p] = (await window.elettro?.choosePaths?.([{ name: 'ODA File Converter', extensions: ['exe', '*'] }])) ?? [];
    if (p) { setConv(p); setDwgConverter(p); }
  };
  return (
    <>
      <p className="small">{tx('Il DWG è un formato chiuso: OpenWiring scrive il DXF e lo fa convertire da ODA File Converter, gratuito, da installare a parte. Esporta da File ▸ Esporta ▸ DWG.')}</p>
      <table className="prop-table"><tbody>
        <tr>
          <td className="prop-name">{tx('Convertitore')}</td>
          <td className="prop-value">
            <div className="mono small">{conv ?? found ?? tx('non trovato')}</div>
            <button onClick={() => void choose()}>{tx('Scegli…')}</button>{' '}
            {conv && <button onClick={() => { setConv(undefined); setDwgConverter(undefined); }}>{tx('Cerca da solo')}</button>}{' '}
            <button onClick={() => void openDocument(ODA_URL).catch(() => window.open(ODA_URL, '_blank', 'noopener'))}>{tx('Scarica ODA File Converter')}</button>
          </td>
        </tr>
      </tbody></table>
      <p className="small muted">{found === null && !conv ? tx('Non installato nelle cartelle solite: installalo o indica dove si trova.') : tx('I DWG sono in formato AutoCAD 2018, in scala 1:1 in mm, un file per pagina.')}</p>
    </>
  );
}

/** Controllo delle versioni nuove su GitHub */
function UpdateRows() {
  const [on, setOn] = useState(updateCheckOn);
  return (
    <>
      <label className="inline"><input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setUpdateCheckOn(e.target.checked); }} />{tx('Controlla all\'avvio se c\'è una versione nuova (una volta al giorno, solo nell\'app installata)')}</label>
      <p className="small muted">{tx('Versione installata: {0}. Il controllo legge solo il numero dell\'ultima versione su GitHub, senza inviare dati.', currentVersion())}</p>
      <p><button onClick={() => void checkUpdates(true)}>{tx('Cerca aggiornamenti ora')}</button></p>
    </>
  );
}

/** Aspetto dei comandi: barra multifunzione completa o compatta, oppure menu classici */
function CommandBarRows() {
  const style = useStore(s => s.uiStyle);
  const collapsed = useStore(s => s.ribbonCollapsed);
  const labels = useStore(s => s.toolbarLabels);
  const activeBar = useStore(s => s.activeBar);
  const animations = useStore(s => s.animations);
  const pageStrip = useStore(s => s.pageStrip);
  const minimap = useStore(s => s.minimap);
  const radial = useStore(s => s.radialMenu);
  const st = useStore.getState;
  const opts: [UiStyle, string, string][] = [
    ['ribbon', tn('Barra multifunzione'), tn('Schede con i comandi raggruppati e le icone grandi, come in Office')],
    ['compact', tn('Barra multifunzione compatta'), tn('Le stesse schede con i comandi su una sola riga: più spazio per lo schema')],
    ['classic', tn('Menu classici'), tn('Menu File, Modifica, Visualizza… e la barra strumenti con i comandi di disegno')],
  ];
  return (
    <>
      {opts.map(([v, name, note]) => (
        <label key={v} className="inline settings-choice">
          <input type="radio" name="uiStyle" checked={style === v} onChange={() => st().setUiStyle(v)} />
          <span><b>{tx(name)}</b><br /><span className="small muted">{tx(note)}</span></span>
        </label>
      ))}
      {style !== 'classic' && <label className="inline"><input type="checkbox" checked={collapsed} onChange={e => st().setRibbonCollapsed(e.target.checked)} />{tx('Barra ridotta alle schede (si apre con un clic sulla scheda; anche con {0})', keyLabel('ribbon') || '—')}</label>}
      {style === 'classic' && <label className="inline"><input type="checkbox" checked={labels} onChange={e => st().setToolbarLabels(e.target.checked)} />{tx('Scritte sotto le icone')}</label>}
      <p className="small muted">{tx('In tutti gli stili {0} apre «Cerca un comando»: si scrive cosa fare e si preme Invio.', keyLabel('palette') || '—')}</p>
      <h4>{tx('Interfaccia')}</h4>
      <label className="inline"><input type="checkbox" checked={activeBar} onChange={e => st().setActiveBar(e.target.checked)} />{tx('Strumenti di disegno sopra lo schema')}</label>
      <label className="inline"><input type="checkbox" checked={pageStrip} onChange={e => st().setPageStrip(e.target.checked)} />{tx('Miniature delle pagine sotto lo schema')}</label>
      <label className="inline"><input type="checkbox" checked={minimap} onChange={e => st().setMinimap(e.target.checked)} />{tx('Mappa del foglio con lo schema ingrandito')}</label>
      <label className="inline"><input type="checkbox" checked={radial} onChange={e => st().setRadialMenu(e.target.checked)} />{tx('Menu a raggiera con il tasto destro (il menu completo resta dal centro)')}</label>
      <label className="inline"><input type="checkbox" checked={animations} onChange={e => st().setAnimations(e.target.checked)} />{tx('Animazioni leggere (menu, finestre, barra)')}</label>
      <p><button onClick={() => { st().setDialog(null); setTimeout(startTour, 200); }}>{tx('Giro guidato')}</button></p>
    </>
  );
}

/** Pagine delle impostazioni, per «Cerca un comando» */
export function settingsLeaves(): { id: string; title: string; branch: string }[] {
  return TREE.flatMap(b => b.leaves.map(l => ({ id: l.id, title: l.title, branch: b.title })));
}

/** Ramo Programma: impostazioni che valgono per tutti i progetti (non si salvano nel progetto) */
const APP_BRANCH: SettingsBranch = { id: 'app', title: tn('Programma (tutti i progetti)'), free: true, leaves: [
  { id: 'commandBar', title: tn('Barra dei comandi'), render: () => <CommandBarRows /> },
  { id: 'folders', title: tn('Cartelle predefinite'), render: () => <>
    <p className="small muted">{tx('I dialoghi ripartono dall\'ultima cartella usata per ogni tipo di file; scegliendo una cartella predefinita ripartono da lì.')}</p>
    <FolderRows />
  </> },
  { id: 'saving', title: tn('Salvataggio e recupero'), render: () => <SavingRows /> },
  { id: 'shortcuts', title: tn('Scorciatoie da tastiera'), render: () => <ShortcutsPanel /> },
  { id: 'updates', title: tn('Aggiornamenti'), render: () => <UpdateRows /> },
  { id: 'dwg', title: tn('Export DWG'), render: () => <DwgRows /> },
  { id: 'editing', title: tn('Modifica'), render: () => <EditingRows /> },
] };

/** Profili di impostazioni e scambio delle impostazioni del progetto */
const PROFILE_BRANCH: SettingsBranch = { id: 'profiles', title: tn('Profili'), free: true, leaves: [
  { id: 'profiles', title: tn('Profili e import/export'), render: () => <ProfilesPanel /> },
] };

/**
 * Pagine delle finestre di stile e di progetto, nei rami dell'albero: lo stesso contenuto delle finestre
 * che si aprono dai menu (Embedded), così tutti i parametri del progetto stanno in un posto solo
 */
const EXTRA_LEAVES: Record<string, SettingsLeaf[]> = {
  project: [
    { id: 'userProps', title: tn('Proprietà definite dall\'utente'), free: true, render: () => <UserPropsDialog /> },
  ],
  sheet: [
    { id: 'cover', title: tn('Copertina'), keys: ['cover'], free: true, render: () => <CoverDialog /> },
  ],
  look: [
    { id: 'cableStyle', title: tn('Cavi'), keys: ['cableStyle'], free: true, render: () => <CableStyleDialog /> },
    { id: 'zoneStyle', title: tn('Riquadri di luogo'), keys: ['zoneStyle'], render: () => <ZoneStyleRows /> },
  ],
  lists: [
    { id: 'reportPages', title: tn('Pagine automatiche'), free: true, render: () => <ReportPagesDialog /> },
    { id: 'listStyle', title: tn('Stile di liste, morsettiere e disegni'), keys: ['reportStyles', 'stripStyle', 'drawingStyles', 'listTextScale'], free: true, render: () => <ListStyleDialog /> },
    { id: 'customLists', title: tn('Liste personalizzate'), free: true, render: () => <CustomListsDialog /> },
  ],
};

const TREE: SettingsBranch[] = [PROFILE_BRANCH, ...SETTINGS_TREE.map(b => ({ ...b, leaves: [...b.leaves, ...(EXTRA_LEAVES[b.id] ?? [])] })), APP_BRANCH];
const ALL_BRANCHES = TREE.map(b => b.id);

/** La pagina ha valori diversi dai predefiniti */
function changed(s: ProjectSettings, keys: (keyof ProjectSettings)[] | undefined): boolean {
  return !!keys?.some(k => JSON.stringify(s[k] ?? null) !== JSON.stringify(DEFAULT_SETTINGS[k] ?? null));
}
const defaultsOf = (keys: (keyof ProjectSettings)[]) => Object.fromEntries(keys.map(k => [k, DEFAULT_SETTINGS[k]])) as Partial<ProjectSettings>;
const ALL_KEYS = [...new Set(TREE.filter(b => !b.free).flatMap(b => b.leaves.flatMap(l => l.keys ?? [])))];

/** Una pagina dell'albero: tabella delle proprietà (o contenuto libero per il ramo Programma) */
function LeafBody({ branch, leaf }: { branch: SettingsBranch; leaf: SettingsBranch['leaves'][number] }) {
  return branch.free || leaf.free
    ? <div className="settings-free"><Embedded.Provider value>{leaf.render()}</Embedded.Provider></div>
    : <table className="prop-table"><tbody className="settings-sec">{leaf.render()}<SettingsDatalists /></tbody></table>;
}

/** Pagina da mostrare alla prossima apertura (openSettingsAt) */
let pendingLeaf: string | undefined;

/** Apre le impostazioni su una pagina dell'albero (es. 'shortcuts' dal menu Aiuto) */
export function openSettingsAt(leaf: string) {
  pendingLeaf = leaf;
  useStore.getState().setDialog('settings');
}

export function SettingsDialog() {
  const open = useStore(s => s.dialog === 'settings');
  const s = settingsOf(useStore(s => s.project));
  const lockedIds = s.locks?.parts ?? [];
  const st = useStore.getState;
  // A ogni apertura l'albero parte tutto chiuso, senza pagina scelta (o sulla pagina chiesta da openSettingsAt)
  const [leafId, setLeafId] = useState('');
  const [closed, setClosed] = useState<string[]>(ALL_BRANCHES);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    const id = pendingLeaf ?? '';
    pendingLeaf = undefined;
    setLeafId(id);
    setQ('');
    // Il ramo della pagina chiesta si apre
    const b = TREE.find(x => x.leaves.some(l => l.id === id));
    setClosed(ALL_BRANCHES.filter(x => x !== b?.id));
  }, [open]);
  if (!open) return null;
  const branch = TREE.find(b => b.leaves.some(l => l.id === leafId));
  const leaf = branch?.leaves.find(l => l.id === leafId);
  const reset = async () => {
    const r = await askChoice(tx('Valori predefiniti'), tx('Rimettere tutte le impostazioni del progetto ai valori predefiniti?'), [tx('Valori predefiniti'), tx('Annulla')]);
    if (r !== 0) return;
    st().updateSettings({ ...defaultsOf(ALL_KEYS), ...DEFAULT_SETTINGS });
  };
  const resetLeaf = async () => {
    if (!leaf) return;
    const r = await askChoice(tx('Valori predefiniti'), tx('Rimettere ai valori predefiniti le impostazioni di «{0}»?', tx(leaf.title)), [tx('Valori predefiniti'), tx('Annulla')]);
    if (r === 0 && leaf.keys) st().updateSettings(defaultsOf(leaf.keys));
  };
  const toggle = (id: string) => setClosed(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  const searching = !!q.trim();
  // Nella ricerca: tutte le pagine del progetto filtrate per nome, più quelle del Programma con il titolo che corrisponde
  const found = searching ? TREE.flatMap(b => b.leaves.filter(l => !(b.free || l.free) || settingsMatch(`${b.title} ${l.title}`, q)).map(l => ({ b, l }))) : [];
  return (
    <div className="modal-back" onMouseDown={() => st().setDialog(null)}>
      <div className="modal wide settings" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Impostazioni del progetto')}>
        <h3>{tx('Impostazioni del progetto')}</h3>
        <div className="settings-top">
          <input type="search" className="settings-search-box" value={q} placeholder={tx('Cerca un\'impostazione…')} onChange={e => setQ(e.target.value)} autoFocus />
          <span className="small muted">{tx('Ogni modifica vale subito e si salva con il progetto.')}</span>
        </div>
        <div className="settings-layout">
          <nav className="settings-tree" aria-label={tx('Gruppi di impostazioni')}>
            {TREE.map(b => {
              const isOpen = !closed.includes(b.id);
              return (
                <div key={b.id} className="settings-branch">
                  <button type="button" className="settings-branch-head" aria-expanded={isOpen} onClick={() => toggle(b.id)}>
                    <span className="settings-caret">{isOpen ? '▾' : '▸'}</span>{tx(b.title)}
                  </button>
                  {isOpen && b.leaves.map(l => (
                    <button type="button" key={l.id} className={`settings-leaf${!searching && l.id === leaf?.id ? ' active' : ''}`}
                      onClick={() => { setLeafId(l.id); setQ(''); }}>
                      {tx(l.title)}{lockedIds.includes(l.id) && <span className="settings-lock" title={tx('Bloccato dal profilo «{0}»', s.locks?.profile ?? '')}>🔒</span>}
                      {changed(s, l.keys) && <span className="settings-dot" title={tx('Valori diversi dai predefiniti')}>●</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className={`settings-body${searching ? ' settings-search' : ''}`}>
            {searching ? (
              <SettingsFilter.Provider value={q}>
                {found.map(({ b, l }) => (
                  <section key={l.id} className="settings-found">
                    <button type="button" className="settings-crumb" onClick={() => { setLeafId(l.id); setQ(''); }}>{tx(b.title)} ▸ {tx(l.title)}</button>
                    <LeafBody branch={b} leaf={l} />
                  </section>
                ))}
                <p className="small muted settings-none">{tx('Nessuna impostazione con questo nome.')}</p>
              </SettingsFilter.Provider>
            ) : !branch || !leaf ? (
              <p className="muted settings-hint">{tx('Apri un gruppo a sinistra e scegli una voce. Con la casella di ricerca trovi un\'impostazione per nome.')}</p>
            ) : (
              <>
                <div className="settings-leaf-head">
                  <span className="small muted">{tx(branch.title)} ▸ </span><b>{tx(leaf.title)}</b>
                  {leaf.keys && <button className="settings-leaf-reset" disabled={!changed(s, leaf.keys) || lockedIds.includes(leaf.id)} onClick={() => void resetLeaf()}
                    title={tx('Rimette ai valori predefiniti solo le impostazioni di questa pagina')}>{tx('Valori predefiniti di questa pagina')}</button>}
                </div>
                <LeafBody branch={branch} leaf={leaf} />
              </>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={() => void reset()}>{tx('Tutti i valori predefiniti…')}</button>
          <button className="primary" onClick={() => st().setDialog(null)}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}
