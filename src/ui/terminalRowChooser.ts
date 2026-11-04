// Strumento «Morsetti in fila»: i fili scelti sullo schema ricevono un morsetto ciascuno. Qui si
// chiedono morsettiera, piani e numerazione, poi si inseriscono i morsetti.
import { useStore } from '../model/store';
import { allStrips } from '../model/terminals';
import { stripLevels, type TerminalPick, type TerminalRowMode } from '../model/terminalRow';
import { ask } from './Ask';
import { tx } from '../i18n/ui';

/** Ultime scelte: si propongono di nuovo */
let last: { mode: TerminalRowMode; levels?: number } = { mode: 'row' };

export async function confirmTerminalRow(picks: TerminalPick[], strip0?: string) {
  const st = useStore.getState;
  if (!picks.length) { st().logMsg(tx('Nessun filo scelto: traccia una linea attraverso i fili o Ctrl+clic sui fili'), 'warn'); return; }
  const { project } = st();
  const strips = allStrips(project);
  const strip = strip0 ?? (st().stripSel && strips.includes(st().stripSel!) ? st().stripSel : strips[strips.length - 1]) ?? 'X1';
  const levels = strips.includes(strip) ? stripLevels(project, strip) : last.levels ?? 1;
  const r = await ask(tx('Morsetti in fila: {0} fili', picks.length), [
    { label: tx('Morsettiera'), value: strip },
    { label: tx('Piani'), value: String(Math.min(3, levels)), options: [1, 2, 3].map(n => ({ value: String(n), label: n > 1 ? tx('{0} piani ({1})', n, Array.from({ length: n }, (_, i) => `1${String.fromCharCode(65 + i)}`).join(', ')) : tx('1 piano (1, 2, 3…)') })) },
    { label: tx('Numerazione'), value: last.mode, options: [
      { value: 'row', label: tx('Nell\'ordine dei fili (1A, 1B, 2A, 2B…)') },
      { value: 'level', label: tx('Per piano (1A, 2A, 3A… poi 1B, 2B…)') },
      { value: 'pin', label: tx('Secondo i pin del dispositivo collegato') },
    ] },
    { label: tx('Primo numero (vuoto = il primo libero)'), value: '' },
  ]);
  const name = r?.[0].trim().replace(/^-/, '');
  if (!r || !name) return;
  const mode = r[2] as TerminalRowMode;
  const lv = parseInt(r[1], 10) || 1;
  last = { mode, levels: lv };
  const start = parseInt(r[3], 10);
  st().placeTerminalRow(picks, { strip: name, levels: lv, mode, start: isNaN(start) ? undefined : start });
}

/** Avvia lo strumento (dalla vista Morsettiere con la morsettiera scelta) */
export function startTerminalRow(strip?: string) {
  const st = useStore.getState();
  st.setView('schema');
  st.setTool({ kind: 'terminalRow', picks: [], ...(strip ? { strip } : {}) });
  st.logMsg(tx('Morsetti in fila: traccia una linea attraverso i fili (due clic), Ctrl/Cmd+clic per aggiungere o togliere un filo; i numeri seguono l\'ordine scelto. Invio o tasto destro per inserire, Esc per annullare'));
}
