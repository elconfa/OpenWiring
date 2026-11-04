// Lingue dell'interfaccia: ogni testo del catalogo è tradotto in tutte le lingue, con gli stessi segnaposto.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
execFileSync('node', [join(ROOT, 'scripts/i18n-extract.mjs')], { cwd: ROOT });
const catalog: string[] = JSON.parse(readFileSync(join(ROOT, 'src/i18n/catalog.json'), 'utf8'));
const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();

describe('lingue dell\'interfaccia', () => {
  for (const lang of ['en', 'fr', 'de', 'es', 'ru']) {
    it(`${lang}: tutti i testi tradotti con gli stessi segnaposto`, () => {
      const dict: Record<string, string> = JSON.parse(readFileSync(join(ROOT, `src/i18n/ui.${lang}.json`), 'utf8'));
      expect(catalog.filter(k => !dict[k])).toEqual([]);
      expect(catalog.filter(k => dict[k] && ph(dict[k]) !== ph(k))).toEqual([]);
    });
  }
  it('tx traduce e sostituisce i segnaposto', async () => {
    const ui = await import('../src/i18n/ui');
    ui.setUiLang('en');
    expect(ui.tx('Salva')).toBe('Save');
    expect(ui.tx('{0} risultati', 3)).toBe('3 results');
    expect(ui.tx('Testo inesistente {0}', 'x')).toBe('Testo inesistente x');
    ui.setUiLang('it');
    expect(ui.tx('Salva')).toBe('Salva');
  });
});
