// Assistente IA integrato: pannello laterale (lo schema resta visibile e modificabile) con la
// conversazione, il profilo scelto (Claude, ChatGPT, Gemini; account o chiave API) e il contesto.
// Le pagine proposte dall'assistente si controllano e si applicano con un clic (annullabile).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { useAi } from './aiState';
import { aiAsk, aiCancel, PROVIDERS, type ChatMsg } from '../io/ai';
import { assistantSystem, extractPagesText, fixRequest, PRESETS, type AiScope } from '../model/aiPrompts';
import { importPagesText, type TextImportResult } from '../model/textFormat';
import { checkProject, acceptedOf } from '../model/checks';
import { uid } from '../model/geometry';
import { tx, tn } from '../i18n/ui';

interface Msg extends ChatMsg {
  id: string;
  /** Pagine nel formato testo trovate nella risposta */
  pages?: string;
  check?: { r: TextImportResult; problems: string[] };
  applied?: boolean;
  meta?: string;
  error?: boolean;
}

const SCOPES: [AiScope, string][] = [['page', tn('Pagina corrente')], ['all', tn('Tutto il progetto')], ['manual', tn('Domande sul programma')]];

/** Testo con i blocchi di codice in carattere fisso */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(```[\w-]*\n[\s\S]*?```)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^```[\w-]*\n([\s\S]*?)```$/.exec(p);
        return m ? <pre key={i} className="ai-code">{m[1]}</pre> : <div key={i} className="ai-text">{p.trim()}</div>;
      })}
    </>
  );
}

export function AiPanel() {
  const open = useStore(s => s.dialog === 'ai');
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const st = useStore.getState;
  const { profiles, activeId, load, setActive } = useAi();
  const [scope, setScope] = useState<AiScope>('page');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [msgs, busy]);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);
  if (!open) return null;
  const profile = profiles.find(p => p.id === activeId);

  const verify = (text: string) => {
    const s = st();
    const trial = structuredClone(s.project);
    const r = importPagesText(trial, text);
    const touched = new Set(trial.pages.filter(p => [...r.replaced, ...r.added].includes(p.name)).map(p => p.id));
    const problems = r.errors.length ? [] : checkProject(trial, s.library).filter(i => i.level !== 'info' && !acceptedOf(trial, i) && i.pageId && touched.has(i.pageId))
      .map(i => `${i.loc ? `/${i.loc} ` : ''}${i.kind}: ${i.msg}`);
    return { r, problems };
  };

  const send = async (text: string, sc = scope) => {
    if (!profile || !text.trim() || busy) return;
    const user: Msg = { id: uid('m'), role: 'user', text: text.trim() };
    const history = [...msgs.filter(m => !m.error), user];
    setMsgs([...msgs, user]);
    setInput('');
    const req = uid('req');
    setBusy(req); setElapsed(0);
    try {
      const s = st();
      const system = assistantSystem({ project: s.project, scope: sc, pageId: s.pageId, librarySymbols: s.symbolLibrary, library: s.library });
      const a = await aiAsk(profile, system, history.map(m => ({ role: m.role, text: m.text })), req);
      const pages = extractPagesText(a.text);
      const meta = `${profile.name}${profile.model ? ` · ${profile.model}` : ''} · ${(a.ms / 1000).toFixed(0)} s${a.cost ? ` · ${a.cost.toFixed(3)} $` : ''}`;
      setMsgs(m => [...m, { id: uid('m'), role: 'assistant', text: a.text, pages, check: pages ? verify(pages) : undefined, meta }]);
    } catch (e) {
      setMsgs(m => [...m, { id: uid('m'), role: 'assistant', text: (e as Error).message, error: true }]);
    } finally {
      setBusy(null);
    }
  };

  const apply = (m: Msg) => {
    if (!m.pages) return;
    const r = st().importText(m.pages);
    if (r.errors.length) setMsgs(list => list.map(x => (x.id === m.id ? { ...x, check: { r, problems: [] } } : x)));
    else setMsgs(list => list.map(x => (x.id === m.id ? { ...x, applied: true } : x)));
  };

  return (
    <aside className="ai-panel" role="complementary" aria-label={tx('Assistente IA')}>
      <div className="ai-head">
        <b>{tx('Assistente IA')}</b>
        <select value={activeId} onChange={e => setActive(e.target.value)} title={tx('Profilo: fornitore e account')}>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.name.includes(PROVIDERS[p.provider].name) ? '' : ` — ${PROVIDERS[p.provider].name}`}{p.mode === 'cli' ? (p.name.includes('account') ? '' : tx(' · account')) : tx(' · chiave API')}</option>)}
        </select>
        <button title={tx('Profili, account e chiavi')} onClick={() => st().setDialog('aiSettings')}>⚙</button>
        <button title={tx('Nuova conversazione')} disabled={!!busy || !msgs.length} onClick={() => setMsgs([])}>⟲</button>
        <button title={tx('Chiudi')} onClick={() => st().setDialog(null)}>✕</button>
      </div>
      <div className="ai-scope">
        {SCOPES.map(([v, l]) => (
          <label key={v}><input type="radio" checked={scope === v} onChange={() => setScope(v)} /> {tx(l)}</label>
        ))}
      </div>
      <div className="ai-list" ref={listRef}>
        {!msgs.length && (
          <div className="ai-empty">
            <p className="muted small">
              {tx('Chiedi di spiegare, controllare o modificare lo schema. L\'assistente vede')} {scope === 'page' ? tx('la pagina {0}', project.pages.find(p => p.id === pageId)?.name) : scope === 'all' ? tx('tutte le pagine') : tx('il manuale di OpenWiring')}{tx('; le pagine che propone vengono controllate prima di applicarle e si possono annullare.')}
            </p>
            <div className="ai-presets">
              {PRESETS.map(p => <button key={p.label} onClick={() => { if (p.scope) setScope(p.scope); void send(tx(p.text), p.scope ?? scope); }}>{tx(p.label)}</button>)}
            </div>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`ai-msg ${m.role}${m.error ? ' error' : ''}`}>
            <Rich text={m.text} />
            {m.pages && m.check && (
              <div className="ai-check">
                {m.applied
                  ? <span className="issue-ok">{tx('✓ Applicato al progetto (Modifica ▸ Annulla per tornare indietro)')}</span>
                  : m.check.r.errors.length
                    ? <span className="issue-error">{m.check.r.errors.length} {tx('errori: non si può applicare')}</span>
                    : <span>{tx('Pronto:')} {[m.check.r.replaced.length && `sostituisce le pagine ${m.check.r.replaced.join(', ')}`, m.check.r.added.length && `aggiunge le pagine ${m.check.r.added.join(', ')}`].filter(Boolean).join(', ')}{m.check.problems.length ? tx(' · {0} problemi', m.check.problems.length) : tx(' · nessun problema')}</span>}
                {(m.check.r.errors.length > 0 || m.check.problems.length > 0) && (
                  <ul className="small">
                    {m.check.r.errors.slice(0, 8).map((e, i) => <li key={`e${i}`} className="issue-error">{e.line ? tx('riga {0}: ', e.line) : ''}{e.msg}</li>)}
                    {m.check.problems.slice(0, 8).map((p, i) => <li key={`p${i}`} className="issue-warn">{p}</li>)}
                  </ul>
                )}
                <div className="panel-row">
                  {!m.applied && <button className="primary" disabled={!!m.check.r.errors.length} onClick={() => apply(m)}>{tx('Applica al progetto')}</button>}
                  {(m.check.r.errors.length > 0 || m.check.problems.length > 0 || m.check.r.warnings.length > 0) && !m.applied && (
                    <button disabled={!!busy} onClick={() => void send(fixRequest(m.check!.r.errors, m.check!.r.warnings, m.check!.problems))}>{tx('Chiedi la correzione')}</button>
                  )}
                  <button onClick={() => { st().setDialog('text'); void navigator.clipboard?.writeText(m.pages!); }} title={tx('Copia il testo delle pagine e apre la finestra del formato testo')}>{tx('Copia testo')}</button>
                </div>
              </div>
            )}
            {m.meta && <div className="ai-meta">{m.meta}</div>}
          </div>
        ))}
        {busy && (
          <div className="ai-msg assistant pending">
            <span className="muted">{profile?.name} {tx('sta rispondendo…')} {elapsed} s</span>
            <button onClick={() => { aiCancel(busy); setBusy(null); }}>{tx('Annulla')}</button>
          </div>
        )}
      </div>
      <div className="ai-input">
        <textarea value={input} placeholder={profile ? tx('Scrivi la richiesta (⌘/Ctrl+Invio per inviare)') : tx('Configura un profilo con ⚙')} disabled={!profile}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(input); } }} />
        <button className="primary" disabled={!profile || !input.trim() || !!busy} onClick={() => void send(input)}>{tx('Invia')}</button>
      </div>
    </aside>
  );
}
