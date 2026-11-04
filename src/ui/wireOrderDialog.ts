// Ordine dei collegamenti di un conduttore (sequenza di cablaggio da–a): la finestra mostra i punti
// nell'ordine attuale (scelto a mano, dai nodi a T, dal ripartitore o per posizione) e si riordinano;
// «Automatico» toglie l'ordine scelto a mano.
import { useStore } from '../model/store';
import { computeNetlist } from '../model/netlist';
import { netSequence, sequenceContext, pinKey, SEQ_MODE_NAMES } from '../model/wiringOrder';
import { columnOf } from '../model/types';
import { askOrder } from './Ask';
import { tx } from '../i18n/ui';

export async function editWireOrder(wireId: string) {
  const st = useStore.getState();
  const nl = computeNetlist(st.project);
  const net = nl.wireNet.get(wireId);
  if (!net) return;
  if (net.named) { st.logMsg(tx('{0} è una linea di potenziale: ogni punto si collega al potenziale, non c\'è un ordine da scegliere', net.name)); return; }
  if (net.pins.length < 3) { st.logMsg(tx('Il conduttore collega {0} punti: non c\'è un ordine da scegliere', net.pins.length)); return; }
  const seq = netSequence(sequenceContext(st.project), net);
  const items = seq.order.map(p => `-${p.ref}   ·   /${p.el.page.name}.${columnOf(p.pos.x)}`);
  const r = await askOrder(tx('Ordine dei collegamenti {0}', net.wireNo || net.name),
    tx('Il cablatore collega i punti in quest\'ordine, uno dopo l\'altro (in catena). Ora: {0}. Sposta le righe con le frecce o trascinandole; «Automatico» torna all\'ordine dai nodi a T, dal ripartitore o per posizione.', tx(SEQ_MODE_NAMES[seq.mode])),
    items, tx('Automatico'));
  if (r === null) return;
  const keys = net.pins.map(pinKey);
  if (r === 'reset') useStore.getState().setWireOrder(keys, null);
  else useStore.getState().setWireOrder(keys, r.map(i => pinKey(seq.order[i])));
}
