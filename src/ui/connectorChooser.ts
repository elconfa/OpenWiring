// Pin di connettore presi dalla libreria (o dai preferiti): prima di posarli si sceglie il connettore,
// uno nuovo (con la sigla proposta, modificabile) o uno esistente da continuare. Senza la scelta il pin
// prendeva la sigla dell'ultimo connettore usato e finiva in un connettore di un'altra pagina.
import { useStore } from '../model/store';
import { getSymbol } from '../model/geometry';
import { allConnectors, connectorData, freePins, nextPin, pinCount } from '../model/connectors';
import { allStrips } from '../model/terminals';
import { nextTagFor } from '../model/numbering';
import { askCombo } from './Ask';
import { tx } from '../i18n/ui';

let asking = false;

/** Finestra di scelta del connettore: sigla del primo pin da mettere (nuovo: :1; esistente: il primo libero), null se annullata */
async function askConnectorPin(exclude?: string): Promise<string | null> {
  const st = useStore.getState;
  const { project, library } = st();
  const page = project.pages.find(p => p.id === st().pageId) ?? project.pages[0];
  // Sigla proposta per un connettore nuovo: come le altre sigle della pagina (es. 701X3), non già usata
  const used = new Set(allConnectors(project).concat(allStrips(project)));
  let proposal = nextTagFor(project, 'X', page, 200);
  for (let k = 1; used.has(proposal); k++) proposal = `${proposal}_${k}`;
  // Pin di ogni connettore e pagine (un solo giro sugli elementi, senza ricalcolare i collegamenti);
  // il pin appena posato (trascinato dalla libreria) non conta nel connettore provvisorio
  const pinsByConn = new Map<string, { nos: Set<string>; pages: Set<string> }>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind !== 'symbol' || e.id === exclude || !e.tag.includes(':') || getSymbol(e.symbolId, project)?.role !== 'pin') continue;
    const c = e.tag.slice(0, e.tag.indexOf(':'));
    const x = pinsByConn.get(c) ?? { nos: new Set<string>(), pages: new Set<string>() };
    x.nos.add(e.tag.slice(e.tag.indexOf(':') + 1)); x.pages.add(pg.name);
    pinsByConn.set(c, x);
  }
  // Prima i connettori con pin sullo schema, poi quelli solo con i dati (senza pin)
  const all = [...new Set([...pinsByConn.keys(), ...Object.keys(project.connectors ?? {})])];
  const conns = [...all.filter(c => pinsByConn.has(c)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    ...all.filter(c => !pinsByConn.has(c)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  const items = conns.map(c => {
    const x = pinsByConn.get(c), n = pinCount(project, c, library);
    const d = connectorData(project, c);
    return { value: c, label: [`-${c}`, d.description ?? '', x ? `${x.nos.size}${n ? `/${n}` : ''} ${tx('pin')} · /${[...x.pages].join(', ')}` : tx('nessun pin sullo schema'), d.ofCable ? tx('del cavo') : ''].filter(Boolean).join(' · '), ...(x ? {} : { tone: 'free' as const }) };
  });
  const r = await askCombo(tx('Pin di connettore'),
    tx('Scrivi la sigla di un connettore nuovo (proposta {0}) oppure scegli nell\'elenco un connettore esistente da continuare.', proposal),
    proposal, items, -1, tx('es. X10'));
  if (!r) return null;
  const conn = (r.index >= 0 ? conns[r.index] : r.text).replace(/^-/, '').trim();
  if (!conn || /[:\s]/.test(conn)) { st().logMsg(tx('Sigla del connettore non valida: {0}', r.text), 'warn'); return null; }
  if (!conns.includes(conn)) return `${conn}:1`;
  const free = freePins(st().project, conn, library);
  return free.length ? `${conn}:${free[0]}` : nextPin(st().project, conn, library);
}

/** Pin trascinato dalla libreria e già posato: si sceglie il connettore e il pin prende la sua sigla (annullando si toglie) */
export async function chooseConnectorForPin(instId: string): Promise<void> {
  const st = useStore.getState;
  const tag = await askConnectorPin(instId);
  if (tag) { st().updateElement(instId, { tag }); return; }
  // Annullato: il pin non resta con la sigla provvisoria di un altro connettore, l'inserimento si toglie
  st().setSelection([instId]);
  st().deleteSelection();
}

/**
 * Strumento di inserimento di un pin senza sigla scelta: chiede il connettore e mette nello strumento
 * la sigla del primo pin (nuovo connettore: :1; esistente: il primo pin libero). Annullando si torna
 * alla selezione.
 */
export async function chooseConnectorForPlacement(): Promise<void> {
  const st = useStore.getState;
  const tool = st().tool;
  if (asking || tool.kind !== 'place' || tool.tag || getSymbol(tool.symbolId, st().project)?.role !== 'pin') return;
  asking = true;
  try {
    const tag = await askConnectorPin();
    const cur = st().tool;
    if (!tag || cur.kind !== 'place') { st().setTool({ kind: 'select' }); return; }
    st().setTool({ ...cur, tag });
    st().logMsg(tx('Connettore -{0}: clic sullo schema per mettere il pin {1}; ogni clic mette il prossimo pin, Esc per finire', tag.slice(0, tag.indexOf(':')), tag));
  } finally {
    asking = false;
  }
}
