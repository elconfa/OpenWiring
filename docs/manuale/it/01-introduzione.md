# 1. Introduzione e installazione

## Cos'è OpenWiring

OpenWiring è un CAD elettrico: non si disegnano linee, ma **dispositivi collegati**. Il programma sa che
il contatto `-2K1 13-14` appartiene alla bobina `-2K1`, che due fili uniti da un pallino sono lo stesso
conduttore e che il morsetto `-X1:3` porta il filo `1.06` al motore. Da queste informazioni ricava da solo:

- i **riferimenti incrociati** tra bobine e contatti, e tra pagine diverse;
- i **numeri filo** e la loro posizione sullo schema;
- le **liste**: distinta materiali, lista d'acquisto, dispositivi, morsetti, connessioni, fili, cavi, I/O PLC;
- la **verifica** del progetto: cortocircuiti, collegamenti mancanti, sigle doppie;
- gli **export**: PDF con collegamenti cliccabili, DXF, Excel per TIA Portal, etichette per le stampanti.

I concetti sono quelli abituali del disegno elettrico industriale: sigle IEC 81346, griglia di 4 mm, pagine A3
a 10 colonne, rimandi `/pagina.colonna`, il tutto con un'interfaccia semplice.

## Installazione

Il programma si scarica dalla pagina **Releases** del progetto su GitHub
(<https://github.com/elconfa/OpenWiring/releases>).

| Sistema | File da scaricare |
|---|---|
| macOS con processore Apple (M1, M2, M3, M4) | `OpenWiring-x.y.z-arm64.dmg` |
| macOS con processore Intel | `OpenWiring-x.y.z.dmg` |
| Windows 10 e 11, con installazione | `OpenWiring.Setup.x.y.z.exe` |
| Windows, senza installazione (un solo file, anche da chiavetta USB) | `OpenWiring-x.y.z-portable.exe` |
| Windows, senza installazione (cartella) | `OpenWiring-x.y.z-win.zip` |

### macOS

1. Apri il file `.dmg` e trascina **OpenWiring** nella cartella *Applicazioni*.
2. Apri l'app una volta: compare l'avviso «Apple non può verificare…», perché l'app non è firmata con un
   certificato Apple a pagamento. Chiudi l'avviso.
3. Apri *Impostazioni di sistema ▸ Privacy e sicurezza*, scorri in fondo e premi **Apri comunque**, poi conferma.
   Su macOS 14 e precedenti basta clic destro sull'app ▸ *Apri* ▸ *Apri*.

> **Se compare «OpenWiring è danneggiato»** (versioni fino alla 0.14.0): apri il Terminale ed esegui
> `xattr -cr /Applications/OpenWiring.app`, poi riapri l'app.

### Windows

Estrai lo zip in una cartella (per esempio *Documenti\\OpenWiring-app*) e avvia `OpenWiring.exe`. Nella finestra blu di SmartScreen scegli *Ulteriori informazioni ▸ Esegui comunque*.

### Lingua dell'interfaccia

Al primo avvio il programma usa la lingua del sistema, se è italiano, inglese, francese, tedesco,
spagnolo o russo. Si cambia in qualunque momento con *Visualizza ▸ Language · Lingua*. La lingua degli schemi
(cartigli, liste, PDF) è un'altra impostazione: vedi il [capitolo 16](16-lingue.md).

## Primo avvio

Al primo avvio si apre il **progetto di esempio** «Avviamento motore pompa», sei pagine pronte da esplorare:

| Pagina | Contenuto |
|---|---|
| 1 | potenza: salvamotore, contattore, morsettiera, cavo e motore; alimentatore 24 V |
| 2 | comando: emergenza, marcia con autoritenuta, lampade |
| 3 | ingressi e uscite del PLC |
| 4 | panoramica della scheda PLC, generata dal programma |
| 5 | schema di rete Profinet e Modbus tra due quadri |
| 6 | schema unifilare della potenza |

Si riapre in ogni momento con *File ▸ Carica il progetto di esempio*; *File ▸ Nuovo progetto* parte da
una pagina vuota.

## Salvare il lavoro

- **Salva** (⌘S) scrive il progetto in un file `.ecad`. *Salva con nome…* (⇧⌘S) ne crea una copia.
- **Apri** (⌘O) riapre un file `.ecad`. Il file contiene tutto: pagine, impostazioni, simboli e articoli usati.
- Il programma tiene anche una **copia automatica** dell'ultimo progetto aperto e la ripropone alla
  riapertura: è una sicurezza in caso di chiusura improvvisa, non sostituisce *Salva*.
- La barra di stato in basso mostra il nome del file e un pallino `•` quando ci sono modifiche non salvate.

## Annullare

Ogni modifica si annulla con **⌘Z** (*Modifica ▸ Annulla*) e si ripete con **⇧⌘Z** (Ctrl+Y su Windows).
Si possono annullare fino a 100 passi, anche le operazioni grandi come l'applicazione di pagine scritte
dall'assistente IA o una modifica in blocco di molti dispositivi.
