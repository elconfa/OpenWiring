// Formato testo delle pagine (OpenWiring testo v1): una riga per elemento, leggibile e
// modificabile da una persona o da un assistente di intelligenza artificiale. I collegamenti
// si possono scrivere per sigla e punto di connessione ("collega -2S1:14 -2K1:A1"): il
// programma calcola il percorso del filo.
import { isDeletedSymbol } from './symbolSync';
import type { Project, Page, Element, SymbolInstance, Wire, SymbolDef, PinDir, PinDef, Prim, Pt, Cable, PageType } from './types';
import { PAGE_W, PAGE_H } from './types';
import { isRailEnd } from './checks';
import { getSymbol, pinsWorld, samePt, onSegmentInterior, uid, pinDirWorld } from './geometry';
import { effectivePinLabels, allPlaced } from './devices';
import { NO_PARTNER, isIncomingLink, pairLinks } from './links';
import { distOf, distSymbolId, newDistributor, parseOuts, syncDistSymbols } from './distributors';
import { computeNetlist } from './netlist';
import { nextTagFor } from './numbering';
import { BUILTIN_SYMBOLS } from './symbols';
import { allowedRots } from './rotations';
import { applyWireDefs } from './wireDefs';
import { connectorType } from './connectorTypes';
import { defaultConductors } from './cables';
import { PLC_CARD_TYPES, newCard, cardType, assignStart } from './plc';
import type { ProjectInfo, IoKind, WireDef, CableLine, CableLineShow, CableLabelPos, TextItem, TerminalTextDir, TerminalStripData, Jumper, Distributor, ItemLook, Zone } from './types';

const TYPE_NAMES: Partial<Record<PageType, string>> = { multiline: 'schema', singleline: 'unifilare', network: 'rete' };
const TYPE_OF: Record<string, PageType> = { schema: 'multiline', multifilare: 'multiline', unifilare: 'singleline', rete: 'network' };
/** Pagine generate dal programma: si esporta solo l'intestazione */
const GENERATED: PageType[] = ['cover', 'plc', 'strip', 'layout', 'report', 'notes', 'cable', 'connector', 'system'];

const SYMBOL_ATTRS: [string, keyof SymbolInstance][] = [
  ['descr', 'description'], ['dati', 'techData'], ['articolo', 'partNr'], ['costruttore', 'manufacturer'], ['tipo', 'typeNr'],
  ['ordine', 'orderNr'], ['note', 'note'], ['funzione', 'func'], ['luogo', 'loc'], ['canale', 'plcChannel'], ['variabile', 'plcSymbol'],
  ['commento', 'plcComment'], ['ip', 'ip'], ['indirizzo', 'netAddress'],
];

const ROLE_NAMES: Record<string, string> = {
  main: 'principale (bobina)', aux: 'contatto', single: 'dispositivo', potential: 'potenziale', link: 'rimando', terminal: 'morsetto',
  pin: 'pin di connettore', plc: 'punto I/O PLC', netnode: 'nodo di rete', oneline: 'unifilare',
};
const DIR_ARROW: Record<PinDir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export const TEXT_HELP = `# OpenWiring testo v1 — pagine di schema in formato testo
# Una riga per elemento; "#" inizia un commento. Coordinate in mm sul foglio A3 (${PAGE_W}×${PAGE_H}),
# origine in alto a sinistra, y verso il basso, griglia di 4 mm; area di disegno x 20…410, y 10…252.
#
# Dati di progetto (righe facoltative, prima delle pagine; aggiornano o creano i dati con quel nome):
# progetto [nome="…"] [descr="…"] [ditta="…"] [cliente="…"] [disegno=…] [autore=…] [rev=…] [data=AAAA-MM-GG]
# luogo +<codice> "<nome>" [tipo="Quadro elettrico|Pulsantiera|Bordo macchina|Cassetta di derivazione|Campo|Altro"]
# cavo -<sigla> [tipo=FG16OR16] [sezione=1,5] [conduttori="BN BK GY GNYE"] [lunghezza=15] [da=…] [a=…]
#     [descr="…"] [articolo=…] [marcatura=numeri|colori] [pezzi=si|no] [pindi=-510NG1] [schermato] [coppie]
#     pindi: dispositivo con il connettore integrato, il filo dal suo morsetto n prende il conduttore n.
# morsettiera -<sigla> [articolo=…] [fermo=… fermi=2] [piastra=… piastre=1] [ponticello=…] [separatore=…]
#     [riserve="11 12"] [articoliriserve="11=WDU 2.5"] [separatori="3 7"] [ponticelli="pettine:1,2,3 | fisso:4,5:WQV 2.5/2"]
#     [accessori="[{\\"partNr\\":\\"TS35\\",\\"qty\\":1,\\"note\\":\\"guida 1 m\\"}]"]   (JSON tra virgolette, con \\" dentro)
# connettore -<sigla> [tipo=ilme-cne-16] [genere=M|F|MF] [pin=16] [descr="…"] [custodia="…"]
#     (tipi: ilme-ck-03…12, ilme-cne-06/10/16/24, ilme-cse-…, ilme-cqe-10/18/32/46, ilme-cdd-24/42/72/108;
#     i pin sullo schema sono simboli conn_male / conn_female / conn_pair con sigla -X10:1 … -X10:PE)
# simbolodef <id> "<nome>" lettera=U [ruolo=dispositivo|bobina|contatto] [categoria="…"]
#     pin="L1:0,0 L2:8,0 L3:16,0 U:0,24 V:8,24 W:16,24"   (nome:x,y relativi; y=0 in alto, il più in basso = sotto)
#     Crea un simbolo a scatola con i punti di connessione indicati, per i componenti che non
#     sono nel catalogo (inverter, resistenze, sensori a 2 fili…). Si usa poi con "simbolo <id> …".
# ripartitore -<sigla> tipo=barra|morsetti|terra gruppi="L1:35:6x4,5 | L2:35:6x4,5" [descr="…"] [articolo=…]
#     Ripartitore (es. Cembre DB100-6/4), morsettiera di distribuzione o barra di terra (tipo=terra,
#     es. gruppi="PE:35:10x16", un foro per uscita): per ogni gruppo (polo o
#     morsetto di ingresso) nome:sezione max ingresso:sezioni max delle uscite (4,5;4,5;6 oppure 6x4,5,
#     «-» se non indicata). Sullo schema ogni gruppo è il simbolo rip:<sigla>:<gruppo> (es. rip:Q50:L1),
#     ingresso "in" in alto, uscite /o1, /o2… in basso ogni 8 mm (nomi L1.1, L1.2…).
# scheda -<sigla> tipo=<tipo di scheda PLC> [stazione=PLC1] [descr="…"] [articolo=…]
#     oppure tipo=custom nome="…" canali="DI=16;DO=16;AI=0;AO=0"   (tipi: vedi il catalogo)
#
# pagina <numero> "<titolo>" [tipo=schema|unifilare|rete] [luogo=<codice>]
#     Importando, una pagina con lo stesso numero viene sostituita per intero; un numero nuovo
#     crea una pagina. Le pagine non presenti nel testo restano come sono.
# simbolo <id> <sigla> @x,y [rot=0|90|180|270] [specchio] [descr="…"] [dati="…"] [articolo=…]
#     [costruttore=…] [tipo=…] [ordine=…] [note="…"] [luogo=…] [funzione=…] [canale=DI0]
#     [variabile=…] [commento="…"] [ip=…] [indirizzo=…] [pin="1=13;2=14"] [numerofilo=passa|cambia]
#     [testi=si|no] [immaginecontatti=sotto|simbolo] [versotesti=auto|parallelo|perpendicolare]
#     [articoli=JSON] [proprieta=JSON] [mostra=JSON] [postesti=JSON] [interfacce=JSON]   (articoli aggiuntivi, proprietà,
#     testi mostrati/nascosti e testi spostati: scritti dal programma, da lasciare come sono se non servono)
#     <id> è l'identificativo del simbolo (vedi catalogo); <sigla> con il trattino: -2K1, -X1:3;
#     "-?" = sigla nuova automatica; potenziali e rimandi senza trattino: L1, PE, +24V, 0V.
#     I contatti con la stessa sigla della bobina ne sono i contatti (13-14, 21-22… automatici).
#     numerofilo: il numero filo attraversa l'elemento senza cambiare (predefinito per i morsetti).
#     Rimandi (link = partenza, link_in = arrivo): con=<pagina> abbina il rimando a quello con lo
#     stesso nome e verso opposto su quella pagina (con=<pagina>@x,y se ce n'è più d'uno); con=- lo
#     lascia senza corrispondente (la partenza finisce lì, «//»); senza con= si abbina per nome.
#     stella (solo partenza): collegata a tutti gli arrivi con lo stesso nome.
#     coppia=<pagina>@x,y: il simbolo è solo la rappresentazione del contatto con la stessa sigla in
#     quel punto (riferimento a coppie, es. ausiliario del salvamotore accanto ai poli): non si collega.
# filo x,y x,y [x,y…] [sezione=1,5] [colore=BU] [n=2.01] [bus=Profinet] [cavo=5W1]
#     [tipocavo="…"] [lunghezza=10] [articolocavo=…] [poli=3] [testo="3/N/PE ~400 V"]
#     [busfili=<nome>|_] [articolobus=<articolo cavo>] [cond1=L1] [cond2=L1]   (bus di conduttori, modalità BUS: nome del bus, «_» senza
#     nome; cond1/cond2 = conduttore del bus a cui si collega il primo/l'ultimo estremo del filo)
#     [linea=dash|dashdot|dot] [spessore=0,5]   (tipo di linea e spessore in mm sullo schema)
#     [tipo=H07V-K] [hnumero=2,5] [colorenumero=#c00000] [posnumeri=JSON] [mostra=JSON] [proprieta=JSON]
#     [conduttore=W1:BN] [fissato=W1:3]   (conduttore del cavo -W1 sul filo: scelto a mano, oppure fissato
#     dalla numerazione automatica perché non cambi; più cavi separati da «;»)
#     [nodo1=sinistra|destra|su|giu] [nodo2=…]   (nodo a T con verso sul primo/ultimo estremo del filo: il
#     braccio della linea passante a cui si collega il gambo della T nella sequenza di cablaggio)
#     Segmenti orizzontali o verticali; un filo collega i punti di connessione su cui inizia o
#     finisce, e un altro filo se termina su un suo vertice o in mezzo a un suo segmento (a T).
# ordine <estremo> <estremo> [<estremo>…]   (ordine dei collegamenti di un conduttore scelto a mano, in
#     catena: es. ordine -Q50:L1.1 -1K1:1 -1K2:1; estremi come in collega, anche su altre pagine)
# collega <estremo> <estremo> [via x,y …] [stessi attributi di filo]
#     Estremo: -2K1:A1 (sigla:punto di connessione), -X1:3/2 (sigla/numero del pin del simbolo,
#     es. /1 sopra e /2 sotto per i morsetti), L1 o +24V (potenziale/rimando), oppure x,y.
#     Se il punto non è indicato si usa quello più vicino all'altro estremo. Il percorso è a L.
# testo @x,y [h=3] [l=60] [rot=90] [allinea=sinistra|centro|destra] "<testo>"   (l: larghezza del riquadro in mm, a capo da solo)
# riquadro +<luogo> @x,y <larghezza>x<altezza> [scritta=dx,dy] [solosigla[=no]] [aspetto="linea=#c00;spessore=0,3;h=2,8;testo=#000"]   (riquadro di luogo; scritta rispetto all'angolo in alto a sinistra)
# lineacavo -<sigla> x,y x,y [principale] [testi="sigla=si;tipo=no;sezione=no;descrizione=no;conduttori=si"]
#     [posizione=prima|dopo|sopra-inizio|sopra-fine|sotto-inizio|sotto-fine] [spostamento=x,y]
#     [schermo=fine|inizio|nessuno] [altezzaschermo=4,4] [nomi=orizzontali|verticali] [aspetto="linea=#c00;spessore=0,3;h=2,6;testo=#000"]
#     Linea di definizione del cavo attraverso i fili. principale: porta tipo e sezione (le altre linee dello
#     stesso cavo di serie solo la sigla); schermo: dove esce il collegamento dello schermo (cavi schermati).
# sezionefili x,y x,y sezione=2,5 [scritta=x,y]   (riga che attraversa i fili: la sezione va a tutti; la scritta è
#     legata con un righino alla fine della riga, il secondo punto)
`;

const num = (v: number) => String(Math.round(v * 100) / 100);
/** Dati strutturati (posizioni dei testi, proprietà, articoli aggiuntivi…) scritti come JSON tra virgolette */
const json = (v: unknown) => q(JSON.stringify(v));
const parseJson = <T,>(v: string): T | undefined => { try { return JSON.parse(v) as T; } catch { return undefined; } };
const has = (o?: object) => !!o && Object.keys(o).length > 0;
/** Coppie chiave=valore separate da «;» (es. "sigla=si;tipo=no") */
const pairs = (v: string) => v.split(';').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf('='); return i < 0 ? [x, ''] as const : [x.slice(0, i).trim(), x.slice(i + 1).trim()] as const; });
/** Aspetto di un riquadro o di una linea di cavo: aspetto="linea=#c00;spessore=0,35;h=3;testo=#000" */
const LOOK_TEXT = { lineColor: 'linea', lineWidth: 'spessore', textSize: 'h', textColor: 'testo' } as const;
const lookText = (l?: ItemLook) => {
  const a = l ? (Object.keys(LOOK_TEXT) as (keyof ItemLook)[]).filter(k => l[k] !== undefined).map(k => `${LOOK_TEXT[k]}=${typeof l[k] === 'number' ? num(l[k] as number) : l[k]}`) : [];
  return a.length ? ` aspetto=${q(a.join(';'))}` : '';
};
function parseLook(v: string, err: (m: string) => void): ItemLook | undefined {
  const out: ItemLook = {};
  for (const [n, val] of pairs(v)) {
    const k = (Object.keys(LOOK_TEXT) as (keyof ItemLook)[]).find(x => LOOK_TEXT[x] === n.toLowerCase());
    if (!k) { err(`aspetto: "${n}" sconosciuto (linea, spessore, h, testo)`); continue; }
    if (k === 'lineWidth' || k === 'textSize') { const x = parseFloat(val.replace(',', '.')); if (x > 0) out[k] = x; else err(`aspetto: ${n} in mm`); }
    else out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}
const yes = (v: string) => /^(si|sì|yes|1|true)$/i.test(v);

/** Nomi nel testo delle opzioni delle linee dei cavi */
const CABLE_SHOW_TEXT: Record<keyof CableLineShow, string> = { tag: 'sigla', type: 'tipo', section: 'sezione', description: 'descrizione', conductors: 'conduttori' };
const CABLE_POS_TEXT: Record<CableLabelPos, string> = { before: 'prima', after: 'dopo', aboveStart: 'sopra-inizio', aboveEnd: 'sopra-fine', belowStart: 'sotto-inizio', belowEnd: 'sotto-fine' };
const SHIELD_TEXT: Record<NonNullable<CableLine['shieldGround']>, string> = { end: 'fine', start: 'inizio', none: 'nessuno' };
const ALIGN_TEXT: Record<NonNullable<TextItem['align']>, string> = { start: 'sinistra', middle: 'centro', end: 'destra' };
const TERM_TEXT: Record<TerminalTextDir, string> = { auto: 'auto', parallel: 'parallelo', perpendicular: 'perpendicolare' };
const DIST_TEXT: Record<Distributor['kind'], string> = { bar: 'barra', terminals: 'morsetti', earth: 'terra' };
const NODE_TEXT: Record<PinDir, string> = { left: 'sinistra', right: 'destra', up: 'su', down: 'giu' };
const lookup = <K extends string>(m: Record<K, string>, v: string): K | undefined => (Object.entries(m) as [K, string][]).find(([, t]) => t === v.toLowerCase())?.[0];
const pt = (p: Pt) => `${num(p.x)},${num(p.y)}`;
// Le righe a capo dei testi si scrivono \n, così ogni elemento resta su una riga
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const bare = (s: string) => (/^[^\s"=#@]+$/.test(s) ? s : q(s));

/** Sigla come si scrive nel testo: "-2K1" per i dispositivi, il nome per potenziali e rimandi */
function tagToken(inst: SymbolInstance, sym: SymbolDef): string {
  if (sym.role === 'potential' || sym.role === 'link') return inst.tag ? bare(inst.tag) : '""';
  return inst.tag ? bare(`-${inst.tag}`) : '""';
}

const rotateDir = pinDirWorld;

interface PinAt { inst: SymbolInstance; sym: SymbolDef; pinId: string; label: string; p: Pt; dir: PinDir }

function pagePins(project: Project, page: Page, labels = effectivePinLabels(project)): PinAt[] {
  const out: PinAt[] = [];
  for (const e of page.elements) {
    if (e.kind !== 'symbol') continue;
    const sym = getSymbol(e.symbolId, project);
    if (!sym) continue;
    for (const w of pinsWorld(e, sym)) out.push({ inst: e, sym, pinId: w.pin.id, label: labels.get(e.id)?.[w.pin.id] ?? w.pin.label, p: { x: w.x, y: w.y }, dir: rotateDir(w.pin.dir, e) });
  }
  return out;
}

/** Nome di un punto di connessione nel testo: -2K1:A1, -X1:3/2, L1 */
function pinRef(x: PinAt): string {
  const t = tagToken(x.inst, x.sym);
  if (x.sym.role === 'potential' || x.sym.role === 'link') return t;
  if (x.sym.role === 'terminal' || x.sym.role === 'pin') return `${t}/${x.pinId}`;
  return x.label ? `${t}:${x.label}` : `${t}/${x.pinId}`;
}

type Placed = ReturnType<typeof allPlaced>[number];

/** Righe «ordine» degli ordini dei collegamenti scelti a mano, sulla pagina del loro primo punto */
function orderLines(project: Project, labels: Map<string, Record<string, string>>): Map<string, string[]> {
  const placed = new Map(allPlaced(project).map(e => [e.inst.id, e]));
  const out = new Map<string, string[]>();
  for (const o of project.wireOrders ?? []) {
    const refs: string[] = [];
    let pageId: string | undefined;
    for (const k of o) {
      const [id, pinId] = k.split('|');
      const el = placed.get(id), pin = el?.sym.pins.find(x => x.id === pinId);
      if (!el || !pin) continue;
      pageId ??= el.page.id;
      refs.push(pinRef({ inst: el.inst, sym: el.sym, pinId, label: labels.get(id)?.[pinId] ?? pin.label, p: { x: 0, y: 0 }, dir: 'up' }));
    }
    if (refs.length >= 2 && pageId) (out.get(pageId) ?? out.set(pageId, []).get(pageId)!).push(`  ordine ${refs.join(' ')}`);
  }
  return out;
}

/** Punto di connessione di una riga «ordine» (-X1:3/2, -2K1:A1, -X1:3) → "idIstanza|idPunto" */
function orderKey(ref: string, placed: Placed[], labels: Map<string, Record<string, string>>): string | { msg: string } {
  const m = /^(.*?)(?:\/([^/]+))?$/.exec(ref.replace(/^-/, ''))!;
  const main = m[1], pinId = m[2];
  const whole = placed.find(e => e.inst.tag === main && e.sym.role !== 'potential' && e.sym.role !== 'link');
  if (whole) {
    const pin = pinId ? whole.sym.pins.find(x => x.id === pinId) : whole.sym.pins[0];
    return pin ? `${whole.inst.id}|${pin.id}` : { msg: `${ref}: il simbolo non ha il punto /${pinId}` };
  }
  const i = main.lastIndexOf(':');
  if (i > 0) {
    const tag = main.slice(0, i), lab = main.slice(i + 1);
    const c = placed.filter(e => e.inst.tag === tag).flatMap(e => e.sym.pins.filter(x => (labels.get(e.inst.id)?.[x.id] ?? x.label) === lab || x.id === lab).filter(x => !pinId || x.id === pinId).map(x => `${e.inst.id}|${x.id}`));
    if (c.length) return c[0];
  }
  return { msg: `ordine: ${ref} non trovato (scrivi -sigla:punto o -sigla/pin)` };
}

export interface TextExportOptions {
  /** Pagine da esportare (id); tutte se manca */
  pageIds?: string[];
  /** Catalogo dei simboli disponibili in coda, per chi scrive pagine nuove */
  catalog?: boolean;
  /** Simboli della libreria personale da aggiungere al catalogo */
  librarySymbols?: SymbolDef[];
  /** Righe progetto/luogo/cavo/scheda in testa (di serie solo esportando tutte le pagine) */
  projectData?: boolean;
}

const INFO_KEYS: [string, keyof ProjectInfo][] = [['nome', 'name'], ['descr', 'description'], ['ditta', 'company'], ['cliente', 'customer'], ['disegno', 'drawingNr'], ['autore', 'author'], ['rev', 'revision'], ['data', 'date']];

/** Riga di una morsettiera: articoli, fermi, piastre, accessori, riserve, separatori e ponticelli (undefined se non ha dati) */
function stripLine(strip: string, d: TerminalStripData): string | undefined {
  const a = [`morsettiera -${bare(strip)}`];
  if (d.partNr) a.push(`articolo=${bare(d.partNr)}`);
  if (d.endStopPartNr) a.push(`fermo=${bare(d.endStopPartNr)}`);
  if (d.endStopQty !== undefined) a.push(`fermi=${d.endStopQty}`);
  if (d.endPlatePartNr) a.push(`piastra=${bare(d.endPlatePartNr)}`);
  if (d.endPlateQty !== undefined) a.push(`piastre=${d.endPlateQty}`);
  if (d.jumperPartNr) a.push(`ponticello=${bare(d.jumperPartNr)}`);
  if (d.separatorPartNr) a.push(`separatore=${bare(d.separatorPartNr)}`);
  if (d.spares.length) a.push(`riserve=${q(d.spares.join(' '))}`);
  if (has(d.spareParts)) a.push(`articoliriserve=${q(Object.entries(d.spareParts!).map(([k, v]) => `${k}=${v}`).join(';'))}`);
  if (d.separators.length) a.push(`separatori=${q(d.separators.join(' '))}`);
  if (d.jumpers.length) a.push(`ponticelli=${q(d.jumpers.map(j => `${j.kind === 'comb' ? 'pettine' : 'fisso'}:${j.terminals.join(',')}${j.partNr ? `:${j.partNr}` : ''}`).join(' | '))}`);
  if (d.accessories?.length) a.push(`accessori=${json(d.accessories.map(({ id: _id, ...x }) => x))}`);
  return a.length > 1 ? a.join(' ') : undefined;
}

/** Righe dei dati di progetto: intestazione, luoghi, cavi e schede PLC */
function projectSection(project: Project): string[] {
  const out: string[] = [];
  out.push(`progetto ${INFO_KEYS.filter(([, k]) => project.info[k]).map(([n, k]) => `${n}=${bare(project.info[k])}`).join(' ')}`.trimEnd());
  for (const sd of project.customSymbols) if (sd.textDef) out.push(sd.textDef);
  for (const p of project.panels ?? []) out.push(`luogo +${bare(p.code)} ${q(p.name)}${p.kind ? ` tipo=${bare(p.kind)}` : ''}`);
  for (const [conn, d] of Object.entries(project.connectors ?? {})) {
    const a = [`connettore -${bare(conn)}`];
    if (d.type) a.push(`tipo=${d.type}`);
    if (d.gender) a.push(`genere=${d.gender}`);
    if (d.pins) a.push(`pin=${d.pins}`);
    if (d.description) a.push(`descr=${bare(d.description)}`);
    if (d.housing) a.push(`custodia=${bare(d.housing)}`);
    if (a.length > 1) out.push(a.join(' '));
  }
  for (const c of project.cables ?? []) {
    const a = [`cavo -${bare(c.tag)}`];
    if (c.type) a.push(`tipo=${bare(c.type)}`);
    if (c.cross) a.push(`sezione=${bare(c.cross)}`);
    if (c.conductors.length) a.push(`conduttori=${q(c.conductors.join(' '))}`);
    if (c.length !== undefined) a.push(`lunghezza=${num(c.length)}`);
    if (c.from) a.push(`da=${bare(c.from)}`);
    if (c.to) a.push(`a=${bare(c.to)}`);
    if (c.description) a.push(`descr=${bare(c.description)}`);
    if (c.partNr) a.push(`articolo=${bare(c.partNr)}`);
    if (c.marking) a.push(`marcatura=${c.marking === 'colors' ? 'colori' : 'numeri'}`);
    if (c.pieces !== undefined) a.push(`pezzi=${c.pieces ? 'si' : 'no'}`);
    if (c.pinsOf) a.push(`pindi=-${bare(c.pinsOf)}`);
    if (c.shield) a.push('schermato');
    if (c.pairs) a.push('coppie');
    out.push(a.join(' '));
  }
  for (const [strip, d] of Object.entries(project.terminalStrips ?? {})) {
    const line = stripLine(strip, d);
    if (line) out.push(line);
  }
  for (const d of project.distributors ?? []) {
    const a = [`ripartitore -${bare(d.tag)}`, `tipo=${DIST_TEXT[d.kind]}`, `gruppi=${q(d.groups.map(g => `${g.name}:${g.inMax ?? ''}:${g.outs.map(o => o || '-').join(';')}`).join(' | '))}`];
    if (d.description) a.push(`descr=${bare(d.description)}`);
    if (d.partNr) a.push(`articolo=${bare(d.partNr)}`);
    out.push(a.join(' '));
  }
  for (const c of project.plc.cards) {
    const a = [`scheda -${bare(c.tag)}`, `tipo=${bare(c.custom ? 'custom' : c.typeId)}`];
    if (c.custom) { a.push(`nome=${bare(c.custom.name)}`, `canali=${q(Object.entries(c.custom.channels).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(';'))}`); }
    a.push(`stazione=${bare(c.station)}`);
    if (c.description) a.push(`descr=${bare(c.description)}`);
    if (c.partNr) a.push(`articolo=${bare(c.partNr)}`);
    out.push(`${a.join(' ')}   # ${cardType(c).name}`);
  }
  return out;
}

/** Esporta le pagine nel formato testo, con commenti che descrivono punti di connessione e collegamenti */
export function pagesToText(project: Project, opts: TextExportOptions = {}): string {
  const labels = effectivePinLabels(project);
  const nl = computeNetlist(project);
  const panels = new Map((project.panels ?? []).map(p => [p.id, p]));
  const cables = new Map((project.cables ?? []).map(c => [c.id, c]));
  // Abbinamento scritto dei rimandi: pagina del corrispondente (con il punto se sulla pagina ce n'è
  // più d'uno con lo stesso nome e verso); «-» se lasciato senza per scelta
  const linkEls = allPlaced(project).filter(x => x.sym.role === 'link');
  // Contatto vero di una rappresentazione: pagina e punto
  const pairReal = (id: string) => { for (const page of project.pages) { const inst = page.elements.find(x => x.id === id); if (inst?.kind === 'symbol') return { page, inst }; } return undefined; };
  const linkWith = (e: SymbolInstance): string | undefined => {
    if (e.linkTo === NO_PARTNER) return '-';
    const o = e.linkTo ? linkEls.find(x => x.inst.id === e.linkTo) : undefined;
    if (!o || o.inst.linkTo !== e.id) return undefined;
    const twins = linkEls.filter(x => x.page === o.page && x.inst.tag === o.inst.tag && x.inst.symbolId === o.inst.symbolId);
    return `${bare(o.page.name)}${twins.length > 1 ? `@${pt(o.inst)}` : ''}`;
  };
  const orders = orderLines(project, labels);
  const out: string[] = [TEXT_HELP, `# Progetto: ${project.info.name}${project.info.drawingNr ? ` · ${project.info.drawingNr}` : ''}`, ''];
  if (opts.projectData ?? !opts.pageIds) out.push(...projectSection(project), '');
  for (const page of project.pages) {
    if (opts.pageIds && !opts.pageIds.includes(page.id)) continue;
    const typeName = TYPE_NAMES[page.type];
    const loc = page.panelId ? panels.get(page.panelId)?.code : undefined;
    out.push(`pagina ${bare(page.name)} ${q(page.title)}${typeName ? ` tipo=${typeName}` : ''}${loc ? ` luogo=${bare(loc)}` : ''}`);
    if (!typeName || GENERATED.includes(page.type)) { out.push(`# pagina generata dal programma (${page.type}): il contenuto non si modifica da testo`, ''); continue; }
    const pins = pagePins(project, page, labels);
    for (const e of page.elements) {
      if (e.kind !== 'symbol') continue;
      const sym = getSymbol(e.symbolId, project);
      const dist = distOf(project, e.symbolId);
      const symId = dist ? `rip:${dist.d.tag}:${dist.d.groups[dist.gi].name}` : e.symbolId;
      const parts = [`simbolo ${bare(symId)}`, sym ? tagToken(e, sym) : bare(e.tag ? `-${e.tag}` : '""'), `@${pt(e)}`];
      if (sym?.role === 'link') { const c = linkWith(e); if (c) parts.push(`con=${c}`); }
      if (e.rot) parts.push(`rot=${e.rot}`);
      if (e.mirror) parts.push('specchio');
      if (e.linkStar) parts.push('stella');
      if (e.pairOf) { const r = pairReal(e.pairOf); if (r) parts.push(`coppia=${bare(r.page.name)}@${pt(r.inst)}`); }
      for (const [k, f] of SYMBOL_ATTRS) { const v = e[f]; if (typeof v === 'string' && v) parts.push(`${k}=${bare(v)}`); }
      if (e.showTexts !== undefined) parts.push(`testi=${e.showTexts ? 'si' : 'no'}`);
      if (e.wirePass !== undefined) parts.push(`numerofilo=${e.wirePass ? 'passa' : 'cambia'}`);
      if (!e.autoPins && Object.values(e.pinLabels).some(Boolean)) parts.push(`pin=${q(Object.entries(e.pinLabels).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(';'))}`);
      if (e.extraParts?.length) parts.push(`articoli=${json(e.extraParts)}`);
      if (e.netIfs?.length) parts.push(`interfacce=${json(e.netIfs)}`);
      if (has(e.userProps)) parts.push(`proprieta=${json(e.userProps)}`);
      if (has(e.show)) parts.push(`mostra=${json(e.show)}`);
      if (has(e.textOffsets)) parts.push(`postesti=${json(e.textOffsets)}`);
      if (e.contactImage) parts.push(`immaginecontatti=${e.contactImage === 'bottom' ? 'sotto' : 'simbolo'}`);
      if (e.termText) parts.push(`versotesti=${TERM_TEXT[e.termText]}`);
      const mine = pins.filter(x => x.inst === e);
      const comment = sym ? `${sym.name}${mine.length ? ` · ${mine.map(x => `${sym.role === 'potential' || sym.role === 'link' ? '' : x.label || `/${x.pinId}`} (${pt(x.p)}${DIR_ARROW[x.dir]})`.trim()).join(' ')}` : ''}` : 'simbolo sconosciuto';
      out.push(`  ${parts.join(' ')}   # ${comment}`);
    }
    const wires = page.elements.filter((e): e is Wire => e.kind === 'wire');
    for (const w of wires) {
      const parts = [`filo ${w.points.map(pt).join(' ')}`];
      if (w.cross) parts.push(`sezione=${bare(w.cross)}`);
      if (w.color) parts.push(`colore=${bare(w.color)}`);
      if (w.number) parts.push(`n=${bare(w.number)}`);
      if (w.bus) parts.push(`bus=${bare(w.bus)}`);
      // Bus di conduttori (modalità BUS): "_" = senza nome; cond1/cond2 = conduttore degli estremi
      if (w.bundle !== undefined) parts.push(`busfili=${w.bundle ? bare(w.bundle) : '_'}`);
      if (w.bundlePart) parts.push(`articolobus=${bare(w.bundlePart)}`);
      if (w.tapStart) parts.push(`cond1=${bare(w.tapStart)}`);
      if (w.tapEnd) parts.push(`cond2=${bare(w.tapEnd)}`);
      if (w.tNode?.start) parts.push(`nodo1=${NODE_TEXT[w.tNode.start]}`);
      if (w.tNode?.end) parts.push(`nodo2=${NODE_TEXT[w.tNode.end]}`);
      if (w.busCable?.tag) parts.push(`cavo=${bare(w.busCable.tag)}`);
      if (w.busCable?.type) parts.push(`tipocavo=${bare(w.busCable.type)}`);
      if (w.busCable?.length !== undefined) parts.push(`lunghezza=${num(w.busCable.length)}`);
      if (w.busCable?.partNr) parts.push(`articolocavo=${bare(w.busCable.partNr)}`);
      if (w.poles) parts.push(`poli=${w.poles}`);
      if (w.lineType && w.lineType !== 'solid') parts.push(`linea=${w.lineType}`);
      if (w.width) parts.push(`spessore=${num(w.width)}`);
      if (w.text) parts.push(`testo=${q(w.text)}`);
      if (w.wireType) parts.push(`tipo=${bare(w.wireType)}`);
      if (w.labelSize) parts.push(`hnumero=${num(w.labelSize)}`);
      if (w.labelColor) parts.push(`colorenumero=${bare(w.labelColor)}`);
      if (w.labels?.length) parts.push(`posnumeri=${json(w.labels)}`);
      if (has(w.show)) parts.push(`mostra=${json(w.show)}`);
      if (has(w.userProps)) parts.push(`proprieta=${json(w.userProps)}`);
      // Conduttore del cavo scelto a mano (conduttore=) o fissato dalla numerazione automatica (fissato=)
      const manual = (project.cables ?? []).filter(c => c.assign[w.id]).map(c => `${c.tag}:${c.assign[w.id]}`);
      const fixed = (project.cables ?? []).filter(c => c.fixed?.[w.id]).map(c => `${c.tag}:${c.fixed![w.id]}`);
      if (manual.length) parts.push(`conduttore=${bare(manual.join(';'))}`);
      if (fixed.length) parts.push(`fissato=${bare(fixed.join(';'))}`);
      const end = (p: Pt) => {
        const x = pins.find(k => samePt(k.p, p));
        if (x) return pinRef(x);
        if (wires.some(o => o !== w && (o.points.some(v => samePt(v, p)) || o.points.some((v, i) => i < o.points.length - 1 && onSegmentInterior(p, v, o.points[i + 1]))))) return 'giunzione';
        return isRailEnd(p, nl.wireNet.get(w.id)) ? 'fine barra' : 'LIBERO';
      };
      const net = nl.wireNet.get(w.id);
      const no = net?.wireNo && !w.bus ? ` · n. ${net.wireNo}` : '';
      out.push(`  ${parts.join(' ')}   # ${end(w.points[0])} → ${end(w.points[w.points.length - 1])}${net?.named ? ` · ${net.name}` : no}`);
    }
    for (const e of page.elements) {
      if (e.kind === 'text') out.push(`  testo @${pt(e)}${e.size !== 3 ? ` h=${num(e.size)}` : ''}${e.w ? ` l=${num(e.w)}` : ''}${e.rot ? ` rot=${num(e.rot)}` : ''}${e.align ? ` allinea=${ALIGN_TEXT[e.align]}` : ''} ${q(e.text)}`);
      else if (e.kind === 'image') out.push(`  # immagine ${q(e.name ?? '')} @${pt(e)} ${num(e.w)}x${num(e.h)} (resta sulla pagina, non si modifica dal testo)`);
      else if (e.kind === 'zone') { const pn = panels.get(e.panelId); out.push(`  riquadro +${bare(pn?.code ?? '?')} @${pt(e)} ${num(e.w)}x${num(e.h)}${e.label ? ` scritta=${pt(e.label)}` : ''}${e.codeOnly ? ' solosigla' : e.codeOnly === false ? ' solosigla=no' : ''}${lookText(e.look)}${pn?.name ? `   # ${pn.name}` : ''}`); }
      else if (e.kind === 'wiredef') out.push(`  sezionefili ${pt(e.points[0])} ${pt(e.points[1])}${e.cross ? ` sezione=${bare(e.cross)}` : ''}${e.label ? ` scritta=${pt(e.label)}` : ''}`);
      else if (e.kind === 'cable') {
        const c = cables.get(e.cableId);
        const a = [`lineacavo -${bare(c?.tag ?? '?')} ${pt(e.points[0])} ${pt(e.points[1])}`];
        if (e.main) a.push('principale');
        const shown = Object.entries(e.show ?? {}).filter(([, v]) => v !== undefined) as [keyof CableLineShow, boolean][];
        if (shown.length) a.push(`testi=${q(shown.map(([k, v]) => `${CABLE_SHOW_TEXT[k]}=${v ? 'si' : 'no'}`).join(';'))}`);
        if (e.labelPos) a.push(`posizione=${CABLE_POS_TEXT[e.labelPos]}`);
        if (e.labelOffset) a.push(`spostamento=${pt(e.labelOffset)}`);
        if (e.shieldGround) a.push(`schermo=${SHIELD_TEXT[e.shieldGround]}`);
        if (e.shieldHeight) a.push(`altezzaschermo=${num(e.shieldHeight)}`);
        if (e.condDir) a.push(`nomi=${e.condDir === 'v' ? 'verticali' : 'orizzontali'}`);
        if (e.look) a.push(lookText(e.look).trim());
        out.push(`  ${a.join(' ')}${c ? `   # ${[c.type, c.conductors.join(' ')].filter(Boolean).join(' · ')}` : ''}`);
      }
    }
    out.push(...orders.get(page.id) ?? []);
    out.push('');
  }
  if (opts.catalog) out.push(symbolCatalog(project, opts.librarySymbols));
  return out.join('\n');
}

/**
 * Simbolo importato in blocco (QElectroTech, macro EPLAN dei costruttori): nel catalogo per gli
 * agenti compare solo se richiesto, perché possono essere migliaia. Quelli salvati dall'utente
 * (id "user:…") contano come suoi anche se nati da un import.
 */
export const isBulkImported = (s: SymbolDef) => !!s.source && !s.id.startsWith('user:');

/**
 * Catalogo dei simboli: identificativo, nome, lettera, ruolo e punti di connessione a rotazione 0.
 * extra: la libreria personale (cartella dei simboli); i simboli importati in blocco solo con all.
 */
export function symbolCatalog(project: Project, extra: SymbolDef[] = [], all = false): string {
  const seen = new Set<string>();
  const lines = ['# Catalogo dei simboli (id · nome · lettera di sigla · ruolo · punti di connessione: nome (x,y relativi al punto @, direzione del filo))'];
  const line = (s: SymbolDef) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    const pins = s.pins.map(p => `${p.label || `/${p.id}`} (${num(p.x)},${num(p.y)}${DIR_ARROW[p.dir]})`).join(' ');
    // Rotazioni ammesse e specchio solo se il simbolo li limita
    const lim = [...(s.rotations?.length ? [`rot ${allowedRots(s).join('/')}`] : []), ...(s.noMirror ? ['non specchiabile'] : [])].join(', ');
    lines.push(`#   ${s.id} · ${s.name} · ${s.letter || '—'} · ${ROLE_NAMES[s.role] ?? s.role}${s.contact ? ` ${s.contact}` : ''}${pins ? ` · ${pins}` : ''}${lim ? ` · ${lim}` : ''}`);
  };
  // I gruppi I/O PLC si inseriscono dall'interfaccia: nel formato testo si scrivono i singoli punti I/O
  for (const s of [...BUILTIN_SYMBOLS, ...project.customSymbols]) if (!s.hidden && !s.plcGroup) line(s);
  // I simboli eliminati (cartella «Eliminare») non si usano più
  const own = extra.filter(s => (all || !isBulkImported(s)) && !isDeletedSymbol(s));
  if (own.length) {
    lines.push('#', '# Libreria dell\'utente (cartella dei simboli; la categoria è la sottocartella)');
    const byCat = new Map<string, SymbolDef[]>();
    for (const s of own) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
    for (const [cat, list] of byCat) { lines.push(`# ${cat}`); for (const s of list) line(s); }
  }
  const hidden = extra.length - own.length;
  if (hidden) lines.push('#', `# Altri ${hidden} simboli importati (QElectroTech, macro EPLAN dei costruttori) non elencati: \`catalogo --tutti\` per vederli`);
  lines.push('#', '# Tipi di scheda PLC (scheda -<sigla> tipo=…; canali DI0…, DO0…, AI0…, AO0… per i simboli plc_di/plc_do/plc_ai/plc_ao)');
  for (const t of PLC_CARD_TYPES) lines.push(`#   ${t.id} · ${t.name}`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Lettura

export interface TextIssue { line: number; msg: string }

export interface TextImportResult {
  errors: TextIssue[];
  warnings: TextIssue[];
  /** Nomi delle pagine sostituite e aggiunte */
  replaced: string[];
  added: string[];
  elements: number;
}

/** Token: parola, "testo tra virgolette" oppure chiave=valore (anche chiave="valore con spazi") */
type Tok = { s: string; quoted: boolean; key?: string };

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') break;
    let s = '', quoted = false, key: string | undefined;
    while (i < line.length && line[i] !== ' ' && line[i] !== '\t') {
      if (line[i] === '"') {
        quoted = true; i++;
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < line.length) { i++; s += line[i] === 'n' ? '\n' : line[i]; i++; continue; }
          s += line[i++];
        }
        i++;
      } else if (line[i] === '=' && !quoted && key === undefined && s) { key = s.toLowerCase(); s = ''; i++; }
      else s += line[i++];
    }
    out.push({ s, quoted, key });
  }
  return out;
}

const parsePt = (s: string): Pt | undefined => {
  const m = /^@?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : undefined;
};

interface PendingLink { line: number; a: string; b: string; via: Pt[]; attrs: Partial<Wire> }
interface PageDraft { line: number; name: string; title: string; type: PageType; loc?: string; elements: Element[]; links: PendingLink[]; cableLines: { line: number; tag: string; a: Pt; b: Pt; opts: Partial<CableLine> }[]; zones: ({ line: number; code: string; x: number; y: number; w: number; h: number } & Pick<Zone, 'label' | 'codeOnly' | 'look'>)[] }

function wireAttrs(k: string, v: string, w: Partial<Wire>): boolean {
  switch (k) {
    case 'sezione': w.cross = v; return true;
    case 'colore': w.color = v.toUpperCase(); return true;
    case 'n': w.number = v; return true;
    case 'bus': w.bus = v; return true;
    case 'busfili': w.bundle = v === '_' ? '' : v; return true;
    case 'articolobus': w.bundlePart = v; return true;
    case 'cond1': w.tapStart = v; return true;
    case 'cond2': w.tapEnd = v; return true;
    case 'nodo1': case 'nodo2': {
      const d = lookup(NODE_TEXT, v.replace('ù', 'u'));
      if (!d) return false;
      w.tNode = { ...w.tNode, [k === 'nodo1' ? 'start' : 'end']: d };
      return true;
    }
    case 'cavo': w.busCable = { ...w.busCable, tag: v.replace(/^-/, '') }; return true;
    case 'tipocavo': w.busCable = { ...w.busCable, type: v }; return true;
    case 'lunghezza': w.busCable = { ...w.busCable, length: parseFloat(v.replace(',', '.')) }; return true;
    case 'articolocavo': w.busCable = { ...w.busCable, partNr: v }; return true;
    case 'poli': w.poles = parseInt(v, 10) || undefined; return true;
    case 'testo': w.text = v; return true;
    case 'linea': if (['solid', 'dash', 'dashdot', 'dot'].includes(v)) { w.lineType = v as Wire['lineType']; return true; } return false;
    case 'spessore': { const n = parseFloat(v.replace(',', '.')); if (n > 0) { w.width = n; return true; } return false; }
    case 'tipo': w.wireType = v; return true;
    case 'hnumero': { const n = parseFloat(v.replace(',', '.')); if (n > 0) { w.labelSize = n; return true; } return false; }
    case 'colorenumero': w.labelColor = v; return true;
    case 'posnumeri': { const x = parseJson<Wire['labels']>(v); if (Array.isArray(x)) { w.labels = x; return true; } return false; }
    case 'mostra': { const x = parseJson<Wire['show']>(v); if (x && typeof x === 'object') { w.show = x; return true; } return false; }
    case 'proprieta': { const x = parseJson<Wire['userProps']>(v); if (x && typeof x === 'object') { w.userProps = x; return true; } return false; }
    // Conduttori dei cavi: si assegnano dopo, quando il filo ha il suo identificativo
    case 'conduttore': case 'fissato': {
      const list = pairsColon(v);
      if (!list.length) return false;
      const c = w as WireConductors;
      (c[k === 'conduttore' ? CONDS : FIXED] ??= []).push(...list);
      return true;
    }
  }
  return false;
}

/** Conduttori dei cavi letti su un filo (sigla del cavo e conduttore), in attesa dell'identificativo del filo */
const CONDS = '\u0000conduttore', FIXED = '\u0000fissato';
type WireConductors = Partial<Wire> & { [CONDS]?: [string, string][]; [FIXED]?: [string, string][] };
/** "W1:17;W2:BN" → [["W1","17"],["W2","BN"]] (la sigla del cavo con o senza trattino) */
const pairsColon = (v: string) => v.split(';').map(x => x.trim()).filter(Boolean).map(x => { const i = x.lastIndexOf(':'); return i > 0 ? [x.slice(0, i).replace(/^-/, ''), x.slice(i + 1)] as [string, string] : undefined; }).filter((x): x is [string, string] => !!x && !!x[1]);

/** Percorso ortogonale tra punti: tra due punti non allineati un angolo, secondo la direzione d'uscita */
function route(points: Pt[], startDir?: PinDir): Pt[] {
  const out: Pt[] = [points[0]];
  let vertical = !startDir || startDir === 'up' || startDir === 'down';
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1], b = points[i];
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) out.push(vertical ? { x: a.x, y: b.y } : { x: b.x, y: a.y });
    out.push(b);
    vertical = true;
  }
  // Toglie i punti allineati in mezzo a un tratto rettilineo
  return out.filter((p, i) => i === 0 || i === out.length - 1 || !((Math.abs(out[i - 1].x - p.x) < 0.01 && Math.abs(out[i + 1].x - p.x) < 0.01) || (Math.abs(out[i - 1].y - p.y) < 0.01 && Math.abs(out[i + 1].y - p.y) < 0.01)));
}

/**
 * Legge il testo e lo applica al progetto (che viene modificato solo se non ci sono errori).
 * Le pagine del testo sostituiscono quelle con lo stesso numero; le altre si aggiungono in coda.
 */
export function importPagesText(project: Project, text: string): TextImportResult {
  const errors: TextIssue[] = [], warnings: TextIssue[] = [];
  const drafts: PageDraft[] = [];
  const linkTargets: { inst: SymbolInstance; target: string; line: number }[] = [];
  const pairTargets: { inst: SymbolInstance; target: string; line: number }[] = [];
  const pendingOrders: { line: number; refs: string[] }[] = [];
  const projectLines: { line: number; cmd: string; attrs: Record<string, string>; words: string[] }[] = [];
  let cur: PageDraft | undefined;
  const lines = text.split(/\r?\n/);
  // Simboli definiti nel testo: si conoscono prima di leggere le pagine
  const defined = new Map<string, SymbolDef>();
  lines.forEach((raw, idx) => {
    const t = tokenize(raw);
    if (t[0]?.s.toLowerCase() !== 'simbolodef') return;
    const attrs: Record<string, string> = {}, words: string[] = [];
    for (const tok of t.slice(1)) { if (tok.key !== undefined) attrs[tok.key] = tok.s; else words.push(tok.s); }
    const r = boxSymbol(words, attrs, raw.trim());
    if (typeof r === 'string') errors.push({ line: idx + 1, msg: r }); else defined.set(r.id, r);
  });
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const t = tokenize(raw);
    if (!t.length) return;
    const cmd = t[0].s.toLowerCase();
    const err = (msg: string) => errors.push({ line, msg });
    const kv = (tok: Tok) => (tok.key !== undefined ? [tok.key, tok.s] as const : undefined);
    if (cmd === 'pagina') {
      const name = t[1]?.s;
      if (!name) return err('pagina senza numero');
      cur = { line, name, title: '', type: 'multiline', elements: [], links: [], cableLines: [], zones: [] };
      for (const tok of t.slice(2)) {
        const p = kv(tok);
        if (p?.[0] === 'tipo') { const ty = TYPE_OF[p[1].toLowerCase()]; if (ty) cur.type = ty; else if (GENERATED.includes(p[1] as PageType)) cur.type = p[1] as PageType; else err(`tipo di pagina "${p[1]}" sconosciuto (schema, unifilare, rete)`); }
        else if (p?.[0] === 'luogo') cur.loc = p[1].replace(/^\+/, '');
        else if (!p) cur.title = tok.s;
        else err(`attributo di pagina "${p[0]}" sconosciuto`);
      }
      drafts.push(cur);
      return;
    }
    if (['progetto', 'luogo', 'cavo', 'connettore', 'scheda', 'simbolodef', 'ripartitore', 'morsettiera'].includes(cmd)) {
      const attrs: Record<string, string> = {}, words: string[] = [];
      for (const tok of t.slice(1)) { const p = kv(tok); if (p) attrs[p[0]] = p[1]; else words.push(tok.s); }
      projectLines.push({ line, cmd, attrs, words });
      return;
    }
    if (!cur) return err(`"${t[0].s}" fuori da una pagina: manca la riga "pagina"`);
    const page = cur;
    if (GENERATED.includes(page.type)) return; // contenuto generato: si ignora
    switch (cmd) {
      case 'simbolo': {
        const id = t[1]?.s, tagTok = t[2], at = parsePt(t[3]?.s ?? '');
        if (!id || !tagTok || !at) return err('formato: simbolo <id> <sigla> @x,y');
        // Gruppo di un ripartitore (rip:<sigla>:<gruppo>): il simbolo si genera dai dati del
        // ripartitore, che possono arrivare dallo stesso testo; si collega dopo
        const sym = /^rip:[^:]+:.+$/.test(id) ? { ...RIP_PLACEHOLDER, id } : getSymbol(id, project) ?? defined.get(id);
        if (!sym) return err(`simbolo "${id}" inesistente (vedi il catalogo dei simboli, oppure definiscilo con simbolodef)`);
        if (sym.plcGroup) return err(`simbolo "${id}": i gruppi I/O si inseriscono dall'interfaccia; qui scrivi un punto I/O per canale (es. plc_di_var)`);
        const raw = tagTok.s;
        const tag = sym.role === 'potential' || sym.role === 'link' ? raw : raw.replace(/^-/, '');
        const inst: SymbolInstance = { kind: 'symbol', id: uid('s'), symbolId: id, x: at.x, y: at.y, rot: 0, tag: tag === '?' ? '\u0000auto' : tag, pinLabels: {}, autoPins: true };
        for (const tok of t.slice(4)) {
          const p = kv(tok);
          if (!p) {
            if (tok.s.toLowerCase() === 'stella') { if (sym.role !== 'link' || id === 'link_in') err('stella vale solo per i rimandi di partenza (link)'); else inst.linkStar = true; }
            else if (tok.s.toLowerCase() !== 'specchio') err(`"${tok.s}" non riconosciuto`);
            else if (sym.noMirror) err(`simbolo "${id}": non si può specchiare`);
            else inst.mirror = true;
            continue;
          }
          const [k, v] = p;
          if (k === 'rot') {
            const r = parseInt(v, 10);
            if (![0, 90, 180, 270].includes(r)) err('rot deve essere 0, 90, 180 o 270');
            else if (!allowedRots(sym).includes(r as SymbolInstance['rot'])) err(`simbolo "${id}": rot=${r} non ammessa (ammesse: ${allowedRots(sym).join(', ')})`);
            else inst.rot = r as SymbolInstance['rot'];
          }
          else if (k === 'testi') inst.showTexts = /^(si|sì|yes|1|true)$/i.test(v);
          else if (k === 'coppia') pairTargets.push({ inst, target: v, line });
          else if (k === 'con') { if (sym.role !== 'link') err('con= vale solo per i rimandi (link, link_in)'); else linkTargets.push({ inst, target: v, line }); }
          else if (k === 'numerofilo') { if (/^passa$/i.test(v)) inst.wirePass = true; else if (/^cambia$/i.test(v)) inst.wirePass = false; else err('numerofilo deve essere passa o cambia'); }
          else if (k === 'pin') {
            inst.autoPins = false;
            for (const pair of v.split(/[;,]/)) { const [pid, lab] = pair.split('='); if (pid && lab !== undefined) inst.pinLabels[pid.trim()] = lab.trim(); }
          } else if (k === 'articoli' || k === 'proprieta' || k === 'mostra' || k === 'postesti' || k === 'interfacce') {
            const val = parseJson<never>(v);
            if (val === undefined) err(`${k}: JSON non valido`);
            else if (k === 'interfacce') inst.netIfs = val;
            else if (k === 'articoli') inst.extraParts = val; else if (k === 'proprieta') inst.userProps = val; else if (k === 'mostra') inst.show = val; else inst.textOffsets = val;
          } else if (k === 'immaginecontatti') {
            if (/^sotto$/i.test(v)) inst.contactImage = 'bottom'; else if (/^simbolo$/i.test(v)) inst.contactImage = 'symbol'; else err('immaginecontatti deve essere sotto o simbolo');
          } else if (k === 'versotesti') {
            const d = lookup(TERM_TEXT, v);
            if (d) inst.termText = d; else err('versotesti deve essere auto, parallelo o perpendicolare');
          } else {
            const f = SYMBOL_ATTRS.find(([n]) => n === k)?.[1];
            if (f) (inst as unknown as Record<string, unknown>)[f] = f === 'loc' ? v.replace(/^\+/, '') : v;
            else err(`attributo "${k}" sconosciuto per simbolo`);
          }
        }
        if (sym.role === 'aux' && tag === '?') warnings.push({ line, msg: 'contatto con sigla automatica: di solito ha la sigla della sua bobina' });
        page.elements.push(inst);
        return;
      }
      case 'filo': {
        const pts: Pt[] = [];
        const w: Partial<Wire> = {};
        for (const tok of t.slice(1)) {
          // "sezione=2,5" è un attributo, non un punto
          const p = tok.key === undefined ? parsePt(tok.s) : undefined;
          if (p) { pts.push(p); continue; }
          const a = kv(tok);
          if (!a || !wireAttrs(a[0], a[1], w)) err(`"${tok.s}" non riconosciuto in filo`);
        }
        if (pts.length < 2) return err('un filo ha almeno due punti x,y');
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - pts[i - 1].x) > 0.01 && Math.abs(pts[i].y - pts[i - 1].y) > 0.01) { warnings.push({ line, msg: `tratto obliquo da ${pt(pts[i - 1])} a ${pt(pts[i])}: aggiunto un angolo` }); break; }
        page.elements.push({ kind: 'wire', id: uid('w'), ...w, points: route(pts) });
        return;
      }
      case 'collega': {
        const a = t[1]?.s, b = t[2]?.s;
        if (!a || !b) return err('formato: collega <estremo> <estremo> [via x,y …]');
        const via: Pt[] = [], w: Partial<Wire> = {};
        let inVia = false;
        for (const tok of t.slice(3)) {
          if (tok.s.toLowerCase() === 'via') { inVia = true; continue; }
          // "sezione=2,5" è un attributo, non un punto
          const p = tok.key === undefined ? parsePt(tok.s) : undefined;
          if (p && inVia) { via.push(p); continue; }
          const k = kv(tok);
          if (!k || !wireAttrs(k[0], k[1], w)) err(`"${tok.s}" non riconosciuto in collega`);
        }
        page.links.push({ line, a, b, via, attrs: w });
        return;
      }
      case 'ordine': {
        const refs = t.slice(1).map(x => x.s);
        if (refs.length < 2) return err('formato: ordine <estremo> <estremo> [<estremo>…]');
        pendingOrders.push({ line, refs });
        return;
      }
      case 'testo': {
        const at = parsePt(t[1]?.s ?? '');
        let h = 3, wd: number | undefined, s: string | undefined, rot: number | undefined, align: TextItem['align'];
        for (const tok of t.slice(2)) {
          const k = kv(tok);
          if (k?.[0] === 'h') h = parseFloat(k[1]) || 3;
          else if (k?.[0] === 'l') wd = parseFloat(k[1]) || undefined;
          else if (k?.[0] === 'rot') rot = parseFloat(k[1]) || undefined;
          else if (k?.[0] === 'allinea') { align = lookup(ALIGN_TEXT, k[1]); if (!align) err('allinea deve essere sinistra, centro o destra'); }
          else s = s === undefined ? tok.s : `${s} ${tok.s}`;
        }
        if (!at || s === undefined) return err('formato: testo @x,y [h=3] [l=60] "testo"');
        page.elements.push({ kind: 'text', id: uid('t'), x: at.x, y: at.y, text: s, size: h, ...(wd ? { w: wd } : {}), ...(rot ? { rot } : {}), ...(align ? { align } : {}) });
        return;
      }
      case 'riquadro': {
        const code = t[1]?.s.replace(/^\+/, ''), at = parsePt(t[2]?.s ?? ''), m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(t[3]?.s ?? '');
        if (!code || !at || !m) return err('formato: riquadro +<luogo> @x,y <larghezza>x<altezza>');
        const opts: Pick<Zone, 'label' | 'codeOnly' | 'look'> = {};
        for (const tok of t.slice(4)) {
          const p = kv(tok);
          if (!p) { if (tok.s.toLowerCase() === 'solosigla') opts.codeOnly = true; else err(`"${tok.s}" non riconosciuto in riquadro`); continue; }
          if (p[0] === 'solosigla') opts.codeOnly = yes(p[1]);
          else if (p[0] === 'scritta') { const x = parsePt(p[1]); if (x) opts.label = x; else err('scritta=x,y'); }
          else if (p[0] === 'aspetto') opts.look = parseLook(p[1], err);
          else err(`attributo "${p[0]}" sconosciuto per riquadro`);
        }
        page.zones.push({ line, code, x: at.x, y: at.y, w: parseFloat(m[1]), h: parseFloat(m[2]), ...opts });
        return;
      }
      case 'lineacavo': {
        const tag = t[1]?.s.replace(/^-/, ''), a = parsePt(t[2]?.s ?? ''), b = parsePt(t[3]?.s ?? '');
        if (!tag || !a || !b) return err('formato: lineacavo -<sigla> x,y x,y');
        const opts: Partial<CableLine> = {};
        for (const tok of t.slice(4)) {
          const p = kv(tok);
          if (!p) { if (tok.s.toLowerCase() === 'principale') opts.main = true; else err(`"${tok.s}" non riconosciuto in lineacavo`); continue; }
          const [k, v] = p;
          if (k === 'testi') {
            const show: CableLineShow = {};
            for (const [n, val] of pairs(v)) { const key = lookup(CABLE_SHOW_TEXT, n); if (key) show[key] = yes(val); else err(`testi: "${n}" sconosciuto (sigla, tipo, sezione, descrizione, conduttori)`); }
            opts.show = show;
          } else if (k === 'posizione') { const x = lookup(CABLE_POS_TEXT, v); if (x) opts.labelPos = x; else err(`posizione "${v}" sconosciuta (${Object.values(CABLE_POS_TEXT).join(', ')})`); }
          else if (k === 'spostamento') { const x = parsePt(v); if (x) opts.labelOffset = x; else err('spostamento=x,y'); }
          else if (k === 'schermo') { const x = lookup(SHIELD_TEXT, v); if (x) opts.shieldGround = x; else err('schermo deve essere fine, inizio o nessuno'); }
          else if (k === 'altezzaschermo') { const n = parseFloat(v.replace(',', '.')); if (n > 0) opts.shieldHeight = n; else err('altezzaschermo in mm'); }
          else if (k === 'aspetto') opts.look = parseLook(v, err);
          else if (k === 'nomi') { if (/^vert/i.test(v)) opts.condDir = 'v'; else if (/^oriz/i.test(v)) opts.condDir = 'h'; else err('nomi deve essere orizzontali o verticali'); }
          else err(`attributo "${k}" sconosciuto per lineacavo`);
        }
        page.cableLines.push({ line, tag, a, b, opts });
        return;
      }
      case 'sezionefili': {
        const a = parsePt(t[1]?.s ?? ''), b = parsePt(t[2]?.s ?? '');
        if (!a || !b) return err('formato: sezionefili x,y x,y sezione=2,5');
        const d: WireDef = { kind: 'wiredef', id: uid('d'), points: [a, b] };
        for (const tok of t.slice(3)) {
          const p = kv(tok);
          if (p?.[0] === 'sezione') d.cross = p[1];
          else if (p?.[0] === 'scritta' && parsePt(p[1])) d.label = parsePt(p[1]);
          else err(`"${tok.s}" non riconosciuto (sezione=, scritta=)`);
        }
        page.elements.push(d);
        return;
      }
      default:
        err(`comando "${t[0].s}" sconosciuto (pagina, simbolo, filo, collega, ordine, testo, riquadro, lineacavo, sezionefili)`);
    }
  });
  const result: TextImportResult = { errors, warnings, replaced: [], added: [], elements: 0 };
  if (!drafts.length && !projectLines.length && !errors.length) errors.push({ line: 0, msg: 'nessuna riga "pagina" nel testo' });
  const names = new Set<string>();
  for (const d of drafts) { if (names.has(d.name)) errors.push({ line: d.line, msg: `pagina ${d.name} ripetuta nel testo` }); names.add(d.name); }
  if (errors.length) return result;

  // Applicazione su una copia: il progetto cambia solo se tutti i collegamenti si risolvono
  const work = structuredClone(project);
  applyProjectLines(work, defined, projectLines, errors, warnings);
  const touched: { page: Page; draft: PageDraft }[] = [];
  for (const d of drafts) {
    let page = work.pages.find(p => p.name === d.name);
    if (page && GENERATED.includes(page.type)) { if (d.title) page.title = d.title; continue; }
    if (GENERATED.includes(d.type)) { errors.push({ line: d.line, msg: `le pagine di tipo ${d.type} si creano dal programma, non da testo` }); continue; }
    // Le immagini non si scrivono nel testo: restano sulla pagina
    if (page) { page.title = d.title || page.title; page.type = d.type; page.elements = page.elements.filter(e => e.kind === 'image'); result.replaced.push(d.name); }
    else { page = { id: uid('p'), name: d.name, title: d.title, type: d.type, elements: [] }; work.pages.push(page); result.added.push(d.name); }
    if (d.loc !== undefined) {
      const pn = work.panels?.find(p => p.code === d.loc);
      if (pn) page.panelId = pn.id; else errors.push({ line: d.line, msg: `luogo +${d.loc} non definito nel progetto` });
    }
    touched.push({ page, draft: d });
  }
  // Simboli dei ripartitori (anche quelli appena definiti nel testo)
  syncDistSymbols(work);
  // Prima i simboli (sigle automatiche comprese), poi fili e collegamenti
  for (const { page, draft } of touched) {
    for (const e of draft.elements) {
      if (e.kind === 'symbol' && e.symbolId.startsWith('rip:')) {
        const [, tag, group] = /^rip:([^:]+):(.+)$/.exec(e.symbolId)!;
        const d = work.distributors?.find(x => x.tag === tag.replace(/^-/, ''));
        const gi = d ? d.groups.findIndex(g => g.name === group) : -1;
        if (!d || gi < 0) { errors.push({ line: draft.line, msg: `${e.symbolId}: ${d ? `il ripartitore -${d.tag} non ha il gruppo ${group}` : `ripartitore -${tag} non definito (riga «ripartitore»)`}` }); continue; }
        e.symbolId = distSymbolId(d, gi);
      }
      // Simbolo della libreria personale: il progetto ne tiene una copia, come inserendolo a mano
      if (e.kind === 'symbol' && !BUILTIN_SYMBOLS.some(b => b.id === e.symbolId) && !work.customSymbols.some(c => c.id === e.symbolId)) {
        const lib = getSymbol(e.symbolId);
        if (lib) work.customSymbols.push(structuredClone(lib));
      }
      if (e.kind === 'symbol' && e.tag === '\u0000auto') {
        const sym = getSymbol(e.symbolId, work)!;
        e.tag = nextTagFor(work, sym.letter || 'X', page, e.x);
      }
      page.elements.push(e);
    }
    for (const z of draft.zones) {
      const pn = work.panels?.find(p => p.code === z.code);
      if (!pn) { errors.push({ line: z.line, msg: `luogo +${z.code} non definito nel progetto` }); continue; }
      page.elements.push({ kind: 'zone', id: uid('z'), panelId: pn.id, x: z.x, y: z.y, w: z.w, h: z.h, ...(z.label ? { label: z.label } : {}), ...(z.codeOnly !== undefined ? { codeOnly: z.codeOnly } : {}), ...(z.look ? { look: z.look } : {}) });
    }
  }
  const labels = effectivePinLabels(work);
  for (const { page, draft } of touched) {
    const pins = pagePins(work, page, labels);
    const resolve = (ref: string, other: Pt | undefined, line: number): { p: Pt; dir?: PinDir } | undefined => {
      const xy = parsePt(ref);
      if (xy) return { p: xy };
      let [main, pinId] = ref.split('/');
      const plain = (s: string) => s.replace(/^-/, '');
      const pick = (cands: PinAt[]) => {
        if (!cands.length) return undefined;
        if (cands.length === 1 || !other) return cands[0];
        return [...cands].sort((a, b) => Math.hypot(a.p.x - other.x, a.p.y - other.y) - Math.hypot(b.p.x - other.x, b.p.y - other.y))[0];
      };
      // 1) la sigla intera (morsetti "X1:3", potenziali, rimandi) con eventuale /pin
      let cands = pins.filter(x => x.inst.tag === plain(main) || x.inst.tag === main);
      if (cands.length) {
        if (pinId) cands = cands.filter(x => x.pinId === pinId);
        const r = pick(cands);
        if (r) return { p: r.p, dir: r.dir };
        errors.push({ line, msg: `${ref}: il simbolo non ha il punto /${pinId}` });
        return undefined;
      }
      // 2) sigla:punto di connessione
      const i = main.lastIndexOf(':');
      if (i > 0) {
        const tag = plain(main.slice(0, i)), lab = main.slice(i + 1);
        cands = pins.filter(x => x.inst.tag === tag && (x.label === lab || x.pinId === lab));
        if (pinId) cands = cands.filter(x => x.pinId === pinId);
        const r = pick(cands);
        if (r) return { p: r.p, dir: r.dir };
        const avail = pins.filter(x => x.inst.tag === tag).map(x => x.label || `/${x.pinId}`);
        errors.push({ line, msg: avail.length ? `${ref}: punto di connessione inesistente; -${tag} ha ${[...new Set(avail)].join(', ')}` : `${ref}: nessun simbolo -${tag} su questa pagina` });
        return undefined;
      }
      errors.push({ line, msg: `${ref}: nessun simbolo con questa sigla su questa pagina` });
      return undefined;
    };
    for (const l of draft.links) {
      // Il punto non indicato si sceglie vicino all'altro estremo: prima una stima di entrambi,
      // poi la scelta definitiva verso l'estremo opposto (o verso il primo/ultimo punto "via")
      const n0 = errors.length;
      const a0 = resolve(l.a, l.via[0], l.line), b0 = resolve(l.b, l.via[l.via.length - 1], l.line);
      if (!a0 || !b0) continue;
      errors.length = n0;
      const a = resolve(l.a, l.via[0] ?? b0.p, l.line)!, b = resolve(l.b, l.via[l.via.length - 1] ?? a.p, l.line)!;
      if (samePt(a.p, b.p)) { warnings.push({ line: l.line, msg: 'i due estremi coincidono: nessun filo' }); continue; }
      page.elements.push({ kind: 'wire', id: uid('w'), ...l.attrs, points: route([a.p, ...l.via, b.p], a.dir) });
    }
    for (const c of draft.cableLines) {
      let cable = work.cables?.find(x => x.tag === c.tag);
      if (!cable) {
        cable = { id: uid('c'), tag: c.tag, type: 'FG16OR16', cross: '1,5', conductors: defaultConductors(3, true), assign: {} } as Cable;
        (work.cables ??= []).push(cable);
        warnings.push({ line: c.line, msg: `cavo -${c.tag} nuovo: controlla tipo e conduttori nelle sue proprietà` });
      }
      page.elements.push({ kind: 'cable', id: uid('k'), cableId: cable.id, points: [c.a, c.b], ...c.opts });
    }
    // Conduttori dei cavi scritti sui fili (conduttore=, fissato=)
    for (const e of page.elements) {
      if (e.kind !== 'wire') continue;
      const w = e as WireConductors;
      for (const [key, field] of [[CONDS, 'assign'], [FIXED, 'fixed']] as const) {
        for (const [tag, name] of w[key] ?? []) {
          const cable = work.cables?.find(c => c.tag === tag);
          if (!cable) { errors.push({ line: draft.line, msg: `${field === 'assign' ? 'conduttore' : 'fissato'}=${tag}:${name}: cavo -${tag} non definito` }); continue; }
          (cable[field] ??= {})[e.id] = name;
        }
        delete w[key];
      }
    }
    // Linee di definizione: i valori vanno sui fili attraversati
    applyWireDefs(page);
    for (const e of page.elements) {
      const xs = e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef' ? e.points : [e as { x: number; y: number }];
      if (xs.some(p => p.x < 0 || p.y < 0 || p.x > PAGE_W || p.y > PAGE_H)) { warnings.push({ line: draft.line, msg: `pagina ${page.name}: un elemento esce dal foglio` }); break; }
    }
    result.elements += page.elements.length;
  }
  // Abbinamenti scritti dei rimandi (con=<pagina>[@x,y] o con=-), anche verso pagine non nel testo
  for (const { inst, target, line } of linkTargets) {
    if (target === '-') { inst.linkTo = NO_PARTNER; continue; }
    const m = /^(.+?)(?:@(-?[\d.]+),(-?[\d.]+))?$/.exec(target)!;
    const pg = work.pages.find(p => p.name === m[1]);
    if (!pg) { errors.push({ line, msg: `con=${target}: pagina ${m[1]} inesistente` }); continue; }
    const cands = pg.elements.filter((e): e is SymbolInstance => e.kind === 'symbol' && e !== inst && e.tag === inst.tag
      && getSymbol(e.symbolId, work)?.role === 'link' && isIncomingLink(e.symbolId) !== isIncomingLink(inst.symbolId)
      && (m[2] === undefined || (Math.abs(e.x - parseFloat(m[2])) < 0.01 && Math.abs(e.y - parseFloat(m[3])) < 0.01)));
    if (cands.length !== 1) { errors.push({ line, msg: cands.length ? `con=${target}: a pagina ${m[1]} ci sono ${cands.length} rimandi "${inst.tag}", indica il punto (con=${m[1]}@x,y)` : `con=${target}: a pagina ${m[1]} nessun rimando "${inst.tag}" di verso opposto` }); continue; }
    pairLinks(work, inst.id, cands[0].id);
  }
  // Rappresentazioni (coppia=<pagina>@x,y): il contatto vero con la stessa sigla in quel punto
  for (const { inst, target, line } of pairTargets) {
    const m = /^(.+?)@(-?[\d.]+),(-?[\d.]+)$/.exec(target);
    const pg = m ? work.pages.find(p => p.name === m[1]) : undefined;
    const real = pg?.elements.find((e): e is SymbolInstance => e.kind === 'symbol' && e !== inst && !e.pairOf && e.tag === inst.tag
      && Math.abs(e.x - parseFloat(m![2])) < 0.01 && Math.abs(e.y - parseFloat(m![3])) < 0.01);
    if (!real) { errors.push({ line, msg: m ? `coppia=${target}: a pagina ${m[1]} nel punto ${m[2]},${m[3]} non c'è -${inst.tag}` : `coppia=${target}: scrivi coppia=<pagina>@x,y` }); continue; }
    inst.pairOf = real.id;
  }
  // Ordini dei collegamenti: quelli scritti nel testo, più quelli di prima che toccano ancora punti esistenti
  const placedNow = allPlaced(work), labelsNow = effectivePinLabels(work);
  const fresh: string[][] = [];
  for (const o of pendingOrders) {
    const keys: string[] = [];
    for (const r of o.refs) { const k = orderKey(r, placedNow, labelsNow); if (typeof k === 'string') keys.push(k); else errors.push({ line: o.line, msg: k.msg }); }
    if (keys.length >= 2) fresh.push(keys);
  }
  const freshKeys = new Set(fresh.flat()), ids = new Set(placedNow.map(e => e.inst.id));
  const orders = [...(work.wireOrders ?? []).map(o => o.filter(k => ids.has(k.split('|')[0]))).filter(o => o.length >= 2 && !o.some(k => freshKeys.has(k))), ...fresh];
  if (orders.length) work.wireOrders = orders; else delete work.wireOrders;
  if (errors.length) { result.replaced = []; result.added = []; result.elements = 0; return result; }
  // Conduttori assegnati ai fili delle pagine sostituite: quei fili non ci sono più
  const wireIds = new Set(work.pages.flatMap(p => p.elements.filter(e => e.kind === 'wire').map(e => e.id)));
  for (const c of work.cables ?? []) {
    for (const k of Object.keys(c.assign)) if (!wireIds.has(k)) delete c.assign[k];
    if (c.fixed) { for (const k of Object.keys(c.fixed)) if (!wireIds.has(k)) delete c.fixed[k]; if (!has(c.fixed)) delete c.fixed; }
  }
  Object.assign(project, work);
  return result;
}

/** Dati di progetto dal testo: aggiorna o crea intestazione, luoghi, cavi e schede PLC */
function applyProjectLines(work: Project, defined: Map<string, SymbolDef>, lines: { line: number; cmd: string; attrs: Record<string, string>; words: string[] }[], errors: TextIssue[], warnings: TextIssue[]) {
  for (const { line, cmd, attrs, words } of lines) {
    const unknown = (known: string[]) => { for (const k of Object.keys(attrs)) if (!known.includes(k)) errors.push({ line, msg: `attributo "${k}" sconosciuto per ${cmd}` }); };
    if (cmd === 'simbolodef') {
      const sd = defined.get(words[0]);
      if (!sd) continue;
      if (BUILTIN_SYMBOLS.some(b => b.id === sd.id)) { errors.push({ line, msg: `"${sd.id}" è un simbolo del catalogo: scegli un altro id` }); continue; }
      const i = work.customSymbols.findIndex(c => c.id === sd.id);
      if (i >= 0) { if (!work.customSymbols[i].textDef) { errors.push({ line, msg: `"${sd.id}" è già un simbolo del progetto (non creato da testo)` }); continue; } work.customSymbols = work.customSymbols.map((x, k) => (k === i ? sd : x)); }
      else work.customSymbols.push(sd);
    } else if (cmd === 'progetto') {
      unknown(INFO_KEYS.map(([n]) => n));
      for (const [n, k] of INFO_KEYS) if (attrs[n] !== undefined) work.info[k] = attrs[n];
    } else if (cmd === 'luogo') {
      unknown(['tipo']);
      const code = words[0]?.replace(/^\+/, '');
      if (!code) { errors.push({ line, msg: 'formato: luogo +<codice> "<nome>" [tipo=…]' }); continue; }
      let p = work.panels?.find(x => x.code === code);
      if (!p) { p = { id: uid('q'), code, name: '' }; (work.panels ??= []).push(p); }
      if (words[1] !== undefined) p.name = words[1];
      if (attrs.tipo) p.kind = attrs.tipo;
    } else if (cmd === 'cavo') {
      unknown(['tipo', 'sezione', 'conduttori', 'lunghezza', 'da', 'a', 'descr', 'articolo', 'marcatura', 'pezzi', 'pindi']);
      const tag = words[0]?.replace(/^-/, '');
      if (!tag) { errors.push({ line, msg: 'formato: cavo -<sigla> [tipo=…] [conduttori="…"]' }); continue; }
      let c = work.cables?.find(x => x.tag === tag);
      if (!c) { c = { id: uid('c'), tag, conductors: defaultConductors(3, true), assign: {} }; (work.cables ??= []).push(c); }
      if (attrs.tipo) c.type = attrs.tipo;
      if (attrs.sezione) c.cross = attrs.sezione;
      if (attrs.conduttori) c.conductors = attrs.conduttori.split(/[\s,;]+/).filter(Boolean);
      if (attrs.lunghezza) c.length = parseFloat(attrs.lunghezza.replace(',', '.'));
      if (attrs.da) c.from = attrs.da;
      if (attrs.a) c.to = attrs.a;
      if (attrs.descr) c.description = attrs.descr;
      if (attrs.articolo) c.partNr = attrs.articolo;
      if (attrs.marcatura) { if (/^colori$/i.test(attrs.marcatura)) c.marking = 'colors'; else if (/^numeri$/i.test(attrs.marcatura)) c.marking = 'numbers'; else errors.push({ line, msg: 'marcatura deve essere numeri o colori' }); }
      if (attrs.pezzi !== undefined) c.pieces = yes(attrs.pezzi);
      if (attrs.pindi) c.pinsOf = attrs.pindi.replace(/^-/, '');
      if (words.includes('schermato')) c.shield = true;
      if (words.includes('coppie')) c.pairs = true;
    } else if (cmd === 'morsettiera') {
      unknown(['articolo', 'fermo', 'fermi', 'piastra', 'piastre', 'ponticello', 'separatore', 'riserve', 'articoliriserve', 'separatori', 'ponticelli', 'accessori']);
      const strip = words[0]?.replace(/^-/, '');
      if (!strip || strip.includes(':')) { errors.push({ line, msg: 'formato: morsettiera -<sigla> [articolo=…] [fermo=… fermi=2] [piastra=… piastre=1] [ponticelli="pettine:1,2,3"]' }); continue; }
      const d: TerminalStripData = (work.terminalStrips ??= {})[strip] ?? { jumpers: [], spares: [], separators: [] };
      work.terminalStrips[strip] = d;
      const int = (k: string) => { const n = parseInt(attrs[k], 10); if (isFinite(n) && n >= 0) return n; errors.push({ line, msg: `${k} deve essere un numero` }); return undefined; };
      if (attrs.articolo !== undefined) d.partNr = attrs.articolo || undefined;
      if (attrs.fermo !== undefined) d.endStopPartNr = attrs.fermo || undefined;
      if (attrs.fermi !== undefined) d.endStopQty = int('fermi');
      if (attrs.piastra !== undefined) d.endPlatePartNr = attrs.piastra || undefined;
      if (attrs.piastre !== undefined) d.endPlateQty = int('piastre');
      if (attrs.ponticello !== undefined) d.jumperPartNr = attrs.ponticello || undefined;
      if (attrs.separatore !== undefined) d.separatorPartNr = attrs.separatore || undefined;
      if (attrs.riserve !== undefined) d.spares = attrs.riserve.split(/[\s,;]+/).filter(Boolean);
      if (attrs.articoliriserve !== undefined) { const m = Object.fromEntries(pairs(attrs.articoliriserve)); d.spareParts = has(m) ? m : undefined; }
      if (attrs.separatori !== undefined) d.separators = attrs.separatori.split(/[\s,;]+/).filter(Boolean);
      if (attrs.ponticelli !== undefined) {
        const js: Jumper[] = [];
        for (const g of attrs.ponticelli.split('|').map(x => x.trim()).filter(Boolean)) {
          const [kind, terms, partNr] = g.split(':').map(x => x.trim());
          const list = (terms ?? '').split(/[\s,]+/).filter(Boolean);
          if (!/^(pettine|fisso)$/i.test(kind) || list.length < 2) { errors.push({ line, msg: `ponticello "${g}": scrivi pettine:1,2,3 oppure fisso:4,5[:articolo]` }); continue; }
          js.push({ id: uid('j'), kind: /^pettine$/i.test(kind) ? 'comb' : 'fixed', terminals: list, ...(partNr ? { partNr } : {}) });
        }
        d.jumpers = js;
      }
      if (attrs.accessori !== undefined) {
        const x = parseJson<{ partNr: string; qty: number; note?: string }[]>(attrs.accessori);
        if (!Array.isArray(x)) errors.push({ line, msg: 'accessori: JSON non valido, es. [{"partNr":"TS35","qty":1,"note":"1 m"}]' });
        else d.accessories = x.length ? x.map(a => ({ id: uid('acc'), partNr: String(a.partNr ?? ''), qty: Number(a.qty) || 1, ...(a.note ? { note: String(a.note) } : {}) })) : undefined;
      }
      for (const k of ['endStopQty', 'endPlateQty', 'partNr', 'endStopPartNr', 'endPlatePartNr', 'jumperPartNr', 'separatorPartNr', 'spareParts', 'accessories'] as const) if (d[k] === undefined) delete d[k];
    } else if (cmd === 'connettore') {
      unknown(['tipo', 'genere', 'pin', 'descr', 'custodia']);
      const tag = words[0]?.replace(/^-/, '');
      if (!tag || tag.includes(':')) { errors.push({ line, msg: 'formato: connettore -<sigla> [tipo=ilme-cne-16] [genere=M|F|MF]' }); continue; }
      if (attrs.tipo && !connectorType(attrs.tipo)) { errors.push({ line, msg: `tipo di connettore "${attrs.tipo}" sconosciuto (es. ilme-cne-16, ilme-ck-04)` }); continue; }
      if (attrs.genere && !['M', 'F', 'MF'].includes(attrs.genere.toUpperCase())) { errors.push({ line, msg: 'genere deve essere M, F o MF' }); continue; }
      const d = { ...(work.connectors?.[tag] ?? {}) };
      if (attrs.tipo) d.type = attrs.tipo;
      if (attrs.genere) d.gender = attrs.genere.toUpperCase() as 'M' | 'F' | 'MF';
      if (attrs.pin) d.pins = parseInt(attrs.pin, 10) || undefined;
      if (attrs.descr) d.description = attrs.descr;
      if (attrs.custodia) d.housing = attrs.custodia;
      (work.connectors ??= {})[tag] = d;
    } else if (cmd === 'ripartitore') {
      unknown(['tipo', 'gruppi', 'descr', 'articolo']);
      const tag = words[0]?.replace(/^-/, '');
      const kind = attrs.tipo === undefined ? undefined : lookup(DIST_TEXT, attrs.tipo) ?? null;
      if (!tag || kind === null) { errors.push({ line, msg: 'formato: ripartitore -<sigla> tipo=barra|morsetti|terra gruppi="L1:35:6x4,5 | L2:35:6x4,5"' }); continue; }
      let d = work.distributors?.find(x => x.tag === tag);
      if (!d) { d = { ...newDistributor(work, kind ?? 'bar'), tag }; (work.distributors ??= []).push(d); }
      if (kind) d.kind = kind;
      if (attrs.gruppi !== undefined) {
        const groups = attrs.gruppi.split('|').map(g => g.trim()).filter(Boolean).map(g => {
          const [name, inMax, outs] = g.split(':').map(x => x.trim());
          return { name, ...(inMax ? { inMax: inMax.replace('.', ',') } : {}), outs: parseOuts(outs ?? '') };
        });
        const bad = groups.find(g => !g.name || !g.outs.length);
        if (bad) { errors.push({ line, msg: `gruppo "${bad.name || '?'}": scrivi nome:ingresso:uscite, es. L1:35:6x4,5` }); continue; }
        d.groups = groups;
      }
      if (attrs.descr !== undefined) d.description = attrs.descr || undefined;
      if (attrs.articolo !== undefined) d.partNr = attrs.articolo || undefined;
    } else if (cmd === 'scheda') {
      unknown(['tipo', 'stazione', 'descr', 'articolo', 'nome', 'canali']);
      const tag = words[0]?.replace(/^-/, '');
      const type = attrs.tipo;
      if (!tag) { errors.push({ line, msg: 'formato: scheda -<sigla> tipo=<tipo> [stazione=PLC1]' }); continue; }
      let c = work.plc.cards.find(x => x.tag === tag);
      const isNew = !c;
      if (type && type !== 'custom' && !PLC_CARD_TYPES.some(x => x.id === type)) { errors.push({ line, msg: `tipo di scheda "${type}" sconosciuto (vedi il catalogo) oppure tipo=custom con canali="DI=16;DO=8"` }); continue; }
      if (!c) {
        if (!type) { errors.push({ line, msg: `scheda -${tag} nuova: serve tipo=` }); continue; }
        c = newCard(work, type === 'custom' ? PLC_CARD_TYPES[0].id : type, tag, attrs.stazione ?? work.plc.cards[0]?.station ?? 'PLC1');
        work.plc.cards.push(c);
        warnings.push({ line, msg: `scheda -${tag} creata: gli indirizzi si assegnano dalla vista PLC (Riassegna indirizzi) se servono altri valori` });
      } else if (type && type !== 'custom') c.typeId = type;
      if (type === 'custom') {
        const channels: Partial<Record<IoKind, number>> = {};
        for (const pair of (attrs.canali ?? '').split(/[;,]/)) { const [k, n] = pair.split('='); if (k && ['DI', 'DO', 'AI', 'AO'].includes(k.trim().toUpperCase())) channels[k.trim().toUpperCase() as IoKind] = parseInt(n, 10) || 0; }
        c.typeId = 'custom';
        c.custom = { ...c.custom, name: attrs.nome ?? c.custom?.name ?? tag, channels };
        if (isNew) { const card = c; assignStart({ ...work, plc: { ...work.plc, cards: work.plc.cards.filter(x => x !== card) } }, card); }
      }
      if (attrs.stazione) c.station = attrs.stazione;
      if (attrs.descr) c.description = attrs.descr;
      if (attrs.articolo) c.partNr = attrs.articolo;
    }
  }
}

/** Segnaposto del simbolo di un gruppo di ripartitore mentre si legge il testo (il vero si genera dopo) */
const RIP_PLACEHOLDER: SymbolDef = { id: 'rip', name: 'Ripartitore', category: 'Ripartitori', letter: 'Q', role: 'single', prims: [], pins: [], rotations: [0, 180], noMirror: true };

const ROLE_OF: Record<string, SymbolDef['role']> = { dispositivo: 'single', bobina: 'main', principale: 'main', contatto: 'aux' };

/** Simbolo a scatola da una riga simbolodef: rettangolo con i punti di connessione sui lati */
function boxSymbol(words: string[], attrs: Record<string, string>, line: string): SymbolDef | string {
  const [id, name] = words;
  if (!id || !/^[a-z0-9_-]+$/i.test(id)) return 'formato: simbolodef <id> "<nome>" lettera=U pin="A:0,0 B:0,24"';
  const pins: PinDef[] = [];
  for (const p of (attrs.pin ?? '').split(/\s+/).filter(Boolean)) {
    const m = /^([^:]*):(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(p);
    if (!m) return `simbolodef ${id}: punto "${p}" non valido (nome:x,y)`;
    pins.push({ id: String(pins.length + 1), label: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]), dir: 'up' });
  }
  if (!pins.length) return `simbolodef ${id}: servono i punti di connessione, es. pin="A1:0,0 A2:0,24"`;
  const role = ROLE_OF[(attrs.ruolo ?? 'dispositivo').toLowerCase()];
  if (!role) return `simbolodef ${id}: ruolo "${attrs.ruolo}" sconosciuto (dispositivo, bobina, contatto)`;
  const xs = pins.map(p => p.x), ys = pins.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
  // Lati: punti in alto (y minima) e in basso (y massima); se tutti alla stessa altezza, scatola sotto
  const top = minY, bottom = maxY > minY ? maxY : minY + 16;
  const box = { x: minX - 4, y: top + 4, w: Math.max(8, maxX - minX + 8), h: Math.max(6, bottom - top - 8) };
  const prims: Prim[] = [{ t: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }];
  for (const p of pins) {
    p.dir = p.y <= top ? 'up' : p.y >= bottom ? 'down' : p.x <= minX ? 'left' : 'right';
    if (p.dir === 'up') prims.push({ t: 'line', x1: p.x, y1: p.y, x2: p.x, y2: box.y });
    else if (p.dir === 'down') prims.push({ t: 'line', x1: p.x, y1: p.y, x2: p.x, y2: box.y + box.h });
    else if (p.dir === 'left') prims.push({ t: 'line', x1: p.x, y1: p.y, x2: box.x, y2: p.y });
    else prims.push({ t: 'line', x1: p.x, y1: p.y, x2: box.x + box.w, y2: p.y });
  }
  prims.push({ t: 'text', x: box.x + box.w / 2, y: box.y + box.h / 2 + 1, s: (name ?? id).slice(0, Math.max(3, Math.floor(box.w / 1.4))), size: 2.2 });
  return {
    id, name: name || id, category: attrs.categoria ?? 'Definiti da testo', letter: (attrs.lettera ?? 'A').toUpperCase(), role,
    contact: role === 'aux' ? 'NO' : undefined, prims, pins, tagPos: { x: box.x - 2, y: box.y + 3 }, source: 'Formato testo', textDef: line,
  };
}
