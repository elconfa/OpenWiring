// Vista Bus fili: tutti i bus di conduttori del progetto e, per quello scelto, ogni filo che vi entra
// o ne esce con pagina, numero filo e collegamenti; il conduttore si corregge qui. Un conduttore
// scritto una volta sola (entra ma non esce) o in più di due punti si vede subito.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { bundleTaps, bundleCable, bundleConductorList, conductorChoices, type BundleTap } from '../model/bundles';
import { partsIndex } from '../model/devices';
import { computeNetlist } from '../model/netlist';
import { columnOf } from '../model/types';
import { ColSplitter } from './split';
import { ConductorSwatch } from './CablesView';
import { EmptyState } from './EmptyState';
import { tx } from '../i18n/ui';

function Field({ value, onCommit, list, width }: { value: string; onCommit: (v: string) => void; list?: string; width?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input value={v} list={list} style={width ? { width } : undefined} placeholder="—" onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

interface Bus { group: string; name: string; wireId: string; pages: string[]; taps: BundleTap[] }

export function BundlesView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const sel = useStore(s => s.bundleSel);
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const st = useStore.getState;
  const data = useMemo(() => {
    const { taps, groupOf, names } = bundleTaps(project);
    const buses = new Map<string, Bus>();
    for (const pg of project.pages) for (const e of pg.elements) {
      if (e.kind !== 'wire' || e.bundle === undefined) continue;
      const g = groupOf.get(e.id)!;
      const b = buses.get(g) ?? { group: g, name: names.get(g) ?? '', wireId: e.id, pages: [], taps: [] };
      if (!b.pages.includes(pg.name)) b.pages.push(pg.name);
      buses.set(g, b);
    }
    for (const t of taps) buses.get(t.group)?.taps.push(t);
    const nl = computeNetlist(project);
    return { buses: [...buses.values()], nl, groupOf };
  }, [project]);
  const pageOf = useMemo(() => new Map(project.pages.map(p => [p.id, p])), [project]);
  const bus = data.buses.find(b => b.wireId === sel || b.taps.some(t => t.bundle.id === sel)) ?? data.buses[0];
  const counts = new Map<string, number>();
  for (const t of bus?.taps ?? []) if (t.name) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  const cable = bus ? bundleCable(project, bus.name) : undefined;
  const list = bus ? bundleConductorList(project, bus.group, bus.name, parts) : undefined;
  const choices = bus ? conductorChoices(project, bus.taps, bus.group, bus.name, parts) : [];
  const busPart = bus ? project.pages.flatMap(pg => pg.elements).find(e => e.kind === 'wire' && e.bundlePart && data.groupOf.get(e.id) === bus.group) : undefined;
  const rows = [...(bus?.taps ?? [])].sort((a, b) => {
    const pa = project.pages.findIndex(p => p.id === a.pageId), pb = project.pages.findIndex(p => p.id === b.pageId);
    return pa - pb || a.at.x - b.at.x || a.at.y - b.at.y;
  });
  const status = (t: BundleTap) => {
    if (!t.name) return { bad: true, text: tx('senza conduttore') };
    const n = counts.get(t.name) ?? 0;
    if (n < 2) return { bad: true, text: tx('entra ma non esce') };
    if (list && !list.includes(t.name)) return { bad: true, text: tx('il cavo non ha il conduttore {0}', t.name) };
    return { bad: false, text: n > 2 ? tx('{0} fili', n) : tx('collegato') };
  };
  const ends = (t: BundleTap) => {
    const net = data.nl.wireNet.get(t.wire.id);
    return net ? net.pins.filter(p => p.el.page.id === t.pageId).map(p => `-${p.ref}`).join(', ') : '';
  };
  const goTo = (t: BundleTap) => { st().setPage(t.pageId); st().setSelection([t.wire.id]); st().setView('schema'); };
  const problems = (b: Bus) => b.taps.filter(t => !t.name).length + [...new Set(b.taps.map(t => t.name).filter(Boolean))].filter(n => b.taps.filter(t => t.name === n).length < 2).length;

  if (!data.buses.length) {
    return <div className="parts-view"><EmptyState icon="bundle" text={tx('Nessun bus fili. Usa lo strumento «Bus fili» per disegnare una linea spessa che porta più conduttori; i fili che vi entrano hanno il nome del conduttore.')} /></div>;
  }
  return (
    <div className="parts-view bundles-view">
      <div className="parts-list">
        <div className="parts-toolbar">
          <b>{bus?.name ? tx('Bus «{0}»', bus.name) : tx('Bus senza nome')}</b>
          {cable && <span className="muted small">{tx('Cavo -{0}: i conduttori del bus sono quelli del cavo', cable.tag)}</span>}
          {!cable && busPart?.kind === 'wire' && list && <span className="muted small">{tx('Articolo {0}: i conduttori del bus sono quelli del cavo', busPart.bundlePart!)}</span>}
          <div className="tb-spacer" />
          <span className="muted small">{tx('{0} fili', rows.length)}</span>
        </div>
        <datalist id="bundle-conductors">{choices.map(c => <option key={c.name} value={c.name} />)}</datalist>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>{tx('Pagina')}</th><th>{tx('Numero filo')}</th><th>{tx('Collega')}</th><th>{tx('Conduttore nel bus')}</th><th>{tx('Stato')}</th><th /></tr></thead>
            <tbody>
              {rows.map(t => {
                const s = status(t);
                const pg = pageOf.get(t.pageId);
                return (
                  <tr key={`${t.wire.id}|${t.end}`} className={s.bad ? 'row-bad' : ''}>
                    <td>{pg ? `${pg.name}.${columnOf(t.at.x)}` : ''}</td>
                    <td>{data.nl.wireNet.get(t.wire.id)?.wireNo ?? ''}</td>
                    <td className="small">{ends(t)}</td>
                    <td className="nowrap">
                      <ConductorSwatch name={t.name ?? ''} />{' '}
                      <Field value={t.name ?? ''} list="bundle-conductors" width={80} onCommit={v => st().setWireTap(t.wire.id, t.end, v)} />
                    </td>
                    <td className={s.bad ? 'warn-text small' : 'muted small'}>{s.text}</td>
                    <td><button className="mini" onClick={() => goTo(t)} title={tx('Mostra sullo schema')}>→</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ColSplitter id="bundles" />
      <div className="part-detail">
        <div className="detail-scroll">
          <h4>{tx('Bus fili')}</h4>
          <table className="grid">
            <tbody>
              {data.buses.map(b => {
                const n = problems(b);
                return (
                  <tr key={b.group} className={b === bus ? 'sel' : ''} onClick={() => st().setBundleSel(b.wireId)}>
                    <td>{b.name || tx('senza nome')}</td>
                    <td className="muted">{b.pages.map(p => `/${p}`).join(' ')}</td>
                    <td className={n ? 'warn-text' : 'muted'}>{n ? `⚠ ${n}` : tx('{0} fili', b.taps.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bus && (
            <>
              <h4>{tx('Conduttori')}</h4>
              <table className="grid">
                <tbody>
                  {choices.filter(c => c.count || list).map(c => (
                    <tr key={c.name} className={c.count === 1 ? 'row-bad' : c.count ? '' : 'muted'}>
                      <td className="nowrap"><ConductorSwatch name={c.name} /> {c.name}</td>
                      <td className="small">{c.count ? tx('{0} fili', c.count) : tx('libero')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row-buttons">
                {[...new Set(bus.taps.filter(t => !t.name).map(t => t.pageId))].map(pid => {
                  const seg = pageOf.get(pid)?.elements.find(e => e.kind === 'wire' && e.bundle !== undefined && bus.taps.some(t => t.bundle.id === e.id && t.pageId === pid));
                  return seg ? <button key={pid} onClick={() => st().nameBundleTaps(seg.id)} title={tx('I fili senza conduttore della pagina, da sinistra a destra: prima i conduttori entrati altrove che aspettano l\'uscita, poi quelli liberi')}>{tx('Nomina in ordine i fili di pagina {0}', pageOf.get(pid)?.name ?? '')}</button> : null;
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
