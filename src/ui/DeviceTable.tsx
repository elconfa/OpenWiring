// Navigatore dei dispositivi a tabella (come i navigatori di EPLAN): tutti i dispositivi del
// progetto in righe modificabili, con filtro, selezione multipla, modifica in blocco ed
// export/import Excel per compilare i dati fuori dal programma.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { buildDevices, deviceInfo, partsIndex, locationOf, extraPartsText, parseExtraParts, type Device } from '../model/devices';
import { activeDefs } from '../model/userProps';
import type { DeviceField, ExtraPart, SymbolInstance } from '../model/types';
import { devicePanels } from '../model/network';
import { writeXlsx, readXlsx } from '../io/xlsx';
import { openFiles, saveFile, safeName } from '../io/fileio';
import { askText } from './Ask';
import { partExists, warnPartExists } from './actions';
import { useGrid, Th, gridProps } from './grid';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';

type Col = { key: DeviceField; label: string; w?: number };

const COLS: Col[] = [
  { key: 'func', label: tx('Funzione ='), w: 70 },
  { key: 'loc', label: tx('Luogo +'), w: 70 },
  { key: 'description', label: tx('Descrizione'), w: 200 },
  { key: 'techData', label: tx('Dati tecnici'), w: 110 },
  { key: 'manufacturer', label: tx('Costruttore'), w: 110 },
  { key: 'typeNr', label: tx('Codice tipo'), w: 120 },
  { key: 'orderNr', label: tx('Codice ordine'), w: 110 },
  { key: 'partNr', label: tx('Articolo'), w: 130 },
  { key: 'extraParts', label: tx('Articoli aggiuntivi'), w: 160 },
  { key: 'note', label: tx('Note'), w: 140 },
];

/** Valore scritto sul dispositivo (senza quelli dell'articolo), dall'elemento principale in poi */
function ownValue(d: Device, k: DeviceField): string {
  const ordered = d.main ? [d.main, ...d.elements.filter(e => e !== d.main)] : d.elements;
  const v = ordered.map(e => (e.inst as SymbolInstance)[k]).find(x => x !== undefined && x !== '');
  if (k === 'extraParts') return extraPartsText(v as SymbolInstance['extraParts']);
  return v === undefined ? '' : String(v);
}

/** Articoli aggiuntivi scritti come testo: descrizione e costruttore già scritti restano */
function extraPartsOf(d: Device, text: string) {
  const old = (deviceInfo(d.elements, d.main, new Map()).extraParts ?? []);
  return parseExtraParts(text).map(x => ({ ...old.find(o => o.partNr === x.partNr), ...x, qty: x.qty }));
}

const mainId = (d: Device) => (d.main ?? d.elements[0]).inst.id;

export function DeviceTable() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<string | null>(null);
  const [bulkField, setBulkField] = useState<DeviceField>('description');
  const [bulkValue, setBulkValue] = useState('');
  const [note, setNote] = useState('');
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  // Proprietà definite dall'utente dei dispositivi: una colonna ciascuna
  const udp = activeDefs(project.userProps, 'function');
  const panels = useMemo(() => devicePanels(project), [project]);
  const devices = useMemo(() => [...buildDevices(project).values()]
    // Le morsettiere hanno la loro vista
    .filter(d => d.elements.some(e => e.sym.role !== 'terminal' && e.sym.role !== 'pin'))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })), [project]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return devices.map(d => ({ d, info: deviceInfo(d.elements, d.main, parts) }))
      .filter(({ d, info }) => !q || [d.tag, ...COLS.map(c => (c.key === 'extraParts' ? extraPartsText(info.extraParts) : String(info[c.key as keyof typeof info] ?? '')))].some(v => v.toLowerCase().includes(q)));
  }, [devices, parts, filter]);
  const visibleSel = rows.filter(r => sel.has(r.d.tag));
  // Valore mostrato in ogni colonna (quello scritto o, in grigio, quello dell'articolo): serve per ordinare
  type Row = typeof rows[number];
  const shown = (r: Row, k: DeviceField) => ownValue(r.d, k) || (k === 'loc' ? panels.get(r.d.tag)?.code : String(r.info[k as keyof typeof r.info] ?? '')) || '';
  const g = useGrid<Row>('devices', rows, {
    tag: r => r.d.tag,
    ...Object.fromEntries(COLS.map(c => [c.key, (r: Row) => (c.key === 'extraParts' ? extraPartsText(r.info.extraParts) : shown(r, c.key))])),
    ...Object.fromEntries(udp.map(u => [`udp:${u.id}`, (r: Row) => r.info.userProps?.[u.id] ?? ''])),
    pos: r => locationOf(r.d.main ?? r.d.elements[0]),
  });
  // Il dispositivo diventa un articolo della libreria: codice proposto da costruttore e tipo
  const toPart = async (r: Row) => {
    const own = r.info.partNr;
    const maker = (r.info.manufacturer ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
    const code = r.info.typeNr || r.info.orderNr;
    const proposed = own ?? (code ? (maker ? `${maker}.${code}` : code) : `ART.${r.d.tag}`);
    const nr = (await askText(tx('Codice del nuovo articolo per -{0} (costruttore, tipo, codice ordine e dati tecnici vanno nell\'articolo):', r.d.tag), proposed))?.trim();
    if (!nr) return;
    // Un articolo nuovo non può avere il codice di uno già presente (salvare nel proprio sì)
    if (nr !== own && partExists(nr)) { await warnPartExists(nr); return; }
    st().deviceToPart(mainId(r.d), nr);
  };

  const click = (tag: string, ev: React.MouseEvent) => {
    const next = new Set(ev.metaKey || ev.ctrlKey || ev.shiftKey ? sel : []);
    if (ev.shiftKey && last) {
      // Intervallo nell'ordine mostrato (anche se la tabella è ordinata per un'altra colonna)
      const list = g.rows;
      const a = list.findIndex(r => r.d.tag === last), b = list.findIndex(r => r.d.tag === tag);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 0) next.add(list[i].d.tag);
    } else if (next.has(tag) && (ev.metaKey || ev.ctrlKey)) next.delete(tag);
    else next.add(tag);
    setSel(next); setLast(tag);
  };
  const edit = (d: Device, k: DeviceField, v: string) => {
    if (v.trim() === ownValue(d, k)) return;
    // Un valore cambiato su più righe selezionate vale per tutte, come in EPLAN
    const targets = sel.has(d.tag) && sel.size > 1 ? devices.filter(x => sel.has(x.tag)) : [d];
    // L'articolo si copia nel progetto (un codice nuovo diventa un articolo della libreria)
    if (k === 'partNr') st().assignPart(targets.map(mainId), v.trim());
    else if (k === 'extraParts') for (const x of targets) st().setExtraParts(mainId(x), extraPartsOf(x, v));
    else st().updateDevices(targets.map(x => ({ instId: mainId(x), patch: { [k]: v.trim() || undefined } })));
    if (targets.length > 1) setNote(tx('{0}: {1} dispositivi aggiornati', COLS.find(c => c.key === k)?.label, targets.length));
  };
  const rename = (d: Device, v: string) => {
    const to = v.trim().replace(/^-/, '');
    if (!to || to === d.tag) return;
    if (!st().renameDevice(d.tag, to)) setNote(tx('La sigla -{0} è già usata', to));
    else setNote(`-${d.tag} → -${to}`);
  };
  const applyBulk = (clear = false) => {
    if (!visibleSel.length) return;
    if (bulkField === 'partNr') st().assignPart(visibleSel.map(r => mainId(r.d)), clear ? '' : bulkValue.trim());
    else if (bulkField === 'extraParts') for (const r of visibleSel) st().setExtraParts(mainId(r.d), clear ? [] : extraPartsOf(r.d, bulkValue));
    else st().updateDevices(visibleSel.map(r => ({ instId: mainId(r.d), patch: { [bulkField]: clear ? undefined : bulkValue.trim() || undefined } })));
    setNote(tx('{0}: {1} dispositivi {2}', COLS.find(c => c.key === bulkField)?.label, visibleSel.length, clear ? 'svuotati' : 'aggiornati'));
  };
  const go = (d: Device) => {
    const el = d.elements[0];
    st().setPage(el.page.id);
    st().setSelection(d.elements.filter(e => e.page.id === el.page.id).map(e => e.inst.id));
  };

  const exportXlsx = async () => {
    // Le proprietà definite dall'utente hanno come intestazione il nome identificativo
    const head = ['Sigla', ...COLS.map(c => c.label), ...udp.map(u => u.id), 'Posizione'];
    const body = devices.map(d => [d.tag, ...COLS.map(c => ownValue(d, c.key)), ...udp.map(u => deviceInfo(d.elements, d.main, parts).userProps?.[u.id] ?? ''), d.elements.map(locationOf).join(' ')]);
    const p = await saveFile(`${safeName(project.info.name)}_dispositivi.xlsx`, writeXlsx([{ name: 'Dispositivi', rows: [head, ...body] }]), [{ name: 'Excel', extensions: ['xlsx'] }]);
    if (p) st().logMsg(tx('Dispositivi esportati: {0} ({1}). Modifica le colonne in Excel e reimporta il file.', p, devices.length));
  };
  const importXlsx = async () => {
    const [f] = await openFiles([{ name: 'Excel', extensions: ['xlsx'] }]);
    if (!f) return;
    const [sheet] = readXlsx(f.data);
    if (!sheet?.rows.length) { setNote(tx('File vuoto')); return; }
    const head = sheet.rows[0].map(h => h.trim());
    const tagCol = head.indexOf('Sigla');
    if (tagCol < 0) { setNote(tx('Manca la colonna «Sigla»')); return; }
    const byTag = new Map(devices.map(d => [d.tag, d]));
    const changes: { instId: string; patch: Partial<Pick<SymbolInstance, DeviceField>> }[] = [];
    const extras: [string, ExtraPart[]][] = [], partAssign: [string, string][] = [];
    let unknown = 0;
    for (const r of sheet.rows.slice(1)) {
      const tag = (r[tagCol] ?? '').trim().replace(/^-/, '');
      if (!tag) continue;
      const d = byTag.get(tag);
      if (!d) { unknown++; continue; }
      const patch: Record<string, string | undefined> = {};
      for (const c of COLS) {
        const i = head.indexOf(c.label);
        if (i < 0) continue;
        const v = (r[i] ?? '').trim();
        if (v === ownValue(d, c.key)) continue;
        if (c.key === 'extraParts') extras.push([mainId(d), extraPartsOf(d, v)]);
        else if (c.key === 'partNr') partAssign.push([mainId(d), v]);
        else patch[c.key] = v || undefined;
      }
      // Proprietà definite dall'utente: tutte quelle cambiate in un solo valore del dispositivo
      const curProps = deviceInfo(d.elements, d.main, parts).userProps ?? {};
      const nextProps = { ...curProps };
      for (const u of udp) {
        const i = head.indexOf(u.id);
        if (i < 0) continue;
        const v = (r[i] ?? '').trim();
        if (v === (curProps[u.id] ?? '')) continue;
        if (v) nextProps[u.id] = v; else delete nextProps[u.id];
      }
      if (JSON.stringify(nextProps) !== JSON.stringify(curProps)) patch.userProps = (Object.keys(nextProps).length ? nextProps : undefined) as unknown as string;
      if (Object.keys(patch).length) changes.push({ instId: mainId(d), patch });
    }
    if (changes.length) st().updateDevices(changes);
    for (const [id, nr] of partAssign) st().assignPart([id], nr);
    for (const [id, list] of extras) st().setExtraParts(id, list);
    const n = new Set([...changes.map(c => c.instId), ...partAssign.map(x => x[0]), ...extras.map(x => x[0])]).size;
    setNote(tx('Importati {0} dispositivi modificati{1}', n, unknown ? `, ${unknown} sigle non trovate` : ''));
    st().logMsg(tx('Import dispositivi da {0}: {1} modificati{2}', f.name, n, unknown ? `, ${unknown} sigle non trovate nel progetto` : ''));
  };

  return (
    <div className="reports device-table">
      <div className="parts-toolbar">
        <input className="search" placeholder={tx('Filtra (sigla, descrizione, articolo…)')} value={filter} onChange={e => setFilter(e.target.value)} />
        <span className="muted small">{rows.length} {tx('dispositivi ·')} {visibleSel.length} {tx('selezionati')}</span>
        <button onClick={() => void exportXlsx()} title={tx('Tabella dei dispositivi in Excel, da compilare e reimportare')}>{tx('Esporta Excel')}</button>
        <button onClick={() => void importXlsx()} title={tx('Aggiorna i dati dei dispositivi dal file Excel (colonna Sigla come chiave)')}>{tx('Importa Excel')}</button>
      </div>
      <div className="parts-toolbar bulk-bar">
        <b className="small">{tx('Modifica in blocco')}</b>
        <select value={bulkField} onChange={e => setBulkField(e.target.value as DeviceField)}>
          {COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input value={bulkValue} placeholder={tx('nuovo valore')} onChange={e => setBulkValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applyBulk(); }} />
        <button className="primary" disabled={!visibleSel.length} onClick={() => applyBulk()}>{tx('Applica a')} {visibleSel.length}</button>
        <button disabled={!visibleSel.length} onClick={() => applyBulk(true)}>{tx('Svuota')}</button>
        <span className="muted small">{note || tx('Clic, ⇧ clic e ⌘/Ctrl clic sulla sigla per selezionare; un valore scritto in una riga selezionata vale per tutte.')}</span>
      </div>
      {udp.filter(u => u.choices?.length).map(u => <datalist key={u.id} id={`udp-col-${u.id}`}>{u.choices!.map(c => <option key={c} value={c} />)}</datalist>)}
      <datalist id="device-table-parts">
        {[...parts.values()].map(p => <option key={p.partNr} value={p.partNr}>{[p.descr1, p.manufacturer].filter(Boolean).join(' · ')}</option>)}
      </datalist>
      <div className="table-wrap">
        <table {...gridProps(g, 'grid editable')}>
          <thead>
            <tr>
              <Th g={g} k="sel" title=""><input type="checkbox" checked={!!rows.length && visibleSel.length === rows.length}
                onClick={e => e.stopPropagation()} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.d.tag)) : new Set())} /></Th>
              <Th g={g} k="tag">{tx('Sigla')}</Th>
              {COLS.map(c => <Th key={c.key} g={g} k={c.key}><span style={{ display: 'inline-block', minWidth: c.w }}>{c.label}</span></Th>)}
              {udp.map(d => <Th key={d.id} g={g} k={`udp:${d.id}`} title={d.id}><span style={{ display: 'inline-block', minWidth: 100 }}>{d.name}{d.unit ? ` (${d.unit})` : ''}</span></Th>)}
              <Th g={g} k="pos">{tx('Posizione')}</Th>
              <Th g={g} k="act" title="" />
            </tr>
          </thead>
          <tbody>
            {g.rows.map(({ d, info }) => (
              <tr key={d.tag} className={sel.has(d.tag) ? 'picked' : ''}>
                <td><input type="checkbox" checked={sel.has(d.tag)} onChange={() => { const n = new Set(sel); if (n.has(d.tag)) n.delete(d.tag); else n.add(d.tag); setSel(n); setLast(d.tag); }} /></td>
                <td className="nowrap" onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') click(d.tag, e); }}>
                  <input key={`${d.tag}-tag`} className="cell tag" defaultValue={`-${d.tag}`} onFocus={e => { if (!sel.has(d.tag)) click(d.tag, e as unknown as React.MouseEvent); }}
                    onBlur={e => rename(d, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                </td>
                {COLS.map(c => {
                  const own = ownValue(d, c.key);
                  // Valore preso dall'articolo (o dal luogo della pagina) mostrato in grigio
                  const inherited = c.key === 'loc' ? panels.get(d.tag)?.code : String(info[c.key as keyof typeof info] ?? '');
                  return (
                    <td key={c.key}>
                      <input key={`${d.tag}-${c.key}-${own}`} className="cell" defaultValue={own} placeholder={own || c.key === 'extraParts' ? '' : inherited ?? ''}
                        list={c.key === 'partNr' ? 'device-table-parts' : undefined}
                        title={c.key === 'extraParts' ? tx('Codici separati da «;», la quantità con ×2 (es. 3KD9-1 ×2; 8UC7)') : c.key === 'partNr' ? tx('Un codice nuovo diventa un articolo della libreria, con costruttore, tipo e codice ordine della riga') : undefined}
                        onBlur={e => edit(d, c.key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </td>
                  );
                })}
                {udp.map(u => {
                  const own = info.userProps?.[u.id] ?? '';
                  return (
                    <td key={u.id}>
                      <input key={`${d.tag}-${u.id}-${own}`} className="cell" defaultValue={own} list={u.choices?.length ? `udp-col-${u.id}` : undefined}
                        onBlur={e => { if (e.target.value.trim() !== own) st().setUserProp({ kind: 'device', instId: mainId(d) }, u.id, e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </td>
                  );
                })}
                <td className="nowrap"><button className="link" onClick={() => go(d)}>/{locationOf(d.main ?? d.elements[0])}</button>{d.elements.length > 1 && <span className="muted small"> +{d.elements.length - 1}</span>}</td>
                <td className="nowrap"><button className="mini" onClick={() => void toPart({ d, info })}
                  title={info.partNr ? tx('Salva i dati di -{0} nell\'articolo {1} e aprilo per completarlo', d.tag, info.partNr) : tx('Crea un articolo riutilizzabile con i dati di -{0} e aprilo per completarlo', d.tag)}>{tx('→ Articolo')}</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={COLS.length + udp.length + 4}><EmptyState icon="coil" title={tx('Nessun dispositivo.')} text={tx('I dispositivi nascono inserendo i simboli nello schema: clic su un simbolo nel riquadro Simboli e clic sul foglio.')}
              action={tx('Inserisci il primo simbolo')} onAction={() => { const s = useStore.getState(); s.setView('schema'); s.setTool({ kind: 'place', symbolId: 'coil', rot: 0 }); }} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
