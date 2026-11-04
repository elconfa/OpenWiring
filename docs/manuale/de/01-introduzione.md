# 1. Einführung und Installation

## Was OpenWiring ist

OpenWiring ist ein Elektro-CAD: man zeichnet keine Linien, sondern **verbundene Geräte**. Das Programm weiß,
dass der Kontakt `-2K1 13-14` zur Spule `-2K1` gehört, dass zwei durch einen Punkt verbundene Drähte derselbe
Leiter sind und dass die Klemme `-X1:3` den Draht `1.06` zum Motor führt. Daraus ermittelt es selbst:

- die **Querverweise** zwischen Spulen und Kontakten sowie zwischen verschiedenen Seiten;
- die **Drahtnummern** und ihre Lage im Schaltplan;
- die **Listen**: Stückliste, Einkaufsliste, Geräte, Klemmen, Verbindungen, Drähte, Kabel, SPS-E/A;
- die **Prüfung** des Projekts: Kurzschlüsse, fehlende Verbindungen, doppelte BMK;
- die **Exporte**: PDF mit anklickbaren Links, DXF, Excel für TIA Portal, Etiketten für Beschriftungsdrucker.

Die Begriffe sind die im industriellen Schaltplanentwurf üblichen (BMK nach IEC 81346, 4-mm-Raster, A3-Seiten
mit 10 Spalten, Querverweise `/Seite.Spalte`), mit einer einfachen Oberfläche.

## Installation

Das Programm wird von der Seite **Releases** des Projekts auf GitHub heruntergeladen
(<https://github.com/elconfa/OpenWiring/releases>).

| System | Herunterzuladende Datei |
|---|---|
| macOS mit Apple-Prozessor (M1, M2, M3, M4) | `OpenWiring-x.y.z-arm64.dmg` |
| macOS mit Intel-Prozessor | `OpenWiring-x.y.z.dmg` |
| Windows 10 und 11, mit Installation | `OpenWiring.Setup.x.y.z.exe` |
| Windows, ohne Installation (eine einzige Datei, auch vom USB-Stick) | `OpenWiring-x.y.z-portable.exe` |
| Windows, ohne Installation (Ordner) | `OpenWiring-x.y.z-win.zip` |

### macOS

1. Die `.dmg`-Datei öffnen und **OpenWiring** in den Ordner *Programme* ziehen.
2. Die App einmal öffnen: es erscheint die Warnung „Apple kann nicht überprüfen…“, weil die App nicht mit
   einem kostenpflichtigen Apple-Zertifikat signiert ist. Warnung schließen.
3. *Systemeinstellungen ▸ Datenschutz & Sicherheit* öffnen, nach unten scrollen, **Dennoch öffnen** drücken
   und bestätigen. Unter macOS 14 und älter genügt Rechtsklick auf die App ▸ *Öffnen* ▸ *Öffnen*.

> **Wenn „OpenWiring ist beschädigt“ erscheint** (Versionen bis 0.14.0): Terminal öffnen,
> `xattr -cr /Applications/OpenWiring.app` ausführen und die App erneut öffnen.

### Windows

Das ZIP in einen Ordner entpacken (zum Beispiel *Dokumente\\OpenWiring-app*) und `OpenWiring.exe` starten. Im blauen SmartScreen-Fenster *Weitere Informationen ▸ Trotzdem
ausführen* wählen.

### Sprache der Oberfläche

Beim ersten Start verwendet das Programm die Systemsprache, wenn es Italienisch, Englisch, Französisch,
Deutsch, Spanisch oder Russisch ist. Sie lässt sich jederzeit unter *Ansicht ▸ Language · Lingua* ändern. Die Sprache
der Schaltpläne (Schriftfelder, Listen, PDF) ist eine eigene Einstellung: siehe [Kapitel 16](16-lingue.md).

## Erster Start

Beim ersten Start öffnet sich das **Beispielprojekt** „Avviamento motore pompa“ (Pumpenmotorstart) mit sechs
fertigen Seiten zum Erkunden:

| Seite | Inhalt |
|---|---|
| 1 | Hauptstromkreis: Motorschutzschalter, Schütz, Klemmleiste, Kabel und Motor; 24-V-Netzteil |
| 2 | Steuerstromkreis: Not-Halt, Ein mit Selbsthaltung, Leuchten |
| 3 | Ein- und Ausgänge der SPS |
| 4 | Übersicht der SPS-Karte, vom Programm erzeugt |
| 5 | Netzwerkplan Profinet und Modbus zwischen zwei Schaltschränken |
| 6 | einpoliger Übersichtsplan des Hauptstromkreises |

Es lässt sich jederzeit mit *Datei ▸ Beispielprojekt laden* wieder öffnen; *Datei ▸ Neues Projekt* beginnt
mit einer leeren Seite.

## Arbeit speichern

- **Speichern** (⌘S) schreibt das Projekt in eine `.ecad`-Datei. *Speichern unter…* (⇧⌘S) erstellt eine Kopie.
- **Öffnen** (⌘O) öffnet eine `.ecad`-Datei. Die Datei enthält alles: Seiten, Einstellungen, verwendete
  Symbole und Artikel.
- Das Programm hält außerdem eine **automatische Kopie** des zuletzt geöffneten Projekts und bietet sie beim
  nächsten Start an: eine Sicherheit bei unerwartetem Beenden, kein Ersatz für *Speichern*.
- Die Statusleiste unten zeigt den Dateinamen und einen Punkt `•`, wenn es ungespeicherte Änderungen gibt.

## Rückgängig

Jede Änderung lässt sich mit **⌘Z** (*Bearbeiten ▸ Rückgängig*) zurücknehmen und mit **⇧⌘Z** (Strg+Y unter
Windows) wiederholen. Bis zu 100 Schritte sind möglich, auch große Vorgänge wie das Übernehmen vom
KI-Assistenten geschriebener Seiten oder eine Sammelbearbeitung vieler Geräte.
