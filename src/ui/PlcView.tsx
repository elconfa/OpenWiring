// Vista PLC: schede con indirizzi, lista di assegnazione I/O, controlli ed export.
import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../model/store';
import type { PlcCard, PlcAddressFormat, IoKind } from '../model/types';
import {
  PLC_CARD_TYPES, IO_KINDS, FORMAT_LABELS, cardType, channelsOf, channelAddress, ioAssignments,
  plcProblems, usedChannels, sanitizeSymbol, tiaTagRows, codesysGvl, canExportTia, canExportGvl,
  detectPartChannels, parseGvl, parseTagTable, parseCsv, type TagImportRow, iolinkRows, plcopenXml, STATION_KINDS, hardwareProblems,
  unlinkedPlcDevices, stationNames, cardOrderInfo, cardChannelMismatch, cardDevice as cardDeviceOf, cardFormat, stationFormat,
} from '../model/plc';
import { buildDevices } from '../model/devices';
import { ask, askConfirm } from './Ask';
import { locationOf } from '../model/devices';
import { settingsOf } from '../model/numbering';
import { saveFile, safeName, openFiles } from '../io/fileio';
import { writeXlsx, readXlsx } from '../io/xlsx';
import { partsIndex } from '../model/devices';
import { tableToCsv } from '../model/reports';
import { plcIoTable } from './actions';
import { useGrid, Th, gridProps } from './grid';
import { ResizableSection } from './split';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';

/** Campo che conferma all'uscita o con Invio */
function Cell({ value, onCommit, placeholder, width, type = 'text', list }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; width?: number; type?: string; list?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="cell-input" style={width ? { width } : undefined} type={type} value={v} placeholder={placeholder} list={list}
      onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

/** Intervallo di indirizzi di una scheda, es. "I0.0–I1.5 · Q0.0–Q1.1" */
function addressRange(card: PlcCard, fmt: PlcAddressFormat): string {
  const chs = channelsOf(card);
  return IO_KINDS.filter(k => chs.some(c => c.kind === k)).map(k => {
    const list = chs.filter(c => c.kind === k);
    return `${channelAddress(card, list[0].id, fmt)}–${channelAddress(card, list[list.length - 1].id, fmt)}`;
  }).join(' · ');
}

export function PlcView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const fmt = settingsOf(project).plcAddressFormat;
  const [newType, setNewType] = useState(PLC_CARD_TYPES[0].id);
  const [onlyUsed, setOnlyUsed] = useState(false);
  // Stazione delle schede che si aggiungono: si sceglie tra quelle create (Nuova stazione…)
  const stations = stationNames(project);
  const [station, setStation] = useState('');
  const newStation = stations.includes(station) ? station : stations[0] ?? 'PLC1';
  const rows = useMemo(() => ioAssignments(project, library), [project, library]);
  const cards = project.plc.cards;
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const devices = useMemo(() => buildDevices(project), [project]);
  const cardDevice = (c: PlcCard) => cardDeviceOf(project, c, devices);
  const problems = useMemo(() => [
    ...plcProblems(project), ...hardwareProblems(project),
    // Scheda con un numero di canali diverso da quello dell'articolo del suo dispositivo
    ...cards.map(c => cardChannelMismatch(project, c, parts, devices)).filter((x): x is string => !!x),
  ], [project, cards, parts, devices]);
  const shown = onlyUsed ? rows.filter(r => r.inst) : rows;
  const base = safeName(project.info.name);
  // Schede: l'ordine dell'elenco conta per gli indirizzi, la colonna Pos. resta quella dell'elenco
  const cg = useGrid<PlcCard>('plc-cards', cards, {
    pos: c => cards.indexOf(c), tag: c => c.tag, type: c => (c.custom ? c.custom.name : tx(cardType(c).name)), station: c => c.station,
    rack: c => c.rack ?? 0, slot: c => c.slot, used: c => usedChannels(project, c.tag).size, description: c => c.description, orderNr: c => c.orderNr,
  });
  type IoRow = typeof shown[number];
  const ig = useGrid<IoRow>('plc-io', shown, {
    card: r => r.card.tag, channel: r => r.channel, terminal: r => r.terminal, address: r => r.address, symbol: r => r.symbol,
    comment: r => r.comment, connected: r => r.connected, pos: r => r.location,
  });

  const goTo = (instId: string) => {
    const pg = project.pages.find(p => p.elements.some(e => e.id === instId));
    if (!pg) return;
    st().setPage(pg.id);
    st().setSelection([instId]);
  };

  const exportPlcopen = async () => {
    const path = await saveFile(`${base}_plcopen.xml`, plcopenXml(project, library), [{ name: 'PLCopen XML', extensions: ['xml'] }]);
    if (path) st().logMsg(tx('PLCopen XML esportato: {0}', path));
  };
  const exportTia = async () => {
    const data = writeXlsx([{ name: 'PLC Tags', rows: tiaTagRows(project, library) }]);
    const p = await saveFile(`${base}_PLC_tags.xlsx`, data, [{ name: 'Excel', extensions: ['xlsx'] }]);
    if (p) st().logMsg(tx('Tabella variabili TIA Portal esportata: {0}', p));
  };
  const exportGvl = async () => {
    const p = await saveFile(`${base}_GVL_IO.txt`, codesysGvl(project, library), [{ name: 'Testo', extensions: ['txt', 'st'] }]);
    if (p) st().logMsg(tx('Variabili globali CODESYS esportate: {0}', p));
  };
  const exportList = async () => {
    const p = await saveFile(`${base}_lista_IO.xlsx`, writeXlsx([{ name: 'Lista I/O', rows: [plcIoTable().columns, ...plcIoTable().rows] }]),
      [{ name: 'Excel', extensions: ['xlsx'] }]);
    if (p) st().logMsg(tx('Lista I/O esportata: {0}', p));
  };
  const importTags = async () => {
    const [file] = await openFiles([{ name: 'Tabella variabili', extensions: ['xlsx', 'csv', 'txt', 'st', 'exp'] }]);
    if (!file) return;
    try {
      let rows: TagImportRow[];
      if (/\.xlsx$/i.test(file.name)) {
        const sheets = readXlsx(file.data);
        const sheet = sheets.find(x => /plc tags|variabil|tags/i.test(x.name)) ?? sheets[0];
        rows = parseTagTable(sheet?.rows ?? []);
      } else {
        const text = new TextDecoder().decode(file.data);
        rows = /\bAT\s+%[IQM]/i.test(text) ? parseGvl(text) : parseTagTable(parseCsv(text));
      }
      if (!rows.length) { st().logMsg(tx('{0}: nessuna variabile con indirizzo trovata', file.name), 'warn'); return; }
      st().importPlcTags(rows, file.name);
    } catch (e) {
      st().logMsg(tx('Errore nell\'import di {0}: {1}', file.name, (e as Error).message), 'error');
    }
  };
  const exportCsv = () => saveFile(`${base}_lista_IO.csv`, tableToCsv(plcIoTable()), [{ name: 'CSV', extensions: ['csv'] }]);

  return (
    <div className="plc-view">
      <div className="parts-toolbar">
        <label className="inline" title={tx('Formato delle stazioni senza un formato proprio (colonna Formato nelle Stazioni)')}>{tx('Formato indirizzi')}&nbsp;
          <select value={fmt} onChange={e => st().updateSettings({ plcAddressFormat: e.target.value as PlcAddressFormat })}>
            {(Object.keys(FORMAT_LABELS) as PlcAddressFormat[]).map(f => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
          </select>
        </label>
        <select value={newType} onChange={e => setNewType(e.target.value)}>
          {PLC_CARD_TYPES.map(t => <option key={t.id} value={t.id}>{tx(t.name)}</option>)}
        </select>
        <label className="inline" title={tx('Stazione delle schede aggiunte; l\'ultima voce dell\'elenco crea una stazione nuova')}>{tx('nella stazione')}&nbsp;
          <StationSelect value={newStation} onChange={v => setStation(v)} />
        </label>
        <button onClick={() => st().addPlcCard(newType, newStation)}>{tx('Aggiungi scheda')}</button>
        <label className="inline" title={tx('Fili collegati a un canale PLC: nome dall\'indirizzo (I0.3; con 2 morsetti per canale I0.3A e I0.3B), anche attraverso i morsetti; i rimandi prendono lo stesso nome')}>
          <input type="checkbox" checked={!!settingsOf(project).wirePlcNames} onChange={e => st().updateSettings({ wirePlcNames: e.target.checked })} />{tx('Fili con il nome dall\'indirizzo')}
        </label>
        <CardFromPart station={newStation} />
        <button disabled={!cards.length} onClick={async () => {
          if (await askConfirm(tx('Conferma'), tx('Riassegnare gli indirizzi di tutte le schede in ordine di elenco? Gli indirizzi attuali cambieranno.'), tx('Riassegna'))) st().reassignPlcAddresses();
        }}>{tx('Riassegna indirizzi')}</button>
        <div className="tb-spacer" />
        <button disabled={!cards.length} onClick={() => st().syncPlcOverviews()} title={tx('Crea una pagina panoramica per ogni scheda (e toglie quelle di schede eliminate)')}>{tx('Pagine panoramiche')}</button>
        <button disabled={!cards.length} onClick={importTags} title={tx('Importa nomi e commenti: Excel esportato da TIA Portal, GVL di CODESYS o CSV (Nome; Indirizzo; Commento)')}>{tx('Importa variabili')}</button>
        <button disabled={!cards.length || !canExportTia(project)} onClick={exportTia}
          title={canExportTia(project) ? tx('File Excel da importare in TIA Portal: Variabili PLC ▸ Importa') : tx('Disponibile con i formati Siemens')}>{tx('Esporta TIA Portal')}</button>
        <button disabled={!cards.length || !canExportGvl(project)} onClick={exportGvl}
          title={canExportGvl(project) ? tx('Testo da incollare in una lista di variabili globali (GVL) di CODESYS o TwinCAT') : tx('Disponibile con i formati IEC 61131 / CODESYS e TwinCAT')}>{tx('Esporta CODESYS')}</button>
        <button disabled={!cards.length} onClick={() => void exportPlcopen()} title={tx('Variabili globali con indirizzo in PLCopen XML (CODESYS, Beckhoff, B&R…)')}>{tx('PLCopen XML')}</button>
        <button disabled={!cards.length} onClick={exportList}>{tx('Lista I/O Excel')}</button>
        <button disabled={!cards.length} onClick={exportCsv}>{tx('CSV')}</button>
      </div>

      <ResizableSection id="plc-cards" className="plc-cards table-wrap">
        <table {...gridProps(cg)}>
          <thead>
            <tr>
              <Th g={cg} k="pos">{tx('Pos.')}</Th><Th g={cg} k="tag">{tx('Sigla')}</Th><Th g={cg} k="type">{tx('Tipo')}</Th><Th g={cg} k="station">{tx('Stazione')}</Th>
              <Th g={cg} k="rack" title={tx('Rack (telaio)')}>{tx('Rack')}</Th><Th g={cg} k="slot" title={tx('Posto scheda')}>{tx('Slot')}</Th>
              <Th g={cg} k="di" title={tx('Byte iniziale degli ingressi digitali')}>{tx('DI byte')}</Th><Th g={cg} k="do" title={tx('Byte iniziale delle uscite digitali')}>{tx('DO byte')}</Th>
              <Th g={cg} k="ai" title={tx('Indirizzo iniziale (byte) degli ingressi analogici')}>{tx('AI ind.')}</Th><Th g={cg} k="ao" title={tx('Indirizzo iniziale (byte) delle uscite analogiche')}>{tx('AO ind.')}</Th>
              <Th g={cg} k="addr">{tx('Indirizzi')}</Th><Th g={cg} k="used">{tx('Usati')}</Th><Th g={cg} k="description">{tx('Descrizione')}</Th><Th g={cg} k="orderNr">{tx('Codice ordinazione')}</Th><Th g={cg} k="act" title="" />
            </tr>
          </thead>
          <tbody>
            {cg.rows.map(c => {
              const i = cards.indexOf(c);
              const t = cardType(c);
              const total = channelsOf(c).length;
              const used = usedChannels(project, c.tag).size;
              const startCell = (k: IoKind) => t.channels[k]
                ? <Cell type="number" width={56} value={String(c.start[k] ?? 0)} onCommit={v => st().updatePlcCard(c.id, { start: { ...c.start, [k]: Math.max(0, parseInt(v, 10) || 0) } })} />
                : <span className="muted">—</span>;
              return (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td><span className="tag-input"><span className="dash">-</span><Cell width={64} value={c.tag} onCommit={v => v.trim() && st().updatePlcCard(c.id, { tag: v.replace(/^-/, '').trim() })} /></span></td>
                  <td>
                    <select value={c.custom ? 'custom' : c.typeId} onChange={e => { if (e.target.value !== 'custom') st().updatePlcCard(c.id, { typeId: e.target.value }); }}>
                      {c.custom && <option value="custom">{tx('da articolo: {0}', c.custom.name)}</option>}
                      {PLC_CARD_TYPES.map(x => <option key={x.id} value={x.id}>{tx(x.name)}</option>)}
                    </select>
                  </td>
                  <td><StationSelect value={c.station} onChange={v => st().updatePlcCard(c.id, { station: v })} /></td>
                  <td><Cell type="number" width={40} value={String(c.rack ?? 0)} onCommit={v => st().updatePlcCard(c.id, { rack: Math.max(0, parseInt(v, 10) || 0) })} /></td>
                  <td><Cell type="number" width={40} value={c.slot !== undefined ? String(c.slot) : ''} onCommit={v => st().updatePlcCard(c.id, { slot: v === '' ? undefined : Math.max(0, parseInt(v, 10) || 0) })} /></td>
                  {IO_KINDS.map(k => <td key={k}>{startCell(k)}</td>)}
                  <td className="mono small">{addressRange(c, cardFormat(project, c))}</td>
                  <td>{used}/{total}</td>
                  {(() => {
                    // Scheda con il suo dispositivo nello schema: descrizione e codice sono quelli del
                    // dispositivo (o del suo articolo, in grigio) e si scrivono sul dispositivo
                    const d = cardDevice(c);
                    if (!d) return (
                      <>
                        <td><Cell value={c.description ?? ''} onCommit={v => st().updatePlcCard(c.id, { description: v || undefined })} /></td>
                        <td><Cell value={c.orderNr ?? ''} onCommit={v => st().updatePlcCard(c.id, { orderNr: v || undefined })} /></td>
                      </>
                    );
                    const { info } = cardOrderInfo(project, c, parts, devices);
                    const mainId = (d.main ?? d.elements.find(e => e.sym.role !== 'plc') ?? d.elements[0]).inst.id;
                    const own = (k: 'description' | 'orderNr') => d.elements.map(e => e.inst[k]).find(Boolean) ?? '';
                    const from = tx('Dal dispositivo -{0}{1}: si modifica anche qui o nelle sue Proprietà', c.tag, info.partNr ? ` (${info.partNr})` : '');
                    return (['description', 'orderNr'] as const).map(k => (
                      <td key={k} className="from-device" title={from}>
                        <Cell value={own(k)} placeholder={(k === 'description' ? info.part?.descr1 ?? info.description : info.orderNr) ?? ''} onCommit={v => st().updateDevice(mainId, { [k]: v.trim() || undefined })} />
                      </td>
                    ));
                  })()}
                  <td className="nowrap">
                    {(['DI', 'DO'] as const).filter(k => (cardType(c).channels[k] ?? 0) > 0).map(k => (
                      <button key={k} title={k === 'DI' ? tx('Inserisci nello schema un gruppo di ingressi di questa scheda (dal primo canale libero)') : tx('Inserisci nello schema un gruppo di uscite di questa scheda (dal primo canale libero)')}
                        onClick={() => { st().setView('schema'); st().setTool({ kind: 'place', symbolId: k === 'DI' ? 'plc_grp_di1' : 'plc_grp_do1', rot: 0, tag: c.tag }); }}>{k === 'DI' ? tx('+ Gruppo DI') : tx('+ Gruppo DO')}</button>
                    ))}
                    <button onClick={() => st().movePlcCard(c.id, -1)} title={tx('Sposta su')}>↑</button>
                    <button onClick={() => st().movePlcCard(c.id, 1)} title={tx('Sposta giù')}>↓</button>
                    <button onClick={async () => {
                      if (await askConfirm(tx('Conferma'), used ? tx('La scheda -{0} ha {1} canali usati nello schema: i punti I/O resteranno senza scheda. Eliminarla?', c.tag, used) : tx('Eliminare la scheda -{0}?', c.tag), tx('Continua'))) st().deletePlcCard(c.id);
                    }} title={tx('Elimina')}>✕</button>
                  </td>
                </tr>
              );
            })}
            {!cards.length && (
              <tr><td colSpan={15}>
                <EmptyState icon="plc" text={tx('Nessuna scheda. Aggiungine una qui sopra, oppure inserisci nello schema un punto I/O dalla libreria (categoria PLC): la prima scheda viene creata automaticamente.')}
                  action={tx('Aggiungi la prima scheda')} onAction={() => st().addPlcCard(newType, newStation)} />
              </td></tr>
            )}
          </tbody>
        </table>
      </ResizableSection>

      <UnlinkedPanel station={newStation} />
      <StationsPanel />
      <IolinkPanel />
      {problems.length > 0 && (
        <div className="plc-problems">
          {problems.map((p, i) => <div key={i}>⚠ {p}</div>)}
        </div>
      )}

      <div className="parts-toolbar">
        <b>{tx('Lista di assegnazione I/O')}</b>
        <label className="inline"><input type="checkbox" checked={onlyUsed} onChange={e => setOnlyUsed(e.target.checked)} /> {tx('solo canali usati')}</label>
        <span className="muted small">{tx('I nomi in grigio sono generati automaticamente; il commento predefinito è la descrizione del dispositivo collegato.')}</span>
      </div>
      <div className="table-wrap">
        <table {...gridProps(ig)}>
          <thead><tr>
            <Th g={ig} k="card">{tx('Scheda')}</Th><Th g={ig} k="channel">{tx('Canale')}</Th><Th g={ig} k="terminal">{tx('Morsetto')}</Th><Th g={ig} k="address">{tx('Indirizzo')}</Th>
            <Th g={ig} k="symbol">{tx('Nome simbolico')}</Th><Th g={ig} k="comment">{tx('Commento')}</Th><Th g={ig} k="connected">{tx('Collegato a')}</Th><Th g={ig} k="pos">{tx('Posizione')}</Th>
          </tr></thead>
          <tbody>
            {ig.rows.map(r => {
              // Punto disegnato: nome e commento sul simbolo; canale libero: sulla scheda
              const setSym = (v: string) => {
                const sym = v.trim() ? sanitizeSymbol(v.trim()) : undefined;
                if (r.inst) st().updateInstance(r.inst.id, { plcSymbol: sym });
                else st().updatePlcCard(r.card.id, { io: { ...(r.card.io ?? {}), [r.channel]: { ...(r.card.io?.[r.channel] ?? {}), symbol: sym } } });
              };
              const setComment = (v: string) => {
                const c = v.trim() || undefined;
                if (r.inst) st().updateInstance(r.inst.id, { plcComment: c });
                else st().updatePlcCard(r.card.id, { io: { ...(r.card.io ?? {}), [r.channel]: { ...(r.card.io?.[r.channel] ?? {}), comment: c } } });
              };
              return (
                <tr key={`${r.card.id}|${r.channel}`} className={r.inst ? '' : 'free'}>
                  <td>-{r.card.tag}</td>
                  <td>{r.channel}</td>
                  <td>{r.terminal !== r.channel ? r.terminal : ''}</td>
                  <td className="mono">{r.address}</td>
                  <td><Cell value={r.symbolIsDefault ? '' : r.symbol} placeholder={r.inst ? r.symbol : 'libero'} onCommit={setSym} /></td>
                  <td><Cell value={r.ownComment} placeholder={r.inst ? r.comment : ''} onCommit={setComment} /></td>
                  <td>{r.connected}</td>
                  <td>{r.inst ? <a href="#" onClick={e => { e.preventDefault(); goTo(r.inst!.id); }}>{r.location}</a> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Crea una scheda PLC da un articolo importato (EDZ/XML), riconoscendo i canali dal modello funzione */
function CardFromPart({ station }: { station: string }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const parts = useMemo(() => [...partsIndex(project, library).values()], [project, library]);
  const [partNr, setPartNr] = useState('');
  const [counts, setCounts] = useState<Partial<Record<IoKind, number>>>({});
  const choose = (nr: string) => {
    setPartNr(nr);
    const p = parts.find(x => x.partNr === nr);
    setCounts(p ? detectPartChannels(p).channels : {});
  };
  if (!parts.length) return null;
  return (
    <span className="card-from-part">
      <select value={partNr} onChange={e => choose(e.target.value)} title={tx('Scheda da un articolo della libreria (es. importato da EDZ)')}>
        <option value="">{tx('Scheda da articolo…')}</option>
        {parts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''}</option>)}
      </select>
      {partNr && (
        <>
          {IO_KINDS.map(k => (
            <label key={k} className="inline small">{k}
              <input type="number" min={0} max={64} style={{ width: 46 }} value={counts[k] ?? 0}
                onChange={e => setCounts(c => ({ ...c, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </label>
          ))}
          <button disabled={!IO_KINDS.some(k => counts[k])} onClick={() => { st().addPlcCardFromPart(partNr, counts, undefined, station); setPartNr(''); }}
            title={tx('I numeri di canali sono riconosciuti dal modello funzione dell\'articolo; correggili se serve')}>{tx('Crea scheda')}</button>
        </>
      )}
    </span>
  );
}

/**
 * Componenti dello schema che sembrano schede PLC (CPU o moduli da un articolo, punti I/O con una
 * sigla senza scheda): si crea la scheda con la loro sigla oppure si collegano a una scheda esistente
 */
function UnlinkedPanel({ station }: { station: string }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const list = useMemo(() => unlinkedPlcDevices(project, library), [project, library]);
  const [types, setTypes] = useState<Record<string, string>>({});
  if (!list.length) return null;
  const cards = project.plc.cards;
  return (
    <ResizableSection id="plc-unlinked" className="plc-stations table-wrap">
      <div className="parts-toolbar">
        <b>{tx('Nello schema, senza scheda PLC')}</b>
        <span className="muted small">{tx('Crea la scheda con la sigla del componente (i suoi punti I/O la seguono) oppure collegalo a una scheda già in elenco.')}</span>
      </div>
      <table className="grid">
        <thead><tr><th>{tx('Sigla')}</th><th>{tx('Componente')}</th><th>{tx('Articolo')}</th><th>{tx('Canali riconosciuti')}</th><th>{tx('Posizione')}</th><th>{tx('Crea scheda')}</th><th>{tx('oppure collega a')}</th></tr></thead>
        <tbody>
          {list.map(u => {
            const fromPart = !!u.part && IO_KINDS.some(k => u.channels[k]);
            const type = types[u.tag] ?? (fromPart ? 'part' : PLC_CARD_TYPES[0].id);
            const e0 = u.els[0];
            return (
              <tr key={u.tag}>
                <td>-{u.tag}</td>
                <td>{[u.els.map(e => e.inst.description).find(Boolean), u.part?.descr1 || tx(e0.sym.name)].filter(Boolean).join(' · ')}</td>
                <td>{u.part?.partNr ?? ''}</td>
                <td className="small">{IO_KINDS.filter(k => u.channels[k]).map(k => `${u.channels[k]} ${k}`).join(' · ') || '—'}</td>
                <td className="nowrap">{u.els.slice(0, 3).map(e => locationOf(e)).join(', ')}{u.els.length > 3 ? ' …' : ''}</td>
                <td className="nowrap">
                  <select value={type} onChange={e => setTypes(t => ({ ...t, [u.tag]: e.target.value }))}>
                    {fromPart && <option value="part">{tx('dall\'articolo {0}', u.part!.partNr)}</option>}
                    {PLC_CARD_TYPES.map(x => <option key={x.id} value={x.id}>{tx(x.name)}</option>)}
                  </select>
                  <button onClick={() => {
                    if (type === 'part' && u.part) st().addPlcCardFromPart(u.part.partNr, u.channels, u.tag, station);
                    else st().addPlcCard(type, station, u.tag);
                  }} title={tx('Nuova scheda -{0} nella stazione {1}', u.tag, station)}>{tx('Crea')}</button>
                </td>
                <td>
                  <select value="" disabled={!cards.length} onChange={e => { if (e.target.value) st().linkToPlcCard(u.tag, e.target.value); }}>
                    <option value="">{cards.length ? tx('scheda…') : tx('nessuna scheda')}</option>
                    {cards.map(c => <option key={c.id} value={c.tag}>-{c.tag} · {c.description || tx(cardType(c).name)} ({c.station})</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResizableSection>
  );
}

/** Nuova stazione con nome, tipo, IP e nome del dispositivo; restituisce il nome (null se annullata) */
export async function newStationDialog(): Promise<string | null> {
  const st = useStore.getState;
  const used = stationNames(st().project);
  let n = used.length + 1;
  while (used.includes(`PLC${n}`)) n++;
  const r = await ask(tx('Nuova stazione PLC'), [
    { label: tx('Nome'), value: `PLC${n}` },
    { label: tx('Tipo'), value: STATION_KINDS[0], options: STATION_KINDS.map(k => ({ value: k, label: k })) },
    { label: tx('Indirizzo IP'), value: '', placeholder: '192.168.0.1' },
    { label: tx('Nome dispositivo / nodo'), value: '', placeholder: tx('es. et200sp-q2') },
  ]);
  if (!r) return null;
  const name = r[0].trim();
  if (!st().addStation({ name, kind: r[1] || undefined, ip: r[2].trim() || undefined, deviceName: r[3].trim() || undefined })) {
    st().logMsg(name ? tx('La stazione {0} esiste già', name) : tx('Scrivi il nome della stazione'), 'warn');
    return null;
  }
  return name;
}

/** Scelta della stazione tra quelle del progetto; l'ultima voce ne crea una nuova */
function StationSelect({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const project = useStore(s => s.project);
  const names = stationNames(project);
  const list = names.includes(value) ? names : [value, ...names];
  return (
    <select value={value} onChange={async e => {
      if (e.target.value !== '+') { onChange(e.target.value); return; }
      const n = await newStationDialog();
      if (n) onChange(n);
    }}>
      {list.map(n => <option key={n} value={n}>{n}</option>)}
      <option value="+">{tx('+ Nuova stazione…')}</option>
    </select>
  );
}

/** Stazioni: CPU locale o periferia decentrata, con IP e nome Profinet */
function StationsPanel() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const names = stationNames(project);
  const data = (n: string) => project.plc.stations?.find(x => x.name === n) ?? { name: n };
  return (
    <ResizableSection id="plc-stations" className="plc-stations table-wrap">
      <div className="parts-toolbar">
        <b>{tx('Stazioni')}</b>
        <button onClick={() => void newStationDialog()} title={tx('CPU locale o periferia decentrata, da scegliere quando aggiungi una scheda')}>{tx('+ Nuova stazione…')}</button>
        {!names.length && <span className="muted small">{tx('Nessuna stazione: la prima scheda va nella stazione PLC1.')}</span>}
      </div>
      <table className="grid">
        <thead><tr><th>{tx('Stazione')}</th><th>{tx('Tipo')}</th><th>{tx('Formato')}</th><th>{tx('Ordine aree')}</th><th>{tx('Indirizzo IP')}</th><th>{tx('Nome dispositivo / nodo')}</th><th>{tx('Schede (rack/slot)')}</th><th /></tr></thead>
        <tbody>
          {names.map(n => {
            const d = data(n);
            const cards = project.plc.cards.filter(c => c.station === n).sort((a, b) => (a.rack ?? 0) - (b.rack ?? 0) || (a.slot ?? 0) - (b.slot ?? 0));
            return (
              <tr key={n}>
                <td><Cell width={80} value={n} onCommit={v => v.trim() && st().updateStation(n, { name: v.trim() })} /></td>
                <td>
                  <select value={d.kind ?? ''} onChange={e => st().updateStation(n, { kind: e.target.value || undefined })}>
                    <option value="">—</option>
                    {STATION_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td>
                  <select value={d.format ?? ''} onChange={e => st().updateStation(n, { format: (e.target.value || undefined) as PlcAddressFormat | undefined })}
                    title={tx('Una stazione può avere un formato diverso dal progetto, es. un nodo CODESYS accanto a una CPU Siemens; cambiandolo gli indirizzi della stazione si rifanno')}>
                    <option value="">{tx('come il progetto')}</option>
                    {(Object.keys(FORMAT_LABELS) as PlcAddressFormat[]).map(f => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
                  </select>
                </td>
                <td>
                  {['iec', 'twincat'].includes(stationFormat(project, n)) ? (
                    <select value={d.areaOrder ?? ''} onChange={e => st().updateStation(n, { areaOrder: e.target.value === 'analog-first' ? 'analog-first' : undefined })}
                      title={tx('Digitali e analogici stanno nella stessa area: di serie le schede in fila; i nodi WAGO e altri accoppiatori CODESYS mettono prima tutti gli analogici e poi i digitali')}>
                      <option value="">{tx('schede in fila')}</option>
                      <option value="analog-first">{tx('prima gli analogici (WAGO)')}</option>
                    </select>
                  ) : <span className="muted small">—</span>}
                </td>
                <td><Cell width={110} value={d.ip ?? ''} placeholder="192.168.0.1" onCommit={v => st().updateStation(n, { ip: v.trim() || undefined })} /></td>
                <td><Cell width={130} value={d.deviceName ?? ''} placeholder={tx('es. et200sp-q2')} onCommit={v => st().updateStation(n, { deviceName: v.trim() || undefined })} /></td>
                <td className="small">{cards.map(c => `-${c.tag} ${c.rack ?? 0}/${c.slot ?? '?'}`).join('  ·  ')}</td>
                <td><button className="mini" disabled={cards.length > 0} onClick={() => st().deleteStation(n)}
                  title={cards.length ? tx('Sposta prima le sue schede in un\'altra stazione') : tx('Elimina la stazione')}>✕</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResizableSection>
  );
}

/** Porte dei master IO-Link: dispositivo collegato, byte di dati di processo e indirizzi */
function IolinkPanel() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const rows = iolinkRows(project);
  if (!rows.length) return null;
  return (
    <ResizableSection id="plc-iolink" className="plc-stations table-wrap">
      <table className="grid">
        <thead><tr><th>{tx('Master')}</th><th>{tx('Porta')}</th><th>{tx('Dispositivo')}</th><th>{tx('Descrizione')}</th><th>{tx('Byte in')}</th><th>{tx('Byte out')}</th><th>{tx('Ingressi')}</th><th>{tx('Uscite')}</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.card.id}|${r.port}`}>
              <td>-{r.card.tag}</td><td>X{r.port}</td>
              <td><Cell width={70} value={r.device} placeholder={tx('es. 3B5')} onCommit={v => st().updateIolinkPort(r.card.id, r.port, { device: v.replace(/^-/, '').trim() || undefined })} /></td>
              <td><Cell value={r.description} placeholder={tx('es. Sensore di pressione')} onCommit={v => st().updateIolinkPort(r.card.id, r.port, { description: v || undefined })} /></td>
              <td><Cell type="number" width={44} value={String(r.inBytes)} onCommit={v => st().updateIolinkPort(r.card.id, r.port, { inBytes: Math.max(0, parseInt(v, 10) || 0) })} /></td>
              <td><Cell type="number" width={44} value={String(r.outBytes)} onCommit={v => st().updateIolinkPort(r.card.id, r.port, { outBytes: Math.max(0, parseInt(v, 10) || 0) })} /></td>
              <td className="mono small">{r.inAddr}</td><td className="mono small">{r.outAddr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResizableSection>
  );
}
