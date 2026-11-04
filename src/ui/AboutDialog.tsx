// Informazioni sul programma e scorciatoie da tastiera.
import { useStore } from '../model/store';
import { COMMANDS, keysOf, showCombo } from './shortcuts';
import { openSettingsAt } from './SettingsDialog';
import { tx, tn } from '../i18n/ui';

/** Tasti fissi (quelli dei comandi si cambiano nelle impostazioni, vedi shortcuts.ts) */
const FIXED_KEYS: [string, string][] = [
  ['Esc', tn('Annulla il comando')], [tn('Frecce'), tn('Sposta la selezione (Maiusc: passo lungo)')],
  [tn('Alt + trascina, tasto centrale'), tn('Sposta la vista')], [tn('Rotella'), tn('Zoom')],
];

declare const __APP_VERSION__: string | undefined;

/** Dove si scaricano le versioni, chi ha progettato il programma e come contattarlo */
const RELEASES = 'https://github.com/elconfa/OpenWiring/releases';
const AUTHOR = 'Massimo Confalonieri';
const CONTACT = 'elconfa.ing@gmail.com';
const DISCLAIMER = tn('OpenWiring è un software indipendente, non affiliato né approvato da EPLAN GmbH, Rittal, SDProget o dai costruttori citati. EPLAN, SPAC, AutoCAD, Excel, Siemens, Schneider Electric, QElectroTech e gli altri nomi sono marchi dei rispettivi titolari, citati solo per indicare formati di file e compatibilità. OpenWiring non include macro, simboli o cataloghi dei costruttori: importi solo file che hai il diritto di usare, rispettandone le condizioni d\'uso. La lettura dei formati EDZ, XML e CSV deriva dall\'analisi dei file di dati, a fini di interoperabilità.');

export function AboutDialog() {
  const open = useStore(s => s.dialog === 'about');
  const st = useStore.getState;
  if (!open) return null;
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  return (
    <div className="modal-back" onMouseDown={() => st().setDialog(null)}>
      <div className="modal about" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Informazioni')}>
        <h3>{tx('OpenWiring')} {version}</h3>
        <div className="about-body">
        <p className="small">{tx('CAD elettrico open source (licenza GPL-3.0) per schemi multifilari, morsettiere, PLC e liste.')}</p>
        <table className="grid about-info">
          <tbody>
            <tr><td>{tx('Versione')}</td><td><b>{version || '—'}</b></td></tr>
            <tr><td>{tx('Scarica le versioni')}</td><td><a href={RELEASES} target="_blank" rel="noreferrer">{RELEASES.replace('https://', '')}</a></td></tr>
            <tr><td>{tx('Progettista')}</td><td>{AUTHOR}</td></tr>
            <tr><td>{tx('Contatto')}</td><td><a href={`mailto:${CONTACT}`}>{CONTACT}</a></td></tr>
          </tbody>
        </table>
        <h4>{tx('Marchi e dati di terzi')}</h4>
        <p className="small muted">{tx(DISCLAIMER)}</p>
        <h4>{tx('Scorciatoie da tastiera')}</h4>
        <table className="grid">
          <tbody>
            {COMMANDS.filter(c => keysOf(c.id).length).map(c => <tr key={c.id}><td className="nowrap mono">{keysOf(c.id).map(showCombo).join(', ')}</td><td>{tx(c.name)}</td></tr>)}
            {FIXED_KEYS.map(([k, l]) => <tr key={l}><td className="nowrap mono">{tx(k)}</td><td>{tx(l)}</td></tr>)}
          </tbody>
        </table>
        <p><button onClick={() => openSettingsAt('shortcuts')}>{tx('Cambia le scorciatoie…')}</button></p>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={() => st().setDialog(null)}>{tx('Chiudi')}</button>
        </div>
      </div>
    </div>
  );
}
