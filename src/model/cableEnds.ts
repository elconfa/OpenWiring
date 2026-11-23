// Estremità dei cavi: per ogni cavo i dispositivi in campo collegati (anche oltre i pin dei connettori)
// e i connettori che fanno parte del cavo (cavo preconfezionato), con il tipo e dove portano. Servono
// alla tabella materiali del dispositivo in campo, alla lista cavi e al cablaggio del cavo; i connettori
// del cavo non sono connettori a sé (non vanno nella lista connettori).
import type { Project, Cable } from './types';
import { computeNetlist, withNetlistCache, type Net } from './netlist';
import { cableInfos } from './cables';
import { allPlaced, stripOf } from './devices';
import { connectorTypeOf } from './connectors';
import { connectorShortName } from './connectorTypes';

/** Ruoli che non sono il dispositivo in campo di un cavo (scheda PLC, morsetti, connettori, rimandi…) */
const NOT_FIELD = new Set(['plc', 'terminal', 'pin', 'potential', 'link', 'netnode']);

export interface CableEndConnector {
  conn: string;
  /** Tipo e genere, es. «M12 D 4p F»; vuoto se non indicati */
  type: string;
  /** Dove porta il connettore oltre il cavo, es. «-701B1» o «-700A1:X10.1» */
  towards: string[];
  /** Lato del dispositivo in campo (A) o dell'altra estremità (B) */
  side: 'A' | 'B';
}

export interface CableEnds {
  cable: Cable;
  /**
 * Dispositivi in campo collegati (sigle senza trattino): raggiunti dalla maggioranza dei conduttori, il
 * più raggiunto per primo; il primo è quello della tabella materiali
 */
  fieldTags: string[];
  /** Connettori che fanno parte del cavo */
  conns: CableEndConnector[];
}

const GENDER: Record<string, string> = { M: 'M', F: 'F', MF: 'M/F' };

/** Estremità di tutti i cavi (id del cavo → estremità) */
export function cableEnds(project: Project): Map<string, CableEnds> {
  const out = new Map<string, CableEnds>();
  if (!project.cables?.length) return out;
  const nl = withNetlistCache(project, () => computeNetlist(project));
  const netOfPin = new Map<string, Net>();
  for (const n of nl.nets) for (const p of n.pins) netOfPin.set(`${p.el.inst.id}|${p.pinId}`, n);
  // Pin dei connettori, per connettore
  const pinElsOf = new Map<string, ReturnType<typeof allPlaced>>();
  for (const e of allPlaced(project)) if (e.sym.role === 'pin' && e.inst.tag.includes(':')) (pinElsOf.get(stripOf(e.inst.tag)) ?? pinElsOf.set(stripOf(e.inst.tag), []).get(stripOf(e.inst.tag))!).push(e);
  for (const info of cableInfos(project, nl)) {
    const start = info.conductors.map(k => k.net).filter((n): n is Net => !!n);
    const startSet = new Set(start);
    // Connettore toccato → dispositivi e morsetti oltre il connettore (dal lato opposto al cavo)
    const towardsOf = new Map<string, Set<string>>();
    // Connettori che portano a un dispositivo (non scheda PLC, morsetto o connettore): lato del campo
    const toDevice = new Set<string>();
    // Dispositivi e connettori raggiunti da ogni conduttore, contati per conduttore. Si guarda solo la
    // pagina del conduttore e si passa al massimo attraverso due pin di connettore: un conduttore su un
    // potenziale comune (24V, 0V) tocca su altre pagine dispositivi e connettori che non sono del cavo
    const hits = new Map<string, number>(), order: string[] = [];
    // Pin di ogni connettore toccati dai conduttori del cavo (elemento del pin)
    const touched = new Map<string, Set<string>>();
    const done = new Set<string>();
    for (const k of info.conductors) {
      if (!k.net || done.has(`${k.net.id}|${k.pageId}`)) continue;
      done.add(`${k.net.id}|${k.pageId}`);
      const seen = new Set<Net>(), mine = new Set<string>();
      let level: Net[] = [k.net];
      for (let depth = 0; depth <= 2 && level.length; depth++) {
        const next: Net[] = [];
        for (const n of level) {
          if (seen.has(n)) continue;
          seen.add(n);
          for (const p of n.pins) {
            if (p.el.page.id !== k.pageId) continue;
            const role = p.el.sym.role;
            if (role === 'pin') {
              const conn = stripOf(p.el.inst.tag);
              (touched.get(conn) ?? touched.set(conn, new Set()).get(conn)!).add(p.el.inst.id);
              const towards = towardsOf.get(conn) ?? new Set<string>();
              towardsOf.set(conn, towards);
              for (const q of p.el.sym.pins) {
                const m = netOfPin.get(`${p.el.inst.id}|${q.id}`);
                if (!m || m === n || startSet.has(m)) continue;
                for (const o of m.pins) if (o.el.page.id === k.pageId && o.el.sym.role !== 'pin' && o.el.inst.id !== p.el.inst.id) {
                  towards.add(`-${o.ref}`);
                  if (!NOT_FIELD.has(o.el.sym.role)) toDevice.add(conn);
                }
                if (!seen.has(m)) next.push(m);
              }
              continue;
            }
            if (NOT_FIELD.has(role) || !p.el.inst.tag) continue;
            mine.add(p.el.inst.tag);
          }
        }
        level = next;
      }
      for (const t of mine) { if (!hits.has(t)) order.push(t); hits.set(t, (hits.get(t) ?? 0) + 1); }
    }
    const majority = (n: number) => n * 2 >= done.size && (done.size < 2 || n >= 2);
    // Connettore del cavo: la maggior parte dei suoi pin collegati (sulle pagine del cavo) sta sui conduttori
    // del cavo. Un connettore appena iniziato con un pin sul cavo ne fa parte; un connettore con solo i pin
    // del 24V e dello 0V in comune con il cavo no
    const cablePages = new Set(info.conductors.map(k => k.pageId));
    const conns = new Map([...towardsOf].filter(([c]) => {
      const t = touched.get(c)?.size ?? 0;
      const connected = (pinElsOf.get(c) ?? []).filter(e => cablePages.has(e.page.id) && e.sym.pins.some(q => (netOfPin.get(`${e.inst.id}|${q.id}`)?.wires.length ?? 0) > 0)).length;
      return t > 0 && t * 2 >= Math.max(connected, 1);
    }));
    // Dispositivo in campo: raggiunto dalla maggioranza dei conduttori del cavo (un conduttore che porta
    // un potenziale comune, es. lo 0V, tocca tanti dispositivi che non sono l'estremità del cavo)
    const fieldTags = order.filter(t => majority(hits.get(t)!))
      .sort((x, y) => hits.get(y)! - hits.get(x)!);
    // Il dispositivo in campo indicato come arrivo del cavo (A: -701B1, +BMC-701B1) va per primo
    const to = info.cable.to?.trim();
    const toTag = to ? to.slice(to.lastIndexOf('-') + 1) : undefined;
    if (toTag && fieldTags.includes(toTag)) fieldTags.splice(0, 0, ...fieldTags.splice(fieldTags.indexOf(toTag), 1));
    const field = fieldTags[0];
    const list: CableEndConnector[] = [];
    for (const [conn, towards] of conns) {
      if (!project.connectors?.[conn]?.ofCable) continue;
      const d = project.connectors[conn], t = connectorTypeOf(project, conn);
      const tw = [...towards].sort();
      list.push({
        conn, towards: tw,
        type: [t ? connectorShortName(t) : '', d.gender ? GENDER[d.gender] : ''].filter(Boolean).join(' '),
        // Lato A: verso il dispositivo in campo (o, se non è ancora chiaro, verso un dispositivo vero)
        side: (field ? tw.some(x => x === `-${field}` || x.startsWith(`-${field}:`)) : toDevice.has(conn)) ? 'A' : 'B',
      });
    }
    list.sort((a, b) => a.side.localeCompare(b.side) || a.conn.localeCompare(b.conn));
    out.set(info.cable.id, { cable: info.cable, fieldTags, conns: list });
  }
  return out;
}

/** Testo delle estremità di un cavo per le liste: «A: M12 F → -701B1 · B: M12 M → -700A1:X10.1…» */
export function cableEndsText(e: CableEnds | undefined): string {
  if (!e?.conns.length) return '';
  const towards = (x: CableEndConnector) => {
    // Pin dello stesso dispositivo in breve: -700A1:X10.1, X10.2 → -700A1 (X10.1…)
    const devs = [...new Set(x.towards.map(t => t.split(':')[0]))];
    return devs.join(', ');
  };
  return e.conns.map(x => `${x.side}: ${x.type || `-${x.conn}`} → ${towards(x) || '—'}`).join(' · ');
}

/** Connettori che fanno parte di un cavo: non sono connettori a sé (lista connettori) */
export const isCableConnector = (project: Project, conn: string) => !!project.connectors?.[conn]?.ofCable;
