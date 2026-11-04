# Componenti di terzi

OpenWiring è distribuito con licenza GNU GPL 3.0 o successiva (vedi [LICENSE](LICENSE)).
Il programma include o usa i componenti seguenti, ciascuno con la propria licenza.

| Componente | Uso | Licenza |
|---|---|---|
| [Electron](https://www.electronjs.org) (Chromium, Node.js) | app desktop | MIT (Chromium: BSD e altre, elencate in `LICENSES.chromium.html` nel pacchetto) |
| [React](https://react.dev), React DOM | interfaccia | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | stato dell'applicazione | MIT |
| [jsPDF](https://github.com/parallax/jsPDF) | export PDF | MIT |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) | export PDF | MIT |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | unione e modifica dei PDF | MIT |
| [pdf.js](https://github.com/mozilla/pdf.js) (pdfjs-dist) | lettura degli schemi in PDF, anteprime | Apache 2.0 |
| [fflate](https://github.com/101arrowz/fflate) | file ZIP e XLSX | MIT |
| [xmldom](https://github.com/xmldom/xmldom) | lettura degli XML nella riga di comando | MIT |
| [7z-wasm](https://github.com/use-strict/7z-wasm) (7-Zip di Igor Pavlov) | apertura dei pacchetti EDZ | GNU LGPL 2.1 o successiva, più la restrizione unRAR per il codice RAR |

7z-wasm è un modulo separato, caricato a parte e non modificato: resta sotto la sua licenza (testo completo in
`node_modules/7z-wasm/License.txt` e su <https://www.7-zip.org/license.txt>). La restrizione unRAR vieta di
usare quel codice per ricreare l'algoritmo di compressione RAR; OpenWiring lo usa solo per estrarre archivi.

## Materiali che non sono inclusi

- **Simboli, macro e cataloghi dei costruttori** (EDZ, XML, CSV): non sono distribuiti con OpenWiring;
  l'utente importa i file che ha il diritto di usare. I file di prova del repository usano il costruttore
  inventato DEMO.
- **Simboli QElectroTech** (CC-BY 3.0): si importano dall'installazione di QElectroTech dell'utente, non
  sono inclusi.
- **ODA File Converter** (export DWG): programma gratuito di Open Design Alliance, da installare a parte.

## Marchi

EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, TIA Portal, CODESYS, TwinCAT, Siemens, Beckhoff, WAGO,
Weidmüller, Schneider Electric, QElectroTech e gli altri nomi citati sono marchi dei rispettivi titolari,
usati solo per indicare formati di file e compatibilità. OpenWiring è un progetto indipendente, non affiliato
né approvato da questi titolari.
