// Mappa del foglio: con lo schema ingrandito, in un angolo la pagina intera in piccolo con il riquadro
// della parte a video. Clic o trascinamento sulla mappa spostano la vista in quel punto.
import { memo, useDeferredValue, useRef } from 'react';
import type { Page, Project } from '../model/types';
import { PAGE_W, PAGE_H } from '../model/types';
import { PageContent, type PageDerived } from './PageSvg';
import { useStore } from '../model/store';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

interface Rect { x: number; y: number; w: number; h: number }

const Sheet = memo(function Sheet({ project, page, index, pd }: { project: Project; page: Page; index: number; pd: PageDerived }) {
  return <PageContent project={project} page={page} pageIndex={index} derived={pd} />;
});

export function Minimap({ project, page, index, pd, view, onMove }: {
  project: Project; page: Page; index: number; pd: PageDerived; view: Rect; onMove: (center: { x: number; y: number }) => void;
}) {
  const later = useDeferredValue({ project, page, pd });
  const ref = useRef<SVGSVGElement>(null);
  const W = 220, H = (W * PAGE_H) / PAGE_W;
  const at = (ev: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    onMove({ x: ((ev.clientX - r.left) / r.width) * PAGE_W, y: ((ev.clientY - r.top) / r.height) * PAGE_H });
  };
  const down = (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    at(ev);
    const move = (e: MouseEvent) => at(e);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className="minimap" style={{ width: W + 2 }} aria-label={tx('Mappa del foglio')}>
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} onMouseDown={down}>
        <Sheet project={later.project} page={later.page} index={index} pd={later.pd} />
        <rect x={view.x} y={view.y} width={view.w} height={view.h} className="mm-view" />
      </svg>
      <button className="mm-close" title={tx('Nascondi la mappa del foglio (torna da Visualizza)')} onClick={() => useStore.getState().setMinimap(false)}><Icon name="close" size={10} /></button>
    </div>
  );
}
