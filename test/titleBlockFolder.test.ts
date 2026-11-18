import { describe, expect, it } from 'vitest';
import { loadTitleBlockFiles, titleBlockFileText, titleBlockFromText, titleBlockRelPath } from '../src/io/titleBlockFolder';
import type { TitleBlockTemplate } from '../src/model/types';

const tpl: TitleBlockTemplate = { id: 'tb-1', name: 'Cartiglio Ditta Srl', prims: [{ t: 'rect', x: 0, y: 0, w: 390, h: 35 }] };

describe('cartigli come file .ectb', () => {
  it('scrive e rilegge lo stesso cartiglio', () => {
    expect(titleBlockFromText(titleBlockFileText(tpl))).toEqual(tpl);
  });
  it('un modello incluso esportato diventa una copia personale', () => {
    const t = titleBlockFromText(titleBlockFileText({ ...tpl, builtin: true }));
    expect(t.builtin).toBeUndefined();
  });
  it('rifiuta i file che non sono cartigli', () => {
    expect(() => titleBlockFromText('{"format":"elettrocad-simbolo","prims":[]}')).toThrow();
    expect(() => titleBlockFromText('non json')).toThrow();
  });
  it('nome del file valido ovunque e numerato se già preso', () => {
    expect(titleBlockRelPath(tpl, () => false)).toBe('Cartiglio Ditta Srl.ectb');
    expect(titleBlockRelPath(tpl, r => r === 'Cartiglio Ditta Srl.ectb')).toBe('Cartiglio Ditta Srl (2).ectb');
  });
  it('due file copiati con lo stesso id restano due cartigli', () => {
    const text = titleBlockFileText(tpl);
    const r = loadTitleBlockFiles([{ rel: 'A.ectb', text }, { rel: 'B.ectb', text }, { rel: 'rotto.ectb', text: '{' }]);
    expect(r.list).toHaveLength(2);
    expect(new Set(r.list.map(t => t.id)).size).toBe(2);
    expect(r.errors).toHaveLength(1);
  });
});
