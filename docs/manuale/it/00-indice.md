# Manuale di OpenWiring

OpenWiring è un programma per disegnare schemi elettrici industriali secondo le norme IEC: sigle dei dispositivi, riferimenti incrociati, numeri filo, morsettiere, cavi, PLC, liste ed
export in PDF, DXF ed Excel. Questo manuale spiega ogni funzione con esempi e foto.

Chi inizia può leggere i capitoli 1–3 e disegnare il primo schema in mezz'ora; gli altri capitoli si
consultano quando servono.

## Capitoli

| N. | Capitolo | Contenuto |
|---|---|---|
| 1 | [Introduzione e installazione](01-introduzione.md) | cos'è OpenWiring, installazione, primo avvio, salvataggio |
| 2 | [L'interfaccia](02-interfaccia.md) | menu, barra strumenti, albero, proprietà, libreria, viste, navigazione |
| 3 | [Il primo progetto](03-primo-progetto.md) | esercizio guidato: comando di una pompa con autoritenuta |
| 4 | [Progetto e pagine](04-progetto-e-pagine.md) | dati di progetto, pagine e tipi di pagina, luoghi, cartiglio, proprietà definite dall'utente, copertina, modelli |
| 5 | [Disegnare lo schema](05-disegnare.md) | simboli, fili, giunzioni, potenziali, rimandi, bus di conduttori, testi, immagini, modifica |
| 6 | [Sigle, riferimenti incrociati e numeri filo](06-sigle-e-numerazione.md) | IEC 81346, contatti, immagine dei contatti, numeri filo, sezioni e colori |
| 7 | [Dispositivi e articoli](07-dispositivi-e-articoli.md) | dati dei dispositivi, navigatore, struttura =/+, copia delle proprietà, articoli, database degli articoli, EDZ e CSV |
| 8 | [Morsettiere](08-morsettiere.md) | morsetti, piani, ponticelli, riserve, accessori, schema della morsettiera |
| 9 | [Cavi e connettori](09-cavi-e-connettori.md) | linea di definizione, conduttori, liste cavi, connettori e spine, dati dei pin |
| 10 | [PLC](10-plc.md) | schede, punti I/O, indirizzi, panoramiche, TIA Portal, CODESYS, PLCopen |
| 11 | [Reti, luoghi e schema unifilare](11-reti-luoghi-unifilare.md) | schema di rete, bus, cavi di rete, piano IP, luoghi, unifilare |
| 12 | [Layout del quadro](12-layout-quadro.md) | piastra, guide DIN, canaline, posa automatica, foratura, lunghezze dei fili |
| 13 | [Macro, simboli e cartigli](13-macro-simboli-cartigli.md) | macro, editor dei componenti, QElectroTech, cartigli inclusi e personalizzati |
| 14 | [Liste e pagine automatiche](14-liste-e-pagine-automatiche.md) | distinta, lista d'acquisto, liste, pagine di lista, etichette |
| 15 | [Verifica, ricerca e revisioni](15-verifica-ricerca-revisioni.md) | controlli di progetto, cerca e sostituisci, revisioni, confronto |
| 16 | [Lingue degli schemi](16-lingue.md) | dizionario, schemi in inglese e tedesco, due lingue insieme |
| 17 | [Assistente IA](17-assistente-ia.md) | Claude, ChatGPT e Gemini nel programma, formato testo |
| 18 | [Import ed export](18-import-export.md) | PDF, stampa, DXF, Excel, import da SEE Electrical, EPLAN, QElectroTech |
| 19 | [Riga di comando e agenti](19-riga-di-comando.md) | comandi `npm run cli`, guida per agenti IA |
| 20 | [Scorciatoie, file e problemi](20-scorciatoie-e-problemi.md) | tasti, formati dei file, domande frequenti |

## Convenzioni del manuale

- *Corsivo con frecce* indica un percorso nei menu: *Progetto ▸ Verifica*.
- **⌘** è il tasto Comando del Mac; su Windows si usa **Ctrl**.
- Le sigle si scrivono come sullo schema: `-2K1` (dispositivo), `-X1:3` (morsetto), `200.01` (numero filo).
- Gli esempi usano il **progetto di esempio** «Avviamento motore pompa» (*File ▸ Carica il progetto di
  esempio*), così ogni figura si può ritrovare nel programma.

## Marchi e dati di terzi

OpenWiring è un software indipendente, non affiliato né approvato da EPLAN GmbH & Co. KG, Rittal, SDProget o dai
costruttori citati. EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, Siemens, Schneider Electric, QElectroTech e gli
altri nomi di prodotti e aziende sono marchi dei rispettivi titolari, citati solo per indicare formati di file e
compatibilità. OpenWiring non include né distribuisce macro, simboli o cataloghi dei costruttori: importi solo i file
che hai il diritto di usare, rispettandone le condizioni d'uso. La lettura dei formati EDZ, XML e CSV deriva
dall'analisi dei file di dati, a fini di interoperabilità. Le stesse informazioni sono in *Aiuto ▸ Informazioni*.
