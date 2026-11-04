# 19. Kommandozeile und Agenten

Dieses Kapitel ist für alle, die automatisieren: Skripte, Prüfungen vor der Auslieferung, KI-Agenten mit
Zugriff auf das Terminal (Claude Code, Codex, Gemini CLI).

## Der Leitfaden für Agenten

*Hilfe ▸ Leitfaden für KI-Agenten (.md)…* speichert eine Markdown-Datei, die einem Agenten erklärt, wie er
Schaltpläne von OpenWiring liest, schreibt, prüft und ändert: Arbeitsablauf, Regeln, BMK-Konventionen,
typische Schaltungen, vollständige Syntax des Textformats, Beispiel, Bedeutung der Prüfungen, Vorgehen zum
Nachzeichnen von Schaltplänen aus PDF (SEE Electrical, EPLAN, AutoCAD) und Symbolkatalog mit den
Anschlusspunkten. Eine Kopie liegt auch im Repository: `docs/AGENTE_IA.md`.

## Die Befehle

Im Quellordner von OpenWiring, nach `npm ci`:

```bash
npm run -s cli -- esporta progetto.ecad --pagine 2,3 --catalogo > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt     # Fehler mit Zeilennummer, und Prüfung
npm run -s cli -- applica progetto.ecad pagine.txt       # legt das Projekt an, falls es fehlt
npm run -s cli -- verifica progetto.ecad [--json]
npm run -s cli -- importa-pdf schema.pdf [uscita.ecad]
npm run -s cli -- guida > AGENTE_IA.md
```

| Befehl | Was er tut |
|---|---|
| `esporta` | schreibt die Seiten im Textformat; `--pagine` wählt die Seiten, `--catalogo` fügt den Symbolkatalog hinzu |
| `controlla` | prüft einen Text, ohne das Projekt zu ändern: Fehler mit Zeilennummer und Prüfungsprobleme auf den betroffenen Seiten |
| `applica` | wendet den Text auf das Projekt an (ersetzt oder fügt Seiten hinzu); legt die Datei an, falls sie fehlt |
| `verifica` | die Projektprüfungen, auch als JSON für Skripte |
| `importa-pdf` | baut ein Projekt aus einem Schaltplan als Vektor-PDF neu auf |
| `guida` | der Leitfaden für Agenten |

Vom Programm erzeugte Seiten (SPS-Übersichten, Klemmleistenpläne, Listen, Aufbau, Deckblatt) werden nur als
Kopfzeile exportiert.

## Das Textformat

Eine Zeile je Element, mit Koordinaten in mm auf dem A3-Blatt und einem 4-mm-Raster:

| Zeile | Beispiel |
|---|---|
| `progetto` | `progetto nome="Linea 3" cliente="Rossi Spa"` |
| `luogo` | `luogo +Q1 "Quadro master" tipo="Quadro elettrico"` |
| `cavo` | `cavo -1W1 tipo=FG16OR16 sezione=1,5 conduttori="BN BK GY GNYE" lunghezza=15` |
| `scheda` | `scheda -3A1 tipo=cpu-14di-10do-2ai stazione=PLC1` |
| `simbolodef` | ein Kastensymbol mit seinen Anschlusspunkten, für Bauteile, die nicht im Katalog sind |
| `pagina` | `pagina 7 "Ventilazione" tipo=schema luogo=Q1` |
| `simbolo` | `simbolo coil -7K1 @100,140 descr="Contattore" dati="24 V DC"` |
| `filo` | `filo 100,24 100,60 sezione=1,5 colore=BU` |
| `collega` | `collega -7S1:14 -7K1:A1` (das Programm berechnet den Verlauf) |
| `testo` | `testo @40,250 h=3 "Nota"` |
| `riquadro`, `lineacavo` | Rahmen des Netzwerkplans und Kabellinien |

Der exportierte Text beschreibt in Kommentaren jeden Anschlusspunkt mit seinen Koordinaten und für jeden
Draht, was er verbindet, und die Drahtnummer. Exportieren und unverändert wieder importieren ergibt dasselbe
Projekt.
