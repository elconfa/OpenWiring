// Calcoli (punto 87 c e calcoli dei cavi):
// - Termico del quadro con il metodo della superficie efficace (IEC/TR 60890, DIN VDE 0660-500):
//   superficie di scambio secondo la posizione di installazione, sovratemperatura ΔT = Pv / (k·A),
//   potenza di raffreddamento o portata del ventilatore se la temperatura interna supera quella
//   ammessa, potenza della scaldiglia anticondensa.
// - Cavi: caduta di tensione ΔU = b·(ρ·L/S·cosφ + λ·L·sinφ)·I e portata (IEC 60364-5-52, rame,
//   30 °C, valori di tabella indicativi da verificare), con la sezione minima per entrambe.
import type { CableCalc, Part, Project, ThermalCalc } from './types';
import { buildDevices, deviceInfo, partsIndex } from './devices';
import { devicePanels } from './network';
import type { Table } from './reports';
import { tn } from '../i18n/ui';

// ---------------------------------------------------------------------------
// Calcolo termico

/** Posizioni di installazione (IEC/TR 60890): superficie efficace A in m² con L, H, P in m */
export const INSTALL_TYPES: { id: number; name: string; area: (w: number, h: number, d: number) => number }[] = [
  { id: 1, name: tn('Singolo, libero su tutti i lati'), area: (w, h, d) => 1.8 * h * (w + d) + 1.4 * w * d },
  { id: 2, name: tn('Primo o ultimo di una fila, libero'), area: (w, h, d) => 1.4 * d * (w + h) + 1.8 * w * h },
  { id: 3, name: tn('Singolo, a parete'), area: (w, h, d) => 1.4 * w * (h + d) + 1.8 * d * h },
  { id: 4, name: tn('In mezzo a una fila, libero'), area: (w, h, d) => 1.8 * w * h + 1.4 * w * d + d * h },
  { id: 5, name: tn('Primo o ultimo di una fila, a parete'), area: (w, h, d) => 1.4 * h * (w + d) + 1.4 * w * d },
  { id: 6, name: tn('In mezzo a una fila, a parete'), area: (w, h, d) => 1.4 * w * (h + d) + d * h },
  { id: 7, name: tn('In mezzo a una fila, a parete, tetto coperto'), area: (w, h, d) => 1.4 * w * h + 0.7 * w * d + d * h },
];

/** Coefficiente di trasmissione del calore k in W/(m²·K) per materiale */
export const MATERIALS: Record<ThermalCalc['material'], { name: string; k: number }> = {
  steel: { name: tn('Lamiera d\'acciaio verniciata'), k: 5.5 },
  stainless: { name: tn('Acciaio inossidabile'), k: 3.7 },
  aluminium: { name: tn('Alluminio'), k: 12 },
  aluminium2: { name: tn('Alluminio a doppia parete'), k: 4.5 },
  plastic: { name: tn('Materiale plastico (poliestere, policarbonato)'), k: 3.5 },
};

/** Fattore per la portata dei ventilatori in m³·K/(W·h) secondo l'altitudine */
export function altitudeFactor(m = 0): number {
  const steps = [100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
  const i = steps.findIndex(s => m <= s);
  return 3.1 + 0.1 * (i < 0 ? steps.length : i);
}

export const newThermal = (panelId: string): ThermalCalc => ({ panelId, w: 800, h: 2000, d: 600, install: 1, material: 'steel', tAmb: 35, tAmbMin: 5, tMax: 40, tMin: 10, factor: 1 });

/** Potenza dissipata dell'articolo: il campo, oppure un attributo dei dati del costruttore */
export function partPowerLoss(part?: Part): number | undefined {
  if (!part) return undefined;
  if (part.powerLoss !== undefined) return part.powerLoss;
  for (const [k, v] of Object.entries(part.attrs ?? {})) {
    if (!/power.?loss|power.?dissipation|loss.?power|verlustleistung|potenza.?dissipata|dissipat/i.test(k)) continue;
    const n = parseFloat(String(v).replace(',', '.'));
    if (isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

export interface ThermalDevice { tag: string; description: string; partNr?: string; pv?: number; own: boolean }

/** Dispositivi del quadro (o di tutto il progetto) con la loro potenza dissipata */
export function thermalDevices(project: Project, panelId: string, library: Part[] = [], calc?: ThermalCalc): ThermalDevice[] {
  const parts = partsIndex(project, library);
  const panels = devicePanels(project);
  const out: ThermalDevice[] = [];
  for (const d of buildDevices(project).values()) {
    if (d.elements.every(e => ['terminal', 'potential', 'link', 'pin', 'oneline'].includes(e.sym.role))) continue;
    if (panelId && panels.get(d.tag)?.id !== panelId) continue;
    const info = deviceInfo(d.elements, d.main, parts);
    const own = calc?.pv?.[d.tag];
    out.push({ tag: d.tag, description: info.description ?? info.part?.descr1 ?? '', partNr: info.partNr, pv: own ?? partPowerLoss(info.part), own: own !== undefined });
  }
  return out.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
}

export interface ThermalResult {
  area: number; k: number; pv: number; missing: number;
  /** Sovratemperatura e temperatura interna senza raffreddamento */
  dT: number; tIn: number;
  /** Potenza di raffreddamento necessaria (W) e portata del ventilatore (m³/h) se serve */
  cooling: number; fan?: number;
  /** Potenza della scaldiglia anticondensa (W) */
  heating: number;
}

export function thermalResult(project: Project, c: ThermalCalc, library: Part[] = []): ThermalResult {
  const devs = thermalDevices(project, c.panelId, library, c);
  const area = (INSTALL_TYPES.find(t => t.id === c.install) ?? INSTALL_TYPES[0]).area(c.w / 1000, c.h / 1000, c.d / 1000);
  const k = c.k ?? MATERIALS[c.material].k;
  const pv = devs.reduce((a, d) => a + (d.pv ?? 0), 0) * (c.factor ?? 1) + (c.extra ?? []).reduce((a, e) => a + (e.w || 0), 0);
  const kA = k * area;
  const dT = kA > 0 ? pv / kA : 0;
  const cooling = Math.max(0, pv - kA * (c.tMax - c.tAmb));
  // Ventilazione: solo se l'aria esterna è più fresca della temperatura interna ammessa
  const fan = cooling > 0 && c.tMax > c.tAmb ? (altitudeFactor(c.altitude) * cooling) / (c.tMax - c.tAmb) : undefined;
  const heating = c.tMin !== undefined && c.tAmbMin !== undefined ? Math.max(0, kA * (c.tMin - c.tAmbMin)) : 0;
  return { area, k, pv, missing: devs.filter(d => d.pv === undefined).length, dT, tIn: c.tAmb + dT, cooling, fan, heating };
}

// ---------------------------------------------------------------------------
// Cavi

/** Sezioni normalizzate in mm² */
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

/**
 * Portate in A per rame a 30 °C (IEC 60364-5-52, tabelle B.52.2…B.52.5 e B.52.10…B.52.12), per
 * isolante, metodo di posa e conduttori caricati (2 per il monofase, 3 per il trifase).
 * Valori indicativi: per il progetto vanno controllati sulla norma e corretti con il fattore.
 */
const IZ: Record<'PVC' | 'XLPE', Record<'B2' | 'C' | 'E', Record<2 | 3, number[]>>> = {
  PVC: {
    B2: { 2: [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232], 3: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206] },
    C: { 2: [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299], 3: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259] },
    E: { 2: [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328], 3: [18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276] },
  },
  XLPE: {
    B2: { 2: [22, 30, 40, 51, 69, 91, 119, 146, 175, 221, 265, 305], 3: [19.5, 26, 35, 44, 60, 80, 105, 128, 154, 194, 233, 268] },
    C: { 2: [24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382], 3: [22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322] },
    E: { 2: [26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410], 3: [23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346] },
  },
};

export const METHODS: Record<NonNullable<CableCalc['method']>, string> = {
  B2: tn('B2: cavo multipolare in tubo o canalina'),
  C: tn('C: cavo multipolare su parete'),
  E: tn('E: cavo multipolare in aria (passerella forata)'),
};

/** Resistività del rame alla temperatura di esercizio (Ω·mm²/m) e reattanza (Ω/m) */
const RHO = 0.0225, LAMBDA = 0.08e-3;

/** Dati con i valori di serie: trifase 400 V (monofase 230 V), cosφ 0,9, posa C, PVC, caduta 4 % */
export const cableDefaults = (c: CableCalc): Required<Omit<CableCalc, 'i' | 'iz'>> & Pick<CableCalc, 'i' | 'iz'> =>
  ({ phases: 3, cos: 0.9, method: 'C', insulation: 'PVC', kCorr: 1, duMax: 4, ...c, u: c.u ?? (c.phases === 1 ? 230 : 400) });

/** Portata in A della sezione (tabella × fattore di correzione), o quella scritta a mano */
export function cableIz(c: CableCalc, s: number): number | undefined {
  const d = cableDefaults(c);
  if (d.iz !== undefined) return d.iz;
  const i = SECTIONS.indexOf(s);
  return i < 0 ? undefined : IZ[d.insulation][d.method][d.phases === 1 ? 2 : 3][i] * d.kCorr;
}

/** Caduta di tensione in V per sezione e lunghezza */
export function voltageDrop(c: CableCalc, s: number, length: number): number {
  const d = cableDefaults(c);
  const b = d.phases === 1 ? 2 : Math.sqrt(3);
  const sin = Math.sqrt(Math.max(0, 1 - d.cos * d.cos));
  return b * (RHO * length / s * d.cos + LAMBDA * length * sin) * (d.i ?? 0);
}

export interface CableResult {
  s?: number; length?: number; du?: number; duPct?: number; iz?: number;
  /** Sezioni minime per la caduta ammessa e per la portata */
  sDrop?: number; sIz?: number;
  ok?: boolean; problems: string[];
}

/** Sezione del cavo come numero (dal campo «sezione», es. "2,5") */
export const sectionNum = (cross?: string) => { const v = parseFloat((cross ?? '').replace(',', '.')); return isFinite(v) && v > 0 ? v : undefined; };

export function cableResult(c: CableCalc, cross: string | undefined, length: number | undefined): CableResult {
  const d = cableDefaults(c);
  const s = sectionNum(cross);
  const problems: string[] = [];
  if (!d.i) return { s, length, problems: [tn('corrente non indicata')] };
  const uRef = d.u || 400;
  const du = s && length ? voltageDrop(c, s, length) : undefined;
  const duPct = du !== undefined ? (du / uRef) * 100 : undefined;
  const iz = s ? cableIz(c, s) : undefined;
  const sDrop = length ? SECTIONS.find(x => (voltageDrop(c, x, length) / uRef) * 100 <= d.duMax) : undefined;
  const sIz = SECTIONS.find(x => (cableIz({ ...c, iz: undefined }, x) ?? 0) >= d.i!);
  if (!s) problems.push(tn('sezione non indicata'));
  if (!length) problems.push(tn('lunghezza non indicata'));
  if (duPct !== undefined && duPct > d.duMax) problems.push(tn('caduta di tensione oltre il limite'));
  if (iz !== undefined && iz < d.i) problems.push(tn('portata insufficiente'));
  const ok = s !== undefined && length !== undefined && !problems.length;
  return { s, length, du, duPct, iz, sDrop, sIz, ok, problems };
}

// ---------------------------------------------------------------------------
// Liste

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('it-IT');
const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('it-IT');

export const THERMAL_TITLE = 'Calcolo termico dei quadri';
export const CABLE_CALC_TITLE = 'Verifica dei cavi';

/** Lista del calcolo termico: un quadro per riga con dati e risultati */
export function thermalReport(project: Project, library: Part[] = []): Table {
  const rows = (project.calcs?.thermal ?? []).map(c => {
    const r = thermalResult(project, c, library);
    const pn = project.panels?.find(p => p.id === c.panelId);
    return [pn ? `+${pn.code} ${pn.name}` : 'Progetto', `${c.w}×${c.h}×${c.d}`, String(c.install), n2(r.area), n1(r.k), n1(r.pv), `${c.tAmb}`, n1(r.tIn), `${c.tMax}`,
      r.cooling ? n1(r.cooling) : '—', r.fan ? n1(r.fan) : '—', r.heating ? n1(r.heating) : '—', r.missing ? String(r.missing) : ''];
  });
  return { title: THERMAL_TITLE, columns: ['Quadro', 'L×H×P (mm)', 'Posa', 'A (m²)', 'k', 'Pv (W)', 'T amb. (°C)', 'T int. (°C)', 'T max (°C)', 'Raffr. (W)', 'Ventil. (m³/h)', 'Scaldiglia (W)', 'Senza Pv'], rows };
}

/** Lista della verifica dei cavi: solo quelli con la corrente indicata */
export function cableCalcReport(project: Project): Table {
  const calcs = project.calcs?.cables ?? {};
  const rows = (project.cables ?? []).filter(c => calcs[c.id]?.i).map(c => {
    const k = calcs[c.id], d = cableDefaults(k), r = cableResult(k, c.cross, c.length);
    return [`-${c.tag}`, c.cross ?? '', c.length !== undefined ? n1(c.length) : '', n1(d.i!), `${d.phases === 1 ? '1~' : '3~'} ${d.u} V`, `${d.method} ${d.insulation}`,
      r.du !== undefined ? n2(r.du) : '', r.duPct !== undefined ? n2(r.duPct) : '', r.iz !== undefined ? n1(r.iz) : '', r.sDrop ? String(r.sDrop).replace('.', ',') : '—', r.sIz ? String(r.sIz).replace('.', ',') : '—', r.ok ? 'OK' : r.problems.join(', ')];
  });
  return { title: CABLE_CALC_TITLE, columns: ['Cavo', 'Sezione (mm²)', 'L (m)', 'I (A)', 'Sistema', 'Posa', 'ΔU (V)', 'ΔU (%)', 'Iz (A)', 'S min ΔU', 'S min Iz', 'Esito'], rows };
}
