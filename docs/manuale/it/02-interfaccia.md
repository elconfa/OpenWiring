# 2. L'interfaccia

![La finestra di OpenWiring con le sue parti numerate](../img/it/interfaccia.png)

*La finestra di OpenWiring con il progetto di esempio.*

| N. | Parte | A cosa serve |
|---|---|---|
| 1 | Barra multifunzione: schede | *File* e le schede *Home, Inserisci, Pagine, Progetto, Liste, Revisioni, Visualizza, Aiuto* |
| 2 | Barra multifunzione: comandi | i comandi della scheda aperta, divisi in gruppi con il nome sotto |
| 3 | Albero del modello | pagine, dispositivi, struttura =/+, morsettiere, cavi, articoli del progetto |
| 4 | Proprietà | i dati dell'elemento selezionato, della pagina o del progetto |
| 5 | Area di disegno | la pagina di schema corrente |
| 6 | Libreria | simboli, macro e articoli da inserire |
| 7 | Vista report | messaggi di import, export e operazioni |
| 8 | Barra di stato | suggerimenti sul comando attivo, file, pagina, coordinate del cursore |
| 9 | Schede delle viste | Schema, Dispositivi, PLC, Morsettiere, Articoli, Liste |

## Barra multifunzione

I comandi sono raccolti in **schede**; ogni scheda li divide in gruppi con il nome scritto sotto. Il nome del
tasto rapido compare nel suggerimento di ogni pulsante. Il **doppio clic** su una scheda riduce la barra ai soli
nomi delle schede (un clic la riapre per un comando); *Visualizza ▸ Barra dei comandi ▸ Stile* sceglie tra
barra multifunzione, barra multifunzione compatta e **menu classici**, per chi preferisce i menu a tendina.
*Cerca un comando…* (⌘K) trova qualsiasi comando scrivendone il nome.

![La scheda File](../img/it/menu-file.png)

*La scheda File: avvio, progetti recenti, nuovo, apri, salva, importa, esporta, stampa e PDF, impostazioni.*

| Scheda | Contiene |
|---|---|
| *File* | nuovo, apri, apri accanto, salva, **Importa** (articoli EDZ/XML/CSV, simboli QElectroTech, schema da PDF, macro) ed **Esporta** (PDF, DXF, etichette, PLCopen, articoli, dizionario), stampa, impostazioni, informazioni |
| *Home* | appunti, disegno (seleziona, filo, fili rapidi, morsetti in fila, testo), modifica (ruota, specchia, allinea, elimina), trova (cerca, adatta, pagina precedente e successiva), verifica, PDF e stampa |
| *Inserisci* | simboli e macro, collegamenti (bus fili, bus di rete, cavo, sezione), luoghi, grafica (testo, immagine, disegno DXF) |
| *Pagine* | nuova pagina di ogni tipo, pagine automatiche (liste, disegni dei cavi, piedinature), organizza, foglio (cartiglio, formato e cornice) |
| *Progetto* | impostazioni e proprietà, profili, numerazione di dispositivi e fili, articoli, reti IP e indirizzi, traduzioni, assistente IA |
| *Liste* | controlli, liste, lista I/O PLC, liste personalizzate, viste (dispositivi, morsettiere, connettori, cavi, ripartitori, calcoli), PDF completo, etichette, PLCopen |
| *Revisioni* | revisioni, rilascio, modifiche della revisione, confronto con un altro progetto, salva come modello |
| *Visualizza* | riquadri, tema, foglio, lingua dell'interfaccia e degli schemi, griglia, miniature, mappa del foglio, menu a raggiera, stile della barra |
| *Aiuto* | manuale, giro guidato, scorciatoie, guida per agenti IA, aggiornamenti, informazioni, sito del progetto |

![La scheda Progetto](../img/it/menu-progetto.png)

*La scheda Progetto.*

## Barra Home e strumenti sul disegno

![La scheda Home](../img/it/barra-strumenti.png)

La scheda *Home* raccoglie i comandi usati di continuo. Sopra lo schema c'è anche una piccola barra mobile con
gli strumenti di disegno (selezione, filo, fili rapidi, rimandi, morsetti, testo): si accende e si spegne da
*Visualizza ▸ Strumenti sul disegno*.

| Pulsante | Azione |
|---|---|
| *Seleziona* | torna alla selezione (anche con Esc) |
| *Filo* | disegna i fili (tasto **W**) |
| *Rapido V*, *Rapido H* | filo verticale od orizzontale in un colpo solo |
| *Morsetti in fila* | una fila di morsetti sui fili attraversati |
| *Testo* | testo libero sulla pagina |
| *Ruota, Specchia, Elimina* | sulla selezione (tasti **R** e **Canc**) |
| *Cerca* | trova e sostituisci (⌘F) |
| *Adatta* | mostra tutta la pagina (tasto **F**) |
| *Verifica* | controlli del progetto |
| *PDF*, *Stampa…* | esporta in PDF o stampa |

Nella barra di accesso rapido in alto a sinistra ci sono *Salva*, *Annulla* e *Ripeti* (⌘S, ⌘Z, ⇧⌘Z).

## Albero del modello

![L'albero del modello](../img/it/albero.png)

L'albero mostra il progetto e si apre o chiude con i triangoli ▸ ▾:

- **Pagine**, raggruppate per luogo (quadro, pulsantiera…): un clic apre la pagina.
- **Dispositivi**, raggruppati per luogo: un clic va al dispositivo e lo seleziona.
- **Struttura =Impianto +Luogo**: i dispositivi per funzione e luogo (vedi [capitolo 7](07-dispositivi-e-articoli.md#struttura-impianto-luogo)).
- **Morsettiere** e **Cavi**: un clic apre la morsettiera o seleziona la linea del cavo.
- **Articoli del progetto**: gli articoli usati.

Sotto l'albero ci sono i pulsanti delle pagine: *+ Pagina*, *+ Copertina*, *+ Unifilare*, *+ Rete*,
*+ Layout*, *⧉* (duplica la pagina), *↑ ↓* (sposta) e *✕* (elimina).

## Proprietà

Il pannello mostra i dati di quello che è selezionato:

- **niente selezionato**: la pagina corrente e, sotto, i dati del progetto;
- **un simbolo**: sigla, dati del dispositivo, ordinazione, punti di connessione, posizione;
- **un filo**: numero filo, rete, collegamenti, sezione, colore;
- **più elementi**: i campi comuni.

Si scrive nel campo e si conferma con Invio o uscendo dal campo. I valori in grigio corsivo sono
suggerimenti o valori presi dall'articolo.

## Libreria

![La libreria dei simboli](../img/it/libreria-simboli.png)

La colonna a destra ha tre schede:

- **Simboli**: i simboli IEC 60617 divisi per categoria (bobine e contatti, comandi, protezioni,
  utilizzatori, morsetti e collegamenti, PLC, reti e bus, unifilare), più quelli importati o
  disegnati da te. Il campo *Cerca…* filtra per nome.
  In cima ci sono i **★ Preferiti**: la stella ☆ di un simbolo (o il tasto destro su un componente ▸
  *Aggiungi ai preferiti*) lo mette qui. I preferiti valgono per tutti i progetti.
- **Macro**: i circuiti salvati per essere riusati (vedi [capitolo 13](13-macro-simboli-cartigli.md)).
- **Articoli**: la libreria degli articoli dei produttori.

## Menu del tasto destro

![Il menu del tasto destro](../img/it/menu-contestuale.png)

Il tasto destro su un elemento apre i comandi più usati: taglia, copia, incolla qui, duplica, ruota,
specchia, elimina, crea macro dalla selezione, **copia proprietà** e **incolla proprietà di -X** (tutti i dati del dispositivo tranne la sigla, [capitolo 7](07-dispositivi-e-articoli.md#copiare-le-proprietà)), modifica il componente, aggiungi ai preferiti, evidenzia potenziale (sui fili),
vai all'elemento principale o ai contatti, aggiungi piano (sui morsetti), seleziona tutto, cerca,
duplica pagina, adatta alla finestra.

## Viste

Le schede in alto a destra cambiano la parte centrale:

| Vista | Contenuto |
|---|---|
| *Schema* | la pagina di disegno |
| *Dispositivi* | il navigatore dei dispositivi a tabella |
| *PLC* | schede, indirizzi e lista I/O |
| *Morsettiere* | il navigatore delle morsettiere |
| *Articoli* | la gestione articoli |
| *Liste* | controlli, traduzioni e tutte le liste |

## Muoversi nel disegno

| Azione | Come |
|---|---|
| Ingrandire e ridurre | rotella del mouse, attorno al cursore (sul trackpad: pizzico) |
| Spostare la vista | tasto centrale del mouse, oppure **Alt** + trascina |
| Vedere tutta la pagina | **F** o *Adatta* |
| Pagina precedente o successiva | **PagSu** / **PagGiù** |
| Andare a un riferimento | clic su un rimando come `/2.4` |

## Tema e foglio

*Visualizza ▸ Tema* sceglie l'interfaccia chiara, scura o come il sistema. *Visualizza ▸ Foglio di
disegno* sceglie il foglio bianco o scuro (come nei CAD con lo sfondo nero). PDF, DXF e stampa sono
sempre su foglio bianco.
