// Finestra di inserimento testo: sostituisce window.prompt, che nell'app desktop (Electron)
// non è supportato. ask() apre la finestra e restituisce i valori (null se annullata).
import { useEffect, useRef, useState } from 'react';
import { tx } from '../i18n/ui';

export interface AskField {
  label: string; value?: string; placeholder?: string;
  /** Testo nascosto (password) */
  password?: boolean;
  /** Campo a scelta: valori e testi dell'elenco */
  options?: { value: string; label: string }[];
  /** Testo libero con l'elenco dei valori già usati da scegliere (si può scriverne uno nuovo) */
  suggestions?: string[];
}
export interface ComboItem { value: string; label: string }
/** Voce di una scelta multipla (askChecks); group: intestazione sotto cui sta, con la casella per tutto il gruppo */
export interface CheckItem { label: string; checked?: boolean; group?: string; disabled?: boolean; note?: string }
interface Request {
  title: string; fields: AskField[]; resolve: (v: string[] | null) => void; message?: string; choices?: string[]; list?: boolean; value?: number;
  /** Testo con l'elenco sotto, filtrato mentre si scrive (vedi askCombo) */
  combo?: { text: string; items: ComboItem[]; selected: number; placeholder?: string };
  /** Caselle da spuntare (vedi askChecks) */
  checks?: { items: CheckItem[]; ok: string };
  /** Voci da mettere in ordine (vedi askOrder) */
  order?: { items: string[]; reset?: string };
}

let show: ((r: Request) => void) | undefined;

/** Chiede uno o più testi; restituisce null se l'utente annulla */
export function ask(title: string, fields: AskField[]): Promise<string[] | null> {
  return new Promise(resolve => {
    if (show) show({ title, fields, resolve });
    else resolve(null);
  });
}

/** Chiede un solo testo (come window.prompt) */
export async function askText(label: string, value = ''): Promise<string | null> {
  const r = await ask(label, [{ label: '', value }]);
  return r ? r[0] : null;
}

/**
 * Domanda con più risposte (pulsanti): restituisce l'indice della scelta, null se l'utente chiude.
 * La prima scelta è quella proposta (Invio).
 */
export function askChoice(title: string, message: string, choices: string[]): Promise<number | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return; }
    show({ title, message, choices, fields: [], resolve: v => resolve(v ? Number(v[0]) : null) });
  });
}

/**
 * Scelta da un elenco (una riga per voce, anche lunga): restituisce l'indice, null se l'utente
 * chiude. La voce "selected" è evidenziata e si sceglie con Invio.
 */
export function askList(title: string, message: string, items: string[], selected = 0): Promise<number | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return; }
    show({ title, message, choices: items, list: true, fields: [], resolve: v => resolve(v ? Number(v[0]) : null), value: selected });
  });
}

/**
 * Testo libero con un elenco di proposte sotto, filtrato mentre si scrive: si sceglie una voce
 * (clic, frecce e Invio) o si conferma il testo scritto. Restituisce il testo e l'indice della voce
 * scelta (-1 se il testo non è una voce dell'elenco), null se l'utente annulla.
 */
export function askCombo(title: string, message: string, text: string, items: ComboItem[], selected = -1, placeholder?: string): Promise<{ text: string; index: number } | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return; }
    show({ title, message, fields: [], combo: { text, items, selected, placeholder }, resolve: v => resolve(v ? { text: v[0], index: Number(v[1]) } : null) });
  });
}

/**
 * Scelta multipla con caselle (raggruppate se le voci hanno il gruppo): restituisce per ogni voce
 * se è spuntata, null se l'utente annulla. ok: testo del pulsante di conferma.
 */
export function askChecks(title: string, message: string, items: CheckItem[], ok = tx('OK')): Promise<boolean[] | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return; }
    show({ title, message, fields: [], checks: { items, ok }, resolve: v => resolve(v ? v.map(x => x === '1') : null) });
  });
}

/**
 * Voci da mettere in ordine (frecce su e giù, o trascinandole): restituisce i loro indici nell'ordine
 * scelto, "reset" se l'utente sceglie il pulsante reset (es. «Automatico»), null se annulla
 */
export function askOrder(title: string, message: string, items: string[], reset?: string): Promise<number[] | 'reset' | null> {
  return new Promise(resolve => {
    if (!show) { resolve(null); return; }
    show({ title, message, fields: [], order: { items, reset }, resolve: v => resolve(!v ? null : v[0] === 'reset' ? 'reset' : v.map(Number)) });
  });
}

function OrderAsk({ req, close }: { req: Request; close: () => void }) {
  const { items, reset } = req.order!;
  const [order, setOrder] = useState(items.map((_, i) => i));
  const [cur, setCur] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder(o => { const n = [...o]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
    setCur(to);
  };
  const finish = (v: string[] | null) => { req.resolve(v); close(); };
  return (
    <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) finish(null); }}>
      <div className="modal" tabIndex={-1} onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        else if (e.key === 'ArrowUp' && e.altKey) { e.preventDefault(); move(cur, cur - 1); }
        else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); move(cur, cur + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(order.length - 1, c + 1)); }
      }}>
        <h3>{req.title}</h3>
        {req.message && <p className="ask-message">{req.message}</p>}
        <div className="ask-order">
          {order.map((ix, i) => (
            <div key={ix} className={`ask-order-row${i === cur ? ' current' : ''}${drag === i ? ' dragging' : ''}`} draggable
              onClick={() => setCur(i)} onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
              onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}>
              <span className="ask-order-n">{i + 1}</span>
              <span className="ask-order-text">{items[ix]}</span>
              <button type="button" className="mini" disabled={i === 0} title={tx('Su (Alt+↑)')} onClick={e => { e.stopPropagation(); move(i, i - 1); }}>↑</button>
              <button type="button" className="mini" disabled={i === order.length - 1} title={tx('Giù (Alt+↓)')} onClick={e => { e.stopPropagation(); move(i, i + 1); }}>↓</button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          {reset && <button type="button" onClick={() => finish(['reset'])}>{reset}</button>}
          <button type="button" onClick={() => finish(null)}>{tx('Annulla')}</button>
          <button type="button" className="primary" onClick={() => finish(order.map(String))}>{tx('OK')}</button>
        </div>
      </div>
    </div>
  );
}

function ChecksAsk({ req, close }: { req: Request; close: () => void }) {
  const items = req.checks!.items;
  const [on, setOn] = useState(items.map(x => !!x.checked && !x.disabled));
  const groups = [...new Set(items.map(x => x.group ?? ''))];
  const idx = (g: string) => items.map((x, i) => ((x.group ?? '') === g && !x.disabled ? i : -1)).filter(i => i >= 0);
  const setAll = (ids: number[], v: boolean) => setOn(o => o.map((x, i) => (ids.includes(i) ? v : x)));
  const all = items.map((x, i) => (x.disabled ? -1 : i)).filter(i => i >= 0);
  const n = on.filter(Boolean).length;
  const finish = (okay: boolean) => { req.resolve(okay ? on.map(x => (x ? '1' : '0')) : null); close(); };
  return (
    <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) finish(false); }}>
      <div className="modal" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } }}>
        <h3>{req.title}</h3>
        {req.message && <p className="ask-message">{req.message}</p>}
        <div className="row-buttons">
          <button type="button" className="mini" onClick={() => setAll(all, true)}>{tx('Tutte')}</button>
          <button type="button" className="mini" onClick={() => setAll(all, false)}>{tx('Nessuna')}</button>
        </div>
        <div className="ask-checks">
          {groups.map(g => {
            const ids = idx(g), some = ids.some(i => on[i]), every = ids.length > 0 && ids.every(i => on[i]);
            return (
              <div key={g} className="ask-check-group">
                {g && (
                  <label className="ask-check-head">
                    <input type="checkbox" checked={every} disabled={!ids.length} ref={el => { if (el) el.indeterminate = some && !every; }} onChange={e => setAll(ids, e.target.checked)} /> <b>{g}</b>
                  </label>
                )}
                {items.map((x, i) => ((x.group ?? '') !== g ? null : (
                  <label key={i} className={`ask-check${x.disabled ? ' muted' : ''}`} title={x.note}>
                    <input type="checkbox" checked={on[i]} disabled={x.disabled} onChange={e => setOn(o => o.map((v, k) => (k === i ? e.target.checked : v)))} /> {x.label}
                    {x.note && <span className="muted small"> · {x.note}</span>}
                  </label>
                )))}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => finish(false)}>{tx('Annulla')}</button>
          <button type="button" className="primary" disabled={!n} onClick={() => finish(true)}>{req.checks!.ok} ({n})</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Voci che contengono tutte le parole scritte (nel valore o nel testo dell'elenco): prima quelle il
 * cui valore inizia con il testo, poi quelle che lo contengono nel valore, poi nel testo
 */
export function filterCombo(items: ComboItem[], q: string): number[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const t = q.trim().toLowerCase();
  const rank = (i: number) => {
    const v = items[i].value.toLowerCase();
    return v.startsWith(t) ? 0 : v.includes(t) ? 1 : 2;
  };
  return items.map((_, i) => i).filter(i => {
    const hay = `${items[i].value} ${items[i].label}`.toLowerCase();
    return words.every(w => hay.includes(w));
  }).sort((a, b) => rank(a) - rank(b) || a - b);
}

function ComboAsk({ req, close }: { req: Request; close: () => void }) {
  const c = req.combo!;
  const [text, setText] = useState(c.text);
  // Finché il testo è quello proposto si vede tutto l'elenco
  const [typed, setTyped] = useState(false);
  const shown = typed ? filterCombo(c.items, text) : c.items.map((_, i) => i);
  const [hi, setHi] = useState(c.selected);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setTimeout(() => { input.current?.focus(); input.current?.select(); }, 0); }, []);
  useEffect(() => { listRef.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const pick = (i: number) => { req.resolve([c.items[i].value, String(i)]); close(); };
  const confirm = () => {
    if (hi >= 0 && shown.includes(hi)) { pick(hi); return; }
    const t = text.trim();
    // Testo uguale a una voce (anche con maiuscole diverse, es. «n» → «N»): vale la voce
    const exact = c.items.findIndex(x => x.value === t);
    const same = exact >= 0 ? exact : c.items.findIndex(x => x.value.toLowerCase() === t.toLowerCase());
    if (same >= 0) { pick(same); return; }
    req.resolve([t, '-1']); close();
  };
  const move = (d: number) => {
    if (!shown.length) return;
    const k = shown.indexOf(hi);
    setHi(shown[k < 0 ? (d > 0 ? 0 : shown.length - 1) : Math.max(-1, Math.min(shown.length - 1, k + d))] ?? -1);
  };
  return (
    <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) { req.resolve(null); close(); } }}>
      <form className="modal" onSubmit={e => { e.preventDefault(); confirm(); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); req.resolve(null); close(); }
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
          if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        }}>
        <h3>{req.title}</h3>
        {req.message && <p className="ask-message">{req.message}</p>}
        <label className="ask-field">
          <input ref={input} type="text" value={text} placeholder={c.placeholder}
            onChange={e => { setText(e.target.value); setTyped(true); setHi(-1); }} />
        </label>
        <div className="ask-list" ref={listRef}>
          {shown.map(i => (
            <button key={i} type="button" className={i === hi ? 'current' : undefined} onClick={() => pick(i)} title={c.items[i].label}>{c.items[i].label}</button>
          ))}
          {!shown.length && c.items.length > 0 && <span className="muted small">{tx('Nessuna voce corrisponde: con OK si usa il testo scritto.')}</span>}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => { req.resolve(null); close(); }}>{tx('Annulla')}</button>
          <button type="submit" className="primary">{tx('OK')}</button>
        </div>
      </form>
    </div>
  );
}

/** Da montare una volta nell'app */
export function AskHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    show = r => { setReq(r); setValues(r.fields.map(f => f.value ?? '')); };
    return () => { show = undefined; };
  }, []);
  const firstChoice = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (req) setTimeout(() => { first.current?.focus(); first.current?.select(); firstChoice.current?.focus(); }, 0); }, [req]);
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok ? values : null); setReq(null); };
  if (req.checks) return <ChecksAsk key={req.title} req={req} close={() => setReq(null)} />;
  if (req.order) return <OrderAsk key={req.title} req={req} close={() => setReq(null)} />;
  if (req.combo) return <ComboAsk key={req.title + req.combo.text} req={req} close={() => setReq(null)} />;
  if (req.choices) {
    const pick = (i: number | null) => { req.resolve(i === null ? null : [String(i)]); setReq(null); };
    return (
      <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) pick(null); }}>
        <div className="modal" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); pick(null); } }}>
          <h3>{req.title}</h3>
          {req.message && <p className="ask-message">{req.message}</p>}
          {req.list ? (
            <>
              <div className="ask-list">
                {req.choices.map((c, i) => (
                  <button key={i} type="button" ref={i === (req.value ?? 0) ? firstChoice : undefined} className={i === (req.value ?? 0) ? 'current' : undefined} onClick={() => pick(i)}>{c}</button>
                ))}
              </div>
              <div className="modal-actions"><button type="button" onClick={() => pick(null)}>{tx('Annulla')}</button></div>
            </>
          ) : (
            <div className="modal-actions">
              {req.choices.map((c, i) => (
                <button key={i} type="button" ref={i === 0 ? firstChoice : undefined} className={i === 0 ? 'primary' : undefined} onClick={() => pick(i)}>{c}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) done(false); }}>
      <form className="modal" onSubmit={e => { e.preventDefault(); done(true); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }}>
        <h3>{req.title}</h3>
        {req.fields.map((f, i) => (
          <label key={i} className="ask-field">
            {f.label && <span>{f.label}</span>}
            {f.options ? (
              <select value={values[i] ?? ''} onChange={e => setValues(v => v.map((x, k) => (k === i ? e.target.value : x)))}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <>
                <input ref={i === 0 ? first : undefined} type={f.password ? 'password' : 'text'} value={values[i] ?? ''} placeholder={f.placeholder}
                  list={f.suggestions?.length ? `ask-sugg-${i}` : undefined} onChange={e => setValues(v => v.map((x, k) => (k === i ? e.target.value : x)))} />
                {f.suggestions?.length ? <datalist id={`ask-sugg-${i}`}>{f.suggestions.map(o => <option key={o} value={o} />)}</datalist> : null}
              </>
            )}
          </label>
        ))}
        <div className="modal-actions">
          <button type="button" onClick={() => done(false)}>{tx('Annulla')}</button>
          <button type="submit" className="primary">{tx('OK')}</button>
        </div>
      </form>
    </div>
  );
}
