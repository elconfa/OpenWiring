// Aspetto delle pagine disegnate dai dati (cavi, connettori, schema d'insieme, panoramiche PLC):
// dimensioni dei testi, altezza massima delle righe delle tabelle e colonne da mostrare.
import type { DrawingStyle, DrawingStyleKind, Project } from './types';
import { tn } from '../i18n/ui';

export type DrawingSizeKey = 'titleSize' | 'textSize' | 'tableSize' | 'rowH';

export interface DrawingStyleDef {
  title: string;
  /** Valori di serie e testo di ogni misura */
  sizes: { key: DrawingSizeKey; label: string; def: number }[];
  /** Colonne (o parti) che si possono nascondere */
  columns: { key: string; label: string; width?: number }[];
}

export const DRAWING_STYLES: Record<DrawingStyleKind, DrawingStyleDef> = {
  cable: {
    title: tn('Disegni dei cavi'),
    sizes: [
      { key: 'titleSize', label: tn('Titolo'), def: 4 },
      { key: 'textSize', label: tn('Disegno: pin, morsetti, conduttori e numeri filo'), def: 2 },
      { key: 'tableSize', label: tn('Tabella'), def: 2 },
      { key: 'rowH', label: tn('Altezza massima delle righe della tabella'), def: 4.4 },
    ],
    columns: [
      { key: 'drawing', label: tn('Disegno del cavo') }, { key: 'name', label: tn('Conduttore'), width: 30 }, { key: 'wireNo', label: tn('N. filo'), width: 30 },
      { key: 'a', label: tn('Da'), width: 110 }, { key: 'b', label: tn('A'), width: 110 }, { key: 'loc', label: tn('Posizione'), width: 30 }, { key: 'note', label: tn('Note'), width: 60 },
    ],
  },
  connector: {
    title: tn('Piedinature dei connettori'),
    sizes: [
      { key: 'titleSize', label: tn('Titolo'), def: 4 },
      { key: 'textSize', label: tn('Numeri dei pin'), def: 1.4 },
      { key: 'tableSize', label: tn('Tabella'), def: 2 },
      { key: 'rowH', label: tn('Altezza massima delle righe della tabella'), def: 4.4 },
    ],
    columns: [{ key: 'no', label: tn('Pin'), width: 14 }, { key: 'a', label: tn('Lato 1'), width: 0 }, { key: 'b', label: tn('Lato 2'), width: 0 }, { key: 'wires', label: tn('Fili'), width: 30 }],
  },
  system: {
    title: tn('Schema d\'insieme'),
    sizes: [
      { key: 'titleSize', label: tn('Titolo'), def: 4 },
      { key: 'textSize', label: tn('Sigle dei dispositivi e dei cavi'), def: 2.2 },
      { key: 'tableSize', label: tn('Descrizioni'), def: 1.8 },
    ],
    columns: [{ key: 'description', label: tn('Descrizioni dei dispositivi') }, { key: 'picture', label: tn('Foto degli articoli') }, { key: 'cableText', label: tn('Tipo e lunghezza dei cavi') }],
  },
  plc: {
    title: tn('Panoramiche PLC'),
    sizes: [
      { key: 'titleSize', label: tn('Titolo'), def: 4 },
      { key: 'textSize', label: tn('Righe dei canali (al massimo)'), def: 2.2 },
    ],
    columns: [{ key: 'terminal', label: tn('Morsetto') }, { key: 'symbol', label: tn('Nome simbolico') }, { key: 'comment', label: tn('Commento') }, { key: 'connected', label: tn('Collegato a') }, { key: 'location', label: tn('Pagina') }],
  },
};

/** Scala di tutti i testi delle liste (pagine di lista, morsettiere, disegni): 1 = 100 % */
export const listTextScale = (p: Pick<Project, 'settings'>) => Math.max(0.3, Math.min(3, (p.settings?.listTextScale ?? 100) / 100));

/** Stile risolto: misure (scelte o di serie, con la scala dei testi delle liste), colonne visibili e larghezze scelte */
export function drawingStyleOf(p: Project, kind: DrawingStyleKind) {
  const own: DrawingStyle = p.settings?.drawingStyles?.[kind] ?? {};
  const def = DRAWING_STYLES[kind];
  const k = listTextScale(p);
  const size = (key: DrawingSizeKey) => own[key] ?? def.sizes.find(x => x.key === key)?.def ?? 2;
  const hidden = new Set(own.hide ?? []);
  return {
    titleSize: size('titleSize') * k, textSize: size('textSize') * k, tableSize: size('tableSize') * k, rowH: size('rowH'),
    show: (c: string) => !hidden.has(c), width: (c: string) => own.widths?.[c],
  };
}
export type ResolvedDrawingStyle = ReturnType<typeof drawingStyleOf>;
