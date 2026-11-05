// Sito pubblico (GitHub Pages): copia la pagina iniziale da site/ e trasforma il manuale
// (docs/manuale/<lingua>/*.md) in pagine HTML navigabili con indice, ricerca e cambio lingua.
//
//   node scripts/build-site.mjs        → _site/   (anteprima: npx serve _site)
//
// Il manuale resta scritto solo in Markdown: il sito si rigenera a ogni push su main.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const MAN = path.join(ROOT, 'docs', 'manuale');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'https://github.com/elconfa/OpenWiring';

const LANGS = [
  { id: 'en', name: 'English', manual: 'Manual', search: 'Search the manual…', contents: 'On this page', prev: 'Previous', next: 'Next', home: 'Home', edit: 'Edit this page on GitHub', none: 'No results' },
  { id: 'it', name: 'Italiano', manual: 'Manuale', search: 'Cerca nel manuale…', contents: 'In questa pagina', prev: 'Precedente', next: 'Successivo', home: 'Home', edit: 'Modifica questa pagina su GitHub', none: 'Nessun risultato' },
  { id: 'fr', name: 'Français', manual: 'Manuel', search: 'Rechercher…', contents: 'Sur cette page', prev: 'Précédent', next: 'Suivant', home: 'Accueil', edit: 'Modifier cette page sur GitHub', none: 'Aucun résultat' },
  { id: 'de', name: 'Deutsch', manual: 'Handbuch', search: 'Im Handbuch suchen…', contents: 'Auf dieser Seite', prev: 'Zurück', next: 'Weiter', home: 'Start', edit: 'Diese Seite auf GitHub bearbeiten', none: 'Keine Treffer' },
  { id: 'es', name: 'Español', manual: 'Manual', search: 'Buscar en el manual…', contents: 'En esta página', prev: 'Anterior', next: 'Siguiente', home: 'Inicio', edit: 'Editar esta página en GitHub', none: 'Sin resultados' },
  { id: 'ru', name: 'Русский', manual: 'Руководство', search: 'Поиск…', contents: 'На этой странице', prev: 'Назад', next: 'Далее', home: 'Главная', edit: 'Редактировать на GitHub', none: 'Ничего не найдено' },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// Stesse ancore di GitHub, così i link #… scritti nel manuale funzionano anche qui
const slug = t => t.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'site'), OUT);
copyDir(path.join(MAN, 'img'), path.join(OUT, 'manual', 'img'));
fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'assets', 'icon.png'));
for (const f of ['scorciatoie.html', 'OpenWiring-scorciatoie.pdf']) if (fs.existsSync(path.join(ROOT, 'docs', f))) fs.copyFileSync(path.join(ROOT, 'docs', f), path.join(OUT, 'assets', f));
// Versione nella pagina iniziale (il resto lo legge dalle release di GitHub)
const idx = path.join(OUT, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replaceAll('{{version}}', pkg.version));

function page(L, chapters, ch, i, body, toc) {
  const prev = chapters[i - 1], next = chapters[i + 1];
  const nav = chapters.map(c => `<a href="${c.file}"${c === ch ? ' class="on" aria-current="page"' : ''}><span class="n">${c.num || '·'}</span>${esc(c.title)}</a>`).join('');
  const langs = LANGS.filter(l => fs.existsSync(path.join(MAN, l.id, ch.src)))
    .map(l => `<option value="../${l.id}/${ch.file}"${l.id === L.id ? ' selected' : ''}>${l.name}</option>`).join('');
  return `<!doctype html>
<html lang="${L.id}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ch.title)} · OpenWiring ${L.manual}</title>
<meta name="description" content="${esc(ch.desc)}">
<link rel="icon" href="../../assets/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/manual.css">
</head>
<body>
<header class="top">
  <button class="menu-btn" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')"><span></span></button>
  <a class="brand" href="../../index.html"><img src="../../assets/icon.png" alt=""><b>OpenWiring</b><span>${L.manual}</span></a>
  <div class="search"><input id="q" type="search" placeholder="${esc(L.search)}" autocomplete="off" aria-label="${esc(L.search)}"><kbd>/</kbd><div id="results" hidden></div></div>
  <select class="lang" aria-label="Language" onchange="location.href=this.value">${langs}</select>
  <a class="gh" href="${REPO}" aria-label="GitHub"><svg viewBox="0 0 16 16" width="20" height="20"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg></a>
</header>
<nav class="side" aria-label="${L.manual}">${nav}</nav>
<main>
  <article class="doc">${body}
    <footer class="pager">
      ${prev ? `<a class="prev" href="${prev.file}"><small>${L.prev}</small>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="${next.file}"><small>${L.next}</small>${esc(next.title)}</a>` : '<span></span>'}
    </footer>
    <p class="edit"><a href="${REPO}/blob/main/docs/manuale/${L.id}/${ch.src}">${L.edit}</a> · OpenWiring ${pkg.version} · GPL-3.0</p>
  </article>
  ${toc.length > 2 ? `<aside class="toc"><p>${L.contents}</p>${toc.map(t => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}</aside>` : ''}
</main>
<div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
<script>window.SEARCH = { index: 'search.json', none: ${JSON.stringify(L.none)} };</script>
<script src="../../assets/manual.js" defer></script>
</body>
</html>`;
}

for (const L of LANGS) {
  const dir = path.join(MAN, L.id);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
  const chapters = files.map(src => {
    const md = fs.readFileSync(path.join(dir, src), 'utf8');
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? src).replace(/^\d+\.\s*/, '').replace(/[*`]/g, '');
    const desc = (md.split('\n').find(l => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('!') && !l.startsWith('|')) ?? '').replace(/[*`[\]]/g, '').slice(0, 160);
    const num = +src.slice(0, 2);
    return { src, md, title, desc, num, file: num === 0 ? 'index.html' : src.replace(/\.md$/, '.html') };
  });
  const search = [];
  fs.mkdirSync(path.join(OUT, 'manual', L.id), { recursive: true });
  chapters.forEach((ch, i) => {
    let html = marked.parse(ch.md, { gfm: true });
    // Link tra i capitoli e foto
    html = html.replace(/href="(\d\d-[^"#]+)\.md(#[^"]*)?"/g, (m, f, h) => `href="${f === '00-indice' ? 'index' : f}.html${h ?? ''}"`)
      .replace(/href="(?:\.\/)?00-indice\.md"/g, 'href="index.html"')
      .replace(/src="\.\.\/img\//g, 'src="../img/')
      // Altri file del repository (README, docs/…): aperti su GitHub
      .replace(/href="(\.\.\/[^"]+)"/g, (m, rel) => rel.startsWith('../img/') ? m
        : `href="${REPO}/blob/main/${path.posix.normalize(`docs/manuale/${L.id}/${rel}`)}"`)
      .replace(/<img /g, '<img loading="lazy" ');
    // Ancore dei titoli, indice della pagina e testo per la ricerca
    const seen = new Map(), toc = [];
    html = html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (m, lv, inner) => {
      const text = strip(inner);
      let id = slug(text); const k = seen.get(id) ?? 0; seen.set(id, k + 1); if (k) id += '-' + k;
      if (lv === '2') toc.push({ id, text });
      return `<h${lv} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${lv}>`;
    });
    // Tabelle larghe scorrevoli sul telefono
    html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
    // Sezioni per la ricerca: titolo h2/h3 e testo che segue
    const parts = html.split(/(?=<h[23] id=)/);
    for (const p of parts) {
      const id = p.match(/^<h[23] id="([^"]+)"/)?.[1];
      const head = id ? strip(p.match(/^<h[23][^>]*>([\s\S]*?)<\/h[23]>/)[1]).replace(/^#/, '') : ch.title;
      const text = strip(p.replace(/^<h[23][^>]*>[\s\S]*?<\/h[23]>/, '')).replace(/\s+/g, ' ').trim().slice(0, 1200);
      search.push({ u: ch.file + (id ? '#' + id : ''), c: ch.title, h: head, t: text });
    }
    fs.writeFileSync(path.join(OUT, 'manual', L.id, ch.file), page(L, chapters, ch, i, html, toc));
  });
  fs.writeFileSync(path.join(OUT, 'manual', L.id, 'search.json'), JSON.stringify(search));
}
// /manual/ → lingua del browser
fs.writeFileSync(path.join(OUT, 'manual', 'index.html'), `<!doctype html><meta charset="utf-8"><title>OpenWiring Manual</title>
<script>var l=(navigator.language||'en').slice(0,2);location.replace(([${LANGS.map(l => `'${l.id}'`).join(',')}].indexOf(l)>=0?l:'en')+'/index.html');</script>
<a href="en/index.html">OpenWiring Manual</a>`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('sito in', path.relative(ROOT, OUT));
