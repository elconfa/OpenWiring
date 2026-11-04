// Editor del layout del quadro: piastra in scala, guide DIN, canaline, apparecchi e
// morsettiere con le misure degli articoli; posa automatica e DXF 1:1 per la foratura.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { Layout, LayoutItem, Page, Pt } from '../model/types';
import { PAGE_W, PAGE_H } from '../model/types';
import { Frame, LayoutDrawing, SEL } from './PageSvg';
import { layoutOf, layoutView, placeables, placedRefs, railUsage, snapItem, layoutToDxf, RAIL_H, DUCT_W, type Placeable } from '../model/layout';
import { uid } from '../model/geometry';
import { saveFile, safeName } from '../io/fileio';
import { AutoLayoutDialog } from './AutoLayoutDialog';
import { tx } from '../i18n/ui';

type LTool = { kind: 'select' } | { kind: 'rail' } | { kind: 'duct' } | { kind: 'place'; p: Placeable };

export function LayoutView({ page }: { page: Page }) {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const selection = useStore(s => s.selection);
  const st = useStore.getState;
  const l = layoutOf(page);
  const v = layoutView(l);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState({ x: -10, y: -10, w: PAGE_W + 20, h: PAGE_H + 20 });
  const [tool, setTool] = useState<LTool>({ kind: 'select' });
  const [drag, setDrag] = useState<{ id: string; start: Pt; dx: number; dy: number } | null>(null);
  const [draw, setDraw] = useState<{ a: Pt; b: Pt } | null>(null);
  const [mouse, setMouse] = useState<Pt>({ x: 0, y: 0 });
  const selSet = useMemo(() => new Set(selection), [selection]);
  // Pagina assegnata a un luogo: solo gli elementi di quel luogo
  const all = useMemo(() => placeables(project, library, page.panelId), [project, library, page.panelId]);
  const done = useMemo(() => placedRefs(project), [project]);
  const todo = all.filter(p => !done.has(`${p.kind}|${p.ref}`));
  useEffect(() => setVb({ x: -10, y: -10, w: PAGE_W + 20, h: PAGE_H + 20 }), [page.id]);

  const toPage = (cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.max(vb.w / r.width, vb.h / r.height);
    return { x: vb.x - (r.width * scale - vb.w) / 2 + (cx - r.left) * scale, y: vb.y - (r.height * scale - vb.h) / 2 + (cy - r.top) * scale };
  };
  /** Punto della piastra (mm reali) */
  const toPlate = (p: Pt): Pt => ({ x: (p.x - v.ox) / v.k, y: (p.y - v.oy) / v.k });
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = toPage(ev.clientX, ev.clientY);
      const k = Math.exp(ev.deltaY * 0.0015);
      setVb(o => { const w = Math.min(2000, Math.max(20, o.w * k)), h = o.h * (w / o.w); return { x: p.x - (p.x - o.x) * (w / o.w), y: p.y - (p.y - o.y) * (h / o.h), w, h }; });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'Escape') { setTool({ kind: 'select' }); setDraw(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault(); e.stopImmediatePropagation();
        st().updateLayout(page.id, x => { x.items = x.items.filter(i => !selection.includes(i.id)); });
        st().setSelection([]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const hit = (q: Pt): LayoutItem | undefined => {
    const order = { device: 0, strip: 1, duct: 2, rail: 3 };
    return [...l.items].sort((a, b) => order[a.kind] - order[b.kind]).find(i => q.x >= i.x && q.x <= i.x + i.w && q.y >= i.y && q.y <= i.y + i.h);
  };
  const onDown = (ev: React.MouseEvent) => {
    if (ev.button !== 0) return;
    const q = toPlate(toPage(ev.clientX, ev.clientY));
    if (tool.kind === 'place') {
      const it = snapItem(l, { id: uid('L'), kind: tool.p.kind, ref: tool.p.ref, x: q.x - tool.p.w / 2, y: q.y - tool.p.h / 2, w: tool.p.w, h: tool.p.h });
      st().updateLayout(page.id, x => { x.items.push(it); });
      st().setSelection([it.id]);
      setTool({ kind: 'select' });
      return;
    }
    if (tool.kind === 'rail' || tool.kind === 'duct') { setDraw({ a: q, b: q }); return; }
    const h = hit(q);
    if (h) {
      if (!selSet.has(h.id)) st().setSelection(ev.shiftKey ? [...selection, h.id] : [h.id]);
      setDrag({ id: h.id, start: q, dx: 0, dy: 0 });
    } else st().setSelection([]);
  };
  const onMove = (ev: React.MouseEvent) => {
    const q = toPlate(toPage(ev.clientX, ev.clientY));
    setMouse(q);
    if (draw) setDraw({ ...draw, b: q });
    if (drag) setDrag({ ...drag, dx: q.x - drag.start.x, dy: q.y - drag.start.y });
  };
  const onUp = (ev: React.MouseEvent) => {
    const q = toPlate(toPage(ev.clientX, ev.clientY));
    if (draw) {
      const a = draw.a, b = q;
      setDraw(null);
      const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const len = Math.round(horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y));
      if (len < 20) return;
      const t = tool.kind === 'rail' ? RAIL_H : DUCT_W;
      const it: LayoutItem = snapItem(l, horiz
        ? { id: uid('L'), kind: tool.kind as 'rail', x: Math.min(a.x, b.x), y: a.y - t / 2, w: len, h: t, label: tool.kind === 'rail' ? 'TS35' : '40x60' }
        : { id: uid('L'), kind: tool.kind as 'rail', x: a.x - t / 2, y: Math.min(a.y, b.y), w: t, h: len, label: tool.kind === 'rail' ? 'TS35' : '40x60' });
      st().updateLayout(page.id, x => { x.items.push(it); });
      st().setSelection([it.id]);
      return;
    }
    if (drag && (Math.abs(drag.dx) > 0.5 || Math.abs(drag.dy) > 0.5)) {
      const ids = new Set(selection.includes(drag.id) ? selection : [drag.id]);
      st().updateLayout(page.id, x => {
        x.items = x.items.map(i => (ids.has(i.id) ? snapItem(x, { ...i, x: i.x + drag.dx, y: i.y + drag.dy }) : i));
      });
    }
    setDrag(null);
  };

  const sel = l.items.filter(i => selSet.has(i.id));
  const one = sel.length === 1 ? sel[0] : undefined;
  const setItem = (patch: Partial<LayoutItem>) => one && st().updateLayout(page.id, x => { x.items = x.items.map(i => (i.id === one.id ? { ...i, ...patch } : i)); });
  const setPlate = (patch: Partial<Layout['plate']>) => st().updateLayout(page.id, x => { x.plate = { ...x.plate, ...patch }; });
  const num = (val: number | undefined, f: (n: number) => void) => (
    <input type="number" value={val ?? ''} onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) f(n); }} />
  );
  const parts = [...new Map([...library, ...project.parts].map(p => [p.partNr, p])).values()];
  const ghost = tool.kind === 'place' ? { x: v.ox + (mouse.x - tool.p.w / 2) * v.k, y: v.oy + (mouse.y - tool.p.h / 2) * v.k, w: tool.p.w * v.k, h: tool.p.h * v.k } : undefined;
  const [autoOpen, setAutoOpen] = useState(false);
  const exportDxf = async () => {
    const path = await saveFile(`${safeName(project.info.name)}_layout_pag${safeName(page.name)}.dxf`, layoutToDxf(page), [{ name: 'DXF', extensions: ['dxf'] }]);
    if (path) st().logMsg(tx('DXF del layout in scala 1:1 esportato: {0}', path));
  };

  return (
    <div className="layout-view">
      {autoOpen && <AutoLayoutDialog pageId={page.id} onClose={() => setAutoOpen(false)} />}
      <div className="parts-toolbar">
        <button className={tool.kind === 'select' ? 'tab active' : 'tab'} onClick={() => setTool({ kind: 'select' })}>{tx('Seleziona')}</button>
        <button className={tool.kind === 'rail' ? 'tab active' : 'tab'} onClick={() => setTool({ kind: 'rail' })} title={tx('Trascina per disegnare una guida DIN')}>{tx('Guida DIN')}</button>
        <button className={tool.kind === 'duct' ? 'tab active' : 'tab'} onClick={() => setTool({ kind: 'duct' })} title={tx('Trascina per disegnare una canalina')}>{tx('Canalina')}</button>
        <button onClick={() => setAutoOpen(true)} title={tx('Scegli cosa montare: crea guide e canaline se mancano e posa gli elementi scelti')}>{tx('Posa automatica…')}</button>
        <button disabled={!sel.length} onClick={() => { st().updateLayout(page.id, x => { x.items = x.items.filter(i => !selSet.has(i.id)); }); st().setSelection([]); }}>{tx('Elimina')}</button>
        <div className="tb-spacer" />
        <span className="muted small">{tx('Piastra')} {Math.round(mouse.x)} · {Math.round(mouse.y)} {tx('mm · scala 1:')}{v.n}</span>
        <button onClick={() => void exportDxf()} title={tx('Piastra, guide, canaline, sagome e fori di fissaggio in scala 1:1')}>{tx('DXF foratura 1:1')}</button>
      </div>
      <div className="layout-body">
        <svg ref={svgRef} className="canvas" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { setDrag(null); setDraw(null); }}>
          <rect x={-2000} y={-2000} width={5000} height={5000} fill="var(--canvas-bg)" />
          <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#fff" />
          <Frame project={project} page={page} pageIndex={project.pages.indexOf(page)} />
          <LayoutDrawing layout={l} selection={selSet} drag={drag ? { id: drag.id, dx: drag.dx, dy: drag.dy } : undefined} />
          {draw && <line x1={v.ox + draw.a.x * v.k} y1={v.oy + draw.a.y * v.k} x2={v.ox + draw.b.x * v.k} y2={v.oy + draw.b.y * v.k} stroke={SEL} strokeWidth={0.6} />}
          {ghost && <rect {...ghost} width={ghost.w} height={ghost.h} fill="none" stroke={SEL} strokeDasharray="1 0.6" strokeWidth={0.3} />}
        </svg>
        <div className="layout-side">
          <table className="prop-table">
            <tbody>
              <tr className="prop-group"><td colSpan={2}>{tx('Piastra')}</td></tr>
              <tr><td className="prop-name">{tx('Larghezza (mm)')}</td><td className="prop-value">{num(l.plate.w, w => setPlate({ w }))}</td></tr>
              <tr><td className="prop-name">{tx('Altezza (mm)')}</td><td className="prop-value">{num(l.plate.h, h => setPlate({ h }))}</td></tr>
              <tr><td className="prop-name">{tx('Riserva filo per estremità (mm)')}</td><td className="prop-value">{num(l.wireReserve, r => st().updateLayout(page.id, x => { x.wireReserve = r; }))}</td></tr>
              {one && (
                <>
                  <tr className="prop-group"><td colSpan={2}>{one.ref ? `-${one.ref}` : one.kind === 'rail' ? tx('Guida DIN') : tx('Canalina')}</td></tr>
                  {(['x', 'y', 'w', 'h'] as const).map(k => (
                    <tr key={k}><td className="prop-name">{{ x: 'X (mm)', y: 'Y (mm)', w: 'Larghezza (mm)', h: 'Altezza (mm)' }[k]}</td><td className="prop-value">{num(one[k], n => setItem({ [k]: n }))}</td></tr>
                  ))}
                  {(one.kind === 'rail' || one.kind === 'duct') && (
                    <>
                      <tr><td className="prop-name">{tx('Descrizione')}</td><td className="prop-value"><input value={one.label ?? ''} onChange={e => setItem({ label: e.target.value || undefined })} /></td></tr>
                      <tr><td className="prop-name">{tx('Articolo (metri in distinta)')}</td><td className="prop-value">
                        <select value={one.partNr ?? ''} onChange={e => setItem({ partNr: e.target.value || undefined })}>
                          <option value="">{tx('— nessuno —')}</option>
                          {parts.map(p => <option key={p.partNr} value={p.partNr}>{p.partNr}</option>)}
                        </select>
                      </td></tr>
                    </>
                  )}
                  {one.kind === 'rail' && (() => { const u = railUsage(l).find(x => x.rail.id === one.id); return u && <tr><td className="prop-name">{tx('Occupazione')}</td><td className="prop-value">{u.used} {tx('mm usati ·')} {u.free} {tx('mm liberi')}</td></tr>; })()}
                </>
              )}
              <tr className="prop-group"><td colSpan={2}>{tx('Da posare (')}{todo.length})</td></tr>
            </tbody>
          </table>
          <div className="layout-todo">
            {todo.map(p => (
              <button key={`${p.kind}|${p.ref}`} className={tool.kind === 'place' && tool.p.ref === p.ref ? 'active' : ''} onClick={() => setTool({ kind: 'place', p })}
                title={tx('{0} · {1} × {2} mm', p.text, p.w, p.h)}>
                <b>-{p.ref}</b> <span className="muted small">{p.w}×{p.h}</span>
              </button>
            ))}
            {!todo.length && <p className="muted small pad">{tx('Tutti i dispositivi e le morsettiere sono posati.')}</p>}
          </div>
          <p className="muted small pad">{tx('Le misure vengono dall\'articolo (larghezza/altezza dell\'EDZ); se mancano si usano misure tipiche. Gli apparecchi vicini a una guida si centrano sulla guida. Rotella: zoom.')}</p>
        </div>
      </div>
    </div>
  );
}
