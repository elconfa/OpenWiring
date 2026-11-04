# 2. The interface

![The OpenWiring window with its numbered parts](../img/it/interfaccia.png)

*The OpenWiring window with the example project (Italian interface).*

| No. | Part | What it is for |
|---|---|---|
| 1 | Menu bar | all commands: *File, Edit, View, Insert, Project, Lists, Help* |
| 2 | Toolbar | the most used drawing commands |
| 3 | Model tree | pages, devices, =/+ structure, terminal strips, cables, project parts |
| 4 | Properties | the data of the selected element, of the page or of the project |
| 5 | Drawing area | the current schematic page |
| 6 | Library | symbols, macros and parts to insert |
| 7 | Report view | messages from import, export and operations |
| 8 | Status bar | hints on the active command, file, page, cursor coordinates |
| 9 | View tabs | Schematic, Devices, PLC, Terminal strips, Parts, Lists |

## Menu bar

![The File menu](../img/it/menu-file.png)

*The File menu: projects, import and export.*

Every command of the program is in a menu; the keyboard shortcuts are shown next to the entries. With a menu
open, the ← → arrows move to the next menu and Esc closes it.

| Menu | Contains |
|---|---|
| *File* | new, open, save, example project, pages as text for AI assistants, **Import** (EDZ/XML/CSV parts, QElectroTech symbols, schematic from PDF, macros, comparison) and **Export** (PDF, print, DXF, labels, PLCopen, parts, dictionary) |
| *Edit* | undo and redo, cut, copy, paste, duplicate, delete, select all, rotate, mirror, find and replace |
| *View* | views, fit page, previous and next page, light or dark theme, white or dark sheet, schematic language, interface language, labels under the icons |
| *Insert* | wire, cable, cabinet frame, text, image, conductor bus, network connections by protocol, pages of every type, automatic pages |
| *Project* | properties, check, AI assistant, renumbering, title block, locations, IP networks, translations, revisions, templates |
| *Lists* | checks, translations and all the project lists, complete PDF |
| *Help* | manual, shortcuts, guide for AI agents, project website, about (version, author, trademarks and third-party data) |

![The Project menu](../img/it/menu-progetto.png)

*The Project menu.*

## Toolbar

![The toolbar](../img/it/barra-strumenti.png)

| Button | Action |
|---|---|
| *New, Open, Save* | project file management |
| *Undo, Redo* | ⌘Z and ⇧⌘Z |
| *Select* | back to selection (also with Esc) |
| *Wire* | draw wires (key **W**) |
| *Bus* and the protocol list | draw a network connection (Profinet, EtherCAT, Modbus…) |
| *Wire bus* | groups wires into a conductor bus ([chapter 5](05-disegnare.md#conductor-buses)) |
| *Cabinet* | frame of a cabinet in the network diagram |
| *Cable* | cable definition line |
| *Text* | free text on the page |
| *Rotate, Delete* | on the selection (keys **R** and **Del**) |
| *Fit* | show the whole page (key **F**) |
| *Search* | find and replace (⌘F) |
| *Check* | project checks |
| *EDZ* | import manufacturers' parts |
| *PDF* | export the project to PDF |

Turning off *View ▸ Labels under the icons* makes the toolbar a single, lower row of icons.

## Model tree

![The model tree](../img/it/albero.png)

The tree shows the project and opens or closes with the triangles ▸ ▾:

- **Pages**, grouped by location (cabinet, pushbutton station…): a click opens the page.
- **Devices**, grouped by location: a click goes to the device and selects it.
- **Structure =Plant +Location**: devices by function and location (see [chapter 7](07-dispositivi-e-articoli.md#structure-plant-location)).
- **Terminal strips** and **Cables**: a click opens the terminal strip or selects the cable line.
- **Project parts**: the parts used.

Below the tree are the page buttons: *+ Page*, *+ Cover*, *+ Single-line*, *+ Network*, *+ Layout*,
*⧉* (duplicate the page), *↑ ↓* (move) and *✕* (delete).

## Properties

The panel shows the data of what is selected:

- **nothing selected**: the current page and, below it, the project data;
- **a symbol**: tag, device data, ordering, connection points, position;
- **a wire**: wire number, network, connections, cross-section, colour;
- **several elements**: the common fields.

Type in the field and confirm with Enter or by leaving the field. Values in grey italics are hints or values
taken from the part.

## Library

![The symbol library](../img/it/libreria-simboli.png)

The right-hand column has three tabs:

- **Symbols**: the IEC 60617 symbols divided by category (coils and contacts, commands, protection, loads,
  terminals and connections, PLC, networks and buses, single-line), plus those imported or drawn by you.
  The *Search…* field filters by name.
  At the top are the **★ Favourites**: the star ☆ of a symbol (or right click on a component ▸
  *Add to favourites*) puts it here. Favourites apply to all projects.
- **Macros**: circuits saved for reuse (see [chapter 13](13-macro-simboli-cartigli.md)).
- **Parts**: the library of manufacturers' parts.

## Right-click menu

![The right-click menu](../img/it/menu-contestuale.png)

Right-clicking an element opens the most used commands: cut, copy, paste here, duplicate, rotate, mirror,
delete, create macro from selection, **copy properties** and **paste properties of -X** (all device data except the tag, [chapter 7](07-dispositivi-e-articoli.md#copying-properties)), edit the component, add to favourites, highlight potential (on wires), go to the main element or
to the contacts, add level (on terminals), select all, search, duplicate page, fit to window.

## Views

The tabs at the top right change the central area:

| View | Content |
|---|---|
| *Schematic* | the drawing page |
| *Devices* | the device navigator as a table |
| *PLC* | cards, addresses and I/O list |
| *Terminal strips* | the terminal strip navigator |
| *Parts* | parts management |
| *Lists* | checks, translations and all the lists |

## Moving around the drawing

| Action | How |
|---|---|
| Zoom in and out | mouse wheel, around the cursor (on a trackpad: pinch) |
| Pan the view | middle mouse button, or **Alt** + drag |
| See the whole page | **F** or *Fit* |
| Previous or next page | **PgUp** / **PgDn** |
| Go to a reference | click a cross-reference such as `/2.4` |

## Theme, sheet and language

*View ▸ Theme* chooses a light or dark interface or the system setting. *View ▸ Drawing sheet* chooses a
white or dark sheet (as in CAD programs with a black background). PDF, DXF and printouts are always on a
white sheet. *View ▸ Language · Lingua* chooses the language of the interface: Italian, English, French,
German or Spanish.
