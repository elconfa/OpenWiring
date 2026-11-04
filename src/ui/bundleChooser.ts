// Modalità BUS: nome del bus appena disegnato e conduttore dei fili che vi entrano, scelti da un
// elenco filtrato mentre si scrive (i conduttori già presenti nel bus prima, poi quelli comuni)
import { useStore } from '../model/store';
import { bundleTaps, bundleConductors, isBundle, COMMON_CONDUCTORS, type BundleTap } from '../model/bundles';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

/** Chiede il conduttore di ogni estremo senza nome che entra in un bus; null se l'utente annulla */
async function askTaps(open: BundleTap[]) {
  const st = useStore.getState;
  for (const t of open) {
    const { taps, names } = bundleTaps(st().project);
    const inBus = bundleConductors(taps, t.group);
    const items = [
      ...inBus.map(c => ({ value: c.name, label: tx('{0} · già nel bus ({1})', c.name, c.count) })),
      ...COMMON_CONDUCTORS.filter(n => !inBus.some(c => c.name === n)).map(n => ({ value: n, label: n })),
    ];
    const bus = names.get(t.group);
    const r = await askCombo(
      bus ? tx('Conduttore nel bus «{0}»', bus) : tx('Conduttore nel bus'),
      tx('Il filo entra nel bus: i fili con lo stesso conduttore sullo stesso bus sono collegati tra loro.'),
      '', items, -1, tx('es. L1, PE, +24V'),
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
  const open = bundleTaps(st().project).taps.filter(t => t.bundle.id === wireId && !t.name)
    .sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  if (open.length) await askTaps(open);
}
