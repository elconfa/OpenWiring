// Modalità BUS (come in SPAC Automazione 2026): una linea spessa porta più conduttori insieme, per
// alleggerire lo schema. I fili che la toccano hanno il nome del conduttore (L1, L2, PE…): i fili con
// lo stesso nome sullo stesso bus sono lo stesso conduttore. I bus che si toccano sono un bus solo;
// quelli con lo stesso nome lo sono anche su pagine diverse.
import type { Project, Pt, Wire } from './types';
import { onSegmentInterior, samePt } from './geometry';

export const isBundle = (w: Wire) => w.bundle !== undefined;

/** Estremo di un filo che entra in un bus */
export interface BundleTap {
  wire: Wire;
  pageId: string;
  /** 0 = estremo iniziale, 1 = finale */
  end: 0 | 1;
  at: Pt;
  /** Punto successivo del filo (per capire da che parte va) */
  next: Pt;
  bundle: Wire;
  /** Bus a cui appartiene (gruppo dei bus collegati o con lo stesso nome) */
  group: string;
  name?: string;
}

const onPolyline = (p: Pt, pts: Pt[]) => pts.some((q, i) => samePt(p, q) || (i < pts.length - 1 && onSegmentInterior(p, q, pts[i + 1])));

/** Gruppi dei bus e fili che vi entrano */
export function bundleTaps(project: Project): { taps: BundleTap[]; groupOf: Map<string, string>; names: Map<string, string> } {
  const parent = new Map<string, string>();
  const find = (a: string): string => { let r = a; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const byPage = project.pages.map(pg => ({ pg, bundles: pg.elements.filter((e): e is Wire => e.kind === 'wire' && isBundle(e)) }));
  for (const { bundles } of byPage) {
    for (const b of bundles) {
      if (b.bundle) union(b.id, `nome|${b.bundle}`);
      for (const o of bundles) {
        if (o === b) continue;
        if ([b.points[0], b.points[b.points.length - 1]].some(e => onPolyline(e, o.points))) union(b.id, o.id);
      }
    }
  }
  const groupOf = new Map<string, string>();
  const names = new Map<string, string>();
  for (const { bundles } of byPage) for (const b of bundles) {
    const g = find(b.id);
    groupOf.set(b.id, g);
    if (b.bundle && !names.has(g)) names.set(g, b.bundle);
  }
  const taps: BundleTap[] = [];
  for (const { pg, bundles } of byPage) {
    if (!bundles.length) continue;
    for (const w of pg.elements) {
      if (w.kind !== 'wire' || isBundle(w) || w.points.length < 2) continue;
      const n = w.points.length;
      ([[0, w.points[0], w.points[1]], [1, w.points[n - 1], w.points[n - 2]]] as [0 | 1, Pt, Pt][]).forEach(([end, at, next]) => {
        const b = bundles.find(x => onPolyline(at, x.points));
        if (b) taps.push({ wire: w, pageId: pg.id, end, at, next, bundle: b, group: groupOf.get(b.id)!, name: (end ? w.tapEnd : w.tapStart) || undefined });
      });
    }
  }
  return { taps, groupOf, names };
}

/** Conduttori di un bus con quante volte entrano o escono, in ordine (L1, L2, L3, N, PE…) */
export function bundleConductors(taps: BundleTap[], group: string): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of taps) if (t.group === group && t.name) m.set(t.name, (m.get(t.name) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Nomi proposti per i conduttori di un bus nuovo */
export const COMMON_CONDUCTORS = ['L1', 'L2', 'L3', 'N', 'PE', 'L+', 'M', '+24V', '0V'];
