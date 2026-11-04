// Personalizza la lista: in una sola finestra tutte le modifiche di una lista (pagine di lista, schemi
// delle morsettiere, disegni dei cavi e dei connettori, schema d'insieme, panoramiche PLC). Si apre con
// il tasto destro sulla pagina della lista, sulla tabella della vista Liste o sulla lista nel Modello.
// Schede: Testi, Colonne, Righe e pagine, Colori e linee, Vista a schermo. «Tutte le pagine di lista»
// è lo stile comune: vale per ogni lista finché la lista non sceglie un valore suo.
import { useContext, useMemo, useState } from 'react';
import { DialogShell, Embedded } from './DialogShell';
import { useStore } from '../model/store';
import { projectReports, sheetRows } from '../model/reports';
import {
  ALL_LISTS, breakKeyOf, columnKeys, columnOrder, commonReportStyle, keyName, ownReportStyle, REPORT_DEFAULTS,
  reportColumns, reportStyleOf, sheetRanges, styledRowH,
} from '../model/reportStyle';
import { STRIP_TEXT, STRIP_COLS, stripRowsPer } from '../model/terminals';
import { DRAWING_STYLES } from '../model/drawingStyle';
import type { DrawingStyle, DrawingStyleKind, ReportStyle, StripStyle } from '../model/types';
import { Field } from './PropertyPanel';
import { ColumnsTable, ListScaleRow, Num, STRIP_COL_NAMES } from './PageStyleDialogs';
import { REPORTS_VIEW_SIZE, setReportsView, setReportsViewColumn, useReportsView } from './reportsViewPrefs';
import { look } from './look';
import { tn, tx } from '../i18n/ui';

const ALIGNS = [['start', tn('sinistra')], ['middle', tn('centro')], ['end', tn('destra')]] as const;
type Tab = 'text' | 'cols' | 'rows' | 'colors' | 'screen';
const TABS: [Tab, string][] = [['text', tn('Testi')], ['cols', tn('Colonne')], ['rows', tn('Righe e pagine')], ['colors', tn('Colori e linee')], ['screen', tn('Vista a schermo')]];

const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) && n > 0 ? n : undefined; };

/** Colore facoltativo: vuoto = quello indicato come di serie */
function ColorField({ value, def, onCommit }: { value?: string; def: string; onCommit: (v: string | undefined) => void }) {
  return (
    <span className="nowrap">
      <input type="color" style={{ width: 36, minWidth: 36, height: 20, padding: 0, verticalAlign: 'middle' }} value={value ?? def} onChange={e => onCommit(e.target.value)} />
      {value ? <button className="mini" onClick={() => onCommit(undefined)}>{tx('di serie')}</button> : <span className="muted small"> {tx('di serie')}</span>}
    </span>
  );
}

const Row = ({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) => (
  <tr><td className="prop-name" title={title}>{label}</td><td className="prop-value nowrap">{children}</td></tr>
);

export function ListStyleDialog() {
  const dialog = useStore(s => s.dialog);
  // Dentro le impostazioni del progetto la lista si sceglie qui, senza cambiare finestra
  const embedded = useContext(Embedded);
  const [local, setLocal] = useState('report:*');
  const open = embedded || dialog === 'reportStyle' || dialog === 'stripStyle' || dialog === 'drawingStyle';
  const title = useStore(s => s.styleList);
  const storeKind = useStore(s => s.drawingStyleKind);
  const kind = embedded && local.startsWith('drawing:') ? local.slice(8) as DrawingStyleKind : storeKind;
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const [tab, setTab] = useState<Tab>('text');
  const tables = useMemo(() => (open ? projectReports(project, library) : []), [open, project, library]);
  if (!open) return null;
  const st = useStore.getState;
  const close = () => st().setDialog(null);
  // Lista scelta: valore del menu in alto
  const which = embedded ? local : dialog === 'stripStyle' ? 'strip' : dialog === 'drawingStyle' ? `drawing:${kind}` : title === ALL_LISTS ? 'report:*' : `report:${(tables.find(x => x.title === title) ?? tables[0])?.title ?? ALL_LISTS}`;
  const choose = (v: string) => {
    if (embedded) { setLocal(v); return; }
    if (v === 'strip') st().setDialog('stripStyle');
    else if (v.startsWith('drawing:')) st().openDrawingStyle(v.slice(8) as DrawingStyleKind);
    else st().openReportStyle(v.slice(7));
  };
  const tabs: Tab[] = which === 'report:*' ? ['text', 'colors', 'rows'] : which.startsWith('report:') ? ['text', 'cols', 'rows', 'colors', 'screen'] : ['text', 'cols'];
  const cur = tabs.includes(tab) ? tab : 'text';
  let body: React.ReactNode, reset: () => void, extra: React.ReactNode = null;
  if (which === 'strip') ({ body, reset } = stripBody(cur));
  else if (which.startsWith('drawing:')) ({ body, reset } = drawingBody(kind, cur));
  else ({ body, reset, extra } = reportBody(which.slice(7), cur));

  function stripBody(t: Tab) {
    const s = project.settings?.stripStyle ?? {};
    const set = (patch: Partial<StripStyle> | undefined) => st().updateSettings({ stripStyle: patch ? { ...s, ...patch } : undefined });
    const D = STRIP_TEXT;
    const row = (label: string, k: keyof typeof STRIP_TEXT) => <Row key={k} label={label}><Num value={s[k]} def={D[k]} onCommit={v => set({ [k]: v || undefined })} /></Row>;
    return {
      reset: () => set(undefined),
      body: t === 'text' ? (
        <>
          <table className="prop-table"><tbody>
            {row(tx('Titolo (nome della morsettiera)'), 'titleSize')}
            {row(tx('Articolo e foglio'), 'subSize')}
            {row(tx('Intestazioni delle colonne e legenda'), 'headSize')}
            {row(tx('Destinazioni, fili e pagine'), 'textSize')}
            {row(tx('Numero del morsetto'), 'noSize')}
            {row(tx('Altezza delle righe'), 'rowH')}
            <ListScaleRow />
          </tbody></table>
          <p className="muted small">{tx('Altezze in mm, valgono per tutte le pagine delle morsettiere. Campi vuoti: valori di serie.')} {tx('{0} morsetti per foglio', stripRowsPer(project))}</p>
        </>
      ) : (
        <>
          <ColumnsTable cols={STRIP_COL_NAMES.map(([k, l]) => ({ key: k, label: l, def: STRIP_COLS[k] }))} hide={new Set(s.hide ?? [])} widths={s.widths}
            onShow={(k, on) => { const h = new Set(s.hide ?? []); if (on) h.delete(k); else h.add(k); set({ hide: h.size ? [...h] : undefined }); }}
            onWidth={(k, w) => { const ws = { ...s.widths }; if (w) ws[k] = w; else delete ws[k]; set({ widths: Object.keys(ws).length ? ws : undefined }); }} />
          <p className="muted small">{tx('La colonna del morsetto resta sempre. Larghezza vuota: di serie.')}</p>
        </>
      ),
    };
  }

  function drawingBody(k: DrawingStyleKind, t: Tab) {
    const def = DRAWING_STYLES[k];
    const s: DrawingStyle = project.settings?.drawingStyles?.[k] ?? {};
    const set = (patch: Partial<DrawingStyle> | undefined) => st().updateSettings({ drawingStyles: { ...project.settings?.drawingStyles, [k]: patch ? { ...s, ...patch } : undefined } });
    const hide = new Set(s.hide ?? []);
    const flip = (c: string, on: boolean) => { const h = new Set(hide); if (on) h.delete(c); else h.add(c); set({ hide: h.size ? [...h] : undefined }); };
    return {
      reset: () => set(undefined),
      body: t === 'text' ? (
        <>
          <table className="prop-table"><tbody>
            {def.sizes.map(x => <Row key={x.key} label={tx(x.label)}><Num value={s[x.key]} def={x.def} onCommit={v => set({ [x.key]: v || undefined })} /></Row>)}
            <ListScaleRow />
          </tbody></table>
          <p className="muted small">{tx('Altezze in mm, valgono per tutte le pagine di questo tipo. Campi vuoti: valori di serie.')}</p>
        </>
      ) : def.columns.some(c => c.width !== undefined)
        ? <ColumnsTable cols={def.columns.map(c => ({ key: c.key, label: c.label, def: c.width }))} hide={hide} widths={s.widths} onShow={flip}
            onWidth={(c, w) => { const ws = { ...s.widths }; if (w) ws[c] = w; else delete ws[c]; set({ widths: Object.keys(ws).length ? ws : undefined }); }} />
        : <div className="ask-checks">
            {def.columns.map(c => <label key={c.key} className="ask-check"><input type="checkbox" checked={!hide.has(c.key)} onChange={e => flip(c.key, e.target.checked)} /> {tx(c.label)}</label>)}
          </div>,
    };
  }

  function reportBody(name: string, t: Tab) {
    const common = name === ALL_LISTS;
    const table = common ? undefined : tables.find(x => x.title === name);
    const s = ownReportStyle(project, name);
    // Valori di serie mostrati in grigio: quelli dello stile comune, poi quelli del programma
    const base: ReportStyle = common ? {} : commonReportStyle(project);
    const D = REPORT_DEFAULTS;
    const set = (patch: Partial<ReportStyle> | undefined) => st().setReportStyle(name, patch);
    const col = (key: string, patch: Parameters<ReturnType<typeof st>['setReportColumn']>[2]) => st().setReportColumn(name, key, patch);
    const eff = reportStyleOf(project, name);
    const reset = () => set(undefined);
    const n = (k: 'titleSize' | 'headSize' | 'textSize' | 'headH' | 'lineWidth', def: number) => <Num value={s[k]} def={base[k] ?? def} onCommit={v => set({ [k]: v || undefined })} />;
    const c = (k: 'lineColor' | 'headFill' | 'headColor' | 'textColor' | 'titleColor', def: string) => <ColorField value={s[k]} def={base[k] ?? def} onCommit={v => set({ [k]: v })} />;
    const yesNo = (k: 'hLines' | 'vLines' | 'headBold', def: boolean, label: string) => {
      const v = eff[k] ?? def;
      return <label className="row"><input type="checkbox" checked={v} onChange={e => set({ [k]: e.target.checked === (base[k] ?? def) ? undefined : e.target.checked })} /> {label}</label>;
    };
    if (t === 'text') {
      return {
        reset, body: (
          <table className="prop-table"><tbody>
            {table && <Row label={tx('Titolo sulla pagina')}><Field value={s.title ?? ''} placeholder={tx(table.title)} onCommit={v => set({ title: v.trim() || undefined })} /></Row>}
            <Row label={tx('Titolo: allineamento')}>
              <select value={s.titleAlign ?? ''} onChange={e => set({ titleAlign: (e.target.value || undefined) as ReportStyle['titleAlign'] })}>
                <option value="">{tx('di serie ({0})', tx(ALIGNS.find(a => a[0] === (base.titleAlign ?? 'start'))![1]))}</option>
                {ALIGNS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
              </select>
            </Row>
            <Row label={tx('Caratteri (mm): titolo, intestazione, righe')}>{n('titleSize', D.titleSize)} {n('headSize', D.headSize)} {n('textSize', D.textSize)}</Row>
            <ListScaleRow />
            <Row label={tx('Altezza delle righe (mm)')}><Num value={s.rowH} def={base.rowH ?? table?.rowH ?? D.rowH} onCommit={v => set({ rowH: v || undefined })} /></Row>
            <Row label={tx('Intestazione: altezza (mm)')}>{n('headH', D.headH)} {yesNo('headBold', true, tx('in grassetto'))}</Row>
          </tbody></table>
        ),
      };
    }
    if (t === 'colors') {
      const zebraOn = !!eff.zebra;
      return {
        reset, body: (
          <table className="prop-table"><tbody>
            <Row label={tx('Titolo: colore')}>{c('titleColor', look.ink)}</Row>
            <Row label={tx('Intestazione: sfondo e colore dei testi')}>{c('headFill', D.headFill)} {c('headColor', look.ink)}</Row>
            <Row label={tx('Righe: colore dei testi')}>{c('textColor', look.ink)}</Row>
            <Row label={tx('Righe alterne colorate')}>
              <label className="row"><input type="checkbox" checked={zebraOn} onChange={e => set({ zebra: e.target.checked ? '#f3f6f9' : base.zebra ? '' : undefined })} /> {tx('sì')}</label>
              {zebraOn && <ColorField value={s.zebra || undefined} def={base.zebra || '#f3f6f9'} onCommit={v => set({ zebra: v ?? (base.zebra ? undefined : '#f3f6f9') })} />}
            </Row>
            <Row label={tx('Linee: spessore (mm) e colore')}>{n('lineWidth', D.lineWidth)} {c('lineColor', D.lineColor)}</Row>
          </tbody></table>
        ),
      };
    }
    if (t === 'rows') {
      const keys = table ? columnKeys(table.columns) : [];
      const chosen = project.settings.reportPages;
      const onPages = table ? !chosen || chosen.includes(table.title) : false;
      const pages = table ? project.pages.filter(p => p.type === 'report' && p.report === table.title).length : 0;
      return {
        reset, body: (
          <>
            <table className="prop-table"><tbody>
              <Row label={tx('Linee')}>{yesNo('hLines', true, tx('tra le righe'))} {yesNo('vLines', false, tx('tra le colonne e bordo'))}</Row>
              {table && <>
                <Row label={tx('Ordina per')}>
                  <select value={s.sort?.key ?? ''} onChange={e => set({ sort: e.target.value ? { key: e.target.value, desc: s.sort?.desc } : undefined })}>
                    <option value="">{tx('come calcolata')}</option>
                    {keys.map(k => <option key={k} value={k}>{tx(keyName(k))}{k === keyName(k) ? '' : ` (${k.split('#')[1]})`}</option>)}
                  </select>
                  {s.sort && <label className="row"><input type="checkbox" checked={!!s.sort.desc} onChange={e => set({ sort: { ...s.sort!, desc: e.target.checked || undefined } })} /> {tx('decrescente')}</label>}
                </Row>
                <Row label={tx('Nuova pagina quando cambia')}>
                  <select value={breakKeyOf(table, s)} onChange={e => set({ breakKey: e.target.value === (table.breakKey ?? '') ? undefined : e.target.value })}>
                    <option value="">{tx('mai (pagine piene)')}</option>
                    {keys.map(k => <option key={k} value={k}>{tx(keyName(k))}{k === keyName(k) ? '' : ` (${k.split('#')[1]})`}</option>)}
                  </select>
                </Row>
                <Row label={tx('Pagine del progetto')} title={tx('La lista diventa pagine con cartiglio, nel PDF e in stampa')}>
                  <label className="row"><input type="checkbox" checked={onPages} onChange={() => {
                    const all = chosen ?? tables.map(x => x.title);
                    st().updateSettings({ reportPages: onPages ? all.filter(x => x !== table.title) : [...all, table.title] });
                  }} /> {tx('crea le pagine di questa lista')}</label>
                  <span className="muted small"> {tx('{0} righe, {1} per foglio', table.rows.length, sheetRows({ rowH: styledRowH(table, eff) }))} · {tx('{0} fogli', sheetRanges(table, eff).length)} · {tx('{0} pagine ora', pages)}</span>
                </Row>
              </>}
            </tbody></table>
            {table && <div className="row-buttons">
              <button onClick={() => st().syncReportPages()} title={tx('Crea, aggiorna o toglie le pagine di tutte le liste scelte')}>{tx('Crea / aggiorna le pagine')}</button>
              <button onClick={() => st().setDialog('reportPages')} title={tx('Quali liste diventano pagine, ordine dei gruppi e prefissi (IND.1, LST.1…)')}>{tx('Tutte le pagine automatiche…')}</button>
            </div>}
          </>
        ),
      };
    }
    if (t === 'screen' && table) {
      return { reset, body: <ScreenTab title={table.title} columns={table.columns} /> };
    }
    // Colonne
    if (!table) return { reset, body: null };
    const keys = columnKeys(table.columns);
    const order = columnOrder(s, keys);
    const auto = new Map(reportColumns(table, { ...eff, columns: Object.fromEntries(keys.map(k => [k, { ...s.columns?.[k], hidden: false }])) }).map(x => [x.key, x.w]));
    const move = (k: string, d: number) => {
      const o = [...order], i = o.indexOf(k), j = i + d;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      set({ order: o });
    };
    return {
      reset,
      extra: <button onClick={() => set({ columns: Object.fromEntries(Object.entries(s.columns ?? {}).map(([k, v]) => [k, { ...v, hidden: undefined }])) })}>{tx('Mostra tutte le colonne')}</button>,
      body: (
        <>
          <table className="grid">
            <thead><tr><th>{tx('Visibile')}</th><th>{tx('Colonna')}</th><th>{tx('Intestazione')}</th><th>{tx('Larghezza mm')}</th><th>{tx('Allineamento')}</th><th>{tx('Carattere mm')}</th><th>{tx('Grassetto')}</th><th>{tx('Colore')}</th><th /></tr></thead>
            <tbody>
              {order.map((k, i) => {
                const cs = s.columns?.[k] ?? {};
                return (
                  <tr key={k} className={cs.hidden ? 'muted' : ''}>
                    <td><input type="checkbox" checked={!cs.hidden} onChange={e => col(k, { hidden: e.target.checked ? undefined : true })} /></td>
                    <td className="nowrap">{tx(keyName(k))}{k === keyName(k) ? '' : ` (${k.split('#')[1]})`}</td>
                    <td><Field value={cs.label ?? ''} placeholder={tx(keyName(k))} onCommit={v => col(k, { label: v.trim() || undefined })} /></td>
                    <td><Field type="number" value={String(cs.width ?? '')} placeholder={tx('auto {0}', (auto.get(k) ?? 0).toFixed(0))} onCommit={v => col(k, { width: num(v) })} /></td>
                    <td><select value={cs.align ?? 'start'} onChange={e => col(k, { align: e.target.value === 'start' ? undefined : e.target.value as 'middle' | 'end' })}>
                      {ALIGNS.map(([v, l]) => <option key={v} value={v}>{tx(l)}</option>)}
                    </select></td>
                    <td><Field type="number" value={String(cs.size ?? '')} placeholder={String(eff.textSize ?? D.textSize)} onCommit={v => col(k, { size: num(v) })} /></td>
                    <td><input type="checkbox" checked={!!cs.bold} onChange={e => col(k, { bold: e.target.checked || undefined })} /></td>
                    <td><ColorField value={cs.color} def={eff.textColor ?? look.ink} onCommit={v => col(k, { color: v })} /></td>
                    <td className="nowrap">
                      <button className="mini" disabled={i === 0} onClick={() => move(k, -1)} title={tx('Prima')}>↑</button>
                      <button className="mini" disabled={i === order.length - 1} onClick={() => move(k, 1)} title={tx('Dopo')}>↓</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">{tx('Larghezza vuota: automatica, divisa tra le colonne in base ai testi. Sulla pagina si allarga una colonna anche trascinando il suo bordo destro nell\'intestazione.')}</p>
        </>
      ),
    };
  }

  // Lo stile della lista diventa quello comune a tutte: le parti comuni si tolgono dalle altre liste
  const asCommon = () => {
    const name = which.slice(7);
    const own = ownReportStyle(project, name);
    const all = { ...project.settings.reportStyles };
    const common = commonReportStyle({ settings: { ...project.settings, reportStyles: { [ALL_LISTS]: { ...commonReportStyle(project), ...own } } } });
    for (const k of Object.keys(all)) {
      if (k === ALL_LISTS) continue;
      const rest = Object.fromEntries(Object.entries(all[k]).filter(([p]) => !(p in common)));
      if (Object.keys(rest).length) all[k] = rest; else delete all[k];
    }
    all[ALL_LISTS] = common;
    st().updateSettings({ reportStyles: all });
  };

  return (
    <DialogShell className="report-style-dialog list-style-dialog" label={tx('Personalizza la lista')} onClose={close}>
        <h3>{tx('Personalizza la lista')}</h3>
        <div className="row">
          <select value={which} onChange={e => choose(e.target.value)} style={{ minWidth: 280 }}>
            <optgroup label={tx('Pagine di lista')}>
              <option value="report:*">{tx('Tutte le pagine di lista (stile comune)')}</option>
              {tables.map(x => <option key={x.title} value={`report:${x.title}`}>{tx(x.title)}{x.rows.length ? '' : ` (${tx('vuota')})`}</option>)}
            </optgroup>
            <optgroup label={tx('Pagine disegnate')}>
              <option value="strip">{tx('Schemi delle morsettiere')}</option>
              {(Object.keys(DRAWING_STYLES) as DrawingStyleKind[]).map(k => <option key={k} value={`drawing:${k}`}>{tx(DRAWING_STYLES[k].title)}</option>)}
            </optgroup>
          </select>
          {which === 'report:*' && <span className="muted small">{tx('Vale per tutte le pagine di lista, finché una lista non sceglie un valore suo.')}</span>}
        </div>
        <div className="row list-style-tabs">
          {tabs.map(k => <button key={k} className={k === cur ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{tx(TABS.find(x => x[0] === k)![1])}</button>)}
        </div>
        <div className="list-style-body">{body}</div>
        <div className="modal-actions">
          <button onClick={reset} title={tx('Rimette i valori di serie di questa lista')}>{tx('Ripristina di serie')}</button>
          {which.startsWith('report:') && which !== 'report:*' && <button onClick={asCommon} title={tx('Caratteri, righe, linee e colori di questa lista diventano lo stile comune di tutte le pagine di lista')}>{tx('Usa per tutte le liste')}</button>}
          {extra}
          <span className="tb-spacer" />
          <button className="primary dlg-close" onClick={close}>{tx('Chiudi')}</button>
        </div>
    </DialogShell>
  );
}

/** Vista Liste a schermo: colonne da mostrare e dimensione del testo (restano in questo computer) */
function ScreenTab({ title, columns }: { title: string; columns: string[] }) {
  const view = useReportsView();
  const hidden = new Set(view.hidden?.[title] ?? []);
  const size = view.size ?? REPORTS_VIEW_SIZE.def;
  return (
    <>
      <p className="muted small">{tx('Come si vede la lista nella vista Liste, in questo computer. Non cambia le pagine né il PDF.')}</p>
      <table className="prop-table"><tbody>
        <Row label={tx('Testo delle tabelle (px, tutte le liste)')}>
          <Num value={view.size} def={REPORTS_VIEW_SIZE.def} onCommit={v => setReportsView({ ...view, size: v ? Math.max(REPORTS_VIEW_SIZE.min, Math.min(REPORTS_VIEW_SIZE.max, Math.round(v))) : undefined })} />
          <span className="muted small"> {size}px</span>
        </Row>
      </tbody></table>
      <h4>{tx('Colonne da mostrare')}</h4>
      <div className="ask-checks">
        {columns.map(c => <label key={c} className="ask-check"><input type="checkbox" checked={!hidden.has(c)} onChange={e => setReportsViewColumn(title, c, e.target.checked)} /> {tx(c)}</label>)}
      </div>
    </>
  );
}
