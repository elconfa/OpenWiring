// Come il formato testo porta ogni dato di elementi, cavi e morsettiere. L'elenco è completo per
// costruzione: se si aggiunge un campo a uno di questi tipi senza scriverlo qui, la compilazione
// (npm run typecheck, anche nella CI) fallisce. Valore: l'attributo del testo, oppure «no: motivo»
// per i dati che il testo non porta di proposito (il test di andata e ritorno li esclude).
import type { SymbolInstance, Wire, TextItem, CableLine, WireDef, Zone, Cable, TerminalStripData, BusCable } from './types';

type Coverage<T> = Record<Exclude<keyof T, 'kind' | 'id'>, string>;

export const TEXT_COVERAGE = {
  symbol: {
    symbolId: 'simbolo <id>', x: '@x,y', y: '@x,y', rot: 'rot=', mirror: 'specchio', tag: '<sigla>', pinLabels: 'pin=', autoPins: 'pin=',
    partNr: 'articolo=', extraParts: 'articoli=', userProps: 'proprieta=', description: 'descr=', techData: 'dati=', manufacturer: 'costruttore=',
    typeNr: 'tipo=', orderNr: 'ordine=', note: 'note=', func: 'funzione=', loc: 'luogo=', showTexts: 'testi=', show: 'mostra=',
    plcChannel: 'canale=', wirePass: 'numerofilo=', linkTo: 'con=', linkStar: 'stella', pairOf: 'coppia=', pairCompact: 'ridotta', pairSide: 'afianco', pairSize: 'hcoppia=', plcGroup: 'no: i gruppi I/O PLC si inseriscono dall\'interfaccia',
    plcSymbol: 'variabile=', plcComment: 'commento=', textOffsets: 'postesti=', contactImage: 'immaginecontatti=', termText: 'versotesti=',
    netAddress: 'indirizzo=', ip: 'ip=', netIfs: 'interfacce=',
  } satisfies Coverage<SymbolInstance>,
  wire: {
    points: 'filo x,y x,y', cross: 'sezione=', color: 'colore=', wireType: 'tipo=', number: 'n=', show: 'mostra=', labels: 'posnumeri=',
    bus: 'bus=', busCable: 'cavo= tipocavo= lunghezza= articolocavo=', poles: 'poli=', text: 'testo=', lineType: 'linea=', width: 'spessore=',
    labelSize: 'hnumero=', tickAt: 'lineetta=', spare: 'scorta=', labelColor: 'colorenumero=', bundle: 'busfili=', bundlePart: 'articolobus=', tapSize: 'hcond=', tapColor: 'colorecond=', tapStart: 'cond1=', tapEnd: 'cond2=', tNode: 'nodo1= nodo2=', userProps: 'proprieta=',
  } satisfies Coverage<Wire>,
  busCable: { tag: 'cavo=', type: 'tipocavo=', length: 'lunghezza=', partNr: 'articolocavo=', auto: 'no: dato interno della sigla automatica' } satisfies Record<keyof BusCable, string>,
  text: { x: '@x,y', y: '@x,y', text: '"<testo>"', size: 'h=', rot: 'rot=', w: 'l=', align: 'allinea=' } satisfies Coverage<TextItem>,
  cable: {
    cableId: 'lineacavo -<sigla>', points: 'x,y x,y', main: 'principale', show: 'testi=', labelPos: 'posizione=', labelOffset: 'spostamento=',
    shieldGround: 'schermo=', shieldHeight: 'altezzaschermo=', condDir: 'nomi=', look: 'aspetto=',
  } satisfies Coverage<CableLine>,
  wiredef: { points: 'sezionefili x,y x,y', cross: 'sezione=', label: 'scritta=' } satisfies Coverage<WireDef>,
  zone: { panelId: 'riquadro +<luogo>', x: '@x,y', y: '@x,y', w: '<l>x<h>', h: '<l>x<h>', label: 'scritta=', codeOnly: 'solosigla', look: 'aspetto=' } satisfies Coverage<Zone>,
  image: Object.fromEntries((['x', 'y', 'w', 'h', 'src', 'name', 'border', 'front'] as const).map(k => [k, 'no: le immagini restano sulla pagina'])) as Record<string, string>,
  cableData: {
    tag: 'cavo -<sigla>', type: 'tipo=', cross: 'sezione=', conductors: 'conduttori=', marking: 'marcatura=', shield: 'schermato', pairs: 'coppie',
    length: 'lunghezza=', pieces: 'pezzi=', description: 'descr=', from: 'da=', to: 'a=', partNr: 'articolo=',
    assign: 'filo … conduttore=', fixed: 'filo … fissato=', pinsOf: 'pindi=',
  } satisfies Record<Exclude<keyof Cable, 'id'>, string>,
  strip: {
    partNr: 'articolo=', endPlatePartNr: 'piastra=', endPlateQty: 'piastre=', endStopPartNr: 'fermo=', endStopQty: 'fermi=', accessories: 'accessori=',
    jumperPartNr: 'ponticello=', separatorPartNr: 'separatore=', jumpers: 'ponticelli=', spares: 'riserve=', spareParts: 'articoliriserve=', separators: 'separatori=',
  } satisfies Record<keyof TerminalStripData, string>,
};

/** Campi che il testo non porta di proposito, per tipo di elemento */
export const notInText = (kind: keyof typeof TEXT_COVERAGE): string[] =>
  Object.entries(TEXT_COVERAGE[kind] as Record<string, string>).filter(([, v]) => v.startsWith('no:')).map(([k]) => k);
