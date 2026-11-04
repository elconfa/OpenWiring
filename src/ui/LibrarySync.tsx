// Una sola libreria dei simboli: confronto del progetto con la libreria personale all'apertura,
// unificazione dei doppioni, eliminazione (cartella «Eliminare») e spostamento dei simboli nell'albero.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import type { SymbolDef } from '../model/types';
import { compareWithLibrary, defaultChoice, duplicateGroups, isDeletedSymbol, originalCategory, DELETED_CATEGORY, type DupGroup, type SymbolChoice, type SymbolDiff } from '../model/symbolSync';
import { isReleased } from '../model/revisions';
import { SymbolPreview } from './SymbolLibrary';
import { askChoice } from './Ask';
import { pickBranch } from './BranchPicker';
import { tx } from '../i18n/ui';
import { usePanelStore } from './panels';

const st = useStore.getState;

/** Mostra il simbolo nell'albero della libreria (il riquadro Simboli si apre se era chiuso o nascosto) */
export function showInLibrary(symbolId: string) {
  const P = usePanelStore.getState();
  if (P.layout.closed.right) P.setClosed('right', false);
  else if (P.layout.hidden.right && !P.layout.detached.right) P.setPeek('right');
  st().revealInLibrary(symbolId);
}

/** Rami dell'albero della libreria personale (per scegliere dove spostare un simbolo) */
export const libraryCategories = () => [...new Set(st().symbolLibrary.filter(s => !isDeletedSymbol(s) && !s.replaces).map(s => s.category))].sort((a, b) => a.localeCompare(b));

/** Sposta i simboli in un ramo dell'albero (esistente o nuovo) */
export async function moveSymbolsAsk(syms: SymbolDef[]) {
  if (!syms.length) return;
  const deleted = syms.every(isDeletedSymbol);
  const from = deleted ? originalCategory(syms[0].category) : syms[0].category;
  const cat = (await pickBranch(syms.length === 1 ? tx('Sposta «{0}»', syms[0].name) : tx('Sposta {0} simboli', syms.length), from, libraryCategories()))?.trim();
  if (!cat) return;
  if (isDeletedSymbol({ category: cat })) { st().logMsg(tx('Per eliminare un simbolo usa «Elimina»'), 'warn'); return; }
  st().moveLibrarySymbols(syms.map(s => s.id), cat);
}

/** Elimina i simboli dalla libreria personale (vanno nella cartella «Eliminare») */
export async function deleteSymbolsAsk(syms: SymbolDef[]) {
  if (!syms.length) return;
  const c = await askChoice(syms.length === 1 ? tx('Eliminare «{0}»?', syms[0].name) : tx('Eliminare {0} simboli?', syms.length),
    tx('Il file va nella cartella «{0}» della libreria e il simbolo non si può più inserire finché non lo sposti di nuovo nell\'albero. I progetti che lo usano ne tengono la loro copia.', DELETED_CATEGORY),
    [tx('Elimina'), tx('Annulla')]);
  if (c === 0) st().deleteLibrarySymbols(syms.map(s => s.id));
}

let showSync: ((diffs: SymbolDiff[], name: string) => void) | undefined;

/**
 * Confronta il progetto attivo con la libreria personale: i simboli uguali con un altro id
 * (doppioni unificati) si collegano da soli, per quelli diversi o solo nel progetto si chiede.
 * I progetti rilasciati non si toccano.
 */
export function checkProjectSymbols(manual = false) {
  const s = st();
  if (s.viewing) return;
  if (isReleased(s.project)) { if (manual) s.logMsg(tx('Revisione rilasciata: i simboli del progetto non si aggiornano finché non apri una nuova revisione'), 'warn'); return; }
  const diffs = compareWithLibrary(s.project, s.symbolLibrary);
  if (!diffs.length) { if (manual) s.logMsg(tx('I simboli del progetto sono uguali a quelli della libreria personale')); return; }
  const ask = diffs.filter(d => d.kind !== 'relink');
  if (!ask.length) {
    s.applyLibrarySync(diffs, {});
    s.logMsg(tx('{0} simboli del progetto collegati ai simboli unificati della libreria', diffs.length));
    return;
  }
  showSync?.(diffs, s.project.info.name || tx('Progetto senza nome'));
}

/** Dopo l'avvio la libreria si legge dalla cartella: il confronto aspetta che sia pronta */
let libraryReady = false;
export function setSymbolLibraryReady() {
  libraryReady = true;
  checkProjectSymbols();
}
/** Da chiamare dopo l'apertura di un progetto */
export function afterProjectOpen() {
  if (libraryReady) checkProjectSymbols();
}

/** Scelte possibili per un simbolo */
const choicesOf = (kind: SymbolDiff['kind']): { value: SymbolChoice; label: string; title: string }[] => (kind === 'changed' ? [
  { value: 'library', label: tx('Usa la libreria'), title: tx('Il progetto prende il simbolo della libreria personale') },
  { value: 'project', label: tx('Tieni quello del progetto'), title: tx('Il progetto resta com\'è; non si chiede più finché il simbolo della libreria non cambia') },
  { value: 'toLibrary', label: tx('Porta in libreria'), title: tx('La versione del progetto diventa quella della libreria personale (per tutti i prossimi progetti)') },
] : kind === 'onlyProject' ? [
  { value: 'add', label: tx('Aggiungi alla libreria'), title: tx('Il simbolo entra nella libreria personale, nella sua cartella') },
  { value: 'onlyProject', label: tx('Solo nel progetto'), title: tx('Resta solo in questo progetto; non si chiede più') },
] : []);

export function SymbolSyncHost() {
  const [req, setReq] = useState<{ diffs: SymbolDiff[]; name: string } | null>(null);
  const [choice, setChoice] = useState<Record<string, SymbolChoice>>({});
  useEffect(() => {
    showSync = (diffs, name) => { setChoice(Object.fromEntries(diffs.map(d => [d.project.id, defaultChoice(d)]))); setReq({ diffs, name }); };
    return () => { showSync = undefined; };
  }, []);
  if (!req) return null;
  const rows = req.diffs.filter(d => d.kind !== 'relink');
  const setAll = (kind: SymbolDiff['kind'], v: SymbolChoice) => setChoice(c => ({ ...c, ...Object.fromEntries(rows.filter(d => d.kind === kind).map(d => [d.project.id, v])) }));
  const apply = () => {
    st().applyLibrarySync(req.diffs, choice);
    const n = rows.filter(d => choice[d.project.id] === 'library').length;
    const pins = rows.filter(d => d.kind === 'changed' && d.pinsChanged && choice[d.project.id] === 'library');
    st().logMsg(tx('Simboli del progetto confrontati con la libreria: {0} aggiornati', n));
    if (pins.length) st().logMsg(tx('Punti di connessione cambiati in {0}: controlla i fili con Progetto ▸ Verifica', pins.map(d => d.project.name).join(', ')), 'warn');
    setReq(null);
  };
  // Annulla: per ora nessuna scelta, si richiede alla prossima apertura
  const later = () => setReq(null);
  const changed = rows.some(d => d.kind === 'changed'), only = rows.some(d => d.kind === 'onlyProject');
  return (
    <div className="modal-back" onMouseDown={later}>
      <div className="modal wide symbol-sync" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Simboli diversi dalla libreria')}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); later(); } }}>
        <h3>{tx('Simboli del progetto «{0}» e libreria personale', req.name)}</h3>
        <p className="small muted">{tx('Questi simboli del progetto non sono uguali a quelli della libreria personale. Scegli per ognuno quale versione tenere: la libreria è l\'unica da modificare, il progetto ne tiene una copia.')}</p>
        <div className="row-btns small">
          {changed && <>
            <button className="mini" onClick={() => setAll('changed', 'library')}>{tx('Tutti dalla libreria')}</button>
            <button className="mini" onClick={() => setAll('changed', 'project')}>{tx('Tutti dal progetto')}</button>
          </>}
          {only && <button className="mini" onClick={() => setAll('onlyProject', 'add')}>{tx('Aggiungi tutti alla libreria')}</button>}
        </div>
        <div className="sync-list">
          {rows.map(d => (
            <div key={d.project.id} className="sync-row">
              <div className="sync-sym">
                <SymbolPreview sym={d.project} size={64} />
                <span className="small">{tx('Progetto')}</span>
              </div>
              {d.kind === 'changed' ? (
                <div className="sync-sym">
                  <SymbolPreview sym={d.library} size={64} />
                  <span className="small">{tx('Libreria')}</span>
                </div>
              ) : <div className="sync-sym sync-none small muted">{tx('non c\'è in libreria')}</div>}
              <div className="sync-text">
                <b>{d.project.name}</b>
                <span className="small muted">{d.kind === 'changed' ? d.library.category : d.project.category} · {d.uses === 1 ? tx('usato una volta') : tx('usato {0} volte', d.uses)}</span>
                {d.kind === 'changed' && d.pinsChanged && <span className="small warn-text">{tx('Punti di connessione diversi: dopo l\'aggiornamento controlla i fili')}</span>}
              </div>
              <div className="sync-choice">
                {choicesOf(d.kind).map(c => (
                  <label key={c.value} title={c.title}>
                    <input type="radio" name={`sync-${d.project.id}`} checked={choice[d.project.id] === c.value} onChange={() => setChoice(x => ({ ...x, [d.project.id]: c.value }))} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={later} title={tx('Nessuna modifica: si chiede di nuovo alla prossima apertura')}>{tx('Più tardi')}</button>
          <button className="primary" onClick={apply}>{tx('Applica')}</button>
        </div>
      </div>
    </div>
  );
}

let showUnify: (() => void) | undefined;
/** Apre la finestra dei doppioni della libreria personale */
export function openUnifySymbols() {
  if (!duplicateGroups(st().symbolLibrary).length) { st().logMsg(tx('Nessun simbolo doppio nella libreria personale')); return; }
  showUnify?.();
}

export function UnifySymbolsHost() {
  const [open, setOpen] = useState(false);
  const library = useStore(s => s.symbolLibrary);
  const groups = useMemo<DupGroup[]>(() => (open ? duplicateGroups(library) : []), [open, library]);
  // Per gruppo: id del simbolo tenuto, oppure '' = lasciali tutti
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [onlyIdentical, setOnlyIdentical] = useState(false);
  useEffect(() => {
    showUnify = () => { setKeep({}); setOpen(true); };
    return () => { showUnify = undefined; };
  }, []);
  if (!open) return null;
  // Di serie: i doppioni con lo stesso disegno si unificano sul primo, quelli con solo lo stesso nome no
  const keptOf = (g: DupGroup, i: number) => keep[i] ?? (g.identical ? g.symbols[0].id : '');
  const shown = groups.map((g, i) => ({ g, i })).filter(x => !onlyIdentical || x.g.identical);
  const apply = () => {
    const merges = groups.map((g, i) => ({ keep: keptOf(g, i), others: g.symbols.map(s => s.id).filter(id => id !== keptOf(g, i)) })).filter(m => m.keep);
    st().unifySymbols(merges);
    setOpen(false);
  };
  return (
    <div className="modal-back" onMouseDown={() => setOpen(false)}>
      <div className="modal wide symbol-sync" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Unifica i simboli doppi')}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
        <h3>{tx('Unifica i simboli doppi')}</h3>
        <p className="small muted">{tx('Gruppi di simboli della libreria personale con lo stesso disegno o lo stesso nome. Scegli quale tenere: gli altri vanno nella cartella «{0}» e i progetti che li usano passano a quello tenuto (questo progetto subito, gli altri quando si aprono).', DELETED_CATEGORY)}</p>
        <label className="small"><input type="checkbox" checked={onlyIdentical} onChange={e => setOnlyIdentical(e.target.checked)} /> {tx('Solo quelli con lo stesso disegno')}</label>
        <div className="sync-list">
          {shown.map(({ g, i }) => (
            <div key={g.symbols.map(s => s.id).join('|')} className="dup-group">
              <div className="small"><b>{g.symbols[0].name}</b> · {g.identical ? tx('stesso disegno') : tx('stesso nome, disegni diversi')}</div>
              <div className="dup-items">
                {g.symbols.map(s => (
                  <label key={s.id} className={`dup-item${keptOf(g, i) === s.id ? ' on' : ''}`} title={`${s.name} · ${s.category}`}>
                    <input type="radio" name={`dup-${i}`} checked={keptOf(g, i) === s.id} onChange={() => setKeep(k => ({ ...k, [i]: s.id }))} />
                    <SymbolPreview sym={s} size={56} />
                    <span className="small">{s.name}</span>
                    <span className="small muted">{s.category}</span>
                  </label>
                ))}
                <label className={`dup-item none${keptOf(g, i) === '' ? ' on' : ''}`}>
                  <input type="radio" name={`dup-${i}`} checked={keptOf(g, i) === ''} onChange={() => setKeep(k => ({ ...k, [i]: '' }))} />
                  <span className="small">{tx('Lasciali tutti')}</span>
                </label>
              </div>
            </div>
          ))}
          {!shown.length && <p className="muted small">{tx('Nessun gruppo.')}</p>}
        </div>
        <div className="modal-actions">
          <button onClick={() => setOpen(false)}>{tx('Annulla')}</button>
          <button className="primary" onClick={apply}>{tx('Unifica')}</button>
        </div>
      </div>
    </div>
  );
}
