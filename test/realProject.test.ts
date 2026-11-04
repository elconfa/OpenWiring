// Fotografia di un progetto reale per confrontare il prima e il dopo di una modifica: numeri filo,
// rimandi, indirizzi PLC, liste e controlli. Il progetto e le fotografie stanno fuori dal repository
// (dati del cliente), quindi il test gira solo se si indica il progetto:
//   ECAD_PROGETTO=../progetti/impianto.ecad npm run foto        confronta con l'ultima fotografia
//   ECAD_PROGETTO=../progetti/impianto.ecad npm run foto -- -u  la rifà (dopo aver controllato le differenze)
// Le fotografie vanno nella cartella ECAD_FOTO (di serie _Foto/<nome progetto> accanto al repository).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseProject } from '../src/io/fileio';
import { computeNetlist, type NetPin } from '../src/model/netlist';
import { linkPartners } from '../src/model/links';
import { allPlaced, locationOf } from '../src/model/devices';
import { ioAssignments } from '../src/model/plc';
import { projectReports } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

const file = process.env.ECAD_PROGETTO;
const name = file ? basename(file).replace(/\.ecad$/i, '') : '';
const dir = resolve(process.env.ECAD_FOTO ?? resolve(__dirname, '../../_Foto', name));
const at = (f: string) => resolve(dir, f);
/** Righe ordinate, per confronti che non dipendono dall'ordine interno */
const lines = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('\n') + '\n';

describe.skipIf(!file)(`fotografia di ${name || 'un progetto reale'}`, () => {
  const project = file ? parseProject(readFileSync(resolve(file), 'utf8')) : undefined!;
  const placed = file ? allPlaced(project) : [];
  const where = (id: string) => {
    const e = placed.find(x => x.inst.id === id);
    return e ? `${e.inst.tag || e.sym.name}@/${locationOf(e)}` : id;
  };

  it('numeri filo e conduttori', async () => {
    const pin = (p: NetPin) => `${p.ref}@/${locationOf(p.el)}`;
    const rows = computeNetlist(project).nets.filter(n => n.wires.length || n.pins.length > 1)
      .map(n => `${n.wireNo || '(senza numero)'}\t${[...new Set(n.pins.map(pin))].sort().join(' ')}`);
    await expect(lines(rows)).toMatchFileSnapshot(at('fili.txt'));
  });

  it('rimandi abbinati', async () => {
    const rows = [...linkPartners(project)].map(([id, ps]) => `${where(id)}\t→ ${ps.map(o => where(o.inst.id)).sort().join(', ') || '(nessuno)'}`);
    await expect(lines(rows)).toMatchFileSnapshot(at('rimandi.txt'));
  });

  it('indirizzi PLC', async () => {
    const rows = ioAssignments(project, [], true).map(r => `${r.card.station}\t-${r.card.tag}\t${r.channel}\t${r.address}\t${r.symbol}\t${r.connected}`);
    await expect(lines(rows)).toMatchFileSnapshot(at('plc.txt'));
  });

  it('liste', async () => {
    const text = projectReports(project).map(t => `## ${t.title}\n${t.columns.join('\t')}\n${t.rows.map(r => r.join('\t')).join('\n')}\n`).join('\n');
    await expect(text).toMatchFileSnapshot(at('liste.txt'));
  });

  it('controlli', async () => {
    const rows = checkProject(project).map(i => `${i.level}\t${i.kind}\t${i.loc ?? ''}\t${i.msg}`);
    await expect(lines(rows)).toMatchFileSnapshot(at('controlli.txt'));
  });
});
