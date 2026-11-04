// Linea di definizione cavo appena disegnata: se nel progetto ci sono già cavi si sceglie se è un
// cavo nuovo o un tratto di un cavo esistente (es. lo stesso cavo da 25 fili su più pagine); i fili
// attraversati prendono i conduttori ancora liberi di quel cavo.
import { useStore } from '../model/store';
import { cableInfos, cableSection, crossedWires } from '../model/cables';
import { askList } from './Ask';
import { tx } from '../i18n/ui';
import type { Pt } from '../model/types';

/** Ultimo cavo scelto: si propone di nuovo per la linea successiva */
let lastChosen: string | undefined;

export async function addCableLineAsk(a: Pt, b: Pt) {
  const st = useStore.getState;
  const { project, pageId } = st();
  const infos = cableInfos(project).sort((x, y) => x.cable.tag.localeCompare(y.cable.tag, undefined, { numeric: true }));
  if (!infos.length) { st().addCableLine(a, b); return; }
  const page = project.pages.find(p => p.id === pageId);
  const crossing = page ? crossedWires(page, { points: [a, b] }).length : 0;
  const items = [
    tx('Cavo nuovo'),
    ...infos.map(i => {
      const pages = [...new Set(i.lines.map(l => l.loc.split('.')[0]))];
      return [`-${i.cable.tag}`, i.cable.type, cableSection(i.cable), tx('liberi {0} su {1}', i.spare.length, i.cable.conductors.length),
        pages.length ? tx('pagine {0}', pages.join(', ')) : ''].filter(Boolean).join(' · ');
    }),
  ];
  const sel = Math.max(0, infos.findIndex(i => i.cable.id === lastChosen) + 1);
  const r = await askList(tx('Linea di cavo: quale cavo?'),
    tx('La linea attraversa {0} fili. Scegli «Cavo nuovo» o un cavo esistente: i fili prendono i suoi conduttori liberi.', crossing), items, sel);
  if (r === null) return;
  const id = r > 0 ? infos[r - 1].cable.id : undefined;
  lastChosen = id;
  st().addCableLine(a, b, id);
}
