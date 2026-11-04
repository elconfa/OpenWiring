# 20. Scorciatoie, file e problemi

## Scorciatoie da tastiera

Su Windows si usa **Ctrl** al posto di **⌘**. *Aiuto ▸ Scorciatoie e informazioni* le riassume.

| Tasto | Azione |
|---|---|
| **W** | disegna filo |
| **R** | ruota la selezione, o il simbolo da inserire |
| **F** | adatta la pagina alla finestra |
| **Canc**, Backspace | elimina la selezione |
| **Esc** | termina il comando corrente |
| **Frecce** | sposta la selezione di 4 mm (con ⇧ 16 mm) |
| **PagSu**, **PagGiù** | pagina precedente, successiva |
| ⌘Z, ⇧⌘Z (Ctrl+Y) | annulla, ripeti |
| ⌘C, ⌘X, ⌘V | copia, taglia, incolla (anche in un altro progetto) |
| ⌘D | duplica la selezione |
| ⌘A | seleziona tutto nella pagina |
| ⌘F | cerca e sostituisci |
| ⌘S, ⇧⌘S, ⌘O | salva, salva con nome, apri |
| ⌘P | stampa |
| ⌘I | apre o chiude l'assistente IA |
| Rotella | zoom attorno al cursore |
| Tasto centrale, **Alt** + trascina | sposta la vista |
| **Shift** + clic | aggiunge o toglie un elemento dalla selezione |
| Tasto destro | menu contestuale; durante l'inserimento termina il comando |

## File

| Estensione | Contenuto |
|---|---|
| `.ecad` | progetto OpenWiring: pagine, elementi, impostazioni, articoli e simboli usati, in un file JSON leggibile |
| `.ecmacro` | macro da scambiare |
| `.edz`, `.xml`, `.csv` | articoli dei produttori (pacchetti EDZ, XML nel formato EPLAN, CSV dei dati commerciali) |
| `.elmt`, `.qet` | componenti di QElectroTech |
| `.pdf` | schemi e liste; anche come sorgente per l'import da altri CAD |
| `.dxf` | pagine, piastra di foratura, cartigli da importare |
| `.xlsx`, `.csv` | liste, dispositivi, variabili PLC, etichette, dizionario |
| `.txt` | pagine nel formato testo |

La **libreria personale** (articoli, simboli importati, macro, cartigli, modelli di progetto) è salvata nel
programma su quel computer. Gli elementi usati in un progetto vengono copiati nel file `.ecad`, così il
progetto si apre completo anche altrove.

## Domande frequenti

**Un filo sembra collegato ma la verifica dice che non lo è.**
Il filo passa sopra il punto di connessione senza terminarci. Trascina l'estremo del filo sul punto,
oppure cancella il filo e ridisegnalo terminando sul punto (il cerchietto verde).

**Due fili si incrociano: sono collegati?**
No, a meno che ci sia il pallino della giunzione. Per collegarli fai terminare un filo sull'altro.

**Il contatto non mostra il rimando alla bobina.**
Il contatto deve avere la stessa sigla della bobina. Controlla la sigla nelle proprietà del contatto.

**Ho aggiunto un componente e i numeri filo sono cambiati.**
Succede con la numerazione *ricalcolata*. Con quella *bloccata* (predefinita) i numeri esistenti non cambiano.

**Il numero filo cambia dopo un morsetto.**
Nelle proprietà del morsetto controlla *Numero filo ▸ Il numero filo passa*.

**Un rimando mostra `/?` in rosso.**
Manca il rimando corrispondente con lo stesso nome su un'altra pagina.

**Il PDF non contiene le liste.**
Spunta *Liste in coda* nella finestra del PDF, oppure crea le pagine di lista.

**L'app su macOS non si apre.**
Vedi [Installazione](01-introduzione.md#macos): *Impostazioni ▸ Privacy e sicurezza ▸ Apri comunque*.

**L'assistente IA risponde «Accesso all'account scaduto».**
Esegui nel Terminale il comando indicato (per esempio `codex login`), poi riprova.

**Il componente QElectroTech importato non funziona.**
Probabilmente è stata salvata la pagina web di GitHub invece del file: scarica con *Raw*.

**Ho perso il lavoro dopo una chiusura improvvisa.**
Alla riapertura il programma ripropone l'ultimo progetto in lavorazione. Salva comunque spesso con ⌘S.
