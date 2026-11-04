// Lettura e scrittura dei dati articolo nel formato XML di EPLAN (<partsmanagement>),
// lo stesso contenuto nei pacchetti EDZ dell'Eplan Data Portal.
import type { Part, FunctionTemplate } from '../model/types';

/** I testi multilingua EPLAN hanno la forma "it_IT@Testo;en_US@Text;" */
export function pickLanguage(v: string | undefined | null, prefer = ['it_IT', 'en_US', 'de_DE', '??_??']): string {
  if (!v) return '';
  if (!/^[a-z?]{2}_[A-Z?]{2}@/.test(v)) return v;
  const map = new Map<string, string>();
  for (const chunk of v.split(/;(?=[a-z?]{2}_[A-Z?]{2}@)|;$/)) {
    const m = /^([a-z?]{2}_[A-Z?]{2})@([\s\S]*)$/.exec(chunk);
    if (m) map.set(m[1], m[2]);
  }
  for (const l of prefer) if (map.get(l)) return map.get(l)!;
  return map.values().next().value ?? '';
}

const num = (v?: string) => {
  if (!v) return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? undefined : n;
};

/** Separatori usati da EPLAN per le liste di punti di connessione */
export function splitConnections(v: string): string[] {
  return v.split(/[¶|;\n]/).map(s => s.trim()).filter(Boolean);
}

/** Elementi figli (childNodes invece di children: lo leggono anche i parser XML leggeri di Node) */
const elems = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);

function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) out[a.name] = a.value;
  // Alcuni esportatori scrivono le proprietà come elementi figli
  for (const c of elems(el)) {
    if (/^P_ARTICLE_/i.test(c.tagName) && !out[c.tagName]) out[c.tagName] = c.textContent ?? '';
    if (/^property$/i.test(c.tagName)) {
      const n = c.getAttribute('name') ?? c.getAttribute('id');
      if (n && /^P_ARTICLE_/i.test(n)) out[n] = c.getAttribute('value') ?? c.textContent ?? '';
    }
  }
  return out;
}

function readFunctionTemplates(partEl: Element): FunctionTemplate[] {
  const out: FunctionTemplate[] = [];
  const els = Array.from(partEl.getElementsByTagName('*')).filter(e => /^functiontemplate$/i.test(e.localName));
  els.forEach((el, i) => {
    const a = attrsOf(el);
    const key = Object.keys(a).find(k => /connection.?designation|anschlussbezeichnung|CONNECTIONPOINTDESIGNATION/i.test(k));
    // Descrizione della funzione; in mancanza quella del punto di connessione (es. Pizzato: "+24Vdc", "DI")
    const descrKey = Object.keys(a).find(k => /^(description|P_FUNCTIONTEMPLATE_DESCRIPTION|functiondescription)$/i.test(k))
      ?? Object.keys(a).find(k => /^connection.?description$/i.test(k));
    out.push({
      pos: num(a.pos) ?? i + 1,
      description: pickLanguage(descrKey ? a[descrKey] : ''),
      connections: key ? splitConnections(a[key]) : [],
      category: [a.functiondefcategory, a.functiondefgroup, a.functiondefid].filter(Boolean).join('.') || undefined,
      ...(num(a.terminalfunction) ? { terminalFunction: num(a.terminalfunction) } : {}),
    });
  });
  return out;
}

export interface ParseResult {
  parts: Part[];
  warnings: string[];
}

export function parsePartsXml(xml: string, source = ''): ParseResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    return { parts: [], warnings: [`${source}: XML non valido`] };
  }
  const partEls = Array.from(doc.getElementsByTagName('*')).filter(e => /^part$/i.test(e.localName));
  const parts: Part[] = [];
  for (const el of partEls) {
    const a = attrsOf(el);
    // Gli attributi della prima variante integrano quelli del part
    const variant = elems(el).find(c => /^variant$/i.test(c.localName));
    const all = { ...(variant ? attrsOf(variant) : {}), ...a };
    const g = (k: string) => {
      const key = Object.keys(all).find(x => x.toUpperCase() === k);
      return key ? pickLanguage(all[key]) : '';
    };
    const partNr = g('P_ARTICLE_PARTNR');
    if (!partNr) { warnings.push(`${source}: articolo senza P_ARTICLE_PARTNR ignorato`); continue; }
    parts.push({
      partNr,
      typeNr: g('P_ARTICLE_TYPENR') || undefined,
      orderNr: g('P_ARTICLE_ORDERNR') || undefined,
      manufacturer: g('P_ARTICLE_MANUFACTURER') || undefined,
      supplier: g('P_ARTICLE_SUPPLIER') || undefined,
      descr1: g('P_ARTICLE_DESCR1') || undefined,
      descr2: g('P_ARTICLE_DESCR2') || undefined,
      productGroup: [g('P_ARTICLE_PRODUCTTOPGROUP'), g('P_ARTICLE_PRODUCTGROUP'), g('P_ARTICLE_PRODUCTSUBGROUP')].filter(Boolean).join(' / ') || undefined,
      width: num(g('P_ARTICLE_WIDTH')),
      height: num(g('P_ARTICLE_HEIGHT')),
      depth: num(g('P_ARTICLE_DEPTH')),
      weight: num(g('P_ARTICLE_WEIGHT')),
      price: num(g('P_ARTICLE_SALESPRICE_1') || g('P_ARTICLE_PURCHASEPRICE_1')),
      note: g('P_ARTICLE_NOTE') || undefined,
      macro: g('P_ARTICLE_MACRO') || undefined,
      functionTemplates: readFunctionTemplates(el),
      attrs: all,
      source,
    });
  }
  return { parts, warnings };
}

/** Percorso dell'immagine indicata nell'articolo, es. "$(MD_IMG)\Siemens\3RT2015.jpg" */
export function pictureRef(part: Part): string | undefined {
  const k = Object.keys(part.attrs).find(x => /^P_ARTICLE_PICTUREFILE$/i.test(x));
  return k ? part.attrs[k] : undefined;
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Esporta gli articoli in un XML importabile in EPLAN (Gestione articoli ▸ Extra ▸ Importa ▸ XML) */
export function exportPartsXml(parts: Part[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<partsmanagement>'];
  for (const p of parts) {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.attrs)) if (/^P_ARTICLE_/i.test(k)) attrs[k.toUpperCase()] = v;
    const set = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== '') attrs[k] = String(v).replace('.', ','); };
    attrs.P_ARTICLE_PARTNR = p.partNr;
    attrs.P_ARTICLE_PARTTYPE ??= '1';
    set('P_ARTICLE_TYPENR', p.typeNr); set('P_ARTICLE_ORDERNR', p.orderNr);
    set('P_ARTICLE_MANUFACTURER', p.manufacturer); set('P_ARTICLE_SUPPLIER', p.supplier);
    if (p.descr1) attrs.P_ARTICLE_DESCR1 = p.descr1;
    if (p.descr2) attrs.P_ARTICLE_DESCR2 = p.descr2;
    if (p.note) attrs.P_ARTICLE_NOTE = p.note;
    set('P_ARTICLE_WIDTH', p.width); set('P_ARTICLE_HEIGHT', p.height); set('P_ARTICLE_DEPTH', p.depth); set('P_ARTICLE_WEIGHT', p.weight);
    const head = Object.entries(attrs).map(([k, v]) => `${k}="${xmlEsc(v)}"`).join('\n        ');
    lines.push(`  <part ${head}>`);
    lines.push('    <variant>');
    for (const ft of p.functionTemplates) {
      lines.push(`      <functiontemplate pos="${ft.pos}" description="${xmlEsc(ft.description)}" connectiondesignation="${xmlEsc(ft.connections.join('¶'))}"/>`);
    }
    lines.push('    </variant>', '  </part>');
  }
  lines.push('</partsmanagement>', '');
  return lines.join('\n');
}
