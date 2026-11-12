import { askConfirm } from './Ask';
// Albero del modello (come la "Vista combinata" di FreeCAD).
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { buildDevices, deviceInfo, partsIndex, type Device } from '../model/devices';
import { allStrips, stripRows, physicalCount } from '../model/terminals';
import { panelLabel, orderedPanels, devicePanels } from '../model/network';
import { structureTree } from '../model/structure';
import { tx } from '../i18n/ui';
import { isGenerated, pageGroup } from '../model/pageOrder';
import { isListPage, listEntries, outdated, type ListEntry } from '../model/lists';
import { INDEX_TITLE, LEGEND_TITLE } from '../model/reports';

const reportTitleOf = (l: ListEntry) => (l.key === 'index' ? INDEX_TITLE : l.key === 'legend' ? LEGEND_TITLE : l.key.replace(/^report:/, ''));
import { deletePageAsk, duplicatePageAsk, newPage } from './actions';
import type { DrawingStyleKind, Page } from '../model/types';

/** Pagine che si possono copiare in un altro progetto: quelle disegnate, non le generate */
const copyable = (p: Page) => p.type !== 'cover' && !isGenerated(p);

const PAGE_ICON: Record<string, string> = { plc: '▤', strip: '⋮', layout: '▦', network: '⇌', singleline: '│', report: '☰', cover: '◧', cable: '≋', connector: '⊡', system: '◫' };

function Node({ label, icon, open, onToggle, children, onClick, active, badge, onContextMenu, onKeyDown, muted, extra, title }: {
  label: string; icon: string; open?: boolean; onToggle?: () => void; children?: React.ReactNode;
  onClick?: () => void; active?: boolean; badge?: string | number; muted?: boolean; extra?: React.ReactNode; title?: string;
  onContextMenu?: (e: React.MouseEvent) => void; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <li>
      <div className={`tree-row${active ? ' active' : ''}${muted ? ' muted' : ''}`} title={title} onClick={onClick ?? onToggle} onContextMenu={onContextMenu}
        onKeyDown={onKeyDown} tabIndex={onKeyDown ? 0 : undefined}>
        {onToggle ? <span className="twisty" onClick={e => { e.stopPropagation(); onToggle(); }}>{open ? '▾' : '▸'}</span> : <span className="twisty" />}
        <span className="tree-icon">{icon}</span>
        <span className="tree-label">{label}</span>
        {badge !== undefined && <span className="badge">{badge}</span>}
        {extra}
      </div>
      {open && children && <ul>{children}</ul>}
    </li>
  );
}

export function ProjectTree() {
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const treeSel = useStore(s => s.treeSel);
  const view = useStore(s => s.view);
  const others = useStore(s => s.others);
  const pageClip = useStore(s => s.pageClipboard);
  const [otherMenu, setOtherMenu] = useState<{ key: string; page?: Page; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!otherMenu) return;
    const close = () => setOtherMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
  }, [otherMenu]);
  const [open, setOpen] = useState({ root: true, pages: true, devices: true, structure: false, strips: false, cables: false, parts: false });
  const toggle = (k: keyof typeof open) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const library = useStore(s => s.library);
  const devices = useMemo(() => [...buildDevices(project).values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })), [project]);
  const st = useStore.getState;
  const parts = useMemo(() => partsIndex(project, library), [project, library]);
  const descr = (d: Device) => deviceInfo(d.elements, d.main, parts).description;
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // Pagine raggruppate per quadro (sezione); le pagine generali restano in cima
  const sections = useMemo(() => {
    const panels = project.panels ?? [];
    // Le pagine generate (indice, liste, morsettiere…) stanno nei loro gruppi, sotto
    const own = project.pages.filter(p => !isGenerated(p));
    const general = own.filter(p => !p.panelId || !panels.some(q => q.id === p.panelId));
    return [{ panel: undefined, pages: general }, ...orderedPanels(panels).map(panel => ({ panel, pages: own.filter(p => p.panelId === panel.id) }))];
  }, [project]);
  // Liste e pagine generate: tutte, anche quelle non ancora generate, ognuna con le sue pagine
  const [genOpen, setGenOpen] = useState<Set<string>>(new Set());
  // Calcolate solo con il ramo aperto e poco dopo l'ultima modifica, per non rallentare il disegno
  const [lists, setLists] = useState<ListEntry[]>([]);
  const listsOpen = genOpen.has('lists');
  useEffect(() => {
    if (!listsOpen) return;
    const t = setTimeout(() => setLists(listEntries(project, library)), lists.length ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, library, listsOpen]);
  const [listMenu, setListMenu] = useState<{ entry?: ListEntry; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!listMenu) return;
    const close = () => setListMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
  }, [listMenu]);
  // Gruppi delle pagine generate aperti (di serie chiusi; si apre da solo quello della pagina aperta)
  const flipGen = (key: string) => setGenOpen(c => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  useEffect(() => {
    const pg = project.pages.find(p => p.id === pageId);
    const g = pg && pageGroup(pg);
    if (!g) return;
    const keys = ['lists', `list:${g}`];
    setGenOpen(c => (keys.every(k => c.has(k)) ? c : new Set([...c, ...keys])));
  }, [pageId, project.pages]);
  // Dispositivi raggruppati per luogo (quadro, pulsantiera, bordo macchina…)
  const devGroups = useMemo(() => {
    const panels = project.panels ?? [];
    if (!panels.length) return [{ panel: undefined, devices }];
    const dp = devicePanels(project);
    const none = devices.filter(d => !dp.get(d.tag));
    return [
      ...orderedPanels(panels).map(panel => ({ panel, devices: devices.filter(d => dp.get(d.tag)?.id === panel.id) })).filter(g => g.devices.length),
      { panel: undefined, devices: none },
    ];
  }, [project, devices]);
  const structure = useMemo(() => (open.structure ? structureTree(project, library) : []), [project, library, open.structure]);
  const flip = (key: string) => setClosed(c => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const strips = useMemo(() => allStrips(project).map(s => ({ s, n: physicalCount(stripRows(project, s)) })), [project]);
  // Menu del tasto destro sulle pagine: apri, duplica, sposta, elimina
  // onPage: aperto sulla riga di una pagina (altrimenti vale per la pagina corrente)
  const [pageMenu, setPageMenu] = useState<{ page: Page; x: number; y: number; onPage?: boolean } | null>(null);
  useEffect(() => {
    if (!pageMenu) return;
    const close = () => setPageMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
  }, [pageMenu]);

  const pageNode = (p: Page) => (
    <Node key={p.id} label={`${p.name}  ${p.title}`} icon={PAGE_ICON[p.type] ?? '▭'} onClick={() => st().setPage(p.id)}
      active={p.id === pageId && view === 'schema'}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); st().setPage(p.id); setPageMenu({ page: p, x: e.clientX, y: e.clientY, onPage: true }); }}
      onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); void deletePageAsk(p.id); } }} />
  );

  // Finestra della grafica di una pagina generata (o della copertina), se c'è
  const pageStyle = (pg: Page): (() => void) | undefined =>
    pg.type === 'cover' ? () => st().setDialog('cover') : isListPage(pg) ? () => { st().openListStyleOf(pg); } : undefined;

  const goToDevice = (tag: string) => {
    const d = devices.find(x => x.tag === tag);
    if (!d) return;
    const el = d.elements[0];
    st().setPage(el.page.id);
    st().setSelection(d.elements.filter(e => e.page.id === el.page.id).map(e => e.inst.id));
    st().setTreeSel({ type: 'device', tag });
  };

  return (
    <div className="tree" onContextMenu={e => {
      // In un punto qualsiasi del riquadro: comandi delle pagine per la pagina corrente
      e.preventDefault();
      const cur = project.pages.find(p => p.id === pageId) ?? project.pages[0];
      setPageMenu({ page: cur, x: e.clientX, y: e.clientY });
    }}>
      <ul>
        <Node label={project.info.name || tx('Progetto')} icon="📁" open={open.root} onToggle={() => toggle('root')}
          onClick={() => { st().setTreeSel({ type: 'project' }); st().setSelection([]); }} active={treeSel.type === 'project'}>
          <Node label={tx('Pagine')} icon="🗐" open={open.pages} onToggle={() => toggle('pages')} badge={project.pages.length}>
            {sections.map(sec => {
              const items = sec.pages.map(pageNode);
              if (!sec.panel) return items;
              const key = `sec-${sec.panel.id}`;
              return (
                <Node key={key} label={panelLabel(sec.panel, project.panels)} icon="▣" badge={sec.pages.length} open={!closed.has(key)}
                  onToggle={() => setClosed(c => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
                  {items.length ? items : <li className="muted small pad">{tx('nessuna pagina')}</li>}
                </Node>
              );
            })}
          </Node>
          <Node label={tx('Liste')} icon="☰" open={genOpen.has('lists')} onToggle={() => flipGen('lists')}
            badge={new Set(project.pages.map(pageGroup).filter(Boolean)).size || undefined}
            title={tx('Liste e pagine generate dai dati: tasto destro per crearle, aggiornarle, eliminarle o cambiarne la grafica')}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setListMenu({ x: e.clientX, y: e.clientY }); }}
            extra={<button className="tree-btn" title={tx('Aggiorna tutte le liste')} onClick={e => { e.stopPropagation(); st().updateAllLists(); }}>⟳</button>}>
            {lists.map(l => {
              const k = `list:${l.key}`, old = outdated(l);
              return (
                <Node key={k} label={`${tx(l.title)}${old ? '  ⚠' : ''}`} icon={l.pages.length ? '☰' : '○'} muted={!l.pages.length}
                  badge={l.pages.length || (l.need ? tx('da creare') : tx('vuota'))}
                  title={!l.pages.length ? tx('Non generata: tasto destro ▸ Crea la lista') : old ? tx('Da aggiornare: {0} pagine, ne servono {1}', l.pages.length, l.need) : undefined}
                  open={genOpen.has(k)} onToggle={l.pages.length ? () => flipGen(k) : undefined}
                  onClick={() => { if (l.pages[0]) { st().setPage(l.pages[0].id); if (!genOpen.has(k)) flipGen(k); } }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setListMenu({ entry: l, x: e.clientX, y: e.clientY }); }}>
                  {l.pages.map(pageNode)}
                </Node>
              );
            })}
          </Node>
          <Node label={tx('Dispositivi')} icon="⚙" open={open.devices} onToggle={() => toggle('devices')} badge={devices.length}>
            {devGroups.map(g => {
              const items = g.devices.map(d => (
                <Node key={d.tag} label={`-${d.tag}${descr(d) ? '  ' + descr(d) : ''}`} icon={d.partNr ? '◆' : '◇'}
                  onClick={() => goToDevice(d.tag)} active={treeSel.type === 'device' && treeSel.tag === d.tag} />
              ));
              if (!g.panel) return items;
              const key = `dev-${g.panel.id}`;
              return (
                <Node key={key} label={`${panelLabel(g.panel, project.panels)}${g.panel.kind ? ` · ${g.panel.kind}` : ''}`} icon="▣" badge={g.devices.length} open={!closed.has(key)}
                  onToggle={() => setClosed(c => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
                  {items}
                </Node>
              );
            })}
          </Node>
          <Node label={tx('Struttura =Impianto +Luogo')} icon="⌗" open={open.structure} onToggle={() => toggle('structure')}>
            {structure.map(f => {
              const fk = `fn-${f.func}`;
              return (
                <Node key={fk} label={f.func ? `=${f.func}` : tx('senza funzione (=)')} icon="=" badge={f.count} open={!closed.has(fk)} onToggle={() => flip(fk)}>
                  {f.locs.map(l => {
                    const lk = `${fk}+${l.loc}`;
                    return (
                      <Node key={lk} label={l.loc ? `+${l.loc}${l.name ? '  ' + l.name : ''}` : tx('senza luogo (+)')} icon="+" badge={l.devices.length} open={!closed.has(lk)} onToggle={() => flip(lk)}>
                        {l.devices.map(d => (
                          <Node key={d.tag} label={`-${d.tag}${descr(d) ? '  ' + descr(d) : ''}`} icon={d.partNr ? '◆' : '◇'}
                            onClick={() => goToDevice(d.tag)} active={treeSel.type === 'device' && treeSel.tag === d.tag} />
                        ))}
                      </Node>
                    );
                  })}
                </Node>
              );
            })}
            {!structure.length && <li className="muted small pad">{tx('nessun dispositivo')}</li>}
          </Node>
          <Node label={tx('Morsettiere')} icon="⋮" open={open.strips} onToggle={() => toggle('strips')} badge={strips.length}>
            {strips.map(x => (
              <Node key={x.s} label={`-${x.s}`} icon="▥" badge={x.n} onClick={() => { st().setStripSel(x.s); st().setView('terminals'); }}
                active={view === 'terminals' && useStore.getState().stripSel === x.s} />
            ))}
          </Node>
          <Node label={tx('Cavi')} icon="⫽" open={open.cables} onToggle={() => toggle('cables')} badge={project.cables?.length ?? 0}>
            {(project.cables ?? []).map(c => (
              <Node key={c.id} label={`-${c.tag}${c.type ? '  ' + c.type : ''}`} icon="▬" onClick={() => {
                const pg = project.pages.find(p => p.elements.some(e => e.kind === 'cable' && e.cableId === c.id));
                const line = pg?.elements.find(e => e.kind === 'cable' && e.cableId === c.id);
                if (pg && line) { st().setPage(pg.id); st().setSelection([line.id]); }
              }} />
            ))}
          </Node>
          <Node label={tx('Articoli del progetto')} icon="📦" open={open.parts} onToggle={() => toggle('parts')} badge={project.parts.length}>
            {project.parts.map(p => (
              <Node key={p.partNr} label={p.partNr} icon="▪" onClick={() => { st().setTreeSel({ type: 'part', partNr: p.partNr }); st().setView('parts'); }}
                active={treeSel.type === 'part' && treeSel.partNr === p.partNr} />
            ))}
          </Node>
        </Node>
        {/* Gli altri progetti aperti: clic su una pagina per passare a quel progetto */}
        {others.map(o => {
          const k = `other-${o.key}`;
          return (
            <Node key={k} label={`${o.project.info.name || tx('Progetto')}${o.dirty ? ' •' : ''}`} icon="📁" badge={o.project.pages.length} open={genOpen.has(k)} onToggle={() => flipGen(k)}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setOtherMenu({ key: o.key, x: e.clientX, y: e.clientY }); }}>
              {o.project.pages.map(pg => (
                <Node key={pg.id} label={`${pg.name}  ${pg.title}`} icon={PAGE_ICON[pg.type] ?? '▭'} onClick={() => st().switchProject(o.key, pg.id)}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setOtherMenu({ key: o.key, page: pg, x: e.clientX, y: e.clientY }); }} />
              ))}
            </Node>
          );
        })}
      </ul>
      {otherMenu && (() => {
        const o = others.find(x => x.key === otherMenu.key);
        if (!o) return null;
        return (
          <div className="ctx-menu" style={{ left: Math.min(otherMenu.x, window.innerWidth - 240), top: Math.min(otherMenu.y, window.innerHeight - 200) }}
            onMouseDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            {otherMenu.page && <button disabled={!copyable(otherMenu.page)} onClick={() => { setOtherMenu(null); st().copyPage(otherMenu.page!.id, o.key); }}
              title={tx('Da incollare nel progetto attivo con «Incolla pagina», con sigle e numeri filo nuovi')}><span>{tx('Copia pagina')}</span></button>}
            <button onClick={() => { setOtherMenu(null); st().switchProject(o.key, otherMenu.page?.id); }}><span>{otherMenu.page ? tx('Apri') : tx('Rendi attivo')}</span></button>
            <hr />
            <button onClick={async () => { setOtherMenu(null); if (!o.dirty || await askConfirm(tx('Conferma'), tx('{0} ha modifiche non salvate. Chiuderlo lo stesso?', o.project.info.name || tx('Progetto')), tx('Continua'))) st().closeOther(o.key); }}><span>{tx('Chiudi il progetto')}</span></button>
            <div className="ctx-note">{o.project.info.name}{otherMenu.page ? ` · ${otherMenu.page.name}` : ''}</div>
          </div>
        );
      })()}
      {listMenu && (() => {
        const l = listMenu.entry;
        const run = (f: () => void) => () => { setListMenu(null); f(); };
        const style = l?.style === 'report' ? () => st().openReportStyle(reportTitleOf(l)) : l?.style === 'strip' ? () => st().setDialog('stripStyle') : l?.style ? () => st().openDrawingStyle(l.style as DrawingStyleKind) : undefined;
        return (
          <div className="ctx-menu" style={{ left: Math.min(listMenu.x, window.innerWidth - 260), top: Math.min(listMenu.y, window.innerHeight - 260) }}
            onMouseDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            {l && <>
              <button disabled={!style} onClick={run(() => style?.())} className="ctx-main"
                title={style ? tx('Testi, colonne, righe, pagine, colori e vista a schermo in una finestra') : tx('La grafica di queste pagine non è ancora personalizzabile')}><span>{tx('Personalizza la lista…')}</span></button>
              {l.pages[0] && <button onClick={run(() => st().setPage(l.pages[0].id))}><span>{tx('Apri')}</span></button>}
              <button disabled={!l.need && !l.pages.length} onClick={run(() => st().updateList(l.key))}
                title={!l.need ? tx('La lista è vuota: non ci sono dati da mettere in pagina') : undefined}>
                <span>{l.pages.length ? tx('Aggiorna la lista') : tx('Crea la lista')}</span></button>
              <button disabled={!l.pages.length} onClick={run(() => st().deleteList(l.key))} title={tx('Toglie le pagine della lista; si può creare di nuovo')}><span>{tx('Elimina la lista')}</span></button>
              <hr />
            </>}
            <button onClick={run(() => st().updateAllLists())} title={tx('Aggiorna le liste che hanno già pagine: aggiunge e toglie le pagine che servono')}><span>{tx('Aggiorna tutte le liste')}</span></button>
            <button onClick={run(() => st().setDialog('reportPages'))}><span>{tx('Ordine, prefissi e liste automatiche…')}</span></button>
            {l && <div className="ctx-note">{tx(l.title)} · {l.pages.length ? tx('{0} pagine', l.pages.length) : tx('non generata')}</div>}
          </div>
        );
      })()}
      {pageMenu && (
        <div className="ctx-menu" style={{ left: Math.min(pageMenu.x, window.innerWidth - 240), top: Math.min(pageMenu.y, window.innerHeight - 380) }}
          onMouseDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
          {([
            ...(pageMenu.onPage ? [[tx('Apri'), () => st().setPage(pageMenu.page.id), false, false]] as const : []),
            [tx('+ Pagina'), () => void newPage(pageMenu.page.id), false, !!pageMenu.onPage, tx('Nuova pagina dopo questa: in fondo con il numero dopo il più alto, in mezzo con la lettera (es. 12A); durante una revisione si sceglie il numero (proposto 12-B)')],
            [tx('+ Copertina'), () => st().addCoverPage(), false, false, tx('Copertina con logo, dati del progetto, revisioni e firme')],
            [tx('+ Unifilare'), () => st().addTypedPage('singleline', 'Schema unifilare'), false, false, tx('Nuova pagina di schema unifilare (simboli della categoria Unifilare)')],
            [tx('+ Rete'), () => st().addNetworkPage(), false, false, tx('Nuova pagina di schema di rete (Modbus, EtherCAT, Profinet…)')],
            [tx('+ Layout'), () => st().addLayoutPage(), false, false, tx('Nuova pagina di layout del quadro (vista di montaggio)')],
            [tx('Duplica…'), () => void duplicatePageAsk(pageMenu.page.id), pageMenu.page.type !== 'multiline', true, tx('Duplica la pagina con sigle e numeri filo nuovi')],
            [tx('Copia pagina'), () => st().copyPage(pageMenu.page.id), !copyable(pageMenu.page), false, tx('Da incollare in questo o in un altro progetto aperto, con sigle e numeri filo nuovi')],
            [pageClip ? tx('Incolla pagina «{0}»', pageClip.title) : tx('Incolla pagina'), () => st().pastePage(pageMenu.page.id), !pageClip, false, tx('Incolla dopo questa pagina la pagina copiata')],
            ...(isGenerated(pageMenu.page) || pageMenu.page.type === 'cover' ? [[pageMenu.page.type === 'cover' ? tx('Personalizza la copertina…') : tx('Personalizza la lista…'), () => pageStyle(pageMenu.page)?.(), !pageStyle(pageMenu.page), true,
              pageStyle(pageMenu.page) ? undefined : tx('La grafica di queste pagine non è ancora personalizzabile')]] as const : []),
            [tx('Sposta su'), () => st().movePage(pageMenu.page.id, -1), false, false],
            [tx('Sposta giù'), () => st().movePage(pageMenu.page.id, 1), false, false],
            [tx('Ordina le pagine per numero'), () => st().sortPages(), false, false, tx('12, 12A, 12B, 13…; copertina e pagine senza numero restano dove sono')],
            [tx('Elimina…'), () => void deletePageAsk(pageMenu.page.id), project.pages.length <= 1, true],
          ] as readonly (readonly [string, () => void, boolean, boolean, string?])[]).map(([label, run, disabled, sepBefore, title], i) => (
            <span key={i}>
              {sepBefore && <hr />}
              <button disabled={disabled} title={title} onClick={() => { setPageMenu(null); run(); }}>
                <span>{label}</span>{label === tx('Elimina…') && <span className="ctx-key">Canc</span>}
              </button>
            </span>
          ))}
          <div className="ctx-note">{tx('Pagina: {0}', `${pageMenu.page.name}  ${pageMenu.page.title}`)}</div>
        </div>
      )}
    </div>
  );
}
