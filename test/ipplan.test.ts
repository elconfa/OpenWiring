import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { busCableRows, ipPlan, ipProblems, assignIps, parseIp, formatIp, netmask, assignBusCableTags } from '../src/model/network';
import { cableReport, ipPlanReport, bomReport, projectReports } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

describe('cavi di rete', () => {
  const p = exampleProject();
  it('un cavo per collegamento bus, con sigla, tipo, lunghezza e porte', () => {
    const r = busCableRows(p).map(x => `-${x.tag} ${x.protocol} ${x.a?.el.inst.tag}:${x.a?.port} → ${x.b?.el.inst.tag}:${x.b?.port} ${x.length}`);
    expect(r).toEqual([
      '-5W1 Profinet 3A1:X1 P1 → 5A1:P1 0.5',
      '-5W2 Profinet 5A1:P2 → 5A2:P1 10',
      '-5W3 Modbus RTU 3A1:X2 RS485 → 5U1:IN 12',
      '-5W4 Modbus RTU 5U1:OUT → 5R1: 0.3',
    ]);
    expect(busCableRows(p)[0].type).toBe('Profinet tipo A 2×2×AWG22, verde');
  });
  it('lista cavi e distinta in metri', () => {
    const rows = cableReport(p).rows;
    expect(rows.find(r => r[0] === '-5W2')).toEqual(['-5W2', 'Profinet tipo A 2×2×AWG22, verde', 'Profinet', '', '', '10', '-5A1:P2', '-5A2:P1', 'Cavo Profinet', '5.3', '']);
    const q = structuredClone(p);
    for (const e of q.pages[4].elements) if (e.kind === 'wire' && e.busCable) e.busCable.partNr = 'PN-CABLE';
    q.parts.push({ partNr: 'PN-CABLE', descr1: 'Cavo Profinet', functionTemplates: [], attrs: {} });
    expect(bomReport(q).rows.find(r => r[2] === 'PN-CABLE')?.[1]).toBe('22,8');
  });
  it('i bus nuovi o copiati ricevono una sigla libera', () => {
    const q = structuredClone(p);
    const pg = q.pages[4];
    pg.elements.push({ kind: 'wire', id: 'wx', points: [{ x: 336, y: 150 }, { x: 352, y: 150 }], bus: 'Profinet', busCable: { tag: undefined } });
    expect(assignBusCableTags(q)).toBe(1);
    expect(pg.elements.find(e => e.id === 'wx')).toMatchObject({ busCable: { tag: '5W5' } });
  });
});

describe('piano IP', () => {
  it('indirizzi, maschere e calcoli', () => {
    expect(formatIp(parseIp('192.168.0.10')!)).toBe('192.168.0.10');
    expect(parseIp('192.168.0.256')).toBeUndefined();
    expect(netmask(24)).toBe('255.255.255.0');
    expect(netmask(16)).toBe('255.255.0.0');
  });
  it('piano dell\'esempio con gateway e nome dispositivo', () => {
    const p = exampleProject();
    expect(ipPlan(p).map(e => `${e.ip} ${e.tag || e.description} ${e.name}`.trim())).toEqual([
      '192.168.0.1 3A1 plc-master', '192.168.0.2 5A1', '192.168.0.10 5A2 io-slave1', '192.168.0.254 Gateway',
    ]);
    const t = ipPlanReport(p);
    expect(t.rows[0].slice(0, 5)).toEqual(['192.168.0.1', '255.255.255.0', '192.168.0.254', 'Rete macchina (192.168.0.0/24)', '-3A1']);
    expect(projectReports(p).some(x => x.title === 'Piano indirizzi IP')).toBe(true);
    expect(ipProblems(p)).toEqual([]);
    expect(checkProject(p).filter(i => i.level === 'error')).toEqual([]);
  });
  it('controlli: IP doppio, fuori rete, broadcast', () => {
    const p = exampleProject();
    const set = (tag: string, ip: string) => { for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag === tag) e.ip = ip; };
    set('5A2', '192.168.0.2');
    set('5A1', '10.0.0.5');
    set('3A1', '192.168.0.255');
    const m = ipProblems(p).map(x => x.msg);
    expect(m).toContain('-5A1: 10.0.0.5 fuori da tutte le reti del piano IP');
    expect(m).toContain("-3A1: 192.168.0.255 è l'indirizzo di rete o di broadcast di 192.168.0.0/24");
    set('5A1', '192.168.0.2');
    expect(ipProblems(p).map(x => x.msg)).toContain('Indirizzo IP 192.168.0.2 usato da -5A1 e -5A2');
  });
  it('assegnazione automatica dal primo host libero', () => {
    const p = exampleProject();
    for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && (e.tag === '5A1' || e.tag === '5A2')) delete e.ip;
    expect(assignIps(p)).toBe(2);
    const ips = ipPlan(p).filter(e => e.tag).map(e => `${e.tag} ${e.ip}`);
    expect(ips).toEqual(['3A1 192.168.0.1', '5A1 192.168.0.10', '5A2 192.168.0.11']);
    // L'inverter Modbus RTU non riceve un IP
    expect(ipPlan(p).some(e => e.tag === '5U1')).toBe(false);
  });
});
