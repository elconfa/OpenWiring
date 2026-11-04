// Schermata iniziale: continua con il progetto ripreso dall'ultima sessione, nuovo progetto (anche da un
// modello), apri, progetti recenti, esempio, profilo per i progetti nuovi. Compare all'avvio (si può
// spegnere) e da File ▸ Schermata iniziale.
import { useState } from 'react';
import { useStore } from '../model/store';
import * as A from './actions';
import { recentProjects, removeRecent, startScreenOn, setStartScreenOn } from './appPrefs';
import { isElectron } from '../io/fileio';
import { openSettingsAt } from './SettingsDialog';
import { tx } from '../i18n/ui';
import { downloadUpdate, foundUpdate, onUpdate } from './updates';
import { useEffect } from 'react';

declare const __APP_VERSION__: string | undefined;

export function StartScreen() {
  const open = useStore(s => s.dialog === 'start');
  const [show, setShow] = useState(startScreenOn);
  if (!open) return null;
  const close = () => useStore.getState().setDialog(null);
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal wide start-screen" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Schermata iniziale')}>
        <h3>OpenWiring {version}</h3>
        <StartBody close={close} />
        <div className="modal-actions">
          <label className="inline start-show"><input type="checkbox" checked={show} onChange={e => { setShow(e.target.checked); setStartScreenOn(e.target.checked); }} />{tx('Mostra all\'avvio')}</label>
          <button onClick={close}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}

/** Contenuto della schermata iniziale: anche nella pagina File della barra multifunzione */
export function StartBody({ close }: { close: () => void }) {
  const project = useStore(s => s.project);
  const dirty = useStore(s => s.dirty);
  const filePath = useStore(s => s.filePath);
  const templates = useStore(s => s.templates);
  const profiles = useStore(s => s.profiles);
  // L'elenco si rilegge a ogni apertura (cambia aprendo e salvando)
  const [, setTick] = useState(0);
  const recent = recentProjects();
  const setRecent = (_: unknown) => setTick(t => t + 1);
  useEffect(() => onUpdate(() => setTick(t => t + 1)), []);
  const update = foundUpdate();
  // Le azioni che aprono un dialogo del sistema chiudono prima la schermata
  const go = (f: () => unknown) => () => { close(); void f(); };
  const def = profiles.find(p => p.isDefault);
  return (
    <>
      {update && (
        <div className="pdf-check warn">
          <b>{tx('È disponibile la versione {0}', update.version)}</b>
          <span className="small">{tx('Scarica lo zip, chiudi il programma e sostituisci la cartella: progetti, articoli e impostazioni restano.')}</span>
          <button onClick={() => downloadUpdate(update)}>{tx('Scarica')}</button>
        </div>
      )}
      <div className="start-grid">
        <section>
          <h4>{tx('Inizia')}</h4>
          <button className="primary start-continue" onClick={close} autoFocus>
            {tx('Continua con «{0}»', project.info.name || tx('progetto senza nome'))}
            <span className="small">{dirty ? tx('con modifiche non salvate') : filePath ?? tx('non ancora salvato in un file')}</span>
          </button>
          <button onClick={go(A.newProject)}>{tx('Nuovo progetto')}{def && <span className="small muted"> · {tx('profilo «{0}»', def.name)}</span>}</button>
          <button onClick={go(A.openProject)}>{tx('Apri un progetto…')}</button>
          <button onClick={go(A.loadExample)}>{tx('Progetto di esempio')}</button>
          {templates.length > 0 && <>
            <h4>{tx('Nuovo da un modello')}</h4>
            {templates.map(t => <button key={t.id} onClick={go(() => A.newFromTemplate(t.id))}>{t.name}</button>)}
          </>}
          <h4>{tx('Profili di impostazioni')}</h4>
          <p className="small muted">{def ? tx('I progetti nuovi usano il profilo «{0}».', def.name) : profiles.length ? tx('Nessun profilo scelto per i progetti nuovi.') : tx('Nessun profilo salvato.')}</p>
          <button onClick={() => openSettingsAt('profiles')}>{tx('Profili…')}</button>
        </section>
        <section>
          <h4>{tx('Progetti recenti')}</h4>
          {!isElectron() ? <p className="small muted">{tx('I progetti recenti sono nell\'app installata: nel browser i file si aprono dal dialogo.')}</p>
            : recent.length ? (
              <ul className="start-recent">
                {recent.map(r => (
                  <li key={r.path}>
                    <button className="start-recent-open" title={r.path} onClick={async () => { if (await A.openRecent(r.path)) close(); else setRecent(recentProjects()); }}>
                      <b>{r.name}</b><span className="small muted">{r.path}</span>
                    </button>
                    <span className="small muted nowrap">{new Date(r.time).toLocaleDateString()}</span>
                    <button title={tx('Togli dall\'elenco (il file resta)')} onClick={() => { removeRecent(r.path); setRecent(recentProjects()); }}>✕</button>
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">{tx('Nessun progetto recente: compaiono qui quelli aperti e salvati.')}</p>}
        </section>
      </div>
    </>
  );
}
