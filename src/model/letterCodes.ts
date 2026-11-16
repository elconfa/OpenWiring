// Lettere delle sigle (DA_FARE 86): di serie la lettera singola del simbolo (K, Q, S, F…, IEC 81346-2:2009);
// con l'impostazione del progetto «IEC 81346-2:2019» le due lettere della norma (QA, KF, SF, BG…),
// ricavate dalla funzione del simbolo (symbolFunctions.ts) e, se manca, dalla lettera singola.
import type { Project, SymbolDef } from './types';
import { guessFunction } from './symbolFunctions';

/** Classi a due lettere IEC 81346-2:2019 per funzione del simbolo */
export const CODES_2019: Record<string, string> = {
  // Alimentazione
  alimentatore: 'TB', 'trasformatore-1f': 'TA', 'trasformatore-3f': 'TA', autotrasformatore: 'TA', 'trasformatore-corrente': 'BE',
  batteria: 'GB', generatore: 'GA', sorgente: 'GA', ups: 'GB', fotovoltaico: 'GA', 'regolatore-tensione': 'TA', avvolgimento: 'TA',
  // Protezioni e manovra
  magnetotermico: 'FC', differenziale: 'FB', 'magnetotermico-differenziale': 'FB', 'interruttore-automatico': 'QA', avviatore: 'QA',
  salvamotore: 'QA', 'rele-termico': 'FC', fusibile: 'FC', 'sezionatore-fusibile': 'QB', scaricatore: 'FA', 'protezione-elettronica': 'FC',
  'rele-protezione': 'KF', sezionatore: 'QB', 'commutatore-camme': 'SF', invertitore: 'QA',
  // Comandi
  'pulsante-na': 'SF', 'pulsante-nc': 'SF', pulsante: 'SF', 'pulsante-luminoso': 'SF', emergenza: 'SF', selettore: 'SF', 'selettore-chiave': 'SF',
  'interruttore-comando': 'SF', finecorsa: 'BG', pedale: 'SF', joystick: 'SF', potenziometro: 'RA', pulsantiera: 'SF',
  // Relè e contattori
  bobina: 'KF', 'bobina-temporizzata': 'KF', 'contatto-na': 'KF', 'contatto-nc': 'KF', 'contatto-scambio': 'KF', 'contatto-temporizzato': 'KF',
  'contatti-potenza': 'QA', contattore: 'QA', rele: 'KF', 'rele-statico': 'QA', 'rele-impulsi': 'KF', temporizzatore: 'KF',
  // Sensori e misura
  'sensore-induttivo': 'BG', 'sensore-capacitivo': 'BG', 'sensore-ottico': 'BG', 'sensore-magnetico': 'BG', pressostato: 'BP', termostato: 'BT',
  'sonda-temperatura': 'BT', flussostato: 'BF', livello: 'BL', encoder: 'BG', rilevatore: 'BG', sensore: 'BG',
  amperometro: 'PG', voltmetro: 'PG', 'contatore-energia': 'PG', wattmetro: 'PG', contaore: 'PG', manometro: 'PG', termometro: 'PG',
  regolatore: 'KF', strumento: 'PG',
  // Segnalazione
  'lampada-spia': 'PF', cicalino: 'PB', 'colonna-luminosa': 'PF', display: 'PG',
  // Utilizzatori e azionamenti
  'motore-3f': 'MA', 'motore-1f': 'MA', 'motore-dc': 'MA', 'motore-passo': 'MA', servomotore: 'MA', motore: 'MA', elettrovalvola: 'MB',
  freno: 'MB', elettromagnete: 'MB', ventilatore: 'GQ', pompa: 'GP', resistenza: 'EB', illuminazione: 'EA', robot: 'MA', visione: 'BG',
  inverter: 'TA', 'soft-starter': 'QA', servoazionamento: 'TA', raddrizzatore: 'TB', convertitore: 'TF',
  // PLC, sicurezza, reti
  'plc-cpu': 'KF', 'plc-di': 'KF', 'plc-do': 'KF', 'plc-dio': 'KF', 'plc-ai': 'KF', 'plc-ao': 'KF', 'plc-accoppiatore': 'KF', 'plc-com': 'KF',
  'plc-alimentazione': 'TB', 'plc-funzione': 'KF', 'plc-modulo': 'KF', hmi: 'PG', interfaccia: 'KF',
  'rele-sicurezza': 'KF', interblocco: 'BG', barriera: 'BG', 'switch-rete': 'KF', domotica: 'KF', antenna: 'WF', 'connettore-rete': 'XF',
  // Morsetti e collegamenti
  morsetto: 'XD', 'morsetto-terra': 'XE', 'morsetto-fusibile': 'XD', ponticello: 'XD', connettore: 'XD', presa: 'XD', 'presa-civile': 'XD',
  ripartitore: 'XD', cavo: 'WD',
  // Elettronica
  resistore: 'RA', condensatore: 'CA', induttore: 'RA', diodo: 'RA', led: 'PF', transistor: 'KF', tiristore: 'QA', 'circuito-integrato': 'KF',
  amplificatore: 'TF', quarzo: 'GF', scheda: 'KF',
  // Pneumatica e idraulica
  'valvola-2-2': 'QM', 'valvola-3-2': 'QM', 'valvola-4-2': 'QM', 'valvola-5-2': 'QM', 'valvola-5-3': 'QM', 'valvola-pneumatica': 'QM',
  'isola-valvole': 'QM', cilindro: 'MM', 'attuatore-rotativo': 'MM', 'trattamento-aria': 'HQ', silenziatore: 'RP',
  valvola: 'QM', 'valvola-motorizzata': 'QM', 'cilindro-idraulico': 'MM', serbatoio: 'CM', scambiatore: 'EP', caldaia: 'EB',
  'terminale-clima': 'EP', refrigerazione: 'EC', filtro: 'HQ',
  // Impianti civili
  'punto-luce': 'EA', 'interruttore-civile': 'SF', citofonia: 'PB',
};

/** Classe a due lettere dalla lettera singola, quando la funzione non basta */
const FROM_LETTER: Record<string, string> = {
  A: 'A', B: 'BG', C: 'CA', E: 'EA', F: 'FC', G: 'GA', H: 'PF', K: 'KF', M: 'MA', P: 'PG', Q: 'QA', R: 'RA', S: 'SF', T: 'TA', U: 'UC',
  V: 'KF', W: 'WD', X: 'XD', Y: 'MB', Z: 'RA',
};

/** Le sigle del progetto usano le due lettere della IEC 81346-2:2019 */
export const uses2019 = (project: Project) => project.settings?.letterCodes === 'iec2019';

/** Due lettere IEC 81346-2:2019 di un simbolo (dalla funzione, altrimenti dalla lettera singola) */
export function code2019(sym: SymbolDef): string {
  const byFunc = CODES_2019[sym.func ?? guessFunction(sym)];
  if (byFunc) return byFunc;
  const one = (sym.letter || '').toUpperCase();
  if (one.length >= 2) return one;
  return FROM_LETTER[one] ?? one;
}

/** Lettera da usare per la sigla di un simbolo nel progetto */
export function deviceLetter(sym: SymbolDef | undefined, project: Project): string {
  if (!sym?.letter) return '';
  return uses2019(project) ? code2019(sym) : sym.letter;
}
