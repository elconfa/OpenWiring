// Indirizzi di rete: tutti i dispositivi con porte di rete (pin toccati da un filo di bus o nodi di
// rete), anche senza indirizzo, e le stazioni PLC. IP e nome Profinet (o ID Modbus, indirizzo
// EtherCAT…) si scrivono nella tabella; un dispositivo con interfacce separate si divide per porte.
import { useEffect, useMemo, useState } from 'react';
import { DialogShell, useDialogOpen } from './DialogShell';
import { useStore } from '../model/store';
import { networkAddressRows, IP_PROTOCOLS, type NetAddressRow } from '../model/network';
import { askChecks } from './Ask';
import * as A from './actions';
import { tx } from '../i18n/ui';

function Cell({ value, onCommit, placeholder, disabled }: { value: string; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="cell-input" value={v} placeholder={placeholder} disabled={disabled} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }} />
  );
}

/** Che cosa va nella colonna dell'indirizzo, secondo i protocolli */
function addressHint(r: NetAddressRow): string {
  if (r.protocols.includes('Profinet') || /profinet/i.test(r.station?.kind ?? '')) return tx('nome Profinet');
  if (r.protocols.some(p => /modbus rtu|rs485|can/i.test(p))) return tx('ID del nodo');
  if (r.protocols.some(p => /ethercat/i.test(p))) return tx('indirizzo EtherCAT');
  return tx('nome o indirizzo');
}

export function NetAddressDialog() {
  const open = useDialogOpen('netAddresses');
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const rows = useMemo(() => (open ? networkAddressRows(project, library) : []), [open, project, library]);
  if (!open) return null;
  const st = useStore.getState;
  const close = () => st().setDialog(null);
  const target = (r: NetAddressRow) => (r.nif ? { key: r.nif.key } : { station: r.station!.name });
  const goTo = (r: NetAddressRow) => {
    if (!r.el) return;
    st().setPage(r.el.page.id); st().setSelection([r.el.inst.id]); st().setView('schema'); close();
  };
  const split = async (r: NetAddressRow) => {
    const pick = await askChecks(tx('Porte con un indirizzo proprio'),
      tx('Scegli le porte di -{0} che formano un\'interfaccia separata, con IP e nome propri (es. X2 fuori dallo switch di X1).', r.tag),
      r.nif!.ports.map(p => ({ label: `${p.port || '?'}${p.protocols.length ? ` · ${p.protocols.join(', ')}` : ''}` })), tx('Separa'));
    if (!pick) return;
    const ports = r.nif!.ports.filter((_, i) => pick[i]).map(p => p.port);
    if (ports.length && ports.length < r.nif!.ports.length) st().splitNetInterface(r.nif!.key, ports);
  };
  const missing = rows.filter(r => r.nif && !r.ip && r.protocols.some(p => IP_PROTOCOLS.includes(p))).length;
  return (
    <DialogShell className="wide" label={tx('Indirizzi di rete')} onClose={close}>
      <h3>{tx('Indirizzi di rete')}</h3>
      <p className="muted small">
        {tx('Tutti i dispositivi con una porta di rete: i pin toccati da un filo di bus (Profinet, Ethernet, Modbus…) e i nodi di rete. Le porte su IP di un dispositivo sono una sola interfaccia (switch integrato, un IP e un nome); ogni bus non IP ha la sua. «Separa…» dà a delle porte un indirizzo proprio.')}
      </p>
      {!rows.length ? <p className="muted">{tx('Nessun dispositivo di rete: collega le porte con lo strumento Bus o inserisci un nodo di rete.')}</p> : (
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table className="grid">
            <thead><tr>
              <th>{tx('Dispositivo')}</th><th>{tx('Descrizione')}</th><th>{tx('Luogo')}</th><th>{tx('Porte')}</th><th>{tx('Protocolli')}</th>
              <th>{tx('Indirizzo IP')}</th><th>{tx('Nome Profinet / indirizzo')}</th><th>{tx('Rete IP')}</th><th /><th />
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const ipUse = !r.nif || r.protocols.some(p => IP_PROTOCOLS.includes(p));
                return (
                  <tr key={r.nif?.key ?? `st|${r.station!.name}`}>
                    <td className="nowrap">{r.el ? <button className="link" onClick={() => goTo(r)} title={tx('Mostra sullo schema')}>-{r.tag}</button> : <span>{r.station?.name}</span>}</td>
                    <td>{r.description}{r.station && r.nif ? <span className="muted small"> · {tx('stazione {0}', r.station.name)}</span> : null}</td>
                    <td className="nowrap">{r.panel ? `+${r.panel.code}` : ''}</td>
                    <td>{r.ports.join(', ')}</td>
                    <td>{r.protocols.join(', ')}</td>
                    <td><Cell value={r.ip} disabled={!ipUse} placeholder={ipUse ? '192.168.0.10' : '—'} onCommit={v => st().setNetAddress(target(r), { ip: v })} /></td>
                    <td><Cell value={r.address} placeholder={addressHint(r)} onCommit={v => st().setNetAddress(target(r), { address: v })} /></td>
                    <td className="small">{r.network?.name ?? ''}</td>
                    <td className="small" style={{ color: r.problems.length ? 'var(--danger, #cf222e)' : undefined }}>{r.problems.map(p => tx(p)).join('; ')}</td>
                    <td className="nowrap">
                      {r.nif && r.nif.ports.length > 1 && <button className="mini" onClick={() => void split(r)} title={tx('Dai ad alcune porte un indirizzo proprio')}>{tx('Separa…')}</button>}
                      {r.nif?.slot.kind === 'def' && <button className="mini" onClick={() => st().mergeNetInterface(r.nif!.key)} title={tx('Riporta queste porte nell\'interfaccia principale del dispositivo')}>{tx('Riunisci')}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button disabled={!project.ipNetworks?.length || !missing} onClick={() => st().assignIps()}
          title={project.ipNetworks?.length ? tx('Un IP libero della rete giusta alle interfacce su IP che non ne hanno') : tx('Prima crea una rete IP (Progetto ▸ Nuova rete IP)')}>{tx('Assegna IP')}</button>
        <button onClick={() => st().assignProfinetNames()} title={tx('Nome dalla sigla e dal luogo (es. +Q1 -2A1 → q1-2a1) per i dispositivi Profinet senza nome; i nomi già scritti restano')}>{tx('Nomi Profinet automatici')}</button>
        <button onClick={() => { close(); A.openReport('Indirizzi di rete'); }} title={tx('La stessa tabella tra le liste: stampa, PDF, CSV ed Excel')}>{tx('Lista ed esportazione')}</button>
        <span className="tb-spacer" />
        <button className="primary" onClick={close}>{tx('Chiudi')}</button>
      </div>
    </DialogShell>
  );
}
