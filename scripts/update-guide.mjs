// Rigenera docs/AGENTE_IA.md (guida per agenti IA) dal codice: si lancia da solo prima di ogni build
// (npm run build, dist:*), così la guida nel repository è sempre quella del programma. Funziona anche su
// Windows: la variabile UPDATE_GUIDE si passa al test della guida senza la sintassi della shell.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', 'test/agentGuide.test.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE_GUIDE: '1' } });
process.exit(r.status ?? 1);
