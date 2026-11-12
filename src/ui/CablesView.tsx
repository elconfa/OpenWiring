// Vista Cavi: tutti i cavi del progetto con tipo, formazione, conduttori usati e liberi e pagine in
// cui compaiono le loro linee. Si selezionano più cavi per cambiarne insieme tipo, marcatura
// (numeri o colori), sezione o lunghezza. Sotto, i conduttori del cavo scelto, uno per riga, anche
// quelli non ancora usati: nome (numero o colore) modificabile, filo, estremità e pagina.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { cableByPiece, pinDeviceOptions, cableInfos, cableSection, conductorColors, conductorEnds, conductorsFor, isPeName, markingOf, type CableInfo, type Conductor } from '../model/cables';
import { partsIndex } from '../model/devices';
import { WIRE_SECTIONS, type Cable, type CableMarking } from '../model/types';
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

const pagesOf = (i: CableInfo) => [...new Set(i.lines.map(l => l.loc.split('.')[0]))];
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
          <span className="muted small">{tx('{0} cavi', infos.length)}</span>
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
              {!infos.length && <tr><td colSpan={11}><EmptyState icon="cable" text={tx('Nessun cavo. Disegna una linea di cavo sullo schema (strumento «Cavo»): i fili che attraversa diventano conduttori del cavo.')}
                action={tx('Disegna il primo cavo')} onAction={() => { const s = useStore.getState(); s.setView('schema'); s.setTool({ kind: 'cable' }); }} /></td></tr>}
            </tbody>
          </table>
        </ResizableSection>
        {c && (
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
          {c && (
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
                      <tr><td className="prop-name">A</td><td className="prop-value"><Field value={c.to ?? ''} placeholder={tx('es. -M1')} onCommit={v => st().updateCable(c.id, { to: v.trim() || undefined })} /></td></tr>
                      <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><Field value={c.description ?? ''} onCommit={v => st().updateCable(c.id, { description: v.trim() || undefined })} /></td></tr>
                    </>
                  )}
                </tbody>
              </table>
              <datalist id="cable-sections">{WIRE_SECTIONS.map(x => <option key={x} value={x} />)}</datalist>
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
