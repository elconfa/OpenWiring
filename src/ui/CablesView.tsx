// Vista Cavi: tutti i cavi del progetto con tipo, formazione, conduttori usati e liberi e pagine in
// cui compaiono le loro linee. Si selezionano più cavi per cambiarne insieme tipo, marcatura
// (numeri o colori), sezione o lunghezza. Sotto, i conduttori del cavo scelto, uno per riga, anche
// quelli non ancora usati: nome (numero o colore) modificabile, filo, estremità e pagina.
import { useEffect, useMemo, useState } from 'react';
import { cableEnds } from '../model/cableEnds';
import { useStore } from '../model/store';
import { cableByPiece, pinDeviceOptions, cableInfos, cableSection, conductorColors, conductorEnds, conductorsFor, isPeName, markingOf, type CableInfo, type Conductor } from '../model/cables';
import { partsIndex } from '../model/devices';
import { WIRE_SECTIONS, type BusCable, type Cable, type CableMarking, type ExtraPart, type Part } from '../model/types';
import { connectorGroup, connectorType, isConnectorPart } from '../model/connectorTypes';
import { busCableRows, portText, protocolLabel, BUS_CABLE_TYPES, type BusCableRow } from '../model/network';
import { useGrid, Th, gridProps } from './grid';
import { ColSplitter, ResizableSection } from './split';
import { askConfirm } from './Ask';
import { tx } from '../i18n/ui';
import { EmptyState } from './EmptyState';

function Field({ value, onCommit, placeholder, list }: { value: string; onCommit: (v: string) => void; placeholder?: string; list?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} placeholder={placeholder} list={list} onChange={e => setV(e.target.value)} onClick={e => e.stopPropagation()}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

/** Riquadrino con il colore del conduttore (due metà per i bicolori e il giallo-verde) */
export function ConductorSwatch({ name }: { name: string }) {
  const c = conductorColors(name);
  if (!c.length) return null;
  const bg = c.length === 1 ? c[0] : `linear-gradient(135deg, ${c.map((x, i) => `${x} ${(i * 100) / c.length}%, ${x} ${((i + 1) * 100) / c.length}%`).join(', ')})`;
  return <span className="cond-swatch" style={{ background: bg }} />;
}

// Pagine delle linee del cavo e dei bus fili con il suo nome
const pagesOf = (i: CableInfo) => [...new Set([...i.lines.map(l => l.loc.split('.')[0]), ...i.conductors.map(c => c.pageName)])];
const num = (v: string) => (v.trim() ? parseFloat(v.replace(',', '.')) : undefined);
/** Valore comune a tutti i cavi scelti, undefined se diverso */
const common = <T,>(list: Cable[], f: (c: Cable) => T) => (list.length && list.every(c => f(c) === f(list[0])) ? f(list[0]) : undefined);

export function CablesView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const cableSel = useStore(s => s.cableSel);
  const clip = useStore(s => s.cableClipboard);
  const st = useStore.getState;
  const infos = useMemo(() => cableInfos(project), [project]);
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const cableParts = useMemo(() => [...parts.values()].filter(p => p.cable?.conductors.length), [parts]);
  const [sel, setSel] = useState<string[]>([]);
  // Cavi di rete (Profinet, EtherCAT…): collegamenti bus disegnati tra le porte dei dispositivi
  const busRows = useMemo(() => busCableRows(project), [project]);
  const [busSel, setBusSel] = useState<string>();
  const busCur = busSel ? busRows.find(r => r.wire.id === busSel) : undefined;
  const cur = infos.find(i => i.cable.id === cableSel) ?? infos[0];
  // Selezione: solo cavi che esistono ancora
  const chosenIds = sel.filter(id => infos.some(i => i.cable.id === id));
  const ids = chosenIds.length ? chosenIds : cur ? [cur.cable.id] : [];
  const chosen = infos.filter(i => ids.includes(i.cable.id)).map(i => i.cable);

  const g = useGrid<CableInfo>('cables', infos, {
    tag: i => i.cable.tag, type: i => i.cable.type ?? '', form: i => cableSection(i.cable), marking: i => markingOf(i.cable),
    used: i => i.conductors.length, free: i => i.spare.length, pages: i => pagesOf(i).join(' '),
    from: i => i.cable.from ?? '', to: i => i.cable.to ?? '', length: i => i.cable.length ?? 0, description: i => i.cable.description ?? '',
  });
  const click = (id: string, ev: React.MouseEvent) => {
    setBusSel(undefined);
    st().setCableSel(id);
    if (ev.shiftKey && chosenIds.length) {
      const list = g.rows.map(r => r.cable.id);
      const i0 = list.indexOf(chosenIds[chosenIds.length - 1]), i1 = list.indexOf(id);
      const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
      setSel([...new Set([...chosenIds, ...list.slice(a, b + 1)])]);
    } else if (ev.metaKey || ev.ctrlKey) setSel(chosenIds.includes(id) ? chosenIds.filter(x => x !== id) : [...chosenIds, id]);
    else setSel([id]);
  };
  const goTo = (pageId: string, elId: string) => {
    st().setPage(pageId);
    st().setSelection([elId]);
    st().setView('schema');
  };

  // Righe dei conduttori del cavo scelto: tutti quelli del cavo (anche liberi), poi quelli in più
  type Row = { i: number; name: string; uses: Conductor[]; extra?: boolean };
  const rows = useMemo<Row[]>(() => {
    if (!cur) return [];
    const out: Row[] = cur.cable.conductors.map((name, i) => ({ i, name, uses: cur.conductors.filter(k => k.name === name) }));
    const known = new Set(cur.cable.conductors);
    for (const k of cur.conductors) if (!known.has(k.name)) out.push({ i: -1, name: k.name, uses: [k], extra: true });
    return out;
  }, [cur]);
  const cg = useGrid<Row>('cable-conductors', rows, {
    n: r => r.i, name: r => r.name, wire: r => r.uses[0]?.net?.wireNo ?? '', from: r => (r.uses[0] ? conductorEnds(r.uses[0])[0] : ''),
    to: r => (r.uses[0] ? conductorEnds(r.uses[0])[1] : ''), page: r => r.uses[0]?.loc ?? '',
  });

  const marking = common(chosen, markingOf);
  const setMarking = (m: CableMarking) => st().setCableMarking(ids, m);
  const formation = (n: number, pe: boolean) => {
    for (const c of chosen) st().updateCable(c.id, { conductors: conductorsFor(n, pe, markingOf(c)) });
  };
  const many = chosen.length > 1;
  const c = cur?.cable;

  return (
    <div className="parts-view cables-view">
      <div className="parts-list">
        <div className="parts-toolbar">
          <b>{tx('Cavi')}</b>
          <span className="muted small">{tx('{0} cavi', infos.length)}{busRows.length ? ` · ${tx('{0} cavi di rete', busRows.length)}` : ''}</span>
          <div className="tb-spacer" />
          <span className="muted small">{chosenIds.length > 1 ? tx('{0} selezionati', chosenIds.length) : tx('Clic, ⇧ clic o ⌘/Ctrl clic per selezionare più cavi')}</span>
          <button onClick={() => { st().setView('schema'); st().setTool({ kind: 'cable' }); }} title={tx('Linea di definizione cavo: clic prima e dopo i fili da includere')}>{tx('Disegna linea di cavo')}</button>
          <button onClick={() => st().setDialog('cableStyle')} title={tx('Dimensioni, colori, testi e trattino sui fili delle linee dei cavi sullo schema')}>{tx('Stile dei cavi…')}</button>
        </div>
        <ResizableSection id="cables-list" className="cables-list table-wrap">
          <table {...gridProps(g)}>
            <thead><tr>
              <Th g={g} k="tag">{tx('Sigla')}</Th><Th g={g} k="type">{tx('Tipo')}</Th><Th g={g} k="form">{tx('Formazione')}</Th>
              <Th g={g} k="marking">{tx('Marcatura')}</Th><Th g={g} k="used">{tx('Usati')}</Th><Th g={g} k="free">{tx('Liberi')}</Th>
              <Th g={g} k="pages">{tx('Pagine')}</Th><Th g={g} k="from">{tx('Da')}</Th><Th g={g} k="to">A</Th>
              <Th g={g} k="length">{tx('Lunghezza (m)')}</Th><Th g={g} k="description">{tx('Descrizione')}</Th>
            </tr></thead>
            <tbody>
              {g.rows.map(i => {
                const bad = i.conductors.some(k => k.problem);
                return (
                  <tr key={i.cable.id} className={ids.includes(i.cable.id) ? 'sel' : ''} onClick={e => click(i.cable.id, e)}>
                    <td className="nowrap">-{i.cable.tag}</td><td>{i.cable.type ?? ''}</td><td>{cableSection(i.cable)}</td>
                    <td>{markingOf(i.cable) === 'colors' ? tx('colori') : tx('numeri')}</td>
                    <td className={bad ? 'issue-error' : ''}>{i.conductors.length}</td><td>{i.spare.length}</td>
                    <td className="nowrap">{pagesOf(i).join(', ')}</td><td>{i.cable.from ?? ''}</td><td>{i.cable.to ?? ''}</td>
                    <td>{i.cable.length !== undefined ? String(i.cable.length).replace('.', ',') : ''}</td><td>{i.cable.description ?? ''}</td>
                  </tr>
                );
              })}
              {!infos.length && !busRows.length && <tr><td colSpan={11}><EmptyState icon="cable" text={tx('Nessun cavo. Disegna una linea di cavo sullo schema (strumento «Cavo»): i fili che attraversa diventano conduttori del cavo.')}
                action={tx('Disegna il primo cavo')} onAction={() => { const s = useStore.getState(); s.setView('schema'); s.setTool({ kind: 'cable' }); }} /></td></tr>}
            </tbody>
          </table>
        </ResizableSection>
        {busRows.length > 0 && (
          <>
            <div className="parts-toolbar">
              <b>{tx('Cavi di rete')}</b>
              <span className="muted small">{tx('Collegamenti bus tra le porte dei dispositivi (Profinet, EtherCAT…): sigla, tipo e articolo si scrivono anche selezionando il collegamento sullo schema')}</span>
            </div>
            <div className="table-wrap bus-cables">
              <table className="grid">
                <thead><tr>
                  <th>{tx('Sigla')}</th><th>{tx('Rete')}</th><th>{tx('Tipo')}</th><th>{tx('Lunghezza (m)')}</th><th>{tx('Da')}</th><th>A</th><th>{tx('Posizione')}</th><th>{tx('Articolo')}</th><th>{tx('Articoli aggiuntivi')}</th>
                </tr></thead>
                <tbody>
                  {busRows.map(r => (
                    <tr key={r.wire.id} className={busCur === r ? 'sel' : ''} onClick={() => setBusSel(r.wire.id)}>
                      <td className="nowrap">{r.tag ? `-${r.tag}` : ''}</td><td>{protocolLabel(r.protocol)}</td><td>{r.type}</td>
                      <td>{r.length !== undefined ? String(r.length).replace('.', ',') : ''}</td>
                      <td className="nowrap">{portText(r.a)}</td><td className="nowrap">{portText(r.b)}</td>
                      <td className="nowrap"><a href="#" onClick={ev => { ev.preventDefault(); ev.stopPropagation(); goTo(r.page.id, r.wire.id); }}>/{r.loc}</a></td>
                      <td>{r.partNr ?? ''}</td><td>{(r.extraParts ?? []).map(x => `${x.qty && x.qty !== 1 ? `${x.qty}× ` : ''}${x.partNr}`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {c && !busCur && (
          <>
            <div className="parts-toolbar">
              <b>{tx('Conduttori di -{0}', c.tag)}</b>
              <span className="muted small">{tx('{0} usati, {1} liberi su {2}', cur.conductors.length, cur.spare.length, c.conductors.length)}</span>
            </div>
            <div className="table-wrap">
              <table {...gridProps(cg)}>
                <thead><tr>
                  <Th g={cg} k="n">{tx('N.')}</Th><Th g={cg} k="name">{tx('Conduttore')}</Th><Th g={cg} k="wire">{tx('Filo')}</Th>
                  <Th g={cg} k="from">{tx('Da')}</Th><Th g={cg} k="to">A</Th><Th g={cg} k="page">{tx('Posizione')}</Th><Th g={cg} k="assign">{tx('Assegnazione')}</Th>
                </tr></thead>
                <tbody>
                  {cg.rows.map(r => {
                    const k = r.uses[0];
                    const ends = k ? conductorEnds(k) : ['', ''];
                    return (
                      <tr key={`${r.i}:${r.name}`} className={r.extra || r.uses.some(u => u.problem) ? 'issue-row' : k ? '' : 'muted'}>
                        <td>{r.i >= 0 ? r.i + 1 : ''}</td>
                        <td className="cond-name">
                          <ConductorSwatch name={r.name} />
                          {r.i >= 0 ? <Field value={r.name} onCommit={v => st().renameConductor(c.id, r.i, v)} /> : r.name}
                        </td>
                        <td>{r.uses.map(u => u.net?.wireNo).filter(Boolean).join(', ')}</td>
                        <td>{ends[0]}</td><td>{ends[1]}</td>
                        <td className="nowrap">{r.uses.map(u => <a key={u.wire.id} href="#" onClick={ev => { ev.preventDefault(); goTo(u.pageId, u.lineId); }}>/{u.loc} </a>)}</td>
                        <td>
                          {k ? (
                            <select value={c.assign[k.wire.id] ?? ''} onChange={e => st().assignConductor(c.id, k.wire.id, e.target.value)}
                              title={tx('Conduttore del filo: automatico o scelto a mano')}>
                              <option value="">{tx('automatico (')}{k.name})</option>
                              {c.conductors.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          ) : tx('libero')}
                          {r.uses.map(u => u.problem).filter(Boolean).map(p => <span key={p} className="issue-error"> {p}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <ColSplitter id="cables" />
      <div className="part-detail">
        <div className="detail-scroll">
          {busCur && <BusCableDetail r={busCur} parts={parts} onGo={() => goTo(busCur.page.id, busCur.wire.id)} />}
          {c && !busCur && (
            <>
              <h4>{many ? tx('Modifica {0} cavi insieme', chosen.length) : tx('Cavo -{0}', c.tag)}</h4>
              {many && <p className="muted small">{tx('I campi vuoti hanno valori diversi nei cavi scelti: scrivendo un valore vale per tutti.')}</p>}
              <table className="prop-table">
                <tbody>
                  {!many && <tr><td className="prop-name">{tx('Sigla')}</td><td className="prop-value"><span className="tag-input"><span className="dash">-</span><Field value={c.tag} onCommit={v => v.trim() && st().updateCable(c.id, { tag: v.replace(/^-/, '').trim() })} /></span></td></tr>}
                  <tr><td className="prop-name">{tx('Tipo di cavo')}</td><td className="prop-value">
                    <select value={common(chosen, x => x.partNr ?? '') ?? ''} onChange={e => e.target.value && st().applyCableType(ids, e.target.value)}
                      title={tx('Articoli cavo della libreria: scegliendone uno il cavo prende tutti i suoi conduttori, anche se nello schema se ne usano solo alcuni')}>
                      <option value="">{cableParts.length ? tx('— scegli un articolo cavo —') : tx('— nessun articolo cavo in libreria —')}</option>
                      {cableParts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''} ({p.cable!.conductors.length})</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Tipo')}</td><td className="prop-value"><Field value={common(chosen, x => x.type ?? '') ?? ''} placeholder={many ? tx('valori diversi') : tx('es. FG16OR16')} onCommit={v => st().updateCables(ids, { type: v.trim() || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Marcatura')}</td><td className="prop-value">
                    <select value={marking ?? ''} onChange={e => e.target.value && setMarking(e.target.value as CableMarking)}
                      title={tx('Cambiando la marcatura i conduttori si rinominano (numeri 1…n o colori standard); il giallo-verde resta')}>
                      {marking === undefined && <option value="">{tx('valori diversi')}</option>}
                      <option value="numbers">{tx('Numeri')}</option>
                      <option value="colors">{tx('Colori')}</option>
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Formazione')}</td><td className="prop-value">
                    {common(chosen, cableSection) ?? ''}{' '}
                    <select value="" onChange={e => { const [n, pe] = e.target.value.split('|'); if (n) formation(parseInt(n, 10), pe === '1'); }}>
                      <option value="">{tx('imposta…')}</option>
                      {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}g`} value={`${n}|1`}>{n}{tx('G (con giallo-verde)')}</option>)}
                      {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}x`} value={`${n}|0`}>{n}{tx('x (senza giallo-verde)')}</option>)}
                    </select>
                  </td></tr>
                  <tr><td className="prop-name">{tx('Conduttori')}</td><td className="prop-value">
                    <Field value={common(chosen, x => x.conductors.join(' ')) ?? ''} placeholder={many ? tx('valori diversi') : tx('BN BK GY BU GNYE')}
                      onCommit={v => { const list = v.split(/[\s,;]+/).filter(Boolean); if (list.length) st().updateCables(ids, { conductors: list }); }} />
                  </td></tr>
                  <tr><td className="prop-name">{tx('Sezione (mm²)')}</td><td className="prop-value"><Field value={common(chosen, x => x.cross ?? '') ?? ''} list="cable-sections" placeholder={many ? tx('valori diversi') : ''} onCommit={v => st().updateCables(ids, { cross: v.trim() || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Schermato')}</td><td className="prop-value"><input type="checkbox" checked={!!common(chosen, x => !!x.shield)} onChange={e => st().updateCables(ids, { shield: e.target.checked || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Coppie intrecciate')}</td><td className="prop-value"><input type="checkbox" checked={!!common(chosen, x => !!x.pairs)} title={tx('Conduttori intrecciati a coppie nell\'ordine (1-2, 3-4…), disegnati sulle linee del cavo')} onChange={e => st().updateCables(ids, { pairs: e.target.checked || undefined })} /></td></tr>
                  <tr><td className="prop-name">{tx('Lunghezza (m)')}</td><td className="prop-value"><Field value={common(chosen, x => (x.length !== undefined ? String(x.length).replace('.', ',') : '')) ?? ''} placeholder={many ? tx('valori diversi') : ''} onCommit={v => st().updateCables(ids, { length: num(v) })} /></td></tr>
                  {!many && <tr><td className="prop-name">{tx('Conduttori secondo i pin di')}</td><td className="prop-value">
                    <select value={c.pinsOf ?? ''} onChange={e => st().updateCable(c.id, { pinsOf: e.target.value || undefined })}
                      title={tx('Cavo con connettore integrato nel dispositivo: il filo che parte dal morsetto n prende il conduttore n del cavo (i conduttori scelti a mano restano)')}>
                      <option value="">{tx('— nell\'ordine dei fili —')}</option>
                      {[...new Set([...pinDeviceOptions(project, c.id), ...(c.pinsOf ? [c.pinsOf] : [])])].map(t => <option key={t} value={t}>-{t}</option>)}
                    </select>
                  </td></tr>}
                  <tr><td className="prop-name">{tx('Ordine')}</td><td className="prop-value">
                    <PiecesSelect value={common(chosen, x => (x.pieces === undefined ? '' : x.pieces ? 'pz' : 'm'))} fromPart={!many && cableByPiece({}, c.partNr ? parts.get(c.partNr) : undefined)}
                      onChange={v => st().updateCables(ids, { pieces: v === '' ? undefined : v === 'pz' })} />
                  </td></tr>
                  {!many && (
                    <>
                      <tr><td className="prop-name">{tx('Da')}</td><td className="prop-value"><Field value={c.from ?? ''} placeholder={tx('es. -X1')} onCommit={v => st().updateCable(c.id, { from: v.trim() || undefined })} /></td></tr>
                      {(() => {
                        // Connettori che fanno parte del cavo (preconfezionato): le estremità del cavo
                        const e = cableEnds(project).get(c.id);
                        return e?.conns.length ? <tr><td className="prop-name">{tx('Estremità')}</td><td className="prop-value small">{e.conns.map(x => (
                          <div key={x.conn}>{`${x.side}: ${x.type || `-${x.conn}`} → ${[...new Set(x.towards.map(t => t.split(':')[0]))].join(', ') || '—'}`} <span className="muted">{`(-${x.conn})`}</span></div>
                        ))}</td></tr> : null;
                      })()}
                      <tr><td className="prop-name">A</td><td className="prop-value"><Field value={c.to ?? ''} placeholder={tx('es. -M1')} onCommit={v => st().updateCable(c.id, { to: v.trim() || undefined })} /></td></tr>
                      <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><Field value={c.description ?? ''} onCommit={v => st().updateCable(c.id, { description: v.trim() || undefined })} /></td></tr>
                    </>
                  )}
                </tbody>
              </table>
              <datalist id="cable-sections">{WIRE_SECTIONS.map(x => <option key={x} value={x} />)}</datalist>
              {!many && <ExtraPartsTable list={c.extraParts ?? []} parts={parts} onChange={list => st().updateCable(c.id, { extraParts: list.length ? list : undefined })} />}
              <div className="row-btns">
                {!many && <button onClick={() => st().copyCableProps(c.id)} title={tx('Copia tipo, sezione, conduttori, colori scelti a mano e gli altri dati, tranne la sigla')}>{tx('Copia proprietà')}</button>}
                {clip && <button onClick={() => st().pasteCableProps(ids)} title={tx('I cavi scelti prendono tutte le proprietà copiate tranne la sigla; restano modificabili')}>{tx('Incolla proprietà di -{0}', clip.tag)}</button>}
              </div>
              {!many && (
                <div className="row-btns">
                  <button className="danger" onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Eliminare il cavo -{0} e tutte le sue linee?', c.tag), tx('Elimina'))) st().deleteCable(c.id); }}>{tx('Elimina cavo')}</button>
                </div>
              )}
              {!many && c.conductors.some(isPeName) && markingOf(c) === 'numbers' && (
                <p className="muted small">{tx('Il giallo-verde resta GNYE anche con la marcatura a numeri.')}</p>
              )}
              <h4>{tx('Tipi di cavo')}</h4>
              <p className="muted small">{tx('I tipi di cavo sono articoli della libreria: in Articoli apri un articolo e compila la sezione «Cavo» (marcatura e conduttori, uno per riga). Poi qui lo scegli in «Tipo di cavo».')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A metri o a pezzi (cavo confezionato con connettore): scelto sul cavo o come l'articolo */
export function PiecesSelect({ value, fromPart, onChange }: { value: string | undefined; fromPart: boolean; onChange: (v: '' | 'm' | 'pz') => void }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value as '' | 'm' | 'pz')}
      title={tx('I cavi confezionati (con connettore saldato, lunghezza fissa) si ordinano a pezzi: in distinta e nella lista d\'acquisto contano 1 pezzo per cavo invece dei metri')}>
      <option value="">{fromPart ? tx('come l\'articolo (a pezzi)') : tx('come l\'articolo (a metri)')}</option>
      <option value="m">{tx('a metri')}</option>
      <option value="pz">{tx('a pezzi (cavo confezionato)')}</option>
    </select>
  );
}

/**
 * Articoli aggiuntivi di un cavo (connettori da intestare, pressacavi, guaine…): codice dalla libreria
 * o scritto a mano, quantità; vanno in distinta materiali con la sigla del cavo
 */
export function ExtraPartsTable({ list, parts, onChange, title, hint }: { list: ExtraPart[]; parts: Map<string, Part>; onChange: (list: ExtraPart[]) => void; title?: string; hint?: string }) {
  const upd = (i: number, patch: Partial<ExtraPart>) => onChange(list.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  // Articoli connettore della libreria e del progetto, raggruppati per tipo (M12 codifica D, RJ45…)
  const connectors = [...parts.values()].filter(isConnectorPart).sort((a, b) => a.partNr.localeCompare(b.partNr, undefined, { numeric: true }));
  const groupOf = (p: Part) => { const t = connectorType(p.connectorType); return t ? connectorGroup(t, tx) : tx('Altri connettori'); };
  return (
    <>
      <h4>{title ?? tx('Articoli aggiuntivi')}</h4>
      <p className="muted small">{hint ?? tx('Connettori da intestare (RJ45, M12…), pressacavi, guaine: vanno in distinta materiali con la sigla del cavo.')}</p>
      <table className="prop-table extra-parts">
        <tbody>
          {list.map((x, i) => {
            const part = parts.get(x.partNr);
            return (
              <tr key={i}>
                <td className="prop-value"><Field value={x.partNr} list="cable-extra-parts" placeholder={tx('codice articolo')} onCommit={v => (v.trim() ? upd(i, { partNr: v.trim() }) : onChange(list.filter((_, k) => k !== i)))} /></td>
                <td className="prop-value small">{part?.descr1 ?? <Field value={x.descr ?? ''} placeholder={tx('descrizione')} onCommit={v => upd(i, { descr: v.trim() || undefined })} />}</td>
                <td className="prop-value" style={{ width: 56 }} title={tx('Quantità')}><Field value={String(x.qty ?? 1)} onCommit={v => { const n = parseFloat(v.replace(',', '.')); upd(i, { qty: n > 0 && n !== 1 ? n : undefined }); }} /></td>
                <td><button className="mini" title={tx('Togli l\'articolo')} onClick={() => onChange(list.filter((_, k) => k !== i))}>✕</button></td>
              </tr>
            );
          })}
          <tr>
            <td className="prop-value" colSpan={4}>
              <select value="" onChange={e => { if (e.target.value) onChange([...list, { partNr: e.target.value }]); }}
                title={connectors.length ? tx('Articoli segnati come connettore (Articoli ▸ Connettore)') : tx('Nessun articolo connettore: in Articoli apri l\'articolo e scegli il tipo nella tendina «Connettore»')}>
                <option value="">{connectors.length ? tx('+ aggiungi un connettore…') : tx('— nessun articolo connettore —')}</option>
                {[...new Set(connectors.map(groupOf))].map(g => (
                  <optgroup key={g} label={g}>
                    {connectors.filter(p => groupOf(p) === g).map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}{p.descr1 ? ` · ${p.descr1}` : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <td className="prop-value" colSpan={4}><Field key={list.length} value="" list="cable-extra-parts" placeholder={tx('+ altro articolo (pressacavo, guaina…): scrivi o scegli un codice')} onCommit={v => { if (v.trim()) onChange([...list, { partNr: v.trim() }]); }} /></td>
          </tr>
        </tbody>
      </table>
      <datalist id="cable-extra-parts">{[...parts.values()].map(p => <option key={p.partNr} value={p.partNr}>{p.descr1 ?? ''}</option>)}</datalist>
    </>
  );
}

/** Cavo di rete scelto nella vista Cavi: sigla, tipo, lunghezza, articolo e articoli aggiuntivi (valgono per tutti i suoi tratti) */
function BusCableDetail({ r, parts, onGo }: { r: BusCableRow; parts: Map<string, Part>; onGo: () => void }) {
  const st = useStore.getState;
  const c = r.wire.busCable ?? {};
  const set = (patch: Partial<BusCable>) =>
    st().setWireProps(r.wires.map(w => w.id), { busCable: { ...c, ...patch, ...('tag' in patch ? { auto: patch.tag ? undefined : c.auto } : {}) } });
  return (
    <>
      <h4>{tx('Cavo di rete {0}', r.tag ? `-${r.tag}` : '')} · {protocolLabel(r.protocol)}</h4>
      <table className="prop-table">
        <tbody>
          <tr><td className="prop-name">{tx('Sigla')}</td><td className="prop-value"><span className="tag-input"><span className="dash">-</span><Field value={c.tag ?? r.tag} placeholder={tx('automatica')} onCommit={v => set({ tag: v.replace(/^-/, '').trim() || undefined })} /></span></td></tr>
          <tr><td className="prop-name">{tx('Tipo')}</td><td className="prop-value"><Field value={c.type ?? ''} list="bus-cable-types-view" placeholder={BUS_CABLE_TYPES[r.protocol] ?? tx('es. Cat5e SF/UTP')} onCommit={v => set({ type: v.trim() || undefined })} /></td></tr>
          <tr><td className="prop-name">{tx('Lunghezza (m)')}</td><td className="prop-value"><Field value={c.length !== undefined ? String(c.length).replace('.', ',') : ''} placeholder={tx('es. 2')} onCommit={v => set({ length: num(v) })} /></td></tr>
          <tr><td className="prop-name">{tx('Articolo')}</td><td className="prop-value"><Field value={c.partNr ?? ''} list="cable-extra-parts" placeholder={tx('codice articolo (es. cavo confezionato)')} onCommit={v => set({ partNr: v.trim() || undefined })} /></td></tr>
          <tr><td className="prop-name">{tx('Da')}</td><td className="prop-value">{portText(r.a)}</td></tr>
          <tr><td className="prop-name">A</td><td className="prop-value">{portText(r.b)}</td></tr>
        </tbody>
      </table>
      <datalist id="bus-cable-types-view">{[...new Set(Object.values(BUS_CABLE_TYPES))].map(t => <option key={t} value={t} />)}</datalist>
      <div className="row-btns"><button onClick={onGo}>{tx('Mostra sullo schema')}</button></div>
      <ExtraPartsTable list={c.extraParts ?? []} parts={parts} onChange={list => set({ extraParts: list.length ? list : undefined })} />
    </>
  );
}
