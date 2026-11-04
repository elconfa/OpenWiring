// Libreria simboli e articoli (pannello a destra, come un "workbench" di FreeCAD).
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { BUILTIN_SYMBOLS, SYMBOL_CATEGORIES } from '../model/symbols';
import type { SymbolDef } from '../model/types';
import { importSymbols, importSymbolFolder, exportMacros, importMacros, saveMacroFromSelection, removeListedParts } from './actions';
import { MacroGhost } from './Canvas';
import type { Macro } from '../model/clipboard';
import { primBounds, getSymbol } from '../model/geometry';
import { SymbolGraphic } from './PageSvg';
import { tx } from '../i18n/ui';
import { chooseSymbolFolder } from './symbolFolderSync';
import { symbolTree, countOf, categoriesOf, type TreeNode } from '../model/symbolTree';
import { SymbolTreeView, symbolRowKey, type TreeRoot, type MenuItem } from './SymbolTreeView';
import { isDeletedSymbol, libraryIndex, symbolPrint, DELETED_CATEGORY } from '../model/symbolSync';
import { moveSymbolsAsk, deleteSymbolsAsk, openUnifySymbols, checkProjectSymbols, libraryCategories } from './LibrarySync';
import { pickBranch } from './BranchPicker';

export function SymbolPreview({ sym, size = 44 }: { sym: SymbolDef; size?: number }) {
  const b = primBounds(sym.prims);
  const pad = 2;
  const w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
  const m = Math.max(w, h);
  return (
    <svg width={size} height={size} viewBox={`${b.x0 - pad - (m - w) / 2} ${b.y0 - pad - (m - h) / 2} ${m} ${m}`}>
      <g stroke="currentColor" color="currentColor" strokeWidth={Math.max(0.35, m / 60)} fill="none" strokeLinecap="round">
        <SymbolGraphic sym={sym} />
      </g>
    </svg>
  );
}

/** Un simbolo della libreria: clic per inserirlo, tasto destro per modificarlo, stella per i preferiti */
function SymItem({ s, label, title, size = 44, menu }: { s: SymbolDef; label: string; title: string; size?: number; menu?: MenuItem[] }) {
  const active = useStore(x => x.tool.kind === 'place' && x.tool.symbolId === s.id);
  const fav = useStore(x => x.favorites.includes(s.id));
  const st = useStore.getState;
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const run = (f: () => void) => () => { setAt(null); f(); };
  return (
    <div className={`sym-item${active ? ' active' : ''}`} role="button" tabIndex={0} title={title}
      onClick={() => st().setTool({ kind: 'place', symbolId: s.id, rot: 0 })}
      onKeyDown={e => { if (e.key === 'Enter') st().setTool({ kind: 'place', symbolId: s.id, rot: 0 }); }}
      onContextMenu={e => { e.preventDefault(); if (menu) setAt({ x: e.clientX, y: e.clientY }); else st().openSymbolEditor(s); }}>
      <button className={`fav-star${fav ? ' on' : ''}`} title={fav ? tx('Togli dai preferiti') : tx('Aggiungi ai preferiti')}
        onClick={e => { e.stopPropagation(); st().toggleFavorite(s.id); }}>{fav ? '★' : '☆'}</button>
      <SymbolPreview sym={s} size={size} />
      <span>{label}</span>
      {at && menu && (
        <div className="ctx-back" onClick={e => e.stopPropagation()} onMouseDown={e => { e.stopPropagation(); setAt(null); }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setAt(null); }}>
          <div className="ctx-menu" style={{ left: Math.min(at.x, window.innerWidth - 240), top: Math.min(at.y, window.innerHeight - 200) }} onMouseDown={e => e.stopPropagation()}>
            <button onClick={run(() => st().openSymbolEditor(s))}><span>{tx('Modifica il simbolo…')}</span></button>
            {menu.map(m => <button key={m.label} disabled={m.disabled} onClick={run(m.run)}><span>{m.label}</span></button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ultima richiesta «Mostra nella libreria» già eseguita (la libreria può essere montata di nuovo) */
let lastReveal = 0;

/** Preferenze dell'albero (gruppi aperti, icone piccole o grandi), per questo computer */
const PREF = 'elettrocad.symbolTree';
interface TreePref {
  open: Record<string, boolean>; large?: boolean;
  /** Vista: albero come le collezioni di QElectroTech (di serie) o gruppi di icone */
  view?: 'tree' | 'grid';
  /** Cartelle aperte nella vista ad albero */
  tree?: Record<string, boolean>;
}
const loadPref = (): TreePref => { try { return { open: {}, ...JSON.parse(localStorage.getItem(PREF) ?? '{}') as Partial<TreePref> }; } catch { return { open: {} }; } };

/** Gruppo con freccia per aprirlo e chiuderlo; dentro i sottogruppi e poi i simboli */
function Group({ node, depth, isOpen, toggle, renderItems, onRemove, label }: {
  node: TreeNode; depth: number; isOpen: (path: string, def: boolean) => boolean; toggle: (path: string, def: boolean) => void;
  renderItems: (items: SymbolDef[]) => React.ReactNode; onRemove?: (n: TreeNode) => void; label?: string;
}) {
  const def = depth === 0 && !onRemove;
  const open = isOpen(node.path, def);
  return (
    <section className="lib-group" style={{ marginLeft: depth ? 10 : 0 }}>
      <h4 className="lib-cat" onClick={() => toggle(node.path, def)}>
        <span>{open ? '▾' : '▸'} {label ?? tx(node.name)} <span className="muted">({countOf(node)})</span></span>
        {onRemove && <button className="mini" title={tx('Rimuovi questo gruppo dalla libreria')} onClick={e => { e.stopPropagation(); onRemove(node); }}>✕</button>}
      </h4>
      {open && (
        <>
          {node.children.map(c => <Group key={c.path} node={c} depth={depth + 1} isOpen={isOpen} toggle={toggle} renderItems={renderItems} onRemove={onRemove} />)}
          {node.items.length > 0 && renderItems(node.items)}
        </>
      )}
    </section>
  );
}

export function SymbolLibrary() {
  const library = useStore(s => s.library);
  const symbolLibrary = useStore(s => s.symbolLibrary);
  const symbolDir = useStore(s => s.symbolDir);
  const [pref, setPrefState] = useState(loadPref);
  const setPref = (p: TreePref) => { setPrefState(p); try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* preferenza non salvata */ } };
  const size = pref.large ? 76 : 44;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'symbols' | 'macros' | 'parts'>('symbols');
  const macros = useStore(s => s.macros);
  const favIds = useStore(s => s.favorites);
  const customSymbols = useStore(s => s.project.customSymbols);
  const projectPages = useStore(s => s.project.pages);
  const projectName = useStore(s => s.project.info.name);
  const st = useStore.getState;
  // La ricerca segue la scrittura senza bloccarla: l'albero si ridisegna quando c'è tempo
  const dq = useDeferredValue(q);
  const ql = dq.trim().toLowerCase();
  const syms = BUILTIN_SYMBOLS.filter(s => !s.hidden).filter(s => !ql || `${s.name} ${tx(s.name)} ${s.letter} ${s.category}`.toLowerCase().includes(ql));
  // Simboli di base modificati: la copia personale prende il loro posto
  const overrides = useMemo(() => new Map(symbolLibrary.filter(x => x.replaces).map(x => [x.replaces!, x])), [symbolLibrary]);
  const imported = useMemo(() => symbolTree(symbolLibrary.filter(x => !(x.replaces && BUILTIN_SYMBOLS.some(b => b.id === x.replaces)) && !isDeletedSymbol(x))
    .filter(x => !ql || `${x.name} ${x.letter} ${x.category}`.toLowerCase().includes(ql))), [symbolLibrary, ql]);
  // Simboli eliminati (cartella «Eliminare»): si vedono a parte e non si inseriscono
  const deleted = useMemo(() => {
    const t = symbolTree(symbolLibrary.filter(x => isDeletedSymbol(x) && (!ql || `${x.name} ${x.letter} ${x.category}`.toLowerCase().includes(ql))));
    return { name: '', path: '#tree/del', items: t.flatMap(n => n.items), children: t.flatMap(n => n.children) } as TreeNode;
  }, [symbolLibrary, ql]);
  const findInLibrary = useMemo(() => libraryIndex(symbolLibrary), [symbolLibrary]);
  // Simboli di base: un gruppo con le loro categorie
  const base = useMemo<TreeNode>(() => ({
    name: tx('Simboli di base'), path: '#base', items: [],
    children: SYMBOL_CATEGORIES.map(cat => ({ name: cat, path: `#base/${cat}`, items: syms.filter(x => x.category === cat), children: [] })).filter(n => n.items.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ql]);
  // Con una ricerca tutti i gruppi sono aperti
  const isOpen = (path: string, def: boolean) => !!ql || (pref.open[path] ?? (def || path.startsWith('#base/')));
  const toggle = (path: string, def: boolean) => setPref({ ...pref, open: { ...pref.open, [path]: !(pref.open[path] ?? (def || path.startsWith('#base/'))) } });
  const grid = (items: React.ReactNode) => <div className={pref.large ? 'sym-grid large' : 'sym-grid'}>{items}</div>;
  const removeGroup = (n: TreeNode) => {
    const cats = categoriesOf(n);
    if (window.confirm(tx('Rimuovere {0} simboli del gruppo "{1}" dalla libreria? I progetti che li usano ne conservano una copia.', countOf(n), n.path))) cats.forEach(c => st().removeSymbolCategory(c));
  };
  /** Simboli di una cartella e delle sue sottocartelle */
  const symbolsOf = (n: TreeNode): SymbolDef[] => [...n.items, ...n.children.flatMap(symbolsOf)];
  /** Sposta un ramo intero: le sottocartelle restano sotto il ramo nuovo */
  const moveFolder = async (n: TreeNode) => {
    // Destinazioni: i rami fuori da quello che si sposta
    const cats = libraryCategories().filter(c => c !== n.path && !c.startsWith(`${n.path} /`));
    const to = (await pickBranch(tx('Sposta il ramo «{0}»', n.name), n.path, cats))?.split('/').map(x => x.trim()).filter(Boolean).join(' / ');
    if (!to || to === n.path) return;
    if (isDeletedSymbol({ category: to })) { st().logMsg(tx('Per eliminare un simbolo usa «Elimina»'), 'warn'); return; }
    const depth = n.path.split(' / ').length;
    const byCat = new Map<string, string[]>();
    for (const x of symbolsOf(n)) {
      const rest = x.category.split(/\s*\/\s*/).filter(Boolean).slice(depth);
      const cat = [to, ...rest].join(' / ');
      byCat.set(cat, [...(byCat.get(cat) ?? []), x.id]);
    }
    for (const [cat, ids] of byCat) st().moveLibrarySymbols(ids, cat);
  };
  // Preferiti: simboli di base, della libreria personale o copiati nel progetto
  const favorites = useMemo(() => favIds.map(id => getSymbol(id, { customSymbols } as Parameters<typeof getSymbol>[1])).filter((x): x is SymbolDef => !!x)
    .filter(x => !ql || `${x.name} ${tx(x.name)} ${x.letter} ${x.category}`.toLowerCase().includes(ql)), [favIds, customSymbols, symbolLibrary, ql]);
  // Tutti gli articoli trovati (per «Elimina elencati…»); se ne mostrano i primi 200
  const found = useMemo(() => library.filter(p => !ql ||
    `${p.partNr} ${p.typeNr ?? ''} ${p.descr1 ?? ''} ${p.manufacturer ?? ''}`.toLowerCase().includes(ql)), [library, ql]);
  const parts = found.slice(0, 200);
  const treeView = (pref.view ?? 'tree') === 'tree';
  // Vista ad albero: radici come le collezioni di QElectroTech
  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const pg of projectPages) for (const e of pg.elements) if (e.kind === 'symbol') m.set(e.symbolId, (m.get(e.symbolId) ?? 0) + 1);
    return m;
  }, [projectPages]);
  const roots = useMemo<TreeRoot[]>(() => {
    const baseItem = (b: SymbolDef) => {
      const x = overrides.get(b.id) ?? b;
      const label = x.name === b.name ? tx(b.name) : x.name;
      return { s: x, label, title: `${label}${x.letter ? ` (-${x.letter})` : ''}${x !== b ? ` · ${tx('modificato')}` : ''}` };
    };
    const projSyms = customSymbols.filter(x => !x.hidden && !x.id.startsWith('dist:'))
      .filter(x => !ql || `${x.name} ${x.letter} ${x.category}`.toLowerCase().includes(ql));
    const folder = symbolDir ? symbolDir.split(/[\\/]/).filter(Boolean).pop() : undefined;
    return [
      { label: tx('Preferiti'), icon: 'star', node: { name: '', path: '#tree/fav', items: favorites, children: [] } },
      { label: tx('Simboli di base'), icon: 'schema', node: { ...base, path: '#tree/base' }, item: baseItem },
      {
        label: folder ? tx('Libreria personale ({0})', folder) : tx('Libreria personale'), icon: 'user',
        node: { name: '', path: '#tree/lib', items: [], children: imported },
        item: (x: SymbolDef) => ({ s: x, label: x.name, title: `${x.name}${x.letter ? ` (-${x.letter})` : ''}${x.source ? ` · ${x.source}` : ''}` }),
        actions: [
          ...(symbolDir ? [{ label: tx('Apri la cartella dei simboli'), run: () => void window.elettro?.symlibOpen?.() }, { label: tx('Usa un\'altra cartella…'), run: () => void chooseSymbolFolder() }] : []),
          { label: tx('Unifica i simboli doppi…'), run: openUnifySymbols },
        ],
        symbolMenu: (x: SymbolDef) => [
          { label: tx('Sposta in un altro ramo…'), run: () => void moveSymbolsAsk([x]) },
          { label: tx('Elimina…'), run: () => void deleteSymbolsAsk([x]) },
        ],
        folderMenu: (n: TreeNode) => [
          { label: tx('Sposta il ramo…'), run: () => void moveFolder(n) },
          { label: tx('Elimina il ramo…'), run: () => void deleteSymbolsAsk(symbolsOf(n)) },
        ],
      },
      {
        label: tx('Progetto «{0}»', projectName), icon: 'page',
        node: { name: '', path: '#tree/proj', items: [], children: symbolTree(projSyms) },
        item: (x: SymbolDef) => {
          const n = used.get(x.id) ?? 0;
          const lib = findInLibrary(x);
          const differs = lib && !isDeletedSymbol(lib) && symbolPrint(lib) !== symbolPrint(x);
          const title = `${x.name}${x.letter ? ` (-${x.letter})` : ''} · ${differs ? tx('copia nel progetto diversa da quella della libreria') : lib ? tx('copia nel progetto') : tx('solo nel progetto')}`;
          return { s: x, label: x.name, title, note: `${differs ? '≠ ' : ''}${n ? `×${n}` : tx('non usato')}` };
        },
        // La copia del progetto non si modifica a parte: si modifica il simbolo della libreria
        edit: (x: SymbolDef) => { const lib = findInLibrary(x); st().openSymbolEditor(lib && !isDeletedSymbol(lib) ? lib : x); },
        symbolMenu: (x: SymbolDef) => {
          const lib = findInLibrary(x);
          return [
            lib ? { label: tx('Mostra nella libreria'), run: () => st().revealInLibrary(lib.id) }
              : { label: tx('Aggiungi alla libreria personale'), run: () => st().addSymbolsToLibrary([structuredClone(x)], '') },
            { label: tx('Confronta con la libreria…'), run: () => checkProjectSymbols(true) },
          ];
        },
      },
      ...(countOf(deleted) ? [{
        label: DELETED_CATEGORY, icon: 'folder', disabled: true,
        node: deleted,
        item: (x: SymbolDef) => ({ s: x, label: x.name, title: `${x.name} · ${x.category}` }),
        onRemove: removeGroup,
        symbolMenu: (x: SymbolDef) => [{ label: tx('Sposta nell\'albero (torna usabile)…'), run: () => void moveSymbolsAsk([x]) }],
      }] : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, base, imported, deleted, customSymbols, used, symbolDir, projectName, ql, overrides, findInLibrary]);

  // Simbolo da mostrare (tasto destro su un componente dello schema ▸ Mostra nella libreria)
  const revealReq = useStore(s => s.revealSymbol);
  const [reveal, setReveal] = useState<{ key: string; n: number }>();
  useEffect(() => {
    if (!revealReq || revealReq.n === lastReveal) return;
    lastReveal = revealReq.n;
    const where = revealPlace(revealReq.id);
    if (!where) { st().logMsg(tx('Simbolo non trovato nella libreria'), 'warn'); return; }
    setTab('symbols');
    setQ('');
    // Si aprono la radice e le cartelle che portano al simbolo
    const parts = where.folder ? where.folder.split(' / ') : [];
    const tree = { ...pref.tree, [where.root]: true, ...Object.fromEntries(parts.map((_, i) => [`${where.root}|${parts.slice(0, i + 1).join(' / ')}`, true])) };
    setPref({ ...pref, view: 'tree', tree });
    setReveal({ key: symbolRowKey(where.root, where.folder, where.id), n: revealReq.n });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealReq]);
  /** Dove si trova il simbolo nell'albero: radice, cartella e id della riga */
  function revealPlace(id: string): { root: string; folder: string; id: string } | undefined {
    const builtin = BUILTIN_SYMBOLS.find(b => b.id === id);
    if (builtin) return { root: '#tree/base', folder: `#base/${builtin.category}`, id };
    const proj = customSymbols.find(x => x.id === id);
    const lib = findInLibrary(proj ?? { id });
    if (lib?.replaces && BUILTIN_SYMBOLS.some(b => b.id === lib.replaces)) {
      const b = BUILTIN_SYMBOLS.find(x => x.id === lib.replaces)!;
      return { root: '#tree/base', folder: `#base/${b.category}`, id: b.id };
    }
    const path = (c: string) => c.split(/\s*\/\s*/).filter(Boolean).join(' / ');
    if (lib && isDeletedSymbol(lib)) { const f = path(lib.category); return { root: '#tree/del', folder: f === DELETED_CATEGORY ? '' : f, id: lib.id }; }
    if (lib) return { root: '#tree/lib', folder: path(lib.category), id: lib.id };
    if (proj) return { root: '#tree/proj', folder: path(proj.category), id: proj.id };
    return undefined;
  }
  const isOpenTree = (path: string, def: boolean) => !!ql || (pref.tree?.[path] ?? def);
  const toggleTree = (path: string, def: boolean) => setPref({ ...pref, tree: { ...pref.tree, [path]: !(pref.tree?.[path] ?? def) } });

  return (
    <div className="library">
      <div className="lib-tabs">
        <button className={tab === 'symbols' ? 'active' : ''} onClick={() => setTab('symbols')}>{tx('Simboli')}</button>
        <button className={tab === 'macros' ? 'active' : ''} onClick={() => setTab('macros')}>{tx('Macro (')}{macros.length})</button>
        <button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>{tx('Articoli (')}{library.length})</button>
      </div>
      <input className="search" placeholder={tx('Cerca…')} value={q} onChange={e => setQ(e.target.value)} />
      {tab === 'symbols' ? (
        <div className="lib-scroll">
          <div className="lib-import">
            <button onClick={importSymbols} title={tx('Componenti QElectroTech: file .elmt, progetti .qet o archivi .zip/.7z di cartelle')}>{tx('Importa componenti…')}</button>
            <button onClick={() => void importSymbolFolder()} title={tx('Tutti i simboli di una cartella e delle sottocartelle (.elmt, .qet, .ecsym): le sottocartelle diventano i rami dell\'albero')}>{tx('Importa cartella…')}</button>
            <button onClick={() => st().openSymbolEditor()} title={tx('Disegna un simbolo nuovo (clic destro su un simbolo per modificarlo)')}>{tx('Nuovo simbolo…')}</button>
          </div>
          <div className="lib-view small">
            <button className={`mini${treeView ? ' on' : ''}`} onClick={() => setPref({ ...pref, view: 'tree' })} title={tx('Albero di cartelle con un simbolo per riga, come le collezioni di QElectroTech')}>{tx('Albero')}</button>
            <button className={`mini${treeView ? '' : ' on'}`} onClick={() => setPref({ ...pref, view: 'grid' })} title={tx('Gruppi di icone')}>{tx('Icone')}</button>
            {!treeView && <>
              <button className={`mini${pref.large ? '' : ' on'}`} onClick={() => setPref({ ...pref, large: false })} title={tx('Icone piccole, tre per riga')}>{tx('piccole')}</button>
              <button className={`mini${pref.large ? ' on' : ''}`} onClick={() => setPref({ ...pref, large: true })} title={tx('Icone grandi, due per riga')}>{tx('grandi')}</button>
            </>}
            <span className="tb-spacer" />
            {treeView
              ? <button className="mini" onClick={() => setPref({ ...pref, tree: Object.fromEntries(roots.flatMap(r => [[r.node.path, true] as [string, boolean], ...r.node.children.flatMap(function all(n: TreeNode): [string, boolean][] { return [[`${r.node.path}|${n.path}`, false], ...n.children.flatMap(all)]; })])) })} title={tx('Chiudi tutte le cartelle')}>{tx('Comprimi')}</button>
              : <button className="mini" onClick={() => setPref({ ...pref, open: Object.fromEntries([base, ...imported].flatMap(function all(n: TreeNode): [string, boolean][] { return [[n.path, false], ...n.children.flatMap(all)]; })) })} title={tx('Chiudi tutti i gruppi')}>{tx('Comprimi')}</button>}
          </div>
          {treeView && <SymbolTreeView roots={roots} q={dq} isOpen={isOpenTree} toggle={toggleTree} reveal={reveal} />}
          {!treeView && symbolDir && (
            <div className="lib-folder small">
              <span className="muted" title={symbolDir}>{tx('Cartella dei simboli:')} {symbolDir.split(/[\\/]/).slice(-2).join('/')}</span>
              <button className="mini" title={tx('Un file per simbolo, le sottocartelle sono i gruppi della libreria: si copiano, si eliminano e si spostano anche dal Finder')} onClick={() => void window.elettro?.symlibOpen?.()}>{tx('Apri')}</button>
              <button className="mini" title={tx('Usa un\'altra cartella (es. condivisa in rete tra più installazioni)')} onClick={() => void chooseSymbolFolder()}>{tx('Cambia…')}</button>
            </div>
          )}
          {!treeView && <>
          <section className="lib-favorites">
            <h4>★ {tx('Preferiti')}</h4>
            {favorites.length
              ? grid(favorites.map(f => <SymItem key={f.id} s={f} size={size} label={tx(f.name)} title={`${tx(f.name)}${f.letter ? ` (-${f.letter})` : ''}`} />))
              : !ql && <p className="muted small">{tx('Clic sulla stella ☆ di un simbolo per averlo sempre qui.')}</p>}
          </section>
          {base.children.length > 0 && (
            <Group node={base} depth={0} isOpen={isOpen} toggle={toggle} label={tx('Simboli di base')}
              renderItems={items => grid(items.map(b => {
                const x = overrides.get(b.id) ?? b;
                const label = x.name === b.name ? tx(b.name) : x.name;
                return <SymItem key={b.id} s={x} size={size} label={label} title={`${label}${x.letter ? ` (-${x.letter})` : ''}${x !== b ? ` · ${tx('modificato')}` : ''}`} />;
              }))} />
          )}
          {imported.map(n => (
            <Group key={n.path} node={n} depth={0} isOpen={isOpen} toggle={toggle} onRemove={removeGroup}
              renderItems={items => grid(<>
                {items.slice(0, 150).map(x => <SymItem key={x.id} s={x} size={size} label={x.name} title={`${x.name}${x.letter ? ` (-${x.letter})` : ''}${x.source ? ` · ${x.source}` : ''}`}
                  menu={[{ label: tx('Sposta in un altro ramo…'), run: () => void moveSymbolsAsk([x]) }, { label: tx('Elimina…'), run: () => void deleteSymbolsAsk([x]) }]} />)}
                {items.length > 150 && <p className="muted small">{tx('… altri')} {items.length - 150}{tx(': usa la ricerca')}</p>}
              </>)} />
          ))}
          </>}
          {symbolLibrary.length > 0 && <p className="muted small pad">{tx('Simboli QElectroTech: © The QElectroTech team, licenza CC-BY 3.0.')}</p>}
        </div>
      ) : tab === 'macros' ? (
        <MacroList macros={macros.filter(m => !ql || `${m.name} ${m.category} ${m.description ?? ''}`.toLowerCase().includes(ql))} />
      ) : (
        <div className="lib-scroll">
          {!library.length && <p className="muted pad">{tx('Nessun articolo. Usa «Importa EDZ/XML» per caricare i dati dei produttori.')}</p>}
          {found.length > 0 && (
            <div className="pad">
              <button className="danger" title={tx('Toglie dalla libreria gli articoli elencati: tutti, o quelli trovati con la ricerca')}
                onClick={() => removeListedParts(found.map(p => p.partNr), !!ql)}>{tx('Elimina elencati…')}</button>
            </div>
          )}
          {parts.map(p => (
            <div key={p.partNr} className="part-item">
              {p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <div className="noimg">▦</div>}
              <div className="part-text">
                <b>{p.typeNr || p.partNr}</b>
                <span>{p.manufacturer}</span>
                <small>{p.descr1}</small>
              </div>
              <div className="part-actions">
                <button title={tx('Inserisci come scatola nera con i morsetti del modello funzione')} onClick={() => st().startPlacePart(p.partNr)}>{tx('Inserisci')}</button>
                <button title={tx('Assegna l\'articolo agli elementi selezionati')} disabled={!st().selection.length}
                  onClick={() => st().assignPart(st().selection, p.partNr)}>{tx('Assegna')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MacroPreview({ m, size = 120 }: { m: Macro; size?: number }) {
  const { origin } = m.clip;
  const pad = 4;
  const w = m.size.w + pad * 2, h = m.size.h + pad * 2;
  return (
    <svg width={size} height={size * 0.62} viewBox={`${origin.x - pad} ${origin.y - pad - 4} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <MacroGhost clip={m.clip} width={Math.max(0.5, Math.max(w, h) / 90)} />
    </svg>
  );
}

/** Anteprima grande della macro accanto alla libreria, con quello che contiene */
function MacroHover({ m, at }: { m: Macro; at: { right: number; top: number } }) {
  const els = m.clip.elements;
  const tags = [...new Set(els.flatMap(e => (e.kind === 'symbol' && e.tag ? [`-${e.tag}`] : [])))];
  const wires = els.filter(e => e.kind === 'wire').length;
  const top = Math.max(8, Math.min(at.top, window.innerHeight - 420));
  return (
    <div className="macro-hover" style={{ right: at.right, top }}>
      <b>{m.name}</b>
      {m.description && <div className="small">{m.description}</div>}
      <MacroPreview m={m} size={380} />
      <div className="small muted">{tx('{0} × {1} mm', Math.round(m.size.w), Math.round(m.size.h))} · {tx('{0} simboli, {1} fili', els.filter(e => e.kind === 'symbol').length, wires)}</div>
      {tags.length > 0 && <div className="small">{tx('Dispositivi: {0}', tags.slice(0, 30).join(' '))}{tags.length > 30 ? ' …' : ''}</div>}
      {m.clip.parts.length > 0 && <div className="small">{tx('Articoli: {0}', m.clip.parts.map(p => p.partNr).slice(0, 12).join(', '))}{m.clip.parts.length > 12 ? ' …' : ''}</div>}
      <div className="small muted">{tx('Inserendola, sigle e numeri filo vengono rinumerati.')}</div>
    </div>
  );
}

function MacroList({ macros }: { macros: Macro[] }) {
  const [hover, setHover] = useState<{ m: Macro; at: { right: number; top: number } } | null>(null);
  const tool = useStore(s => s.tool);
  const hasSel = useStore(s => s.selection.length > 0);
  const st = useStore.getState;
  const save = () => void saveMacroFromSelection();
  return (
    <div className="lib-scroll">
      <div className="lib-import">
        <button disabled={!hasSel} onClick={save} title={tx('Salva gli elementi selezionati come circuito riutilizzabile')}>{tx('Crea macro dalla selezione…')}</button>
        <div className="row-btns">
          <button onClick={importMacros}>{tx('Importa…')}</button>
          <button disabled={!macros.length} onClick={() => exportMacros()}>{tx('Esporta tutte…')}</button>
        </div>
      </div>
      {!macros.length && <p className="muted small pad">{tx('Nessuna macro. Seleziona un circuito nello schema (per esempio un avviamento motore) e usa «Crea macro dalla selezione». Inserendola, sigle e numeri filo vengono rinumerati.')}</p>}
      {macros.map(m => (
        <div key={m.id} className={`macro-item${tool.kind === 'macro' && tool.macroId === m.id ? ' active' : ''}`}
          onClick={() => st().setTool({ kind: 'macro', macroId: m.id })} title={tx('Clic, poi clic sullo schema per inserire')}
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ m, at: { right: window.innerWidth - r.left + 8, top: r.top } }); }}
          onMouseLeave={() => setHover(null)}>
          <MacroPreview m={m} />
          <div className="macro-text">
            <b>{m.name}</b>
            <span className="muted small">{m.category} · {m.clip.elements.length} {tx('elementi')}</span>
            <div className="row-btns">
              <button className="mini" onClick={e => { e.stopPropagation(); void exportMacros([m.id]); }}>{tx('Esporta')}</button>
              <button className="mini" onClick={e => { e.stopPropagation(); if (window.confirm(tx('Eliminare la macro "{0}"?', m.name))) st().deleteMacro(m.id); }}>{tx('Elimina')}</button>
            </div>
          </div>
        </div>
      ))}
      {hover && <MacroHover m={hover.m} at={hover.at} />}
    </div>
  );
}
