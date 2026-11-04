// Cosa prendere dai pacchetti EDZ oltre ai dati articolo (caselle nella vista Articoli). Di serie né
// foto né simboli: la libreria resta leggera e gli articoli si associano ai propri simboli col
// modello funzione
import type { EdzOptions } from '../io/edz';

const KEY = 'edz-import';
const DEFAULT: Required<EdzOptions> = { pictures: false, symbols: false };

export function edzPrefs(): Required<EdzOptions> {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') as EdzOptions }; } catch { return DEFAULT; }
}

export function setEdzPrefs(p: Required<EdzOptions>) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* preferenze non salvabili */ }
}
