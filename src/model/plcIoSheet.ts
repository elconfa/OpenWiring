// Lista I/O in Excel da modificare e reimportare: tutti i canali di tutte le schede con i loro dati.
// Si modificano i morsetti (Segnale 1 e 2, Comune 1…3), nome simbolico e commento; le altre colonne sono
// informative e si ignorano reimportando. La riga si riconosce da scheda e canale.
import type { Part, Project, SymbolInstance } from './types';
import { cardType, defaultSymbol, ioAssignments, sanitizeSymbol, channelsOf } from './plc';
import { channelTerms, termsAfter, TERM_COLS } from './plcTerms';

/** Morsetti per canale: Segnale 1 e 2, Comune 1…3 (vedi plcTerms.ts) */
export const MAX_CHANNEL_PINS = 5;

/** Nomi delle colonne usati dai file di versioni precedenti, per colonna */
const OLD_TERM_COLS: string[][] = [['Segnale', 'Morsetto 1'], ['Morsetto 2'], ['Comune +24 V', 'Morsetto 3'], ['Comune FE', 'Morsetto 4'], ['Comune 0 V', 'Morsetto 5']];

/** Nome del foglio (senza «/», che Excel non accetta nei nomi dei fogli) */
export const IO_SHEET_NAME = 'Lista IO';
export const IO_SHEET_COLUMNS = [
  'Stazione', 'Scheda', 'Rack', 'Slot', 'Tipo scheda', 'Articolo', 'Canale', 'Tipo', 'Indirizzo',
  ...TERM_COLS, 'Nome simbolico', 'Commento', 'Descrizione dal dispositivo', 'Collegato a', 'Posizione',
];
/** Colonne che si modificano nel file e si rileggono */
export const IO_SHEET_EDITABLE = [...TERM_COLS, 'Nome simbolico', 'Commento'];

/** Righe del foglio: intestazione e un canale per riga (anche quelli liberi) */
export function ioSheetRows(project: Project, library: Part[] = []): string[][] {
  const rows = ioAssignments(project, library).map(r => [
    r.card.station ?? '', `-${r.card.tag}`, r.card.rack != null ? String(r.card.rack) : '', r.card.slot != null ? String(r.card.slot) : '',
    cardType(r.card).name, r.card.partNr ?? '', r.channel, r.kind, r.address,
    ...channelTerms(project, r).values,
    r.symbolIsDefault ? '' : r.symbol, r.ownComment, r.ownComment ? '' : r.comment, r.connected, r.location,
  ]);
  return [IO_SHEET_COLUMNS, ...rows];
}

/** Foglio con le istruzioni, da mettere accanto alla lista */
export const IO_SHEET_HELP: string[][] = [
  ['Lista I/O da modificare e reimportare (vista PLC ▸ Importa lista I/O)'],
  [''],
  ['Si rileggono: Segnale 1 e 2 (pin della scheda), Comune 1, 2 e 3, Nome simbolico e Commento.'],
  ['Prese M12: Segnale 1 è il pin del canale; Comune 1, 2 e 3 sono +24 V (pin 1), FE (pin 5) e 0 V (pin 3) della presa, uguali per i due canali: basta cambiarli su una delle due righe.'],
  ['I canali a 1 o 2 morsetti non hanno comuni: le colonne Comune restano vuote e si ignorano.'],
  ['La riga si riconosce da Scheda e Canale: non cambiarli. Le altre colonne sono solo informative.'],
  ['Una cella vuota toglie il valore (il nome simbolico torna quello automatico, il commento torna la descrizione del dispositivo).'],
  ['Si possono togliere righe o colonne: le righe che mancano e le colonne assenti restano come sono nel progetto.'],
];

export interface IoSheetResult {
  /** Canali modificati */
  changed: number;
  /** Righe lette con scheda e canale riconosciuti */
  rows: number;
  /** Righe con scheda o canale che non esistono nel progetto */
  unknown: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Il foglio è una lista I/O di OpenWiring (ha le colonne Scheda e Canale)? */
export function isIoSheet(rows: string[][]): boolean {
  const h = (rows[0] ?? []).map(norm);
  return h.includes('scheda') && h.includes('canale');
}

/**
 * Applica al progetto le righe del foglio (con l'intestazione). Pin scritti sul canale della scheda e
 * sui canali dei gruppi I/O dello schema; nome e commento sul punto I/O disegnato, altrimenti sulla scheda.
 */
export function applyIoSheet(project: Project, sheet: string[][]): IoSheetResult {
  const res: IoSheetResult = { changed: 0, rows: 0, unknown: [] };
  const head = (sheet[0] ?? []).map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  const cTag = col('Scheda'), cCh = col('Canale');
  if (cTag < 0 || cCh < 0) return res;
  const cTerms = TERM_COLS.map((n, i) => [n, ...OLD_TERM_COLS[i]].map(col).find(c => c >= 0) ?? -1);
  const hasTerms = cTerms.some(c => c >= 0);
  const cSym = col('Nome simbolico'), cCom = col('Commento');
  // Valori attuali di ogni canale: si scrive solo quello che cambia davvero
  const now = new Map(ioAssignments(project).map(r => [`${r.card.tag}|${r.channel}`, r]));
  const placed = new Map<string, SymbolInstance[]>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind !== 'symbol' || !e.plcChannel) continue;
    const k = `${e.tag}|${e.plcChannel}`;
    placed.set(k, [...(placed.get(k) ?? []), e]);
  }
  /** Comuni delle prese come erano nel progetto prima di leggere il file */
  const before = new Map<string, string>();
  const trim = (l: string[]) => { const x = [...l]; while (x.length && !x[x.length - 1]) x.pop(); return x; };
  for (const row of sheet.slice(1)) {
    const tag = (row[cTag] ?? '').trim().replace(/^-/, '');
    const channel = (row[cCh] ?? '').trim().toUpperCase();
    if (!tag && !channel) continue;
    const card = project.plc.cards.find(c => c.tag === tag);
    const cur0 = now.get(`${tag}|${channel}`);
    if (!card || !cur0) { res.unknown.push(`-${tag} ${channel}`); continue; }
    res.rows++;
    const insts = placed.get(`${tag}|${channel}`) ?? [];
    const cur = { ...(card.io?.[channel] ?? {}) };
    let changed = false;
    let commonsChanged = false;
    if (hasTerms) {
      // Morsetti: segnali sul canale della scheda, comuni sulla presa M12 disegnata (solo quelli che cambiano)
      const terms = channelTerms(project, cur0);
      let pins = cur0.pins.map(x => x ?? '');
      cTerms.forEach((c, k) => {
        if (c < 0) return;
        const ch = termsAfter(terms, pins, k, row[c] ?? '');
        if (ch.pins) pins = ch.pins;
        if (ch.common) {
          // I due canali della presa hanno gli stessi comuni: vale la riga che li cambia rispetto al progetto
          const key = `${ch.common.body.id}|${ch.common.id}`;
          if (!before.has(key)) before.set(key, ch.common.body.pinLabels[ch.common.id] ?? '');
          if (ch.common.value === before.get(key)) return;
          ch.common.body.pinLabels = { ...ch.common.body.pinLabels, [ch.common.id]: ch.common.value }; commonsChanged = true;
        }
      });
      const list = trim(pins);
      if (JSON.stringify(list) !== JSON.stringify(trim(cur0.pins.map(x => x ?? '')))) {
        changed = true;
        if (list.length) cur.pins = list; else delete cur.pins;
        // I canali dei gruppi I/O mostrano gli stessi pin
        for (const e of insts) {
          if (!e.plcGroup) continue;
          const ids = Object.keys(e.pinLabels).sort();
          e.pinLabels = Object.fromEntries(ids.map((id, k) => [id, list[k] ?? '']));
        }
      }
    }
    if (cSym >= 0) {
      const raw = (row[cSym] ?? '').trim();
      const symbol = raw && raw !== defaultSymbol(tag, channel) ? sanitizeSymbol(raw) : undefined;
      if ((symbol ?? '') !== (cur0.symbolIsDefault ? '' : cur0.symbol)) {
        changed = true;
        if (insts.length) { for (const e of insts) { if (symbol) e.plcSymbol = symbol; else delete e.plcSymbol; } delete cur.symbol; }
        else if (symbol) cur.symbol = symbol; else delete cur.symbol;
      }
    }
    if (cCom >= 0) {
      const comment = (row[cCom] ?? '').trim();
      if (comment !== cur0.ownComment) {
        changed = true;
        if (insts.length) { for (const e of insts) { if (comment) e.plcComment = comment; else delete e.plcComment; } delete cur.comment; }
        else if (comment) cur.comment = comment; else delete cur.comment;
      }
    }
    if (!changed) { if (commonsChanged) res.changed++; continue; }
    res.changed++;
    const io = { ...(card.io ?? {}) };
    if (Object.keys(cur).length) io[channel] = cur; else delete io[channel];
    if (Object.keys(io).length) card.io = io; else delete card.io;
  }
  return res;
}

// ---------------------------------------------------------------------------
// Foglio «Schede»: una riga per scheda, nello stesso file della lista I/O

export const CARDS_SHEET_NAME = 'Schede';
const KINDS = ['DI', 'DO', 'AI', 'AO'] as const;
const START_COLS = KINDS.map(k => `Inizio ${k}`);
export const CARDS_SHEET_COLUMNS = [
  'N.', 'Stazione', 'Scheda', 'Rack', 'Slot', 'Tipo scheda', 'Canali', 'Descrizione', 'Articolo', 'Costruttore', 'Codice d\'ordine', ...START_COLS,
];
/** Colonne del foglio Schede che si rileggono (la riga si riconosce dalla sigla della scheda) */
export const CARDS_SHEET_EDITABLE = ['Rack', 'Slot', 'Descrizione', 'Articolo', 'Costruttore', 'Codice d\'ordine', ...START_COLS];

export function cardsSheetRows(project: Project): string[][] {
  const rows = project.plc.cards.map((c, i) => {
    const t = cardType(c);
    const chans = KINDS.filter(k => (t.channels[k] ?? 0) > 0).map(k => `${t.channels[k]} ${k}`).join(', ');
    return [String(i + 1), c.station ?? '', `-${c.tag}`, c.rack != null ? String(c.rack) : '', c.slot != null ? String(c.slot) : '',
      t.name, chans, c.description ?? '', c.partNr ?? '', c.manufacturer ?? '', c.orderNr ?? '',
      ...KINDS.map(k => ((t.channels[k] ?? 0) > 0 && c.start[k] != null ? String(c.start[k]) : ''))];
  });
  return [CARDS_SHEET_COLUMNS, ...rows];
}

export const isCardsSheet = (rows: string[][]) => {
  const h = (rows[0] ?? []).map(norm);
  return h.includes('scheda') && !h.includes('canale') && (h.includes('rack') || h.includes('tipo scheda'));
};

export interface CardsSheetResult { changed: number; unknown: string[]; errors: string[] }

/** Applica il foglio Schede: descrizione, articolo, costruttore, codice, rack, slot e indirizzi iniziali */
export function applyCardsSheet(project: Project, sheet: string[][]): CardsSheetResult {
  const res: CardsSheetResult = { changed: 0, unknown: [], errors: [] };
  const head = (sheet[0] ?? []).map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  const cTag = col('Scheda');
  if (cTag < 0) return res;
  const text = { description: col('Descrizione'), partNr: col('Articolo'), manufacturer: col('Costruttore'), orderNr: col('Codice d\'ordine') } as const;
  const nums = { rack: col('Rack'), slot: col('Slot') } as const;
  for (const row of sheet.slice(1)) {
    const tag = (row[cTag] ?? '').trim().replace(/^-/, '');
    if (!tag) continue;
    const card = project.plc.cards.find(c => c.tag === tag);
    if (!card) { res.unknown.push(`-${tag}`); continue; }
    const before = JSON.stringify(card);
    for (const [k, c] of Object.entries(text) as [keyof typeof text, number][]) {
      if (c < 0) continue;
      const v = (row[c] ?? '').trim();
      if (v) card[k] = v; else delete card[k];
    }
    for (const [k, c] of Object.entries(nums) as [keyof typeof nums, number][]) {
      if (c < 0) continue;
      const v = (row[c] ?? '').trim();
      if (!v) { delete card[k]; continue; }
      const n = Number(v.replace(',', '.'));
      if (Number.isInteger(n) && n >= 0) card[k] = n; else res.errors.push(`-${tag}: ${k} «${v}» non valido`);
    }
    const t = cardType(card);
    KINDS.forEach((k, i) => {
      const c = col(START_COLS[i]);
      if (c < 0 || !(t.channels[k] ?? 0)) return;
      const v = (row[c] ?? '').trim();
      if (!v) return;
      const n = Number(v.replace(',', '.'));
      if (Number.isInteger(n) && n >= 0) card.start = { ...card.start, [k]: n };
      else res.errors.push(`-${tag}: indirizzo iniziale ${k} «${v}» non valido`);
    });
    if (JSON.stringify(card) !== before) res.changed++;
  }
  return res;
}
