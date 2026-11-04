# 19. Riga di comando e agenti

Questo capitolo è per chi automatizza: script, controlli prima della consegna, agenti di intelligenza
artificiale con accesso al terminale (Claude Code, Codex, Gemini CLI).

## La guida per agenti

*Aiuto ▸ Guida per agenti IA (.md)…* salva un file Markdown che spiega a un agente come leggere, scrivere,
controllare e modificare gli schemi di OpenWiring: flusso di lavoro, regole, convenzioni delle sigle, schemi
tipici, sintassi completa del formato testo, esempio, significato dei controlli, procedura per ridisegnare
schemi da PDF (SEE Electrical, EPLAN, AutoCAD) e catalogo dei simboli con i punti di connessione. Una copia
è anche nel repository: `docs/AGENTE_IA.md`.

## I comandi

Nella cartella dei sorgenti di OpenWiring, dopo `npm ci`:

```bash
npm run -s cli -- esporta progetto.ecad --pagine 2,3 --catalogo > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt     # errori con il numero di riga e verifica
npm run -s cli -- applica progetto.ecad pagine.txt       # crea il progetto se non esiste
npm run -s cli -- verifica progetto.ecad [--json]
npm run -s cli -- importa-pdf schema.pdf [uscita.ecad]
npm run -s cli -- guida > AGENTE_IA.md
```

| Comando | Cosa fa |
|---|---|
| `esporta` | scrive le pagine nel formato testo; `--pagine` sceglie le pagine, `--catalogo` aggiunge il catalogo dei simboli |
| `controlla` | controlla un testo senza modificare il progetto: errori con il numero di riga e problemi della verifica sulle pagine toccate |
| `applica` | applica il testo al progetto (sostituisce o aggiunge pagine); crea il file se non esiste |
| `verifica` | i controlli di progetto, anche in JSON per gli script |
| `importa-pdf` | ricostruisce un progetto da uno schema in PDF vettoriale |
| `guida` | la guida per agenti |

Le pagine generate dal programma (panoramiche PLC, schemi delle morsettiere, liste, layout, copertina) si
esportano solo come intestazione.

## Il formato testo

Una riga per elemento, con coordinate in mm sul foglio A3 e griglia di 4 mm:

| Riga | Esempio |
|---|---|
| `progetto` | `progetto nome="Linea 3" cliente="Rossi Spa"` |
| `luogo` | `luogo +Q1 "Quadro master" tipo="Quadro elettrico"` |
| `cavo` | `cavo -1W1 tipo=FG16OR16 sezione=1,5 conduttori="BN BK GY GNYE" lunghezza=15` |
| `scheda` | `scheda -3A1 tipo=cpu-14di-10do-2ai stazione=PLC1` |
| `simbolodef` | un simbolo a scatola con i suoi punti di connessione, per componenti non in catalogo |
| `pagina` | `pagina 7 "Ventilazione" tipo=schema luogo=Q1` |
| `simbolo` | `simbolo coil -7K1 @100,140 descr="Contattore" dati="24 V DC"` |
| `filo` | `filo 100,24 100,60 sezione=1,5 colore=BU` |
| `collega` | `collega -7S1:14 -7K1:A1` (il programma calcola il percorso) |
| `testo` | `testo @40,250 h=3 "Nota"` |
| `riquadro`, `lineacavo` | riquadri dello schema di rete e linee dei cavi |

Il testo esportato descrive nei commenti ogni punto di connessione con le coordinate e, per ogni filo,
cosa collega e il numero filo. Esportare e reimportare senza modifiche dà lo stesso progetto.
