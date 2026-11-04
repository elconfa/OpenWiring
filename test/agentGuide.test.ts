import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { agentGuide } from '../src/model/agentGuide';
import { importPagesText } from '../src/model/textFormat';
import { emptyProject } from '../src/model/project';

const FILE = `${process.cwd()}/docs/AGENTE_IA.md`;

describe('guida per agenti IA', () => {
  const g = agentGuide();
  it('contiene sintassi, convenzioni, verifica, conversione da PDF e catalogo', () => {
    for (const s of ['## 2. Regole da rispettare sempre', '-2K1', 'X1.1.2', 'simbolodef', '## 9. Convertire schemi esistenti da PDF', 'coil · Bobina relè/contattore', 'cpu-14di-10do-2ai', 'npm run -s cli -- controlla']) expect(g).toContain(s);
  });
  it('l\'esempio della guida si importa senza errori', () => {
    const block = /## 7\. Esempio[\s\S]*?```text\n([\s\S]*?)```/.exec(g)![1];
    expect(importPagesText(emptyProject(), block).errors).toEqual([]);
  });
  it('il formato testo rifiuta rotazioni non ammesse e lo specchio dei simboli non specchiabili', () => {
    const p = emptyProject();
    p.customSymbols.push({ id: 'u1', name: 'Prova', category: 'x', letter: 'K', role: 'single', prims: [], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1' }], rotations: [0, 90], noMirror: true });
    const r = importPagesText(p, 'pagina 1 "Prova"\nsimbolo u1 -1K1 @40,40 rot=180\nsimbolo u1 -1K2 @80,40 rot=90 specchio\nsimbolo u1 -1K3 @120,40 rot=90');
    expect(r.errors.map(e => e.msg)).toEqual(['simbolo "u1": rot=180 non ammessa (ammesse: 0, 90)', 'simbolo "u1": non si può specchiare']);
  });
  it('docs/AGENTE_IA.md è aggiornato (UPDATE_GUIDE=1 per rigenerarlo)', () => {
    if (process.env.UPDATE_GUIDE) writeFileSync(FILE, g);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(g); // Windows: checkout con CRLF
  });
});
