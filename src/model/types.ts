// Modello dati di OpenWiring. Tutte le coordinate sono in millimetri.
import type { ShowMap, SymVisKey, WireVisKey } from './visibility';
import { tn } from '../i18n/ui';

export interface Pt { x: number; y: number }

/** Codici Weidmüller degli accessori (vedi ProjectSettings.wmcCodes) */
export interface WmcCodes {
  marker?: Record<string, string>;
  markerDefault?: string;
  stripMarker?: string;
  endBracket?: string;
  rail?: string;
  endPlate?: Record<string, string>;
}

/**
 * Tratto di una primitiva: tipo di linea e spessore in mm (assenti = continua, spessore del simbolo).
 * dash è il vecchio tratteggio (= lt 'dash')
 */
export interface PrimStroke {
  lt?: WireLineType; lw?: number;
  /** Livello del CAD dei simboli (assente = livello «0») */
  layer?: string;
}

/**
 * Dati di modifica di una primitiva nell'editor dei simboli: g = gruppo (le primitive con lo stesso
 * g si selezionano e si spostano insieme e restano come sono finché non si esplode il gruppo),
 * lock = bloccata (non si sposta, non si modifica, non si cancella finché non si sblocca)
 */
export interface PrimEdit { g?: string; lock?: boolean }

/** Primitive grafiche dei simboli, in coordinate locali del simbolo. */
export type Prim = (
  | ({ t: 'line'; x1: number; y1: number; x2: number; y2: number; dash?: boolean } & PrimStroke)
  /** logo: nei cartigli, area in cui va il logo della ditta */
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean; logo?: boolean } & PrimStroke)
  | ({ t: 'circle'; cx: number; cy: number; r: number; fill?: boolean } & PrimStroke)
  /** Arco in gradi, senso antiorario nel sistema y-verso-il-basso dello schermo = orario visivo */
  | ({ t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number } & PrimStroke)
  /** rot: rotazione in gradi (oraria sullo schermo) */
  | { t: 'text'; x: number; y: number; s: string; size?: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; muted?: boolean; layer?: string }
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: boolean } & PrimStroke)
  | ({ t: 'poly'; pts: Pt[]; closed?: boolean; fill?: boolean; dash?: boolean } & PrimStroke)
) & PrimEdit;

/** Tipo di linea di una primitiva (anche il vecchio tratteggio) */
export const primLineType = (p: Prim): WireLineType => (p.t === 'text' ? 'solid' : p.lt ?? ('dash' in p && p.dash ? 'dash' : 'solid'));

export type PinDir = 'up' | 'down' | 'left' | 'right';

export interface PinDef {
  id: string;
  x: number;
  y: number;
  dir: PinDir;
  /** Designazione predefinita del punto di connessione (es. "13", "A1") */
  label: string;
  /** Bloccato nell'editor dei simboli: non si sposta e non si cancella finché non si sblocca */
  lock?: boolean;
  /** Tipo del punto: ingresso, uscita o morsetto (assente = connessione generica) */
  kind?: PinKind;
  /**
   * Posizione della designazione rispetto al punto (alto/basso, sinistra/destra nel disegno del
   * simbolo); assente = automatica secondo la direzione del filo
   */
  labelPos?: PinLabelPos;
}

export type PinLabelPos = 'tl' | 'tr' | 'bl' | 'br';

export type PinKind = 'in' | 'out' | 'terminal';

/** Dati del dispositivo che un simbolo può mostrare in un punto scelto nell'editor */
export type FieldKey = 'description' | 'techData' | 'manufacturer' | 'typeNr' | 'orderNr' | 'partNr' | 'func' | 'loc' | 'note'
  /** Punti I/O PLC: indirizzo, nome della variabile e commento del canale */
  | 'plcAddress' | 'plcSymbol' | 'plcComment';

/** Articolo aggiuntivo di un dispositivo (assente qty = 1) */
export interface ExtraPart {
  partNr: string; qty?: number;
  /** Descrizione e costruttore dei codici scritti a mano, che non sono in libreria */
  descr?: string; manufacturer?: string;
}

/** Livello della grafica di un simbolo */
export interface SymLayer { name: string; hidden?: boolean; locked?: boolean; noPlot?: boolean }

/** Primitive del simbolo da disegnare sullo schema (senza quelle dei livelli «non stampare») */
export function plotPrims(sym: Pick<SymbolDef, 'prims' | 'layers'>): Prim[] {
  const off = new Set((sym.layers ?? []).filter(l => l.noPlot).map(l => l.name));
  return off.size ? sym.prims.filter(p => !(p.layer && off.has(p.layer))) : sym.prims;
}

/** Testi di un simbolo che si spostano a mano sullo schema: sigla, righe sotto la sigla, testi del componente */
/** Testi spostabili di un simbolo: sigla, righe sotto la sigla, immagine contatti, testi del componente,
 * numero e morsettiera dei morsetti, designazioni dei punti di connessione (pin:id) */
export type TextMoveKey = 'tag' | 'lines' | 'contacts' | FieldKey | 'termNum' | 'termStrip' | `pin:${string}`;

/** Posizione di un testo rispetto all'origine del simbolo già ruotato (vedi symbolTexts.ts) */
export interface TextPlace { x: number; y: number; anchor?: 'start' | 'middle' | 'end'; rot?: number }

/** I dati non posizionati come testi del componente vanno sotto la sigla? */
export function textsUnderTag(sym: Pick<SymbolDef, 'fields' | 'textsUnderTag'>): boolean {
  return sym.textsUnderTag ?? !(sym.fields ?? []).some(f => !f.f.startsWith('plc'));
}

/** Testo del componente: mostra nello schema il valore del dispositivo (descrizione, articolo…) */
export interface SymField {
  f: FieldKey;
  x: number;
  y: number;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  /** Rotazione del testo in gradi (-90 = dal basso verso l'alto) */
  rot?: number;
  /** Caratteri al massimo: i testi più lunghi si accorciano con "…" */
  max?: number;
}

/**
 * Ruolo nel riferimento incrociato:
 * - main: elemento principale (bobina, motore) che mostra l'immagine dei contatti
 * - aux: elemento secondario (contatto) che rimanda al principale
 * - single: dispositivo autonomo (pulsante, lampada, fusibile)
 * - potential: punto di potenziale (L1, N, +24V)
 * - link: rimando/interruzione tra pagine
 * - terminal: morsetto
 * - pin: pin di un connettore o di una spina (sigla "X10:3", come i morsetti)
 * - oneline: rappresentazione unifilare di un dispositivo (stessa sigla del multifilare)
 * - netnode: nodo di rete (rappresentazione di un dispositivo nello schema di rete, con le sue porte)
 */
export type SymbolRole = 'main' | 'aux' | 'single' | 'potential' | 'link' | 'terminal' | 'pin' | 'plc' | 'netnode' | 'oneline';

/** Tipo di canale PLC: ingresso/uscita digitale o analogico */
export type IoKind = 'DI' | 'DO' | 'AI' | 'AO';

export interface SymbolDef {
  id: string;
  name: string;
  category: string;
  /** Lettera di sigla DT secondo IEC 81346 (K, S, Q, F, ...) */
  letter: string;
  role: SymbolRole;
  /** Per i contatti: tipo per la numerazione automatica e l'immagine contatti */
  contact?: 'NO' | 'NC' | 'CO' | 'power';
  /** Contatto temporizzato: numerazione EN 50005 con le cifre di funzione 5-6 (NC) e 7-8 (NA) */
  timed?: boolean;
  /** Per i punti I/O PLC: tipo di canale */
  io?: IoKind;
  prims: Prim[];
  pins: PinDef[];
  /** Posizione della sigla rispetto all'origine del simbolo */
  tagPos?: Pt;
  /**
   * Livelli della grafica (CAD dei simboli): nascosti o bloccati nell'editor; noPlot = non disegnati
   * sullo schema (es. linee di costruzione). Il livello «0» c'è sempre
   */
  layers?: SymLayer[];
  /** Allineamento della sigla sul suo punto (assente = automatico: verso l'esterno del simbolo) */
  tagAnchor?: 'start' | 'middle' | 'end';
  /**
   * Dati del dispositivo non messi come testi del componente (descrizione, dati tecnici…): scritti
   * sotto la sigla (true) o non scritti (false). Assente = sotto la sigla solo se il simbolo non ha
   * testi del componente posizionati (vedi textsUnderTag)
   */
  textsUnderTag?: boolean;
  /** Testi del componente in posizione fissa; descrizione e dati tecnici qui non si ripetono sotto la sigla */
  fields?: SymField[];
  description?: string;
  /** Provenienza dei simboli importati (es. "QElectroTech") e licenza da citare */
  source?: string;
  /** Copia personale che prende il posto di un simbolo di base nella libreria (id del simbolo di base) */
  replaces?: string;
  /** Simbolo definito nel formato testo: la riga "simbolodef" che lo descrive */
  textDef?: string;
  /** Id di altri simboli unificati con questo (doppioni): i progetti che li usano passano a questo */
  aliases?: string[];
  /** Simbolo che non compare nell'elenco della libreria (es. i canali dei gruppi I/O PLC) */
  hidden?: boolean;
  /**
   * Gruppo I/O PLC: inserendolo si dispongono count canali del simbolo slice uno accanto all'altro,
   * legati tra loro (vedi plcGroup.ts)
   */
  plcGroup?: { slice: string; count: number };
  /**
   * Riquadro in cui i testi del componente vanno uno sotto l'altro e a capo da soli, con l'altezza
   * dei «Testi dei gruppi I/O PLC» del progetto (le posizioni dei campi non contano)
   */
  textBox?: { x: number; y: number; w: number; h: number };
  /** Rotazioni ammesse sullo schema (assente = tutte); vedi rotations.ts */
  rotations?: (0 | 90 | 180 | 270)[];
  /** Il simbolo non si specchia sullo schema */
  noMirror?: boolean;
  /** Posizione dei testi sullo schema scelta per ogni rotazione (assente = automatica) */
  orientTexts?: Partial<Record<0 | 90 | 180 | 270, Partial<Record<TextMoveKey, TextPlace>>>>;
}

export interface SymbolInstance {
  kind: 'symbol';
  id: string;
  symbolId: string;
  x: number;
  y: number;
  rot: 0 | 90 | 180 | 270;
  mirror?: boolean;
  /** Sigla del dispositivo senza trattino iniziale, es. "K1". Per potenziali/rimandi è il nome. */
  tag: string;
  /** Designazioni dei punti di connessione (pinId → etichetta) */
  pinLabels: Record<string, string>;
  /** Se true le designazioni vengono calcolate automaticamente */
  autoPins: boolean;
  /** Codice articolo associato (P_ARTICLE_PARTNR) */
  partNr?: string;
  /**
   * Articoli in più dello stesso dispositivo (es. sezionatore: barra di prolunga e manopola), con la
   * quantità: vanno in distinta e nella lista d'acquisto con la sigla del dispositivo
   */
  extraParts?: ExtraPart[];
  /** Proprietà definite dall'utente del dispositivo (nome identificativo → valore), vedi userProps.ts */
  userProps?: Record<string, string>;
  /**
   * Dati del dispositivo. Valgono per tutto il dispositivo (bobina e contatti con la stessa
   * sigla) e, se presenti, prevalgono sui dati dell'articolo assegnato.
   */
  description?: string;
  /** Dati tecnici scritti sullo schema, es. "24 V DC" o "2,2 kW" */
  techData?: string;
  manufacturer?: string;
  typeNr?: string;
  orderNr?: string;
  note?: string;
  /** Funzione (impianto) senza "=", es. "A1" */
  func?: string;
  /** Luogo di installazione senza "+", es. "Q1" */
  loc?: string;
  /** Testi sullo schema: undefined = come da impostazione di progetto */
  showTexts?: boolean;
  /**
   * Proprietà mostrate o nascoste sullo schema (sigla, descrizione, morsetti, rimandi…); per i
   * dispositivi vale per tutti i loro elementi. Assente = come da impostazioni (vedi visibility.ts)
   */
  show?: ShowMap<SymVisKey>;
  /** Punto I/O PLC: canale della scheda (es. "DI3"); la scheda è indicata dalla sigla */
  plcChannel?: string;
  /**
   * Il numero filo passa attraverso l'elemento senza cambiare (i fili ai suoi morsetti hanno lo
   * stesso numero). Predefinito: sì per i morsetti di morsettiera, no per gli altri componenti.
   */
  wirePass?: boolean;
  /**
   * Rimando: id del rimando corrispondente (partenza ↔ arrivo, uno solo). "" o assente = non
   * scelto, si abbina per nome con un rimando libero; "-" = senza corrispondente per scelta
   */
  linkTo?: string;
  /** Rimando di partenza a stella: collegato a tutti gli arrivi con lo stesso nome */
  linkStar?: boolean;
  /**
   * Rappresentazione (riferimento a coppie): id del contatto vero che questo simbolo mostra, es. il
   * contatto ausiliario di un salvamotore disegnato accanto ai poli e cablato altrove. Non conta come
   * contatto, non entra in collegamenti e liste; sigla e morsetti seguono il contatto vero
   */
  pairOf?: string;
  /**
   * Rappresentazione ridotta: solo il disegnino del contatto con i morsetti e la pagina del contatto vero,
   * senza sigla (sta accanto all'elemento principale). Verticale con rot 0/180, orizzontale con 90/270
   */
  pairCompact?: boolean;
  /** Altezza dei testi della rappresentazione ridotta in mm (assente = quella dei riferimenti incrociati) */
  pairSize?: number;
  /**
   * Rappresentazione «a fianco del simbolo principale»: la posizione si calcola da sola accanto
   * all'apparecchio (sulla linea del comando, una dopo l'altra) e segue l'apparecchio quando si sposta
   */
  pairSide?: boolean;
  /**
   * Canale di un gruppo I/O PLC: id del gruppo, posizione nel gruppo (0 = primo), canali del gruppo
   * (anche quelli nascosti) e own = canale scelto a mano (non segue il primo canale del gruppo)
   */
  plcGroup?: { id: string; index: number; count: number; own?: boolean };
  /** Nome simbolico della variabile PLC (es. "Pompa_Marcia") */
  plcSymbol?: string;
  /** Commento della variabile PLC */
  plcComment?: string;
  /**
   * Testi spostati a mano sullo schema (sigla, righe sotto la sigla, testi del componente):
   * spostamento in mm rispetto alla posizione del simbolo
   */
  textOffsets?: Partial<Record<TextMoveKey, Pt>>;
  /**
   * Elemento principale (bobina): dove va l'immagine dei contatti, in fondo alla pagina o sotto il
   * simbolo (assente = come il progetto); spostata a mano con textOffsets.contacts
   */
  contactImage?: 'bottom' | 'symbol';
  /** Morsetto: numero e sigla della morsettiera scritti paralleli o perpendicolari al morsetto (assente = come il progetto) */
  termText?: TerminalTextDir;
  /** Nodo di rete: indirizzo (IP, ID Modbus, nome Profinet, indirizzo EtherCAT…) */
  netAddress?: string;
  /** Nodo di rete: indirizzo IP (piano IP) */
  ip?: string;
  /**
   * Interfacce di rete con un indirizzo proprio (es. X2 separata dallo switch di X1): le porte elencate
   * (etichette dei pin) hanno questi IP e nome; le altre porte usano ip e netAddress del dispositivo
   */
  netIfs?: NetIfDef[];
}

/** Interfaccia di rete scritta su un dispositivo: porte, IP e nome (Profinet) o indirizzo del nodo */
export interface NetIfDef {
  ports: string[];
  ip?: string;
  address?: string;
}

/** Campi che appartengono al dispositivo e vengono condivisi da tutti i suoi elementi */
export const DEVICE_FIELDS = ['description', 'techData', 'manufacturer', 'typeNr', 'orderNr', 'note', 'func', 'loc', 'partNr', 'showTexts', 'show', 'extraParts', 'userProps'] as const;
export type DeviceField = typeof DEVICE_FIELDS[number];
/** Pin di connettore: campi propri di ogni pin (gli altri valgono per tutto il connettore) */
export const PIN_OWN_FIELDS: readonly DeviceField[] = ['description', 'techData', 'note'];
/**
 * Contatti ausiliari di un dispositivo con l'elemento principale (bobina): hanno una descrizione
 * propria (es. «Consenso pompa»); articolo e codici sono del dispositivo e si modificano solo
 * dall'elemento principale
 */
export const AUX_OWN_FIELDS: readonly DeviceField[] = ['description'];

export interface Wire {
  kind: 'wire';
  id: string;
  points: Pt[];
  /** Sezione, colore, tipo cavo: dati per la lista connessioni */
  cross?: string;
  color?: string;
  /** Tipo di filo (es. H07V-K, N1VV-K): per la lista fili e la lista d'acquisto */
  wireType?: string;
  /** Numero filo impostato a mano: vale per tutto il conduttore */
  number?: string;
  /** Numero, sezione e colore mostrati o nascosti su questo filo (assente = come da progetto) */
  show?: ShowMap<WireVisKey>;
  /**
   * Posizioni del numero filo scelte a mano (anche più di una sullo stesso filo); assente = posizione
   * automatica. vertical: testo ruotato di -90° (dal basso verso l'alto)
   */
  labels?: { x: number; y: number; vertical: boolean }[];
  /**
   * Lineetta obliqua con sezione e colore: distanza (mm) dall'inizio del filo lungo il percorso,
   * scelta trascinandola; assente = posizione automatica accanto al numero filo
   */
  tickAt?: number;
  /**
   * Conduttore di scorta (es. i fili di un cavo portati a morsetti di riserva tra due quadri): resta
   * disegnato e prende il conduttore del cavo, ma non ha numero filo, è tratteggiato con la scritta
   * «scorta» e i morsetti a cui arriva contano come morsetti di riserva. Vale per tutto il conduttore
   */
  spare?: boolean;
  /** Collegamento di rete/bus (es. "Profinet", "Modbus RTU"): non riceve numero filo */
  bus?: string;
  /** Collegamento di rete: dati del cavo (sigla, tipo, lunghezza, articolo) per la lista cavi */
  busCable?: BusCable;
  /** Schema unifilare: numero di conduttori rappresentati (trattini sulla linea) */
  poles?: number;
  /** Schema unifilare: testo della linea, es. "3/N/PE ~400 V 50 Hz" */
  text?: string;
  /** Tipo di linea sullo schema (assente = continua) */
  lineType?: WireLineType;
  /** Spessore della linea sullo schema in mm (assente = predefinito) */
  width?: number;
  /** Altezza (mm) e colore del numero filo su questo filo (assenti = quelli del progetto) */
  labelSize?: number;
  labelColor?: string;
  /**
   * Bus di conduttori (modalità BUS): la linea porta più conduttori insieme. Il valore è il nome del
   * bus ("" = senza nome); i bus con lo stesso nome sono lo stesso bus su tutte le pagine
   */
  bundle?: string;
  /** Bus fili: articolo del cavo che rappresenta (i suoi conduttori sono quelli proposti per il bus) */
  bundlePart?: string;
  /** Bus fili: altezza (mm) e colore dei nomi dei conduttori scritti dove i fili entrano (assenti = 1,8 mm e il colore dei numeri filo) */
  tapSize?: number;
  tapColor?: string;
  /** Filo che entra in un bus: conduttore del bus a cui si collega l'estremo iniziale o finale (es. "L1") */
  tapStart?: string;
  tapEnd?: string;
  /**
   * Nodo a T con verso (come in EPLAN): se l'estremo iniziale o finale del filo è il gambo di una T,
   * il braccio della linea passante (direzione dal nodo) a cui si collega nella sequenza di cablaggio.
   * Assente = giunzione senza verso (pallino)
   */
  tNode?: { start?: PinDir; end?: PinDir };
  /** Proprietà definite dall'utente del collegamento */
  userProps?: Record<string, string>;
}

/** Tipi di linea dei fili: continua, tratteggiata, linea-punto, a punti */
export type WireLineType = 'solid' | 'dash' | 'dashdot' | 'dot';
export const WIRE_LINE_TYPES: { id: WireLineType; name: string; dxf: string }[] = [
  { id: 'solid', name: tn('continua'), dxf: 'CONTINUOUS' },
  { id: 'dash', name: tn('tratteggiata'), dxf: 'DASHED' },
  { id: 'dashdot', name: tn('linea-punto'), dxf: 'DASHDOT' },
  { id: 'dot', name: tn('a punti'), dxf: 'DOT' },
];
/** Spessori dei fili (mm, serie ISO 128 delle penne) e spessore predefinito */
export const WIRE_WIDTHS = [0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4];
export const WIRE_WIDTH_DEFAULT = 0.35;

/**
 * Tratteggio SVG del tipo di linea (mm), proporzionato allo spessore: i punti sono tratti di
 * lunghezza quasi nulla con estremità arrotondate
 */
export function wireDash(type: WireLineType | undefined, width: number, small = false): { dash?: string; cap: 'round' | 'butt' } {
  const k = Math.max(1, width / WIRE_WIDTH_DEFAULT);
  const d = (...v: number[]) => v.map(x => Math.round(x * k * 100) / 100).join(' ');
  // small: tratti più corti per la grafica dei simboli, che è piccola
  switch (type) {
    case 'dash': return { dash: small ? d(1.2, 0.8) : d(3, 1.5), cap: 'butt' };
    case 'dashdot': return { dash: small ? d(1.6, 0.6, 0.01, 0.6) : d(4, 1.2, 0.01, 1.2), cap: 'round' };
    case 'dot': return { dash: small ? d(0.01, 0.7) : d(0.01, 1.2), cap: 'round' };
    default: return { cap: 'butt' };
  }
}

/** Cavo di un collegamento di rete (patch Profinet, cavo Modbus…) */
export interface BusCable {
  /** Sigla senza trattino, es. "5W1" */
  tag?: string;
  /** Tipo, es. "Profinet tipo A 2×2×AWG22" */
  type?: string;
  /** Lunghezza in metri */
  length?: number;
  partNr?: string;
  /**
   * Sigla data dal programma (non scritta dall'utente): se poi il tratto si collega con i rimandi a
   * un cavo che ha già una sigla, prende quella
   */
  auto?: boolean;
}

export interface TextItem {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  /** Rotazione in gradi, oraria sullo schermo (es. -90 = testo che si legge dal basso verso l'alto) */
  rot?: number;
  /** Larghezza del riquadro (mm): il testo va a capo da solo a parole intere (assente = una riga) */
  w?: number;
  /** Allineamento delle righe: a sinistra (assente), al centro, a destra (nel riquadro, se c'è) */
  align?: 'start' | 'middle' | 'end';
}

/**
 * Linea di definizione cavo (come in EPLAN): i fili che attraversa sono conduttori del cavo.
 * Più linee, anche su pagine diverse, possono riferirsi allo stesso cavo.
 */
export interface CableLine {
  kind: 'cable';
  id: string;
  cableId: string;
  points: [Pt, Pt];
  /**
   * Rappresentazione principale del cavo (come in EPLAN): porta tipo, sezione e descrizione; le altre
   * linee dello stesso cavo mostrano di serie solo la sigla. Nessuna linea scelta = la prima del progetto.
   */
  main?: boolean;
  /** Cosa scrivere su questa linea (assente = come lo stile dei cavi del progetto) */
  show?: CableLineShow;
  /** Posizione dei testi rispetto alla linea (assente = come lo stile dei cavi) */
  labelPos?: CableLabelPos;
  /** Spostamento dei testi trascinati (mm) */
  labelOffset?: Pt;
  /** Collegamento dello schermo: alla fine della linea (di serie), all'inizio o nessuno */
  shieldGround?: 'end' | 'start' | 'none';
  /** Altezza dell'asola dello schermo su questa linea in mm (assente = quella dello stile) */
  shieldHeight?: number;
  /** Nomi dei conduttori orizzontali o verticali su questa linea (assente = come nello stile) */
  condDir?: CableCondDir;
  /** Colori e misure scelti su questa linea (assente = come lo stile dei cavi) */
  look?: ItemLook;
}

/**
 * Aspetto scelto su un singolo riquadro di luogo o linea di cavo: colore e spessore della linea,
 * altezza e colore della scritta (sui cavi l'altezza è quella della sigla, gli altri testi in proporzione)
 */
/** Aspetto di serie dei riquadri di luogo nel progetto */
export interface ZoneStyle extends ItemLook { codeOnly?: boolean }

export interface ItemLook { lineColor?: string; lineWidth?: number; textSize?: number; textColor?: string }

/** Verso dei nomi dei conduttori sulla linea del cavo: orizzontali o verticali (dal basso verso l'alto) */
export type CableCondDir = 'h' | 'v';

/** Testi della linea di un cavo: sigla, tipo, sezione, descrizione e nomi dei conduttori sugli incroci */
export interface CableLineShow { tag?: boolean; type?: boolean; section?: boolean; description?: boolean; conductors?: boolean }

/** Posizione dei testi del cavo: prima dell'inizio, dopo la fine, sopra o sotto la linea all'inizio o alla fine */
export type CableLabelPos = 'before' | 'after' | 'aboveStart' | 'aboveEnd' | 'belowStart' | 'belowEnd';

/** Aspetto delle linee dei cavi nel progetto (come la «disposizione proprietà» di EPLAN) */
export interface CableStyle {
  lineColor?: string;
  lineWidth?: number;
  tagSize?: number;
  tagColor?: string;
  textSize?: number;
  textColor?: string;
  condSize?: number;
  condColor?: string;
  shieldColor?: string;
  /** Asola dello schermo: altezza in mm e distanza delle estremità dal primo e dall'ultimo conduttore */
  shieldHeight?: number;
  shieldMargin?: number;
  /** Nomi dei conduttori orizzontali o verticali */
  condDir?: CableCondDir;
  /** Trattino obliquo su ogni filo attraversato */
  ticks?: boolean;
  labelPos?: CableLabelPos;
  /** Testi della linea principale e delle altre linee dello stesso cavo */
  main?: CableLineShow;
  other?: CableLineShow;
}

/**
 * Linea di definizione dei fili (come negli schemi tradizionali): una riga sottile che attraversa più
 * fili con un trattino su ogni incrocio e la scritta della sezione. La sezione va su tutti i fili
 * attraversati (si riapplica quando la linea si sposta o cambia)
 */
export interface WireDef {
  kind: 'wiredef';
  id: string;
  points: [Pt, Pt];
  cross?: string;
  /** Posizione della scritta (si trascina; legata con un righino alla fine della linea); assente = accanto alla fine */
  label?: Pt;
}

/** Riquadro di un quadro elettrico nello schema di rete (es. "+Q2 Slave 1") */
export interface Zone {
  kind: 'zone';
  id: string;
  panelId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Scritta «+codice» spostata a mano, rispetto all'angolo in alto a sinistra (legata al bordo con un righino) */
  label?: Pt;
  /** Scrive solo «+codice», senza il nome del luogo (assente = come lo stile del progetto) */
  codeOnly?: boolean;
  look?: ItemLook;
}

/** A cosa si assegna una proprietà definita dall'utente (come in EPLAN) */
export type UserPropAssign = 'function' | 'project' | 'page' | 'connection' | 'part';
/** Tipo di campo: testo, testo multilingua, intero, decimale, sì/no, valore con unità */
export type UserPropType = 'text' | 'multilang' | 'int' | 'number' | 'bool' | 'unit';

/** Proprietà definita dall'utente (EPLAN «Configura proprietà»): definizione salvata nel progetto */
export interface UserPropDef {
  /** Nome identificativo, es. "ACME.Commessa.Codice" (almeno un punto, non inizia con "EPLAN") */
  id: string;
  /** Nome visualizzato */
  name: string;
  description?: string;
  assign: UserPropAssign;
  type: UserPropType;
  unit?: string;
  category?: string;
  /** Valori dell'elenco di scelta */
  choices?: string[];
  /** Aiuto all'inserimento: libero, solo elenco, libero con elenco */
  input?: 'free' | 'list' | 'free+list';
  /** «Non utilizzare più»: nascosta e non esportata */
  obsolete?: boolean;
}

/** Immagine sullo schema (foto, logo, disegno della macchina): PNG, JPG, SVG… salvata nel progetto */
export interface ImageItem {
  kind: 'image';
  id: string;
  /** Angolo in alto a sinistra e misure (mm) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Immagine come data URL */
  src: string;
  /** Nome del file da cui viene */
  name?: string;
  /** Cornice sottile intorno */
  border?: boolean;
  /** Sotto i simboli e i fili (predefinito) o sopra */
  front?: boolean;
  /**
   * Disegno vettoriale (importato da DXF) al posto dell'immagine: grafica in mm con le sue misure
   * naturali, scalata sul riquadro w × h; src resta vuoto
   */
  vector?: { prims: Prim[]; w: number; h: number };
}

/**
 * Gruppo di un ripartitore: un polo (L1, L2, L3, N) o, in una morsettiera di distribuzione, un morsetto
 * di ingresso ponticellato con i suoi morsetti di uscita. Le sezioni sono quelle massime ammesse (mm²,
 * "" = non indicata): su un'uscita possono andare più fili, purché la somma delle sezioni non superi la sua
 */
export interface DistGroup {
  name: string;
  inMax?: string;
  outs: string[];
}

/**
 * Ripartitore (es. Cembre DB100-6/4) o morsettiera di distribuzione: definito come i cavi, con i gruppi e
 * le uscite; sullo schema ogni gruppo è un simbolo generato dai dati con la sigla del ripartitore
 */
export interface Distributor {
  id: string;
  /** Sigla senza trattino, es. "1Q5" o "X5" */
  tag: string;
  /** Barra di ripartizione, morsetti ponticellati o barra di terra/equipotenziale (PE, N) */
  kind: 'bar' | 'terminals' | 'earth';
  groups: DistGroup[];
  description?: string;
  partNr?: string;
}

/** Dati di un connettore (vista Connettori): pin, tipo del catalogo, genere, custodia… */
export interface ConnectorData {
  /** Numero di pin del connettore (dall'articolo o scritto a mano) */
  pins?: number;
  description?: string;
  /** Note del connettore (quelle dei singoli pin sono nei pin) */
  note?: string;
  /** Articolo della controparte (es. la spina per una presa da quadro) */
  matingPartNr?: string;
  /** Tipo dal catalogo dei connettori (es. "ilme-cne-16"): numero di contatti, codici, custodia */
  type?: string;
  /** Maschio, femmina o la coppia (simbolo dei pin e inserti in distinta) */
  gender?: 'M' | 'F' | 'MF';
  /** Custodia scritta a mano (es. "ILME CHI 77.27 base da parete"); assente = quella del tipo */
  housing?: string;
  /** Riquadro del connettore sullo schema (assente = sì) */
  frame?: boolean;
}

export type Element = SymbolInstance | Wire | TextItem | CableLine | WireDef | Zone | ImageItem;

/**
 * Luogo di installazione (contenitore): quadro, pulsantiera, bordo macchina, cassetta…
 * Le pagine e i dispositivi vi appartengono; il codice è il luogo "+" della sigla.
 */
export interface Panel {
  id: string;
  /** Codice di luogo senza "+", es. "QE", "BM", "P1", "QS1" */
  code: string;
  /** Nome libero, es. "Quadro master", "Pulsantiera 2" */
  name: string;
  /** Tipo di contenitore, es. "Quadro elettrico" */
  kind?: string;
  /** Luogo che lo contiene (sottoquadro, es. una pulsantiera montata sul quadro) */
  parentId?: string;
}

export const PANEL_KINDS = [tn('Quadro elettrico'), tn('Pulsantiera'), tn('Bordo macchina'), tn('Cassetta di derivazione'), tn('Campo'), tn('Altro')];

/** Sottorete IP del piano indirizzi, es. 192.168.0.0/24 */
export interface IpNetwork {
  id: string;
  name: string;
  /** Indirizzo di rete, es. "192.168.0.0" */
  address: string;
  /** Lunghezza del prefisso, es. 24 (= 255.255.255.0) */
  prefix: number;
  gateway?: string;
  /** Protocolli che usano questa rete (vuoto = tutti quelli su IP) */
  protocols?: string[];
  /** Primo indirizzo host da assegnare in automatico (ultimo ottetto o numero host), es. 10 */
  firstHost?: number;
}

export type Lang = 'it' | 'en' | 'de';

export interface TranslationEntry {
  en?: string;
  de?: string;
  it?: string;
  /** Lingue con una traduzione proposta in automatico, da verificare */
  auto?: Lang[];
}

export interface LanguageSettings {
  /** Lingua di visualizzazione di schemi e PDF */
  display: Lang;
  /** Seconda lingua scritta sotto la prima (schemi bilingue) */
  second?: Lang;
}

export type CableMarking = 'numbers' | 'colors';

/** Dati di un articolo cavo: scegliendolo, il cavo prende tutti i conduttori */
export interface PartCable {
  marking: CableMarking;
  /** Conduttori in ordine, anche se nello schema se ne usano solo alcuni */
  conductors: string[];
  cross?: string;
  shield?: boolean;
  /** Cavo confezionato (con connettore, lunghezza fissa): si ordina a pezzi, non a metri */
  pieces?: boolean;
}

/** Cavo multipolare */
export interface Cable {
  id: string;
  /** Sigla senza trattino, es. "1W1" */
  tag: string;
  /** Tipo, es. "FG16OR16" */
  type?: string;
  /** Sezione dei conduttori, es. "1,5" */
  cross?: string;
  /** Nomi dei conduttori in ordine: numeri ("1","2"…) o colori ("BN","BK","GY","BU","GNYE") */
  conductors: string[];
  /** Marcatura dei conduttori: numeri o colori (senza: dedotta dai nomi) */
  marking?: CableMarking;
  shield?: boolean;
  /** Conduttori intrecciati a coppie, nell'ordine (1-2, 3-4…): coppie disegnate sulle linee del cavo */
  pairs?: boolean;
  /** Lunghezza in metri */
  length?: number;
  /** A pezzi (cavo confezionato con connettore): true/false scelto sul cavo, assente = come l'articolo */
  pieces?: boolean;
  description?: string;
  /** Sigle o descrizioni delle estremità (es. "-X1", "-M1") */
  from?: string;
  to?: string;
  partNr?: string;
  /** Conduttore scelto a mano per un filo (wireId → nome); gli altri si assegnano in ordine */
  assign: Record<string, string>;
  /**
   * Conduttori assegnati in automatico e poi fissati (wireId → nome): un filo nuovo prende il primo
   * conduttore libero senza far cambiare quelli degli altri fili, anche se è su una pagina precedente
   */
  fixed?: Record<string, string>;
  /**
   * Sigla del dispositivo (senza «-», es. "510NG1") con il connettore integrato: il filo che parte
   * dal suo morsetto n prende il conduttore n del cavo (pin 1 = primo conduttore dell'elenco)
   */
  pinsOf?: string;
}

/**
 * Tipi di pagina; cable (cablaggio di un cavo), connector (piedinatura di un connettore) e system
 * (schema d'insieme) si disegnano da soli dai dati del progetto (vedi drawings.ts)
 */
export type PageType = 'multiline' | 'singleline' | 'cover' | 'notes' | 'plc' | 'strip' | 'layout' | 'network' | 'report' | 'cable' | 'connector' | 'system';

export interface Page {
  id: string;
  name: string;
  /** Descrizione mostrata nel cartiglio */
  title: string;
  type: PageType;
  elements: Element[];
  /** Pagina panoramica PLC: scheda rappresentata (contenuto generato in automatico) */
  cardId?: string;
  /** Schema della morsettiera: morsettiera rappresentata e foglio (0, 1, …) se servono più pagine */
  strip?: string;
  stripSheet?: number;
  /** Pagina di layout del quadro (vista di montaggio) */
  layout?: Layout;
  /** Quadro (sezione) a cui appartiene la pagina */
  panelId?: string;
  /**
   * Pagina proiettata: mostra dal vivo il contenuto del riquadro di luogo zoneId della pagina pageId
   * (disegnato nelle pagine di un altro quadro), così chi cabla questo quadro lo trova tra le sue
   * pagine. È solo disegno: nessun elemento proprio, niente doppioni nelle liste
   */
  projection?: { pageId: string; zoneId: string };
  /** Pagina disegnata (cable, connector): sigla del cavo o del connettore rappresentato */
  item?: string;
  /** Pagina di lista: titolo della lista rappresentata e foglio (0, 1, …) */
  report?: string;
  reportSheet?: number;
  /**
   * Pagina di una lista divisa per quadro (settings.reportBlocks): luogo delle righe (id del quadro,
   * «+codice» per un luogo scritto solo sui dispositivi, "" = senza quadro); assente = tutto il progetto
   */
  reportPanel?: string;
  /**
   * Descrizione automatica data dall'ultimo aggiornamento della pagina generata: finché il titolo è
   * questo si aggiorna con la lista, se l'utente lo cambia resta il suo
   */
  autoTitle?: string;
  /** Modello di cartiglio della pagina (se diverso da quello del progetto) */
  titleBlockId?: string;
  /** Proprietà definite dall'utente della pagina */
  userProps?: Record<string, string>;
}

/** Elemento posato sulla piastra; coordinate reali in mm dall'angolo in alto a sinistra della piastra */
export interface LayoutItem {
  id: string;
  kind: 'rail' | 'duct' | 'device' | 'strip';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Apparecchio: sigla del dispositivo (es. "2K1"); morsettiera: nome (es. "X1") */
  ref?: string;
  /** Articolo di guida o canalina (quantità in metri in distinta) */
  partNr?: string;
  /** Testo libero (per guide e canaline, es. "TS 35x7,5" o "40x60") */
  label?: string;
}

export interface Layout {
  /** Dimensioni della piastra di montaggio in mm */
  plate: { w: number; h: number };
  items: LayoutItem[];
  /** Riserva di filo per estremità (mm) usata per le lunghezze stimate */
  wireReserve?: number;
}

export interface FunctionTemplate {
  pos: number;
  description: string;
  /** Designazioni dei punti di connessione della funzione, es. ["13","14"] */
  connections: string[];
  /** Categoria funzione EPLAN se presente (es. "Contatto NA") */
  category?: string;
  /** Funzione del morsetto EPLAN: 1 sezionabile, 3 portacomponenti, 4 portafusibile */
  terminalFunction?: number;
}

export interface Part {
  partNr: string;
  typeNr?: string;
  orderNr?: string;
  manufacturer?: string;
  supplier?: string;
  descr1?: string;
  descr2?: string;
  productGroup?: string;
  width?: number;
  height?: number;
  depth?: number;
  weight?: number;
  price?: number;
  note?: string;
  macro?: string;
  /** Simbolo da usare nello schema per questo articolo (al posto della scatola nera) */
  symbolId?: string;
  /** Potenza dissipata in W (per il calcolo termico del quadro) */
  powerLoss?: number;
  /** Immagine come data URL */
  picture?: string;
  /** Schede tecniche e documenti dell'articolo: file PDF sul disco (percorso) o indirizzo web */
  docs?: PartDoc[];
  functionTemplates: FunctionTemplate[];
  /** Articolo cavo: tipologia con tutti i suoi conduttori (es. 25 colori) */
  cable?: PartCable;
  /** Articolo morsetto, con il numero di piani (1, 2 o 3): compare nelle scelte delle morsettiere */
  terminal?: { levels: number };
  /** Tutti gli attributi originali dell'XML, per non perdere dati */
  attrs: Record<string, string>;
  source?: string;
  /**
   * Articolo della libreria nel database (app desktop) tenuto leggero in memoria: attributi e foto
   * restano nel database (picture è l'indirizzo ecad-foto://); attrs contiene solo le modifiche
   * ancora da salvare (un valore vuoto toglie l'attributo)
   */
  lite?: true;
}

/** Documento collegato a un articolo (scheda tecnica, manuale, dichiarazione…) */
export interface PartDoc {
  /** Nome mostrato nell'elenco (es. "Scheda tecnica") */
  name: string;
  /** Percorso del file sul disco (PDF) oppure indirizzo http(s) */
  path: string;
}

/** Calcolo termico di un quadro (IEC/TR 60890, superficie efficace) */
export interface ThermalCalc {
  /** Luogo (quadro); "" = tutto il progetto */
  panelId: string;
  /** Dimensioni dell'involucro in mm */
  w: number; h: number; d: number;
  /** Posizione di installazione 1…7 (IEC/TR 60890) */
  install: number;
  /** Materiale dell'involucro (coefficiente di trasmissione k) e k scritto a mano */
  material: 'steel' | 'stainless' | 'aluminium' | 'aluminium2' | 'plastic';
  k?: number;
  /** Temperature in °C: ambiente massima e minima, interna massima ammessa e minima voluta */
  tAmb: number; tAmbMin?: number; tMax: number; tMin?: number;
  /** Altitudine in m (portata dei ventilatori) */
  altitude?: number;
  /** Fattore di contemporaneità delle perdite (0…1) */
  factor?: number;
  /** Potenza dissipata scritta a mano per dispositivo (sigla → W), al posto di quella dell'articolo */
  pv?: Record<string, number>;
  /** Altre perdite (cavi, morsetti, illuminazione…) */
  extra?: { name: string; w: number }[];
}

/** Verifica di un cavo: corrente, tensione, sistema, posa e caduta ammessa */
export interface CableCalc {
  /** Corrente di impiego in A */
  i?: number;
  /** Tensione nominale in V (concatenata per il trifase) e sistema */
  u?: number; phases?: 1 | 3;
  cos?: number;
  /** Metodo di posa (IEC 60364-5-52) e isolante */
  method?: 'B2' | 'C' | 'E';
  insulation?: 'PVC' | 'XLPE';
  /** Fattore di correzione della portata (temperatura, raggruppamento) */
  kCorr?: number;
  /** Portata scritta a mano in A (al posto della tabella) */
  iz?: number;
  /** Caduta di tensione ammessa in % */
  duMax?: number;
}

export interface ProjectInfo {
  name: string;
  description: string;
  company: string;
  customer: string;
  author: string;
  drawingNr: string;
  revision: string;
  date: string;
}

/**
 * Impostazioni di progetto. I modelli di numerazione accettano i segnaposto
 * {pagina}, {colonna}, {lettera}, {n} e {n:2} (numero con cifre fisse).
 */
export interface ProjectSettings {
  /** Passo della griglia in mm */
  grid: number;
  /** Modello della sigla dispositivo, es. "{pagina}{lettera}{n}" → -2K1 */
  tagFormat: string;
  /** Il numero progressivo riparte su ogni pagina o è unico nel progetto */
  tagScope: 'page' | 'project';
  /** Modello del numero filo, es. "{pagina}.{n:2}" → 200.01; {n:A} = contatore in lettere, {quadro} = codice del quadro */
  wireFormat: string;
  /** Il contatore riparte su ogni pagina, su ogni quadro (pagine senza quadro insieme) o è unico nel progetto */
  wireScope: 'page' | 'project' | 'panel';
  /**
   * Con il contatore unico o per quadro: numeri lasciati liberi dopo ogni pagina, così i fili aggiunti
   * poi a una pagina restano nella sua serie e le pagine seguenti non scalano. Assente o 0 = nessuna riserva
   */
  wireReserve?: number;
  /** Ordine dei fili sulla pagina: per colonne (di serie, da sinistra a destra) o per righe (dall'alto in basso) */
  wireOrder?: 'rows';
  /**
   * fixed: un numero assegnato non cambia più (i fili nuovi prendono il primo numero libero);
   * live: la numerazione viene ricalcolata a ogni modifica
   */
  wireNumbering: 'fixed' | 'live';
  /** I conduttori collegati a un punto di potenziale (L1, N, PE…) mostrano il nome invece del numero */
  wireKeepPotentialNames: boolean;
  /**
   * I fili collegati a un canale PLC prendono il nome dall'indirizzo (I0.3; con 2 morsetti per canale
   * I0.3A e I0.3B), anche attraverso i morsetti; i rimandi di quei fili prendono lo stesso nome
   */
  wirePlcNames: boolean;
  showWireNumbers: boolean;
  /**
   * Fili più corti di questa lunghezza (mm) senza numero (es. il tratto fino a un rimando vicino,
   * dove i numeri si sovrappongono); il numero si può mostrare lo stesso filo per filo. Assente o 0 = tutti
   */
  wireNoMinLength?: number;
  /** Descrizione e dati tecnici dei dispositivi scritti sullo schema accanto alla sigla */
  showDeviceTexts: boolean;
  /** Formato degli indirizzi PLC */
  plcAddressFormat: PlcAddressFormat;
  /** Sezione e colore del conduttore scritti accanto al numero filo */
  showWireData: boolean;
  /** Fili disegnati a schermo nel loro colore (sigla IEC 60757) */
  drawWireColors: boolean;
  /** Nuvolette sulle modifiche fatte dopo l'ultima revisione */
  showRevisionClouds: boolean;
  /**
   * Immagine dei contatti sotto le bobine: in fondo alla pagina (come EPLAN, sotto la barra 0 V)
   * o subito sotto il simbolo
   */
  contactImage?: 'bottom' | 'symbol';
  /**
   * Disegno dell'immagine dei contatti: i simboli dei contatti ruotati in orizzontale, con i morsetti
   * sulle linee e il rimando a sinistra (predefinito), oppure il testo compatto con il disegnino
   */
  contactImageStyle?: 'symbols' | 'text';
  /**
   * Sezione e colore del filo su una lineetta obliqua che si sposta lungo il filo (predefinito);
   * false: scritti attaccati al numero filo
   */
  wireDataTick?: boolean;
  /** Liste che diventano pagine del progetto (titoli); se manca, tutte quelle non vuote */
  reportPages?: string[];
  /**
   * Codici Weidmüller degli accessori imparati dall'ultimo import da Weidmüller Configurator (per
   * l'esportazione CAEdex): targhetta per codice di morsetto, fermo, targhetta del nome, guida,
   * piastra di chiusura per codice di morsetto
   */
  wmcCodes?: WmcCodes;
  /** Le pagine di lista si creano e si tolgono da sole quando cambia lo schema */
  autoReportPages?: boolean;
  /**
   * Liste con le pagine divise per quadro (come i blocchi di valutazione di EPLAN): un blocco di
   * pagine per ogni luogo con righe, in ordine di luogo (titoli; solo le liste che si dividono)
   */
  reportBlocks?: string[];
  /**
   * Dove vanno i blocchi per quadro: nel gruppo della lista (assente) o subito dopo le pagine di
   * progetto del loro quadro ('panel'; i luoghi senza pagine restano nel gruppo della lista)
   */
  reportBlocksAt?: 'panel';
  /**
   * Pagine generate (indice, legenda, liste, morsettiere, cavi…): ordine dei gruppi, con '@schema' al
   * posto delle pagine di progetto, e prefisso della numerazione di ogni gruppo (es. index → "IND.")
   */
  pageArrangement?: { order?: string[]; prefixes?: Record<string, string> };
  /** Formato dell'indice di revisione (assente = A, B, C…) */
  revisionFormat?: RevisionFormat;
  /** Numero delle pagine inserite in mezzo durante una revisione: con l'indice dopo «-» o «.» (12-B, assente = «-») o con la lettera (12A) */
  revisionPageNo?: '-' | '.' | 'letter';
  /** Impaginazione delle pagine di lista, per titolo della lista */
  reportStyles?: Record<string, ReportStyle>;
  /** Copertina: logo, caratteri, posizioni, righe dei dati, revisioni e firme (assente = di serie) */
  cover?: CoverStyle;
  /** Caratteri e righe delle pagine «schema della morsettiera» (assenti = di serie, vedi STRIP_TEXT) */
  stripStyle?: StripStyle;
  /** Aspetto delle pagine disegnate dai dati: cavi, connettori, schema d'insieme, panoramiche PLC */
  drawingStyles?: Partial<Record<DrawingStyleKind, DrawingStyle>>;
  /** Aspetto delle linee dei cavi sullo schema */
  cableStyle?: CableStyle;
  /** Aspetto di serie dei riquadri di luogo (ogni riquadro può cambiarlo) */
  zoneStyle?: ZoneStyle;
  /** Scala di tutti i testi delle liste (pagine di lista, morsettiere, disegni), in % (assente = 100) */
  listTextScale?: number;
  /** Colore e altezza di ogni tipo di testo sullo schema (assente = predefiniti, vedi TEXT_STYLES) */
  textStyles?: Partial<Record<TextStyleKey, TextStyle>>;
  /**
   * Collegamento automatico come in EPLAN: inserendo o spostando un simbolo, i suoi punti di
   * connessione liberi si collegano ai punti affacciati sulla stessa linea (assente = attivo)
   */
  autoConnect?: boolean;
  /** Testi dei morsetti di morsettiera: orizzontali (assente), paralleli o perpendicolari al morsetto */
  terminalText?: TerminalTextDir;
  /**
   * Testi dei simboli (sigla, righe sotto la sigla, testi del componente, designazioni dei punti di
   * connessione, numero e morsettiera dei morsetti) spostabili anche sullo schema; assente = bloccati
   * nella posizione decisa nell'editor dei simboli, gli spostamenti fatti sullo schema restano salvati
   * ma non si usano
   */
  freeSymbolTexts?: boolean;
  /** Riquadri dei connettori sullo schema (assente = sì) */
  connectorFrames?: boolean;
  /** Fili in alto e in basso in posizione fissa (vedi fixedPos.ts; assente = valori predefiniti) */
  railTop?: RailSetting;
  railBottom?: RailSetting;
  /** Punti I/O PLC su una riga fissa: quota, x del primo posto e passo (assente = posizione libera) */
  /** Riga fissa dei punti I/O PLC: y per gli ingressi, yOut per le uscite (assente = 60) */
  plcRow?: { y: number; yOut?: number; x0: number; step: number };
  /** Aspetto del disegno: spessori delle linee, colori, giunzioni e carattere (assente = predefiniti, vedi lookOf) */
  look?: LookSettings;
  /** Formato del foglio, margini, colonne e righe (assente = A3 orizzontale, 10 colonne, vedi sheetOf) */
  sheet?: SheetSettings;
  /** Parti delle impostazioni bloccate da un profilo aziendale (vedi settingsProfiles.ts) */
  locks?: SettingsLock;
  /** Liste personalizzate, costruite dalle liste del progetto (vedi customLists.ts) */
  customLists?: CustomList[];
}

/** Filtro di una lista personalizzata su una colonna */
export interface CustomListFilter { field: string; op: 'contains' | 'notContains' | 'equals' | 'startsWith' | 'empty' | 'notEmpty'; value?: string }

/** Lista personalizzata: colonne scelte di una lista del progetto (source = titolo), filtri, ordinamento, raggruppamento */
export interface CustomList {
  id: string;
  title: string;
  source: string;
  columns: { field: string; label?: string }[];
  filters?: CustomListFilter[];
  sort?: { field: string; desc?: boolean };
  /** Righe uguali in una sola, con la colonna della quantità */
  groupCount?: boolean;
  countLabel?: string;
}

/**
 * Blocco delle impostazioni messo da un profilo: le parti indicate non si cambiano finché non si sblocca
 * (con la password del profilo, se ne ha una: hash SHA-256 di sale + password). È un blocco organizzativo,
 * non una protezione: il file del progetto resta modificabile.
 */
export interface SettingsLock { profile: string; parts: string[]; salt?: string; pass?: string }

/** Linee con spessore configurabile (mm) */
export type LineWidthKey = 'symbol' | 'wire' | 'wireColored' | 'bus' | 'bundle' | 'frame' | 'frameInner' | 'cloud';
export const LINE_WIDTHS: { key: LineWidthKey; name: string; value: number }[] = [
  { key: 'symbol', name: tn('Simboli'), value: 0.35 },
  { key: 'wire', name: tn('Fili'), value: 0.35 },
  { key: 'wireColored', name: tn('Fili disegnati nel loro colore'), value: 0.45 },
  { key: 'bus', name: tn('Collegamenti di rete (bus)'), value: 0.7 },
  { key: 'bundle', name: tn('Fasci di conduttori'), value: 1.2 },
  { key: 'frame', name: tn('Cornice esterna'), value: 0.5 },
  { key: 'frameInner', name: tn('Divisioni della cornice e del cartiglio'), value: 0.25 },
  { key: 'cloud', name: tn('Nuvolette di revisione'), value: 0.3 },
];

/** Colori configurabili del disegno */
export type LookColorKey = 'ink' | 'paper' | 'cloud' | 'unpaired';
export const LOOK_COLORS: { key: LookColorKey; name: string; value: string }[] = [
  { key: 'ink', name: tn('Linee e testi (inchiostro)'), value: '#1b1f24' },
  { key: 'paper', name: tn('Foglio'), value: '#ffffff' },
  { key: 'cloud', name: tn('Nuvolette di revisione'), value: '#cf222e' },
  { key: 'unpaired', name: tn('Rimandi in attesa del corrispondente «/…»'), value: '#d97706' },
];

/** Carattere dei testi sullo schema: solo i tre che il PDF scrive senza incorporare caratteri */
export type LookFont = 'sans' | 'serif' | 'mono';
export const LOOK_FONTS: [LookFont, string][] = [['sans', tn('senza grazie (Helvetica, Arial)')], ['serif', tn('con grazie (Times)')], ['mono', tn('a spaziatura fissa (Courier)')]];

export interface LookSettings {
  widths?: Partial<Record<LineWidthKey, number>>;
  colors?: Partial<Record<LookColorKey, string>>;
  /** Giunzioni dei fili: pallino pieno (assente) o nessun segno */
  junction?: 'dot' | 'none';
  /** Diametro del pallino di giunzione in mm (assente = 1,4) */
  junctionSize?: number;
  font?: LookFont;
}

/** Aspetto completo con i valori predefiniti al posto di quelli non scelti */
export interface Look { w: Record<LineWidthKey, number>; c: Record<LookColorKey, string>; ink: string; junction: 'dot' | 'none'; junctionR: number; font?: string }
export function lookOf(s: Pick<ProjectSettings, 'look'> | undefined): Look {
  const l = s?.look ?? {};
  const w = Object.fromEntries(LINE_WIDTHS.map(d => [d.key, l.widths?.[d.key] ?? d.value])) as Record<LineWidthKey, number>;
  const c = Object.fromEntries(LOOK_COLORS.map(d => [d.key, l.colors?.[d.key] ?? d.value])) as Record<LookColorKey, string>;
  const font = l.font === 'serif' ? 'serif' : l.font === 'mono' ? 'monospace' : undefined;
  return { w, c, ink: c.ink, junction: l.junction ?? 'dot', junctionR: (l.junctionSize ?? 1.4) / 2, font };
}

/** Fili in posizione fissa: quota del primo, passo tra un filo e l'altro, inizio e fine; up = i successivi vanno verso l'alto */
export interface RailSetting { y: number; step: number; x0: number; x1: number; up?: boolean }

/** Verso dei testi dei morsetti: auto = sempre orizzontali (leggibili senza girare il foglio) */
export type TerminalTextDir = 'auto' | 'parallel' | 'perpendicular';

/** Tipi di testo sullo schema con colore e altezza propri */
export type TextStyleKey = 'wireNo' | 'wireData' | 'bundleTag' | 'bundleTap' | 'linkName' | 'linkRefs' | 'potential' | 'tag' | 'deviceText' | 'pinLabel' | 'xref' | 'terminal' | 'plcText';
export interface TextStyle { color?: string; size?: number }
/** Nome, colore e altezza (mm) predefiniti di ogni tipo di testo; from = se non scelto prende i valori di quel tipo */
export const TEXT_STYLES: { key: TextStyleKey; name: string; color: string; size: number; from?: TextStyleKey }[] = [
  { key: 'wireNo', name: tn('Numeri filo'), color: '#0b5cad', size: 1.8 },
  { key: 'wireData', name: tn('Sezione e colore dei fili (sulla lineetta obliqua)'), color: '#0b5cad', size: 1.8, from: 'wireNo' },
  { key: 'bundleTag', name: tn('Sigla dei bus fili (con i rimandi)'), color: '#0b5cad', size: 1.8, from: 'wireNo' },
  { key: 'bundleTap', name: tn('Nomi dei conduttori dei bus fili'), color: '#0b5cad', size: 1.8, from: 'wireNo' },
  { key: 'linkName', name: tn('Nome dei rimandi'), color: '#1b1f24', size: 2.8 },
  { key: 'linkRefs', name: tn('Pagine dei rimandi'), color: '#1b1f24', size: 1.9 },
  { key: 'potential', name: tn('Nomi dei potenziali'), color: '#1b1f24', size: 2.8 },
  { key: 'tag', name: tn('Sigle dei dispositivi'), color: '#1b1f24', size: 2.6 },
  { key: 'deviceText', name: tn('Descrizione e dati sotto la sigla'), color: '#1b1f24', size: 1.9 },
  { key: 'pinLabel', name: tn('Designazioni dei morsetti dei componenti'), color: '#1b1f24', size: 1.8 },
  { key: 'xref', name: tn('Riferimenti incrociati'), color: '#1b1f24', size: 1.9 },
  { key: 'terminal', name: tn('Numeri e sigle dei morsetti di morsettiera'), color: '#1b1f24', size: 1.9 },
  { key: 'plcText', name: tn('Indirizzo, variabile e commento dei gruppi I/O PLC'), color: '#1b1f24', size: 2.5 },
];

/** Colore e altezza effettivi di ogni tipo di testo del progetto */
export function textStylesOf(settings: Pick<ProjectSettings, 'textStyles'>): Record<TextStyleKey, Required<TextStyle>> {
  const out = {} as Record<TextStyleKey, Required<TextStyle>>;
  // I tipi con from vengono dopo il loro tipo di partenza nell'elenco
  for (const d of TEXT_STYLES) {
    const base = d.from ? out[d.from] : d;
    out[d.key] = { color: settings.textStyles?.[d.key]?.color ?? base.color, size: settings.textStyles?.[d.key]?.size ?? base.size };
  }
  return out;
}

/** Stile del numero di un filo: la sigla dei bus fili ha il suo */
export function wireTextStyle(styles: Record<TextStyleKey, Required<TextStyle>>, w: { bundle?: unknown }) {
  return w.bundle ? styles.bundleTag : styles.wireNo;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  grid: 4,
  tagFormat: '{pagina}{lettera}{n}',
  tagScope: 'page',
  wireFormat: '{pagina}.{n:2}',
  wireScope: 'page',
  wireNumbering: 'fixed',
  wireKeepPotentialNames: true,
  wirePlcNames: false,
  showWireNumbers: true,
  showDeviceTexts: true,
  plcAddressFormat: 'siemens-en',
  showWireData: true,
  drawWireColors: true,
  showRevisionClouds: true,
  contactImage: 'bottom',
  contactImageStyle: 'symbols',
  wireDataTick: true,
};

/**
 * Scheda PLC (CPU o modulo di I/O). Gli indirizzi iniziali sono salvati sulla scheda:
 * aggiungendo schede gli indirizzi di quelle esistenti non cambiano.
 */
export interface PlcCard {
  id: string;
  /** Sigla della scheda senza trattino, es. "1A1" */
  tag: string;
  /** Tipo di scheda (vedi PLC_CARD_TYPES) */
  typeId: string;
  /** Stazione/CPU di appartenenza: gli indirizzi sono assegnati per stazione */
  station: string;
  /**
   * Indirizzo iniziale per tipo di canale. Siemens/IEC: byte per i digitali e indirizzo
   * in byte per gli analogici. Omron: numero di parola (canale CIO).
   */
  start: Partial<Record<IoKind, number>>;
  description?: string;
  partNr?: string;
  manufacturer?: string;
  orderNr?: string;
  /** Scheda creata da un articolo: numero di canali e morsetti propri al posto del tipo generico */
  custom?: { name: string; channels: Partial<Record<IoKind, number>>; terminals?: Record<string, string> };
  /** Nomi e commenti dei canali (anche non disegnati), es. da import della tabella variabili */
  io?: Record<string, { symbol?: string; comment?: string }>;
  /** Posizione nella stazione: rack (telaio) e posto scheda (slot) */
  rack?: number;
  slot?: number;
  /** Master IO-Link: porte con il dispositivo collegato e i byte di dati di processo */
  iolink?: IolinkPort[];
}

export interface IolinkPort {
  port: number;
  /** Sigla del dispositivo IO-Link collegato (es. "3B5") */
  device?: string;
  description?: string;
  /** Byte di dati di processo in ingresso e in uscita */
  inBytes: number;
  outBytes: number;
}

/** Stazione PLC: CPU locale o periferia decentrata (Profinet, EtherCAT…) */
export interface PlcStation {
  name: string;
  kind?: string;
  ip?: string;
  /** Nome del dispositivo Profinet o indirizzo del nodo */
  deviceName?: string;
  /** Formato degli indirizzi di questa stazione (assente = quello del progetto), es. un PLC CODESYS accanto a un Siemens */
  format?: PlcAddressFormat;
  /**
   * Ordine delle aree con digitali e analogici nella stessa area (IEC, TwinCAT): di serie le schede
   * in fila; «analog-first» = prima tutti gli analogici poi i digitali, come l'immagine di processo
   * dei nodi WAGO e di altri accoppiatori CODESYS
   */
  areaOrder?: 'analog-first';
}

/** Ponticello tra morsetti della stessa morsettiera (fisso o a pettine) */
export interface Jumper {
  id: string;
  kind: 'fixed' | 'comb';
  /** Numeri dei morsetti collegati, es. ["1", "2", "3"] o ["1A", "2A"] */
  terminals: string[];
  /** Articolo del ponticello (se manca vale quello predefinito della morsettiera) */
  partNr?: string;
}

/** Accessorio libero di una morsettiera: articolo, quantità e nota (es. «guida TS 35, 1 m») */
export interface StripAccessory { id: string; partNr: string; qty: number; note?: string }

/**
 * Dati di una morsettiera che non stanno sui singoli simboli: articoli predefiniti,
 * accessori, ponticelli, morsetti di riserva (non disegnati) e separatori.
 */
export interface TerminalStripData {
  /** Articolo dei morsetti che non ne hanno uno proprio */
  partNr?: string;
  /** Piastra di chiusura e quante (assente = una per morsettiera) */
  endPlatePartNr?: string;
  endPlateQty?: number;
  /** Fermi terminali e quanti (assente = due per morsettiera) */
  endStopPartNr?: string;
  endStopQty?: number;
  /** Altri accessori della morsettiera (guida, coperchi, porta-targhette, targhette…), con la quantità */
  accessories?: StripAccessory[];
  /** Ponticello predefinito */
  jumperPartNr?: string;
  /** Separatore (piastra di separazione) */
  separatorPartNr?: string;
  jumpers: Jumper[];
  /** Morsetti di riserva, es. ["11", "12"] */
  spares: string[];
  /** Articolo dei morsetti di riserva (numero → articolo); passa al morsetto disegnato con quel numero */
  spareParts?: Record<string, string>;
  /** Separatore dopo il morsetto indicato */
  separators: string[];
}

export type PlcAddressFormat = 'siemens-en' | 'siemens-de' | 'iec' | 'twincat' | 'omron';

export interface Project {
  format: 'elettrocad';
  version: 1;
  /**
   * La descrizione scritta su un contatto ausiliario è solo sua (dalla 1.1.1). Assente nei progetti
   * precedenti: all'apertura la descrizione del dispositivo scritta su un contatto passa alla bobina.
   */
  auxOwnDescription?: true;
  info: ProjectInfo;
  settings: ProjectSettings;
  /** Schede PLC del progetto */
  plc: { cards: PlcCard[]; stations?: PlcStation[] };
  /** Cavi multipolari */
  cables?: Cable[];
  /** Ripartitori e morsettiere di distribuzione per i conduttori di potenza (vedi distributors.ts) */
  distributors?: Distributor[];
  /**
   * Ordine dei collegamenti scelto a mano (vedi wiringOrder.ts): per ogni conduttore i punti di
   * connessione ("idIstanza|idPunto") nell'ordine in cui il cablatore li collega, in catena
   */
  wireOrders?: string[][];
  /** Quadri elettrici (sezioni del progetto) */
  panels?: Panel[];
  /** Reti IP (sottoreti) del piano indirizzi */
  ipNetworks?: IpNetwork[];
  /** Lingue: testi del progetto in italiano con le traduzioni del dizionario */
  languages?: LanguageSettings;
  /** Dizionario di progetto: testo italiano → traduzioni */
  dictionary?: Record<string, TranslationEntry>;
  /** Revisioni congelate del progetto, dalla più vecchia */
  revisions?: Revision[];
  /**
   * Stato del progetto: rilasciato (in sola lettura, l'ultima revisione è emessa) o in revisione
   * (copia di lavoro dopo l'ultima rilasciata); assente = in lavorazione, mai rilasciato
   */
  revisionState?: 'released' | 'review';
  /** Numero di pagina più alto mai usato (dopo il primo rilascio): le pagine nuove vengono dopo, i buchi restano */
  pageNoMax?: number;
  /**
   * Note della revisione aperta, per modifica ("pageId:elementId", "pageId:@page" per la pagina):
   * scritte accanto alla nuvoletta (se non nascoste) e nell'elenco delle modifiche; al rilascio
   * passano nella revisione
   */
  revisionNotes?: Record<string, RevisionNote>;
  /** Calcoli: termico dei quadri e verifica dei cavi (id del cavo → dati) */
  calcs?: { thermal?: ThermalCalc[]; cables?: Record<string, CableCalc> };
  /** Segnalazioni dei controlli verificate e accettate (chiave: vedi issueKey in checks.ts), con il motivo */
  acceptedIssues?: Record<string, AcceptedIssue>;
  /** Cartiglio personalizzato (logo e campi aggiuntivi) */
  titleBlock?: TitleBlock;
  /** Proprietà definite dall'utente (come in EPLAN): definizioni e valori di progetto */
  userProps?: UserPropDef[];
  userPropValues?: Record<string, string>;
  /** Modelli di cartiglio personalizzati */
  titleBlockTemplates?: TitleBlockTemplate[];
  /** Dati dei connettori (chiave: sigla del connettore, es. "X10") */
  connectors?: Record<string, ConnectorData>;
  /** Dati delle morsettiere (chiave: nome della morsettiera, es. "X1.1.2") */
  terminalStrips?: Record<string, TerminalStripData>;
  pages: Page[];
  /**
   * Copie dei simboli usati (dalla libreria personale, o generati come le scatole nere degli
   * articoli): il file resta completo anche su un altro computer
   */
  customSymbols: SymbolDef[];
  /**
   * Simboli tenuti diversi dalla libreria personale per scelta dell'utente: id → impronta della
   * versione della libreria vista in quel momento ("" = simbolo lasciato solo nel progetto).
   * Se la libreria cambia ancora, all'apertura si chiede di nuovo
   */
  symbolKeep?: Record<string, string>;
  /** Articoli usati nel progetto (copia dalla libreria) */
  parts: Part[];
}

/**
 * Revisione: indice, data, autore e descrizione, con l'impronta del progetto in quel momento
 * (una firma per elemento e il suo ingombro) per trovare le modifiche successive.
 */
export interface Revision {
  id: string;
  /** Indice, es. "A", "B" oppure "1", "2" */
  index: string;
  date: string;
  author: string;
  description: string;
  /** Pagine modificate rispetto alla revisione precedente (nomi pagina) */
  pages: string[];
  /** pageId → elementId → [firma, x0, y0, x1, y1] */
  snapshot: Record<string, Record<string, [number, number, number, number, number]>>;
  /** Controllo al rilascio: segnalazioni accettate (verificate) con il motivo, per il rapporto */
  accepted?: { kind: string; msg: string; loc?: string; note?: string }[];
  /** Note delle modifiche di questa revisione (vedi Project.revisionNotes) */
  notes?: Record<string, RevisionNote>;
  /** Copia completa del progetto rilasciato (JSON compresso gzip in base64), senza le copie delle revisioni */
  archive?: string;
}

export interface ReportColumnStyle {
  label?: string; width?: number; hidden?: boolean; align?: 'start' | 'middle' | 'end';
  /** Testi della colonna in grassetto, altezza propria dei caratteri in mm e colore */
  bold?: boolean; size?: number; color?: string;
}

/** Impaginazione di una lista sulle pagine (assente = di serie) */
export interface ReportStyle {
  /** Titolo scritto sulla pagina (assente = nome della lista) */
  title?: string;
  /** Altezze dei caratteri in mm: titolo, intestazione, righe */
  titleSize?: number;
  headSize?: number;
  textSize?: number;
  /** Altezza delle righe in mm (cambia anche quante righe stanno in un foglio) */
  rowH?: number;
  /** Linee tra le colonne e tra le righe (di serie: solo tra le righe) */
  vLines?: boolean;
  hLines?: boolean;
  /** Spessore (mm) e colore delle linee */
  lineWidth?: number;
  lineColor?: string;
  /** Intestazione: altezza in mm, sfondo, colore dei testi, grassetto (assente = sì) */
  headH?: number;
  headFill?: string;
  headColor?: string;
  headBold?: boolean;
  /** Colore dei testi delle righe e sfondo delle righe alterne (assente = nessuno) */
  textColor?: string;
  zebra?: string;
  /** Titolo: allineamento e colore */
  titleAlign?: 'start' | 'middle' | 'end';
  titleColor?: string;
  /** Ordinamento delle righe per una colonna (nome originale della colonna) */
  sort?: { key: string; desc?: boolean };
  /** Nuova pagina quando cambia il valore di questa colonna (nome originale; "" = mai; assente = quella della lista, es. la morsettiera) */
  breakKey?: string;
  /** Ordine delle colonne (nomi originali); quelle non elencate vanno in fondo */
  order?: string[];
  /** Dati di ogni colonna, per nome originale: intestazione, larghezza in mm (assente = automatica), nascosta, allineamento */
  columns?: Record<string, ReportColumnStyle>;
}

/**
 * Riga dei dati della copertina. key: campo del progetto (customer, drawingNr…), «address»,
 * «tb:<n>» campo n del cartiglio, «up:<id>» proprietà di progetto, «free:<id>» riga libera.
 */
export interface CoverRow { key: string; label?: string; value?: string; hidden?: boolean }

/** Copertina personalizzata: misure in mm, y dall'alto del foglio */
export interface CoverStyle {
  logo?: { hidden?: boolean; w?: number; h?: number; y?: number };
  titleSize?: number;
  titleY?: number;
  descSize?: number;
  labelSize?: number;
  valueSize?: number;
  /** y della prima riga dei dati e distanza tra le righe */
  rowsY?: number;
  rowGap?: number;
  /** Righe dei dati nell'ordine scelto; quelle disponibili non elencate vanno in fondo */
  rows?: CoverRow[];
  /** Revisioni elencate (0 = nessuna tabella) */
  revisions?: number;
  /** Intestazioni dei riquadri delle firme ([] = nessun riquadro) */
  signatures?: string[];
}

/** Pagine «schema della morsettiera»: altezze dei caratteri e delle righe in mm */
export type DrawingStyleKind = 'cable' | 'connector' | 'system' | 'plc';
/** Testi in mm (vuoto = di serie) e colonne nascoste (chiavi, vedi model/drawingStyle) */
export interface DrawingStyle {
  titleSize?: number;
  textSize?: number;
  tableSize?: number;
  rowH?: number;
  hide?: string[];
  /** Larghezze delle colonne della tabella in mm (assente = di serie) */
  widths?: Record<string, number>;
}

export interface StripStyle {
  titleSize?: number;
  subSize?: number;
  headSize?: number;
  textSize?: number;
  noSize?: number;
  /** Altezza delle righe (cambia anche quanti morsetti stanno in un foglio) */
  rowH?: number;
  /** Colonne nascoste e larghezze in mm (ext, extWire, intWire, int, loc) */
  hide?: string[];
  widths?: Record<string, number>;
}

export interface AcceptedIssue { note?: string; date: string; author?: string }

export interface RevisionNote { text: string; hidden?: boolean }

/** Formato dell'indice di revisione: A, B, C… / 0, 1, 2… / 00, 01, 02… / R00, R01… */
export type RevisionFormat = 'A' | '0' | '00' | 'R00';

/** Cartiglio: logo (data URL) e campi aggiuntivi con etichetta e valore */
export interface TitleBlock {
  /** Modello di cartiglio del progetto (vedi titleBlocks.ts); vuoto = standard */
  templateId?: string;
  logo?: string;
  fields?: { label: string; value: string }[];
  /** Indirizzo o seconda riga della ditta */
  address?: string;
}

/**
 * Modello di cartiglio: grafica nell'area sotto la cornice (390 × 35 mm, origine in alto a
 * sinistra). I testi possono contenere segnaposto come {progetto}, {titolo}, {pagina}.
 */
export interface TitleBlockTemplate {
  id: string;
  name: string;
  prims: Prim[];
  /** Modello incluso nel programma (non modificabile: si salva una copia) */
  builtin?: boolean;
}

/** Formati del foglio (mm, orizzontale) */
export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1';
export const SHEET_SIZES: Record<SheetSize, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };

/** Foglio del progetto: formato, verso, margini della cornice, colonne e righe (assente = A3 orizzontale, 10 colonne) */
export interface SheetSettings {
  size?: SheetSize;
  portrait?: boolean;
  /** Margini della cornice in mm (a sinistra la rilegatura); in basso c'è sempre il cartiglio */
  left?: number;
  top?: number;
  right?: number;
  columns?: number;
  /** Righe A, B, C… sui lati della cornice (assente o 0 = nessuna) */
  rows?: number;
  /** Riferimenti incrociati con la riga, es. 200.3B */
  xrefRows?: boolean;
}

export const SHEET_DEFAULT = { size: 'A3' as SheetSize, left: 20, top: 10, right: 10, columns: 10 };
/** Altezza della fascia in basso: cartiglio (35 mm) con 5 mm sotto e 5 mm sopra per i numeri di colonna */
const TB_BAND = 45;

/**
 * Misure del foglio in uso, in mm. Sono valori vivi: applySheet le aggiorna con le impostazioni del
 * progetto aperto (store.ts) e chi le importa legge sempre quelle attuali. Di serie A3 orizzontale,
 * griglia 4 mm come EPLAN.
 */
export let PAGE_W = 420;
export let PAGE_H = 297;
export const GRID = 4;
export const FRAME = { left: 20, top: 10, right: 410, bottom: 252 };
export let COLUMNS = 10;
export let ROWS = 0;
export let XREF_ROWS = false;
export let TITLE_TOP = 257;

/** Foglio completo con i valori predefiniti al posto di quelli non scelti */
export function sheetOf(s: Pick<ProjectSettings, 'sheet'> | undefined) {
  const sh = s?.sheet ?? {};
  const [a, b] = SHEET_SIZES[sh.size ?? SHEET_DEFAULT.size] ?? SHEET_SIZES.A3;
  const [w, h] = sh.portrait ? [b, a] : [a, b];
  return {
    w, h, size: sh.size ?? SHEET_DEFAULT.size, portrait: !!sh.portrait,
    left: sh.left ?? SHEET_DEFAULT.left, top: sh.top ?? SHEET_DEFAULT.top, right: sh.right ?? SHEET_DEFAULT.right,
    columns: Math.max(1, Math.min(40, Math.round(sh.columns ?? SHEET_DEFAULT.columns))), rows: Math.max(0, Math.min(26, Math.round(sh.rows ?? 0))),
    xrefRows: !!sh.xrefRows && (sh.rows ?? 0) > 0,
  };
}

/** Rende attuale il foglio delle impostazioni indicate (assenti = A3 orizzontale) */
export function applySheet(s: Pick<ProjectSettings, 'sheet'> | undefined): void {
  const sh = sheetOf(s);
  PAGE_W = sh.w; PAGE_H = sh.h;
  COLUMNS = sh.columns; ROWS = sh.rows; XREF_ROWS = sh.xrefRows;
  FRAME.left = sh.left; FRAME.top = sh.top; FRAME.right = sh.w - sh.right; FRAME.bottom = sh.h - TB_BAND;
  TITLE_TOP = sh.h - 40;
}

export function columnOf(x: number): number {
  const w = (FRAME.right - FRAME.left) / COLUMNS;
  return Math.min(COLUMNS, Math.max(1, Math.floor((x - FRAME.left) / w) + 1));
}

/** Lettera della riga del foglio alla quota y (vuota se il foglio non ha righe) */
export function rowOf(y: number): string {
  if (!ROWS) return '';
  const h = (FRAME.bottom - FRAME.top) / ROWS;
  return String.fromCharCode(65 + Math.min(ROWS - 1, Math.max(0, Math.floor((y - FRAME.top) / h))));
}

/** Colori dei conduttori secondo IEC 60757 (sigla → colore di disegno) */
export const WIRE_COLORS: Record<string, { name: string; hex: string }> = {
  BK: { name: 'nero', hex: '#1b1f24' },
  BN: { name: 'marrone', hex: '#8b4a1c' },
  RD: { name: 'rosso', hex: '#d1242f' },
  OG: { name: 'arancione', hex: '#e8730c' },
  YE: { name: 'giallo', hex: '#d4a72c' },
  GN: { name: 'verde', hex: '#1a7f37' },
  BU: { name: 'blu', hex: '#0969da' },
  DBU: { name: 'blu scuro', hex: '#0a2f8c' },
  LBU: { name: 'azzurro', hex: '#54aeff' },
  VT: { name: 'viola', hex: '#8250df' },
  GY: { name: 'grigio', hex: '#6e7781' },
  WH: { name: 'bianco', hex: '#aeb6bf' },
  PK: { name: 'rosa', hex: '#e85aad' },
  TQ: { name: 'turchese', hex: '#0fa3a3' },
  GNYE: { name: 'giallo-verde', hex: '#1a7f37' },
};

export const WIRE_SECTIONS = ['0,25', '0,5', '0,75', '1', '1,5', '2,5', '4', '6', '10', '16', '25', '35'];
