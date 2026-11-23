// Tensioni utilizzate nello schema elettrico: righe della tabella (potenziale, tensione, descrizione,
// colore e tipo di linea del campione). Finché non si scrive niente le righe vengono dai potenziali dello
// schema; alla prima modifica diventano del progetto. «Ricava dallo schema» aggiunge i potenziali mancanti.
import { useEffect, useMemo, useState } from 'react';
import { DialogShell, useDialogOpen } from './DialogShell';
import { useStore } from '../model/store';
import { autoVoltageRows, voltageRows } from '../model/voltages';
import { WIRE_COLORS, type VoltageRow, type WireLineType } from '../model/types';
import { tx } from '../i18n/ui';

function Cell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="cell-input" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

const LINES: [WireLineType, string][] = [['solid', 'continua'], ['dash', 'tratteggiata'], ['dashdot', 'linea-punto'], ['dot', 'a punti']];

export function VoltagesDialog() {
  const open = useDialogOpen('voltages');
  const project = useStore(s => s.project);
  const rows = useMemo(() => (open ? voltageRows(project) : []), [open, project]);
  if (!open) return null;
  const st = useStore.getState;
  const close = () => st().setDialog(null);
  const own = !!project.voltages;
  const save = (next: VoltageRow[]) => st().setVoltages(next);
  const upd = (i: number, patch: Partial<VoltageRow>) => save(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => { const n = [...rows]; const [r] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + d)), 0, r); save(n); };
  const addMissing = () => {
    const have = new Set(rows.map(r => r.name));
    save([...rows, ...autoVoltageRows(project).filter(r => !have.has(r.name))]);
  };
  return (
    <DialogShell className="wide" label={tx('Tensioni utilizzate')} onClose={close}>
      <h3>{tx('Tensioni utilizzate nello schema elettrico')}</h3>
      <p className="muted small">
        {own ? tx('Righe del progetto: si vedono nei blocchi «Tabella tensioni» posati sulle pagine (Inserisci ▸ Tabella tensioni).')
          : tx('Righe ricavate dai potenziali dello schema, con colore e linea dei loro fili: alla prima modifica diventano del progetto.')}
      </p>
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        <table className="grid">
          <thead><tr>
            <th>{tx('Potenziale')}</th><th>{tx('Tensione')}</th><th>{tx('Descrizione')}</th><th>{tx('Colore')}</th><th>{tx('Linea')}</th><th />
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><Cell value={r.name} placeholder="L+" onCommit={v => upd(i, { name: v.trim() })} /></td>
                <td><Cell value={r.voltage ?? ''} placeholder="24V DC" onCommit={v => upd(i, { voltage: v.trim() || undefined })} /></td>
                <td><Cell value={r.description ?? ''} placeholder={tx('DC, positivo')} onCommit={v => upd(i, { description: v.trim() || undefined })} /></td>
                <td>
                  <select value={r.color?.toUpperCase() ?? ''} onChange={e => upd(i, { color: e.target.value || undefined })}>
                    <option value="">{tx('nero')}</option>
                    {Object.entries(WIRE_COLORS).map(([k, c]) => <option key={k} value={k}>{k} · {tx(c.name)}</option>)}
                  </select>
                </td>
                <td>
                  <select value={r.line ?? 'solid'} onChange={e => upd(i, { line: e.target.value === 'solid' ? undefined : e.target.value as WireLineType })}>
                    {LINES.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}
                  </select>
                </td>
                <td className="nowrap">
                  <button className="mini" disabled={i === 0} onClick={() => move(i, -1)} title={tx('Sposta su')}>↑</button>
                  <button className="mini" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title={tx('Sposta giù')}>↓</button>
                  <button className="mini" onClick={() => save(rows.filter((_, k) => k !== i))} title={tx('Togli la riga')}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-actions">
        <button onClick={() => save([...rows, { name: '' }])}>{tx('+ Riga')}</button>
        <button onClick={addMissing} title={tx('Aggiunge i potenziali dello schema che non sono ancora nella tabella')}>{tx('Ricava dallo schema')}</button>
        {own && <button onClick={() => st().setVoltages(undefined)} title={tx('Torna alle righe ricavate dai potenziali dello schema')}>{tx('Ricomincia dallo schema')}</button>}
        <span className="tb-spacer" />
        <button className="primary" onClick={close}>{tx('Chiudi')}</button>
      </div>
    </DialogShell>
  );
}
