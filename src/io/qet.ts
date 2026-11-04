// Import dei componenti di QElectroTech (file .elmt, oppure elementi incorporati in un
// progetto .qet). La collezione ufficiale è CC-BY 3.0: si può usare liberamente negli
// schemi; i simboli importati restano nella libreria personale dell'utente.
import type { SymbolDef, Prim, PinDef, PinDir, SymbolRole, Pt } from '../model/types';
import { GRID } from '../model/types';

/** 10 px di QElectroTech (passo della sua griglia) = 4 mm (passo della griglia OpenWiring) */
const K = 0.4;
const n = (v: string | null | undefined, d = 0) => {
  const x = parseFloat(v ?? '');
  return isNaN(x) ? d : x;
};
const r2 = (v: number) => Math.round(v * 1000) / 1000;

function styleOf(el: Element) {
  const st = el.getAttribute('style') ?? '';
  return {
    fill: /filling:(black|gray|white|red|green|blue|darkgray|lightgray|hor|ver|bdiag|fdiag)/.test(st) && !/filling:none/.test(st),
    dash: /line-style:(dashed|dotted|dashdotted)/.test(st),
  };
}

const DIRS: Record<string, PinDir> = { n: 'up', s: 'down', e: 'right', w: 'left' };

function pickName(def: Element, prefer = ['it', 'en', 'fr', 'de']): string {
  const names = Array.from(def.getElementsByTagName('name'));
  for (const l of prefer) {
    const hit = names.find(x => x.getAttribute('lang') === l && x.textContent?.trim());
    if (hit) return hit.textContent!.trim();
  }
  return names[0]?.textContent?.trim() || 'Componente';
}

function kind(def: Element, name: string): string | undefined {
  return Array.from(def.getElementsByTagName('kindInformation')).find(k => k.getAttribute('name') === name)?.textContent?.trim();
}

/** Lettera IEC 81346 dedotta dal tipo e dal nome del componente */
function guessLetter(linkType: string, text: string, type = ''): string {
  const t = text.toLowerCase();
  if (linkType === 'terminal' || /morsett|terminal|borne|klemme/.test(t)) return 'X';
  // Protezioni (anche se "master" in QElectroTech): fusibili e relè termici F, interruttori e sezionatori Q
  if (/fusib|fuse|fusible|therm|termic/.test(t) && !/magn/.test(t)) return 'F';
  if (/interrutt|disjonct|breaker|sezionat|sectionn|salvamot|magn[eé]to|switch-disc|disconnect/.test(t)) return 'Q';
  if (type === 'protection') return 'F';
  if (type === 'commutator') return 'S';
  if (linkType === 'master' || linkType === 'slave' || /bobin|coil|relè|rele|relay|relais|contatt|contactor|contacteur/.test(t)) return 'K';
  if (/motor|moteur/.test(t)) return 'M';
  if (/lamp|spia|voyant|signal|led/.test(t)) return 'P';
  if (/pulsant|button|bouton|selett|switch|interrupteur|commutat/.test(t)) return 'S';
  if (/sensor|capteur|sensore|finecorsa|limit|proxim|detect/.test(t)) return 'B';
  if (/trasform|transfo|aliment|power supply/.test(t)) return 'T';
  if (/valv|électrov|elettrov|solenoid/.test(t)) return 'M';
  return 'A';
}

/** Categoria dalla cartella del file: "…/310_relays_contactors_contacts/01_coils/x.elmt" → "QET / coils" */
export function categoryFromPath(path: string): string {
  const dirs = path.split(/[\\/]/).slice(0, -1).filter(Boolean);
  const last = dirs[dirs.length - 1];
  if (!last) return 'QET / importati';
  return `QET / ${last.replace(/^\d+[_-]/, '').replace(/_/g, ' ')}`;
}

/**
 * Morsetti sulla griglia di 4 mm (altrimenti i fili non si agganciano): il disegno viene spostato
 * perché il primo morsetto cada sulla griglia; gli altri fuori griglia (es. a 8,4 mm) vengono
 * portati sul punto più vicino con un breve tratto di raccordo.
 */
export function snapPinsToGrid(prims: Prim[], pins: PinDef[], g = GRID): Pt {
  if (!pins.length) return { x: 0, y: 0 };
  const rd = (v: number) => Math.round(v / g) * g;
  const dx = r2(rd(pins[0].x) - pins[0].x), dy = r2(rd(pins[0].y) - pins[0].y);
  if (dx || dy) {
    for (let i = 0; i < prims.length; i++) prims[i] = shiftPrim(prims[i], dx, dy);
    for (const p of pins) { p.x = r2(p.x + dx); p.y = r2(p.y + dy); }
  }
  for (const p of pins) {
    const x = rd(p.x), y = rd(p.y);
    if (Math.abs(x - p.x) < 0.01 && Math.abs(y - p.y) < 0.01) continue;
    prims.push({ t: 'line', x1: p.x, y1: p.y, x2: x, y2: y });
    p.x = x; p.y = y;
  }
  return { x: dx, y: dy };
}

/** Simboli QElectroTech importati con versioni precedenti: morsetti fuori griglia corretti */
export function repairQetSymbol(sym: SymbolDef): SymbolDef {
  if (!sym.source?.startsWith('QElectroTech') || sym.pins.every(p => p.x % GRID === 0 && p.y % GRID === 0)) return sym;
  const prims = [...sym.prims], pins = sym.pins.map(p => ({ ...p }));
  const shift = snapPinsToGrid(prims, pins);
  const tagPos = sym.tagPos && { x: r2(sym.tagPos.x + shift.x), y: r2(sym.tagPos.y + shift.y) };
  return { ...sym, prims, pins, tagPos };
}

function shiftPrim(p: Prim, dx: number, dy: number): Prim {
  switch (p.t) {
    case 'line': return { ...p, x1: r2(p.x1 + dx), y1: r2(p.y1 + dy), x2: r2(p.x2 + dx), y2: r2(p.y2 + dy) };
    case 'rect': case 'text': return { ...p, x: r2(p.x + dx), y: r2(p.y + dy) };
    case 'circle': case 'arc': case 'ellipse': return { ...p, cx: r2(p.cx + dx), cy: r2(p.cy + dy) };
    case 'poly': return { ...p, pts: p.pts.map(q => ({ x: r2(q.x + dx), y: r2(q.y + dy) })) };
  }
}

/** Converte una definizione di elemento QElectroTech in un simbolo OpenWiring */
export function elementToSymbol(def: Element, path = '', idHint = ''): SymbolDef | undefined {
  const linkType = def.getAttribute('link_type') ?? 'simple';
  const desc = Array.from(def.children).find(c => c.localName === 'description');
  if (!desc) return undefined;
  const name = pickName(def);
  const prims: Prim[] = [];
  const pins: PinDef[] = [];
  let tagPos: Pt | undefined;
  const P = (x: number, y: number): Pt => ({ x: r2(x * K), y: r2(y * K) });

  for (const el of Array.from(desc.children)) {
    const a = (k: string) => el.getAttribute(k);
    const { fill, dash } = styleOf(el);
    switch (el.localName) {
      case 'line': {
        const p1 = P(n(a('x1')), n(a('y1'))), p2 = P(n(a('x2')), n(a('y2')));
        prims.push({ t: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, dash });
        break;
      }
      case 'rect': {
        const p = P(n(a('x')), n(a('y')));
        prims.push({ t: 'rect', x: p.x, y: p.y, w: r2(n(a('width')) * K), h: r2(n(a('height')) * K), fill });
        break;
      }
      case 'circle': {
        const d = n(a('diameter'));
        const c = P(n(a('x')) + d / 2, n(a('y')) + d / 2);
        prims.push({ t: 'circle', cx: c.x, cy: c.y, r: r2((d / 2) * K), fill });
        break;
      }
      case 'ellipse': {
        const w = n(a('width')), h = n(a('height'));
        const c = P(n(a('x')) + w / 2, n(a('y')) + h / 2);
        if (Math.abs(w - h) < 0.01) prims.push({ t: 'circle', cx: c.x, cy: c.y, r: r2((w / 2) * K), fill });
        else prims.push({ t: 'ellipse', cx: c.x, cy: c.y, rx: r2((w / 2) * K), ry: r2((h / 2) * K), fill });
        break;
      }
      case 'arc': {
        // Qt: angoli in gradi, 0 = ore 3, positivi in senso antiorario a schermo.
        // OpenWiring: positivi in senso orario a schermo → si inverte il segno.
        const w = n(a('width')), h = n(a('height'));
        const c = P(n(a('x')) + w / 2, n(a('y')) + h / 2);
        const start = n(a('start')), span = n(a('angle'));
        const [s0, s1] = span >= 0 ? [-(start + span), -start] : [-start, -(start + span)];
        prims.push({ t: 'arc', cx: c.x, cy: c.y, r: r2(((w + h) / 4) * K), a0: s0, a1: s1 });
        break;
      }
      case 'polygon': {
        const pts: Pt[] = [];
        for (let i = 1; el.hasAttribute(`x${i}`); i++) pts.push(P(n(a(`x${i}`)), n(a(`y${i}`))));
        if (pts.length >= 2) prims.push({ t: 'poly', pts, closed: a('closed') !== 'false', fill, dash });
        break;
      }
      case 'text': {
        const p = P(n(a('x')), n(a('y')));
        const s = a('text') ?? el.textContent ?? '';
        if (s.trim()) prims.push({ t: 'text', x: p.x, y: p.y, s, size: r2(Math.max(1.6, n(a('size'), 6) * K * 0.9)), anchor: 'start' });
        break;
      }
      case 'dynamic_text': {
        const info = el.getElementsByTagName('info_name')[0]?.textContent;
        const p = P(n(a('x')), n(a('y')));
        if (a('text_from') === 'ElementInfo' && info === 'label') { tagPos = { x: p.x, y: r2(p.y + 2.5) }; break; }
        // Testi fissi (es. "A1"/"A2" accanto ai morsetti): i nomi dei morsetti li scrive già OpenWiring
        const s = el.getElementsByTagName('text')[0]?.textContent ?? '';
        const pinNames = Array.from(desc.getElementsByTagName('terminal')).map(t => t.getAttribute('name'));
        if (a('text_from') === 'UserText' && s.trim() && !pinNames.includes(s.trim())) {
          prims.push({ t: 'text', x: p.x, y: r2(p.y + 2), s: s.trim(), size: 2, anchor: 'start' });
        }
        break;
      }
      case 'terminal': {
        const p = P(n(a('x')), n(a('y')));
        pins.push({ id: `t${pins.length + 1}`, x: p.x, y: p.y, dir: DIRS[a('orientation') ?? 'n'] ?? 'up', label: a('name') ?? '' });
        break;
      }
    }
  }
  if (!prims.length && !pins.length) return undefined;
  const shift = snapPinsToGrid(prims, pins);
  if (tagPos) tagPos = { x: r2(tagPos.x + shift.x), y: r2(tagPos.y + shift.y) };

  let role: SymbolRole = 'single';
  let contact: SymbolDef['contact'];
  const type = kind(def, 'type');
  if (linkType === 'master') role = 'main';
  else if (linkType === 'slave') {
    role = 'aux';
    const state = kind(def, 'state');
    contact = type === 'power' ? 'power' : state === 'NC' ? 'NC' : state === 'SW' && pins.length === 3 ? 'CO' : 'NO';
  } else if (linkType === 'terminal') role = pins.length >= 2 ? 'terminal' : 'single';
  else if (linkType === 'next_report' || linkType === 'previous_report') role = pins.length === 1 ? 'link' : 'single';
  // Contatti NA/NC senza nomi di morsetto: valori predefiniti per la numerazione automatica
  if (contact === 'NO' && pins.length === 2) { pins[0].label ||= '13'; pins[1].label ||= '14'; }
  if (contact === 'NC' && pins.length === 2) { pins[0].label ||= '11'; pins[1].label ||= '12'; }

  const uuid = def.getElementsByTagName('uuid')[0]?.getAttribute('uuid')?.replace(/[{}]/g, '');
  return {
    id: `qet:${uuid || idHint || path || name}`,
    name,
    category: categoryFromPath(path),
    letter: guessLetter(linkType, `${name} ${path}`, type),
    role, contact, prims, pins,
    tagPos: tagPos ?? { x: -7, y: 4 },
    source: 'QElectroTech (CC-BY 3.0)',
  };
}

/** Legge tutti gli elementi contenuti in un file (.elmt singolo o progetto .qet) */
export function parseQetXml(xml: string, path = ''): SymbolDef[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const defs = Array.from(doc.getElementsByTagName('definition')).filter(d => d.getAttribute('type') === 'element');
  const out: SymbolDef[] = [];
  defs.forEach((d, i) => {
    // Negli elementi incorporati in un progetto la cartella è data dagli elementi <category>/<element name>
    const holder = d.parentElement;
    const p = holder?.localName === 'element' ? [...ancestors(holder).reverse(), holder.getAttribute('name') ?? ''].join('/') : path;
    const sym = elementToSymbol(d, p, `${path}#${i}`);
    if (sym) out.push(sym);
  });
  return out;
}

function ancestors(el: Element): string[] {
  const out: string[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) if (p.localName === 'category' && p.getAttribute('name')) out.push(p.getAttribute('name')!);
  return out;
}
