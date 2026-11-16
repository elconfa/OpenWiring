// Funzione dei simboli (DA_FARE 164): l'id dice che è lo stesso simbolo, la funzione dice cosa fa.
// Elenco di funzioni raggruppate (protezioni, comandi, contatti, PLC…), ricavato dall'analisi della
// libreria QElectroTech importata (8.800 simboli), più quelle aggiunte dall'utente. Ogni simbolo ha
// al più una funzione (SymbolDef.func); guessFunction la propone dal nome, dalla cartella, dalla
// lettera e dai punti di connessione, all'import e con «Assegna le funzioni…».
import type { SymbolDef } from './types';
import { tn } from '../i18n/ui';

export interface SymbolFunction {
  /** Codice stabile (es. "contatto-na"); quelli dell'utente cominciano con "u-" */
  id: string;
  name: string;
  group: string;
  /** Lettera IEC 81346 tipica, proposta per i simboli nuovi */
  letter?: string;
  /** Numero della norma IEC 60617, quando la funzione corrisponde a un simbolo della norma */
  iec60617?: string;
  description?: string;
}

/** Riconoscimento: testo "cartella/nome" senza accenti e in minuscolo */
interface Rule { id: string; re: RegExp; when?: (s: SymbolDef) => boolean }

// Gruppi nell'ordine dell'elenco
export const FUNCTION_GROUPS = [
  tn('Alimentazione'), tn('Protezioni'), tn('Manovra e sezionamento'), tn('Comandi'), tn('Relè e contattori'),
  tn('Sensori'), tn('Misura'), tn('Segnalazione'), tn('Utilizzatori'), tn('Azionamenti'), tn('PLC e automazione'),
  tn('Sicurezza'), tn('Reti e domotica'), tn('Morsetti e collegamenti'), tn('Elettronica'), tn('Porte logiche'),
  tn('Pneumatica'), tn('Idraulica e termotecnica'), tn('Impianti civili'), tn('Quadro e montaggio'), tn('Grafica e documentazione'), tn('Altro'),
] as const;

const F = (id: string, name: string, group: string, letter?: string, iec60617?: string): SymbolFunction => ({ id, name, group, letter, iec60617 });
const [ALIM, PROT, MAN, CMD, REL, SENS, MIS, SEGN, UTIL, AZ, PLC, SAFE, NET, MORS, ELN, LOG, PNEU, IDR, CIV, QUADRO, GRAF, ALTRO] = FUNCTION_GROUPS;

export const BUILTIN_FUNCTIONS: SymbolFunction[] = [
  // Alimentazione
  F('alimentatore', tn('Alimentatore'), ALIM, 'T'),
  F('trasformatore-1f', tn('Trasformatore monofase'), ALIM, 'T', 'S00841'),
  F('trasformatore-3f', tn('Trasformatore trifase'), ALIM, 'T'),
  F('autotrasformatore', tn('Autotrasformatore'), ALIM, 'T'),
  F('trasformatore-corrente', tn('Trasformatore di corrente'), ALIM, 'T'),
  F('batteria', tn('Batteria, accumulatore'), ALIM, 'G'),
  F('generatore', tn('Generatore'), ALIM, 'G'),
  F('sorgente', tn('Sorgente, rete di alimentazione'), ALIM, 'G'),
  F('ups', tn('Gruppo di continuità (UPS)'), ALIM, 'G'),
  F('fotovoltaico', tn('Modulo fotovoltaico'), ALIM, 'G'),
  F('regolatore-tensione', tn('Regolatore di tensione'), ALIM, 'T'),
  F('avvolgimento', tn('Avvolgimento'), ALIM, 'T'),
  // Protezioni
  F('magnetotermico', tn('Interruttore magnetotermico'), PROT, 'Q'),
  F('differenziale', tn('Interruttore differenziale'), PROT, 'Q'),
  F('magnetotermico-differenziale', tn('Magnetotermico differenziale'), PROT, 'Q'),
  F('interruttore-automatico', tn('Interruttore automatico di potenza'), PROT, 'Q', 'S00287'),
  F('avviatore', tn('Avviatore motore (diretto, invertitore)'), PROT, 'Q'),
  F('salvamotore', tn('Salvamotore'), PROT, 'Q'),
  F('rele-termico', tn('Relè termico'), PROT, 'F'),
  F('fusibile', tn('Fusibile'), PROT, 'F', 'S00362'),
  F('sezionatore-fusibile', tn('Sezionatore con fusibili'), PROT, 'Q'),
  F('scaricatore', tn('Scaricatore di sovratensione (SPD)'), PROT, 'F'),
  F('protezione-elettronica', tn('Protezione elettronica dei circuiti (24 V DC)'), PROT, 'F'),
  F('rele-protezione', tn('Relè di protezione e controllo (tensione, fase, isolamento)'), PROT, 'K'),
  // Manovra e sezionamento
  F('sezionatore', tn('Sezionatore, interruttore di manovra'), MAN, 'Q', 'S00288'),
  F('commutatore-camme', tn('Commutatore a camme'), MAN, 'S'),
  F('invertitore', tn('Invertitore, commutatore di rete'), MAN, 'Q'),
  // Comandi
  F('pulsante-na', tn('Pulsante NA'), CMD, 'S', 'S00254'),
  F('pulsante-nc', tn('Pulsante NC'), CMD, 'S'),
  F('pulsante', tn('Pulsante'), CMD, 'S'),
  F('pulsante-luminoso', tn('Pulsante luminoso'), CMD, 'S'),
  F('emergenza', tn('Pulsante di emergenza'), CMD, 'S'),
  F('selettore', tn('Selettore'), CMD, 'S'),
  F('selettore-chiave', tn('Selettore a chiave'), CMD, 'S'),
  F('interruttore-comando', tn('Interruttore di comando'), CMD, 'S'),
  F('finecorsa', tn('Finecorsa'), CMD, 'B'),
  F('pedale', tn('Pedale'), CMD, 'S'),
  F('joystick', tn('Joystick, manipolatore'), CMD, 'S'),
  F('potenziometro', tn('Potenziometro'), CMD, 'R'),
  F('pulsantiera', tn('Pulsantiera, tastierino'), CMD, 'S'),
  // Relè e contattori
  F('bobina', tn('Bobina di relè o contattore'), REL, 'K', 'S00305'),
  F('bobina-temporizzata', tn('Bobina temporizzata'), REL, 'K'),
  F('contatto-na', tn('Contatto NA'), REL, 'K', 'S00227'),
  F('contatto-nc', tn('Contatto NC'), REL, 'K', 'S00229'),
  F('contatto-scambio', tn('Contatto in scambio'), REL, 'K', 'S00230'),
  F('contatto-temporizzato', tn('Contatto temporizzato'), REL, 'K'),
  F('contatti-potenza', tn('Contatti di potenza'), REL, 'Q'),
  F('contattore', tn('Contattore'), REL, 'Q'),
  F('rele', tn('Relè'), REL, 'K'),
  F('rele-statico', tn('Relè statico (SSR)'), REL, 'K'),
  F('rele-impulsi', tn('Relè a impulsi, passo-passo'), REL, 'K'),
  F('temporizzatore', tn('Temporizzatore'), REL, 'K'),
  F('rif-incrociato', tn('Riferimento incrociato (contatto o bobina)'), REL),
  // Sensori
  F('sensore-induttivo', tn('Sensore induttivo'), SENS, 'B'),
  F('sensore-capacitivo', tn('Sensore capacitivo'), SENS, 'B'),
  F('sensore-ottico', tn('Sensore ottico, fotocellula'), SENS, 'B'),
  F('sensore-magnetico', tn('Sensore magnetico, reed'), SENS, 'B'),
  F('pressostato', tn('Pressostato, sensore di pressione'), SENS, 'B'),
  F('termostato', tn('Termostato'), SENS, 'B'),
  F('sonda-temperatura', tn('Sonda di temperatura (PT100, termocoppia)'), SENS, 'B'),
  F('flussostato', tn('Flussostato, sensore di flusso'), SENS, 'B'),
  F('livello', tn('Sensore di livello, galleggiante'), SENS, 'B'),
  F('encoder', tn('Encoder'), SENS, 'B'),
  F('rilevatore', tn('Rilevatore (fumo, gas, movimento, presenza)'), SENS, 'B'),
  F('sensore', tn('Sensore'), SENS, 'B'),
  // Misura
  F('amperometro', tn('Amperometro'), MIS, 'P'),
  F('voltmetro', tn('Voltmetro'), MIS, 'P'),
  F('contatore-energia', tn('Contatore di energia'), MIS, 'P'),
  F('wattmetro', tn('Wattmetro, analizzatore di rete'), MIS, 'P'),
  F('contaore', tn('Contaore, contatore di impulsi'), MIS, 'P'),
  F('manometro', tn('Manometro'), MIS, 'P'),
  F('termometro', tn('Termometro'), MIS, 'P'),
  F('regolatore', tn('Regolatore (temperatura, processo)'), MIS, 'K'),
  F('strumento', tn('Strumento di misura'), MIS, 'P'),
  // Segnalazione
  F('lampada-spia', tn('Lampada spia'), SEGN, 'P', 'S00965'),
  F('cicalino', tn('Cicalino, sirena'), SEGN, 'P'),
  F('colonna-luminosa', tn('Colonna luminosa'), SEGN, 'P'),
  F('display', tn('Display, indicatore'), SEGN, 'P'),
  // Utilizzatori
  F('motore-3f', tn('Motore trifase'), UTIL, 'M'),
  F('motore-1f', tn('Motore monofase'), UTIL, 'M'),
  F('motore-dc', tn('Motore in corrente continua'), UTIL, 'M'),
  F('motore-passo', tn('Motore passo-passo'), UTIL, 'M'),
  F('servomotore', tn('Servomotore'), UTIL, 'M'),
  F('motore', tn('Motore'), UTIL, 'M'),
  F('elettrovalvola', tn('Elettrovalvola'), UTIL, 'M'),
  F('freno', tn('Freno elettromagnetico'), UTIL, 'M'),
  F('elettromagnete', tn('Elettromagnete, elettroserratura'), UTIL, 'M'),
  F('ventilatore', tn('Ventilatore'), UTIL, 'M'),
  F('pompa', tn('Pompa'), UTIL, 'M'),
  F('resistenza', tn('Resistenza di riscaldamento'), UTIL, 'E'),
  F('illuminazione', tn('Illuminazione, lampada'), UTIL, 'E'),
  F('robot', tn('Robot, manipolatore, alimentatore di pezzi'), UTIL, 'M'),
  F('visione', tn('Telecamera, sistema di visione'), UTIL, 'B'),
  F('elettrodomestico', tn('Elettrodomestico, utilizzatore'), UTIL, 'E'),
  // Azionamenti
  F('inverter', tn('Inverter, convertitore di frequenza'), AZ, 'T'),
  F('soft-starter', tn('Avviatore statico (soft starter)'), AZ, 'T'),
  F('servoazionamento', tn('Servoazionamento'), AZ, 'T'),
  F('raddrizzatore', tn('Raddrizzatore'), AZ, 'T'),
  F('convertitore', tn('Convertitore DC/DC, convertitore di segnale'), AZ, 'T'),
  // PLC e automazione
  F('plc-cpu', tn('CPU, controllore PLC'), PLC, 'K'),
  F('plc-di', tn('Modulo ingressi digitali'), PLC, 'K'),
  F('plc-do', tn('Modulo uscite digitali'), PLC, 'K'),
  F('plc-dio', tn('Modulo ingressi/uscite digitali'), PLC, 'K'),
  F('plc-ai', tn('Modulo ingressi analogici'), PLC, 'K'),
  F('plc-ao', tn('Modulo uscite analogiche'), PLC, 'K'),
  F('plc-accoppiatore', tn('Accoppiatore di bus, modulo di testa'), PLC, 'K'),
  F('plc-com', tn('Modulo di comunicazione'), PLC, 'K'),
  F('plc-alimentazione', tn('Modulo di alimentazione del sistema'), PLC, 'K'),
  F('plc-funzione', tn('Modulo di funzione (conteggio, posizionamento)'), PLC, 'K'),
  F('plc-modulo', tn('Modulo I/O'), PLC, 'K'),
  F('plc-canale', tn('Canale I/O PLC'), PLC, 'K'),
  F('hmi', tn('Pannello operatore (HMI)'), PLC, 'P'),
  F('interfaccia', tn('Modulo di interfaccia, relè di interfaccia'), PLC, 'K'),
  // Sicurezza
  F('rele-sicurezza', tn('Modulo o relè di sicurezza'), SAFE, 'K'),
  F('interblocco', tn('Interruttore di sicurezza, interblocco porta'), SAFE, 'B'),
  F('barriera', tn('Barriera, tappeto di sicurezza'), SAFE, 'B'),
  // Reti e domotica
  F('switch-rete', tn('Switch, router, gateway'), NET, 'K'),
  F('domotica', tn('Dispositivo domotico (KNX, Loxone, MyHome)'), NET, 'K'),
  F('antenna', tn('Antenna, TV e telefonia'), NET, 'W'),
  F('connettore-rete', tn('Connettore di rete (RJ45)'), NET, 'X'),
  // Morsetti e collegamenti
  F('morsetto', tn('Morsetto'), MORS, 'X'),
  F('morsetto-terra', tn('Morsetto di terra'), MORS, 'X'),
  F('morsetto-fusibile', tn('Morsetto portafusibile'), MORS, 'X'),
  F('ponticello', tn('Ponticello, barra di connessione'), MORS, 'X'),
  F('accessorio-morsetti', tn('Accessorio per morsetti (fermo, separatore, targhetta)'), MORS, 'X'),
  F('connettore', tn('Connettore, spina'), MORS, 'X'),
  F('presa', tn('Presa'), MORS, 'X'),
  F('terra', tn('Terra, massa'), MORS),
  F('collegamento', tn('Collegamento, giunzione, derivazione'), MORS),
  F('cavo', tn('Cavo, conduttore'), MORS, 'W'),
  F('ripartitore', tn('Ripartitore, distributore'), MORS, 'X'),
  // Elettronica
  F('resistore', tn('Resistore'), ELN, 'R', 'S00555'),
  F('condensatore', tn('Condensatore'), ELN, 'C', 'S00567'),
  F('induttore', tn('Induttore'), ELN, 'L', 'S00583'),
  F('diodo', tn('Diodo'), ELN, 'V', 'S00641'),
  F('led', tn('LED'), ELN, 'V'),
  F('transistor', tn('Transistor'), ELN, 'V'),
  F('tiristore', tn('Tiristore, triac'), ELN, 'V'),
  F('circuito-integrato', tn('Circuito integrato'), ELN, 'A'),
  F('amplificatore', tn('Amplificatore'), ELN, 'A'),
  F('quarzo', tn('Quarzo, oscillatore'), ELN, 'G'),
  F('tubo-elettronico', tn('Tubo elettronico, valvola'), ELN, 'V'),
  F('scheda', tn('Scheda elettronica, microcontrollore'), ELN, 'A'),
  F('semiconduttore', tn('Semiconduttore (altro)'), ELN, 'V'),
  // Porte logiche
  F('porta-and', tn('Porta AND / NAND'), LOG, 'A'),
  F('porta-or', tn('Porta OR / NOR'), LOG, 'A'),
  F('porta-xor', tn('Porta XOR / XNOR'), LOG, 'A'),
  F('porta-not', tn('Porta NOT'), LOG, 'A'),
  F('flip-flop', tn('Flip-flop, memoria'), LOG, 'A'),
  F('logica', tn('Funzione logica'), LOG, 'A'),
  F('scaletta', tn('Schema a scaletta (ladder)'), LOG),
  F('diagramma-flusso', tn('Diagramma di flusso, Grafcet'), LOG),
  // Pneumatica
  F('valvola-2-2', tn('Valvola 2/2'), PNEU, 'Q'),
  F('valvola-3-2', tn('Valvola 3/2'), PNEU, 'Q'),
  F('valvola-4-2', tn('Valvola 4/2'), PNEU, 'Q'),
  F('valvola-5-2', tn('Valvola 5/2'), PNEU, 'Q'),
  F('valvola-5-3', tn('Valvola 5/3'), PNEU, 'Q'),
  F('valvola-pneumatica', tn('Valvola pneumatica (altra)'), PNEU, 'Q'),
  F('isola-valvole', tn('Isola di valvole'), PNEU, 'Q'),
  F('cilindro', tn('Cilindro, attuatore lineare'), PNEU, 'M'),
  F('attuatore-rotativo', tn('Attuatore rotativo'), PNEU, 'M'),
  F('trattamento-aria', tn('Trattamento aria (filtro, regolatore, lubrificatore)'), PNEU, 'R'),
  F('silenziatore', tn('Silenziatore'), PNEU, 'R'),
  F('pneumatica', tn('Componente pneumatico'), PNEU),
  // Idraulica e termotecnica
  F('valvola', tn('Valvola'), IDR, 'Q'),
  F('valvola-motorizzata', tn('Valvola motorizzata'), IDR, 'M'),
  F('cilindro-idraulico', tn('Cilindro idraulico'), IDR, 'M'),
  F('serbatoio', tn('Serbatoio, vaso di espansione'), IDR, 'C'),
  F('scambiatore', tn('Scambiatore di calore'), IDR, 'E'),
  F('caldaia', tn('Caldaia, generatore di calore'), IDR, 'E'),
  F('terminale-clima', tn('Radiatore, terminale di climatizzazione'), IDR, 'E'),
  F('refrigerazione', tn('Refrigerazione (compressore, evaporatore, condensatore)'), IDR, 'M'),
  F('filtro', tn('Filtro'), IDR, 'R'),
  F('raccordo', tn('Tubo, raccordo'), IDR, 'W'),
  F('idraulica', tn('Componente idraulico o termotecnico'), IDR),
  // Impianti civili
  F('punto-luce', tn('Punto luce'), CIV, 'E'),
  F('interruttore-civile', tn('Interruttore, deviatore civile'), CIV, 'S'),
  F('presa-civile', tn('Presa civile'), CIV, 'X'),
  F('citofonia', tn('Citofono, campanello, videocitofono'), CIV, 'P'),
  F('planimetria', tn('Simbolo planimetrico'), CIV),
  // Quadro e montaggio
  F('armadio', tn('Armadio, centralino, cassetta'), QUADRO),
  F('guida-din', tn('Guida DIN, canalina'), QUADRO),
  F('miniatura', tn('Vista frontale di apparecchio'), QUADRO),
  // Grafica e documentazione
  F('cartiglio', tn('Cartiglio, tabella'), GRAF),
  F('etichetta', tn('Etichetta, commento, freccia'), GRAF),
  F('grafica', tn('Grafica'), GRAF),
  F('altro', tn('Altro'), ALTRO),
];

/**
 * Regole in ordine: vince la prima che corrisponde al testo "cartella/nome" (senza accenti, minuscolo).
 * Prima i nomi precisi, poi le cartelle.
 */
const RULES: Rule[] = [
  // Viste frontali e miniature: la funzione si cerca più sotto solo per i moduli; prima i casi ovvi
  { id: 'rif-incrociato', re: /riferimenti incrociati|\brif\. |riferimento bob/ },
  { id: 'cartiglio', re: /cartigli|testata|moduli e tabelle|tabella|nomenclatura/ },
  { id: 'diagramma-flusso', re: /grafcet|diagramm[ai] di flusso|flowchart/ },
  { id: 'scaletta', re: /diagramma a scaletta|ladder/ },
  { id: 'porta-and', re: /\b(n?and)\b|porta e\b|\be non\b|\be \(and\)/ },
  { id: 'porta-xor', re: /\bx(n)?or\b|esclusiv/ },
  { id: 'porta-or', re: /\b(n?or)\b|\bo no\b|\bo \(or\)/, when: s => !/\bnor[dm]/.test(s.name.toLowerCase()) },
  { id: 'porta-not', re: /\bnot\b|\bnon \(/ },
  { id: 'flip-flop', re: /flip.?flop|bistabile|memoria rs|\blatch\b/ },
  { id: 'logica', re: /circuiti logici|porte logiche/ },
  // Pneumatica
  { id: 'isola-valvole', re: /isola di valvole|valve terminal|\bex260|\bvtug|\bcpx\b|\bmpa-/ },
  { id: 'valvola-5-3', re: /\b5\/3|5-3 vie/ },
  { id: 'valvola-5-2', re: /\b5\/2|5-2 vie/ },
  { id: 'valvola-4-2', re: /\b4\/[23]|4-[23] vie/ },
  { id: 'valvola-3-2', re: /\b3\/[23][a-z]|3-2 vie|\b3\/2\b/, when: s => !/vie/.test(s.name.toLowerCase()) || /pneu/.test(s.category ?? '') },
  { id: 'valvola-2-2', re: /\b2\/2[a-z_]|2-2 vie|\b2\/2\b/ },
  { id: 'silenziatore', re: /silenziator|silencer|muffler/ },
  { id: 'cilindro', re: /pneumatica\/attuatori\/lineare|cilindr[oi].*(pneum|doppio effetto|semplice effetto)|pneumatica.*cilindr/ },
  { id: 'attuatore-rotativo', re: /pneumatica\/attuatori\/rotativ|attuatore rotativo/ },
  { id: 'trattamento-aria', re: /regolatore di pressione|lubrificat|gruppo frl|filtro.*aria|trattamento aria/, when: s => true },
  { id: 'cilindro-idraulico', re: /idraulica\/pistoni|cilindro idraul/ },
  // Morsetti: prima di «fusibile» e «terra»
  { id: 'morsetto-fusibile', re: /morsett[oi].*fusibil|fuse terminal|terminal.*fuse/ },
  { id: 'morsetto-terra', re: /morsett[oi].*(terra|pe\b)|ground terminal|green-yellow|giallo.?verde/ },
  { id: 'accessorio-morsetti', re: /end stop|fermo|separator|end plate|piastra terminale|marker|targhett|testata morsett/ },
  { id: 'ponticello', re: /busbar|barra a pettine|jumper|ponticell|barra di connessione|jumpflex.*ponte|\bbridge\b/ },
  // Sicurezza
  { id: 'rele-sicurezza', re: /\bpsr-|safe logic|\bsirius 3sk|\b3sk\d|moduli di sicurezza|preventa|pnoz|mypnoz|\breer\b|safety relay|rele di sicurezza|modulo di sicurezza|safety|el6900|el1904|el2904|sicurezza\/|^safety/ },
  { id: 'interblocco', re: /schmersal|\bazm ?\d|\baz ?16|interblocchi di sicurezza|interblocco|interruttore di sicurezza|safety switch|door switch/ },
  { id: 'barriera', re: /barriera|light curtain|tappeto di sicurezza/ },
  { id: 'emergenza', re: /emergenz|emergency|arresto d.emerg|fungo/ },
  // Protezioni
  { id: 'avviatore', re: /\b3rm1|avviator[ei] (motore|diretto)|motor starter|tesys u|\bdol starter/ },
  { id: 'robot', re: /\brobot|\bscara\b|asycube|asyfill|manipolatore cartesiano/ },
  { id: 'visione', re: /\bcamera\b|telecamer|in-sight|cognex|\bvision|\beye\+? / },
  { id: 'magnetotermico-differenziale', re: /magneto.?termico.?differenz|differenziale.*magnetot|rcbo/ },
  { id: 'differenziale', re: /differenzial|\brcd\b|\brccb\b|residual/ },
  { id: 'salvamotore', re: /salvamotor|motor protect|protezione motore|\bgv[23]|pkzm|3rv/ },
  { id: 'magnetotermico', re: /interruttore aut\b|magneto.?termic|interruttore automatico|int\. aut|\bmcb\b|circuit breaker|disjoncteur|\bmbn\d|automatic switch/ },
  { id: 'rele-termico', re: /rele termico|relè termico|thermal overload|termico\b/ },
  { id: 'sezionatore-fusibile', re: /sezionatore.*fusib|portafusibil|fuse.?holder|fuse disconnect|fusibile sezionabile/ },
  { id: 'fusibile', re: /fusibil|\bfuse\b|fusible/ },
  { id: 'scaricatore', re: /scaricator|surge|\bvpu\b|sovratension|\bspd\b|dehn|parafulmin|lightning/ },
  { id: 'protezione-elettronica', re: /\brex12|\bem12d?-|\bpm12-|\besx10|electronic circuit (breaker|protector)|protezione elettronica|\bpsentry|cbm[ -]?e/ },
  { id: 'rele-protezione', re: /rele di (misura|controllo|sotto|sovra|massima|minima)|rele di controllo|voltage relay|controllo (fase|tensione|isolamento)|rele.*(sottopotenza|sottotension|sovracorr)|\bum relay|relè di (misura|minima|massima)/ },
  // Alimentazione
  { id: 'ups', re: /\bups\b|gruppo di continuita/ },
  { id: 'fotovoltaico', re: /fotovoltaic|solar panel|photovolta|pannello solare(?!.*termic)/ },
  { id: 'batteria', re: /batteri|accumulator|\bbattery\b|pila\b|\b\d+ ?ah\b/ },
  { id: 'trasformatore-corrente', re: /trasformatore (d.impulso|di corrente)|transformatore di corrente|current transformer|\bta\b.*corrente|current.measurement/ },
  { id: 'autotrasformatore', re: /autotrasformator/ },
  { id: 'trasformatore-3f', re: /trasformatore trifase|three.phase transformer/ },
  { id: 'trasformatore-1f', re: /trasformator|transformer|transformador/ },
  { id: 'alimentatore', re: /alimentator|power.?suppl|font d.alimentacio|alimentazione bus|\bpsu\b|mean ?well|\bhdr-\d|\bdr-\d|\bsdr-|787-\d|2787|quint|sitop/ },
  { id: 'regolatore', re: /eurotherm|gefran|regolatore di (temperatura|processo)|termoregolator|pid controller|regulateur|\brlu ?\d/ },
  { id: 'regolatore-tensione', re: /regolatore di tensione|voltage regulator|stabilizzator/ },
  { id: 'avvolgimento', re: /avvolgiment/ },
  { id: 'generatore', re: /generator(?!e di calore)|alternator|gruppo elettrogeno|dinamo/ },
  { id: 'sorgente', re: /sorgente|alimentazione da rete|rete di alimentazione|generatori e sorgenti|produzione e conversione/ },
  // Azionamenti
  { id: 'soft-starter', re: /soft.?start|avviatore statico|avviatore progressivo/ },
  { id: 'servoazionamento', re: /servo.?(drive|azionament|amplif)|lexium|sinamics s|driver unit|\bax5\d{3}|\bhmd01|\bindradrive/ },
  { id: 'inverter', re: /inverter|variatore|frequency converter|convertitore di frequenza|altivar|\bvfd\b|\bacs\d|movitrac|movidrive|sinamics|cu-?240|j1000|powerflex|multiplus|easysolar|quattro|\bac30|\bkeb\b|\bg6\b|parker ac/ },
  { id: 'raddrizzatore', re: /raddrizzator|rectifier|ponte di diodi/ },
  { id: 'convertitore', re: /convertitor|converter|convertidor|isolatore galvanico|signal conditioner/ },
  // PLC
  { id: 'plc-canale', re: /canale (plc|i\/?o)|\bplc channel/, when: s => s.role === 'plc' },
  { id: 'hmi', re: /\bhmi\b|weintek|\bmt8\d{3}|pro-?face|\blt3\d{3}|\bgl043|\bcmt\b|pannell[oi] operator|touch panel|\bkp\d{3}|\btp\d{3,4}|hmiet|interfaccia uomo/ },
  { id: 'plc-accoppiatore', re: /coupler|accoppiator|\bet ?200s? (im|interface)|bus.?koppler|testa di rete|\bek11|\bbk\d{4}|750-3\d\d\b|head station/ },
  { id: 'plc-alimentazione', re: /\b(pm-e|power module|modulo di alimentazione|potential (feed|supply))|750-6[01]\d\b|753-6[01]\d\b/ },
  { id: 'plc-ai', re: /\bsm ?1231|\bai\d+|\b1[67]\d\d-(i[eft]\d|ir\d)|entrees analog|analog(ue)?.?in|ingress[oi] analogic|ingressi ana|\bai\b ?\d|\b\d+ ?ai\b|\bam[iu]\d|\bel3\d{3}|750-4[5-9]\d|753-4[5-9]\d|\bsm 1231|331-|134-4/ },
  { id: 'plc-ao', re: /\bsm ?1232|\bao\d+|\b1[67]\d\d-o[ef]\d|sorties analog|analog(ue)?.?out|uscit[ae] analogic|\bao\b ?\d|\b\d+ ?ao\b|\bel4\d{3}|750-5[5-9]\d|753-5[5-9]\d|\bsm 1232|332-|135-4/ },
  { id: 'plc-di', re: /\bsm ?1221|\bdi\d+|\b1[67]\d\d-i[abmqv]\d|\bdvp\d+x|\bia\d|digital.?in|ingress[oi] digital|\bdi\b ?\d|\b\d+ ?di\b|\bdi\d+\b|\bel1\d{3}|750-4[0-4]\d|753-4[0-4]\d|\bsm 1221|321-|131-4|\bia\d{3}|tm3di/ },
  { id: 'plc-do', re: /\bsm ?1222|\bd[oq]\d+|\b1[67]\d\d-o[abwvx]\d|\bdvp\d+y|uscite a rel|\bdd?o\d|digital.?out|uscit[ae] digital|\bdo\b ?\d|\b\d+ ?do\b|\bdo\d+\b|\bel2\d{3}|750-5[0-4]\d|753-5[0-4]\d|750-15\d\d|\bsm 1222|322-|132-4|\boc\d{3}|tm3dq/ },
  { id: 'plc-dio', re: /\bdi\/?do\b|ingressi.?uscite digital|\bsm 1223|323-|mixed i\/o|dio\b/ },
  { id: 'plc-funzione', re: /contator[ei] veloc|counter module|encoder module|posizionament|positioning|\bel5\d{3}|\bel7\d{3}|750-6[3-9]\d|technology module/ },
  { id: 'plc-com', re: /comunicazion|communication|\bcp ?\d{3}|\bcm ?\d{3,4}|profibus|profinet|ethercat|ethernet|modbus|can.?open|devicenet|rs-?(232|485)|serial|\bel6\d{3}|750-65\d|io-link master|asi?-?master/ },
  { id: 'plc-cpu', re: /\bcpu\b|controller|controllore|controllori|miniserver|\bpfc\d|750-8\d{2}\b|\bcx\d{4}|logo!?|s7-?1[25]00|\bm2[45]1|\bm340|twido|zelio|pluto|crio|\bcj1|\bcqm1|unitronics|arduino|raspberry/, when: s => /cpu|controller|controllore|miniserver|logo|pfc|cx\d|m2[45]1|unita base|\btm2[45]1|easy ?\d{3}|\bs7-?1[25]00 1[25]\d\dc|crouzet|zelio|twdlc|tsx ?\d/i.test(s.name) },
  { id: 'plc-modulo', re: /plc e contr|\bi-?o 75[03]|u-remote|ethercat (box|terminals)|advantys|\bet ?200|tm3|telefast|modulo i\/?o|i\/o module|moduli? di espansione|espansion|extension/ },
  { id: 'interfaccia', re: /interface.?module|modul[oi] di interfaccia|rele di interfaccia|relay.?module|optocoupler|optoisolat|interfaccia/ },
  // Reti e domotica
  { id: 'connettore-rete', re: /rj ?45|rj ?11|\bm12\b.*(ethernet|d.coded)|patch/ },
  { id: 'switch-rete', re: /\bswitch\b.*(ethernet|rete|port|managed|unmanaged)|router|gateway|ewon|network.?equipment|access point|microsens|bus topology|hub\b/ },
  { id: 'domotica', re: /\bknx\b|loxone|myhome|bticino|shelly|\bmdt\b|domotic|dali|zigbee|gestione edifici|tac xenta|satchwell|johnson controls|building/ },
  { id: 'antenna', re: /antenna|ricezione terrestre|\bv\.?d\.?i\b|telefon|splitter|parabol|\btv\b/ },
  // Sensori (prima dei contatti NA/NC con nome «sensore … (NC)»)
  { id: 'encoder', re: /encoder|resolver/ },
  { id: 'sensore-induttivo', re: /induttiv|inductive|prossimit/ },
  { id: 'sensore-capacitivo', re: /capacitiv/ },
  { id: 'sensore-ottico', re: /ottic|fotocell|fotoelettric|photo|optical|reflex|barriera ottica/, when: s => !/klystron/.test(s.name.toLowerCase()) },
  { id: 'sensore-magnetico', re: /\breed\b|magnetic sensor|sensore magnetico|ampolla/ },
  { id: 'pressostato', re: /pressostat|presostat|sensore di pressione|pressure (switch|sensor|transmitter)|trasmettitore di pressione|azionato dalla pressione/ },
  { id: 'termostato', re: /termostat|thermostat|cronotermostat/ },
  { id: 'sonda-temperatura', re: /omnigrad|sonda di temperatura|pt ?100|pt ?1000|termocoppi|thermocouple|termoresist|\bntc\b|\bptc\b|sensore di temperatura|temperature sensor|io-pt/ },
  { id: 'flussostato', re: /flussostat|flusso di un fluido|flow (switch|sensor|meter)|misuratore di portata|portata/ },
  { id: 'livello', re: /livello|galleggiant|float|level/ },
  { id: 'rilevatore', re: /rilevator|detector|fumo|smoke|movimento|presenza|\bpir\b|gas detector/ },
  { id: 'finecorsa', re: /finecorsa|fine corsa|limit switch|position switch/ },
  { id: 'sensore', re: /sensor|sensore|sonda|endress|trasduttor|transmitter|trasmettitor/ },
  // Misura
  { id: 'contatore-energia', re: /kamstrup|kwh|varh|\bwh\b|contatore (di energia|monofase|trifase|elettric)|energy meter|contatore.*230v|misuratore di (k?wh|varh|ah)|contacalorie|contatore gas|contatore d.acqua/ },
  { id: 'amperometro', re: /amperometr|ammeter/ },
  { id: 'voltmetro', re: /voltmetr|voltmeter/ },
  { id: 'wattmetro', re: /wattmetr|analizzatore di rete|multimetr|power meter|cosfimetr|frequenzimetr|gestione energia/ },
  { id: 'contaore', re: /conta.?tempo|contaore|conta.?impulsi|totalizzator|hour meter|counter\b/ },
  { id: 'manometro', re: /manometr|pressure gauge/ },
  { id: 'termometro', re: /termometr|thermometer/ },
  { id: 'strumento', re: /strumenti di misura|misurator|meter\b|indicatore di/ },
  // Segnalazione
  { id: 'colonna-luminosa', re: /colonna luminosa|signal tower|torretta/ },
  { id: 'pulsante-luminoso', re: /pulsante luminoso|illuminated push/ },
  { id: 'lampada-spia', re: /spia|indicator light|pilot light|lampada di segnalazione|segnalazione luminosa/ },
  { id: 'cicalino', re: /altoparlant|speaker|cicalin|sirena|buzzer|campan|horn|avvisatore acustico|suoneria/ },
  { id: 'display', re: /display|visualizzator|indicatore/ },
  // Comandi
  { id: 'selettore-chiave', re: /a chiave|key switch|key selector/ },
  { id: 'selettore', re: /selettor|selector|commutatore a \d posizion|a \d posizioni/ },
  { id: 'commutatore-camme', re: /a camme|cam switch|a tamburo|rotary switch/ },
  { id: 'pedale', re: /pedal|a pedale/ },
  { id: 'joystick', re: /joystick|manipolator/ },
  { id: 'potenziometro', re: /potenziometr|potentiometer|reostat/ },
  { id: 'pulsantiera', re: /pulsantier|tastierin|keypad|pendant/ },
  { id: 'pulsante-nc', re: /pulsante.*(\bnc\b|\(nc\)|apertura|arresto|stop)/ },
  { id: 'pulsante-na', re: /pulsante.*(\bno\b|\bna\b|\(no\)|\(na\)|chiusura|marcia|start)/ },
  { id: 'pulsante', re: /pulsant|push.?button|bouton/ },
  // Manovra
  { id: 'invertitore', re: /invertitor|commutatore di rete|transfer switch|\bats\b/ },
  { id: 'sezionatore', re: /sezionator|disconnect|interruttore di manovra|isolator|switch.?disconnector|seccionador|lasttrenn|\bsezion/ },
  // Relè e contattori
  { id: 'bobina-temporizzata', re: /bobina.*(ritard|tempor)|(ritard|tempor).*bobina|timer coil/ },
  { id: 'contatto-temporizzato', re: /contatto.*(ritard|tempor)|(ritard|tempor).*contatto|timed contact/ },
  { id: 'temporizzatore', re: /temporizzator|\btimer\b|\brele a tempo/ },
  { id: 'rele-statico', re: /rele statico|relè statico|solid.?state|\bssr\b/ },
  { id: 'rele-impulsi', re: /a impulsi|passo.?passo|impulse relay|telerupt|bistabile/, when: s => !/motore/i.test(s.name) },
  { id: 'contatti-potenza', re: /contatti di potenza|power contact|poli di potenza/ },
  { id: 'contatto-scambio', re: /scambio|commutazione|\bco\b|changeover|\bsw\b contact/, when: s => s.role === 'aux' || /contatt|contact/i.test(s.name) },
  { id: 'contatto-nc', re: /\bnc\b|\(nc\)|normalmente chius|apertur|break contact/, when: s => s.role === 'aux' || /contatt|contact|contacto/i.test(s.name) },
  { id: 'contatto-na', re: /\bno\b|\bna\b|\(no\)|\(na\)|normalmente apert|chiusur|make contact|^contatto\b/, when: s => s.role === 'aux' || /contatt|contact|contacto/i.test(s.name) },
  // La bobina «relè/contattore» resta una bobina: contattore solo se il simbolo è il contattore intero
  { id: 'bobina', re: /bobin|\bcoil\b|bobine/ },
  { id: 'contattore', re: /contattor|contactor|teleruttor|acti9 ict|\bict\b/ },
  { id: 'rele', re: /\brel[eè]\b|\brele\b|\brelay\b|\brele[ i]|\brelais/ },
  // Utilizzatori
  { id: 'motore-passo', re: /motore passo|stepper/ },
  { id: 'servomotore', re: /servomotor|servo motor|\bam8\d{3}|\b1fk7|\bmsk\d/ },
  { id: 'motore-dc', re: /motore.*(continua|\bdc\b|cc\b)|dc motor/ },
  { id: 'motore-1f', re: /motore monofase|single.phase motor/ },
  { id: 'motore-3f', re: /motore trifase|three.phase motor|motore asincrono|motore 3/ },
  { id: 'valvola-motorizzata', re: /valvola motorizzat|motorized valve|servomotore valvola/ },
  { id: 'elettrovalvola', re: /\bvuvg|elettrovalvol|solenoid valve|valvola solenoid/ },
  { id: 'freno', re: /\bfreno\b|\bbrake\b/ },
  { id: 'elettromagnete', re: /elettromagnet|elettroserratur|serratura elettrica|solenoid|elettrocalamit/ },
  { id: 'ventilatore', re: /ventilator|\bfan\b|ventilaz|aspirator|estrattor/ },
  { id: 'pompa', re: /grundfos|\bwilo\b|stratos|\bmagna\b|\bpomp|\bpump|bomba\b/ },
  { id: 'motore', re: /\bmotor/ },
  { id: 'resistenza', re: /riscaldator|scaldiglia|resistenza (di risc|corazzata)|heater|heating element/ },
  // Elettronica
  { id: 'led', re: /\bled\b|diodo (luminoso|emettitore)/ },
  { id: 'tiristore', re: /tiristor|triac|diac|\bscr\b|thyristor/ },
  { id: 'diodo', re: /diod/ },
  { id: 'transistor', re: /transistor|mosfet|\bfet\b|\bigbt\b|\bjfet\b/ },
  { id: 'amplificatore', re: /amplificator|amplifier|\bop.?amp/ },
  { id: 'circuito-integrato', re: /circuito integrato|integrated circuit|\bic\b/ },
  { id: 'quarzo', re: /quarz|cristallo|oscillator|crystal/ },
  { id: 'tubo-elettronico', re: /triodo|pentodo|tetrodo|klystron|magnetron|tubi elettronici|valvola termoionica|tubo a raggi/ },
  { id: 'scheda', re: /arduino|raspberry|microcontroll|scheda elettronica|\bpcb\b|gce electronics/ },
  { id: 'semiconduttore', re: /semicondutt/ },
  { id: 'condensatore', re: /condensator|capacitor/, when: s => !/refriger|frigor|clima/i.test(s.category ?? '') },
  { id: 'induttore', re: /induttanz|induttor|inductor|\bbobina d.arresto|choke/ },
  { id: 'resistore', re: /resistor|resistenz|resistance/ },
  // Morsetti e collegamenti
  { id: 'ripartitore', re: /ripartitor|distributor|morsettiera di distribuzione|\bpdb\b/ },
  { id: 'morsetto', re: /morsett|terminal block|terminals\/|terminali\/|\bterminal\b|klemme|borne|wago limited\/front-view\/terminals|series 20\d\d|series 2\d{3}|viking|junction block|\btop job|winsta|electronic terminal|jumpflex|859-|857-|2857-/ },
  { id: 'connettore', re: /connettor|connector|\bspina\b|\bplug\b|\bjack\b|conector|\bmcs\b|multi connection/ },
  { id: 'presa-civile', re: /impianti civili.*presa|presa .*(civil|schuko|bivalente)|presa con contatto|\bsocket\b.*\d+ ?a\b/ },
  { id: 'presa', re: /\bpres[ae]\b|socket|outlet/ },
  { id: 'terra', re: /\bterra\b|\bmassa\b|ground|earth|\btierra\b/ },
  { id: 'cavo', re: /\bcav[oi]\b|cable|conduttor|\bwire\b|multipolar|\blinea (aerea|sotte)/ },
  { id: 'collegamento', re: /collegament|giunzion|derivazion|connession|connection|terminale di unione|conduttori e dispositivi di connessione|incrocio/ },
  // Pneumatica, idraulica e termotecnica (per cartella)
  { id: 'filtro', re: /filtr/ },
  { id: 'valvola', re: /valvol|valve|valvula|rubinett|saracinesc/ },
  { id: 'serbatoio', re: /serbatoi|vaso|vasi di espansione|accumulo|puffer|tank|bollitore|boiler(?! elettric)/ },
  { id: 'scambiatore', re: /scambiator|exchanger|bescambiador/ },
  { id: 'caldaia', re: /caldai|generatore di calore|boiler|bruciator|burner|stufa|termocamino|pompa di calore/ },
  { id: 'terminale-clima', re: /radiator|termoconvettor|fan.?coil|split|climatizz|air conditioner|pavimento radiante|underfloor|towel warmer|aerotermo/ },
  { id: 'refrigerazione', re: /refriger|frigor|compressor|evaporator|condensador|unitat|refredadora|chiller/ },
  { id: 'raccordo', re: /raccord|fitting|tubo|tubi|pipe|tube|gomito|elbow|nipple|manicott|maneguet|\bpex\b|multistrato|\bpvc\b|curva|\btee?\b|riduzione|colze/ },
  { id: 'pneumatica', re: /^pneumatica|pneumatic/ },
  { id: 'cilindro-idraulico', re: /^idraulica\/pistoni/ },
  { id: 'idraulica', re: /^idraulica|^energia\/|termica fluidi|solare termico/ },
  // Elettrodomestici e utilizzatori civili
  { id: 'illuminazione', re: /illuminazion|lampad|lamp\b|apparecchio di illuminazione|faro|plafonier|lighting|luce\b|neon/ },
  { id: 'elettrodomestico', re: /elettrodomestic|lavatric|lavastovigl|frigorifer|congelator|forno|scalda|cucina|asciuga|tumble|hob\b|cappa|microonde|micro-onde|dryer|washing|appliance|apparecchio elettrico|utilizzator/ },
  { id: 'citofonia', re: /citofon|videocitofon|campanell|pulsantiera esterna|posto esterno/ },
  { id: 'interruttore-civile', re: /impianti civili.*(interruttor|deviator|commutator|invertitor)|interruttore unipolare|deviatore|interruttore bipolare/ },
  { id: 'punto-luce', re: /punto luce|centro luce/ },
  { id: 'planimetria', re: /planimetric|piani e schemi di installazione|topografic|architettonic/ },
  { id: 'interruttore-comando', re: /interruttor|switch|deviator|commutator/ },
  // Quadro e montaggio
  { id: 'armadio', re: /armadi|enclosure|centralin|quadro in plastica|cassett|contenitore|cabinet|rittal|atlantic|gamma \d|quadri? elettric/ },
  { id: 'guida-din', re: /din.?rail|guida din|canalin|mounting rail|cable duct|barra di alimentazione/ },
  { id: 'miniatura', re: /miniature|front.?view|vista frontale|frontale/ },
  // Grafica
  { id: 'etichetta', re: /etichett|comment|freccia|arrow|direzione|segnaletica|label/ },
  { id: 'grafica', re: /grafica|simboli ausiliari|elementi di simbolo|qualificator|oggetto/ },
];

/** Funzioni dell'elenco: quelle incluse più quelle dell'utente (con codice proprio) */
export function allFunctions(user: SymbolFunction[] = []): SymbolFunction[] {
  const seen = new Set(BUILTIN_FUNCTIONS.map(f => f.id));
  return [...BUILTIN_FUNCTIONS, ...user.filter(f => !seen.has(f.id))];
}

export const functionById = (id: string | undefined, user: SymbolFunction[] = []) =>
  id ? allFunctions(user).find(f => f.id === id) : undefined;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Funzione proposta per un simbolo: dalla cartella (categoria) e dal nome, con l'aiuto di ruolo,
 * tipo di contatto e canale PLC. "altro" se non si riconosce.
 */
export function guessFunction(s: SymbolDef): string {
  // Dati certi del simbolo prima del testo
  if (s.role === 'plc') return 'plc-canale';
  if (s.role === 'terminal') return /terra|\bpe\b|ground/i.test(s.name) ? 'morsetto-terra' : 'morsetto';
  const sie = siemensFunction(s.name);
  if (sie) return sie;
  const cat = plain(s.category ?? '').replace(/\s*\/\s*/g, '/').replace(/^qelectrotech[^/]*\//, '');
  const name = plain(s.name);
  const match = (text: string) => RULES.find(r => r.re.test(text) && (!r.when || r.when(s)))?.id;
  // Prima il nome da solo (più preciso), poi il tipo di contatto, poi cartella e nome insieme
  const byName = match(name);
  if (byName) return byName;
  if (s.role === 'aux' && s.contact) {
    if (s.timed) return 'contatto-temporizzato';
    return ({ NO: 'contatto-na', NC: 'contatto-nc', CO: 'contatto-scambio', power: 'contatti-potenza' } as const)[s.contact];
  }
  const byPath = match(`${cat}/${name}`);
  if (byPath) return byPath;
  if (s.letter === 'X') return 'morsetto';
  return 'altro';
}

/** Moduli Siemens dal numero d'ordine 6ES7 (es. 6ES7 221-1BF30 = SM 1221, ingressi digitali) */
function siemensFunction(name: string): string | undefined {
  const m = /6es7 ?(\d)(\d)(\d)/i.exec(name);
  if (!m) return undefined;
  const [fam, kind, sub] = [m[1], m[2], m[3]];
  // 21x, 31x, 51x: CPU (S7-200/1200, S7-300, S7-1500)
  if (kind === '1' && ['2', '3', '5'].includes(fam)) return 'plc-cpu';
  if (fam === '1' && kind === '5') return 'plc-accoppiatore';
  // x2x digitali, x3x analogici (S7-1200 2xx, S7-300 3xx, S7-1500 5xx, ET 200SP/S 13x)
  const d = (k: string) => (k === '1' ? 'plc-di' : k === '2' ? 'plc-do' : k === '3' ? 'plc-dio' : undefined);
  const a = (k: string) => (k === '1' ? 'plc-ai' : k === '2' ? 'plc-ao' : 'plc-modulo');
  if (['2', '3', '5'].includes(fam) && kind === '2') return d(sub) ?? 'plc-modulo';
  if (['2', '3', '5'].includes(fam) && kind === '3') return a(sub);
  if (fam === '1' && kind === '3') return ({ '1': 'plc-di', '2': 'plc-do', '3': 'plc-dio', '4': 'plc-ai', '5': 'plc-ao', '6': 'rele-sicurezza', '7': 'plc-funzione', '8': 'plc-alimentazione' } as Record<string, string>)[sub] ?? 'plc-modulo';
  if (kind === '4' || (fam === '1' && kind === '5')) return 'plc-com';
  if (kind === '0' && sub === '7') return 'plc-alimentazione';
  if (fam === '3' && kind === '6') return 'plc-accoppiatore';
  return 'plc-modulo';
}

/** Simboli importati: la funzione si propone subito dal nome e dalla cartella */
export const withFunctions = (list: SymbolDef[]): SymbolDef[] => list.map(x => (x.func ? x : { ...x, func: guessFunction(x) }));

/** Lettera IEC 81346 proposta dalla funzione */
export const letterOfFunction = (id: string | undefined, user: SymbolFunction[] = []) => functionById(id, user)?.letter;

/** Codice per una funzione nuova dell'utente, dal nome */
export function newFunctionId(name: string, existing: SymbolFunction[]): string {
  const base = 'u-' + plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  let id = base, n = 2;
  while (existing.some(f => f.id === id)) id = `${base}-${n++}`;
  return id;
}
