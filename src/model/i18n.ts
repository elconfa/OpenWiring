// Testi multilingua: i testi del progetto si scrivono in italiano e il dizionario di progetto
// ne contiene le traduzioni (inglese, tedesco). Schemi e PDF si mostrano nella lingua scelta,
// anche in due lingue insieme ("Motore pompa / Pump motor").
import type { Project, Lang, Part } from './types';
import { buildDevices, deviceInfo, partsIndex } from './devices';

export const LANGS: { id: Lang; name: string }[] = [
  { id: 'it', name: 'Italiano' },
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];

export const TARGET_LANGS: Exclude<Lang, 'it'>[] = ['en', 'de'];

/**
 * Dizionario incluso: testi fissi di cartigli e liste e termini elettrici comuni.
 * Chiave in italiano minuscolo → [inglese, tedesco].
 */
const BUILTIN: Record<string, [string, string]> = {
  // Cartiglio, copertina, indice
  'ditta': ['Company', 'Firma'],
  'progetto': ['Project', 'Projekt'],
  'pagina': ['Page', 'Seite'],
  'pag.': ['Page', 'Seite'],
  'cliente': ['Customer', 'Kunde'],
  'data / autore': ['Date / Author', 'Datum / Bearbeiter'],
  'data': ['Date', 'Datum'],
  'autore': ['Author', 'Bearbeiter'],
  'disegno n.': ['Drawing no.', 'Zeichnungsnr.'],
  'dis.': ['Dwg.', 'Zchn.'],
  'rev.': ['Rev.', 'Rev.'],
  'revisione': ['Revision', 'Revision'],
  'revisioni': ['Revisions', 'Revisionen'],
  'nessuna revisione congelata': ['No revisions', 'Keine Revisionen'],
  'redatto': ['Drawn', 'Erstellt'],
  'verificato': ['Checked', 'Geprüft'],
  'approvato': ['Approved', 'Freigegeben'],
  'indice': ['Table of contents', 'Inhaltsverzeichnis'],
  'liste': ['Reports', 'Auswertungen'],
  'schemi': ['Schematics', 'Schaltpläne'],
  'pag. pdf': ['PDF page', 'PDF-Seite'],
  'commessa': ['Job no.', 'Auftrag'],
  'impianto': ['Plant', 'Anlage'],
  'copertina': ['Cover sheet', 'Deckblatt'],
  // Titoli delle liste
  'distinta materiali': ['Bill of materials', 'Stückliste'],
  'lista dispositivi': ['Device list', 'Betriebsmittelliste'],
  'lista morsetti': ['Terminal diagram', 'Klemmenplan'],
  'lista connessioni': ['Connection list', 'Verbindungsliste'],
  'lista fili (cablaggio)': ['Wire list (wiring)', 'Drahtliste (Verdrahtung)'],
  'lista connettori': ['Connector list', 'Steckerliste'],
  'lista cavi': ['Cable list', 'Kabelliste'],
  'collegamenti cavi': ['Cable connections', 'Kabelanschlussplan'],
  'collegamenti di rete': ['Network connections', 'Netzwerkverbindungen'],
  'nodi di rete': ['Network nodes', 'Netzwerkteilnehmer'],
  'piano indirizzi ip': ['IP address plan', 'IP-Adressplan'],
  'lista i/o plc': ['PLC I/O list', 'SPS-E/A-Liste'],
  'layout quadro': ['Cabinet layout', 'Schaltschrankaufbau'],
  'panoramica plc': ['PLC overview', 'SPS-Übersicht'],
  'schema morsettiera': ['Terminal strip diagram', 'Klemmenplan'],
  // Colonne delle liste
  'a': ['To', 'Nach'],
  'da': ['From', 'Von'],
  'articolo': ['Part', 'Artikel'],
  'canale': ['Channel', 'Kanal'],
  'cavo': ['Cable', 'Kabel'],
  'codice articolo': ['Part number', 'Artikelnummer'],
  'codice ordinazione': ['Order number', 'Bestellnummer'],
  'collegato a': ['Connected to', 'Angeschlossen an'],
  'colore': ['Colour', 'Farbe'],
  'commento': ['Comment', 'Kommentar'],
  'conduttore': ['Conductor', 'Ader'],
  'connettore': ['Connector', 'Steckverbinder'],
  'costruttore': ['Manufacturer', 'Hersteller'],
  'dati tecnici': ['Technical data', 'Technische Daten'],
  'descrizione': ['Description', 'Beschreibung'],
  'dispositivo': ['Device', 'Betriebsmittel'],
  'elementi e posizione': ['Elements and location', 'Elemente und Position'],
  'esterno (sopra)': ['External (top)', 'Extern (oben)'],
  'fili': ['Wires', 'Drähte'],
  'filo est.': ['Ext. wire', 'Draht ext.'],
  'filo int.': ['Int. wire', 'Draht int.'],
  'formazione': ['Construction', 'Aufbau'],
  'gateway': ['Gateway', 'Gateway'],
  'indirizzo': ['Address', 'Adresse'],
  'indirizzo ip': ['IP address', 'IP-Adresse'],
  'interno (sotto)': ['Internal (bottom)', 'Intern (unten)'],
  'lato 1': ['Side 1', 'Seite 1'],
  'lato 2': ['Side 2', 'Seite 2'],
  'liberi': ['Spare', 'Frei'],
  'lunghezza (m)': ['Length (m)', 'Länge (m)'],
  'luogo': ['Location', 'Ort'],
  'maschera': ['Subnet mask', 'Subnetzmaske'],
  'morsettiera': ['Terminal strip', 'Klemmleiste'],
  'morsetto': ['Terminal', 'Klemme'],
  'n.': ['No.', 'Nr.'],
  'n. filo': ['Wire no.', 'Drahtnr.'],
  'nome dispositivo': ['Device name', 'Gerätename'],
  'nome simbolico': ['Symbol name', 'Symbolname'],
  'note': ['Notes', 'Bemerkungen'],
  'piano': ['Level', 'Etage'],
  'pin': ['Pin', 'Pin'],
  'pin usati': ['Pins used', 'Belegte Pins'],
  'ponticello': ['Jumper', 'Brücke'],
  'pos.': ['Item', 'Pos.'],
  'posizione': ['Location', 'Position'],
  'protocolli': ['Protocols', 'Protokolle'],
  'protocollo': ['Protocol', 'Protokoll'],
  'puntale a': ['Ferrule to', 'Aderendhülse nach'],
  'puntale da': ['Ferrule from', 'Aderendhülse von'],
  'q.tà': ['Qty', 'Menge'],
  'quadro': ['Cabinet', 'Schaltschrank'],
  'rete': ['Network', 'Netz'],
  'scheda': ['Module', 'Baugruppe'],
  'sezione': ['Cross-section', 'Querschnitt'],
  'sigla': ['Designation', 'BMK'],
  'sigle': ['Designations', 'BMK'],
  'tipo': ['Type', 'Typ'],
  'usati': ['Used', 'Belegt'],
  'destinazione esterna': ['External destination', 'Ziel extern'],
  'destinazione interna': ['Internal destination', 'Ziel intern'],
  'filo': ['Wire', 'Draht'],
  'riserva': ['Spare', 'Reserve'],
  'tra quadri': ['between cabinets', 'zwischen Schränken'],
  'libero': ['spare', 'frei'],
  'scorta': ['spare', 'Reserve'],
  'stazione': ['station', 'Station'],
  'scheda plc': ['PLC module', 'SPS-Baugruppe'],
  // Titoli di pagina tipici
  'schema': ['Schematic', 'Schaltplan'],
  'schema elettrico': ['Wiring diagram', 'Schaltplan'],
  'schema di rete': ['Network diagram', 'Netzwerkplan'],
  'schema unifilare': ['Single-line diagram', 'Übersichtsschaltplan'],
  'schema unifilare di potenza': ['Single-line power diagram', 'Übersichtsschaltplan Leistung'],
  'circuito di comando': ['Control circuit', 'Steuerstromkreis'],
  'circuito di potenza': ['Power circuit', 'Hauptstromkreis'],
  'circuiti ausiliari': ['Auxiliary circuits', 'Hilfsstromkreise'],
  'potenza': ['Power', 'Leistung'],
  'alimentazione': ['Power supply', 'Einspeisung'],
  'alimentazione 24 v': ['24 V supply', 'Versorgung 24 V'],
  'potenza e alimentazione 24 v': ['Power and 24 V supply', 'Leistung und Versorgung 24 V'],
  'ingressi e uscite plc': ['PLC inputs and outputs', 'SPS-Ein- und Ausgänge'],
  'ingressi plc': ['PLC inputs', 'SPS-Eingänge'],
  'uscite plc': ['PLC outputs', 'SPS-Ausgänge'],
  'layout': ['Layout', 'Aufbau'],
  'note generali': ['General notes', 'Allgemeine Hinweise'],
  'avviamento motore pompa': ['Pump motor starter', 'Anlauf Pumpenmotor'],
  'esempio openwiring': ['OpenWiring example', 'OpenWiring-Beispiel'],
  // Luoghi
  'quadro elettrico': ['Control cabinet', 'Schaltschrank'],
  'quadro master': ['Master cabinet', 'Master-Schaltschrank'],
  'pulsantiera': ['Operator station', 'Bedienstelle'],
  'bordo macchina': ['On machine', 'An der Maschine'],
  'cassetta di derivazione': ['Junction box', 'Klemmenkasten'],
  'campo': ['Field', 'Feld'],
  'altro': ['Other', 'Sonstiges'],
  // Componenti
  'motore': ['Motor', 'Motor'],
  'pompa': ['Pump', 'Pumpe'],
  'pompa di rilancio': ['Booster pump', 'Druckerhöhungspumpe'],
  'motore pompa': ['Pump motor', 'Pumpenmotor'],
  'ventilatore': ['Fan', 'Lüfter'],
  'ventilatore quadro': ['Cabinet fan', 'Schaltschranklüfter'],
  'compressore': ['Compressor', 'Kompressor'],
  'nastro trasportatore': ['Conveyor belt', 'Förderband'],
  'valvola': ['Valve', 'Ventil'],
  'elettrovalvola': ['Solenoid valve', 'Magnetventil'],
  'elettrovalvola di scarico': ['Drain solenoid valve', 'Magnetventil Ablass'],
  'resistenza': ['Resistor', 'Widerstand'],
  'resistenza di terminazione': ['Terminating resistor', 'Abschlusswiderstand'],
  'riscaldatore': ['Heater', 'Heizung'],
  'resistenza anticondensa': ['Anti-condensation heater', 'Heizung Schaltschrank'],
  'termostato': ['Thermostat', 'Thermostat'],
  'pressostato': ['Pressure switch', 'Druckschalter'],
  'flussostato': ['Flow switch', 'Strömungswächter'],
  'galleggiante': ['Float switch', 'Schwimmerschalter'],
  'sensore': ['Sensor', 'Sensor'],
  'sensore induttivo': ['Inductive sensor', 'Induktiver Sensor'],
  'sensore capacitivo': ['Capacitive sensor', 'Kapazitiver Sensor'],
  'sensore di livello': ['Level sensor', 'Füllstandssensor'],
  'sensore di temperatura': ['Temperature sensor', 'Temperatursensor'],
  'sensore di pressione': ['Pressure sensor', 'Drucksensor'],
  'fotocellula': ['Photoelectric sensor', 'Lichtschranke'],
  'finecorsa': ['Limit switch', 'Endschalter'],
  'encoder': ['Encoder', 'Drehgeber'],
  'inverter': ['Inverter', 'Frequenzumrichter'],
  'inverter pompa': ['Pump inverter', 'Frequenzumrichter Pumpe'],
  'convertitore di frequenza': ['Frequency converter', 'Frequenzumrichter'],
  'avviatore': ['Motor starter', 'Motorstarter'],
  'avviatore statico': ['Soft starter', 'Sanftanlasser'],
  'salvamotore': ['Motor protection switch', 'Motorschutzschalter'],
  'salvamotore pompa': ['Pump motor protection switch', 'Motorschutzschalter Pumpe'],
  'interruttore': ['Switch', 'Schalter'],
  'interruttore generale': ['Main switch', 'Hauptschalter'],
  'interruttore automatico': ['Circuit breaker', 'Leitungsschutzschalter'],
  'interruttore magnetotermico': ['Miniature circuit breaker', 'Leitungsschutzschalter'],
  'interruttore differenziale': ['Residual current device', 'FI-Schutzschalter'],
  'differenziale': ['Residual current device', 'FI-Schutzschalter'],
  'sezionatore': ['Disconnector', 'Trennschalter'],
  'sezionatore generale': ['Main disconnector', 'Haupttrennschalter'],
  'fusibile': ['Fuse', 'Sicherung'],
  'portafusibile': ['Fuse holder', 'Sicherungshalter'],
  'contattore': ['Contactor', 'Schütz'],
  'contattore pompa': ['Pump contactor', 'Schütz Pumpe'],
  'contattore di linea': ['Line contactor', 'Netzschütz'],
  'contattore stella': ['Star contactor', 'Sternschütz'],
  'contattore triangolo': ['Delta contactor', 'Dreieckschütz'],
  'relè': ['Relay', 'Relais'],
  'relè ausiliario': ['Auxiliary relay', 'Hilfsrelais'],
  'relè termico': ['Thermal overload relay', 'Thermisches Überlastrelais'],
  'relè di sicurezza': ['Safety relay', 'Sicherheitsrelais'],
  'temporizzatore': ['Timer relay', 'Zeitrelais'],
  'trasformatore': ['Transformer', 'Transformator'],
  'alimentatore': ['Power supply unit', 'Netzteil'],
  'alimentatore 24 v': ['24 V power supply unit', 'Netzteil 24 V'],
  'protezione alimentatore': ['Power supply protection', 'Absicherung Netzteil'],
  'alimentazione pompa': ['Pump supply', 'Einspeisung Pumpe'],
  'pulsante': ['Push button', 'Taster'],
  'pulsante marcia': ['Start button', 'Taster Start'],
  'pulsante arresto': ['Stop button', 'Taster Stopp'],
  'pulsante reset': ['Reset button', 'Taster Quittieren'],
  'arresto di emergenza': ['Emergency stop', 'Not-Halt'],
  'arresto emergenza': ['Emergency stop', 'Not-Halt'],
  'fungo di emergenza': ['Emergency stop button', 'Not-Halt-Taster'],
  'selettore': ['Selector switch', 'Wahlschalter'],
  'selettore manuale/automatico': ['Manual/automatic selector', 'Wahlschalter Hand/Automatik'],
  'lampada': ['Lamp', 'Leuchte'],
  'spia': ['Indicator light', 'Meldeleuchte'],
  'lampada di segnalazione': ['Indicator light', 'Meldeleuchte'],
  'segnalatore acustico': ['Buzzer', 'Summer'],
  'sirena': ['Siren', 'Sirene'],
  'presa': ['Socket', 'Steckdose'],
  'spina': ['Plug', 'Stecker'],
  'switch': ['Switch', 'Switch'],
  'switch profinet': ['Profinet switch', 'Profinet-Switch'],
  'i/o remoto': ['Remote I/O', 'Dezentrale Peripherie'],
  'cpu compatta': ['Compact CPU', 'Kompakt-CPU'],
  'cpu': ['CPU', 'CPU'],
  'plc': ['PLC', 'SPS'],
  'pannello operatore': ['Operator panel', 'Bediengerät'],
  'illuminazione': ['Lighting', 'Beleuchtung'],
  'illuminazione quadro': ['Cabinet lighting', 'Schaltschrankbeleuchtung'],
  'prese di servizio': ['Service sockets', 'Servicesteckdosen'],
  'condizionatore': ['Air conditioner', 'Klimagerät'],
  'morsetto di terra': ['Earth terminal', 'Schutzleiterklemme'],
  'barra di terra': ['Earth bar', 'Erdungsschiene'],
  'messa a terra': ['Earthing', 'Erdung'],
  // Funzioni e stati
  'marcia': ['Run', 'Betrieb'],
  'marcia pompa': ['Pump run', 'Pumpe Ein'],
  'pompa in marcia': ['Pump running', 'Pumpe läuft'],
  'pompa ferma': ['Pump stopped', 'Pumpe steht'],
  'arresto': ['Stop', 'Stopp'],
  'avvio': ['Start', 'Start'],
  'avvio ciclo': ['Cycle start', 'Zyklusstart'],
  'avvio ciclo automatico': ['Automatic cycle start', 'Start Automatikzyklus'],
  'livello minimo': ['Minimum level', 'Mindestfüllstand'],
  'livello massimo': ['Maximum level', 'Maximalfüllstand'],
  'livello minimo vasca': ['Tank minimum level', 'Mindestfüllstand Behälter'],
  'livello massimo vasca': ['Tank maximum level', 'Maximalfüllstand Behälter'],
  'guasto': ['Fault', 'Störung'],
  'allarme': ['Alarm', 'Alarm'],
  'allarme generale': ['General alarm', 'Sammelstörung'],
  'anomalia': ['Fault', 'Störung'],
  'reset': ['Reset', 'Quittieren'],
  'ripristino': ['Reset', 'Rücksetzen'],
  'automatico': ['Automatic', 'Automatik'],
  'manuale': ['Manual', 'Hand'],
  'presenza tensione': ['Power on', 'Spannung vorhanden'],
  'avanti': ['Forward', 'Vorwärts'],
  'indietro': ['Reverse', 'Rückwärts'],
  'salita': ['Up', 'Auf'],
  'discesa': ['Down', 'Ab'],
  'apertura': ['Open', 'Öffnen'],
  'chiusura': ['Close', 'Schließen'],
  'aperto': ['Open', 'Offen'],
  'chiuso': ['Closed', 'Geschlossen'],
  'protezione': ['Protection', 'Schutz'],
  'sovraccarico': ['Overload', 'Überlast'],
  'intervento termico': ['Thermal trip', 'Überlast ausgelöst'],
  'comando': ['Control', 'Steuerung'],
  'sicurezza': ['Safety', 'Sicherheit'],
  'porta': ['Door', 'Tür'],
  'porta quadro': ['Cabinet door', 'Schaltschranktür'],
  'riscaldamento': ['Heating', 'Heizung'],
  'raffreddamento': ['Cooling', 'Kühlung'],
  'ventilazione': ['Ventilation', 'Lüftung'],
  'stella-triangolo': ['Star-delta', 'Stern-Dreieck'],
  'stella': ['Star', 'Stern'],
  'triangolo': ['Delta', 'Dreieck'],
  'temperatura': ['Temperature', 'Temperatur'],
  'pressione': ['Pressure', 'Druck'],
  'velocità': ['Speed', 'Drehzahl'],
  'livello': ['Level', 'Füllstand'],
  'vasca': ['Tank', 'Behälter'],
  'serbatoio': ['Tank', 'Tank'],
  'acqua': ['Water', 'Wasser'],
  'aria': ['Air', 'Luft'],
  'olio': ['Oil', 'Öl'],
  'scarico': ['Drain', 'Ablass'],
  'carico': ['Fill', 'Befüllung'],
  'linea': ['Line', 'Netz'],
  'terra': ['Earth', 'Erde'],
  'neutro': ['Neutral', 'Neutralleiter'],
  'fase': ['Phase', 'Phase'],
  'tensione': ['Voltage', 'Spannung'],
  'corrente': ['Current', 'Strom'],
  'ingresso': ['Input', 'Eingang'],
  'uscita': ['Output', 'Ausgang'],
  'ingressi': ['Inputs', 'Eingänge'],
  'uscite': ['Outputs', 'Ausgänge'],
  'ingressi digitali': ['Digital inputs', 'Digitale Eingänge'],
  'uscite digitali': ['Digital outputs', 'Digitale Ausgänge'],
  'ingressi analogici': ['Analog inputs', 'Analoge Eingänge'],
  'uscite analogiche': ['Analog outputs', 'Analoge Ausgänge'],
  'master io-link': ['IO-Link master', 'IO-Link-Master'],
  'slave': ['Slave', 'Slave'],
  'master': ['Master', 'Master'],
  'ciclo': ['Cycle', 'Zyklus'],
  'emergenza': ['Emergency', 'Not'],
  'generale': ['Main', 'Haupt'],
  'ausiliario': ['Auxiliary', 'Hilfs'],
  'segnalazione': ['Signal', 'Meldung'],
  'minimo': ['Minimum', 'Minimum'],
  'massimo': ['Maximum', 'Maximum'],
  'rete macchina': ['Machine network', 'Maschinennetz'],
};

const PREPOSITIONS = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'per', 'da']);

export const builtinTranslation = (text: string, lang: Lang): string | undefined => {
  if (lang === 'it') return text;
  const e = BUILTIN[text.trim().toLowerCase()];
  return e ? matchCase(text.trim(), e[lang === 'en' ? 0 : 1], lang) : undefined;
};

/** Mantiene la minuscola iniziale come nel testo di partenza (non in tedesco: i nomi sono maiuscoli) */
function matchCase(src: string, out: string, lang: Lang): string {
  if (!src || !out || lang === 'de') return out;
  const first = src[0];
  if (first === first.toLowerCase() && first !== first.toUpperCase()) return out[0].toLowerCase() + out.slice(1);
  return out;
}

/** Parte finale non traducibile: numeri, sigle e grandezze ("Pompa 2", "Motore -1M1", "24 V") */
const TAIL = /(\s+(?:[-+=][\w.:]+|\d[\w.,/]*\s*(?:v|a|kw|w|hz|°c|bar|mm²?|m)?(?:\s*(?:ac|dc))?))+$/i;

/**
 * Traduzione proposta: frase intera dal dizionario, altrimenti parola per parola
 * (inglese con le parole in ordine inverso, come "Lampada guasto" → "Fault lamp").
 * Restituisce undefined se una parola non è nel dizionario.
 */
export function proposeTranslation(text: string, lang: Exclude<Lang, 'it'>, dict?: Project['dictionary']): string | undefined {
  const src = text.trim();
  if (!src) return undefined;
  const exact = dict?.[src]?.[lang] ?? builtinTranslation(src, lang);
  if (exact) return exact;
  const tail = TAIL.exec(src)?.[0] ?? '';
  const head = src.slice(0, src.length - tail.length).trim();
  if (!head || /^\d/.test(head)) return undefined;
  if (tail) { const h = dict?.[head]?.[lang] ?? builtinTranslation(head, lang); if (h) return `${h}${tail}`; }
  const words = head.split(/\s+/).filter(w => !PREPOSITIONS.has(w.toLowerCase()));
  // Coppie e terne note come frase ("motore pompa") prima delle singole parole
  const out: string[] = [];
  for (let i = 0; i < words.length;) {
    let found: string | undefined; let n = 0;
    for (let k = Math.min(3, words.length - i); k >= 1 && !found; k--) {
      const phrase = words.slice(i, i + k).join(' ');
      found = dict?.[phrase]?.[lang] ?? BUILTIN[phrase.toLowerCase()]?.[lang === 'en' ? 0 : 1];
      n = k;
    }
    if (!found) return undefined;
    out.push(found);
    i += n;
  }
  const ordered = lang === 'en' ? out.reverse() : out;
  const lowerFirst = (w: string) => (/[A-Z]/.test(w.slice(1)) ? w : w[0].toLowerCase() + w.slice(1));
  const joined = ordered.map((w, i) => (i && lang === 'en' ? lowerFirst(w) : w)).join(' ');
  return `${matchCase(src, joined, lang)}${tail}`;
}

/** Traduzione di un testo nella lingua indicata: dizionario di progetto, poi dizionario incluso */
export function translateText(project: Project, text: string, lang: Lang): string {
  if (lang === 'it' || !text) return text;
  const t = text.trim();
  const exact = project.dictionary?.[t]?.[lang] || builtinTranslation(t, lang);
  if (exact) return exact;
  // Testo con sigla o numero in coda ("Panoramica PLC -3A1", "Pompa 2")
  const tail = TAIL.exec(t)?.[0];
  if (tail) {
    const head = t.slice(0, t.length - tail.length).trim();
    const h = head && (project.dictionary?.[head]?.[lang] || builtinTranslation(head, lang));
    if (h) return `${h}${tail}`;
  }
  return text;
}

/** Testo fisso nella sola lingua di visualizzazione (per etichette corte come "Pag.") */
export const translateFixed = (project: Project, text: string) => translateText(project, text, project.languages?.display ?? 'it');

/** Celle di una lista da tradurre: testi con almeno una parola (non sigle, numeri o posizioni) */
const translatableCell = (s: string) => /\p{L}{3}/u.test(s) && !/^[-+=]/.test(s) && !/^\d/.test(s);

/** Lista tradotta: titolo, intestazioni e celle con testi del dizionario */
export function translateTable<T extends { title: string; columns: string[]; rows: string[][] }>(project: Project, table: T): T {
  const { t, lang, second } = translator(project);
  if (lang === 'it' && !second) return table;
  return { ...table, title: t(table.title), columns: table.columns.map(c => translateFixed(project, c)), rows: table.rows.map(r => r.map(c => (c && translatableCell(c) ? t(c) : c))) };
}

export interface Translator {
  lang: Lang;
  second?: Lang;
  /** Testo nella lingua (o nelle due lingue) di visualizzazione */
  t(text: string | undefined): string;
}

const cache = new WeakMap<Project, Translator>();

/** Traduttore del progetto per schemi e PDF (con la lingua di visualizzazione impostata) */
export function translator(project: Project): Translator {
  const hit = cache.get(project);
  if (hit) return hit;
  const lang = project.languages?.display ?? 'it';
  const second = project.languages?.second && project.languages.second !== lang ? project.languages.second : undefined;
  const memo = new Map<string, string>();
  const tr: Translator = {
    lang, second,
    t(text) {
      if (!text) return text ?? '';
      if (lang === 'it' && !second) return text;
      const m = memo.get(text);
      if (m !== undefined) return m;
      const a = translateText(project, text, lang);
      const b = second ? translateText(project, text, second) : undefined;
      const r = b && b !== a ? `${a} / ${b}` : a;
      memo.set(text, r);
      return r;
    },
  };
  cache.set(project, tr);
  return tr;
}

export interface ProjectText {
  text: string;
  /** Dove compare, es. "Pag. 2 titolo", "-2K1 descrizione" */
  where: string[];
}

/** Testi traducibili del progetto: titoli di pagina, testi liberi, descrizioni, luoghi, commenti PLC */
export function projectTexts(project: Project, library: Part[] = []): ProjectText[] {
  const m = new Map<string, Set<string>>();
  const add = (text: string | undefined, where: string) => {
    const t = text?.trim();
    if (!t || !/\p{L}{2}/u.test(t)) return;
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(where);
  };
  add(project.info.name, 'Progetto');
  add(project.info.description, 'Progetto');
  for (const pg of project.pages) {
    add(pg.title, `Pag. ${pg.name} titolo`);
    for (const e of pg.elements) if (e.kind === 'text') add(e.text, `Pag. ${pg.name} testo`);
  }
  const parts = partsIndex(project, library);
  for (const d of buildDevices(project).values()) {
    const info = deviceInfo(d.elements, d.main, parts);
    add(info.description, `-${d.tag}`);
    for (const e of d.elements) if (e.inst.plcComment) add(e.inst.plcComment, `-${d.tag} commento PLC`);
  }
  for (const p of project.panels ?? []) { add(p.name, `+${p.code}`); add(p.kind, `+${p.code} tipo`); }
  for (const c of project.cables ?? []) add(c.description, `-${c.tag}`);
  for (const [k, c] of Object.entries(project.connectors ?? {})) add(c.description, `-${k}`);
  for (const c of project.plc.cards) {
    add(c.description, `-${c.tag}`);
    for (const io of Object.values(c.io ?? {})) add(io.comment, `-${c.tag} commento PLC`);
  }
  for (const f of project.titleBlock?.fields ?? []) add(f.label, 'Cartiglio');
  return [...m.entries()].map(([text, w]) => ({ text, where: [...w] })).sort((a, b) => a.text.localeCompare(b.text));
}

/**
 * Riempie le traduzioni mancanti con quelle proposte dal dizionario. Le proposte parola per
 * parola sono segnate come da verificare. Restituisce quante traduzioni sono state aggiunte.
 */
export function autoTranslate(project: Project, library: Part[] = [], langs = TARGET_LANGS): { added: number; missing: number } {
  const dict = (project.dictionary ??= {});
  let added = 0, missing = 0;
  for (const { text } of projectTexts(project, library)) {
    for (const lang of langs) {
      if (dict[text]?.[lang]) continue;
      if (translateText(project, text, lang) !== text) continue; // già tradotto dal dizionario incluso
      const p = proposeTranslation(text, lang, project.dictionary);
      if (!p) { missing++; continue; }
      dict[text] = { ...dict[text], [lang]: p };
      (dict[text].auto ??= []).includes(lang) || dict[text].auto!.push(lang);
      added++;
    }
  }
  return { added, missing };
}

/** Dizionario come tabella CSV (Italiano;English;Deutsch) da far tradurre fuori dal programma */
export function dictionaryCsv(project: Project, library: Part[] = []): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['Italiano', 'English', 'Deutsch'], ...projectTexts(project, library).map(({ text }) => [text, ...TARGET_LANGS.map(l => translateText(project, text, l) === text && !project.dictionary?.[text]?.[l] ? '' : translateText(project, text, l))])];
  return '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
}

/** Legge un CSV Italiano;English;Deutsch (anche separato da virgole o tabulazioni) */
export function parseDictionaryCsv(txt: string): Record<string, Partial<Record<Lang, string>>> {
  const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return {};
  const sep = [';', '\t', ','].find(s => lines[0].includes(s)) ?? ';';
  const parse = (l: string) => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const head = parse(lines[0]).map(h => h.toLowerCase());
  const col = (names: string[]) => head.findIndex(h => names.some(n => h.startsWith(n)));
  const it = Math.max(0, col(['ital', 'it'])), en = col(['engl', 'en', 'ingl']), de = col(['deut', 'de', 'tedes']);
  const out: Record<string, Partial<Record<Lang, string>>> = {};
  for (const l of lines.slice(1)) {
    const r = parse(l);
    const k = r[it];
    if (!k) continue;
    const e: Partial<Record<Lang, string>> = {};
    if (en >= 0 && r[en]) e.en = r[en];
    if (de >= 0 && r[de]) e.de = r[de];
    if (e.en || e.de) out[k] = e;
  }
  return out;
}
