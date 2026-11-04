// Scelta del ramo dell'albero della libreria dove spostare simboli o cartelle: albero dei rami
// esistenti con ricerca, e il percorso scritto a mano per crearne uno nuovo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

interface Request { title: string; value: string; categories: string[]; resolve: (v: string | undefined) => void }

let show: ((r: Request) => void) | undefined;

const split = (c: string) => c.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
const join = (parts: string[]) => parts.join(' / ');

/** Chiede il ramo (percorso «A / B / C»); undefined = annullato */
export function pickBranch(title: string, value: string, categories: string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    if (!show) { resolve(undefined); return; }
    show({ title, value, categories, resolve });
  });
}

interface Branch { path: string; name: string; depth: number; count: number; children: Branch[] }

/** Rami con le sottocartelle e quanti simboli contengono (anche nelle sottocartelle) */
function branchTree(categories: string[]): { roots: Branch[]; all: Branch[] } {
  const byPath = new Map<string, Branch>();
  const roots: Branch[] = [];
  for (const c of categories) {
    const parts = split(c);
    let parent: Branch | undefined;
    parts.forEach((name, i) => {
      const path = join(parts.slice(0, i + 1));
      let b = byPath.get(path);
      if (!b) {
        b = { path, name, depth: i, count: 0, children: [] };
        byPath.set(path, b);
        (parent ? parent.children : roots).push(b);
      }
      b.count++;
      parent = b;
    });
  }
  const sort = (l: Branch[]) => { l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); l.forEach(b => sort(b.children)); };
  sort(roots);
  return { roots, all: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })) };
}

/** Rami mostrati al più con una ricerca */
const MAX_FOUND = 300;

export function BranchPickerHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [path, setPath] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    show = r => {
      setReq(r);
      setPath(join(split(r.value)));
      setQ('');
      // Aperti i rami che portano a quello di partenza
      const parts = split(r.value);
      setOpen(new Set(parts.map((_, i) => join(parts.slice(0, i + 1)))));
    };
    return () => { show = undefined; };
  }, []);
  const tree = useMemo(() => branchTree(req?.categories ?? []), [req]);
  // Il ramo scelto in vista all'apertura
  useEffect(() => {
    if (req) requestAnimationFrame(() => listRef.current?.querySelector('.tree-row.focus')?.scrollIntoView({ block: 'center' }));
  }, [req]);
  if (!req) return null;
  const finish = (v: string | undefined) => { req.resolve(v); setReq(null); };
  const ok = () => { const v = join(split(path)); if (v) finish(v); };
  const ql = q.trim().toLowerCase();
  const found = ql ? tree.all.filter(b => b.path.toLowerCase().includes(ql)) : [];
  const exists = tree.all.some(b => b.path === join(split(path)));
  const row = (b: Branch, depth: number, label: string, twist?: boolean) => (
    <div key={b.path} className={`tree-row folder${b.path === join(split(path)) ? ' focus active' : ''}`} title={b.path}
      onClick={() => { setPath(b.path); if (twist && !open.has(b.path)) setOpen(s => new Set(s).add(b.path)); }} onDoubleClick={() => finish(b.path)}>
      <span className="tree-guides" style={{ width: depth * 14 }} />
      <span className="tree-twist" onClick={e => {
        if (!twist) return;
        e.stopPropagation();
        setOpen(s => { const n = new Set(s); if (n.has(b.path)) n.delete(b.path); else n.add(b.path); return n; });
      }}>{twist ? (open.has(b.path) ? '▾' : '▸') : ''}</span>
      <Icon name={twist && open.has(b.path) ? 'open' : 'folder'} size={15} className="tree-icon" />
      <span className="tree-label">{label}</span>
      <span className="tree-count">{b.count}</span>
    </div>
  );
  const walk = (l: Branch[]): React.ReactNode[] => l.flatMap(b => [row(b, b.depth, b.name, b.children.length > 0), ...(open.has(b.path) ? walk(b.children) : [])]);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) finish(undefined); }}>
      <div className="modal branch-picker" role="dialog" aria-label={req.title}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); finish(undefined); } }}>
        <h3>{req.title}</h3>
        <label className="small muted">{tx('Ramo di destinazione (sottocartelle separate da «/»; scrivi un nome nuovo per creare un ramo)')}</label>
        <input type="text" value={path} autoFocus onFocus={e => e.target.select()} onChange={e => setPath(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />
        <div className="small muted branch-new">{path.trim() && !exists ? tx('Ramo nuovo: verrà creato') : ' '}</div>
        <input type="search" className="search" placeholder={tx('Cerca un ramo…')} value={q} onChange={e => setQ(e.target.value)} />
        <div className="sym-tree branch-list" ref={listRef}>
          {ql
            ? <>
                {found.slice(0, MAX_FOUND).map(b => row(b, 0, b.path))}
                {found.length > MAX_FOUND && <div className="tree-row muted small">{tx('… altri {0} trovati: scrivi di più per restringere la ricerca', found.length - MAX_FOUND)}</div>}
                {!found.length && <p className="muted small pad">{tx('Nessun ramo trovato.')}</p>}
              </>
            : walk(tree.roots)}
        </div>
        <div className="modal-actions">
          <button onClick={() => finish(undefined)}>{tx('Annulla')}</button>
          <button className="primary" disabled={!path.trim()} onClick={ok}>{tx('Sposta qui')}</button>
        </div>
      </div>
    </div>
  );
}
