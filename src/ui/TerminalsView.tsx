// Vista Morsettiere (come il «Navigatore morsettiere» di EPLAN): elenco delle morsettiere,
// tabella dei morsetti con piani, ponticelli, riserve e separatori, articoli e accessori.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { TerminalStripData, Part, StripAccessory } from '../model/types';
import { Field, PartInput } from './PropertyPanel';
import { uid } from '../model/geometry';
import { allStrips, stripData, stripRows, physicalCount, terminalConnections, type TerminalConn } from '../model/terminals';
import { partsIndex } from '../model/devices';
import { ask, askText } from './Ask';
import { useGrid, Th, gridProps } from './grid';
import { nextTerminal, freeTerminalNo } from '../model/terminals';
import { ColSplitter } from './split';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';
import { importWmc, exportWmc } from './actions';
import { startTerminalRow } from './terminalRowChooser';

/**
 * Scelta dell'articolo, in ordine alfabetico. Con `terminal` solo gli articoli segnati come
 * morsetto (con i loro piani); l'articolo già scelto resta comunque nell'elenco.
 */
function PartSelect({ value, onChange, empty = tx('— nessuno —'), terminal }: { value?: string; onChange: (v: string) => void; empty?: string; terminal?: boolean }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const parts = useMemo(() => [...partsIndex(project, library).values()]
    .filter(p => !terminal || p.terminal || p.partNr === value)
    .sort((a, b) => a.partNr.localeCompare(b.partNr, undefined, { numeric: true, sensitivity: 'base' })), [project, library, terminal, value]);
  const label = (p: Part) => {
    const d = p.descr1 && p.descr1.length > 50 ? `${p.descr1.slice(0, 49)}…` : p.descr1;
    return `${p.partNr}${p.terminal ? ` (${levelsText(p.terminal.levels)})` : ''}${d ? ` · ${d}` : ''}`;
  };
  const none = terminal && !parts.some(p => p.terminal);
  return (
    <select className="part-select" value={value ?? ''} onChange={e => onChange(e.target.value)}
      title={none ? tx('Nessun articolo segnato come morsetto: in Articoli spunta «Morsetto» e scegli i piani') : (value ? label(partsIndex(project, library).get(value) ?? { partNr: value } as Part) : undefined)}>
      <option value="">{none ? tx('— nessun articolo morsetto —') : empty}</option>
      {parts.map(p => <option key={p.partNr} value={p.partNr}>{label(p)}</option>)}
    </select>
  );
}

const qty = (v: string) => { const n = Math.round(parseFloat(v.replace(',', '.'))); return isFinite(n) && n >= 0 ? n : undefined; };

const levelsText = (levels: number) => (levels > 1 ? tx('{0} piani', levels) : tx('1 piano'));

export function TerminalsView() {
  const project = useStore(s => s.project);
  const stripSel = useStore(s => s.stripSel);
  const st = useStore.getState;
  const strips = useMemo(() => allStrips(project), [project]);
  const strip = stripSel && strips.includes(stripSel) ? stripSel : strips[0];
  const conns = useMemo(() => (strip ? terminalConnections(project, strip) : []), [project, strip]);
  // Morsetti fisici e piani: un morsetto a due piani (1A, 1B) è un morsetto solo
  const counts = useMemo(() => new Map(strips.map(s => { const rows = stripRows(project, s); return [s, { n: physicalCount(rows), levels: rows.length }]; })), [project, strips]);
  const [sel, setSel] = useState<string[]>([]);
  const [spares, setSpares] = useState(1);
  const [spareNo, setSpareNo] = useState('');
  const [sparePart, setSparePart] = useState('');
  useEffect(() => setSel([]), [strip]);
  const data: TerminalStripData | undefined = strip ? stripData(project, strip) : undefined;

  const jumperLabel = (c: TerminalConn) => c.jumper ? `${c.jumper.kind === 'comb' ? 'pettine' : 'fisso'} ${c.jumper.terminals[0]}–${c.jumper.terminals[c.jumper.terminals.length - 1]}` : '';
  const g = useGrid<TerminalConn>('terminals', conns, {
    no: c => c.row.no, type: c => (c.row.spare ? tx('Riserva') : tx(c.type)), ext: c => c.ext, extWire: c => c.extWire,
    int: c => c.int, intWire: c => c.intWire, jumper: jumperLabel, part: c => c.partNr, pos: c => c.locations.map(l => l.loc).join(' '),
  });
  const toggle = (no: string, ev: React.MouseEvent) => {
    if (ev.shiftKey && sel.length) {
      // Selezione di un intervallo, nell'ordine mostrato
      const list = g.rows;
      const i0 = list.findIndex(c => c.row.no === sel[sel.length - 1]), i1 = list.findIndex(c => c.row.no === no);
      const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
      setSel([...new Set([...sel, ...list.slice(a, b + 1).map(c => c.row.no)])]);
    } else if (ev.metaKey || ev.ctrlKey) setSel(sel.includes(no) ? sel.filter(x => x !== no) : [...sel, no]);
    else setSel([no]);
  };
  const goTo = (id: string) => {
    const pg = project.pages.find(p => p.elements.some(e => e.id === id));
    if (!pg) return;
    st().setPage(pg.id);
    st().setSelection([id]);
  };
  const upd = (patch: Partial<TerminalStripData>) => strip && st().updateStrip(strip, patch);
  const library = useStore(s => s.library);
  const allParts = useMemo(() => partsIndex(project, library), [project, library]);
  const selSpares = conns.filter(c => sel.includes(c.row.no) && c.row.spare).map(c => c.row.no);
  // Morsettiera nuova scritta a mano: nasce con i morsetti di riserva indicati, da disegnare poi nello schema
  const newStrip = async () => {
    const r = await ask(tx('Nuova morsettiera'), [{ label: tx('Nome (es. X2, X1.1.2)'), value: '' }, { label: tx('Numero di morsetti'), value: '10' },
      { label: tx('Piani'), value: '1', options: [1, 2, 3].map(n => ({ value: String(n), label: n > 1 ? tx('{0} piani ({1})', n, Array.from({ length: n }, (_, i) => `1${String.fromCharCode(65 + i)}`).join(', ')) : tx('1 piano (1, 2, 3…)') })) }]);
    const name = r?.[0].trim().replace(/^-/, '');
    if (!r || !name) return;
    if (strips.includes(name)) { st().setStripSel(name); return; }
    st().addSpares(name, Math.max(1, Math.min(200, parseInt(r[1], 10) || 1)), undefined, undefined, parseInt(r[2], 10) || 1);
    st().setStripSel(name);
  };
  // Morsetto nello schema: si posa col mouse, con il primo numero libero della morsettiera
  const placeTerminal = () => {
    if (!strip) return;
    st().setView('schema');
    st().setTool({ kind: 'place', symbolId: 'terminal', rot: 0, tag: selSpares[0] ? `${strip}:${selSpares[0]}` : nextTerminal(project, strip) });
  };

  const renameStripAsk = async (s: string) => {
    const to = await askText(tx('Nuovo nome della morsettiera (es. X1.1.2):'), s);
    if (to) st().renameStrip(s, to);
  };
  // Numeri dei morsetti selezionati, nell'ordine della tabella: uno per riga della finestra
  const renameSelected = async () => {
    if (!strip) return;
    const nos = g.rows.map(c => c.row.no).filter(no => sel.includes(no)).slice(0, 40);
    const r = await ask(tx('Rinomina morsetti di -{0}', strip), nos.map(no => ({ label: tx('Morsetto {0}', no), value: no })));
    if (!r) return;
    const changes = new Map(nos.map((no, i) => [no, r[i]] as [string, string]));
    if (st().renameTerminals(strip, changes)) setSel(nos.map((no, i) => r[i].trim() || no));
  };
  // Numero modificato direttamente nella tabella (doppio clic)
  const [editNo, setEditNo] = useState<string | null>(null);
  const editing = useRef<string | null>(null);
  const commitNo = (no: string, v: string) => {
    // Invio e poi la perdita del fuoco: si applica una volta sola
    if (editing.current !== no) return;
    editing.current = null;
    setEditNo(null);
    if (!strip || !v.trim() || v.trim() === no) return;
    if (st().renameTerminals(strip, new Map([[no, v]]))) setSel([v.trim()]);
  };

  return (
    <div className="parts-view terminals-view">
      <div className="parts-list">
        <div className="parts-toolbar">
          <b>{strip ? tx('Morsettiera -{0}', strip) : tx('Morsettiere')}</b>
          <div className="tb-spacer" />
          <button onClick={() => void newStrip()} title={tx('Morsettiera scritta a mano, con i morsetti di riserva indicati')}>{tx('Nuova morsettiera…')}</button>
          <button disabled={!strip} onClick={placeTerminal} title={tx('Posa nello schema un morsetto di questa morsettiera (la riserva selezionata o il primo numero libero)')}>{tx('Inserisci morsetto nello schema')}</button>
          <button disabled={!strip} onClick={() => startTerminalRow(strip)} title={tx('Un morsetto di questa morsettiera su ogni filo scelto nello schema (linea attraverso i fili o Ctrl/Cmd+clic), numerato nell\'ordine scelto')}>{tx('Morsetti in fila sui fili')}</button>
          <button disabled={!strip} onClick={() => strip && st().renumberStrip(strip)} title={tx('Numera da 1 nell\'ordine dello schema; i piani restano insieme, le riserve vanno in coda')}>{tx('Rinumera')}</button>
          <button disabled={!strip} onClick={() => strip && void renameStripAsk(strip)}
            title={tx('Nuovo nome della morsettiera: cambiano anche i morsetti nello schema e lo schema della morsettiera (anche con doppio clic sul nome a destra)')}>{tx('Rinomina…')}</button>
          <button disabled={!strip || !sel.length} onClick={() => void renameSelected()}
            title={tx('Cambia il numero dei morsetti selezionati, es. 10 e 11 → 10A e 10B, oppure 15A → 18A (anche con doppio clic sul numero)')}>{tx('Rinomina morsetti…')}</button>
          <button onClick={() => st().syncStripPages()} title={tx('Crea o aggiorna una pagina di schema per ogni morsettiera')}>{tx('Genera schemi morsettiere')}</button>
          <button onClick={() => void importWmc()} title={tx('Legge il file CAEdex di Weidmüller Configurator: articoli, ponticelli, separatori e morsetti in più delle morsettiere del progetto, e le morsettiere nuove')}>{tx('Da Weidmüller…')}</button>
          <button onClick={() => void exportWmc()} title={tx('Scrive le morsettiere del progetto in un file CAEdex da aprire in Weidmüller Configurator')}>{tx('Per Weidmüller…')}</button>
          <button onClick={() => st().setDialog('stripStyle')} title={tx('Testi e colonne delle pagine delle morsettiere (anche con il tasto destro sulla pagina)')}>{tx('Personalizza la lista…')}</button>
        </div>
        {strip && (
          <div className="parts-toolbar">
            <span className="muted small">{sel.length ? tx('{0} selezionati', sel.length) : tx('Clic, ⇧ clic o ⌘/Ctrl clic per selezionare')}</span>
            <button disabled={sel.length < 2} onClick={() => st().addJumper(strip, sel, 'fixed')}>{tx('Ponticello fisso')}</button>
            <button disabled={sel.length < 2} onClick={() => st().addJumper(strip, sel, 'comb')}>{tx('Ponticello a pettine')}</button>
            <button disabled={!conns.some(c => sel.includes(c.row.no) && c.jumper)} onClick={() => st().removeJumpers(strip, sel)}>{tx('Togli ponticello')}</button>
            <button disabled={sel.length !== 1} onClick={() => st().toggleSeparator(strip, sel[0])} title={tx('Separatore dopo il morsetto selezionato')}>{tx('Separatore')}</button>
            <label className="inline">{tx('Articolo')}
              <PartSelect terminal value="" empty={tx('assegna ai selezionati…')} onChange={v => { if (v && sel.length) st().assignTerminalPart(strip, sel, v); }} />
            </label>
            <span className="tb-spacer" />
            <input type="text" value={spareNo} placeholder={freeTerminalNo(project, strip)} onChange={e => setSpareNo(e.target.value)} style={{ width: 52 }}
              title={tx('Numero della riserva (es. 7 o 7B): vuoto = il primo numero libero, anche in mezzo alla morsettiera')} />
            <input type="number" min={1} max={50} value={spares} onChange={e => setSpares(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 52 }} title={tx('Quante riserve')} />
            <PartSelect terminal value={sparePart} empty={tx('articolo predefinito')} onChange={setSparePart} />
            <button onClick={() => { st().addSpares(strip, spares, spareNo.trim() || undefined, sparePart || undefined); setSpareNo(''); }}
              title={tx('Le riserve prendono il posto giusto nella numerazione; se poi disegni nello schema un morsetto con lo stesso numero, la riserva gli lascia il posto (con il suo articolo)')}>{tx('+ Riserva')}</button>
            <button disabled={!selSpares.length} onClick={() => st().removeSpares(strip, selSpares)}>{tx('Togli riserva')}</button>
          </div>
        )}
        <div className="table-wrap">
          <table {...gridProps(g)}>
            <thead><tr>
              <Th g={g} k="no">{tx('Morsetto')}</Th><Th g={g} k="type">{tx('Tipo')}</Th><Th g={g} k="ext">{tx('Esterno (sopra)')}</Th><Th g={g} k="extWire">{tx('Filo')}</Th>
              <Th g={g} k="int">{tx('Interno (sotto)')}</Th><Th g={g} k="intWire">{tx('Filo')}</Th><Th g={g} k="jumper">{tx('Ponticello')}</Th><Th g={g} k="part">{tx('Articolo')}</Th><Th g={g} k="pos">{tx('Posizione')}</Th>
            </tr></thead>
            <tbody>
              {g.rows.map(c => (
                <tr key={c.row.no} className={`${sel.includes(c.row.no) ? 'sel' : ''}${c.row.spare ? ' free' : ''}${c.separator ? ' sep-after' : ''}`} onClick={e => toggle(c.row.no, e)}>
                  <td onDoubleClick={e => { e.stopPropagation(); editing.current = c.row.no; setEditNo(c.row.no); }} title={tx('Doppio clic per cambiare il numero')}>{editNo === c.row.no
                    ? <input autoFocus defaultValue={c.row.no} style={{ width: 70 }} onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') commitNo(c.row.no, e.currentTarget.value); if (e.key === 'Escape') { editing.current = null; setEditNo(null); } }}
                        onBlur={e => commitNo(c.row.no, e.currentTarget.value)} />
                    : <b>{c.row.no}</b>}{c.row.level && <span className="muted"> {tx('piano')} {c.row.level}{c.levels.length > 1 ? ` / ${c.levels.length}` : ''}</span>}</td>
                  <td>{c.row.spare ? tx('Riserva') : tx(c.type)}</td>
                  <td>{c.ext}</td><td>{c.extWire}</td><td>{c.int}</td><td>{c.intWire}</td>
                  <td>{jumperLabel(c)}</td>
                  <td>{c.sameAs ? <span className="muted">{tx('stesso morsetto di {0}', c.sameAs)}</span>
                    : <>{c.partNr ?? ''}{c.partNr && c.partNr === data?.partNr && !c.row.els.some(e => e.inst.partNr) ? <span className="muted"> {tx('(predef.)')}</span> : ''}</>}</td>
                  <td className="nowrap">{c.locations.map(l => <a key={l.id} href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(l.id); }}>/{l.loc} </a>)}</td>
                </tr>
              ))}
              {!conns.length && <tr><td colSpan={9}><EmptyState icon="terminalStrip" text={tx('Nessun morsetto. Inserisci i morsetti dalla libreria simboli («Morsetti e collegamenti»): la sigla è nel formato X1:1, X1.1.2:3, X1:1A per i piani.')}
                action={tx('Inserisci il primo morsetto')} onAction={() => { const s = useStore.getState(); s.setView('schema'); s.setTool({ kind: 'place', symbolId: 'terminal', rot: 0 }); }} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ColSplitter id="terminals" />
      <div className="part-detail">
        <div className="detail-scroll">
          <h4>{tx('Morsettiere')}</h4>
          <table className="grid">
            <tbody>
              {strips.map(s => (
                <tr key={s} className={s === strip ? 'sel' : ''} onClick={() => st().setStripSel(s)} onDoubleClick={() => void renameStripAsk(s)} title={tx('Doppio clic per rinominare la morsettiera')}>
                  <td>-{s}</td><td>{counts.get(s)?.n} {tx('morsetti')}{counts.get(s) && counts.get(s)!.levels > counts.get(s)!.n ? <span className="muted"> {tx('({0} piani)', counts.get(s)!.levels)}</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {strip && data && (
            <>
              <h4>{tx('Articoli e accessori di -')}{strip}</h4>
              <table className="prop-table">
                <tbody>
                  <tr><td className="prop-name">{tx('Morsetto (predefinito)')}</td><td className="prop-value"><PartSelect terminal value={data.partNr} onChange={v => upd({ partNr: v })} /></td></tr>
                  <tr><td className="prop-name">{tx('Fermo terminale')}</td><td className="prop-value nowrap acc-row">
                    <PartInput value={data.endStopPartNr ?? ''} parts={allParts} listId="strip-acc-parts" onCommit={v => upd({ endStopPartNr: v || undefined })} />
                    <span className="muted small">×</span><Field type="number" value={data.endStopQty !== undefined ? String(data.endStopQty) : ''} placeholder="2" onCommit={v => upd({ endStopQty: qty(v) })} />
                  </td></tr>
                  <tr><td className="prop-name">{tx('Piastra di chiusura')}</td><td className="prop-value nowrap acc-row">
                    <PartInput value={data.endPlatePartNr ?? ''} parts={allParts} listId="strip-acc-parts" onCommit={v => upd({ endPlatePartNr: v || undefined })} />
                    <span className="muted small">×</span><Field type="number" value={data.endPlateQty !== undefined ? String(data.endPlateQty) : ''} placeholder="1" onCommit={v => upd({ endPlateQty: qty(v) })} />
                  </td></tr>
                  <tr><td className="prop-name">{tx('Ponticello (predefinito)')}</td><td className="prop-value acc-row"><PartInput value={data.jumperPartNr ?? ''} parts={allParts} listId="strip-acc-parts" onCommit={v => upd({ jumperPartNr: v || undefined })} /></td></tr>
                  <tr><td className="prop-name" title={tx('Piastra di separazione: si mette dopo un morsetto dalla tabella dei morsetti (colonna Separatore)')}>{tx('Separatore')}</td><td className="prop-value acc-row"><PartInput value={data.separatorPartNr ?? ''} parts={allParts} listId="strip-acc-parts" onCommit={v => upd({ separatorPartNr: v || undefined })} /></td></tr>
                </tbody>
              </table>
              <h4>{tx('Altri accessori')}</h4>
              <table className="grid acc-table">
                <thead><tr><th>{tx('Articolo')}</th><th>{tx('Quantità')}</th><th>{tx('Nota')}</th><th /></tr></thead>
                <tbody>
                  {(data.accessories ?? []).map((a, i) => {
                    const set = (patch: Partial<StripAccessory>) => upd({ accessories: data.accessories!.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={a.id}>
                        <td><PartInput value={a.partNr} parts={allParts} listId="strip-acc-parts" onCommit={v => set({ partNr: v })} /></td>
                        <td><Field type="number" value={String(a.qty)} onCommit={v => set({ qty: qty(v) ?? 1 })} /></td>
                        <td><Field value={a.note ?? ''} placeholder={tx('es. guida TS 35, 1 m')} onCommit={v => set({ note: v.trim() || undefined })} /></td>
                        <td><button className="mini" onClick={() => upd({ accessories: data.accessories!.filter((_, k) => k !== i) })} title={tx('Togli l\'accessorio')}>✕</button></td>
                      </tr>
                    );
                  })}
                  {!data.accessories?.length && <tr><td colSpan={4} className="muted small">{tx('Nessuno: guide, coperchi, porta-targhette, targhette… con «+ Accessorio».')}</td></tr>}
                </tbody>
              </table>
              <div className="row-buttons"><button onClick={() => upd({ accessories: [...(data.accessories ?? []), { id: uid('acc'), partNr: '', qty: 1 }] })}>{tx('+ Accessorio')}</button></div>
              <p className="muted small">{tx('Scrivi o scegli il codice dell\'articolo (anche nuovo). I morsetti senza articolo proprio usano quello predefinito; un morsetto a più piani conta come un solo articolo. Fermi, piastra di chiusura, separatori, ponticelli e altri accessori entrano in distinta con le loro quantità e si vedono sullo schema della morsettiera; i separatori si mettono dopo un morsetto nella tabella dei morsetti.')}</p>
              {data.jumpers.length > 0 && (
                <>
                  <h4>{tx('Ponticelli')}</h4>
                  <table className="grid">
                    <tbody>
                      {data.jumpers.map(j => (
                        <tr key={j.id}>
                          <td>{j.kind === 'comb' ? tx('Pettine') : tx('Fisso')}</td>
                          <td>{j.terminals.join('-')}</td>
                          <td><PartSelect value={j.partNr} empty={tx('predefinito')} onChange={v => st().updateJumper(strip, j.id, { partNr: v || undefined })} /></td>
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
