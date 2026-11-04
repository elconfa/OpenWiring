// Cerca un comando (Ctrl+K / ⌘K): si scrive cosa si vuole fare e si preme Invio. Trova i comandi di
// tutti i menu (con il tasto rapido accanto), le pagine, i dispositivi e le pagine delle impostazioni.
// A campo vuoto mostra i comandi usati di recente.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { buildDevices } from '../model/devices';
import { buildMenus, type Item } from './MenuBar';
import { openSettingsAt, settingsLeaves } from './SettingsDialog';
import { tx, tn } from '../i18n/ui';
import { Icon } from './icons';
import { ribbonIcons } from './Ribbon';

export interface PaletteEntry {
  id: string;
  label: string;
  /** Dove si trova (menu, gruppo, pagina…) */
  where: string;
  group: 'cmd' | 'page' | 'device' | 'settings';
  key?: string;
  icon?: string;
  title?: string;
  run: () => void;
}

const GROUPS: Record<PaletteEntry['group'], string> = { cmd: tn('Comandi'), page: tn('Pagine'), device: tn('Dispositivi'), settings: tn('Impostazioni') };
const ICON_OF: Record<PaletteEntry['group'], string> = { cmd: 'more', page: 'page', device: 'coil', settings: 'settings' };

/** Testo per il confronto: minuscolo e senza accenti */
export const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Punteggio di una voce per la ricerca (0 = non trovata): tutte le parole scritte devono comparire;
 * vale di più l'inizio del nome, poi l'inizio di una parola, poi il resto.
 */
export function score(label: string, where: string, q: string): number {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const l = fold(label), w = fold(where);
  let total = 0;
  for (const word of words) {
    if (l.startsWith(word)) total += 10;
    else if (new RegExp(`(^|[\\s\\-/(«.,:])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l)) total += 6;
    else if (l.includes(word)) total += 3;
    else if (w.includes(word)) total += 1;
    else return 0;
  }
  // A parità, i nomi più corti (più vicini a quello che si è scritto)
  return total + Math.max(0, 2 - l.length / 40);
}

/** I comandi dei menu come voci della ricerca (senza le voci disattivate in questo momento) */
export function menuEntries(menus: { name: string; items: Item[] }[]): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const m of menus) {
    let header = '';
    for (const it of m.items) {
      if ('sep' in it) continue;
      if ('header' in it) { header = it.header; continue; }
      if (it.disabled) continue;
      const where = header ? `${tx(m.name)} ▸ ${header}` : tx(m.name);
      out.push({ id: `cmd:${m.name}:${header}:${it.label}`, label: it.label, where, group: 'cmd', key: it.key, title: it.title, run: it.run });
    }
  }
  return out;
}

const RECENT = 'elettrocad.paletteRecent';
const recentIds = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const remember = (id: string) => { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recentIds().filter(x => x !== id)].slice(0, 8))); } catch { /* solo comodità */ } };

export function CommandPalette() {
  const open = useStore(s => s.dialog === 'palette');
  if (!open) return null;
  return <PaletteBody />;
}

function PaletteBody() {
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // Le voci si calcolano all'apertura, con lo stato di quel momento
  const all = useMemo(() => {
    const s = st();
    const icons = ribbonIcons(s);
    const entries: PaletteEntry[] = menuEntries(buildMenus(s)).map(e => ({ ...e, icon: icons.get(e.label) ?? icons.get(e.label.replace(/…$/, '')) }));
    for (const p of s.project.pages) {
      entries.push({ id: `page:${p.id}`, label: `${p.name}  ${p.title}`.trim(), where: tx('Pagina'), group: 'page', icon: 'page',
        run: () => { st().setView('schema'); st().setPage(p.id); } });
    }
    const devices = [...buildDevices(s.project).values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
    for (const d of devices) {
      const el = d.elements[0];
      if (!el) continue;
      entries.push({ id: `dev:${d.tag}`, label: `-${d.tag}`, where: [d.description, `/${el.page.name}`].filter(Boolean).join(' · '), group: 'device', icon: 'coil',
        run: () => {
          const x = st();
          x.setView('schema'); x.setPage(el.page.id);
          x.setSelection(d.elements.filter(e => e.page.id === el.page.id).map(e => e.inst.id));
          x.setTreeSel({ type: 'device', tag: d.tag });
        } });
    }
    for (const l of settingsLeaves()) {
      entries.push({ id: `set:${l.id}`, label: `${tx(l.branch)} ▸ ${tx(l.title)}`, where: tx('Impostazioni'), group: 'settings', icon: 'settings', run: () => openSettingsAt(l.id) });
    }
    return entries;
  }, [st]);

  const shown = useMemo(() => {
    if (!q.trim()) {
      const byId = new Map(all.map(e => [e.id, e]));
      const recent = recentIds().map(id => byId.get(id)).filter((e): e is PaletteEntry => !!e);
      return recent.length ? recent : all.filter(e => e.group === 'cmd').slice(0, 12);
    }
    // Un numero o una sigla cerca prima pagine e dispositivi
    const order: PaletteEntry['group'][] = /^[-=+]?\d|^-/.test(q.trim()) ? ['page', 'device', 'cmd', 'settings'] : ['cmd', 'page', 'device', 'settings'];
    return all.map(e => ({ e, v: score(e.label, e.where, q.replace(/^-/, '')) }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v || order.indexOf(a.e.group) - order.indexOf(b.e.group))
      .slice(0, 60)
      .sort((a, b) => order.indexOf(a.e.group) - order.indexOf(b.e.group))
      .map(x => x.e);
  }, [all, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const close = () => st().setDialog(null);
  const run = (e: PaletteEntry) => { remember(e.id); close(); e.run(); };
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(i => Math.min(shown.length - 1, i + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(i => Math.max(0, i - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const e = shown[sel]; if (e) run(e); }
  };
  let last = '';
  return (
    <div className="modal-back palette-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-label={tx('Cerca un comando')} onKeyDown={onKey}>
        <div className="pal-q">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Cosa vuoi fare? Comandi, pagine, sigle, impostazioni…')}
            role="combobox" aria-expanded aria-controls="pal-list" aria-activedescendant={shown[sel] ? `pal-${sel}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={list}>
          {!q.trim() && shown.length > 0 && <div className="pal-grp">{recentIds().length ? tx('Usati di recente') : tx('Comandi')}</div>}
          {shown.map((e, i) => {
            const head = q.trim() && e.group !== last ? <div className="pal-grp">{tx(GROUPS[e.group])}</div> : null;
            last = e.group;
            return (
              <div key={e.id}>
                {head}
                <div id={`pal-${i}`} role="option" aria-selected={i === sel} className={i === sel ? 'pal-item sel' : 'pal-item'} title={e.title}
                  onMouseMove={() => { if (i !== sel) setSel(i); }} onClick={() => run(e)}>
                  <Icon name={e.icon ?? ICON_OF[e.group]} size={16} />
                  <span className="pal-label">{e.label}</span>
                  <span className="pal-where">{e.where}</span>
                  {e.key && <kbd>{e.key}</kbd>}
                </div>
              </div>
            );
          })}
          {!shown.length && <div className="pal-empty">{tx('Nessun risultato per «{0}»', q)}</div>}
        </div>
        <div className="pal-foot small muted">{tx('↑↓ per scegliere · Invio per eseguire · Esc per chiudere')}</div>
      </div>
    </div>
  );
}
