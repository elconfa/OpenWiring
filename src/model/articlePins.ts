// Morsetti dei dispositivi presi dall'articolo: ogni elemento del dispositivo (bobina, contatti
// ausiliari, poli di potenza) prende le designazioni della prima funzione libera dello stesso tipo nel
// modello funzione dell'articolo (es. A1-A2, 13-14, 21-22, 1-2/3-4/5-6). Il risultato si scrive nei
// numeri dei morsetti dell'elemento (pinLabels), che restano modificabili a mano.
import type { FunctionTemplate, Part, Project } from './types';
import { buildDevices, deviceInfo, partsIndex, type PlacedElement } from './devices';
import { contactKind } from './checks';

export type FunctionKind = 'coil' | 'NO' | 'NC' | 'CO' | 'power';

/** Tipo della funzione dell'articolo */
export function functionKind(ft: FunctionTemplate): FunctionKind | undefined {
  const c = ft.connections.filter(Boolean);
  const cat = ft.category?.split('.')[0];
  if (cat === '200' || cat === '505' || (c.length === 2 && /^A1$/i.test(c[0]) && /^A2$/i.test(c[1]))) return 'coil';
  // Poli di potenza: numeri a una cifra (1-2, 3-4, 5-6) o L1-T1
  if (c.length === 2 && (c.every(x => /^\d$/.test(x)) || (/^L\d$/i.test(c[0]) && /^T\d$/i.test(c[1])))) return 'power';
  if (cat === '201') return 'NO';
  if (cat === '202') return 'NC';
  return contactKind(ft);
}

/** Tipo dell'elemento sullo schema */
export function elementKind(el: PlacedElement): FunctionKind | undefined {
  const c = el.sym.contact;
  if (c === 'NO' || c === 'NC' || c === 'CO' || c === 'power') return c;
  if (el.sym.role === 'main') return 'coil';
  return undefined;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Punti di connessione nell'ordine delle loro designazioni di serie (1, 2, 3… / 13, 14 / A1, A2) */
function orderedPins(el: PlacedElement) {
  return [...el.sym.pins].sort((a, b) => natural(a.label ?? '', b.label ?? ''));
}

export interface PinPlan {
  /** Morsetti da scrivere per ogni elemento (id dell'istanza → punto → designazione) */
  labels: Map<string, Record<string, string>>;
  /** Elementi di dispositivi con articolo senza una funzione adatta libera */
  unmatched: PlacedElement[];
  /** Dispositivi con articolo considerati */
  devices: number;
}

/**
 * Morsetti presi dagli articoli per i dispositivi indicati (assenti = tutti). Ogni funzione si usa
 * una volta sola; i poli di potenza usano tante funzioni quante sono le coppie di punti del simbolo.
 */
export function articlePinPlan(project: Project, library: Part[] = [], tags?: Set<string>): PinPlan {
  const parts = partsIndex(project, library);
  const labels = new Map<string, Record<string, string>>();
  const unmatched: PlacedElement[] = [];
  let devices = 0;
  for (const d of buildDevices(project).values()) {
    if (tags && !tags.has(d.tag)) continue;
    const partNr = deviceInfo(d.elements, d.main, parts).partNr;
    const part = partNr ? parts.get(partNr) : undefined;
    if (!part?.functionTemplates?.length) continue;
    devices++;
    const fts = part.functionTemplates.map(ft => ({ ft, kind: functionKind(ft), used: false }));
    // Tutte le designazioni dell'articolo, per gli articoli con una funzione per morsetto
    const pool = fts.flatMap(f => f.ft.connections.filter(Boolean).map(c => ({ c, f, used: false })));
    /** Designazione dell'articolo per il punto con la designazione di serie d: uguale, «d/…» o «…/d» */
    const byLabel = (d: string) => {
      const k = d.toLowerCase();
      return pool.find(x => !x.used && !x.f.used && (x.c.toLowerCase() === k || x.c.toLowerCase().startsWith(`${k}/`) || x.c.toLowerCase().endsWith(`/${k}`)));
    };
    // La bobina prima, poi gli altri elementi nell'ordine delle pagine
    const els = [...d.elements].sort((a, b) => Number(b.sym.role === 'main') - Number(a.sym.role === 'main') || a.pageIndex - b.pageIndex || a.inst.y - b.inst.y || a.inst.x - b.inst.x);
    for (const el of els) {
      const kind = elementKind(el);
      const pins = orderedPins(el);
      if (!pins.length || (!kind && el.sym.role !== 'single')) continue;
      // 1) Funzioni dello stesso tipo: una per i contatti e la bobina, una per coppia di punti per i poli
      const need = kind === 'power' ? Math.ceil(pins.length / 2) : 1;
      const free = kind ? fts.filter(f => !f.used && f.kind === kind && (kind === 'power' ? f.ft.connections.filter(Boolean).length === 2 : f.ft.connections.filter(Boolean).length === pins.length)) : [];
      if (free.length >= need) {
        const take = free.slice(0, need);
        take.forEach(f => { f.used = true; });
        const conns = take.flatMap(f => f.ft.connections.filter(Boolean).sort(natural));
        const rec: Record<string, string> = {};
        pins.forEach((p, i) => { if (conns[i] !== undefined) rec[p.id] = conns[i]; });
        labels.set(el.inst.id, rec);
        continue;
      }
      // 2) Un morsetto dell'articolo per ogni punto, con la stessa designazione di serie (1 → 1/L1)
      const found = pins.map(p => (p.label ? byLabel(p.label) : undefined));
      if (found.every(Boolean)) {
        const rec: Record<string, string> = {};
        pins.forEach((p, i) => { found[i]!.used = true; rec[p.id] = found[i]!.c; });
        labels.set(el.inst.id, rec);
        continue;
      }
      unmatched.push(el);
    }
  }
  return { labels, unmatched, devices };
}
