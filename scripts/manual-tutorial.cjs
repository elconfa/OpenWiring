// Schema del capitolo «Il primo progetto», nel formato testo: ogni passo aggiunge righe al precedente.
const head = `pagina 1 "Comando pompa"`;
const steps = [
  // 1. Barre di alimentazione
  `  simbolo potential +24V @28,24
  simbolo potential 0V @28,232
  filo 28,24 400,24
  filo 28,232 400,232`,
  // 2. Simboli
  `  simbolo pb_nc -1S1 @60,48 descr="Arresto pompa"
  simbolo pb_no -1S2 @60,80 descr="Marcia pompa"
  simbolo coil -1K1 @60,148 descr="Contattore pompa" dati="24 V DC"`,
  // 3. Fili
  `  filo 60,24 60,48
  filo 60,64 60,80
  filo 60,96 60,148
  filo 60,164 60,232`,
  // 4. Autoritenuta e lampada di marcia
  `  simbolo no -1K1 @92,80
  filo 60,72 92,72 92,80
  filo 92,96 92,104 60,104
  simbolo no -1K1 @140,80
  simbolo lamp -1P1 @140,128 descr="Pompa in marcia"
  filo 140,24 140,80
  filo 140,96 140,128
  filo 140,144 140,232`,
];
/** Testo della pagina fino al passo n (1…4) */
const tutorialText = n => [head, ...steps.slice(0, n)].join('\n');
module.exports = { tutorialText, STEPS: steps.length };
