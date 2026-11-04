// Proprietà definite dall'utente, come in EPLAN («Configura proprietà»): definizioni salvate nel
// progetto e valori su dispositivi (funzioni), pagine, collegamenti, progetto e articoli. Import ed
// export in XML. Il formato esatto del file di EPLAN non è pubblico: la lettura è tollerante (nomi
// degli attributi o degli elementi in inglese, tedesco o italiano, testi multilingua "it_IT@…;") e
// la scrittura usa gli stessi nomi che legge.
import type { UserPropAssign, UserPropDef, UserPropType } from './types';
import { tn } from '../i18n/ui';

export const USER_PROP_ASSIGN: { id: UserPropAssign; name: string; eplan: string }[] = [
  { id: 'function', name: tn('Dispositivo (funzione)'), eplan: 'Function' },
  { id: 'page', name: tn('Pagina'), eplan: 'Page' },
  { id: 'project', name: tn('Progetto'), eplan: 'Project' },
  { id: 'connection', name: tn('Collegamento'), eplan: 'Connection' },
  { id: 'part', name: tn('Articolo'), eplan: 'Part' },
];

export const USER_PROP_TYPES: { id: UserPropType; name: string; eplan: string }[] = [
  { id: 'text', name: tn('Testo'), eplan: 'Text' },
  { id: 'multilang', name: tn('Testo multilingua'), eplan: 'MultilingualText' },
  { id: 'int', name: tn('Numero intero'), eplan: 'Integer' },
  { id: 'number', name: tn('Numero decimale'), eplan: 'Double' },
  { id: 'bool', name: tn('Sì / no'), eplan: 'Bool' },
  { id: 'unit', name: tn('Valore con unità'), eplan: 'ValueWithUnit' },
];

/** Errore del nome identificativo (come in EPLAN), undefined se va bene */
export function userPropIdError(id: string): string | undefined {
  if (!id) return tn('Manca il nome identificativo');
  if (!/^[A-Za-z0-9.\-_&]+$/.test(id)) return tn('Solo lettere, cifre e . - _ &');
  if (!id.includes('.') || id.startsWith('.') || id.endsWith('.')) return tn('Serve almeno un punto, non all\'inizio né alla fine (es. Ditta.Commessa)');
  if (/^eplan/i.test(id)) return tn('Non può iniziare con «EPLAN»');
  return undefined;
}

/** Definizioni in uso per un tipo di oggetto, in ordine di categoria e nome */
export function activeDefs(defs: UserPropDef[] | undefined, assign: UserPropAssign): UserPropDef[] {
  return (defs ?? []).filter(d => d.assign === assign && !d.obsolete)
    .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
}

/** Testo multilingua di EPLAN ("it_IT@Commessa;en_US@Order;") nella lingua indicata, o il primo */
export function mlText(s: string | undefined | null, lang = 'it'): string {
  if (!s) return '';
  if (!/^[a-z?]{2}_[A-Z?]{2}@/.test(s)) return s;
  const parts = s.split(/;(?=[a-z?]{2}_[A-Z?]{2}@)|;$/).filter(Boolean).map(x => { const i = x.indexOf('@'); return [x.slice(0, i), x.slice(i + 1)] as const; });
  return (parts.find(([l]) => l.startsWith(lang)) ?? parts.find(([l]) => l.startsWith('en')) ?? parts[0])?.[1]?.replace(/;$/, '') ?? '';
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Valore di un campo: attributo o elemento figlio, con uno dei nomi indicati (maiuscole e _ ignorati) */
function field(el: Element, keys: string[]): string | undefined {
  const want = keys.map(norm);
  for (const a of Array.from(el.attributes)) if (want.includes(norm(a.name))) return a.value;
  for (const c of Array.from(el.children)) if (want.includes(norm(c.localName))) return c.getAttribute('value') ?? c.textContent ?? '';
  return undefined;
}

const ID_KEYS = ['IdentifyingName', 'IdentName', 'Identifier', 'Ident', 'InternalName', 'PropertyName', 'Kennung', 'Identifikationsname', 'NomeIdentificativo', 'Name', 'Id', 'Key'];
const NAME_KEYS = ['DisplayName', 'DisplayedName', 'Displayname', 'Anzeigename', 'NomeVisualizzato', 'Caption', 'Label', 'Text'];
const DESCR_KEYS = ['Description', 'Beschreibung', 'Descrizione', 'Tooltip', 'Comment'];
const ASSIGN_KEYS = ['Assignment', 'Assign', 'Zuordnung', 'Assegnazione', 'Owner', 'OwnerType', 'Object', 'ObjectType', 'Objekttyp'];
const TYPE_KEYS = ['FieldType', 'Feldtyp', 'TipoCampo', 'DataType', 'Type', 'Format'];
const UNIT_KEYS = ['Unit', 'Einheit', 'Unita', 'Dimension'];
const CAT_KEYS = ['Category', 'Kategorie', 'Categoria', 'Group'];
const INPUT_KEYS = ['InputAid', 'InputHelp', 'Eingabehilfe', 'AiutoInserimento', 'Input'];
const LIST_KEYS = ['SelectionList', 'DefaultValues', 'Values', 'Auswahlliste', 'ElencoValori'];
const OBSOLETE_KEYS = ['DoNotUseAnymore', 'NotUsedAnymore', 'Obsolete', 'Deprecated', 'NichtMehrVerwenden', 'NonUtilizzarePiu'];

function mapAssign(v = ''): UserPropAssign {
  const s = norm(v);
  if (/^(project|projekt|progetto)/.test(s)) return 'project';
  if (/^(page|seite|pagina)/.test(s)) return 'page';
  if (/^(connection|verbindung|collegamento)/.test(s)) return 'connection';
  if (/^(part|artikel|articolo)$/.test(s) || s === 'parts' || s === 'partsdatabase') return 'part';
  // Funzione, riferimento articolo, punto di interruzione…: il dispositivo
  return 'function';
}

function mapType(v = ''): UserPropType {
  const s = norm(v);
  if (/bool|janein|sino/.test(s)) return 'bool';
  if (/unit|einheit|unita/.test(s)) return 'unit';
  if (/multi|mehrsprach|multilingu/.test(s)) return 'multilang';
  if (/int|ganzzahl|intero/.test(s)) return 'int';
  if (/decimal|double|real|float|number|dezimal|decimale/.test(s)) return 'number';
  return 'text';
}

function mapInput(v = ''): UserPropDef['input'] {
  const s = norm(v);
  if (!s || /^free(input)?$|^frei(e)?(eingabe)?$|^libero$/.test(s)) return undefined;
  if (/free|frei|libero/.test(s)) return 'free+list';
  return 'list';
}

const truthy = (v?: string) => !!v && /^(1|true|yes|ja|si|sì|on)$/i.test(v.trim());

/** Valori dell'elenco di scelta: elementi figli (Value, Entry, Item…) o un attributo con «;» o «|» */
function choicesOf(el: Element, lang: string): string[] {
  const out: string[] = [];
  const listEl = Array.from(el.children).find(c => LIST_KEYS.map(norm).includes(norm(c.localName)));
  const holders = listEl ? [listEl] : [el];
  for (const h of holders) for (const c of Array.from(h.children)) {
    if (!/value|entry|item|eintrag|wert|valore|selection/i.test(c.localName) || c === listEl) continue;
    const v = mlText(c.getAttribute('value') ?? c.getAttribute('Value') ?? c.textContent ?? '', lang).trim();
    if (v) out.push(v);
  }
  if (!out.length) {
    const flat = Array.from(el.attributes).find(a => LIST_KEYS.map(norm).includes(norm(a.name)))?.value;
    if (flat) out.push(...flat.split(/[|\n]|;(?![a-z?]{2}_[A-Z?]{2}@)/).map(x => mlText(x, lang).trim()).filter(Boolean));
  }
  return [...new Set(out)];
}

/**
 * Definizioni lette da un XML di proprietà definite dall'utente. Si prendono gli elementi con un
 * nome identificativo valido (con il punto); quelli senza vengono contati negli avvisi.
 */
export function parseUserPropsXml(xml: string, lang = 'it'): { defs: UserPropDef[]; skipped: number; error?: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { defs: [], skipped: 0, error: tn('Il file non è un XML valido') };
  const defs: UserPropDef[] = [];
  let skipped = 0;
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    // Elementi che descrivono una proprietà: nome che ricorda una proprietà, o con un nome identificativo
    const looks = /propert|eigenschaft|propriet|userdef|udp/i.test(el.localName);
    const id = field(el, ID_KEYS)?.trim();
    if (!looks && !(id && field(el, TYPE_KEYS) !== undefined)) continue;
    if (!id) continue;
    if (userPropIdError(id)) { if (looks) skipped++; continue; }
    if (defs.some(d => d.id === id)) continue;
    const choices = choicesOf(el, lang);
    const def: UserPropDef = {
      id,
      name: mlText(field(el, NAME_KEYS), lang) || id.split('.').pop()!,
      assign: mapAssign(field(el, ASSIGN_KEYS)),
      type: mapType(field(el, TYPE_KEYS)),
    };
    const descr = mlText(field(el, DESCR_KEYS), lang);
    if (descr) def.description = descr;
    const unit = field(el, UNIT_KEYS);
    if (unit) def.unit = unit;
    const cat = mlText(field(el, CAT_KEYS), lang);
    if (cat) def.category = cat;
    if (choices.length) def.choices = choices;
    const input = mapInput(field(el, INPUT_KEYS)) ?? (choices.length ? 'free+list' : undefined);
    if (input) def.input = input;
    if (truthy(field(el, OBSOLETE_KEYS))) def.obsolete = true;
    defs.push(def);
  }
  return { defs, skipped };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ml = (s: string, lang: string) => `${lang === 'it' ? 'it_IT' : lang === 'en' ? 'en_US' : `${lang}_${lang.toUpperCase()}`}@${s};`;

/** XML delle definizioni (quelle «non utilizzare più» restano fuori, come in EPLAN) */
export function userPropsToXml(defs: UserPropDef[], lang = 'it'): string {
  const rows = defs.filter(d => !d.obsolete).map(d => {
    const attrs = [
      `IdentifyingName="${esc(d.id)}"`,
      `DisplayName="${esc(ml(d.name, lang))}"`,
      d.description ? `Description="${esc(ml(d.description, lang))}"` : '',
      `Assignment="${USER_PROP_ASSIGN.find(a => a.id === d.assign)?.eplan ?? 'Function'}"`,
      `FieldType="${USER_PROP_TYPES.find(t => t.id === d.type)?.eplan ?? 'Text'}"`,
      d.unit ? `Unit="${esc(d.unit)}"` : '',
      d.category ? `Category="${esc(d.category)}"` : '',
      `InputAid="${d.input === 'list' ? 'SelectionList' : d.input === 'free+list' ? 'FreeInputWithSelectionList' : 'FreeInput'}"`,
    ].filter(Boolean).join(' ');
    const list = d.choices?.length
      ? `\n    <SelectionList>\n${d.choices.map(c => `      <Value>${esc(ml(c, lang))}</Value>`).join('\n')}\n    </SelectionList>\n  `
      : '';
    return list ? `  <UserDefinedProperty ${attrs}>${list}</UserDefinedProperty>` : `  <UserDefinedProperty ${attrs} />`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<UserDefinedProperties source="OpenWiring">\n${rows.join('\n')}\n</UserDefinedProperties>\n`;
}

/** Unisce le definizioni importate a quelle del progetto: quelle con lo stesso nome identificativo si aggiornano */
export function mergeDefs(cur: UserPropDef[] = [], add: UserPropDef[]): { defs: UserPropDef[]; added: number; updated: number } {
  const out = [...cur];
  let added = 0, updated = 0;
  for (const d of add) {
    const i = out.findIndex(x => x.id === d.id);
    if (i >= 0) { out[i] = d; updated++; } else { out.push(d); added++; }
  }
  return { defs: out, added, updated };
}

/** Testo del valore per liste e cartigli (sì/no, unità) */
export function formatUserValue(d: UserPropDef, v: string | undefined): string {
  if (v === undefined || v === '') return '';
  if (d.type === 'bool') return truthy(v) ? tn('sì') : tn('no');
  if (d.type === 'unit' && d.unit && !v.includes(d.unit)) return `${v} ${d.unit}`;
  return v;
}
