// Vista Calcoli: calcolo termico dei quadri (IEC/TR 60890) e verifica dei cavi (caduta di tensione e
// portata). I risultati diventano anche liste del progetto (Liste, pagine di lista, PDF).
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import type { CableCalc, ThermalCalc } from '../model/types';
import { INSTALL_TYPES, MATERIALS, METHODS, cableDefaults, cableResult, thermalDevices, thermalResult } from '../model/calculations';
import { Field } from './PropertyPanel';
import { askConfirm } from './Ask';
import { tx } from '../i18n/ui';

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();
const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString();
const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) ? n : undefined; };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <tr><td className="prop-name">{label}</td><td className="prop-value">{children}</td></tr>;
}

function ThermalPanel() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const st = useStore.getState;
  const panels = project.panels ?? [];
  const [sel, setSel] = useState<string>(panels[0]?.id ?? '');
  const panelId = panels.some(p => p.id === sel) ? sel : panels[0]?.id ?? '';
  const c = project.calcs?.thermal?.find(x => x.panelId === panelId);
  const devs = useMemo(() => (c ? thermalDevices(project, panelId, library, c) : []), [project, panelId, library, c]);
  const r = useMemo(() => (c ? thermalResult(project, c, library) : undefined), [project, c, library]);
  const set = (patch: Partial<ThermalCalc>) => st().setThermal(panelId, patch);
  const numField = (k: keyof ThermalCalc, ph?: string) => (
    <Field type="number" value={c?.[k] === undefined ? '' : String(c[k])} placeholder={ph}
      onCommit={v => { const n = num(v); if (v.trim() && n === undefined) return false; set({ [k]: n } as Partial<ThermalCalc>); }} />
  );
  return (
    <div className="calcs-section">
      <div className="parts-toolbar">
        {panels.length > 0 && <select value={panelId} onChange={e => setSel(e.target.value)}>
          {panels.map(p => <option key={p.id} value={p.id}>+{p.code} {p.name}{project.calcs?.thermal?.some(x => x.panelId === p.id) ? ' ✓' : ''}</option>)}
        </select>}
        {!panels.length && <b>{tx('Tutto il progetto (nessun luogo definito)')}</b>}
        {!c && <button className="primary" onClick={() => set({})}>{tx('Calcola questo quadro')}</button>}
        {c && <button onClick={async () => { if (await askConfirm(tx('Conferma'), tx('Togliere il calcolo termico di questo quadro?'), tx('Togli'))) st().setThermal(panelId, undefined); }}>{tx('Togli il calcolo')}</button>}
        <div className="tb-spacer" />
        <span className="muted small">{tx('Metodo della superficie efficace (IEC/TR 60890): ΔT = Pv / (k·A)')}</span>
      </div>
      {c && r && (
        <div className="calcs-grid">
          <div>
            <h4>{tx('Involucro')}</h4>
            <table className="prop-table"><tbody>
              <Row label={tx('Larghezza × altezza × profondità (mm)')}><div className="nowrap">{numField('w')}{numField('h')}{numField('d')}</div></Row>
              <Row label={tx('Posizione di installazione')}>
                <select value={c.install} onChange={e => set({ install: +e.target.value })}>
                  {INSTALL_TYPES.map(t => <option key={t.id} value={t.id}>{t.id}. {tx(t.name)}</option>)}
                </select>
              </Row>
              <Row label={tx('Materiale')}>
                <select value={c.material} onChange={e => set({ material: e.target.value as ThermalCalc['material'] })}>
                  {(Object.keys(MATERIALS) as ThermalCalc['material'][]).map(m => <option key={m} value={m}>{tx(MATERIALS[m].name)} (k {MATERIALS[m].k})</option>)}
                </select>
              </Row>
              <Row label={tx('k scritto a mano (W/m²K)')}>{numField('k', String(MATERIALS[c.material].k))}</Row>
            </tbody></table>
            <h4>{tx('Temperature (°C) e condizioni')}</h4>
            <table className="prop-table"><tbody>
              <Row label={tx('Ambiente massima / minima')}><div className="nowrap">{numField('tAmb')}{numField('tAmbMin')}</div></Row>
              <Row label={tx('Interna massima ammessa / minima voluta')}><div className="nowrap">{numField('tMax')}{numField('tMin')}</div></Row>
              <Row label={tx('Altitudine (m)')}>{numField('altitude', '0')}</Row>
              <Row label={tx('Fattore di contemporaneità')}>{numField('factor', '1')}</Row>
            </tbody></table>
            <h4>{tx('Risultato')}</h4>
            <table className="prop-table calcs-result"><tbody>
              <Row label={tx('Superficie efficace A')}>{n2(r.area)} m²</Row>
              <Row label={tx('Potenza dissipata Pv')}>{n1(r.pv)} W{r.missing ? <span className="warn-text"> · {tx('{0} dispositivi senza potenza dissipata', r.missing)}</span> : null}</Row>
              <Row label={tx('Sovratemperatura ΔT')}>{n1(r.dT)} K</Row>
              <Row label={tx('Temperatura interna')}><b className={r.tIn > c.tMax ? 'error-text' : ''}>{n1(r.tIn)} °C</b> ({tx('ammessa {0} °C', c.tMax)})</Row>
              <Row label={tx('Raffreddamento necessario')}>{r.cooling ? <b className="error-text">{n1(r.cooling)} W</b> : tx('non serve')}</Row>
              {r.cooling > 0 && <Row label={tx('Ventilatore (portata)')}>{r.fan ? `${n1(r.fan)} m³/h` : tx('non basta: aria esterna troppo calda, serve un condizionatore')}</Row>}
              <Row label={tx('Scaldiglia anticondensa')}>{r.heating ? `${n1(r.heating)} W` : tx('non serve')}</Row>
            </tbody></table>
          </div>
          <div>
            <h4>{tx('Potenza dissipata dei dispositivi')}</h4>
            <p className="muted small">{tx('Dal campo «Potenza dissipata» dell\'articolo (o dai dati del costruttore); si può scrivere a mano per il singolo dispositivo.')}</p>
            <table className="grid">
              <thead><tr><th>{tx('Sigla')}</th><th>{tx('Descrizione')}</th><th>{tx('Articolo')}</th><th>{tx('Pv (W)')}</th></tr></thead>
              <tbody>
                {devs.map(d => (
                  <tr key={d.tag} className={d.pv === undefined ? 'warn-row' : ''}>
                    <td>-{d.tag}</td><td>{d.description}</td><td>{d.partNr ?? ''}</td>
                    <td><Field type="number" value={d.own ? String(d.pv) : ''} placeholder={d.pv !== undefined ? String(d.pv) : '?'}
                      onCommit={v => { const n = num(v); const pv = { ...c.pv }; if (n === undefined) delete pv[d.tag]; else pv[d.tag] = n; set({ pv }); }} /></td>
                  </tr>
                ))}
                {!devs.length && <tr><td colSpan={4} className="muted pad">{tx('Nessun dispositivo in questo quadro.')}</td></tr>}
              </tbody>
            </table>
            <h4>{tx('Altre perdite')}</h4>
            <table className="grid">
              <tbody>
                {(c.extra ?? []).map((e, i) => (
                  <tr key={i}>
                    <td><Field value={e.name} onCommit={v => set({ extra: c.extra!.map((x, k) => (k === i ? { ...x, name: v } : x)) })} /></td>
                    <td><Field type="number" value={String(e.w)} onCommit={v => { const n = num(v); if (n === undefined) return false; set({ extra: c.extra!.map((x, k) => (k === i ? { ...x, w: n } : x)) }); }} /></td>
                    <td><button className="mini" onClick={() => set({ extra: c.extra!.filter((_, k) => k !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => set({ extra: [...(c.extra ?? []), { name: tx('Cavi e morsetti'), w: 0 }] })}>{tx('+ Perdita')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CablesPanel() {
  const project = useStore(s => s.project);
  const st = useStore.getState;
  const cables = project.cables ?? [];
  const calcs = project.calcs?.cables ?? {};
  const set = (id: string, patch: Partial<CableCalc>) => st().setCableCalc(id, patch);
  const numCell = (id: string, k: keyof CableCalc, value: number | undefined, ph?: string) => (
    <Field type="number" value={value === undefined ? '' : String(value)} placeholder={ph}
      onCommit={v => { const n = num(v); if (v.trim() && n === undefined) return false; set(id, { [k]: n } as Partial<CableCalc>); }} />
  );
  return (
    <div className="calcs-section">
      <p className="muted small">{tx('Caduta di tensione ΔU = b·(ρ·L/S·cosφ + λ·L·sinφ)·I con rame a temperatura di esercizio; portata Iz da IEC 60364-5-52 (rame, 30 °C) per posa e isolante, moltiplicata per il fattore di correzione. Valori di tabella indicativi: verificali sulla norma o scrivi Iz a mano. Sezione e lunghezza vengono dal cavo (vista Cavi).')}</p>
      <div className="table-wrap">
        <table className="grid calcs-cables">
          <thead><tr>
            <th>{tx('Cavo')}</th><th>{tx('S (mm²)')}</th><th>{tx('L (m)')}</th><th>{tx('I (A)')}</th><th>{tx('Sistema')}</th><th>{tx('U (V)')}</th><th>cosφ</th>
            <th>{tx('Posa')}</th><th>{tx('Isolante')}</th><th>{tx('k corr.')}</th><th>{tx('Iz a mano')}</th><th>{tx('ΔU max (%)')}</th>
            <th>{tx('ΔU (V)')}</th><th>{tx('ΔU (%)')}</th><th>Iz (A)</th><th>{tx('S min ΔU')}</th><th>{tx('S min Iz')}</th><th>{tx('Esito')}</th>
          </tr></thead>
          <tbody>
            {cables.map(cb => {
              const k = calcs[cb.id] ?? {}, d = cableDefaults(k), r = cableResult(k, cb.cross, cb.length);
              return (
                <tr key={cb.id} className={k.i ? (r.ok ? '' : 'row-bad') : 'muted'}>
                  <td className="nowrap">-{cb.tag}</td><td>{cb.cross ?? '—'}</td><td>{cb.length ?? '—'}</td>
                  <td>{numCell(cb.id, 'i', k.i)}</td>
                  <td><select value={d.phases} onChange={e => set(cb.id, { phases: +e.target.value as 1 | 3 })}><option value={3}>3~</option><option value={1}>1~</option></select></td>
                  <td>{numCell(cb.id, 'u', k.u, String(d.u))}</td>
                  <td>{numCell(cb.id, 'cos', k.cos, String(d.cos))}</td>
                  <td><select value={d.method} title={tx(METHODS[d.method])} onChange={e => set(cb.id, { method: e.target.value as CableCalc['method'] })}>
                    {(Object.keys(METHODS) as NonNullable<CableCalc['method']>[]).map(m => <option key={m} value={m} title={tx(METHODS[m])}>{m}</option>)}
                  </select></td>
                  <td><select value={d.insulation} onChange={e => set(cb.id, { insulation: e.target.value as CableCalc['insulation'] })}><option value="PVC">PVC</option><option value="XLPE">XLPE/EPR</option></select></td>
                  <td>{numCell(cb.id, 'kCorr', k.kCorr, '1')}</td>
                  <td>{numCell(cb.id, 'iz', k.iz)}</td>
                  <td>{numCell(cb.id, 'duMax', k.duMax, String(d.duMax))}</td>
                  <td>{r.du !== undefined ? n2(r.du) : ''}</td>
                  <td className={r.duPct !== undefined && r.duPct > d.duMax ? 'error-text' : ''}>{r.duPct !== undefined ? n2(r.duPct) : ''}</td>
                  <td className={r.iz !== undefined && k.i && r.iz < k.i ? 'error-text' : ''}>{r.iz !== undefined ? n1(r.iz) : ''}</td>
                  <td>{k.i && r.sDrop ? String(r.sDrop).replace('.', ',') : ''}</td>
                  <td>{k.i && r.sIz ? String(r.sIz).replace('.', ',') : ''}</td>
                  <td>{k.i ? (r.ok ? 'OK' : r.problems.map(p => tx(p)).join(', ')) : ''}</td>
                </tr>
              );
            })}
            {!cables.length && <tr><td colSpan={18} className="muted pad">{tx('Nessun cavo nel progetto: i cavi si creano nella vista Cavi.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CalcsView() {
  const [tab, setTab] = useState<'thermal' | 'cables'>('thermal');
  return (
    <div className="reports calcs-view">
      <div className="parts-toolbar">
        <button className={tab === 'thermal' ? 'tab active' : 'tab'} onClick={() => setTab('thermal')}>{tx('Calcolo termico del quadro')}</button>
        <button className={tab === 'cables' ? 'tab active' : 'tab'} onClick={() => setTab('cables')}>{tx('Cavi: caduta di tensione e portata')}</button>
        <div className="tb-spacer" />
        <span className="muted small">{tx('I risultati sono anche nelle Liste e nelle pagine di lista')}</span>
      </div>
      {tab === 'thermal' ? <ThermalPanel /> : <CablesPanel />}
    </div>
  );
}
