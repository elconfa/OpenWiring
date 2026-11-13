// Editor delle proprietà a due colonne (Proprietà | Valore), come in FreeCAD.
import { contactPlaceOf, type ContactPlace } from '../model/pairs';
import { zoneCodeOnly } from '../model/leaders';
import { openSettingsAt } from './SettingsDialog';
import { netSequence, sequenceContext, SEQ_MODE_NAMES } from '../model/wiringOrder';
import { editWireOrder } from './wireOrderDialog';
import { ROTS, allowedRots } from '../model/rotations';
import { useFullPart } from './partsDbSync';
import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isListPage } from '../model/lists';
import { useStore, type UserPropTarget } from '../model/store';
import type { SymbolInstance, Wire, TextItem, ProjectInfo, DeviceField, IoKind, CableLine, CableLineShow, Zone, ImageItem, WireDef, ItemLook } from '../model/types';
import { cableStyleOf, lineShow, CABLE_SHOW_KEYS, CABLE_LABEL_POS, CABLE_COND_DIR, shieldDims } from '../model/cableStyle';
import { PANEL_KINDS, PIN_OWN_FIELDS, AUX_OWN_FIELDS } from '../model/types';
import { cableByPiece, cableInfos, cableSection, conductorsFor, conductorEnds, markingOf, partConductors, pinDeviceOptions } from '../model/cables';
import { useBundleData, BundleTapsTable, BundleConductorChips } from './BundleTapsTable';
import { ConductorPicker } from './ConductorPicker';
import { PiecesSelect } from './CablesView';
import { ConductorSwatch } from './CablesView';
import { PROTOCOLS, protocolLabel, GENERIC_BUS, networkLinks, panelLabel, panelAncestors, devicePanels, BUS_CABLE_TYPES, IP_PROTOCOLS, busCableGroups, nodeIp, isIp, netmask, parseIp, networkOfIp } from '../model/network';
import { LANGS } from '../model/i18n';
import type { Lang, TerminalTextDir, ExtraPart, Part, UserPropAssign, RailSetting } from '../model/types';
import { railOf, PLC_ROW_DEFAULT } from '../model/fixedPos';
import { activeDefs } from '../model/userProps';
import { pinCount, connectorRows } from '../model/connectors';
import { compareWithFile, newFromTemplate, saveAsTemplate, addPlace, renumberDevices, renumberWires } from './actions';
import { openFiles } from '../io/fileio';
import { wirePasses, defaultWirePass, computeNetlist } from '../model/netlist';
import { titleBlockTemplates, templateFor } from '../model/titleBlocks';
import { wireDefCrossings } from '../model/wireDefs';
import { SHEET_SIZES, SHEET_DEFAULT, sheetOf, type SheetSize, type SheetSettings } from '../model/types';
import { LINE_WIDTHS, LOOK_COLORS, LOOK_FONTS, type LineWidthKey, type LookColorKey, type LookFont, type LookSettings } from '../model/types';
import { WIRE_COLORS, WIRE_SECTIONS, WIRE_LINE_TYPES, WIRE_WIDTHS, WIRE_WIDTH_DEFAULT, TEXT_STYLES, textStylesOf, type WireLineType, type TextStyleKey } from '../model/types';
import { FORMAT_LABELS, cardType, cardByTag, usedChannels, channelsOf, channelAddress, sanitizeSymbol, defaultSymbol, cardFormat } from '../model/plc';
import { getSymbol, snap } from '../model/geometry';
import { settingsOf, formatPattern } from '../model/numbering';
import { buildDevices, effectivePinLabels, deviceInfo, designation, partsIndex, stripOf, mergeTargets, locationOf, allPlaced, extraPartsText } from '../model/devices';
import { letterOfTag, nextTagFor } from '../model/numbering';
import { askChoice, askConfirm } from './Ask';
import { replaceImage, naturalRatio } from './images';
import { bundleTaps, isBundle, conductorChoices, bundleCable } from '../model/bundles';
import { linkChoices, currentLinkPartner, pairByName } from './linkChooser';
import { isIncomingLink, NO_PARTNER, WAITING } from '../model/links';
import { wireAtPotential, wireLabelShown, wireTooShort, type Derived } from '../model/derive';
import { terminalNo, parseTerminalNo, stripData, jumperOf, stripRows } from '../model/terminals';
import { formatRevisionIndex, nextRevisionIndex, REVISION_FORMATS } from '../model/revisions';
import { NoteField as RevisionNoteField } from './RevisionChangesView';
import type { RevisionFormat, ProjectSettings, PlcAddressFormat } from '../model/types';
import { partKeys } from '../model/settingsProfiles';
import { tx, tn } from '../i18n/ui';
import { symShown, withShow, type SymVisKey, type WireVisKey } from '../model/visibility';
import { groupConfig, groupMembers, firstFreeChannel } from '../model/plcGroup';
import { editRichText } from './RichTextEditor';

/** Editor completo del testo libero: le modifiche valgono con OK */
export async function openTextEditor(t: TextItem) {
  const r = await editRichText({ text: t.text, size: t.size, w: t.w, align: t.align });
  if (r) useStore.getState().updateElement(t.id, { text: r.text, size: r.size, w: r.w, align: r.align });
}

/** Verso dei testi dei morsetti di morsettiera */
const TERM_TEXT_DIRS: [TerminalTextDir, string][] = [['auto', tn('orizzontali')], ['parallel', tn('paralleli al morsetto')], ['perpendicular', tn('perpendicolari al morsetto')]];

/** Campo di testo che conferma il valore all'uscita o con Invio (una sola voce di annullamento) */
export function Field({ value, onCommit, list, placeholder, type = 'text', suggestion, wrap }: {
  /** false (anche asincrono) annulla la modifica e rimette il valore precedente */
  value: string; onCommit: (v: string) => unknown; list?: string; placeholder?: string; type?: string;
  /** Testo proposto (es. dall'articolo): con il doppio clic sul campo vuoto diventa il valore, da modificare */
  suggestion?: string;
  /** Testo lungo (descrizione, dati tecnici, note): va a capo e il campo cresce fino a 3 righe */
  wrap?: boolean;
}) {
  const [v, setV] = useState(value);
  const area = useRef<HTMLTextAreaElement>(null);
  // Altezza del campo a capo: quanto serve al testo, al massimo 3 righe (poi scorre)
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = el.offsetHeight - el.clientHeight;
    const max = (parseFloat(cs.lineHeight) || 16) * 3 + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border;
    const need = el.scrollHeight + border;
    el.style.height = `${Math.min(need, max)}px`;
    el.style.overflowY = need > max + 1 ? 'auto' : 'hidden';
  });
  // Modifica in corso, con la funzione dell'elemento che si stava modificando: cliccando altrove
  // (sullo schema, nell'albero) il pannello può cambiare elemento o sparire prima dell'uscita dal
  // campo, e la modifica va confermata lo stesso
  const pending = useRef<{ v: string; value: string; onCommit: (v: string) => unknown } | null>(null);
  const flush = () => {
    const q = pending.current;
    pending.current = null;
    if (q && q.v !== q.value) void Promise.resolve(q.onCommit(q.v)).then(r => { if (r === false) setV(q.value); });
  };
  useEffect(() => { flush(); setV(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (nv: string) => { setV(nv); pending.current = { v: nv, value: pending.current?.value ?? value, onCommit }; };
  if (wrap) return (
    <textarea ref={area} className="wrap-field" rows={1} value={v} placeholder={placeholder}
      title={suggestion && !v ? tx('Doppio clic per usare il testo dell\'articolo e modificarlo') : undefined}
      onDoubleClick={e => { if (suggestion && !v) { edit(suggestion); const el = e.currentTarget; setTimeout(() => el.select(), 0); } }}
      onChange={e => edit(e.target.value.replace(/\r?\n/g, ' '))} onBlur={flush}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
        if (e.key === 'Escape') { pending.current = null; setV(value); }
      }} />
  );
  return (
    <input type={type} value={v} list={list} placeholder={placeholder}
      title={suggestion && !v ? tx('Doppio clic per usare il testo dell\'articolo e modificarlo') : undefined}
      onDoubleClick={e => { if (suggestion && !v) { edit(suggestion); const el = e.currentTarget; setTimeout(() => el.select(), 0); } }}
      onChange={e => edit(e.target.value)} onBlur={flush}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { pending.current = null; setV(value); } }} />
  );
}

/** Testo cercato nelle impostazioni: si vedono solo le righe (o i gruppi) con il nome che lo contiene */
export const SettingsFilter = createContext('');
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const settingsMatch = (text: string, q: string) => fold(text).includes(fold(q.trim()));

/** Le righe sono di una parte bloccata da un profilo: i valori si vedono ma non si cambiano */
const SettingsLocked = createContext(false);

/** Parte delle impostazioni che un profilo aziendale può bloccare (vedi settingsProfiles.ts) */
export function Locked({ part, children }: { part: string; children: React.ReactNode }) {
  const lock = useStore(s => s.project.settings.locks);
  if (!lock?.parts.includes(part)) return <>{children}</>;
  return (
    <SettingsLocked.Provider value>
      <tr className="lock-row"><td colSpan={2}>🔒 {tx('Bloccato dal profilo «{0}»: si sblocca in Impostazioni ▸ Profili', lock.profile)}</td></tr>
      {children}
    </SettingsLocked.Provider>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const q = useContext(SettingsFilter);
  return (
    <>
      <tr className="prop-group"><td colSpan={2}>{title}</td></tr>
      {q && settingsMatch(title, q) ? <SettingsFilter.Provider value="">{children}</SettingsFilter.Provider> : children}
    </>
  );
}

/** Interruttore mostra/nascondi di una proprietà sullo schema */
export interface Vis { on: boolean; set: (on: boolean) => void }

function Row({ label, children, vis }: { label: string; children?: React.ReactNode; vis?: Vis }) {
  const q = useContext(SettingsFilter);
  const locked = useContext(SettingsLocked);
  if (q && !settingsMatch(label, q)) return null;
  const value = vis ? <div className="prop-vis"><div className="prop-vis-value">{children}</div><VisToggle {...vis} /></div> : children;
  return (
    <tr>
      <td className="prop-name">{label}</td>
      <td className="prop-value">{locked ? <fieldset disabled className="lock-fs">{value}</fieldset> : value}</td>
    </tr>
  );
}

/** Occhio accanto al valore: aperto = scritto sullo schema, barrato = solo nei dati e nelle liste */
function VisToggle({ on, set }: Vis) {
  return (
    <button type="button" className={`vis-toggle${on ? '' : ' off'}`} aria-pressed={on} onClick={() => set(!on)}
      title={on ? tx('Mostrato sullo schema: clic per nasconderlo') : tx('Nascosto sullo schema: clic per mostrarlo')}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
        <circle cx="8" cy="8" r="2" />
        {!on && <path d="M2.5 13.5l11-11" />}
      </svg>
    </button>
  );
}

/** Colonna dei nomi del pannello Proprietà: frazione della larghezza, regolabile e ricordata */
const NAME_W_PREF = 'elettrocad.propNameW';
const NAME_W_DEFAULT = 0.36;
const clampNameW = (f: number) => Math.min(0.6, Math.max(0.24, f));
const loadNameW = () => { try { const f = Number(localStorage.getItem(NAME_W_PREF)); return f > 0 ? clampNameW(f) : NAME_W_DEFAULT; } catch { return NAME_W_DEFAULT; } };

function useNameWidth() {
  const [nameW, setW] = useState(loadNameW);
  const setNameW = (f: number) => { const v = clampNameW(f); setW(v); try { localStorage.setItem(NAME_W_PREF, String(v)); } catch { /* solo comodità */ } };
  const startNameResize = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const table = (e.currentTarget as HTMLElement).closest('table');
    if (!table) return;
    const r = table.getBoundingClientRect();
    const move = (ev: MouseEvent) => setNameW((ev.clientX - r.left) / r.width);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('col-resizing'); };
    document.body.classList.add('col-resizing');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return { nameW, setNameW, startNameResize };
}

export function PropertyPanel({ derived }: { derived: Derived }) {
  const { nameW, setNameW, startNameResize } = useNameWidth();
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const selection = useStore(s => s.selection);
  const treeSel = useStore(s => s.treeSel);
  const highlight = useStore(s => s.highlight);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  const selected = page.elements.filter(e => selection.includes(e.id));

  let body: React.ReactNode;
  // Gruppo I/O PLC: tutti i canali selezionati appartengono allo stesso gruppo
  const gid = selected[0]?.kind === 'symbol' ? selected[0].plcGroup?.id : undefined;
  if (gid && selected.every(e => e.kind === 'symbol' && e.plcGroup?.id === gid)) {
    body = <PlcGroupProps gid={gid} />;
  } else if (selected.length > 1) {
    body = (
      <Group title={tx('{0} elementi selezionati', selected.length)}>
        <Row label={tx('Simboli')}>{selected.filter(e => e.kind === 'symbol').length}</Row>
        <Row label={tx('Fili')}>{selected.filter(e => e.kind === 'wire').length}</Row>
        {selected.some(e => e.kind === 'symbol') && <MultiSymbolRows insts={selected.filter((e): e is SymbolInstance => e.kind === 'symbol')} />}
        {selected.some(e => e.kind === 'wire') && <WireDataRows wires={selected.filter((e): e is Wire => e.kind === 'wire')} withNumber />}
        <Row label={tx('Azioni')}>
          <button onClick={() => st().rotateSelection()}>{tx('Ruota')}</button>{' '}
          <button onClick={() => st().deleteSelection()}>{tx('Elimina')}</button>
        </Row>
      </Group>
    );
  } else if (selected.length === 1 && selected[0].kind === 'symbol') {
    body = <SymbolProps inst={selected[0]} />;
  } else if (selected.length === 1 && selected[0].kind === 'wire' && isBundle(selected[0])) {
    body = <BundleProps wire={selected[0]} />;
  } else if (selected.length === 1 && selected[0].kind === 'wire') {
    const w = selected[0] as Wire;
    const net = derived.netlist.wireNet.get(w.id);
    body = (
      <Group title={tx('Collegamento')}>
        <Row label={tx('Numero filo')} vis={wireVis([w], 'number')}>
          <Field value={net?.wireNo ?? ''} placeholder={tx('automatico')}
            onCommit={v => st().setWireNumber(w.id, v.trim())} />
        </Row>
        {wireTooShort(w, settingsOf(project)) && w.show?.number === undefined && settingsOf(project).showWireNumbers && (
          <Row label="">
            <span className="muted small">{tx('Numero nascosto: filo più corto di {0} mm (Impostazioni ▸ Numeri filo). Accendi l\'occhio per mostrarlo su questo filo.', String(settingsOf(project).wireNoMinLength).replace('.', ','))}</span>
          </Row>
        )}
        <Row label={tx('Rete')}>{net?.name ?? '—'}{net?.links?.length ? tx(' (numero dal rimando)') : net?.wires.some(x => x.wire.number) ? tx(' (numero manuale)') : ''}</Row>
        <Row label={tx('Collega')}>{net?.pins.map(p => `-${p.ref}`).join(', ') || '—'}</Row>
        <Row label={tx('Potenziale')}>
          {highlight === w.id
            ? <button onClick={() => st().setHighlight(null)}>{tx('Togli evidenziazione')}</button>
            : <button onClick={() => st().setHighlight(w.id)} title={tx('Evidenzia tutti i conduttori collegati, su tutte le pagine (anche oltre rimandi e morsetti)')}>{tx('Evidenzia su tutte le pagine')}</button>}
        </Row>
        {page.type === 'singleline' && (
          <>
            <Row label={tx('Conduttori (trattini)')}>
              <select value={w.poles ?? ''} onChange={e => st().setWireProps([w.id], { poles: e.target.value ? parseInt(e.target.value, 10) : undefined })}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Row>
            <Row label={tx('Testo della linea')}><Field value={w.text ?? ''} placeholder={tx('es. 3/N/PE ~400 V 50 Hz')} onCommit={v => st().setWireProps([w.id], { text: v.trim() || undefined })} /></Row>
          </>
        )}
        <TapRows wire={w} />
        <UserPropRows assign="connection" values={w.userProps} target={{ kind: 'wire', wireId: w.id }} />
        <Row label={tx('Rete / bus')}>
          <select value={w.bus ?? ''} onChange={e => st().setWireProps([w.id], { bus: e.target.value || undefined }, true)}>
            <option value="">{tx('— filo elettrico —')}</option>
            {PROTOCOLS.map(p => <option key={p.name} value={p.name}>{protocolLabel(p.name)}</option>)}
            {w.bus && !PROTOCOLS.some(p => p.name === w.bus) && <option value={w.bus}>{w.bus}</option>}
          </select>
        </Row>
        {w.bus && <BusCableRows wire={w} tagShown={derived.cableTagShown.has(w.id)} />}
        <WireDataRows wires={[w]} />
        <Row label={tx('Vertici')}>{w.points.length}</Row>
      </Group>
    );
  } else if (selected.length === 1 && selected[0].kind === 'zone') {
    body = <ZoneProps zone={selected[0]} />;
  } else if (selected.length === 1 && selected[0].kind === 'image') {
    body = <ImageProps img={selected[0]} />;
  } else if (selected.length === 1 && selected[0].kind === 'cable') {
    body = <CableProps line={selected[0]} derived={derived} />;
  } else if (selected.length === 1 && selected[0].kind === 'wiredef') {
    body = <WireDefProps d={selected[0]} />;
  } else if (selected.length === 1 && selected[0].kind === 'text') {
    const t = selected[0] as TextItem;
    body = (
      <Group title={tx('Testo')}>
        <Row label={tx('Testo')}>
          <span className="text-edit-row">
            {/* Testo su più righe: si modifica solo nell'editor (il campo a una riga perderebbe gli a capo) */}
            {t.text.includes('\n')
              ? <span className="text-preview" title={t.text}>{t.text.split('\n')[0]} …</span>
              : <Field value={t.text} onCommit={v => st().updateElement(t.id, { text: v })} />}
            <button title={tx('Apre l\'editor del testo: righe a capo, grassetto, corsivo, elenchi…')} onClick={() => void openTextEditor(t)}>…</button>
          </span>
        </Row>
        <Row label={tx('Allineamento')}>
          <select value={t.align ?? 'start'} onChange={e => st().updateElement(t.id, { align: e.target.value === 'start' ? undefined : e.target.value as TextItem['align'] })}>
            <option value="start">{tx('a sinistra')}</option><option value="middle">{tx('al centro')}</option><option value="end">{tx('a destra')}</option>
          </select>
        </Row>
        <Row label={tx('Altezza (mm)')}><Field type="number" value={String(t.size)} onCommit={v => st().updateElement(t.id, { size: parseFloat(v) || 3 })} /></Row>
        <Row label={tx('Larghezza riquadro (mm)')}>
          <Field type="number" value={t.w ? String(t.w) : ''} placeholder={tx('una riga')}
            onCommit={v => { const n = parseFloat(v.replace(',', '.')); st().updateElement(t.id, { w: n > 0 ? n : undefined }); }} />
        </Row>
      </Group>
    );
  } else if (treeSel.type === 'device') {
    const d = buildDevices(project).get(treeSel.tag);
    const info = d ? deviceInfo(d.elements, d.main, partsIndex(project, library)) : undefined;
    body = d && info ? (
      <Group title={tx('Dispositivo {0}', designation(d.tag, info.func, info.loc))}>
        <Row label={tx('Descrizione')}>{info.description ?? '—'}</Row>
        <Row label={tx('Dati tecnici')}>{info.techData ?? '—'}</Row>
        <Row label={tx('Costruttore')}>{info.manufacturer ?? '—'}</Row>
        <Row label={tx('Tipo')}>{info.typeNr ?? '—'}</Row>
        <Row label={tx('Codice ordinazione')}>{info.orderNr ?? '—'}</Row>
        <Row label={tx('Articolo')}>{info.partNr ?? '—'}</Row>
        <Row label={tx('Note')}>{info.note ?? '—'}</Row>
        <Row label={tx('Elementi')}>{d.elements.map(e => `${e.sym.name} (${e.page.name})`).join(', ')}</Row>
      </Group>
    ) : null;
  } else {
    body = (
      <>
        <PageProps />
        <ProjectProps />
      </>
    );
  }

  return (
    <div className="props props-main" style={{ '--prop-name-w': `${nameW * 100}%` } as React.CSSProperties}>
      <table className="prop-table">
        <thead><tr>
          <th className="prop-name-th">{tx('Proprietà')}
            <span className="col-resize" onMouseDown={startNameResize} onDoubleClick={() => setNameW(NAME_W_DEFAULT)}
              title={tx('Trascina per allargare o stringere la colonna dei nomi; doppio clic per tornare alla larghezza normale')} />
          </th>
          <th>{tx('Valore')}</th>
        </tr></thead>
        <tbody>
          {body}
          {/* Revisione aperta: nota della modifica di questo elemento (scritta accanto alla nuvoletta) */}
          {project.revisionState === 'review' && selected.length === 1 && (
            <Group title={tx('Revisione {0}', nextRevisionIndex(project))}>
              <Row label={tx('Nota della modifica')}><RevisionNoteField k={`${page.id}:${selected[0].id}`} /></Row>
            </Group>
          )}
        </tbody>
      </table>
      <datalist id="wire-sections">{WIRE_SECTIONS.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="wire-types">{['H07V-K', 'H05V-K', 'FS17', 'N07V-K', 'N1VV-K', 'FG16R16', 'FG16OR16'].map(c => <option key={c} value={c} />)}</datalist>
    </div>
  );
}

function SymbolProps({ inst }: { inst: SymbolInstance }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const sym = getSymbol(inst.symbolId, project);
  if (!sym) return null;
  const labels = effectivePinLabels(project).get(inst.id) ?? {};
  const devices = buildDevices(project);
  // Sigle proposte: dispositivi con la stessa lettera (es. per un contatto le bobine K)
  // Un nodo di rete può rappresentare qualunque dispositivo (azionamento, I/O remoto, pannello…)
  const instPage = project.pages.find(pg => pg.elements.some(e => e.id === inst.id)) ?? project.pages[0];
  const isNet = sym.role === 'potential' || sym.role === 'link';
  // Rimandi e potenziali: i nomi degli altri rimandi (prima i liberi da abbinare) o potenziali
  const tags: { value: string; label?: string }[] = isNet
    ? [...(sym.role === 'link' ? linkChoices(inst.id).free.map(e => ({ value: e.inst.tag, label: `/${locationOf(e)}${e.page.title ? ` · ${e.page.title}` : ''}` })) : []),
      ...[...new Set(allPlaced(project).filter(e => e.sym.role === sym.role && e.inst.id !== inst.id).map(e => e.inst.tag))].map(t => ({ value: t }))]
      .filter((x, i, a) => x.value && a.findIndex(y => y.value === x.value) === i)
    : [...devices.keys()].filter(t => !sym.letter || sym.role === 'netnode' || letterOfTag(t, instPage.name) === sym.letter).map(t => ({ value: t, label: devices.get(t)?.main?.inst.description }));
  const parts = partsIndex(project, library);
  const isPlc = sym.role === 'plc';
  const upd = (patch: Partial<SymbolInstance>) => st().updateElement(inst.id, patch);
  // Sigla di un altro dispositivo già nello schema: si chiede se unirli (con i rimandi) o usare una sigla libera
  const commitTag = async (raw: string): Promise<boolean> => {
    const tag = raw.replace(/^-/, '').trim();
    // Rappresentazione: la sigla è quella del contatto vero, si cambia lì
    if (inst.pairOf) { st().updateInstance(inst.pairOf, { tag }); return true; }
    // Rimando: il nome cambia anche sul corrispondente
    if (sym.role === 'link') {
      // Nome di un solo rimando libero dell'altro verso: se questo non è ancora abbinato, li collega
      if (!pairByName(inst.id, tag)) st().updateInstance(inst.id, { tag });
      return true;
    }
    const targets = mergeTargets(project, inst.id, tag);
    if (!targets.length) { upd({ tag }); return true; }
    const page = project.pages.find(pg => pg.elements.some(e => e.id === inst.id)) ?? project.pages[0];
    const free = nextTagFor(project, letterOfTag(tag, page.name) ?? sym.letter, page, inst.x);
    const list = targets.slice(0, 4).map(x => `${tx(x.sym.name)} (/${locationOf(x)})`).join(', ') + (targets.length > 4 ? ' …' : '');
    const choice = await askChoice(tx('La sigla -{0} è già usata', tag),
      tx('Nello schema c\'è già -{0}: {1}.\nUnendo i componenti diventano un unico apparecchio: i contatti mostrano il rimando alla bobina e la bobina l\'elenco dei contatti. Descrizione e articolo restano quelli del componente esistente.', tag, list),
      [tx('Unisci a -{0}', tag), ...(free && free !== tag ? [tx('Usa -{0}', free)] : []), tx('Annulla')]);
    if (choice === 0) { st().mergeIntoDevice(inst.id, tag); return true; }
    if (choice === 1 && free && free !== tag) { upd({ tag: free }); return true; }
    return false;
  };
  // I dati del dispositivo valgono per bobina e contatti insieme
  // Pin di connettore: descrizione e dati tecnici sono del pin, il resto è del connettore.
  // Contatto ausiliario con la bobina nello schema: la descrizione è del contatto, articolo e codici
  // sono del dispositivo e si modificano dalla bobina
  const dMain = devices.get(inst.tag)?.main;
  const auxOfMain = sym.role === 'aux' && !!dMain && dMain.inst.id !== inst.id;
  const pinOwn = (k: string) => (sym.role === 'pin' && PIN_OWN_FIELDS.includes(k as DeviceField)) || (auxOfMain && AUX_OWN_FIELDS.includes(k as DeviceField));
  const dev = (patch: Partial<Pick<SymbolInstance, DeviceField>>) => {
    const own = Object.fromEntries(Object.entries(patch).filter(([k]) => pinOwn(k)));
    const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !pinOwn(k)));
    if (Object.keys(own).length) upd(own);
    if (Object.keys(rest).length) st().updateDevice(inst.id, rest);
  };
  const d = devices.get(sym.role === 'terminal' || sym.role === 'pin' ? stripOf(inst.tag) : inst.tag);
  const info = sym.role === 'terminal' || !d
    ? deviceInfo([{ inst }], { inst }, parts)
    : deviceInfo(d.elements, d.main, parts);
  const part = info.part;
  // Valore proprio del dispositivo (modificabile); quello dell'articolo compare in grigio come suggerimento
  const ownOf = (k: DeviceField) => {
    const els = sym.role === 'terminal' || !d || pinOwn(k) ? [{ inst }] : d.elements;
    const v = els.map(e => e.inst[k]).find(x => x !== undefined && x !== '');
    return v === undefined ? '' : String(v);
  };
  const devField = (k: 'description' | 'techData' | 'manufacturer' | 'typeNr' | 'orderNr' | 'note' | 'func' | 'loc', fromPart?: string, placeholder?: string) => (
    <Field value={ownOf(k)} placeholder={fromPart ? tx('{0} (articolo)', fromPart) : placeholder} suggestion={fromPart} list={k === 'manufacturer' ? 'manufacturers-list' : undefined}
      wrap={k === 'description' || k === 'techData' || k === 'note'}
      onCommit={v => dev({ [k]: v.trim() || undefined })} />
  );
  // Spostamento con i fili collegati che seguono, come col trascinamento
  const moveTo = (x: number, y: number) => {
    const sel = st().selection;
    st().setSelection([inst.id]);
    st().moveSelection(x - inst.x, y - inst.y);
    st().setSelection(sel);
  };
  const showTexts = ownOf('showTexts');
  // Proprietà sullo schema: per i dispositivi valgono per tutti i loro elementi (bobina e contatti);
  // per rimandi, potenziali, morsetti e punti PLC solo per il simbolo
  const perInst = isNet || isPlc || sym.role === 'terminal' || sym.role === 'pin' || !d;
  const showMap = perInst ? inst.show : info.show;
  const headSym = d?.main?.sym ?? sym;
  const vis = (k: SymVisKey): Vis => ({
    on: symShown(showMap, k, { showTexts: info.showTexts, settings: settingsOf(project), sym: headSym }),
    set: on => perInst ? upd({ show: withShow(inst.show, k, on) }) : dev({ show: withShow(info.show, k, on) }),
  });
  const devVis = (k: SymVisKey) => (sym.role === 'terminal' ? undefined : vis(k));
  // Luogo che il dispositivo prende senza indicarlo (dal riquadro nello schema di rete o dalla pagina)
  const autoLoc = project.panels?.length ? devicePanels({ ...project, pages: project.pages.map(pg => ({ ...pg, elements: pg.elements.map(e => (e.kind === 'symbol' && e.tag === inst.tag ? { ...e, loc: undefined } : e)) })) }).get(inst.tag) : undefined;
  return (
    <>
      <Group title={tx(sym.name)}>
        <Row label={isNet ? tx('Nome') : sym.role === 'terminal' ? tx('Morsetto (X1:1, X1:1A)') : tx('Sigla (DT)')} vis={vis('tag')}>
          <span className="tag-input">{!isNet && <span className="dash">-</span>}
            <Field value={inst.tag} list="tags-list" onCommit={commitTag} />
          </span>
          <datalist id="tags-list">{tags.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</datalist>
        </Row>
        {sym.role === 'link' && <LinkPartnerRow instId={inst.id} vis={vis('refs')} />}
        {inst.pairOf && <PairRow inst={inst} />}
        {!inst.pairOf && sym.role === 'aux' && <ContactPlaceRow realId={inst.id} />}
        {(sym.role === 'main' || sym.role === 'aux' || sym.role === 'oneline') && <Row label={tx('Riferimenti incrociati')} vis={vis('xref')} />}
        {sym.role === 'main' && (
          <Row label={tx('Immagine dei contatti')}>
            <select value={inst.contactImage ?? ''} title={tx('Si può anche trascinare sullo schema; tasto destro ▸ Testi nella posizione del simbolo la rimette al suo posto')}
              onChange={e => upd({ contactImage: (e.target.value || undefined) as SymbolInstance['contactImage'] })}>
              <option value="">{tx('come il progetto')}</option>
              <option value="bottom">{tx('in fondo alla pagina')}</option>
              <option value="symbol">{tx('sotto il simbolo')}</option>
            </select>
          </Row>
        )}
        <Row label={tx('Ruolo')}>{tx(({ main: tn('Principale (riferimenti incrociati)'), aux: tn('Contatto secondario'), single: tn('Dispositivo'), potential: tn('Potenziale'), link: tn('Rimando'), terminal: tn('Morsetto'), plc: tn('Punto I/O PLC'), pin: tn('Pin di connettore'), netnode: tn('Nodo di rete'), oneline: tn('Unifilare (rappresentazione)') } as const)[sym.role])}</Row>
      </Group>
      {sym.role === 'terminal' && inst.tag.includes(':') && <TerminalProps inst={inst} />}
      {sym.role === 'netnode' && <NetNodeProps inst={inst} vis={vis('netAddress')} />}
      {sym.role === 'pin' && inst.tag.includes(':') && <ConnectorProps inst={inst} />}
      {isPlc && sym.io && <PlcProps inst={inst} io={sym.io} vis={vis} />}
      {isPlc && !sym.io && <PlcPowerProps inst={inst} />}
      {!isNet && !isPlc && (
        <Group title={sym.role === 'terminal' ? tx('Dati del morsetto') : tx('Dispositivo {0}', designation(inst.tag, info.func, info.loc))}>
          <Row label={auxOfMain ? tx('Descrizione del contatto') : tx('Descrizione')} vis={devVis('description')}>
            {auxOfMain ? devField('description', undefined, info.description ? tx('{0} (dispositivo)', info.description) : '') : devField('description', part?.descr1)}
          </Row>
          <Row label={tx('Dati tecnici')} vis={devVis('techData')}>{devField('techData', part?.descr2, 'es. 24 V DC, 2,2 kW')}</Row>
          {sym.role !== 'terminal' && <Row label={tx('Funzione (=)')} vis={vis('func')}>{devField('func', undefined, 'es. A1')}</Row>}
          {sym.role !== 'terminal' && (
            <Row label={tx('Luogo (+)')} vis={vis('loc')}>
              {project.panels?.length ? (
                <select value={ownOf('loc')} onChange={e => dev({ loc: e.target.value || undefined })}>
                  <option value="">{tx('automatico{0}', autoLoc ? ` (${panelLabel(autoLoc)})` : '')}</option>
                  {project.panels.map(p => <option key={p.id} value={p.code}>{panelLabel(p)}</option>)}
                  {ownOf('loc') && !project.panels.some(p => p.code === ownOf('loc')) && <option value={ownOf('loc')}>+{ownOf('loc')} {tx('(non definito)')}</option>}
                </select>
              ) : devField('loc', undefined, 'es. QE, BM, P1')}
            </Row>
          )}
          <Row label={tx('Note')} vis={devVis('note')}>{devField('note')}</Row>
          {sym.role !== 'terminal' && (
            <Row label={tx('Descrizione e dati tecnici')}>
              <select value={showTexts} onChange={e => dev({ showTexts: e.target.value === '' ? undefined : e.target.value === 'true' })}>
                <option value="">{tx('come da progetto')}</option>
                <option value="true">{tx('mostra')}</option>
                <option value="false">{tx('nascondi')}</option>
              </select>
            </Row>
          )}
        </Group>
      )}
      {!isNet && !isPlc && auxOfMain && (
        <Group title={tx('Ordinazione')}>
          {/* Contatto: articolo e codici sono quelli del dispositivo, si vedono ma si cambiano dalla bobina */}
          <Row label={tx('Articolo')} vis={devVis('partNr')}><span className={info.partNr ? undefined : 'muted'}>{info.partNr ?? '—'}</span></Row>
          <Row label={tx('Costruttore')} vis={devVis('manufacturer')}><span>{info.manufacturer ?? ''}</span></Row>
          <Row label={tx('Tipo')} vis={devVis('typeNr')}><span>{info.typeNr ?? ''}</span></Row>
          <Row label={tx('Codice ordinazione')} vis={devVis('orderNr')}><span>{info.orderNr ?? ''}</span></Row>
          {!!info.extraParts?.length && <Row label={tx('Articoli aggiuntivi')}><span>{extraPartsText(info.extraParts)}</span></Row>}
          <Row label="">
            <span className="small muted">{tx('Si modificano dall\'elemento principale')} </span>
            <button className="mini" onClick={() => { const pg = project.pages.find(x => x.elements.some(e => e.id === dMain!.inst.id)); if (pg) st().setPage(pg.id); st().setSelection([dMain!.inst.id]); }}>
              {tx('Vai a -{0}', inst.tag)}
            </button>
          </Row>
        </Group>
      )}
      {!isNet && !isPlc && !auxOfMain && (
        <Group title={tx('Ordinazione')}>
          <Row label={tx('Articolo')} vis={devVis('partNr')}>
            <PartInput listId="device-parts" value={info.partNr ?? ''} parts={parts} onCommit={v => st().assignPart([inst.id], v)} />
          </Row>
          {(['manufacturer', 'typeNr', 'orderNr', 'techData'] as const).some(k => ownOf(k)) && (
            <Row label="">
              {part
                ? <button className="mini" title={tx('Costruttore, tipo, codice ordine e dati tecnici scritti qui diventano i dati dell\'articolo {0} nella libreria, per i prossimi progetti', part.partNr)}
                  onClick={() => st().storeDeviceInPart(inst.id)}>{tx('Salva questi dati nell\'articolo')}</button>
                : <span className="small muted">{tx('Scrivi un codice in Articolo: questi dati vanno nella libreria e al prossimo uso si compilano da soli')}</span>}
            </Row>
          )}
          {!!part?.functionTemplates?.length && sym.role !== 'terminal' && (
            <Row label={tx('Morsetti')}>
              <button className="mini" title={tx('Bobina, poli e contatti del dispositivo -{0} prendono i morsetti del modello funzione dell\'articolo (si annulla con Annulla)', inst.tag)}
                onClick={() => st().pinsFromArticles([inst.tag])}>{tx('Morsetti dall\'articolo')}</button>
            </Row>
          )}
          <Row label={tx('Costruttore')} vis={devVis('manufacturer')}>{devField('manufacturer', part?.manufacturer)}<ManufacturersList parts={parts} /></Row>
          <Row label={tx('Tipo')} vis={devVis('typeNr')}>{devField('typeNr', part?.typeNr)}</Row>
          <Row label={tx('Codice ordinazione')} vis={devVis('orderNr')}>{devField('orderNr', part?.orderNr)}</Row>
          {sym.role !== 'terminal' && <ExtraPartsRows instId={inst.id} list={info.extraParts ?? []} parts={parts} />}
          {part?.picture && <tr><td colSpan={2} className="prop-img"><img src={part.picture} alt={part.typeNr ?? part.partNr} /></td></tr>}
          {/* Proprietà definite dall'utente dell'articolo: valgono per l'articolo in libreria */}
          {part && <PartUserPropRows part={part} />}
        </Group>
      )}
      {!isNet && !isPlc && <UserPropGroup assign="function" values={info.userProps} target={{ kind: 'device', instId: inst.id }} />}
      {!isNet && !isPlc && sym.role !== 'terminal' && sym.role !== 'pin' && (
        <Group title={tx('Punti di connessione')}>
          <Row label={tx('Designazioni sullo schema')} vis={vis('pins')} />
          {sym.role === 'aux' && sym.contact !== 'power' && (
            <Row label={tx('Numerazione auto')}>
              <input type="checkbox" checked={inst.autoPins} onChange={e => upd({ autoPins: e.target.checked, pinLabels: e.target.checked ? {} : { ...labels } })} />
            </Row>
          )}
          {sym.pins.map(p => (
            <Row key={p.id} label={tx('Morsetto {0}', p.id)}>
              {inst.autoPins && sym.role === 'aux' && sym.contact !== 'power'
                ? <span className="muted">{labels[p.id]}</span>
                : <Field value={labels[p.id] ?? ''} onCommit={v => upd({ pinLabels: { ...inst.pinLabels, [p.id]: v } })} />}
            </Row>
          ))}
        </Group>
      )}
      <Group title={tx('Posizione')}>
        <Row label={tx('X (mm)')}><Field type="number" value={String(inst.x)} onCommit={v => moveTo(snap(parseFloat(v) || 0), inst.y)} /></Row>
        <Row label={tx('Y (mm)')}><Field type="number" value={String(inst.y)} onCommit={v => moveTo(inst.x, snap(parseFloat(v) || 0))} /></Row>
        <Row label={tx('Rotazione')}>
          {/* Solo le rotazioni ammesse dal simbolo (come il tasto R); quella attuale resta visibile anche se non lo è */}
          <select value={inst.rot} onChange={e => st().rotateTo([inst.id], parseInt(e.target.value, 10) as SymbolInstance['rot'])}>
            {ROTS.filter(r => allowedRots(sym).includes(r) || r === inst.rot).map(r => <option key={r} value={r}>{allowedRots(sym).includes(r) ? `${r}°` : tx('{0}° (non ammessa dal simbolo)', r)}</option>)}
          </select>
        </Row>
        <Row label={tx('Specchiato')}><input type="checkbox" checked={!!inst.mirror} disabled={!!sym?.noMirror && !inst.mirror} title={sym?.noMirror ? tx('Il simbolo non si specchia (editor dei simboli)') : undefined} onChange={e => upd({ mirror: e.target.checked })} /></Row>
      </Group>
      {sym && sym.pins.length >= 2 && sym.role !== 'potential' && sym.role !== 'link' && (
        <Group title={tx('Numero filo')}>
          <Row label={tx('Il numero filo passa')}>
            <input type="checkbox" checked={wirePasses({ inst, sym })}
              title={tx('Spuntato: i fili ai morsetti di questo elemento hanno lo stesso numero (come per un morsetto di passaggio). Tolto: il filo cambia numero.')}
              onChange={e => upd({ wirePass: e.target.checked === defaultWirePass(sym) ? undefined : e.target.checked })} />
          </Row>
        </Group>
      )}
    </>
  );
}

/**
 * Colore e spessore della linea, altezza e colore della scritta scelti sul singolo elemento;
 * vuoto = come il progetto (def: valori mostrati come suggerimento)
 */
function LookRows({ look, def, onChange, sizeLabel }: { look?: ItemLook; def: { lineColor: string; lineWidth: number; textSize: number; textColor?: string }; onChange: (l: ItemLook | undefined) => void; sizeLabel?: string }) {
  const set = (k: keyof ItemLook, v: string | number | undefined) => {
    const next = { ...look, [k]: v };
    onChange(Object.values(next).some(x => x !== undefined) ? next : undefined);
  };
  const numRow = (k: 'lineWidth' | 'textSize', label: string) => (
    <Row label={label}>
      <Field type="number" value={look?.[k] === undefined ? '' : String(look[k])} placeholder={tx('progetto ({0})', String(def[k]).replace('.', ','))}
        onCommit={v => { const n = parseFloat(v.replace(',', '.')); set(k, n > 0 ? n : undefined); }} />
    </Row>
  );
  const colorRow = (k: 'lineColor' | 'textColor', label: string, d: string) => (
    <Row label={label}>
      <span className="color-row">
        <input type="color" value={look?.[k] ?? d} onChange={e => set(k, e.target.value)} />
        {look?.[k] && <button title={tx('Torna al colore del progetto')} onClick={() => set(k, undefined)}>{tx('progetto')}</button>}
      </span>
    </Row>
  );
  return (
    <>
      {colorRow('lineColor', tx('Colore della linea'), def.lineColor)}
      {numRow('lineWidth', tx('Spessore della linea (mm)'))}
      {numRow('textSize', sizeLabel ?? tx('Altezza della scritta (mm)'))}
      {colorRow('textColor', tx('Colore della scritta'), def.textColor ?? look?.lineColor ?? def.lineColor)}
    </>
  );
}

/** Riquadro di un quadro: quale quadro rappresenta, con codice e nome modificabili */
function ZoneProps({ zone }: { zone: Zone }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const pn = project.panels?.find(p => p.id === zone.panelId);
  const upd = (patch: Partial<Zone>) => st().updateElement(zone.id, patch);
  const zs = project.settings?.zoneStyle;
  return (
    <Group title={pn ? panelLabel(pn) : tx('Luogo')}>
      <Row label={tx('Luogo')}>
        <select value={zone.panelId} onChange={e => {
          if (e.target.value === '+') upd({ panelId: st().addPanel().id }); else upd({ panelId: e.target.value });
        }}>
          {!pn && <option value={zone.panelId}>{tx('— mancante —')}</option>}
          {(project.panels ?? []).map(p => <option key={p.id} value={p.id}>{panelLabel(p)}</option>)}
          <option value="+">{tx('+ nuovo luogo')}</option>
        </select>
      </Row>
      {pn && <Row label={tx('Codice (+)')}><span className="tag-input"><span className="dash">+</span><Field value={pn.code} onCommit={v => v.trim() && st().updatePanel(pn.id, { code: v.replace(/^\+/, '').trim() })} /></span></Row>}
      {pn && <Row label={tx('Nome')}><Field value={pn.name} placeholder={tx('es. Quadro master, Slave 1')} onCommit={v => st().updatePanel(pn.id, { name: v.trim() })} /></Row>}
      <Row label={tx('Scritta')}>
        <label title={tx('Scrive solo il codice del luogo (+Q1.2), senza il nome')}><input type="checkbox" checked={zoneCodeOnly(zone, zs)} onChange={e => upd({ codeOnly: e.target.checked === !!zs?.codeOnly ? undefined : e.target.checked })} /> {tx('solo la sigla')}</label>
        {zone.label && <button className="mini" onClick={() => upd({ label: undefined })} title={tx('La scritta è stata trascinata: rimettila nell\'angolo del riquadro')}>{tx('al suo posto')}</button>}
      </Row>
      <LookRows look={zone.look} def={{ lineColor: zs?.lineColor ?? '#000000', lineWidth: zs?.lineWidth ?? 0.3, textSize: zs?.textSize ?? 2.8, textColor: zs?.textColor ?? zs?.lineColor }} onChange={look => upd({ look })} />
      <Row label={tx('Stile dei riquadri')}><button onClick={() => openSettingsAt('zoneStyle')}>{tx('Valori di serie del progetto…')}</button></Row>
      <Row label={tx('Dimensioni (mm)')}>{`${zone.w} × ${zone.h}`}</Row>
      <Row label={tx('Larghezza')}><Field type="number" value={String(zone.w)} onCommit={v => upd({ w: Math.max(8, snap(parseFloat(v) || zone.w)) })} /></Row>
      <Row label={tx('Altezza')}><Field type="number" value={String(zone.h)} onCommit={v => upd({ h: Math.max(8, snap(parseFloat(v) || zone.h)) })} /></Row>
    </Group>
  );
}

/** Gruppo «Proprietà definite dall'utente», solo se il progetto ne ha per quel tipo di oggetto */
function UserPropGroup(p: { assign: UserPropAssign; values: Record<string, string> | undefined; target: UserPropTarget }) {
  const n = activeDefs(useStore(s => s.project.userProps), p.assign).length;
  if (!n) return null;
  return <Group title={tx('Proprietà definite dall\'utente')}><UserPropRows {...p} /></Group>;
}

/** Proprietà definite dall'utente di un oggetto (vedi UserPropsDialog), raggruppate per categoria */
/** Proprietà dell'utente di un articolo: per gli articoli del database gli attributi si leggono lì */
function PartUserPropRows({ part }: { part: Part }) {
  const full = useFullPart(part);
  return <UserPropRows assign="part" values={full?.attrs} target={{ kind: 'part', partNr: part.partNr }} />;
}

function UserPropRows({ assign, values, target }: { assign: UserPropAssign; values: Record<string, string> | undefined; target: UserPropTarget }) {
  const defs = activeDefs(useStore(s => s.project.userProps), assign);
  const st = useStore.getState;
  if (!defs.length) return null;
  const set = (id: string, v: string) => st().setUserProp(target, id, v);
  let cat: string | undefined = '\0';
  return (
    <>
      {defs.map(d => {
        const v = values?.[d.id] ?? '';
        const head = d.category !== cat && d.category ? <Row key={`c-${d.category}`} label=""><b className="small">{d.category}</b></Row> : null;
        cat = d.category;
        const listId = `udp-${d.id}`;
        let input: React.ReactNode;
        if (d.type === 'bool') input = <input type="checkbox" checked={/^(1|true|yes|sì|si)$/i.test(v)} onChange={e => set(d.id, e.target.checked ? 'true' : '')} />;
        else if (d.choices?.length && d.input === 'list') {
          input = (
            <select value={v} onChange={e => set(d.id, e.target.value)}>
              <option value="">—</option>
              {d.choices.map(c => <option key={c} value={c}>{c}</option>)}
              {v && !d.choices.includes(v) && <option value={v}>{v}</option>}
            </select>
          );
        } else {
          input = (
            <span className="udp-field">
              <Field value={v} list={d.choices?.length ? listId : undefined} type={d.type === 'int' || d.type === 'number' ? 'number' : 'text'}
                placeholder={d.unit} onCommit={x => set(d.id, x)} />
              {d.unit && <span className="small muted"> {d.unit}</span>}
              {d.choices?.length ? <datalist id={listId}>{d.choices.map(c => <option key={c} value={c} />)}</datalist> : null}
            </span>
          );
        }
        return (
          <Fragment key={d.id}>
            {head}
            <Row label={d.name}><span title={[d.id, d.description].filter(Boolean).join(' · ')}>{input}</span></Row>
          </Fragment>
        );
      })}
    </>
  );
}

/** Bus di conduttori (modalità BUS): nome e conduttori che vi entrano ed escono */
function BundleProps({ wire }: { wire: Wire }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const parts = partsIndex(project, library);
  // Articoli cavo (con i conduttori nei dati del cavo): quelli proposti per il bus
  const cableParts = new Map([...parts].filter(([, p]) => p.cable?.conductors.length));
  const { taps, groupOf } = bundleTaps(project);
  const group = groupOf.get(wire.id) ?? wire.id;
  const d = useBundleData(wire.id);
  const unnamed = taps.filter(t => t.group === group && !t.name).length;
  const pages = [...new Set(project.pages.filter(pg => pg.elements.some(e => e.kind === 'wire' && groupOf.get(e.id) === group)).map(pg => pg.name))];
  // Tratti dello stesso bus su tutte le pagine: sigla e nomi dei conduttori uguali ovunque
  const segs = project.pages.flatMap(pg => pg.elements).filter((e): e is Wire => e.kind === 'wire' && isBundle(e) && (groupOf.get(e.id) ?? e.id) === group);
  return (
    <Group title={tx('Bus di conduttori')}>
      <Row label={tx('Nome')}>
        <Field value={wire.bundle ?? ''} placeholder={tx('es. 400V AC')}
          onCommit={v => st().updateElement(wire.id, { bundle: v.trim() })} />
      </Row>
      <Row label={tx('Pagine')}>{pages.map(n => `/${n}`).join(' ')}</Row>
      {/* Sigla con i rimandi alle altre pagine: altezza e colore uguali su tutti i tratti del bus */}
      <WireLabelStyleRows bundle wires={segs} />
      <BundleTapStyleRows wires={segs} />
      <Row label={tx('Articolo del cavo')}>
        <PartInput listId="bundle-cable-parts" value={wire.bundlePart ?? ''} parts={cableParts.size ? cableParts : parts}
          onCommit={v => st().updateElement(wire.id, { bundlePart: v || undefined })} />
      </Row>
      {bundleCable(project, wire.bundle)
        ? <Row label={tx('Cavo')}>{tx('-{0}: i conduttori sono quelli del cavo', bundleCable(project, wire.bundle)!.tag)}</Row>
        : wire.bundlePart && !partConductors(parts.get(wire.bundlePart)?.cable).length
          ? <Row label=""><span className="small warn-text">{tx('L\'articolo {0} non ha i dati del cavo (conduttori): si propongono i nomi comuni', wire.bundlePart)}</span></Row>
          : null}
      <Row label={tx('Conduttori')}>{d ? <BundleConductorChips d={d} /> : '—'}</Row>
      {d && d.taps.length > 0 && <tr><td colSpan={2}><div className="bundle-props-taps"><BundleTapsTable d={d} /></div></td></tr>}
      {unnamed > 0 && <Row label=""><span className="small muted">{tx('{0} fili toccano il bus senza conduttore: scrivi il conduttore qui sopra o usa «Nomina i conduttori in ordine»', unnamed)}</span></Row>}
      <Row label="">
        <button disabled={!taps.some(t => t.group === group && !t.name && t.pageId === project.pages.find(pg => pg.elements.includes(wire))?.id)}
          title={tx('I fili senza conduttore della pagina, da sinistra a destra: prima i conduttori entrati altrove che aspettano l\'uscita, poi quelli liberi')}
          onClick={() => st().nameBundleTaps(wire.id)}>{tx('Nomina i conduttori in ordine')}</button>{' '}
        <button onClick={() => { st().setBundleSel(wire.id); st().setView('bundles'); }}>{tx('Apri in Bus fili')}</button>
      </Row>
      <WireDataRows wires={[wire]} noLabel />
      <Row label={tx('Vertici')}>{wire.points.length}</Row>
    </Group>
  );
}

/** Estremi del filo che entrano in un bus di conduttori: nome del conduttore */
function TapRows({ wire }: { wire: Wire }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const { taps, names } = bundleTaps(project);
  const mine = taps.filter(t => t.wire.id === wire.id);
  if (!mine.length) return null;
  return (
    <>
      {mine.map(t => {
        const bus = names.get(t.group);
        return (
          <Row key={t.end} label={mine.length > 1 ? (t.end ? tx('Conduttore nel bus (fine)') : tx('Conduttore nel bus (inizio)')) : tx('Conduttore nel bus')}>
            <span title={bus ? tx('Bus «{0}»', bus) : undefined}>
              <ConductorPicker value={t.name ?? ''} width={120} placeholder={tx('es. L1, PE')} choices={conductorChoices(project, taps, t.group, bus, partsIndex(project, useStore.getState().library))} onCommit={v => st().setWireTap(wire.id, t.end, v)} />
            </span>
          </Row>
        );
      })}
    </>
  );
}

/** Immagine: posizione, misure (proporzioni fisse se richiesto), cornice, sopra o sotto lo schema */
function ImageProps({ img }: { img: ImageItem }) {
  const st = useStore.getState;
  const [lock, setLock] = useState(true);
  const upd = (patch: Partial<ImageItem>) => st().updateElement(img.id, patch);
  const r = (v: number) => Math.max(2, Math.round(v * 2) / 2);
  const num = (v: string) => parseFloat(v.replace(',', '.'));
  return (
    <Group title={tx('Immagine')}>
      <Row label={tx('File')}><span className="small" title={img.name}>{img.name ?? '—'}</span></Row>
      {!img.vector && <tr><td colSpan={2} className="prop-img"><img src={img.src} alt={img.name ?? ''} /></td></tr>}
      <Row label="X"><Field type="number" value={String(img.x)} onCommit={v => { const n = num(v); if (!isNaN(n)) upd({ x: n }); }} /></Row>
      <Row label="Y"><Field type="number" value={String(img.y)} onCommit={v => { const n = num(v); if (!isNaN(n)) upd({ y: n }); }} /></Row>
      <Row label={tx('Larghezza (mm)')}><Field type="number" value={String(img.w)} onCommit={v => { const n = num(v); if (n > 0) upd(lock ? { w: r(n), h: r(n * img.h / img.w) } : { w: r(n) }); }} /></Row>
      <Row label={tx('Altezza (mm)')}><Field type="number" value={String(img.h)} onCommit={v => { const n = num(v); if (n > 0) upd(lock ? { h: r(n), w: r(n * img.w / img.h) } : { h: r(n) }); }} /></Row>
      <Row label={tx('Proporzioni')}>
        <label className="small"><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} /> {tx('fisse')}</label>
        {' '}<button className="mini" onClick={() => { if (img.vector) upd({ h: r(img.w * img.vector.h / (img.vector.w || 1)) }); else void naturalRatio(img); }} title={tx('Rimette le proporzioni dell\'immagine, tenendo la larghezza')}>{tx('Originali')}</button>
      </Row>
      <Row label={tx('Cornice')}><input type="checkbox" checked={!!img.border} onChange={e => upd({ border: e.target.checked || undefined })} /></Row>
      <Row label={tx('Posizione')}>
        <select value={img.front ? 'front' : ''} onChange={e => upd({ front: e.target.value === 'front' || undefined })}>
          <option value="">{tx('sotto lo schema')}</option>
          <option value="front">{tx('sopra lo schema')}</option>
        </select>
      </Row>
      <Row label="">
        {img.vector
          ? <button onClick={() => upd({ w: img.vector!.w, h: img.vector!.h })} title={tx('Misure del disegno nel file DXF')}>{tx('Scala 1:1')}</button>
          : <button onClick={() => void replaceImage(img)}>{tx('Sostituisci immagine…')}</button>}
      </Row>
      <Row label="" ><span className="small muted">{tx('L\'angolo in basso a destra cambia le misure (con Maiusc senza tenere le proporzioni)')}</span></Row>
    </Group>
  );
}

/** Pin di connettore: connettore, numero, pin totali e controparte */
function ConnectorProps({ inst }: { inst: SymbolInstance }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const conn = stripOf(inst.tag), no = inst.tag.slice(inst.tag.indexOf(':') + 1);
  const d = project.connectors?.[conn] ?? {};
  const count = pinCount(project, conn, library);
  const used = connectorRows(project, conn).length;
  const parts = [...partsIndex(project, library).values()];
  return (
    <Group title={tx('Connettore -{0}', conn)}>
      <Row label={tx('Connettore')}><Field value={conn} onCommit={v => v.trim() && st().updateElement(inst.id, { tag: `${v.replace(/^-/, '').trim()}:${no}` })} /></Row>
      <Row label={tx('Pin')}><Field value={no} onCommit={v => v.trim() && st().updateElement(inst.id, { tag: `${conn}:${v.trim()}` })} /></Row>
      <Row label={tx('Pin totali')}><Field value={d.pins ? String(d.pins) : ''} placeholder={count ? tx('{0} (articolo)', count) : tx('es. 16')} onCommit={v => st().updateConnector(conn, { pins: parseInt(v, 10) || undefined })} /></Row>
      <Row label={tx('Usati')}>{`${used}${count ? ` di ${count}` : ''}`}</Row>
      <Row label="">
        <button onClick={() => { st().setConnSel(conn); st().setView('connectors'); }}>{tx('Apri connettore')}</button>
      </Row>
      <Row label={tx('Descrizione')}><Field wrap value={d.description ?? ''} placeholder={tx('es. Connettore motore')} onCommit={v => st().updateConnector(conn, { description: v.trim() || undefined })} /></Row>
      <Row label={tx('Controparte')}>
        <select value={d.matingPartNr ?? ''} onChange={e => st().updateConnector(conn, { matingPartNr: e.target.value || undefined })}>
          <option value="">{tx('— nessuna —')}</option>
          {parts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''}</option>)}
        </select>
      </Row>
    </Group>
  );
}

/** Nodo di rete: indirizzo, quadro di appartenenza e collegamenti */
function NetNodeProps({ inst, vis }: { inst: SymbolInstance; vis: Vis }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const links = networkLinks(project).filter(l => l.a.el.inst.id === inst.id || l.b.el.inst.id === inst.id);
  const pn = devicePanels(project).get(inst.tag);
  return (
    <Group title={tx('Rete')}>
      <Row label={tx('Indirizzo / nome')} vis={vis}><Field value={inst.netAddress && !(isIp(inst.netAddress) && !inst.ip) ? inst.netAddress : ''} placeholder={tx('ID Modbus, nome Profinet, indirizzo EtherCAT…')}
        onCommit={v => st().updateElement(inst.id, { netAddress: v.trim() || undefined, ...(inst.netAddress && isIp(inst.netAddress) && !inst.ip ? { ip: inst.netAddress } : {}) })} /></Row>
      <Row label={tx('Indirizzo IP')}><Field value={nodeIp(inst) ?? ''} placeholder={links.some(l => IP_PROTOCOLS.includes(l.protocol)) ? tx('es. 192.168.0.10 (o «Assegna IP»)') : '—'}
        onCommit={v => st().updateElement(inst.id, { ip: v.trim() || undefined, ...(isIp(inst.netAddress) ? { netAddress: undefined } : {}) })} /></Row>
      {(() => {
        const ip = nodeIp(inst);
        const v = parseIp(ip);
        const net = v !== undefined ? networkOfIp(project, v) : undefined;
        return net ? <Row label={tx('Rete IP')}>{`${net.name} · ${netmask(net.prefix)}${net.gateway ? ` · gw ${net.gateway}` : ''}`}</Row> : null;
      })()}
      <Row label={tx('Luogo')}>{pn ? panelLabel(pn) : '—'}</Row>
      {links.map((l, i) => {
        const [me, other] = l.a.el.inst.id === inst.id ? [l.a, l.b] : [l.b, l.a];
        return <Row key={i} label={`${me.port} · ${l.protocol}`}>{`-${other.el.inst.tag}:${other.port}${l.crossPanel && other.panel ? ` (+${other.panel.code})` : ''}`}</Row>;
      })}
      {!links.length && <Row label={tx('Collegamenti')}>{tx('nessuno: usa lo strumento Bus tra le porte')}</Row>}
    </Group>
  );
}

/** Collegamento di rete: dati del cavo (sigla, tipo, lunghezza, articolo) per lista cavi e distinta */
function BusCableRows({ wire, tagShown }: { wire: Wire; tagShown: boolean }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const c = wire.busCable ?? {};
  // Un cavo che prosegue con i rimandi è uno solo: sigla e dati valgono per tutti i suoi tratti
  const set = (patch: Partial<NonNullable<Wire['busCable']>>) => {
    const g = busCableGroups(project).find(x => x.wires.some(y => y.wire.id === wire.id));
    const ids = g ? g.wires.map(y => y.wire.id) : [wire.id];
    st().setWireProps(ids, { busCable: { ...c, ...patch, ...('tag' in patch ? { auto: patch.tag ? undefined : c.auto } : {}) } });
  };
  const parts = [...partsIndex(project, library).values()];
  return (
    <>
      <Row label={tx('Sigla cavo')} vis={{ on: tagShown, set: on => st().setWireShow([wire.id], 'cable', on) }}><Field value={c.tag ?? ''} placeholder={tx('automatica')} onCommit={v => set({ tag: v.replace(/^-/, '').trim() || undefined })} /></Row>
      <Row label={tx('Tipo cavo')}><Field value={c.type ?? ''} list="bus-cable-types" placeholder={BUS_CABLE_TYPES[wire.bus!] ?? (wire.bus === GENERIC_BUS ? tx('es. cavo del pad del robot, 10 m') : tx('es. Cat5e SF/UTP'))} onCommit={v => set({ type: v.trim() || undefined })} /></Row>
      <Row label={tx('Lunghezza (m)')}><Field value={c.length !== undefined ? String(c.length).replace('.', ',') : ''} placeholder={tx('es. 2')}
        onCommit={v => { const n = parseFloat(v.replace(',', '.')); set({ length: isNaN(n) ? undefined : n }); }} /></Row>
      <Row label={tx('Articolo')}>
        <select value={c.partNr ?? ''} onChange={e => set({ partNr: e.target.value || undefined })}>
          <option value="">{tx('— nessuno —')}</option>
          {parts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''}</option>)}
        </select>
      </Row>
      <tr hidden><td><datalist id="bus-cable-types">{[...new Set(Object.values(BUS_CABLE_TYPES))].map(t => <option key={t} value={t} />)}</datalist></td></tr>
    </>
  );
}

/** Reti IP del piano indirizzi e assegnazione automatica */
function IpNetworksGroup() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  return (
    <Group title={tx('Reti IP (piano indirizzi)')}>
      {(project.ipNetworks ?? []).map(n => (
        <Row key={n.id} label={n.name || tx('Rete')}>
          <span className="panel-row">
            <Field value={n.name} placeholder={tx('Nome')} onCommit={v => st().updateIpNetwork(n.id, { name: v.trim() })} />
            <button title={tx('Elimina la rete')} onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Eliminare la rete {0}?', n.name), tx('Elimina'))) st().deleteIpNetwork(n.id); }}>✕</button>
          </span>
          <span className="panel-row">
            <Field value={`${n.address}/${n.prefix}`} placeholder="192.168.0.0/24" onCommit={v => {
              const [a, b] = v.split('/');
              st().updateIpNetwork(n.id, { address: a.trim(), prefix: Math.min(32, Math.max(1, parseInt(b, 10) || n.prefix)) });
            }} />
            <Field value={n.gateway ?? ''} placeholder={tx('gateway')} onCommit={v => st().updateIpNetwork(n.id, { gateway: v.trim() || undefined })} />
          </span>
          <span className="panel-row">
            <select value={n.protocols?.[0] ?? ''} title={tx('Protocollo che usa questa rete (per l\'assegnazione automatica)')} onChange={e => st().updateIpNetwork(n.id, { protocols: e.target.value ? [e.target.value] : undefined })}>
              <option value="">{tx('tutti i protocolli IP')}</option>
              {IP_PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Field value={String(n.firstHost ?? 1)} placeholder={tx('primo host')} onCommit={v => st().updateIpNetwork(n.id, { firstHost: parseInt(v, 10) || undefined })} />
          </span>
        </Row>
      ))}
      <Row label="">
        <button onClick={() => st().addIpNetwork()}>{tx('+ Rete IP')}</button>{' '}
        <button disabled={!project.ipNetworks?.length} onClick={() => st().assignIps()} title={tx('Assegna un IP libero ai nodi collegati con Profinet, Modbus TCP, EtherNet/IP o Ethernet che non ne hanno')}>{tx('Assegna IP')}</button>{' '}
        <button onClick={() => { st().setReportTab('Piano indirizzi IP'); st().setView('reports'); }}>{tx('Piano IP')}</button>{' '}
        <button onClick={() => st().setDialog('netAddresses')} title={tx('IP e nomi Profinet di tutti i dispositivi di rete in una tabella')}>{tx('Indirizzi di rete…')}</button>
      </Row>
    </Group>
  );
}

/** Lingua di visualizzazione di schemi e PDF e dizionario di progetto */
function LanguagesGroup() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const lang = project.languages?.display ?? 'it';
  return (
    <Group title={tx('Lingue')}>
      <Row label={tx('Schemi e PDF in')}>
        <select value={lang} onChange={e => st().setLanguages({ display: e.target.value as Lang })}>
          {LANGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Row>
      <Row label={tx('Seconda lingua')}>
        <select value={project.languages?.second ?? ''} onChange={e => st().setLanguages({ second: (e.target.value || undefined) as Lang | undefined })}>
          <option value="">{tx('nessuna')}</option>
          {LANGS.filter(l => l.id !== lang).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Row>
      <Row label={tx('Dizionario')}><button onClick={() => { st().setReportTab('translations'); st().setView('reports'); }}>{tx('Traduzioni…')}</button></Row>
    </Group>
  );
}

/** Dati del cavo e conduttori assegnati ai fili attraversati dalla linea */
function CableProps({ line, derived }: { line: CableLine; derived: Derived }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const info = cableInfos(project, derived.netlist).find(i => i.cable.id === line.cableId);
  const clip = useStore(s => s.cableClipboard);
  if (!info) return <Group title={tx('Cavo')}><Row label={tx('Cavo')}>{tx('mancante')}</Row></Group>;
  const c = info.cable;
  const upd = (patch: Parameters<ReturnType<typeof useStore.getState>['updateCable']>[1]) => st().updateCable(c.id, patch);
  const parts = [...partsIndex(project, library).values()];
  const mine = info.conductors.filter(k => k.lineId === line.id);
  const cableParts = parts.filter(p => p.cable?.conductors.length);
  return (
    <>
      <Group title={tx('Cavo -{0}', c.tag)}>
        <Row label={tx('Sigla')}><span className="tag-input"><span className="dash">-</span><Field value={c.tag} onCommit={v => v.trim() && upd({ tag: v.replace(/^-/, '').trim() })} /></span></Row>
        <Row label={tx('Linea del cavo')}>
          <select value={c.id} onChange={e => st().updateElement(line.id, { cableId: e.target.value })}>
            {(project.cables ?? []).map(x => <option key={x.id} value={x.id}>-{x.tag}</option>)}
          </select>
        </Row>
        {cableParts.length > 0 && (
          <Row label={tx('Tipo di cavo')}>
            <select value={c.partNr ?? ''} onChange={e => e.target.value && st().applyCableType([c.id], e.target.value)}
              title={tx('Articoli cavo della libreria: scegliendone uno il cavo prende tutti i suoi conduttori, anche se nello schema se ne usano solo alcuni')}>
              <option value="">{tx('— scegli un articolo cavo —')}</option>
              {cableParts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''} ({p.cable!.conductors.length})</option>)}
            </select>
          </Row>
        )}
        <Row label={tx('Tipo')}><Field value={c.type ?? ''} placeholder={tx('es. FG16OR16')} onCommit={v => upd({ type: v.trim() || undefined })} /></Row>
        <Row label={tx('Marcatura')}>
          <select value={markingOf(c)} onChange={e => st().setCableMarking([c.id], e.target.value as 'numbers' | 'colors')}
            title={tx('Cambiando la marcatura i conduttori si rinominano (numeri 1…n o colori standard); il giallo-verde resta')}>
            <option value="numbers">{tx('Numeri')}</option>
            <option value="colors">{tx('Colori')}</option>
          </select>
        </Row>
        <Row label={tx('Sezione (mm²)')}><Field value={c.cross ?? ''} list="wire-sections" onCommit={v => upd({ cross: v.trim() || undefined })} /></Row>
        <Row label={tx('Conduttori')}>
          <Field value={c.conductors.join(' ')} placeholder={tx('BN BK GY BU GNYE')} onCommit={v => upd({ conductors: v.split(/[\s,;]+/).filter(Boolean) })} />
        </Row>
        <Row label={tx('Conduttori secondo i pin di')}>
          <select value={c.pinsOf ?? ''} onChange={e => upd({ pinsOf: e.target.value || undefined })}
            title={tx('Cavo con connettore integrato nel dispositivo: il filo che parte dal morsetto n prende il conduttore n del cavo (i conduttori scelti a mano restano)')}>
            <option value="">{tx('— nell\'ordine dei fili —')}</option>
            {[...new Set([...pinDeviceOptions(project, c.id), ...(c.pinsOf ? [c.pinsOf] : [])])].map(t => <option key={t} value={t}>-{t}</option>)}
          </select>
        </Row>
        <Row label={tx('Formazione')}>
          {cableSection(c)}{' '}
          <select value="" onChange={e => { const [n, pe] = e.target.value.split('|'); if (n) upd({ conductors: conductorsFor(parseInt(n, 10), pe === '1', markingOf(c)) }); }}>
            <option value="">{tx('imposta…')}</option>
            {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}g`} value={`${n}|1`}>{n}{tx('G (con giallo-verde)')}</option>)}
            {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}x`} value={`${n}|0`}>{n}{tx('x (senza giallo-verde)')}</option>)}
          </select>
        </Row>
        <Row label={tx('Schermato')}><input type="checkbox" checked={!!c.shield} onChange={e => upd({ shield: e.target.checked || undefined })} /></Row>
        <Row label={tx('Coppie intrecciate')}><input type="checkbox" checked={!!c.pairs} title={tx('Conduttori intrecciati a coppie nell\'ordine (1-2, 3-4…), disegnati sulle linee del cavo')} onChange={e => upd({ pairs: e.target.checked || undefined })} /></Row>
        <Row label={tx('Lunghezza (m)')}><Field value={c.length !== undefined ? String(c.length).replace('.', ',') : ''} onCommit={v => upd({ length: v.trim() ? parseFloat(v.replace(',', '.')) : undefined })} /></Row>
        <Row label={tx('Ordine')}><PiecesSelect value={c.pieces === undefined ? '' : c.pieces ? 'pz' : 'm'} fromPart={cableByPiece({}, c.partNr ? partsIndex(project, library).get(c.partNr) : undefined)} onChange={v => upd({ pieces: v === '' ? undefined : v === 'pz' })} /></Row>
        <Row label={tx('Da')}><Field value={c.from ?? ''} placeholder={tx('es. -X1')} onCommit={v => upd({ from: v.trim() || undefined })} /></Row>
        <Row label="A"><Field value={c.to ?? ''} placeholder={tx('es. -M1')} onCommit={v => upd({ to: v.trim() || undefined })} /></Row>
        <Row label={tx('Descrizione')}><Field wrap value={c.description ?? ''} onCommit={v => upd({ description: v.trim() || undefined })} /></Row>
        <Row label={tx('Articolo')}>
          <select value={c.partNr ?? ''} onChange={e => upd({ partNr: e.target.value || undefined })}>
            <option value="">{tx('— nessuno —')}</option>
            {parts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''}</option>)}
          </select>
        </Row>
        <Row label={tx('Usati / liberi')}>{`${info.conductors.length}/${c.conductors.length}`}{info.spare.length ? tx(' · liberi: {0}', info.spare.join(' ')) : ''}</Row>
        <Row label={tx('Comandi')}>
          <button onClick={() => { st().setCableSel(c.id); st().setView('cables'); }}>{tx('Apri nel pannello Cavi')}</button>
          <button onClick={() => st().copyCableProps(c.id)} title={tx('Copia tipo, sezione, conduttori, colori scelti a mano e gli altri dati, tranne la sigla')}>{tx('Copia proprietà')}</button>
          <button onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Riassegnare in ordine di pagina i conduttori automatici del cavo -{0}? I fili possono cambiare conduttore (quelli scelti a mano restano).', c.tag), tx('Riassegna'))) st().reassignConductors([c.id]); }}
            title={tx('I conduttori assegnati in automatico restano ai loro fili anche aggiungendo fili su pagine precedenti; questo comando li riassegna da capo in ordine di pagina')}>{tx('Riassegna i conduttori in ordine')}</button>
          {clip && clip.tag !== c.tag && <button onClick={() => st().pasteCableProps([c.id])}>{tx('Incolla proprietà di -{0}', clip.tag)}</button>}
          <button onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Eliminare il cavo -{0} e tutte le sue linee?', c.tag), tx('Elimina'))) st().deleteCable(c.id); }}>{tx('Elimina cavo')}</button>
        </Row>
      </Group>
      <CableLineGroup line={line} lines={info.lines.map(l => l.line)} shield={!!c.shield} />
      <Group title={tx('Conduttori su questa linea')}>
        {mine.map(k => (
          <Row key={k.wire.id} label={`${k.net?.wireNo || 'filo'}${conductorEnds(k)[0] ? ` ${conductorEnds(k)[0]}` : ''}`}>
            <ConductorSwatch name={k.name} />
            <select value={c.assign[k.wire.id] ?? ''} onChange={e => st().assignConductor(c.id, k.wire.id, e.target.value)}>
              <option value="">{tx('automatico (')}{k.name})</option>
              {c.conductors.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {k.problem && <span className="issue-error"> {k.problem}</span>}
          </Row>
        ))}
        {!mine.length && <Row label="—">{tx('La linea non attraversa fili')}</Row>}
      </Group>
    </>
  );
}

/**
 * Rappresentazione di una linea del cavo (come in EPLAN): linea principale con tipo e dati, testi da
 * mostrare, posizione dei testi e collegamento dello schermo
 */
function CableLineGroup({ line, lines, shield }: { line: CableLine; lines: CableLine[]; shield: boolean }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const style = cableStyleOf(project);
  const main = (lines.find(l => l.main) ?? lines[0])?.id === line.id;
  const show = lineShow(style, line, main);
  const setShow = (k: keyof CableLineShow, v: boolean) => {
    const def = (main ? style.main : style.other)[k];
    const next = { ...line.show, [k]: v === def ? undefined : v };
    st().updateElement(line.id, { show: Object.values(next).some(x => x !== undefined) ? next : undefined });
  };
  return (
    <Group title={tx('Rappresentazione su questa linea')}>
      <Row label={tx('Linea principale')}>
        <label title={tx('La linea principale porta tipo e sezione del cavo; le altre linee dello stesso cavo mostrano di serie solo la sigla')}>
          <input type="checkbox" checked={main} disabled={main && !line.main} onChange={e => st().setMainCableLine(line.id, e.target.checked)} />
          {' '}{main && !line.main ? tx('sì (la prima del progetto)') : main ? tx('sì') : tx('no')}
        </label>
      </Row>
      <Row label={tx('Testi')}>
        <span className="checks-inline">
          {CABLE_SHOW_KEYS.map(([k, l]) => <label key={k}><input type="checkbox" checked={show[k]} onChange={e => setShow(k, e.target.checked)} /> {tx(l)}</label>)}
        </span>
        {line.show && <button className="mini" onClick={() => st().updateElement(line.id, { show: undefined })} title={tx('Torna ai testi dello stile dei cavi')}>{tx('come lo stile')}</button>}
      </Row>
      <Row label={tx('Posizione dei testi')}>
        <select value={line.labelPos ?? ''} onChange={e => st().updateElement(line.id, { labelPos: (e.target.value || undefined) as CableLine['labelPos'] })}>
          <option value="">{tx('come lo stile ({0})', tx(CABLE_LABEL_POS.find(p => p[0] === style.labelPos)?.[1] ?? ''))}</option>
          {CABLE_LABEL_POS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
        </select>
        {line.labelOffset && <button className="mini" onClick={() => st().updateElement(line.id, { labelOffset: undefined })} title={tx('I testi sono stati trascinati: rimettili al loro posto')}>{tx('al loro posto')}</button>}
      </Row>
      <LookRows look={line.look} def={{ lineColor: style.lineColor ?? '#000000', lineWidth: style.lineWidth, textSize: style.tagSize, textColor: style.tagColor ?? style.lineColor ?? '#000000' }}
        sizeLabel={tx('Altezza della sigla (mm)')} onChange={look => st().updateElement(line.id, { look })} />
      <Row label={tx('Nomi dei conduttori')}>
        <select value={line.condDir ?? ''} onChange={e => st().updateElement(line.id, { condDir: (e.target.value || undefined) as CableLine['condDir'] })}
          title={tx('Verticali: utile per i colori composti con il nome lungo')}>
          <option value="">{tx('come lo stile ({0})', tx(CABLE_COND_DIR.find(p => p[0] === style.condDir)?.[1] ?? ''))}</option>
          {CABLE_COND_DIR.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
        </select>
      </Row>
      {shield && (
        <Row label={tx('Altezza dello schermo (mm)')}>
          <Field type="number" value={line.shieldHeight !== undefined ? String(line.shieldHeight) : ''} placeholder={tx('come lo stile ({0})', (shieldDims(style, { condDir: line.condDir }).r * 2).toFixed(1))}
            onCommit={v => { const n = parseFloat(v.replace(',', '.')); st().updateElement(line.id, { shieldHeight: isFinite(n) && n > 0 ? n : undefined }); }} />
        </Row>
      )}
      {shield && (
        <Row label={tx('Collegamento dello schermo')}>
          <select value={line.shieldGround ?? 'end'} onChange={e => st().updateElement(line.id, { shieldGround: e.target.value === 'end' ? undefined : e.target.value as 'start' | 'none' })}
            title={tx('Dal punto in fondo al collegamento si può tirare un filo fino al morsetto PE: il simbolo di terra sparisce')}>
            <option value="end">{tx('alla fine')}</option>
            <option value="start">{tx('all\'inizio')}</option>
            <option value="none">{tx('nessuno')}</option>
          </select>
        </Row>
      )}
      <Row label={tx('Stile dei cavi')}><button onClick={() => st().setDialog('cableStyle')}>{tx('Dimensioni, colori, trattino sui fili…')}</button></Row>
    </Group>
  );
}

/** Elenco dei costruttori già usati negli articoli (per i campi «Costruttore») */
export function ManufacturersList({ parts }: { parts: Map<string, Part> }) {
  const names = useMemo(() => [...new Set([...parts.values()].map(p => p.manufacturer).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b)), [parts]);
  return <datalist id="manufacturers-list">{names.map(n => <option key={n} value={n} />)}</datalist>;
}

/**
 * Codice articolo: si sceglie tra quelli della libreria (filtrati mentre si scrive) o se ne scrive
 * uno nuovo, che diventa un articolo della libreria
 */
export function PartInput({ value, parts, onCommit, listId }: { value: string; parts: Map<string, Part>; onCommit: (v: string) => void; listId: string }) {
  return (
    <>
      <Field value={value} list={listId} placeholder={tx('scrivi o scegli un codice…')} onCommit={v => onCommit(v.trim())} />
      <datalist id={listId}>
        {[...parts.values()].map(p => <option key={p.partNr} value={p.partNr}>{[p.descr1, p.manufacturer, p.typeNr].filter(Boolean).join(' · ')}</option>)}
      </datalist>
    </>
  );
}

/**
 * Articoli aggiuntivi del dispositivo (es. sezionatore generale: apparecchio, barra di prolunga e
 * manopola): uno per riga con la quantità; vanno in distinta e nella lista d'acquisto
 */
function ExtraPartsRows({ instId, list, parts }: { instId: string; list: ExtraPart[]; parts: Map<string, Part> }) {
  const st = useStore.getState;
  const set = (next: ExtraPart[]) => st().setExtraParts(instId, next);
  const upd = (i: number, patch: Partial<ExtraPart>) => set(list.map((y, k) => (k === i ? { ...y, ...patch } : y)));
  // Il codice si scrive a mano o si sceglie tra i suggerimenti della libreria; descrizione e
  // costruttore di un codice nuovo lo aggiungono alla libreria
  return (
    <>
      {list.map((x, i) => {
        const part = parts.get(x.partNr);
        return (
          <Row key={i} label={i === 0 ? tx('Articoli aggiuntivi') : ''}>
            <span className="extra-part">
              <Field value={x.partNr} list="extra-parts-list" placeholder={tx('codice articolo')} onCommit={v => v.trim() ? upd(i, { partNr: v.trim() }) : set(list.filter((_, k) => k !== i))} />
              <button title={tx('Togli l\'articolo')} onClick={() => set(list.filter((_, k) => k !== i))}>✕</button>
              <span className="extra-descr">
                {/* Descrizione e costruttore sono quelli dell'articolo in libreria: si scrivono una volta sola */}
                <Field value={part?.descr1 ?? x.descr ?? ''} placeholder={tx('descrizione')}
                  onCommit={v => (part ? st().savePart(x.partNr, { descr1: v.trim() || undefined }) : upd(i, { descr: v }))} />
                <Field value={part?.manufacturer ?? x.manufacturer ?? ''} placeholder={tx('costruttore')} list="manufacturers-list"
                  onCommit={v => (part ? st().savePart(x.partNr, { manufacturer: v.trim() || undefined }) : upd(i, { manufacturer: v }))} />
                <span title={tx('Quantità')}><Field type="number" value={String(x.qty ?? 1)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); upd(i, { qty: n > 0 ? n : 1 }); }} /></span>
              </span>
            </span>
          </Row>
        );
      })}
      <Row label={list.length ? '' : tx('Articoli aggiuntivi')}>
        <span title={tx('Accessori dello stesso dispositivo (es. barra di prolunga e manopola del sezionatore): vanno in distinta con la sua sigla')}>
          <Field key={list.length} value="" list="extra-parts-list" placeholder={tx('+ scrivi o scegli un codice…')} onCommit={v => { if (v.trim()) set([...list, { partNr: v.trim() }]); }} />
        </span>
        <datalist id="extra-parts-list">
          {[...parts.values()].map(p => <option key={p.partNr} value={p.partNr}>{p.descr1 ?? ''}</option>)}
        </datalist>
        <ManufacturersList parts={parts} />
      </Row>
    </>
  );
}

/** Morsettiera, numero, piano e ponticello del morsetto, con i comandi dei piani */
function TerminalProps({ inst }: { inst: SymbolInstance }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const strip = stripOf(inst.tag);
  const no = terminalNo(inst.tag);
  const t = parseTerminalNo(no);
  const levels = stripRows(project, strip).filter(r => r.base === t.base && !isNaN(t.n)).map(r => r.no);
  const j = jumperOf(stripData(project, strip), no);
  const upd = (tag: string) => st().updateElement(inst.id, { tag });
  return (
    <Group title={tx('Morsettiera -{0}', strip)}>
      <Row label={tx('Morsettiera')}><Field value={strip} onCommit={v => v.trim() && upd(`${v.replace(/^-/, '').trim()}:${no}`)} /></Row>
      <Row label={tx('Numero')}><Field value={no} onCommit={v => v.trim() && upd(`${strip}:${v.trim()}`)} /></Row>
      <Row label={tx('Piani')}>{levels.length > 1 ? levels.join(', ') : tx('un piano')}</Row>
      <Row label={tx('Sigla della morsettiera sullo schema')}>
        <select value={inst.show?.strip === undefined ? '' : inst.show.strip ? '1' : '0'}
          onChange={e => st().updateElement(inst.id, { show: withShow(inst.show, 'strip', e.target.value === '' ? undefined : e.target.value === '1') })}>
          <option value="">{tx('sul primo morsetto della pagina')}</option>
          <option value="1">{tx('mostrata')}</option>
          <option value="0">{tx('nascosta')}</option>
        </select>
      </Row>
      <Row label={tx('Testi del morsetto')}>
        <select value={inst.termText ?? ''} onChange={e => st().updateElement(inst.id, { termText: (e.target.value || undefined) as TerminalTextDir | undefined })}>
          <option value="">{tx('come il progetto')}</option>
          {TERM_TEXT_DIRS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
        </select>
      </Row>
      {j && <Row label={tx('Ponticello')}>{`${j.kind === 'comb' ? 'a pettine' : 'fisso'} ${j.terminals.join('-')}`}</Row>}
      <Row label={tx('Comandi')}>
        <button disabled={isNaN(t.n)} onClick={() => st().addTerminalLevel(inst.id)}
          title={t.level ? tx('Inserisce il piano successivo dello stesso morsetto') : tx('Il morsetto diventa {0}A e si inserisce il piano {1}B', t.base, t.base)}>
          {tx('Aggiungi piano')}
        </button>{' '}
        <button onClick={() => { st().setStripSel(strip); st().setView('terminals'); }}>{tx('Apri morsettiera')}</button>
      </Row>
    </Group>
  );
}

function PlcProps({ inst, io, vis }: { inst: SymbolInstance; io: IoKind; vis: (k: SymVisKey) => Vis }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const cards = project.plc.cards.filter(c => (cardType(c).channels[io] ?? 0) > 0);
  const card = cardByTag(project, inst.tag);
  const fmt = card ? cardFormat(project, card) : settingsOf(project).plcAddressFormat;
  const used = usedChannels(project, inst.tag, inst.id);
  const channels = card ? channelsOf(card).filter(c => c.kind === io) : [];
  const upd = (patch: Partial<SymbolInstance>) => st().updateElement(inst.id, patch);
  // Cambiando scheda prendo il primo canale libero del tipo giusto
  const changeCard = (tag: string) => {
    const c = cardByTag(project, tag);
    if (!c) return;
    const busy = usedChannels(project, tag, inst.id);
    const free = channelsOf(c).find(ch => ch.kind === io && !busy.has(ch.id));
    upd({ tag, plcChannel: free?.id ?? `${io}0` });
  };
  return (
    <Group title="PLC">
      <Row label={tx('Scheda')}>
        <select value={card ? inst.tag : ''} onChange={e => changeCard(e.target.value)}>
          {!card && <option value="">{tx('— scheda mancante (-')}{inst.tag}) —</option>}
          {cards.map(c => <option key={c.id} value={c.tag}>-{c.tag} · {tx(cardType(c).name)}</option>)}
        </select>
      </Row>
      <Row label={tx('Canale')}>
        <select value={inst.plcChannel ?? ''} onChange={e => upd({ plcChannel: e.target.value })}>
          {channels.map(c => (
            <option key={c.id} value={c.id}>{c.id} · {card ? channelAddress(card, c.id, fmt) : ''}{used.has(c.id) ? tx(' (occupato)') : ''}</option>
          ))}
        </select>
      </Row>
      <Row label={tx('Indirizzo')} vis={vis('plcAddress')}><b>{card && inst.plcChannel ? channelAddress(card, inst.plcChannel, fmt) : '—'}</b></Row>
      <Row label={tx('Nome simbolico')} vis={vis('plcSymbol')}>
        <Field value={inst.plcSymbol ?? ''} placeholder={defaultSymbol(inst.tag, inst.plcChannel ?? '')}
          onCommit={v => upd({ plcSymbol: v.trim() ? sanitizeSymbol(v.trim()) : undefined })} />
      </Row>
      <Row label={tx('Commento')} vis={vis('plcComment')}><Field value={inst.plcComment ?? ''} placeholder={tx('descrizione del dispositivo collegato')} onCommit={v => upd({ plcComment: v.trim() || undefined })} /></Row>
      <Row label={tx('Gestione')}><button onClick={() => st().setView('plc')}>{tx('Apri vista PLC')}</button></Row>
    </Group>
  );
}

/** Sezione e colore dei fili selezionati (possono essere diversi lungo lo stesso conduttore) */
/**
 * Gruppo I/O PLC: scheda, primo canale, numero di canali, morsetti per canale e, per ogni canale,
 * pin della scheda, indirizzo (canale), variabile e commento
 */
function PlcGroupProps({ gid }: { gid: string }) {
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const st = useStore.getState;
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  const cfg = groupConfig(page, gid);
  if (!cfg) return null;
  const members = groupMembers(page, gid);
  const cards = project.plc.cards.filter(c => (cardType(c).channels[cfg.kind] ?? 0) > 0);
  const card = cardByTag(project, cfg.tag);
  const fmt = card ? cardFormat(project, card) : settingsOf(project).plcAddressFormat;
  const max = card ? cardType(card).channels[cfg.kind] ?? 0 : 0;
  const addr = (ch: string) => (card ? channelAddress(card, ch, fmt) : '');
  const vis = (k: SymVisKey): Vis => ({ on: members.every(m => m.show?.[k] !== false), set: on => st().setPlcGroupShow(gid, k, on) });
  const upd = (id: string, patch: Partial<SymbolInstance>) => st().updateInstance(id, patch);
  return (
    <>
      <Group title={cfg.kind === 'DO' ? tx('Gruppo di uscite PLC -{0}', cfg.tag) : tx('Gruppo di ingressi PLC -{0}', cfg.tag)}>
        <Row label={tx('Scheda')}>
          <select value={cfg.tag} onChange={e => { const c = cardByTag(project, e.target.value); if (c) st().updatePlcGroup(gid, { tag: c.tag, first: firstFreeChannel(project, c, cfg.kind, cfg.count) }); }}>
            {cards.map(c => <option key={c.id} value={c.tag}>-{c.tag} · {cardType(c).name}</option>)}
          </select>
        </Row>
        <Row label={tx('Primo canale')}>
          <select value={cfg.first} onChange={e => st().updatePlcGroup(gid, { first: parseInt(e.target.value, 10) })}>
            {Array.from({ length: max }, (_, i) => <option key={i} value={i}>{`${cfg.kind}${i} · ${addr(`${cfg.kind}${i}`)}`}</option>)}
          </select>
        </Row>
        <Row label={tx('Canali')}>
          <select value={cfg.count} onChange={e => { const n = parseInt(e.target.value, 10); st().updatePlcGroup(gid, { count: n, unused: cfg.unused.filter(i => i < n) }); }}>
            {Array.from({ length: Math.max(cfg.count, Math.min(16, max - cfg.first)) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </Row>
        <Row label={tx('Morsetti per canale')}>
          <select value={cfg.terms} onChange={e => st().updatePlcGroup(gid, { terms: e.target.value === '2' ? 2 : 1 })}>
            <option value={1}>1</option><option value={2}>{tx('2 (es. schede safety, alimentazione del sensore)')}</option>
          </select>
        </Row>
        <Row label={tx('Numeri dei pin')} vis={vis('pins')} />
        <Row label={tx('Indirizzi')} vis={vis('plcAddress')} />
        <Row label={tx('Variabili')} vis={vis('plcSymbol')} />
        <Row label={tx('Commenti')} vis={vis('plcComment')} />
        <Row label={tx('Azioni')}>
          <button onClick={() => st().rotateSelection()}>{tx('Ruota')}</button>{' '}
          <button onClick={() => st().deleteSelection()}>{tx('Elimina')}</button>{' '}
          <button onClick={() => st().setView('plc')}>{tx('Apri vista PLC')}</button>
        </Row>
      </Group>
      {Array.from({ length: cfg.count }, (_, k) => {
        const m = members.find(x => x.plcGroup!.index === k);
        const used = !!m;
        return (
          <Group key={k} title={m?.plcChannel ? `${k + 1} · ${m.plcChannel} · ${addr(m.plcChannel)}` : tx('{0} · nascosto', k + 1)}>
            <Row label={tx('Usato')}>
              <input type="checkbox" checked={used} disabled={used && members.length <= 1}
                title={tx('Tolto: il canale non si disegna e resta libero sulla scheda (lo spazio nel gruppo resta)')}
                onChange={e => st().updatePlcGroup(gid, { unused: e.target.checked ? cfg.unused.filter(i => i !== k) : [...cfg.unused, k] })} />
            </Row>
            {m && <>
              <Row label={tx('Canale')}>
                <select value={m.plcGroup!.own ? m.plcChannel : ''} onChange={e => {
                  if (!e.target.value) { upd(m.id, { plcGroup: { ...m.plcGroup!, own: undefined } }); st().updatePlcGroup(gid, {}); }
                  else upd(m.id, { plcChannel: e.target.value, plcGroup: { ...m.plcGroup!, own: true } });
                }}>
                  <option value="">{tx('automatico ({0})', `${cfg.kind}${cfg.first + k}`)}</option>
                  {Array.from({ length: max }, (_, i) => `${cfg.kind}${i}`).map(ch => <option key={ch} value={ch}>{`${ch} · ${addr(ch)}`}</option>)}
                </select>
              </Row>
              <Row label={tx('Pin della scheda')}>
                <span className="panel-row">
                  {Object.keys(m.pinLabels).sort().map(pid => (
                    <Field key={pid} value={m.pinLabels[pid] ?? ''} placeholder={pid}
                      onCommit={v => upd(m.id, { pinLabels: { ...m.pinLabels, [pid]: v.trim() } })} />
                  ))}
                </span>
              </Row>
              <Row label={tx('Variabile')}>
                <Field value={m.plcSymbol ?? ''} placeholder={defaultSymbol(m.tag, m.plcChannel ?? '')}
                  onCommit={v => upd(m.id, { plcSymbol: v.trim() ? sanitizeSymbol(v.trim()) : undefined })} />
              </Row>
              <Row label={tx('Commento')}>
                <Field value={m.plcComment ?? ''} placeholder={tx('descrizione del dispositivo collegato')} onCommit={v => upd(m.id, { plcComment: v.trim() || undefined })} />
              </Row>
            </>}
          </Group>
        );
      })}
    </>
  );
}

/** Altezza e colore del numero filo sui fili selezionati (vuoti = quelli del progetto) */
/** Bus fili: altezza e colore dei nomi dei conduttori scritti dove i fili entrano (su tutti i tratti del bus) */
function BundleTapStyleRows({ wires }: { wires: Wire[] }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const ids = wires.map(w => w.id);
  const def = textStylesOf(settingsOf(project)).bundleTap;
  const size = wires.every(w => w.tapSize === wires[0].tapSize) ? wires[0].tapSize : undefined;
  const color = wires.every(w => w.tapColor === wires[0].tapColor) ? wires[0].tapColor : undefined;
  return (
    <>
      <Row label={tx('Altezza dei conduttori (mm)')}>
        <Field type="number" value={size === undefined ? '' : String(size)} placeholder={tx('progetto ({0})', String(def.size).replace('.', ','))}
          onCommit={v => { const n = parseFloat(v.replace(',', '.')); st().setWireProps(ids, { tapSize: n > 0 ? n : undefined }); }} />
      </Row>
      <Row label={tx('Colore dei conduttori')}>
        <span className="color-row">
          <input type="color" value={color ?? def.color} onChange={e => st().setWireProps(ids, { tapColor: e.target.value })} />
          {wires.some(w => w.tapColor) && <button title={tx('Torna al colore del progetto')} onClick={() => st().setWireProps(ids, { tapColor: undefined })}>{tx('progetto')}</button>}
        </span>
      </Row>
    </>
  );
}

function WireLabelStyleRows({ wires, bundle }: { wires: Wire[]; bundle?: boolean }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const ids = wires.map(w => w.id);
  const def = textStylesOf(settingsOf(project))[bundle ? 'bundleTag' : 'wireNo'];
  const size = wires.every(w => w.labelSize === wires[0].labelSize) ? wires[0].labelSize : undefined;
  const color = wires.every(w => w.labelColor === wires[0].labelColor) ? wires[0].labelColor : undefined;
  return (
    <>
      <Row label={bundle ? tx('Altezza della sigla (mm)') : tx('Altezza del numero (mm)')}>
        <Field type="number" value={size === undefined ? '' : String(size)} placeholder={tx('progetto ({0})', String(def.size).replace('.', ','))}
          onCommit={v => { const n = parseFloat(v.replace(',', '.')); st().setWireProps(ids, { labelSize: n > 0 ? n : undefined }); }} />
      </Row>
      <Row label={bundle ? tx('Colore della sigla') : tx('Colore del numero')}>
        <span className="color-row">
          <input type="color" value={color ?? def.color} onChange={e => st().setWireProps(ids, { labelColor: e.target.value })} />
          {wires.some(w => w.labelColor) && <button title={tx('Torna al colore del progetto')} onClick={() => st().setWireProps(ids, { labelColor: undefined })}>{tx('progetto')}</button>}
        </span>
      </Row>
    </>
  );
}

/** Colore e altezza di ogni tipo di testo sullo schema, per tutto il progetto */
function TextStylesGroup() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const s = settingsOf(project);
  const cur = textStylesOf(s);
  const set = (k: TextStyleKey, patch: { color?: string; size?: number }) => {
    const next = { ...(s.textStyles ?? {}) };
    const v = { ...(next[k] ?? {}), ...patch };
    // Valori uguali ai predefiniti (o a quelli del tipo da cui si prendono): non si salvano
    const rest = { ...next }; delete rest[k];
    const d = textStylesOf({ textStyles: rest })[k];
    if (v.color === undefined || v.color === d.color) delete v.color;
    if (v.size === undefined || v.size === d.size) delete v.size;
    if (Object.keys(v).length) next[k] = v; else delete next[k];
    st().updateSettings({ textStyles: Object.keys(next).length ? next : undefined });
  };
  return (
    <Group title={tx('Testi sullo schema: colore e altezza')}>
      {TEXT_STYLES.map(d => (
        <Row key={d.key} label={tx(d.name)}>
          <span className="color-row">
            <input type="color" value={cur[d.key].color} onChange={e => set(d.key, { color: e.target.value })} />
            <Field type="number" value={String(cur[d.key].size)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); set(d.key, { size: n > 0 ? n : undefined }); }} />
            <span className="muted small">mm</span>
            {s.textStyles?.[d.key] && <button title={tx('Torna al colore e all\'altezza predefiniti')} onClick={() => set(d.key, { color: undefined, size: undefined })}>↺</button>}
          </span>
        </Row>
      ))}
    </Group>
  );
}

/** Aspetto del disegno: spessori delle linee, colori, giunzioni e carattere (valori uguali ai predefiniti non si salvano) */
export function LookSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const l = settingsOf(project).look ?? {};
  const set = (patch: Partial<LookSettings>) => {
    const next: LookSettings = { ...l, ...patch };
    for (const k of Object.keys(next) as (keyof LookSettings)[]) {
      const v = next[k];
      if (v === undefined || (typeof v === 'object' && !Object.keys(v).length)) delete next[k];
    }
    st().updateSettings({ look: Object.keys(next).length ? next : undefined });
  };
  const setWidth = (k: LineWidthKey, v: number | undefined) => {
    const d = LINE_WIDTHS.find(x => x.key === k)!;
    const w = { ...(l.widths ?? {}) };
    if (v === undefined || v === d.value) delete w[k]; else w[k] = v;
    set({ widths: w });
  };
  const setColor = (k: LookColorKey, v: string | undefined) => {
    const d = LOOK_COLORS.find(x => x.key === k)!;
    const c = { ...(l.colors ?? {}) };
    if (v === undefined || v.toLowerCase() === d.value) delete c[k]; else c[k] = v;
    set({ colors: c });
  };
  return (
    <>
      <Group title={tx('Spessori delle linee')}>
        {LINE_WIDTHS.map(d => (
          <Row key={d.key} label={tx(d.name)}>
            <span className="color-row">
              <Field type="number" value={String(l.widths?.[d.key] ?? d.value)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); if (!(n > 0 && n <= 5)) return false; setWidth(d.key, n); }} />
              <span className="muted small">mm</span>
              {l.widths?.[d.key] !== undefined && <button title={tx('Torna allo spessore predefinito ({0} mm)', d.value)} onClick={() => setWidth(d.key, undefined)}>↺</button>}
            </span>
          </Row>
        ))}
      </Group>
      <Group title={tx('Colori')}>
        {LOOK_COLORS.map(d => (
          <Row key={d.key} label={tx(d.name)}>
            <span className="color-row">
              <input type="color" value={l.colors?.[d.key] ?? d.value} onChange={e => setColor(d.key, e.target.value)} />
              {l.colors?.[d.key] && <button title={tx('Torna al colore predefinito')} onClick={() => setColor(d.key, undefined)}>↺</button>}
            </span>
          </Row>
        ))}
      </Group>
      <Group title={tx('Giunzioni e carattere')}>
        <Row label={tx('Giunzioni dei fili')}>
          <select value={l.junction ?? 'dot'} onChange={e => set({ junction: e.target.value === 'none' ? 'none' : undefined })}>
            <option value="dot">{tx('pallino pieno')}</option>
            <option value="none">{tx('nessun segno')}</option>
          </select>
        </Row>
        {l.junction !== 'none' && <Row label={tx('Diametro del pallino')}>
          <span className="color-row">
            <Field type="number" value={String(l.junctionSize ?? 1.4)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); if (!(n > 0 && n <= 5)) return false; set({ junctionSize: n === 1.4 ? undefined : n }); }} />
            <span className="muted small">mm</span>
          </span>
        </Row>}
        <Row label={tx('Carattere dei testi')}>
          <select value={l.font ?? 'sans'} onChange={e => set({ font: e.target.value === 'sans' ? undefined : e.target.value as LookFont })}
            title={tx('Sullo schema, nel PDF e nella stampa (il PDF usa i caratteri standard Helvetica, Times e Courier)')}>
            {LOOK_FONTS.map(([v, n]) => <option key={v} value={v}>{tx(n)}</option>)}
          </select>
        </Row>
      </Group>
    </>
  );
}

/** Interruttore di una proprietà dei fili selezionati (acceso se è mostrata su tutti) */
function wireVis(wires: Wire[], key: WireVisKey): Vis {
  const { project, pageId } = useStore.getState();
  const settings = settingsOf(project);
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  return {
    on: wires.every(w => wireLabelShown(w, key, settings, wireAtPotential(project, page, w))),
    set: on => useStore.getState().setWireShow(wires.map(w => w.id), key, on),
  };
}

/** withNumber: con più fili selezionati, anche l'interruttore mostra/nascondi del numero filo */
/**
 * Più simboli selezionati: morsettiera o connettore di tutti i morsetti e pin insieme, e le
 * proprietà da mostrare o nascondere sullo schema per tutti (occhio = mostrata su tutti)
 */
function MultiSymbolRows({ insts }: { insts: SymbolInstance[] }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const devices = buildDevices(project);
  const parts = partsIndex(project, library);
  const settings = settingsOf(project);
  const items = insts.map(inst => ({ inst, sym: getSymbol(inst.symbolId, project) })).filter((x): x is { inst: SymbolInstance; sym: NonNullable<typeof x.sym> } => !!x.sym);
  const roles = new Set(items.map(x => x.sym.role));
  const ids = items.map(x => x.inst.id);
  // Morsetti e pin di connettore: la parte prima dei due punti
  const strips = items.filter(x => (x.sym.role === 'terminal' || x.sym.role === 'pin') && x.inst.tag.includes(':'));
  const stripNames = [...new Set(strips.map(x => stripOf(x.inst.tag)))];
  const stripLabel = strips.every(x => x.sym.role === 'terminal') ? tx('Morsettiera') : strips.every(x => x.sym.role === 'pin') ? tx('Connettore') : tx('Morsettiera / connettore');
  // Stato sullo schema di ogni simbolo, come nelle sue Proprietà
  const shown = (x: typeof items[number], k: SymVisKey) => {
    const r = x.sym.role;
    const d = devices.get(r === 'terminal' ? stripOf(x.inst.tag) : x.inst.tag);
    const perInst = ['potential', 'link', 'plc', 'terminal', 'pin'].includes(r) || !d;
    const info = perInst ? deviceInfo([{ inst: x.inst }], { inst: x.inst }, parts) : deviceInfo(d.elements, d.main, parts);
    if (k === 'strip') return x.inst.show?.strip === true;
    return symShown(perInst ? x.inst.show : info.show, k, { showTexts: info.showTexts, settings, sym: d?.main?.sym ?? x.sym });
  };
  const device = items.some(x => !['potential', 'link', 'terminal'].includes(x.sym.role));
  const keys: [SymVisKey, string][] = [
    ['tag', tx('Sigla (DT)')],
    ...(device ? [['description', tx('Descrizione')], ['techData', tx('Dati tecnici')], ['func', tx('Funzione (=)')], ['loc', tx('Luogo (+)')],
      ['note', tx('Note')], ['partNr', tx('Articolo')], ['manufacturer', tx('Costruttore')], ['typeNr', tx('Tipo')], ['orderNr', tx('Codice ordinazione')]] as [SymVisKey, string][] : []),
    ...(roles.has('main') || roles.has('aux') || roles.has('oneline') ? [['xref', tx('Riferimenti incrociati')]] as [SymVisKey, string][] : []),
    ['pins', tx('Designazioni sullo schema')],
    ...(roles.has('terminal') ? [['strip', tx('Sigla della morsettiera sullo schema')]] as [SymVisKey, string][] : []),
    ...(roles.has('plc') ? [['plcAddress', tx('Indirizzo')], ['plcSymbol', tx('Nome simbolico')], ['plcComment', tx('Commento')]] as [SymVisKey, string][] : []),
  ];
  return (
    <>
      {strips.length > 0 && (
        <Row label={stripLabel}>
          <Field value={stripNames.length === 1 ? stripNames[0] : ''} placeholder={tx('valori diversi')}
            onCommit={v => st().setStripMany(strips.map(x => x.inst.id), v)} />
        </Row>
      )}
      <tr className="prop-group"><td colSpan={2}>{tx('Sullo schema ({0} simboli)', items.length)}</td></tr>
      {keys.map(([k, label]) => {
        const n = items.filter(x => shown(x, k)).length;
        return (
          <Row key={k} label={label} vis={{ on: n === items.length, set: on => st().setSymShowMany(ids, k, on) }}>
            <span className="muted small">{n === items.length ? tx('su tutti') : n ? tx('su {0} di {1}', n, items.length) : tx('su nessuno')}</span>
          </Row>
        );
      })}
    </>
  );
}

/** Linea di definizione dei fili: i valori scritti vanno su tutti i fili attraversati */
function WireDefProps({ d }: { d: WireDef }) {
  const st = useStore.getState;
  const page = useStore(s => s.project.pages.find(p => p.id === s.pageId));
  const n = page ? wireDefCrossings(page, d).length : 0;
  const upd = (patch: Partial<WireDef>) => st().updateElement(d.id, patch);
  return (
    <Group title={tx('Definizione dei fili')}>
      <Row label={tx('Fili attraversati')}><span className="muted small">{n}</span></Row>
      <Row label={tx('Sezione (mm²)')}><Field value={d.cross ?? ''} list="wire-sections" placeholder={tx('es. 1,5')} onCommit={v => upd({ cross: v.trim().replace('.', ',') || undefined })} /></Row>
      <tr><td colSpan={2} className="pad-x muted small">{tx('La sezione va su tutti i fili che la linea attraversa; spostando la linea si riapplica.')}</td></tr>
    </Group>
  );
}

function WireDataRows({ wires, withNumber, noLabel }: { wires: Wire[]; withNumber?: boolean; noLabel?: boolean }) {
  const st = useStore.getState;
  const ids = wires.map(w => w.id);
  const same = <K extends 'cross' | 'color' | 'wireType'>(k: K) => (wires.every(w => w[k] === wires[0][k]) ? wires[0][k] ?? '' : undefined);
  const cross = same('cross'), color = same('color'), wireType = same('wireType');
  const lineType = wires.every(w => (w.lineType ?? 'solid') === (wires[0].lineType ?? 'solid')) ? wires[0].lineType ?? 'solid' : undefined;
  const width = wires.every(w => w.width === wires[0].width) ? (wires[0].width === undefined ? '' : String(wires[0].width)) : undefined;
  return (
    <>
      {withNumber && <Row label={tx('Numero filo')} vis={wireVis(wires, 'number')}><span className="muted small">{tx('{0} fili', wires.length)}</span></Row>}
      <Row label={tx('Sezione (mm²)')} vis={wireVis(wires, 'cross')}>
        <Field value={cross ?? ''} placeholder={cross === undefined ? tx('valori diversi') : tx('es. 1,5')} list="wire-sections"
          onCommit={v => st().setWireProps(ids, { cross: v.trim().replace('.', ',') || undefined })} />
      </Row>
      <Row label={tx('Colore')} vis={wireVis(wires, 'color')}>
        <select value={color ?? '*'} onChange={e => st().setWireProps(ids, { color: e.target.value || undefined })}>
          {color === undefined && <option value="*" disabled>{tx('valori diversi')}</option>}
          <option value="">{tx('— non indicato —')}</option>
          {Object.entries(WIRE_COLORS).map(([k, c]) => <option key={k} value={k}>{k} · {c.name}</option>)}
        </select>
      </Row>
      <Row label={tx('Tipo di filo')}>
        <Field value={wireType ?? ''} placeholder={wireType === undefined ? tx('valori diversi') : tx('es. H07V-K')} list="wire-types"
          onCommit={v => st().setWireProps(ids, { wireType: v.trim() || undefined })} />
      </Row>
      <Row label={tx('Tipo di linea')}>
        <select value={lineType ?? '*'} onChange={e => st().setWireProps(ids, { lineType: e.target.value === 'solid' ? undefined : e.target.value as WireLineType })}>
          {lineType === undefined && <option value="*" disabled>{tx('valori diversi')}</option>}
          {WIRE_LINE_TYPES.map(t => <option key={t.id} value={t.id}>{tx(t.name)}</option>)}
        </select>
      </Row>
      <Row label={tx('Spessore (mm)')}>
        <select value={width ?? '*'} onChange={e => st().setWireProps(ids, { width: e.target.value ? parseFloat(e.target.value) : undefined })}>
          {width === undefined && <option value="*" disabled>{tx('valori diversi')}</option>}
          <option value="">{tx('predefinito ({0})', String(WIRE_WIDTH_DEFAULT).replace('.', ','))}</option>
          {WIRE_WIDTHS.map(w => <option key={w} value={String(w)}>{String(w).replace('.', ',')}</option>)}
          {width && !WIRE_WIDTHS.includes(parseFloat(width)) && <option value={width}>{width.replace('.', ',')}</option>}
        </select>
      </Row>
      {!noLabel && <WireLabelStyleRows wires={wires} />}
      <Row label={tx('Di scorta')}>
        <label className="row" title={tx('Conduttore di scorta (es. fili di un cavo portati a morsetti di riserva): niente numero filo, tratteggiato con la scritta «scorta», evidenziato nel disegno del cavo; i morsetti a cui arriva restano di riserva nelle liste. Vale per tutto il conduttore')}>
          <input type="checkbox" checked={wires.every(w => w.spare)} ref={el => { if (el) el.indeterminate = !wires.every(w => w.spare) && wires.some(w => w.spare); }}
            onChange={e => st().setWireProps(ids, { spare: e.target.checked || undefined }, true)} /> {tx('conduttore di scorta, senza numero filo')}
        </label>
      </Row>
      <Row label={tx('Tutto il conduttore')}>
        <button title={tx('Copia sezione, colore, tipo di linea e spessore su tutti i fili collegati (anche le derivazioni)')}
          onClick={() => st().setWireProps(ids, { cross: wires[0].cross, color: wires[0].color, lineType: wires[0].lineType, width: wires[0].width }, true)}>{tx('Applica a tutto il conduttore')}</button>
      </Row>
      {wires.length === 1 && <WireSequenceRow wireId={wires[0].id} />}
    </>
  );
}

/** Sequenza di cablaggio del conduttore: da dove viene e il pulsante per sceglierla a mano */
function WireSequenceRow({ wireId }: { wireId: string }) {
  const project = useStore(s => s.project);
  const info = useMemo(() => {
    const net = computeNetlist(project).wireNet.get(wireId);
    if (!net || net.named || net.pins.length < 3) return undefined;
    return netSequence(sequenceContext(project), net);
  }, [project, wireId]);
  if (!info) return null;
  return (
    <Row label={tx('Sequenza')}>
      <span className="muted small">{tx(SEQ_MODE_NAMES[info.mode])}</span>{' '}
      <button className="mini" title={tx('Ordine in cui il cablatore collega i punti del conduttore (lista connessioni)')} onClick={() => void editWireOrder(wireId)}>{tx('Ordine…')}</button>
    </Row>
  );
}

function PlcPowerProps({ inst }: { inst: SymbolInstance }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  return (
    <Group title={tx('PLC · alimentazione')}>
      <Row label={tx('Scheda')}>
        <select value={inst.tag} onChange={e => st().updateElement(inst.id, { tag: e.target.value })}>
          {!cardByTag(project, inst.tag) && <option value={inst.tag}>{tx('— scheda mancante (-')}{inst.tag}) —</option>}
          {project.plc.cards.map(c => <option key={c.id} value={c.tag}>-{c.tag} · {tx(cardType(c).name)}</option>)}
        </select>
      </Row>
    </Group>
  );
}

function PageProps() {
  const project = useStore(s => s.project);
  const tbLibrary = useStore(s => s.tbLibrary);
  const pageId = useStore(s => s.pageId);
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  const st = useStore.getState;
  return (
    <Group title={tx('Pagina {0}', page.name)}>
      <Row label={tx('Numero')}><Field value={page.name} onCommit={v => st().updatePage(page.id, { name: v })} /></Row>
      <Row label={tx('Descrizione')}><Field wrap value={page.title} onCommit={v => st().updatePage(page.id, { title: v })} /></Row>
      <Row label={tx('Luogo (sezione)')}>
        <select value={page.panelId ?? ''} onChange={e => {
          const v = e.target.value === '+' ? st().addPanel().id : e.target.value;
          st().updatePage(page.id, { panelId: v || undefined });
        }}>
          <option value="">{tx('— generale —')}</option>
          {(project.panels ?? []).map(p => <option key={p.id} value={p.id}>{panelLabel(p)}</option>)}
          <option value="+">{tx('+ nuovo luogo')}</option>
        </select>
      </Row>
      <Row label={tx('Cartiglio')}>
        <select value={page.titleBlockId ?? ''} onChange={e => st().useTitleBlock(e.target.value, page.id)}>
          <option value="">{tx('come il progetto (')}{templateFor(project).name})</option>
          {titleBlockTemplates(project, tbLibrary).map(t => <option key={t.id} value={t.id}>{t.builtin ? tx(t.name) : t.name}</option>)}
        </select>
      </Row>
      {isListPage(page) && <Row label={tx('Lista')}>
        <button onClick={() => st().openListStyleOf(page)} title={tx('Tutte le modifiche della lista in una finestra (anche con il tasto destro sulla pagina)')}>{tx('Personalizza la lista…')}</button>
      </Row>}
      {page.type === 'cover' && <Row label={tx('Copertina')}>
        <button onClick={() => st().setDialog('cover')} title={tx('Logo, caratteri, posizioni, righe dei dati, revisioni e firme')}>{tx('Personalizza…')}</button>
      </Row>}
      <Row label={tx('Elementi')}>{page.elements.length}</Row>
      <UserPropRows assign="page" values={page.userProps} target={{ kind: 'page', pageId: page.id }} />
    </Group>
  );
}

const INFO_LABELS: [keyof ProjectInfo, string][] = [
  ['name', tn('Nome progetto')], ['description', tn('Descrizione')], ['company', tn('Ditta')], ['customer', tn('Cliente')],
  ['author', tn('Autore')], ['drawingNr', tn('N. disegno')], ['revision', tn('Revisione')], ['date', tn('Data')],
];

/** Sceglie un'immagine per il logo del cartiglio (PNG, JPG o SVG) e la salva nel progetto */
async function pickLogo() {
  const [f] = await openFiles([{ name: 'Immagine', extensions: ['png', 'jpg', 'jpeg', 'svg'] }]);
  if (!f) return;
  const ext = f.name.split('.').pop()?.toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
  let bin = '';
  f.data.forEach(b => { bin += String.fromCharCode(b); });
  useStore.getState().updateTitleBlock({ logo: `data:${mime};base64,${btoa(bin)}` });
}

/** Proprietà definite dall'utente per il progetto */
export function ProjectUserPropsSection() {
  const values = useStore(s => s.project.userPropValues);
  return <UserPropGroup assign="project" values={values} target={{ kind: 'project' }} />;
}

export function TitleBlockSection() {
  const tbLibrary = useStore(s => s.tbLibrary);
  const project = useStore(s => s.project);
  const st = useStore.getState;
  return (
    <Group title={tx('Cartiglio')}>
      <Row label={tx('Modello')}>
        <select value={templateFor(project).id} onChange={e => st().useTitleBlock(e.target.value)}>
          {titleBlockTemplates(project, tbLibrary).map(t => <option key={t.id} value={t.id}>{t.builtin ? tx(t.name) : t.name}{t.builtin ? '' : tx(' (personale)')}</option>)}
        </select>
      </Row>
      <Row label="">
        <button onClick={() => st().openTitleBlockEditor(templateFor(project))}
          title={tx('Apre il modello nell\'editor (i modelli inclusi vengono copiati)')}>{templateFor(project).builtin ? tx('Personalizza…') : tx('Modifica…')}</button>{' '}
        <button onClick={() => st().openTitleBlockEditor()}>{tx('Nuovo…')}</button>{' '}
        {!templateFor(project).builtin && <button onClick={async () => {
          const t = templateFor(project);
          if (await askConfirm(tx('Conferma'), tx('Eliminare il cartiglio "{0}" dal progetto e dalla libreria personale?', t.name), tx('Elimina'))) st().deleteTitleBlock(t.id);
        }}>{tx('Elimina')}</button>}
      </Row>
      <Row label={tx('Logo')}>
        {project.titleBlock?.logo && <img src={project.titleBlock.logo} alt="logo" className="tb-logo" />}
        <button onClick={() => void pickLogo()}>{project.titleBlock?.logo ? tx('Cambia…') : tx('Scegli immagine…')}</button>
        {project.titleBlock?.logo && <button onClick={() => st().updateTitleBlock({ logo: undefined })}>✕</button>}
      </Row>
      <Row label={tx('Indirizzo ditta')}><Field value={project.titleBlock?.address ?? ''} placeholder={tx('es. Via Roma 1, Milano')} onCommit={v => st().updateTitleBlock({ address: v.trim() || undefined })} /></Row>
      {(project.titleBlock?.fields ?? []).map((f, k) => (
        <Row key={k} label={tx('Campo {0}', k + 1)}>
          <span className="panel-row">
            <Field value={f.label} placeholder={tx('Etichetta')} onCommit={v => st().updateTitleBlock({ fields: (project.titleBlock?.fields ?? []).map((x, j) => (j === k ? { ...x, label: v } : x)) })} />
            <Field value={f.value} placeholder={tx('Valore')} onCommit={v => st().updateTitleBlock({ fields: (project.titleBlock?.fields ?? []).map((x, j) => (j === k ? { ...x, value: v } : x)) })} />
            <button onClick={() => st().updateTitleBlock({ fields: (project.titleBlock?.fields ?? []).filter((_, j) => j !== k) })}>✕</button>
          </span>
        </Row>
      ))}
      <Row label=""><button onClick={() => st().updateTitleBlock({ fields: [...(project.titleBlock?.fields ?? []), { label: tx('Commessa'), value: '' }] })}>{tx('+ Campo (es. Commessa, Impianto)')}</button></Row>
    </Group>
  );
}

export function TemplatesSection() {
  const templates = useStore(s => s.templates);
  const st = useStore.getState;
  return (
    <Group title={tx('Modelli di progetto')}>
      {templates.map(t => (
        <Row key={t.id} label={t.name}>
          <button onClick={() => newFromTemplate(t.id)}>{tx('Nuovo progetto')}</button>{' '}
          <button onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Eliminare il modello "{0}"?', t.name), tx('Elimina'))) st().deleteTemplate(t.id); }}>✕</button>
        </Row>
      ))}
      <Row label="">
        <button onClick={saveAsTemplate}
          title={tx('Salva impostazioni, cartiglio, luoghi e copertina come base per i nuovi progetti')}>{tx('Salva questo progetto come modello…')}</button>
      </Row>
    </Group>
  );
}

export function RevisionsSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const s = settingsOf(project);
  return (
    <Group title={tx('Revisioni')}>
      {(project.revisions ?? []).map(r => (
        <Row key={r.id} label={tx('Rev. {0}', r.index)}>
          <span title={tx('Pagine: {0}', r.pages.join(', ') || '—')}>{`${r.date} · ${r.author || '—'} · ${r.description || '—'}`}</span>
        </Row>
      ))}
      <Row label="">
        <button onClick={() => st().setDialog('revisions')} title={tx('Stato del progetto, rilascio, revisione nuova, revisioni archiviate')}>{tx('Revisioni…')}</button>{' '}
        <button onClick={() => void compareWithFile()} title={tx('Confronta con un altro file .ecad')}>{tx('Confronta…')}</button>
      </Row>
      <Row label={tx('Formato dell\'indice')}>
        <select value={s.revisionFormat ?? 'A'} onChange={e => st().updateSettings({ revisionFormat: e.target.value as RevisionFormat })}>
          {REVISION_FORMATS.map(f => <option key={f} value={f}>{[0, 1, 2].map(k => formatRevisionIndex(f, k)).join(', ')}…</option>)}
        </select>
      </Row>
      <Row label={tx('Pagine inserite in revisione')}>
        <select value={s.revisionPageNo ?? '-'} onChange={e => st().updateSettings({ revisionPageNo: e.target.value as '-' | '.' | 'letter' })}
          title={tx('Numero proposto per una pagina nuova in mezzo alle altre durante una revisione; si può sempre scrivere quello che si vuole')}>
          <option value="-">{tx('12-B (numero e indice)')}</option>
          <option value=".">{tx('12.B (numero e indice)')}</option>
          <option value="letter">{tx('12A (lettera)')}</option>
        </select>
      </Row>
      <Row label={tx('Nuvolette sulle modifiche')}>
        <input type="checkbox" checked={s.showRevisionClouds} onChange={e => st().updateSettings({ showRevisionClouds: e.target.checked })} />
      </Row>
    </Group>
  );
}

export function PlacesSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  return (
    <Group title={tx('Luoghi (contenitori: quadri, pulsantiere…)')}>
      {(project.panels ?? []).map(p => (
        <Row key={p.id} label={`+${p.code}`}>
          <span className="panel-row">
            <Field value={p.code} onCommit={v => v.trim() && st().updatePanel(p.id, { code: v.replace(/^\+/, '').trim() })} />
            <Field value={p.name} placeholder={tx('Nome')} onCommit={v => st().updatePanel(p.id, { name: v.trim() })} />
            <button title={tx('Elimina il luogo (le pagine tornano generali)')} onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Eliminare il luogo +{0}?', p.code), tx('Elimina'))) st().deletePanel(p.id); }}>✕</button>
          </span>
          <select className="panel-kind" value={p.kind ?? ''} onChange={e => st().updatePanel(p.id, { kind: e.target.value || undefined })}>
            <option value="">{tx('— tipo —')}</option>
            {PANEL_KINDS.map(k => <option key={k} value={k}>{tx(k)}</option>)}
          </select>
          {(project.panels ?? []).length > 1 && (
            <select className="panel-kind" value={p.parentId ?? ''} title={tx('Sottoquadro: il luogo che lo contiene (es. una pulsantiera montata sul quadro)')}
              onChange={e => st().updatePanel(p.id, { parentId: e.target.value || undefined })}>
              <option value="">{tx('— dentro a nessuno —')}</option>
              {(project.panels ?? []).filter(o => o.id !== p.id && !panelAncestors(o, project.panels ?? []).some(a => a.id === p.id)).map(o => <option key={o.id} value={o.id}>{tx('dentro a {0}', panelLabel(o, project.panels))}</option>)}
            </select>
          )}
        </Row>
      ))}
      <Row label=""><button onClick={addPlace}>{tx('+ Luogo')}</button></Row>
    </Group>
  );
}

export function InfoSection() {
  const info = useStore(s => s.project.info);
  const st = useStore.getState;
  return (
    <Group title={tx('Progetto (cartiglio)')}>
      {INFO_LABELS.map(([k, l]) => (
        <Row key={k} label={tx(l)}><Field value={info[k]} type={k === 'date' ? 'date' : 'text'} onCommit={v => st().updateInfo({ [k]: v })} /></Row>
      ))}
    </Group>
  );
}

export function TagsSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const s = settingsOf(project);
  const ex = (f: string) => formatPattern(f, { pagina: '200', colonna: 4, lettera: 'K', n: 1, quadro: project.panels?.[0]?.code ?? 'Q1' });
  return (
    <Group title={tx('Sigle dispositivi')}>
      <Row label={tx('Modello')}><Field value={s.tagFormat} list="tag-formats" onCommit={v => st().updateSettings({ tagFormat: v || '{lettera}{n}' })} /></Row>
      <Row label={tx('Esempio (pag. 200)')}><b>-{ex(s.tagFormat)}</b></Row>
      <Row label={tx('Contatore')}>
        <select value={s.tagScope} onChange={e => st().updateSettings({ tagScope: e.target.value as 'page' | 'project' })}>
          <option value="page">{tx('riparte su ogni pagina')}</option>
          <option value="project">{tx('unico nel progetto')}</option>
        </select>
      </Row>
      <Row label={tx('Applica')}>
        <button onClick={renumberDevices}>{tx('Rinumera dispositivi')}</button>
      </Row>
      <Row label={tx('Contatti delle bobine')}>
        <select value={s.contactImage ?? 'bottom'} onChange={e => st().updateSettings({ contactImage: e.target.value as 'bottom' | 'symbol' })}
          title={tx('Dove scrivere l\'elenco dei contatti (immagine contatti) di bobine e dispositivi principali')}>
          <option value="bottom">{tx('in fondo alla pagina')}</option>
          <option value="symbol">{tx('sotto il simbolo')}</option>
        </select>
      </Row>
      <Row label={tx('Disegno dei contatti')}>
        <select value={s.contactImageStyle ?? 'symbols'} onChange={e => st().updateSettings({ contactImageStyle: e.target.value as 'symbols' | 'text' })}
          title={tx('Simboli: ogni contatto disegnato in orizzontale con i morsetti e il rimando; testo: elenco compatto con un disegnino')}>
          <option value="symbols">{tx('simboli dei contatti')}</option>
          <option value="text">{tx('testo compatto')}</option>
        </select>
      </Row>
    </Group>
  );
}

export function WiresSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const s = settingsOf(project);
  const ex = (f: string) => formatPattern(f, { pagina: '200', colonna: 4, lettera: 'K', n: 1, quadro: project.panels?.[0]?.code ?? 'Q1' });
  return (
    <Group title={tx('Numeri filo')}>
      <Row label={tx('Mostra')}><input type="checkbox" checked={s.showWireNumbers} onChange={e => st().updateSettings({ showWireNumbers: e.target.checked })} /></Row>
      <Row label={tx('Niente numero sui fili più corti di')}>
        <span className="color-row" title={tx('Per esempio il tratto fino a un rimando vicino, dove i numeri si sovrappongono. Su un filo si può mostrare lo stesso: selezionalo e accendi il numero nelle sue proprietà. 0 = numero su tutti i fili')}>
          <Field type="number" value={String(s.wireNoMinLength ?? 0)} onCommit={v => { const n = Math.max(0, parseFloat(v.replace(',', '.')) || 0); st().updateSettings({ wireNoMinLength: n || undefined }); }} />
          <span className="muted small">mm</span>
        </span>
      </Row>
      <Row label={tx('Sezione e colore')}><input type="checkbox" checked={s.showWireData} onChange={e => st().updateSettings({ showWireData: e.target.checked })} /></Row>
      <Row label={tx('Sezione e colore scritti')}>
        <select value={s.wireDataTick === false ? 'number' : 'tick'} onChange={e => st().updateSettings({ wireDataTick: e.target.value === 'tick' })}
          title={tx('Sulla lineetta obliqua: si trascina lungo il filo; l\'altezza del testo è in Aspetto ▸ Testi')}>
          <option value="tick">{tx('sulla lineetta obliqua')}</option>
          <option value="number">{tx('accanto al numero filo')}</option>
        </select>
      </Row>
      <Row label={tx('Fili colorati')}><input type="checkbox" checked={s.drawWireColors} onChange={e => st().updateSettings({ drawWireColors: e.target.checked })} /></Row>
      <Row label={tx('Numerazione')}>
        <select value={s.wireNumbering} onChange={e => st().updateSettings({ wireNumbering: e.target.value as 'fixed' | 'live' })}>
          <option value="fixed">{tx('bloccata (i numeri non cambiano)')}</option>
          <option value="live">{tx('ricalcolata a ogni modifica')}</option>
        </select>
      </Row>
      <Row label={tx('Applica')}>
        <button onClick={renumberWires}>{tx('Rinumera fili')}</button>
      </Row>
      <Row label={tx('Modello')}>
        <span title={tx('{pagina}, {colonna}, {quadro} (codice del quadro), {n} (contatore), {n:2} (almeno 2 cifre: 01), {n:A} o {n:a} (contatore in lettere: A, B… Z, AA)')}>
          <Field value={s.wireFormat} list="wire-formats" onCommit={v => st().updateSettings({ wireFormat: v || '{pagina}.{n:2}' })} />
        </span>
      </Row>
      <Row label={tx('Esempio (pag. 200)')}><b>{ex(s.wireFormat)}</b></Row>
      <Row label={tx('Contatore')}>
        <select value={s.wireScope} onChange={e => st().updateSettings({ wireScope: e.target.value as 'page' | 'project' | 'panel' })}>
          <option value="page">{tx('riparte su ogni pagina')}</option>
          <option value="panel">{tx('riparte su ogni quadro')}</option>
          <option value="project">{tx('unico nel progetto')}</option>
        </select>
      </Row>
      {s.wireScope !== 'page' && (
        <Row label={tx('Riserva per pagina')}>
          <span className="color-row" title={tx('Numeri lasciati liberi dopo ogni pagina: i fili aggiunti poi a una pagina restano nella sua serie e le pagine seguenti non cambiano numero. 0 = nessuna riserva')}>
            <Field type="number" value={String(s.wireReserve ?? 0)} onCommit={v => { const n = Math.max(0, Math.floor(parseFloat(v) || 0)); st().updateSettings({ wireReserve: n || undefined }); }} />
            <span className="muted small">{tx('numeri')}</span>
          </span>
        </Row>
      )}
      <Row label={tx('Ordine sulla pagina')}>
        <select value={s.wireOrder ?? ''} onChange={e => st().updateSettings({ wireOrder: e.target.value === 'rows' ? 'rows' : undefined })}>
          <option value="">{tx('per colonne (da sinistra a destra)')}</option>
          <option value="rows">{tx('per righe (dall\'alto in basso)')}</option>
        </select>
      </Row>
      <Row label={tx('Potenziali (L1, N, PE)')}>
        <select value={s.wireKeepPotentialNames ? '1' : '0'} onChange={e => st().updateSettings({ wireKeepPotentialNames: e.target.value === '1' })}>
          <option value="1">{tx('mostra il nome')}</option>
          <option value="0">{tx('numera come gli altri')}</option>
        </select>
      </Row>
      <Row label={tx('Fili del PLC')}>
        <select value={s.wirePlcNames ? '1' : '0'} onChange={e => st().updateSettings({ wirePlcNames: e.target.value === '1' })} title={tx('Fili collegati a un canale PLC: nome dall\'indirizzo (I0.3; con 2 morsetti per canale I0.3A e I0.3B), anche attraverso i morsetti; i rimandi prendono lo stesso nome')}>
          <option value="0">{tx('numera come gli altri')}</option>
          <option value="1">{tx('nome dall\'indirizzo (I0.3, I0.3A / B)')}</option>
        </select>
      </Row>
    </Group>
  );
}

export function DrawingSection() {
  const st = useStore.getState;
  const s = settingsOf(useStore(s => s.project));
  return (
    <Group title={tx('Disegno')}>
      <Row label={tx('Descrizioni sullo schema')}>
        <input type="checkbox" checked={s.showDeviceTexts} onChange={e => st().updateSettings({ showDeviceTexts: e.target.checked })} />
      </Row>
      <Row label={tx('Passo griglia')}>
        <select value={s.grid} onChange={e => st().updateSettings({ grid: parseFloat(e.target.value) })}>
          {[1, 2, 4, 5, 8].map(g => <option key={g} value={g}>{g} {tx('mm')}{g === 4 ? tx(' (standard)') : ''}</option>)}
        </select>
      </Row>
      <Row label={tx('Testi dei morsetti')}>
        <select value={s.terminalText ?? 'auto'} onChange={e => st().updateSettings({ terminalText: e.target.value === 'auto' ? undefined : e.target.value as TerminalTextDir })}>
          {TERM_TEXT_DIRS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
        </select>
      </Row>
      <Row label={tx('Riquadri dei connettori sullo schema')}>
        <input type="checkbox" checked={s.connectorFrames !== false} onChange={e => st().updateSettings({ connectorFrames: e.target.checked ? undefined : false })}
          title={tx('Riquadro tratteggiato attorno ai pin dello stesso connettore, con sigla, tipo e genere (si toglie anche per un solo connettore nella vista Connettori)')} />
      </Row>
      <Row label={tx('Testi dei simboli spostabili sullo schema')}>
        <input type="checkbox" checked={!!s.freeSymbolTexts} onChange={e => st().updateSettings({ freeSymbolTexts: e.target.checked || undefined })}
          title={tx('Spento: sigle, designazioni dei punti di connessione e testi dei morsetti restano dove li mette l\'editor dei simboli per ogni rotazione. Acceso: si possono trascinare anche sullo schema (gli spostamenti fatti restano salvati anche spegnendolo)')} />
      </Row>
      <Row label={tx('Formato degli indirizzi PLC')}>
        <select value={s.plcAddressFormat} onChange={e => st().updateSettings({ plcAddressFormat: e.target.value as PlcAddressFormat })}>
          {(Object.keys(FORMAT_LABELS) as PlcAddressFormat[]).map(f => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
        </select>
      </Row>
      <Row label={tx('Collegamento automatico')}>
        <input type="checkbox" checked={s.autoConnect !== false} onChange={e => st().updateSettings({ autoConnect: e.target.checked })}
          title={tx('Inserendo o spostando un simbolo, i punti di connessione liberi si collegano da soli ai punti affacciati sulla stessa linea')} />
      </Row>
    </Group>
  );
}

export function FixedPosSection() {
  const st = useStore.getState;
  const s = settingsOf(useStore(s => s.project));
  return (
    <Group title={tx('Posizioni fisse')}>
      {(['top', 'bottom'] as const).map(w => {
        const r = railOf(s, w);
        const set = (patch: Partial<RailSetting>) => st().updateSettings(w === 'top' ? { railTop: { ...r, ...patch } } : { railBottom: { ...r, ...patch } });
        const num = (k: 'y' | 'step' | 'x0' | 'x1') => <Field type="number" value={String(r[k])} onCommit={v => { const n = parseFloat(v.replace(',', '.')); if (!isFinite(n) || (k === 'step' && n <= 0)) return false; set({ [k]: n }); }} />;
        return (
          <Fragment key={w}>
            <Row label={w === 'top' ? tx('Fili in alto: primo a y') : tx('Fili in basso: primo a y')}>{num('y')}</Row>
            <Row label={tx('Passo tra i fili')}>
              <div className="nowrap">{num('step')}{w === 'bottom' && (
                <select value={r.up ? 'up' : 'down'} onChange={e => set({ up: e.target.value === 'up' })}>
                  <option value="down">{tx('i successivi sotto')}</option><option value="up">{tx('i successivi sopra')}</option>
                </select>
              )}</div>
            </Row>
            <Row label={tx('Da x a x')}><div className="nowrap">{num('x0')}{num('x1')}</div></Row>
          </Fragment>
        );
      })}
      <Row label={tx('Punti I/O PLC su una riga fissa')}>
        <input type="checkbox" checked={!!s.plcRow} onChange={e => st().updateSettings({ plcRow: e.target.checked ? { ...PLC_ROW_DEFAULT } : undefined })}
          title={tx('Inserendo un punto I/O PLC o un gruppo di I/O, va sulla riga alla quota scelta, nel posto più vicino al mouse: tutte le pagine uguali')} />
      </Row>
      {s.plcRow && (() => {
        const r = s.plcRow;
        const num = (k: 'y' | 'yOut' | 'x0' | 'step') => <Field type="number" value={String(r[k] ?? PLC_ROW_DEFAULT.yOut)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); if (!isFinite(n) || (k === 'step' && n <= 0)) return false; st().updateSettings({ plcRow: { ...r, [k]: n } }); }} />;
        return <>
          <Row label={tx('Riga PLC ingressi a y')}>{num('y')}</Row>
          <Row label={tx('Riga PLC uscite a y')}>{num('yOut')}</Row>
          <Row label={tx('Primo posto a x, passo')}><div className="nowrap">{num('x0')}{num('step')}</div></Row>
        </>;
      })()}
    </Group>
  );
}

/** Formato del foglio, margini della cornice, colonne e righe */
export function SheetSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const cur = settingsOf(project).sheet ?? {};
  const sh = sheetOf(settingsOf(project));
  const set = (patch: Partial<SheetSettings>) => {
    const next: SheetSettings = { ...cur, ...patch };
    for (const k of Object.keys(next) as (keyof SheetSettings)[]) if (next[k] === undefined) delete next[k];
    st().updateSettings({ sheet: Object.keys(next).length ? next : undefined });
  };
  const num = (k: 'left' | 'top' | 'right' | 'columns' | 'rows', min: number, max: number, def: number) => (
    <Field type="number" value={String(cur[k] ?? def)} onCommit={v => {
      const n = parseFloat(v.replace(',', '.'));
      if (!isFinite(n) || n < min || n > max) return false;
      set({ [k]: n === def ? undefined : n });
    }} />
  );
  // Elementi che restano fuori dal foglio (cambiare formato non sposta niente)
  const outside = project.pages.reduce((n, pg) => n + pg.elements.filter(e =>
    e.kind === 'symbol' || e.kind === 'text' ? e.x > sh.w || e.y > sh.h : e.kind === 'wire' ? e.points.some(p => p.x > sh.w || p.y > sh.h) : false).length, 0);
  return (
    <Group title={tx('Foglio')}>
      <Row label={tx('Formato')}>
        <span className="nowrap">
          <select value={sh.size} onChange={e => set({ size: e.target.value === 'A3' ? undefined : e.target.value as SheetSize })}>
            {(Object.keys(SHEET_SIZES) as SheetSize[]).map(k => <option key={k} value={k}>{k} ({SHEET_SIZES[k][0]} × {SHEET_SIZES[k][1]} mm)</option>)}
          </select>
          <select value={sh.portrait ? 'p' : 'l'} onChange={e => set({ portrait: e.target.value === 'p' || undefined })}>
            <option value="l">{tx('orizzontale')}</option>
            <option value="p">{tx('verticale')}</option>
          </select>
        </span>
      </Row>
      {outside > 0 && <Row label=""><span className="small warn-text">{tx('{0} elementi restano fuori dal foglio: cambiare formato non sposta quello che è già disegnato.', outside)}</span></Row>}
      <Row label={tx('Margine sinistro (rilegatura)')}><span className="color-row">{num('left', 5, 60, SHEET_DEFAULT.left)}<span className="muted small">mm</span></span></Row>
      <Row label={tx('Margine in alto')}><span className="color-row">{num('top', 6, 60, SHEET_DEFAULT.top)}<span className="muted small">mm</span></span></Row>
      <Row label={tx('Margine destro')}><span className="color-row">{num('right', 5, 60, SHEET_DEFAULT.right)}<span className="muted small">mm</span></span></Row>
      <Row label={tx('Colonne')}>{num('columns', 1, 40, SHEET_DEFAULT.columns)}</Row>
      <Row label={tx('Righe (A, B, C…)')}>
        <span className="color-row">{num('rows', 0, 26, 0)}<span className="muted small">{tx('0 = nessuna')}</span></span>
      </Row>
      <Row label={tx('Riferimenti con la riga')}>
        <input type="checkbox" checked={sh.xrefRows} disabled={!sh.rows} onChange={e => set({ xrefRows: e.target.checked || undefined })}
          title={tx('Riferimenti incrociati con colonna e riga, es. 200.3B (servono le righe)')} />
      </Row>
      <Row label={tx('Area di disegno')}>
        <span className="small muted">{tx('x {0}…{1}, y {2}…{3} mm; il cartiglio sta in basso a destra, rimpicciolito se è più largo della cornice', sh.left, sh.w - sh.right, sh.top, sh.h - 45)}</span>
      </Row>
    </Group>
  );
}

/** Liste del progetto come pagine e loro impaginazione */
export function ListsSection() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const titles = [...new Set(project.pages.flatMap(p => (p.type === 'report' && p.report ? [p.report] : [])))];
  return (
    <Group title={tx('Liste')}>
      <Row label={tx('Pagine di lista')}>
        <button onClick={() => st().setDialog('reportPages')} title={tx('Indice, distinta, lista d\'acquisto, dispositivi, morsetti, fili, cavi… come pagine del progetto, ordine e prefissi')}>{tx('Pagine automatiche (liste)…')}</button>
      </Row>
      <Row label={tx('Liste personalizzate')}>
        <button onClick={() => st().setDialog('customLists')} title={tx('Liste nuove dalle liste del progetto: colonne, filtri, ordinamento e raggruppamento')}>{tx('Liste personalizzate…')} ({(settingsOf(project).customLists ?? []).length})</button>
      </Row>
      <Row label={tx('Personalizza la lista')}>
        {titles.length
          ? <select value="" onChange={e => { if (e.target.value) st().openReportStyle(e.target.value); }}>
              <option value="">{tx('— scegli la lista —')}</option>
              {titles.map(t => <option key={t} value={t}>{tx(t)}</option>)}
            </select>
          : <span className="muted small">{tx('Nessuna pagina di lista nel progetto')}</span>}
      </Row>
    </Group>
  );
}

/** Suggerimenti dei modelli di sigla e numero filo (i datalist non possono stare direttamente nella tabella) */
export function SettingsDatalists() {
  return (
    <tr hidden><td>
      <datalist id="tag-formats">
        {['{pagina}{lettera}{n}', '{lettera}{n}', '{pagina}{lettera}{n:2}', '{pagina}.{colonna}{lettera}', '{pagina}{colonna}{lettera}{n}'].map(f => <option key={f} value={f} />)}
      </datalist>
      <datalist id="wire-formats">
        {['{pagina}.{n:2}', '{pagina}{n:2}', '{n}', '{pagina}.{colonna}.{n}', '{quadro}.{n:3}', '{pagina}.{n:A}'].map(f => <option key={f} value={f} />)}
      </datalist>
    </td></tr>
  );
}

/** Tutte le impostazioni del progetto in un elenco (riquadro Proprietà senza selezione) */
export function ProjectProps() {
  return (
    <>
      <ProjectUserPropsSection />
      <Locked part="sheet"><SheetSection /></Locked>
      <Locked part="titleBlock"><TitleBlockSection /></Locked>
      <TemplatesSection />
      <Locked part="revisions"><RevisionsSection /></Locked>
      <PlacesSection />
      <Locked part="texts"><TextStylesGroup /></Locked>
      <Locked part="look"><LookSection /></Locked>
      <LanguagesGroup />
      <IpNetworksGroup />
      <InfoSection />
      <Locked part="tags"><TagsSection /></Locked>
      <Locked part="wires"><WiresSection /></Locked>
      <Locked part="drawing"><DrawingSection /></Locked>
      <Locked part="fixed"><FixedPosSection /></Locked>
      <SettingsDatalists />
    </>
  );
}

/** Ramo dell'albero delle impostazioni: pagine con le impostazioni (keys = quelle rimesse ai valori predefiniti) */
/** L'id della pagina è anche quello della parte dei profili (settingsProfiles.ts) che può essere bloccata */
/** free: contenuto libero (una finestra incorporata) invece della tabella delle proprietà */
export interface SettingsLeaf { id: string; title: string; keys?: (keyof ProjectSettings)[]; free?: boolean; render: () => React.ReactNode }
/** free: pagine con contenuto libero invece della tabella delle proprietà */
export interface SettingsBranch { id: string; title: string; leaves: SettingsLeaf[]; free?: boolean }

/** Albero delle impostazioni del progetto (Progetto ▸ Impostazioni del progetto) */
export const SETTINGS_TREE: SettingsBranch[] = [
  { id: 'project', title: tn('Progetto'), leaves: [
    { id: 'info', title: tn('Dati del progetto'), render: () => <><InfoSection /><ProjectUserPropsSection /></> },
    { id: 'places', title: tn('Luoghi'), render: () => <PlacesSection /> },
    { id: 'revisions', title: tn('Revisioni'), keys: partKeys('revisions'), render: () => <Locked part="revisions"><RevisionsSection /></Locked> },
    { id: 'languages', title: tn('Lingue'), render: () => <LanguagesGroup /> },
    { id: 'ip', title: tn('Reti IP'), render: () => <IpNetworksGroup /> },
    { id: 'templates', title: tn('Modelli di progetto'), render: () => <TemplatesSection /> },
  ] },
  { id: 'sheet', title: tn('Foglio'), leaves: [
    { id: 'sheet', title: tn('Formato e cornice'), keys: partKeys('sheet'), render: () => <Locked part="sheet"><SheetSection /></Locked> },
    { id: 'titleBlock', title: tn('Cartiglio'), render: () => <Locked part="titleBlock"><TitleBlockSection /></Locked> },
  ] },
  { id: 'numbering', title: tn('Numerazione'), leaves: [
    { id: 'tags', title: tn('Sigle dispositivi'), keys: partKeys('tags'), render: () => <Locked part="tags"><TagsSection /></Locked> },
    { id: 'wires', title: tn('Numeri filo'), keys: partKeys('wires'), render: () => <Locked part="wires"><WiresSection /></Locked> },
  ] },
  { id: 'look', title: tn('Aspetto'), leaves: [
    { id: 'texts', title: tn('Testi'), keys: partKeys('texts'), render: () => <Locked part="texts"><TextStylesGroup /></Locked> },
    { id: 'look', title: tn('Linee, colori e giunzioni'), keys: partKeys('look'), render: () => <Locked part="look"><LookSection /></Locked> },
  ] },
  { id: 'drawing', title: tn('Disegno'), leaves: [
    { id: 'drawing', title: tn('Disegno e collegamenti'), keys: partKeys('drawing'), render: () => <Locked part="drawing"><DrawingSection /></Locked> },
    { id: 'fixed', title: tn('Posizioni fisse'), keys: partKeys('fixed'), render: () => <Locked part="fixed"><FixedPosSection /></Locked> },
  ] },
  { id: 'lists', title: tn('Liste'), leaves: [
    { id: 'lists', title: tn('Pagine di lista'), keys: partKeys('lists'), render: () => <Locked part="lists"><ListsSection /></Locked> },
  ] },
];

/** Rappresentazione (riferimento a coppie): il contatto vero, dove andare e come renderla un contatto vero */
function PairRow({ inst }: { inst: SymbolInstance }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const real = allPlaced(project).find(e => e.inst.id === inst.pairOf);
  return (
    <>
    <Row label={tx('Rappresentazione di')}>
      <span title={tx('Solo disegno: non conta come contatto, non si collega e non entra nelle liste. Sigla e morsetti seguono il contatto vero')}>
        {real ? <button className="link" onClick={() => { st().setPage(real.page.id); st().setSelection([real.inst.id]); }}>-{real.inst.tag} /{locationOf(real)}</button>
          : <span className="muted">{tx('contatto non più presente')}</span>}{' '}
        <button className="mini" onClick={() => st().updateElement(inst.id, { pairOf: undefined, pairCompact: undefined, pairSize: undefined })} title={tx('Diventa un contatto vero, con i suoi collegamenti')}>{tx('Rendi contatto vero')}</button>
      </span>
    </Row>
    {real && <ContactPlaceRow realId={real.inst.id} />}
    <Row label={tx('Disegno')}>
      <select value={inst.pairCompact ? 'compact' : 'full'} onChange={e => st().updateElement(inst.id, { pairCompact: e.target.value === 'compact' ? true : undefined })}
        title={tx('Ridotto: solo il disegnino del contatto con morsetti e pagina, senza sigla, da mettere accanto all\'elemento principale. Ruota (R) per averlo in verticale o in orizzontale')}>
        <option value="compact">{tx('ridotto (morsetti e pagina)')}</option>
        <option value="full">{tx('simbolo intero con la sigla')}</option>
      </select>
    </Row>
    {inst.pairCompact && (
      <Row label={tx('Altezza dei testi (mm)')}>
        <Field type="number" value={inst.pairSize === undefined ? '' : String(inst.pairSize)} placeholder={tx('progetto ({0})', String(textStylesOf(settingsOf(project)).xref.size).replace('.', ','))}
          onCommit={v => { const n = parseFloat(v.replace(',', '.')); st().updateElement(inst.id, { pairSize: n > 0 ? n : undefined }); }} />
      </Row>
    )}
    </>
  );
}

/**
 * Dove si rappresenta il contatto: nell'immagine dei contatti in fondo alla pagina (predefinito), a
 * fianco dell'apparecchio (posizione automatica sulla linea del comando), libero in verticale o in
 * orizzontale (si sposta dove si vuole). Un contatto ha una sola rappresentazione
 */
function ContactPlaceRow({ realId }: { realId: string }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const place = contactPlaceOf(project, realId);
  return (
    <Row label={tx('Rappresentazione del contatto')}>
      <select value={place} onChange={e => st().setContactPlace(realId, e.target.value as ContactPlace)}
        title={tx('In fondo: nell\'immagine dei contatti sotto la bobina. A fianco: accanto all\'apparecchio sulla linea del comando, segue l\'apparecchio. Libera: si trascina dove si vuole')}>
        <option value="bottom">{tx('in fondo alla pagina')}</option>
        <option value="side">{tx('a fianco del simbolo principale')}</option>
        <option value="free-v">{tx('libera, verticale')}</option>
        <option value="free-h">{tx('libera, orizzontale')}</option>
      </select>
    </Row>
  );
}

const LEGACY = '__per_nome';

/** Rimando: corrispondente (partenza ↔ arrivo); l'elenco offre i rimandi liberi, l'attesa e la fine voluta. Partenza a stella: tutti gli arrivi con lo stesso nome */
function LinkPartnerRow({ instId, vis }: { instId: string; vis: Vis }) {
  useStore(s => s.project);
  const cur = currentLinkPartner(instId);
  const { items, free, me } = linkChoices(instId);
  if (!me) return null;
  const st = useStore.getState;
  const outgoing = !isIncomingLink(me.inst.symbolId);
  const star = outgoing && !!me.inst.linkStar;
  const label = (o: typeof cur[number]) => [o.inst.tag, `/${locationOf(o)}`, o.page.title].filter(Boolean).join(' · ');
  const starRow = outgoing && (
    <Row label={tx('A stella')}>
      <label className="row" title={tx('La partenza si collega a tutti gli arrivi con lo stesso nome e ne mostra l\'elenco')}>
        <input type="checkbox" checked={star} onChange={e => st().updateInstance(instId, { linkStar: e.target.checked || undefined })} /> {tx('a tutti gli arrivi «{0}»', me.inst.tag)}
      </label>
    </Row>
  );
  if (star) return <>{starRow}<Row label={tx('Collegato a')} vis={vis}><span>{cur.length ? cur.map(o => `/${locationOf(o)}`).join(', ') : <span className="muted">{tx('nessun arrivo ancora')}</span>}</span></Row></>;
  // Abbinati per nome (corrispondente non scelto) finché non se ne sceglie uno
  const legacy = cur.some(o => o.inst.linkTo !== instId && !o.inst.linkStar);
  const value = legacy && cur.length ? LEGACY : cur.length === 1 ? cur[0].inst.id : me.inst.linkTo === NO_PARTNER ? '' : WAITING;
  // Il corrispondente attuale (anche quelli per nome, per renderli un abbinamento preciso) e i liberi
  const others = [...cur.filter(o => !free.includes(o)), ...free];
  return (
    <>
      {starRow}
      <Row label={tx('Collegato a')} vis={vis}>
        <select value={value} onChange={e => { if (e.target.value !== LEGACY) st().pairLinks(instId, e.target.value); }}>
          <option value={WAITING}>{tx('— in attesa del corrispondente (/…)')}</option>
          <option value="">{items[0]}</option>
          {legacy && cur.length > 0 && <option value={LEGACY}>{tx('per nome: {0}', cur.map(o => `/${locationOf(o)}`).join(', '))}</option>}
          {others.map(o => <option key={o.inst.id} value={o.inst.id}>{label(o)}{o.inst.linkStar ? ` (${tx('a stella')})` : ''}</option>)}
        </select>
      </Row>
    </>
  );
}
