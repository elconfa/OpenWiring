import { startTerminalRow } from './terminalRowChooser';
import { useStore } from '../model/store';
import * as A from './actions';
import { PROTOCOLS, protocolLabel } from '../model/network';
import { keyLabel } from './shortcuts';
import { tx } from '../i18n/ui';
import { Icon } from './icons';
import { tipProps } from './RichTooltip';

function Btn({ icon, label, onClick, active, disabled, title }: {
  icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button className={`tb-btn${active ? ' active' : ''}`} onClick={onClick} disabled={disabled} {...tipProps(label, title, undefined, icon)}>
      <span className="tb-icon"><Icon name={icon} size={20} /></span>
      <span className="tb-label">{label}</span>
    </button>
  );
}


/** Suggerimento con il tasto del comando, se ne ha uno (Impostazioni ▸ Scorciatoie da tastiera) */
const hint = (text: string, id: string) => { const k = keyLabel(id); return k ? `${text} (${k})` : text; };
export function Toolbar() {
  const tool = useStore(s => s.tool);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const hasSel = useStore(s => s.selection.length > 0);
  const busProtocol = useStore(s => s.busProtocol);
  const labels = useStore(s => s.toolbarLabels);
  const st = useStore.getState;
  // Comandi di disegno più usati; tutti gli altri sono nella barra dei menu
  return (
    <div className={labels ? 'toolbar' : 'toolbar compact'}>
      <div className="tb-group">
        <Btn icon="new" label={tx('Nuovo')} onClick={A.newProject} />
        <Btn icon="open" label={tx('Apri')} onClick={A.openProject} title={hint(tx('Apri'), 'open')} />
        <Btn icon="save" label={tx('Salva')} onClick={() => A.saveProject()} title={hint(tx('Salva'), 'save')} />
      </div>
      <div className="tb-group">
        <Btn icon="undo" label={tx('Annulla##modifica')} onClick={() => st().undo()} disabled={!canUndo} title={hint(tx('Annulla##modifica'), 'undo')} />
        <Btn icon="redo" label={tx('Ripeti')} onClick={() => st().redo()} disabled={!canRedo} title={hint(tx('Ripeti'), 'redo')} />
      </div>
      <div className="tb-group">
        <Btn icon="select" label={tx('Seleziona')} active={tool.kind === 'select'} onClick={() => st().setTool({ kind: 'select' })} title={tx('Seleziona (Esc)')} />
        <Btn icon="wire" label={tx('Filo')} active={tool.kind === 'wire' && !tool.bus && !tool.bundle} onClick={() => st().setTool({ kind: 'wire' })} title={hint(tx('Disegna collegamento'), 'wire')} />
        <Btn icon="quickV" label={tx('Rapido V')} active={tool.kind === 'quickWire' && tool.axis === 'v'} onClick={() => st().setTool({ kind: 'quickWire', axis: 'v' })} title={tx('Collegamento rapido in verticale (V): clic tra due punti di connessione uno sopra l\'altro')} />
        <Btn icon="quickH" label={tx('Rapido H')} active={tool.kind === 'quickWire' && tool.axis === 'h'} onClick={() => st().setTool({ kind: 'quickWire', axis: 'h' })} title={tx('Collegamento rapido in orizzontale (H): clic tra due punti di connessione uno accanto all\'altro')} />
        <Btn icon="wireNumbers" label={tx('Allinea n.')} active={tool.kind === 'wireLabels'} onClick={() => st().setTool({ kind: 'wireLabels' })} title={tx('Allinea numeri filo (N): traccia una linea attraverso i fili, i numeri vanno sulla linea')} />
        <Btn icon="terminal" label={tx('Morsetti in fila')} active={tool.kind === 'terminalRow'} onClick={() => startTerminalRow()} title={tx('Morsetti in fila (M): linea attraverso i fili o Ctrl/Cmd+clic sui fili, poi Invio; un morsetto su ogni filo, numerato nell\'ordine scelto')} />
        <Btn icon="bundle" label={tx('Bus fili')} active={tool.kind === 'wire' && !!tool.bundle} onClick={() => st().setTool({ kind: 'wire', bundle: true })}
          title={tx('Modalità BUS: una linea spessa porta più conduttori; i fili che vi entrano hanno il nome del conduttore (L1, PE…)')} />
        <Btn icon="bus" label={tx('Bus')} active={tool.kind === 'wire' && !!tool.bus} onClick={() => st().setTool({ kind: 'wire', bus: st().busProtocol })}
          title={tx('Collegamento di rete/bus tra le porte dei nodi (protocollo a destra)')} />
        <select className="tb-select" value={busProtocol} onChange={e => st().setBusProtocol(e.target.value)} title={tx('Protocollo dei collegamenti di rete')}>
          {PROTOCOLS.map(p => <option key={p.name} value={p.name}>{protocolLabel(p.name)}</option>)}
        </select>
        <Btn icon="zone" label={tx('Luogo')} active={tool.kind === 'zone'} onClick={() => st().setTool({ kind: 'zone' })} title={tx('Riquadro di luogo (+): clic su due angoli, quello che sta dentro prende il luogo')} />
        <Btn icon="cable" label={tx('Cavo')} active={tool.kind === 'cable'} onClick={() => st().setTool({ kind: 'cable' })} title={tx('Linea di definizione cavo: clic prima e dopo i fili da includere')} />
        <Btn icon="wiredef" label={tx('Sezione')} active={tool.kind === 'wiredef'} onClick={() => st().setTool({ kind: 'wiredef' })} title={tx('Sezione dei fili: si tira una riga attraverso i fili e la sezione va a tutti')} />
        <Btn icon="text" label={tx('Testo')} active={tool.kind === 'text'} onClick={() => st().setTool({ kind: 'text' })} />
        <Btn icon="rotate" label={tx('Ruota')} onClick={() => st().rotateSelection()} disabled={!hasSel} title={hint(tx('Ruota'), 'rotate')} />
        <Btn icon="delete" label={tx('Elimina')} onClick={() => st().deleteSelection()} disabled={!hasSel} title={tx('Elimina (Canc)')} />
        <Btn icon="fit" label={tx('Adatta')} onClick={A.fitView} title={hint(tx('Adatta pagina'), 'fit')} />
        <Btn icon="search" label={tx('Cerca')} onClick={() => st().setDialog('search')} title={hint(tx('Cerca e sostituisci'), 'search')} />
        <Btn icon="check" label={tx('Verifica')} onClick={() => { st().setReportTab('checks'); st().setView('reports'); }} title={tx('Controlli di progetto: sigle, contatti, rimandi, fili aperti, morsetti, PLC')} />
      </div>
      <div className="tb-group">
        <Btn icon="import" label="EDZ" onClick={A.importParts} title={tx('Importa articoli dai produttori (pacchetti EDZ, XML o CSV)')} />
        <Btn icon="pdf" label="PDF" onClick={A.exportPdfAction} title={tx('Esporta schemi e liste in PDF')} />
      </div>
    </div>
  );
}
