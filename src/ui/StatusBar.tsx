// Parti della barra di stato (in fondo alla finestra): errori e avvisi dei controlli (clic: lista dei
// controlli), griglia e aggancio, stato del salvataggio e zoom dello schema con il cursore.
import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { checkProject, acceptedOf } from '../model/checks';
import * as A from './actions';
import { keyLabel } from './shortcuts';
import { Icon } from './icons';
import { tx } from '../i18n/ui';

/** Errori e avvisi dei controlli di progetto, ricalcolati poco dopo l'ultima modifica */
export function IssuesIndicator() {
  const project = useStore(s => s.project);
  const library = useStore(s => s.library);
  const [n, setN] = useState<{ err: number; warn: number } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const issues = checkProject(project, library).filter(i => !acceptedOf(project, i));
        setN({ err: issues.filter(i => i.level === 'error').length, warn: issues.filter(i => i.level === 'warn').length });
      } catch { setN(null); }
    }, 1200);
    return () => clearTimeout(t);
  }, [project, library]);
  if (!n) return null;
  const open = () => A.openReport('checks');
  if (!n.err && !n.warn) return <button className="sb-btn sb-ok" onClick={open} title={tx('Controlli di progetto')}><Icon name="check" size={13} />{tx('Nessun errore')}</button>;
  return (
    <button className="sb-btn" onClick={open} title={tx('Controlli di progetto: clic per la lista')}>
      {n.err > 0 && <span className="sb-err">● {tx('{0} errori', n.err)}</span>}
      {n.warn > 0 && <span className="sb-warn">▲ {tx('{0} avvisi', n.warn)}</span>}
    </button>
  );
}

/** Rimandi in attesa del corrispondente: clic porta al successivo (dopo quello selezionato) */
export function WaitingLinks({ waiting }: { waiting: { id: string; pageId: string }[] }) {
  const selection = useStore(s => s.selection);
  if (!waiting.length) return null;
  const st = useStore.getState;
  const go = () => {
    const k = waiting.findIndex(w => selection.includes(w.id));
    const w = waiting[(k + 1) % waiting.length];
    st().setPage(w.pageId);
    st().setSelection([w.id]);
    st().setView('schema');
  };
  return (
    <button className="sb-btn" onClick={go} title={tx('Rimandi senza corrispondente, non ancora disegnato (/…): clic per andare al prossimo')}>
      <span className="sb-warn">{tx('Rimandi in attesa: {0}', waiting.length)}</span>
    </button>
  );
}

/** Griglia e aggancio ai punti, accesi o spenti con un clic */
export function SnapToggles() {
  const gridMode = useStore(s => s.gridMode);
  const objectSnap = useStore(s => s.objectSnap);
  const st = useStore.getState;
  return (
    <span className="sb-toggles">
      <button className={gridMode !== 'off' ? 'sb-tog on' : 'sb-tog'} aria-pressed={gridMode !== 'off'} onClick={() => st().setGridMode(gridMode === 'off' ? 'auto' : 'off')}
        title={tx('Punti della griglia sullo schema (si vedono quando si è ingranditi)')}>{tx('Griglia')}</button>
      <button className={objectSnap ? 'sb-tog on' : 'sb-tog'} aria-pressed={objectSnap} onClick={() => st().setObjectSnap(!objectSnap)}
        title={tx('Aggancio ai punti di connessione e ai vertici dei fili; spento resta l\'aggancio alla griglia')}>{tx('Aggancio')}</button>
    </span>
  );
}

/** Tempo trascorso in parole brevi */
function ago(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return tx('adesso');
  if (min < 60) return tx('{0} min fa', min);
  const h = Math.floor(min / 60);
  return h < 24 ? tx('{0} h fa', h) : new Date(Date.now() - ms).toLocaleDateString();
}

/** Nome del file e stato del salvataggio */
export function SaveState() {
  const dirty = useStore(s => s.dirty);
  const filePath = useStore(s => s.filePath);
  const savedAt = useStore(s => s.savedAt);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  const name = filePath ? filePath.split(/[\\/]/).pop() : tx('non salvato');
  const state = !filePath ? '' : dirty ? tx('modifiche non salvate') : savedAt ? tx('salvato {0}', ago(Date.now() - savedAt)) : '';
  return (
    <button className={`sb-btn${dirty ? ' sb-dirty' : ''}`} onClick={() => void A.saveProject()} title={`${filePath ?? tx('non ancora salvato in un file')}\n${tx('Clic: salva')}${keyLabel('save') ? ` (${keyLabel('save')})` : ''}`}>
      {dirty && <span className="sb-dot" />}{name}{state && <span className="muted"> · {state}</span>}
    </button>
  );
}

const Z_MIN = 25, Z_MAX = 2000;
/** Cursore logaritmico: 0–100 ↔ 25%–2000% */
const toSlider = (z: number) => Math.round((Math.log(z / Z_MIN) / Math.log(Z_MAX / Z_MIN)) * 100);
const fromSlider = (v: number) => Z_MIN * Math.pow(Z_MAX / Z_MIN, v / 100);
const setZoom = (pct: number) => window.dispatchEvent(new CustomEvent('elettrocad:setZoom', { detail: Math.min(Z_MAX, Math.max(Z_MIN, pct)) }));

/** Zoom dello schema: meno, cursore, più, percentuale (clic: pagina intera) */
export function ZoomControl() {
  const zoom = useStore(s => s.zoom);
  if (zoom === null) return null;
  return (
    <span className="sb-zoom">
      <button className="sb-tog" onClick={() => setZoom(zoom / 1.25)} title={tx('Riduci')}>−</button>
      <input type="range" min={0} max={100} value={toSlider(zoom)} onChange={e => setZoom(fromSlider(Number(e.target.value)))} aria-label={tx('Zoom')} />
      <button className="sb-tog" onClick={() => setZoom(zoom * 1.25)} title={tx('Ingrandisci')}>+</button>
      <button className="sb-tog sb-pct" onClick={A.fitView} title={`${tx('Adatta pagina')}${keyLabel('fit') ? ` (${keyLabel('fit')})` : ''}`}>{zoom}%</button>
    </span>
  );
}
