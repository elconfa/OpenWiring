// Vista Bus fili: tutti i bus di conduttori del progetto e, per quello scelto, ogni filo che vi entra
// o ne esce con pagina, numero filo e collegamenti; il conduttore si corregge qui. Un conduttore
// scritto una volta sola (entra ma non esce) o in più di due punti si vede subito.
import { useMemo } from 'react';
import { useStore } from '../model/store';
import { bundleTaps, bundleCable, type BundleTap } from '../model/bundles';
import { ColSplitter } from './split';
import { useBundleData, BundleTapsTable, BundleConductorChips } from './BundleTapsTable';
import { EmptyState } from './EmptyState';
import { tx } from '../i18n/ui';

interface Bus { group: string; name: string; wireId: string; pages: string[]; taps: BundleTap[] }

export function BundlesView() {
  const project = useStore(s => s.project);
  const sel = useStore(s => s.bundleSel);
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
    return { buses: [...buses.values()], groupOf };
  }, [project]);
  const pageOf = useMemo(() => new Map(project.pages.map(p => [p.id, p])), [project]);
  const bus = data.buses.find(b => b.wireId === sel || b.taps.some(t => t.bundle.id === sel)) ?? data.buses[0];
  const d = useBundleData(bus?.wireId);
  const cable = bus ? bundleCable(project, bus.name) : undefined;
  const busPart = bus ? project.pages.flatMap(pg => pg.elements).find(e => e.kind === 'wire' && e.bundlePart && data.groupOf.get(e.id) === bus.group) : undefined;
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
          {!cable && busPart?.kind === 'wire' && d?.list && <span className="muted small">{tx('Articolo {0}: i conduttori del bus sono quelli del cavo', busPart.bundlePart!)}</span>}
          <div className="tb-spacer" />
          <span className="muted small">{tx('{0} fili', d?.taps.length ?? 0)}</span>
        </div>
        <div className="table-wrap">
          {d && <BundleTapsTable d={d} full />}
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
              {d && <BundleConductorChips d={d} />}
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
