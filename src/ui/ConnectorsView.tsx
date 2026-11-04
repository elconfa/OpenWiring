// Vista Connettori: elenco dei connettori, tabella dei pin con il numero modificabile e i dati del
// connettore (descrizione, pin, articolo, controparte, costruttore…). Serve anche dopo aver copiato
// e incollato un connettore: si selezionano i pin incollati e si spostano in un connettore nuovo,
// numerati da 1.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { allConnectors, connectorRows, connectorData, pinCount, freePins, rangeText } from '../model/connectors';
import { CONNECTOR_TYPES, connectorType, connectorTypeName, GENDER_NAMES, type ConnectorGender } from '../model/connectorTypes';
import { buildDevices, deviceInfo, partsIndex } from '../model/devices';
import type { DeviceField, SymbolInstance } from '../model/types';
import { askText } from './Ask';
import { useGrid, Th, gridProps } from './grid';
import { ColSplitter } from './split';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';
import { PartInput } from './PropertyPanel';

function Field({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onClick={e => e.stopPropagation()}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

/** Numeri consecutivi da start, nell'ordine dei pin */
const sequence = (n: number, start: number) => Array.from({ length: n }, (_, i) => String(start + i));

export function ConnectorsView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const connSel = useStore(s => s.connSel);
  const st = useStore.getState;
  const conns = useMemo(() => allConnectors(project), [project]);
  const conn = connSel && conns.includes(connSel) ? connSel : conns[0];
  const rows = useMemo(() => (conn ? connectorRows(project, conn) : []), [project, conn]);
  const counts = useMemo(() => new Map(connectorRows(project).reduce((m, r) => m.set(r.conn, (m.get(r.conn) ?? 0) + 1), new Map<string, number>())), [project]);
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [conn]);
  const dev = conn ? buildDevices(project).get(conn) : undefined;
  const info = dev ? deviceInfo(dev.elements, dev.main, parts) : undefined;
  const first = rows[0]?.els[0]?.inst;
  const data = conn ? connectorData(project, conn) : {};
  const count = conn ? pinCount(project, conn, library) : undefined;
  const free = conn ? freePins(project, conn, library) : [];
  const ctype = connectorType(data.type);
  const group = (t: (typeof CONNECTOR_TYPES)[number]) => (t.shape ? tx('Segnale (RJ45, SUB-D)') : `${t.maker} ${t.series}`);
  const series = [...new Set(CONNECTOR_TYPES.map(group))];
  /** Elenco dei tipi del catalogo raggruppati per serie */
  const typeOptions = series.map(s => (
    <optgroup key={s} label={s}>
      {CONNECTOR_TYPES.filter(t => group(t) === s).map(t => <option key={t.id} value={t.id}>{[connectorTypeName(t), t.shape ? '' : `${t.amps} A`, t.housing].filter(Boolean).join(' · ')}</option>)}
    </optgroup>
  ));
  const newConnector = (type: string) => { const tag = st().addConnector(type || undefined, 'MF'); st().setConnSel(tag); };

  type Row = typeof rows[number];
  const pinOwn = (r: Row, k: 'description' | 'note') => r.els.map(e => e.inst[k]).find(Boolean) ?? '';
  const g = useGrid<Row>('connector-pins', rows, {
    no: r => r.no, type: r => tx(r.type), a: r => r.sideA, wire: r => r.wires, b: r => r.sideB,
    pos: r => r.els.map(e => e.page.name).join(' '), description: r => pinOwn(r, 'description'), note: r => pinOwn(r, 'note'),
  });
  const toggle = (no: string, ev: React.MouseEvent) => {
    if (ev.shiftKey && sel.length) {
      const list = g.rows;
      const i0 = list.findIndex(r => r.no === sel[sel.length - 1]), i1 = list.findIndex(r => r.no === no);
      const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
      setSel([...new Set([...sel, ...list.slice(a, b + 1).map(r => r.no)])]);
    } else if (ev.metaKey || ev.ctrlKey) setSel(sel.includes(no) ? sel.filter(x => x !== no) : [...sel, no]);
    else setSel([no]);
  };
  const goTo = (id: string) => {
    const pg = project.pages.find(p => p.elements.some(e => e.id === id));
    if (!pg) return;
    st().setPage(pg.id);
    st().setSelection([id]);
    st().setView('schema');
  };
  /** Pin scelti (i selezionati, o tutti) nell'ordine mostrato nella tabella */
  const chosen = () => (sel.length ? g.rows.filter(r => sel.includes(r.no)) : g.rows);
  const rename = (pairs: [string, string][], ids?: string[]) => st().renamePins(Object.fromEntries(pairs.map(([a, b]) => [`${conn}:${a}`, b])), ids);
  const renameConnector = (to: string, ids?: string[]) => {
    to = to.replace(/^-/, '').trim();
    if (!conn || !to || to.includes(':')) return;
    rename(rows.map(r => [r.no, `${to}:${r.no}`]), ids);
    if (!ids) st().setConnSel(to);
  };
  const moveTo = async () => {
    const list = chosen();
    const to = (await askText(tx('Connettore in cui spostare {0} pin (numerati da 1):', list.length), ''))?.replace(/^-/, '').trim();
    if (!to || to.includes(':')) return;
    const nos = sequence(list.length, 1);
    rename(list.map((r, i) => [r.no, `${to}:${nos[i]}`]));
    setSel([]);
    st().setConnSel(to);
  };
  const renumber = async () => {
    const list = chosen();
    const start = parseInt((await askText(tx('Numera {0} pin a partire da:', list.length), '1')) ?? '', 10);
    if (isNaN(start)) return;
    const nos = sequence(list.length, start);
    rename(list.map((r, i) => [r.no, `${conn}:${nos[i]}`]));
    setSel([]);
  };
  const devField = (k: DeviceField, label: string, fromPart?: string) => (
    <tr><td className="prop-name">{label}</td><td className="prop-value">
      <Field value={first ? String(info?.[k as keyof typeof info] ?? '') : ''} placeholder={fromPart}
        onCommit={v => first && st().updateDevice(first.id, { [k]: v.trim() || undefined } as Partial<SymbolInstance>)} />
    </td></tr>
  );
  // Pagine in cui compare il connettore (per rinominare solo i pin di una pagina, es. dopo un incolla)
  const pages = useMemo(() => {
    const m = new Map<string, { title: string; ids: string[] }>();
    for (const r of rows) for (const e of r.els) {
      const x = m.get(e.page.id) ?? { title: `${e.page.name} ${e.page.title ?? ''}`.trim(), ids: [] };
      x.ids.push(e.inst.id); m.set(e.page.id, x);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="parts-view connectors-view">
      <div className="parts-list">
        <div className="parts-toolbar">
          <b>{conn ? tx('Connettore -{0}', conn) : tx('Connettori')}</b>
          <select value="" title={tx('Crea un connettore scegliendo il tipo dal catalogo (ILME…); poi «Inserisci i pin liberi» li mette sullo schema')}
            onChange={e => { if (e.target.value !== '*') newConnector(e.target.value === '-' ? '' : e.target.value); }}>
            <option value="*">{tx('Nuovo connettore…')}</option>
            <option value="-">{tx('senza tipo (numero di pin a mano)')}</option>
            {typeOptions}
          </select>
          <div className="tb-spacer" />
          <span className="muted small">{sel.length ? tx('{0} selezionati', sel.length) : tx('Clic, ⇧ clic o ⌘/Ctrl clic per selezionare')}</span>
          <button disabled={!rows.length} onClick={() => void renumber()} title={tx('Numeri consecutivi ai pin selezionati (o a tutti), nell\'ordine della tabella')}>{tx('Rinumera…')}</button>
          <button disabled={!rows.length} onClick={() => void moveTo()} title={tx('I pin selezionati (o tutti) vanno in un altro connettore, numerati da 1: utile dopo aver copiato e incollato un connettore')}>{tx('Sposta in un altro connettore…')}</button>
        </div>
        <div className="table-wrap">
          <table {...gridProps(g)}>
            <thead><tr>
              <Th g={g} k="no">{tx('Pin')}</Th><Th g={g} k="type">{tx('Tipo')}</Th><Th g={g} k="a">{tx('Lato A')}</Th><Th g={g} k="wire">{tx('Filo')}</Th>
              <Th g={g} k="b">{tx('Lato B')}</Th><Th g={g} k="pos">{tx('Posizione')}</Th><Th g={g} k="description">{tx('Descrizione')}</Th><Th g={g} k="note">{tx('Note')}</Th>
            </tr></thead>
            <tbody>
              {g.rows.map(r => (
                <tr key={r.no} className={sel.includes(r.no) ? 'sel' : ''} onClick={e => toggle(r.no, e)}>
                  <td className="conn-pin"><Field value={r.no} onCommit={v => { const n = v.trim(); if (n && !n.includes(':')) rename([[r.no, `${conn}:${n}`]]); }} /></td>
                  <td>{tx(r.type)}</td>
                  <td>{r.sideA}</td><td>{r.wires}</td><td>{r.sideB}</td>
                  <td className="nowrap">{r.els.map(e => <a key={e.inst.id} href="#" onClick={ev => { ev.preventDefault(); ev.stopPropagation(); goTo(e.inst.id); }}>/{e.page.name} </a>)}</td>
                  {(['description', 'note'] as const).map(k => {
                    // Dati del singolo pin: sul simbolo che li ha già, altrimenti sul primo
                    const own = r.els.find(e => e.inst[k]) ?? r.els[0];
                    return <td key={k} onClick={ev => ev.stopPropagation()}><Field value={own?.inst[k] ?? ''} onCommit={v => own && st().updateElement(own.inst.id, { [k]: v.trim() || undefined })} /></td>;
                  })}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8}>{conn ? <span className="muted pad">{tx('Nessun pin sullo schema: «Inserisci i pin liberi» a destra li mette uno per clic.')}</span>
                : <EmptyState icon="connector" text={tx('Nessun connettore. Creane uno con «Nuovo connettore…» scegliendo il tipo, oppure inserisci i pin dalla libreria simboli («Morsetti e collegamenti»): la sigla è nel formato X10:1.')} />}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ColSplitter id="connectors" />
      <div className="part-detail">
        <div className="detail-scroll">
          <h4>{tx('Connettori')}</h4>
          <table className="grid">
            <tbody>
              {conns.map(c => (
                <tr key={c} className={c === conn ? 'sel' : ''} onClick={() => st().setConnSel(c)}>
                  <td>-{c}</td><td>{`${counts.get(c) ?? 0}${pinCount(project, c, library) ? `/${pinCount(project, c, library)}` : ''}`} {tx('pin')}</td><td className="muted">{connectorData(project, c).description ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {conn && (
            <>
              <h4>{tx('Dati di -{0}', conn)}</h4>
              <table className="prop-table">
                <tbody>
                  <tr><td className="prop-name">{tx('Nome')}</td><td className="prop-value"><Field value={conn} onCommit={v => renameConnector(v)} /></td></tr>
                  <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><Field value={data.description ?? ''} placeholder={tx('es. Connettore motore')} onCommit={v => st().updateConnector(conn, { description: v.trim() || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Tipo')}</td><td className="prop-value">
                    <select value={data.type ?? ''} onChange={e => st().updateConnector(conn, { type: e.target.value || undefined, pins: undefined })}>
                      <option value="">{tx('— nessuno —')}</option>
                      {typeOptions}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Maschio / femmina')}</td><td className="prop-value">
                    <select value={data.gender ?? ''} title={tx('Simbolo dei pin che si inseriscono e inserti in distinta materiali')}
                      onChange={e => st().updateConnector(conn, { gender: (e.target.value || undefined) as ConnectorGender | undefined })}>
                      <option value="">{tx('— non indicato —')}</option>
                      {(Object.keys(GENDER_NAMES) as ConnectorGender[]).map(g => <option key={g} value={g}>{tx(GENDER_NAMES[g])}</option>)}
                    </select>
                  </td></tr>
                  {ctype && <tr><td className="prop-name">{ctype.shape ? tx('Parti') : tx('Inserti')}</td><td className="prop-value small">{[`${ctype.male} / ${ctype.female}`, ctype.shape ? '' : `${ctype.amps} A`, tx(ctype.contact)].filter(Boolean).join(' · ')}</td></tr>}
                  <tr><td className="prop-name">{tx('Custodia')}</td><td className="prop-value"><Field value={data.housing ?? ''} placeholder={ctype ? tx('Custodia {0}', ctype.housing) : tx('es. custodia 44.27 base da parete')} onCommit={v => st().updateConnector(conn, { housing: v.trim() || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Pin liberi')}</td><td className="prop-value">
                    <span className="small">{free.length ? rangeText(free) : count ? tx('nessuno') : tx('indica il tipo o i pin totali')}</span>{' '}
                    <button className="mini" disabled={!conn} title={tx('Ogni clic sullo schema mette il prossimo pin libero; Esc per finire')} onClick={() => st().placeConnectorPins(conn)}>{tx('Inserisci i pin liberi')}</button>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Riquadro sullo schema')}</td><td className="prop-value">
                    <input type="checkbox" checked={data.frame !== false} title={tx('Riquadro tratteggiato attorno ai pin del connettore con sigla, tipo e genere')} onChange={e => st().updateConnector(conn, { frame: e.target.checked ? undefined : false })} />
                  </td></tr>
                  <tr><td className="prop-name">{tx('Pin totali')}</td><td className="prop-value"><Field value={data.pins ? String(data.pins) : ''} placeholder={count ? tx('{0} (articolo)', count) : tx('es. 16')} onCommit={v => st().updateConnector(conn, { pins: parseInt(v, 10) || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Usati')}</td><td className="prop-value">{`${rows.length}${count ? ` ${tx('di')} ${count}` : ''}`}</td></tr>
                  <tr><td className="prop-name">{tx('Articolo')}</td><td className="prop-value">
                    <PartInput listId="conn-parts" value={info?.partNr ?? ''} parts={parts} onCommit={v => first && st().assignPart([first.id], v)} />
                  </td></tr>
                  <tr><td className="prop-name">{tx('Controparte')}</td><td className="prop-value">
                    <PartInput listId="conn-mating" value={data.matingPartNr ?? ''} parts={parts} onCommit={v => {
                      if (v && !parts.has(v)) st().savePart(v, {});
                      st().updateConnector(conn, { matingPartNr: v || undefined });
                    }} />
                  </td></tr>
                  {devField('manufacturer', tx('Costruttore'), info?.part?.manufacturer)}
                  {devField('typeNr', tx('Tipo'), info?.part?.typeNr)}
                  {devField('orderNr', tx('Codice ordinazione'), info?.part?.orderNr)}
                  {devField('func', tx('Funzione (=)'))}
                  {devField('loc', tx('Luogo (+)'))}
                  <tr><td className="prop-name">{tx('Note')}</td><td className="prop-value"><Field value={data.note ?? ''} onCommit={v => st().updateConnector(conn, { note: v.trim() || undefined })} /></td></tr>
                </tbody>
              </table>
              {pages.length > 0 && (
                <>
                  <h4>{tx('Pagine')}</h4>
                  <table className="grid">
                    <tbody>
                      {pages.map(([id, x]) => (
                        <tr key={id}>
                          <td>{x.title}</td><td>{x.ids.length} {tx('pin')}</td>
                          <td><button className="mini" title={tx('Rinomina il connettore solo su questa pagina (es. dopo averlo incollato)')} onClick={async () => {
                            const to = await askText(tx('Nuovo nome del connettore su questa pagina:'), conn);
                            if (to && to !== conn) { renameConnector(to, x.ids); st().setConnSel(to.replace(/^-/, '').trim()); }
                          }}>{tx('Rinomina…')}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
