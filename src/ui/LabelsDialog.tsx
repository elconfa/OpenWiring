// Export delle etichette di siglatura per M-Print PRO, GeniusPRO o Excel/CSV generico.
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import {
  makeLabels, labelRows, rowsToCsv, SET_NAMES, PROFILE_NAMES, DEFAULT_LABEL_OPTIONS, wireMarkers, wireMarkerTable,
  type LabelSet, type LabelProfile, type LabelOptions, type WireMarkOptions,
} from '../model/labels';
import { writeXlsx } from '../io/xlsx';
import { saveFile, safeName } from '../io/fileio';
import { tx } from '../i18n/ui';

const KEY = 'elettrocad.labels';
interface Prefs { profile: LabelProfile; sets: LabelSet[]; format: 'xlsx' | 'csv'; o: LabelOptions; marks?: WireMarkOptions & { panel?: string } }
const DEFAULT: Prefs = { profile: 'mprint', sets: ['terminals', 'wires'], format: 'xlsx', o: DEFAULT_LABEL_OPTIONS };

function load(): Prefs {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { ...DEFAULT, ...v, o: { ...DEFAULT_LABEL_OPTIONS, ...(v.o ?? {}) } }; } catch { return DEFAULT; }
}

export function LabelsDialog() {
  const open = useStore(s => s.dialog === 'labels');
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const [p, setP] = useState<Prefs>(load);
  const counts = useMemo(() => (open ? Object.fromEntries((Object.keys(SET_NAMES) as LabelSet[]).map(s => [s, makeLabels(project, s, p.o, library).length])) : {}) as Record<LabelSet, number>, [open, project, library, p.o]);
  const marks = useMemo(() => (open ? wireMarkers(project, p.marks) : []), [open, project, p.marks]);
  if (!open) return null;
  const o = p.o;
  const m = p.marks ?? {};
  const setM = (patch: Partial<NonNullable<Prefs['marks']>>) => setP({ ...p, marks: { ...m, ...patch } });
  const markRows = marks.filter(r => !m.panel || r.panel === m.panel);
  const exportMarks = async () => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* preferenze non salvabili */ }
    const name = `${safeName(project.info.name)}_FILI${m.panel ? `_${safeName(m.panel.replace(/\./g, '-'))}` : ''}.csv`;
    close();
    const path = await saveFile(name, rowsToCsv(wireMarkerTable(markRows, !m.panel)), [{ name: 'CSV', extensions: ['csv'] }]);
    if (path) st().logMsg(tx('Numeri filo da stampare esportati: {0} ({1} righe, {2} etichette)', path, markRows.length, markRows.reduce((a, r) => a + r.qty, 0)));
  };
  const setO = (patch: Partial<LabelOptions>) => setP({ ...p, o: { ...o, ...patch } });
  const toggle = (s: LabelSet) => setP({ ...p, sets: p.sets.includes(s) ? p.sets.filter(x => x !== s) : [...p.sets, s] });
  const close = () => st().setDialog(null);
  const go = async () => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* preferenze non salvabili */ }
    const base = `${safeName(project.info.name)}_etichette_${p.profile}`;
    const sheets = p.sets.map(s => ({ name: SET_NAMES[s], rows: labelRows(makeLabels(project, s, o, library), p.profile) }));
    close();
    if (p.format === 'xlsx') {
      const path = await saveFile(`${base}.xlsx`, writeXlsx(sheets), [{ name: 'Excel', extensions: ['xlsx'] }]);
      if (path) st().logMsg(tx('Etichette per {0} esportate: {1} ({2})', PROFILE_NAMES[p.profile], path, sheets.map(s => `${s.name} ${s.rows.length - 1}`).join(', ')));
    } else {
      // Un file CSV per tipo di etichetta
      for (const sh of sheets) {
        const path = await saveFile(`${base}_${safeName(sh.name)}.csv`, rowsToCsv(sh.rows), [{ name: 'CSV', extensions: ['csv'] }]);
        if (path) st().logMsg(tx('Etichette {0} esportate: {1} ({2})', sh.name, path, sh.rows.length - 1));
      }
    }
  };
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{tx('Etichette di siglatura')}</h3>
        <fieldset>
          <legend>{tx('Programma di stampa')}</legend>
          {(Object.keys(PROFILE_NAMES) as LabelProfile[]).map(k => (
            <label key={k}><input type="radio" checked={p.profile === k} onChange={() => setP({ ...p, profile: k })} /> {tx(PROFILE_NAMES[k])}</label>
          ))}
          <span className="muted small">{tx('Nel programma usa l\'import guidato da Excel/CSV: ogni riga è un\'etichetta, ogni colonna un campo')}{p.profile === 'mprint' ? tx(' (la colonna «Project» va nel campo PROJECT delle MultiCard)') : ''}.</span>
        </fieldset>
        <fieldset>
          <legend>{tx('Etichette')}</legend>
          {(Object.keys(SET_NAMES) as LabelSet[]).map(s => (
            <label key={s}><input type="checkbox" checked={p.sets.includes(s)} onChange={() => toggle(s)} /> {tx(SET_NAMES[s])} <span className="muted">({counts[s] ?? 0})</span></label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{tx('Opzioni')}</legend>
          <label>{tx('Morsetti')}
            <select value={o.terminalText} onChange={e => setO({ terminalText: e.target.value as LabelOptions['terminalText'] })}>
              <option value="number">{tx('solo numero (1, 2, 1A…)')}</option><option value="full">{tx('sigla completa (X1:1)')}</option>
            </select>
          </label>
          <label><input type="checkbox" checked={o.stripHeader} onChange={e => setO({ stripHeader: e.target.checked })} /> {tx('Etichetta con la sigla della morsettiera a inizio fila')}</label>
          <label><input type="checkbox" checked={o.spares} onChange={e => setO({ spares: e.target.checked })} /> {tx('Morsetti di riserva')}</label>
          <label>{tx('Fili')}
            <select value={o.wireText} onChange={e => setO({ wireText: e.target.value as LabelOptions['wireText'] })}>
              <option value="number">{tx('solo numero filo')}</option><option value="destination">{tx('numero e destinazione')}</option>
            </select>
          </label>
          <label><input type="checkbox" checked={o.bothEnds} onChange={e => setO({ bothEnds: e.target.checked })} /> {tx('Un\'etichetta per ogni estremità del filo')}</label>
          <label><input type="checkbox" checked={o.fullDesignation} onChange={e => setO({ fullDesignation: e.target.checked })} /> {tx('Dispositivi con =funzione +luogo')}</label>
          <label><input type="checkbox" checked={o.cableType} onChange={e => setO({ cableType: e.target.checked })} /> {tx('Cavi con tipo e formazione')}</label>
        </fieldset>
        <fieldset>
          <legend>{tx('Numeri filo da stampare (Testo; Quantità; Sezione; Fogli)')}</legend>
          <span className="muted small">{tx('Un\'etichetta per ogni capo di filo su un simbolo o un morsetto, contate per quadro: un file CSV da stampare a parte.')}</span>
          <label>{tx('Quadro')}
            <select value={m.panel ?? ''} onChange={e => setM({ panel: e.target.value || undefined })}>
              <option value="">{tx('tutti (colonna Quadro)')}</option>
              {[...new Set(marks.map(r => r.panel))].filter(Boolean).map(x => <option key={x} value={x}>+{x}</option>)}
            </select>
          </label>
          <label>{tx('Quadro di ogni capo')}
            <select value={m.by ?? 'sheet'} onChange={e => setM({ by: e.target.value as WireMarkOptions['by'] })}>
              <option value="sheet">{tx('del foglio dove è disegnato')}</option>
              <option value="device">{tx('del dispositivo (+luogo)')}</option>
            </select>
          </label>
          <label><input type="checkbox" checked={!!m.cables} onChange={e => setM({ cables: e.target.checked || undefined })} /> {tx('Anche i conduttori dei cavi')}</label>
          <div className="row">
            <span className="muted small">{tx('{0} numeri, {1} etichette', markRows.length, markRows.reduce((a, r) => a + r.qty, 0))}</span>
            <span className="tb-spacer" />
            <button disabled={!markRows.length} onClick={() => void exportMarks()}>{tx('Esporta CSV')}</button>
          </div>
        </fieldset>
        <label>{tx('Formato')}
          <select value={p.format} onChange={e => setP({ ...p, format: e.target.value as Prefs['format'] })}>
            <option value="xlsx">{tx('Excel .xlsx (un foglio per tipo)')}</option><option value="csv">{tx('CSV (un file per tipo)')}</option>
          </select>
        </label>
        <div className="modal-actions">
          <button onClick={close}>{tx('Annulla')}</button>
          <button disabled={!p.sets.length} onClick={() => void go()}>{tx('Esporta')}</button>
        </div>
      </div>
    </div>
  );
}
