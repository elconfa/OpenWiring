// Controlli di progetto (come la «Verifica» di EPLAN): sigle, contatti, rimandi,
// fili aperti, morsetti, PLC. Ogni problema porta alla posizione nello schema.
import { pairRepresentations } from './pairs';
import { projectionSource } from './projection';
import { bundleTaps, type BundleTap } from './bundles';
import type { Project, Part, Wire, FunctionTemplate, Pt } from './types';
import { columnOf, FRAME, PAGE_W, PAGE_H } from './types';
import { distSlots } from './distributors';
import { computeNetlist, withNetlistCache, type Net } from './netlist';
import { getSymbol, instanceBounds } from './geometry';
import { buildDevices, allPlaced, locationOf, partsIndex, deviceInfo, type PlacedElement } from './devices';
import { allowedRots } from './rotations';
import { nextTagFor } from './numbering';
import { linkPartners, isIncomingLink, NO_PARTNER } from './links';
import { isBundle } from './bundles';
import { pinsWorld, samePt, onSegmentInterior } from './geometry';
import { plcProblems, hardwareProblems, cardDevice } from './plc';
import { allStrips, stripRows } from './terminals';
import { cableInfos, differsFromPart } from './cables';
import { cableStyleOf, shieldDims, shieldGeometry } from './cableStyle';
import { connectorProblems } from './connectors';
import { layoutProblems } from './layout';
import { networkProblems, locationProblems, ipProblems, busCableGroups, busCableRows, foreignDevices } from './network';
import { tx } from '../i18n/ui';

/** Chiave stabile di una segnalazione, per ricordare quelle verificate e accettate */
export const issueKey = (i: Issue) => `${i.kind}|${i.elementId ?? ''}|${i.msg}`;

/** Segnalazione accettata dall'utente (verificata, non è un errore), con il motivo */
export const acceptedOf = (p: Project, i: Issue) => p.acceptedIssues?.[issueKey(i)];

export interface Issue {
  /** error: da correggere; warn: probabile errore; info: dati inutilizzati o da riordinare */
  level: 'error' | 'warn' | 'info';
  /** Categoria breve, es. "Sigle" */
  kind: string;
  msg: string;
  pageId?: string;
  elementId?: string;
  loc?: string;
  /** Correzione proposta, da applicare con un clic (applyFix) */
  fix?: IssueFix;
}

/** Correzioni che i controlli sanno proporre */
export type IssueFix = { label: string } & (
  | { kind: 'assignTag'; pageId: string; id: string; tag: string }
  | { kind: 'renameLink'; pageId: string; id: string; tag: string }
  | { kind: 'linkStar'; pageId: string; id: string }
  | { kind: 'splitWire'; pageId: string; wireIds: string[] }
  | { kind: 'renumberWires'; wireIds: string[] }
  | { kind: 'deleteElement'; pageId: string; id: string }
  | { kind: 'deletePage'; pageId: string }
  | { kind: 'allowRot'; symbolId: string; rot: 0 | 90 | 180 | 270 }
  | { kind: 'fitRot'; pageId: string; id: string }
  | { kind: 'cableFromPart'; cableId: string }
  | { kind: 'clearCardOrder'; cardId: string }
  | { kind: 'busCableTag'; wireIds: string[]; tag: string }
);

/**
 * Estremo libero ammesso: fine di una barra di potenziale (filo con nome di potenziale o
 * rimando) che arriva al bordo dell'area di disegno.
 */
export function isRailEnd(p: Pt, net?: Net): boolean {
  if (!net?.named && !net?.potentials?.length && !net?.links?.length) return false;
  return p.x >= FRAME.right - 16 || p.x <= FRAME.left + 16;
}

const at = (e: PlacedElement) => ({ pageId: e.page.id, elementId: e.inst.id, loc: locationOf(e) });

/** Tipo di contatto ausiliario di una funzione dell'articolo: 13-14 → NA, 11-12 / 21-22 → NC */
export function contactKind(ft: FunctionTemplate): 'NO' | 'NC' | 'CO' | undefined {
  const c = ft.connections;
  const d = (s: string) => (/^\d\d$/.test(s) ? s[1] : '');
  if (c.length === 3 && c.every(x => /^\d\d$/.test(x)) && ['1', '2', '4'].every(k => c.some(x => d(x) === k))) return 'CO';
  if (c.length !== 2) return undefined;
  const k = c.map(d).sort().join('');
  if (k === '34' || k === '78') return 'NO';
  if (k === '12' || k === '56') return 'NC';
  const cat = `${ft.category ?? ''} ${ft.description}`.toLowerCase();
  if (/\bna\b|normalmente aperto|schließer|no contact|make/.test(cat)) return 'NO';
  if (/\bnc\b|normalmente chiuso|öffner|break/.test(cat)) return 'NC';
  return undefined;
}

export function checkProject(project: Project, library: Part[] = []): Issue[] {
  return withNetlistCache(project, () => checkProjectNow(project, library));
}

function checkProjectNow(project: Project, library: Part[]): Issue[] {
  const out: Issue[] = [];
  const parts = partsIndex(project, library);
  const placed = allPlaced(project);
  const nl = computeNetlist(project);
  const cardTags = new Set(project.plc.cards.map(c => c.tag));

  // Dispositivi: sigle mancanti, doppie, contatti senza bobina, contatti oltre l'articolo
  let pdfGraphics = 0;
  // Sigle proposte per i simboli senza sigla (diverse tra loro)
  const newTags: string[] = [];
  for (const e of placed) {
    if (!['main', 'single', 'aux'].includes(e.sym.role) || e.inst.tag.trim()) continue;
    // Grafica importata da PDF non riconosciuta come componente: un solo avviso riassuntivo
    if (e.sym.source === 'Import PDF') { pdfGraphics++; continue; }
    const tag = e.sym.letter && e.sym.role !== 'aux' ? nextTagFor(project, e.sym.letter, e.page, e.inst.x, newTags) : '';
    if (tag) newTags.push(tag);
    out.push({ level: 'error', kind: tx('Sigle'), msg: tx('{0} senza sigla', e.sym.name), ...at(e), fix: tag ? { label: tx('Assegna -{0}', tag), kind: 'assignTag', pageId: e.page.id, id: e.inst.id, tag } : undefined });
  }
  if (pdfGraphics) out.push({ level: 'info', kind: tx('Sigle'), msg: tx('{0} elementi importati da PDF senza sigla (grafica non riconosciuta come componente: se serve, assegna la sigla o sostituiscili con un simbolo)', pdfGraphics) });
  for (const d of buildDevices(project).values()) {
    if (cardTags.has(d.tag) || d.elements.every(e => e.sym.role === 'terminal' || e.sym.role === 'plc')) continue;
    const mains = d.elements.filter(e => e.sym.role === 'main');
    const singles = d.elements.filter(e => e.sym.role === 'single');
    // Un dispositivo ha un solo simbolo principale (bobina o apparecchio), su qualunque pagina: gli altri
    // elementi con la stessa sigla sono contatti
    const primary = [...mains, ...singles].sort((a, b) => a.pageIndex - b.pageIndex || a.inst.x - b.inst.x);
    if (primary.length > 1) out.push({ level: 'error', kind: tx('Sigle'), msg: tx('-{0}: {1} simboli principali con la stessa sigla ({2}): ne può esistere uno solo, gli altri devono essere contatti o avere un\'altra sigla', d.tag, primary.length, primary.map(locationOf).join(', ')), ...at(primary[1]) });
    const aux = d.elements.filter(e => e.sym.role === 'aux');
    if (aux.length && !mains.length && !singles.length) {
      for (const a of aux) out.push({ level: 'error', kind: tx('Contatti'), msg: tx('-{0}: contatto senza bobina o dispositivo principale', d.tag), ...at(a) });
    }
    const info = deviceInfo(d.elements, d.main, parts);
    const fts = info.part?.functionTemplates ?? [];
    if (fts.length && aux.length) {
      for (const kind of ['NO', 'NC', 'CO'] as const) {
        const have = fts.filter(f => contactKind(f) === kind).length;
        const used = aux.filter(a => a.sym.contact === kind);
        if (used.length > have) {
          const name = { NO: 'NA', NC: 'NC', CO: 'in scambio' }[kind];
          out.push({ level: 'error', kind: tx('Contatti'), msg: tx('-{0}: usati {1} contatti {2}, l\'articolo {3} ne ha {4}', d.tag, used.length, name, info.partNr, have), ...at(used[used.length - 1]) });
        }
      }
    }
  }

  // Articoli usati che non sono né nel progetto né nella libreria: su un altro computer mancano i dati
  // per distinta e liste (codice di ordinazione, costruttore, descrizione)
  const devices = buildDevices(project);
  for (const [nr, where] of partRefs(project, devices)) {
    if (parts.has(nr)) continue;
    const pe = where.pageId ? project.pages.find(p => p.id === where.pageId) : undefined;
    out.push({ level: 'warn', kind: tx('Articoli'), msg: tx('Articolo {0} ({1}) non presente nel progetto né nella libreria: in distinta mancano i suoi dati', nr, where.what),
      ...(pe && where.elementId ? { pageId: pe.id, elementId: where.elementId } : {}) });
  }

  // Schede PLC con il dispositivo nello schema: valgono i dati d'ordinazione del dispositivo; quelli
  // rimasti nella scheda non si vedono nella vista PLC e non vanno in distinta
  for (const c of project.plc.cards) {
    const d = cardDevice(project, c, devices);
    if (!d) continue;
    const info = deviceInfo(d.elements, d.main, parts);
    const stale = ([['partNr', tx('articolo')], ['orderNr', tx('codice di ordinazione')], ['manufacturer', tx('costruttore')]] as const)
      .filter(([k]) => c[k]?.trim() && c[k]!.trim() !== (info[k] ?? '').trim())
      .map(([k, name]) => `${name} ${c[k]}`);
    if (!stale.length) continue;
    const el = d.main ?? d.elements[0];
    out.push({ level: 'info', kind: tx('PLC'), msg: tx('Scheda PLC -{0}: dati nascosti diversi da quelli del dispositivo nello schema ({1}); vale il dispositivo{2}', c.tag, stale.join(', '), info.partNr ? ` (${info.partNr})` : ''),
      ...at(el), fix: { label: tx('Togli i dati della scheda'), kind: 'clearCardOrder', cardId: c.id } });
  }

  // Dispositivi di un quadro disegnati nelle pagine di un altro: nel PDF del solo loro quadro non ci sono
  for (const f of foreignDevices(project)) {
    const pages = f.pages.map(x => x.name).join(', ');
    out.push({ level: 'warn', kind: tx('Luoghi'), msg: f.pages.length === 1
      ? tx('+{0}-{1} è disegnato nella pagina {2} del quadro +{3}: stampando solo +{0} non compare (dividi il circuito ai morsetti, oppure nel PDF aggiungi le pagine di altri quadri)', f.panel.code, f.tag, pages, f.pagePanel.code)
      : tx('+{0}-{1} è disegnato nelle pagine {2} del quadro +{3}: stampando solo +{0} non compare (dividi il circuito ai morsetti, oppure nel PDF aggiungi le pagine di altri quadri)', f.panel.code, f.tag, pages, f.pagePanel.code),
      ...at(f.el) });
  }

  // Ripartitori: somma delle sezioni su ogni uscita entro quella ammessa, gruppi non disegnati
  for (const sl of distSlots(project, nl)) {
    const w = sl.wires[0]?.wire, pg = w ? project.pages.find(p => p.elements.includes(w)) : undefined;
    const where = pg && w ? { pageId: pg.id, elementId: w.id } : {};
    if (sl.status === 'superata') out.push({ level: 'error', kind: tx('Ripartitori'), msg: tx('-{0} {1}: {2} fili per {3} mm², ammessi {4} mm²', sl.d.tag, sl.name, sl.wires.length, String(sl.total).replace('.', ','), String(sl.max).replace('.', ',')), ...where });
    if (sl.unknown) out.push({ level: 'warn', kind: tx('Ripartitori'), msg: tx('-{0} {1}: {2} fili senza sezione indicata', sl.d.tag, sl.name, sl.unknown), ...where });
  }
  for (const d of project.distributors ?? []) {
    const missing = d.groups.filter((_, gi) => !placed.some(e => e.inst.symbolId === `dist:${d.id}:${gi}`)).map(g => g.name);
    if (missing.length) out.push({ level: 'info', kind: tx('Ripartitori'), msg: tx('-{0}: gruppi non ancora sullo schema ({1})', d.tag, missing.join(', ')) });
  }

  // Dispositivi disegnati solo nell'unifilare
  for (const d of buildDevices(project).values()) {
    if (d.elements.every(e => e.sym.role === 'oneline')) out.push({ level: 'warn', kind: tx('Unifilare'), msg: tx('-{0}: presente solo nello schema unifilare', d.tag), ...at(d.elements[0]) });
  }

  // Pagine proiettate rimaste senza il riquadro di origine
  for (const pg of project.pages) if (pg.projection && !projectionSource(project, pg)) {
    out.push({ level: 'warn', kind: tx('Luoghi'), msg: tx('Pagina {0}: pagina proiettata di un riquadro che non c\'è più', pg.name), pageId: pg.id,
      fix: { label: tx('Elimina la pagina'), kind: 'deletePage', pageId: pg.id } });
  }
  // Rappresentazioni (riferimenti a coppie) il cui contatto vero non c'è più
  // e contatti con più di una rappresentazione (un contatto si rappresenta in un modo solo)
  const repOf = new Set<string>();
  for (const { rep, real } of pairRepresentations(project)) {
    if (!real) out.push({ level: 'warn', kind: tx('Riferimenti a coppie'), msg: tx('-{0}: rappresentazione di un contatto che non c\'è più', rep.inst.tag), ...at(rep),
      fix: { label: tx('Elimina la rappresentazione'), kind: 'deleteElement', pageId: rep.page.id, id: rep.inst.id } });
    else if (repOf.has(real.inst.id)) out.push({ level: 'warn', kind: tx('Riferimenti a coppie'), msg: tx('-{0}: il contatto ha già un\'altra rappresentazione', rep.inst.tag), ...at(rep),
      fix: { label: tx('Elimina la rappresentazione'), kind: 'deleteElement', pageId: rep.page.id, id: rep.inst.id } });
    else repOf.add(real.inst.id);
  }

  // Rimandi senza corrispondente
  const partners = linkPartners(project, placed);
  const allLinks = placed.filter(e => e.sym.role === 'link' && e.inst.tag);
  const unpaired = allLinks.filter(l => !partners.get(l.inst.id)?.length);
  const linkNet = new Map<string, Net>();
  for (const n of nl.nets) for (const id of n.linkIds ?? []) linkNet.set(id, n);
  for (const l of unpaired) {
    const tag = l.inst.tag!;
    // Nome uguale a meno delle maiuscole a un rimando libero di verso opposto: errore di battitura
    const twin = unpaired.find(o => o !== l && o.inst.tag !== tag && o.inst.tag!.toLowerCase() === tag.toLowerCase() && isIncomingLink(o.inst.symbolId) !== isIncomingLink(l.inst.symbolId));
    if (twin) {
      // La correzione solo sul secondo della coppia (in ordine di pagina), che prende il nome del primo
      const later = l.pageIndex > twin.pageIndex || (l.pageIndex === twin.pageIndex && l.inst.x > twin.inst.x);
      out.push({ level: 'error', kind: tx('Rimandi'), msg: tx('Rimando "{0}" senza corrispondente: c\'è "{1}" a /{2}, con le maiuscole diverse', tag, twin.inst.tag!, locationOf(twin)), ...at(l),
        fix: later ? { label: tx('Rinomina in "{0}"', twin.inst.tag!), kind: 'renameLink', pageId: l.page.id, id: l.inst.id, tag: twin.inst.tag! } : undefined });
      continue;
    }
    // Fine (o inizio) di una catena: lo stesso conduttore arriva già da un altro rimando abbinato con
    // lo stesso nome, la freccia indica solo che la barra prosegue ma non c'è altro da collegare
    const n = linkNet.get(l.inst.id);
    const chained = n?.linkIds?.some(id => id !== l.inst.id && partners.get(id)?.length && allLinks.find(o => o.inst.id === id)?.inst.tag === tag);
    if (chained) out.push({ level: 'info', kind: tx('Rimandi'), msg: tx('Rimando "{0}" in fondo alla catena: il conduttore non prosegue su altre pagine', tag), ...at(l) });
    else if (unpaired.some(o => o !== l && o.inst.tag === tag && isIncomingLink(o.inst.symbolId) === isIncomingLink(l.inst.symbolId))) {
      // Due partenze (o due arrivi) libere con lo stesso nome e nessun rimando dell'altro verso
      out.push({ level: 'warn', kind: tx('Rimandi'), msg: isIncomingLink(l.inst.symbolId)
        ? tx('Rimando "{0}" senza corrispondente: con questo nome ci sono solo arrivi liberi, forse uno dovrebbe essere una partenza', tag)
        : tx('Rimando "{0}" senza corrispondente: con questo nome ci sono solo partenze libere, forse una dovrebbe essere un arrivo', tag), ...at(l) });
    } else if (l.inst.linkTo === NO_PARTNER) {
      // Lasciato senza corrispondente per scelta: il conduttore finisce qui (sullo schema «//»)
      out.push({ level: 'info', kind: tx('Rimandi'), msg: tx('Rimando "{0}": senza corrispondente per scelta, il conduttore finisce qui (//)', tag), ...at(l) });
    } else if (!isIncomingLink(l.inst.symbolId)) {
      out.push({ level: 'warn', kind: tx('Rimandi'), msg: tx('Rimando "{0}": partenza in attesa dell\'arrivo (/…); se il conduttore finisce qui scegli «nessun corrispondente» nelle proprietà', tag), ...at(l) });
    } else {
      // Arrivo in più per una partenza già abbinata con lo stesso nome: la partenza può diventare a stella
      const outs = allLinks.filter(o => o.inst.tag === tag && !isIncomingLink(o.inst.symbolId));
      const one = outs.length === 1 && !outs[0].inst.linkStar && partners.get(outs[0].inst.id)?.length ? outs[0] : undefined;
      out.push({ level: 'warn', kind: tx('Rimandi'), msg: one
        ? tx('Rimando "{0}": arrivo in attesa della partenza (/…); la partenza a /{1} è già collegata a un altro arrivo, a stella servirebbe tutti', tag, locationOf(one))
        : tx('Rimando "{0}": arrivo in attesa della partenza (/…)', tag), ...at(l),
        fix: one ? { label: tx('Partenza a stella'), kind: 'linkStar', pageId: one.page.id, id: one.inst.id } : undefined });
    }
  }

  // Rimandi con lo stesso nome su conduttori diversi: lo stesso nome indica lo stesso conduttore
  // (PE, PEN e FE no: tutti sulla barra di terra, come per i numeri filo)
  const linkGroups = new Map<string, Map<string, PlacedElement[]>>();
  for (const l of allLinks) {
    const g = linkNet.get(l.inst.id)?.group;
    if (!g || /^(PE|PEN|FE)$/i.test(l.inst.tag!)) continue;
    const m = linkGroups.get(l.inst.tag!) ?? new Map<string, PlacedElement[]>();
    m.set(g, [...(m.get(g) ?? []), l]);
    linkGroups.set(l.inst.tag!, m);
  }
  for (const [tag, m] of linkGroups) {
    if (m.size < 2) continue;
    const firsts = [...m.values()].map(ls => ls[0]).sort((a, b) => a.pageIndex - b.pageIndex || a.inst.x - b.inst.x);
    out.push({ level: 'error', kind: tx('Rimandi'), msg: tx('Rimando "{0}" usato su {1} conduttori diversi ({2}): lo stesso nome deve indicare lo stesso conduttore', tag, m.size, firsts.map(locationOf).join(', ')), ...at(firsts[1]) });
  }

  // Morsetti: numero mancante o ripetuto (sulla stessa pagina o su pagine diverse)
  const pinGroups = new Map<string, Set<string>>();
  for (const n of nl.nets) if (n.wires.length) for (const q of n.pins) if (q.el.sym.role === 'terminal') pinGroups.set(q.el.inst.id, (pinGroups.get(q.el.inst.id) ?? new Set()).add(n.group));
  for (const e of placed) {
    if (e.sym.role === 'terminal' && !/:./.test(e.inst.tag)) out.push({ level: 'error', kind: tx('Morsetti'), msg: tx('Morsetto "-{0}" senza numero (formato X1:1)', e.inst.tag), ...at(e) });
    if (e.sym.role === 'pin' && !/:./.test(e.inst.tag)) out.push({ level: 'error', kind: tx('Connettori'), msg: tx('Pin "-{0}" senza numero (formato X10:1)', e.inst.tag), ...at(e) });
  }
  for (const s of allStrips(project)) {
    for (const r of stripRows(project, s)) {
      const byPage = new Map<string, PlacedElement[]>();
      for (const e of r.els) byPage.set(e.page.id, [...(byPage.get(e.page.id) ?? []), e]);
      for (const els of byPage.values()) if (els.length > 1) out.push({ level: 'warn', kind: tx('Morsetti'), msg: tx('-{0}:{1} disegnato {2} volte sulla stessa pagina', s, r.no, els.length), ...at(els[1]) });
      if (byPage.size < 2) continue;
      // Su pagine diverse: errore se le copie stanno su circuiti diversi (nella realtà li unirebbe), altrimenti avviso
      const copies = [...byPage.values()].map(els => els[0]);
      const sets = copies.map(e => [...(pinGroups.get(e.inst.id) ?? [])].sort().join('|')).filter(Boolean);
      const apart = sets.some(k => k !== sets[0]);
      out.push({ level: apart ? 'error' : 'warn', kind: tx('Morsetti'), msg: apart
        ? tx('-{0}:{1} disegnato su {2} pagine ({3}) su circuiti diversi: è lo stesso morsetto, i circuiti verrebbero collegati', s, r.no, copies.length, copies.map(locationOf).join(', '))
        : tx('-{0}:{1} disegnato su {2} pagine ({3}) sullo stesso circuito: è voluto?', s, r.no, copies.length, copies.map(locationOf).join(', ')), ...at(copies[1]) });
    }
    // Morsetto a più piani: un solo morsetto fisico, quindi un solo articolo
    const byBase = new Map<string, PlacedElement[]>();
    for (const r of stripRows(project, s)) if (r.level) byBase.set(r.base, [...(byBase.get(r.base) ?? []), ...r.els]);
    for (const [base, els] of byBase) {
      const nrs = [...new Set(els.map(e => e.inst.partNr).filter(Boolean))];
      if (nrs.length > 1) out.push({ level: 'warn', kind: tx('Morsetti'), msg: tx('-{0}:{1}: i piani dello stesso morsetto hanno articoli diversi ({2})', s, base, nrs.join(', ')), ...at(els[0]) });
    }
    // Più piani disegnati di quelli dell'articolo del morsetto
    const levels = new Map<string, Set<string>>();
    for (const r of stripRows(project, s)) if (!isNaN(parseInt(r.base, 10))) levels.set(r.base, (levels.get(r.base) ?? new Set()).add(r.level || 'A'));
    const strip = project.terminalStrips?.[s];
    for (const [base, lv] of levels) {
      const els = stripRows(project, s).filter(r => r.base === base).flatMap(r => r.els);
      const nr = els.map(e => e.inst.partNr).find(Boolean) ?? strip?.partNr;
      const max = nr ? parts.get(nr)?.terminal?.levels : undefined;
      if (max && lv.size > max && els.length) out.push({ level: 'warn', kind: tx('Morsetti'), msg: tx('-{0}:{1}: {2} piani, ma l\'articolo {3} ne ha {4}', s, base, lv.size, nr, max), ...at(els[0]) });
    }
  }

  // Connettori
  for (const m of connectorProblems(project, library)) out.push({ level: 'error', kind: tx('Connettori'), msg: m.msg, pageId: m.pageId, elementId: m.elementId, loc: m.loc });

  // Fili con un estremo libero (non collegato a un punto di connessione né a un altro filo); il punto di
  // connessione dello schermo di un cavo conta come collegato
  const shieldPts = new Map<string, Pt[]>();
  if (project.cables?.some(c => c.shield)) {
    const cst = cableStyleOf(project);
    for (const ci of cableInfos(project, nl)) {
      if (!ci.cable.shield) continue;
      for (const l of ci.lines) {
        const to = shieldGeometry(l.line, ci.marks.filter(k => k.lineId === l.line.id).map(k => k.at), shieldDims(cst, l.line))?.lead?.to;
        if (to) shieldPts.set(l.pageId, [...(shieldPts.get(l.pageId) ?? []), to]);
      }
    }
  }
  for (const pg of project.pages) {
    if (pg.type === 'singleline') continue; // linee unifilari: rappresentazione, non conduttori
    const pins = [...placed.filter(e => e.page === pg).flatMap(e => pinsWorld(e.inst, e.sym)), ...(shieldPts.get(pg.id) ?? [])];
    const wires = pg.elements.filter((e): e is Wire => e.kind === 'wire');
    for (const w of wires) {
      // Linea di un bus di conduttori (fascio): i suoi capi non vanno collegati
      if (isBundle(w)) continue;
      for (const end of [w.points[0], w.points[w.points.length - 1]]) {
        const ok = pins.some(p => samePt(p, end)) || wires.some(o => o !== w &&
          (o.points.some(q => samePt(q, end)) || o.points.some((q, i) => i < o.points.length - 1 && onSegmentInterior(end, q, o.points[i + 1]))));
        if (!ok && !isRailEnd(end, nl.wireNet.get(w.id))) {
          out.push({ level: 'warn', kind: tx('Fili'), msg: tx('Filo con un estremo libero in ({0}, {1})', end.x, end.y), pageId: pg.id, elementId: w.id, loc: `${pg.name}.${columnOf(end.x)}` });
        }
      }
    }
  }

  out.push(...schemaProblems(project, nl, placed));

  // Cavi: conduttori esauriti o ripetuti, cavi senza linea o senza conduttori
  for (const ci of cableInfos(project)) {
    const c = ci.cable;
    if (!ci.lines.length) out.push({ level: 'warn', kind: tx('Cavi'), msg: tx('-{0}: cavo senza linea di definizione nello schema', c.tag) });
    else if (!ci.conductors.length) out.push({ level: 'warn', kind: tx('Cavi'), msg: tx('-{0}: la linea del cavo non attraversa fili', c.tag), pageId: ci.lines[0].pageId, elementId: ci.lines[0].line.id, loc: ci.lines[0].loc });
    for (const k of ci.conductors) if (k.problem) out.push({ level: 'error', kind: tx('Cavi'), msg: `-${c.tag}: ${k.problem}`, pageId: k.pageId, elementId: k.lineId, loc: k.loc });
    // Articolo cambiato dopo averlo scelto: il cavo ha ancora i conduttori di prima
    const part = c.partNr ? parts.get(c.partNr) : undefined;
    if (part && differsFromPart(c, part)) {
      const l = ci.lines[0];
      out.push({
        level: 'warn', kind: tx('Cavi'), msg: tx('-{0}: conduttori diversi da quelli dell\'articolo {1} ({2} invece di {3})', c.tag, part.partNr, c.conductors.slice(0, 4).join(' '), part.cable!.conductors.slice(0, 4).join(' ')),
        ...(l ? { pageId: l.pageId, elementId: l.line.id, loc: l.loc } : {}),
        fix: { kind: 'cableFromPart', cableId: c.id, label: tx('Conduttori dall\'articolo') },
      });
    }
  }
  // Sigle dei cavi ripetute: ogni cavo dopo il primo è segnalato dove è disegnato (un clic ci porta)
  const cableTags = new Map<string, { pageId?: string; elementId?: string; loc?: string }[]>();
  const addTag = (t: string, where: { pageId?: string; elementId?: string; loc?: string }) => cableTags.set(t, [...(cableTags.get(t) ?? []), where]);
  for (const ci of cableInfos(project)) { const l = ci.lines[0]; addTag(ci.cable.tag, l ? { pageId: l.pageId, elementId: l.line.id, loc: l.loc } : {}); }
  if (project.pages.some(pg => pg.elements.some(e => e.kind === 'wire' && e.bus && e.busCable?.tag))) {
    const pageOf = new Map(project.pages.map(pg => [pg.id, pg]));
    for (const g of busCableGroups(project, nl.nets)) {
      for (const t of new Set(g.wires.map(w => w.wire.busCable?.tag).filter((x): x is string => !!x))) {
        const w = g.wires.find(x => x.wire.busCable?.tag === t)!, pg = pageOf.get(w.pageId);
        addTag(t, { pageId: w.pageId, elementId: w.wire.id, loc: pg ? `${pg.name}.${columnOf(w.wire.points[0].x)}` : undefined });
      }
    }
  }
  for (const [t, list] of cableTags) {
    if (list.length < 2) continue;
    const where = list.map(x => x.loc ? `/${x.loc}` : '').filter(Boolean).join(' ');
    for (const x of list.slice(1)) out.push({ level: 'error', kind: tx('Cavi'), msg: tx('Sigla -{0} usata da {1} cavi{2}', t, list.length, where ? ` (${where})` : ''), ...x });
  }
  // Cavo di rete disegnato in più tratti uniti dai rimandi: la sigla dev'essere la stessa
  for (const r of busCableRows(project)) if (r.otherTags) {
    out.push({ level: 'warn', kind: tx('Cavi'), msg: tx('Il cavo -{0} prosegue con i rimandi in tratti con un\'altra sigla ({1}): è lo stesso cavo, usa la stessa sigla', r.tag, r.otherTags.map(t => `-${t}`).join(', ')), pageId: r.page.id, elementId: r.wire.id, loc: r.loc,
      fix: { kind: 'busCableTag', wireIds: r.wires.map(w => w.id), tag: r.tag, label: tx('Usa -{0} su tutti i tratti', r.tag) } });
  }

  // Luoghi
  for (const m of locationProblems(project)) out.push({ level: 'warn', kind: tx('Luoghi'), msg: m.msg, pageId: m.pageId || undefined, elementId: m.elementId || undefined, loc: m.loc || undefined });

  // Reti: indirizzi ripetuti, porte con più collegamenti
  for (const m of networkProblems(project)) out.push({ level: 'error', kind: tx('Rete'), msg: m.msg, pageId: m.pageId, elementId: m.elementId, loc: m.loc });

  // Piano IP
  for (const m of ipProblems(project)) out.push({ level: 'error', kind: 'IP', msg: m.msg, pageId: m.pageId || undefined, elementId: m.elementId || undefined, loc: m.loc || undefined });

  // Layout del quadro
  for (const m of layoutProblems(project)) out.push({ level: 'warn', kind: tx('Layout'), msg: m.msg, pageId: m.pageId });

  // PLC
  for (const m of plcProblems(project)) out.push({ level: 'error', kind: 'PLC', msg: m });
  for (const m of hardwareProblems(project)) out.push({ level: 'error', kind: 'PLC', msg: m });

  out.push(...orphanData(project));

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * Verifica elettrica dello schema: simboli mancanti o sovrapposti, componenti non collegati o
 * collegati solo in parte, collegamenti solo apparenti, cortocircuiti tra potenziali,
 * componenti cortocircuitati, fili isolati o sovrapposti, numeri filo ripetuti, elementi fuori foglio.
 */
export function schemaProblems(project: Project, nl = computeNetlist(project), placed = allPlaced(project)): Issue[] {
  const out: Issue[] = [];
  const isDiagram = (t: string) => t === 'multiline' || t === 'network';
  // Simboli inesistenti (libreria non caricata o simbolo cancellato)
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.kind === 'symbol') {
        const sd = getSymbol(e.symbolId, project);
        if (sd && !allowedRots(sd).includes(e.rot)) {
          const mine = project.customSymbols.some(x => x.id === sd.id);
          out.push({ level: 'warn', kind: tx('Simboli'), msg: tx('{0}rotazione {1}° non ammessa dal simbolo "{2}" (ammesse: {3})', e.tag ? `-${e.tag}: ` : '', e.rot, sd.name, allowedRots(sd).join(', ')), pageId: pg.id, elementId: e.id, loc: `${pg.name}.${columnOf(e.x)}`,
            fix: mine ? { label: tx('Ammetti {0}° nel simbolo', e.rot), kind: 'allowRot', symbolId: sd.id, rot: e.rot } : { label: tx('Ruota alla posizione ammessa'), kind: 'fitRot', pageId: pg.id, id: e.id } });
        }
      }
      if (e.kind === 'symbol' && !getSymbol(e.symbolId, project)) out.push({ level: 'error', kind: tx('Simboli'), msg: tx('{0}simbolo "{1}" non trovato (libreria mancante?)', e.tag ? `-${e.tag}: ` : '', e.symbolId), pageId: pg.id, elementId: e.id, loc: `${pg.name}.${columnOf(e.x)}` });
    }
  }
  // Bus di conduttori: fili senza conduttore e conduttori che entrano ma non escono
  const bt = bundleTaps(project);
  const pageName = new Map(project.pages.map(pg => [pg.id, pg.name]));
  const tapLoc = (t: BundleTap) => `${pageName.get(t.pageId)}.${columnOf(t.at.x)}`;
  for (const t of bt.taps) {
    // Un cavo di rete (Ethernet, Modbus…) entra nel fascio come cavo intero, senza nome di conduttore
    if (!t.name && !t.wire.bus) out.push({ level: 'warn', kind: tx('Bus di conduttori'), msg: tx('Filo che entra nel bus senza il nome del conduttore'), pageId: t.pageId, elementId: t.wire.id, loc: tapLoc(t) });
  }
  const seen = new Map<string, BundleTap[]>();
  for (const t of bt.taps) if (t.name) seen.set(`${t.group}|${t.name}`, [...(seen.get(`${t.group}|${t.name}`) ?? []), t]);
  // Fasci in cui entra un cavo di rete intero (es. Ethernet su una pagina, i suoi conduttori sull'altra)
  const wholeCable = new Set(bt.taps.filter(t => t.wire.bus).map(t => t.group));
  for (const list of seen.values()) {
    if (list.length > 1 || wholeCable.has(list[0].group)) continue;
    const t = list[0], bus = bt.names.get(t.group);
    out.push({ level: 'warn', kind: tx('Bus di conduttori'), msg: bus ? tx('Il conduttore {0} entra nel bus «{1}» ma non esce da nessuna parte', t.name, bus) : tx('Il conduttore {0} entra nel bus ma non esce da nessuna parte', t.name), pageId: t.pageId, elementId: t.wire.id, loc: tapLoc(t) });
  }
  // Conduttore di ogni punto di connessione
  const pinNet = new Map<string, Net>();
  for (const n of nl.nets) for (const p of n.pins) pinNet.set(`${p.el.inst.id}|${p.pinId}`, n);
  const connected = (n?: Net) => !!n && (n.wires.length > 0 || n.pins.length > 1 || !!n.potentials?.length || !!n.links?.length);
  const pageWires = new Map(project.pages.map(pg => [pg.id, pg.elements.filter((e): e is Wire => e.kind === 'wire')]));
  for (const e of placed) {
    if (!isDiagram(e.page.type) || e.sym.role === 'oneline') continue;
    const pins = pinsWorld(e.inst, e.sym);
    if (!pins.length) continue;
    const wires = pageWires.get(e.page.id) ?? [];
    const label = (pinId: string, fallback: string) => nl.nets.flatMap(n => n.pins).find(p => p.el.inst.id === e.inst.id && p.pinId === pinId)?.label || fallback;
    if (e.sym.role === 'potential' || e.sym.role === 'link') {
      const touching = pins.some(p => wires.some(w => w.points.some(q => samePt(q, p))));
      if (!touching) out.push({ level: 'warn', kind: tx('Collegamenti'), msg: tx('{0} "{1}" senza filo', e.sym.role === 'link' ? 'Rimando' : 'Potenziale', e.inst.tag), ...at(e) });
      continue;
    }
    const free = pins.filter(p => !connected(pinNet.get(`${e.inst.id}|${p.pin.id}`)));
    // Filo che passa sul punto senza terminarci: sembra collegato ma non lo è
    for (const p of free) {
      const over = wires.filter(w => w.points.some((q, i) => i < w.points.length - 1 && onSegmentInterior(p, q, w.points[i + 1])));
      if (over.length) {
        out.push({ level: 'error', kind: tx('Collegamenti'), msg: tx('-{0}:{1} sembra collegato ma il filo vi passa sopra senza terminare: dividi il filo sul punto', e.inst.tag, label(p.pin.id, p.pin.label)), ...at(e),
          fix: { label: tx('Dividi il filo sui punti'), kind: 'splitWire', pageId: e.page.id, wireIds: over.map(w => w.id) } });
      }
    }
    if (free.length === pins.length) {
      // Pin di connettore senza fili: pin di riserva disegnati apposta
      if (e.sym.role === 'pin') { out.push({ level: 'info', kind: tx('Orfani'), msg: tx('-{0}: pin libero (di riserva)', e.inst.tag), ...at(e) }); continue; }
      const what = e.sym.role === 'netnode' ? 'nodo di rete senza collegamenti' : `${e.sym.name} senza collegamenti`;
      out.push({ level: 'warn', kind: tx('Orfani'), msg: `${e.inst.tag ? `-${e.inst.tag}` : e.sym.name}: ${what}`, ...at(e) });
      continue;
    }
    // Collegati solo in parte: contatti (non in scambio), bobine e apparecchi semplici
    const partialCheck = (e.sym.role === 'aux' && e.sym.contact !== 'CO') || e.sym.role === 'main' || e.sym.role === 'plc'
      || (e.sym.role === 'single' && pins.length <= 6 && !project.customSymbols.some(c => c.id === e.sym.id));
    if (partialCheck) {
      for (const p of free) out.push({ level: 'warn', kind: tx('Collegamenti'), msg: tx('-{0}:{1} non collegato', e.inst.tag, label(p.pin.id, p.pin.label) || p.pin.id), ...at(e) });
    }
    // Componente cortocircuitato: i suoi due punti sullo stesso conduttore
    if (pins.length === 2 && ['main', 'aux', 'single'].includes(e.sym.role)) {
      const a = pinNet.get(`${e.inst.id}|${pins[0].pin.id}`), b = pinNet.get(`${e.inst.id}|${pins[1].pin.id}`);
      if (a && a === b && a.wires.length) out.push({ level: 'error', kind: tx('Cortocircuiti'), msg: tx('-{0} ({1}) cortocircuitato: i due punti sono sullo stesso conduttore {2}', e.inst.tag, e.sym.name, a.wireNo || a.name), ...at(e) });
    }
  }
  // Cortocircuiti tra potenziali diversi e rimandi con nomi diversi sullo stesso conduttore
  const singleline = new Set(project.pages.filter(p => p.type === 'singleline').map(p => p.id));
  for (const n of nl.nets) {
    if (n.wires.length && n.wires.every(w => singleline.has(w.pageId))) continue;
    const where = (() => {
      const w = n.wires[0];
      const pg = w && project.pages.find(p => p.id === w.pageId);
      return pg && w ? { pageId: pg.id, elementId: w.wire.id, loc: `${pg.name}.${columnOf(w.wire.points[0].x)}` } : {};
    })();
    if ((n.potentials?.length ?? 0) > 1) out.push({ level: 'error', kind: tx('Cortocircuiti'), msg: tx('Potenziali {0} collegati tra loro', n.potentials!.join(' e ')), ...where });
    const names = [...new Set([...(n.potentials ?? []), ...(n.links ?? [])])];
    if (names.length > 1 && (n.potentials?.length ?? 0) <= 1) out.push({ level: 'error', kind: tx('Cortocircuiti'), msg: tx('Sullo stesso conduttore ci sono {0}', names.join(' e ')), ...where });
    // Fili che non collegano nessun dispositivo
    if (n.wires.length && !n.pins.length && !n.potentials?.length && !n.links?.length) out.push({ level: 'warn', kind: tx('Orfani'), msg: tx('Filo isolato: non collega nessun punto di connessione'), ...where });
  }
  // Numeri filo scritti a mano ripetuti su conduttori diversi
  const byNo = new Map<string, Net[]>();
  for (const n of nl.nets) if (n.wireNo && !n.named && !n.wires.some(w => w.wire.bus)) byNo.set(n.wireNo, [...(byNo.get(n.wireNo) ?? []), n]);
  for (const [no, nets] of byNo) {
    // Conduttori uniti da un morsetto (stesso gruppo) hanno lo stesso numero per scelta
    if (new Set(nets.map(n => n.group)).size < 2) continue;
    // Conduttori di protezione e di terra (PE, PEN, FE): sono tutti collegati alla barra di terra,
    // anche quando nello schema i tratti delle varie sezioni non sono uniti
    if (/^(PE|PEN|FE)$/i.test(no)) continue;
    const w = nets[1].wires[0];
    const pg = project.pages.find(p => p.id === w.pageId)!;
    // Il numero preso dal nome di un rimando non si cambia sul filo (va rinominato il rimando): tiene il
    // numero il primo conduttore che lo prende da un rimando, o il primo; gli altri ne prendono uno nuovo
    // se il loro numero è scritto sul filo
    const fromLink = (n: Net) => !!n.links?.includes(no);
    const keep = nets.find(fromLink) ?? nets[0];
    // Conduttori dello stesso gruppo (uniti da un morsetto) di quello che tiene il numero: restano uguali
    const moved = nets.filter(n => n.group !== keep.group && !fromLink(n));
    const others = moved.flatMap(n => n.wires.map(x => x.wire.id));
    const movable = new Set(moved.map(n => n.group)).size;
    out.push({ level: 'error', kind: tx('Numeri filo'), msg: tx('Numero filo {0} usato da {1} conduttori diversi', no, nets.length), pageId: pg.id, elementId: w.wire.id, loc: `${pg.name}.${columnOf(w.wire.points[0].x)}`,
      fix: movable ? { label: movable === 1 ? tx('Numero nuovo all\'altro conduttore') : tx('Numero nuovo agli altri {0} conduttori', movable), kind: 'renumberWires', wireIds: others } : undefined });
  }
  for (const pg of project.pages) {
    if (!isDiagram(pg.type) && pg.type !== 'singleline') continue;
    // Simboli uguali sovrapposti (incollati due volte)
    const seen = new Map<string, string>();
    for (const e of pg.elements) {
      if (e.kind !== 'symbol') continue;
      const k = `${e.symbolId}|${e.x}|${e.y}`;
      if (seen.has(k)) out.push({ level: 'error', kind: tx('Simboli'), msg: tx('-{0}: due simboli uguali sovrapposti nello stesso punto', e.tag), pageId: pg.id, elementId: e.id, loc: `${pg.name}.${columnOf(e.x)}`,
        fix: { label: tx('Elimina il doppione'), kind: 'deleteElement', pageId: pg.id, id: e.id } });
      else seen.set(k, e.id);
    }
    // Tratti di filo sovrapposti (sembrano un filo solo ma non sono collegati o lo sono due volte)
    const segs: { w: Wire; a: Pt; b: Pt }[] = [];
    for (const w of pageWires.get(pg.id) ?? []) for (let i = 0; i < w.points.length - 1; i++) segs.push({ w, a: w.points[i], b: w.points[i + 1] });
    const reported = new Set<string>();
    // Più fili che partono dalla stessa uscita di un ripartitore: sovrapposti apposta (fili diversi nello stesso foro)
    const distPts: Pt[] = [];
    for (const e of pg.elements) {
      if (e.kind !== 'symbol' || !e.symbolId.startsWith('dist:')) continue;
      const sym = getSymbol(e.symbolId, project);
      if (sym) distPts.push(...pinsWorld(e, sym).map(w => ({ x: w.x, y: w.y })));
    }
    const fromSameHole = (s1: { a: Pt; b: Pt }, s2: { a: Pt; b: Pt }) => distPts.some(q => (samePt(q, s1.a) || samePt(q, s1.b)) && (samePt(q, s2.a) || samePt(q, s2.b)));
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s1 = segs[i], s2 = segs[j];
        if (s1.w === s2.w || reported.has(s2.w.id) || fromSameHole(s1, s2)) continue;
        const ov = overlap(s1.a, s1.b, s2.a, s2.b);
        if (ov > 0.5) {
          reported.add(s2.w.id);
          out.push({ level: 'warn', kind: tx('Fili'), msg: tx('Fili sovrapposti per {0} mm', Math.round(ov)), pageId: pg.id, elementId: s2.w.id, loc: `${pg.name}.${columnOf(s2.a.x)}` });
        }
      }
    }
    // Elementi fuori dal foglio
    for (const e of pg.elements) {
      let pts: Pt[] = [];
      if (e.kind === 'wire' || e.kind === 'cable' || e.kind === 'wiredef') pts = e.points;
      else if (e.kind === 'symbol') { const sym = getSymbol(e.symbolId, project); if (sym) { const b = instanceBounds(e, sym); pts = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]; } }
      else pts = [{ x: e.x, y: e.y }];
      if (pts.some(p => p.x < 0 || p.y < 0 || p.x > PAGE_W || p.y > PAGE_H)) out.push({ level: 'warn', kind: tx('Disegno'), msg: tx('Elemento fuori dal foglio{0}', e.kind === 'symbol' && e.tag ? ` (-${e.tag})` : ''), pageId: pg.id, elementId: e.id });
    }
    if ((pg.type === 'multiline' || pg.type === 'singleline') && !pg.elements.length) out.push({ level: 'info', kind: tx('Pagine'), msg: tx('Pagina {0} "{1}" vuota', pg.name, pg.title), pageId: pg.id });
  }
  return out;
}

/** Lunghezza di sovrapposizione di due segmenti orizzontali o verticali sulla stessa retta */
function overlap(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const h1 = Math.abs(a.y - b.y) < 0.01, h2 = Math.abs(c.y - d.y) < 0.01, v1 = Math.abs(a.x - b.x) < 0.01, v2 = Math.abs(c.x - d.x) < 0.01;
  if (h1 && h2 && !v1 && !v2 && Math.abs(a.y - c.y) < 0.01) return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
  if (v1 && v2 && !h1 && !h2 && Math.abs(a.x - c.x) < 0.01) return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  return 0;
}

/** Dati orfani: articoli, simboli, morsettiere, connettori, luoghi e reti IP che nessuno usa */
export function orphanData(project: Project): Issue[] {
  const out: Issue[] = [];
  const used = new Set<string>();
  const use = (s?: string) => { if (s) used.add(s); };
  const symUsed = new Set<string>();
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.kind === 'symbol') { use(e.partNr); symUsed.add(e.symbolId); }
      if (e.kind === 'wire') use(e.busCable?.partNr);
    }
    for (const it of pg.layout?.items ?? []) use(it.partNr);
  }
  for (const c of project.plc.cards) use(c.partNr);
  for (const c of project.cables ?? []) use(c.partNr);
  for (const d of Object.values(project.terminalStrips ?? {})) {
    [d.partNr, d.endPlatePartNr, d.endStopPartNr, d.jumperPartNr, d.separatorPartNr].forEach(use);
    d.jumpers.forEach(j => use(j.partNr));
  }
  for (const c of Object.values(project.connectors ?? {})) use(c.matingPartNr);
  for (const p of project.parts) if (!used.has(p.partNr)) out.push({ level: 'info', kind: tx('Orfani'), msg: tx('Articolo {0}{1} copiato nel progetto ma non usato', p.partNr, p.descr1 ? ` (${p.descr1})` : '') });
  for (const s of project.customSymbols) if (!symUsed.has(s.id) && !project.parts.some(p => p.symbolId === s.id)) out.push({ level: 'info', kind: tx('Orfani'), msg: tx('Simbolo "{0}" del progetto non usato', s.name) });
  const strips = new Set(allStrips(project));
  for (const [k, d] of Object.entries(project.terminalStrips ?? {})) if (!strips.has(k) && !d.spares.length) out.push({ level: 'info', kind: tx('Orfani'), msg: tx('Dati della morsettiera -{0} senza morsetti nello schema', k) });
  const conns = new Set(allPlaced(project).filter(e => e.sym.role === 'pin').map(e => e.inst.tag.split(':')[0]));
  for (const k of Object.keys(project.connectors ?? {})) if (!conns.has(k)) out.push({ level: 'info', kind: tx('Orfani'), msg: tx('Dati del connettore -{0} senza pin nello schema', k) });
  for (const pn of project.panels ?? []) {
    const usedPanel = project.pages.some(pg => pg.panelId === pn.id || pg.elements.some(e => (e.kind === 'zone' && e.panelId === pn.id) || (e.kind === 'symbol' && e.loc === pn.code)));
    if (!usedPanel) out.push({ level: 'info', kind: tx('Orfani'), msg: tx('Luogo +{0} {1} senza pagine né dispositivi', pn.code, pn.name) });
  }
  return out;
}

/**
 * Controllo prima del rilascio di una revisione: gli errori bloccano il rilascio; gli avvisi vanno
 * accettati con un motivo scritto; le segnalazioni già verificate passano nel rapporto con il loro motivo
 */
export function releaseCheck(project: Project, library: Part[] = []): { errors: Issue[]; warnings: Issue[]; accepted: Issue[] } {
  const all = checkProject(project, library).filter(i => i.level !== 'info');
  const open = all.filter(i => !acceptedOf(project, i));
  return { errors: open.filter(i => i.level === 'error'), warnings: open.filter(i => i.level === 'warn'), accepted: all.filter(i => acceptedOf(project, i)) };
}

/**
 * Codici articolo usati nel progetto (campi partNr e …PartNr, articoli delle riserve), con il primo
 * punto in cui compaiono: elemento della pagina, oppure morsettiera, cavo, ripartitore…
 */
export function partRefs(project: Project, devices = buildDevices(project)): Map<string, { what: string; pageId?: string; elementId?: string }> {
  const out = new Map<string, { what: string; pageId?: string; elementId?: string }>();
  const add = (nr: unknown, what: string, pageId?: string, elementId?: string) => {
    if (typeof nr === 'string' && nr.trim() && !out.has(nr)) out.set(nr, { what, pageId, elementId });
  };
  const walk = (o: unknown, what: string, pageId?: string, elementId?: string): void => {
    if (Array.isArray(o)) { for (const x of o) walk(x, what, pageId, elementId); return; }
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'partNr' || k.endsWith('PartNr')) add(v, what, pageId, elementId);
      else if (k === 'spareParts' && v && typeof v === 'object') for (const nr of Object.values(v)) add(nr, what, pageId, elementId);
      else if (typeof v === 'object') walk(v, what, pageId, elementId);
    }
  };
  for (const pg of project.pages) for (const e of pg.elements) walk(e, e.kind === 'symbol' && e.tag ? `-${e.tag}` : tx('pagina {0}', pg.name), pg.id, e.id);
  for (const pg of project.pages) if (pg.layout) walk(pg.layout, tx('layout {0}', pg.name), pg.id);
  for (const [strip, d] of Object.entries(project.terminalStrips ?? {})) walk(d, `-${strip}`);
  for (const c of project.cables ?? []) walk(c, `-${c.tag}`);
  for (const d of project.distributors ?? []) walk(d, `-${d.tag}`);
  for (const [conn, d] of Object.entries(project.connectors ?? {})) walk(d, `-${conn}`);
  // Schede con il dispositivo nello schema: come in distinta vale l'articolo del dispositivo
  for (const c of project.plc.cards) if (!cardDevice(project, c, devices)) walk(c, `-${c.tag}`);
  return out;
}
