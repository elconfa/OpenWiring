// Ricerca di un articolo in un progetto: dispositivi (e articoli aggiuntivi) che lo usano, con la
// pagina. Il testo cercato vale per codice articolo, tipo e codice d'ordinazione, senza maiuscole.
import type { Project } from './types';
import { columnOf } from './types';

export interface PartHit { partNr: string; tag: string; pageId: string; pageName: string; elementId: string; loc: string }

export function findPartInProject(project: Project, query: string): PartHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // Codici degli articoli del progetto che corrispondono anche per tipo o codice d'ordinazione
  const codes = new Set((project.parts ?? []).filter(p => [p.partNr, p.typeNr, p.orderNr].some(v => v?.toLowerCase().includes(q))).map(p => p.partNr));
  const match = (nr?: string) => !!nr && (nr.toLowerCase().includes(q) || codes.has(nr));
  const out: PartHit[] = [];
  const seen = new Set<string>();
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.kind !== 'symbol') continue;
      const nrs = [e.partNr, ...(e.extraParts ?? []).map(x => x.partNr)].filter(match) as string[];
      for (const nr of nrs) {
        // Un dispositivo una volta sola per articolo (la bobina e i suoi contatti sono lo stesso)
        const key = `${nr}|${e.tag}`;
        if (e.tag && seen.has(key)) continue;
        seen.add(key);
        out.push({ partNr: nr, tag: e.tag, pageId: pg.id, pageName: pg.name, elementId: e.id, loc: `${pg.name}.${columnOf(e.x)}` });
      }
    }
  }
  return out;
}
