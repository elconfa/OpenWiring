// Proprietà mostrate sullo schema: ogni proprietà di simboli, rimandi e fili ha un interruttore
// mostra/nascondi. Senza scelta vale il comportamento predefinito (impostazioni del progetto):
// la proprietà nascosta resta nei dati, nelle liste e nelle viste dei componenti.
import type { ProjectSettings, SymbolDef, Wire } from './types';

/** Proprietà di un simbolo che si possono scrivere sullo schema */
export type SymVisKey =
  | 'tag' | 'func' | 'loc' | 'description' | 'techData' | 'manufacturer' | 'typeNr' | 'orderNr' | 'partNr' | 'note'
  | 'pins' | 'xref' | 'refs' | 'plcAddress' | 'plcSymbol' | 'plcComment' | 'netAddress'
  /** Morsetti: sigla della morsettiera (senza scelta solo sul primo morsetto della morsettiera nella pagina) */
  | 'strip';
/** Proprietà di un filo che si possono scrivere sullo schema */
/** cable: sigla del cavo sui collegamenti di rete */
export type WireVisKey = 'number' | 'cross' | 'color' | 'cable';

export type ShowMap<K extends string> = Partial<Record<K, boolean>>;

/** Dati del dispositivo scritti sotto la sigla, in quest'ordine */
export const DEVICE_LINE_KEYS = ['description', 'techData', 'manufacturer', 'typeNr', 'orderNr', 'partNr', 'note'] as const;

/**
 * La proprietà del simbolo va scritta sullo schema? show: scelte del dispositivo (o del simbolo,
 * per rimandi, potenziali e morsetti); showTexts: «Testi sullo schema» del dispositivo e del
 * progetto, per descrizione e dati tecnici; fields: testi messi nel simbolo con l'editor
 * (descrizione, costruttore…), che si vedono sempre salvo scelta contraria.
 */
export function symShown(show: ShowMap<SymVisKey> | undefined, key: SymVisKey, ctx: {
  showTexts?: boolean; settings?: Pick<ProjectSettings, 'showDeviceTexts'>; sym?: Pick<SymbolDef, 'fields'>;
} = {}): boolean {
  const own = show?.[key];
  if (own !== undefined) return own;
  if (ctx.sym?.fields?.some(f => f.f === key)) return true;
  if (key === 'description' || key === 'techData') return ctx.showTexts ?? ctx.settings?.showDeviceTexts ?? true;
  return !(DEVICE_LINE_KEYS as readonly string[]).includes(key);
}

/** La proprietà del filo va scritta sullo schema? Predefinito: numeri filo e dati del filo del progetto */
export function wireShown(w: Pick<Wire, 'show'>, key: WireVisKey, settings: Pick<ProjectSettings, 'showWireNumbers' | 'showWireData'>): boolean {
  return w.show?.[key] ?? (key === 'number' ? settings.showWireNumbers : settings.showWireData);
}

/** Nuova mappa con la scelta: undefined se torna tutto come predefinito */
export function withShow<K extends string>(show: ShowMap<K> | undefined, key: K, value: boolean | undefined): ShowMap<K> | undefined {
  const out = { ...(show ?? {}) } as ShowMap<K>;
  if (value === undefined) delete out[key]; else out[key] = value;
  return Object.keys(out).length ? out : undefined;
}
