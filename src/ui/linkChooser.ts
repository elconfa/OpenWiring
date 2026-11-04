// Rimando corrispondente: dopo aver inserito un rimando si collega da solo al rimando libero di verso
// opposto con lo stesso nome; senza candidati resta in attesa e si collegherà quando si disegna l'altro.
// Con altri candidati si sceglie in un elenco con il più vicino già proposto (Invio lo collega).
import { useStore } from '../model/store';
import { freeLinksFor, isIncomingLink, linkPartners } from '../model/links';
import { allPlaced, locationOf } from '../model/devices';
import { computeNetlist } from '../model/netlist';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

/** Voci dell'elenco: "nessuno" e i rimandi liberi (nome · posizione · pagina) */
export function linkChoices(instId: string) {
  const { project } = useStore.getState();
  const free = freeLinksFor(project, instId);
  const me = allPlaced(project).find(e => e.inst.id === instId);
  const incoming = me ? isIncomingLink(me.inst.symbolId) : false;
  const label = (e: typeof free[number]) => [e.inst.tag || '?', `/${locationOf(e)}`, e.page.title].filter(Boolean).join(' · ');
  return {
    me, incoming, free,
    items: [tx('— nessun corrispondente (il conduttore finisce qui)'), ...free.map(label)],
  };
}

/** Dopo l'inserimento di un rimando: nome dal numero del filo e scelta del corrispondente */
export async function chooseLinkPartner(instId: string) {
  const st = useStore.getState;
  let { me } = linkChoices(instId);
  if (!me) return;
  // Il nome del rimando è il numero che il filo a cui è attaccato aveva prima del rimando (il filo
  // collegato a un rimando prende il nome del rimando, quindi il rimando nuovo resta senza nome)
  const { project } = st();
  const blank = { ...project, pages: project.pages.map(p => ({ ...p, elements: p.elements.map(e => e.id === instId ? { ...e, tag: '' } : e) })) };
  const net = computeNetlist(blank).nets.find(n => n.linkIds?.includes(instId));
  if (net?.wires.length && net.wireNo && net.wireNo !== me.inst.tag) st().updateInstance(instId, { tag: net.wireNo });
  const c = linkChoices(instId);
  me = c.me!;
  const tag = me.inst.tag;
  const where = (e: typeof c.free[number]) => `/${locationOf(e)}`;
  const pair = (e: typeof c.free[number]) => {
    st().pairLinks(instId, e.inst.id);
    st().logMsg(tx('Rimando "{0}" collegato a {1}', e.inst.tag || tag, where(e)));
  };
  // Un solo rimando libero con lo stesso nome: si collega senza domande
  const same = c.free.filter(e => tag && e.inst.tag === tag);
  if (same.length === 1) { pair(same[0]); return; }
  // Nessun rimando libero dell'altro verso: resta in attesa con il numero del filo
  if (!c.free.length && tag) { st().logMsg(tx('Rimando "{0}" in attesa del corrispondente: si collega da solo quando disegni l\'altro con lo stesso nome', tag)); return; }
  // Scelta tra i rimandi liberi (prima quelli con lo stesso nome, poi i più vicini): il primo è già
  // proposto e Invio lo collega; un nome nuovo lascia il rimando in attesa, Esc anche
  const r = await askCombo(
    c.incoming ? tx('Rimando di arrivo: da quale partenza?') : tx('Rimando di partenza: verso quale arrivo?'),
    c.free.length
      ? tx('Invio collega il rimando proposto (prende il suo nome). Scrivi un nome nuovo se il corrispondente non è ancora disegnato: il rimando resta in attesa e si collega quando lo disegni.')
      : tx('Nessun rimando libero da abbinare: scrivi il nome.'),
    tag, c.free.map(e => ({ value: e.inst.tag, label: c.items[c.free.indexOf(e) + 1] })), c.free.length ? 0 : -1, tx('nome del rimando'),
  );
  if (!r) return;
  if (r.index >= 0) { pair(c.free[r.index]); return; }
  const name = r.text.replace(/^-/, '').trim();
  if (name && name !== tag) st().updateInstance(instId, { tag: name });
}

/** Dopo un cambio di nome: se il rimando è in attesa e c'è un solo rimando libero dell'altro verso con quel nome, li collega */
export function pairByName(instId: string, tag: string): boolean {
  if (currentLinkPartner(instId).length) return false;
  const same = linkChoices(instId).free.filter(e => e.inst.tag === tag);
  if (same.length !== 1) return false;
  useStore.getState().pairLinks(instId, same[0].inst.id);
  return true;
}

/** Corrispondente attuale di un rimando (per il pannello delle proprietà) */
export function currentLinkPartner(instId: string) {
  return linkPartners(useStore.getState().project).get(instId) ?? [];
}
