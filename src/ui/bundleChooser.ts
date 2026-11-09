// Modalità BUS: nome del bus appena disegnato e conduttore dei fili che vi entrano, scelti da un
// elenco filtrato mentre si scrive (i conduttori già presenti nel bus prima, poi quelli comuni)
import { useStore } from '../model/store';
import { bundleTaps, isBundle, conductorChoices, bundleCable, type BundleTap } from '../model/bundles';
import { partsIndex } from '../model/devices';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

/** Chiede il conduttore di ogni estremo senza nome che entra in un bus; null se l'utente annulla */
async function askTaps(open: BundleTap[]) {
  const st = useStore.getState;
  for (const t of open) {
    const { taps, names } = bundleTaps(st().project);
    const bus = names.get(t.group);
    // Cavo del bus (progetto o articolo): i suoi conduttori in ordine, con quelli usati e quelli liberi;
    // proposto il primo che aspetta l'uscita, altrimenti il primo libero
    const choices = conductorChoices(st().project, taps, t.group, bus, partsIndex(st().project, st().library));
    const items = choices.map(c => ({
      value: c.name, tone: (c.count === 1 ? 'wait' : c.count ? 'used' : 'free') as 'wait' | 'used' | 'free',
      label: c.count === 1 ? tx('{0} · entrato, aspetta l\'uscita', c.name) : c.count ? tx('{0} · già usato ({1})', c.name, c.count) : tx('{0} · libero', c.name),
    }));
    const pick = Math.max(choices.findIndex(c => c.count === 1), -1);
    const first = pick >= 0 ? pick : choices.findIndex(c => !c.count);
    const r = await askCombo(
      bus ? tx('Conduttore nel bus «{0}»', bus) : tx('Conduttore nel bus'),
      tx('Il filo entra nel bus: i fili con lo stesso conduttore sullo stesso bus sono collegati tra loro.'),
      first >= 0 ? choices[first].name : '', items, first, tx('es. L1, PE, +24V'),
    );
    if (!r) return;
    if (r.text) st().setWireTap(t.wire.id, t.end, r.text);
  }
}

/** Dopo aver disegnato un filo: conduttore degli estremi che toccano un bus */
export async function chooseNewTaps(before: Set<string>) {
  const { project, pageId } = useStore.getState();
  const open = bundleTaps(project).taps.filter(t => t.pageId === pageId && !t.name && !before.has(t.wire.id));
  if (open.length) await askTaps(open);
}

/** Dopo aver disegnato un bus: nome (stesso nome = stesso bus su più pagine), poi i fili che già lo toccano */
export async function chooseBundleName(wireId: string) {
  const st = useStore.getState;
  const all = st().project.pages.flatMap(pg => pg.elements).filter(e => e.kind === 'wire' && isBundle(e) && e.id !== wireId);
  const existing = [...new Set(all.map(e => (e.kind === 'wire' ? e.bundle ?? '' : '')).filter(Boolean))];
  const r = await askCombo(
    tx('Nome del bus di conduttori'),
    tx('Facoltativo, es. «400V AC» o «24V DC». Un bus con lo stesso nome su un\'altra pagina è lo stesso bus: i conduttori proseguono.'),
    '', existing.map(n => ({ value: n, label: n })), -1, tx('nome del bus'),
  );
  if (r?.text) st().updateElement(wireId, { bundle: r.text });
  // Bus usato come cavo: articolo del cavo (i suoi conduttori saranno proposti in ordine), se il nome
  // non è già quello di un cavo del progetto e il bus non ne ha già uno
  const same = st().project.pages.flatMap(pg => pg.elements).find(e => e.kind === 'wire' && e.id !== wireId && isBundle(e) && e.bundlePart && r?.text && e.bundle === r.text);
  const cableParts = [...partsIndex(st().project, st().library).values()].filter(p => p.cable?.conductors.length);
  if (same?.kind === 'wire') st().updateElement(wireId, { bundlePart: same.bundlePart });
  else if (!bundleCable(st().project, r?.text) && cableParts.length) {
    const a = await askCombo(
      tx('Articolo del cavo (facoltativo)'),
      tx('Se il bus rappresenta un cavo, scegli il suo articolo: i conduttori (colori o numeri) saranno proposti in ordine. Vuoto per un bus di alimentazione (L1, L2, PE…).'),
      '', cableParts.map(p => ({ value: p.partNr, label: [p.partNr, p.descr1, `${p.cable!.conductors.length} cond.`].filter(Boolean).join(' · ') })), -1, tx('codice articolo'),
    );
    if (a?.text) st().updateElement(wireId, { bundlePart: a.text });
  }
  const open = bundleTaps(st().project).taps.filter(t => t.bundle.id === wireId && !t.name)
    .sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  if (open.length) await askTaps(open);
}
