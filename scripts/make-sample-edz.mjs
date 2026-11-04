// Crea test/fixtures/esempio.edz: pacchetto EDZ di prova con dati articolo XML,
// un'immagine e una macro fittizia, compresso in 7z come quelli dell'Eplan Data Portal.
import SevenZip from '7z-wasm';
import { readFileSync, writeFileSync } from 'node:fs';

const contactor = `<?xml version="1.0" encoding="UTF-8"?>
<partsmanagement>
  <part P_ARTICLE_PARTNR="DEMO.CT-09-24DC" P_ARTICLE_TYPENR="CT-09-24DC" P_ARTICLE_ORDERNR="CT0924DC"
        P_ARTICLE_MANUFACTURER="DEMO" P_ARTICLE_DESCR1="it_IT@Contattore 4 kW AC-3, bobina 24 V DC;en_US@Contactor 4 kW AC-3, 24 V DC coil;"
        P_ARTICLE_PRODUCTGROUP="Contattori" P_ARTICLE_WIDTH="45" P_ARTICLE_HEIGHT="85" P_ARTICLE_DEPTH="95" P_ARTICLE_WEIGHT="0,32"
        P_ARTICLE_PICTUREFILE="$(MD_IMG)\\DEMO\\ct09.svg" P_ARTICLE_MACRO="$(MD_MACROS)\\DEMO\\CT-09.ema">
    <variant>
      <functiontemplate pos="1" description="it_IT@Bobina;" connectiondesignation="A1¶A2"/>
      <functiontemplate pos="2" connectiondesignation="1¶2"/>
      <functiontemplate pos="3" connectiondesignation="3¶4"/>
      <functiontemplate pos="4" connectiondesignation="5¶6"/>
      <functiontemplate pos="5" description="it_IT@Contatto NA;" connectiondesignation="13¶14"/>
    </variant>
  </part>
</partsmanagement>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 85"><rect x="1" y="1" width="43" height="83" rx="3" fill="#ddd" stroke="#333"/><text x="22" y="45" font-size="8" text-anchor="middle">CT-09</text></svg>`;
const sr3 = readFileSync(new URL('../test/fixtures/DEMO-SR3_articolo.xml', import.meta.url));

const sz = await SevenZip({ print: () => {}, printErr: () => {} });
for (const d of ['/pkg', '/pkg/items', '/pkg/images', '/pkg/macros']) sz.FS.mkdir(d);
sz.FS.writeFile('/pkg/items/DEMO_CT-09.xml', contactor);
sz.FS.writeFile('/pkg/items/DEMO_SR3.xml', sr3);
sz.FS.writeFile('/pkg/images/ct09.svg', svg);
sz.FS.writeFile('/pkg/macros/CT-09.ema', new Uint8Array([0x45, 0x4d, 0x41, 0]));
sz.FS.chdir('/pkg');
sz.callMain(['a', '-t7z', '/esempio.edz', 'items', 'images', 'macros']);
writeFileSync(new URL('../test/fixtures/esempio.edz', import.meta.url), sz.FS.readFile('/esempio.edz'));
console.log('creato test/fixtures/esempio.edz');
