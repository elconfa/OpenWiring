# 20. Shortcuts, files and problems

## Keyboard shortcuts

On Windows use **Ctrl** instead of **⌘**. *Help ▸ Shortcuts and information* summarises them.

| Key | Action |
|---|---|
| **W** | draw wire |
| **R** | rotate the selection, or the symbol being inserted |
| **F** | fit the page to the window |
| **Del**, Backspace | delete the selection |
| **Esc** | end the current command |
| **Arrows** | move the selection by 4 mm (with ⇧ 16 mm) |
| **PgUp**, **PgDn** | previous, next page |
| ⌘Z, ⇧⌘Z (Ctrl+Y) | undo, redo |
| ⌘C, ⌘X, ⌘V | copy, cut, paste (also into another project) |
| ⌘D | duplicate the selection |
| ⌘A | select everything on the page |
| ⌘F | find and replace |
| ⌘S, ⇧⌘S, ⌘O | save, save as, open |
| ⌘P | print |
| ⌘I | open or close the AI assistant |
| Wheel | zoom around the cursor |
| Middle button, **Alt** + drag | pan the view |
| **Shift** + click | add or remove an element from the selection |
| Right button | context menu; during insertion ends the command |

## Files

| Extension | Content |
|---|---|
| `.ecad` | OpenWiring project: pages, elements, settings, parts and symbols used, in a readable JSON file |
| `.ecmacro` | macro to exchange |
| `.edz`, `.xml`, `.csv` | manufacturer parts (EDZ packages, XML in the EPLAN format, commercial data CSV) |
| `.elmt`, `.qet` | QElectroTech components |
| `.pdf` | schematics and lists; also as a source for import from other CAD programs |
| `.dxf` | pages, drilling plate, title blocks to import |
| `.xlsx`, `.csv` | lists, devices, PLC variables, labels, dictionary |
| `.txt` | pages in text format |

The **personal library** (parts, imported symbols, macros, title blocks, project templates) is saved in the
program on that computer. Elements used in a project are copied into the `.ecad` file, so the project opens
complete elsewhere too.

## Frequently asked questions

**A wire looks connected but the check says it is not.**
The wire passes over the connection point without ending there. Drag the end of the wire onto the point, or
delete the wire and redraw it ending on the point (the small green circle).

**Two wires cross: are they connected?**
No, unless there is the junction dot. To connect them, make one wire end on the other.

**The contact does not show the reference to the coil.**
The contact must have the same tag as the coil. Check the tag in the contact properties.

**I added a component and the wire numbers changed.**
This happens with *recalculated* numbering. With *locked* numbering (the default) existing numbers do not
change.

**The wire number changes after a terminal.**
In the terminal properties check *Wire number ▸ The wire number passes through*.

**An interruption point shows `/?` in red.**
The matching interruption point with the same name on another page is missing.

**The PDF does not contain the lists.**
Tick *Lists at the end* in the PDF window, or create the list pages.

**The app does not open on macOS.**
See [Installation](01-introduzione.md#macos): *System Settings ▸ Privacy & Security ▸ Open Anyway*.

**The AI assistant answers that the account login has expired.**
Run the command it gives in the Terminal (for example `codex login`), then try again.

**The imported QElectroTech component does not work.**
Probably the GitHub web page was saved instead of the file: download with *Raw*.

**I lost my work after a sudden shutdown.**
On reopening, the program offers the last project you were working on. Save often with ⌘S anyway.
