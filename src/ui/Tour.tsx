// Giro guidato al primo avvio (e da Aiuto ▸ Giro guidato): pochi passi che indicano le parti della
// finestra (File, schede, Cerca un comando, Modello, strumenti sul disegno, Simboli, barra di stato).
// Ogni passo evidenzia la parte con un contorno e una nota accanto; i passi senza la parte a video
// (es. la barra multifunzione con i menu classici) si saltano.
import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { keyLabel } from './shortcuts';
import { tx, tn } from '../i18n/ui';

const PREF = 'elettrocad.tourDone';
const tourDone = () => { try { return localStorage.getItem(PREF) === '1'; } catch { return true; } };
const setTourDone = () => { try { localStorage.setItem(PREF, '1'); } catch { /* solo comodità */ } };

/** Fa partire il giro guidato */
export const startTour = () => window.dispatchEvent(new Event('elettrocad:tour'));

interface Step { sel: string[]; title: string; text: () => string }
const STEPS: Step[] = [
  { sel: ['.rb-file', '.menubar .menu'], title: tn('File'), text: () => tx('Progetti recenti, nuovo progetto, apri, salva, importa ed esporta (PDF, DXF, DWG, Excel…).') },
  { sel: ['.rb-tabs', '.toolbar'], title: tn('Comandi'), text: () => tx('I comandi sono raggruppati in schede. Selezionando un simbolo compare la scheda arancione «Simbolo» con i comandi solo per lui.') },
  { sel: ['.palette-btn'], title: tn('Cerca un comando'), text: () => tx('Non sai dov\'è un comando? Premi {0} e scrivi cosa vuoi fare: comandi, pagine, sigle e impostazioni.', keyLabel('palette') || 'Ctrl+K') },
  { sel: ['.tree', 'aside.left'], title: tn('Modello##albero'), text: () => tx('Le pagine del progetto, i dispositivi, le morsettiere e i cavi: clic per andarci, tasto destro per i comandi.') },
  { sel: ['.active-bar'], title: tn('Strumenti di disegno'), text: () => tx('Seleziona, filo, collegamenti rapidi, l\'ultimo simbolo usato, morsetto, rimando, cavo e testo, sempre sopra lo schema.') },
  { sel: ['aside.right'], title: tn('Simboli'), text: () => tx('Clic su un simbolo e clic sul foglio per inserirlo; la stella lo mette tra i preferiti, che compaiono anche nella scheda Inserisci.') },
  { sel: ['.statusbar'], title: tn('Barra di stato'), text: () => tx('Errori e avvisi dei controlli (clic per la lista), griglia, aggancio, salvataggio e zoom.') },
];

const find = (st: Step) => st.sel.map(q => document.querySelector(q)).find((e): e is Element => !!e && e.getBoundingClientRect().width > 0);

export function Tour() {
  const [i, setI] = useState<number | null>(null);
  const [, relayout] = useState(0);
  useEffect(() => {
    const go = () => setI(0);
    window.addEventListener('elettrocad:tour', go);
    // Primo avvio: parte quando non c'è nessuna finestra aperta (dopo la schermata iniziale); se nel
    // frattempo se ne apre una, il giro si mette da parte e riparte dopo
    let t: ReturnType<typeof setTimeout> | undefined;
    let unsub = () => {};
    if (!tourDone()) {
      const busy = () => !!useStore.getState().dialog || !!document.querySelector('.modal-back');
      const check = () => {
        clearTimeout(t);
        if (tourDone()) { unsub(); return; }
        // (la finestra appena chiusa è ancora nel documento: si guarda di nuovo allo scadere)
        if (useStore.getState().dialog) { setI(null); return; }
        t = setTimeout(() => { if (!busy() && !tourDone()) setI(x => x ?? 0); }, 1200);
      };
      unsub = useStore.subscribe((s, prev) => { if (s.dialog !== prev.dialog) check(); });
      t = setTimeout(check, 2500);
    }
    const r = () => relayout(x => x + 1);
    window.addEventListener('resize', r);
    return () => { clearTimeout(t); unsub(); window.removeEventListener('elettrocad:tour', go); window.removeEventListener('resize', r); };
  }, []);
  // Passi senza la parte a video: si va al successivo
  const steps = STEPS.filter(s => find(s));
  if (i === null || !steps.length) return null;
  const k = Math.min(i, steps.length - 1);
  const step = steps[k];
  const el = find(step);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const end = () => { setTourDone(); setI(null); };
  const W = 320, H = 150;
  // Nota sotto la parte se c'è posto, altrimenti sopra; dentro la finestra
  const below = r.bottom + H + 16 < window.innerHeight;
  const big = r.height > window.innerHeight * 0.5;
  const top = big ? r.top + 40 : below ? r.bottom + 10 : Math.max(8, r.top - H - 10);
  const left = big && r.left > window.innerWidth / 2 ? r.left - W - 12 : big ? r.right + 12 : Math.max(8, Math.min(window.innerWidth - W - 8, r.left));
  return (
    <div className="tour" role="dialog" aria-label={tx('Giro guidato')}>
      <div className="tour-ring" style={{ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }} />
      <div className="tour-note" style={{ left: Math.max(8, Math.min(window.innerWidth - W - 8, left)), top, width: W }}>
        <div className="small muted">{tx('Passo {0} di {1}', k + 1, steps.length)}</div>
        <b>{tx(step.title)}</b>
        <p>{step.text()}</p>
        <div className="tour-actions">
          <button className="link" onClick={end}>{tx('Salta il giro')}</button>
          <span className="tb-spacer" />
          {k > 0 && <button onClick={() => setI(k - 1)}>{tx('Indietro')}</button>}
          {k < steps.length - 1 ? <button className="primary" autoFocus onClick={() => setI(k + 1)}>{tx('Avanti')}</button>
            : <button className="primary" autoFocus onClick={end}>{tx('Fine')}</button>}
        </div>
      </div>
    </div>
  );
}
