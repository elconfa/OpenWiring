// Progetto ▸ Proprietà definite dall'utente: definizioni come in EPLAN («Configura proprietà»), con
// import ed export XML. I campi da compilare sono nelle Proprietà degli oggetti (UserPropRows).
import { DialogShell, useDialogOpen } from './DialogShell';
import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import type { UserPropAssign, UserPropDef } from '../model/types';
import { USER_PROP_ASSIGN, USER_PROP_TYPES, userPropIdError, parseUserPropsXml, userPropsToXml, mergeDefs } from '../model/userProps';
import { openFiles, saveFile, safeName } from '../io/fileio';
import { askText } from './Ask';
import { tx, uiLang } from '../i18n/ui';

function Cell({ value, onCommit, placeholder, title }: { value: string; onCommit: (v: string) => void; placeholder?: string; title?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input value={v} placeholder={placeholder} title={title} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />;
}

export function UserPropsDialog() {
  const open = useDialogOpen('userProps');
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const [note, setNote] = useState('');
  if (!open) return null;
  const defs = project.userProps ?? [];
  const set = (next: UserPropDef[]) => st().setUserPropDefs(next);
  const upd = (i: number, patch: Partial<UserPropDef>) => set(defs.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const add = async () => {
    const id = (await askText(tx('Nome identificativo della proprietà (es. Ditta.Commessa):'), 'Ditta.'))?.trim();
    if (!id) return;
    const err = userPropIdError(id);
    if (err) { setNote(tx(err)); return; }
    if (defs.some(d => d.id === id)) { setNote(tx('La proprietà {0} esiste già', id)); return; }
    set([...defs, { id, name: id.split('.').pop()!, assign: 'function', type: 'text' }]);
    setNote('');
  };
  const importXml = async () => {
    const [f] = await openFiles([{ name: 'XML', extensions: ['xml'] }]);
    if (!f) return;
    const r = parseUserPropsXml(new TextDecoder().decode(f.data), uiLang());
    if (r.error) { setNote(tx(r.error)); return; }
    if (!r.defs.length) { setNote(tx('Nessuna proprietà trovata in {0}', f.name)); return; }
    const m = mergeDefs(defs, r.defs);
    set(m.defs);
    const msg = tx('{0}: {1} proprietà nuove, {2} aggiornate{3}', f.name, m.added, m.updated, r.skipped ? tx(', {0} scartate (nome identificativo non valido)', r.skipped) : '');
    setNote(msg);
    st().logMsg(msg);
  };
  const exportXml = async () => {
    const xml = userPropsToXml(defs, uiLang());
    const p = await saveFile(`${safeName(project.info.name)}_proprieta_utente.xml`, new TextEncoder().encode(xml), [{ name: 'XML', extensions: ['xml'] }]);
    if (p) setNote(tx('Esportate {0} proprietà in {1}', defs.filter(d => !d.obsolete).length, p));
  };
  return (
    <DialogShell className="wide user-props" label={tx('Proprietà definite dall\'utente')} onClose={() => st().setDialog(null)}>
        <h3>{tx('Proprietà definite dall\'utente')}</h3>
        <p className="small muted">{tx('Ogni proprietà ha un nome identificativo con almeno un punto (es. Ditta.Commessa) e vale per dispositivi, pagine, collegamenti, progetto o articoli. I valori si scrivono nelle Proprietà degli oggetti; quelle dei dispositivi anche nella scheda Dispositivi e in Excel; nei cartigli con {prop:nome}.')}</p>
        <div className="table-wrap">
          <table className="grid editable">
            <thead>
              <tr>
                <th>{tx('Nome identificativo')}</th><th>{tx('Nome visualizzato')}</th><th>{tx('Assegnazione')}</th><th>{tx('Tipo')}</th>
                <th>{tx('Unità')}</th><th>{tx('Categoria')}</th><th>{tx('Elenco di scelta (;)')}</th><th>{tx('Inserimento')}</th><th>{tx('Descrizione')}</th>
                <th title={tx('Non utilizzare più: nascosta e non esportata')}>{tx('Non usare')}</th><th />
              </tr>
            </thead>
            <tbody>
              {defs.map((d, i) => (
                <tr key={d.id} className={d.obsolete ? 'muted' : undefined}>
                  <td className="mono small">{d.id}</td>
                  <td><Cell value={d.name} onCommit={v => upd(i, { name: v.trim() || d.id })} /></td>
                  <td>
                    <select value={d.assign} onChange={e => upd(i, { assign: e.target.value as UserPropAssign })}>
                      {USER_PROP_ASSIGN.map(a => <option key={a.id} value={a.id}>{tx(a.name)}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={d.type} onChange={e => upd(i, { type: e.target.value as UserPropDef['type'] })}>
                      {USER_PROP_TYPES.map(t => <option key={t.id} value={t.id}>{tx(t.name)}</option>)}
                    </select>
                  </td>
                  <td><Cell value={d.unit ?? ''} placeholder={d.type === 'unit' ? 'es. kW' : ''} onCommit={v => upd(i, { unit: v.trim() || undefined })} /></td>
                  <td><Cell value={d.category ?? ''} onCommit={v => upd(i, { category: v.trim() || undefined })} /></td>
                  <td><Cell value={(d.choices ?? []).join('; ')} placeholder={tx('es. A; B; C')} onCommit={v => {
                    const choices = v.split(';').map(x => x.trim()).filter(Boolean);
                    upd(i, { choices: choices.length ? choices : undefined, input: choices.length ? d.input ?? 'free+list' : undefined });
                  }} /></td>
                  <td>
                    <select value={d.input ?? 'free'} disabled={!d.choices?.length} onChange={e => upd(i, { input: e.target.value === 'free' ? undefined : e.target.value as UserPropDef['input'] })}>
                      <option value="free">{tx('libero')}</option>
                      <option value="free+list">{tx('libero con elenco')}</option>
                      <option value="list">{tx('solo elenco')}</option>
                    </select>
                  </td>
                  <td><Cell value={d.description ?? ''} onCommit={v => upd(i, { description: v.trim() || undefined })} /></td>
                  <td><input type="checkbox" checked={!!d.obsolete} onChange={e => upd(i, { obsolete: e.target.checked || undefined })} /></td>
                  <td><button className="mini" title={tx('Elimina la definizione (i valori già scritti restano negli oggetti)')} onClick={() => set(defs.filter((_, k) => k !== i))}>✕</button></td>
                </tr>
              ))}
              {!defs.length && <tr><td colSpan={11} className="muted pad">{tx('Nessuna proprietà: creane una o importale dal file XML esportato da EPLAN.')}</td></tr>}
            </tbody>
          </table>
        </div>
        {note && <p className="small">{note}</p>}
        <div className="modal-actions">
          <button onClick={() => void add()}>{tx('+ Nuova proprietà…')}</button>
          <button onClick={() => void importXml()} title={tx('File XML di EPLAN (Configura proprietà ▸ Importa) o esportato da OpenWiring')}>{tx('Importa XML…')}</button>
          <button disabled={!defs.length} onClick={() => void exportXml()} title={tx('Le proprietà «non usare» restano fuori')}>{tx('Esporta XML…')}</button>
          <div className="tb-spacer" />
          <button className="primary dlg-close" onClick={() => st().setDialog(null)}>{tx('Chiudi')}</button>
        </div>
    </DialogShell>
  );
}
