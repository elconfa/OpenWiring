// Dizionario di progetto: i testi italiani del progetto con le traduzioni inglese e tedesca.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { projectTexts, translateText, dictionaryCsv, parseDictionaryCsv, TARGET_LANGS, LANGS } from '../model/i18n';
import { openFiles, saveFile, safeName } from '../io/fileio';
import { Field } from './PropertyPanel';
import { aiTranslate } from './actions';
import { tx } from '../i18n/ui';

export function TranslationsView() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const [onlyMissing, setOnlyMissing] = useState(false);
  const texts = useMemo(() => projectTexts(project, library), [project, library]);
  const dict = project.dictionary ?? {};
  const has = (text: string, l: 'en' | 'de') => !!dict[text]?.[l] || translateText(project, text, l) !== text;
  const rows = onlyMissing ? texts.filter(x => TARGET_LANGS.some(l => !has(x.text, l))) : texts;
  const missing = texts.filter(x => TARGET_LANGS.some(l => !has(x.text, l))).length;
  const lang = project.languages?.display ?? 'it';
  const importCsv = async () => {
    const [f] = await openFiles([{ name: 'Dizionario CSV', extensions: ['csv', 'txt'] }]);
    if (f) st().mergeDictionary(parseDictionaryCsv(new TextDecoder().decode(f.data)));
  };
  return (
    <>
      <div className="parts-toolbar">
        <span className="muted small">
          {texts.length} {tx('testi ·')} {missing ? tx('{0} da tradurre', missing) : tx('tutti tradotti')} {tx('· schemi e PDF in')} {LANGS.find(l => l.id === lang)?.name}
          {project.languages?.second ? ` + ${LANGS.find(l => l.id === project.languages!.second)?.name}` : ''}
        </span>
        <label className="small"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> {tx('solo da tradurre')}</label>
        <div className="tb-spacer" />
        <label className="small">{tx('Lingua degli schemi:')}{' '}
          <select value={lang} onChange={e => st().setLanguages({ display: e.target.value as typeof lang })}>
            {LANGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="small">{tx('Seconda:')}{' '}
          <select value={project.languages?.second ?? ''} onChange={e => st().setLanguages({ second: (e.target.value || undefined) as typeof lang | undefined })}>
            <option value="">{tx('nessuna')}</option>
            {LANGS.filter(l => l.id !== lang).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button onClick={() => st().autoTranslate()} title={tx('Riempie le traduzioni mancanti con il dizionario dei termini elettrici; le proposte parola per parola sono da verificare')}>{tx('Proponi traduzioni')}</button>
        <button onClick={() => void aiTranslate()} title={tx('Traduce i testi mancanti con l\'assistente IA attivo (Claude, ChatGPT o Gemini); le traduzioni restano da verificare')}>{tx('Traduci con IA')}</button>
        <button onClick={() => void saveFile(`${safeName(project.info.name)}_dizionario.csv`, dictionaryCsv(project, library), [{ name: 'CSV', extensions: ['csv'] }])}
          title={tx('Tabella Italiano;English;Deutsch da far completare a un traduttore')}>{tx('Esporta CSV')}</button>
        <button onClick={() => void importCsv()} title={tx('Rilegge la tabella Italiano;English;Deutsch')}>{tx('Importa CSV')}</button>
      </div>
      <div className="table-wrap">
        <table className="grid translations">
          <thead><tr><th>{tx('Italiano')}</th><th>{tx('English')}</th><th>{tx('Deutsch')}</th><th>{tx('Dove')}</th></tr></thead>
          <tbody>
            {rows.map(({ text, where }) => (
              <tr key={text}>
                <td>{text}</td>
                {TARGET_LANGS.map(l => {
                  const auto = dict[text]?.auto?.includes(l);
                  return (
                    <td key={l} className={auto ? 'tr-auto' : !has(text, l) ? 'tr-missing' : ''} title={auto ? tx('Proposta automatica: da verificare (si conferma con ✓ o modificandola)') : undefined}>
                      <span className="panel-row">
                        <Field value={dict[text]?.[l] ?? ''} placeholder={translateText(project, text, l) !== text ? translateText(project, text, l) : tx('da tradurre')}
                          onCommit={v => st().setTranslation(text, l, v)} />
                        {auto && <button title={tx('Conferma la traduzione')} onClick={() => st().setTranslation(text, l, dict[text]![l]!)}>✓</button>}
                      </span>
                    </td>
                  );
                })}
                <td className="muted small">{where.slice(0, 3).join(', ')}{where.length > 3 ? ` … (+${where.length - 3})` : ''}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted pad">{texts.length ? tx('Tutti i testi sono tradotti.') : tx('Nessun testo nel progetto.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
