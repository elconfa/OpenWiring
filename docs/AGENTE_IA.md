# OpenWiring — guida per agenti di intelligenza artificiale

Questa guida spiega a un agente di intelligenza artificiale (in chat o con accesso al terminale) come
**scrivere, controllare, modificare e disegnare** schemi elettrici per **OpenWiring**, un CAD elettrico open source per schemi
multifilari. Si lavora con il **formato testo delle pagine** (OpenWiring testo v1): una riga per elemento.
L'agente produce il testo, OpenWiring lo controlla e lo trasforma in pagine di schema.

Rispondi sempre in **italiano** (con gli accenti corretti) e segui le convenzioni del progettista.

---

## 1. Come si lavora

### A. In chat (l'utente fa da tramite)
1. L'utente, in OpenWiring, apre *Progetto ▸ Pagine in testo (assistenti IA)…* (scheda Progetto della barra
   multifunzione; con i menu classici *File ▸ Pagine in testo*), preme **Esporta in testo** e
   ti incolla il testo (di solito con il catalogo dei simboli) insieme alla richiesta.
2. Tu rispondi con le **pagine complete** da sostituire o aggiungere, in **un unico blocco di codice**.
3. L'utente incolla la risposta nella stessa finestra, preme **Controlla** (errori con il numero di riga e
   problemi della verifica) e **Applica al progetto**. Se ti riporta degli errori, correggili e rimanda
   solo le pagine interessate.

### B. Agente con terminale (cartella del progetto OpenWiring)
Nella cartella dei sorgenti (dopo `npm ci`):

```bash
npm run -s cli -- guida                                   # questa guida
npm run -s cli -- catalogo [--tutti]                      # simboli (anche la cartella dell'utente), tipi di scheda PLC
npm run -s cli -- esporta progetto.ecad [--pagine 2,3] [--catalogo] > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt      # errori del testo + verifica delle pagine toccate
npm run -s cli -- applica progetto.ecad pagine.txt [-o nuovo.ecad]   # se progetto.ecad non esiste lo crea
npm run -s cli -- verifica progetto.ecad                  # verifica di tutto il progetto
```

Aggiungi `--json` per un'uscita leggibile da programma. `controlla` e `verifica` escono con codice 1 se
ci sono errori. **Ciclo di lavoro**: scrivi il testo → `controlla` → correggi finché non ci sono errori
né avvisi che non sai spiegare → `applica` → `verifica`. Non consegnare mai un testo che non hai
controllato, se hai il terminale.

---

## 2. Regole da rispettare sempre

1. **Usa solo i simboli del catalogo** (sezione 10) o quelli che definisci con `simbolodef`. Non inventare
   identificativi.
2. **Coordinate sulla griglia di 4 mm** (multipli di 4), dentro l'area di disegno: x 20…410,
   y 10…252. Sotto y 252 c'è il cartiglio.
3. **Fili solo orizzontali o verticali.** Un filo collega i punti di connessione dove **inizia o finisce**
   (o un altro filo su un vertice o in mezzo a un segmento, giunzione a T). Un filo che **passa sopra** un
   punto di connessione **non** lo collega: interrompi il filo sul punto.
4. Per i collegamenti nuovi preferisci `collega <sigla:punto> <sigla:punto>`: il programma calcola il
   percorso (a L, prima nella direzione d'uscita del punto). Usa `via x,y` per evitare di passare sopra
   altri simboli.
5. **Una pagina scritta sostituisce per intero** quella con lo stesso numero: riscrivi tutti i suoi
   elementi, anche quelli che non cambi, **con tutti gli attributi esportati dal programma** così come sono
   (`articoli=`, `mostra=`, `postesti=`, `posnumeri=`, `conduttore=`, `fissato=`, le opzioni di `lineacavo`…):
   un attributo tolto è un dato perso (testi spostati, conduttori scelti, articoli aggiuntivi).
6. **Non cambiare sigle e numeri filo esistenti** se non ti viene chiesto. I numeri filo si bloccano con
   `n=` sul filo (es. `n=200.01`).
7. Le pagine generate dal programma (panoramiche PLC, schemi delle morsettiere, liste, layout,
   copertina) **non si scrivono**: si esportano solo come intestazione.
8. **Rotazioni**: usa per ogni simbolo solo le rotazioni ammesse indicate nel catalogo (`rot 0/90`;
   senza indicazione tutte) e non specchiare i simboli «non specchiabile»: il controllo lo segnala come errore.
9. **Testi dei simboli** (sigla, descrizione, designazioni dei punti, numero e sigla della morsettiera): posizione e
   orientamento li decide l'editor dei simboli per ogni rotazione; gli spostamenti fatti a mano sullo schema
   tornano nel testo come `postesti=` (JSON) e vanno lasciati come sono. Non scrivere `postesti=` nuovi: se un
   testo cade male, segnalalo all'utente invece di spostare il simbolo per aggirarlo.
10. Quando qualcosa non è chiaro (un componente illeggibile, un collegamento ambiguo), **non indovinare**:
   fai la scelta più prudente, segnala il dubbio in un commento `# DUBBIO: …` nel testo e riassumilo
   nella risposta.

---

## 3. Convenzioni del progettista

- **Sigle dei dispositivi**: pagina + lettera + numero, con il trattino: `-2K1` = primo contattore/relè
  della pagina 2; `-200K3` a pagina 200. Per una sigla nuova scrivi `-?` e il programma la assegna.
- **Lettere** (IEC 81346-2): K relè e contattori · S pulsanti, selettori · B sensori, finecorsa,
  pressostati, termostati, fotocellule · F protezioni (fusibili, sezionatori con fusibili, magnetotermici 1-2P,
  differenziali, relè termici, scaricatori) · Q interruttori di potenza, salvamotori, sezionatori,
  interruttori di manovra-sezionatori · M motori, elettrovalvole · P lampade, cicalini, sirene ·
  T trasformatori, alimentatori · U inverter, convertitori · A PLC, schede, apparecchi complessi ·
  X morsetti, connettori · W cavi · R resistenze, diodi, terminazioni · C condensatori · G batterie ·
  E riscaldatori, illuminazione.
- **Contatti**: hanno la stessa sigla della bobina (`-2K1`) e i numeri dei morsetti si assegnano in
  automatico in ordine di disegno: la prima cifra è il numero d'ordine del contatto, la seconda 3-4 per i
  NA e 1-2 per gli NC (13-14, 21-22, 33-34…); i contatti temporizzati 7-8 NA e 5-6 NC (17-18, 25-26…); i contatti
  del relè termico 95-96 (NC) e 97-98 (NA). Per numeri diversi: `pin="1=43;2=44"`.
- **Numeri filo**: pagina.progressivo, es. `200.01`; con la numerazione bloccata i numeri non cambiano.
  I conduttori collegati a un potenziale (L1, N, PE, +24V…) prendono il nome del potenziale.
- **Morsettiere**: `X` + numero, anche gerarchico (`X1.1.2`); morsetto con i due punti: `-X1:3`.
  Morsetti a più piani: `-X1:1A`, `-X1:1B`. Morsetti Weidmüller.
- **Luoghi** (contenitori): `+QE` quadro elettrico, `+BM` bordo macchina, `+P1` pulsantiera…;
  si definiscono con `luogo` e si assegnano a pagine (`pagina … luogo=QE`) o dispositivi (`luogo=BM`).

---

## 4. Il foglio

- A3 orizzontale, 420 × 297 mm, origine in alto a sinistra, **y verso il basso**, griglia 4 mm.
- Area di disegno x 20…410, y 10…252, divisa in **10 colonne**:
  1: x 20–59 · 2: x 59–98 · 3: x 98–137 · 4: x 137–176 · 5: x 176–215 · 6: x 215–254 · 7: x 254–293 · 8: x 293–332 · 9: x 332–371 · 10: x 371–410.
- I rimandi e le liste indicano le posizioni come **pagina.colonna** (es. `2.4`).

---

## 5. Come si disegna (schemi tipici)

**Circuito di comando 24 V DC**
- Barra +24V in alto (posizione fissa del primo filo in alto), che arriva da una pagina precedente: `simbolo link_in +24V @24,20 rot=90` e `filo 24,20 404,20`.
- Barra 0V in basso (primo filo in basso): `simbolo link_in 0V @24,236 rot=90` e `filo 24,236 404,236`.
- Se le barre proseguono nella pagina successiva, chiudile a destra con una partenza: `simbolo link +24V @404,20 rot=270`.
- I percorsi di corrente sono **verticali**, uno per colonna o ogni 20–40 mm in x: dall'alto protezioni e
  comandi (pulsanti, contatti), in basso la bobina o il carico, che va alla barra 0V.
- I simboli a due punti hanno il punto 1 in (0,0) e il punto 2 in (0,16): uno sotto l'altro con passo di
  32 mm in y (es. y 40, 72, 104…) e un filo che li unisce.
- Autoritenuta: contatto NA della bobina in parallelo al pulsante di marcia, con due giunzioni a T.

**Posizioni fisse del progetto** (uguali su tutte le pagine; *Impostazioni progetto ▸ Posizioni fisse*):
- Fili in alto: il primo a y 20, i successivi un passo di 4 mm sotto (y 20, 24, 28…), da x 24 a x 404.
- Fili in basso: il primo a y 236, i successivi un passo di 4 mm sopra (y 236, 232, 228…), da x 24 a x 404.
- Quando l'utente non indica altro, metti le barre di alimentazione e i punti I/O in queste posizioni.

**Potenza trifase**
- Potenziali a sinistra: `L1` y 24, `L2` y 32, `L3` y 40, `N` y 48, `PE` y 56 (x 28) con le barre fino a x 400.
- Apparecchi a tre poli (salvamotore, contattore 3P, motore) con i punti a x, x+8, x+16; si scende in
  verticale dalle barre con giunzioni a T.

**Sequenza di cablaggio** (ordine dei collegamenti da–a nelle liste): di serie i punti di un conduttore si
collegano in catena per posizione (dall'alto in basso, da sinistra a destra) e quelli di un ripartitore o di
una barra di terra (`ripartitore … tipo=terra`) partono tutti dal foro. Per un'altra sequenza scrivi il verso
del nodo a T sull'estremo del filo che fa da gambo (`nodo1=`/`nodo2=` sinistra, destra, su, giu: il braccio
della linea passante a cui va il gambo) oppure una riga `ordine -1K1:1 -1K2:1 -1K3:1` nella pagina. Lascia come
sono le righe `ordine` e gli attributi `nodo1=`/`nodo2=` esportati dal programma.

**Tra pagine**: lo stesso conduttore continua con un **rimando** o con lo stesso **potenziale**. Ogni
rimando di partenza (`link +24V`) va a **un solo** rimando di arrivo (`link_in +24V`) con lo stesso nome, mai
partenza con partenza o arrivo con arrivo; per portare un conduttore su più pagine fai una catena (arrivo a
sinistra, partenza a destra). Il programma scrive da solo il rimando /pagina.colonna. Il filo collegato a un
rimando ha sempre come numero il nome del rimando.

**PLC**: definisci la scheda con `scheda -3A1 tipo=…`; ogni ingresso è `simbolo plc_di -3A1 @x,y canale=DI0
variabile=Nome commento="…"`, ogni uscita `plc_do` con `canale=DO0`; `plc_power` per L+ / M.

**Cavi**: `cavo -1W1 tipo=FG16OR16 conduttori="BN BK GY GNYE"` più `lineacavo -1W1 x,y x,y` che
attraversa i fili del cavo. I conduttori liberi si assegnano in ordine di pagina (il PE al giallo-verde) e poi
**restano fissati** sui fili (`fissato=W1:BN` sul filo), così aggiungere un filo prima non sposta gli altri;
un conduttore scelto a mano si scrive sul filo con `conduttore=W1:BK`. Con `articolo=` il cavo prende i
conduttori dell'articolo (`marcatura=numeri|colori`); `pindi=-510NG1` per i cavi già collegati a un
dispositivo (il morsetto n prende il conduttore n). Un cavo su più pagine ha **una linea principale**
(`principale`, con tipo e sezione); le altre mostrano di serie solo la sigla. Opzioni della linea: `testi=`,
`posizione=`, `schermo=fine|inizio|nessuno` (collegamento dello schermo, il filo verso il PE parte dal suo
punto in fondo), `altezzaschermo=`, `nomi=verticali` (colori composti lunghi).

**Morsettiere**: la riga `morsettiera -X1 articolo="WDU 2.5" fermo="WEW 35/2" piastra="WAP 2.5-10"
ponticelli="pettine:1,2,3" riserve="11 12" separatori="3"` porta articoli, fermi e piastre con le quantità
(`fermi=2`, `piastre=1`), ponticelli, riserve, separatori e altri accessori; i morsetti sullo schema restano
simboli `-X1:1`, `-X1:2`… Un morsetto (stessa sigla e numero) va disegnato una volta sola: su due pagine
è lo stesso morsetto.

**Schema di rete**: pagina `tipo=rete` con nodi `net_node2`, `net_node2b`, `net_switch`…, fili con
`bus=<protocollo>` (Profinet, EtherCAT, Modbus TCP, Modbus RTU, Profibus DP, EtherNet/IP, CANopen, IO-Link, RS485, Ethernet, Generico) e `riquadro +Q1 @x,y LxH` per i quadri.

**Bus di conduttori** (modalità BUS): `filo x,y x,y busfili="400V AC"` è una linea spessa che porta più
conduttori (`busfili=_` senza nome; stesso nome = stesso bus su più pagine). Ogni filo che tocca il bus con un
estremo indica il conduttore con `cond1=L1` (estremo iniziale) o `cond2=L1` (finale): i fili con lo stesso
conduttore sullo stesso bus sono collegati.

**Schema unifilare**: pagina `tipo=unifilare`, simboli `ol_…` con la stessa sigla del multifilare,
linee con `poli=3` e `testo="3/N/PE ~400 V"`.

**Componenti che non sono nel catalogo**: prima cerca nella libreria dell'utente (in fondo al catalogo,
raggruppata per categoria: è la **cartella dei simboli**, un file `.ecsym` per simbolo, sottocartelle =
gruppi; di solito `~/Documents/OpenWiring/Simboli`, oppure `--simboli <cartella>` o la variabile
`OPENWIRING_SIMBOLI`). I simboli nella sottocartella `Eliminare` sono stati eliminati dall'utente: non usarli (non
sono nel catalogo). Se non c'è, **segnalalo all'utente** nel riepilogo: nome del componente, lettera
di sigla, punti di connessione con le designazioni (es. «sezionatore 4 poli: 1-2, 3-4, 5-6, 7-8»), così
può disegnarlo nell'editor dei componenti e ritroverai il simbolo nella cartella. Se intanto serve lo
schema, usa una scatola con `simbolodef` e scrivi nel riepilogo che è provvisoria, per esempio un avviatore statico:
`simbolodef soft3 "Avviatore statico" lettera=Q pin="L1:0,0 L2:8,0 L3:16,0 T1:0,32 T2:8,32 T3:16,32"`.

---

## 6. Sintassi completa

```text
OpenWiring testo v1 — pagine di schema in formato testo
Una riga per elemento; "#" inizia un commento. Coordinate in mm sul foglio A3 (420×297),
origine in alto a sinistra, y verso il basso, griglia di 4 mm; area di disegno x 20…410, y 10…252.

Dati di progetto (righe facoltative, prima delle pagine; aggiornano o creano i dati con quel nome):
progetto [nome="…"] [descr="…"] [ditta="…"] [cliente="…"] [disegno=…] [autore=…] [rev=…] [data=AAAA-MM-GG]
luogo +<codice> "<nome>" [tipo="Quadro elettrico|Pulsantiera|Bordo macchina|Cassetta di derivazione|Campo|Altro"]
cavo -<sigla> [tipo=FG16OR16] [sezione=1,5] [conduttori="BN BK GY GNYE"] [lunghezza=15] [da=…] [a=…]
    [descr="…"] [articolo=…] [marcatura=numeri|colori] [pezzi=si|no] [pindi=-510NG1] [schermato] [coppie]
    pindi: dispositivo con il connettore integrato, il filo dal suo morsetto n prende il conduttore n.
morsettiera -<sigla> [articolo=…] [fermo=… fermi=2] [piastra=… piastre=1] [ponticello=…] [separatore=…]
    [riserve="11 12"] [articoliriserve="11=WDU 2.5"] [separatori="3 7"] [ponticelli="pettine:1,2,3 | fisso:4,5:WQV 2.5/2"]
    [accessori="[{\"partNr\":\"TS35\",\"qty\":1,\"note\":\"guida 1 m\"}]"]   (JSON tra virgolette, con \" dentro)
connettore -<sigla> [tipo=ilme-cne-16] [genere=M|F|MF] [pin=16] [descr="…"] [custodia="…"]
    (tipi: ilme-ck-03…12, ilme-cne-06/10/16/24, ilme-cse-…, ilme-cqe-10/18/32/46, ilme-cdd-24/42/72/108;
    i pin sullo schema sono simboli conn_male / conn_female / conn_pair con sigla -X10:1 … -X10:PE)
simbolodef <id> "<nome>" lettera=U [ruolo=dispositivo|bobina|contatto] [categoria="…"]
    pin="L1:0,0 L2:8,0 L3:16,0 U:0,24 V:8,24 W:16,24"   (nome:x,y relativi; y=0 in alto, il più in basso = sotto)
    Crea un simbolo a scatola con i punti di connessione indicati, per i componenti che non
    sono nel catalogo (inverter, resistenze, sensori a 2 fili…). Si usa poi con "simbolo <id> …".
ripartitore -<sigla> tipo=barra|morsetti|terra gruppi="L1:35:6x4,5 | L2:35:6x4,5" [descr="…"] [articolo=…]
    Ripartitore (es. Cembre DB100-6/4), morsettiera di distribuzione o barra di terra (tipo=terra,
    es. gruppi="PE:35:10x16", un foro per uscita): per ogni gruppo (polo o
    morsetto di ingresso) nome:sezione max ingresso:sezioni max delle uscite (4,5;4,5;6 oppure 6x4,5,
    «-» se non indicata). Sullo schema ogni gruppo è il simbolo rip:<sigla>:<gruppo> (es. rip:Q50:L1),
    ingresso "in" in alto, uscite /o1, /o2… in basso ogni 8 mm (nomi L1.1, L1.2…).
scheda -<sigla> tipo=<tipo di scheda PLC> [stazione=PLC1] [descr="…"] [articolo=…]
    oppure tipo=custom nome="…" canali="DI=16;DO=16;AI=0;AO=0"   (tipi: vedi il catalogo)

pagina <numero> "<titolo>" [tipo=schema|unifilare|rete] [luogo=<codice>]
    Importando, una pagina con lo stesso numero viene sostituita per intero; un numero nuovo
    crea una pagina. Le pagine non presenti nel testo restano come sono.
simbolo <id> <sigla> @x,y [rot=0|90|180|270] [specchio] [descr="…"] [dati="…"] [articolo=…]
    [costruttore=…] [tipo=…] [ordine=…] [note="…"] [luogo=…] [funzione=…] [canale=DI0]
    [variabile=…] [commento="…"] [ip=…] [indirizzo=…] [pin="1=13;2=14"] [numerofilo=passa|cambia]
    [testi=si|no] [immaginecontatti=sotto|simbolo] [versotesti=auto|parallelo|perpendicolare]
    [articoli=JSON] [proprieta=JSON] [mostra=JSON] [postesti=JSON] [interfacce=JSON]   (articoli aggiuntivi, proprietà,
    testi mostrati/nascosti e testi spostati: scritti dal programma, da lasciare come sono se non servono)
    <id> è l'identificativo del simbolo (vedi catalogo); <sigla> con il trattino: -2K1, -X1:3;
    "-?" = sigla nuova automatica; potenziali e rimandi senza trattino: L1, PE, +24V, 0V.
    I contatti con la stessa sigla della bobina ne sono i contatti (13-14, 21-22… automatici).
    numerofilo: il numero filo attraversa l'elemento senza cambiare (predefinito per i morsetti).
    Rimandi (link = partenza, link_in = arrivo): con=<pagina> abbina il rimando a quello con lo
    stesso nome e verso opposto su quella pagina (con=<pagina>@x,y se ce n'è più d'uno); con=- lo
    lascia senza corrispondente (la partenza finisce lì, «//»); senza con= si abbina per nome.
    stella (solo partenza): collegata a tutti gli arrivi con lo stesso nome.
    coppia=<pagina>@x,y: il simbolo è solo la rappresentazione del contatto con la stessa sigla in
    quel punto (riferimento a coppie, es. ausiliario del salvamotore accanto ai poli): non si collega.
filo x,y x,y [x,y…] [sezione=1,5] [colore=BU] [n=2.01] [bus=Profinet] [cavo=5W1]
    [tipocavo="…"] [lunghezza=10] [articolocavo=…] [poli=3] [testo="3/N/PE ~400 V"]
    [busfili=<nome>|_] [articolobus=<articolo cavo>] [cond1=L1] [cond2=L1]   (bus di conduttori, modalità BUS: nome del bus, «_» senza
    nome; cond1/cond2 = conduttore del bus a cui si collega il primo/l'ultimo estremo del filo)
    [linea=dash|dashdot|dot] [spessore=0,5]   (tipo di linea e spessore in mm sullo schema)
    [tipo=H07V-K] [hnumero=2,5] [colorenumero=#c00000] [posnumeri=JSON] [mostra=JSON] [proprieta=JSON]
    [conduttore=W1:BN] [fissato=W1:3]   (conduttore del cavo -W1 sul filo: scelto a mano, oppure fissato
    dalla numerazione automatica perché non cambi; più cavi separati da «;»)
    [nodo1=sinistra|destra|su|giu] [nodo2=…]   (nodo a T con verso sul primo/ultimo estremo del filo: il
    braccio della linea passante a cui si collega il gambo della T nella sequenza di cablaggio)
    Segmenti orizzontali o verticali; un filo collega i punti di connessione su cui inizia o
    finisce, e un altro filo se termina su un suo vertice o in mezzo a un suo segmento (a T).
ordine <estremo> <estremo> [<estremo>…]   (ordine dei collegamenti di un conduttore scelto a mano, in
    catena: es. ordine -Q50:L1.1 -1K1:1 -1K2:1; estremi come in collega, anche su altre pagine)
collega <estremo> <estremo> [via x,y …] [stessi attributi di filo]
    Estremo: -2K1:A1 (sigla:punto di connessione), -X1:3/2 (sigla/numero del pin del simbolo,
    es. /1 sopra e /2 sotto per i morsetti), L1 o +24V (potenziale/rimando), oppure x,y.
    Se il punto non è indicato si usa quello più vicino all'altro estremo. Il percorso è a L.
testo @x,y [h=3] [l=60] [rot=90] [allinea=sinistra|centro|destra] "<testo>"   (l: larghezza del riquadro in mm, a capo da solo)
riquadro +<luogo> @x,y <larghezza>x<altezza> [scritta=dx,dy] [solosigla[=no]] [aspetto="linea=#c00;spessore=0,3;h=2,8;testo=#000"]   (riquadro di luogo; scritta rispetto all'angolo in alto a sinistra)
lineacavo -<sigla> x,y x,y [principale] [testi="sigla=si;tipo=no;sezione=no;descrizione=no;conduttori=si"]
    [posizione=prima|dopo|sopra-inizio|sopra-fine|sotto-inizio|sotto-fine] [spostamento=x,y]
    [schermo=fine|inizio|nessuno] [altezzaschermo=4,4] [nomi=orizzontali|verticali] [aspetto="linea=#c00;spessore=0,3;h=2,6;testo=#000"]
    Linea di definizione del cavo attraverso i fili. principale: porta tipo e sezione (le altre linee dello
    stesso cavo di serie solo la sigla); schermo: dove esce il collegamento dello schermo (cavi schermati).
sezionefili x,y x,y sezione=2,5 [scritta=x,y]   (riga che attraversa i fili: la sezione va a tutti; la scritta è
    legata con un righino alla fine della riga, il secondo punto)
```

---

## 7. Esempio (pagina 2 del progetto di esempio, come la esporta il programma)

I commenti dopo `#` descrivono i punti di connessione dei simboli (nome, coordinate, direzione del filo)
e, per ogni filo, cosa collega e il numero filo: usali per capire lo schema, non serve riscriverli.

```text
luogo +Q1 "Quadro master"



pagina 2 "Circuito di comando" tipo=schema luogo=Q1
  simbolo link_in +24V @40,24 rot=90   # Rimando (arrivo) · (40,24→)
  simbolo link +24V @400,24 rot=270   # Rimando (partenza) · (400,24←)
  simbolo link_in 0V @40,232 rot=90   # Rimando (arrivo) · (40,232→)
  simbolo link 0V @400,232 rot=270   # Rimando (partenza) · (400,232←)
  simbolo estop -2S1 @60,40 descr="Arresto di emergenza"   # Pulsante di emergenza (fungo) · 11 (60,40↑) 12 (60,56↓)
  simbolo pb_no -2S2 @60,72 descr="Marcia pompa"   # Pulsante NA · 13 (60,72↑) 14 (60,88↓)
  simbolo no -2K1 @92,72   # Contatto NA · 13 (92,72↑) 14 (92,88↓)
  simbolo coil -2K1 @60,140 descr="Contattore pompa" dati="Bobina 24 V DC" costruttore=DEMO tipo=CT-09-24DC ordine=CT0924DC   # Bobina relè/contattore · A1 (60,140↑) A2 (60,156↓)
  simbolo no -2K1 @140,72   # Contatto NA · 23 (140,72↑) 24 (140,88↓)
  simbolo lamp -2P1 @140,120 descr="Pompa in marcia"   # Lampada di segnalazione · X1 (140,120↑) X2 (140,136↓)
  simbolo nc -2K1 @180,72   # Contatto NC · 31 (180,72↑) 32 (180,88↓)
  simbolo lamp -2P2 @180,120 descr="Pompa ferma"   # Lampada di segnalazione · X1 (180,120↑) X2 (180,136↓)
  filo 40,24 400,24   # +24V → +24V · n. +24V
  filo 40,232 400,232   # 0V → 0V · n. 0V
  filo 60,24 60,40   # giunzione → -2S1:11 · n. +24V
  filo 60,56 60,72   # -2S1:12 → -2S2:13 · n. 2.01
  filo 60,64 92,64 92,72   # giunzione → -2K1:13 · n. 2.01
  filo 92,88 92,96 60,96   # -2K1:14 → giunzione · n. 2.02
  filo 60,88 60,140   # -2S2:14 → -2K1:A1 · n. 2.02
  filo 60,156 60,232   # -2K1:A2 → giunzione · n. 0V
  filo 140,24 140,72   # giunzione → -2K1:23 · n. +24V
  filo 140,88 140,120   # -2K1:24 → -2P1:X1 · n. 2.03
  filo 140,136 140,232   # -2P1:X2 → giunzione · n. 0V
  filo 180,24 180,72   # giunzione → -2K1:31 · n. +24V
  filo 180,88 180,120   # -2K1:32 → -2P2:X1 · n. 2.04
  filo 180,136 180,232   # -2P2:X2 → giunzione · n. 0V
```

---

## 8. Verifica: cosa controlla il programma e come correggere

| Messaggio | Correzione |
|---|---|
| Potenziali L1 e N collegati tra loro / sullo stesso conduttore ci sono +24V e 0V | Cortocircuito: un filo unisce due barre; togli o sposta il filo |
| -2K1 cortocircuitato: i due punti sono sullo stesso conduttore | Un filo cavallotta il componente: controlla i collegamenti dei suoi due punti |
| -2P1:X1 sembra collegato ma il filo vi passa sopra | Spezza il filo sul punto o usa `collega` |
| -2K2: Contatto NA senza collegamenti | Componente orfano: collegalo o eliminalo |
| -2K2: contatto senza bobina | Manca la bobina con la stessa sigla, o la sigla del contatto è sbagliata |
| -2P3:X2 non collegato | Punto libero: collegalo (di solito alla barra 0V) |
| Filo con un estremo libero / Filo isolato | Filo che non arriva a nulla: completalo o eliminalo |
| Fili sovrapposti | Due fili sullo stesso tratto: tienine uno |
| Numero filo usato da 2 conduttori diversi | Togli o cambia il `n=` ripetuto |
| Due simboli uguali sovrapposti | Elimina il doppione |
| Rimando "X" senza corrispondente | Manca il rimando con lo stesso nome nell'altra pagina (partenza `link` ↔ arrivo `link_in`) |
| -3A1: la scheda non esiste / canale non presente | Aggiungi la riga `scheda` o correggi `canale=` |
| usati 3 contatti NA, l'articolo ne ha 2 | Troppi contatti per l'articolo assegnato |
| -2K1: 2 simboli principali con la stessa sigla | Due bobine o dispositivi con la stessa sigla: uno solo è il principale, gli altri sono contatti o hanno un'altra sigla |
| -X1:3 disegnato su 2 pagine su circuiti diversi | È lo stesso morsetto: le due copie unirebbero due circuiti; cambia il numero di una delle due |
| Rimando "X" usato su 2 conduttori diversi | Lo stesso nome di rimando deve indicare lo stesso conduttore: rinomina uno dei due |
| -1W1: il cavo non ha il conduttore BU / conduttori del cavo esauriti | `conduttore=` con un nome che il cavo non ha, o più fili che conduttori: correggi o scegli un cavo più grande |
| -1W1: conduttori diversi da quelli dell'articolo | L'articolo del cavo è cambiato: la correzione proposta prende i conduttori dell'articolo |

Le barre di potenziale che arrivano al bordo destro del foglio sono ammesse.

---

## 9. Convertire schemi esistenti da PDF (SEE Electrical, EPLAN, AutoCAD…)

Gli schemi disegnati con altri programmi ed esportati in PDF si convertono **pagina per pagina** leggendo
il PDF (testo e disegno) e riscrivendolo nel formato testo:

1. **Intestazione**: dal cartiglio prendi numero e titolo della pagina, dati del progetto e luogo
   (`progetto …`, `luogo …`, `pagina <n> "<titolo>" luogo=…`). Mantieni la numerazione delle pagine
   dell'originale.
2. **Inventario**: elenca i dispositivi della pagina con sigla, descrizione e dati tecnici scritti accanto,
   i morsetti, i potenziali e i rimandi (SEE Electrical scrive i rimandi come /pagina.colonna).
3. **Simboli**: per ciascuno scegli l'id del catalogo più adatto (pulsante NA → `pb_no`, fungo →
   `estop`, bobina → `coil`, contatto NA/NC → `no`/`nc`, salvamotore → `mpcb3`, lampada → `lamp`,
   morsetto → `terminal`…); per quelli che mancano usa `simbolodef`.
4. **Geometria**: se il PDF è A3 (420 × 297 mm) le coordinate in mm del PDF valgono direttamente
   (1 punto PDF = 0,3528 mm), arrotondate alla griglia di 4 mm; altrimenti riproporziona. Non serve la
   copia esatta: conta la **topologia** (chi è collegato a chi), con una disposizione ordinata e leggibile.
5. **Sigle e numeri filo**: **mantieni quelli dell'originale** (`-2K1`, `n=200.01` sui fili). Se le sigle
   dell'originale seguono un'altra regola, conservale e segnalalo.
6. **Collegamenti**: riproduci ogni conduttore; usa `collega` tra punti di connessione e le giunzioni a
   T sulle barre. Controlla che ogni morsetto abbia i fili sopra e sotto come nell'originale.
7. **Controlla** la pagina (`npm run -s cli -- controlla`) e confronta con il PDF: numero di dispositivi,
   contatti per bobina, numeri filo, rimandi.
8. **Riepilogo** per l'utente: pagine convertite, simboli mancanti e quelli definiti con `simbolodef`, dubbi e differenze.

Strumenti utili per leggere un PDF vettoriale: `pdftotext -layout` (testo), PyMuPDF
`page.get_text("dict")` per i testi con le coordinate e `page.get_drawings()` per le linee (fili).

---

## 10. Catalogo dei simboli e dei tipi di scheda PLC

```text
Catalogo dei simboli (id · nome · lettera di sigla · ruolo · punti di connessione: nome (x,y relativi al punto @, direzione del filo))
  coil · Bobina relè/contattore · K · principale (bobina) · A1 (0,0↑) A2 (0,16↓)
  no · Contatto NA · K · contatto NO · 13 (0,0↑) 14 (0,16↓)
  nc · Contatto NC · K · contatto NC · 11 (0,0↑) 12 (0,16↓)
  co · Contatto in scambio · K · contatto CO · 11 (0,16↓) 12 (-6,0↑) 14 (6,0↑)
  contactor3 · Contatti di potenza 3P · K · contatto power · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  timer_on · Bobina temporizzata (ritardo eccitazione) · K · principale (bobina) · A1 (0,0↑) A2 (0,16↓)
  timer_off · Bobina temporizzata (ritardo diseccitazione) · K · principale (bobina) · A1 (0,0↑) A2 (0,16↓)
  coil_ac · Bobina relè in corrente alternata · K · principale (bobina) · A1 (0,0↑) A2 (0,16↓)
  no_ton · Contatto NA ritardato all'eccitazione · K · contatto NO · 17 (0,0↑) 18 (0,16↓)
  nc_ton · Contatto NC ritardato all'eccitazione · K · contatto NC · 15 (0,0↑) 16 (0,16↓)
  no_toff · Contatto NA ritardato alla diseccitazione · K · contatto NO · 17 (0,0↑) 18 (0,16↓)
  nc_toff · Contatto NC ritardato alla diseccitazione · K · contatto NC · 15 (0,0↑) 16 (0,16↓)
  ol_nc · Contatto NC del relè termico · F · contatto · 95 (0,0↑) 96 (0,16↓)
  ol_no · Contatto NA del relè termico · F · contatto · 97 (0,0↑) 98 (0,16↓)
  pb_no · Pulsante NA · S · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  pb_nc · Pulsante NC · S · dispositivo NC · 11 (0,0↑) 12 (0,16↓)
  estop · Pulsante di emergenza (fungo) · S · dispositivo NC · 11 (0,0↑) 12 (0,16↓)
  selector · Selettore NA · S · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  limit_no · Finecorsa NA · B · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  sensor3 · Sensore di prossimità PNP 3 fili · B · dispositivo · BN (0,0↑) BK (0,20↓) BU (8,20↓)
  selector_nc · Selettore NC · S · dispositivo NC · 11 (0,0↑) 12 (0,16↓)
  key_switch · Selettore a chiave NA · S · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  limit_nc · Finecorsa NC (apertura positiva) · B · dispositivo NC · 11 (0,0↑) 12 (0,16↓)
  limit_nonc · Finecorsa NA + NC · B · dispositivo · 13 (0,0↑) 14 (0,16↓) 21 (8,0↑) 22 (8,16↓)
  pressure_no · Pressostato NA · B · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  thermostat_no · Termostato NA · B · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  level_no · Interruttore di livello (galleggiante) NA · B · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  sensor3_npn · Sensore di prossimità NPN 3 fili · B · dispositivo · BN (0,0↑) BK (0,20↓) BU (8,20↓)
  sensor2 · Sensore di prossimità 2 fili · B · dispositivo · BN (0,0↑) BU (0,20↓)
  photocell · Fotocellula 3 fili · B · dispositivo · BN (0,0↑) BK (0,20↓) BU (8,20↓)
  reed · Sensore magnetico (reed) NA · B · dispositivo NO · 13 (0,0↑) 14 (0,16↓)
  fuse · Fusibile · F · dispositivo · 1 (0,0↑) 2 (0,16↓)
  mcb1 · Interruttore magnetotermico 1P · F · dispositivo · 1 (0,0↑) 2 (0,16↓)
  mcb2 · Interruttore magnetotermico 2P · F · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓)
  mcb3 · Interruttore magnetotermico 3P · Q · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  mpcb3 · Salvamotore 3P · Q · principale (bobina) · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  overload3 · Relè termico 3P · F · principale (bobina) · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  mcb4 · Interruttore magnetotermico 4P (3P+N) · Q · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓) N (24,0↑) N (24,16↓)
  rcd2 · Interruttore differenziale 2P · F · dispositivo · 1 (0,0↑) 2 (0,16↓) N (8,0↑) N (8,16↓)
  rcd4 · Interruttore differenziale 4P · F · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓) N (24,0↑) N (24,16↓)
  rcbo2 · Magnetotermico differenziale 2P · F · dispositivo · 1 (0,0↑) 2 (0,16↓) N (8,0↑) N (8,16↓)
  disconnector3 · Sezionatore 3P · Q · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  switch_disc3 · Interruttore di manovra-sezionatore 3P · Q · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  fuse_disc3 · Sezionatore con fusibili 3P · F · dispositivo · 1 (0,0↑) 2 (0,16↓) 3 (8,0↑) 4 (8,16↓) 5 (16,0↑) 6 (16,16↓)
  fuse_disc1 · Sezionatore con fusibile 1P · F · dispositivo · 1 (0,0↑) 2 (0,16↓)
  surge · Scaricatore di sovratensione · F · dispositivo · L (0,0↑) PE (0,16↓)
  motor3 · Motore trifase · M · dispositivo · U1 (-8,0↑) V1 (0,0↑) W1 (8,0↑) PE (16,0↑)
  motor1 · Motore monofase · M · dispositivo · L (0,0↑) N (8,0↑)
  lamp · Lampada di segnalazione · P · dispositivo · X1 (0,0↑) X2 (0,16↓)
  valve · Elettrovalvola · M · dispositivo · 1 (0,0↑) 2 (0,16↓)
  psu · Alimentatore 230 V AC / 24 V DC · T · dispositivo · L (0,0↑) N (8,0↑) PE (16,0↑) + (0,24↓) - (8,24↓)
  transformer · Trasformatore · T · dispositivo · 1 (0,0↑) 2 (8,0↑) 3 (0,24↓) 4 (8,24↓)
  buzzer · Cicalino · P · dispositivo · X1 (0,0↑) X2 (0,16↓)
  horn · Sirena (avvisatore acustico) · P · dispositivo · X1 (0,0↑) X2 (0,16↓)
  heater · Resistenza di riscaldamento · E · dispositivo · 1 (0,0↑) 2 (0,16↓)
  motor_dc · Motore in corrente continua · M · dispositivo · + (0,0↑) − (8,0↑)
  inverter3 · Inverter (convertitore di frequenza) · U · dispositivo · L1 (0,0↑) L2 (8,0↑) L3 (16,0↑) PE (24,0↑) U (0,32↓) V (8,32↓) W (16,32↓)
  resistor · Resistenza · R · dispositivo · 1 (0,0↑) 2 (0,16↓)
  capacitor · Condensatore · C · dispositivo · 1 (0,0↑) 2 (0,16↓)
  diode · Diodo · R · dispositivo · A (0,0↑) K (0,16↓)
  battery · Batteria · G · dispositivo · + (0,0↑) − (0,16↓)
  plc_di · Ingresso digitale PLC · A · punto I/O PLC · /1 (0,0↑)
  plc_do · Uscita digitale PLC · A · punto I/O PLC · /1 (0,16↓)
  plc_ai · Ingresso analogico PLC · A · punto I/O PLC · /1 (0,0↑)
  plc_ao · Uscita analogica PLC · A · punto I/O PLC · /1 (0,16↓)
  plc_di_var · Ingresso PLC con variabile (1 morsetto) · A · punto I/O PLC · /1 (0,0↑)
  plc_di2_var · Ingresso PLC con variabile (2 morsetti) · A · punto I/O PLC · /1 (0,0↑) VS (8,0↑)
  plc_do_var · Uscita PLC con variabile (1 morsetto) · A · punto I/O PLC · /1 (0,16↓)
  plc_do2_var · Uscita PLC con variabile (2 morsetti P/M) · A · punto I/O PLC · P (0,16↓) M (8,16↓)
  plc_power · Alimentazione scheda PLC (L+ / M) · A · punto I/O PLC · L+ (0,0↑) M (0,16↓)
  ol_breaker · Interruttore (unifilare) · Q · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_mpcb · Salvamotore (unifilare) · Q · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_disconnector · Sezionatore (unifilare) · Q · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_fuse · Fusibile (unifilare) · F · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_contactor · Contattore (unifilare) · K · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_motor · Motore (unifilare) · M · unifilare · /1 (0,0↑)
  ol_transformer · Trasformatore (unifilare) · T · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_vfd · Inverter (unifilare) · U · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_psu · Alimentatore (unifilare) · T · unifilare · /1 (0,0↑) /2 (0,16↓)
  ol_load · Utenza generica (unifilare) · E · unifilare · /1 (0,0↑)
  net_node2 · Nodo di rete 2 porte (IN/OUT) · A · nodo di rete · IN (-16,0←) OUT (16,0→)
  net_node2b · Nodo di rete 2 porte in basso (P1/P2) · A · nodo di rete · P1 (-4,8↓) P2 (4,8↓)
  net_node1 · Nodo di rete 1 porta · A · nodo di rete · P1 (0,8↓)
  net_switch · Switch di rete 5 porte · A · nodo di rete · P1 (-16,8↓) P2 (-8,8↓) P3 (0,8↓) P4 (8,8↓) P5 (16,8↓)
  net_term · Terminazione di bus · R · dispositivo · /1 (0,0↑)
  conn_male · Pin di spina (maschio) · X · pin di connettore · /1 (0,0↑) /2 (0,8↓)
  conn_female · Pin di presa (femmina) · X · pin di connettore · /1 (0,0↑) /2 (0,8↓)
  conn_pair · Pin presa + spina · X · pin di connettore · /1 (0,0↑) /2 (0,12↓)
  terminal · Morsetto · X · morsetto · /1 (0,0↑) /2 (0,8↓)
  terminal_pe · Morsetto PE · X · morsetto · /1 (0,0↑) /2 (0,8↓)
  terminal_disc · Morsetto sezionabile · X · morsetto · /1 (0,0↑) /2 (0,16↓)
  terminal_fuse · Morsetto portafusibile · X · morsetto · /1 (0,0↑) /2 (0,16↓)
  potential · Punto di potenziale · — · potenziale · /1 (0,0→)
  pe · Terra di protezione PE · — · potenziale · /1 (0,0↑)
  fe · Terra funzionale FE · — · potenziale · /1 (0,0↑)
  link · Rimando (partenza) · — · rimando · /1 (0,0↑)
  link_in · Rimando (arrivo) · — · rimando · /1 (0,0↑)

Tipi di scheda PLC (scheda -<sigla> tipo=…; canali DI0…, DO0…, AI0…, AO0… per i simboli plc_di/plc_do/plc_ai/plc_ao)
  cpu-14di-10do-2ai · CPU compatta 14 DI / 10 DO / 2 AI
  cpu-8di-6do · CPU compatta 8 DI / 6 DO
  di8 · Ingressi digitali 8 DI
  di16 · Ingressi digitali 16 DI
  do8 · Uscite digitali 8 DO
  do16 · Uscite digitali 16 DO
  fdi8 · Ingressi safety 8 DI
  fdo8 · Uscite safety 8 DO
  di8-do8 · Ingressi/uscite digitali 8 DI / 8 DO
  di16-do16 · Ingressi/uscite digitali 16 DI / 16 DO
  ai4 · Ingressi analogici 4 AI
  ai8 · Ingressi analogici 8 AI
  ao2 · Uscite analogiche 2 AO
  ao4 · Uscite analogiche 4 AO
  iol4 · Master IO-Link 4 porte
  iol8 · Master IO-Link 8 porte
  bus · Scheda bus (senza I/O)
```

---

## 11. Limiti

- Il formato testo descrive le pagine di schema, unifilari e di rete; panoramiche PLC, schemi delle
  morsettiere, liste, layout del quadro e copertina li genera il programma.
- Articoli dei costruttori (EDZ), revisioni, traduzioni, stile delle liste e dei cavi, gruppi I/O PLC e
  immagini si gestiscono dall'interfaccia di OpenWiring (le immagini restano sulla pagina riscritta).
- Nel testo ci sono indirizzo IP (`ip=`), nome di rete o Profinet (`indirizzo=`) e interfacce di rete
  (`interfacce=`) dei singoli dispositivi; le reti IP, l'assegnazione automatica degli indirizzi e la tabella
  *Indirizzi di rete* (scheda Progetto ▸ Reti), il formato degli indirizzi PLC di ogni stazione (Siemens,
  IEC 61131, Beckhoff TwinCAT `AT %I*`…) e lo schema dei numeri filo (`{pagina}`, `{quadro}`, `{n:2}`,
  lettere `{n:A}`, riserva per pagina) si impostano dall'interfaccia: non riscriverli a mano nei testi.
- I simboli definiti con `simbolodef` sono scatole semplici: l'utente può poi ridisegnarli con
  l'editor dei simboli.
