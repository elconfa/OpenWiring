// Progetto di esempio: avviamento diretto di un motore trifase con autoritenuta.
import type { Project, SymbolInstance, Wire, Pt, Element } from './types';
import { emptyProject } from './project';
import { uid } from './geometry';
import { renumberDevices } from './numbering';
import { syncOverviewPages } from './plc';
import { assignBusCableTags } from './network';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: uid('w'), points: pts.map(([x, y]): Pt => ({ x, y })) });

export function exampleProject(): Project {
  const p = emptyProject();
  p.info = {
    ...p.info, name: 'Avviamento motore pompa', description: 'Esempio OpenWiring', company: 'OpenWiring',
    customer: 'Cliente demo', author: 'MC', drawingNr: 'EC-0001',
  };
  const power: Element[] = [
    S('potential', 28, 24, 'L1'), S('potential', 28, 32, 'L2'), S('potential', 28, 40, 'L3'),
    S('potential', 28, 48, 'N'), S('potential', 28, 56, 'PE'),
    W([28, 24], [400, 24]), W([28, 32], [400, 32]), W([28, 40], [400, 40]), W([28, 48], [400, 48]), W([28, 56], [400, 56]),
    // Partenza motore
    S('mpcb3', 100, 72, 'Q1', { description: 'Salvamotore pompa', techData: 'Ir 4–6,3 A' }),
    W([100, 24], [100, 72]), W([108, 32], [108, 72]), W([116, 40], [116, 72]),
    S('contactor3', 100, 100, 'K1'),
    W([100, 88], [100, 100]), W([108, 88], [108, 100]), W([116, 88], [116, 100]),
    S('terminal', 100, 132, 'X1:1'), S('terminal', 108, 132, 'X1:2'), S('terminal', 116, 132, 'X1:3'), S('terminal', 124, 132, 'X1:4'),
    W([100, 116], [100, 132]), W([108, 116], [108, 132]), W([116, 116], [116, 132]), W([124, 56], [124, 132]),
    S('motor3', 108, 168, 'M1', { description: 'Pompa di rilancio', techData: '2,2 kW 400 V' }),
    W([100, 140], [100, 168]), W([108, 140], [108, 168]), W([116, 140], [116, 168]), { ...W([124, 140], [124, 168]), color: 'GNYE' },
    // Cavo del motore: la linea attraversa i quattro fili tra morsettiera e motore
    { kind: 'cable', id: uid('k'), cableId: 'cable-motore', points: [{ x: 92, y: 145 }, { x: 132, y: 145 }] },
    // Alimentazione circuiti ausiliari
    S('mcb2', 260, 72, 'F1', { description: 'Protezione alimentatore', techData: 'C6 2P' }),
    W([260, 24], [260, 72]), W([268, 48], [268, 72]),
    S('psu', 260, 112, 'T1', { description: 'Alimentatore', techData: '24 V DC 5 A' }),
    W([260, 88], [260, 112]), W([268, 88], [268, 112]), W([276, 56], [276, 112]),
    W([260, 136], [260, 152], [300, 152]), S('link', 300, 152, '+24V', { rot: 270 }),
    W([268, 136], [268, 164], [300, 164]), S('link', 300, 164, '0V', { rot: 270 }),
  ];
  const control: Element[] = [
    S('link_in', 40, 24, '+24V', { rot: 90 }), W([40, 24], [400, 24]), S('link', 400, 24, '+24V', { rot: 270 }),
    S('link_in', 40, 232, '0V', { rot: 90 }), W([40, 232], [400, 232]), S('link', 400, 232, '0V', { rot: 270 }),
    S('estop', 60, 40, 'S0', { description: 'Arresto di emergenza' }), W([60, 24], [60, 40]),
    S('pb_no', 60, 72, 'S1', { description: 'Marcia pompa' }), W([60, 56], [60, 72]),
    S('no', 92, 72, 'K1'), W([60, 64], [92, 64], [92, 72]), W([92, 88], [92, 96], [60, 96]),
    S('coil', 60, 140, 'K1', { description: 'Contattore pompa', techData: 'Bobina 24 V DC', manufacturer: 'DEMO', typeNr: 'CT-09-24DC', orderNr: 'CT0924DC' }), W([60, 88], [60, 140]), W([60, 156], [60, 232]),
    S('no', 140, 72, 'K1'), W([140, 24], [140, 72]),
    S('lamp', 140, 120, 'P1', { description: 'Pompa in marcia' }), W([140, 88], [140, 120]), W([140, 136], [140, 232]),
    S('nc', 180, 72, 'K1'), W([180, 24], [180, 72]),
    S('lamp', 180, 120, 'P2', { description: 'Pompa ferma' }), W([180, 88], [180, 120]), W([180, 136], [180, 232]),
  ];
  // Ingressi e uscite PLC: la CPU -3A1 legge pulsante e finecorsa e comanda l'elettrovalvola
  const plc: Element[] = [
    S('link_in', 40, 24, '+24V', { rot: 90 }), W([40, 24], [400, 24]),
    S('link_in', 40, 232, '0V', { rot: 90 }), W([40, 232], [400, 232]),
    S('pb_no', 60, 40, 'S9', { description: 'Avvio ciclo automatico' }), W([60, 24], [60, 40]),
    S('plc_di', 60, 72, '3A1', { plcChannel: 'DI0', plcSymbol: 'Avvio_Automatico' }), W([60, 56], [60, 72]),
    S('limit_no', 100, 40, 'B1', { description: 'Livello minimo vasca' }), W([100, 24], [100, 40]),
    S('plc_di', 100, 72, '3A1', { plcChannel: 'DI1', plcSymbol: 'Livello_Minimo' }), W([100, 56], [100, 72]),
    S('plc_do', 160, 60, '3A1', { plcChannel: 'DO0', plcSymbol: 'Valvola_Scarico' }),
    S('valve', 160, 100, 'M9', { description: 'Elettrovalvola di scarico', techData: '24 V DC' }), W([160, 76], [160, 100]),
    W([160, 116], [160, 232]),
    // Alimentazione della CPU
    S('plc_power', 360, 100, '3A1'), W([360, 24], [360, 100]), W([360, 116], [360, 232]),
  ];
  p.pages = [
    { id: uid('p'), name: '1', title: 'Potenza e alimentazione 24 V', type: 'multiline', elements: power },
    { id: uid('p'), name: '2', title: 'Circuito di comando', type: 'multiline', elements: control },
    { id: uid('p'), name: '3', title: 'Ingressi e uscite PLC', type: 'multiline', elements: plc },
  ];
  p.cables = [{
    id: 'cable-motore', tag: '1W1', type: 'FG16OR16', cross: '1,5', conductors: ['BN', 'BK', 'GY', 'GNYE'],
    length: 15, from: '-X1', to: '-1M1', description: 'Alimentazione pompa', assign: {},
  }];
  p.plc.cards = [{
    id: uid('c'), tag: '3A1', typeId: 'cpu-14di-10do-2ai', station: 'PLC1', start: { DI: 0, DO: 0, AI: 64 },
    description: 'CPU compatta',
  }];
  // Sigle secondo il modello del progetto (-1Q1, -2K1, …) e panoramica della scheda PLC
  renumberDevices(p);
  syncOverviewPages(p);
  // Quadri e schema di rete: la CPU nel quadro master, I/O remoto e inverter nello slave
  p.panels = [{ id: 'q-master', code: 'Q1', name: 'Quadro master' }, { id: 'q-slave1', code: 'Q2', name: 'Slave 1' }];
  for (const pg of p.pages) pg.panelId = 'q-master';
  const bus = (b: string, ...pts: [number, number][]): Wire => ({ ...W(...pts), bus: b });
  p.pages.push({
    id: uid('p'), name: '5', title: 'Schema di rete', type: 'network', elements: [
      { kind: 'zone', id: uid('z'), panelId: 'q-master', x: 32, y: 32, w: 160, h: 172 },
      { kind: 'zone', id: uid('z'), panelId: 'q-slave1', x: 228, y: 32, w: 172, h: 172 },
      S('net_node2b', 80, 80, '3A1', { ip: '192.168.0.1', netAddress: 'plc-master', pinLabels: { 1: 'X1 P1', 2: 'X2 RS485' }, autoPins: false }),
      S('net_switch', 112, 148, '5A1', { description: 'Switch Profinet', ip: '192.168.0.2' }),
      S('net_node2b', 288, 80, '5A2', { description: 'I/O remoto', netAddress: 'io-slave1', ip: '192.168.0.10' }),
      S('net_node2', 320, 140, '5U1', { description: 'Inverter pompa', netAddress: 'ID 1' }),
      S('net_term', 352, 140, '5R1'),
      bus('Profinet', [76, 88], [76, 172], [96, 172], [96, 156]),
      bus('Profinet', [104, 156], [104, 184], [284, 184], [284, 88]),
      bus('Modbus RTU', [84, 88], [84, 124], [292, 124], [292, 140], [304, 140]),
      bus('Modbus RTU', [336, 140], [352, 140]),
    ],
  });
  // Piano IP della rete macchina e sigle dei cavi di rete (patch Profinet, cavo RS485)
  p.ipNetworks = [{ id: 'n-macchina', name: 'Rete macchina', address: '192.168.0.0', prefix: 24, gateway: '192.168.0.254', protocols: ['Profinet'], firstHost: 10 }];
  const netPage = p.pages[p.pages.length - 1];
  const lengths = [0.5, 10, 12, 0.3];
  netPage.elements.filter((e): e is Wire => e.kind === 'wire').forEach((w, i) => { w.busCable = { length: lengths[i] }; });
  assignBusCableTags(p);
  // Schema unifilare della potenza: rappresenta gli stessi dispositivi del multifilare
  const line = (poles: number, text: string, ...pts: [number, number][]): Wire => ({ ...W(...pts), poles, text });
  p.pages.push({
    id: uid('p'), name: '6', title: 'Schema unifilare di potenza', type: 'singleline', panelId: 'q-master', elements: [
      line(4, '3/N/PE ~400 V 50 Hz', [120, 24], [120, 56], [260, 56]),
      S('ol_mpcb', 120, 72, '1Q1'), line(3, '', [120, 56], [120, 72]),
      S('ol_contactor', 120, 104, '2K1'), line(3, '', [120, 88], [120, 104]),
      S('ol_motor', 120, 148, '1M1'), line(3, 'FG16OR16 4G1,5', [120, 120], [120, 148]),
      S('ol_breaker', 260, 72, '1F1'), line(2, '', [260, 56], [260, 72]),
      S('ol_psu', 260, 104, '1T1'), line(2, '24 V DC', [260, 88], [260, 104]),
    ],
  });
  return p;
}
