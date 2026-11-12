// Il manuale (docs/manuale): immagini e collegamenti esistono, gli esempi in formato testo si importano.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { emptyProject } from '../src/model/store';
import { importPagesText } from '../src/model/textFormat';

const ROOT = join(__dirname, '..', 'docs', 'manuale');
const LANGS = readdirSync(ROOT).filter(l => /^[a-z]{2}$/.test(l)).sort();
const IT = readdirSync(join(ROOT, 'it')).filter(f => f.endsWith('.md')).sort();
const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

for (const lang of LANGS) {
const DIR = join(ROOT, lang);
const chapters = readdirSync(DIR).filter(f => f.endsWith('.md')).sort();
const anchors = (f: string) => new Set(readFileSync(join(DIR, f), 'utf8').split('\n').filter(l => /^#{1,4} /.test(l)).map(l => slug(l.replace(/^#+ /, ''))));

describe(`manuale ${lang}`, () => {
  it('i capitoli hanno gli stessi nomi di file dell\'italiano', () => {
    expect(chapters).toEqual(IT);
  });
  it('le immagini esistono', () => {
    const missing: string[] = [];
    for (const f of chapters) for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!existsSync(join(DIR, m[1]))) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it('i collegamenti tra capitoli e alle sezioni esistono', () => {
    const broken: string[] = [];
    for (const f of chapters) for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(/\]\(((?!https?:)[^)#]*\.md)?(#[^)]+)?\)/g)) {
      const file = m[1] ?? f, anchor = m[2]?.slice(1);
      if (!existsSync(join(DIR, file))) broken.push(`${f}: ${file}`);
      else if (anchor && !anchors(file).has(anchor)) broken.push(`${f}: ${file}#${anchor}`);
    }
    expect(broken).toEqual([]);
  });
  it('gli esempi di pagine in formato testo si importano', () => {
    for (const f of chapters) for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(/```text\n([\s\S]*?)```/g)) {
      if (!/^pagina /m.test(m[1])) continue;
      const r = importPagesText(emptyProject(), m[1]);
      expect(r.errors, f).toEqual([]);
    }
  });
});
}
