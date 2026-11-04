// Scrittura di file Excel .xlsx minimi (testi e numeri), sufficienti per l'import delle
// variabili in TIA Portal e per aprire le liste in Excel/LibreOffice.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export interface Sheet { name: string; rows: string[][] }
/** Foglio da scrivere: le celle numeriche restano numeri in Excel; widths = larghezze in caratteri */
export interface SheetOut { name: string; rows: (string | number | undefined)[][]; widths?: number[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

export function writeXlsx(sheets: SheetOut[]): Uint8Array {
  const shared: string[] = [];
  const index = new Map<string, number>();
  const si = (v: string) => {
    let i = index.get(v);
    if (i === undefined) { i = shared.length; shared.push(v); index.set(v, i); }
    return i;
  };
  const sheetXml = sheets.map(sh => {
    const rows = sh.rows.map((r, ri) => {
      const cells = r.map((v, ci) => (v === '' || v === undefined ? ''
        : typeof v === 'number' ? (Number.isFinite(v) ? `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>` : '')
          : `<c r="${colName(ci)}${ri + 1}" t="s"><v>${si(v)}</v></c>`)).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join('');
    const cols = sh.widths?.length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
  });
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheetXml.forEach((x, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(x); });
  files['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map(v => `<si><t xml:space="preserve">${esc(v)}</t></si>`).join('')}</sst>`);
  return zipSync(files, { level: 6 });
}

/** Indice di colonna da un riferimento di cella: "C12" → 2 */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Legge un file .xlsx: restituisce i fogli come righe di testo (valori, non formule) */
export function readXlsx(data: Uint8Array): Sheet[] {
  const files = unzipSync(data);
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const xml = (path: string) => new DOMParser().parseFromString(text(path), 'application/xml');
  const byTag = (d: Document | Element, tag: string) => Array.from(d.getElementsByTagName('*')).filter(e => e.localName === tag);
  const shared = byTag(xml('xl/sharedStrings.xml'), 'si').map(si => byTag(si, 't').map(t => t.textContent ?? '').join(''));
  const rels = new Map(byTag(xml('xl/_rels/workbook.xml.rels'), 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  return byTag(xml('xl/workbook.xml'), 'sheet').map(sh => {
    const rid = sh.getAttribute('r:id') ?? sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = rels.get(rid) ?? '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows: string[][] = [];
    for (const row of byTag(xml(target), 'row')) {
      const r: string[] = [];
      for (const c of byTag(row, 'c')) {
        const t = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent ?? '';
        const value = t === 's' ? shared[parseInt(v, 10)] ?? '' : t === 'inlineStr' ? byTag(c, 't').map(x => x.textContent ?? '').join('') : v;
        r[colIndex(c.getAttribute('r') ?? 'A')] = value;
      }
      rows.push(Array.from(r, x => x ?? ''));
    }
    return { name: sh.getAttribute('name') ?? '', rows };
  });
}
