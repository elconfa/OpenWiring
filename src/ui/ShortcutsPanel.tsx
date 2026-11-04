// Impostazioni ▸ Programma ▸ Scorciatoie da tastiera: tasti di ogni comando da cambiare (si preme la
// combinazione), togliere o rimettere di serie, e l'elenco da stampare.
import { useEffect, useState } from 'react';
import { COMMANDS, comboOf, commandFor, keysOf, setUserKeys, showCombo, userKeys, onKeysChange } from './shortcuts';
import { askChoice } from './Ask';
import { tx } from '../i18n/ui';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Elenco delle scorciatoie in una pagina da stampare */
function printShortcuts() {
  const groups = [...new Set(COMMANDS.map(c => c.group))];
  const rows = groups.map(g => `<tr><th colspan="2">${esc(tx(g))}</th></tr>` + COMMANDS.filter(c => c.group === g)
    .map(c => `<tr><td>${esc(tx(c.name))}</td><td>${esc(keysOf(c.id).map(showCombo).join(', ') || '—')}</td></tr>`).join('')).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tx('Scorciatoie da tastiera'))}</title><style>
body{font:11pt Helvetica,Arial,sans-serif;margin:15mm}h1{font-size:15pt}table{border-collapse:collapse;width:100%}
th{text-align:left;padding:8px 4px 2px;border-bottom:1px solid #888}td{padding:3px 4px;border-bottom:1px solid #ddd}td+td{font-family:monospace;white-space:nowrap}
</style></head><body><h1>OpenWiring — ${esc(tx('Scorciatoie da tastiera'))}</h1><table>${rows}</table></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 1000); }, 200);
}

export function ShortcutsPanel() {
  const [, setTick] = useState(0);
  useEffect(() => onKeysChange(() => setTick(t => t + 1)), []);
  const [recording, setRecording] = useState<string | null>(null);
  const set = (id: string, keys: string[]) => {
    const map = { ...userKeys() };
    const def = COMMANDS.find(c => c.id === id)!.keys;
    if (JSON.stringify(keys) === JSON.stringify(def)) delete map[id]; else map[id] = keys;
    setUserKeys(map);
  };
  // Registrazione: la prossima combinazione premuta va al comando (Esc annulla)
  useEffect(() => {
    if (!recording) return;
    const onKey = async (ev: KeyboardEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.key === 'Escape') { setRecording(null); return; }
      const combo = comboOf(ev);
      if (!combo) return;
      const id = recording;
      setRecording(null);
      const other = commandFor(combo);
      if (other && other.id !== id) {
        const r = await askChoice(tx('Tasto già usato'), tx('{0} è già il tasto di «{1}». Spostarlo su «{2}»?', showCombo(combo), tx(other.name), tx(COMMANDS.find(c => c.id === id)!.name)), [tx('Sposta'), tx('Annulla')]);
        if (r !== 0) return;
        set(other.id, keysOf(other.id).filter(k => k !== combo));
      }
      if (!keysOf(id).includes(combo)) set(id, [...keysOf(id), combo]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);
  const groups = [...new Set(COMMANDS.map(c => c.group))];
  const changed = Object.keys(userKeys()).length > 0;
  return (
    <div className="shortcuts">
      <p className="small muted">{tx('Clic su + e premi la combinazione da usare (Esc annulla). Valgono per tutti i progetti, in questo computer. Esc, Invio e le frecce restano fissi.')}</p>
      <table className="grid shortcuts-table">
        <tbody>
          {groups.map(g => [
            <tr key={g} className="shortcuts-group"><th colSpan={3}>{tx(g)}</th></tr>,
            ...COMMANDS.filter(c => c.group === g).map(c => {
              const keys = keysOf(c.id);
              const custom = userKeys()[c.id] !== undefined;
              return (
                <tr key={c.id}>
                  <td>{tx(c.name)}</td>
                  <td>
                    {keys.map(k => (
                      <span key={k} className="key-chip">{showCombo(k)}
                        <button type="button" title={tx('Togli questo tasto')} onClick={() => set(c.id, keys.filter(x => x !== k))}>✕</button>
                      </span>
                    ))}
                    {recording === c.id
                      ? <span className="key-chip recording">{tx('Premi i tasti…')}</span>
                      : <button type="button" className="key-add" title={tx('Aggiungi un tasto')} onClick={() => setRecording(c.id)}>+</button>}
                  </td>
                  <td className="nowrap">{custom && <button type="button" title={tx('Rimetti i tasti di serie')} onClick={() => set(c.id, c.keys)}>↺</button>}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <div className="profile-actions">
        <button onClick={printShortcuts}>{tx('Stampa l\'elenco…')}</button>
        <button disabled={!changed} onClick={async () => {
          if (await askChoice(tx('Scorciatoie da tastiera'), tx('Rimettere tutti i tasti di serie?'), [tx('Tasti di serie'), tx('Annulla')]) === 0) setUserKeys({});
        }}>{tx('Tutti i tasti di serie…')}</button>
      </div>
    </div>
  );
}
