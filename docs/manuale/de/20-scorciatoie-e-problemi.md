# 20. Tastenkürzel, Dateien und Probleme

## Tastenkürzel

Unter Windows verwendet man **Strg** statt **⌘**. *Hilfe ▸ Tastenkürzel und Informationen* fasst sie zusammen.

| Taste | Aktion |
|---|---|
| **W** | Draht zeichnen |
| **R** | die Auswahl drehen, oder das einzufügende Symbol |
| **F** | die Seite an das Fenster anpassen |
| **Entf**, Rücktaste | die Auswahl löschen |
| **Esc** | den aktuellen Befehl beenden |
| **Pfeiltasten** | die Auswahl um 4 mm verschieben (mit ⇧ 16 mm) |
| **Bild↑**, **Bild↓** | vorherige, nächste Seite |
| ⌘Z, ⇧⌘Z (Strg+Y) | rückgängig, wiederholen |
| ⌘C, ⌘X, ⌘V | kopieren, ausschneiden, einfügen (auch in ein anderes Projekt) |
| ⌘D | die Auswahl duplizieren |
| ⌘A | alles auf der Seite auswählen |
| ⌘F | suchen und ersetzen |
| ⌘S, ⇧⌘S, ⌘O | speichern, speichern unter, öffnen |
| ⌘P | drucken |
| ⌘I | den KI-Assistenten öffnen oder schließen |
| Mausrad | Zoom um den Cursor |
| Mittlere Taste, **Alt** + ziehen | die Ansicht verschieben |
| **Umschalt** + Klick | ein Element zur Auswahl hinzufügen oder daraus entfernen |
| Rechte Taste | Kontextmenü; beim Einfügen beendet sie den Befehl |

## Dateien

| Endung | Inhalt |
|---|---|
| `.ecad` | OpenWiring-Projekt: Seiten, Elemente, Einstellungen, verwendete Artikel und Symbole, in einer lesbaren JSON-Datei |
| `.ecmacro` | Makro zum Austauschen |
| `.edz`, `.xml`, `.csv` | Herstellerartikel (EDZ-Pakete, XML im EPLAN-Format, CSV der Handelsdaten) |
| `.elmt`, `.qet` | Bauteile aus QElectroTech |
| `.pdf` | Schaltpläne und Listen; auch als Quelle für den Import aus anderen CAD-Programmen |
| `.dxf` | Seiten, Bohrbild der Platte, zu importierende Schriftfelder |
| `.xlsx`, `.csv` | Listen, Geräte, SPS-Variablen, Etiketten, Wörterbuch |
| `.txt` | Seiten im Textformat |

Die **persönliche Bibliothek** (Artikel, importierte Symbole, Makros, Schriftfelder, Projektvorlagen) wird im
Programm auf diesem Computer gespeichert. Die in einem Projekt verwendeten Elemente werden in die
`.ecad`-Datei kopiert, so öffnet sich das Projekt auch anderswo vollständig.

## Häufige Fragen

**Ein Draht sieht verbunden aus, aber die Prüfung sagt, er ist es nicht.**
Der Draht läuft über den Anschlusspunkt, ohne dort zu enden. Das Drahtende auf den Punkt ziehen oder den
Draht löschen und neu zeichnen, mit dem Ende auf dem Punkt (dem kleinen grünen Kreis).

**Zwei Drähte kreuzen sich: sind sie verbunden?**
Nein, außer es gibt den Verbindungspunkt. Um sie zu verbinden, einen Draht auf dem anderen enden lassen.

**Der Kontakt zeigt den Verweis auf die Spule nicht.**
Der Kontakt muss dasselbe BMK wie die Spule haben. Das BMK in den Eigenschaften des Kontakts prüfen.

**Ich habe ein Bauteil hinzugefügt, und die Drahtnummern haben sich geändert.**
Das passiert bei der Nummerierung *bei jeder Änderung neu berechnet*. Bei der Nummerierung *fixiert*
(Standard) ändern sich vorhandene Nummern nicht.

**Die Drahtnummer ändert sich nach einer Klemme.**
In den Eigenschaften der Klemme *Drahtnummer ▸ Drahtnummer läuft durch* prüfen.

**Ein Unterbrechungspunkt zeigt `/?` in Rot.**
Der passende Unterbrechungspunkt mit demselben Namen auf einer anderen Seite fehlt.

**Das PDF enthält die Listen nicht.**
*Listen am Ende* im PDF-Fenster anhaken oder die Listenseiten anlegen.

**Die App öffnet sich unter macOS nicht.**
Siehe [Installation](01-introduzione.md#macos): *Systemeinstellungen ▸ Datenschutz & Sicherheit ▸ Dennoch
öffnen*.

**Der KI-Assistent antwortet, dass die Anmeldung beim Konto abgelaufen ist.**
Den angegebenen Befehl im Terminal ausführen (zum Beispiel `codex login`) und es dann erneut versuchen.

**Das importierte QElectroTech-Bauteil funktioniert nicht.**
Wahrscheinlich wurde die GitHub-Webseite statt der Datei gespeichert: mit *Raw* herunterladen.

**Ich habe nach einem plötzlichen Absturz meine Arbeit verloren.**
Beim erneuten Öffnen bietet das Programm das zuletzt bearbeitete Projekt an. Trotzdem oft mit ⌘S speichern.
