import { pairRepresentations } from './pairs';
import { projectionSource } from './projection';
import type { PlacedElement } from './devices';
import { functionKind } from './articlePins';
import { pageTNodes } from './wiringOrder';
import type { Project, Part, FieldKey, Page, Wire, ProjectSettings, Pt } from './types';
import { bundleTaps, isBundle } from './bundles';
import { GENERIC_BUS } from './network';
import { textsUnderTag } from './types';
import { textStylesOf, lookOf, wireTextStyle } from './types';
import type { PageDerived } from '../ui/PageSvg';
import { allPlaced, crossReferences, effectivePinLabels, locationOf, stripOf, buildDevices, deviceInfo, designation, partsIndex } from './devices';
import { computeNetlist, withNetlistCache, type NetlistResult } from './netlist';
import { settingsOf } from './numbering';
import { ioAssignments, overviewData, overviewRefs } from './plc';
import { stripSheets } from './terminals';
import { changesSince, lastRevision, mergeClouds, nextRevisionIndex } from './revisions';

/** Nuvoletta di revisione sulla pagina: ingombro, indice della revisione aperta, note da scrivere */
export interface RevisionCloud { box: [number, number, number, number]; index: string; notes: string[] }
import { columnKeys, reportStyleOf, sheetRanges, sortedTable, styledRowH, REPORT_DEFAULTS } from './reportStyle';
import { listTextScale } from './drawingStyle';
import type { ReportStyle } from './types';

/** Foglio di una pagina di lista: righe del foglio (tradotte), nomi originali delle colonne e impaginazione */
export interface ReportSheet { table: Table; first: number; keys: string[]; style: ReportStyle }
import { projectReports, type Table } from './reports';
import { blockKey, reportBlocks } from './panelScope';
import { drawingData } from './drawings';
import { connectorFrames } from './connectors';
import { cableInfos, cableSection } from './cables';
import { cableStyleOf, shieldDims, shieldGeometry } from './cableStyle';
import type { CableMark } from '../ui/PageSvg';
import { pinsWorld, keyOf, getSymbol, instanceBounds, pairVertical } from './geometry';
import { linkPartners, waitingLinks } from './links';
import { translator, translateTable } from './i18n';
import { placeWireLabels, wireLabelGap } from './wireLabels';
import { DEVICE_LINE_KEYS, symShown, wireShown, type ShowMap, type SymVisKey, type WireVisKey } from './visibility';

export interface Derived {
  pages: Map<string, PageDerived>;
  netlist: NetlistResult;
  /** Rimandi in attesa del corrispondente, in ordine di pagina */
  linkWaiting: { id: string; pageId: string }[];
  /** Collegamenti di rete con la sigla del cavo scritta sullo schema */
  cableTagShown: Set<string>;
}

/** Dati calcolati da tutto il progetto (etichette, riferimenti incrociati, reti) */
/** tables: liste già calcolate da usare per le pagine di lista (es. ridotte ai quadri da stampare) */
export function derive(project: Project, library: Part[] = [], tables?: Table[]): Derived {
  return withNetlistCache(project, () => deriveNow(project, library, tables));
}

function deriveNow(project: Project, library: Part[], given?: Table[]): Derived {
  const labels = effectivePinLabels(project);
  const xrefs = crossReferences(project);
  // Unifilare: ogni rappresentazione rimanda al dispositivo nel multifilare (e viceversa nulla cambia)
  for (const d of buildDevices(project).values()) {
    const ones = d.elements.filter(e => e.sym.role === 'oneline');
    const anchor = d.main ?? d.elements.find(e => e.sym.role !== 'oneline' && e.sym.role !== 'netnode');
    if (!ones.length || !anchor) continue;
    for (const o of ones) xrefs.set(o.inst.id, { mainLocation: locationOf(anchor), mainId: anchor.inst.id });
  }
  // Riferimenti a coppie: la rappresentazione mostra i morsetti del contatto vero e dove è cablato;
  // il contatto vero rimanda alla rappresentazione (di solito accanto ai poli dell'apparecchio)
  for (const { rep, real } of pairRepresentations(project)) {
    if (!real) continue;
    const l = labels.get(real.inst.id);
    if (l) labels.set(rep.inst.id, l);
    xrefs.set(rep.inst.id, { mainLocation: locationOf(real), mainId: real.inst.id });
    xrefs.set(real.inst.id, { ...xrefs.get(real.inst.id), mainLocation: locationOf(rep), mainId: rep.inst.id });
  }
  // Un contatto si rappresenta in un modo solo: se ha la rappresentazione accanto all'apparecchio
  // non compare anche nell'immagine dei contatti della bobina
  const repped = new Set(pairRepresentations(project).flatMap(r => (r.real ? [r.real.inst.id] : [])));
  if (repped.size) for (const [id, x] of xrefs) if (x.contacts?.some(c => c.id && repped.has(c.id))) xrefs.set(id, { ...x, contacts: x.contacts.filter(c => !c.id || !repped.has(c.id)) });
  // Linea tratteggiata del comando dall'apparecchio alle rappresentazioni ridotte dei suoi contatti
  // disegnate accanto sulla stessa pagina (in verticale, all'altezza dell'apparecchio)
  const pairLines = new Map<string, { x1: number; x2: number; y: number }[]>();
  {
    const mainOf = new Map<string, PlacedElement>();
    for (const d of buildDevices(project).values()) if (d.main) for (const e of d.elements) mainOf.set(e.inst.id, d.main);
    const groups = new Map<string, { page: string; b: ReturnType<typeof instanceBounds>; ys: { x: number; y: number }[] }>();
    for (const { rep, real } of pairRepresentations(project)) {
      const m = real && mainOf.get(real.inst.id);
      if (!m || !rep.inst.pairCompact || m.page.id !== rep.page.id || !pairVertical(rep.inst)) continue;
      const b = instanceBounds(m.inst, m.sym);
      if (rep.inst.y < b.y0 || rep.inst.y > b.y1 || (rep.inst.x > b.x0 && rep.inst.x < b.x1)) continue;
      const g = groups.get(m.inst.id) ?? { page: m.page.id, b, ys: [] };
      g.ys.push({ x: rep.inst.x, y: rep.inst.y });
      groups.set(m.inst.id, g);
    }
    for (const g of groups.values()) {
      const y = g.ys[0].y, row = g.ys.filter(p => Math.abs(p.y - y) < 0.6);
      const right = row.filter(p => p.x >= g.b.x1), left = row.filter(p => p.x <= g.b.x0);
      const list = pairLines.get(g.page) ?? [];
      if (right.length) list.push({ x1: g.b.x1 - 1, x2: Math.max(...right.map(p => p.x)), y });
      if (left.length) list.push({ x1: Math.min(...left.map(p => p.x)), x2: g.b.x0 + 1, y });
      pairLines.set(g.page, list);
    }
  }
  // Contatti di riserva: le funzioni dell'articolo non usate da nessun elemento del dispositivo si
  // disegnano nell'immagine dei contatti senza rimando
  {
    const parts = partsIndex(project, library);
    for (const d of buildDevices(project).values()) {
      const main = d.main;
      const x = main && xrefs.get(main.inst.id);
      if (!main || !x?.contacts) continue;
      const partNr = deviceInfo(d.elements, main, parts).partNr;
      const fts = partNr ? parts.get(partNr)?.functionTemplates : undefined;
      if (!fts?.length) continue;
      const used = new Set(d.elements.flatMap(e => Object.values(labels.get(e.inst.id) ?? {}).filter(Boolean)));
      const spare = fts.flatMap(ft => {
        const kind = functionKind(ft), conns = ft.connections.filter(Boolean);
        if (!kind || kind === 'coil' || !conns.length || conns.some(c => used.has(c))) return [];
        return [{ kind, labels: conns.join('-') }];
      });
      if (spare.length) xrefs.set(main.inst.id, { ...x, contacts: [...x.contacts, ...spare] });
    }
  }
  const netlist = computeNetlist(project);
  const linkTargets = new Map<string, { loc: string; id: string }[]>();
  const links = allPlaced(project).filter(e => e.sym.role === 'link');
  const partners = linkPartners(project, links);
  for (const l of links) {
    // I corrispondenti più vicini per primi: dopo la pagina per le partenze, prima per gli arrivi
    const incoming = l.inst.symbolId === 'link_in';
    const rank = (o: typeof l) => { const d = o.pageIndex - l.pageIndex; const ahead = incoming ? d < 0 : d > 0; return (ahead ? 0 : 10000) + Math.abs(d); };
    const others = [...(partners.get(l.inst.id) ?? [])].sort((a, b) => rank(a) - rank(b) || a.inst.x - b.inst.x);
    linkTargets.set(l.inst.id, others.map(o => ({ loc: locationOf(o), id: o.inst.id })));
  }
  const netOfLink = new Map<string, string[]>();
  for (const n of netlist.nets) for (const id of n.linkIds ?? []) netOfLink.set(id, n.linkIds!);
  const waiting = waitingLinks(links, partners, id => netOfLink.get(id)).sort((a, b) => a.pageIndex - b.pageIndex || a.inst.x - b.inst.x || a.inst.y - b.inst.y);
  const linkWaiting = new Set(waiting.map(l => l.inst.id));
  // Sigla della morsettiera solo sul primo morsetto di una fila (passo <= 12 mm): fila
  // orizzontale per i morsetti su fili verticali, fila verticale per quelli su fili orizzontali
  const stripLabel = new Set<string>();
  const terms = allPlaced(project).filter(e => e.sym.role === 'terminal' || e.sym.role === 'pin');
  const horizontalWire = (r: number) => r === 90 || r === 270;
  for (const t of terms) {
    const strip = stripOf(t.inst.tag);
    const h = horizontalWire(t.inst.rot);
    const hasPrevious = terms.some(o => o !== t && o.page === t.page && stripOf(o.inst.tag) === strip && horizontalWire(o.inst.rot) === h &&
      (h ? o.inst.x === t.inst.x && o.inst.y < t.inst.y && t.inst.y - o.inst.y <= 12
         : o.inst.y === t.inst.y && o.inst.x < t.inst.x && t.inst.x - o.inst.x <= 12));
    if (!hasPrevious) stripLabel.add(t.inst.id);
  }
  // Numeri filo; le linee che partono da un punto di potenziale hanno già il nome scritto accanto
  const potentialPins = new Set<string>();
  /** Nome dei rimandi nel loro punto: un cavo di rete che finisce su un rimando con la sua sigla non la ripete */
  const linkTagAt = new Map<string, string>();
  for (const e of allPlaced(project)) {
    if (e.sym.role === 'potential') for (const p of pinsWorld(e.inst, e.sym)) potentialPins.add(`${e.page.id}|${keyOf(p)}`);
    if (e.sym.role === 'link' && e.inst.tag) for (const p of pinsWorld(e.inst, e.sym)) linkTagAt.set(`${e.page.id}|${keyOf(p)}`, e.inst.tag.replace(/^-/, ''));
  }
  const wireNumbers = new Map<string, string>();
  const spareWord = translator(project).t('scorta');
  /** Sezione e colore scritti sulla lineetta obliqua del filo */
  const wireTicks = new Map<string, string>();
  /** Collegamenti di rete con la sigla del cavo scritta */
  const cableTagShown = new Set<string>();
  /** Rimandi dei bus di conduttori alle altre pagine (pagina e primo tratto), in fondo al nome */
  const wireRefs = new Map<string, { page: string; id: string }[]>();
  const settings = settingsOf(project);
  const bundles = bundleTaps(project);
  for (const pg of project.pages) for (const w of pg.elements) {
    if (w.kind !== 'wire') continue;
    const net = netlist.wireNet.get(w.id);
    const ends = [w.points[0], w.points[w.points.length - 1]];
    if (w.bus) {
      // Sigla del cavo, poi il protocollo (bus generico: il tipo del cavo o l'articolo). L'occhio del
      // numero filo spegne tutto; la sigla ha un occhio suo ed è nascosta se il filo arriva a un
      // rimando con lo stesso nome (sarebbe scritta due volte)
      const tag = w.busCable?.tag;
      const sameLink = !!tag && ends.some(p => linkTagAt.get(`${pg.id}|${keyOf(p)}`) === tag);
      if (tag && (w.show?.cable ?? (w.show?.number !== false && !sameLink))) cableTagShown.add(w.id);
      const kind = w.bus === GENERIC_BUS ? w.busCable?.type || w.busCable?.partNr || '' : w.bus;
      const label = [cableTagShown.has(w.id) ? `-${tag}` : '', w.show?.number !== false && (settings.showWireNumbers || settings.showWireData) ? kind : ''].filter(Boolean).join('  ');
      if (label) wireNumbers.set(w.id, label);
      continue;
    }
    // Bus di conduttori: il nome, con le altre pagine in cui prosegue
    if (isBundle(w)) {
      const g = bundles.groupOf.get(w.id);
      // Altre pagine del bus, cliccabili: si va al primo tratto dello stesso bus su quella pagina
      const refs = project.pages.filter(o => o.id !== pg.id).flatMap(o => {
        const t = o.elements.find(e => e.kind === 'wire' && isBundle(e) && bundles.groupOf.get(e.id) === g);
        return t ? [{ page: o.name, id: t.id }] : [];
      });
      if (refs.length) wireRefs.set(w.id, refs);
      const others = refs.map(r => `/${r.page}`);
      const label = [bundles.names.get(g ?? '') ?? '', others.join(' ')].filter(Boolean).join('  ');
      if (label) wireNumbers.set(w.id, label);
      continue;
    }
    if (pg.type === 'singleline') { if (w.text && (settings.showWireNumbers || settings.showWireData)) wireNumbers.set(w.id, w.text); continue; }
    // Numero, sezione e colore: scelta del filo o impostazione del progetto; accanto a un punto di
    // potenziale (che ha già il nome scritto) solo se scelto sul filo
    const atPotential = ends.some(p => potentialPins.has(`${pg.id}|${keyOf(p)}`));
    const shown = (k: WireVisKey) => wireLabelShown(w, k, settings, atPotential);
    const data = wireData({ cross: shown('cross') ? w.cross : undefined, color: shown('color') ? w.color : undefined });
    // Sezione e colore sulla lineetta obliqua (impostazione del progetto): il numero resta da solo
    const tick = settings.wireDataTick !== false && !!data;
    // Sulla lineetta il colore e poi la sezione, senza «mm²» (es. «BK 2,5»)
    if (tick) wireTicks.set(w.id, [shown('color') ? w.color : '', shown('cross') ? w.cross : ''].filter(Boolean).join(' '));
    // Conduttore di scorta: al posto del numero la scritta «scorta» (nella lingua dello schema)
    const no = net?.spare ? spareWord : net?.wireNo;
    const label = [shown('number') ? no : '', tick ? '' : data].filter(Boolean).join('  ');
    if (label) wireNumbers.set(w.id, label);
  }
  // Sigle complete e testi dei dispositivi
  const designations = new Map<string, string>();
  const deviceLines = new Map<string, string[]>();
  // Testi del componente messi nell'editor dei simboli: valore del dispositivo per ogni elemento
  const deviceFields = new Map<string, Partial<Record<FieldKey, string>>>();
  // Proprietà mostrate o nascoste sullo schema, per ogni simbolo (quelle del dispositivo per i dispositivi)
  const show = new Map<string, ShowMap<SymVisKey>>();
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.show) show.set(e.id, e.show);
  const parts = partsIndex(project, library);
  const L = translator(project);
  for (const d of buildDevices(project).values()) {
    if (d.elements.every(e => e.sym.role === 'terminal')) continue;
    const info = deviceInfo(d.elements, d.main, parts);
    // I punti PLC di una scheda hanno la stessa sigla, ma le loro scelte restano di ogni punto
    for (const e of d.elements) if (e.sym.role !== 'plc') { if (info.show) show.set(e.inst.id, info.show); else show.delete(e.inst.id); }
    const vis = (k: SymVisKey, sym?: { fields?: { f: string }[] }) => symShown(info.show, k, { showTexts: info.showTexts, settings, sym: sym as never });
    const func = vis('func') ? info.func : undefined, loc = vis('loc') ? info.loc : undefined;
    for (const e of d.elements) {
      // Punti PLC: la sigla della scheda si mostra o si nasconde su ogni punto (nei gruppi I/O solo sul primo canale)
      const tagOn = e.sym.role === 'plc' ? e.inst.show?.tag !== false : vis('tag');
      if (!tagOn) designations.set(e.inst.id, '');
      else if (func || loc) designations.set(e.inst.id, designation(d.tag, func, loc));
    }
    const values: Record<FieldKey, string | undefined> = {
      description: info.description ? L.t(info.description) : undefined, techData: info.techData,
      manufacturer: info.manufacturer, typeNr: info.typeNr, orderNr: info.orderNr, partNr: info.partNr,
      func: info.func && `=${info.func}`, loc: info.loc && `+${info.loc}`, note: info.note,
      plcAddress: undefined, plcSymbol: undefined, plcComment: undefined,
    };
    // Contatti ausiliari con la bobina: la loro descrizione, se ce l'hanno, al posto di quella del dispositivo
    const auxDescr = (e: typeof d.elements[number]) => (d.main && e !== d.main && e.sym.role === 'aux' && e.inst.description ? L.t(e.inst.description) : undefined);
    for (const e of d.elements) {
      if (!e.sym.fields?.length) continue;
      const v: Partial<Record<FieldKey, string>> = {};
      const own = auxDescr(e);
      for (const f of e.sym.fields) {
        const val = f.f === 'description' && own ? own : values[f.f];
        if (val && vis(f.f, e.sym)) v[f.f] = val;
      }
      deviceFields.set(e.inst.id, v);
    }
    for (const e of d.elements) {
      const own = auxDescr(e);
      if (own && textsUnderTag(e.sym) && vis('description') && !e.sym.fields?.some(f => f.f === 'description')) deviceLines.set(e.inst.id, wrap(own, 26, L.second ? 3 : 2));
    }
    // Sotto la sigla i dati scelti; quelli già messi come testi del componente non si ripetono
    const head = d.main ?? d.elements[0];
    const own = new Set(head.sym.fields?.map(f => f.f));
    const lines = !textsUnderTag(head.sym) ? [] : DEVICE_LINE_KEYS.filter(k => !own.has(k) && vis(k)).flatMap(k =>
      k === 'description' ? wrap(L.t(info.description ?? ''), 26, L.second ? 3 : 2) : info[k] ? [info[k]!] : []);
    if (lines.length) deviceLines.set(head.inst.id, lines);
  }
  // Punti I/O PLC: indirizzo e nome simbolico
  const plcTexts = new Map<string, { address: string; symbol: string; ref?: string }>();
  const refs = overviewRefs(project);
  for (const r of ioAssignments(project, library, false)) {
    if (!r.inst) continue;
    plcTexts.set(r.inst.id, { address: r.address, symbol: r.symbolIsDefault ? '' : r.symbol, ref: refs.get(r.card.tag) });
    // Blocchetti I/O: indirizzo, variabile e commento nei testi del simbolo
    const sym = getSymbol(r.inst.symbolId, project);
    if (sym?.fields?.some(f => f.f.startsWith('plc'))) {
      // I testi troppo lunghi per il riquadro si accorciano con "…"
      const box = sym.prims.find(p => p.t === 'rect');
      const fit = (k: FieldKey, v: string | undefined) => {
        const f = sym.fields!.find(x => x.f === k);
        if (v && f?.max && v.length > f.max) return `${v.slice(0, f.max - 1)}…`;
        if (f?.max) return v;
        if (!v || !f || !box || box.t !== 'rect' || (f.anchor ?? 'start') !== 'start') return v;
        const max = Math.floor((box.x + box.w - f.x - 0.5) / ((f.size ?? 1.9) * 0.6));
        return max > 1 && v.length > max ? `${v.slice(0, max - 1)}…` : v;
      };
      const vis = (k: SymVisKey) => show.get(r.inst!.id)?.[k] !== false;
      deviceFields.set(r.inst.id, {
        ...deviceFields.get(r.inst.id), plcAddress: vis('plcAddress') ? r.address : undefined,
        plcSymbol: vis('plcSymbol') ? fit('plcSymbol', r.symbol) : undefined, plcComment: vis('plcComment') ? fit('plcComment', r.comment ? L.t(r.comment) : undefined) : undefined,
      });
    }
  }
  const overviews = project.pages.some(p => p.type === 'plc') ? overviewData(project, library) : new Map();
  const strips = project.pages.some(p => p.type === 'strip') ? stripSheets(project, library, netlist.nets) : new Map();
  // Cavi: sigla e conduttori da scrivere sulle linee di definizione
  const cableMarks = new Map<string, CableMark>();
  if (project.cables?.length) {
    // Capi dei fili per pagina: un filo che arriva sul punto di connessione dello schermo lo collega (niente simbolo di terra)
    const wireEnds = new Map<string, Set<string>>();
    const ek = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
    for (const pg of project.pages) {
      if (!pg.elements.some(e => e.kind === 'cable')) continue;
      const set = new Set<string>();
      for (const w of pg.elements) if (w.kind === 'wire' && w.points.length > 1) { set.add(ek(w.points[0])); set.add(ek(w.points[w.points.length - 1])); }
      wireEnds.set(pg.id, set);
    }
    const cst = cableStyleOf(project);
    for (const ci of cableInfos(project, netlist)) {
      const c = ci.cable;
      // Rappresentazione principale: la linea scelta, altrimenti la prima del progetto
      const main = (ci.lines.find(l => l.line.main) ?? ci.lines[0])?.line.id;
      for (const l of ci.lines) {
        const conductors = ci.marks.filter(k => k.lineId === l.line.id);
        const sh = c.shield ? shieldGeometry(l.line, conductors.map(k => k.at), shieldDims(cst, l.line)) : undefined;
        cableMarks.set(l.line.id, {
          label: `-${c.tag}`,
          sub: [c.type, cableSection(c)].filter(Boolean).join(' '),
          type: c.type, section: cableSection(c), description: c.description ? L.t(c.description) : undefined,
          main: l.line.id === main,
          conductors,
          ...(c.shield ? { shield: true, shieldLead: sh?.lead?.to, shieldWired: !!sh?.lead && !!wireEnds.get(l.pageId)?.has(ek(sh.lead.to)) } : {}),
          // Coppie intrecciate: i conduttori del cavo a due a due, nell'ordine
          ...(c.pairs ? { pairs: Array.from({ length: Math.floor(c.conductors.length / 2) }, (_, k) => [c.conductors[2 * k], c.conductors[2 * k + 1]] as [string, string]) } : {}),
        });
      }
    }
  }
  // Nuvolette: modifiche dopo l'ultima revisione congelata
  // (le modifiche vicine in una sola nuvoletta, con il triangolo dell'indice e le note non nascoste)
  const clouds = new Map<string, RevisionCloud[]>();
  const lastRev = lastRevision(project);
  if (lastRev && project.revisionState !== 'released' && settingsOf(project).showRevisionClouds) {
    const index = nextRevisionIndex(project), notes = project.revisionNotes ?? {};
    for (const c of changesSince(project, lastRev.snapshot)) {
      clouds.set(c.page.id, mergeClouds(c.items).map(m => ({
        box: m.box, index,
        notes: m.ids.map(id => notes[`${c.page.id}:${id}`]).filter(n => n?.text && !n.hidden).map(n => n!.text),
      })));
    }
  }
  // Pagine di lista: righe del foglio
  // Scala di tutti i testi delle liste sui caratteri della lista (scelti o di serie)
  const k = listTextScale(project), RD = REPORT_DEFAULTS;
  const scaled = (st: ReportStyle): ReportStyle => (k === 1 ? st : {
    ...st, titleSize: (st.titleSize ?? RD.titleSize) * k, headSize: (st.headSize ?? RD.headSize) * k, textSize: (st.textSize ?? RD.textSize) * k,
    columns: st.columns && Object.fromEntries(Object.entries(st.columns).map(([c, v]) => [c, v.size ? { ...v, size: v.size * k } : v])),
  });
  // Calcolo pigro: le liste e i disegni dei cavi si preparano solo quando qualcuno legge reportSheet/drawing
  // della pagina (la pagina aperta, la stampa e il PDF, le miniature), non a ogni modifica dello schema
  let sheetsCache: Map<string, ReportSheet> | undefined;
  const sheets = () => sheetsCache ??= withNetlistCache(project, () => {
    const out = new Map<string, ReportSheet>();
    // Blocchi: le liste intere e, per le liste divise per quadro, le righe di ogni luogo
    const tables = new Map(reportBlocks(project, library, given ?? projectReports(project, library)).map(b => [blockKey(b.title, b.panel), b.table]));
    for (const pg of project.pages) {
      const t = pg.type === 'report' && pg.report ? tables.get(blockKey(pg.report, pg.reportPanel)) : undefined;
      if (!t) continue;
      // Impaginazione scelta per la lista: ordine delle righe, altezza delle righe, colonne
      const style = reportStyleOf(project, t.title), rowH = styledRowH(t, style), tt = sortedTable(t, style);
      const r = sheetRanges(t, style)[pg.reportSheet ?? 0], first = r?.first ?? 0, n = r?.n ?? 0;
      out.set(pg.id, { table: translateTable(project, { ...tt, rowH, rows: tt.rows.slice(first, first + n), goto: tt.goto?.slice(first, first + n), symbols: tt.symbols?.slice(first, first + n) }), first, keys: columnKeys(t.columns), style: scaled(style) });
    }
    return out;
  });
  // Colore del conduttore: il primo colore scelto su uno dei suoi fili vale per tutti gli altri
  // (anche sulle altre pagine, tramite i rimandi, e oltre i morsetti di passaggio)
  const groupColor = new Map<string, string>();
  for (const n of netlist.nets) for (const w of n.wires) if (w.wire.color && !groupColor.has(n.group)) groupColor.set(n.group, w.wire.color);
  const conductorColor = new Map<string, string>();
  for (const n of netlist.nets) {
    const c = groupColor.get(n.group);
    if (c) for (const w of n.wires) if (!w.wire.color && !w.wire.bus) conductorColor.set(w.wire.id, c);
  }
  const textStyles = textStylesOf(settings);
  const bundleWidth = lookOf(settings).w.bundle;
  const pages = new Map<string, PageDerived>();
  for (const pg of project.pages) {
    // Numeri filo in un punto libero del filo (non sotto componenti, sigle o altri fili)
    const texts = new Map<string, string>(), sizes = new Map<string, number>(), gaps = new Map<string, number>();
    for (const e of pg.elements) if (e.kind === 'wire' && wireNumbers.has(e.id)) {
      texts.set(e.id, wireNumbers.get(e.id)!);
      sizes.set(e.id, e.labelSize ?? wireTextStyle(textStyles, e).size);
      const gap = wireLabelGap(e, bundleWidth);
      if (gap) gaps.set(e.id, gap);
    }
    const wireLabelPos = texts.size ? placeWireLabels(project, pg, texts, designations, deviceLines, netlist.junctions.get(pg.id) ?? [], sizes, gaps) : undefined;
    const pd: PageDerived = { conductorColor, wireLabelPos, labels, xrefs, linkTargets, linkWaiting, stripLabel, wireNumbers, wireTicks, wireRefs, bundleTaps: bundles.taps.filter(t => t.pageId === pg.id && t.name).map(t => ({ at: t.at, next: t.next, name: t.name!, size: t.bundle.tapSize, color: t.bundle.tapColor })), designations, deviceLines, deviceFields, show, textStyles, plcTexts, drawWireColors: settingsOf(project).drawWireColors, contactImageBottom: settingsOf(project).contactImage !== 'symbol', contactImageText: settingsOf(project).contactImageStyle === 'text', pairLines: pairLines.get(pg.id), terminalText: settingsOf(project).terminalText, freeTexts: settingsOf(project).freeSymbolTexts, overview: pg.cardId ? overviews.get(pg.cardId) : undefined, stripSheet: strips.get(pg.id), cableMarks, revisionClouds: clouds.get(pg.id), connFrames: settingsOf(project).connectorFrames === false ? undefined : connectorFrames(project, pg), junctions: netlist.junctions.get(pg.id) ?? [], tNodes: pageTNodes(pg) };
    if (pg.type === 'report') Object.defineProperty(pd, 'reportSheet', { get: () => sheets().get(pg.id), enumerable: true, configurable: true });
    if (['cable', 'connector', 'system'].includes(pg.type)) {
      let drawing: ReturnType<typeof drawingData> | undefined, done = false;
      Object.defineProperty(pd, 'drawing', { get: () => (done ? drawing : (done = true, drawing = withNetlistCache(project, () => drawingData(project, pg, library, netlist)))), enumerable: true, configurable: true });
    }
    pages.set(pg.id, pd);
  }
  // Pagine proiettate: il contenuto del riquadro della pagina di origine, con i suoi testi; il riquadro
  // di origine rimanda alla pagina proiettata
  for (const pg of project.pages) {
    const src = projectionSource(project, pg);
    if (!src) continue;
    const pd = pages.get(pg.id), sd = pages.get(src.page.id);
    if (!pd || !sd) continue;
    pd.projected = { page: src.page, derived: sd, zone: src.zone };
    (sd.zoneRefs ??= new Map()).set(src.zone.id, { name: pg.name, id: pg.id });
  }
  return { pages, netlist, cableTagShown, linkWaiting: waiting.map(l => ({ id: l.inst.id, pageId: l.page.id })) };
}

/**
 * Numero, sezione o colore scritto sul filo? Accanto a un punto di potenziale solo se scelto sul
 * filo; il numero dei fili più corti della lunghezza minima delle impostazioni, pure
 */
export function wireLabelShown(w: Wire, key: WireVisKey, settings: ProjectSettings, atPotential: boolean): boolean {
  if (atPotential || (key === 'number' && wireTooShort(w, settings))) return !!w.show?.[key];
  return wireShown(w, key, settings);
}

/** Filo più corto della lunghezza minima per il numero filo (impostazioni ▸ Numeri filo) */
export function wireTooShort(w: Pick<Wire, 'points'>, settings: Pick<ProjectSettings, 'wireNoMinLength'>): boolean {
  const min = settings.wireNoMinLength ?? 0;
  if (!(min > 0)) return false;
  let len = 0;
  for (let i = 1; i < w.points.length; i++) len += Math.hypot(w.points[i].x - w.points[i - 1].x, w.points[i].y - w.points[i - 1].y);
  return len < min - 1e-6;
}

/** Il filo parte o arriva a un punto di potenziale della pagina? */
export function wireAtPotential(project: Project, page: Page, w: Wire): boolean {
  const ends = new Set([w.points[0], w.points[w.points.length - 1]].map(keyOf));
  return page.elements.some(e => {
    if (e.kind !== 'symbol') return false;
    const sym = getSymbol(e.symbolId, project);
    return sym?.role === 'potential' && pinsWorld(e, sym).some(p => ends.has(keyOf(p)));
  });
}

/** Spezza un testo in righe di al massimo `width` caratteri (al massimo `max` righe) */
export function wrap(text: string, width: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/.{0,1}$/, '…'); }
  return out;
}

/** Sezione e colore di un filo, es. "1,5 mm² BU" */
export function wireData(w: { cross?: string; color?: string }): string {
  const cross = w.cross;
  return [cross ? (/mm/.test(cross) ? cross : `${cross} mm²`) : '', w.color ?? ''].filter(Boolean).join(' ');
}
