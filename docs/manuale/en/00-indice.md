# OpenWiring manual

OpenWiring is a program for drawing industrial electrical schematics according to IEC standards: device tags, cross-references, wire numbers, terminal strips, cables, PLC, lists and export
to PDF, DXF and Excel. This manual explains every function with examples and pictures.

Beginners can read chapters 1–3 and draw their first schematic in half an hour; the other chapters can be
looked up when needed.

> The pictures show the program with the Italian interface. Choose your language with
> *View ▸ Language · Lingua*: menus and windows have the same layout in every language.

## Chapters

| No. | Chapter | Content |
|---|---|---|
| 1 | [Introduction and installation](01-introduzione.md) | what OpenWiring is, installation, first start, saving |
| 2 | [The interface](02-interfaccia.md) | menus, toolbar, tree, properties, library, views, navigation |
| 3 | [Your first project](03-primo-progetto.md) | guided exercise: pump control with self-holding |
| 4 | [Project and pages](04-progetto-e-pagine.md) | project data, pages and page types, locations, title block, cover, templates |
| 5 | [Drawing the schematic](05-disegnare.md) | symbols, wires, junctions, potentials, interruption points, texts, editing |
| 6 | [Tags, cross-references and wire numbers](06-sigle-e-numerazione.md) | IEC 81346, contacts, contact image, wire numbers, cross-sections and colours |
| 7 | [Devices and parts](07-dispositivi-e-articoli.md) | device data, navigator, =/+ structure, parts and EDZ |
| 8 | [Terminal strips](08-morsettiere.md) | terminals, levels, jumpers, spares, accessories, terminal strip diagram |
| 9 | [Cables and connectors](09-cavi-e-connettori.md) | definition line, conductors, cable lists, connectors and plugs |
| 10 | [PLC](10-plc.md) | cards, I/O points, addresses, overviews, TIA Portal, CODESYS, PLCopen |
| 11 | [Networks, locations and single-line diagram](11-reti-luoghi-unifilare.md) | network diagram, buses, network cables, IP plan, locations, single-line |
| 12 | [Cabinet layout](12-layout-quadro.md) | mounting plate, DIN rails, cable ducts, automatic placement, drilling, wire lengths |
| 13 | [Macros, symbols and title blocks](13-macro-simboli-cartigli.md) | macros, component editor, QElectroTech, custom title blocks |
| 14 | [Lists and automatic pages](14-liste-e-pagine-automatiche.md) | bill of materials, purchase list, lists, list pages, labels |
| 15 | [Check, search and revisions](15-verifica-ricerca-revisioni.md) | project checks, find and replace, revisions, comparison |
| 16 | [Schematic languages](16-lingue.md) | dictionary, schematics in English and German, two languages together |
| 17 | [AI assistant](17-assistente-ia.md) | Claude, ChatGPT and Gemini in the program, text format |
| 18 | [Import and export](18-import-export.md) | PDF, printing, DXF, Excel, import from SEE Electrical, EPLAN, QElectroTech |
| 19 | [Command line and agents](19-riga-di-comando.md) | `npm run cli` commands, guide for AI agents |
| 20 | [Shortcuts, files and problems](20-scorciatoie-e-problemi.md) | keys, file formats, frequently asked questions |

## Conventions used in this manual

- *Italics with arrows* show a menu path: *Project ▸ Check*.
- **⌘** is the Command key on the Mac; on Windows use **Ctrl**.
- Tags are written as on the schematic: `-2K1` (device), `-X1:3` (terminal), `200.01` (wire number).
- The examples use the **example project** «Avviamento motore pompa» (*File ▸ Load the example project*),
  so every picture can be found in the program.

## Trademarks and third-party data

OpenWiring is independent software, not affiliated with or approved by EPLAN GmbH & Co. KG, Rittal, SDProget or the
manufacturers mentioned. EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, Siemens, Schneider Electric, QElectroTech and
the other product and company names are trademarks of their respective owners, mentioned only to indicate file formats
and compatibility. OpenWiring does not include or distribute manufacturers' macros, symbols or catalogues: you import
only files you have the right to use, respecting their terms of use. Reading the EDZ, XML and CSV formats derives from
the analysis of data files, for interoperability purposes. The same information is in *Help ▸ About*.
