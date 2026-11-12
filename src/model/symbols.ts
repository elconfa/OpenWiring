// Libreria simboli in stile IEC 60617. Orientamento verticale (flusso dall'alto
// verso il basso), punti di connessione sulla griglia di 4 mm.
import type { Prim, PinDef, SymbolDef, Part } from './types';

const L = (x1: number, y1: number, x2: number, y2: number, dash = false): Prim => ({ t: 'line', x1, y1, x2, y2, dash });
const T = (x: number, y: number, s: string, size = 2.5, anchor: 'start' | 'middle' | 'end' = 'middle'): Prim => ({ t: 'text', x, y, s, size, anchor });
const P = (id: string, x: number, y: number, label: string, dir: PinDef['dir'] = 'up'): PinDef => ({ id, x, y, dir, label });

/** Contatto NA con il polo a x = dx */
function noContact(dx = 0): Prim[] {
  return [L(dx, 0, dx, 5), L(dx, 16, dx, 11), L(dx, 11, dx - 4.5, 4.5)];
}
/** Contatto NC con il polo a x = dx */
function ncContact(dx = 0): Prim[] {
  return [L(dx, 0, dx, 5), L(dx, 5, dx + 3, 5), L(dx, 16, dx, 11), L(dx, 11, dx + 3.6, 3.8)];
}
function poles3(contact: (dx: number) => Prim[]): Prim[] {
  return [...contact(0), ...contact(8), ...contact(16)];
}
const pins3 = (labels: string[]): PinDef[] => [
  P('1', 0, 0, labels[0]), P('2', 0, 16, labels[1], 'down'),
  P('3', 8, 0, labels[2]), P('4', 8, 16, labels[3], 'down'),
  P('5', 16, 0, labels[4]), P('6', 16, 16, labels[5], 'down'),
];
const pins2 = (a: string, b: string, len = 16): PinDef[] => [P('1', 0, 0, a), P('2', 0, len, b, 'down')];

/**
 * Passo dei canali nei gruppi I/O PLC e altezza del loro riquadro (mm): tra un canale e il
 * successivo c'è posto per 10 fili sulla griglia di 4 mm (componenti, fotocellule e sigle)
 */
export const PLC_GROUP_STEP = 40, PLC_GROUP_H = 28;

const shiftPrim = (p: Prim, dx: number): Prim => {
  switch (p.t) {
    case 'line': return { ...p, x1: p.x1 + dx, x2: p.x2 + dx };
    case 'rect': case 'text': return { ...p, x: p.x + dx };
    case 'circle': case 'arc': case 'ellipse': return { ...p, cx: p.cx + dx };
    case 'poly': return { ...p, pts: p.pts.map(q => ({ x: q.x + dx, y: q.y })) };
  }
};

/**
 * Un canale di un gruppo I/O: riquadro largo 40 mm (da -4 a 36), morsetti in alto per gli ingressi
 * (in basso per le uscite) a x 0 e, con due morsetti, 16; nel riquadro indirizzo, variabile e
 * commento uno sotto l'altro, che vanno a capo da soli (textBox)
 */
function plcSlice(id: string, io: 'DI' | 'DO', n: 1 | 2): SymbolDef {
  const H = PLC_GROUP_H, x0 = -4, x1 = PLC_GROUP_STEP - 4;
  // I morsetti restano dove erano con il riquadro alto 14 mm (uscite a y 18): il riquadro più alto
  // cresce verso il basso per gli ingressi e verso l'alto per le uscite, e i fili non si staccano
  const top = io === 'DI' ? 4 : 14 - H, bottom = top + H;
  const pinY = io === 'DI' ? 0 : bottom + 4, stub = io === 'DI' ? [0, 4] : [bottom, bottom + 4];
  // Con due morsetti per canale il secondo sta 16 mm a destra del primo
  const xs = n === 1 ? [0] : [0, 16];
  // Posizioni indicative (per l'editor dei simboli): sullo schema i testi seguono il riquadro textBox
  const row = (f: 'plcAddress' | 'plcSymbol' | 'plcComment', y: number) => ({ f, x: x0 + 1.2, y: top + y, size: 2.5, anchor: 'start' as const });
  return {
    id, name: `Canale di gruppo ${io === 'DI' ? 'ingressi' : 'uscite'} PLC (${n} morsetti)`, category: 'PLC', letter: 'A', role: 'plc', io, hidden: true,
    prims: [L(x0, top, x1, top), L(x0, bottom, x1, bottom), L(x0, top, x0, bottom), L(x1, top, x1, bottom), ...xs.map(x => L(x, stub[0], x, stub[1]))],
    pins: xs.map((x, i) => P(String(i + 1), x, pinY, '', io === 'DI' ? 'up' : 'down')),
    tagPos: { x: x0 - 2, y: top + 6 },
    fields: [row('plcAddress', 3.2), row('plcSymbol', 6.5), row('plcComment', 9.8)],
    textBox: { x: x0 + 1.2, y: top + 0.5, w: x1 - x0 - 2.4, h: H - 1 },
  };
}

const plcVarFields = (y0: number): SymbolDef['fields'] => [
  { f: 'plcAddress', x: 3, y: y0 + 3.4, size: 2.3, anchor: 'start' },
  { f: 'plcSymbol', x: -2.5, y: y0 + 7, size: 2.2, anchor: 'start' },
  { f: 'plcComment', x: -2.5, y: y0 + 10.4, size: 1.8, anchor: 'start' },
];

/** Rappresenta un arco (gradi) usato per le teste di contattori e funghi */
const A = (cx: number, cy: number, r: number, a0: number, a1: number): Prim => ({ t: 'arc', cx, cy, r, a0, a1 });
const R = (x: number, y: number, w: number, h: number, fill = false): Prim => ({ t: 'rect', x, y, w, h, ...(fill ? { fill: true } : {}) });
const C = (cx: number, cy: number, r: number): Prim => ({ t: 'circle', cx, cy, r });

// Elementi di qualificazione IEC 60617 sul contatto fisso (in alto, y 5) dei poli di potenza
/** Funzione di sezionatore: trattino trasversale */
const discBar = (dx: number): Prim => L(dx - 1.2, 5, dx + 1.2, 5);
/** Funzione di interruttore (di potenza): croce */
const breakerX = (dx: number): Prim[] => [L(dx - 1, 4, dx + 1, 6), L(dx + 1, 4, dx - 1, 6)];
/** Funzione di interruttore di manovra: cerchietto */
const loadCircle = (dx: number): Prim => C(dx, 6.4, 0.9);
/**
 * Ritardo dei contatti temporizzati (il «paracadute» di IEC 60617): attaccato alla lama in (bx, by);
 * on = ritardo all'eccitazione (arco aperto verso la lama), altrimenti alla diseccitazione
 */
const delay = (bx: number, by: number, on: boolean): Prim[] => [L(bx, by - 0.6, bx - 3.4, by - 0.6), L(bx, by + 0.6, bx - 3.4, by + 0.6),
  on ? A(bx - 5, by, 1.6, 270, 90) : A(bx - 3.4, by, 1.6, 90, 270)];
/** Lama a forma di fusibile per i sezionatori con fusibile (polo a x = dx) */
function fuseBlade(dx: number): Prim[] {
  const ax = dx, ay = 12, bx = dx - 4.5, by = 4.5, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy * 1.1, ny = ux * 1.1;
  const p = (t: number, s: number) => ({ x: Math.round((ax + ux * t + nx * s) * 100) / 100, y: Math.round((ay + uy * t + ny * s) * 100) / 100 });
  return [L(dx, 0, dx, 5), L(dx, 16, dx, 12), L(ax, ay, bx, by), { t: 'poly', pts: [p(2, 1), p(7, 1), p(7, -1), p(2, -1)], closed: true }, discBar(dx)];
}

/**
 * Un polo di contatto come nei simboli della libreria (in verticale, morsetto 1 in alto a y 0, lungo
 * 16): serve all'immagine dei contatti delle bobine per i poli di potenza divisi uno per riga, per i
 * contatti di riserva dell'articolo e per i simboli con più poli
 */
export function contactPole(kind: string): Pick<SymbolDef, 'prims' | 'pins'> {
  if (kind === 'CO') {
    const co = BUILTIN_SYMBOLS.find(s => s.id === 'co')!;
    return { prims: co.prims, pins: co.pins };
  }
  const prims = kind === 'NC' ? ncContact() : kind === 'power' || kind === 'P' ? [...noContact(), A(0, 6.5, 1.5, 180, 360)] : noContact();
  return { prims, pins: pins2('1', '2') };
}

export const BUILTIN_SYMBOLS: SymbolDef[] = [
  // ---------------- Contatti e bobine ----------------
  {
    id: 'coil', name: 'Bobina relè/contattore', category: 'Bobine e contatti', letter: 'K', role: 'main',
    prims: [{ t: 'rect', x: -5, y: 5, w: 10, h: 6 }, L(0, 0, 0, 5), L(0, 11, 0, 16)],
    pins: pins2('A1', 'A2'), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'no', name: 'Contatto NA', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NO',
    prims: noContact(), pins: pins2('13', '14'), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'nc', name: 'Contatto NC', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NC',
    prims: ncContact(), pins: pins2('11', '12'), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'co', name: 'Contatto in scambio', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'CO',
    prims: [L(0, 16, 0, 11), L(0, 11, -4.5, 4.5), L(-6, 0, -6, 5), L(-6, 5, -4.5, 5), L(6, 0, 6, 5), L(6, 5, 3, 5)],
    pins: [P('1', 0, 16, '11', 'down'), P('2', -6, 0, '12'), P('3', 6, 0, '14')], tagPos: { x: -9, y: 10 },
  },
  {
    id: 'contactor3', name: 'Contatti di potenza 3P', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'power',
    prims: [...poles3(noContact), A(0, 6.5, 1.5, 180, 360), A(8, 6.5, 1.5, 180, 360), A(16, 6.5, 1.5, 180, 360), L(-2.2, 8, 13.8, 8, true)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -7, y: 9 },
  },
  {
    // IEC 60617 S00312: relè ritardato all'eccitazione, riquadro laterale con la croce
    id: 'timer_on', name: 'Bobina temporizzata (ritardo eccitazione)', category: 'Bobine e contatti', letter: 'K', role: 'main',
    prims: [R(-5, 5, 10, 6), R(-8, 5, 3, 6), L(-8, 5, -5, 11), L(-5, 5, -8, 11), L(0, 0, 0, 5), L(0, 11, 0, 16)],
    pins: pins2('A1', 'A2'), tagPos: { x: -10, y: 9 },
  },
  {
    // IEC 60617 S00311: relè ritardato alla diseccitazione, riquadro laterale pieno
    id: 'timer_off', name: 'Bobina temporizzata (ritardo diseccitazione)', category: 'Bobine e contatti', letter: 'K', role: 'main',
    prims: [R(-5, 5, 10, 6), R(-8, 5, 3, 6, true), L(0, 0, 0, 5), L(0, 11, 0, 16)],
    pins: pins2('A1', 'A2'), tagPos: { x: -10, y: 9 },
  },
  {
    id: 'coil_ac', name: 'Bobina relè in corrente alternata', category: 'Bobine e contatti', letter: 'K', role: 'main',
    prims: [R(-5, 5, 10, 6), L(-1.5, 5, -1.5, 11), T(-3.25, 9.3, '~', 3), L(0, 0, 0, 5), L(0, 11, 0, 16)],
    pins: pins2('A1', 'A2'), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'no_ton', name: 'Contatto NA ritardato all\'eccitazione', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NO', timed: true,
    prims: [...noContact(), ...delay(-2.2, 7.75, true)], pins: pins2('17', '18'), tagPos: { x: -10, y: 12 },
  },
  {
    id: 'nc_ton', name: 'Contatto NC ritardato all\'eccitazione', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NC', timed: true,
    prims: [...ncContact(), ...delay(1.8, 7.4, true)], pins: pins2('15', '16'), tagPos: { x: -7, y: 12 },
  },
  {
    id: 'no_toff', name: 'Contatto NA ritardato alla diseccitazione', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NO', timed: true,
    prims: [...noContact(), ...delay(-2.2, 7.75, false)], pins: pins2('17', '18'), tagPos: { x: -10, y: 12 },
  },
  {
    id: 'nc_toff', name: 'Contatto NC ritardato alla diseccitazione', category: 'Bobine e contatti', letter: 'K', role: 'aux', contact: 'NC', timed: true,
    prims: [...ncContact(), ...delay(1.8, 7.4, false)], pins: pins2('15', '16'), tagPos: { x: -7, y: 12 },
  },
  {
    // Contatti ausiliari del relè termico: numerazione fissa 95-96 / 97-98 (EN 50005)
    id: 'ol_nc', name: 'Contatto NC del relè termico', category: 'Bobine e contatti', letter: 'F', role: 'aux',
    prims: [...ncContact(), L(1.8, 7.4, -6, 7.4, true), L(-6, 5.6, -6, 9.2), L(-6, 5.6, -7.8, 5.6), L(-7.8, 5.6, -7.8, 7.4), L(-6, 9.2, -4.4, 9.2)],
    pins: pins2('95', '96'), tagPos: { x: -10, y: 9 },
  },
  {
    id: 'ol_no', name: 'Contatto NA del relè termico', category: 'Bobine e contatti', letter: 'F', role: 'aux',
    prims: [...noContact(), L(-2.2, 7.75, -6, 7.75, true), L(-6, 6, -6, 9.5), L(-6, 6, -7.8, 6), L(-7.8, 6, -7.8, 7.75), L(-6, 9.5, -4.4, 9.5)],
    pins: pins2('97', '98'), tagPos: { x: -10, y: 9 },
  },

  // ---------------- Comandi ----------------
  {
    id: 'pb_no', name: 'Pulsante NA', category: 'Comandi', letter: 'S', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -9, 7.75, true), L(-9, 5.5, -9, 10), L(-9, 5.5, -10.5, 5.5), L(-9, 10, -10.5, 10)],
    pins: pins2('13', '14'), tagPos: { x: -12, y: 9 },
  },
  {
    id: 'pb_nc', name: 'Pulsante NC', category: 'Comandi', letter: 'S', role: 'single', contact: 'NC',
    prims: [...ncContact(), L(1.8, 7.4, -9, 7.4, true), L(-9, 5.2, -9, 9.6), L(-9, 5.2, -10.5, 5.2), L(-9, 9.6, -10.5, 9.6)],
    pins: pins2('11', '12'), tagPos: { x: -12, y: 9 },
  },
  {
    id: 'estop', name: 'Pulsante di emergenza (fungo)', category: 'Comandi', letter: 'S', role: 'single', contact: 'NC',
    prims: [...ncContact(), L(1.8, 7.4, -8, 7.4, true), L(-8, 4.4, -8, 10.4), A(-8, 7.4, 3, 90, 270)],
    pins: pins2('11', '12'), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'selector', name: 'Selettore NA', category: 'Comandi', letter: 'S', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -8, 7.75, true), L(-8, 7.75, -9.5, 5.5), L(-9.5, 5.5, -11, 7.75)],
    pins: pins2('13', '14'), tagPos: { x: -12, y: 11 },
  },
  {
    id: 'limit_no', name: 'Finecorsa NA', category: 'Sensori', letter: 'B', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -7, 7.75, true), L(-7, 7.75, -9, 5.5), L(-7, 7.75, -9, 10)],
    pins: pins2('13', '14'), tagPos: { x: -10, y: 13 },
  },
  {
    id: 'sensor3', name: 'Sensore di prossimità PNP 3 fili', category: 'Sensori', letter: 'B', role: 'single',
    prims: [{ t: 'rect', x: -4, y: 4, w: 16, h: 12 }, L(0, 0, 0, 4), L(0, 16, 0, 20), L(8, 16, 8, 20),
      L(4, 6, 6.5, 10), L(6.5, 10, 4, 14), L(4, 14, 1.5, 10), L(1.5, 10, 4, 6)],
    pins: [P('1', 0, 0, 'BN'), P('2', 0, 20, 'BK', 'down'), P('3', 8, 20, 'BU', 'down')], tagPos: { x: -6, y: 10 },
  },

  {
    id: 'selector_nc', name: 'Selettore NC', category: 'Comandi', letter: 'S', role: 'single', contact: 'NC',
    prims: [...ncContact(), L(1.8, 7.4, -8, 7.4, true), L(-8, 7.4, -9.5, 5.2), L(-9.5, 5.2, -11, 7.4)],
    pins: pins2('11', '12'), tagPos: { x: -12, y: 11 },
  },
  {
    id: 'key_switch', name: 'Selettore a chiave NA', category: 'Comandi', letter: 'S', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -7, 7.75, true), C(-8.2, 7.75, 1.2), L(-9.4, 7.75, -12, 7.75), L(-11, 7.75, -11, 9.2), L(-12, 7.75, -12, 9.2)],
    pins: pins2('13', '14'), tagPos: { x: -13, y: 12 },
  },

  // ---------------- Sensori (lettera B, IEC 81346-2: da grandezza fisica a segnale) ----------------
  {
    // Finecorsa NC ad apertura positiva (IEC 60617 S00259 + qualificatore di apertura positiva)
    id: 'limit_nc', name: 'Finecorsa NC (apertura positiva)', category: 'Sensori', letter: 'B', role: 'single', contact: 'NC',
    prims: [...ncContact(), L(1.8, 7.4, -7, 7.4, true), L(-7, 7.4, -9, 5.2), L(-7, 7.4, -9, 9.6), C(0.9, 9.8, 1.1), L(0.4, 9.3, 1.4, 10.3)],
    pins: pins2('11', '12'), tagPos: { x: -10, y: 13 },
  },
  {
    id: 'limit_nonc', name: 'Finecorsa NA + NC', category: 'Sensori', letter: 'B', role: 'single',
    prims: [...noContact(0), ...ncContact(8), L(-2.2, 7.75, 9.8, 7.75, true), L(-7, 7.75, -2.2, 7.75, true), L(-7, 7.75, -9, 5.5), L(-7, 7.75, -9, 10)],
    pins: [P('1', 0, 0, '13'), P('2', 0, 16, '14', 'down'), P('3', 8, 0, '21'), P('4', 8, 16, '22', 'down')], tagPos: { x: -10, y: 13 },
  },
  {
    id: 'pressure_no', name: 'Pressostato NA', category: 'Sensori', letter: 'B', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -7, 7.75, true), R(-11.5, 5.5, 4.5, 4.5), T(-9.25, 9, 'P', 3)],
    pins: pins2('13', '14'), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'thermostat_no', name: 'Termostato NA', category: 'Sensori', letter: 'B', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -7, 7.75, true), R(-11.5, 5.5, 4.5, 4.5), T(-9.25, 9, 'θ', 3)],
    pins: pins2('13', '14'), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'level_no', name: 'Interruttore di livello (galleggiante) NA', category: 'Sensori', letter: 'B', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -8, 7.75, true), L(-8, 7.75, -8, 10.5), C(-8, 12, 1.5), L(-10.5, 13.5, -5.5, 13.5)],
    pins: pins2('13', '14'), tagPos: { x: -11, y: 7 },
  },
  {
    id: 'sensor3_npn', name: 'Sensore di prossimità NPN 3 fili', category: 'Sensori', letter: 'B', role: 'single',
    prims: [R(-4, 4, 16, 12), L(0, 0, 0, 4), L(0, 16, 0, 20), L(8, 16, 8, 20),
      L(4, 6, 6.5, 10), L(6.5, 10, 4, 14), L(4, 14, 1.5, 10), L(1.5, 10, 4, 6), T(9.5, 7.5, 'NPN', 1.6)],
    pins: [P('1', 0, 0, 'BN'), P('2', 0, 20, 'BK', 'down'), P('3', 8, 20, 'BU', 'down')], tagPos: { x: -6, y: 10 },
  },
  {
    id: 'sensor2', name: 'Sensore di prossimità 2 fili', category: 'Sensori', letter: 'B', role: 'single',
    prims: [R(-4, 4, 8, 12), L(0, 0, 0, 4), L(0, 16, 0, 20), L(0, 6, 2.5, 10), L(2.5, 10, 0, 14), L(0, 14, -2.5, 10), L(-2.5, 10, 0, 6)],
    pins: [P('1', 0, 0, 'BN'), P('2', 0, 20, 'BU', 'down')], tagPos: { x: -6, y: 10 },
  },
  {
    // Fotocellula: emettitore e ricevitore con le frecce della luce, uscita a 3 fili
    id: 'photocell', name: 'Fotocellula 3 fili', category: 'Sensori', letter: 'B', role: 'single',
    prims: [R(-4, 4, 16, 12), L(4, 4, 4, 16), L(0, 0, 0, 4), L(0, 16, 0, 20), L(8, 16, 8, 20),
      L(-2.5, 7, 0.5, 10), L(0.5, 10, -0.6, 9.8), L(0.5, 10, 0.3, 8.9), L(-2.5, 9.5, 0.5, 12.5), L(0.5, 12.5, -0.6, 12.3), L(0.5, 12.5, 0.3, 11.4),
      L(10, 6.5, 10, 8.5), L(10, 13.5, 10, 11.5), L(10, 11.5, 6.5, 8.2)],
    pins: [P('1', 0, 0, 'BN'), P('2', 0, 20, 'BK', 'down'), P('3', 8, 20, 'BU', 'down')], tagPos: { x: -6, y: 10 },
  },
  {
    // Sensore magnetico (reed) comandato dall'avvicinamento di un magnete
    id: 'reed', name: 'Sensore magnetico (reed) NA', category: 'Sensori', letter: 'B', role: 'single', contact: 'NO',
    prims: [...noContact(), L(-2.2, 7.75, -5, 7.75, true), L(-6.5, 5.75, -5, 7.75), L(-5, 7.75, -6.5, 9.75), L(-6.5, 9.75, -8, 7.75), L(-8, 7.75, -6.5, 5.75),
      R(-12, 5.5, 2.5, 4.5, true)],
    pins: pins2('13', '14'), tagPos: { x: -13, y: 13 },
  },

  // ---------------- Protezioni ----------------
  {
    id: 'fuse', name: 'Fusibile', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [{ t: 'rect', x: -1.5, y: 4, w: 3, h: 8 }, L(0, 0, 0, 16)],
    pins: pins2('1', '2'), tagPos: { x: -4, y: 9 },
  },
  {
    id: 'mcb1', name: 'Interruttore magnetotermico 1P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...noContact(), L(-1, 4, 1, 6), L(1, 4, -1, 6), L(-2.2, 7.75, -8, 7.75, true), { t: 'rect', x: -11, y: 6, w: 3, h: 3.5 }],
    pins: pins2('1', '2'), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'mcb2', name: 'Interruttore magnetotermico 2P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...noContact(0), ...noContact(8), L(-1, 4, 1, 6), L(1, 4, -1, 6), L(7, 4, 9, 6), L(9, 4, 7, 6),
      L(-8, 7.75, 5.8, 7.75, true), { t: 'rect', x: -11, y: 6, w: 3, h: 3.5 }],
    pins: [P('1', 0, 0, '1'), P('2', 0, 16, '2', 'down'), P('3', 8, 0, '3'), P('4', 8, 16, '4', 'down')], tagPos: { x: -13, y: 9 },
  },
  {
    id: 'mcb3', name: 'Interruttore magnetotermico 3P', category: 'Protezioni', letter: 'Q', role: 'single',
    prims: [...poles3(noContact), L(-1, 4, 1, 6), L(1, 4, -1, 6), L(7, 4, 9, 6), L(9, 4, 7, 6), L(15, 4, 17, 6), L(17, 4, 15, 6),
      L(-8, 7.75, 13.8, 7.75, true), { t: 'rect', x: -11, y: 6, w: 3, h: 3.5 }],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'mpcb3', name: 'Salvamotore 3P', category: 'Protezioni', letter: 'Q', role: 'main',
    prims: [...poles3(noContact), L(-1, 4, 1, 6), L(1, 4, -1, 6), L(7, 4, 9, 6), L(9, 4, 7, 6), L(15, 4, 17, 6), L(17, 4, 15, 6),
      L(-8, 7.75, 13.8, 7.75, true), { t: 'rect', x: -11, y: 6, w: 3, h: 3.5 }, T(-9.5, 13, 'I>', 2)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -13, y: 9 },
  },
  {
    id: 'overload3', name: 'Relè termico 3P', category: 'Protezioni', letter: 'F', role: 'main',
    prims: [L(0, 0, 0, 16), L(8, 0, 8, 16), L(16, 0, 16, 16), { t: 'rect', x: -3, y: 5, w: 22, h: 6 },
      L(-1, 9, 1, 9), L(1, 9, 1, 7), L(1, 7, -1, 7), L(7, 9, 9, 9), L(9, 9, 9, 7), L(9, 7, 7, 7), L(15, 9, 17, 9), L(17, 9, 17, 7), L(17, 7, 15, 7)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -5, y: 9 },
  },

  {
    id: 'mcb4', name: 'Interruttore magnetotermico 4P (3P+N)', category: 'Protezioni', letter: 'Q', role: 'single',
    prims: [...noContact(0), ...noContact(8), ...noContact(16), ...noContact(24), ...breakerX(0), ...breakerX(8), ...breakerX(16), ...breakerX(24),
      L(-8, 7.75, 21.8, 7.75, true), R(-11, 6, 3, 3.5)],
    pins: [P('1', 0, 0, '1'), P('2', 0, 16, '2', 'down'), P('3', 8, 0, '3'), P('4', 8, 16, '4', 'down'),
      P('5', 16, 0, '5'), P('6', 16, 16, '6', 'down'), P('7', 24, 0, 'N'), P('8', 24, 16, 'N', 'down')], tagPos: { x: -13, y: 9 },
  },
  {
    // Differenziale puro (IEC 60617 S00366: dispositivo a corrente differenziale)
    id: 'rcd2', name: 'Interruttore differenziale 2P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...noContact(0), ...noContact(8), L(-8, 7.75, 5.8, 7.75, true), R(-14, 5.5, 6, 4.5), T(-11, 8.9, 'IΔ', 2.2)],
    pins: [P('1', 0, 0, '1'), P('2', 0, 16, '2', 'down'), P('3', 8, 0, 'N'), P('4', 8, 16, 'N', 'down')], tagPos: { x: -15, y: 13 },
  },
  {
    id: 'rcd4', name: 'Interruttore differenziale 4P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...noContact(0), ...noContact(8), ...noContact(16), ...noContact(24), L(-8, 7.75, 21.8, 7.75, true), R(-14, 5.5, 6, 4.5), T(-11, 8.9, 'IΔ', 2.2)],
    pins: [P('1', 0, 0, '1'), P('2', 0, 16, '2', 'down'), P('3', 8, 0, '3'), P('4', 8, 16, '4', 'down'),
      P('5', 16, 0, '5'), P('6', 16, 16, '6', 'down'), P('7', 24, 0, 'N'), P('8', 24, 16, 'N', 'down')], tagPos: { x: -15, y: 13 },
  },
  {
    id: 'rcbo2', name: 'Magnetotermico differenziale 2P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...noContact(0), ...noContact(8), ...breakerX(0), ...breakerX(8), L(-8, 7.75, 5.8, 7.75, true), R(-14, 5.5, 6, 4.5), T(-11, 8.9, 'IΔ', 2.2)],
    pins: [P('1', 0, 0, '1'), P('2', 0, 16, '2', 'down'), P('3', 8, 0, 'N'), P('4', 8, 16, 'N', 'down')], tagPos: { x: -15, y: 13 },
  },
  {
    id: 'disconnector3', name: 'Sezionatore 3P', category: 'Protezioni', letter: 'Q', role: 'single',
    prims: [...poles3(noContact), discBar(0), discBar(8), discBar(16), L(-8, 7.75, 13.8, 7.75, true), L(-8, 5.5, -8, 10), L(-8, 5.5, -9.5, 5.5), L(-8, 10, -6.5, 10)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -11, y: 13 },
  },
  {
    // Interruttore di manovra-sezionatore (IEC 60617 S00288): funzione di sezionatore e di manovra
    id: 'switch_disc3', name: 'Interruttore di manovra-sezionatore 3P', category: 'Protezioni', letter: 'Q', role: 'single',
    prims: [...poles3(noContact), discBar(0), discBar(8), discBar(16), loadCircle(0), loadCircle(8), loadCircle(16),
      L(-8, 7.75, 13.8, 7.75, true), L(-8, 5.5, -8, 10), L(-8, 5.5, -9.5, 5.5), L(-8, 10, -6.5, 10)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -11, y: 13 },
  },
  {
    id: 'fuse_disc3', name: 'Sezionatore con fusibili 3P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [...fuseBlade(0), ...fuseBlade(8), ...fuseBlade(16), L(-8, 8.25, 13.6, 8.25, true)],
    pins: pins3(['1', '2', '3', '4', '5', '6']), tagPos: { x: -10, y: 13 },
  },
  {
    id: 'fuse_disc1', name: 'Sezionatore con fusibile 1P', category: 'Protezioni', letter: 'F', role: 'single',
    prims: fuseBlade(0), pins: pins2('1', '2'), tagPos: { x: -7, y: 13 },
  },
  {
    // Scaricatore di sovratensione (SPD) verso terra
    id: 'surge', name: 'Scaricatore di sovratensione', category: 'Protezioni', letter: 'F', role: 'single',
    prims: [R(-2, 4, 4, 8), L(0, 0, 0, 4), L(0, 12, 0, 16), L(0, 4.8, 0, 9), L(-0.9, 7.6, 0, 9.4), L(0.9, 7.6, 0, 9.4)],
    pins: [P('1', 0, 0, 'L'), P('2', 0, 16, 'PE', 'down')], tagPos: { x: -4, y: 9 },
  },

  // ---------------- Utilizzatori ----------------
  {
    id: 'motor3', name: 'Motore trifase', category: 'Utilizzatori', letter: 'M', role: 'single',
    prims: [L(-8, 0, -8, 6), L(-8, 6, -5.66, 8.34), L(0, 0, 0, 6), L(8, 0, 8, 6), L(8, 6, 5.66, 8.34),
      { t: 'circle', cx: 0, cy: 14, r: 8 }, T(0, 15, 'M', 5), T(0, 19.5, '3~', 3), L(16, 0, 16, 14), L(16, 14, 8, 14)],
    pins: [P('1', -8, 0, 'U1'), P('2', 0, 0, 'V1'), P('3', 8, 0, 'W1'), P('4', 16, 0, 'PE')], tagPos: { x: -10, y: 14 },
  },
  {
    id: 'motor1', name: 'Motore monofase', category: 'Utilizzatori', letter: 'M', role: 'single',
    prims: [L(0, 0, 0, 6), L(8, 0, 8, 6), L(8, 6, 6, 8), { t: 'circle', cx: 2, cy: 14, r: 7 }, T(2, 15, 'M', 5), T(2, 19, '1~', 2.5)],
    pins: [P('1', 0, 0, 'L'), P('2', 8, 0, 'N')], tagPos: { x: -7, y: 14 },
  },
  {
    id: 'lamp', name: 'Lampada di segnalazione', category: 'Utilizzatori', letter: 'P', role: 'single',
    prims: [{ t: 'circle', cx: 0, cy: 8, r: 4 }, L(-2.83, 5.17, 2.83, 10.83), L(2.83, 5.17, -2.83, 10.83), L(0, 0, 0, 4), L(0, 12, 0, 16)],
    pins: pins2('X1', 'X2'), tagPos: { x: -6, y: 9 },
  },
  {
    id: 'valve', name: 'Elettrovalvola', category: 'Utilizzatori', letter: 'M', role: 'single',
    prims: [{ t: 'rect', x: -5, y: 5, w: 10, h: 6 }, L(-5, 11, 5, 5), L(0, 0, 0, 5), L(0, 11, 0, 16)],
    pins: pins2('1', '2'), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'psu', name: 'Alimentatore 230 V AC / 24 V DC', category: 'Utilizzatori', letter: 'T', role: 'single',
    prims: [{ t: 'rect', x: -4, y: 4, w: 24, h: 16 }, L(0, 0, 0, 4), L(8, 0, 8, 4), L(16, 0, 16, 4), L(0, 20, 0, 24), L(8, 20, 8, 24),
      L(-4, 20, 20, 4), T(2, 10, '~', 4), T(14, 17, '=', 4)],
    pins: [P('1', 0, 0, 'L'), P('2', 8, 0, 'N'), P('3', 16, 0, 'PE'), P('4', 0, 24, '+', 'down'), P('5', 8, 24, '-', 'down')], tagPos: { x: -6, y: 12 },
  },
  {
    id: 'transformer', name: 'Trasformatore', category: 'Utilizzatori', letter: 'T', role: 'single',
    prims: [L(0, 0, 0, 4), L(8, 0, 8, 4), { t: 'circle', cx: 4, cy: 9, r: 5 }, { t: 'circle', cx: 4, cy: 15, r: 5 }, L(0, 20, 0, 24), L(8, 20, 8, 24)],
    pins: [P('1', 0, 0, '1'), P('2', 8, 0, '2'), P('3', 0, 24, '3', 'down'), P('4', 8, 24, '4', 'down')], tagPos: { x: -3, y: 12 },
  },

  {
    id: 'buzzer', name: 'Cicalino', category: 'Utilizzatori', letter: 'P', role: 'single',
    prims: [L(0, 0, 0, 5), A(0, 9, 4, 180, 360), L(-4, 9, 4, 9), L(0, 9, 0, 16)],
    pins: pins2('X1', 'X2'), tagPos: { x: -6, y: 9 },
  },
  {
    id: 'horn', name: 'Sirena (avvisatore acustico)', category: 'Utilizzatori', letter: 'P', role: 'single',
    prims: [L(0, 0, 0, 4), R(-2, 4, 4, 8), { t: 'poly', pts: [{ x: 2, y: 6 }, { x: 6, y: 3 }, { x: 6, y: 13 }, { x: 2, y: 10 }], closed: true }, L(0, 12, 0, 16)],
    pins: pins2('X1', 'X2'), tagPos: { x: -4, y: 9 },
  },
  {
    id: 'heater', name: 'Resistenza di riscaldamento', category: 'Utilizzatori', letter: 'E', role: 'single',
    prims: [R(-2.5, 3, 5, 10), L(-2.5, 5.5, 2.5, 5.5), L(-2.5, 8, 2.5, 8), L(-2.5, 10.5, 2.5, 10.5), L(0, 0, 0, 3), L(0, 13, 0, 16)],
    pins: pins2('1', '2'), tagPos: { x: -4, y: 9 },
  },
  {
    id: 'motor_dc', name: 'Motore in corrente continua', category: 'Utilizzatori', letter: 'M', role: 'single',
    prims: [L(0, 0, 0, 6), L(8, 0, 8, 6), L(8, 6, 6, 8), C(2, 14, 7), T(2, 15, 'M', 5), T(2, 19.3, '=', 3)],
    pins: [P('1', 0, 0, '+'), P('2', 8, 0, '−')], tagPos: { x: -7, y: 14 },
  },
  {
    id: 'inverter3', name: 'Inverter (convertitore di frequenza)', category: 'Utilizzatori', letter: 'U', role: 'single',
    prims: [R(-4, 4, 32, 24), L(-4, 28, 28, 4), T(4, 12, '~', 5), T(20, 25, '~', 5),
      L(0, 0, 0, 4), L(8, 0, 8, 4), L(16, 0, 16, 4), L(24, 0, 24, 4), L(0, 28, 0, 32), L(8, 28, 8, 32), L(16, 28, 16, 32)],
    pins: [P('1', 0, 0, 'L1'), P('2', 8, 0, 'L2'), P('3', 16, 0, 'L3'), P('4', 24, 0, 'PE'),
      P('5', 0, 32, 'U', 'down'), P('6', 8, 32, 'V', 'down'), P('7', 16, 32, 'W', 'down')], tagPos: { x: -6, y: 16 },
  },

  // ---------------- Componenti (resistenze, condensatori, diodi, batterie) ----------------
  {
    id: 'resistor', name: 'Resistenza', category: 'Componenti', letter: 'R', role: 'single',
    prims: [R(-1.5, 3, 3, 10), L(0, 0, 0, 3), L(0, 13, 0, 16)],
    pins: pins2('1', '2'), tagPos: { x: -3, y: 9 },
  },
  {
    id: 'capacitor', name: 'Condensatore', category: 'Componenti', letter: 'C', role: 'single',
    prims: [L(0, 0, 0, 7.2), L(-4, 7.2, 4, 7.2), L(-4, 8.8, 4, 8.8), L(0, 8.8, 0, 16)],
    pins: pins2('1', '2'), tagPos: { x: -5, y: 9 },
  },
  {
    id: 'diode', name: 'Diodo', category: 'Componenti', letter: 'R', role: 'single',
    prims: [L(0, 0, 0, 5), { t: 'poly', pts: [{ x: -3, y: 5 }, { x: 3, y: 5 }, { x: 0, y: 10 }], closed: true }, L(-3, 10, 3, 10), L(0, 10, 0, 16)],
    pins: pins2('A', 'K'), tagPos: { x: -4, y: 9 },
  },
  {
    id: 'battery', name: 'Batteria', category: 'Componenti', letter: 'G', role: 'single',
    prims: [L(0, 0, 0, 7), L(-4, 7, 4, 7), L(-2, 9, 2, 9), L(0, 9, 0, 16), T(4, 5.5, '+', 2.5)],
    pins: pins2('+', '−'), tagPos: { x: -5, y: 9 },
  },

  // ---------------- PLC ----------------
  // Il riquadro mostra l'indirizzo (I0.0, %QX0.1…); la sigla indica la scheda, il canale è nelle proprietà
  {
    id: 'plc_di', name: 'Ingresso digitale PLC', category: 'PLC', letter: 'A', role: 'plc', io: 'DI',
    prims: [L(0, 0, 0, 4), { t: 'rect', x: -6, y: 4, w: 12, h: 7 }, L(-6, 11, -4, 13), L(6, 11, 4, 13), L(-4, 13, 4, 13)],
    pins: [P('1', 0, 0, '')], tagPos: { x: -8, y: 8 },
  },
  {
    id: 'plc_do', name: 'Uscita digitale PLC', category: 'PLC', letter: 'A', role: 'plc', io: 'DO',
    prims: [L(-4, 0, 4, 0), L(-4, 0, -6, 2), L(4, 0, 6, 2), { t: 'rect', x: -6, y: 2, w: 12, h: 7 }, L(0, 9, 0, 16)],
    pins: [P('1', 0, 16, '', 'down')], tagPos: { x: -8, y: 6 },
  },
  {
    id: 'plc_ai', name: 'Ingresso analogico PLC', category: 'PLC', letter: 'A', role: 'plc', io: 'AI',
    prims: [L(0, 0, 0, 4), { t: 'rect', x: -6, y: 4, w: 12, h: 7 }, L(-6, 11, -4, 13), L(6, 11, 4, 13), L(-4, 13, 4, 13), T(4.2, 6.6, '~', 2)],
    pins: [P('1', 0, 0, '')], tagPos: { x: -8, y: 8 },
  },
  {
    id: 'plc_ao', name: 'Uscita analogica PLC', category: 'PLC', letter: 'A', role: 'plc', io: 'AO',
    prims: [L(-4, 0, 4, 0), L(-4, 0, -6, 2), L(4, 0, 6, 2), { t: 'rect', x: -6, y: 2, w: 12, h: 7 }, L(0, 9, 0, 16), T(4.2, 4.6, '~', 2)],
    pins: [P('1', 0, 16, '', 'down')], tagPos: { x: -8, y: 6 },
  },
  // Blocchetti I/O: nel riquadro indirizzo, nome della variabile e commento (la descrizione del
  // dispositivo collegato se il commento non è scritto). Con due morsetti per canale: uscite
  // fail-safe a commutazione P/M (F-DQ PM) e ingressi con l'alimentazione del sensore (VS)
  {
    id: 'plc_di_var', name: 'Ingresso PLC con variabile (1 morsetto)', category: 'PLC', letter: 'A', role: 'plc', io: 'DI',
    prims: [L(0, 0, 0, 4), { t: 'rect', x: -4, y: 4, w: 32, h: 12 }, L(-1.2, 2.4, 0, 4), L(1.2, 2.4, 0, 4)],
    pins: [P('1', 0, 0, '')], tagPos: { x: -6, y: 10 }, fields: plcVarFields(4),
  },
  {
    id: 'plc_di2_var', name: 'Ingresso PLC con variabile (2 morsetti)', category: 'PLC', letter: 'A', role: 'plc', io: 'DI',
    prims: [L(0, 0, 0, 4), L(8, 0, 8, 4), { t: 'rect', x: -4, y: 4, w: 32, h: 12 }, L(-1.2, 2.4, 0, 4), L(1.2, 2.4, 0, 4)],
    pins: [P('1', 0, 0, ''), P('2', 8, 0, 'VS')], tagPos: { x: -6, y: 10 }, fields: plcVarFields(4),
  },
  {
    id: 'plc_do_var', name: 'Uscita PLC con variabile (1 morsetto)', category: 'PLC', letter: 'A', role: 'plc', io: 'DO',
    prims: [{ t: 'rect', x: -4, y: 0, w: 32, h: 12 }, L(0, 12, 0, 16), L(-1.2, 12, 0, 13.6), L(1.2, 12, 0, 13.6)],
    pins: [P('1', 0, 16, '', 'down')], tagPos: { x: -6, y: 6 }, fields: plcVarFields(0),
  },
  {
    id: 'plc_do2_var', name: 'Uscita PLC con variabile (2 morsetti P/M)', category: 'PLC', letter: 'A', role: 'plc', io: 'DO',
    prims: [{ t: 'rect', x: -4, y: 0, w: 32, h: 12 }, L(0, 12, 0, 16), L(8, 12, 8, 16), L(-1.2, 12, 0, 13.6), L(1.2, 12, 0, 13.6)],
    pins: [P('1', 0, 16, 'P', 'down'), P('2', 8, 16, 'M', 'down')], tagPos: { x: -6, y: 6 }, fields: plcVarFields(0),
  },
  {
    id: 'plc_power', name: 'Alimentazione scheda PLC (L+ / M)', category: 'PLC', letter: 'A', role: 'plc',
    prims: [L(0, 0, 0, 4), { t: 'rect', x: -6, y: 4, w: 12, h: 8 }, L(0, 12, 0, 16), T(0, 7.4, 'L+', 2), T(0, 11, 'M', 2)],
    pins: [P('1', 0, 0, 'L+'), P('2', 0, 16, 'M', 'down')], tagPos: { x: -8, y: 9 },
  },

  // Gruppi I/O: canali uno accanto all'altro (passo 8 mm) in un riquadro unico; sotto ogni canale
  // indirizzo, variabile e commento scritti dal basso verso l'alto. I canali sono simboli nascosti:
  // si inseriscono con i gruppi
  ...([['di', 'DI', 1], ['di', 'DI', 2], ['do', 'DO', 1], ['do', 'DO', 2]] as const).flatMap(([k, io, n]) => {
    const slice = plcSlice(`plc_ch_${k}${n}`, io, n);
    const what = io === 'DI' ? 'ingressi' : 'uscite';
    const group: SymbolDef = {
      id: `plc_grp_${k}${n}`, name: `Gruppo 8 ${what} PLC (${n} ${n === 1 ? 'morsetto' : 'morsetti'} per canale)`, category: 'PLC', letter: 'A', role: 'plc', io,
      prims: Array.from({ length: 8 }, (_, i) => slice.prims.map(p => shiftPrim(p, i * PLC_GROUP_STEP))).flat(),
      pins: [], tagPos: slice.tagPos, plcGroup: { slice: slice.id, count: 8 },
      description: 'Si sceglie la scheda e il primo canale; indirizzi automatici, pin, variabili e commenti modificabili per ogni canale',
    };
    return [slice, group];
  }),

  // ---------------- Unifilare ----------------
  // Rappresentazioni a una linea: stessa sigla del dispositivo nel multifilare
  {
    id: 'ol_breaker', name: 'Interruttore (unifilare)', category: 'Unifilare', letter: 'Q', role: 'oneline',
    prims: [L(0, 0, 0, 5), L(0, 16, 0, 11), L(0, 11, -4.5, 4.5), L(-1, 4, 1, 6), L(-1, 6, 1, 4)],
    pins: pins2('', ''), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'ol_mpcb', name: 'Salvamotore (unifilare)', category: 'Unifilare', letter: 'Q', role: 'oneline',
    prims: [L(0, 0, 0, 5), L(0, 16, 0, 11), L(0, 11, -4.5, 4.5), L(-1, 4, 1, 6), L(-1, 6, 1, 4), { t: 'rect', x: -7.5, y: 6, w: 2.5, h: 2.5 }, L(-5, 7.2, -3, 7.2, true)],
    pins: pins2('', ''), tagPos: { x: -9, y: 9 },
  },
  {
    id: 'ol_disconnector', name: 'Sezionatore (unifilare)', category: 'Unifilare', letter: 'Q', role: 'oneline',
    prims: [L(0, 0, 0, 5), L(0, 16, 0, 11), L(0, 11, -4.5, 4.5), L(-1.5, 5, 1.5, 5)],
    pins: pins2('', ''), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'ol_fuse', name: 'Fusibile (unifilare)', category: 'Unifilare', letter: 'F', role: 'oneline',
    prims: [{ t: 'rect', x: -1.5, y: 3, w: 3, h: 10 }, L(0, 0, 0, 16)],
    pins: pins2('', ''), tagPos: { x: -4, y: 9 },
  },
  {
    id: 'ol_contactor', name: 'Contattore (unifilare)', category: 'Unifilare', letter: 'K', role: 'oneline',
    prims: [L(0, 0, 0, 5), L(0, 16, 0, 11), L(0, 11, -4.5, 4.5), A(0, 6.5, 1.5, 180, 360)],
    pins: pins2('', ''), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'ol_motor', name: 'Motore (unifilare)', category: 'Unifilare', letter: 'M', role: 'oneline',
    prims: [L(0, 0, 0, 2), { t: 'circle', cx: 0, cy: 8, r: 6 }, T(0, 9, 'M', 4), T(0, 12.2, '3~', 2)],
    pins: [P('1', 0, 0, '')], tagPos: { x: -8, y: 8 },
  },
  {
    id: 'ol_transformer', name: 'Trasformatore (unifilare)', category: 'Unifilare', letter: 'T', role: 'oneline',
    prims: [L(0, 0, 0, 2), { t: 'circle', cx: 0, cy: 6, r: 4 }, { t: 'circle', cx: 0, cy: 11, r: 4 }, L(0, 15, 0, 16)],
    pins: pins2('', ''), tagPos: { x: -6, y: 9 },
  },
  {
    id: 'ol_vfd', name: 'Inverter (unifilare)', category: 'Unifilare', letter: 'U', role: 'oneline',
    prims: [L(0, 0, 0, 3), { t: 'rect', x: -5, y: 3, w: 10, h: 10 }, L(-5, 13, 5, 3), T(-2, 7, '~', 2.5), T(2.2, 11.5, '~', 2.5), L(0, 13, 0, 16)],
    pins: pins2('', ''), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'ol_psu', name: 'Alimentatore (unifilare)', category: 'Unifilare', letter: 'T', role: 'oneline',
    prims: [L(0, 0, 0, 3), { t: 'rect', x: -5, y: 3, w: 10, h: 10 }, L(-5, 13, 5, 3), T(-2, 7, '~', 2.5), T(2.2, 11.5, '=', 2.5), L(0, 13, 0, 16)],
    pins: pins2('', ''), tagPos: { x: -7, y: 9 },
  },
  {
    id: 'ol_load', name: 'Utenza generica (unifilare)', category: 'Unifilare', letter: 'E', role: 'oneline',
    prims: [L(0, 0, 0, 3), { t: 'rect', x: -5, y: 3, w: 10, h: 8 }],
    pins: [P('1', 0, 0, '')], tagPos: { x: -7, y: 8 },
  },

  // ---------------- Reti e bus ----------------
  {
    id: 'net_node2', name: 'Nodo di rete 2 porte (IN/OUT)', category: 'Reti e bus', letter: 'A', role: 'netnode',
    prims: [{ t: 'rect', x: -12, y: -6, w: 24, h: 12 }, L(-16, 0, -12, 0), L(12, 0, 16, 0)],
    pins: [P('1', -16, 0, 'IN', 'left'), P('2', 16, 0, 'OUT', 'right')], tagPos: { x: -11, y: -1.5 },
    description: 'Dispositivo su bus in cascata (EtherCAT, Profinet con switch integrato, Modbus RTU…)',
  },
  {
    id: 'net_node2b', name: 'Nodo di rete 2 porte in basso (P1/P2)', category: 'Reti e bus', letter: 'A', role: 'netnode',
    prims: [{ t: 'rect', x: -12, y: -8, w: 24, h: 12 }, L(-4, 4, -4, 8), L(4, 4, 4, 8)],
    pins: [P('1', -4, 8, 'P1', 'down'), P('2', 4, 8, 'P2', 'down')], tagPos: { x: -11, y: -3.5 },
  },
  {
    id: 'net_node1', name: 'Nodo di rete 1 porta', category: 'Reti e bus', letter: 'A', role: 'netnode',
    prims: [{ t: 'rect', x: -12, y: -8, w: 24, h: 12 }, L(0, 4, 0, 8)],
    pins: [P('1', 0, 8, 'P1', 'down')], tagPos: { x: -11, y: -3.5 },
  },
  {
    id: 'net_switch', name: 'Switch di rete 5 porte', category: 'Reti e bus', letter: 'A', role: 'netnode',
    prims: [{ t: 'rect', x: -20, y: -8, w: 40, h: 12 }, ...[-16, -8, 0, 8, 16].map(x => L(x, 4, x, 8)), T(14, -4.5, 'SW', 2)],
    pins: [-16, -8, 0, 8, 16].map((x, i) => P(String(i + 1), x, 8, `P${i + 1}`, 'down')), tagPos: { x: -19, y: -3.5 },
    description: 'Switch Ethernet: le porte sono collegate tra loro',
  },
  {
    id: 'net_term', name: 'Terminazione di bus', category: 'Reti e bus', letter: 'R', role: 'single',
    prims: [L(0, 0, 0, 3), { t: 'rect', x: -2, y: 3, w: 4, h: 7 }, L(0, 10, 0, 12), L(-2, 12, 2, 12)],
    pins: [P('1', 0, 0, '')], tagPos: { x: -3, y: 7 },
    description: 'Resistenza di terminazione (Modbus RTU, Profibus, CANopen)',
  },

  // ---------------- Morsetti e collegamenti ----------------
  {
    id: 'conn_male', name: 'Pin di spina (maschio)', category: 'Morsetti e collegamenti', letter: 'X', role: 'pin',
    prims: [L(0, 0, 0, 3), { t: 'rect', x: -1, y: 3, w: 2, h: 3, fill: true }, L(0, 6, 0, 8)],
    pins: pins2('', '', 8), tagPos: { x: -3, y: 5 },
    description: 'Pin di un connettore maschio (spina)',
  },
  {
    id: 'conn_female', name: 'Pin di presa (femmina)', category: 'Morsetti e collegamenti', letter: 'X', role: 'pin',
    prims: [L(0, 0, 0, 3), A(0, 5, 2, 180, 360), L(0, 5, 0, 8)],
    pins: pins2('', '', 8), tagPos: { x: -3, y: 5 },
    description: 'Pin di un connettore femmina (presa)',
  },
  {
    id: 'conn_pair', name: 'Pin presa + spina', category: 'Morsetti e collegamenti', letter: 'X', role: 'pin',
    prims: [L(0, 0, 0, 3.5), A(0, 5.5, 2, 180, 360), { t: 'rect', x: -1, y: 4.5, w: 2, h: 3, fill: true }, L(0, 7.5, 0, 12)],
    pins: pins2('', '', 12), tagPos: { x: -3, y: 6 },
    description: 'Collegamento a innesto: presa e spina',
  },
  {
    id: 'terminal', name: 'Morsetto', category: 'Morsetti e collegamenti', letter: 'X', role: 'terminal',
    prims: [L(0, 0, 0, 2.7), { t: 'circle', cx: 0, cy: 4, r: 1.3 }, L(0, 5.3, 0, 8)],
    pins: pins2('', '', 8), tagPos: { x: -3, y: 5 },
  },
  {
    id: 'terminal_pe', name: 'Morsetto PE', category: 'Morsetti e collegamenti', letter: 'X', role: 'terminal',
    prims: [L(0, 0, 0, 2.7), { t: 'circle', cx: 0, cy: 4, r: 1.3 }, L(0, 5.3, 0, 8), L(1.3, 4, 3, 4), L(3, 2.6, 3, 5.4), L(3.8, 3, 3.8, 5), L(4.6, 3.5, 4.6, 4.5)],
    pins: pins2('', '', 8), tagPos: { x: -3, y: 5 },
    description: 'Morsetto di terra (giallo-verde)',
  },
  {
    id: 'terminal_disc', name: 'Morsetto sezionabile', category: 'Morsetti e collegamenti', letter: 'X', role: 'terminal',
    prims: [L(0, 0, 0, 2.7), { t: 'circle', cx: 0, cy: 4, r: 1.3 }, L(0, 5.3, 0, 8), L(0, 8, -2.6, 12.2), L(0, 12.5, 0, 16), L(-0.8, 12.5, 0.8, 12.5)],
    pins: pins2('', '', 16), tagPos: { x: -3, y: 5 },
    description: 'Morsetto con coltello di sezionamento',
  },
  {
    id: 'terminal_fuse', name: 'Morsetto portafusibile', category: 'Morsetti e collegamenti', letter: 'X', role: 'terminal',
    prims: [L(0, 0, 0, 2.7), { t: 'circle', cx: 0, cy: 4, r: 1.3 }, L(0, 5.3, 0, 7.5), { t: 'rect', x: -1.4, y: 7.5, w: 2.8, h: 5.5 }, L(0, 7.5, 0, 16)],
    pins: pins2('', '', 16), tagPos: { x: -3, y: 5 },
    description: 'Morsetto con fusibile',
  },
  {
    id: 'potential', name: 'Punto di potenziale', category: 'Morsetti e collegamenti', letter: '', role: 'potential',
    prims: [L(-6, 0, 0, 0), L(-6, -1.5, -6, 1.5)],
    pins: [P('1', 0, 0, '', 'right')], tagPos: { x: -7, y: 1 },
  },
  {
    id: 'pe', name: 'Terra di protezione PE', category: 'Morsetti e collegamenti', letter: '', role: 'potential',
    prims: [L(0, 0, 0, 4), L(-3, 4, 3, 4), L(-2, 5.3, 2, 5.3), L(-1, 6.6, 1, 6.6)],
    pins: [P('1', 0, 0, '')], tagPos: { x: 4, y: 6 },
  },
  {
    id: 'fe', name: 'Terra funzionale FE', category: 'Morsetti e collegamenti', letter: '', role: 'potential',
    prims: [L(0, 0, 0, 4), L(-3, 4, 3, 4), L(-3, 4, -4.5, 6.5), L(0, 4, -1.5, 6.5), L(3, 4, 1.5, 6.5)],
    pins: [P('1', 0, 0, '')], tagPos: { x: 4, y: 6 },
  },
  {
    id: 'link', name: 'Rimando (partenza)', category: 'Morsetti e collegamenti', letter: '', role: 'link',
    // Freccia piena che punta nella direzione in cui prosegue il conduttore
    prims: [L(0, 0, 0, 1.2), { t: 'poly', pts: [{ x: -1.4, y: 1.2 }, { x: 1.4, y: 1.2 }, { x: 0, y: 3.6 }], closed: true, fill: true }],
    pins: [P('1', 0, 0, '')], tagPos: { x: 0, y: 6 },
    description: 'Il conduttore prosegue su un\'altra pagina',
  },
  {
    id: 'link_in', name: 'Rimando (arrivo)', category: 'Morsetti e collegamenti', letter: '', role: 'link',
    // Freccia piena che punta verso il conduttore in arrivo
    prims: [L(0, 0, 0, 1.2), { t: 'poly', pts: [{ x: 0, y: 1.2 }, { x: -1.4, y: 3.6 }, { x: 1.4, y: 3.6 }], closed: true, fill: true }],
    pins: [P('1', 0, 0, '')], tagPos: { x: 0, y: 6 },
    description: 'Il conduttore arriva da un\'altra pagina',
  },
];

export const SYMBOL_CATEGORIES = Array.from(new Set(BUILTIN_SYMBOLS.map(s => s.category)));

/** Numero di un morsetto ("13", "2/T1", "(N)8") e il resto della designazione */
function numberOf(d: string): { n: number; digits: string; prefix: string; rest: string } | undefined {
  const m = /^(\(N\))?(\d+)(\/.*)?$/.exec(d.trim());
  return m ? { n: parseInt(m[2], 10), digits: m[2], prefix: m[1] ?? '', rest: m[3] ?? '' } : undefined;
}

/** Morsetto "di arrivo" (in basso) per la numerazione IEC: 2/T1, 4, (N)8, 14, 22, 96 */
function lowerByNumber(d: string): boolean | undefined {
  const x = numberOf(d);
  if (!x) return undefined;
  const last = parseInt(x.digits[x.digits.length - 1], 10);
  return last % 2 === 0;
}

/** Morsetto compagno di quello in alto: 1/L1 → 2/T1, 13 → 14, (N)7 → (N)8, A1 → A2, X1 → X2 */
function partnerOf(d: string, pool: string[]): string | undefined {
  const x = numberOf(d);
  if (x) {
    const want = x.digits.length >= 2 ? `${x.digits.slice(0, -1)}${parseInt(x.digits.slice(-1), 10) + 1}` : String(x.n + 1);
    return pool.find(q => { const y = numberOf(q); return !!y && y.digits === want && y.prefix === x.prefix; });
  }
  const m = /^([A-Z]+)1$/i.exec(d);
  return m ? pool.find(q => q.toUpperCase() === `${m[1].toUpperCase()}2`) : undefined;
}

/** Colonna della scatola nera: punto in alto, punto in basso e cosa c'è in mezzo */
interface BbCol { top?: string; bottom?: string; kind?: 'NO' | 'NC' | 'COC' | 'COO' | 'coil' | 'pole'; group?: number; topText?: string; bottomText?: string }

/**
 * Genera un simbolo "scatola nera" a partire dal modello funzione di un articolo (tipicamente
 * importato da un EDZ senza macro leggibile). Ingressi in alto e uscite in basso secondo la
 * numerazione (1/L1 → 2/T1, 13 → 14, A1 → A2, 0 V e uscite in basso), i morsetti compagni uno
 * sotto l'altro e, dentro, contatti, bobine e poli dei sezionatori con le descrizioni dei morsetti.
 */
export function blackBoxFromPart(part: Part): SymbolDef {
  const cols: BbCol[] = [];
  const singles: { d: string; text?: string; plc: boolean }[] = [];
  let group = 0;
  for (const ft of part.functionTemplates) {
    const c = ft.connections.filter(Boolean);
    const texts = (ft.description ?? '').split(/\r?\n/).map(t => t.trim());
    const textOf = (i: number) => (c.length > 1 ? (texts.length === c.length ? texts[i] : undefined) : texts.filter(Boolean).join(' ')) || undefined;
    const plc = /^30\d\./.test(ft.category ?? '');
    if (c.length === 1) { singles.push({ d: c[0], text: textOf(0), plc }); continue; }
    if (c.length === 2) {
      let [a, b] = c;
      if (lowerByNumber(a) === true && lowerByNumber(b) === false) [a, b] = [b, a];
      if (isLowerConnection(a) && !isLowerConnection(b)) [a, b] = [b, a];
      const coil = /^A1$/i.test(a) && /^A2$/i.test(b);
      // Il tipo di funzione EPLAN (200 bobina, 201 NA, 202 NC) prevale sulla numerazione
      const cat = ft.category?.split('.')[0];
      const nb = numberOf(b);
      const last = nb?.digits.slice(-1);
      const kind = cat === '200' || cat === '505' || coil ? 'coil' : cat === '201' ? 'NO' : cat === '202' ? 'NC'
        // Poli principali a una cifra (1-2, 3-4, 5-6, 7-8): NA; ausiliari x1-x2 NC, x3-x4 NA
        : nb && nb.digits.length === 1 && lowerByNumber(b) ? 'NO'
          : last === '2' || last === '6' ? 'NC' : last === '4' || last === '8' ? 'NO' : undefined;
      cols.push({ top: a, bottom: b, kind, topText: textOf(c.indexOf(a)), bottomText: textOf(c.indexOf(b)) });
      continue;
    }
    // Contatto in scambio: comune (x1, x5) in alto, NC (x2, x6) e NA (x4, x8) in basso
    if (c.length === 3 && c.every(d => numberOf(d))) {
      const last = (d: string) => numberOf(d)!.digits.slice(-1);
      const common = c.find(d => last(d) === '1' || last(d) === '5') ?? c[0];
      const nc = c.find(d => d !== common && (last(d) === '2' || last(d) === '6')) ?? c.find(d => d !== common)!;
      const no = c.find(d => d !== common && d !== nc)!;
      const t = texts.filter(Boolean).join(' ') || undefined;
      cols.push({ top: common, bottom: nc, kind: 'COC', topText: t }, { bottom: no, kind: 'COO' });
      continue;
    }
    // Più poli (sezionatori, interruttori): coppie 1-2, 3-4, 5-6, (N)7-(N)8 con il collegamento meccanico
    if (c.length % 2 === 0 && c.every((d, i) => lowerByNumber(d) === (i % 2 === 1))) {
      group++;
      for (let i = 0; i < c.length; i += 2) cols.push({ top: c[i], bottom: c[i + 1], kind: 'pole', group, topText: textOf(i), bottomText: textOf(i + 1) });
      continue;
    }
    const half = Math.ceil(c.length / 2);
    for (let i = 0; i < half; i++) cols.push({ top: c[i], bottom: c[half + i], topText: textOf(i), bottomText: textOf(half + i) });
  }
  // Punti singoli: coppie riconosciute dalla numerazione (non per i punti PLC), gli altri sopra o sotto
  const used = new Set<string>();
  const pool = singles.filter(x => !x.plc).map(x => x.d);
  for (const x of singles) {
    if (used.has(x.d) || x.plc) continue;
    if (lowerByNumber(x.d) === true || isLowerConnection(x.d, x.text)) continue;
    const mate = partnerOf(x.d, pool.filter(q => !used.has(q) && q !== x.d));
    if (!mate) continue;
    used.add(x.d); used.add(mate);
    cols.push({ top: x.d, bottom: mate, topText: x.text, bottomText: singles.find(y => y.d === mate)?.text });
  }
  const rest = singles.filter(x => !used.has(x.d));
  const lower = (x: typeof rest[number]) => (x.plc ? isLowerConnection(x.d, x.text) : lowerByNumber(x.d) ?? isLowerConnection(x.d, x.text));
  const tops = rest.filter(x => !lower(x)), bottoms = rest.filter(x => lower(x));
  for (let i = 0; i < Math.max(tops.length, bottoms.length); i++) {
    cols.push({ top: tops[i]?.d, bottom: bottoms[i]?.d, topText: tops[i]?.text, bottomText: bottoms[i]?.text });
  }
  if (!cols.length) cols.push({ top: '1', bottom: '2' });

  const n = cols.length;
  // Con molti morsetti il passo scende a 4 mm (la griglia), altrimenti la scatola diventa enorme
  const pitch = n > 16 ? 4 : 8;
  const drawn = cols.some(c => c.kind);
  const h = drawn ? 32 : 24;
  const name = part.typeNr || part.partNr;
  const width = Math.max(24, n * pitch + 8);
  const prims: Prim[] = [{ t: 'rect', x: -4, y: 4, w: width, h: h - 8 }];
  const pins: PinDef[] = [], lowerPins: PinDef[] = [];
  const small = pitch < 8;
  const label = (x: number, y: number, s: string) => prims.push(small ? { t: 'text', x: x + 0.7, y, s, size: 1.5, anchor: 'start', rot: -90 } : T(x, y, s.length > 6 ? `${s.slice(0, 5)}…` : s, 1.5));
  cols.forEach((c, i) => {
    const x = i * pitch;
    if (c.top) { prims.push(L(x, 0, x, 4)); pins.push(P(`t${i}`, x, 0, c.top)); }
    if (c.bottom) { prims.push(L(x, h - 4, x, h)); lowerPins.push(P(`b${i}`, x, h, c.bottom, 'down')); }
    const mid = (h - 16) / 2;
    const shift = (ps: Prim[]) => ps.map(q => (q.t === 'line' ? { ...q, y1: q.y1 + mid, y2: q.y2 + mid } : q));
    if (c.kind === 'NO' || c.kind === 'pole') prims.push(L(x, 4, x, mid), ...shift(noContact(x)), L(x, mid + 16, x, h - 4));
    else if (c.kind === 'NC') prims.push(L(x, 4, x, mid), ...shift(ncContact(x)), L(x, mid + 16, x, h - 4));
    else if (c.kind === 'coil') prims.push(L(x, 4, x, h / 2 - 3), { t: 'rect', x: x - 3.5, y: h / 2 - 3, w: 7, h: 6 }, L(x, h / 2 + 3, x, h - 4));
    else if (c.kind === 'COC') {
      // Comune in alto, lama verso il NA, contatto fisso NC sotto il comune
      prims.push(L(x, 4, x, mid + 5), L(x, mid + 5, x + pitch * 0.8, mid + 11), L(x, h - 4, x, mid + 11), L(x, mid + 11, x + 2, mid + 11));
    } else if (c.kind === 'COO') prims.push(L(x, h - 4, x, mid + 11));
    if (c.topText && !c.kind) label(x, small ? 6 : 7.5, c.topText);
    if (c.bottomText && !c.kind) label(x, small ? h - 8 : h - 5.5, c.bottomText);
  });
  // Collegamento meccanico tra i poli dello stesso apparecchio
  for (let g = 1; g <= group; g++) {
    const xs = cols.map((c, i) => (c.group === g ? i * pitch : NaN)).filter(v => !isNaN(v));
    if (xs.length > 1) prims.push(L(xs[0] - 2.2, (h - 16) / 2 + 8, xs[xs.length - 1] - 2.2, (h - 16) / 2 + 8, true));
  }
  // Nome dell'articolo: in mezzo se la scatola è vuota, altrimenti sopra a destra
  prims.push(drawn ? T(width - 5, 3, name, 2, 'end') : T(width / 2 - 4, h / 2 + 1, name, 2.5));
  return {
    id: `bb:${part.partNr}`,
    name: `${part.manufacturer ? part.manufacturer + ' ' : ''}${name}`,
    category: 'Articoli importati',
    letter: guessLetter(part),
    role: 'single',
    prims, pins: [...pins, ...lowerPins], tagPos: { x: -6, y: h / 2 },
    description: part.descr1,
  };
}

/** Punto di connessione da mettere in basso: 0 V, A2, uscite (O, Q, OS, DO), uscite di test */
export function isLowerConnection(designation: string, description = ''): boolean {
  return /^(A2|0V|M|N|PE|O\d|OS\d|Q\d|DO|T\d)/i.test(designation) || /\b(DO|DOS|DQ|0\s?V|output|uscit|test)/i.test(description);
}

function guessLetter(part: Part): string {
  const s = `${part.productGroup ?? ''} ${part.descr1 ?? ''}`.toLowerCase();
  if (/relè|rele|relay|contatt|contactor/.test(s)) return 'K';
  if (/interrutt|breaker|salvamotore|sezionat/.test(s)) return 'Q';
  if (/fusib|fuse/.test(s)) return 'F';
  if (/morsett|terminal/.test(s)) return 'X';
  if (/aliment|power supply|trasform/.test(s)) return 'T';
  if (/sensor|finecorsa|sensore/.test(s)) return 'B';
  if (/plc|controllor|modul/.test(s)) return 'K';
  return 'A';
}
