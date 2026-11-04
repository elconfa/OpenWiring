// Finestre per l'aspetto delle pagine generate: copertina (logo, caratteri, posizioni, righe dei
// dati, revisioni, firme) e stile delle linee dei cavi; parti comuni della finestra «Personalizza la lista».
import { DialogShell, useDialogOpen } from './DialogShell';
import { useStore } from '../model/store';
import { COVER_DEFAULTS, coverLines, coverRowsOf, coverStyleOf, type CoverLine } from '../model/cover';
import { STRIP_COLS } from '../model/terminals';
import { uid } from '../model/geometry';
import type { CableStyle, CoverStyle, ZoneStyle } from '../model/types';
import { CABLE_COND_DIR, CABLE_LABEL_POS, CABLE_SHOW_KEYS, CABLE_STYLE_DEFAULTS, cableStyleOf, shieldDims, SHIELD } from '../model/cableStyle';
import { look } from './look';
import { Field } from './PropertyPanel';
import { tn, tx } from '../i18n/ui';

const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) && n >= 0 ? n : undefined; };

/** Numero facoltativo: vuoto = di serie (scritto in grigio) */
export function Num({ value, def, onCommit }: { value?: number; def: number; onCommit: (v: number | undefined) => void }) {
  return <Field type="number" value={value === undefined ? '' : String(value)} placeholder={String(def)} onCommit={v => onCommit(num(v))} />;
}

export function CoverDialog() {
  const open = useDialogOpen('cover');
  const project = useStore(s => s.project);
  if (!open) return null;
  const st = useStore.getState;
  const s = coverStyleOf(project), D = COVER_DEFAULTS;
  const set = (patch: Partial<CoverStyle> | undefined) => st().updateSettings({ cover: patch ? { ...s, ...patch } : undefined });
  const lines = coverLines(project, s);
  const saveLines = (l: CoverLine[]) => set({ rows: coverRowsOf(l) });
  const change = (k: number, patch: Partial<CoverLine>) => saveLines(lines.map((l, i) => (i === k ? { ...l, ...patch } : l)));
  const move = (k: number, d: number) => {
    const l = [...lines], j = k + d;
    if (j < 0 || j >= l.length) return;
    [l[k], l[j]] = [l[j], l[k]];
    saveLines(l);
  };
  const logo = s.logo ?? {};
  const close = () => st().setDialog(null);
  return (
    <DialogShell className="report-style-dialog" label={tx('Copertina')} onClose={close}>
        <h3>{tx('Copertina')}</h3>
        <p className="muted small">{tx('Misure in mm, dall\'alto del foglio. Campi vuoti: valori di serie. Sulla copertina si possono aggiungere anche testi, immagini e riquadri come su ogni pagina.')}</p>
        <table className="prop-table">
          <tbody>
            <tr><td className="prop-name">{tx('Logo (dal cartiglio): larghezza, altezza, y')}</td><td className="prop-value nowrap">
              <label className="row"><input type="checkbox" checked={!logo.hidden} onChange={e => set({ logo: { ...logo, hidden: e.target.checked ? undefined : true } })} /> {tx('mostra')}</label>
              <Num value={logo.w} def={D.logo.w} onCommit={v => set({ logo: { ...logo, w: v } })} />
              <Num value={logo.h} def={D.logo.h} onCommit={v => set({ logo: { ...logo, h: v } })} />
              <Num value={logo.y} def={D.logo.y} onCommit={v => set({ logo: { ...logo, y: v } })} />
              {!project.titleBlock?.logo && <span className="muted small">{tx('nessun logo nel cartiglio')}</span>}
            </td></tr>
            <tr><td className="prop-name">{tx('Nome del progetto: carattere, y')}</td><td className="prop-value nowrap">
              <Num value={s.titleSize} def={D.titleSize} onCommit={v => set({ titleSize: v || undefined })} />
              <Num value={s.titleY} def={D.titleY} onCommit={v => set({ titleY: v })} />
            </td></tr>
            <tr><td className="prop-name">{tx('Descrizione: carattere')}</td><td className="prop-value"><Num value={s.descSize} def={D.descSize} onCommit={v => set({ descSize: v || undefined })} /></td></tr>
            <tr><td className="prop-name">{tx('Dati: carattere del nome e del valore')}</td><td className="prop-value nowrap">
              <Num value={s.labelSize} def={D.labelSize} onCommit={v => set({ labelSize: v || undefined })} />
              <Num value={s.valueSize} def={D.valueSize} onCommit={v => set({ valueSize: v || undefined })} />
            </td></tr>
            <tr><td className="prop-name">{tx('Dati: y della prima riga, distanza tra le righe')}</td><td className="prop-value nowrap">
              <Num value={s.rowsY} def={D.rowsY} onCommit={v => set({ rowsY: v })} />
              <Num value={s.rowGap} def={D.rowGap} onCommit={v => set({ rowGap: v || undefined })} />
            </td></tr>
            <tr><td className="prop-name">{tx('Revisioni elencate (0 = nessuna tabella)')}</td><td className="prop-value"><Num value={s.revisions} def={D.revisions} onCommit={v => set({ revisions: v === undefined ? undefined : Math.round(v) })} /></td></tr>
            <tr><td className="prop-name">{tx('Riquadri delle firme (separati da virgole, vuoto = nessuno)')}</td><td className="prop-value">
              <Field value={(s.signatures ?? D.signatures).join(', ')} onCommit={v => set({ signatures: v.split(',').map(x => x.trim()).filter(Boolean) })} />
            </td></tr>
          </tbody>
        </table>
        <h4>{tx('Righe dei dati')}</h4>
        <table className="grid">
          <thead><tr><th>{tx('Visibile')}</th><th>{tx('Nome')}</th><th>{tx('Valore')}</th><th /></tr></thead>
          <tbody>
            {lines.map((l, k) => (
              <tr key={l.key} className={l.hidden ? 'muted' : ''}>
                <td><input type="checkbox" checked={!l.hidden} onChange={e => change(k, { hidden: !e.target.checked })} /></td>
                <td><Field value={l.custom || l.free ? l.label : ''} placeholder={tx(l.label)} onCommit={v => change(k, { label: v.trim(), custom: !!v.trim() })} /></td>
                <td>{l.free
                  ? <Field value={l.value} onCommit={v => change(k, { value: v })} />
                  : <span className="muted small" title={tx('Si cambia nei dati del progetto o del cartiglio')}>{l.value || '—'}</span>}</td>
                <td className="nowrap">
                  <button className="mini" disabled={k === 0} onClick={() => move(k, -1)} title={tx('Prima')}>↑</button>
                  <button className="mini" disabled={k === lines.length - 1} onClick={() => move(k, 1)} title={tx('Dopo')}>↓</button>
                  {l.free && <button className="mini" onClick={() => saveLines(lines.filter((_, i) => i !== k))} title={tx('Togli la riga')}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row"><button onClick={() => saveLines([...lines, { key: `free:${uid('c')}`, label: tx('Nuova riga'), value: '', hidden: false, custom: true, free: true }])}>{tx('+ Riga libera')}</button></div>
        <div className="modal-actions">
          <button onClick={() => set(undefined)} title={tx('Rimette la copertina di serie')}>{tx('Ripristina di serie')}</button>
          <span className="tb-spacer" />
          <button className="primary dlg-close" onClick={close}>{tx('Chiudi')}</button>
        </div>
    </DialogShell>
  );
}

/** Scala di tutti i testi delle liste: vale per pagine di lista, schemi delle morsettiere e disegni */
export function ListScaleRow() {
  const v = useStore(s => s.project.settings?.listTextScale);
  const st = useStore.getState;
  return (
    <tr><td className="prop-name" title={tx('Ingrandisce o rimpicciolisce tutti i testi di tutte le liste del progetto (pagine di lista, schemi delle morsettiere, disegni dei cavi e dei connettori, panoramiche PLC)')}>{tx('Tutti i testi delle liste (%)')}</td>
      <td className="prop-value"><Num value={v} def={100} onCommit={n => st().updateSettings({ listTextScale: n && n !== 100 ? Math.max(30, Math.min(300, n)) : undefined })} /></td></tr>
  );
}

/** Larghezze e visibilità delle colonne di una tabella disegnata */
export function ColumnsTable({ cols, hide, widths, onShow, onWidth }: { cols: { key: string; label: string; def?: number }[]; hide: Set<string>; widths?: Record<string, number>; onShow: (k: string, on: boolean) => void; onWidth: (k: string, w: number | undefined) => void }) {
  return (
    <table className="grid">
      <thead><tr><th>{tx('Visibile')}</th><th>{tx('Colonna')}</th><th>{tx('Larghezza mm')}</th></tr></thead>
      <tbody>
        {cols.map(c => (
          <tr key={c.key} className={hide.has(c.key) ? 'muted' : ''}>
            <td><input type="checkbox" checked={!hide.has(c.key)} onChange={e => onShow(c.key, e.target.checked)} /></td>
            <td>{tx(c.label)}</td>
            <td>{c.def !== undefined || widths?.[c.key] !== undefined
              ? <Field type="number" value={widths?.[c.key] !== undefined ? String(widths[c.key]) : ''} placeholder={c.def ? String(c.def) : tx('auto')} onCommit={v => onWidth(c.key, num(v) || undefined)} />
              : <span className="muted small">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const STRIP_COL_NAMES: [keyof typeof STRIP_COLS, string][] = [
  ['ext', tn('Destinazione esterna')], ['extWire', tn('Filo (esterno)')], ['intWire', tn('Filo (interno)')], ['int', tn('Destinazione interna')], ['loc', tn('Pagina')],
];

/** Colore facoltativo: vuoto = quello dell'inchiostro del progetto */
function ColorPick({ value, onCommit }: { value?: string; onCommit: (v: string | undefined) => void }) {
  return (
    <span className="nowrap">
      <input type="color" style={{ width: 36, minWidth: 36, height: 20, padding: 0, verticalAlign: 'middle' }} value={value ?? look.ink} onChange={e => onCommit(e.target.value)} />
      {value ? <button className="mini" onClick={() => onCommit(undefined)} title={tx('Colore dell\'inchiostro del progetto')}>{tx('di serie')}</button> : <span className="muted small"> {tx('inchiostro')}</span>}
    </span>
  );
}

/** Stile delle linee dei cavi (come la «disposizione proprietà» di EPLAN): dimensioni, colori, testi, trattino sui fili */
export function CableStyleDialog() {
  const open = useDialogOpen('cableStyle');
  const project = useStore(s => s.project);
  if (!open) return null;
  const st = useStore.getState;
  const s: CableStyle = project.settings?.cableStyle ?? {};
  const D = CABLE_STYLE_DEFAULTS, R = cableStyleOf(project);
  const set = (patch: Partial<CableStyle> | undefined) => st().updateSettings({ cableStyle: patch ? { ...s, ...patch } : undefined });
  const shows = (which: 'main' | 'other') => (
    <span className="checks-inline">
      {CABLE_SHOW_KEYS.map(([k, l]) => (
        <label key={k}><input type="checkbox" checked={R[which][k]} onChange={e => set({ [which]: { ...s[which], [k]: e.target.checked === D[which][k] ? undefined : e.target.checked } })} /> {tx(l)}</label>
      ))}
    </span>
  );
  const close = () => st().setDialog(null);
  return (
    <DialogShell className="report-style-dialog" label={tx('Stile dei cavi')} onClose={close}>
        <h3>{tx('Stile dei cavi')}</h3>
        <p className="muted small">{tx('Vale per tutte le linee dei cavi del progetto; su ogni linea si possono scegliere testi e posizione diversi (Proprietà). Misure in mm, campi vuoti: valori di serie.')}</p>
        <table className="prop-table">
          <tbody>
            <tr><td className="prop-name">{tx('Linea: spessore e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.lineWidth} def={D.lineWidth} onCommit={v => set({ lineWidth: v || undefined })} /> <ColorPick value={s.lineColor} onCommit={v => set({ lineColor: v })} /></td></tr>
            <tr><td className="prop-name">{tx('Sigla: altezza e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.tagSize} def={D.tagSize} onCommit={v => set({ tagSize: v || undefined })} /> <ColorPick value={s.tagColor} onCommit={v => set({ tagColor: v })} /></td></tr>
            <tr><td className="prop-name">{tx('Tipo, sezione e descrizione: altezza e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.textSize} def={D.textSize} onCommit={v => set({ textSize: v || undefined })} /> <ColorPick value={s.textColor} onCommit={v => set({ textColor: v })} /></td></tr>
            <tr><td className="prop-name">{tx('Nomi dei conduttori: altezza e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.condSize} def={D.condSize} onCommit={v => set({ condSize: v || undefined })} /> <ColorPick value={s.condColor} onCommit={v => set({ condColor: v })} /></td></tr>
            <tr><td className="prop-name">{tx('Nomi dei conduttori')}</td><td className="prop-value">
              <select value={R.condDir} onChange={e => set({ condDir: e.target.value === D.condDir ? undefined : e.target.value as CableStyle['condDir'] })} title={tx('Verticali: utile per i colori composti con il nome lungo')}>
                {CABLE_COND_DIR.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
              </select>
            </td></tr>
            <tr><td className="prop-name">{tx('Schermo: colore')}</td><td className="prop-value"><ColorPick value={s.shieldColor} onCommit={v => set({ shieldColor: v })} /></td></tr>
            <tr><td className="prop-name" title={tx('Altezza vuota: cresce da sola con i nomi dei conduttori orizzontali, che stanno dentro l\'asola')}>{tx('Schermo: altezza dell\'asola e distanza delle estremità dai conduttori')}</td><td className="prop-value nowrap">
              <Num value={s.shieldHeight} def={+(shieldDims(R).r * 2).toFixed(1)} onCommit={v => set({ shieldHeight: v || undefined })} />
              <Num value={s.shieldMargin} def={SHIELD.margin} onCommit={v => set({ shieldMargin: v || undefined })} />
            </td></tr>
            <tr><td className="prop-name">{tx('Trattino obliquo su ogni filo attraversato')}</td><td className="prop-value"><input type="checkbox" checked={R.ticks} onChange={e => set({ ticks: e.target.checked || undefined })} /></td></tr>
            <tr><td className="prop-name">{tx('Posizione dei testi')}</td><td className="prop-value">
              <select value={R.labelPos} onChange={e => set({ labelPos: e.target.value === D.labelPos ? undefined : e.target.value as CableStyle['labelPos'] })}>
                {CABLE_LABEL_POS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
              </select>
            </td></tr>
            <tr><td className="prop-name" title={tx('La rappresentazione principale del cavo: la linea scelta come principale o la prima del progetto')}>{tx('Testi della linea principale')}</td><td className="prop-value">{shows('main')}</td></tr>
            <tr><td className="prop-name" title={tx('Le altre linee dello stesso cavo, anche su altre pagine')}>{tx('Testi delle altre linee')}</td><td className="prop-value">{shows('other')}</td></tr>
          </tbody>
        </table>
        <p className="muted small">{tx('I testi del cavo si trascinano sullo schema. Lo schermo si disegna come un\'asola tratteggiata; un filo dal punto in fondo al suo collegamento al morsetto PE toglie il simbolo di terra.')}</p>
        <div className="modal-actions">
          <button onClick={() => set(undefined)}>{tx('Ripristina di serie')}</button>
          <span className="tb-spacer" />
          <button className="primary dlg-close" onClick={close}>{tx('Chiudi')}</button>
        </div>
    </DialogShell>
  );
}

/** Riquadri di luogo: aspetto di serie nel progetto (ogni riquadro può cambiarlo nelle sue Proprietà) */
export function ZoneStyleRows() {
  const s: ZoneStyle = useStore(st => st.project.settings?.zoneStyle) ?? {};
  const st = useStore.getState;
  const set = (patch: Partial<ZoneStyle>) => {
    const next = Object.fromEntries(Object.entries({ ...s, ...patch }).filter(([, v]) => v !== undefined)) as ZoneStyle;
    st().updateSettings({ zoneStyle: Object.keys(next).length ? next : undefined });
  };
  return (
    <>
      <tr><td className="prop-name">{tx('Linea: spessore e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.lineWidth} def={0.3} onCommit={v => set({ lineWidth: v || undefined })} /> <ColorPick value={s.lineColor} onCommit={v => set({ lineColor: v })} /></td></tr>
      <tr><td className="prop-name">{tx('Scritta: altezza e colore')}</td><td className="prop-value nowrap cable-style-row"><Num value={s.textSize} def={2.8} onCommit={v => set({ textSize: v || undefined })} /> <ColorPick value={s.textColor} onCommit={v => set({ textColor: v })} /></td></tr>
      <tr><td className="prop-name" title={tx('Scrive solo il codice del luogo (+Q1.2), senza il nome')}>{tx('Solo la sigla, senza il nome del luogo')}</td><td className="prop-value"><input type="checkbox" checked={!!s.codeOnly} onChange={e => set({ codeOnly: e.target.checked || undefined })} /></td></tr>
      <tr><td colSpan={2} className="pad-x muted small">{tx('Valgono per tutti i riquadri di luogo del progetto; ogni riquadro può avere valori suoi (Proprietà). Misure in mm, campi vuoti: valori di serie. Nello schema di rete i riquadri hanno l\'intestazione piena (linea 0,4 mm, scritta 3,2 mm).')}</td></tr>
    </>
  );
}
