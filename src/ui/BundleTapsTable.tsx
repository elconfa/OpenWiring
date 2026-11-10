// Fili che entrano o escono da un bus, con il conduttore modificabile (scelto tra quelli del cavo,
// con i liberi e gli usati), e l'elenco dei conduttori del cavo: usati, in attesa dell'uscita, liberi.
// Usata dalla vista Bus fili e dalle proprietà del bus (doppio clic sul bus).
import { useMemo } from 'react';
import { useStore } from '../model/store';
import { bundleTaps, bundleConductorList, conductorChoices, type BundleTap } from '../model/bundles';
import { partsIndex } from '../model/devices';
import { computeNetlist } from '../model/netlist';
import { columnOf } from '../model/types';
import { ConductorSwatch } from './CablesView';
import { ConductorPicker } from './ConductorPicker';
import { tx } from '../i18n/ui';

/** Dati del bus a cui appartiene il segmento: fili, conduttori del cavo, scelte con usati e liberi */
export function useBundleData(wireId: string | undefined) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  return useMemo(() => {
    const parts = partsIndex(project, library);
    const { taps, groupOf, names } = bundleTaps(project);
    const group = wireId ? groupOf.get(wireId) : undefined;
    if (!group) return undefined;
    const name = names.get(group) ?? '';
    const mine = taps.filter(t => t.group === group);
    const order = new Map(project.pages.map((p, i) => [p.id, i]));
    mine.sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || a.at.x - b.at.x || a.at.y - b.at.y);
    const list = bundleConductorList(project, group, name, parts);
    const choices = conductorChoices(project, taps, group, name, parts);
    const counts = new Map<string, number>();
    for (const t of mine) if (t.name) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
    return { group, name, taps: mine, list, choices, counts, nl: computeNetlist(project), pageOf: new Map(project.pages.map(p => [p.id, p])) };
  }, [project, library, wireId]);
}
export type BundleData = NonNullable<ReturnType<typeof useBundleData>>;

/** Stato di un filo nel bus: senza conduttore, entra ma non esce, conduttore che il cavo non ha, collegato */
export function tapStatus(d: BundleData, t: BundleTap) {
  if (!t.name) return { bad: true, text: tx('senza conduttore') };
  const n = d.counts.get(t.name) ?? 0;
  if (d.list && !d.list.includes(t.name)) return { bad: true, text: tx('il cavo non ha il conduttore {0}', t.name) };
  if (n < 2) return { bad: true, text: tx('entra ma non esce') };
  return { bad: false, text: n > 2 ? tx('{0} fili', n) : tx('collegato') };
}

/** Tabella dei fili del bus con il conduttore da correggere; full = anche numero filo e «vai allo schema» */
export function BundleTapsTable({ d, full }: { d: BundleData; full?: boolean }) {
  const st = useStore.getState;
  const ends = (t: BundleTap) => {
    const net = d.nl.wireNet.get(t.wire.id);
    return net ? net.pins.filter(p => p.el.page.id === t.pageId).map(p => `-${p.ref}`).join(', ') : '';
  };
  const goTo = (t: BundleTap) => { st().setPage(t.pageId); st().setSelection([t.wire.id]); st().setView('schema'); };
  if (!d.taps.length) return <div className="muted small">{tx('Nessun filo entra nel bus')}</div>;
  return (
    <>
      <table className="grid">
        <thead><tr><th>{tx('Pagina')}</th>{full && <th>{tx('Numero filo')}</th>}<th>{tx('Collega')}</th><th>{tx('Conduttore nel bus')}</th><th>{tx('Stato')}</th>{full && <th />}</tr></thead>
        <tbody>
          {d.taps.map(t => {
            const s = tapStatus(d, t);
            const pg = d.pageOf.get(t.pageId);
            return (
              <tr key={`${t.wire.id}|${t.end}`} className={s.bad ? 'row-bad' : ''}>
                <td>{pg ? `${pg.name}.${columnOf(t.at.x)}` : ''}</td>
                {full && <td>{d.nl.wireNet.get(t.wire.id)?.wireNo ?? ''}</td>}
                <td className="small">{ends(t)}</td>
                <td className="nowrap">
                  <ConductorSwatch name={t.name ?? ''} />{' '}
                  <ConductorPicker value={t.name ?? ''} choices={d.choices} width={80} onCommit={v => st().setWireTap(t.wire.id, t.end, v)} />
                </td>
                <td className={s.bad ? 'warn-text small' : 'muted small'}>{s.text}</td>
                {full && <td><button className="mini" onClick={() => goTo(t)} title={tx('Mostra sullo schema')}>→</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Conduttori del cavo (o già nel bus) con lo stato: usato, entrato e in attesa dell'uscita, libero */
export function BundleConductorChips({ d }: { d: BundleData }) {
  const shown = d.choices.filter(c => c.count || d.list);
  if (!shown.length) return <span className="muted">—</span>;
  return (
    <div className="bundle-chips">
      {shown.map(c => (
        <span key={c.name} className={`bundle-chip ${c.count === 1 ? 'tone-wait' : c.count ? 'tone-used' : 'tone-free'}`}
          title={c.count === 1 ? tx('Entrato, aspetta l\'uscita') : c.count ? tx('{0} fili collegati', c.count) : tx('libero')}>
          <ConductorSwatch name={c.name} /> {c.name}{c.count === 1 ? ' ⚠' : ''}
        </span>
      ))}
    </div>
  );
}
