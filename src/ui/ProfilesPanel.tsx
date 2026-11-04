// Impostazioni ▸ Profili: profili di impostazioni della libreria personale da
// salvare, applicare (vedendo prima cosa cambia), aggiornare, rinominare, eliminare, scegliere per i
// progetti nuovi, esportare e importare come file .ecadprofile; anche le impostazioni del progetto
// aperto si esportano e si importano nello stesso formato.
import { useState } from 'react';
import { useStore } from '../model/store';
import { SETTINGS_PARTS, applicableParts, makeLock, makeProfile, parseProfile, profileChanges, serializeProfile, unlockOk, type SettingsProfile } from '../model/settingsProfiles';
import { openFiles, saveFile, safeName } from '../io/fileio';
import { ask, askChoice, askText } from './Ask';
import { tx } from '../i18n/ui';

const FILTER = [{ name: 'Profilo di impostazioni OpenWiring', extensions: ['ecadprofile'] }];
const ALL = SETTINGS_PARTS.map(p => p.id);
const partName = (id: string) => tx(SETTINGS_PARTS.find(p => p.id === id)?.name ?? id);

/** Operazione in corso: salvataggio di un profilo nuovo, aggiornamento o applicazione di uno esistente */
type Mode =
  | { kind: 'save'; parts: string[]; name: string; description: string; lock: boolean; password: string }
  | { kind: 'refresh'; profile: SettingsProfile; parts: string[] }
  | { kind: 'apply'; profile: SettingsProfile; parts: string[]; fromFile?: boolean; keep?: boolean };

async function exportProfile(p: SettingsProfile) {
  const path = await saveFile(`${safeName(p.name)}.ecadprofile`, serializeProfile(p), FILTER);
  if (path) useStore.getState().logMsg(tx('Profilo "{0}" esportato in {1}', p.name, path));
}

async function readProfileFile(): Promise<SettingsProfile | undefined> {
  const [f] = await openFiles(FILTER);
  if (!f) return undefined;
  const p = parseProfile(new TextDecoder().decode(f.data));
  if (!p) await askChoice(tx('Importa profilo'), tx('Il file {0} non è un profilo di impostazioni di OpenWiring.', f.name), [tx('OK')]);
  return p;
}

function PartChecks({ parts, allowed, onChange }: { parts: string[]; allowed: string[]; onChange: (p: string[]) => void }) {
  return (
    <div className="profile-parts">
      {allowed.map(id => (
        <label key={id} className="inline">
          <input type="checkbox" checked={parts.includes(id)} onChange={e => onChange(e.target.checked ? [...parts, id] : parts.filter(x => x !== id))} />
          {partName(id)}
        </label>
      ))}
      <span className="profile-parts-all">
        <button type="button" onClick={() => onChange([...allowed])}>{tx('Tutte')}</button>{' '}
        <button type="button" onClick={() => onChange([])}>{tx('Nessuna')}</button>
      </span>
    </div>
  );
}

/** Pannello dell'operazione in corso */
function ModePanel({ mode, setMode }: { mode: Mode; setMode: (m: Mode | null) => void }) {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  if (mode.kind === 'save') {
    const ok = mode.name.trim() && mode.parts.length;
    return (
      <div className="profile-mode">
        <h4>{tx('Salva le impostazioni del progetto come profilo')}</h4>
        <label className="profile-field">{tx('Nome')} <input value={mode.name} autoFocus onChange={e => setMode({ ...mode, name: e.target.value })} placeholder={tx('es. Standard aziendale')} /></label>
        <label className="profile-field">{tx('Descrizione')} <input value={mode.description} onChange={e => setMode({ ...mode, description: e.target.value })} placeholder={tx('facoltativa')} /></label>
        <p className="small muted">{tx('Parti delle impostazioni da mettere nel profilo:')}</p>
        <PartChecks parts={mode.parts} allowed={ALL} onChange={parts => setMode({ ...mode, parts })} />
        <label className="inline"><input type="checkbox" checked={mode.lock} onChange={e => setMode({ ...mode, lock: e.target.checked })} />{tx('Blocca queste parti nei progetti a cui si applica (profilo aziendale)')}</label>
        {mode.lock && <>
          <label className="profile-field">{tx('Password di sblocco')} <input type="password" value={mode.password} onChange={e => setMode({ ...mode, password: e.target.value })} placeholder={tx('facoltativa')} autoComplete="new-password" /></label>
          <p className="small muted">{tx('Nei progetti le parti bloccate si vedono ma non si cambiano; si sbloccano in Impostazioni ▸ Profili, con la password se c\'è. È un blocco organizzativo, non una protezione del file.')}</p>
        </>}
        {st().profiles.some(p => p.name === mode.name.trim()) && <p className="small warn-text">{tx('Esiste già un profilo con questo nome: verrà sostituito.')}</p>}
        <div className="modal-actions">
          <button onClick={() => setMode(null)}>{tx('Annulla')}</button>
          <button className="primary" disabled={!ok} onClick={async () => {
            st().saveProfile(mode.name.trim(), mode.parts, mode.description.trim() || undefined, mode.lock ? await makeLock(mode.password) : undefined);
            setMode(null);
          }}>{tx('Salva il profilo')}</button>
        </div>
      </div>
    );
  }
  if (mode.kind === 'refresh') {
    return (
      <div className="profile-mode">
        <h4>{tx('Aggiorna il profilo «{0}» dalle impostazioni del progetto', mode.profile.name)}</h4>
        <p className="small muted">{tx('Le parti scelte prendono i valori attuali del progetto; le altre escono dal profilo.')}</p>
        <PartChecks parts={mode.parts} allowed={ALL} onChange={parts => setMode({ ...mode, parts })} />
        <div className="modal-actions">
          <button onClick={() => setMode(null)}>{tx('Annulla')}</button>
          <button className="primary" disabled={!mode.parts.length} onClick={() => { st().refreshProfile(mode.profile.id, mode.parts); setMode(null); }}>{tx('Aggiorna il profilo')}</button>
        </div>
      </div>
    );
  }
  const usable = applicableParts(project, mode.profile, mode.parts);
  const blocked = mode.parts.filter(id => !usable.includes(id));
  const changes = profileChanges(project, mode.profile, usable);
  // Un profilo aziendale si applica anche senza differenze, per mettere il blocco
  const willLock = !!mode.profile.lock && project.settings.locks?.profile !== mode.profile.name;
  return (
    <div className="profile-mode">
      <h4>{mode.fromFile ? tx('Importa le impostazioni «{0}» nel progetto', mode.profile.name) : tx('Applica il profilo «{0}»', mode.profile.name)}</h4>
      {mode.profile.description && <p className="small">{mode.profile.description}</p>}
      <p className="small muted">{tx('Parti da applicare:')}</p>
      <PartChecks parts={mode.parts} allowed={mode.profile.parts} onChange={parts => setMode({ ...mode, parts })} />
      {blocked.length > 0 && <p className="small warn-text">🔒 {tx('Bloccate dal profilo «{0}», non si applicano: {1}', project.settings.locks?.profile ?? '', blocked.map(partName).join(', '))}</p>}
      {mode.profile.lock && <p className="small muted">🔒 {tx('Profilo aziendale: dopo l\'applicazione le sue parti restano bloccate nel progetto.')}</p>}
      {changes.length ? (
        <table className="grid profile-changes">
          <thead><tr><th>{tx('Parte')}</th><th>{tx('Impostazione')}</th><th>{tx('Ora')}</th><th>{tx('Con il profilo')}</th></tr></thead>
          <tbody>{changes.map((c, i) => <tr key={i}><td>{partName(c.part)}</td><td>{tx(c.what)}</td><td>{tx(c.from)}</td><td><b>{tx(c.to)}</b></td></tr>)}</tbody>
        </table>
      ) : <p className="small muted">{willLock ? tx('Il progetto ha già queste impostazioni: si aggiunge solo il blocco.') : tx('Il progetto ha già queste impostazioni: non cambia niente.')}</p>}
      {mode.fromFile && (
        <label className="inline"><input type="checkbox" checked={!!mode.keep} onChange={e => setMode({ ...mode, keep: e.target.checked })} />{tx('Aggiungi anche ai profili della libreria personale')}</label>
      )}
      <div className="modal-actions">
        <button onClick={() => setMode(null)}>{tx('Annulla')}</button>
        <button className="primary" disabled={!changes.length && !mode.keep && !willLock} onClick={() => {
          if (changes.length || willLock) st().applyProfile(mode.profile, mode.parts);
          if (mode.keep) st().addProfile(mode.profile);
          setMode(null);
        }}>{changes.length ? tx('Applica ({0} modifiche)', changes.length) : willLock ? tx('Applica e blocca') : mode.keep ? tx('Aggiungi') : tx('Applica')}</button>
      </div>
    </div>
  );
}

export function ProfilesPanel() {
  const profiles = useStore(s => s.profiles);
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const [mode, setMode] = useState<Mode | null>(null);
  const rename = async (p: SettingsProfile) => {
    const name = (await askText(tx('Nome del profilo'), p.name))?.trim();
    if (name && name !== p.name) st().updateProfile(p.id, { name });
  };
  const remove = async (p: SettingsProfile) => {
    if (await askChoice(tx('Elimina profilo'), tx('Eliminare il profilo «{0}»? I progetti che l\'hanno usato non cambiano.', p.name), [tx('Elimina'), tx('Annulla')]) === 0) st().deleteProfile(p.id);
  };
  const unlock = async () => {
    const lock = project.settings.locks;
    if (!lock) return;
    if (lock.pass) {
      const r = await ask(tx('Sblocca le impostazioni'), [{ label: tx('Password del profilo «{0}»', lock.profile), password: true }]);
      if (!r) return;
      if (!(await unlockOk(lock, r[0]))) { await askChoice(tx('Sblocca le impostazioni'), tx('Password sbagliata.'), [tx('OK')]); return; }
    } else if (await askChoice(tx('Sblocca le impostazioni'), tx('Sbloccare le impostazioni messe dal profilo «{0}»?', lock.profile), [tx('Sblocca'), tx('Annulla')]) !== 0) return;
    st().unlockSettings();
  };
  if (mode) return <ModePanel mode={mode} setMode={setMode} />;
  return (
    <div className="profiles">
      <p className="small muted">{tx('Un profilo contiene una parte delle impostazioni (per esempio numerazione, testi e aspetto) con un nome. Si applica a un progetto con un clic, vedendo prima cosa cambia; il profilo con ★ vale per i progetti nuovi. I file .ecadprofile si scambiano tra colleghi e computer.')}</p>
      {profiles.length ? (
        <table className="grid profiles-table">
          <thead><tr><th title={tx('Profilo per i progetti nuovi')}>★</th><th>{tx('Profilo')}</th><th>{tx('Parti')}</th><th>{tx('Data')}</th><th /></tr></thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td>
                  <button type="button" className={`profile-star${p.isDefault ? ' on' : ''}`} aria-pressed={!!p.isDefault}
                    title={p.isDefault ? tx('Profilo dei progetti nuovi: clic per toglierlo') : tx('Usa questo profilo per i progetti nuovi')}
                    onClick={() => st().setDefaultProfile(p.isDefault ? undefined : p.id)}>{p.isDefault ? '★' : '☆'}</button>
                </td>
                <td><b>{p.name}</b>{p.lock && <span title={tx('Profilo aziendale: blocca le sue parti nei progetti')}> 🔒</span>}{p.description && <div className="small muted">{p.description}</div>}</td>
                <td className="small">{p.parts.map(partName).join(', ')}</td>
                <td className="small nowrap">{p.date}</td>
                <td className="nowrap">
                  <button className="primary" onClick={() => setMode({ kind: 'apply', profile: p, parts: [...p.parts] })}>{tx('Applica…')}</button>{' '}
                  <button onClick={() => setMode({ kind: 'refresh', profile: p, parts: [...p.parts] })} title={tx('Rilegge il profilo dalle impostazioni del progetto aperto')}>{tx('Aggiorna…')}</button>{' '}
                  <button onClick={() => void rename(p)}>{tx('Rinomina…')}</button>{' '}
                  <button onClick={() => void exportProfile(p)}>{tx('Esporta…')}</button>{' '}
                  <button onClick={() => void remove(p)} title={tx('Elimina il profilo')}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="small">{tx('Nessun profilo salvato.')}</p>}
      <div className="profile-actions">
        <button className="primary" onClick={() => setMode({ kind: 'save', parts: ALL.filter(x => x !== 'titleBlock'), name: '', description: '', lock: false, password: '' })}>{tx('Salva le impostazioni come profilo…')}</button>
        <button onClick={async () => { const p = await readProfileFile(); if (p) st().addProfile(p); }}>{tx('Importa profilo…')}</button>
      </div>
      <h4>{tx('Impostazioni di questo progetto')}</h4>
      {project.settings.locks && (
        <div className="pdf-check warn">
          <b>🔒 {tx('Bloccate dal profilo «{0}»', project.settings.locks.profile)}</b>
          <span className="small">{project.settings.locks.parts.map(partName).join(', ')}</span>
          <button onClick={() => void unlock()}>{tx('Sblocca…')}</button>
        </div>
      )}
      <div className="profile-actions">
        <button onClick={() => void exportProfile(makeProfile(project, project.info.name || tx('Impostazioni'), ALL))}
          title={tx('Tutte le impostazioni del progetto in un file .ecadprofile')}>{tx('Esporta le impostazioni del progetto…')}</button>
        <button onClick={async () => { const p = await readProfileFile(); if (p) setMode({ kind: 'apply', profile: p, parts: [...p.parts], fromFile: true }); }}
          title={tx('Legge un file .ecadprofile e mostra cosa cambia prima di applicarlo')}>{tx('Importa impostazioni nel progetto…')}</button>
      </div>
    </div>
  );
}
