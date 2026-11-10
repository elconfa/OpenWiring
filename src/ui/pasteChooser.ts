// Incolla dallo schema. Elementi tagliati: si spostano così come sono (stessi morsetti, numeri filo,
// rimandi). Elementi copiati: ogni morsetto copiato propone il primo numero libero della sua
// morsettiera, partendo dal più basso e tenendo il piano (A, B…), e l'utente sceglie il numero.
import { useStore } from '../model/store';
import { getSymbol } from '../model/geometry';
import { stripOf } from '../model/devices';
import { freeTerminalNumbers, parseTerminalNo, terminalNo } from '../model/terminals';
import type { Pt } from '../model/types';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

const FREE_SHOWN = 40;

export async function pasteAt(at?: Pt) {
  const st = useStore.getState;
  const clip = st().clipboard;
  if (!clip) return;
  const cut = !!clip.cut;
  st().paste(at);
  if (!cut) await askPastedTerminals(st().selection);
}

/** Morsetti appena incollati (copie): per ogni morsetto, con i suoi piani, il numero scelto dall'utente */
export async function askPastedTerminals(ids: string[]) {
  const st = useStore.getState;
  const pick = new Set(ids);
  const groups = new Map<string, { strip: string; base: string; ids: string[]; levels: string[] }>();
  for (const pg of st().project.pages) for (const e of pg.elements) {
    if (!pick.has(e.id) || e.kind !== 'symbol' || !e.tag.includes(':')) continue;
    if (getSymbol(e.symbolId, st().project)?.role !== 'terminal') continue;
    const strip = stripOf(e.tag), t = parseTerminalNo(terminalNo(e.tag));
    if (isNaN(t.n)) continue;
    const k = `${strip}|${t.base}`;
    const g = groups.get(k) ?? { strip, base: t.base, ids: [], levels: [] };
    g.ids.push(e.id); if (t.level && !g.levels.includes(t.level)) g.levels.push(t.level);
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const project = st().project;
    const { free, used, spare } = freeTerminalNumbers(project, g.strip, g.levels, g.ids, FREE_SHOWN);
    const lv = g.levels.join('/');
    const name = (n: number) => (lv ? `-${g.strip}:${n}${g.levels.length > 1 ? ` (${g.levels.map(l => n + l).join(', ')})` : g.levels[0]}` : `-${g.strip}:${n}`);
    const items = free.map(n => ({ value: String(n), label: spare.has(n) ? `${name(n)} · ${tx('riserva')}` : name(n), tone: 'free' as const }));
    const r = await askCombo(
      tx('Numero del morsetto copiato (-{0})', g.strip),
      tx('Il primo numero libero della morsettiera, partendo dal più basso; il piano resta quello copiato. Scrivi un altro numero o sceglilo dall\'elenco.'),
      free[0] !== undefined ? String(free[0]) : g.base, items, 0, tx('numero'),
    );
    if (!r) continue;
    const n = r.text.trim().replace(/[A-Za-z]$/, '');
    if (!/^\d+$/.test(n) || n === g.base) continue;
    // Occupato solo se c'è già lo stesso piano (5A copiato accanto a un 5B disegnato va bene)
    if (used.has(parseInt(n, 10))) st().logMsg(tx('Il morsetto -{0}:{1} c\'è già: i due morsetti avranno lo stesso numero', g.strip, g.levels.length ? g.levels.map(l => n + l).join(', ') : n), 'warn');
    st().commit(p => {
      for (const pg of p.pages) for (const e of pg.elements) {
        if (e.kind !== 'symbol' || !g.ids.includes(e.id)) continue;
        const t = parseTerminalNo(terminalNo(e.tag));
        e.tag = `${g.strip}:${n}${t.level}`;
      }
    });
  }
}
