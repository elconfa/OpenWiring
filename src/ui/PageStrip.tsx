// Striscia delle miniature delle pagine, sotto lo schema: clic per andare alla pagina, trascinando una
// miniatura si cambia l'ordine delle pagine (come «Sposta su/giù», annullabile). Le miniature si
// disegnano solo quando sono a video e restano un passo indietro rispetto alle modifiche, per non
// rallentare il disegno.
import { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { Derived } from '../model/derive';
import type { PageDerived } from './PageSvg';
import type { Page, Project } from '../model/types';
import { PAGE_W, PAGE_H } from '../model/types';
import { PageContent } from './PageSvg';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

const Thumb = memo(function Thumb({ project, page, index, pd }: { project: Project; page: Page; index: number; pd?: PageDerived }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} className="ps-img">
      {seen && pd && (
        <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} preserveAspectRatio="xMidYMid meet">
          <PageContent project={project} page={page} pageIndex={index} derived={pd} />
        </svg>
      )}
    </div>
  );
});

export function PageStrip({ derived }: { derived: Derived }) {
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const later = useDeferredValue({ project, derived });
  const [drag, setDrag] = useState<{ id: string; over?: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const st = useStore.getState;
  // La pagina corrente resta a video
  useEffect(() => { strip.current?.querySelector('.ps-item.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [pageId]);
  const drop = (to: number) => {
    if (!drag) return;
    const from = project.pages.findIndex(p => p.id === drag.id);
    setDrag(null);
    if (from < 0 || to === from || to === from + 1) return;
    st().movePage(drag.id, to > from ? to - from - 1 : to - from);
  };
  return (
    <div className="page-strip" ref={strip} role="listbox" aria-label={tx('Pagine')}
      onWheel={e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
      {project.pages.map((p, i) => {
        const lp = later.project.pages.find(x => x.id === p.id) ?? p;
        return (
          <div key={p.id} role="option" aria-selected={p.id === pageId} draggable
            className={`ps-item${p.id === pageId ? ' on' : ''}${drag?.over === i ? ' drop-before' : ''}${drag?.over === i + 1 && i === project.pages.length - 1 ? ' drop-after' : ''}`}
            title={`${p.name} ${p.title}`}
            onClick={() => { st().setView('schema'); st().setPage(p.id); }}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); setDrag({ id: p.id }); }}
            onDragOver={e => {
              if (!drag) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const over = e.clientX < r.left + r.width / 2 ? i : i + 1;
              if (over !== drag.over) setDrag({ ...drag, over });
            }}
            onDrop={e => { e.preventDefault(); drop(drag?.over ?? i); }}
            onDragEnd={() => setDrag(null)}>
            <Thumb project={later.project} page={lp} index={i} pd={later.derived.pages.get(p.id)} />
            <span className="ps-name">{p.name}<span className="muted"> {p.title}</span></span>
          </div>
        );
      })}
      <button className="ps-add" onClick={() => st().setPageStrip(false)} title={tx('Nascondi le miniature (tornano da Visualizza)')}><Icon name="close" size={12} /></button>
    </div>
  );
}
