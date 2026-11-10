// Disegno delle pagine generate dai dati (vedi model/drawings.ts): cablaggio di un cavo, piedinatura
// di un connettore, schema d'insieme. Coordinate in mm sul foglio A3, dentro la cornice.
import type { ReactNode } from 'react';
import { FRAME } from '../model/types';
import { pinLayout, type CableSheet, type ConnectorSheet, type DrawingData, type SystemSheet } from '../model/drawings';
import { tx } from '../i18n/ui';
import { look } from './look';
import { drawingStyleOf, type ResolvedDrawingStyle } from '../model/drawingStyle';
import type { Project } from '../model/types';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, Math.floor(n) - 1))}…` : s);

const MUTED = '#5b636d', LIGHT = '#d0d5dc';
type T = (s: string) => string;

export function DrawingPage({ d, t, project }: { d: DrawingData; t: T; project: Project }) {
  const S = drawingStyleOf(project, d.kind);
  if (d.kind === 'cable') return d.data ? <CableDrawing c={d.data} t={t} S={S} /> : <Missing text={tx('Cavo eliminato: aggiorna i disegni dei cavi')} />;
  if (d.kind === 'connector') return <ConnectorDrawing c={d.data} t={t} S={S} />;
  return <SystemDrawing s={d.data} t={t} S={S} />;
}

/**
 * Colonne visibili: quelle con la larghezza scelta la tengono, le altre si allargano (o si stringono)
 * per riempire la stessa larghezza di prima
 */
function columns<C extends { key: string; w: number }>(cols: C[], S: { show: (k: string) => boolean; width: (k: string) => number | undefined }): C[] {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const on = cols.filter(c => S.show(c.key));
  const fixed = on.reduce((a, c) => a + (S.width(c.key) ?? 0), 0);
  const free = on.filter(c => !S.width(c.key)).reduce((a, c) => a + c.w, 0) || 1;
  const rest = Math.max(0, total - fixed);
  return on.map(c => ({ ...c, w: S.width(c.key) ?? (c.w * rest) / free }));
}

function Missing({ text }: { text: string }) {
  return <text x={30} y={30} fontSize={4} fill="#cf222e">{text}</text>;
}

/** Tabella semplice: intestazione grigia e righe con le linee di separazione */
function Grid({ x, y, cols, rows, rowH = 4.4, size = 2 }: { x: number; y: number; cols: { title: string; w: number }[]; rows: string[][]; rowH?: number; size?: number }) {
  const xs = cols.reduce<number[]>((a, c, i) => [...a, i ? a[i - 1] + cols[i - 1].w : x], []);
  const w = cols.reduce((a, c) => a + c.w, 0);
  const fit = (s: string, cw: number) => { const n = Math.floor(cw / (size * 0.55)); return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s; };
  return (
    <g>
      <rect x={x} y={y} width={w} height={rowH} fill="#eaeef2" />
      {cols.map((c, i) => <text key={i} x={xs[i] + 1} y={y + rowH - 1.3} fontSize={size} fontWeight={600} fill={look.ink}>{fit(c.title, c.w)}</text>)}
      {rows.map((r, k) => (
        <g key={k}>
          <line x1={x} y1={y + rowH * (k + 2)} x2={x + w} y2={y + rowH * (k + 2)} stroke={LIGHT} strokeWidth={0.12} />
          {r.map((s, i) => <text key={i} x={xs[i] + 1} y={y + rowH * (k + 2) - 1.3} fontSize={size} fill={look.ink}>{fit(s, cols[i].w)}</text>)}
        </g>
      ))}
    </g>
  );
}

function Title({ title, sub, size = 4 }: { title: string; sub: string; size?: number }) {
  return (
    <g fill={look.ink}>
      <text x={FRAME.left + 8} y={FRAME.top + 11} fontSize={size} fontWeight={600}>{title}</text>
      {sub && <text x={FRAME.left + 8} y={FRAME.top + 11 + Math.max(6, size * 1.5)} fontSize={size * 0.65}>{sub}</text>}
    </g>
  );
}

// ---------------------------------------------------------------------------

/**
 * Cablaggio di un cavo: a sinistra e a destra le estremità (luogo e punti collegati), in mezzo il cavo
 * con i conduttori che si allargano verso i punti; sotto la tabella dei conduttori
 */
function CableDrawing({ c, t, S }: { c: CableSheet; t: T; S: ResolvedDrawingStyle }) {
  const n = Math.max(1, c.rows.length);
  const step = Math.min(3.4, 80 / n), y0 = FRAME.top + 30;
  const boxA = { x: FRAME.left + 10, w: 92 }, boxB = { x: FRAME.right - 102, w: 92 };
  const sheath = { x0: 180, x1: 250 };
  const tight = Math.min(1.2, 14 / n), midY = y0 + 4 + (n * step) / 2;
  const yAt = (i: number) => y0 + 6 + i * step, yIn = (i: number) => midY - ((n - 1) * tight) / 2 + i * tight;
  const boxH = n * step + 8;
  const sub = [c.type, c.section, c.length !== undefined ? `${String(c.length).replace('.', ',')} m` : '', c.shield ? t('schermato') : '', c.pairs ? t('coppie intrecciate') : '', c.description ? t(c.description) : '']
    .filter(Boolean).join('  ·  ');
  const side = (code: string, refs: string[]) => [code ? `+${code}` : t('Luogo non indicato'), refs.join(' ')].filter(Boolean).join('  ');
  const drawing = S.show('drawing');
  const tableY = drawing ? y0 + boxH + 14 : y0;
  const rowH = Math.min(S.rowH, (FRAME.bottom - 6 - tableY) / (c.rows.length + c.spare.length + 1));
  const label = Math.min(S.textSize, step * 0.85), small = Math.min(S.textSize * 0.9, step * 0.75);
  const cols = columns([{ key: 'name', title: t('Conduttore'), w: 30 }, { key: 'wireNo', title: t('N. filo'), w: 30 }, { key: 'a', title: t('Da'), w: 110 }, { key: 'b', title: t('A'), w: 110 }, { key: 'loc', title: t('Posizione'), w: 30 }, { key: 'note', title: t('Note'), w: 60 }], S);
  const cell = (r: Record<string, string>) => cols.map(k => r[k.key] ?? '');
  return (
    <g>
      <Title title={c.bus ? `${t('Cablaggio bus fili')} ${c.tag}` : `${t('Cablaggio cavo')} -${c.tag}`} sub={sub} size={S.titleSize} />
      {drawing && <>
      {/* Estremità */}
      {[{ b: boxA, s: c.sideA, right: true }, { b: boxB, s: c.sideB, right: false }].map(({ b, s, right }, k) => (
        <g key={k}>
          <rect x={b.x} y={y0} width={b.w} height={boxH} fill="none" stroke={look.ink} strokeWidth={0.35} />
          <text x={b.x + 1.5} y={y0 - 1.5} fontSize={S.textSize * 1.2} fontWeight={600} fill={look.ink}>{cut(side(s.code, s.refs), b.w / (S.textSize * 1.2 * 0.55))}</text>
          {c.rows.map((r, i) => <text key={i} x={right ? b.x + b.w - 1.5 : b.x + 1.5} y={yAt(i) + 0.7} fontSize={label} textAnchor={right ? 'end' : 'start'} fill={look.ink}>{cut(right ? r.a : r.b, (b.w - 3) / (label * 0.55))}</text>)}
        </g>
      ))}
      {/* Conduttori: dai punti alla guaina, dentro la guaina stretti */}
      <g stroke={look.ink} strokeWidth={0.2} fill="none">
        {c.rows.map((r, i) => (
          <g key={i}>
            <path d={`M${boxA.x + boxA.w} ${yAt(i)} L${boxA.x + boxA.w + 18} ${yAt(i)} L${sheath.x0} ${yIn(i)} L${sheath.x1} ${yIn(i)} L${boxB.x - 18} ${yAt(i)} L${boxB.x} ${yAt(i)}`}
              stroke={r.problem ? '#cf222e' : look.ink} />
          </g>
        ))}
      </g>
      <g fill={look.ink} fontSize={small}>
        {c.rows.map((r, i) => (
          <g key={i}>
            <text x={boxA.x + boxA.w + 1.5} y={yAt(i) - 0.5}>{r.name}</text>
            <text x={boxB.x - 1.5} y={yAt(i) - 0.5} textAnchor="end">{r.wireNo}</text>
          </g>
        ))}
      </g>
      <rect x={sheath.x0} y={midY - (n * tight) / 2 - 1.5} width={sheath.x1 - sheath.x0} height={n * tight + 3} rx={1.5} fill="none" stroke={look.ink} strokeWidth={0.6} />
      {c.shield && <rect x={sheath.x0 + 3} y={midY - (n * tight) / 2 - 0.6} width={sheath.x1 - sheath.x0 - 6} height={n * tight + 1.2} rx={1} fill="none" stroke={look.ink} strokeWidth={0.2} strokeDasharray="0.8 0.5" />}
      <text x={(sheath.x0 + sheath.x1) / 2} y={midY - (n * tight) / 2 - 3.5} fontSize={2.6} fontWeight={600} textAnchor="middle" fill={look.ink}>{c.bus ? c.tag : `-${c.tag}`}</text>
      <text x={(sheath.x0 + sheath.x1) / 2} y={midY + (n * tight) / 2 + 5} fontSize={2} textAnchor="middle" fill={MUTED}>{[c.type, c.section].filter(Boolean).join(' ')}</text>
      <g fontSize={2} fill={MUTED}>
        <text x={boxA.x + boxA.w + 1.5} y={y0 - 1.5}>{t('Conduttore')}</text>
        <text x={boxB.x - 1.5} y={y0 - 1.5} textAnchor="end">{t('N. filo')}</text>
      </g>
      </>}
      {/* Tabella dei conduttori */}
      {cols.length > 0 && <Grid x={FRAME.left + 10} y={tableY} rowH={rowH} size={Math.min(S.tableSize, rowH * 0.6)} cols={cols}
        rows={[...c.rows.map(r => cell({ name: r.name, wireNo: r.wireNo, a: r.a, b: r.b, loc: r.loc, note: r.problem ?? '' })), ...c.spare.map(s => cell({ name: s, note: t('libero') }))]} />}
    </g>
  );
}

// ---------------------------------------------------------------------------

/** Piedinatura: faccia del connettore (SUB-D o rettangolare) con i pin numerati, usati in azzurro, e la tabella */
function ConnectorDrawing({ c, t, S }: { c: ConnectorSheet; t: T; S: ResolvedDrawingStyle }) {
  const pins = pinLayout(c.shape, Math.max(1, c.pins));
  const cols = pins[0]?.cols ?? 1;
  const pitch = c.shape === 'subd' ? 2.8 : c.shape === 'rj45' ? 3.4 : 5, rowGap = 6;
  const used = new Set(c.rows.map(r => r.no));
  const nameOf = (no: number) => c.names[no - 1] ?? String(no);
  const w = (cols - 1) * pitch + 12, h = rowGap + 12;
  const cx = FRAME.left + 10 + Math.max(w, 60) / 2, cy = FRAME.top + 60;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const at = (p: (typeof pins)[number]) => ({ x: x0 + 6 + p.col * pitch, y: y0 + 6 + p.row * rowGap });
  const face: ReactNode = c.shape === 'rj45'
    ? <path d={`M${x0} ${y0} L${x0 + w} ${y0} L${x0 + w} ${y0 + h - 4} L${cx + 4} ${y0 + h - 4} L${cx + 4} ${y0 + h} L${cx - 4} ${y0 + h} L${cx - 4} ${y0 + h - 4} L${x0} ${y0 + h - 4} Z`} fill="none" stroke={look.ink} strokeWidth={0.5} />
    : c.shape === 'subd'
    ? <path d={`M${x0} ${y0} L${x0 + w} ${y0} L${x0 + w - 4} ${y0 + h} L${x0 + 4} ${y0 + h} Z`} fill="none" stroke={look.ink} strokeWidth={0.5} strokeLinejoin="round" />
    : <rect x={x0} y={y0} width={w} height={h} rx={1.5} fill="none" stroke={look.ink} strokeWidth={0.5} />;
  const tableX = Math.max(cx + Math.max(w, 60) / 2 + 12, 200), rowH = Math.min(S.rowH, (FRAME.bottom - 6 - (FRAME.top + 26)) / (c.rows.length + 1));
  const side = (FRAME.right - 10 - tableX - 44) / 2;
  const tcols = columns([{ key: 'no', title: t('Pin'), w: 14 }, { key: 'a', title: t('Lato 1'), w: side }, { key: 'b', title: t('Lato 2'), w: side }, { key: 'wires', title: t('Fili'), w: 30 }], S);
  return (
    <g>
      <Title size={S.titleSize} title={`${t('Connettore')} -${c.conn}`} sub={[c.description ? t(c.description) : '', c.typeText ?? `${c.pins} pin`, c.shape === 'subd' ? 'SUB-D' : ''].filter(Boolean).join('  ·  ')} />
      <text x={cx} y={y0 - 4} fontSize={2.2} textAnchor="middle" fill={MUTED}>{t('Vista lato contatti')}</text>
      {face}
      {pins.map(p => {
        const q = at(p), name = nameOf(p.no), on = used.has(name);
        return (
          <g key={p.no}>
            <circle cx={q.x} cy={q.y} r={1.25} fill={on ? '#cfe3ff' : 'none'} stroke={look.ink} strokeWidth={0.2} />
            <text x={q.x} y={q.y + 0.55} fontSize={name.length > 1 ? S.textSize * 0.8 : S.textSize} textAnchor="middle" fill={look.ink}>{name}</text>
          </g>
        );
      })}
      {tcols.length > 0 && <Grid x={tableX} y={FRAME.top + 26} rowH={rowH} size={Math.min(S.tableSize, rowH * 0.6)} cols={tcols}
        rows={c.rows.map(r => tcols.map(k => ({ no: r.no, a: r.a, b: r.b, wires: r.wires } as Record<string, string>)[k.key] ?? ''))} />}
    </g>
  );
}

// ---------------------------------------------------------------------------

const NODE_W = 70, DEV_MAX = 6;

/**
 * Schema d'insieme: il luogo con più cavi in alto al centro, gli altri sotto in file; ogni luogo con i
 * dispositivi collegati (foto dell'articolo se c'è) e i cavi come linee con sigla, tipo e lunghezza
 */
function SystemDrawing({ s, t, S }: { s: SystemSheet; t: T; S: ResolvedDrawingStyle }) {
  if (!s.nodes.length) return <Missing text={tx('Nessun cavo tra dispositivi: disegna le linee dei cavi sugli schemi')} />;
  const withPics = S.show('picture') && s.nodes.some(n => n.devices.some(d => d.picture));
  const devH = withPics ? 13 : 4.2;
  const nodeH = (n: SystemSheet['nodes'][number]) => 9 + Math.min(n.devices.length, DEV_MAX) * devH + (n.devices.length > DEV_MAX ? 4 : 0) + 2;
  const hub = s.nodes.find(n => n.code === s.hub) ?? s.nodes[0];
  const others = s.nodes.filter(n => n !== hub);
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const hubH = nodeH(hub);
  pos.set(hub.code, { x: (FRAME.left + FRAME.right) / 2 - NODE_W / 2, y: FRAME.top + 24, w: NODE_W, h: hubH });
  const perRow = 5, gap = (FRAME.right - FRAME.left - 16 - perRow * NODE_W) / (perRow - 1);
  let y = FRAME.top + 24 + hubH + 40;
  for (let r = 0; r * perRow < others.length; r++) {
    const row = others.slice(r * perRow, r * perRow + perRow);
    const total = row.length * NODE_W + (row.length - 1) * gap;
    let x = (FRAME.left + FRAME.right) / 2 - total / 2;
    for (const n of row) { pos.set(n.code, { x, y, w: NODE_W, h: nodeH(n) }); x += NODE_W + gap; }
    y += Math.max(...row.map(nodeH)) + 30;
  }
  const hp = pos.get(hub.code)!;
  const fromHub = s.edges.filter(e => e.a === hub.code || e.b === hub.code);
  const rest = s.edges.filter(e => !fromHub.includes(e));
  // Più cavi verso lo stesso luogo: uno accanto all'altro
  const perNode = new Map<string, number>();
  return (
    <g>
      <Title size={S.titleSize} title={t('Schema d\'insieme')} sub={t('Luoghi e cavi di collegamento')} />
      {fromHub.map((e, k) => {
        const other = e.a === hub.code ? e.b : e.a, op = pos.get(other);
        if (!op) return null;
        const j = perNode.get(other) ?? 0;
        perNode.set(other, j + 1);
        const sx = hp.x + ((k + 1) * hp.w) / (fromHub.length + 1), lane = hp.y + hp.h + 6 + (k % 10) * 2.6;
        const ex = op.x + op.w / 2 - 6 + j * 4;
        return (
          <g key={`${e.tag}-${k}`}>
            <path d={`M${sx} ${hp.y + hp.h} L${sx} ${lane} L${ex} ${lane} L${ex} ${op.y}`} fill="none" stroke={look.ink} strokeWidth={0.45} />
            <text x={ex - 0.8} y={op.y - 2} fontSize={S.textSize * 0.9} fill={look.ink} transform={`rotate(-90 ${ex - 0.8} ${op.y - 2})`}>
              <tspan fontWeight={600}>{`-${e.tag}`}</tspan>{e.text && S.show('cableText') ? `  ${e.text}` : ''}
            </text>
          </g>
        );
      })}
      {rest.map((e, k) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b) return null;
        const p = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, q = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        return (
          <g key={`r${k}`}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={look.ink} strokeWidth={0.45} />
            <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 1} fontSize={S.textSize * 0.9} textAnchor="middle" fill={look.ink}>{`-${e.tag}`}</text>
          </g>
        );
      })}
      {s.nodes.map(n => {
        const p = pos.get(n.code)!;
        const title = n.device ? n.code : [n.code ? `+${n.code}` : t('Luogo non indicato'), n.name ? t(n.name) : ''].filter(Boolean).join('  ');
        return (
          <g key={n.code}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="#fff" stroke={look.ink} strokeWidth={0.5} />
            <text x={p.x + 2} y={p.y + 5} fontSize={2.8} fontWeight={600} fill={look.ink}>{title}</text>
            {n.kind && <text x={p.x + p.w - 2} y={p.y + 5} fontSize={1.8} textAnchor="end" fill={MUTED}>{t(n.kind)}</text>}
            <line x1={p.x} y1={p.y + 7} x2={p.x + p.w} y2={p.y + 7} stroke={LIGHT} strokeWidth={0.2} />
            {n.devices.slice(0, DEV_MAX).map((d, i) => {
              const dy = p.y + 9 + i * devH;
              return (
                <g key={d.tag}>
                  {d.picture && withPics && <image href={d.picture} x={p.x + 2} y={dy} width={11} height={11} preserveAspectRatio="xMidYMid meet" />}
                  <text x={p.x + (withPics ? 15 : 2)} y={dy + (withPics ? 4.5 : 3)} fontSize={S.textSize} fontWeight={600} fill={look.ink}>{`-${d.tag}`}</text>
                  {d.description && S.show('description') && <text x={p.x + (withPics ? 15 : 14)} y={dy + (withPics ? 8 : 3)} fontSize={S.tableSize} fill={MUTED}>{t(d.description).slice(0, withPics ? 34 : 40)}</text>}
                </g>
              );
            })}
            {n.devices.length > DEV_MAX && <text x={p.x + 2} y={p.y + 9 + DEV_MAX * devH + 3} fontSize={1.8} fill={MUTED}>{tx('… e altri {0}', n.devices.length - DEV_MAX)}</text>}
          </g>
        );
      })}
    </g>
  );
}
