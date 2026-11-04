// Struttura dell'impianto secondo IEC 81346: dispositivi raggruppati per funzione (=) e poi per
// luogo di installazione (+), come il navigatore della struttura di EPLAN.
import type { Part, Project } from './types';
import { buildDevices, deviceInfo, partsIndex, type Device } from './devices';
import { devicePanels } from './network';

export interface StructureLoc { loc: string; name?: string; devices: Device[] }
export interface StructureFunc { func: string; locs: StructureLoc[]; count: number }

/** Dispositivi senza funzione o senza luogo finiscono nel gruppo con codice vuoto */
export function structureTree(project: Project, library: Part[] = []): StructureFunc[] {
  const parts = partsIndex(project, library);
  const panels = devicePanels(project);
  const byFunc = new Map<string, Map<string, Device[]>>();
  const devices = [...buildDevices(project).values()]
    .filter(d => d.elements.some(e => e.sym.role !== 'terminal' && e.sym.role !== 'pin'))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  for (const d of devices) {
    const info = deviceInfo(d.elements, d.main, parts);
    const func = info.func ?? '';
    const loc = info.loc ?? panels.get(d.tag)?.code ?? '';
    let locs = byFunc.get(func);
    if (!locs) byFunc.set(func, locs = new Map());
    const list = locs.get(loc);
    if (list) list.push(d); else locs.set(loc, [d]);
  }
  // I gruppi senza codice vanno in fondo
  const order = (a: string, b: string) => (!a ? 1 : !b ? -1 : a.localeCompare(b, undefined, { numeric: true }));
  return [...byFunc.entries()].sort(([a], [b]) => order(a, b)).map(([func, locs]) => ({
    func,
    count: [...locs.values()].reduce((n, l) => n + l.length, 0),
    locs: [...locs.entries()].sort(([a], [b]) => order(a, b)).map(([loc, list]) => ({
      loc, name: project.panels?.find(p => p.code === loc)?.name, devices: list,
    })),
  }));
}
