// Riferimento a coppie partendo dall'elemento principale (bobina, salvamotore…): elenco dei suoi contatti
// già piazzati nello schema; scelto uno, si disegna la sua rappresentazione con un clic (vedi model/pairs.ts).
import { useStore } from '../model/store';
import { crossReferences } from '../model/devices';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

/** Tipo del contatto scritto nell'elenco */
const kindLabel = (k: string) => (k === 'NO' ? tx('NA') : k === 'NC' ? tx('NC') : k === 'CO' ? tx('in scambio') : k === 'power' ? tx('di potenza') : '');

/** Contatti del dispositivo principale mainId, con il testo dell'elenco */
export function representationChoices(mainId: string) {
  const { project } = useStore.getState();
  // Prima gli ausiliari (il caso più comune), in fondo i contatti di potenza
  const contacts = [...(crossReferences(project).get(mainId)?.contacts ?? [])].sort((a, b) => Number(a.kind === 'power') - Number(b.kind === 'power'));
  return contacts.map(c => ({
    value: c.id,
    label: [c.labels || '—', kindLabel(c.kind), `/${c.location}`].filter(Boolean).join(' · '),
  }));
}

/** Sceglie un contatto dell'elemento principale e avvia il disegno della sua rappresentazione */
export async function chooseRepresentation(mainId: string) {
  const st = useStore.getState;
  const main = st().project.pages.flatMap(p => p.elements).find(e => e.id === mainId);
  const items = representationChoices(mainId);
  if (!main || main.kind !== 'symbol') return;
  if (!items.length) { st().logMsg(tx('-{0} non ha ancora contatti nello schema: inserisci prima il contatto, poi la sua rappresentazione', main.tag), 'warn'); return; }
  const r = await askCombo(
    tx('-{0}: rappresentazione di quale contatto?', main.tag),
    tx('Scegli il contatto da disegnare anche qui (per esempio l\'ausiliario accanto ai poli), poi un clic dove va disegnato. È solo disegno: sigla e morsetti seguono il contatto vero.'),
    items[0].label, items.map(i => ({ value: i.label, label: i.label })), 0,
  );
  if (!r) return;
  const i = r.index >= 0 ? r.index : items.findIndex(x => x.label === r.text);
  if (i >= 0) st().startRepresentation(items[i].value);
}
