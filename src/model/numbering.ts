// Numerazione di sigle dispositivo e numeri filo secondo i modelli del progetto.
import type { Project, ProjectSettings, Page } from './types';
import { DEFAULT_SETTINGS, columnOf } from './types';
import { buildDevices, stripOf } from './devices';
import { getSymbol } from './geometry';

export function settingsOf(p: Project): ProjectSettings {
  return { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
}

export interface NumberCtx {
  pagina: string;
  colonna: number;
  lettera: string;
  n: number;
  /** Codice del quadro della pagina (senza +) */
  quadro?: string;
}

const TOKEN = /\{(pagina|colonna|lettera|quadro|n)(?::(\d+|[Aa]))?\}/g;

/** Contatore in lettere: 1 → A, 26 → Z, 27 → AA */
function letters(n: number): string {
  let out = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}
const fromLetters = (s: string) => [...s.toUpperCase()].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0);

/**
 * Applica un modello, es. formatPattern("{pagina}{lettera}{n}", {pagina:"2", lettera:"K", n:1}) → "2K1".
 * {n:3} = almeno 3 cifre (001), {n:A} / {n:a} = contatore in lettere (A, B… Z, AA)
 */
export function formatPattern(pattern: string, ctx: NumberCtx): string {
  return pattern.replace(TOKEN, (_, k: keyof NumberCtx, opt?: string) => {
    if (k === 'n' && opt && /[Aa]/.test(opt)) return opt === 'a' ? letters(ctx.n).toLowerCase() : letters(ctx.n);
    const v = String(ctx[k] ?? '');
    return k === 'n' && opt ? v.padStart(parseInt(opt, 10), '0') : v;
  });
}

/** Codice del quadro di una pagina, per {quadro} */
export const panelCodeOf = (project: Project, page: Page) => project.panels?.find(x => x.id === page.panelId)?.code ?? '';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Espressione che riconosce le sigle prodotte dal modello e cattura il numero.
 * I segnaposto non fissati in `fixed` accettano qualsiasi valore.
 */
export function patternRegex(pattern: string, fixed: Partial<Record<'pagina' | 'colonna' | 'lettera' | 'quadro', string>>): RegExp {
  let re = '';
  let last = 0;
  for (const m of pattern.matchAll(TOKEN)) {
    re += esc(pattern.slice(last, m.index));
    const k = m[1] as keyof NumberCtx;
    if (k === 'n') re += m[2] === 'A' ? '([A-Z]+)' : m[2] === 'a' ? '([a-z]+)' : '(\\d+)';
    else if (fixed[k] !== undefined) re += esc(fixed[k]!);
    else re += k === 'lettera' ? '[A-Za-z]+' : '[^]*?';
    last = m.index! + m[0].length;
  }
  re += esc(pattern.slice(last));
  return new RegExp(`^${re}$`);
}

/** Valore del contatore in una sigla prodotta dal modello (anche in lettere), o undefined se non è del modello */
export function counterOf(pattern: string, fixed: Parameters<typeof patternRegex>[1], text: string): number | undefined {
  const m = patternRegex(pattern, fixed).exec(text);
  if (!m) return undefined;
  return /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : fromLetters(m[1]);
}

/** Prossima sigla libera per una lettera, nel punto di inserimento indicato */
export function nextTagFor(project: Project, letter: string, page: Page, x: number, extraTags: string[] = []): string {
  if (!letter) return '';
  const s = settingsOf(project);
  const pagina = page.name;
  const colonna = columnOf(x);
  const fixed = s.tagScope === 'page' ? { pagina, lettera: letter } : { lettera: letter };
  let max = 0;
  // Contano anche le sigle delle schede PLC non ancora disegnate
  for (const tag of [...allTags(project), ...(project.plc?.cards ?? []).map(c => c.tag), ...extraTags]) {
    const v = counterOf(s.tagFormat, fixed, tag);
    if (v !== undefined) max = Math.max(max, v);
  }
  return formatPattern(s.tagFormat, { pagina, colonna, lettera: letter, n: max + 1, quadro: panelCodeOf(project, page) });
}

function allTags(project: Project): string[] {
  const out: string[] = [];
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag) out.push(stripOf(e.tag));
  return out;
}

/**
 * Lettera di identificazione contenuta in una sigla: "2K1" → "K", "KA3" → "KA". Con il numero della
 * pagina (es. "12A") la parte iniziale uguale alla pagina non conta: "12AK1" → "K"
 */
export function letterOfTag(tag: string, pageName?: string): string | undefined {
  const t = pageName && /[A-Za-z]$/.test(pageName) && tag.toUpperCase().startsWith(pageName.toUpperCase()) ? tag.slice(pageName.length) : tag;
  return /[A-Za-z]+/.exec(t)?.[0];
}

/**
 * Rinumera tutti i dispositivi (esclusi morsetti, potenziali e rimandi) secondo il modello:
 * ordine pagina → colonna/posizione → riga. I contatti seguono la sigla della bobina.
 * Restituisce la mappa vecchia sigla → nuova sigla.
 */
export function renumberDevices(project: Project): Map<string, string> {
  const s = settingsOf(project);
  const devices = [...buildDevices(project).values()]
    .filter(d => d.elements.every(e => e.sym.role !== 'terminal' && e.sym.role !== 'pin') && !(project.plc?.cards ?? []).some(c => c.tag === d.tag))
    // La sigla segue lo schema multifilare, non l'unifilare o lo schema di rete
    .map(d => ({ d, anchor: d.main ?? d.elements.find(e => e.sym.role !== 'oneline' && e.sym.role !== 'netnode') ?? d.elements[0] }))
    .sort((a, b) => a.anchor.pageIndex - b.anchor.pageIndex || a.anchor.inst.x - b.anchor.inst.x || a.anchor.inst.y - b.anchor.inst.y);
  const counters = new Map<string, number>();
  const map = new Map<string, string>();
  for (const { d, anchor } of devices) {
    const letter = letterOfTag(d.tag, anchor.page.name) ?? anchor.sym.letter;
    if (!letter) continue;
    const key = `${s.tagScope === 'page' ? anchor.page.id : ''}|${letter}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    map.set(d.tag, formatPattern(s.tagFormat, { pagina: anchor.page.name, colonna: columnOf(anchor.inst.x), lettera: letter, n, quadro: panelCodeOf(project, anchor.page) }));
  }
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.kind !== 'symbol') continue;
      const role = getSymbol(e.symbolId, project)?.role;
      if (role === 'terminal' || role === 'pin' || role === 'potential' || role === 'link' || role === 'plc') continue;
      const nt = map.get(e.tag);
      if (nt !== undefined) e.tag = nt;
    }
  }
  return map;
}
