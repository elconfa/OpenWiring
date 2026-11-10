// Modalità BUS (come in SPAC Automazione 2026): una linea spessa porta più conduttori insieme, per
// alleggerire lo schema. I fili che la toccano hanno il nome del conduttore (L1, L2, PE…): i fili con
// lo stesso nome sullo stesso bus sono lo stesso conduttore. I bus che si toccano sono un bus solo;
// quelli con lo stesso nome lo sono anche su pagine diverse.
import type { Project, Pt, Wire, Cable, Part } from './types';
import { onSegmentInterior, samePt } from './geometry';
import { partConductors } from './cables';

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

/** Cavo rappresentato dal bus: quello con la sigla uguale al nome del bus (es. bus «W1112S1» = cavo -W1112S1) */
export function bundleCable(project: Project, busName: string | undefined): Cable | undefined {
  const n = busName?.trim().replace(/^-/, '');
  return n ? (project.cables ?? []).find(c => c.tag === n) : undefined;
}

/**
 * Conduttori del cavo che il bus rappresenta, in ordine: quelli del cavo del progetto con lo stesso
 * nome, altrimenti quelli dell'articolo scelto sul bus (dati del cavo dell'articolo)
 */
export function bundleConductorList(project: Project, group: string, busName?: string, parts?: Map<string, Part>): string[] | undefined {
  const cable = bundleCable(project, busName);
  if (cable) return cable.conductors;
  if (!parts) return undefined;
  const { groupOf } = bundleTaps(project);
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind === 'wire' && e.bundlePart && groupOf.get(e.id) === group) {
      const c = partConductors(parts.get(e.bundlePart)?.cable);
      if (c.length) return c;
    }
  }
  return undefined;
}

/**
 * Conduttori da proporre per un bus, in ordine: quelli del cavo (progetto o articolo: WH, BN, GN…
 * oppure 1, 2, 3…), altrimenti quelli già nel bus e poi i nomi comuni. count = fili che già lo usano
 */
export function conductorChoices(project: Project, taps: BundleTap[], group: string, busName?: string, parts?: Map<string, Part>): { name: string; count: number }[] {
  const inBus = bundleConductors(taps, group);
  const count = (n: string) => inBus.find(c => c.name === n)?.count ?? 0;
  const list = bundleConductorList(project, group, busName, parts);
  const base = list ?? COMMON_CONDUCTORS;
  return [...(list ? [] : inBus.map(c => c.name)), ...base, ...(list ? inBus.map(c => c.name) : [])]
    .filter((n, i, a) => a.indexOf(n) === i).map(name => ({ name, count: count(name) }));
}

/**
 * Nomi per i fili senza conduttore che toccano il bus su una pagina, da sinistra a destra (poi
 * dall'alto): prima i conduttori che sono entrati altrove e aspettano l'uscita, poi quelli liberi
 * del cavo (o 1, 2, 3… senza cavo). Restituisce quanti fili ha nominato.
 */
export function nameTapsInOrder(project: Project, bundleWireId: string, parts?: Map<string, Part>): number {
  const { taps, groupOf, names } = bundleTaps(project);
  const group = groupOf.get(bundleWireId);
  const page = project.pages.find(pg => pg.elements.some(e => e.id === bundleWireId));
  if (!group || !page) return 0;
  const open = taps.filter(t => t.group === group && t.pageId === page.id && !t.name).sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  if (!open.length) return 0;
  const list = bundleConductorList(project, group, names.get(group), parts);
  const inBus = bundleConductors(taps, group);
  const order = (n: string) => { const i = list?.indexOf(n) ?? -1; return i < 0 ? 1e6 : i; };
  // Conduttori già sulla pagina: non si ripetono qui
  const here = new Set(taps.filter(t => t.group === group && t.pageId === page.id && t.name).map(t => t.name!));
  const waiting = inBus.filter(c => c.count === 1 && !here.has(c.name)).map(c => c.name)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, undefined, { numeric: true }));
  const used = new Set(inBus.map(c => c.name));
  const free: string[] = list ? list.filter(n => !used.has(n)) : [];
  if (!list) for (let i = 1; free.length < open.length; i++) if (!used.has(String(i))) free.push(String(i));
  const pool = [...waiting, ...free];
  let n = 0;
  for (const t of open) {
    const name = pool.shift();
    if (!name) break;
    if (t.end) t.wire.tapEnd = name; else t.wire.tapStart = name;
    n++;
  }
  return n;
}
