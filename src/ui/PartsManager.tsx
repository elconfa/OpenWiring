// Gestione articoli: libreria importata dai produttori (EDZ/XML) e articoli del progetto.
import { useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '../model/store';
import type { DocKind, Part, PartCable, PartDoc } from '../model/types';
import { conductorsFor, isPeName } from '../model/cables';
import { ConductorSwatch } from './CablesView';
import { blackBoxFromPart, BUILTIN_SYMBOLS } from '../model/symbols';
import { getSymbol } from '../model/geometry';
import { SymbolPreview } from './SymbolLibrary';
import * as A from './actions';
import { ask, askConfirm } from './Ask';
import { useGrid, Th, gridProps } from './grid';
import { ColSplitter } from './split';
import { CONNECTOR_TYPES, connectorGroup, connectorTypeName } from '../model/connectorTypes';
import { DOC_KINDS, docKind, docKindInfo, edzDocs, fileName, isAbsPath, isWebDoc, kindFromName, relToFolder } from '../model/partDocs';
import { openDocument } from '../io/fileio';
import { PartSearchDialog } from './PartSearchDialog';
import { tx, tn } from '../i18n/ui';
import { partsInDb, searchPartsDb, useFullPart } from './partsDbSync';
import { edzPrefs, setEdzPrefs } from './edzPrefs';

const FIELDS: [keyof Part, string, 'text' | 'number'][] = [
  ['typeNr', tn('Numero tipo'), 'text'], ['orderNr', tn('Numero d\'ordine'), 'text'], ['manufacturer', tn('Costruttore'), 'text'],
  ['supplier', tn('Fornitore'), 'text'], ['descr1', tn('Descrizione 1'), 'text'], ['descr2', tn('Descrizione 2'), 'text'],
  ['productGroup', tn('Gruppo prodotto'), 'text'], ['width', tn('Larghezza (mm)'), 'number'], ['height', tn('Altezza (mm)'), 'number'],
  ['depth', tn('Profondità (mm)'), 'number'], ['weight', tn('Peso (kg)'), 'number'], ['price', tn('Prezzo'), 'number'],
  ['powerLoss', tn('Potenza dissipata (W)'), 'number'], ['note', tn('Note'), 'text'],
];

export function PartsManager() {
  const library = useStore(s => s.library);
  const projectParts = useStore(s => s.project.parts);
  const treeSel = useStore(s => s.treeSel);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | undefined>();
  const st = useStore.getState;
  useEffect(() => { if (treeSel.type === 'part') setSel(treeSel.partNr); }, [treeSel]);

  const all = useMemo(() => {
    const m = new Map<string, Part & { inProject: boolean; inLibrary: boolean }>();
    for (const p of library) m.set(p.partNr, { ...p, inLibrary: true, inProject: false });
    for (const p of projectParts) {
      const e = m.get(p.partNr);
      m.set(p.partNr, { ...(e ?? p), inLibrary: !!e, inProject: true });
    }
    return [...m.values()];
  }, [library, projectParts]);
  // Criteri: costruttore, gruppo prodotto e origine (file importato), insieme alla ricerca.
  // «Elimina elencati» toglie in blocco gli articoli che rispondono ai criteri, foto comprese.
  const [crit, setCrit] = useState<{ manufacturer?: string; productGroup?: string; source?: string }>({});
  const options = useMemo(() => {
    const o = { manufacturer: new Set<string>(), productGroup: new Set<string>(), source: new Set<string>(), supplier: new Set<string>() };
    for (const p of all) for (const k of ['manufacturer', 'productGroup', 'source', 'supplier'] as const) if (p[k]) o[k].add(p[k]!);
    const sorted = (x: Set<string>) => [...x].sort((a, b) => a.localeCompare(b));
    return { manufacturer: sorted(o.manufacturer), productGroup: sorted(o.productGroup), source: sorted(o.source), supplier: sorted(o.supplier) };
  }, [all]);
  // Ricerca nel database anche negli attributi (app desktop)
  const [deep, setDeep] = useState(false);
  const [edz, setEdz] = useState(edzPrefs);
  const edzOpt = (k: 'pictures' | 'symbols') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = { ...edz, [k]: e.target.checked };
    setEdz(v); setEdzPrefs(v);
  };
  const [deepHits, setDeepHits] = useState<Set<string> | undefined>();
  useEffect(() => {
    if (!deep || !q.trim()) { setDeepHits(undefined); return; }
    let live = true;
    const t = window.setTimeout(() => void searchPartsDb(q).then(r => { if (live) setDeepHits(r); }), 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [deep, q, library]);
  const ql = q.toLowerCase();
  const rows = useMemo(() => all.filter(p =>
    (!ql || `${p.partNr} ${p.typeNr} ${p.descr1} ${p.manufacturer} ${p.orderNr}`.toLowerCase().includes(ql) || !!deepHits?.has(p.partNr))
    && (!crit.manufacturer || p.manufacturer === crit.manufacturer)
    && (!crit.productGroup || p.productGroup === crit.productGroup)
    && (!crit.source || p.source === crit.source)), [all, ql, deepHits, crit]);
  const filtered = !!ql || !!crit.manufacturer || !!crit.productGroup || !!crit.source;
  const part = all.find(p => p.partNr === sel);
  type Row = typeof rows[number];
  const g = useGrid<Row>('parts', rows, {
    partNr: p => p.partNr, typeNr: p => p.typeNr, descr1: p => p.descr1, manufacturer: p => p.manufacturer,
    fts: p => p.functionTemplates.length, use: p => `${p.inProject ? 'P' : ''}${p.inLibrary ? 'L' : ''}`,
  });
  // Articoli della libreria tra quelli elencati (ricerca e criteri fanno da filtro, es. un costruttore)
  const removable = rows.filter(p => p.inLibrary);
  const removeListed = async () => {
    if (await A.removeListedParts(removable.map(p => p.partNr), filtered) && sel && removable.some(p => p.partNr === sel)) setSel(undefined);
  };
  // Con migliaia di articoli si disegnano solo le righe visibili (altezza delle righe fissa)
  const ROW = 23;
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, h: 1200 });
  const measure = () => { const el = wrap.current; if (el) setView({ top: el.scrollTop, h: el.clientHeight || 1200 }); };
  useEffect(() => {
    measure();
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(view.top / ROW) - 30);
  const last = Math.min(g.rows.length, Math.ceil((view.top + view.h) / ROW) + 30);
  const pick = (k: keyof typeof crit, label: string) => (
    <select value={crit[k] ?? ''} onChange={e => setCrit({ ...crit, [k]: e.target.value || undefined })} title={label}>
      <option value="">{label}: {tx('tutti')}</option>
      {options[k].map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  );
  const db = partsInDb();

  const [searchIn, setSearchIn] = useState<string | null>(null);
  const newPart = async () => {
    const r = await ask(tx('Nuovo articolo'), [
      { label: tx('Codice articolo'), placeholder: tx('es. SIE.3RT2015-1BB41') },
      { label: tx('Costruttore (scegli dall\'elenco o scrivine uno nuovo)'), value: crit.manufacturer ?? '', suggestions: options.manufacturer },
      { label: tx('Descrizione'), placeholder: tx('es. Contattore 7 A, 24 V DC') },
    ]);
    const nr = r?.[0].trim();
    if (!nr) return;
    if (A.partExists(nr)) { setSel(nr); await A.warnPartExists(nr); return; }
    const manufacturer = r![1].trim() || undefined, descr1 = r![2].trim() || undefined;
    st().addPartsToLibrary([{ partNr: nr, functionTemplates: [], attrs: {}, ...(manufacturer ? { manufacturer } : {}), ...(descr1 ? { descr1 } : {}) }], 'inserimento manuale');
    setSel(nr);
  };

  return (
    <div className="parts-view">
      {searchIn !== null && <PartSearchDialog initial={searchIn} onClose={() => setSearchIn(null)} />}
      <div className="parts-list">
        <div className="parts-toolbar">
          <input className="search" placeholder={tx('Cerca codice, tipo, descrizione, costruttore…')} value={q} onChange={e => setQ(e.target.value)} />
          {db && <label className="small nowrap" title={tx('Cerca le parole anche in tutti gli attributi dell\'articolo (dati EPLAN, documenti…)')}>
            <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} /> {tx('in tutti i dati')}</label>}
          <button onClick={A.importParts}>{tx('Importa EDZ/XML…')}</button>
          <label className="small nowrap" title={tx('Importa anche le foto degli articoli (la libreria diventa molto più pesante)')}>
            <input type="checkbox" checked={edz.pictures} onChange={edzOpt('pictures')} /> {tx('foto')}</label>
          <label className="small nowrap" title={tx('Crea anche i simboli dalle macro di schema EPLAN del costruttore; senza, gli articoli tengono il modello funzione (morsetti) da associare ai tuoi simboli')}>
            <input type="checkbox" checked={edz.symbols} onChange={edzOpt('symbols')} /> {tx('simboli dalle macro')}</label>
          <button onClick={newPart}>{tx('Nuovo articolo')}</button>
          <button onClick={() => setSearchIn(sel ?? q)} title={tx('Dove è usato un articolo, nel progetto aperto e nei progetti di una cartella')}>{tx('Cerca nei progetti…')}</button>
          <button onClick={() => void A.exportPartsXlsx()} title={tx('Tutti gli articoli in un foglio Excel, da modificare e reimportare')}>{tx('Esporta Excel')}</button>
          <button onClick={() => void A.importPartsXlsx()} title={tx('Aggiunge e aggiorna gli articoli dal foglio Excel (colonna «Codice articolo» come chiave)')}>{tx('Importa Excel')}</button>
          <button onClick={A.exportParts}>{tx('Esporta XML (formato EPLAN)')}</button>
          {db && <button onClick={() => void A.exportPartsDb(removable.map(p => p.partNr))} title={tx('Gli articoli elencati, con foto e attributi, in un file SQLite da portare su un altro computer')}>{tx('Esporta libreria…')}</button>}
          {db && <button onClick={() => void A.importPartsDb()} title={tx('Articoli da un file della libreria (SQLite): quelli con lo stesso codice si sostituiscono')}>{tx('Importa libreria…')}</button>}
          {db && <button onClick={() => void window.elettro?.partsOpen?.()} title={tx('Mostra il file del database degli articoli')}>{tx('Database…')}</button>}
          <button className="danger" disabled={!removable.length} onClick={removeListed}>{tx('Elimina elencati…')}</button>
        </div>
        <div className="parts-toolbar parts-criteria">
          {pick('manufacturer', tx('Costruttore'))}
          {pick('productGroup', tx('Gruppo prodotto'))}
          {pick('source', tx('Origine'))}
          {(crit.manufacturer || crit.productGroup || crit.source) && <button className="mini" onClick={() => setCrit({})}>{tx('Togli i criteri')}</button>}
          <span className="small muted">{filtered ? tx('{0} articoli su {1}', rows.length, all.length) : tx('{0} articoli', all.length)}</span>
        </div>
        <div className="table-wrap" ref={wrap} onScroll={measure}>
          <table {...gridProps(g, 'grid virtual')}>
            <thead><tr>
              <Th g={g} k="partNr">{tx('Codice articolo')}</Th><Th g={g} k="typeNr">{tx('Tipo')}</Th><Th g={g} k="descr1">{tx('Descrizione')}</Th>
              <Th g={g} k="manufacturer">{tx('Costruttore')}</Th><Th g={g} k="fts">{tx('Funzioni')}</Th><Th g={g} k="use">{tx('Uso')}</Th>
            </tr></thead>
            <tbody>
              {first > 0 && <tr className="spacer" style={{ height: first * ROW }}><td colSpan={6} /></tr>}
              {g.rows.slice(first, last).map(p => (
                <tr key={p.partNr} className={p.partNr === sel ? 'sel' : ''} onClick={() => setSel(p.partNr)}>
                  <td>{p.partNr}</td><td>{p.typeNr}</td><td>{p.descr1}</td><td>{p.manufacturer}</td>
                  <td>{p.functionTemplates.length}</td>
                  <td>{p.inProject ? tx('Progetto') : ''}{p.inProject && p.inLibrary ? ' · ' : ''}{p.inLibrary ? tx('Libreria') : ''}</td>
                </tr>
              ))}
              {last < g.rows.length && <tr className="spacer" style={{ height: (g.rows.length - last) * ROW }}><td colSpan={6} /></tr>}
              {!rows.length && <tr><td colSpan={6} className="muted pad">{tx('Nessun articolo. Importa un file EDZ dall\'Eplan Data Portal o dal sito del produttore, oppure un XML esportato da EPLAN.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ColSplitter id="parts" />
      <div className="part-detail">
        {part ? <PartDetail part={part} known={options} /> : <p className="muted pad">{tx('Seleziona un articolo per vederne i dettagli.')}</p>}
      </div>
    </div>
  );
}

/** Scelta di un simbolo (di base o importato) con ricerca */
function SymbolPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const symbolLibrary = useStore(s => s.symbolLibrary);
  const [q, setQ] = useState('');
  const all = useMemo(() => [...BUILTIN_SYMBOLS, ...symbolLibrary], [symbolLibrary]);
  const ql = q.trim().toLowerCase();
  const list = all.filter(x => x.id === value || !ql || `${x.name} ${x.category}`.toLowerCase().includes(ql)).slice(0, 200);
  return (
    <div className="sym-picker">
      <input className="search" placeholder={tx('Cerca simbolo (es. bobina, contatto, motore)…')} value={q} onChange={e => setQ(e.target.value)} />
      <select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
        <option value="">{tx('Scatola nera automatica')}</option>
        {list.map(x => <option key={x.id} value={x.id}>{x.category} · {x.name}</option>)}
      </select>
    </div>
  );
}

/** Valori già usati, da scegliere nei campi testo (costruttore, fornitore, gruppo prodotto) */
type KnownValues = Partial<Record<keyof Part, string[]>>;

function PartDetail({ part: shown, known }: { part: Part & { inLibrary: boolean }; known: KnownValues }) {
  const st = useStore.getState;
  // Gli attributi degli articoli del database arrivano un attimo dopo
  const part = useFullPart(shown)!;
  const sym = blackBoxFromPart(part);
  const set = (k: keyof Part, raw: string, type: 'text' | 'number') => {
    const v = type === 'number' ? (raw === '' ? undefined : parseFloat(raw.replace(',', '.'))) : raw || undefined;
    st().updatePart(part.partNr, { [k]: v });
  };
  const [ftText, setFtText] = useState('');
  useEffect(() => setFtText(part.functionTemplates.map(f => `${f.connections.join(' ')}${f.description ? ' ; ' + f.description : ''}`).join('\n')), [part]);
  const saveFt = () => {
    const fts = ftText.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const [conn, descr] = l.split(';');
      return { pos: i + 1, description: (descr ?? '').trim(), connections: conn.trim().split(/[\s,]+/).filter(Boolean) };
    });
    st().updatePart(part.partNr, { functionTemplates: fts });
  };
  return (
    <div className="detail-scroll">
      <div className="detail-head">
        {part.picture ? <img src={part.picture} alt={part.typeNr} /> : <div className="noimg big">▦</div>}
        <div>
          <h3>{part.partNr}</h3>
          <p>{part.descr1}</p>
          <div className="row-btns">
            <button onClick={() => st().startPlacePart(part.partNr)}>{tx('Inserisci nello schema')}</button>
            <button disabled={!st().selection.length} onClick={() => st().assignPart(st().selection, part.partNr)}>{tx('Assegna alla selezione')}</button>
            <button className="danger" onClick={() => void A.deletePart(part.partNr)}>{tx('Elimina')}</button>
          </div>
        </div>
      </div>
      <table className="prop-table">
        <tbody>
          {FIELDS.map(([k, l, t]) => (
            <tr key={k}>
              <td className="prop-name">{tx(l)}</td>
              <td className="prop-value">
                <input key={`${part.partNr}-${k}`} type="text" defaultValue={part[k] === undefined ? '' : String(part[k])} list={known[k]?.length ? `part-known-${k}` : undefined}
                  placeholder={known[k]?.length ? tx('scegli dall\'elenco o scrivi') : undefined}
                  onBlur={e => { if (e.target.value !== (part[k] === undefined ? '' : String(part[k]))) set(k, e.target.value, t); }} />
                {known[k]?.length ? <datalist id={`part-known-${k}`}>{known[k]!.map(v => <option key={v} value={v} />)}</datalist> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PartDocsEditor part={part} />
      <h4>
        <label className="inline-check" title={tx('Gli articoli segnati come morsetto compaiono nelle scelte della vista Morsettiere')}>
          <input type="checkbox" checked={!!part.terminal} onChange={e => st().updatePart(part.partNr, { terminal: e.target.checked ? { levels: part.terminal?.levels ?? 1 } : undefined })} />
          {' '}{tx('Morsetto')}
        </label>
        {part.terminal && (
          <select value={part.terminal.levels} onChange={e => st().updatePart(part.partNr, { terminal: { levels: parseInt(e.target.value, 10) } })} style={{ width: 'auto', marginLeft: 8 }}>
            {[1, 2, 3].map(n => <option key={n} value={n}>{n > 1 ? tx('{0} piani', n) : tx('1 piano')}</option>)}
          </select>
        )}
      </h4>
      <h4>
        <label className="inline-check" title={tx('Articolo connettore (spina, presa, M12, RJ45…): il connettore che usa questo articolo prende dal tipo numero e nomi dei pin, piedinatura e colori')}>
          {tx('Connettore')}{' '}
          <select value={part.connectorType ?? ''} onChange={e => st().updatePart(part.partNr, { connectorType: e.target.value || undefined })} style={{ width: 'auto', marginLeft: 8 }}>
            <option value="">{tx('— non è un connettore —')}</option>
            {[...new Set(CONNECTOR_TYPES.map(t => connectorGroup(t, tx)))].map(g => (
              <optgroup key={g} label={g}>
                {CONNECTOR_TYPES.filter(t => connectorGroup(t, tx) === g).map(t => <option key={t.id} value={t.id}>{connectorTypeName(t)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </h4>
      <PartCableEditor part={part} />
      <h4>{tx('Modello funzione (punti di connessione)')}</h4>
      <p className="muted small">{tx('Una funzione per riga: designazioni separate da spazio, poi «;» e descrizione. Es.')} <code>{tx('13 14 ; Contatto NA')}</code></p>
      <textarea rows={6} value={ftText} onChange={e => setFtText(e.target.value)} onBlur={saveFt} />
      <h4>{tx('Simbolo nello schema')}</h4>
      <SymbolPicker value={part.symbolId} onChange={id => st().updatePart(part.partNr, { symbolId: id })} />
      <div className="bb-preview"><SymbolPreview sym={(part.symbolId && getSymbol(part.symbolId)) || sym} size={160} /></div>
      <p className="muted small">{part.symbolId ? tx('Inserendo l\'articolo viene usato questo simbolo.') : tx('Senza un simbolo scelto viene generata una scatola nera con i morsetti del modello funzione.')}</p>
      {part.macro && <p className="muted small">{tx('Macro EPLAN di riferimento:')} <code>{part.macro}</code> {tx('(non importabile: formato proprietario)')}</p>}
      {part.source && <p className="muted small">{tx('Origine:')} {part.source}</p>}
    </div>
  );
}

/**
 * Schede tecniche e documenti dell'articolo: file PDF sul disco (app desktop) o indirizzi web, con
 * il nome da mostrare; sotto quelli arrivati con i dati EPLAN. Nell'«Elenco documenti allegati» del
 * progetto e, a scelta, allegati in fondo al PDF dello schema.
 */
// Nomi dei tipi di documento (DOC_KINDS in partDocs.ts), per le traduzioni
void [tn('Scheda tecnica'), tn('Dichiarazione CE'), tn('Dichiarazione UL'), tn('Altra dichiarazione'), tn('Manuale'), tn('Altro documento')];

function PartDocsEditor({ part }: { part: Part }) {
  const st = useStore.getState;
  const own = part.docs ?? [];
  const edz = edzDocs(part).filter(d => !own.some(o => o.path === d.path));
  const save = (docs: PartDoc[]) => st().updatePart(part.partNr, { docs: docs.length ? docs : undefined });
  const open = (path: string) => { openDocument(path).catch(e => st().logMsg(tx('Impossibile aprire {0}: {1}', path, (e as Error).message), 'warn')); };
  const [folder, setFolder] = useState<string>();
  useEffect(() => { void window.elettro?.partDocsDir?.().then(setFolder, () => undefined); }, []);
  /**
   * Copia i file nella cartella Documenti, nella sottocartella del loro tipo (Data Sheet, Dichiarazioni/CE…),
   * e restituisce i percorsi relativi (null = rimasto fuori)
   */
  const copyIn = async (paths: string[], kinds: DocKind[]) => (await window.elettro?.partDocsCopy?.(paths, kinds.map(k => docKindInfo(k).folder)).catch(e => { st().logMsg(tx('Copia non riuscita: {0}', (e as Error).message), 'warn'); return null; })) ?? paths.map(() => null);
  const addFiles = async () => {
    const paths = await window.elettro?.choosePaths?.([{ name: 'PDF', extensions: ['pdf'] }]) ?? [];
    if (!paths.length) return;
    // I file nella cartella Documenti si salvano con il percorso relativo; quelli fuori si possono copiare dentro
    let picked = paths.map(p => (folder && relToFolder(folder, p)) || p);
    const outside = picked.filter(isAbsPath);
    if (outside.length && folder && window.elettro?.partDocsCopy
      && await askConfirm(tx('Documenti degli articoli'), tx('{0} file sono fuori dalla cartella Documenti ({1}). Copiarli nella sottocartella del loro tipo (Data Sheet, Dichiarazioni, Manuali)? Così il progetto li ritrova anche su un altro computer. Con Annulla restano collegati dove sono.', outside.length, folder), tx('Copia nella cartella'))) {
      const rels = await copyIn(outside, outside.map(p => kindFromName(fileName(p)) ?? 'datasheet'));
      picked = picked.map(p => { const i = outside.indexOf(p); return i >= 0 && rels[i] ? rels[i]! : p; });
    }
    save([...own, ...picked.filter(p => !own.some(o => o.path === p)).map(p => ({ name: fileName(p).replace(/\.pdf$/i, ''), path: p }))]);
  };
  /** Documento collegato con percorso assoluto: si porta nella cartella (dentro = solo il percorso, fuori = copia) */
  const toFolder = async (i: number) => {
    const d = own[i];
    const rel = (folder && relToFolder(folder, d.path)) || (await copyIn([d.path], [docKind(d)]))[0];
    if (rel) save(own.map((x, k) => (k === i ? { ...x, path: rel } : x)));
  };
  const addUrl = async () => {
    const r = await ask(tx('Documento da indirizzo web'), [{ label: tx('Nome'), value: tx('Scheda tecnica') }, { label: tx('Indirizzo'), placeholder: 'https://…' }]);
    const url = r?.[1].trim();
    if (!r || !url) return;
    if (!isWebDoc(url)) { st().logMsg(tx('L\'indirizzo deve cominciare con http:// o https://'), 'warn'); return; }
    save([...own, { name: r[0].trim() || url, path: url }]);
  };
  return (
    <>
      <h4>{tx('Schede tecniche, dichiarazioni e manuali')}</h4>
      <table className="grid part-docs">
        <tbody>
          {own.map((d, i) => (
            <tr key={d.path}>
              <td>
                <select value={docKind(d)} onChange={e => { const k = e.target.value as DocKind; save(own.map((x, j) => (j === i ? { ...x, kind: docKind({ ...x, kind: undefined }) === k ? undefined : k } : x))); }}
                  title={tx('Tipo di documento: di serie dalla sottocartella di Documenti (Data Sheet, Dichiarazioni/CE, Dichiarazioni/UL, Dichiarazioni/Altre, Manuali) o dal nome del file')}>
                  {DOC_KINDS.map(k => <option key={k.kind} value={k.kind}>{tx(k.label)}</option>)}
                </select>
              </td>
              <td><input key={`${part.partNr}-${d.path}`} defaultValue={d.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) save(own.map((x, k) => (k === i ? { ...x, name: v } : x))); }} /></td>
              <td className="small" title={isAbsPath(d.path) ? tx('{0}\nFuori dalla cartella Documenti: su un altro computer il file non si trova', d.path) : d.path}>
                {isWebDoc(d.path) ? d.path : isAbsPath(d.path) ? <>⚠ {fileName(d.path)}</> : d.path}
              </td>
              <td className="nowrap">
                <button className="mini" onClick={() => open(d.path)}>{tx('Apri')}</button>
                {isAbsPath(d.path) && folder && <button className="mini" onClick={() => void toFolder(i)} title={tx('Porta il file nella cartella Documenti (lo copia se sta fuori) e salva il percorso relativo')}>{tx('In cartella')}</button>}
                <button className="mini" title={tx('Togli il documento dall\'articolo (il file resta dov\'è)')} onClick={() => save(own.filter((_, k) => k !== i))}>✕</button>
              </td>
            </tr>
          ))}
          {edz.map(d => (
            <tr key={d.path} className="muted">
              <td>{tx(docKindInfo(docKind(d)).label)}</td><td>{tx(d.name)}</td><td className="small" title={d.path}>{d.path.length > 60 ? `${d.path.slice(0, 57)}…` : d.path}</td>
              <td><button className="mini" onClick={() => open(d.path)}>{tx('Apri')}</button></td>
            </tr>
          ))}
          {!own.length && !edz.length && <tr><td colSpan={4} className="muted">{tx('Nessun documento.')}</td></tr>}
        </tbody>
      </table>
      <div className="row-buttons">
        <button disabled={!window.elettro?.choosePaths} onClick={() => void addFiles()} title={window.elettro?.choosePaths ? tx('Collega uno o più file PDF: quelli nella cartella Documenti si salvano con il percorso relativo; si allegano al PDF dello schema') : tx('I file sul disco si collegano dall\'app desktop')}>{tx('Aggiungi PDF…')}</button>
        <button onClick={() => void addUrl()}>{tx('Aggiungi indirizzo web…')}</button>
        {folder && <button onClick={() => void window.elettro?.partDocsOpen?.()} title={tx('Cartella delle schede tecniche: {0}. I PDF che stanno qui si salvano con il percorso relativo e si ritrovano su ogni computer con la stessa cartella', folder)}>{tx('Cartella')}</button>}
        {folder && <button className="mini" onClick={() => void window.elettro?.partDocsChoose?.().then(d => { if (d) setFolder(d); })} title={tx('Usa un\'altra cartella per le schede tecniche (es. condivisa in rete tra più installazioni)')}>…</button>}
      </div>
    </>
  );
}

/**
 * Articolo cavo (tipologia): marcatura e tutti i conduttori, uno per riga (es. i 25 colori di un
 * cavo di comando). Nel pannello Cavi, scegliendo l'articolo, il cavo prende questi conduttori.
 */
function PartCableEditor({ part }: { part: Part }) {
  const st = useStore.getState;
  const pc = part.cable;
  const [text, setText] = useState('');
  useEffect(() => setText((pc?.conductors ?? []).join('\n')), [pc]);
  const save = (patch: Partial<PartCable> | undefined) =>
    st().updatePart(part.partNr, { cable: patch === undefined ? undefined : { marking: 'numbers', conductors: [], ...(pc ?? {}), ...patch } });
  return (
    <>
      <h4>
        <label className="inline-check">
          <input type="checkbox" checked={!!pc} onChange={e => save(e.target.checked ? { conductors: pc?.conductors.length ? pc.conductors : conductorsFor(5, true, 'colors'), marking: 'colors' } : undefined)} />
          {' '}{tx('Cavo (tipologia con i suoi conduttori)')}
        </label>
      </h4>
      {pc && (
        <>
          <table className="prop-table">
            <tbody>
              <tr><td className="prop-name">{tx('Marcatura')}</td><td className="prop-value">
                <select value={pc.marking} onChange={e => { const marking = e.target.value as PartCable['marking']; save({ marking, conductors: pc.conductors.length ? conductorsFor(pc.conductors.length, pc.conductors.some(isPeName), marking) : pc.conductors }); }}
                  title={tx('Cambiando la marcatura i conduttori diventano numeri o colori standard, da modificare poi a mano')}>
                  <option value="numbers">{tx('Numeri')}</option>
                  <option value="colors">{tx('Colori')}</option>
                </select>
              </td></tr>
              <tr><td className="prop-name">{tx('Formazione')}</td><td className="prop-value">
                {pc.conductors.length}{pc.conductors.some(isPeName) ? 'G' : 'x'}{pc.cross ?? '?'}{' '}
                <select value="" onChange={e => { const [n, pe] = e.target.value.split('|'); if (n) save({ conductors: conductorsFor(parseInt(n, 10), pe === '1', pc.marking) }); }}
                  title={tx('Riempie l\'elenco dei conduttori con numeri o colori standard, da modificare poi a mano')}>
                  <option value="">{tx('imposta…')}</option>
                  {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}g`} value={`${n}|1`}>{n}{tx('G (con giallo-verde)')}</option>)}
                  {[2, 3, 4, 5, 7, 12, 18, 25, 37].map(n => <option key={`${n}x`} value={`${n}|0`}>{n}{tx('x (senza giallo-verde)')}</option>)}
                </select>
              </td></tr>
              <tr><td className="prop-name">{tx('Sezione (mm²)')}</td><td className="prop-value">
                <input key={`${part.partNr}-cross`} type="text" defaultValue={pc.cross ?? ''} placeholder={tx('es. 1,5')} onBlur={e => { if (e.target.value.trim() !== (pc.cross ?? '')) save({ cross: e.target.value.trim() || undefined }); }} />
              </td></tr>
              <tr><td className="prop-name">{tx('Schermato')}</td><td className="prop-value"><input type="checkbox" checked={!!pc.shield} onChange={e => save({ shield: e.target.checked || undefined })} /></td></tr>
              <tr><td className="prop-name">{tx('Confezionato (a pezzi)')}</td><td className="prop-value"><input type="checkbox" checked={!!pc.pieces} title={tx('Cavo con connettore saldato e lunghezza fissa: si ordina a pezzi, non a metri')} onChange={e => save({ pieces: e.target.checked || undefined })} /></td></tr>
            </tbody>
          </table>
          <p className="muted small">{tx('Conduttori in ordine, uno per riga: numero o colore (es. BN, WH-GN, GNYE, oppure nero, marrone…).')}</p>
          <div className="cable-conductors-edit">
            <textarea rows={Math.max(5, pc.conductors.length + 1)} value={text} onChange={e => setText(e.target.value)}
              onBlur={() => { const list = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (list.join('\n') !== pc.conductors.join('\n')) save({ conductors: list }); }} />
            <div className="cable-swatches">{pc.conductors.map((n, i) => <div key={i}><ConductorSwatch name={n} />{i + 1}</div>)}</div>
          </div>
        </>
      )}
    </>
  );
}
