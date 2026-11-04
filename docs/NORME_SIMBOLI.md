# Simboli e sigle: IEC 60617 e IEC 81346-2

Nota di lavoro sui simboli di base di OpenWiring: segno grafico secondo **CEI EN 60617 (IEC 60617)**,
lettera di sigla secondo **CEI EN 81346-2 (IEC 81346-2)**, numerazione dei morsetti dei contatti secondo
**EN 50005**. Le norme non sono libere: le scelte qui sotto vengono dalla conoscenza generale delle norme e
dalla legenda dell'esempio Electro Graphics (`schemi_esempi.pdf`, foglio 31-32), non dal testo ufficiale.
Prima di un uso «a norma» vanno confrontate con il testo della norma.

## Elementi grafici di IEC 60617 usati nei simboli

| Elemento | Dove | Come è disegnato |
|---|---|---|
| Contatto NA / NC / in scambio | contatti, pulsanti, finecorsa | lama inclinata; l'NC con il gancio sul contatto fisso |
| Funzione di interruttore | magnetotermici, salvamotori | croce sul contatto fisso |
| Funzione di sezionatore | sezionatori, sezionatori con fusibili, manovra-sezionatori | trattino trasversale sul contatto fisso |
| Funzione di interruttore di manovra | manovra-sezionatori | cerchietto sul contatto fisso |
| Funzione di contattore | contatti di potenza | semicerchio sul contatto fisso |
| Comando meccanico | pulsanti, selettori, chiave, finecorsa | linea tratteggiata dalla lama all'organo di comando |
| Ritardo («paracadute») | contatti temporizzati | due linee e un arco attaccati alla lama: aperto verso la lama = ritardo all'eccitazione |
| Relè temporizzato | bobine | riquadro laterale con la croce (all'eccitazione, S00312) o pieno (alla diseccitazione, S00311) |
| Comando termico | contatti del relè termico | gradino |
| Apertura positiva | finecorsa NC di sicurezza | cerchio con la freccia sul contatto |
| Grandezza misurata | pressostato, termostato | riquadro con P, θ |

**Correzione**: fino alla 1.6.1 la «Bobina temporizzata (ritardo eccitazione)» aveva il riquadro pieno, che
in IEC 60617 indica il ritardo alla **diseccitazione**. Ora ha la croce; il riquadro pieno è la nuova
«Bobina temporizzata (ritardo diseccitazione)». I punti di connessione non cambiano: i progetti esistenti
mostrano solo il disegno corretto.

## Lettere di sigla (IEC 81346-2)

OpenWiring usa una lettera sola (sigla `-2K1`), come la prassi italiana e la prima lettera della norma.

| Lettera | Classe (scopo) | Nella libreria |
|---|---|---|
| A | due o più scopi | PLC, schede, nodi di rete |
| B | da grandezza fisica a segnale | finecorsa, sensori, fotocellule, pressostati, termostati, livello |
| C | immagazzinare energia | condensatori |
| E | fornire energia (calore, luce) | resistenze di riscaldamento, utenze |
| F | protezione | fusibili, magnetotermici 1-2P, differenziali, relè termici, scaricatori, sezionatori con fusibili |
| G | generare energia | batterie |
| K | elaborare segnali | relè, contattori (bobine e contatti) |
| M | energia meccanica | motori, elettrovalvole |
| P | presentare informazioni | lampade, cicalini, sirene |
| Q | comandare il flusso di energia | magnetotermici 3-4P, salvamotori, sezionatori, manovra-sezionatori |
| R | limitare, stabilizzare | resistenze, diodi, terminazioni di bus |
| S | da azione manuale a segnale | pulsanti, selettori, selettori a chiave |
| T | convertire l'energia | trasformatori, alimentatori |
| U | convertitori (prassi) | inverter |
| W | guidare, trasportare | cavi |
| X | collegare | morsetti, connettori |

### Differenze con l'edizione 2019 della norma

Nell'edizione 2019 alcuni oggetti cambiano classe rispetto alla prassi che OpenWiring segue oggi:

- **contattori di potenza**: classe Q (QA), non K; il relè ausiliario resta K (KF);
- **PLC e controllori**: classe K (KF), non A;
- **inverter**: classe T (TA), non U; gli alimentatori T (TB);
- con due lettere: QA interruttori e contattori, QB sezionatori, FA fusibili, MA motori, MB elettrovalvole,
  BG sensori di posizione, SF pulsanti, PF lampade, XD morsetti, WG cavi.

Cambiare le lettere dei simboli di base cambierebbe le sigle nuove (non quelle già date). È una scelta del
progettista.

## Numerazione dei contatti (EN 50005)

- Contatti ausiliari: cifra d'ordine + cifra di funzione: 1-2 NC, 3-4 NA (13-14, 21-22…).
- Contatti temporizzati: 5-6 NC, 7-8 NA (17-18, 25-26…): simboli `no_ton`, `nc_ton`, `no_toff`, `nc_toff`.
- Relè termico: 95-96 NC, 97-98 NA, fissi: simboli `ol_nc`, `ol_no`.
- Bobine A1-A2; poli di potenza 1-2, 3-4, 5-6 (e N).

## Simboli di base aggiunti

Bobine e contatti: bobina in corrente alternata, bobina ritardata alla diseccitazione, contatti NA/NC ritardati
all'eccitazione e alla diseccitazione, contatti NA/NC del relè termico.
Comandi: selettore NC, selettore a chiave.
Sensori: finecorsa NC ad apertura positiva, finecorsa NA+NC, pressostato, termostato, interruttore di livello,
sensore NPN 3 fili, sensore 2 fili, fotocellula, sensore magnetico (reed).
Protezioni e manovra: magnetotermico 4P, differenziale 2P e 4P, magnetotermico differenziale 2P, sezionatore 3P,
interruttore di manovra-sezionatore 3P, sezionatore con fusibili 3P e 1P, scaricatore di sovratensione.
Utilizzatori: cicalino, sirena, resistenza di riscaldamento, motore in corrente continua, inverter.
Componenti: resistenza, condensatore, diodo, batteria. Collegamenti: terra funzionale FE.
