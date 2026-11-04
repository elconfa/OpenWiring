// Dove arriva un filo: seguendolo lungo i suoi tratti (non oltre una giunzione a T) e attraverso i
// rimandi fino alla pagina di arrivo, il primo pin di dispositivo o morsetto. È quello che serve al
// cablatore (pin, morsetto), invece di tutti i punti del potenziale: un +24 V ne ha decine.
import type { Page, Project, Pt, Wire } from './types';
import { pinsWorld } from './geometry';
import { allPlaced } from './devices';
import type { Net, NetPin } from './netlist';

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Dati della ricerca, da creare una volta e usare per più fili dello stesso progetto */
export interface LandingCtx {
  project: Project;
  /** Rimandi con lo stesso nome */
  linksNamed: (tag: string) => { id: string; tag: string; pageId: string; pos: Pt }[];
  linkAt: (pageId: string, p: Pt) => { id: string; tag: string; pageId: string; pos: Pt } | undefined;
  /** Fili che finiscono nel punto */
  endsAt: (pageId: string, p: Pt) => Wire[];
}

const keyOf = (pageId: string, p: Pt) => `${pageId}|${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

export function landingCtx(project: Project): LandingCtx {
  type L = { id: string; tag: string; pageId: string; pos: Pt };
  let byTag: Map<string, L[]> | undefined, byPos: Map<string, L> | undefined;
  const links = () => {
    if (!byTag) {
      byTag = new Map(); byPos = new Map();
      for (const e of allPlaced(project)) {
        if (e.sym.role !== 'link' || !e.sym.pins[0]) continue;
        const l = { id: e.inst.id, tag: e.inst.tag, pageId: e.page.id, pos: pinsWorld(e.inst, e.sym)[0] };
        byTag.set(l.tag, [...(byTag.get(l.tag) ?? []), l]);
        byPos.set(keyOf(l.pageId, l.pos), l);
      }
    }
    return { byTag, byPos: byPos! };
  };
  const ends = new Map<string, Map<string, Wire[]>>();
  return {
    project,
    linksNamed: tag => links().byTag.get(tag) ?? [],
    linkAt: (pageId, p) => links().byPos.get(keyOf(pageId, p)),
    endsAt: (pageId, p) => {
      let m = ends.get(pageId);
      if (!m) {
        m = new Map();
        for (const w of project.pages.find(x => x.id === pageId)?.elements ?? []) {
          if (w.kind !== 'wire' || w.points.length < 2 || w.bus || w.bundle !== undefined) continue;
          for (const q of [w.points[0], w.points[w.points.length - 1]]) { const k = keyOf(pageId, q); m.set(k, [...(m.get(k) ?? []), w]); }
        }
        ends.set(pageId, m);
      }
      return m.get(keyOf(pageId, p)) ?? [];
    },
  };
}

/**
 * Pin su cui arrivano i fili che partono da `from` (sulla pagina pageId): `wire` = parti solo da
 * questo filo (da tutti e due i capi), altrimenti da tutti i fili che toccano il punto. I pin degli
 * elementi in `exclude` (es. il morsetto stesso) non contano.
 */
export function landing(ctx: LandingCtx, pg: Page, net: Net, opts: { wire?: Wire; from?: Pt; exclude?: Set<string> }): NetPin[] {
  const out: NetPin[] = [];
  const seen = new Set<string>(), links = new Set<string>();
  const excluded = (p: NetPin) => opts.exclude?.has(p.el.inst.id);
  // Pin del conduttore per posizione (una volta per filo)
  const pinsAt = new Map<string, NetPin[]>();
  for (const p of net.pins) { const k = keyOf(p.el.page.id, p.pos); pinsAt.set(k, [...(pinsAt.get(k) ?? []), p]); }
  const walk = (pageId: string, w: Wire | undefined, from: Pt, arrived = false) => {
    const at = (pinsAt.get(keyOf(pageId, from)) ?? []).filter(p => !excluded(p));
    const real = at.filter(p => p.el.sym.role !== 'link' && p.el.sym.role !== 'potential');
    if (real.length) { for (const p of real) if (!out.includes(p)) out.push(p); return; }
    const link = arrived ? undefined : ctx.linkAt(pageId, from);
    if (link) {
      // Rimando: si riparte dai rimandi con lo stesso nome sulle altre pagine
      if (links.has(link.id)) return;
      links.add(link.id);
      for (const o of ctx.linksNamed(link.tag)) {
        if (o.pageId === pageId || links.has(o.id)) continue;
        links.add(o.id);
        walk(o.pageId, undefined, o.pos, true);
      }
      return;
    }
    if (at.length) return;
    const touching = ctx.endsAt(pageId, from).filter(o => o !== w);
    if (touching.length !== 1 || seen.has(touching[0].id)) return;
    follow(pageId, touching[0], from);
  };
  const follow = (pageId: string, o: Wire, from: Pt) => {
    seen.add(o.id);
    walk(pageId, o, same(o.points[0], from) ? o.points[o.points.length - 1] : o.points[0]);
  };
  if (opts.wire) {
    seen.add(opts.wire.id);
    walk(pg.id, opts.wire, opts.wire.points[0]);
    walk(pg.id, opts.wire, opts.wire.points[opts.wire.points.length - 1]);
  } else if (opts.from) {
    const from = opts.from;
    // Dal pin: ogni filo che ci arriva (anche due fili sullo stesso morsetto)
    for (const o of ctx.endsAt(pg.id, from)) follow(pg.id, o, from);
  }
  return out;
}
