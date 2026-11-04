// Cartigli: modelli grafici (linee, rettangoli, testi) con segnaposto come {progetto} o {titolo}
// che vengono riempiti con i dati del progetto e della pagina. Alcuni modelli sono inclusi;
// quelli personalizzati (disegnati nell'editor o importati da DXF) sono salvati nel progetto.
import type { Prim, Project, Page, TitleBlockTemplate } from './types';
import { FRAME, TITLE_TOP, PAGE_H } from './types';
import { pageRevision } from './revisions';
import { translator, translateFixed } from './i18n';
import { tn } from '../i18n/ui';
import { formatUserValue } from './userProps';

/** Area del cartiglio sotto la cornice, in mm: le coordinate dei modelli partono dal suo angolo in alto a sinistra */
export const TB_AREA = {
  get x() { return FRAME.left; }, get y() { return TITLE_TOP; },
  get w() { return FRAME.right - FRAME.left; }, get h() { return PAGE_H - 5 - TITLE_TOP; },
};

/** Segnaposto disponibili nei testi del cartiglio */
export const TB_PLACEHOLDERS: [string, string][] = [
  ['{ditta}', tn('Ditta')],
  ['{indirizzo}', tn('Indirizzo della ditta')],
  ['{progetto}', tn('Nome del progetto')],
  ['{descrizione}', tn('Descrizione del progetto')],
  ['{cliente}', tn('Cliente')],
  ['{autore}', tn('Autore')],
  ['{data}', tn('Data del progetto')],
  ['{disegno}', tn('Numero disegno')],
  ['{revisione}', tn('Revisione della pagina (o del progetto)')],
  ['{pagina}', tn('Numero della pagina, es. 2')],
  ['{pagina_prec}', tn('Numero della pagina precedente (vuoto sulla prima)')],
  ['{pagina_succ}', tn('Numero della pagina successiva (vuoto sull\'ultima)')],
  ['{titolo}', tn('Descrizione della pagina')],
  ['{n}', tn('Posizione della pagina nel progetto')],
  ['{totale}', tn('Numero di pagine')],
  ['{luogo}', tn('Luogo della pagina, es. +QE')],
  ['{luogo_nome}', tn('Nome del luogo')],
  ['{campo1}', tn('Primo campo aggiuntivo come «Nome: valore» (anche {campo2}…)')],
  ['{campo:Commessa}', tn('Valore del campo aggiuntivo con quel nome')],
  ['{prop:Ditta.Commessa}', tn('Proprietà definita dall\'utente della pagina o del progetto, con il suo nome identificativo')],
  ['{rev1.indice}', tn('Ultima revisione: indice (anche .data, .autore, .descrizione; {rev2…} la precedente)')],
];

const lbl = (x: number, y: number, s: string): Prim => ({ t: 'text', x, y, s, size: 1.8, anchor: 'start', muted: true });
const val = (x: number, y: number, s: string, size: number): Prim => ({ t: 'text', x, y, s, size, anchor: 'start' });
/** Altezza del cartiglio dei modelli inclusi (disegnati per l'A3: 390 × 35 mm) */
const H = 35;
const TB_W = 390;

/** Pagina precedente a sinistra e successiva a destra nella casella del numero di pagina */
const nav = (x: number, y: number, w: number, size = 2.6): Prim[] => [
  val(x + 1.2, y, '« {pagina_prec|—}', size),
  { t: 'text', x: x + w - 1.2, y, s: '{pagina_succ|—} »', size, anchor: 'end' },
];

/** Cartiglio standard di OpenWiring (quello usato finora) */
function standard(): TitleBlockTemplate {
  const widths = [70, 90, 110, 50, 40, 30];
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
  const cell = (i: number, label: string, value: string, size: number): Prim[] =>
    [{ t: 'rect', x: xs[i], y: 0, w: widths[i], h: H }, lbl(xs[i] + 1.5, 3, label), val(xs[i] + 1.5, 11, value, size)];
  return {
    id: 'standard', name: tn('Standard'), builtin: true,
    prims: [
      ...cell(0, 'Ditta', '{ditta|—}', 3),
      lbl(1.5, 15, '{indirizzo}'),
      { t: 'rect', x: 44, y: 2, w: 24, h: H - 4, logo: true },
      ...cell(1, 'Progetto', '{progetto}', 3.2),
      lbl(xs[1] + 1.5, 15, 'Dis. {disegno}'),
      lbl(xs[1] + 45, 15, 'Rev. {revisione}'),
      ...cell(2, 'Pagina', '{titolo}', 3.4),
      ...cell(3, 'Cliente', '{cliente|—}', 2.6),
      lbl(xs[3] + 1.5, 15, '{campo1}'),
      lbl(xs[3] + 1.5, 17.4, '{campo2}'),
      ...cell(4, 'Data / Autore', '{data} {autore}', 2.2),
      ...cell(5, 'Pag. {n}/{totale}', '= {pagina}', 3.6),
      ...nav(xs[5], 20, widths[5], 3),
    ],
  };
}

/** Cartiglio con tabella delle ultime tre revisioni a sinistra */
function withRevisions(): TitleBlockTemplate {
  const rowH = H / 4;
  const prims: Prim[] = [
    { t: 'rect', x: 0, y: 0, w: 100, h: H },
    ...[1, 2, 3].map(k => ({ t: 'line', x1: 0, y1: rowH * k, x2: 100, y2: rowH * k }) as Prim),
    ...[10, 30, 50].map(x => ({ t: 'line', x1: x, y1: 0, x2: x, y2: H }) as Prim),
    lbl(1.5, 5.6, 'Rev.'), lbl(11.5, 5.6, 'Data'), lbl(31.5, 5.6, 'Autore'), lbl(51.5, 5.6, 'Modifica'),
  ];
  // Riga in alto la revisione più vecchia delle tre, in basso l'ultima
  [3, 2, 1].forEach((k, row) => {
    const y = rowH * (row + 1) + 5.6;
    prims.push(val(1.5, y, `{rev${k}.indice}`, 2.2), val(11.5, y, `{rev${k}.data}`, 2), val(31.5, y, `{rev${k}.autore}`, 2), val(51.5, y, `{rev${k}.descrizione}`, 2));
  });
  const x0 = 100;
  prims.push(
    { t: 'rect', x: x0, y: 0, w: 70, h: H }, lbl(x0 + 1.5, 3, 'Ditta'), val(x0 + 1.5, 11, '{ditta|—}', 3), lbl(x0 + 1.5, 15, '{indirizzo}'),
    { t: 'rect', x: x0 + 44, y: 2, w: 24, h: H - 4, logo: true },
    { t: 'rect', x: x0 + 70, y: 0, w: 100, h: H / 2 }, lbl(x0 + 71.5, 3, 'Progetto'), val(x0 + 71.5, 10, '{progetto}', 3.2),
    { t: 'rect', x: x0 + 70, y: H / 2, w: 100, h: H / 2 }, lbl(x0 + 71.5, H / 2 + 3, 'Pagina'), val(x0 + 71.5, H / 2 + 10, '{titolo}', 3.2),
    { t: 'rect', x: x0 + 170, y: 0, w: 55, h: H / 2 }, lbl(x0 + 171.5, 3, 'Cliente'), val(x0 + 171.5, 10, '{cliente|—}', 2.6),
    { t: 'rect', x: x0 + 170, y: H / 2, w: 55, h: H / 2 }, lbl(x0 + 171.5, H / 2 + 3, 'Disegno'), val(x0 + 171.5, H / 2 + 10, '{disegno}', 2.6),
    { t: 'rect', x: x0 + 225, y: 0, w: 35, h: H / 2 }, lbl(x0 + 226.5, 3, 'Data / Autore'), val(x0 + 226.5, 10, '{data} {autore}', 2),
    { t: 'rect', x: x0 + 225, y: H / 2, w: 35, h: H / 2 }, lbl(x0 + 226.5, H / 2 + 3, 'Luogo'), val(x0 + 226.5, H / 2 + 10, '{luogo}', 2.6),
    { t: 'rect', x: x0 + 260, y: 0, w: 30, h: H }, lbl(x0 + 261.5, 3, 'Pag. {n}/{totale}'), val(x0 + 261.5, 13, '= {pagina}', 3.6),
    ...nav(x0 + 260, 22, 30, 3),
  );
  return { id: 'revisioni', name: tn('Con tabella revisioni'), builtin: true, prims: prims.map(p => p.t === 'text' && p.y > H ? { ...p, y: H - 1 } : p) };
}

/** Cartiglio essenziale su una riga */
function compact(): TitleBlockTemplate {
  return {
    id: 'compatto', name: tn('Compatto'), builtin: true,
    prims: [
      { t: 'rect', x: 0, y: 0, w: TB_W, h: H },
      { t: 'line', x1: 0, y1: H / 2, x2: TB_W, y2: H / 2 },
      ...[120, 300, 350].map(x => ({ t: 'line', x1: x, y1: 0, x2: x, y2: H }) as Prim),
      val(2, 11, '{progetto}', 4), val(2, H / 2 + 11, '{titolo}', 3.6),
      val(122, 11, '{ditta}', 3), lbl(122, H / 2 + 6, '{cliente}'), lbl(122, H / 2 + 10, '{indirizzo}'),
      { t: 'rect', x: 270, y: 2, w: 28, h: H - 4, logo: true },
      lbl(302, 5, 'Data'), val(302, 12, '{data}', 2.4), lbl(302, H / 2 + 5, 'Rev.'), val(302, H / 2 + 12, '{revisione}', 2.6),
      lbl(352, 5, 'Pag. {n}/{totale}'), val(352, 11.5, '= {pagina}', 4), ...nav(350, 16.2, 40, 2.6), lbl(352, H / 2 + 5, 'Dis.'), val(352, H / 2 + 12, '{disegno}', 2.4),
    ],
  };
}

/** Casella con l'etichetta in alto e il valore in basso */
function box(x: number, y: number, w: number, h: number, label: string, value: string, size = 2.6): Prim[] {
  return [{ t: 'rect', x, y, w, h }, lbl(x + 1.2, y + 2.6, label), val(x + 1.2, y + h - (h > 12 ? 2.4 : 1.6), value, size)];
}

/** Riga bassa con etichetta e valore sulla stessa linea (es. «Disegn.  M. Rossi») */
function line(x: number, y: number, w: number, h: number, label: string, value: string, at = 16, size = 2.2): Prim[] {
  return [{ t: 'rect', x, y, w, h }, lbl(x + 1.2, y + h - 2.4, label), val(x + at, y + h - 2.4, value, size)];
}

/** Ditta con logo e indirizzo; l'etichetta cambia con il tipo di cartiglio */
function company(x: number, w: number, label = 'Ditta'): Prim[] {
  return [
    { t: 'rect', x, y: 0, w, h: H }, lbl(x + 1.2, 2.6, label),
    { t: 'rect', x: x + w - 26, y: 3.5, w: 24, h: H - 7, logo: true },
    val(x + 1.2, 12, '{ditta|—}', 3), lbl(x + 1.2, 16.5, '{indirizzo}'),
  ];
}

/** Tabella delle ultime revisioni (in basso la più recente) */
function revTable(x: number, w: number, rows = 3): Prim[] {
  const rh = H / (rows + 1);
  const cols = [0, 0.1, 0.32, 0.54].map(k => x + w * k);
  const prims: Prim[] = [
    { t: 'rect', x, y: 0, w, h: H },
    ...Array.from({ length: rows }, (_, i) => ({ t: 'line', x1: x, y1: rh * (i + 1), x2: x + w, y2: rh * (i + 1) }) as Prim),
    ...cols.slice(1).map(cx => ({ t: 'line', x1: cx, y1: 0, x2: cx, y2: H }) as Prim),
    ...['Rev.', 'Data', 'Nome', 'Modifica'].map((l, i) => lbl(cols[i] + 1.2, rh - 2.2, l)),
  ];
  for (let row = 0; row < rows; row++) {
    const k = rows - row, y = rh * (row + 2) - 2.2;
    prims.push(val(cols[0] + 1.2, y, `{rev${k}.indice}`, 2), val(cols[1] + 1.2, y, `{rev${k}.data}`, 1.9), val(cols[2] + 1.2, y, `{rev${k}.autore}`, 1.9), val(cols[3] + 1.2, y, `{rev${k}.descrizione}`, 1.9));
  }
  return prims;
}

const R2 = H / 2;

/** ISO 7200: proprietario, redatto e approvato, tipo e stato del documento, titolo, numero, revisione, data, foglio */
function iso7200(): TitleBlockTemplate {
  return {
    id: 'iso7200', name: tn('ISO 7200 (normativo)'), builtin: true,
    prims: [
      ...revTable(0, 105),
      ...company(105, 65, 'Proprietario'),
      ...box(170, 0, 50, R2, 'Redatto da', '{autore}', 2.4), ...box(170, R2, 50, R2, 'Approvato da', '{campo:Approvato da}', 2.4),
      ...box(220, 0, 50, R2, 'Tipo di documento', '{campo:Tipo documento|Schema elettrico}', 2.4), ...box(220, R2, 50, R2, 'Stato del documento', '{campo:Stato documento|Emesso}', 2.4),
      ...box(270, 0, 75, R2, 'Titolo', '{titolo}', 3.2), ...box(270, R2, 75, R2, 'Progetto', '{progetto}', 2.8),
      ...box(345, 0, 45, R2, 'N. identificazione', '{disegno|—}', 2.6), ...nav(345, 9, 45, 2.4),
      ...box(345, R2, 12, R2, 'Rev.', '{revisione}', 2.4), ...box(357, R2, 19, R2, 'Data', '{data}', 1.9), ...box(376, R2, 14, R2, 'Foglio', '{n}/{totale}', 2.2),
    ],
  };
}

/** Industriale come i cartigli EPLAN: modifiche, data/disegnatore/controllo/norma, ditta, progetto, = e +, pagina */
function industrial(): TitleBlockTemplate {
  const r4 = H / 4;
  return {
    id: 'industriale', name: tn('Industriale dettagliato'), builtin: true,
    prims: [
      ...revTable(0, 100),
      ...line(100, 0, 58, r4, 'Data', '{data}'), ...line(100, r4, 58, r4, 'Disegn.', '{autore}'),
      ...line(100, r4 * 2, 58, r4, 'Contr.', '{campo:Controllato}'), ...line(100, r4 * 3, 58, r4, 'Norma', '{campo:Norma|IEC 81346}'),
      ...company(158, 72),
      ...box(230, 0, 100, R2, 'Progetto', '{progetto}', 3), lbl(290, 2.6, '{descrizione}'),
      ...box(230, R2, 100, R2, 'Pagina', '{titolo}', 3.4),
      ...line(330, 0, 60, r4, '=', '{campo:Funzione}', 6, 2.6), ...line(330, r4, 60, r4, '+', '{luogo}', 6, 2.6),
      ...box(330, R2, 30, R2, 'Pag.', '{pagina}', 3.6), ...box(360, R2, 30, R2, 'Fg.', '{n} / {totale}', 2.8),
      ...nav(330, R2 + 8.6, 30, 2.8),
    ],
  };
}

/** Costruttore di macchine: macchina, matricola, anno, dati elettrici di targa (EN 60204-1) */
function machine(): TitleBlockTemplate {
  return {
    id: 'macchina', name: tn('Macchina (EN 60204-1)'), builtin: true,
    prims: [
      ...company(0, 75, 'Costruttore'), lbl(1.2, H - 2, 'Schema secondo EN 60204-1'),
      ...box(75, 0, 95, R2, 'Macchina', '{campo:Macchina|{progetto}}', 3.2), ...box(75, R2, 95, R2, 'Cliente', '{cliente|—}', 2.8),
      ...box(170, 0, 40, R2, 'Matricola', '{campo:Matricola}', 2.6), ...box(170, R2, 40, R2, 'Anno', '{campo:Anno}', 2.6),
      ...box(210, 0, 45, R2, 'Alimentazione', '{campo:Alimentazione|400 V 3~ 50 Hz}', 2.2), ...box(210, R2, 45, R2, 'Ausiliari', '{campo:Tensione ausiliaria|24 V DC}', 2.2),
      ...box(255, 0, 35, R2, 'Potenza installata', '{campo:Potenza installata}', 2.2), ...box(255, R2, 35, R2, 'Icc presunta', '{campo:Icc}', 2.2),
      ...box(290, 0, 70, R2, 'Pagina', '{titolo}', 3.2),
      ...box(290, R2, 30, R2, 'Commessa', '{campo:Commessa}', 2.2), ...box(320, R2, 28, R2, 'Disegno', '{disegno}', 2.2), ...box(348, R2, 12, R2, 'Rev.', '{revisione}', 2.4),
      ...box(360, 0, 30, R2, 'Data', '{data}', 2), ...box(360, R2, 30, R2, 'Pag. {n}/{totale}', '= {pagina}', 3.2),
      ...nav(360, R2 + 8.6, 30, 2.6),
    ],
  };
}

/** Impianto civile o terziario (DM 37/08): committente, ubicazione, impresa installatrice, progettista, tavola, scala */
function civil(): TitleBlockTemplate {
  const r3 = H / 3;
  return {
    id: 'civile', name: tn('Impianto civile (DM 37/08)'), builtin: true,
    prims: [
      ...company(0, 80, 'Impresa installatrice'),
      ...box(80, 0, 95, r3, 'Committente', '{cliente|—}', 2.4), ...box(80, r3, 95, r3, 'Ubicazione dell\'impianto', '{campo:Ubicazione}', 2.2),
      ...box(80, r3 * 2, 95, r3, 'Tipo di impianto', '{campo:Tipo impianto|Impianto elettrico}', 2.2),
      ...box(175, 0, 90, R2, 'Oggetto', '{progetto}', 3), ...box(175, R2, 90, R2, 'Elaborato', '{titolo}', 3.2),
      ...box(265, 0, 65, R2, 'Progettista', '{autore}', 2.4), lbl(296, 2.6, '{campo:Iscrizione albo}'),
      ...box(265, R2, 65, R2, 'Responsabile tecnico', '{campo:Responsabile tecnico}', 2.4),
      ...box(330, 0, 20, R2, 'Tavola', '{disegno|—}', 2.4), ...box(350, 0, 20, R2, 'Scala', '{campo:Scala|—}', 2.4), ...box(370, 0, 20, R2, 'Rev.', '{revisione}', 2.4),
      ...box(330, R2, 20, R2, 'Data', '{data}', 1.8), ...box(350, R2, 20, R2, 'Pag.', '{pagina}', 2.8), ...box(370, R2, 20, R2, 'Fg.', '{n}/{totale}', 2.2),
      ...nav(350, R2 + 8.6, 20, 2.4),
    ],
  };
}

/** Quadro elettrico (EN 61439): quadro, costruttore del quadro e dati di targa */
function switchboard(): TitleBlockTemplate {
  const r3 = H / 3, c = 27.5;
  const plate: [string, string][][] = [
    [['Un', '{campo:Un|400 V}'], ['In', '{campo:In}'], ['Icw', '{campo:Icw}'], ['Frequenza', '{campo:Frequenza|50 Hz}']],
    [['Grado IP', '{campo:Grado IP|IP54}'], ['Forma', '{campo:Forma di segregazione|1}'], ['Norma', 'EN 61439-2'], ['Ausiliari', '{campo:Tensione ausiliaria|24 V DC}']],
  ];
  return {
    id: 'quadro', name: tn('Quadro elettrico (EN 61439)'), builtin: true,
    prims: [
      ...company(0, 70, 'Costruttore del quadro'),
      ...box(70, 0, 90, r3, 'Quadro', '{luogo} {luogo_nome}', 2.6), ...box(70, r3, 90, r3, 'Impianto', '{progetto}', 2.4), ...box(70, r3 * 2, 90, r3, 'Cliente', '{cliente|—}', 2.4),
      ...plate.flatMap((row, i) => row.flatMap(([l, v], j) => box(160 + j * c, i * R2, c, R2, l, v, 2.2))),
      ...box(270, 0, 80, R2, 'Pagina', '{titolo}', 3.2),
      ...box(270, R2, 30, R2, 'Commessa', '{campo:Commessa}', 2.2), ...box(300, R2, 35, R2, 'Disegno', '{disegno}', 2.2), ...box(335, R2, 15, R2, 'Rev.', '{revisione}', 2.4),
      ...box(350, 0, 40, R2, 'Data / Autore', '{data} {autore}', 1.9), ...box(350, R2, 40, R2, 'Pag. {n}/{totale}', '= {pagina}', 3.2),
      ...nav(350, R2 + 8.6, 40, 2.6),
    ],
  };
}

/** Automazione e processo: firme di redazione, verifica e approvazione; impianto, area e documento */
function signatures(): TitleBlockTemplate {
  const r4 = H / 4, r3 = H / 3;
  const sign: [string, string, string][] = [
    ['Redatto', '{autore}', '{data}'],
    ['Verificato', '{campo:Verificato da}', '{campo:Data verifica}'],
    ['Approvato', '{campo:Approvato da}', '{campo:Data approvazione}'],
  ];
  return {
    id: 'firme', name: tn('Automazione con firme'), builtin: true,
    prims: [
      ...company(0, 62),
      { t: 'rect', x: 62, y: 0, w: 92, h: H },
      ...[1, 2, 3].map(k => ({ t: 'line', x1: 62, y1: r4 * k, x2: 154, y2: r4 * k }) as Prim),
      ...[84, 120].map(x => ({ t: 'line', x1: x, y1: 0, x2: x, y2: H }) as Prim),
      lbl(85.2, r4 - 2.4, 'Nome'), lbl(121.2, r4 - 2.4, 'Data'),
      ...sign.flatMap(([l, n, d], i) => [lbl(63.2, r4 * (i + 2) - 2.4, l), val(85.2, r4 * (i + 2) - 2.4, n, 2), val(121.2, r4 * (i + 2) - 2.4, d, 1.9)]),
      ...box(154, 0, 56, r3, 'Impianto', '{campo:Impianto|{progetto}}', 2.4), ...box(154, r3, 56, r3, 'Area / unità', '{campo:Area}', 2.4), ...box(154, r3 * 2, 56, r3, 'Luogo', '{luogo} {luogo_nome}', 2.4),
      ...box(210, 0, 110, R2, 'Cliente', '{cliente|—}', 2.8), ...box(210, R2, 110, R2, 'Pagina', '{titolo}', 3.4),
      ...box(320, 0, 50, R2, 'Documento', '{disegno|—}', 2.6), ...box(370, 0, 20, R2, 'Rev.', '{revisione}', 2.6),
      ...box(320, R2, 35, R2, 'Pag.', '{pagina}', 3.4), ...box(355, R2, 35, R2, 'Fg.', '{n} / {totale}', 2.8),
      ...nav(320, R2 + 8.6, 35, 2.8),
    ],
  };
}

export const BUILTIN_TITLE_BLOCKS: TitleBlockTemplate[] = [standard(), withRevisions(), compact(), iso7200(), industrial(), machine(), civil(), switchboard(), signatures()];

/** Campi aggiuntivi usati da un modello ({campo:Commessa} → "Commessa"), da proporre nel progetto */
export function templateFields(tpl: TitleBlockTemplate): string[] {
  const out: string[] = [];
  for (const q of tpl.prims) if (q.t === 'text') for (const m of q.s.matchAll(/\{campo:([^{}|]+)/gi)) if (!out.includes(m[1].trim())) out.push(m[1].trim());
  return out;
}

/** Modelli disponibili: inclusi, del progetto e (se indicata) della libreria personale */
export function titleBlockTemplates(p: Project, library: TitleBlockTemplate[] = []): TitleBlockTemplate[] {
  const own = p.titleBlockTemplates ?? [];
  return [...BUILTIN_TITLE_BLOCKS, ...own, ...library.filter(t => !own.some(o => o.id === t.id))];
}

/** Modello usato da una pagina: quello della pagina, poi quello del progetto, poi lo standard */
export function templateFor(p: Project, page?: Page): TitleBlockTemplate {
  const all = titleBlockTemplates(p);
  const id = page?.titleBlockId ?? p.titleBlock?.templateId;
  return all.find(t => t.id === id) ?? all[0];
}

/** Valori dei segnaposto per una pagina */
export function placeholderValues(p: Project, page: Page, pageIndex: number): (key: string) => string | undefined {
  const { t } = translator(p);
  const info = p.info;
  const fields = p.titleBlock?.fields ?? [];
  const panel = p.panels?.find(x => x.id === page.panelId);
  const revs = [...(p.revisions ?? [])].reverse();
  const fixed: Record<string, string | undefined> = {
    ditta: info.company, indirizzo: p.titleBlock?.address, progetto: t(info.name), descrizione: t(info.description),
    cliente: info.customer, autore: info.author, data: info.date, disegno: info.drawingNr,
    revisione: pageRevision(p, page) ?? info.revision, pagina: page.name, titolo: t(page.title),
    pagina_prec: p.pages[pageIndex - 1]?.name, pagina_succ: p.pages[pageIndex + 1]?.name,
    n: String(pageIndex + 1), totale: String(p.pages.length), luogo: panel ? `+${panel.code}` : '', luogo_nome: panel?.name,
  };
  return key => {
    const k = key.toLowerCase();
    if (k in fixed) return fixed[k] ?? '';
    let m = /^campo(\d+)$/.exec(k);
    if (m) { const f = fields[+m[1] - 1]; return f && f.value ? `${t(f.label)}: ${f.value}` : ''; }
    m = /^campo:(.+)$/i.exec(key);
    if (m) return fields.find(f => f.label.trim().toLowerCase() === m![1].trim().toLowerCase())?.value ?? '';
    m = /^prop:(.+)$/i.exec(key);
    if (m) {
      const id = m[1].trim();
      const d = p.userProps?.find(x => x.id === id);
      const v = page.userProps?.[id] ?? p.userPropValues?.[id];
      return d ? formatUserValue(d, v) : v ?? '';
    }
    m = /^rev(\d+)\.(indice|data|autore|descrizione)$/.exec(k);
    if (m) {
      const r = revs[+m[1] - 1];
      if (!r) return '';
      return { indice: r.index, data: r.date, autore: r.author, descrizione: r.description }[m[2] as 'indice'];
    }
    return undefined;
  };
}

// Il valore predefinito dopo «|» può essere a sua volta un segnaposto, es. {campo:Macchina|{progetto}}
const PH = /\{([^{}|]+)(?:\|((?:[^{}]|\{[^{}]*\})*))?\}/g;
const INNER = /\{([^{}|]+)\}/g;

/**
 * Testo del cartiglio con i segnaposto riempiti. Un testo fatto di soli segnaposto vuoti sparisce
 * (es. "Rev. {revisione}" senza revisione); le parti fisse vengono tradotte.
 */
export function fillTitleText(p: Project, s: string, value: (key: string) => string | undefined): string {
  const { t } = translator(p);
  if (!s.includes('{')) return t(s);
  let any = false, filled = false;
  const out = s.replace(PH, (whole, key: string, fallback?: string) => {
    any = true;
    const v = value(key.trim());
    // Segnaposto sconosciuto: resta scritto com'è, così si vede che va corretto
    if (v === undefined) { filled = true; return whole; }
    if (v) { filled = true; return v; }
    if (fallback !== undefined) {
      const f = fallback.replace(INNER, (w, k: string) => value(k.trim()) ?? w);
      if (f) { filled = true; return f; }
    }
    return '';
  });
  if (any && !filled) return '';
  // Parola fissa iniziale (es. "Pag.", "Dis.") nella lingua del progetto
  if ((p.languages?.display ?? 'it') === 'it') return out;
  return out.replace(/^([\p{L}.]+)(?=\s)/u, w => translateFixed(p, w));
}

/** Grafica del cartiglio di una pagina, nelle coordinate dell'area (testi già riempiti) */
/** Larghezza del modello: fin dove arrivano i suoi elementi (i modelli inclusi sono larghi 390 mm) */
export function templateWidth(t: TitleBlockTemplate): number {
  let w = 0;
  for (const q of t.prims) {
    if (q.t === 'line') w = Math.max(w, q.x1, q.x2);
    else if (q.t === 'rect') w = Math.max(w, q.x + q.w);
    else if ('x' in q && typeof q.x === 'number') w = Math.max(w, q.x);
  }
  return Math.max(50, w);
}

/**
 * Posizione del cartiglio sul foglio: in basso a destra, rimpicciolito in proporzione se il modello è
 * più largo della cornice (per esempio i modelli A3 su un A4), alla sua misura sui fogli più grandi.
 */
export function titleBlockPlace(t: TitleBlockTemplate): { x: number; y: number; scale: number; w: number } {
  const tw = templateWidth(t);
  const scale = Math.min(1, TB_AREA.w / tw);
  return { x: FRAME.right - tw * scale, y: TB_AREA.y, scale, w: tw * scale };
}

export function titleBlockPrims(p: Project, page: Page, pageIndex: number): { prims: Prim[]; logo?: { x: number; y: number; w: number; h: number; href: string }; place: ReturnType<typeof titleBlockPlace> } {
  const tpl = templateFor(p, page);
  const value = placeholderValues(p, page, pageIndex);
  const prims: Prim[] = [];
  let logo: { x: number; y: number; w: number; h: number; href: string } | undefined;
  for (const q of tpl.prims) {
    if (q.t === 'rect' && q.logo) {
      if (p.titleBlock?.logo && !logo) logo = { x: q.x, y: q.y, w: q.w, h: q.h, href: p.titleBlock.logo };
      continue;
    }
    if (q.t === 'text') {
      const s = fillTitleText(p, q.s, value);
      if (s) prims.push({ ...q, s });
    } else prims.push(q);
  }
  return { prims, logo, place: titleBlockPlace(tpl) };
}
