// Pagine in formato testo: esportazione da dare a un assistente di intelligenza artificiale e
// importazione del testo modificato, con controllo degli errori prima di applicarlo.
import { useState } from 'react';
import { useStore } from '../model/store';
import { pagesToText, importPagesText, type TextImportResult } from '../model/textFormat';
import { checkProject } from '../model/checks';
import { agentGuide } from '../model/agentGuide';
import { openFiles, saveFile, safeName } from '../io/fileio';
import { tx } from '../i18n/ui';

/** Istruzioni da incollare insieme al testo nella chat dell'assistente */
const PROMPT = `Ti passo uno schema elettrico di OpenWiring nel suo formato testo (le righe che iniziano con # spiegano la sintassi e descrivono i collegamenti).
Modificalo secondo la mia richiesta qui sotto. Regole:
- rispondi con le pagine complete che cambi o aggiungi, in un unico blocco di codice, nello stesso formato;
- usa solo i simboli del catalogo; tieni le coordinate sulla griglia di 4 mm e dentro l'area di disegno;
- per i collegamenti nuovi puoi usare "collega <sigla:punto> <sigla:punto>" invece di calcolare i fili;
- non cambiare sigle e numeri filo esistenti se non te lo chiedo.

Richiesta: `;

export function TextDialog() {
  const open = useStore(s => s.dialog === 'text');
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const library = useStore(s => s.symbolLibrary);
  const st = useStore.getState;
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [catalog, setCatalog] = useState(true);
  const [text, setText] = useState('');
  const [check, setCheck] = useState<{ r: TextImportResult; problems: number } | null>(null);
  const [note, setNote] = useState('');
  if (!open) return null;
  const close = () => st().setDialog(null);
  const generate = () => {
    setText(pagesToText(project, { pageIds: scope === 'current' ? [pageId] : undefined, catalog, librarySymbols: library }));
    setCheck(null); setNote('');
  };
  const copy = async (withPrompt: boolean) => {
    try { await navigator.clipboard.writeText(withPrompt ? `${PROMPT}\n\n\`\`\`\n${text}\n\`\`\`` : text); setNote(withPrompt ? tx('Copiato con le istruzioni: incollalo nella chat e scrivi la richiesta in fondo') : tx('Copiato negli appunti')); }
    catch { setNote(tx('Copia non riuscita: seleziona il testo e copialo a mano')); }
  };
  const openFile = async () => {
    const [f] = await openFiles([{ name: 'Testo OpenWiring', extensions: ['txt', 'ectxt', 'md'] }]);
    if (f) { setText(new TextDecoder().decode(f.data)); setCheck(null); }
  };
  // Il testo incollato dalla chat può arrivare dentro un blocco di codice ```
  const clean = () => { const m = /```[a-z]*\n([\s\S]*?)```/.exec(text); return m ? m[1] : text; };
  const verify = () => {
    const trial = structuredClone(project);
    const r = importPagesText(trial, clean());
    const touched = new Set(trial.pages.filter(p => [...r.replaced, ...r.added].includes(p.name)).map(p => p.id));
    const problems = r.errors.length ? 0 : checkProject(trial).filter(i => i.pageId && touched.has(i.pageId)).length;
    setCheck({ r, problems });
  };
  const apply = () => {
    const r = st().importText(clean());
    if (r.errors.length) { setCheck({ r, problems: 0 }); return; }
    close();
    st().setReportTab('checks');
  };
  const r = check?.r;
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal wide" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Testo per assistenti IA')}>
        <h3>{tx('Pagine in formato testo (per assistenti IA)')}</h3>
        <p className="muted small">
          {tx('Esporta le pagine, copia il testo con le istruzioni nella chat di un assistente (Claude, ChatGPT…) insieme alla richiesta, poi incolla qui la risposta, controllala e applicala. Le pagine con lo stesso numero vengono sostituite; «Annulla» torna indietro.')}
        </p>
        <div className="panel-row">
          <label><input type="radio" checked={scope === 'current'} onChange={() => setScope('current')} /> {tx('pagina corrente')}</label>
          <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> {tx('tutte le pagine')}</label>
          <label><input type="checkbox" checked={catalog} onChange={e => setCatalog(e.target.checked)} /> {tx('catalogo dei simboli')}</label>
          <button onClick={generate}>{tx('Esporta in testo')}</button>
          <button onClick={() => void openFile()}>{tx('Apri file…')}</button>
        </div>
        <textarea className="text-io" value={text} spellCheck={false} onChange={e => { setText(e.target.value); setCheck(null); }}
          placeholder={tx('Premi «Esporta in testo», oppure incolla qui le pagine scritte o modificate dall\'assistente.\n\nEsempio:\npagina 7 "Ventilazione quadro"\n  simbolo pb_no -? @100,60 descr="Marcia ventilatore"\n  simbolo coil -7K1 @140,140\n  collega -7S1:14 -7K1:A1')} />
        <div className="panel-row">
          <button disabled={!text} onClick={() => void copy(true)} title={tx('Testo in un blocco di codice preceduto dalle istruzioni per l\'assistente')}>{tx('Copia con istruzioni per l\'IA')}</button>
          <button disabled={!text} onClick={() => void copy(false)}>{tx('Copia')}</button>
          <button disabled={!text} onClick={() => void saveFile(`${safeName(project.info.name)}_pagine.txt`, text, [{ name: 'Testo', extensions: ['txt'] }])}>{tx('Salva .txt')}</button>
          <button onClick={() => void saveFile('OpenWiring_guida_agenti_IA.md', agentGuide(project, library), [{ name: 'Markdown', extensions: ['md'] }])}
            title={tx('Guida completa (sintassi, regole, convenzioni, catalogo dei simboli, conversione da PDF) da dare a un agente di intelligenza artificiale')}>{tx('Guida per agenti (.md)')}</button>
          <span className="muted small">{note}</span>
        </div>
        {r && (
          <div className="text-check">
            {r.errors.length
              ? <p className="issue-error">{r.errors.length} {tx('errori: il testo non si può applicare')}</p>
              : <p>{tx('Pronto:')} {[r.replaced.length && `sostituisce le pagine ${r.replaced.join(', ')}`, r.added.length && `aggiunge le pagine ${r.added.join(', ')}`].filter(Boolean).join(', ')} ({r.elements} {tx('elementi). Verifica dopo l\'applicazione:')} {check!.problems ? tx('{0} problemi su queste pagine (scheda Controlli)', check!.problems) : tx('nessun problema')}.</p>}
            <ul>
              {r.errors.map((e, i) => <li key={`e${i}`} className="issue-error">{e.line ? tx('riga {0}: ', e.line) : ''}{e.msg}</li>)}
              {r.warnings.map((e, i) => <li key={`w${i}`} className="issue-warn">{e.line ? tx('riga {0}: ', e.line) : ''}{e.msg}</li>)}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={close}>{tx('Chiudi')}</button>
          <button disabled={!text} onClick={verify}>{tx('Controlla')}</button>
          <button className="primary" disabled={!text || !!r?.errors.length} onClick={apply}>{tx('Applica al progetto')}</button>
        </div>
      </div>
    </div>
  );
}
