// Pagina dell'articolo salvata dal browser dall'EPLAN Data Portal (File ▸ Salva pagina, anche
// compressa in zip). Quando la macro non si può scaricare, la pagina contiene comunque
// l'anteprima vettoriale (SVG) di ogni variante: dalla variante di schema multifilare ("…emav0r1")
// si ricava il simbolo con i suoi punti di connessione, dai campi della pagina l'articolo.
import type { Part, PinDef, PinDir, Prim, Pt, SymbolDef } from '../model/types';

export interface DataPortalResult { parts: Part[]; symbols: SymbolDef[]; warnings: string[] }

/** La pagina è dell'EPLAN Data Portal e contiene l'anteprima di una macro */
export const isDataPortalPage = (html: string) => /<svg\b/i.test(html) && /\.ema(?:%20)?v\d+r\d+/i.test(html);

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const r2 = (v: number) => Math.round(v * 100) / 100 + 0;

function parseTransform(s: string | null): M {
  let m = ID;
  if (!s) return m;
  for (const t of s.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (t[1] === 'matrix' && v.length === 6) m = mul(m, v as M);
    else if (t[1] === 'translate') m = mul(m, [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]);
    else if (t[1] === 'scale') m = mul(m, [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]);
    else if (t[1] === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
      const r: M = [c, s2, -s2, c, 0, 0];
      m = v.length >= 3 ? mul(mul(mul(m, [1, 0, 0, 1, v[1], v[2]]), r), [1, 0, 0, 1, -v[1], -v[2]]) : mul(m, r);
    }
  }
  return m;
}

interface Style { size?: number; anchor?: 'start' | 'middle' | 'end'; dash?: boolean }
function parseStyles(svg: Element): Map<string, Style> {
  const out = new Map<string, Style>();
  const css = [...svg.getElementsByTagName('style')].map(s => s.textContent ?? '').join('\n');
  for (const r of css.matchAll(/(?:\w+)?\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const p = Object.fromEntries([...r[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(x => [x[1], x[2].trim()]));
    out.set(r[1], {
      size: p['font-size'] ? parseFloat(p['font-size']) : undefined,
      anchor: p['text-anchor'] as Style['anchor'],
      dash: !!p['stroke-dasharray'] && p['stroke-dasharray'] !== 'none',
    });
  }
  return out;
}

/** Punti di un tracciato SVG (M L H V Z A C Q), un elenco per ogni sottotracciato */
function pathPolys(d: string): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, cmd = '', cur: Pt = { x: 0, y: 0 }, start: Pt = cur, poly: Pt[] = [];
  const num = () => parseFloat(tok[i++]);
  const flush = (closed = false) => { if (poly.length > 1) out.push({ pts: poly, closed }); poly = []; };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const pt = (x: number, y: number): Pt => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    if (C === 'Z') { flush(true); cur = start; continue; }
    if (C === 'M') { flush(); cur = start = pt(num(), num()); poly = [cur]; cmd = rel ? 'l' : 'L'; continue; }
    if (C === 'L') cur = pt(num(), num());
    else if (C === 'H') { const x = num(); cur = { x: rel ? cur.x + x : x, y: cur.y }; }
    else if (C === 'V') { const y = num(); cur = { x: cur.x, y: rel ? cur.y + y : y }; }
    else if (C === 'C' || C === 'Q') {
      const n = C === 'C' ? 3 : 2, ps = Array.from({ length: n }, () => pt(num(), num()));
      const p0 = cur;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        poly.push(n === 3
          ? { x: u * u * u * p0.x + 3 * u * u * t * ps[0].x + 3 * u * t * t * ps[1].x + t * t * t * ps[2].x, y: u * u * u * p0.y + 3 * u * u * t * ps[0].y + 3 * u * t * t * ps[1].y + t * t * t * ps[2].y }
          : { x: u * u * p0.x + 2 * u * t * ps[0].x + t * t * ps[1].x, y: u * u * p0.y + 2 * u * t * ps[0].y + t * t * ps[1].y });
      }
      cur = ps[n - 1];
      continue;
    } else if (C === 'A') {
      const rx = Math.abs(num()), ry = Math.abs(num()), rot = num(), large = num(), sweep = num(), end = pt(num(), num());
      poly.push(...arcPoints(cur, end, rx, ry, rot, !!large, !!sweep));
      cur = end;
      continue;
    } else { i++; continue; }
    poly.push(cur);
  }
  flush();
  return out;
}

/** Arco ellittico SVG in punti (parametrizzazione al centro, specifica SVG F.6.5) */
function arcPoints(p1: Pt, p2: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean): Pt[] {
  if (!rx || !ry) return [p2];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p1.x - p2.x) / 2, dy = (p1.y - p2.y) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cp * cx1 - sp * cy1 + (p1.x + p2.x) / 2, cy = sp * cx1 + cp * cy1 + (p1.y + p2.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
  return Array.from({ length: n }, (_, j) => {
    const t = t1 + (dt * (j + 1)) / n;
    return { x: cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, y: cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp };
  });
}

interface Raw {
  prims: { p: Prim; inPin?: string }[];
  pins: { label: string; at: Pt; dir: PinDir }[];
  /** Punti con la sola scritta: il simbolo (es. la terra) è disegnato fuori dal gruppo */
  pending: { label: string; near: Pt }[];
  tag?: Pt;
  frames: { x0: number; y0: number; x1: number; y1: number }[];
}

const textOf = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
const kidsOf = (e: Element) => [...e.childNodes].filter((n): n is Element => n.nodeType === 1);

/** Simbolo dall'anteprima SVG di una variante di schema */
export function svgToSymbol(svg: Element, id: string, name: string, category: string): SymbolDef | undefined {
  const styles = parseStyles(svg);
  const st = (e: Element) => styles.get((e.getAttribute('class') ?? '').split(/\s+/)[0]) ?? {};
  const raw: Raw = { prims: [], pins: [], pending: [], frames: [] };
  const walk = (e: Element, m: M, pin?: string) => {
    const tag = e.localName ?? e.tagName;
    const mm = mul(m, parseTransform(e.getAttribute('transform')));
    if (tag === 'title' || tag === 'desc' || tag === 'style' || tag === 'defs' || tag === 'image') return;
    if (tag === 'g') {
      // Gruppo di una funzione "=+-A1:L1": punto di connessione L1
      const t = kidsOf(e).find(k => (k.localName ?? k.tagName) === 'title');
      const m2 = t && /:([^:]+)$/.exec(textOf(t));
      if (m2) {
        const label = m2[1].trim();
        const before = raw.prims.length;
        for (const k of kidsOf(e)) walk(k, mm, label);
        addPin(raw, label, before);
        return;
      }
    }
    if (tag === 'path') {
      const dash = !!st(e).dash;
      for (const sp of pathPolys(e.getAttribute('d') ?? '')) {
        const pts = sp.pts.map(q => ap(mm, q.x, q.y));
        if (pts.length === 2 && !sp.closed) raw.prims.push({ p: { t: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, ...(dash ? { dash } : {}) }, inPin: pin });
        else raw.prims.push({ p: { t: 'poly', pts, ...(sp.closed ? { closed: true } : {}), ...(dash ? { dash } : {}) }, inPin: pin });
      }
      return;
    }
    if (tag === 'line') {
      const a = ap(mm, +(e.getAttribute('x1') ?? 0), +(e.getAttribute('y1') ?? 0)), b = ap(mm, +(e.getAttribute('x2') ?? 0), +(e.getAttribute('y2') ?? 0));
      raw.prims.push({ p: { t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, inPin: pin });
      return;
    }
    if (tag === 'rect') {
      const x = +(e.getAttribute('x') ?? 0), y = +(e.getAttribute('y') ?? 0), w = +(e.getAttribute('width') ?? 0), h = +(e.getAttribute('height') ?? 0);
      raw.prims.push({ p: { t: 'poly', pts: [ap(mm, x, y), ap(mm, x + w, y), ap(mm, x + w, y + h), ap(mm, x, y + h)], closed: true }, inPin: pin });
      return;
    }
    if (tag === 'circle' || tag === 'ellipse') {
      const c = ap(mm, +(e.getAttribute('cx') ?? 0), +(e.getAttribute('cy') ?? 0));
      const sx = Math.hypot(mm[0], mm[1]), sy = Math.hypot(mm[2], mm[3]);
      const rx = +(e.getAttribute('r') ?? e.getAttribute('rx') ?? 0) * sx, ry = +(e.getAttribute('r') ?? e.getAttribute('ry') ?? 0) * sy;
      raw.prims.push({ p: Math.abs(rx - ry) < 0.01 ? { t: 'circle', cx: c.x, cy: c.y, r: rx } : { t: 'ellipse', cx: c.x, cy: c.y, rx, ry }, inPin: pin });
      return;
    }
    if (tag === 'polyline' || tag === 'polygon') {
      const v = (e.getAttribute('points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      const pts: Pt[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push(ap(mm, v[k], v[k + 1]));
      if (pts.length > 1) raw.prims.push({ p: { t: 'poly', pts, ...(tag === 'polygon' ? { closed: true } : {}) }, inPin: pin });
      return;
    }
    if (tag === 'text') {
      const s = textOf(e);
      if (!s) return;
      const p = ap(mm, +(e.getAttribute('x') ?? 0), +(e.getAttribute('y') ?? 0));
      const style = st(e);
      // Rotazione: direzione dell'asse x del testo dopo le trasformazioni
      const rot = r2((Math.atan2(mm[1], mm[0]) * 180) / Math.PI);
      const scale = Math.hypot(mm[0], mm[1]);
      raw.prims.push({ p: { t: 'text', x: p.x, y: p.y, s, size: r2((style.size ?? 2.5) * scale), anchor: style.anchor ?? 'start', ...(rot ? { rot } : {}) }, inPin: pin });
      return;
    }
    for (const k of kidsOf(e)) walk(k, mm, pin);
  };
  walk(svg, ID);
  // Punti con la sola scritta: l'estremo di un tratto sul bordo della cornice del dispositivo,
  // il più vicino alla scritta (entro 10 mm), rivolto verso l'esterno
  const frame = raw.prims.map(x => x.p).find((p): p is Extract<Prim, { t: 'poly' }> => p.t === 'poly' && !!p.closed && !!p.dash && p.pts.length === 4);
  if (frame) {
    const x0 = Math.min(...frame.pts.map(q => q.x)), x1 = Math.max(...frame.pts.map(q => q.x));
    const y0 = Math.min(...frame.pts.map(q => q.y)), y1 = Math.max(...frame.pts.map(q => q.y));
    const ends = raw.prims.filter(x => !x.inPin).flatMap(({ p }) => (p.t === 'line' ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }]
      : p.t === 'poly' && !p.closed ? [p.pts[0], p.pts[p.pts.length - 1]] : []));
    const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
    for (const p of raw.pending) {
      const best = ends.filter(q => near(q.y, y0) || near(q.y, y1) || near(q.x, x0) || near(q.x, x1))
        .map(q => ({ q, d: Math.hypot(q.x - p.near.x, q.y - p.near.y) })).filter(x => x.d <= 10).sort((a, b) => a.d - b.d)[0];
      if (!best) continue;
      const q = best.q;
      const dir: PinDir = near(q.y, y1) ? 'down' : near(q.y, y0) ? 'up' : near(q.x, x0) ? 'left' : 'right';
      raw.pins.push({ label: p.label, at: { x: r2(q.x), y: r2(q.y) }, dir });
    }
  }
  if (!raw.pins.length) return undefined;

  // Riquadro della macro (il rettangolo più grande, sottile) e intestazione fuori da esso: si tolgono
  const bounds = (p: Prim) => {
    const pts = p.t === 'poly' ? p.pts : p.t === 'line' ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : [];
    return pts.length ? { x0: Math.min(...pts.map(q => q.x)), y0: Math.min(...pts.map(q => q.y)), x1: Math.max(...pts.map(q => q.x)), y1: Math.max(...pts.map(q => q.y)) } : undefined;
  };
  const boxes = raw.prims.filter(x => x.p.t === 'poly' && x.p.closed && x.p.pts.length === 4).map(x => ({ x, b: bounds(x.p)! }));
  const area = (b: { x0: number; y0: number; x1: number; y1: number }) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const outer = boxes.sort((a, b) => area(b.b) - area(a.b))[0];
  const pinPts = raw.pins.map(p => p.at);
  const inside = (b: { x0: number; y0: number; x1: number; y1: number }, q: Pt) => q.x >= b.x0 - 0.01 && q.x <= b.x1 + 0.01 && q.y >= b.y0 - 0.01 && q.y <= b.y1 + 0.01;
  // È il riquadro della macro se contiene tutti i punti e almeno un testo ne resta fuori o lo tocca
  const macroBox = outer && !outer.x.p.hasOwnProperty('dash') && pinPts.every(q => inside(outer.b, q)) ? outer : undefined;
  const prims: Prim[] = [];
  let tagPos: Pt | undefined;
  for (const x of raw.prims) {
    if (macroBox && x === macroBox.x) continue;
    if (x.p.t === 'text') {
      if (macroBox && !inside(macroBox.b, x.p)) continue;
      // Sigla del dispositivo ("-A1"): la scrive OpenWiring
      if (/^[=+-][\w.]*\d$/.test(x.p.s) && /^-/.test(x.p.s) && !x.inPin) { tagPos = { x: x.p.x, y: x.p.y }; continue; }
      // Designazione del punto di connessione: la scrive OpenWiring accanto al punto
      if (x.inPin && x.p.s === x.inPin) continue;
    }
    prims.push(x.p);
  }

  // Origine sul primo punto in alto a sinistra: i punti restano sulla griglia di 4 mm
  const o = [...raw.pins].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)[0].at;
  const L = (q: Pt): Pt => ({ x: r2(q.x - o.x), y: r2(q.y - o.y) });
  const out: Prim[] = prims.map(p => {
    switch (p.t) {
      case 'line': { const a = L({ x: p.x1, y: p.y1 }), b = L({ x: p.x2, y: p.y2 }); return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
      case 'poly': return { ...p, pts: p.pts.map(L) };
      case 'circle': { const c = L({ x: p.cx, y: p.cy }); return { ...p, cx: c.x, cy: c.y, r: r2(p.r) }; }
      case 'ellipse': { const c = L({ x: p.cx, y: p.cy }); return { ...p, cx: c.x, cy: c.y, rx: r2(p.rx), ry: r2(p.ry) }; }
      case 'text': { const q = L(p); return { ...p, x: q.x, y: q.y }; }
      default: return p;
    }
  });
  const pins: PinDef[] = raw.pins.map((p, i) => ({ id: String(i + 1), ...L(p.at), dir: p.dir, label: p.label }));
  const all = [...pins, ...out.flatMap(p => (p.t === 'line' ? [{ x: p.x1, y: p.y1 }] : p.t === 'poly' ? p.pts : []))];
  const minX = Math.min(...all.map(q => q.x)), minY = Math.min(...all.map(q => q.y));
  return {
    id, name, category, letter: 'A', role: 'single', prims: out, pins,
    tagPos: tagPos ? L(tagPos) : { x: r2(minX - 2), y: r2(minY + 4) },
    description: 'Ricostruito dall\'anteprima della macro sull\'EPLAN Data Portal',
    source: 'EPLAN Data Portal (anteprima)',
  };
}

/**
 * Punto di connessione di un gruppo "=+-A1:L1": il cerchietto (r ≈ 1) e il tratto che ne esce;
 * il punto è l'estremo del tratto lontano dal cerchietto, la direzione è quella del tratto.
 */
function addPin(raw: Raw, label: string, from: number) {
  const own = raw.prims.slice(from);
  const c = own.map(x => x.p).find((p): p is Extract<Prim, { t: 'circle' }> => p.t === 'circle' && p.r <= 1.6);
  const lines = own.map(x => x.p).filter((p): p is Extract<Prim, { t: 'line' }> => p.t === 'line');
  let at: Pt | undefined, dir: PinDir = 'up';
  if (c) {
    const ends = lines.flatMap(l => [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
    const far = ends.map(q => ({ q, d: Math.hypot(q.x - c.cx, q.y - c.cy) })).sort((a, b) => b.d - a.d)[0];
    if (far && far.d > c.r + 0.2) {
      at = far.q;
      const dx = far.q.x - c.cx, dy = far.q.y - c.cy;
      dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    } else at = { x: c.cx, y: c.cy };
  } else if (lines.length) at = { x: lines[0].x1, y: lines[0].y1 };
  if (at) raw.pins.push({ label, at: { x: r2(at.x), y: r2(at.y) }, dir });
  else {
    const t = own.map(x => x.p).find(p => p.t === 'text');
    if (t && t.t === 'text') raw.pending.push({ label, near: { x: t.x, y: t.y } });
  }
}

/** Campi dell'articolo dalla pagina: etichetta seguita dal valore (pagina in italiano, inglese o tedesco) */
function pageFields(html: string): Record<string, string> {
  // Testi della pagina nell'ordine in cui compaiono (senza leggerla come documento: nessuna risorsa esterna)
  const toks = html.replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ').split(/<[^>]*>/)
    .map(t => decodeEntities(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const LABELS: Record<string, RegExp> = {
    partNr: /^(Numero articolo|Part number|Artikelnummer)$/i,
    manufacturer: /^(Produttore|Manufacturer|Hersteller)$/i,
    typeNr: /^(Numero tipo|Type number|Typnummer)$/i,
    orderNr: /^(Numero d'ordine|Order number|Bestellnummer)$/i,
    descr: /^(Descrizione|Description|Beschreibung)$/i,
    designation: /^(Designazione|Designation|Bezeichnung)$/i,
    group: /^(Gruppo di prodotti|Product group|Produktgruppe)$/i,
  };
  const out: Record<string, string> = {};
  for (let i = 0; i < toks.length; i++) {
    for (const [k, re] of Object.entries(LABELS)) {
      if (out[k] || !re.test(toks[i])) continue;
      let j = i + 1;
      // Codice della lingua prima del testo ("IT_IT")
      if (/^[A-Z]{2}_[A-Z]{2}$/.test(toks[j] ?? '')) j++;
      if (toks[j] && !Object.values(LABELS).some(r => r.test(toks[j]))) out[k] = toks[j];
    }
  }
  return out;
}

const decodeEntities = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => {
  const k = e.toLowerCase();
  if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[k];
});

/** Articolo e simbolo dalla pagina salvata del Data Portal */
export function importDataPortalPage(html: string, fileName: string): DataPortalResult {
  const warnings: string[] = [];
  const f = pageFields(html);
  const title = /<title>[^<]*?([A-Z0-9]{2,}\.[\w.-]+)\s*<\/title>/i.exec(html)?.[1];
  const partNr = f.partNr || title || fileName.replace(/\.(html?|zip)$/i, '');
  const maker = f.manufacturer || '';
  // Anteprime di schema multifilare ("…emav0r1"): la prima con punti di connessione
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map(m => m[0])
    .filter(s => /<title>[^<]*\.ema(?:%20)?v\d+r1\s*<\/title>/i.test(s.slice(0, 2000)));
  let sym: SymbolDef | undefined;
  const id = `dp_${partNr.toLowerCase().replace(/[^\w-]/g, '_')}`;
  const category = `Macro EPLAN / ${maker || 'Data Portal'}`;
  for (const s of svgs) {
    // Le entità HTML (&nbsp;…) non esistono in XML: si scrivono come numeri
    const xml = s.replace(/&(nbsp|copy|reg|deg|micro|plusmn);/g, (_, e: string) => `&#${({ nbsp: 160, copy: 169, reg: 174, deg: 176, micro: 181, plusmn: 177 } as Record<string, number>)[e]};`);
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
    if (!parsed || parsed.getElementsByTagName('parsererror').length) continue;
    sym = svgToSymbol(parsed, id, f.typeNr && f.orderNr ? `${f.typeNr} ${f.orderNr}` : partNr, category);
    if (sym) break;
  }
  if (!sym) warnings.push(`${fileName}: la pagina non contiene l'anteprima dello schema multifilare con i punti di connessione`);
  const part: Part = {
    partNr, typeNr: f.typeNr, orderNr: f.orderNr, manufacturer: maker || undefined, descr1: f.descr || f.designation,
    productGroup: f.group, symbolId: sym?.id, functionTemplates: [], attrs: {}, source: `${fileName} (EPLAN Data Portal)`,
  };
  if (sym && part.descr1) sym.description = `${part.descr1}. ${sym.description}`;
  return { parts: [part], symbols: sym ? [sym] : [], warnings };
}
