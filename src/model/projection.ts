// Pagine proiettate: un circuito disegnato nella pagina di un quadro (es. ingressi PLC del +Q1.1) con
// i componenti di un altro quadro chiusi in un riquadro di luogo (+Q1.2). Il manutentore legge tutto
// sulla stessa pagina; per chi cabla il +Q1.2 il comando crea tra le pagine del +Q1.2 una pagina che
// mostra dal vivo il contenuto del riquadro (Page.projection), con i rimandi tra le due pagine.
import type { Page, Panel, Project, Zone } from './types';
import { proposePageName } from './pages';
import { uid } from './geometry';

/** Il punto x, y sta nel riquadro */
export const insideZone = (z: Pick<Zone, 'x' | 'y' | 'w' | 'h'>, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

/** Pagine di schema in cui si disegnano i riquadri dei componenti di altri quadri */
const SCHEMATIC = new Set(['multiline', 'singleline']);

export interface ForeignZone { page: Page; zone: Zone; panel: Panel }

/** Riquadri di luogo di un quadro diverso da quello della loro pagina */
export function foreignZones(project: Project): ForeignZone[] {
  const panels = new Map((project.panels ?? []).map(p => [p.id, p]));
  const out: ForeignZone[] = [];
  for (const page of project.pages) {
    if (!SCHEMATIC.has(page.type) || page.projection) continue;
    for (const e of page.elements) {
      const panel = e.kind === 'zone' ? panels.get(e.panelId) : undefined;
      if (e.kind === 'zone' && panel && e.panelId !== page.panelId) out.push({ page, zone: e, panel });
    }
  }
  return out;
}

const key = (pageId: string, zoneId: string) => `${pageId}|${zoneId}`;

/** Pagine proiettate esistenti per pagina e riquadro di origine */
export function projectionPages(project: Project): Map<string, Page> {
  const m = new Map<string, Page>();
  for (const pg of project.pages) if (pg.projection) m.set(key(pg.projection.pageId, pg.projection.zoneId), pg);
  return m;
}

/** Pagina proiettata del riquadro (se c'è) */
export const projectionOfZone = (project: Project, pageId: string, zoneId: string) => projectionPages(project).get(key(pageId, zoneId));

/** Origine di una pagina proiettata: pagina e riquadro (assenti se cancellati) */
export function projectionSource(project: Project, page: Page): { page: Page; zone: Zone } | undefined {
  if (!page.projection) return undefined;
  const src = project.pages.find(p => p.id === page.projection!.pageId);
  const zone = src?.elements.find((e): e is Zone => e.kind === 'zone' && e.id === page.projection!.zoneId);
  return src && zone ? { page: src, zone } : undefined;
}

/**
 * Crea le pagine proiettate mancanti (dentro un commit): per i riquadri delle pagine indicate (tutte se
 * assenti) una pagina nel quadro del riquadro, dopo le sue pagine, con lo stesso titolo e tipo
 */
export function createProjections(project: Project, pageIds?: Set<string>): Page[] {
  const have = projectionPages(project);
  const made: Page[] = [];
  for (const f of foreignZones(project)) {
    if (pageIds && !pageIds.has(f.page.id)) continue;
    if (have.has(key(f.page.id, f.zone.id))) continue;
    const last = project.pages.findLast(pg => pg.panelId === f.panel.id && pg.type !== 'cover' && !pg.report);
    const name = proposePageName(project, last?.id);
    const page: Page = { id: uid('p'), name, title: f.page.title, type: f.page.type, elements: [], panelId: f.panel.id, projection: { pageId: f.page.id, zoneId: f.zone.id } };
    const at = last ? project.pages.indexOf(last) + 1 : project.pages.length;
    project.pages.splice(at, 0, page);
    have.set(key(f.page.id, f.zone.id), page);
    made.push(page);
  }
  return made;
}

/** Il riquadro ha una pagina proiettata: i suoi componenti si trovano anche tra le pagine del loro quadro */
export function projectedZoneAt(project: Project, page: Page, x: number, y: number): boolean {
  const have = projectionPages(project);
  return page.elements.some(z => z.kind === 'zone' && have.has(key(page.id, z.id)) && insideZone(z, x, y));
}
