# 2. Die Oberfläche

![Das OpenWiring-Fenster mit nummerierten Bereichen](../img/it/interfaccia.png)

*Das OpenWiring-Fenster mit dem Beispielprojekt (italienische Oberfläche).*

| Nr. | Bereich | Wozu er dient |
|---|---|---|
| 1 | Menüleiste | alle Befehle: *Datei, Bearbeiten, Ansicht, Einfügen, Projekt, Listen, Hilfe* |
| 2 | Symbolleiste | die meistgenutzten Zeichenbefehle |
| 3 | Modellbaum | Seiten, Geräte, Struktur =/+, Klemmleisten, Kabel, Projektartikel |
| 4 | Eigenschaften | die Daten des ausgewählten Elements, der Seite oder des Projekts |
| 5 | Zeichenbereich | die aktuelle Schaltplanseite |
| 6 | Bibliothek | Symbole, Makros und Artikel zum Einfügen |
| 7 | Meldungsansicht | Meldungen zu Import, Export und Vorgängen |
| 8 | Statusleiste | Hinweise zum aktiven Befehl, Datei, Seite, Cursorkoordinaten |
| 9 | Ansichtsregister | Schaltplan, Geräte, SPS, Klemmleisten, Artikel, Listen |

## Menüleiste

![Das Menü Datei](../img/it/menu-file.png)

*Das Menü Datei: Projekte, Import und Export.*

Jeder Befehl des Programms steht in einem Menü; neben den Einträgen stehen die Tastenkürzel. Bei geöffnetem
Menü wechseln die Pfeiltasten ← → zum Nachbarmenü, Esc schließt es.

| Menü | Enthält |
|---|---|
| *Datei* | neu, öffnen, speichern, Beispielprojekt, Seiten als Text für KI-Assistenten, **Importieren** (Artikel EDZ/XML/CSV, QElectroTech-Symbole, Schaltplan aus PDF, Makros, Vergleich) und **Exportieren** (PDF, Drucken, DXF, Etiketten, PLCopen, Artikel, Wörterbuch) |
| *Bearbeiten* | rückgängig und wiederholen, ausschneiden, kopieren, einfügen, duplizieren, löschen, alles auswählen, drehen, spiegeln, suchen und ersetzen |
| *Ansicht* | Ansichten, Seite einpassen, vorherige und nächste Seite, helles oder dunkles Design, weißes oder dunkles Blatt, Sprache der Schaltpläne, Sprache der Oberfläche, Beschriftung unter den Symbolen |
| *Einfügen* | Draht, Kabel, Schrankrahmen, Text, Bild, Leiterbus, Netzwerkverbindungen nach Protokoll, Seiten aller Arten, automatische Seiten |
| *Projekt* | Eigenschaften, benutzerdefinierte Eigenschaften, Prüfung, KI-Assistent, Neunummerierungen, Schriftfeld, Orte, IP-Netze, Übersetzungen, Revisionen, Vorlagen |
| *Listen* | Prüfungen, Übersetzungen und alle Projektlisten, vollständiges PDF |
| *Hilfe* | Handbuch, Tastenkürzel, Leitfaden für KI-Agenten, Projektwebsite, Informationen (Version, Autor, Marken und Daten Dritter) |

![Das Menü Projekt](../img/it/menu-progetto.png)

*Das Menü Projekt.*

## Symbolleiste

![Die Symbolleiste](../img/it/barra-strumenti.png)

| Schaltfläche | Aktion |
|---|---|
| *Neu, Öffnen, Speichern* | Verwaltung der Projektdatei |
| *Rückgängig, Wiederholen* | ⌘Z und ⇧⌘Z |
| *Auswählen* | zurück zur Auswahl (auch mit Esc) |
| *Draht* | Drähte zeichnen (Taste **W**) |
| *Bus* und die Protokollliste | eine Netzwerkverbindung zeichnen (Profinet, EtherCAT, Modbus…) |
| *Leiterbus* | Drähte zu einem Leiterbus zusammenfassen ([Kapitel 5](05-disegnare.md#leiterbusse)) |
| *Schaltschrank* | Rahmen eines Schaltschranks im Netzwerkplan |
| *Kabel* | Kabeldefinitionslinie |
| *Text* | freier Text auf der Seite |
| *Drehen, Löschen* | auf die Auswahl (Tasten **R** und **Entf**) |
| *Einpassen* | ganze Seite anzeigen (Taste **F**) |
| *Suchen* | suchen und ersetzen (⌘F) |
| *Prüfung* | Projektprüfungen |
| *EDZ* | Herstellerartikel importieren |
| *PDF* | Projekt als PDF exportieren |

Wird *Ansicht ▸ Beschriftung unter den Symbolen* ausgeschaltet, wird die Leiste zu einer niedrigeren Zeile
nur mit Symbolen.

## Modellbaum

![Der Modellbaum](../img/it/albero.png)

Der Baum zeigt das Projekt und lässt sich mit den Dreiecken ▸ ▾ auf- und zuklappen:

- **Seiten**, nach Ort gruppiert (Schaltschrank, Bedienstation…): ein Klick öffnet die Seite.
- **Geräte**, nach Ort gruppiert: ein Klick springt zum Gerät und wählt es aus.
- **Struktur =Anlage +Ort**: die Geräte nach Funktion und Ort (siehe [Kapitel 7](07-dispositivi-e-articoli.md#struktur-anlage-ort)).
- **Klemmleisten** und **Kabel**: ein Klick öffnet die Klemmleiste oder wählt die Kabellinie aus.
- **Projektartikel**: die verwendeten Artikel.

Unter dem Baum stehen die Seitenschaltflächen: *+ Seite*, *+ Deckblatt*, *+ Einpolig*, *+ Netzwerk*,
*+ Aufbau*, *⧉* (Seite duplizieren), *↑ ↓* (verschieben) und *✕* (löschen).

## Eigenschaften

Das Feld zeigt die Daten des Ausgewählten:

- **nichts ausgewählt**: die aktuelle Seite und darunter die Projektdaten;
- **ein Symbol**: BMK, Gerätedaten, Bestellung, Anschlusspunkte, Position;
- **ein Draht**: Drahtnummer, Netz, Verbindungen, Querschnitt, Farbe;
- **mehrere Elemente**: die gemeinsamen Felder.

Man schreibt ins Feld und bestätigt mit der Eingabetaste oder durch Verlassen des Felds. Werte in grauer
Kursivschrift sind Vorschläge oder Werte aus dem Artikel.

## Bibliothek

![Die Symbolbibliothek](../img/it/libreria-simboli.png)

Die rechte Spalte hat drei Register:

- **Symbole**: die Symbole nach IEC 60617, nach Kategorien geordnet (Spulen und Kontakte, Befehlsgeräte,
  Schutzgeräte, Verbraucher, Klemmen und Verbindungen, SPS, Netze und Busse, einpolig), dazu die von Ihnen
  importierten oder gezeichneten. Das Feld *Suchen…* filtert nach Namen.
  Oben stehen die **★ Favoriten**: der Stern ☆ eines Symbols (oder rechte Maustaste auf ein Bauteil ▸
  *Zu Favoriten hinzufügen*) legt es hier ab. Favoriten gelten für alle Projekte.
- **Makros**: zur Wiederverwendung gespeicherte Stromkreise (siehe [Kapitel 13](13-macro-simboli-cartigli.md)).
- **Artikel**: die Bibliothek der Herstellerartikel.

## Kontextmenü

![Das Kontextmenü](../img/it/menu-contestuale.png)

Ein Rechtsklick auf ein Element öffnet die häufigsten Befehle: ausschneiden, kopieren, hier einfügen,
duplizieren, drehen, spiegeln, löschen, Makro aus Auswahl erstellen, **Eigenschaften kopieren** und **Eigenschaften von -X einfügen** (alle Gerätedaten außer dem BMK, [Kapitel 7](07-dispositivi-e-articoli.md#eigenschaften-kopieren)), Bauteil bearbeiten, zu Favoriten hinzufügen, Potenzial
hervorheben (bei Drähten), zum Hauptelement oder zu den Kontakten, Etage hinzufügen (bei Klemmen), alles
auswählen, suchen, Seite duplizieren, an Fenster anpassen.

## Ansichten

Die Register oben rechts ändern den mittleren Bereich:

| Ansicht | Inhalt |
|---|---|
| *Schaltplan* | die Zeichenseite |
| *Geräte* | der Gerätenavigator als Tabelle |
| *SPS* | Karten, Adressen und E/A-Liste |
| *Klemmleisten* | der Klemmleisten-Navigator |
| *Artikel* | die Artikelverwaltung |
| *Listen* | Prüfungen, Übersetzungen und alle Listen |

## Im Plan bewegen

| Aktion | Wie |
|---|---|
| Vergrößern und verkleinern | Mausrad, um den Cursor herum (auf dem Trackpad: Zusammenziehen) |
| Ansicht verschieben | mittlere Maustaste oder **Alt** + ziehen |
| Ganze Seite sehen | **F** oder *Einpassen* |
| Vorherige oder nächste Seite | **Bild↑** / **Bild↓** |
| Zu einem Verweis springen | auf einen Querverweis wie `/2.4` klicken |

## Design, Blatt und Sprache

*Ansicht ▸ Design* wählt eine helle, dunkle oder systemgleiche Oberfläche. *Ansicht ▸ Zeichenblatt* wählt
ein weißes oder dunkles Blatt (wie in CAD-Programmen mit schwarzem Hintergrund). PDF, DXF und Druck sind
immer auf weißem Blatt. *Ansicht ▸ Language · Lingua* wählt die Sprache der Oberfläche: Italienisch,
Englisch, Französisch, Deutsch oder Spanisch.
