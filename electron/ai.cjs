// Assistenti IA nel processo principale: richieste alle API di Anthropic, OpenAI e Google (senza
// i limiti CORS del browser) e uso delle CLI ufficiali (Claude Code, Codex, Gemini CLI), che
// lavorano con l'account già collegato sul computer, senza chiave API.
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

/** Solo questi indirizzi: l'interfaccia non può usare il ponte per altre richieste */
const API_HOSTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'];

const CLI = {
  claude: { cmd: 'claude', env: 'CLAUDE_CONFIG_DIR' },
  openai: { cmd: 'codex', env: 'CODEX_HOME' },
  // Gemini CLI tiene l'accesso in ~/.gemini: per un secondo account si cambia la cartella home
  gemini: { cmd: 'gemini', env: 'HOME' },
};

const running = new Map();
let pathCache;

/** PATH della shell di login: le app aperte dal Finder non vedono ~/.local/bin, Homebrew, npm… */
function loginPath() {
  if (pathCache) return Promise.resolve(pathCache);
  const home = os.homedir();
  const extra = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'npm')]
    : [path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'), path.join(home, '.bun/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const sep = process.platform === 'win32' ? ';' : ':';
  if (process.platform === 'win32') return Promise.resolve(pathCache = [process.env.PATH, ...extra].join(sep));
  return new Promise(resolve => {
    execFile(process.env.SHELL || '/bin/zsh', ['-ilc', 'echo "__ECAD__${PATH}__ECAD__"'], { timeout: 8000 }, (_err, out) => {
      const m = /__ECAD__(.*)__ECAD__/.exec(out || '');
      resolve(pathCache = [m ? m[1] : process.env.PATH, ...extra].join(sep));
    });
  });
}

function expandHome(p) {
  return p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

async function cliEnv(provider, configDir) {
  const env = { ...process.env, PATH: await loginPath() };
  const dir = expandHome((configDir || '').trim());
  if (dir) env[CLI[provider].env] = dir;
  return env;
}

function run(cmd, args, { env, cwd, input, id, timeout = 15 * 60 * 1000 }) {
  return new Promise((resolve, reject) => {
    // Su Windows le CLI installate con npm sono script .cmd: servono la shell e gli argomenti tra virgolette
    const win = process.platform === 'win32';
    const quote = a => (/^[\w.\-\/:=@]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    const child = spawn(cmd, win ? args.map(quote) : args, { env, cwd, shell: win, windowsHide: true });
    let out = '', err = '';
    if (id) running.set(id, child);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Tempo scaduto: la CLI non ha risposto')); }, timeout);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => {
      clearTimeout(timer); running.delete(id);
      reject(new Error(e.code === 'ENOENT' ? `Comando «${cmd}» non trovato: installalo o controlla il PATH` : e.message));
    });
    child.on('close', code => {
      clearTimeout(timer); running.delete(id);
      if (child.killed && code !== 0) reject(new Error('Richiesta annullata'));
      else resolve({ code, out, err });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

const LOGIN = { claude: 'claude, poi /login', openai: 'codex login', gemini: 'gemini (e scegli «Login with Google»)' };

/** Errori di accesso scaduto o mancante tradotti in un'istruzione chiara */
function loginHint(provider, configDir, msg) {
  if (!/refresh token|sign in again|log ?in|logged out|401|unauthori[sz]ed|not authenticated|authenticat/i.test(msg)) return msg;
  const dir = (configDir || '').trim();
  const prefix = dir ? `${CLI[provider].env}=${dir} ` : '';
  return `Accesso all'account scaduto o mancante. Apri il Terminale ed esegui: ${prefix}${LOGIN[provider]}\n\nDettagli: ${msg.split('\n').find(l => /token|401|auth|login/i.test(l)) || msg.split('\n')[0]}`;
}

/** Risposta di un assistente tramite la sua CLI, con l'account collegato sul computer */
async function askCli(req) {
  try {
    return await askCliRaw(req);
  } catch (e) {
    throw new Error(loginHint(req.provider, req.configDir, e.message));
  }
}

async function askCliRaw({ id, provider, model, configDir, system, prompt }) {
  const spec = CLI[provider];
  if (!spec) throw new Error(`Fornitore sconosciuto: ${provider}`);
  const env = await cliEnv(provider, configDir);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'elettrocad-ia-'));
  try {
    if (provider === 'claude') {
      const sysFile = path.join(work, 'system.md');
      await fs.writeFile(sysFile, system);
      const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--system-prompt-file', sysFile];
      if (model) args.push('--model', model);
      const r = await run(spec.cmd, args, { env, cwd: work, input: prompt, id });
      const line = r.out.trim().split('\n').reverse().find(l => l.trim().startsWith('{'));
      let data;
      try { data = line ? JSON.parse(line) : undefined; } catch { data = undefined; }
      if (!data) throw new Error((r.err || r.out || `codice di uscita ${r.code}`).trim().slice(0, 600));
      if (data.is_error) throw new Error(String(data.result || data.error || 'errore della CLI').slice(0, 600));
      return { text: data.result || '', usage: data.usage, cost: data.total_cost_usd };
    }
    if (provider === 'openai') {
      const outFile = path.join(work, 'risposta.md');
      const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--color', 'never', '-C', work, '-o', outFile];
      if (model) args.push('-m', model);
      args.push('-');
      const r = await run(spec.cmd, args, { env, cwd: work, input: `${system}\n\n---\n\n${prompt}`, id });
      const text = await fs.readFile(outFile, 'utf8').catch(() => '');
      if (!text.trim()) throw new Error((r.err || r.out || `codice di uscita ${r.code}`).trim().split('\n').slice(-8).join('\n').slice(0, 800));
      return { text };
    }
    // Gemini CLI: istruzioni e richiesta dall'input standard
    const args = ['-p', 'Segui le istruzioni e rispondi alla richiesta che ricevi sull\'input standard.'];
    if (model) args.push('-m', model);
    const r = await run(spec.cmd, args, { env, cwd: work, input: `${system}\n\n---\n\n${prompt}`, id });
    if (r.code !== 0 || !r.out.trim()) throw new Error((r.err || r.out || `codice di uscita ${r.code}`).trim().split('\n').slice(-8).join('\n').slice(0, 800));
    return { text: r.out.trim() };
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

function register(ipcMain, net, safeStorage) {
  ipcMain.handle('ai-http', async (_ev, { url, method = 'GET', headers = {}, body }) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !API_HOSTS.includes(u.hostname)) throw new Error(`Indirizzo non consentito: ${u.hostname}`);
    const res = await net.fetch(url, { method, headers, body });
    return { status: res.status, text: await res.text() };
  });
  ipcMain.handle('ai-cli', (_ev, req) => askCli(req));
  ipcMain.handle('ai-cli-check', async (_ev, { provider, configDir }) => {
    const spec = CLI[provider];
    try {
      const r = await run(spec.cmd, ['--version'], { env: await cliEnv(provider, configDir), timeout: 20000 });
      return { ok: r.code === 0, version: (r.out || r.err).trim().split('\n')[0] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('ai-cancel', (_ev, id) => { running.get(id)?.kill(); });
  ipcMain.handle('secret-encrypt', (_ev, text) =>
    (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text).toString('base64') : null));
  ipcMain.handle('secret-decrypt', (_ev, data) => {
    try { return safeStorage.decryptString(Buffer.from(data, 'base64')); } catch { return null; }
  });
}

module.exports = { register, askCli };
