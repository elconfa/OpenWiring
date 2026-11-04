// Pagina File della barra multifunzione (come il «Backstage» di Office): a pagina intera, a sinistra i
// comandi del file (nuovo, apri, salva, stampa…), a destra la schermata iniziale con i progetti recenti
// oppure l'elenco di cosa si può importare ed esportare, con la spiegazione di ogni voce.
import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import * as A from './actions';
import { buildMenus, type Item } from './MenuBar';
import { StartBody } from './StartScreen';
import { openSettingsAt } from './SettingsDialog';
import { keyLabel } from './shortcuts';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

declare const __APP_VERSION__: string | undefined;

type Pane = 'start' | 'import' | 'export';

/** Voci del menu File sotto un titolo (Importa, Esporta) */
function section(items: Item[], header: string): Extract<Item, { run: () => void }>[] {
  const out: Extract<Item, { run: () => void }>[] = [];
  let inside = false;
  for (const it of items) {
    if ('header' in it) inside = it.header === header;
    else if ('sep' in it) { if (inside && out.length) inside = false; }
    else if (inside) out.push(it);
  }
  return out;
}

export function Backstage() {
  const open = useStore(s => s.dialog === 'backstage');
  const [pane, setPane] = useState<Pane>('start');
  useEffect(() => { if (open) setPane('start'); }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') useStore.getState().setDialog(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  if (!open) return null;
  const st = useStore.getState;
  const close = () => st().setDialog(null);
  // I comandi chiudono prima la pagina (molti aprono un dialogo del sistema o un'altra finestra)
  const go = (f: () => unknown) => () => { close(); void f(); };
  const file = buildMenus(st())[0].items;
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const nav = (icon: string, label: string, run: () => void, opts: { key?: string; on?: boolean } = {}) => (
    <button className={opts.on ? 'bs-nav on' : 'bs-nav'} onClick={run}>
      <Icon name={icon} size={18} /><span>{label}</span>{opts.key && <kbd>{opts.key}</kbd>}
    </button>
  );
  const list = (header: string) => (
    <div className="bs-list">
      {section(file, header).map((it, k) => (
        <button key={k} className="bs-row" disabled={it.disabled} onClick={go(it.run)}>
          <b>{it.label}</b>{it.title && <span className="small muted">{it.title}</span>}
        </button>
      ))}
    </div>
  );
  return (
    <div className="backstage modal-back" role="dialog" aria-label={tx('File')}>
      <nav className="bs-side">
        <button className="bs-back" onClick={close} title={tx('Torna al progetto (Esc)')}><Icon name="back" size={20} /></button>
        {nav('home', tx('Inizio'), () => setPane('start'), { on: pane === 'start' })}
        {nav('new', tx('Nuovo progetto'), go(A.newProject), { key: keyLabel('new') })}
        {nav('open', tx('Apri…'), go(A.openProject), { key: keyLabel('open') })}
        {nav('open', tx('Apri accanto…'), go(A.openProjectAlongside))}
        {nav('save', tx('Salva'), go(() => A.saveProject()), { key: keyLabel('save') })}
        {nav('saveAs', tx('Salva con nome…'), go(() => A.saveProject(true)), { key: keyLabel('saveAs') })}
        <div className="bs-sep" />
        {nav('import', tx('Importa'), () => setPane('import'), { on: pane === 'import' })}
        {nav('export', tx('Esporta'), () => setPane('export'), { on: pane === 'export' })}
        {nav('print', tx('Stampa…'), go(() => st().setDialog('print')), { key: keyLabel('print') })}
        {nav('pdf', 'PDF…', go(A.exportPdfAction))}
        <div className="bs-fill" />
        {nav('settings', tx('Impostazioni'), go(() => openSettingsAt('commandBar')))}
        {nav('info', tx('Informazioni'), go(() => st().setDialog('about')))}
      </nav>
      <main className="bs-main">
        {pane === 'start' && <>
          <h2>OpenWiring <span className="muted">{version}</span></h2>
          <div className="start-screen"><StartBody close={close} /></div>
        </>}
        {pane === 'import' && <><h2>{tx('Importa')}</h2>{list(tx('Importa'))}</>}
        {pane === 'export' && <><h2>{tx('Esporta')}</h2>{list(tx('Esporta'))}</>}
      </main>
    </div>
  );
}
