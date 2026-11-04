// Scelta del dispositivo di un contatto appena inserito: le bobine e gli altri elementi principali
// del progetto (prima quelli con la stessa lettera), filtrati mentre si scrive, o una sigla nuova.
import { useStore } from '../model/store';
import { allPlaced, buildDevices, byPosition, locationOf } from '../model/devices';
import { letterOfTag } from '../model/numbering';
import { getSymbol } from '../model/geometry';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

/** Ultimo dispositivo scelto: si propone di nuovo per i contatti successivi */
let lastChosen: string | undefined;

/** Dispositivi a cui si può abbinare il contatto, con il testo dell'elenco */
export function auxChoices(instId: string) {
  const { project } = useStore.getState();
  const me = allPlaced(project).find(e => e.inst.id === instId);
  if (!me) return { me, items: [] as { value: string; label: string }[] };
  const letter = getSymbol(me.inst.symbolId, project)?.letter;
  const mains = [...buildDevices(project).values()].filter(d => d.main?.sym.role === 'main' && !d.elements.some(e => e.inst.id === instId));
  const same = (tag: string) => Number(!!letter && letterOfTag(tag, me.page.name) === letter);
  mains.sort((a, b) => same(b.tag) - same(a.tag) || byPosition(a.main!, b.main!));
  const items = mains.map(d => {
    const contacts = d.elements.filter(e => e.sym.role === 'aux').length;
    return {
      value: d.tag,
      label: [`-${d.tag}`, d.main!.inst.description, `/${locationOf(d.main!)}`, contacts ? tx('{0} contatti', contacts) : ''].filter(Boolean).join(' · '),
    };
  });
  return { me, items };
}

/** Dopo l'inserimento di un contatto: a quale dispositivo appartiene (o sigla nuova) */
export async function chooseAuxDevice(instId: string) {
  const st = useStore.getState;
  const { me, items } = auxChoices(instId);
  if (!me) return;
  const sel = items.findIndex(x => x.value === lastChosen);
  const r = await askCombo(
    tx('{0}: di quale dispositivo?', tx(me.sym.name)),
    items.length
      ? tx('Scegli la bobina o l\'apparecchio a cui appartiene il contatto, o scrivi una sigla nuova.')
      : tx('Nel progetto non ci sono ancora bobine o apparecchi: scrivi la sigla.'),
    me.inst.tag, items, sel, tx('sigla, es. 2K1'),
  );
  if (!r) return;
  const tag = r.text.replace(/^-/, '').trim();
  if (!tag || tag === me.inst.tag) return;
  if (r.index >= 0 || items.some(x => x.value === tag)) {
    lastChosen = tag;
    st().mergeIntoDevice(instId, tag);
  } else st().updateElement(instId, { tag });
}
