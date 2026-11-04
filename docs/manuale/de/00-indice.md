# OpenWiring-Handbuch

OpenWiring ist ein Programm zum Zeichnen industrieller Stromlaufpläne nach IEC-Normen:
Betriebsmittelkennzeichen, Querverweise, Drahtnummern, Klemmleisten, Kabel, SPS, Listen und Export als PDF,
DXF und Excel. Dieses Handbuch erklärt jede Funktion mit Beispielen und Bildern.

Für den Einstieg genügen die Kapitel 1–3: in einer halben Stunde ist der erste Schaltplan gezeichnet. Die
übrigen Kapitel schlägt man bei Bedarf nach.

> Die Bilder zeigen das Programm mit italienischer Oberfläche. Die Sprache wählt man unter
> *Ansicht ▸ Language · Lingua*: Menüs und Fenster sind in allen Sprachen gleich aufgebaut.

## Kapitel

| Nr. | Kapitel | Inhalt |
|---|---|---|
| 1 | [Einführung und Installation](01-introduzione.md) | was OpenWiring ist, Installation, erster Start, Speichern |
| 2 | [Die Oberfläche](02-interfaccia.md) | Menüs, Symbolleiste, Baum, Eigenschaften, Bibliothek, Ansichten, Navigation |
| 3 | [Das erste Projekt](03-primo-progetto.md) | geführte Übung: Pumpensteuerung mit Selbsthaltung |
| 4 | [Projekt und Seiten](04-progetto-e-pagine.md) | Projektdaten, Seiten und Seitentypen, Orte, Schriftfeld, benutzerdefinierte Eigenschaften, Deckblatt, Vorlagen |
| 5 | [Den Schaltplan zeichnen](05-disegnare.md) | Symbole, Drähte, Abzweige, Potenziale, Unterbrechungspunkte, Leiterbusse, Texte, Bilder, Bearbeiten |
| 6 | [BMK, Querverweise und Drahtnummern](06-sigle-e-numerazione.md) | IEC 81346, Kontakte, Kontaktspiegel, Drahtnummern, Querschnitte und Farben |
| 7 | [Geräte und Artikel](07-dispositivi-e-articoli.md) | Gerätedaten, Navigator, Struktur =/+, Eigenschaften kopieren, Artikel, Artikeldatenbank, EDZ und CSV |
| 8 | [Klemmleisten](08-morsettiere.md) | Klemmen, Etagen, Brücken, Reserven, Zubehör, Klemmleistenplan |
| 9 | [Kabel und Steckverbinder](09-cavi-e-connettori.md) | Kabeldefinitionslinie, Adern, Kabellisten, Steckverbinder, Pin-Daten |
| 10 | [SPS](10-plc.md) | Karten, E/A-Punkte, Adressen, Übersichten, TIA Portal, CODESYS, PLCopen |
| 11 | [Netze, Orte und einpoliger Plan](11-reti-luoghi-unifilare.md) | Netzwerkplan, Busse, Netzwerkkabel, IP-Plan, Orte, einpolige Darstellung |
| 12 | [Schaltschrankaufbau](12-layout-quadro.md) | Montageplatte, Hutschienen, Kabelkanäle, automatisches Platzieren, Bohrbild, Drahtlängen |
| 13 | [Makros, Symbole und Schriftfelder](13-macro-simboli-cartigli.md) | Makros, Bauteileditor, QElectroTech, mitgelieferte und eigene Schriftfelder |
| 14 | [Listen und automatische Seiten](14-liste-e-pagine-automatiche.md) | Stückliste, Einkaufsliste, Listen, Listenseiten, Etiketten |
| 15 | [Prüfung, Suche und Revisionen](15-verifica-ricerca-revisioni.md) | Projektprüfung, Suchen und Ersetzen, Revisionen, Vergleich |
| 16 | [Sprachen der Schaltpläne](16-lingue.md) | Wörterbuch, Schaltpläne auf Englisch und Deutsch, zwei Sprachen zugleich |
| 17 | [KI-Assistent](17-assistente-ia.md) | Claude, ChatGPT und Gemini im Programm, Textformat |
| 18 | [Import und Export](18-import-export.md) | PDF, Drucken, DXF, Excel, Import aus SEE Electrical, EPLAN, QElectroTech |
| 19 | [Kommandozeile und Agenten](19-riga-di-comando.md) | Befehle `npm run cli`, Leitfaden für KI-Agenten |
| 20 | [Tastenkürzel, Dateien und Probleme](20-scorciatoie-e-problemi.md) | Tasten, Dateiformate, häufige Fragen |

## Konventionen in diesem Handbuch

- *Kursiv mit Pfeilen* steht für einen Menüpfad: *Projekt ▸ Prüfung*.
- **⌘** ist die Befehlstaste des Mac; unter Windows verwendet man **Strg**.
- Kennzeichen werden wie im Schaltplan geschrieben: `-2K1` (Gerät), `-X1:3` (Klemme), `200.01` (Drahtnummer).
- Die Beispiele verwenden das **Beispielprojekt** „Avviamento motore pompa“ (*Datei ▸ Beispielprojekt
  laden*), so lässt sich jedes Bild im Programm wiederfinden.

## Marken und Daten Dritter

OpenWiring ist eine unabhängige Software, die weder mit EPLAN GmbH & Co. KG, Rittal, SDProget oder den genannten
Herstellern verbunden ist noch von ihnen genehmigt wurde. EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, Siemens,
Schneider Electric, QElectroTech und die übrigen Produkt- und Firmennamen sind Marken ihrer jeweiligen Inhaber und
werden nur genannt, um Dateiformate und Kompatibilität anzugeben. OpenWiring enthält und verbreitet keine Makros,
Symbole oder Kataloge der Hersteller: Sie importieren nur Dateien, die Sie verwenden dürfen, unter Beachtung ihrer
Nutzungsbedingungen. Das Lesen der Formate EDZ, XML und CSV beruht auf der Analyse der Datendateien zum Zweck der
Interoperabilität. Dieselben Angaben stehen unter *Hilfe ▸ Informationen*.
