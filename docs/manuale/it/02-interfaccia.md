# 2. L'interfaccia

![La finestra di OpenWiring con le sue parti numerate](../img/it/interfaccia.png)

*La finestra di OpenWiring con il progetto di esempio.*

| N. | Parte | A cosa serve |
|---|---|---|
| 1 | Barra dei menu | tutti i comandi: *File, Modifica, Visualizza, Inserisci, Progetto, Liste, Aiuto* |
| 2 | Barra strumenti | i comandi di disegno più usati |
| 3 | Albero del modello | pagine, dispositivi, struttura =/+, morsettiere, cavi, articoli del progetto |
| 4 | Proprietà | i dati dell'elemento selezionato, della pagina o del progetto |
| 5 | Area di disegno | la pagina di schema corrente |
| 6 | Libreria | simboli, macro e articoli da inserire |
| 7 | Vista report | messaggi di import, export e operazioni |
| 8 | Barra di stato | suggerimenti sul comando attivo, file, pagina, coordinate del cursore |
| 9 | Schede delle viste | Schema, Dispositivi, PLC, Morsettiere, Articoli, Liste |

## Barra dei menu

![Il menu File](../img/it/menu-file.png)

*Il menu File: progetti, import ed export.*

Ogni comando del programma è in un menu; accanto alle voci compaiono le scorciatoie da tastiera. Con un menu
aperto, le frecce ← → passano al menu vicino ed Esc lo chiude.

| Menu | Contiene |
|---|---|
| *File* | nuovo, apri, salva, progetto di esempio, pagine in testo per gli assistenti IA, **Importa** (articoli EDZ/XML/CSV, simboli QElectroTech, schema da PDF, macro, confronto) ed **Esporta** (PDF, stampa, DXF, etichette, PLCopen, articoli, dizionario) |
| *Modifica* | annulla e ripeti, taglia, copia, incolla, duplica, elimina, seleziona tutto, ruota, specchia, cerca e sostituisci |
| *Visualizza* | viste, adatta pagina, pagina precedente e successiva, tema chiaro o scuro, foglio bianco o scuro, lingua degli schemi, lingua dell'interfaccia, scritte sotto le icone |
| *Inserisci* | filo, cavo, riquadro di quadro, testo, immagine, bus di conduttori, collegamenti di rete per protocollo, pagine di ogni tipo, pagine automatiche |
| *Progetto* | proprietà, proprietà definite dall'utente, verifica, assistente IA, rinumerazioni, cartiglio, luoghi, reti IP, traduzioni, revisioni, modelli |
| *Liste* | controlli, traduzioni e tutte le liste del progetto, PDF completo |
| *Aiuto* | manuale, scorciatoie, guida per agenti IA, sito del progetto, informazioni (versione, autore, marchi e dati di terzi) |

![Il menu Progetto](../img/it/menu-progetto.png)

*Il menu Progetto.*

## Barra strumenti

![La barra strumenti](../img/it/barra-strumenti.png)

| Pulsante | Azione |
|---|---|
| *Nuovo, Apri, Salva* | gestione del file di progetto |
| *Annulla, Ripeti* | ⌘Z e ⇧⌘Z |
| *Seleziona* | torna alla selezione (anche con Esc) |
| *Filo* | disegna fili (tasto **W**) |
| *Bus* e l'elenco dei protocolli | disegna un collegamento di rete (Profinet, EtherCAT, Modbus…) |
| *Bus fili* | raggruppa i fili in un bus di conduttori ([capitolo 5](05-disegnare.md#bus-di-conduttori)) |
| *Quadro* | riquadro di un quadro nello schema di rete |
| *Cavo* | linea di definizione di un cavo |
| *Testo* | testo libero sulla pagina |
| *Ruota, Elimina* | sulla selezione (tasti **R** e **Canc**) |
| *Adatta* | mostra tutta la pagina (tasto **F**) |
| *Cerca* | cerca e sostituisci (⌘F) |
| *Verifica* | controlli di progetto |
| *EDZ* | importa articoli dei produttori |
| *PDF* | esporta il progetto in PDF |

Togliendo *Visualizza ▸ Scritte sotto le icone* la barra diventa una riga di sole icone, più bassa.

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
