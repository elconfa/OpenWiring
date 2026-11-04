// Impostazioni degli assistenti IA: un profilo per ogni account o chiave (anche più account
// dello stesso fornitore), con prova del collegamento ed elenco dei modelli.
import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { useAi } from './aiState';
import { PROVIDERS, cliAvailable, withKey, aiAsk, listModels, checkCli, loginCommand, type AiProfile, type AiProvider, type AiMode } from '../io/ai';
import { uid } from '../model/geometry';
import { tx } from '../i18n/ui';

export function AiSettings() {
  const open = useStore(s => s.dialog === 'aiSettings');
  const st = useStore.getState;
  const { profiles, load, save, activeId, setActive } = useAi();
  const [sel, setSel] = useState('');
  const [draft, setDraft] = useState<AiProfile | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (open) void load(); }, [open, load]);
  // Il modulo si ricarica solo cambiando profilo (non a ogni salvataggio, per tenere i messaggi)
  const ids = profiles.map(p => p.id).join();
  useEffect(() => {
    const ps = useAi.getState().profiles;
    const p = ps.find(x => x.id === sel) ?? ps.find(x => x.id === useAi.getState().activeId) ?? ps[0];
    setDraft(p ? { ...p } : null); setKey(''); setModels([]); setNote(null);
    if (p && p.id !== sel) setSel(p.id);
  }, [sel, ids]);
  if (!open) return null;
  const close = () => st().setDialog('ai');
  const spec = draft ? PROVIDERS[draft.provider] : undefined;

  const store = async (): Promise<AiProfile | undefined> => {
    if (!draft) return;
    const p = key ? await withKey(draft, key.trim()) : draft;
    await save(profiles.map(x => (x.id === p.id ? p : x)));
    setKey('');
    return p;
  };
  const add = async (provider: AiProvider) => {
    const mode: AiMode = cliAvailable() ? 'cli' : 'api';
    const n = profiles.filter(p => p.provider === provider).length + 1;
    const p: AiProfile = { id: uid('ai'), name: `${PROVIDERS[provider].name} ${n}`, provider, mode };
    await save([...profiles, p]);
    setSel(p.id);
  };
  const remove = async () => {
    if (!draft) return;
    await save(profiles.filter(p => p.id !== draft.id));
    setSel('');
  };
  const test = async () => {
    const p = await store();
    if (!p) return;
    setTesting(true); setNote(null);
    try {
      if (p.mode === 'cli') {
        const c = await checkCli(p);
        if (!c.ok) throw new Error(c.error ?? tx('CLI non trovata'));
      }
      const a = await aiAsk(p, 'Rispondi in italiano con una sola frase breve.', [{ role: 'user', text: 'Presentati: chi sei e quale modello sei?' }]);
      setNote({ ok: true, text: `Funziona (${(a.ms / 1000).toFixed(1)} s): ${a.text.trim().slice(0, 200)}` });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const fetchModels = async () => {
    const p = await store();
    if (!p) return;
    try { const m = await listModels(p); setModels(m); setNote({ ok: true, text: `${m.length} modelli disponibili con questa chiave` }); }
    catch (e) { setNote({ ok: false, text: (e as Error).message }); }
  };

  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal wide ai-settings" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Assistenti IA')}>
        <h3>{tx('Assistenti IA: profili e account')}</h3>
        <p className="muted small">
          {tx('Ogni profilo è un account o una chiave.')} <b>{tx('Account sul computer')}</b>{tx(': usa la CLI ufficiale già collegata al tuo abbonamento (Claude Pro/Max, ChatGPT Plus/Pro, account Google), senza chiave API; solo nell\'app desktop.')} <b>{tx('Chiave API')}</b>{tx(': pagamento a consumo sul sito del fornitore. Per due account dello stesso fornitore crea due profili con cartelle diverse.')}
        </p>
        <div className="ai-settings-body">
          <div className="ai-profile-list">
            {profiles.map(p => (
              <button key={p.id} className={p.id === sel ? 'tab active' : 'tab'} onClick={() => setSel(p.id)}>
                {p.id === activeId ? '● ' : ''}{p.name}<span className="muted small"> {PROVIDERS[p.provider].name} · {p.mode === 'cli' ? 'account' : 'API'}</span>
              </button>
            ))}
            <div className="muted small pad">{tx('Nuovo profilo:')}</div>
            {(Object.keys(PROVIDERS) as AiProvider[]).map(pr => <button key={pr} onClick={() => void add(pr)}>+ {PROVIDERS[pr].name}</button>)}
          </div>
          {draft && spec && (
            <div className="ai-profile-form">
              <label className="row">{tx('Nome')} <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="row">{tx('Fornitore')}
                <select value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value as AiProvider, model: undefined })}>
                  {(Object.keys(PROVIDERS) as AiProvider[]).map(pr => <option key={pr} value={pr}>{PROVIDERS[pr].name} ({PROVIDERS[pr].company})</option>)}
                </select>
              </label>
              <label className="row">{tx('Collegamento')}
                <select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as AiMode })}>
                  <option value="cli" disabled={!cliAvailable()}>{tx('Account sul computer —')} {spec.cli}{cliAvailable() ? '' : tx(' (solo app desktop)')}</option>
                  <option value="api">{tx('Chiave API')}</option>
                </select>
              </label>
              <label className="row">{tx('Modello##IA')}
                <input list="ai-models" value={draft.model ?? ''} placeholder={draft.mode === 'cli' ? tx('predefinito dell\'account') : spec.defaultModel}
                  onChange={e => setDraft({ ...draft, model: e.target.value || undefined })} />
                <datalist id="ai-models">{(models.length ? models : spec.models).map(m => <option key={m} value={m} />)}</datalist>
                {draft.mode === 'api' && <button onClick={() => void fetchModels()} title={tx('Chiede al fornitore i modelli disponibili con questa chiave')}>{tx('Elenca')}</button>}
              </label>
              {draft.mode === 'api' ? (
                <>
                  <label className="row">{tx('Chiave API')}
                    <input type="password" value={key} autoComplete="off" placeholder={draft.key ? tx('•••••••• salvata (scrivi per cambiarla)') : tx('incolla la chiave')} onChange={e => setKey(e.target.value)} />
                  </label>
                  <p className="muted small">
                    {tx('La chiave si crea su')} <a href={spec.keyUrl} target="_blank" rel="noreferrer">{spec.keyUrl.replace('https://', '')}</a>.
                    {window.elettro?.encrypt ? tx(' Viene salvata cifrata dal sistema operativo, solo su questo computer.') : tx(' Nel browser resta salvata in chiaro in questo browser: preferisci l\'app desktop.')}
                  </p>
                </>
              ) : (
                <>
                  <label className="row">{tx('Cartella account')}
                    <input value={draft.configDir ?? ''} placeholder={tx('predefinita (es. ~/.{0}-lavoro per un secondo account)', draft.provider === 'openai' ? 'codex' : draft.provider)}
                      onChange={e => setDraft({ ...draft, configDir: e.target.value || undefined })} />
                  </label>
                  <p className="muted small">
                    {tx('Serve')} {spec.cli} {tx('installata e collegata. Per collegare l\'account apri il Terminale ed esegui:')} <code>{loginCommand(draft)}</code>
                  </p>
                </>
              )}
              {note && <p className={note.ok ? 'issue-ok small' : 'issue-error small'} style={{ whiteSpace: 'pre-wrap' }}>{note.text}</p>}
              <div className="panel-row">
                <button className="primary" onClick={() => void store().then(() => setNote({ ok: true, text: 'Salvato' }))}>{tx('Salva')}</button>
                <button disabled={testing} onClick={() => void test()}>{testing ? tx('Prova in corso…') : tx('Prova')}</button>
                <button disabled={draft.id === activeId} onClick={() => { void store(); setActive(draft.id); }}>{tx('Usa questo profilo')}</button>
                <span className="tb-spacer" />
                <button disabled={profiles.length <= 1} onClick={() => void remove()}>{tx('Elimina')}</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={() => { void store(); close(); }}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}
