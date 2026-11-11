// Rimandi tra pagine: ogni rimando di partenza è collegato a un solo rimando di arrivo
// (SymbolInstance.linkTo, scritto su entrambi). Il nome del rimando può ripetersi (per esempio è
// il numero del filo), l'abbinamento no.
// Una partenza si collega solo a un arrivo e viceversa, mai due partenze o due arrivi.
// Rimandi senza abbinamento valido (progetti precedenti, incollati, corrispondente eliminato): si
// abbinano per nome, ogni arrivo con la partenza libera più vicina che lo precede.
// Partenza a stella (SymbolInstance.linkStar): collegata a tutti gli arrivi con lo stesso nome;
// gli arrivi scelti a mano scrivono linkTo verso la stella, la stella non scrive niente.
import type { Project, SymbolInstance } from './types';
import { allPlaced, type PlacedElement } from './devices';

/** Rimando lasciato senza corrispondente per scelta (voce vuota): non si abbina nemmeno per nome */
export const NO_PARTNER = '-';
/**
 * Rimando in attesa del corrispondente non ancora disegnato (scelta dell'utente): non si abbina da solo
 * per nome; si collega solo scegliendo il corrispondente (o quando l'altro, inserito dopo, sceglie lui)
 */
export const WAITING = '?';

/** Rimando di arrivo (freccia verso il conduttore); gli altri rimandi sono di partenza */
export const isIncomingLink = (symbolId: string) => symbolId === 'link_in';

const linksOf = (project: Project) => allPlaced(project).filter(e => e.sym.role === 'link');

/** Corrispondenti di ogni rimando (id del rimando → rimandi collegati) */
export function linkPartners(project: Project, placed: PlacedElement[] = linksOf(project)): Map<string, PlacedElement[]> {
  const links = placed.filter(e => e.sym.role === 'link');
  const byId = new Map(links.map(e => [e.inst.id, e]));
  const out = new Map<string, PlacedElement[]>(links.map(e => [e.inst.id, []]));
  const paired = new Set<string>();
  const star = (e: PlacedElement) => !!e.inst.linkStar && !isIncomingLink(e.inst.symbolId);
  for (const l of links) {
    const to = l.inst.linkTo;
    if (!to || paired.has(l.inst.id) || star(l)) continue;
    const o = byId.get(to);
    if (o && star(o)) continue;
    // L'abbinamento vale se è reciproco (o se l'altro non ne ha ancora uno)
    if (!o || o === l || paired.has(o.inst.id) || (o.inst.linkTo && o.inst.linkTo !== l.inst.id)) continue;
    if (isIncomingLink(o.inst.symbolId) === isIncomingLink(l.inst.symbolId)) continue;
    out.get(l.inst.id)!.push(o);
    out.get(o.inst.id)!.push(l);
    paired.add(l.inst.id); paired.add(o.inst.id);
  }
  // Stelle: tutti gli arrivi liberi con lo stesso nome (non quelli lasciati senza corrispondente
  // per scelta, né quelli scelti a mano per un'altra stella)
  for (const s of links) {
    if (!star(s) || !s.inst.tag) continue;
    for (const i of links) {
      if (!isIncomingLink(i.inst.symbolId) || paired.has(i.inst.id) || i.inst.linkTo === NO_PARTNER || i.inst.linkTo === WAITING) continue;
      const to = i.inst.linkTo ? byId.get(i.inst.linkTo) : undefined;
      if (to !== s && (i.inst.tag !== s.inst.tag || (to && star(to)))) continue;
      out.get(s.inst.id)!.push(i);
      out.get(i.inst.id)!.push(s);
      paired.add(i.inst.id);
    }
    paired.add(s.inst.id);
  }
  // Rimandi senza abbinamento valido (progetti precedenti senza linkTo, rimandi incollati o messi
  // senza scegliere il corrispondente, abbinamento a un rimando che non c'è più): per nome, ogni
  // arrivo con la partenza libera più vicina che lo precede nell'ordine delle pagine
  const free = new Map<string, PlacedElement[]>();
  for (const l of links) {
    if (paired.has(l.inst.id) || !l.inst.tag || l.inst.linkTo === NO_PARTNER || l.inst.linkTo === WAITING) continue;
    const g = free.get(l.inst.tag);
    if (g) g.push(l); else free.set(l.inst.tag, [l]);
  }
  const order = (a: PlacedElement, b: PlacedElement) => a.pageIndex - b.pageIndex || a.inst.x - b.inst.x || a.inst.y - b.inst.y;
  for (const g of free.values()) {
    const ins = g.filter(l => isIncomingLink(l.inst.symbolId)).sort(order);
    const outs = g.filter(l => !isIncomingLink(l.inst.symbolId)).sort(order);
    for (const i of ins) {
      if (!outs.length) break;
      // La partenza sulla pagina precedente più vicina, poi sulla stessa pagina, altrimenti la prima libera
      let k = -1;
      outs.forEach((o, j) => { if (o.pageIndex < i.pageIndex && (k < 0 || o.pageIndex > outs[k].pageIndex)) k = j; });
      if (k < 0) k = outs.findIndex(o => o.pageIndex === i.pageIndex);
      // Una partenza che viene dopo l'arrivo solo per i progetti precedenti (come prima); per gli
      // altri sarebbe di solito la fine della stessa catena
      if (k < 0 && i.inst.linkTo === undefined) k = outs.findIndex(o => o.inst.linkTo === undefined);
      if (k < 0) continue;
      const [o] = outs.splice(k, 1);
      out.get(i.inst.id)!.push(o);
      out.get(o.inst.id)!.push(i);
    }
  }
  return out;
}

/**
 * Rimandi liberi a cui collegare il rimando indicato: di verso opposto, senza corrispondente (per un
 * arrivo anche le partenze a stella). Prima quelli con lo stesso nome, poi i più vicini: per un arrivo
 * le partenze sulle pagine precedenti, per una partenza gli arrivi sulle pagine seguenti
 */
export function freeLinksFor(project: Project, instId: string): PlacedElement[] {
  const links = linksOf(project);
  const me = links.find(e => e.inst.id === instId);
  if (!me) return [];
  const partners = linkPartners(project, links);
  const incoming = isIncomingLink(me.inst.symbolId);
  const rank = (o: PlacedElement) => { const d = o.pageIndex - me.pageIndex; return (incoming ? d <= 0 : d >= 0) ? Math.abs(d) : 10000 + Math.abs(d); };
  return links
    .filter(e => e !== me && isIncomingLink(e.inst.symbolId) !== incoming && (!partners.get(e.inst.id)?.length || (incoming && !!e.inst.linkStar)))
    .sort((a, b) => Number(b.inst.tag === me.inst.tag) - Number(a.inst.tag === me.inst.tag) || rank(a) - rank(b) || a.inst.y - b.inst.y || a.inst.x - b.inst.x);
}

/**
 * Rimandi in attesa del corrispondente: senza corrispondente, con un nome, non lasciati soli per scelta
 * e non in fondo a una catena (lo stesso conduttore arriva già da un rimando abbinato con lo stesso nome).
 * linksOfNet: gli altri rimandi sullo stesso conduttore
 */
export function waitingLinks(links: PlacedElement[], partners: Map<string, PlacedElement[]>, linksOfNet: (id: string) => string[] | undefined): PlacedElement[] {
  const byId = new Map(links.map(e => [e.inst.id, e]));
  return links.filter(l => l.inst.tag && l.inst.linkTo !== NO_PARTNER && !partners.get(l.inst.id)?.length
    && !linksOfNet(l.inst.id)?.some(id => id !== l.inst.id && partners.get(id)?.length && byId.get(id)?.inst.tag === l.inst.tag));
}

/**
 * Collega due rimandi (dentro un commit): ciascuno lascia il corrispondente precedente e il
 * rimando prende il nome dell'altro. Con to vuoto il rimando resta senza corrispondente (anche per nome),
 * con WAITING resta in attesa del corrispondente non ancora disegnato.
 */
export function pairLinks(project: Project, id: string, to: string): void {
  const all = project.pages.flatMap(p => p.elements).filter((e): e is SymbolInstance => e.kind === 'symbol');
  const find = (x: string) => all.find(e => e.id === x);
  const a = find(id);
  if (!a) return;
  const release = (e: SymbolInstance) => {
    const old = e.linkTo ? find(e.linkTo) : undefined;
    // Il corrispondente lasciato resta in attesa (non si riabbina da solo per nome a un altro rimando)
    if (old && old.linkTo === e.id) old.linkTo = WAITING;
  };
  release(a);
  if (to === WAITING) { a.linkTo = WAITING; return; }
  const b = to ? find(to) : undefined;
  // Solo partenza con arrivo: due partenze (o due arrivi) non si collegano
  if (!b || b === a || isIncomingLink(a.symbolId) === isIncomingLink(b.symbolId)) { a.linkTo = NO_PARTNER; return; }
  // Arrivo verso una partenza a stella: solo l'arrivo scrive il collegamento
  if (b.linkStar && !isIncomingLink(b.symbolId)) { a.linkTo = b.id; if (b.tag) a.tag = b.tag; return; }
  release(b);
  a.linkTo = b.id;
  b.linkTo = a.id;
  if (b.tag) a.tag = b.tag; else b.tag = a.tag;
}
