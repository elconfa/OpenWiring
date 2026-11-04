// Assistenti IA: Claude (Anthropic), ChatGPT (OpenAI) e Gemini (Google), ognuno con uno o più
// profili. Un profilo usa la chiave API oppure, nell'app desktop, la CLI ufficiale con l'account
// già collegato sul computer (Claude Code, Codex, Gemini CLI): niente chiave, vale l'abbonamento.
import { kvGet, kvSet } from './storage';
import { uid } from '../model/geometry';

export type AiProvider = 'claude' | 'openai' | 'gemini';
export type AiMode = 'cli' | 'api';

export interface AiProfile {
  id: string;
  name: string;
  provider: AiProvider;
  mode: AiMode;
  /** Vuoto = modello predefinito dell'account o del fornitore */
  model?: string;
  /** Solo CLI: cartella dell'account, per usare più account dello stesso fornitore */
  configDir?: string;
  /** Solo API: chiave, cifrata dal sistema nell'app desktop (keyEnc) */
  key?: string;
  keyEnc?: boolean;
}

export const PROVIDERS: Record<AiProvider, {
  name: string; company: string; cli: string; login: string; envDir: string; keyUrl: string; models: string[]; defaultModel: string;
}> = {
  claude: {
    name: 'Claude', company: 'Anthropic', cli: 'Claude Code (claude)', login: 'claude, poi /login', envDir: 'CLAUDE_CONFIG_DIR',
    keyUrl: 'https://console.anthropic.com/settings/keys', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], defaultModel: 'claude-sonnet-5-5',
  },
  openai: {
    name: 'ChatGPT', company: 'OpenAI', cli: 'Codex CLI (codex)', login: 'codex login', envDir: 'CODEX_HOME',
    keyUrl: 'https://platform.openai.com/api-keys', models: ['gpt-5', 'gpt-5-mini'], defaultModel: 'gpt-5',
  },
  gemini: {
    name: 'Gemini', company: 'Google', cli: 'Gemini CLI (gemini)', login: 'gemini (scegli «Login with Google»)', envDir: 'HOME',
    keyUrl: 'https://aistudio.google.com/apikey', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], defaultModel: 'gemini-2.5-pro',
  },
};

const KEY = 'aiProfiles';
const bridge = () => window.elettro;
export const cliAvailable = () => !!bridge()?.aiCli;

/** Profili salvati; al primo uso uno per fornitore (CLI nell'app desktop, chiave API nel browser) */
export async function loadProfiles(): Promise<AiProfile[]> {
  const saved = await kvGet<AiProfile[]>(KEY);
  if (saved?.length) return saved;
  const mode: AiMode = cliAvailable() ? 'cli' : 'api';
  return (Object.keys(PROVIDERS) as AiProvider[]).map(p => ({
    id: uid('ai'), name: `${PROVIDERS[p].name}${mode === 'cli' ? ' (account)' : ''}`, provider: p, mode,
  }));
}

export async function saveProfiles(list: AiProfile[]) {
  await kvSet(KEY, list);
}

/** Salva la chiave nel profilo: cifrata dal sistema operativo quando possibile */
export async function withKey(p: AiProfile, key: string): Promise<AiProfile> {
  if (!key) return { ...p, key: undefined, keyEnc: undefined };
  const enc = await bridge()?.encrypt?.(key);
  return enc ? { ...p, key: enc, keyEnc: true } : { ...p, key, keyEnc: false };
}

async function keyOf(p: AiProfile): Promise<string> {
  if (!p.key) throw new Error(`Manca la chiave API nel profilo «${p.name}» (Impostazioni IA)`);
  if (!p.keyEnc) return p.key;
  const k = await bridge()?.decrypt?.(p.key);
  if (!k) throw new Error(`Non riesco a leggere la chiave del profilo «${p.name}»: inseriscila di nuovo`);
  return k;
}

async function http(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<unknown> {
  const b = bridge();
  let status: number, text: string;
  if (b?.aiHttp) ({ status, text } = await b.aiHttp({ url, ...init }));
  else {
    const res = await fetch(url, init);
    status = res.status; text = await res.text();
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = undefined; }
  if (status >= 400) {
    const d = data as { error?: { message?: string } | string } | undefined;
    const msg = typeof d?.error === 'string' ? d.error : d?.error?.message ?? text.slice(0, 300);
    throw new Error(`${status === 401 || status === 403 ? 'Chiave API non valida o senza permessi' : `Errore ${status}`}: ${msg}`);
  }
  return data;
}

export interface ChatMsg { role: 'user' | 'assistant'; text: string }
export interface AiAnswer { text: string; cost?: number; ms: number }

/** Conversazione in un solo testo, per le CLI che ricevono una richiesta alla volta */
function transcript(messages: ChatMsg[]): string {
  if (messages.length === 1) return messages[0].text;
  const past = messages.slice(0, -1).map(m => `### ${m.role === 'user' ? 'Utente' : 'Assistente'}\n${m.text}`).join('\n\n');
  return `Conversazione finora:\n\n${past}\n\n### Nuova richiesta dell'utente\n${messages[messages.length - 1].text}`;
}

/** Richiesta all'assistente del profilo. id serve per annullarla (solo CLI) */
export async function aiAsk(p: AiProfile, system: string, messages: ChatMsg[], id = uid('req')): Promise<AiAnswer> {
  const t0 = Date.now();
  if (p.mode === 'cli') {
    const b = bridge();
    if (!b?.aiCli) throw new Error('Gli account tramite CLI funzionano solo nell\'app desktop: nel browser usa una chiave API');
    const r = await b.aiCli({ id, provider: p.provider, model: p.model?.trim() || undefined, configDir: p.configDir, system, prompt: transcript(messages) });
    return { text: r.text, cost: r.cost, ms: Date.now() - t0 };
  }
  const key = await keyOf(p);
  const model = p.model?.trim() || PROVIDERS[p.provider].defaultModel;
  if (p.provider === 'claude') {
    const d = await http('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 16000, system, messages: messages.map(m => ({ role: m.role, content: m.text })) }),
    }) as { content: { type: string; text?: string }[] };
    return { text: d.content.filter(c => c.type === 'text').map(c => c.text).join(''), ms: Date.now() - t0 };
  }
  if (p.provider === 'openai') {
    const d = await http('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.text }))] }),
    }) as { choices: { message: { content: string } }[] };
    return { text: d.choices[0]?.message.content ?? '', ms: Date.now() - t0 };
  }
  const d = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    }),
  }) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return { text: d.candidates?.[0]?.content?.parts?.map(x => x.text ?? '').join('') ?? '', ms: Date.now() - t0 };
}

export function aiCancel(id: string) {
  void bridge()?.aiCancel?.(id);
}

/** Modelli disponibili con la chiave del profilo */
export async function listModels(p: AiProfile): Promise<string[]> {
  const key = await keyOf(p);
  if (p.provider === 'claude') {
    const d = await http('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }) as { data: { id: string }[] };
    return d.data.map(m => m.id);
  }
  if (p.provider === 'openai') {
    const d = await http('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } }) as { data: { id: string }[] };
    return d.data.map(m => m.id).filter(id => /^(gpt|o\d|chatgpt)/.test(id)).sort().reverse();
  }
  const d = await http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } }) as { models: { name: string; supportedGenerationMethods?: string[] }[] };
  return d.models.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
}

/** Controlla che la CLI del profilo sia installata */
export async function checkCli(p: AiProfile): Promise<{ ok: boolean; version?: string; error?: string }> {
  const b = bridge();
  if (!b?.aiCliCheck) return { ok: false, error: 'Disponibile solo nell\'app desktop' };
  return b.aiCliCheck({ provider: p.provider, configDir: p.configDir });
}

/** Comando da dare nel Terminale per collegare l'account del profilo */
export function loginCommand(p: AiProfile): string {
  const spec = PROVIDERS[p.provider];
  const dir = p.configDir?.trim();
  return `${dir ? `${spec.envDir}=${dir} ` : ''}${spec.login}`;
}
