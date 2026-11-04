import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { selectPages } from '../src/io/pdfOptions';

describe('PDF', () => {
  const p = exampleProject();
  it('selezione delle pagine', () => {
    expect(selectPages(p, 'all').length).toBe(6);
    expect(selectPages(p, 'current', p.pages[1].id).map(x => x.name)).toEqual(['2']);
    expect(selectPages(p, '1-2, 4').map(x => x.name)).toEqual(['1', '2', '4']);
    expect(selectPages(p, '3').map(x => x.name)).toEqual(['3']);
  });
});
