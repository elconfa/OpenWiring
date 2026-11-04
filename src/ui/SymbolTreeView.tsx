// Vista ad albero della libreria dei simboli, come il riquadro «Collezioni» di QElectroTech: radici
// (preferiti, simboli di base, libreria personale, progetto), cartelle che si aprono con le linee di
// rientro, una riga per simbolo con l'icona piccola. Clic per inserire, trascinamento sullo schema,
// anteprima grande passando sopra, tasto destro per il menu, frecce della tastiera per muoversi.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { SymbolDef } from '../model/types';
import { countOf, type TreeNode } from '../model/symbolTree';
import { SymbolPreview } from './SymbolLibrary';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

/** Tipo dei dati trascinati dalla libreria sullo schema (id del simbolo) */
export const DRAG_PLACE = 'application/x-elettrocad-place';

/** Radice dell'albero: un gruppo con il suo nome e cosa si può fare sulle cartelle */
export interface TreeRoot {
  node: TreeNode;
  label: string;
  icon?: string;
  /** Testo, titolo e nota (es. «usato 3 volte») di un simbolo di questa radice */
  item?: (s: SymbolDef) => { s: SymbolDef; label: string; title: string; note?: string };
  /** Cartelle che si possono togliere dalla libreria */
  onRemove?: (n: TreeNode) => void;
  /** Voci in più nel menu della radice (es. «Apri la cartella») */
  actions?: { label: string; run: () => void }[];
  /** Simboli che non si possono inserire (eliminati dalla libreria: prima vanno spostati nell'albero) */
  disabled?: boolean;
  /** Modifica del simbolo (di serie: l'editor sul simbolo stesso) */
  edit?: (s: SymbolDef) => void;
  /** Voci in più nel menu di un simbolo */
  symbolMenu?: (s: SymbolDef) => MenuItem[];
  /** Voci in più nel menu di una cartella (non la radice) */
  folderMenu?: (n: TreeNode) => MenuItem[];
}

export interface MenuItem { label: string; run: () => void; disabled?: boolean; title?: string }

/** Chiave della riga di un simbolo: radice, cartella che lo contiene e id */
export const symbolRowKey = (rootPath: string, folderPath: string, id: string) => `s:${folderPath ? `${rootPath}|${folderPath}` : rootPath}:${id}`;

type Row =
  | { kind: 'folder'; key: string; depth: number; label: string; count: number; open: boolean; node: TreeNode; root: TreeRoot; isRoot: boolean; icon?: string;
      /** Chiave della cartella aperta o chiusa (con la radice: radici diverse hanno cartelle con lo stesso nome) */
      openKey: string }
  | { kind: 'sym'; key: string; depth: number; s: SymbolDef; label: string; title: string; note?: string; root: TreeRoot }
  | { kind: 'more'; key: string; depth: number; n: number };

/** Simboli mostrati per cartella: oltre si usa il filtro */
const MAX_ITEMS = 300;
/** Simboli mostrati in tutto con una ricerca (ogni riga disegna l'anteprima: oltre si affina la ricerca) */
const MAX_FOUND = 200;

const defaultItem = (s: SymbolDef) => ({ s, label: tx(s.name), title: `${tx(s.name)}${s.letter ? ` (-${s.letter})` : ''}` });

/** Testo con le parti che corrispondono alla ricerca evidenziate */
function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function SymbolTreeView({ roots, q, isOpen, toggle, reveal }: {
  roots: TreeRoot[]; q: string;
  isOpen: (path: string, def: boolean) => boolean; toggle: (path: string, def: boolean) => void;
  /** Riga da mostrare e selezionare (n cambia a ogni richiesta) */
  reveal?: { key: string; n: number };
}) {
  const st = useStore.getState;
  const placing = useStore(x => (x.tool.kind === 'place' ? x.tool.symbolId : undefined));
  const favs = useStore(x => x.favorites);
  const [focus, setFocus] = useState<string | undefined>();
  const [hover, setHover] = useState<{ s: SymbolDef; top: number; right: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // Righe visibili, in ordine: le cartelle aperte mostrano sottocartelle e simboli
  const rows = useMemo(() => {
    const out: Row[] = [];
    const searching = !!q.trim();
    let shown = 0, over = 0;
    const walk = (root: TreeRoot, n: TreeNode, depth: number, isRoot: boolean) => {
      if (searching && shown >= MAX_FOUND) { over += countOf(n); return; }
      const openKey = isRoot ? n.path : `${root.node.path}|${n.path}`;
      const open = isOpen(openKey, isRoot);
      out.push({ kind: 'folder', key: `f:${openKey}`, depth, label: isRoot ? root.label : tx(n.name), count: countOf(n), open, node: n, root, isRoot, icon: isRoot ? root.icon : undefined, openKey });
      if (!open) return;
      for (const c of n.children) walk(root, c, depth + 1, false);
      const max = searching ? Math.min(MAX_ITEMS, MAX_FOUND - shown) : MAX_ITEMS;
      for (const s of n.items.slice(0, max)) {
        const it = (root.item ?? defaultItem)(s);
        out.push({ kind: 'sym', key: `s:${openKey}:${s.id}`, depth: depth + 1, ...it, root });
      }
      shown += Math.min(max, n.items.length);
      if (n.items.length > max) {
        if (searching) over += n.items.length - max;
        else out.push({ kind: 'more', key: `m:${openKey}`, depth: depth + 1, n: n.items.length - max });
      }
    };
    for (const r of roots) if (countOf(r.node) || !searching) walk(r, r.node, 0, true);
    if (over) out.push({ kind: 'more', key: 'm:found', depth: 0, n: over });
    return out;
  }, [roots, isOpen, q]);

  // Simbolo da mostrare (es. dal menu di un componente dello schema): selezionato e portato in vista
  useEffect(() => {
    if (!reveal) return;
    setFocus(reveal.key);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-key="${CSS.escape(reveal.key)}"]`)?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.n]);

  const place = (s: SymbolDef) => st().setTool({ kind: 'place', symbolId: s.id, rot: 0 });
  const select = (key: string) => {
    setFocus(key);
    listRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = rows.findIndex(r => r.key === focus);
    const r = rows[i];
    const go = (k: number) => { const x = rows[Math.max(0, Math.min(rows.length - 1, k))]; if (x) select(x.key); };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i < 0 ? 0 : i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i < 0 ? 0 : i - 1); }
    else if (e.key === 'ArrowRight' && r?.kind === 'folder') { e.preventDefault(); if (!r.open) toggle(r.openKey, r.isRoot); else go(i + 1); }
    else if (e.key === 'ArrowLeft' && r) {
      e.preventDefault();
      if (r.kind === 'folder' && r.open) { toggle(r.openKey, r.isRoot); return; }
      // Alla cartella che contiene la riga
      for (let k = i - 1; k >= 0; k--) if (rows[k].kind === 'folder' && rows[k].depth < r.depth) { select(rows[k].key); return; }
    } else if (e.key === 'Enter' && r) {
      e.preventDefault();
      if (r.kind === 'sym') { if (!r.root.disabled) place(r.s); } else if (r.kind === 'folder') toggle(r.openKey, r.isRoot);
    }
  };
  const showHover = (s: SymbolDef, el: HTMLElement) => {
    window.clearTimeout(hoverTimer.current);
    const rc = el.getBoundingClientRect(), panel = listRef.current?.getBoundingClientRect();
    hoverTimer.current = window.setTimeout(() => setHover({ s, top: rc.top, right: window.innerWidth - (panel?.left ?? rc.left) + 8 }), 350);
  };
  const hideHover = () => { window.clearTimeout(hoverTimer.current); setHover(null); };
  const ql = q.trim().toLowerCase();

  return (
    <div className="sym-tree" ref={listRef} tabIndex={0} role="tree" onKeyDown={onKey}
      onFocus={() => { if (!focus && rows[0]) setFocus(rows[0].key); }}>
      {rows.map(r => {
        const guides = <span className="tree-guides" style={{ width: r.depth * 14 }} />;
        if (r.kind === 'more') return <div key={r.key} className="tree-row muted small">{guides}<span className="tree-twist" />{r.key === 'm:found' ? tx('… altri {0} trovati: scrivi di più per restringere la ricerca', r.n) : tx('… altri {0}: usa il filtro', r.n)}</div>;
        if (r.kind === 'folder') {
          return (
            <div key={r.key} data-key={r.key} role="treeitem" aria-expanded={r.open} className={`tree-row folder${r.isRoot ? ' root' : ''}${focus === r.key ? ' focus' : ''}`}
              onClick={() => { setFocus(r.key); toggle(r.openKey, r.isRoot); }}
              onContextMenu={e => { e.preventDefault(); setFocus(r.key); if (r.root.onRemove || r.root.actions?.length || r.root.folderMenu) setMenu({ x: e.clientX, y: e.clientY, row: r }); }}>
              {guides}
              <span className="tree-twist">{r.open ? '▾' : '▸'}</span>
              <Icon name={r.icon ?? (r.open ? 'open' : 'folder')} size={15} className="tree-icon" />
              <span className="tree-label"><Marked text={r.label} q={r.isRoot ? '' : ql} /></span>
              <span className="tree-count">{r.count}</span>
            </div>
          );
        }
        const fav = favs.includes(r.s.id);
        return (
          <div key={r.key} data-key={r.key} role="treeitem" className={`tree-row sym${placing === r.s.id ? ' active' : ''}${focus === r.key ? ' focus' : ''}${r.root.disabled ? ' disabled' : ''}`}
            draggable={!r.root.disabled} title={r.root.disabled ? `${r.title} · ${tx('eliminato: per usarlo spostalo nell\'albero (tasto destro)')}` : r.title}
            onDragStart={e => { hideHover(); e.dataTransfer.setData(DRAG_PLACE, r.s.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { setFocus(r.key); if (!r.root.disabled) place(r.s); }}
            onMouseEnter={e => showHover(r.s, e.currentTarget)} onMouseLeave={hideHover}
            onContextMenu={e => { e.preventDefault(); hideHover(); setFocus(r.key); setMenu({ x: e.clientX, y: e.clientY, row: r }); }}>
            {guides}
            <span className="tree-twist" />
            <span className="tree-thumb"><SymbolPreview sym={r.s} size={22} /></span>
            <span className="tree-label"><Marked text={r.label} q={ql} /></span>
            {r.note && <span className="tree-note">{r.note}</span>}
            {r.s.letter && <span className="tree-letter">-{r.s.letter}</span>}
            {fav && <span className="tree-fav" title={tx('Preferito')}>★</span>}
          </div>
        );
      })}
      {!rows.length && <p className="muted small pad">{tx('Nessun simbolo trovato.')}</p>}
      {hover && (
        <div className="macro-hover sym-hover" style={{ right: hover.right, top: Math.max(8, Math.min(hover.top, window.innerHeight - 300)) }}>
          <b>{tx(hover.s.name)}</b>
          <SymbolPreview sym={hover.s} size={150} />
          <div className="small muted">{[hover.s.letter ? `-${hover.s.letter}` : '', tx(hover.s.category), hover.s.source ?? ''].filter(Boolean).join(' · ')}</div>
          {hover.s.pins.length > 0 && <div className="small">{tx('Punti di connessione: {0}', hover.s.pins.map(p => p.label || p.id).slice(0, 24).join(' '))}{hover.s.pins.length > 24 ? ' …' : ''}</div>}
          <div className="small muted">{tx('Clic per inserire, oppure trascina sullo schema')}</div>
        </div>
      )}
      {menu && (
        <div className="ctx-back" onMouseDown={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }}>
          <div className="ctx-menu" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260) }} onMouseDown={e => e.stopPropagation()}>
            {menu.row.kind === 'sym' ? (() => {
              const { s, root } = menu.row;
              const run = (f: () => void) => () => { setMenu(null); f(); };
              return (
                <>
                  {!root.disabled && <button onClick={run(() => place(s))}><span>{tx('Inserisci')}</span></button>}
                  <button onClick={run(() => (root.edit ?? st().openSymbolEditor)(s))}><span>{tx('Modifica il simbolo…')}</span></button>
                  {!root.disabled && <button onClick={run(() => st().toggleFavorite(s.id))}><span>{favs.includes(s.id) ? tx('Togli dai preferiti') : tx('Aggiungi ai preferiti')}</span></button>}
                  {root.symbolMenu?.(s).map(a => <button key={a.label} disabled={a.disabled} title={a.title} onClick={run(a.run)}><span>{a.label}</span></button>)}
                </>
              );
            })() : menu.row.kind === 'folder' ? (() => {
              const row = menu.row;
              return (
                <>
                  {row.isRoot && row.root.actions?.map(a => <button key={a.label} onClick={() => { setMenu(null); a.run(); }}><span>{a.label}</span></button>)}
                  {!row.isRoot && row.root.folderMenu?.(row.node).map(a => <button key={a.label} disabled={a.disabled} title={a.title} onClick={() => { setMenu(null); a.run(); }}><span>{a.label}</span></button>)}
                  {!row.isRoot && row.root.onRemove && <button onClick={() => { setMenu(null); row.root.onRemove!(row.node); }}><span>{tx('Rimuovi il gruppo dalla libreria…')}</span></button>}
                </>
              );
            })() : null}
          </div>
        </div>
      )}
    </div>
  );
}
