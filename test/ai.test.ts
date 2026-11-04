import { describe, it, expect, vi, afterEach } from 'vitest';
import { exampleProject } from '../src/model/example';
import { assistantSystem, extractPagesText, parseTranslations, translatePrompt, fixRequest } from '../src/model/aiPrompts';
import { aiAsk, type AiProfile } from '../src/io/ai';

describe('istruzioni per l\'assistente', () => {
  const p = exampleProject();
  it('pagina corrente: guida, testo della pagina e controlli', () => {
    const s = assistantSystem({ project: p, scope: 'page', pageId: p.pages[1].id });
    expect(s).toContain('<guida>');
    expect(s).toContain(`pagina ${p.pages[1].name}`);
    expect(s).toContain('<controlli>');
    expect(s).not.toContain(`pagina ${p.pages[2].name} "`);
  });
  it('domande sul programma: manuale invece delle pagine', () => {
    const s = assistantSystem({ project: p, scope: 'manual', pageId: p.pages[0].id });
    expect(s).toContain('<manuale>');
    expect(s).not.toContain('<pagine');
  });
});

describe('risposte dell\'assistente', () => {
  it('estrae solo i blocchi con pagine', () => {
    const a = 'Ecco:\n```bash\nnpm test\n```\n```ecad\npagina 7 "Ventilazione"\n  simbolo coil -7K1 @140,140\n```';
    expect(extractPagesText(a)).toBe('pagina 7 "Ventilazione"\n  simbolo coil -7K1 @140,140');
    expect(extractPagesText('Nessuna modifica')).toBeUndefined();
  });
  it('legge le traduzioni JSON anche con testo intorno', () => {
    const t = parseTranslations('Ecco le traduzioni:\n```json\n{"Pompa": {"en": "Pump", "de": "Pumpe", "fr": "x"}, "Vuoto": {}}\n```');
    expect(t).toEqual({ Pompa: { en: 'Pump', de: 'Pumpe' } });
    expect(translatePrompt([{ text: 'Pompa', langs: ['en'] }])).toContain('"Pompa"');
  });
  it('richiesta di correzione con righe e problemi', () => {
    expect(fixRequest([{ line: 3, msg: 'simbolo sconosciuto' }], [], ['/7.2 Sigle: doppia'])).toMatch(/riga 3: simbolo sconosciuto[\s\S]*\/7\.2 Sigle/);
  });
});

describe('chiamate alle API', () => {
  afterEach(() => vi.unstubAllGlobals());
  const prof = (provider: AiProfile['provider']): AiProfile => ({ id: 'x', name: 'x', provider, mode: 'api', key: 'k', keyEnc: false, model: 'm' });
  const stub = (reply: unknown, check: (url: string, body: Record<string, unknown>, headers: Record<string, string>) => void) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
      check(url, JSON.parse(init.body), init.headers);
      return { status: 200, text: async () => JSON.stringify(reply) };
    }));
  it('Claude', async () => {
    stub({ content: [{ type: 'text', text: 'Ciao' }] }, (url, b, h) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(b.system).toBe('S'); expect(h['x-api-key']).toBe('k');
    });
    expect((await aiAsk(prof('claude'), 'S', [{ role: 'user', text: 'D' }])).text).toBe('Ciao');
  });
  it('ChatGPT', async () => {
    stub({ choices: [{ message: { content: 'Ciao' } }] }, (url, b) => {
      expect(url).toContain('api.openai.com');
      expect((b.messages as { role: string }[])[0].role).toBe('system');
    });
    expect((await aiAsk(prof('openai'), 'S', [{ role: 'user', text: 'D' }])).text).toBe('Ciao');
  });
  it('Gemini', async () => {
    stub({ candidates: [{ content: { parts: [{ text: 'Ci' }, { text: 'ao' }] } }] }, (url, b) => {
      expect(url).toContain('models/m:generateContent');
      expect(b.systemInstruction).toEqual({ parts: [{ text: 'S' }] });
    });
    expect((await aiAsk(prof('gemini'), 'S', [{ role: 'user', text: 'D' }, { role: 'assistant', text: 'R' }, { role: 'user', text: 'D2' }])).text).toBe('Ciao');
  });
  it('senza chiave spiega cosa manca', async () => {
    await expect(aiAsk({ ...prof('claude'), key: undefined }, 'S', [{ role: 'user', text: 'D' }])).rejects.toThrow(/chiave API/);
  });
});
