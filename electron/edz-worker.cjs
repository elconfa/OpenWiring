// Processo a parte (utilityProcess) per estrarre gli EDZ grandi: 7-Zip legge l'archivio dal disco
// ed estrae su disco solo i file che servono all'import (XML degli articoli, foto, macro di schema,
// pagine HTML). Così né l'archivio né i file estratti passano tutti per la memoria, e il programma
// resta reattivo durante l'estrazione.
const path = require('node:path');

// Foto e macro di schema solo se richieste nell'import (senza, l'estrazione è molto più rapida)
const PICTURES = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
const MACROS = ['ema', 'ems', 'emp'];
const wanted = o => ['xml', 'html', 'htm', ...(o.symbols ? MACROS : []), ...(o.pictures ? PICTURES : [])];

async function sevenZip(archive, args, outDir) {
  const SevenZip = require('7z-wasm');
  let out = '';
  const sz = await SevenZip({ print: l => { out += `${l}\n`; }, printErr: () => {} });
  sz.FS.mkdir('/src');
  sz.FS.mount(sz.NODEFS, { root: path.dirname(archive) }, '/src');
  if (outDir) { sz.FS.mkdir('/out'); sz.FS.mount(sz.NODEFS, { root: outDir }, '/out'); }
  // 7-Zip a volte mette i permessi a 000 estraendo: le cartelle non si potrebbero più aprire
  const chmod = sz.FS.chmod;
  sz.FS.chmod = (p, mode, dontFollow) => { if (mode) chmod(p, mode, dontFollow); };
  const a = `/src/${path.basename(archive)}`;
  try {
    sz.callMain(args.map(x => (x === '$A' ? a : x)));
  } catch (e) {
    if (!(e && typeof e === 'object' && e.status === 0)) throw new Error(`7-Zip: ${e?.message ?? e}`);
  }
  return out;
}

/** Elenco completo dell'archivio (solo le intestazioni: veloce anche per archivi enormi) */
async function list(archive) {
  const out = await sevenZip(archive, ['l', '-slt', '-ba', '$A']);
  const files = [];
  let cur = {};
  const flush = () => { if (cur.path && !/D/.test(cur.attr ?? '')) files.push({ path: cur.path, size: cur.size ?? 0 }); cur = {}; };
  for (const line of out.split('\n')) {
    const m = /^(Path|Size|Attributes) = (.*)$/.exec(line);
    if (!m) { if (!line.trim()) flush(); continue; }
    if (m[1] === 'Path') { flush(); cur.path = m[2]; } else if (m[1] === 'Size') cur.size = Number(m[2]) || 0; else cur.attr = m[2];
  }
  flush();
  return files;
}

async function extract(archive, outDir, o) {
  await sevenZip(archive, ['x', '$A', '-o/out', '-y', '-bso0', '-bsp0', '-ssc-', ...wanted(o).map(e => `-ir!*.${e}`), '-xr!*_3d.ema'], outDir);
}

process.parentPort.on('message', async ({ data }) => {
  try {
    const files = await list(data.archive);
    await extract(data.archive, data.outDir, data);
    process.parentPort.postMessage({ ok: true, files });
  } catch (e) {
    process.parentPort.postMessage({ ok: false, error: e?.message ?? String(e) });
  }
});
