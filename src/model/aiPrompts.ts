// Istruzioni per gli assistenti IA integrati: contesto del progetto (pagine nel formato testo,
// guida e catalogo dei simboli, controlli), estrazione delle pagine dalla risposta e
// traduzione del dizionario.
import type { Project, SymbolDef, Part, Lang } from './types';
import { agentGuide } from './agentGuide';
import { tn, uiLang, UI_LANG_NAME_IT } from '../i18n/ui';
import { pagesToText } from './textFormat';
import { checkProject, acceptedOf } from './checks';
import { LANGS } from './i18n';
// Il manuale (docs/manuale/<lingua>), capitolo per capitolo: base delle risposte sull'uso del
// programma, nella lingua dell'interfaccia (se il manuale in quella lingua manca, quello italiano)
const chapters = import.meta.glob('../../docs/manuale/*/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
function manualText(): string {
  const pick = (l: string) => Object.keys(chapters).filter(k => k.includes(`/manuale/${l}/`)).sort();
  const keys = pick(uiLang()).length ? pick(uiLang()) : pick('it');
  return keys.map(k => chapters[k].replace(/!\[[^\]]*\]\([^)]*\)\n?/g, '')).join('\n\n---\n\n');
}

/** Cosa vede l'assistente: la pagina corrente, tutte le pagine o solo il manuale del programma */
export type AiScope = 'page' | 'all' | 'manual';

export interface AiContext {
  project: Project;
  scope: AiScope;
  pageId: string;
  librarySymbols?: SymbolDef[];
  library?: Part[];
}

const base = () => `Sei l'assistente integrato in OpenWiring, un CAD open source per schemi elettrici multifilari.
Rispondi sempre in ${UI_LANG_NAME_IT[uiLang()]}, con l'ortografia corretta, in modo breve e concreto, da progettista elettrico.
Conosci le norme CEI EN 60204-1, IEC 81346, IEC 60617, EN 50005 e le convenzioni di EPLAN.`;

const EDIT_RULES = `Quando l'utente ti chiede di modificare, aggiungere o disegnare qualcosa:
- rispondi con le pagine complete che cambi o aggiungi, nel formato testo di OpenWiring, in un unico blocco di codice \`\`\`ecad;
- una pagina con lo stesso numero sostituisce quella esistente: riscrivila per intero, anche le parti che non cambi;
- usa solo i simboli del catalogo; coordinate sulla griglia di 4 mm, dentro l'area di disegno;
- ruota i simboli solo nelle rotazioni ammesse dal catalogo (rot 0/90…) e non specchiare quelli non specchiabili;
- posizione e orientamento dei testi dei simboli li decide l'editor dei simboli: non spostare i simboli per sistemare i testi;
- per i collegamenti nuovi puoi usare "collega <sigla:punto> <sigla:punto>";
- non cambiare sigle e numeri filo esistenti se non te lo chiedono;
- prima del blocco spiega in una o due frasi cosa hai fatto.
OpenWiring controlla il testo, mostra all'utente errori e problemi e lo applica solo se l'utente conferma.
Se ricevi errori di importazione, correggi e rimanda solo le pagine interessate.
Se la richiesta è una domanda, rispondi senza blocco di codice.`;

/** Istruzioni di sistema con il contesto scelto */
export function assistantSystem(c: AiContext): string {
  const { project } = c;
  const pages = project.pages.map(p => `${p.name} ${p.title}${p.type !== 'multiline' ? ` (${p.type})` : ''}`).join(' · ');
  const head = `${base()}\n\nProgetto aperto: «${project.info.name || 'senza nome'}»${project.info.description ? ` — ${project.info.description}` : ''}, ${project.pages.length} pagine: ${pages}`;
  if (c.scope === 'manual') {
    return `${head}\n\nL'utente ha domande sull'uso del programma. Rispondi con i nomi esatti di menu e comandi presi dal manuale qui sotto; se una funzione non c'è, dillo.\n\n<manuale>\n${manualText()}\n</manuale>`;
  }
  const page = project.pages.find(p => p.id === c.pageId);
  const text = pagesToText(project, { pageIds: c.scope === 'page' ? [c.pageId] : undefined, catalog: false, librarySymbols: c.librarySymbols, projectData: c.scope === 'all' });
  const issues = checkProject(project, c.library).filter(i => i.level !== 'info' && !acceptedOf(project, i) && (c.scope === 'all' || i.pageId === c.pageId));
  const checks = issues.length
    ? issues.slice(0, 60).map(i => `- [${i.level === 'error' ? 'errore' : 'avviso'}] ${i.loc ? `/${i.loc} ` : ''}${i.kind}: ${i.msg}`).join('\n') + (issues.length > 60 ? `\n- … altri ${issues.length - 60}` : '')
    : 'nessun problema';
  return `${head}

${EDIT_RULES}

<guida>
${agentGuide(project, c.librarySymbols)}
</guida>

<pagine ambito="${c.scope === 'page' ? `pagina corrente ${page?.name ?? ''}` : 'tutto il progetto'}">
${text}
</pagine>

<controlli>
${checks}
</controlli>`;
}

/** Pagine nel formato testo contenute nei blocchi di codice della risposta, se ci sono */
export function extractPagesText(answer: string): string | undefined {
  const blocks = [...answer.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map(m => m[1]);
  const pages = blocks.filter(b => /^\s*(pagina|progetto|luogo|cavo|simbolodef|scheda)\s/m.test(b));
  return pages.length ? pages.join('\n\n').trim() : undefined;
}

/** Messaggio per far correggere all'assistente gli errori di importazione */
export function fixRequest(errors: { line: number; msg: string }[], warnings: { line: number; msg: string }[], problems: string[]): string {
  const list = (xs: { line: number; msg: string }[]) => xs.map(e => `- ${e.line ? `riga ${e.line}: ` : ''}${e.msg}`).join('\n');
  return [
    'OpenWiring ha controllato il testo che hai mandato.',
    errors.length ? `Errori (il testo non si può applicare):\n${list(errors)}` : '',
    warnings.length ? `Avvisi:\n${list(warnings)}` : '',
    problems.length ? `Problemi della verifica dopo l'applicazione:\n${problems.map(p => `- ${p}`).join('\n')}` : '',
    'Correggi e rimanda le pagine interessate, complete, in un unico blocco ```ecad.',
  ].filter(Boolean).join('\n\n');
}

export const PRESETS: { label: string; scope?: AiScope; text: string }[] = [
  { label: tn('Controlla la pagina'), scope: 'page', text: tn('Controlla questa pagina come farebbe un progettista esperto: collegamenti, sigle, numerazione dei contatti, sezioni, protezioni, norme CEI EN 60204-1. Elenca i problemi con sigla e colonna, poi i miglioramenti consigliati. Non modificare niente.') },
  { label: tn('Spiega lo schema'), scope: 'page', text: tn('Spiega in poche righe come funziona il circuito di questa pagina.') },
  { label: tn('Avviamento motore'), scope: 'page', text: tn('Aggiungi una pagina nuova con un avviamento diretto per un motore trifase da 4 kW: sezionatore, salvamotore, contattore, morsettiera e motore, più il comando marcia/arresto a 24 V con autoritenuta e lampada di marcia.') },
  { label: tn('Come si fa…'), scope: 'manual', text: tn('Come si crea una morsettiera con ponticelli e la sua pagina di schema?') },
];

// ---- Traduzione del dizionario --------------------------------------------------------------

export interface TranslateItem { text: string; langs: Exclude<Lang, 'it'>[] }

export function translateSystem(): string {
  return `Sei un traduttore tecnico specializzato in schemi elettrici e automazione industriale.
Traduci dall'italiano i testi di uno schema elettrico (titoli di pagina, descrizioni di dispositivi, commenti PLC, nomi di quadri).
Usa la terminologia di settore (IEC 60050) e lo stile breve degli schemi: niente articoli superflui, maiuscola iniziale come l'originale.
Lascia invariati sigle, codici, numeri, unità di misura e nomi propri (es. -2K1, 24 V DC, Profinet).
Rispondi solo con un oggetto JSON: { "<testo italiano>": { "en": "...", "de": "..." }, ... } con le sole lingue richieste.`;
}

export function translatePrompt(items: TranslateItem[]): string {
  const names = Object.fromEntries(LANGS.map(l => [l.id, l.name]));
  const langs = [...new Set(items.flatMap(i => i.langs))].map(l => `${l} = ${names[l]}`).join(', ');
  return `Lingue: ${langs}.\nTesti da tradurre (con le lingue richieste per ciascuno):\n${JSON.stringify(Object.fromEntries(items.map(i => [i.text, i.langs])), null, 1)}`;
}

/** Legge il JSON della risposta (anche dentro un blocco di codice o con testo intorno) */
export function parseTranslations(answer: string): Record<string, Partial<Record<Lang, string>>> {
  const block = /```(?:json)?\s*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer;
  const start = block.indexOf('{'), end = block.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('La risposta non contiene un oggetto JSON');
  const data = JSON.parse(block.slice(start, end + 1)) as Record<string, Record<string, unknown>>;
  const out: Record<string, Partial<Record<Lang, string>>> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!v || typeof v !== 'object') continue;
    const t: Partial<Record<Lang, string>> = {};
    for (const l of ['en', 'de'] as const) if (typeof v[l] === 'string' && (v[l] as string).trim()) t[l] = (v[l] as string).trim();
    if (Object.keys(t).length) out[k] = t;
  }
  return out;
}
