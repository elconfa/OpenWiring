// Guida per agenti di intelligenza artificiale (Markdown): come leggere, scrivere, controllare
// e modificare gli schemi di OpenWiring con il formato testo. Generata dal codice, così sintassi
// e catalogo dei simboli sono sempre quelli del programma.
import type { Project, ProjectSettings, SymbolDef } from './types';
import { FRAME, COLUMNS, PAGE_W, PAGE_H, sheetOf } from './types';
import { TEXT_HELP, symbolCatalog, pagesToText } from './textFormat';
import { exampleProject } from './example';
import { PROTOCOLS } from './network';
import { railOf, plcRowY } from './fixedPos';

/** library: la libreria dell'utente (cartella dei simboli), che entra nel catalogo */
export function agentGuide(project?: Project, library: SymbolDef[] = []): string {
  const example = exampleProject();
  const exampleText = ['luogo +Q1 "Quadro master"', '', ...pagesToText(example, { pageIds: [example.pages[1].id] }).split('\n').filter(l => !l.startsWith('#'))].join('\n').trim();
  const syntax = TEXT_HELP.split('\n').map(l => l.replace(/^# ?/, '')).join('\n').trim();
  const catalog = symbolCatalog(project ?? example, library).split('\n').map(l => l.replace(/^# ?/, '')).join('\n').trim();
  const s: Partial<ProjectSettings> = project?.settings ?? {};
  const top = railOf(s, 'top'), bottom = railOf(s, 'bottom');
  const railList = (r: typeof top, up?: boolean) => [0, 1, 2].map(k => r.y + (up ? -1 : 1) * k * r.step).join(', ');
  const COL_W = (FRAME.right - FRAME.left) / COLUMNS;
  const sheet = sheetOf(s);
  const columns = Array.from({ length: COLUMNS }, (_, i) => `${i + 1}: x ${Math.round(FRAME.left + i * COL_W)}–${Math.round(FRAME.left + (i + 1) * COL_W)}`).join(' · ');
  return `# OpenWiring — guida per agenti di intelligenza artificiale

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
Nella cartella dei sorgenti (dopo \`npm ci\`):

\`\`\`bash
npm run -s cli -- guida                                   # questa guida
npm run -s cli -- catalogo [--tutti]                      # simboli (anche la cartella dell'utente), tipi di scheda PLC
npm run -s cli -- esporta progetto.ecad [--pagine 2,3] [--catalogo] > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt      # errori del testo + verifica delle pagine toccate
npm run -s cli -- applica progetto.ecad pagine.txt [-o nuovo.ecad]   # se progetto.ecad non esiste lo crea
npm run -s cli -- verifica progetto.ecad                  # verifica di tutto il progetto
\`\`\`

Aggiungi \`--json\` per un'uscita leggibile da programma. \`controlla\` e \`verifica\` escono con codice 1 se
ci sono errori. **Ciclo di lavoro**: scrivi il testo → \`controlla\` → correggi finché non ci sono errori
né avvisi che non sai spiegare → \`applica\` → \`verifica\`. Non consegnare mai un testo che non hai
controllato, se hai il terminale.

---

## 2. Regole da rispettare sempre

1. **Usa solo i simboli del catalogo** (sezione 10) o quelli che definisci con \`simbolodef\`. Non inventare
   identificativi.
2. **Coordinate sulla griglia di 4 mm** (multipli di 4), dentro l'area di disegno: x ${FRAME.left}…${FRAME.right},
   y ${FRAME.top}…${FRAME.bottom}. Sotto y ${FRAME.bottom} c'è il cartiglio.
3. **Fili solo orizzontali o verticali.** Un filo collega i punti di connessione dove **inizia o finisce**
   (o un altro filo su un vertice o in mezzo a un segmento, giunzione a T). Un filo che **passa sopra** un
   punto di connessione **non** lo collega: interrompi il filo sul punto.
4. Per i collegamenti nuovi preferisci \`collega <sigla:punto> <sigla:punto>\`: il programma calcola il
   percorso (a L, prima nella direzione d'uscita del punto). Usa \`via x,y\` per evitare di passare sopra
   altri simboli.
5. **Una pagina scritta sostituisce per intero** quella con lo stesso numero: riscrivi tutti i suoi
   elementi, anche quelli che non cambi, **con tutti gli attributi esportati dal programma** così come sono
   (\`articoli=\`, \`mostra=\`, \`postesti=\`, \`posnumeri=\`, \`conduttore=\`, \`fissato=\`, le opzioni di \`lineacavo\`…):
   un attributo tolto è un dato perso (testi spostati, conduttori scelti, articoli aggiuntivi).
6. **Non cambiare sigle e numeri filo esistenti** se non ti viene chiesto. I numeri filo si bloccano con
   \`n=\` sul filo (es. \`n=200.01\`).
7. Le pagine generate dal programma (panoramiche PLC, schemi delle morsettiere, liste, layout,
   copertina) **non si scrivono**: si esportano solo come intestazione.
8. **Rotazioni**: usa per ogni simbolo solo le rotazioni ammesse indicate nel catalogo (\`rot 0/90\`;
   senza indicazione tutte) e non specchiare i simboli «non specchiabile»: il controllo lo segnala come errore.
9. **Testi dei simboli** (sigla, descrizione, designazioni dei punti, numero e sigla della morsettiera): posizione e
   orientamento li decide l'editor dei simboli per ogni rotazione; gli spostamenti fatti a mano sullo schema
   tornano nel testo come \`postesti=\` (JSON) e vanno lasciati come sono. Non scrivere \`postesti=\` nuovi: se un
   testo cade male, segnalalo all'utente invece di spostare il simbolo per aggirarlo.
10. Quando qualcosa non è chiaro (un componente illeggibile, un collegamento ambiguo), **non indovinare**:
   fai la scelta più prudente, segnala il dubbio in un commento \`# DUBBIO: …\` nel testo e riassumilo
   nella risposta.

---

## 3. Convenzioni del progettista

- **Sigle dei dispositivi**: pagina + lettera + numero, con il trattino: \`-2K1\` = primo contattore/relè
  della pagina 2; \`-200K3\` a pagina 200. Per una sigla nuova scrivi \`-?\` e il programma la assegna.
- **Lettere** (IEC 81346-2): K relè e contattori · S pulsanti, selettori · B sensori, finecorsa,
  pressostati, termostati, fotocellule · F protezioni (fusibili, sezionatori con fusibili, magnetotermici 1-2P,
  differenziali, relè termici, scaricatori) · Q interruttori di potenza, salvamotori, sezionatori,
  interruttori di manovra-sezionatori · M motori, elettrovalvole · P lampade, cicalini, sirene ·
  T trasformatori, alimentatori · U inverter, convertitori · A PLC, schede, apparecchi complessi ·
  X morsetti, connettori · W cavi · R resistenze, diodi, terminazioni · C condensatori · G batterie ·
  E riscaldatori, illuminazione.
- **Contatti**: hanno la stessa sigla della bobina (\`-2K1\`) e i numeri dei morsetti si assegnano in
  automatico in ordine di disegno: la prima cifra è il numero d'ordine del contatto, la seconda 3-4 per i
  NA e 1-2 per gli NC (13-14, 21-22, 33-34…); i contatti temporizzati 7-8 NA e 5-6 NC (17-18, 25-26…); i contatti
  del relè termico 95-96 (NC) e 97-98 (NA). Per numeri diversi: \`pin="1=43;2=44"\`.
- **Numeri filo**: pagina.progressivo, es. \`200.01\`; con la numerazione bloccata i numeri non cambiano.
  I conduttori collegati a un potenziale (L1, N, PE, +24V…) prendono il nome del potenziale.
- **Morsettiere**: \`X\` + numero, anche gerarchico (\`X1.1.2\`); morsetto con i due punti: \`-X1:3\`.
  Morsetti a più piani: \`-X1:1A\`, \`-X1:1B\`. Morsetti Weidmüller.
- **Luoghi** (contenitori): \`+QE\` quadro elettrico, \`+BM\` bordo macchina, \`+P1\` pulsantiera…;
  si definiscono con \`luogo\` e si assegnano a pagine (\`pagina … luogo=QE\`) o dispositivi (\`luogo=BM\`).

---

## 4. Il foglio

- ${sheet.size} ${sheet.portrait ? 'verticale' : 'orizzontale'}, ${PAGE_W} × ${PAGE_H} mm, origine in alto a sinistra, **y verso il basso**, griglia 4 mm.
- Area di disegno x ${FRAME.left}…${FRAME.right}, y ${FRAME.top}…${FRAME.bottom}, divisa in **${COLUMNS} colonne**:
  ${columns}.
- I rimandi e le liste indicano le posizioni come **pagina.colonna** (es. \`2.4\`).

---

## 5. Come si disegna (schemi tipici)

**Circuito di comando 24 V DC**
- Barra +24V in alto (posizione fissa del primo filo in alto), che arriva da una pagina precedente: \`simbolo link_in +24V @${top.x0},${top.y} rot=90\` e \`filo ${top.x0},${top.y} ${top.x1},${top.y}\`.
- Barra 0V in basso (primo filo in basso): \`simbolo link_in 0V @${bottom.x0},${bottom.y} rot=90\` e \`filo ${bottom.x0},${bottom.y} ${bottom.x1},${bottom.y}\`.
- Se le barre proseguono nella pagina successiva, chiudile a destra con una partenza: \`simbolo link +24V @${top.x1},${top.y} rot=270\`.
- I percorsi di corrente sono **verticali**, uno per colonna o ogni 20–40 mm in x: dall'alto protezioni e
  comandi (pulsanti, contatti), in basso la bobina o il carico, che va alla barra 0V.
- I simboli a due punti hanno il punto 1 in (0,0) e il punto 2 in (0,16): uno sotto l'altro con passo di
  32 mm in y (es. y 40, 72, 104…) e un filo che li unisce.
- Autoritenuta: contatto NA della bobina in parallelo al pulsante di marcia, con due giunzioni a T.

**Posizioni fisse del progetto** (uguali su tutte le pagine; *Impostazioni progetto ▸ Posizioni fisse*):
- Fili in alto: il primo a y ${top.y}, i successivi un passo di ${top.step} mm sotto (y ${railList(top)}…), da x ${top.x0} a x ${top.x1}.
- Fili in basso: il primo a y ${bottom.y}, i successivi un passo di ${bottom.step} mm ${bottom.up ? 'sopra' : 'sotto'} (y ${railList(bottom, bottom.up)}…), da x ${bottom.x0} a x ${bottom.x1}.
${s.plcRow ? `- Punti I/O PLC su una riga fissa: ingressi a y ${s.plcRow.y}, uscite a y ${plcRowY(s.plcRow, 'DO')}, primo posto a x ${s.plcRow.x0}, passo ${s.plcRow.step} mm.\n` : ''}- Quando l'utente non indica altro, metti le barre di alimentazione e i punti I/O in queste posizioni.

**Potenza trifase**
- Potenziali a sinistra: \`L1\` y 24, \`L2\` y 32, \`L3\` y 40, \`N\` y 48, \`PE\` y 56 (x 28) con le barre fino a x 400.
- Apparecchi a tre poli (salvamotore, contattore 3P, motore) con i punti a x, x+8, x+16; si scende in
  verticale dalle barre con giunzioni a T.

**Sequenza di cablaggio** (ordine dei collegamenti da–a nelle liste): di serie i punti di un conduttore si
collegano in catena per posizione (dall'alto in basso, da sinistra a destra) e quelli di un ripartitore o di
una barra di terra (\`ripartitore … tipo=terra\`) partono tutti dal foro. Per un'altra sequenza scrivi il verso
del nodo a T sull'estremo del filo che fa da gambo (\`nodo1=\`/\`nodo2=\` sinistra, destra, su, giu: il braccio
della linea passante a cui va il gambo) oppure una riga \`ordine -1K1:1 -1K2:1 -1K3:1\` nella pagina. Lascia come
sono le righe \`ordine\` e gli attributi \`nodo1=\`/\`nodo2=\` esportati dal programma.

**Tra pagine**: lo stesso conduttore continua con un **rimando** o con lo stesso **potenziale**. Ogni
rimando di partenza (\`link +24V\`) va a **un solo** rimando di arrivo (\`link_in +24V\`) con lo stesso nome, mai
partenza con partenza o arrivo con arrivo; per portare un conduttore su più pagine fai una catena (arrivo a
sinistra, partenza a destra). Il programma scrive da solo il rimando /pagina.colonna. Il filo collegato a un
rimando ha sempre come numero il nome del rimando.

**PLC**: definisci la scheda con \`scheda -3A1 tipo=…\`; ogni ingresso è \`simbolo plc_di -3A1 @x,y canale=DI0
variabile=Nome commento="…"\`, ogni uscita \`plc_do\` con \`canale=DO0\`; \`plc_power\` per L+ / M.

**Cavi**: \`cavo -1W1 tipo=FG16OR16 conduttori="BN BK GY GNYE"\` più \`lineacavo -1W1 x,y x,y\` che
attraversa i fili del cavo. I conduttori liberi si assegnano in ordine di pagina (il PE al giallo-verde) e poi
**restano fissati** sui fili (\`fissato=W1:BN\` sul filo), così aggiungere un filo prima non sposta gli altri;
un conduttore scelto a mano si scrive sul filo con \`conduttore=W1:BK\`. Con \`articolo=\` il cavo prende i
conduttori dell'articolo (\`marcatura=numeri|colori\`); \`pindi=-510NG1\` per i cavi già collegati a un
dispositivo (il morsetto n prende il conduttore n). Un cavo su più pagine ha **una linea principale**
(\`principale\`, con tipo e sezione); le altre mostrano di serie solo la sigla. Opzioni della linea: \`testi=\`,
\`posizione=\`, \`schermo=fine|inizio|nessuno\` (collegamento dello schermo, il filo verso il PE parte dal suo
punto in fondo), \`altezzaschermo=\`, \`nomi=verticali\` (colori composti lunghi).

**Morsettiere**: la riga \`morsettiera -X1 articolo="WDU 2.5" fermo="WEW 35/2" piastra="WAP 2.5-10"
ponticelli="pettine:1,2,3" riserve="11 12" separatori="3"\` porta articoli, fermi e piastre con le quantità
(\`fermi=2\`, \`piastre=1\`), ponticelli, riserve, separatori e altri accessori; i morsetti sullo schema restano
simboli \`-X1:1\`, \`-X1:2\`… Un morsetto (stessa sigla e numero) va disegnato una volta sola: su due pagine
è lo stesso morsetto.

**Schema di rete**: pagina \`tipo=rete\` con nodi \`net_node2\`, \`net_node2b\`, \`net_switch\`…, fili con
\`bus=<protocollo>\` (${PROTOCOLS.map(p => p.name).join(', ')}) e \`riquadro +Q1 @x,y LxH\` per i quadri.

**Bus di conduttori** (modalità BUS): \`filo x,y x,y busfili="400V AC"\` è una linea spessa che porta più
conduttori (\`busfili=_\` senza nome; stesso nome = stesso bus su più pagine). Ogni filo che tocca il bus con un
estremo indica il conduttore con \`cond1=L1\` (estremo iniziale) o \`cond2=L1\` (finale): i fili con lo stesso
conduttore sullo stesso bus sono collegati.

**Schema unifilare**: pagina \`tipo=unifilare\`, simboli \`ol_…\` con la stessa sigla del multifilare,
linee con \`poli=3\` e \`testo="3/N/PE ~400 V"\`.

**Componenti che non sono nel catalogo**: prima cerca nella libreria dell'utente (in fondo al catalogo,
raggruppata per categoria: è la **cartella dei simboli**, un file \`.ecsym\` per simbolo, sottocartelle =
gruppi; di solito \`~/Documents/OpenWiring/Simboli\`, oppure \`--simboli <cartella>\` o la variabile
\`OPENWIRING_SIMBOLI\`). I simboli nella sottocartella \`Eliminare\` sono stati eliminati dall'utente: non usarli (non
sono nel catalogo). Se non c'è, **segnalalo all'utente** nel riepilogo: nome del componente, lettera
di sigla, punti di connessione con le designazioni (es. «sezionatore 4 poli: 1-2, 3-4, 5-6, 7-8»), così
può disegnarlo nell'editor dei componenti e ritroverai il simbolo nella cartella. Se intanto serve lo
schema, usa una scatola con \`simbolodef\` e scrivi nel riepilogo che è provvisoria, per esempio un avviatore statico:
\`simbolodef soft3 "Avviatore statico" lettera=Q pin="L1:0,0 L2:8,0 L3:16,0 T1:0,32 T2:8,32 T3:16,32"\`.

---

## 6. Sintassi completa

\`\`\`text
${syntax}
\`\`\`

---

## 7. Esempio (pagina 2 del progetto di esempio, come la esporta il programma)

I commenti dopo \`#\` descrivono i punti di connessione dei simboli (nome, coordinate, direzione del filo)
e, per ogni filo, cosa collega e il numero filo: usali per capire lo schema, non serve riscriverli.

\`\`\`text
${exampleText}
\`\`\`

---

## 8. Verifica: cosa controlla il programma e come correggere

| Messaggio | Correzione |
|---|---|
| Potenziali L1 e N collegati tra loro / sullo stesso conduttore ci sono +24V e 0V | Cortocircuito: un filo unisce due barre; togli o sposta il filo |
| -2K1 cortocircuitato: i due punti sono sullo stesso conduttore | Un filo cavallotta il componente: controlla i collegamenti dei suoi due punti |
| -2P1:X1 sembra collegato ma il filo vi passa sopra | Spezza il filo sul punto o usa \`collega\` |
| -2K2: Contatto NA senza collegamenti | Componente orfano: collegalo o eliminalo |
| -2K2: contatto senza bobina | Manca la bobina con la stessa sigla, o la sigla del contatto è sbagliata |
| -2P3:X2 non collegato | Punto libero: collegalo (di solito alla barra 0V) |
| Filo con un estremo libero / Filo isolato | Filo che non arriva a nulla: completalo o eliminalo |
| Fili sovrapposti | Due fili sullo stesso tratto: tienine uno |
| Numero filo usato da 2 conduttori diversi | Togli o cambia il \`n=\` ripetuto |
| Due simboli uguali sovrapposti | Elimina il doppione |
| Rimando "X" senza corrispondente | Manca il rimando con lo stesso nome nell'altra pagina (partenza \`link\` ↔ arrivo \`link_in\`) |
| -3A1: la scheda non esiste / canale non presente | Aggiungi la riga \`scheda\` o correggi \`canale=\` |
| usati 3 contatti NA, l'articolo ne ha 2 | Troppi contatti per l'articolo assegnato |
| -2K1: 2 simboli principali con la stessa sigla | Due bobine o dispositivi con la stessa sigla: uno solo è il principale, gli altri sono contatti o hanno un'altra sigla |
| -X1:3 disegnato su 2 pagine su circuiti diversi | È lo stesso morsetto: le due copie unirebbero due circuiti; cambia il numero di una delle due |
| Rimando "X" usato su 2 conduttori diversi | Lo stesso nome di rimando deve indicare lo stesso conduttore: rinomina uno dei due |
| -1W1: il cavo non ha il conduttore BU / conduttori del cavo esauriti | \`conduttore=\` con un nome che il cavo non ha, o più fili che conduttori: correggi o scegli un cavo più grande |
| -1W1: conduttori diversi da quelli dell'articolo | L'articolo del cavo è cambiato: la correzione proposta prende i conduttori dell'articolo |

Le barre di potenziale che arrivano al bordo destro del foglio sono ammesse.

---

## 9. Convertire schemi esistenti da PDF (SEE Electrical, EPLAN, AutoCAD…)

Gli schemi disegnati con altri programmi ed esportati in PDF si convertono **pagina per pagina** leggendo
il PDF (testo e disegno) e riscrivendolo nel formato testo:

1. **Intestazione**: dal cartiglio prendi numero e titolo della pagina, dati del progetto e luogo
   (\`progetto …\`, \`luogo …\`, \`pagina <n> "<titolo>" luogo=…\`). Mantieni la numerazione delle pagine
   dell'originale.
2. **Inventario**: elenca i dispositivi della pagina con sigla, descrizione e dati tecnici scritti accanto,
   i morsetti, i potenziali e i rimandi (SEE Electrical scrive i rimandi come /pagina.colonna).
3. **Simboli**: per ciascuno scegli l'id del catalogo più adatto (pulsante NA → \`pb_no\`, fungo →
   \`estop\`, bobina → \`coil\`, contatto NA/NC → \`no\`/\`nc\`, salvamotore → \`mpcb3\`, lampada → \`lamp\`,
   morsetto → \`terminal\`…); per quelli che mancano usa \`simbolodef\`.
4. **Geometria**: se il PDF è A3 (420 × 297 mm) le coordinate in mm del PDF valgono direttamente
   (1 punto PDF = 0,3528 mm), arrotondate alla griglia di 4 mm; altrimenti riproporziona. Non serve la
   copia esatta: conta la **topologia** (chi è collegato a chi), con una disposizione ordinata e leggibile.
5. **Sigle e numeri filo**: **mantieni quelli dell'originale** (\`-2K1\`, \`n=200.01\` sui fili). Se le sigle
   dell'originale seguono un'altra regola, conservale e segnalalo.
6. **Collegamenti**: riproduci ogni conduttore; usa \`collega\` tra punti di connessione e le giunzioni a
   T sulle barre. Controlla che ogni morsetto abbia i fili sopra e sotto come nell'originale.
7. **Controlla** la pagina (\`npm run -s cli -- controlla\`) e confronta con il PDF: numero di dispositivi,
   contatti per bobina, numeri filo, rimandi.
8. **Riepilogo** per l'utente: pagine convertite, simboli mancanti e quelli definiti con \`simbolodef\`, dubbi e differenze.

Strumenti utili per leggere un PDF vettoriale: \`pdftotext -layout\` (testo), PyMuPDF
\`page.get_text("dict")\` per i testi con le coordinate e \`page.get_drawings()\` per le linee (fili).

---

## 10. Catalogo dei simboli e dei tipi di scheda PLC

\`\`\`text
${catalog}
\`\`\`

---

## 11. Limiti

- Il formato testo descrive le pagine di schema, unifilari e di rete; panoramiche PLC, schemi delle
  morsettiere, liste, layout del quadro e copertina li genera il programma.
- Articoli dei costruttori (EDZ), revisioni, traduzioni, stile delle liste e dei cavi, gruppi I/O PLC e
  immagini si gestiscono dall'interfaccia di OpenWiring (le immagini restano sulla pagina riscritta).
- Nel testo ci sono indirizzo IP (\`ip=\`), nome di rete o Profinet (\`indirizzo=\`) e interfacce di rete
  (\`interfacce=\`) dei singoli dispositivi; le reti IP, l'assegnazione automatica degli indirizzi e la tabella
  *Indirizzi di rete* (scheda Progetto ▸ Reti), il formato degli indirizzi PLC di ogni stazione (Siemens,
  IEC 61131, Beckhoff TwinCAT \`AT %I*\`…) e lo schema dei numeri filo (\`{pagina}\`, \`{quadro}\`, \`{n:2}\`,
  lettere \`{n:A}\`, riserva per pagina) si impostano dall'interfaccia: non riscriverli a mano nei testi.
- I simboli definiti con \`simbolodef\` sono scatole semplici: l'utente può poi ridisegnarli con
  l'editor dei simboli.
`;
}
